#!/usr/bin/env node
'use strict';

/**
 * SEC EDGAR 采集器 — human-future v3.4 新数据源
 *
 * ── 这个模块为什么存在 ───────────────────────────────────────────
 * v2.13 起引擎的方向是「辨别他人关于未来的主张」，但采集源（RSS+博客+sitemap）
 * 里的前瞻表述**多为意图声明**（"we expect to expand access"），没有时点、
 * 不可结算——这条边界自 v2.13 记录到 v3.3.1，六个版本没能推进：
 * Metaculus 403 / Manifold、Polymarket、Kalshi、PredictIt 连接超时 /
 * Epoch AI 只有统计数据（2026-10-25 复测，全部不可达）。
 *
 * 本轮换路子：**带硬结算日的预测不只在预测平台，也在上市公司的一手备案里**。
 * 8-K（Item 2.02 业绩发布）的 EX-99 附件里有厂商自报的下一期数值指引——
 * "Revenue is expected to be $108.0 billion, plus or minus 2%"（NVIDIA
 * FY2027 Q3 指引，2026-08-26 备案）。有主体（公司）、有事件（下一财季
 * 实际值）、有结算机制（下一期财报公布时可验证），是比任何 RSS 意图声明
 * 都硬的可结算预测。且 SEC EDGAR 公开 API 实测可达（2026-10-25：
 * data.sec.gov 200/2.6s，index.json 200）。
 *
 * ── 与既有源的分工 ─────────────────────────────────────────────
 * - 媒体源（RSS）告诉你「别人说这家公司会怎样」——二手转述；
 * - EDGAR 给你「这家公司自己在一手备案里说会怎样」——厂商原始承诺，
 *   证据等级是 commercial-discriminator 证据表里的「公开财报(3)」，
 *   source-credibility-grader 的 sec.gov → T1。2026-10-25 live 全池
 *   258 条里这一等级一条都没有（全部是媒体或无出处标题）。
 *
 * ── 诚实性约束（不可违反）───────────────────────────────────────
 * 1. 只采集公开备案索引与 EX-99 附件正文，不采集、不估计任何非公开信息。
 * 2. SEC fair access：User-Agent 声明身份，请求间隔 ≥120ms（限速 10 req/s）。
 * 3. 指引的结算点是**估计值**（财季结束+45 天，财报公布滞后的保守中位），
 *    产物里带 dueBasis='estimated-fiscal'，不得当成精确日期。
 * 4. 有的公司（实测 Microsoft / Alphabet）只在电话会口头给指引、备案里
 *    没有数值——如实返回空 guidance，不编造、不用别处数字顶替。
 * 5. 外国私人发行人（TSM/ARM/NBIS）交 6-K 不交 8-K，本轮公司名单只收
 *    境内备案人；这是已知边界，不是疏漏。
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const SEC_UA = 'HermesAgent human-future-skill (research collection; contact admin@example.com)';
const CACHE_PATH = path.join(__dirname, '..', '.cache', 'edgar-filings.json');
const TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const SUBMISSIONS_URL = (cik) => `https://data.sec.gov/submissions/CIK${cik}.json`;
// Archives 路径用**不带前导零**的 CIK：带零的形式（data/0001045810/）SEC
// 会 301 跳转，而 https.get 不跟随重定向（实测 28 个附件全部 301）。
const INDEX_URL = (cik, acc) => `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc}/index.json`;
const DOC_URL = (cik, acc, name) => `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc}/${name}`;

const REQUEST_GAP_MS = 120;          // SEC fair access 限速
// [v3.5] 2 → 3：自动结算需要「指引备案 + 下一期实际值备案」这对连续备案都在
// 采集窗口内。2 份只能结最近一季的指引（第 2 新备案的指引 ↔ 最新备案的实际
// 值），3 份能同时结最近两季——v3.5 审计时台账积压 15 条到期指引，2 份窗口
// 每轮只能清 3 条，3 份窗口清更多。成本约 14 个额外请求（120ms 间隔下可忽略）。
const MAX_8K_PER_COMPANY = 3;        // 每公司最多看最近 N 个业绩 8-K
const DOC_MAX_CHARS = 120000;        // 单附件抓取上限（防异常大文件）
const BODY_WINDOW_CHARS = 4000;      // 挂到条目 body 上的 outlook 窗口

// [v3.4] 公司名单：AI 算力/资本/软件链上的境内备案人（交 8-K）。
// 选样理由：半导体（NVDA/AMD/AVGO/MRVL/MU）+ 超大厂（MSFT/GOOGL/AMZN/META）
// + 云与数据库（ORCL/CRWV/IBM/DELL）+ AI 应用（PLTR）。境外 6-K 备案人
// （TSM/ARM/NBIS）不在内——见文件头边界第 5 条。
// [v3.25] 六家新增（2026-10-30 live 实证：各 3 份 Item 2.02 业绩 8-K 在采集
// 窗口内、18 份备案数值指引 0 条进台账——指引句式全部在库外，corr-2026-032
// 「在窗公司≠采到的指引」同型第五波）：QCOM（表格行 B 单位区间 + Q4 FY26
// 两位年份）、ANET（冒号+bullet 期望式 + between-and 无单位 + between
// approximately）、CSCO（FY2027 Guidance 表格行 to 区间）、NOW（无单位
// 表格行区间，单位在表头）、UBER（anticipate + of + to 区间）、SHOP
// （expect + to be + X% to Y% 纯百分比区间）。选样覆盖半导体/网络设备/
// 企业软件/平台经济四个子域。
const DEFAULT_TICKERS = ['NVDA', 'AMD', 'AVGO', 'MRVL', 'MU', 'MSFT', 'GOOGL',
  'AMZN', 'META', 'ORCL', 'CRWV', 'IBM', 'DELL', 'PLTR',
  'QCOM', 'ANET', 'CSCO', 'NOW', 'UBER', 'SHOP'];

// ── 指引句式（四条 live 实证句式归纳，2026-10-25）──────────────────
// ① NVIDIA 新闻稿：「Revenue is expected to be $108.0 billion, plus or minus 2%.」
// ② Amazon EX-99.1：「Net sales are expected to be between $197.0 billion
//    and $202.0 billion, or to grow between 9% and 12%...」
// ③ AMD 新闻稿：「For the third quarter of 2026, AMD expects revenue to be
//    approximately $13 billion, plus or minus $300 million.」（expects 在前）
// ④ Micron EX-99.1 表格：「guidance for the first quarter of 2027: ...
//    Revenue $61.5 billion ± $1.5 billion」（无谓语动词，指标+数值+容差相邻）
// ⑤ MRVL EX-99.1：「Third Quarter of Fiscal 2027 Financial Outlook •
//    Net revenue is expected to be $3.150 billion +/- 5%.」
// 共同结构：指标名词 + 期望动词/数值相邻共现。单有 "expects" 不算
// （"we expect to expand access" 是意图声明，正是本引擎要排除的）。
// 句点处理：小数（108.0 / 3.150 / 52.9%）的 . 不是句读——字符类只吞
// 「数字间的 .」，否则句子在第一个小数位被截断（实测 "$108" 丢 ".0 billion"，
// 容差 "plus or minus 2%" 整段丢失）。坑：只写 \d\. 会把句点也吞掉——"at $8.10.
// [v3.14] total expenses 进名词族：META CFO 评论式指引「full year
// 2026 total expenses to be in the range of $175-179 billion」的指标
// 名词（live 实证 2026-10-26，三份 META 备案）。只加 total 限定形态，
// 不加裸 expenses——裸 expenses 会从 "operating expenses" 尾部匹配，
// 把 NVDA/MRVL 的 opex 指引指标名切成 expenses（settleMetric/
// normalizeMetric 两侧口径被打穿）。
// [v3.25] 名词族补三个（六家新公司 live 实证，均不互套现有词——corr-2026-032
// 纪律：进台账 id metric 维度的字段只能加不互套新词）：
//   operating margin（ANET/CSCO/SHOP）、gross bookings（UBER）、
//   adjusted ebitda（UBER）。
const METRIC_NOUNS = '(?:net revenues?|revenues?|net sales|total revenue|total expenses|income|earnings|eps|diluted earnings per share|gross margins?|operating expenses|operating income|operating margin|tax rates?|free cash flow|capital expenditures?|capex|gross bookings|adjusted ebitda)';
const NUM_OR_TERM = '(?:(?<=\\d)\\.(?=\\d)|[^.;•])';   // 仅数字间的小数点，不当句读
// New Oracle" 的句点被当成小数的一部分，句子冲进下一节标题（实测 Oracle 指引
const GUIDANCE_SENTENCE_RE = new RegExp(
  `(?:${METRIC_NOUNS})\\b${NUM_OR_TERM}{0,140}?\\b(?:is|are)\\s+(?:expected|projected|anticipated|forecast|guided)\\s+to\\s+be\\b${NUM_OR_TERM}{0,160}`,
  'i');
// expects 在前形态：「AMD expects revenue to be approximately $13 billion」
const GUIDANCE_EXPECTS_RE = new RegExp(
  `(?:expects?|projects?|anticipates?|forecasts?)\\s+(?:net\\s+)?(?:${METRIC_NOUNS})\\s+to\\s+be\\b${NUM_OR_TERM}{0,160}`,
  'i');
// 表格形态：「Revenue $61.5 billion ± $1.5 billion」（指标+数值+容差相邻，
// 无谓语动词）。精度依据：财报 actuals 表格（"Revenue $6,824 $4,634"）
// 没有相邻容差符号，不会误命中。容差数值后的单位必须吃进来——否则
// "± $1.5 billion" 被截成 "± $1.5"（实测踩过：单位丢失后 tolerance
// 字段不可读）。
const GUIDANCE_TABLE_RE = new RegExp(
  `(?:${METRIC_NOUNS})\\s+(?:approximately\\s+)?\\$\\s?[\\d.,]+\\s*(?:billion|million)?\\s*(?:±|\\+/-)\\s*\\$?\\s?[\\d.,]+\\s*(?:billion|million)?`,
  'i');

// [v3.14] META CFO 评论式指引形态（expect 在前 + 期间/所有格间隔 + 区间值）。
// live 实证（2026-10-26 从 SEC EDGAR 实抓 META 三份备案的 CFO Outlook
// Commentary 段）：
//   「We expect fourth quarter 2026 total revenue to be in the range of
//     $73-76 billion」
//   「We now expect full year 2026 total expenses to be in the range of
//     $175-179 billion」
//   「We anticipate 2026 capital expenditures, including principal
//     payments on finance leases, to be in the range of $135-145 billion」
//   「we expect our fourth quarter 2026 tax rate to be between 15-17%」
// META 自 v3.4 起就在 14 家公司名单里，但这条句式三条旧形态全部不命中
// （form A 要 is/are expected、form B 要动词与名词紧邻），三个版本零条
// 指引进台账——与 MSFT/GOOGL「只在电话会口头给指引」的如实记录混在
// 同一句描述里（corr-2026-032：在窗公司≠采到的指引）。
// 与 form B 的分界：B 管点值（"expects revenue to be $13 billion"），
// 本形态必须有区间标记（in the range of / between）——gap=0 的区间句
// （"expects revenue to be between X and Y"）是 form B 的地盘（它的
// rangeM 同样吃区间），故间隔词至少 1 个，两个形态不重叠不重复抽取。
// 名词与 to be 之间容忍 [^.;•]{0,90}——capex 句中间插了 ", including
// principal payments on finance leases, "（49 字符）。extendBack=0：
// 期间短语在匹配区内（"expect fourth quarter 2026 total revenue"），
// 期间匹配的向前窗本来就含匹配自身。间隔词类含连字符——"GAAP and
// non-GAAP tax rates"（NVDA 全年税率指引，expects 在前形态）的
// "non-GAAP" 不带连字符就跨不过去（第一版 [A-Za-z0-9]+ 实测漏抽）。
// 值尾部用 NUM_OR_TERM 同款小数点容差（(?<=\d)\.(?=\d)）——"between
// 16.0% and 18.0%" 的小数点被 [^.;] 当句读，m[0] 截在 "between 16"、
// 整个数值丢失（第二版实测，META 的 $73-76 无小数点所以没暴露）。
const GUIDANCE_EXPECTS_GAP_RE = new RegExp(
  `(?:expects?|anticipates?|projects?|forecasts?)\\s+(?:our\\s+)?(?:[A-Za-z0-9-]+\\s+){1,4}?(?:${METRIC_NOUNS})\\b[^.;•]{0,90}?\\bto\\s+be\\s+(?:in\\s+the\\s+range\\s+of|between)\\b(?:(?<=\\d)\\.(?=\\d)|[^.;•]){0,60}`, 'i');

// [v3.19] 名词式区间指引（form E）。live 实证（2026-10-27 从 SEC EDGAR
// 实抓 DELL 0001571996-26-000021/000003 原文驱动）：
//   「Second-quarter FY27 revenue expected between $44.0 billion and
//     $45.0 billion, up 49% year over year at the midpoint of $44.5 billion」
//   「Full-year FY27 revenue expected between $138.0 billion and $142.0
//     billion, up 23% year over year at the midpoint of $140.0 billion」
//   「First-quarter FY27 revenue expected between $34.7 billion and
//     $35.7 billion, ...」
// 指标名词在前、无 is/are、expected 紧邻名词、between-and 区间——
// form A 要 is/are expected to be（该句没有）、form B/D 要动词在前
// （该句名词在前），三条旧形态全部不命中：DELL 自 v3.4 起就在 14 家
// 公司名单里，三个版本零条指引进台账（corr-2026-032「在窗公司≠采到
// 的指引」同型第三波——v3.4 状态描述写着「MSFT/GOOGL/AVGO/CRWV/IBM/
// DELL/PLTR 只在电话会口头给指引或无数值」，live 实证 AVGO/DELL/PLTR
// 备案里都有书面数值指引，状态描述腐烂三个版本）。
// 精度：名词与 expected 之间只容忍可选 is/are（无量词间隔——v3.6 宽窗
// 误命中教训）；区间值由既有 rangeM between-and 形态解析，落句即入库。
// extendBack=40：期间短语在名词前（"Second-quarter FY27 "），向前扩到
// 分句边界（bullet '• '）把期间包进句子；期间解析的 500 字符向前窗
// 本来就含匹配自身，窗口内 rightmost-wins 拿句内期间。
const GUIDANCE_NOUN_RANGE_RE = new RegExp(
  `(?:${METRIC_NOUNS})\\s+(?:is|are\\s+)?expected\\s+between\\b${NUM_OR_TERM}{0,120}`, 'i');

// [v3.19] 提升式区间指引（form F）。live 实证（2026-10-27 实抓 PLTR
// 0001321655-26-000039/000026 原文驱动）：
//   「We are raising our revenue guidance to between $8.150 – $8.158
//     billion.」（en-dash 分隔，句读号结尾）
//   「We are raising our adjusted income from operations guidance to
//     between $4.889 – $4.897 billion.」
//   「We are raising our adjusted free cash flow guidance to between
//     $4.5 – $4.7 billion.」
// raise 动词在前、名词与 guidance 之间可隔修饰语（"adjusted income
// from operations"）。旧区间正则只认 and / in the range of / 单百分号
// 连字符，between + en-dash 整个不命中（rangeM 同轮补形态）。
// 精度：必须有区间标记（to between）——"raising our full-year revenue
// guidance to 71% growth"（PLTR 05-04 live 同文）是增长率指点不是
// 区间，不命中；"guidance to in excess of $3.424 billion"（U.S.
// commercial revenue）无 between，不命中（漏报比误报诚实）。
// extendBack=0：期间在句外节头（"For full year 2026:"），冒号是分句
// 边界扩不进来，靠 ANNUAL_HEADER_RE 从 500 字符向前窗解析。
const GUIDANCE_RAISING_RANGE_RE = new RegExp(
  `(?:rais(?:e|es|ing|ed))\\s+(?:our\\s+)?(?:[A-Za-z0-9-]+\\s+){0,3}?(?:${METRIC_NOUNS})\\b[^.;•]{0,40}?\\bguidance\\s+to\\s+between\\b${NUM_OR_TERM}{0,120}`, 'i');

// [v3.19] 名词式点值指引（form G）。live 实证（2026-10-27 实抓 AVGO
// 0001730168-26-000076/000051/000011 与 DELL 0001571996-26-000039）：
//   「Fourth quarter fiscal year 2026 revenue guidance of approximately
//     $34.8 billion, an increase of 93 percent from the prior year period」
//   「Full-year FY27 revenue guidance of $192.0 billion, up 69% year
//     over year」
//   「Full-year FY27 EPS guidance of $24.37 and non-GAAP EPS guidance
//     of $25.50, ...」
// 名词+guidance of+数值，无谓语动词。点值（approximately 无容差）不
// 自动结算，但作为可辨别主张登记（与 AMD opex 点值指引同型——登记
// 与结算是两回事，v3.5 起纪律）。ORCL「we confirm our prior revenue
// guidance of $90 billion」重述句同命中：同一 FY2027 营收义务在两份
// 备案各登记一次，结算时证据源同指提供实际值的备案，dedupeSame-
// Obligation 按证据 key 合并（Brier 样本不重复计数，口径见
// prediction-ledger.js 证据 key 注释）。
// extendBack=40：期间短语在名词前（"Fourth quarter fiscal year 2026"）。
const GUIDANCE_NOUN_OF_RE = new RegExp(
  `(?:${METRIC_NOUNS})\\s+guidance\\s+of\\s+(?:approximately\\s+)?\\$\\s?[\\d.,]+\\s*(?:billion|million|bn|tn|trillion)?`, 'i');
// [v3.20] 冒号+bullet 期望式指引（form H）。live 实证（2026-10-27 实抓
// PLTR 0001321655-26-000013/000026/000039 三份备案 Outlook 段逐字）：
//   「For Q1 2026, we expect: • Revenue of between $1.532 - $1.536
//     billion.」
//   「• Adjusted income from operations of between $870 - $874
//     million.」
//   「For full year 2026, we expect: • Revenue of between $7.182 -
//     $7.198 billion.」
//   「For Q2 2026, we expect: • Revenue of between $1.797 – $1.801
//     billion. • Adjusted income from operations of between $1.063 –
//     $1.067 million.」（05-04 备案，季度指引同样在 colon-bullet 里）
// PLTR 自 v3.4 起就在 14 家公司名单里，v3.19 全池过堂只补了 raising 式
// **全年**指引（form F）——**季度指引 bullet 整个在库外**：三份备案的
// Q1/Q2/Q3 2026 营收指引全部漏采（corr-2026-032「在窗公司≠采到的指引」
// 同型第四波：v3.19 过了「哪些公司没指引」的堂，没过「已命中公司的
// 其它段落还有没有漏」的堂——同一公司不同段落可以用完全不同句式，
// 形态命中数>0 ≠ 该公司覆盖完整）。
// 形态：expect 动词 + 冒号 + bullet 列表 + 指标名词（+{0,40} 修饰语）
// + of + (between)? + 美元数值。名词与 of 之间容忍修饰语——live 实证
// 「Adjusted income from operations of between」（"from operations"
// 17 字符，第一版紧邻形态漏采该 bullet）。
// 结构要点（lookbehind 起句于名词，句子不含 expect/冒号/bullet 前缀）：
// ① 冒号是硬锚——"we expect revenue to be $X"（form B 地盘）无冒号
//    不命中；② bullet 列表的**后续 bullet** 不带动词，靠 lookbehind
//    的 [^:]{0,300} 隔段窗追上（节头「For full year 2026, we expect:」
//    必含冒号，隔段窗跨不过去，Q1 节的 expect 追不上 FY 节的 bullet——
//    V8 lookbehind 实测嵌套懒量化迭代走不通两迭代，冒号隔段是可靠结构）；
//    ③ in excess of
//    指点值不收（gap 负向断言挡 "in excess"——v3.19 同款决议：单边
//    下界登记成点值会扭曲义务语义，漏报比误报诚实）；④ 修饰语窗
//    [^.;•]{0,40} 不过句读不过 bullet。
// extendBack=0：期间短语在冒号节头（"For Q1 2026, we expect:"/
// "For full year 2026, we expect:"），冒号是分句边界扩不进来，靠
// PERIOD_PATTERNS 从 500 字符向前窗解析（ANNUAL_PERIOD_PATTERN 的
// "full year 2026, we expect" 锚词在节头内，v3.19 已实测可用；
// 季度形态 "Q1 2026" 就近取胜，ANNUAL_BARE_YEAR_RE 要 expect 紧接
// 年份不命中，季度指引不会被抢成全年）。
// [v3.25] 值部分泛化（ANET live 实证逐字）：
//   「we expect: • Revenue of approximately $3.3 billion; • Non-GAAP
//     operating margin of 48 - 49%; and • Non-GAAP diluted net income per
//     share between $1.06 and $1.08.」
// of 后容忍 approximately；新增尾 % 区间分支（of 48 - 49%——首值无 $）。
// PLTR 既有命中（of between $1.532 - $1.536 billion）行为不变；in-excess
// 指点值的负向断言保留（名词-of 间隔与 of 后双保险）。
const GUIDANCE_COLON_BULLET_RE = new RegExp(
  `(?<=(?:expects?|anticipates?|projects?|forecasts?)\\s*:\\s*[^:]{0,300})` +
  `(?:[A-Za-z][\\w-]*\\s+){0,2}?(?:${METRIC_NOUNS})\\b(?:(?!\\bin\\s+excess\\b)${NUM_OR_TERM}){0,40}?\\bof\\s+(?:approximately\\s+)?(?:between\\s+)?` +
  `(?:\\$\\s?[\\d.,]+(?:\\s*(?:million|billion|bn|tn|trillion)|\\s*[-\u2013\u2014]\\s*\\$?\\s?[\\d.,]+(?:\\s*(?:million|billion|bn|tn|trillion))?)` +
  `|[\\d.]+\\s*[-\u2013\u2014]\\s*[\\d.]+\\s*%)${NUM_OR_TERM}{0,30}`, 'i');

// [v3.25] 表格行/无动词区间指引（form J）。live 实证（2026-10-30 从 SEC
// EDGAR 实抓六家新公司原文驱动，corr-2026-032 同型第五波）：
//   QCOM：「Current Guidance Q4 FY26 Estimates 1 Revenues $9.7B - $10.5B」
//   CSCO：「FY 2027 Guidance Revenue $18.0 billion to $18.2 billion」
//   NOW：「Subscription revenues $4,245 - $4,255」（无单位，单位在表头）
//   UBER：「we anticipate Gross Bookings of $58.25 billion to $60.25
//     billion」「Non-GAAP EPS of $0.84 to $0.88」
// 名词 + 可选 of/per share + 可选口径词 + 美元/百分号首值 + 区间符号
// （-\u2013\u2014 或 to）+ 尾值。
// 精度纪律（逐条有测试钉住）：
// ① 首值必须紧跟名词（可选 of/per share/口径词）——"revenue to $4
//    billion"（CSCO raising 句）、"revenue grew 22% YoY to $54.1
//    billion"（UBER 实际值句）名词与首值之间有动词，不命中；
// ② 区间符号必须紧跟首值（可隔一个单位）——财报 actuals 表格两列
//    （"Revenue $ 17.3 billion $ 14.7 billion"）无区间符号，天然不命中；
// ③ 无单位区间（NOW "$4,245 - $4,255"）抽取侧收句式、结算侧 parseRange
//    不猜（单位在表头跨句不进 value 串，默认 billion 差 1000 倍）。
// extendBack=40：期间短语在名词前（QCOM「Current Guidance Q4 FY26」在
// 表格行上方、CSCO「Q1 FY 2027」在表格列头），扩到分句边界包进句子。
const GUIDANCE_RANGE_ROW_RE = new RegExp(
  `(?:${METRIC_NOUNS})\\s+(?:of\\s+|per\\s+share\\s+)?(?:GAAP\\s+|Non-GAAP\\s+|non-GAAP\\s+)?` +
  `(?:\\$\\s?[\\d.,]+|[\\d.]+%)\\s*(?:billion|million|bn|B|M)?\\s*(?:[-\u2013\u2014]|\\bto\\b)\\s*\\$?\\s?[\\d.,]+\\s*(?:billion|million|bn|B|M|%)?`, 'i');

// [v3.25] expect + 名词 + to be + X% to Y%（form K，SHOP live 实证逐字）：
//   「For the third quarter of 2026, we expect Revenue to grow at a
//     low-thirties percentage rate ... Operating expenses as a percentage
//     of revenue to be 33% to 34% Stock-based compensation to be $150
//     million and Free cash flow margin ...」
// 精度纪律：① 只收纯 % 区间（无 $、无 between、无 in the range of）——
//    "to be in the range of $73-76 billion"（META）值不以数字开头不命中
//    （form D 地盘）；"to be approximately $13 billion"（AMD 点值）不是
//    % 区间不命中（form B 地盘）；② "Revenue to grow at a low-thirties
//    percentage rate" 是文字增长率（to grow at 不是 to be），天然不命中
//    ——按 v3.6/v3.9「无幅度不是可证伪主张」纪律留作已知边界；
//    ③ expect 到名词容忍最多 30 词（SHOP 的 operating expenses 句距
//    expect 约 25 词——bullet 间无句点连成一段）。
// extendBack=0：期间在句首（"For the third quarter of 2026, we expect"）。
// [v3.25] 匹配起点在名词：expect 动词门退到 lookbehind（与 form H 同款
// 变长 lookbehind 结构）。原写法 m[0] 从动词起、跨多个 bullet——SHOP live
// 实证「we expect Revenue to grow at ... Operating expenses as a percentage
// of revenue to be 33% to 34%」的 m[0] 跨两句，metricM 从 m[0] 取第一个
// 名词会拿到 Revenue（第一句的名词）而不是 to be 前的 operating expenses
// （指标错配→幂等 id 与结算 key 全歪）。lookbehind 后 m[0] 从名词起。
// [v3.25 第二轮] lookbehind 窗容忍冒号与分号 bullet：SHOP live 逐字是
// 「we expect: • Revenue to grow at a low-thirties percentage rate on a
// year-over-year basis; • Gross profit dollars to grow at a mid-to-high
// twenties percentage rate on a year-over-year basis; • Operating expenses
// as a percentage of revenue to be 33% to 34%;」——冒号紧跟 expect、bullet
// 间用分号。第一版窗口只许词字符（[A-Za-z][\w-]*\s+ 链），冒号与分号
// 都跨不过去，live 三份备案 0 条而手抄夹具（无冒号无 bullet 的规范化
// 文本）全绿——夹具走到不到被测分支（corr-2026-029 同型）。窗口规则：
// 冒号可选（:?）、窗内禁句点与冒号（[^.:]，分号与 bullet 允许——同节
// bullet 是同一段指引声明），上限 300 字符（与 form H 同款）。
const GUIDANCE_EXPECT_TOBE_RE = new RegExp(
  `(?<=(?:expects?|anticipates?)\\s*:?\\s*[^.:]{0,300}?)(?:${METRIC_NOUNS})\\b[^.;:]{0,80}?\\bto\\s+be\\s+\\d+(?:\\.\\d+)?\\s*%\\s+to\\s+\\d+(?:\\.\\d+)?\\s*%`, 'i');

// [v3.25] between-and 两形态（form L，ANET live 实证逐字）：
//   ① per-share between（EPS 无单位区间）：「Non-GAAP diluted net income
//      per share between $1.06 and $1.08」——名词走 income（METRIC_NOUNS
//      撤过 'diluted net income per share'，corr-2026-032：进 id 的字段
//      只能加不互套新词；id 与 MRVL EPS 条目同构），结算侧无单位拒收；
//   ② between approximately + 连字符 %：「Non-GAAP gross margin between
//      approximately 62-63%」。
// extendBack=14：吃句首 "Non-GAAP/GAAP" 限定词（与 form A 同款——丢限定词
// 后 GAAP 与非 GAAP 两条指引在句子上无法区分）。
const GUIDANCE_BETWEEN_RE = new RegExp(
  `(?:(?:income|earnings)\\s+per\\s+share\\s+between\\s+\\$\\s?[\\d.,]+\\s+and\\s+\\$\\s?[\\d.,]+` +
  `|(?:${METRIC_NOUNS})\\s+between\\s+approximately\\s+[\\d.]+\\s*[-\u2013\u2014]\\s*[\\d.]+\\s*%)`, 'i');

// [v3.25] Q 缩写 + FY + 两位年份（QCOM live 实证：「Current Guidance Q4
// FY26 Estimates」表格行上方的期间锚）。既有 QUARTER_FY2_RE 只认季度词
// 全拼 + FY + 两位（DELL「Second-quarter FY27」），四位形态不认 FY26。
// 捕获组 1=季度数字 2=两位年份（readPeriod 的 yr() 展开）。
const QUARTER_QFY2_RE = /Q([1-4])\s*FY\s*(\d{2})\b/i;

// [v3.25] 反向全年形态（锚词在年份**前**）。CSCO live 实证（2026-10-30 实抓
// 0001321761-26-000039 文末指引表逐字）：「...results for fiscal 2027 FY
// 2027 Revenue $72.2 billion to $73.4 billion Earnings per Share GAAP $4.00
// to $4.06 Non-GAAP $5.05 to $5.11」——FY 列的期间声明是 "results for
// fiscal 2027"（锚词在前）。旧年度模式全部不命中：ANNUAL_PERIOD_PATTERN
// 要年份词在年份前（FY 2027 Guidance）、ANNUAL_EXPECT_RE 与 ANNUAL_BARE_
// YEAR_RE 要动词在年份前——FY 列错配成就近的 Q1 列头（Q1 FY 2027），
// 全年指引按季度结算点到期、用 Q1 实际值结算 FY 区间=错误结算（v3.19
// AVGO/ORCL dueOn 错位同型纪律）。捕获组 1=年份，readPeriod 按集合判全年。
// 精度：季度词在年份前时天然不命中（"guidance for the first quarter of
// fiscal 2027" 的 first 挡在 (20\d{2}) 前）——测试钉住。
const ANNUAL_RESULTS_RE = /(?:guidance|outlook|results)\s+for\s+(?:the\s+)?(?:full\s+)?(?:fiscal\s+)?(20\d{2})\b/i;
// [v3.14] 多季度指引不适用单期结算机制：「we expect our tax rate for
// the remaining quarters of 2026 to be between 15-17%」（META 07-29
// live 实证）覆盖多个财季，而结算按 (ticker,财季,指标) 单期配对。
// 不跳过的后果：句内期间短语缺季度词（复数 quarters），rightmost-wins
// 期间匹配会回头蹭到前一句指引的财季/全年标记（07-29 备案实测：税率
// 句前的 capex 句含 "anticipate 2026 capital expenditures"），把多季度
// 义务错记成 FY2026 全年指引。多季度结算结构是后续轮次候选——
// 漏报比误报诚实。
const MULTI_PERIOD_RE = /(?:remaining|following|next)\s+quarters|quarters\s+of\s+20\d{2}/i;

// 财季期间标题（出现在指引句之前，同节内）。四条 live 实证句式：
// 「Outlook for the third quarter of fiscal 2027 is as follows:」（NVIDIA）
// 「Third Quarter of Fiscal 2027 Financial Outlook」（MRVL）
// 「guidance for the first quarter of 2027」（Micron）
// 「For the third quarter of 2026, AMD expects...」（AMD，期间在句内）
// 选择纪律：全部匹配按**位置就近**取胜（离指引句最近的那个），不是按
// 模式顺序——实际值段落里也有 "the second quarter of fiscal 2027 was
// $2.739 billion" 这类表述，就近才能保证拿到的是指引期间不是回顾期间。
// [v3.4] 全年指引形态单独声明（须在数组之前——const 不提升，数组
// 字面量求值时引用它会进 TDZ 直接 ReferenceError）：
// 「Guidance for Full FY 2027」「For fiscal year 2027, we now expect...」。
// 全年指引的结算点是财年结束，不是季度——匹配循环靠引用身份判定
// annual，periodLabel 显示「FY#### 全年」。捕获组只有 1 个（年份）。
// [v3.14] 年份词与数字之间容忍可选 "fiscal"——NVDA 原文是 "For the
// full year fiscal 2027"（year 与 2027 之间还有 fiscal），旧写法
// `(?:fiscal\s+year|FY|year)\s*(20\d{2})` 整个不命中，全年税率指引
// 被右侧邻近的 "first quarter of fiscal 2027"（outlook 段头）抢走，
// 错记成 FY27Q1 指引（live 实证：台账 dueOn 2026-06-14 而非 2027-03，
// v3.4 起三个版本的隐藏错配）。
// [v3.16] lookbehind 挡季度前缀（同轮维护）："Guidance for Q2 FY 2027 Financial Outlook."
// 形态（锚词在年份后同句）会被本模式命中且比季度模式更靠右、rightmost-wins 抢成
// 全年；live 实证 ORCL 真文标题句后接句点不命中（期间归属正确），冒号形态
//（"outlook for Q2 FY 2027 is as follows:"，: 不在 [^.;•] 排除类）会误判。
// [v3.19] lookbehind 补季度词全族（v3.16 给 ANNUAL_YEAR_NOUN_RE 加过、
// 本形态漏加的同型缺口）：AVGO live 实证「Fourth quarter fiscal year
// 2026 revenue guidance of approximately $34.8 billion」的 "fiscal
// year 2026 … guidance" 让全年形态命中（锚词 guidance 就在年份后），
// 匹配起点比季度形态更靠右，rightmost-wins 把 Q4 季度指引抢成
// FY2026 全年（dueOn 从 2027-01 推到 2026-12-16 之后全年，季度结算
// 全部落空）。判据与 ANNUAL_YEAR_NOUN_RE 逐字同型：Q 前缀 + 季度词
// 前缀都挡。
const ANNUAL_PERIOD_PATTERN = /(?<![Qq][1-4]\s*(?:FY|fiscal\s+year|fiscal)?\s*)(?<!(?:first|second|third|fourth|1st|2nd|3rd|4th)[\s-]quarter\s*(?:of\s+)?(?:fiscal\s+)?)(?:full\s+)?(?:fiscal\s+year|FY|year)\s*(?:fiscal\s+)?(20\d{2})\b[^.;•]{0,40}?(?:guidance|outlook|expect)/i;
// [v3.14] META 评论式全年指引形态：「We now expect full year 2026 total
// expenses to be in the range of $175-179 billion」——锚词 expect 在
// 年份**之前**，ANNUAL_PERIOD_PATTERN 要求锚词在年份之后（NVDA「For
// the full year fiscal 2027, NVIDIA expects…」），整句不命中。捕获组
// 1=年份（与 ANNUAL_PERIOD_PATTERN 同形，readPeriod 按集合判全年）。
const ANNUAL_EXPECT_RE = /(?:expects?|anticipates?|projects?|forecasts?)\b[^.;•]{0,30}?\b(?:full\s+year|fiscal\s+year|FY)\s*(20\d{2})\b/i;
// [v3.14] 裸年份全年形态：「We anticipate 2026 capital expenditures …
// to be in the range of $135-145 billion」——期间只有裸年份（capex
// 全年指引惯例），季度词与 full year 都不出现。动词+年份+指标名词
// 三段紧邻才判全年："expect 2026 third quarter revenue" 年份与名词
// 之间有季度词，不命中——季度指引不会被误判成全年。
const ANNUAL_BARE_YEAR_RE = new RegExp(
  `(?:expects?|anticipates?|projects?|forecasts?)\\s+(?:our\\s+)?(20\\d{2})\\s+(?:${METRIC_NOUNS})`, 'i');
// [v3.14] 全年形态集合：readPeriod 按集合成员判 annual（旧代码用
// `p === ANNUAL_PERIOD_PATTERN` 身份比较，加新形态必须同步，否则
// 全年指引被当季度解析、quarter=null 配不上实际值 key）。
// [v3.16] 年份在名词前的全年形态（GOOGL FY2026 capex live 实证，2026-10-27
// 从 SEC EDGAR 实抓 0001652044-26-000012）：「To meet customer demand ...,
// our 2026 CapEx investments are anticipated to be in the range of $175
// to $185 billion.」——期间是裸年份且在名词**之前**，动词 are anticipated
// 在名词之后。三条旧年度模式全部不命中：ANNUAL_PERIOD_PATTERN 要年份词
// （fiscal year/FY/year）在年份前、ANNUAL_EXPECT_RE 与 ANNUAL_BARE_YEAR_RE
// 要动词在年份前。旧代码全文兜底匹配到文首的 "q42025"（文档名），全年指引
// 被错记成 FY2025Q4、dueOn 2026-02-14 已过期——v3.14/v3.15 两轮白纸黑字的
// 残废条目已知边界（「两个形态 + 残废条目重登记是下轮候选」即本条）。
// 精度纪律（季度指引不得被抢成全年，逐条有测试钉住）：
// ① 年份与名词之间只容忍空白——"third quarter of 2026, revenue"（逗号
//    间隔）与 "in 2026, capital expenditures" 不命中，季度句天然安全；
// ② lookbehind 挡季度前缀——"Q3 2026 revenue is expected" 与 "third
//    quarter 2026 revenue is expected" 的年份前有季度词（含 "Q3 FY2026"
//    的 FY 形态），整句不命中；否则新形态比季度模式更靠右，rightmost-wins
//    会把季度指引抢成全年（与 ANNUAL_PERIOD_PATTERN 对 "Q3 FY2026" 的
//    同款风险，见 SKILL.md 已知边界）；
// ③ 动词只认期望时态（is/are + anticipated/expected/projected/forecast/
//    guided + to be）——实际值句（was/were 过去时）不是指引；
// ④ 捕获组只有 1 个（年份），与其余年度形态同形，readPeriod 按集合判全年。
const ANNUAL_YEAR_NOUN_RE = new RegExp(
  `(?<![Qq][1-4]\\s*(?:FY|fiscal\\s+year|fiscal)?\\s*)(?<!(?:first|second|third|fourth|1st|2nd|3rd|4th)[\\s-]quarter\\s*(?:of\\s+)?(?:fiscal\\s+)?)\\b(20\\d{2})\\s+(?:${METRIC_NOUNS})\\b[^.;•]{0,80}?\\b(?:is|are)\\s+(?:anticipated|expected|projected|forecast|guided)\\s+to\\s+be\\b`, 'i');
// [v3.19] 连字符季度词 + 两位财年（DELL live 实证：「Second-quarter
// FY27 revenue expected between...」）。PERIOD_PATTERNS 旧形态全部要求
// 四位年份（20\d{2}），FY27 的两位形态整个不命中——期间抽不到，
// buildForecastDiscrimination 的 `!g.quarter && !g.annual` 门直接把
// 指引拦在辨别之外（v3.4 起同型：期间是 claim 的准入条件）。捕获组
// 1=季度词 2=两位年份，readPeriod 同轮补 <100 → +2000 展开。
const QUARTER_FY2_RE = /(first|second|third|fourth|1st|2nd|3rd|4th)[\s-]quarter\s+FY\s*(\d{2})\b/i;
// [v3.19] 连字符全年词 + 两位财年（DELL live 实证：「Full-year FY27
// revenue expected between $138.0 billion and $142.0 billion」）。捕获
// 组只有 1 个（两位年份），与其余年度形态同形，readPeriod 按集合判全年。
const FULLYEAR_FY2_RE = /full[\s-]year\s+FY\s*(\d{2})\b/i;
// [v3.19] 冒号节头全年形态（PLTR live 实证：「For full year 2026: •
// We are raising our revenue guidance to between $8.150 – $8.158
// billion.」）。PLTR 的期间写在句外节头，指引句自身无期间；且
// ANNUAL_PERIOD_PATTERN 的锚词（guidance|outlook|expect）跨不过
// 节头的 bullet（[^.;•] 排除 •），500 字符窗内最右的期间匹配会是
// 前文财务摘要表的 "Q2 2026"——不补这个形态，全年指引被错记成
// FY2026Q2、dueOn 提前到已过期的 2026-09，与 Q2 实际值（PLTR 按
// 千位上报）撞 key 判 beat 带外（v3.14 NVDA 全年税率错记 FY27Q1
// 同型）。精度：年份短语后必须紧跟冒号（节头形态），不认裸年份。
// [v3.19] lookbehind 同款（ORCL live 实证：「for Q2 FY 2027: • Total
// revenues are expected to grow...」——冒号紧跟年份的节头形态被 Q2
// 前缀骗过：ANNUAL_HEADER_RE 匹配 "FY 2027:" 起点在 Q 形态
// "Q2 FY 2027" 之后，rightmost-wins 把 Q2 EPS 区间指引抢成全年，
// dueOn 提前到已过期时点）。Q 前缀与季度词前缀都挡；PLTR 的
// 「For full year 2026:」（无季度前缀）照常命中。
const ANNUAL_HEADER_RE = /(?<![Qq][1-4]\s*(?:FY|fiscal\s+year|fiscal)?\s*)(?<!(?:first|second|third|fourth|1st|2nd|3rd|4th)[\s-]quarter\s*(?:of\s+)?(?:fiscal\s+)?)(?:(?:full|fiscal)[\s-]year|FY)\s*(?:fiscal\s+)?(20\d{2})\s*:/i;
// [v3.19] 季度词 + fiscal year 全拼 + 年份（AVGO live 实证：「Fourth
// quarter fiscal year 2026 revenue guidance of approximately $34.8
// billion」与正文锚「the outlook for the fourth quarter of fiscal year
// 2026, ending November 1, 2026」）。旧季度形态 quarter\s+(?:of\s+)?
// (?:fiscal\s+)?(20\d{2}) 吃不下 "fiscal year 2026" 的 year 单词
// （fiscal 后直接要数字），Q4 FY2026 指引期间整个抽不到。
const QUARTER_FISCALYEAR_RE = /(first|second|third|fourth|1st|2nd|3rd|4th)[\s-]quarter\s+(?:of\s+)?fiscal\s+year\s+(20\d{2})\b/i;
const ANNUAL_PERIOD_SET = new Set([ANNUAL_PERIOD_PATTERN, ANNUAL_EXPECT_RE, ANNUAL_BARE_YEAR_RE, ANNUAL_YEAR_NOUN_RE, FULLYEAR_FY2_RE, ANNUAL_HEADER_RE, ANNUAL_RESULTS_RE]);
const PERIOD_PATTERNS = [
  /(?:outlook|guidance)\s+for\s+(?:the\s+)?(first|second|third|fourth|1st|2nd|3rd|4th)\s+quarter\s+of\s+fiscal\s+(20\d{2})/i,
  /(first|second|third|fourth|1st|2nd|3rd|4th)\s+quarter\s+(?:of\s+)?(?:fiscal\s+)?(20\d{2})\b[^.;•]{0,30}?(?:outlook|guidance)/i,
  /(?:outlook|guidance)\s+for\s+(?:the\s+)?(first|second|third|fourth|1st|2nd|3rd|4th)\s+quarter\s+(?:of\s+)?(?:fiscal\s+)?(20\d{2})/i,
  // [v3.4] Oracle 实测句式：「Guidance for Q2 FY 2027」（季度缩写形态，
  // 旧四条模式全部不命中，回退匹配到过去的财季——期间错了整条指引的
  // 结算点就错了）。捕获组：1=季度数字，2=年份。
  /(?:guidance\s+for\s+)?Q([1-4])\s*(?:FY|fiscal\s+year\s*)?\s*(20\d{2})/i,
  /(?:for\s+the\s+)?(first|second|third|fourth|1st|2nd|3rd|4th)\s+quarter\s+(?:of\s+)?(?:fiscal\s+)?(20\d{2})\b/i,
  ANNUAL_PERIOD_PATTERN,
  // [v3.14] META 形态追加在数组末尾：全文兜底匹配按数组顺序取第一个
  // （见下方 fallback 分支），新形态优先级低于既有形态，不影响旧行为。
  ANNUAL_EXPECT_RE,
  ANNUAL_BARE_YEAR_RE,
  // [v3.16] 年份在名词前的全年形态（GOOGL FY2026 capex live 实证）追加在末尾：
  // 全文兜底匹配按数组顺序取第一个，新形态优先级低于既有形态。
  ANNUAL_YEAR_NOUN_RE,
  // [v3.19] 追加在末尾（同款优先级纪律）：两位财年/全拼 fiscal year/
  // 冒号节头三组 live 实证形态（DELL/AVGO/PLTR），全文兜底匹配时
  // 不影响既有公司的期间解析。
  QUARTER_FISCALYEAR_RE,
  QUARTER_FY2_RE,
  FULLYEAR_FY2_RE,
  ANNUAL_HEADER_RE,
  // [v3.25] Q 缩写+FY+两位年份（QCOM「Q4 FY26 Estimates」live 实证）。
  // 追加在末尾：全文兜底匹配按数组顺序取第一个，新形态优先级最低，
  // 不影响既有公司的期间解析（就近匹配不受数组顺序影响）。
  QUARTER_QFY2_RE,
  // [v3.25] 反向全年（CSCO「results for fiscal 2027」live 实证）。
  ANNUAL_RESULTS_RE,
];
const QWORD = { first: 1, second: 2, third: 3, fourth: 4, '1st': 1, '2nd': 2, '3rd': 3, '4th': 4 };

// 指引附带的前提削减（口径限定）：同节里「不假设/不含/排除」类句子
const CAVEAT_RE = /(not assuming|does not include|excluding|excluding any|barring|absent|does not assume|not include)/i;

// ── [v3.13] GAAP/非GAAP 口径标记 + 结算指标族（结算配对用）─────────────
// 为什么需要：MRVL 同财季同时指引「GAAP gross margin 52.1%-53.1%」与
// 「Non-GAAP gross margin 58.25%-59.25%」，实际值也分两个口径——不区分
// 口径时 (ticker,财季,指标) key 下天然多值，v3.5 起一律判「歧义跳过」，
// 台账 18 条到期指引里 6 条 MRVL 毛利率/EPS 因此永远 pending。口径一致
// 才配对；不一致或未限定仍按歧义跳过，不设法规避。
// 三段：'gaap+non-gaap'（同句给两个口径且通常同值——NVDA「GAAP and
// non-GAAP gross margins were both 75.0%」，对 GAAP 与非 GAAP 指引都
// 是有效实际值）/ 'non-gaap' / 'gaap' / ''（未限定）。
function gaapBasisOf(prefix) {
  const p = String(prefix || '');
  if (/non-?gaap/i.test(p) && /\bgaap\b/i.test(p.replace(/non-?gaap/gi, ''))) return 'gaap+non-gaap';
  if (/non-?gaap/i.test(p)) return 'non-gaap';
  if (/\bgaap\b/i.test(p)) return 'gaap';
  return '';
}

// [v3.13] 结算用指标族：从**指引句**推导，不从指标名词——名词 'income'
// 分不清净利润与每股（MRVL「GAAP diluted net income per share is
// expected to be $0.37」旧抽取指标名是 income，与实际值侧配不上；且
// 14 字符回扩窗口把句首的 "GAAP" 切掉，口径信息在句子里也丢了）。
// 每股句 → diluted eps；其余按名词族映射，与 earnings-settlement.js
// normalizeMetric 口径一致（双保险）。句匹配优先于 settlement 持久化
// 元数据（后者的 metric 是旧名词级归一），见 project-future 结算层。
function settleMetricOf(sentence, metricNoun) {
  const s = String(sentence || '');
  if (/diluted\s+(?:net\s+)?income\s+per\s+share|(?:diluted\s+)?earnings\s+per\s+(?:diluted\s+)?share|\bEPS\b/i.test(s)) return 'diluted eps';
  const m = String(metricNoun || '').toLowerCase();
  if (/gross\s+margin/.test(m)) return 'gross margin';
  if (/(net\s+|total\s+)?(revenue|revenues|sales)/.test(m)) return 'revenue';
  if (/operating\s+income/.test(m)) return 'operating income';
  if (/operating\s+expenses/.test(m)) return 'operating expenses';
  // [v3.16] capex 族归一（GOOGL live 实证：指引句指标名词是 "CapEx"、
  // 全年实际值族是 "capital expenditures"，两边不归一时期间/区间修好了
  // 也永远配不上——与 v3.13 EPS 族归一同型，残废条目修复的下一环）
  if (/capital\s+expenditures?|\bcapex\b/.test(m)) return 'capital expenditures';
  if (/tax\s+rates?/.test(m)) return 'tax rate';
  return m;
}

// ── [v3.5] 实际值句式（过去时，与指引的 "is expected to be" 对立）────────
// 定位：v3.4 登记了 33 条财报指引、15 条到期未结算——v2.13 核心承诺「到期
// 结算 Brier」对最硬的预测类从未兑现（结算逻辑整个缺失）。业绩发布 EX-99
// 同时含「上一财季实际值」（过去时）与「下一财季指引」（期望时态）；实际值
// 段落是结算指引的唯一对账来源。本组正则只抽**区间/容差可判定**的两个头条
// 指标（revenue / gross margin）——营收无 GAAP/非 GAAP 口径分歧，毛利率在
// GAAP=非 GAAP 时只有一条实际值（NVDA 实测），不同值时自然抽出两条、被
// 结算层「唯一实际值才结算」规则挡掉。EPS/opex 等不抽（GAAP/非 GAAP 歧义
// 或亮点段不 reliably 陈述），留给后续轮次，不硬凑。
// 期间锚：标题句 "Financial Results for Second Quarter Fiscal 2027" 陈述的是
// **已报告财季**，是全文件最权威的期间来源；抽不到标题期间的备案不抽实际值
// （漏报比误报诚实）。三种标题语序都认（for/announces/reports + 前缀/后缀）。
// [v3.5.1] 实测三种标题形态全部不命中、整份备案的实际值抽不出来（结算层
// 因此无对账依据，到期指引永远 pending）：
//   ④ MRVL：「Reports Second Quarter of Fiscal Year 2027 Financial Results」
//      ——"of fiscal **year** 2027"（旧模式 fiscal 后直接接年份，year 单词
//      把全部模式挡掉）；MU：「REPORTS RECORD FISCAL FOURTH QUARTER **AND
//      FISCAL YEAR** 2026 RESULTS」（季度与年份间插 "and fiscal year"）。
//      新增通用「季度词+年份」形态容忍 of/year/and-fiscal-year 填充。
//   ⑤ AMZN：「ANNOUNCES SECOND QUARTER RESULTS」——标题只有季度词没有
//      年份。期间改从正文权威锚取："second quarter ended June 30, 2026"
//      （已报告财季结束日，QUARTER_ENDED_RE，搜索窗放宽到 2500 字符）。
//      同比引用（"compared with second quarter 2025"）不含 ended 日期，
//      天然不命中该锚。
const RESULTS_HEADLINE_RES = [
  /(?:results?|earnings)\s+(?:for|of)\s+(?:the\s+)?(first|second|third|fourth|1st|2nd|3rd|4th)\s+quarter\s+(?:of\s+)?(?:fiscal\s+)?(20\d{2})/i,
  /(?:announces?|reports?|posts?)\s+(?:the\s+)?(first|second|third|fourth|1st|2nd|3rd|4th)\s+quarter\s+(?:of\s+)?(?:fiscal\s+)?(20\d{2})/i,
  /(first|second|third|fourth|1st|2nd|3rd|4th)\s+quarter\s+(?:of\s+)?(?:fiscal\s+)?(20\d{2})\s+(?:results?|earnings)/i,
  // [v3.5.1] 通用形态（兜底，放在特定形态之后——特定形态先匹配）：
  // MRVL「of fiscal year 2027」/ MU「FOURTH-QUARTER AND FULL-YEAR 2026」
  // （live 实证：季度词可带连字符，与年份间可插 "and full-year"）/
  // 裸「Second Quarter 2026」。捕获组保持 1=季度 2=年份（extractActuals
  // 按位置读）。
  /(first|second|third|fourth|1st|2nd|3rd|4th)[\s-]quarter\s+(?:of\s+)?(?:fiscal\s+)?(?:year\s+)?(?:and\s+(?:fiscal\s+|full[\s-])?year\s+)?(20\d{2})/i,
];
// [v3.5.1] 标题无年份时的正文权威锚：已报告财季的结束日期。
const QUARTER_ENDED_RE = /(first|second|third|fourth)\s+quarter\s+ended\s+[A-Za-z]+\s+\d{1,2},\s+(20\d{2})/i;
// [v3.19] 年份前置标题锚（DELL live 实证，见 extractActuals 内注释）：
// 「results for its fiscal 2027 second quarter」——季度词在年份后的
// 标题语序。捕获组 1=年份 2=季度词。
const RESULTS_YEARFIRST_RE = /(?:results?|earnings)\s+for\s+(?:its\s+)?(?:the\s+)?fiscal\s+(20\d{2})\s+(first|second|third|fourth|1st|2nd|3rd|4th)[\s-]quarter/i;
// 营收实际值："reported revenue for the second quarter ended July 26, 2026,
// of $96.2 billion" / 亮点行 "Revenue of $96.2 billion" / "revenue was $X"。
// 指标与数值间的 [^.;]{0,90} 吃掉 "for the ... ended <date>, " 这类插入语；
// 汇总表行 "Revenue $96,221 $81,615" 无 of/was/were 连接，天然不命中。
// [v3.5.1 精度教训] 名词组曾加过 sales 容忍 "Net sales were $X billion"——
// live 实测误配：AMZN 亮点段 bullet 间无句点（strip 后连成一片），90 字符
// gap 从 "Net sales increased 20% year-over-year" 桥接到下一句 "Operating
// income was $27.5 billion"，把营业利润当成了营收。sales 形态因此只认
// **紧邻**句式（无 gap）：ACTUAL_SALES_INCREASED_RE。
// [v3.25] 复数营收（QCOM/NOW live 实证句式族：「quarterly revenues ...」/
// 备案标题 revenues 复数形态）——旧正则只认单数 revenue。
const ACTUAL_REVENUE_RE = new RegExp(
  `\\b(?:record\\s+|total\\s+|net\\s+)?revenues?\\b[^.;]{0,90}?\\b(?:of|was|were)\\s+(?:approximately\\s+)?(\\$\\s?[\\d.,]+\\s*(?:billion|million|bn|m))\\b`, 'i');
// [v3.5.1] "Net sales increased 20% to $200.5 billion"（AMZN live 实证）：
// 亮点 bullet 只给同比增幅+绝对值，没有 of/was/were 连接词。收紧为
// increased+数字%+to **紧邻**形态——容忍间隔会把 AWS 分部的 "net sales
// increased 37%—its fastest growth in 18 quarters—to a $169 billion
// annualized revenue run rate"（年化 run rate，不是季度总量）误当总净销售额。
const ACTUAL_SALES_INCREASED_RE = new RegExp(
  `\\bnet\\s+sales\\s+increased\\s+[\\d.]+\\s*%\\s+to\\s+(\\$\\s?[\\d.,]+\\s*(?:billion|million|bn|m))\\b`, 'i');
// [v3.13] MRVL 亮点 bullet 营收形态："Q2 Net Revenue: $2.739 billion"——
// 冒号连接（无 of/was/were）。2026-10-26 从 SEC 实抓（MRVL
// q227_8kx812026ex-991.htm）：MRVL 亮点段整段是 "X: value" bullet，
// 主模式与 sales-increased 形态都不命中，到期营收指引找不到对账依据。
// 精度：冒号紧跟名词（只容忍空白）、值紧跟冒号；取第一个匹配——总量
// 惯例在最前（与主模式同一首匹配纪律，分部营收 bullets 在后不取）。
const ACTUAL_REVENUE_COLON_RE = new RegExp(
  `\\b(?:record\\s+|total\\s+|net\\s+)?revenue\\s*:\\s*(?:approximately\\s+)?(\\$\\s?[\\d.,]+\\s*(?:billion|million|bn|m))\\b`, 'i');
// [v3.20] PLTR grew-to 营收实际值形态。live 实证（2026-10-27 实抓
// 0001321655-26-000026/000039 亮点段逐字）：
//   「• Revenue grew 85% year-over-year and 16% quarter-over-quarter
//     to $1.633 billion」（05-04，Q1 2026 实际值）
//   「• Revenue grew 93% year-over-year and 19% quarter-over-quarter
//     to $1.935 billion」（08-03，Q2 2026 实际值）
// 增长动词+同比%+to+绝对值，无 of/was/were 连接词（主模式不命中）、
// 无冒号（colon 形态不命中）、无 increased（AMZN 紧邻形态不命中）。
// PLTR 三份备案 actuals 全为 0——form H 同轮进库的 Q1/Q2 2026 区间
// 指引找不到对账依据（v3.13「卡点在实际值侧而非指引侧」同型）。
// 精度：① 名词与 grew 紧邻、grew 与数值间 [^.;$]{0,80}（不过句读、
//    不过美元符号、不过 bullet——不能桥到下一句/下一 bullet 的值
//    （v3.5.1 AMZN 宽 gap 教训；live 亮点段 bullet 间无句点，不排除
//    • 时「Revenue grew 85% year-over-year」会桥接到下一 bullet 的
//    "to $5.0 billion"，精度夹具钉住）；
//    ② 分部守卫 lookbehind：bullet 后名词前有 1-3 个限定词即拒绝——
//    live 实证三条分部行在总营收句之前：「◦ U.S. revenue grew 104%
//    … to $1.282 billion」「◦ U.S. commercial revenue grew 133% … to
//    $595 million」「• U.S. government revenue grew 84% … to $687
//    million」（AMZN 分部行 lookbehind 同型，v3.5.1/v3.13）；
//    ③ 财季路径取第一个匹配——Q4 备案的 FY 亮点段（「• Revenue grew
//    56% year-over-year to $4.475 billion」）在本财季句之后，先到即
//    本财季（v3.13 既定纪律；该 FY 句无 full-year 相邻标记不被守卫
//    挡住，顺序是唯一防线，与 NVDA「先本季后全年」同型）。
const ACTUAL_REVENUE_GREW_RE = new RegExp(
  `(?<![•◦]\\s+(?:[A-Za-z][\\w.-]*\\s+){1,3})\\b(?:record\\s+|total\\s+|net\\s+)?revenue\\s+grew\\s+[\\d.]+\\s*%[^.;$•]{0,80}?\\bto\\s+(\\$\\s?[\\d.,]+\\s*(?:billion|million|bn|m))\\b`, 'i');
// 毛利率实际值："GAAP and non-GAAP gross margins were both 75.0%" /
// "GAAP gross margin was 52.1%"。取第一个（若 GAAP 与非 GAAP 不同值会抽出
// 两条，由结算层唯一性规则挡掉）。
const ACTUAL_MARGIN_RE = new RegExp(
  `\\bgross\\s+margins?\\b[^.;]{0,50}?\\b(?:was|were)\\s+(?:both\\s+|approximately\\s+)?([\\d.]+\\s*%)`, 'i');
// [v3.13] 全年值守卫：财季备案的亮点段同时陈述全年值（NVDA「For fiscal
// 2026, …gross margins were 71.1%」/ MRVL「GAAP net income for fiscal
// 2026 … $3.07 per diluted share」/ AMZN「Operating income increased to
// $80.0 billion in 2025」）。actualPeriod 取标题财季，全年值按财季建 key
// 就是错配——旧 matchAll 把 NVDA 71.1% 全年毛利率混进 FY26Q4 key（该条
// 无 Q4 毛利率指引所以没暴露，corr-2026-030 登记）。判据：匹配点前后
// 窗内的全年期间标记（for fiscal YYYY / for the fiscal year / in YYYY）。
// [v3.19] 名词相邻全年标记（DELL live 实证：「Record full-year revenue
// of $113.5 billion」——2026-02-26 备案标题期间是 FY2026 Q4，全年营收
// 句若进财季 key 就是错事实（corr-2026-034 同型：查找表里躺着错事实；
// 无 Q4 FY2026 营收指引所以不会错结算，但事实是错的）。只认「标记+
// 指标名词」相邻——META Q4 双值句的 "and full year 2025, respectively"
// 在数值之后不相邻，季度值照常收（v3.15 夹具不回归）。
const FULLYEAR_GUARD_RE = /for\s+(?:the\s+)?(?:fiscal\s+year|full[\s-]?year)|for\s+fiscal\s+20\d{2}|\bin\s+(?:19|20)\d{2}\b|\bfull[\s-]?year\s+(?:total\s+|net\s+|record\s+)?(?:revenue|revenues|sales|income|margins?|cash\s+flow|expenditures?|capex|eps)\b/i;
// [v3.13] MRVL 标题 bullet 毛利率实际值：「Q2 Gross Margin: 53.1% GAAP
// gross margin; 58.9% non-GAAP gross margin」——MRVL 亮点段只在这里陈述
// 毛利率实际值（无 was/were 连接词，ACTUAL_MARGIN_RE 整个不命中，到期
// 毛利率指引永远找不到对账依据）。值在前、口径词在后，双列都收。
const ACTUAL_MARGIN_BULLET_RE = /(\d+(?:\.\d+)?)\s*%\s*(non-?gaap|gaap)\s+gross\s+margin/gi;
// [v3.13] 每股收益实际值：口径词 + net income + of/for 连接 + or $X per
// diluted share（MRVL「GAAP net income for the second quarter of fiscal
// 2027 was $308.0 million, or $0.33 per diluted share」；MU「GAAP net
// income of $28.24 billion, or $24.67 per diluted share」——2026-10-26
// 从 SEC 实抓原文）。NVDA「GAAP and non-GAAP earnings per diluted share
// were $2.46 and $2.22」双值句不抽：没有 net income+or 结构，抽出来也
// 无法归属口径（NVDA 也无 EPS 指引，无配对需求）。
const ACTUAL_EPS_RE = /(non-?gaap|gaap)\s+net\s+income\s+(?:of|for)\b(?:(?<=\d)\.(?=\d)|[^.;]){0,170}?or\s+\$([\d.]+)\s+per\s+diluted\s+share/gi;
// [v3.13] 合并营业利润实际值（AMZN live 实证）：「Operating income was
// $27.5 billion, up 43% year-over-year」/「Operating income increased to
// $27.5 billion in the second quarter, compared with $19.2 billion in
// second quarter 2025」。分部行（North America/AWS segment operating
// income）用 lookbehind 挡；全年行由 FULLYEAR_GUARD_RE 挡。
const ACTUAL_OPINC_RE = /(?<!segment\s)operating\s+income\s+(?:increased\s+to|was)\s+\$([\d.]+)\s*(billion|million)/gi;
// [v3.14] META 亮点 bullet 营收实际值：「• Revenue – Revenue was
// $64.60 billion, an increase of 26% year-over-year」。META 的实际值
// 句在亮点 bullet 里、位于汇总表**之后**（live 实测：10-21 备案
// @2088、04-29 @2153，超出 lead=1600 窗口；07-29 @1343 在窗口内所以
// 旧模式抽得到，另两份抽不到——到期营收指引找不到对账依据）。精度：
// 名词+虚线+名词+was+$ 五段紧邻，汇总表行（"Revenue 64,600 51,220"）
// 没有这个结构；搜索窗放到前 8000 字符（bullet 段固定在亮点区），
// 全年值仍由 notFullYear 守卫（Q4 备案「季度 and 全年」双值句取第一个
// =季度值）。
const ACTUAL_REVENUE_BULLET_RE = new RegExp(
  `\\b(?:record\\s+|total\\s+|net\\s+)?revenue\\s*[\\u2013\\u2014-]\\s*(?:record\\s+|total\\s+|net\\s+)?revenue\\s+(?:was|were)\\s+(?:approximately\\s+)?(\\$\\s?[\\d.,]+\\s*(?:billion|million|bn|m))\\b`, 'i');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function get(url, timeoutMs = 25000, maxChars = DOC_MAX_CHARS * 4) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': SEC_UA }, timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
      let d = '';
      res.on('data', (c) => { d += c; if (d.length > maxChars) { req.destroy(new Error('doc too large')); } });
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

/** HTML → 纯文本。数值实体通用解码（&#58; 等），弯引号归一化。 */
function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch (_) { return ' '; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch (_) { return ' '; } })
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/\s+/g, ' ').trim();
}

function loadCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch (_) { /* 缓存损坏就重新抓 */ }
  return null;
}

function saveCache(obj) {
  try {
    const dir = path.dirname(CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(obj), 'utf-8');
  } catch (e) {
    // 写失败必须打印原因——v2.13 教训：静默 catch 会把「缓存从未生成」藏很久
    console.log(`  [WARN] EDGAR 缓存写入失败: ${e.message}`);
  }
}

/** ticker → {cik, title}。每轮刷新抓一次（1 个请求，不建二级缓存——
 *  company_tickers.json 是全量映射（约 700KB），缓存它会让 EDGAR 缓存文件
 *  膨胀一个数量级，收益（省 1 个请求）不抵成本）。 */
async function resolveTickers() {
  const raw = JSON.parse(await get(TICKERS_URL, 30000, 4 * 1024 * 1024));  // 全量映射约 700KB
  const map = {};
  for (const v of Object.values(raw)) {
    if (v && v.ticker) map[String(v.ticker).toUpperCase()] = { cik: String(v.cik_str).padStart(10, '0'), title: v.title };
  }
  return map;
}

/** 取一家公司的近期业绩 8-K（Item 2.02）与财年结束月。 */
async function fetchCompanyFilings(cik) {
  const d = JSON.parse(await get(SUBMISSIONS_URL(cik)));
  const r = (d.filings && d.filings.recent) || {};
  const out = [];
  for (let i = 0; i < (r.form || []).length && out.length < MAX_8K_PER_COMPANY; i++) {
    if (r.form[i] !== '8-K') continue;
    const items = String(r.items[i] || '');
    if (!items.includes('2.02')) continue;   // 只要业绩发布（Results of Operations）
    out.push({
      filingDate: r.filingDate[i],
      accession: r.accessionNumber[i],
      accessionNoDash: String(r.accessionNumber[i]).replace(/-/g, ''),
      items,
      reportDate: r.reportDate[i] || '',
      primaryDocument: r.primaryDocument[i] || '',
    });
  }
  return { fiscalYearEnd: String(d.fiscalYearEnd || '1231'), filings: out };
}

/** 从 8-K 备案目录里挑业绩发布附件：优先 EX-99，兜底最大非主文档 .htm。 */
async function fetchEarningsRelease(cik, filing, primaryDoc) {
  const idx = JSON.parse(await get(INDEX_URL(cik, filing.accessionNoDash)));
  const items = (idx.directory && idx.directory.item) || [];
  const htm = items.filter(f => /\.htm$/i.test(f.name));
  let pick = htm.find(f => /ex(?:hibit)?[-_]?99/i.test(f.name));
  if (!pick) {
    // 兜底：最大的非主文档 .htm（实测 GOOGL 附件名 googexhibit991q22026.htm
    // 能被 EX-99 模式命中；此兜底覆盖命名不规范的附件）
    const cands = htm.filter(f => f.name !== primaryDoc && !/index|r\d+\.htm|report/i.test(f.name))
      .sort((a, b) => Number(b.size || 0) - Number(a.size || 0));
    pick = cands[0];
  }
  if (!pick) return { text: '', docName: '' };
  // 原始 HTML 上限 4MB：业绩发布的 HTML 带大量内联样式，strip 后往往只有
  // 3-6 万字符（实测 MSFT EX-99 raw 远超 480KB、strip 后 33K）——上限必须
  // 按原始体积设，strip 后的上限在 extractGuidance 前另外截。
  const html = await get(DOC_URL(cik, filing.accessionNoDash, pick.name), 25000, 4 * 1024 * 1024);
  return { text: stripHtml(html).slice(0, DOC_MAX_CHARS), docName: pick.name };
}

/**
 * 从业绩发布正文抽指引句（带结构）。
 * @returns {{guidance: Array, outlookText: string}}
 */
function extractGuidance(text) {
  const guidance = [];
  // 三种形态共用一套解析。extendBack：句子向前扩展的字符数（到分句边界
  // 为止）——form A 扩 14 字符吃掉 "Non-GAAP/GAAP" 限定词（实测 AMD
  // "Non-GAAP gross margin is expected..." 丢掉限定词后 GAAP 与非 GAAP
  // 两条指引在句子上无法区分）；form B 扩 90 字符把 "For the third
  // quarter of 2026, AMD" 这段主体包进句子。
  // [v3.13] 表格形态带 isTable 标记：它的抽取句不含口径限定词（列头离
  // 名词一两百字符且不进句子），口径推导必须跳过——不能用引用比较
  // （form.re 是 new RegExp(...) 新对象，与 GUIDANCE_TABLE_RE 永不 ===，
  // 实测第一版修复因此空转，MU 营收指引仍被表头误标 non-gaap）。
  const forms = [
    { re: new RegExp(GUIDANCE_SENTENCE_RE.source, 'gi'), extendBack: 14 },
    { re: new RegExp(GUIDANCE_EXPECTS_RE.source, 'gi'), extendBack: 90 },
    { re: new RegExp(GUIDANCE_TABLE_RE.source, 'gi'), extendBack: 0, isTable: true },
    // [v3.14] META CFO 评论式（动词+间隔+指标+区间标记）。extendBack=0：
    // 期间短语在匹配区内，不需要向前扩展；间隔词≥1 保证与 form B 零重叠。
    { re: new RegExp(GUIDANCE_EXPECTS_GAP_RE.source, 'gi'), extendBack: 0 },
    // [v3.19] 名词式区间（DELL live：无 is/are、名词在前）。extendBack=40：
    // 期间短语在名词前，扩到分句边界包进句子。
    { re: new RegExp(GUIDANCE_NOUN_RANGE_RE.source, 'gi'), extendBack: 40 },
    // [v3.19] 提升式区间（PLTR live：raising...guidance to between，
    // en-dash 分隔）。extendBack=0：期间在句外冒号节头，向前窗解析。
    { re: new RegExp(GUIDANCE_RAISING_RANGE_RE.source, 'gi'), extendBack: 0 },
    // [v3.19] 名词式点值（AVGO/DELL live：名词+guidance of+数值）。
    // extendBack=40：期间短语在名词前（"Fourth quarter fiscal year 2026"）。
    { re: new RegExp(GUIDANCE_NOUN_OF_RE.source, 'gi'), extendBack: 40 },
    // [v3.20] 冒号+bullet 期望式（PLTR live：季度指引 bullet 在
    // "we expect:" 节头后，首 bullet 带动词、后续 bullet 只有名词）。
    // extendBack=0：期间在冒号节头（"For Q1 2026, we expect:"），向前
    // 窗解析（与 form F 同款）。
    { re: new RegExp(GUIDANCE_COLON_BULLET_RE.source, 'gi'), extendBack: 0 },
    // [v3.25] 表格行/无动词区间（QCOM/CSCO/NOW/UBER 四家 live 实证）
    { re: new RegExp(GUIDANCE_RANGE_ROW_RE.source, 'gi'), extendBack: 40 },
    // [v3.25] expect+名词+to be+X% to Y%（SHOP live 实证）
    { re: new RegExp(GUIDANCE_EXPECT_TOBE_RE.source, 'gi'), extendBack: 0 },
    // [v3.25] between-and 两形态（ANET live 实证）
    { re: new RegExp(GUIDANCE_BETWEEN_RE.source, 'gi'), extendBack: 14 },
  ];
  const seen = new Set();
  // [v3.19] 同事实去重集合（期间+指标+数值），见 push 前注释
  const seenFacts = new Set();
  for (const form of forms) {
    let m;
    while ((m = form.re.exec(text)) !== null) {
      let sentence = m[0].trim();
      if (form.extendBack > 0) {
        let from = Math.max(0, m.index - form.extendBack);
        // 窗口起点对齐到词边界：不对齐会切出半截词（实测 MRVL 的
        // "GAAP diluted net income" 被切成 "P diluted net income"）
        while (from < m.index && !/\s/.test(text[from])) from++;
        const back = text.slice(from, m.index);
        const b = Math.max(back.lastIndexOf('. '), back.lastIndexOf('• '), back.lastIndexOf('; '), back.lastIndexOf(': '));
        sentence = (b >= 0 ? back.slice(b + 2) : back) + sentence;
      }
      // 句首杂质：向前扩展可能带进 " and " / 标点——清掉再入产物
      sentence = sentence.replace(/^[\s,;:•]+/, '').replace(/^and\s+/i, '');
      // [v3.14] 多季度指引跳过（META 税率句 live 实证，见 MULTI_PERIOD_RE
      // 注释）：句内期间短语缺季度词，rightmost-wins 会蹭前句指引的期间
      if (MULTI_PERIOD_RE.test(sentence)) continue;
      if (sentence.length < 20 || seen.has(sentence)) continue;
      seen.add(sentence);
      // 财季期间：向前窗 500 字符内全部模式匹配，按位置就近取胜。
      // 两个实测踩过的坑：
      // ① 窗口必须**含指引句本身**——全年指引的期间就在句子里（"For
      //    fiscal year 2027, we now expect..."），锚词 expect 在句内，
      //    窗口截止到句首时 annual 模式永远匹配不到（实测 Oracle 全年
      //    指引被错配成句前的 "Q2 FY2026" 历史引用）。
      // ② 每个模式要取**最右（最近）匹配**，不是最左——同一模式在窗口
      //    里可能命中多次（段落头部一次、历史引用一次），最左的那个常是
      //    最不相关的。
      let quarter = null; let fiscalYear = null; let periodPhrase = '';
      const matchEnd = m.index + m[0].length;
      const winFrom = Math.max(0, m.index - 500);
      const before = text.slice(winFrom, matchEnd);
      let bestPos = -1;
      let annual = false;
      // annual 形态只有 1 个捕获组（年份）；季度形态 1=季度 2=年份
      const readPeriod = (p, pm) => {
        // [v3.19] 两位财年展开（DELL live 实证 "Second-quarter FY27"）：
        // 既有形态全部捕获四位年份不受影响；<100 的是两位形态，+2000。
        const yr = (y) => { const n = Number(y); return n < 100 ? n + 2000 : n; };
        if (ANNUAL_PERIOD_SET.has(p)) { annual = true; quarter = null; fiscalYear = yr(pm[1]); }
        else { annual = false; quarter = QWORD[String(pm[1]).toLowerCase()] ?? Number(pm[1]); fiscalYear = yr(pm[2]); }
        periodPhrase = pm[0].trim();
      };
      // ③ 句内的**同比/对比引用**不是本指引期间——"compared with third
      //    quarter 2025"（Amazon 实测：句内同比增长对比比段头更近，纯就近
      //    会拿到去年同期）、"excluding a one-time gain from Q2 FY2026"
      //    （Oracle 实测：句内历史引用）。判据：期间短语前 20 字符内出现
      //    对比标记（compared with/to/versus/against、vs、from、than）即跳过。
      // 两组判据：① 对比标记词（compared with / from / than…）；
      // ② 金额+可选 in 结尾（"compared with $17.4 billion in third quarter
      //    2025"——Amazon 实测：金额后紧跟的期间是同比对象）。漏判只会
      //    漏采（期间 null 不可结算），误判才会污染结算点，故从紧。
      // [v3.25] 金额分支的 in 改为**必填**：CSCO live 实证「GAAP $1.08 to
      // $1.10 ... FY 2027 Guidance」表格行——上一行 EPS 区间的尾值 "$1.10 "
      // 被旧正则（in 可选）当成「金额后跟同比期间引用」，把下一行的 FY2027
      // Guidance 节头挡掉，全年指引错配成 Q1。原设计意图（v3.4 Amazon 实测
      // 「compared with $17.4 billion in third quarter 2025」）本就有 in；
      // 无 in 的金额+期间共现是表格邻行不是同比引用。对比词分支不变。
      const COMPARE_BEFORE = /(?:(?:compared\s+(?:with|to|versus|against)|versus|vs\.?|from|than)\s+|\$\s?[\d.,]+\s*(?:billion|million|bn|m)?\s+in\s+)$/i;
      for (const p of PERIOD_PATTERNS) {
        const g = new RegExp(p.source, 'gi');
        let pm; let last = null;
        while ((pm = g.exec(before)) !== null) {
          const pre = before.slice(Math.max(0, pm.index - 20), pm.index);
          if (COMPARE_BEFORE.test(pre)) continue;
          last = pm;
        }
        if (last && last.index > bestPos) { bestPos = last.index; readPeriod(p, last); }
      }
      if (!fiscalYear) {
        // 向前窗没有（指引句在期间标题之前）：全文找第一个
        for (const p of PERIOD_PATTERNS) {
          const pm = text.match(p);
          if (pm) { readPeriod(p, pm); break; }
        }
      }
      // [v3.25] 指标名词/值/容差全部从**匹配自身** m[0] 取，不从 extendBack
      // 后的 sentence 取：表格行 strip 后单元格间无句点（CSCO live 实测
      // 「$18.0 billion - $18.2 billion Non-GAAP gross margin 65% - 66%」
      // 连成一片），40 字符回扩把前一单元格的名词与值桥进句子——
      // sentence.match 取到的是邻居的名词与值（operating margin 行的
      // metric 变成 gross margin、value 变成营收区间，结算时判假 miss）。
      // 所有 form 的 m[0] 都自带完整值结构（form A 尾部 NUM_OR_TERM
      // {0,160}、form J/K/L 匹配即到值末）；sentence 仍用于存储、期间
      // 解析与口径推导（nounIdx 按 m[0].indexOf 定位，与 m0 一致）。
      const m0 = m[0];
      // 指标/数值/容差/区间
      // [v3.25] 指标名词从 m[0] 取（与 rangeM 同源修复）：表格行 strip 后
      // 单元格间无句点，extendBack 回扩把上一格的名词带进句子（CSCO live
      // 实测 operating margin 行的句子前缀是 "gross margin 65% - 66% Non-
      // GAAP "），sentence.match 取到邻居的名词——metric 错配会让幂等 id、
      // settleMetric 与结算 key 全歪。nounIdx 用 m[0].indexOf 定位，一致。
      const metricM = m0.match(new RegExp(METRIC_NOUNS, 'i'));
      // [v3.13] 口径标记从**原文**指标名词前的限定词推导：GUIDANCE_SENTENCE_RE
      // 与表格形态的 m[0] 以名词开头（nounIdx=m.index），expects 在前形态
      // 名词在句内（indexOf 定位）。不从 sentence 推——14 字符回扩窗口会把
      // "GAAP and non-GAAP" 切成 "non-GAAP"（NVDA 实测），口径信息在句子里
      // 已经丢了，原文里还在。
      const nounIdx = metricM
        ? m.index + Math.max(0, m[0].toLowerCase().indexOf(metricM[0].toLowerCase()))
        : -1;
      // 表单调取句（GUIDANCE_TABLE_RE）不带口径限定词——列头（"GAAP (1)
      // Outlook Non-GAAP (2) Outlook"）离名词一两百字符且不进句子，从
      // 回看窗推会抓到列头（MU 实测营收指引被误标 non-gaap）。表格形态
      // 一律未限定：结算层查裸 key，多值判歧义（MU EPS 双列即此形态）。
      const gaapBasis = (nounIdx >= 0 && !form.isTable)
        ? gaapBasisOf(text.slice(Math.max(0, nounIdx - 30), nounIdx))
        : '';
      const rangeM = m0.match(/between\s+\$?\s?([\d.,]+)\s*(billion|million|%)?\s+and\s+\$?\s?([\d.,]+)\s*(billion|million|%)?/i)
        || m0.match(/([\d.]+)\s*%\s+to\s+([\d.]+)\s*%/i)
        // [v3.14] 连字符美元区间（META live）：「in the range of $73-76
        // billion」两端同单位（billion 只写一次，不吃进来单位就丢）
        // [v3.16] 分隔符泛化为连字符或 to（GOOGL live 实证：「in the
        // range of $175 to $185 billion」——X-to-Y 形态旧正则整个不命中，
        // value 退化成点值 $175、无容差不可结算）；首侧补可选单位
        //（"$175 million to $1 billion" 两端不同单位时各折各的）
        || m0.match(/in\s+the\s+range\s+of\s+\$?\s?([\d.,]+)\s*(?:million|billion)?\s*(?:[-–]|\bto\b)\s*\$?\s?([\d.,]+)\s*(billion|million)/i)
        // [v3.14] 单百分号区间（META live）：「between 15-17%」（旧 % 区间
        // 正则要求两端都有 %，单 % 形态整个不命中）
        || m0.match(/between\s+([\d.]+)\s*[-–]\s*([\d.]+)\s*%/i)
        // [v3.19] between + en-dash 美元区间（PLTR live 实证：「to
        // between $8.150 – $8.158 billion」——旧 and / in the range of /
        // 单百分号三种区间语法全部不命中，value 退化成点值 $8.150、
        // 无容差不可结算）。与 earnings-settlement.js parseRange 同轮
        // 同构新增（v3.16 教训：两边正则必须一起改）。
        || m0.match(/between\s+\$?\s?([\d.,]+)\s*(?:million|billion)?\s*[–-]\s*\$?\s?([\d.,]+)\s*(billion|million)/i)
        // [v3.25] 裸区间（无 between / 无 in the range of）：QCOM「$9.7B -
        // $10.5B」/ CSCO「$18.0 billion to $18.2 billion」/ NOW「$4,245 -
        // $4,255」/ UBER「of $0.84 to $0.88」。与 form J 同构、与结算侧
        // parseRange mBareUsd 同轮同构（v3.16 教训：两侧必须一起改）。
        || m0.match(/\$\s?[\d.,]+\s*(?:million|billion|bn|B|M)?\s*(?:[-–—]|\bto\b)\s*\$?\s?[\d.,]+\s*(?:million|billion|bn|B|M)?/i)
        // [v3.25] between approximately + 连字符 %（ANET live 实证：
        // 「gross margin between approximately 62-63%」）
        || m0.match(/between\s+approximately\s+([\d.]+)\s*[–-]\s*([\d.]+)\s*%/i)
        // [v3.25] 尾 % 区间（首值无 %）——ANET「operating margin of 48 -
        // 49%」/ CSCO「Non-GAAP gross margin 65% - 66%」live 实证：区间
        // 符号只写一次、% 只写尾侧。旧链只有 X% to Y%（to only），连字符
        // 形态整个不命中。
        || m0.match(/([\d.]+)%?\s*[-–—]\s*([\d.]+)\s*%/i);
      const valueM = m0.match(/\$\s?[\d.,]+\s*(?:billion|million|bn|tn|trillion)?/i)
        || m0.match(/[\d.]+\s*%/) || m0.match(/[\d.]+\s*basis points/i);
      const tolM = m0.match(/(?:\+\/-|±|plus or minus)\s*(\$?\s?[\d.,]+\s*(?:%|billion|million|basis points|bps)?)/i);
      // 前提削减：指引句之后 300 字符内的限定句（实测 NVIDIA 的
      // "NVIDIA is not assuming any Data Center compute revenue from China"
      // 就写在指引句后面一句）。matchEnd 已在上面期间匹配处算好。
      const caveats = [];
      const after = text.slice(matchEnd, matchEnd + 300);
      for (const s of after.split(/(?<=[.!?])\s+/)) {
        if (CAVEAT_RE.test(s) && s.length < 300) caveats.push(s.trim());
      }
      // [v3.19] 同（期间,指标,数值）去重：见上方注释。口径差异以首条
      // 为准（不同值时数值不同，key 天然分开）。
      // [v3.25] 语义归一：同一条指引的两种句式（MRVL live 实证「is
      // expected to be 52.9% to 53.9%」form A 与表格行「52.9% - 53.9%」
      // form J）value 文本不同、事实相同——旧 seenFacts 按文本去重不去，
      // 重复登记两个义务。归一：去空白、区间分隔符统一为 to（-\u2013\u2014
      // 与 and 同义）、小写。
      const factKey = `${fiscalYear}|${quarter}|${annual}|${metricM ? metricM[0].toLowerCase() : ''}|${(rangeM ? rangeM[0] : (valueM ? valueM[0] : '')).replace(/\s+/g, '').replace(/[-\u2013\u2014]/g, 'to').replace(/and/gi, 'to').toLowerCase()}`;
      if (seenFacts.has(factKey)) continue;
      seenFacts.add(factKey);
      guidance.push({
        sentence,
        metric: metricM ? metricM[0].toLowerCase() : null,
        // [v3.13] 结算配对字段：口径标记 + 指标族（句推导）。不进 metric——
        // metric 是登记 id 的幂等维度之一（同备案多指引靠 metric+value
        // 区分），改它会让旧条目换 id 重复登记。
        gaapBasis,
        settleMetric: settleMetricOf(sentence, metricM ? metricM[0] : null),
        // [v3.25] value/tolerance 落账前 trim：GUIDANCE_TABLE_RE 尾部的
        // \s*（单位组前）会把值后的空格吃进 m[0]（"…± $1.00 "），m0 不经
        // sentence 的 trim——tolM 组内 \s* 同样吃掉尾空格，旧行为在已
        // trim 的 sentence 上匹配所以没暴露（v3.13 MU 夹具 tolerance
        // "$1.00 " 精确相等断言失败，live 实证）。
        // [v3.25] 去尾部标点：form G 的 [\d.,]+ 把 "$25.50," 的逗号吃进
        // value（DELL 一句双 EPS live 实证）、form L 的 m[0] 吃进句点
        // （"between $1.06 and $1.08."）——trim 只去空白，标点显式剥。
        value: rangeM ? rangeM[0].replace(/\s+/g, ' ').trim().replace(/[,;:.]+$/, '') : (valueM ? valueM[0].replace(/\s+/g, ' ').trim().replace(/[,;:.]+$/, '') : null),
        isRange: !!rangeM,
        tolerance: tolM ? tolM[1].replace(/\s+/g, ' ').trim().replace(/[,;:.]+$/, '') : null,
        quarter, fiscalYear,
        periodPhrase: periodPhrase || null,
        annual: !!annual,
        periodLabel: fiscalYear && quarter ? `FY${fiscalYear} Q${quarter}` : (fiscalYear && annual ? `FY${fiscalYear} 全年` : null),
        caveats,
      });
      if (guidance.length >= 10) break;   // [v3.25] 每份发布最多 10 条指引
      // （CSCO live 实测 9 条/备案——Q1+全年两组 Revenue/EPS；旧上限 6 把
      // FY 全年指引整批切掉）
    }
    if (guidance.length >= 10) break;
  }
  // outlook 窗口：第一处 outlook/guidance 标题起 BODY_WINDOW_CHARS 字符，
  // 供通用抽取层与时间轴层使用
  const om = text.match(/(outlook|guidance)/i);
  const outlookText = om
    ? text.slice(Math.max(0, om.index - 100), om.index + BODY_WINDOW_CHARS)
    : text.slice(0, 2000);
  return { guidance, outlookText };
}

/**
 * [v3.5] 从业绩发布正文抽「已报告财季」的实际值（营收 / 毛利率，过去时）。
 *
 * 与 extractGuidance 的分工：后者抽「下一财季指引」（is expected to be，
 * 未来时），本函数抽「本财季实际值」（was/were/of，过去时）——同一份 EX-99
 * 里两者并存，实际值是指引到期时的对账依据。
 *
 * 期间取自标题句（RESULTS_HEADLINE_RES）："Financial Results for Second
 * Quarter Fiscal 2027" 陈述的是已报告财季，是全文件最权威的期间锚；标题
 * 无年份的形态（AMZN）回退正文 "quarter ended <date>" 锚；两者都抽不到
 * 就返回空 actuals——没有期间的数值无法与指引配对，漏报比误报诚实。
 *
 * 指标覆盖（v3.5 起两个头条 + v3.13 扩三个）：营收/毛利率（was 与
 * MRVL bullet 两形态）/ 每股收益（diluted eps，MRVL+MU 两形态）/ 合并
 * 营业利润（operating income，AMZN）。理由：v3.5.1 台账实测 18 条到期
 * 未结算指引里 8 条是 opex/税率/EPS/营业利润——「只抽营收+毛利率」
 * 是当时写死的已知边界，本轮按 live 实证推进（opex/税率实际值在备案
 * 亮点段无可直读句子或无容差指引，仍留边界，见 SKILL.md）。
 * [v3.13] 每条实际值带 gaapBasis 口径标记，且每（指标族,口径）只收第一个
 * （全年值不混进财季 key，corr-2026-030）。metric 用规范名（revenue /
 * gross margin / diluted eps / operating income），与指引侧 settleMetric
 * 和 earnings-settlement normalizeMetric 对齐。
 *
 * @returns {{quarter: number|null, fiscalYear: number|null, actuals: Array<{metric:string, value:string}>}}
 */
function extractActuals(text) {
  const t = String(text || '');
  const head = t.slice(0, 400);
  let quarter = null;
  let fiscalYear = null;
  for (const re of RESULTS_HEADLINE_RES) {
    const m = head.match(re);
    if (m) { quarter = QWORD[String(m[1]).toLowerCase()] ?? Number(m[1]); fiscalYear = Number(m[2]); break; }
  }
  // [v3.5.1] 标题句无年份形态（AMZN "ANNOUNCES SECOND QUARTER RESULTS"）：
  // 到正文前 2500 字符找 "second quarter ended June 30, 2026" 权威锚。
  // 只认 ended+日期 结构——同比引用（"compared with second quarter 2025"）
  // 没有 ended 日期，天然不命中；报告期结束日是对「已报告哪个财季」最
  // 明确的陈述，不是推测。
  // [v3.19] 年份前置标题形态（DELL live 实证，2026-10-27 实抓
  // 0001571996-26-000039/000021/000003）：「announces financial results
  // for its fiscal 2027 second quarter and provides guidance for its
  // fiscal 2027 third quarter and full year」——RESULTS_HEADLINE_RES
  // 四种形态全部要求季度词在年份前，DELL 标题句是年份在前，期间抽不到、
  // actuals 整个返回空：Q1/Q2 FY27 区间指引本可结算（对账依据就是
  // 下一期备案亮点段的 "Record revenue of $47.0 billion"，ACTUAL_
  // REVENUE_RE 的 record 前缀 v3.4 起就容忍），却因期间锚缺失永远
  // pending。捕获组 1=年份 2=季度词（与 RESULTS_HEADLINE_RES 的
  // 1=季度 2=年份相反，单独赋值不经 readPeriod）。
  if (!fiscalYear || !quarter) {
    const m = head.match(RESULTS_YEARFIRST_RE);
    if (m) { fiscalYear = Number(m[1]); quarter = QWORD[String(m[2]).toLowerCase()] ?? Number(m[2]); }
  }
  if ((!fiscalYear || !quarter) && QUARTER_ENDED_RE) {
    const m = t.slice(0, 2500).match(QUARTER_ENDED_RE);
    if (m) { quarter = QWORD[String(m[1]).toLowerCase()] ?? Number(m[1]); fiscalYear = Number(m[2]); }
  }
  if (!fiscalYear || !quarter) return { quarter: null, fiscalYear: null, actuals: [] };
  const lead = t.slice(0, 1600);   // 亮点段：实际值在开头陈述，避开汇总表多列数字
  const actuals = [];
  // [v3.13] 每（指标族, 口径）只收**第一个**匹配：亮点段先陈述本财季、
  // 全年段落在后（NVDA「For the quarter…75.0%」先于「For fiscal 2026…
  // 71.1%」），先到即本财季。GAAP 与非 GAAP 是不同口径、都收（v3.13 起
  // 按口径分 key 配对，不再一律判歧义）；同口径重复陈述（AMZN 亮点行与
  // bullet 都给 $27.5B）去重。
  const seen = new Set();
  const push = (family, basis, value) => {
    const v = String(value).replace(/\s+/g, ' ');
    const k = `${family}|${basis}`;
    if (seen.has(k)) return;
    seen.add(k);
    actuals.push({ metric: family, value: v, gaapBasis: basis });
  };
  // 句子边界（句点/分号+空白；小数点后是数字，天然不是边界）。守卫窗口
  // 前后各截到边界：向前最多 40 字符、向后最多 80 字符，不跨句——跨句会
  // 把**下一句**的全年标记（"…respectively. For fiscal 2026, …"）算到
  // 本财季值头上（NVDA 02-25 实测：季度毛利率 75.0% 被误杀，corr-2026-030
  // 修复过程的第二轮实测）。
  const notFullYear = (m, hay = lead) => {
    const fwd = /[.;]\s/g; fwd.lastIndex = m.index;
    const f = fwd.exec(hay);
    const winEnd = Math.min(f ? f.index + 1 : hay.length, m.index + 80);
    let start = Math.max(0, m.index - 40);
    start = Math.max(start, hay.lastIndexOf('. ', start) + 2, hay.lastIndexOf('; ', start) + 2, 0);
    return !FULLYEAR_GUARD_RE.test(hay.slice(start, winEnd));
  };
  // 营收取**第一个**匹配：总收入惯例上在亮点段最前（"Revenue of $96.2B"），
  // 且营收无 GAAP/非 GAAP 分歧——取第一个即总收入，后面的分部营收
  // （"Data Center revenue of $89.0B"）不取，避免把分部当总量。
  // [v3.15] 三个营收形态全部补 notFullYear 全年值守卫（旧代码只有毛利率/
  // EPS/营业利润三条路径过守卫，营收主路径不过）：AMD Q4-FY2025 live 实证
  // 「For the full year 2025, AMD reported record revenue of $34.6 billion」
  // 的**全年**营收被当成财季实际值索引进 (AMD|2025|4|revenue)——该条无
  // Q4 营收指引所以没造成错结算，但查找表里躺着错事实。全年值由
  // extractAnnualActuals 收（v3.15 同轮新增），财季 key 只收财季值。
  const rv = lead.match(ACTUAL_REVENUE_RE);
  if (rv && notFullYear(rv)) push('revenue', '', rv[1]);
  else {
    // [v3.5.1] AMZN 形态兜底："Net sales increased 20% to $200.5 billion"
    // （无 of/was/were 连接词，主模式不命中）。紧邻形态，见上方精度注释。
    // [v3.15] 全年值守卫同上（AMZN 全年段 "Net sales increased 12% to
    // $716.9 billion in 2025" 同型，live 实证）。
    const rv2 = lead.match(ACTUAL_SALES_INCREASED_RE);
    if (rv2 && notFullYear(rv2)) push('revenue', '', rv2[1]);
    else {
      // [v3.13] MRVL bullet 冒号形态（"Net Revenue: $2.739 billion"）
      const rv3 = lead.match(ACTUAL_REVENUE_COLON_RE);
      if (rv3 && notFullYear(rv3)) push('revenue', '', rv3[1]);
      else {
        // [v3.14] META 亮点 bullet 形态（"Revenue – Revenue was $64.60
        // billion"）：实际值句在汇总表之后、超出 lead=1600 窗口，搜索窗
        // 放到前 8000 字符；全年值守卫同链（hay 传宽窗，m.index 相对宽窗）
        const wide = t.slice(0, 8000);
        const rv4 = wide.match(ACTUAL_REVENUE_BULLET_RE);
        if (rv4 && notFullYear(rv4, wide)) push('revenue', '', rv4[1]);
        else {
          // [v3.20] PLTR grew-to 形态（"Revenue grew 85% ... to $1.633
          // billion"）：四个旧营收形态全部不命中时的最后兜底。见
          // ACTUAL_REVENUE_GREW_RE 注释（分部守卫 + 先到即本财季）。
          const rv5 = lead.match(ACTUAL_REVENUE_GREW_RE);
          if (rv5 && notFullYear(rv5)) push('revenue', '', rv5[1]);
        }
      }
    }
  }
  // 毛利率 was/were 形态：**全部**匹配（GAAP 与非 GAAP 不同值时两条都留），
  // 口径标记取匹配点前 30 字符的限定词（"GAAP and non-GAAP gross margins
  // were both 75.0%" → gaap+non-gaap；"Non-GAAP gross margin was 57.5%"
  // → non-gaap）。用 matchAll（global）——单 match 只取第一个会把歧义吞掉。
  const mgnRe = new RegExp(ACTUAL_MARGIN_RE.source, 'gi');
  for (const m of lead.matchAll(mgnRe)) {
    if (!notFullYear(m)) continue;
    push('gross margin', gaapBasisOf(lead.slice(Math.max(0, m.index - 30), m.index)), m[1]);
  }
  // [v3.13] MRVL 标题 bullet 毛利率形态（was/were 连接词不存在的公司）
  for (const m of lead.matchAll(ACTUAL_MARGIN_BULLET_RE)) {
    push('gross margin', gaapBasisOf(m[2]), m[1] + '%');
  }
  // [v3.13] 每股收益实际值（MRVL/MU 两种连接形态）
  for (const m of lead.matchAll(ACTUAL_EPS_RE)) {
    if (!notFullYear(m)) continue;
    push('diluted eps', gaapBasisOf(m[1]), '$' + m[2]);
  }
  // [v3.13] 合并营业利润实际值（AMZN）
  for (const m of lead.matchAll(ACTUAL_OPINC_RE)) {
    if (!notFullYear(m)) continue;
    push('operating income', '', '$' + m[1] + ' ' + m[2]);
  }
  // [v3.15] 全年实际值（Q4 备案「季度+全年」双值句的全年值 + 单值全年句）：
  // 与上面的财季抽取完全分离——财季路径的全年守卫把全年句滤掉，全年路径
  // 只收带全年期间标记的句子。见 extractAnnualActuals 注释。
  // [v3.17] quarter 透传：表格式 capex 仅 Q4 备案收（Q1-Q3 的 Twelve
  // Months Ended 是 TTM 列，AMZN Q1 live 实证）。
  const annualActuals = extractAnnualActuals(t, { fiscalYear, quarter });
  return { quarter, fiscalYear, actuals, annualActuals };
}

/**
 * [v3.15] 从备案正文抽**全年实际值**（财年口径，供全年指引到期结算）。
 *
 * 为什么需要：v3.14 把 META FY2026 全年费用/capex 区间指引登记进台账
 * （dueOn 2027-02-14），但 extractActuals 只抽财季实际值、且 FULLYEAR_
 * GUARD 主动把全年句滤掉——全年指引永远找不到对账依据，「到期结算」
 * 对全年类指引从未覆盖。台账 9 条 annual=true 全年指引（META FY2026
 * 费用/capex×6 + NVDA FY2027 全年税率×3，live 台账实证）全部压在这个
 * 能力上；ORCL FY2027 全年营收×2 同年登记（无持久化 settlement，按全年
 * 句反推），GOOGL FY2026 capex 是被错记成 FY2025Q4 的残废条目（年份在
 * 名词前的全年形态不命中，下轮候选）。
 *
 * live 实证（2026-10-27 从 SEC EDGAR 实抓原文驱动，六家 Q4 备案）：
 *   ① META Q4-2025（0001628280-26-003832）：「Total costs and expenses
 *      were $35.15 billion and $117.69 billion, ... for the fourth
 *      quarter and full year 2025, respectively.」——双值句，季度在前
 *      全年在后，全年值=第二个（revenue / capital expenditures 同型；
 *      SKILL.md v3.14 边界里的 "were $22.14 billion and $72.x billion"
 *      就是 capex 那句）
 *   ② NVDA Q4-FY2026：「For fiscal 2026, revenue was $215.9 billion」
 *      ——单值全年句（句内无季度标记）
 *   ③ AMD Q4-FY2025：「For the full year 2025, AMD reported record
 *      revenue of $34.6 billion, gross margin of 50%, operating income
 *      of $3.7 billion, ... diluted earnings per share of $2.65.」
 *      ——一句多指标，名词+of+值
 *   ④ MRVL Q4-FY2026：「Net revenue for fiscal 2026 was $8.195
 *      billion」+「GAAP net income for fiscal 2026 was $2.670
 *      billion, or $3.07 per diluted share」（非 GAAP 同型）
 *   ⑤ AMZN Q4-FY2025：「Net sales increased 12% to $716.9 billion in
 *      2025, compared with $638.0 billion in 2024.」——值在前年份在尾，
 *      同比从句先剥掉（先出现的值才是全年值；Operating income 同型）
 *   （MU Q4-FY2026 也有双值句但指标是 free cash flow，不在结算指标族
 *    内，不收——没有配对需求。）
 *
 * 精度纪律（漏报比误报诚实，全部有测试钉住）：
 *   ① 句内全年标记的年份必须等于备案标题财年（Q4 备案刚结束的财年）
 *      ——同比从句（in 2024）与其它年份的句子天然被挡
 *   ② 含季度标记的句子只走双值形态（季度在前、全年标记在后，取第二个
 *      值）；不含季度标记的走单值形态——季度实际值句（"Net revenue
 *      for the fourth quarter of fiscal 2026 was $2.219 billion"）
 *      与亮点标题句（"Fourth Quarter and Fiscal 2026 • Record
 *      quarterly revenue of $68.1 billion"）都不会被当全年
 *   ③ 指引句（expect/anticipate ... to be）不是实际值：未来时态守卫
 *   ④ 双百分号 respectively（"GAAP and non-GAAP gross margins were
 *      71.1% and 71.3%, respectively"）无法归属口径，整句跳过（NVDA
 *      全年毛利率 live 实证）——错归口径比漏报危险
 *   ⑤ FCF / net income 等无结算指引的指标族不收
 *
 * @param {string} text 备案正文（stripHtml 后）
 * @param {{fiscalYear: number|null}} headline 标题句解析出的已报告财年
 * @returns {Array<{metric:string, value:string, gaapBasis:string}>} 全年实际值
 */
// 全年期间标记：for (the) (fiscal year|full year|fiscal) [fiscal] [of] YYYY
// （NVDA "for fiscal 2026" / AMD "for the full year 2025" / MU "for the
// full year of 2026" / NVDA 指引 "for the full year fiscal 2027"）+
// 裸 "full year YYYY"（META 双值句 "…and full year 2025, respectively"
// 的年份在 full year 之后、前面没有 for）+ 尾部 "in YYYY"（AMZN 全年段
// "…to $716.9 billion in 2025"）。季度句的 "for the fourth quarter of
// fiscal 2026" 不命中任何分支（for 后不是 fiscal/full year）。
const ANNUAL_MARKER_RE = /for\s+(?:the\s+)?(?:fiscal\s+year|full[\s-]?year|fiscal)\s*(?:fiscal\s+)?(?:of\s+)?(20\d{2})|\bfull\s+year\s+(20\d{2})\b|\bin\s+(20\d{2})\b/gi;
// 季度标记（句内含季度词的句子只走双值形态，不走单值形态）
const ANNUAL_QUARTER_MARK_RE = /(?:first|second|third|fourth|1st|2nd|3rd|4th)[\s-]?quarter|\bQ[1-4]\b/i;
// 未来时态守卫：期望/指引句不是实际值（META "We expect full year 2026
// total expenses to be in the range of…" / NVDA outlook 段 / AMZN 指引段）
const ANNUAL_FUTURE_RE = /\b(?:expects?|anticipates?|projects?|forecasts?)\b[^.;]{0,90}?\bto\s+be\b|\b(?:is|are)\s+expected\s+to\s+be\b|\bwill\s+be\b/i;
// 双值形态（季度在前全年在后，取第二个值）：META live 三指标
const ANNUAL_DUAL_FORMS = [
  { family: 'revenue', re: /\b(?:record\s+|total\s+|net\s+)?revenue\b[^.;]{0,90}?\b(?:was|were)\s+(?:approximately\s+)?(\$\s?[\d.,]+\s*(?:billion|million|bn|m))\s*,?\s+and\s+(?:approximately\s+)?(\$\s?[\d.,]+\s*(?:billion|million|bn|m))/i },
  { family: 'total expenses', re: /\btotal\s+(?:costs\s+and\s+)?expenses\b[^.;]{0,90}?\b(?:was|were)\s+(?:approximately\s+)?(\$\s?[\d.,]+\s*(?:billion|million|bn|m))\s*,?\s+and\s+(?:approximately\s+)?(\$\s?[\d.,]+\s*(?:billion|million|bn|m))/i },
  { family: 'capital expenditures', re: /\bcapital\s+expenditures?\b[^.;]{0,90}?\b(?:was|were)\s+(?:approximately\s+)?(\$\s?[\d.,]+\s*(?:billion|million|bn|m))\s*,?\s+and\s+(?:approximately\s+)?(\$\s?[\d.,]+\s*(?:billion|million|bn|m))/i },
];
// 单值全年形态（句内无季度标记）：NVDA/MRVL/AMD/AMZN live 实证
// valueFrom: 'g1'=第一组即值 / 'g2'=第二组（or $X per diluted share 形态）
// basisFrom: 'prefix'=从匹配点前 30 字符推 / 'match'=口径词在捕获组里
const ANNUAL_SINGLE_FORMS = [
  { family: 'revenue', re: /\b(?:record\s+|total\s+|net\s+)?revenue\b[^.;]{0,90}?\b(?:of|was|were)\s+(?:approximately\s+)?(\$\s?[\d.,]+\s*(?:billion|million|bn|m))\b/i, valueFrom: 'g1' },
  { family: 'revenue', re: /\bnet\s+sales\s+increased\s+[\d.]+\s*%\s+to\s+(\$\s?[\d.,]+\s*(?:billion|million|bn|m))\b/i, valueFrom: 'g1' },
  { family: 'gross margin', re: /\bgross\s+margins?\b[^.;]{0,50}?\b(?:was|were)\s+(?:both\s+|approximately\s+)?([\d.]+\s*%)/, valueFrom: 'g1', basisFrom: 'prefix' },
  { family: 'gross margin', re: /\bgross\s+margin\s+of\s+([\d.]+\s*%)/i, valueFrom: 'g1' },
  { family: 'operating income', re: /\boperating\s+income\s+(?:increased\s+to|was|of)\s+(\$\s?[\d.,]+\s*(?:billion|million|bn|m))\b/i, valueFrom: 'g1' },
  { family: 'diluted eps', re: /(non-?gaap|gaap)\s+net\s+income\s+(?:of|for)\b(?:(?<=\d)\.(?=\d)|[^.;]){0,170}?or\s+\$([\d.]+)\s+per\s+diluted\s+share/gi, valueFrom: 'g2', basisFrom: 'match' },
  // 值组用 \d+(?:\.\d+)? 不用 [\d.]+：句末 "of $2.65." 的句点会被
  // [\d.]+ 吞进值里（AMD live 实测抽成 "$2.65."，parseMetricValue 解析出错）
  { family: 'diluted eps', re: /\bdiluted\s+(?:net\s+)?(?:income|earnings)\s+per\s+(?:diluted\s+)?share\s+of\s+\$(\d+(?:\.\d+)?)/i, valueFrom: 'g1' },
];
function extractAnnualActuals(text, headline) {
  const t = String(text || '');
  const fy = headline && headline.fiscalYear;
  if (!fy) return [];
  const out = [];
  const seen = new Set();
  const push = (family, basis, value) => {
    const v = String(value).replace(/\s+/g, ' ');
    const k = `${family}|${basis}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ metric: family, value: v, gaapBasis: basis });
  };
  // 全年实际值固定在亮点段（live 实测六家全部在 @600-@3100），扫描窗
  // 取前 8000 字符（与 v3.14 META bullet 营收形态同款宽窗）
  const win = t.slice(0, 8000);
  // 同比从句先剥掉再取年份："compared with $638.0 billion in 2024" 的
  // 2024 不是全年值年份（值本身在从句前，取早出现的那个）
  const sents = win.split(/(?<=[.!?。！？]["'」』]?)\s+/);
  for (const sent of sents) {
    // 同比从句剥除要用小数点容差字符类（NUM_OR_TERM 同款）："compared
    // with $638.0 billion in 2024" 的金额含小数点，[^.;]* 会停在 "638"
    // 把 "0 billion in 2024" 残留下来——年份集合混进 2024，整句被拒
    // （AMZN live 实测第一版全年段抽空即此因）。
    const noCompare = sent.replace(/compared (?:with|to|versus|against)(?:(?<=\d)\.(?=\d)|[^.;])*/gi, ' ');
    // ① 全年期间标记 + 年份必须等于标题财年
    ANNUAL_MARKER_RE.lastIndex = 0;
    let ym; const years = new Set();
    while ((ym = ANNUAL_MARKER_RE.exec(noCompare)) !== null) {
      years.add(Number(ym[1] || ym[2] || ym[3]));
    }
    if (years.size !== 1 || !years.has(fy)) continue;
    const hasQ = ANNUAL_QUARTER_MARK_RE.test(sent);
    if (hasQ) {
      // ② 双值形态：季度在前全年在后，取第二个值
      for (const f of ANNUAL_DUAL_FORMS) {
        const m = sent.match(f.re);
        if (!m) continue;
        push(f.family, gaapBasisOf(sent.slice(Math.max(0, m.index - 30), m.index)), m[2]);
      }
    } else {
      // ③ 单值形态：先过未来时态守卫（指引句不是实际值）
      if (ANNUAL_FUTURE_RE.test(sent)) continue;
      // ④ 双百分号 respectively 无法归属口径，整句跳过毛利率
      const dualPct = /\d+(?:\.\d+)?\s*%\s+and\s+\d+(?:\.\d+)?\s*%/.test(sent);
      for (const f of ANNUAL_SINGLE_FORMS) {
        if (f.family === 'gross margin' && dualPct) continue;
        const g = new RegExp(f.re.source, f.re.flags.includes('g') ? f.re.flags : f.re.flags + 'g');
        let m;
        while ((m = g.exec(sent)) !== null) {
          const basis = f.basisFrom === 'prefix'
            ? gaapBasisOf(sent.slice(Math.max(0, m.index - 30), m.index))
            : (f.basisFrom === 'match' ? gaapBasisOf(m[1]) : '');
          const raw = f.valueFrom === 'g2' ? m[2] : m[1];
          const value = f.family === 'diluted eps' ? '$' + raw : raw;
          push(f.family, basis, value);
          break;   // 每形态取第一个匹配（总量惯例在最前，与财季路径同纪律）
        }
      }
    }
  }
  // [v3.17] 表格式全年 capex 实际值（现金流量表）：v3.16 白纸黑字的已知
  // 边界——GOOGL FY2026 capex 指引（台账 dueOn 2027-02-14）的实际值只在
  // 现金流量表（"Purchases of property and equipment" 行），双值句/全年
  // 标记句两种叙事形态都收不到，FY2026 指引到期时无对账依据。走同一个
  // push()/seen：同一备案叙事形态已收 capital expenditures 族时不重复收
  // （META live 实证：叙事 "Capital expenditures, including principal
  // payments on finance leases, were ... $72.22 billion" 与报表行
  // "(69,691)" 口径不一致——指引句带 finance leases 限定词时叙事值才是
  // 同口径实际值；两个不同值落同一 annual key 会判歧义跳过，把可结算
  // 指引变成跳过比漏报更糟）。
  for (const a of extractAnnualCapexFromTable(t, headline)) push(a.metric, a.gaapBasis, a.value);
  return out;
}

/**
 * [v3.17] 从现金流量表抽**全年 capex 实际值**（表格式陈述）——v3.16 已知
 * 边界「全年实际值形态族不收表格式陈述」的推进。
 *
 * live 实证（2026-10-27 从 SEC EDGAR 实抓四家 Q4 备案原文驱动）：
 *   GOOGL 0001652044-26-000012「CONSOLIDATED STATEMENTS OF CASH FLOWS
 *     (In millions) Quarter Ended December 31, Year Ended December 31,
 *     2024 2025 2024 2025 … Purchases of property and equipment
 *     (14,276) (27,851) (52,535) (91,447)」→ FY2025 = $91.447B
 *   AMD 0000002488-26-000014「…Three Months Ended Year Ended
 *     December 27, 2025 December 28, 2024 December 27, 2025
 *     December 28, 2024 … (222) (208) (974) (636)」→ FY2025 = $974M
 *   MRVL 0001835632-26-000006「…Three Months Ended Year Ended
 *     January 31, 2026 February 1, 2025 January 31, 2026 February 1,
 *     2025 … (114.3) (69.9) (354.1) (284.6)」→ FY2026 = $354.1M
 *   AMZN 0001018724-26-000002「Statements of Cash Flows (in millions)
 *     … Three Months Ended December 31, Twelve Months Ended
 *     December 31, 2024 2025 2024 2025 … (27,834) (39,522)
 *     (82,999) (131,819)」→ FY2025 = $131.819B
 *   NVDA Q4-FY2026 发布不含现金流量表 → 不收（如实漏报）
 *
 * 精度纪律（漏报比误报诚实，v3.0.0c/v3.2/v3.6 同款）：
 *   ① 只认现金流量表区域——标题锚定，capex 行取标题后第一个匹配。
 *      FCF 对账表的 "Less: purchases of property and equipment"
 *      （GOOGL live 实证，5 列含 TTM）与叙事 "purchases of property
 *      and equipment, net of proceeds"（AMZN 亮点段）不是报表行；
 *   ② 表头必须含全年列标记（Year/Twelve Months/Fiscal Year Ended），
 *      且该标记之后不得再有月份数标记（Nine/Six/Three Months
 *      Ended——Q1-Q3 备案的 YTD 列不是全年值；GOOGL Q2 的 "Year To
 *      Date June 30" 连年份标记都不匹配，天然拒绝）；
 *   ③ **仅 Q4 备案**（headline.quarter===4）——live 实证（AMZN
 *      Q1/Q2）：Q1-Q3 备案的 "Twelve Months Ended" 是 **TTM 列**
 *      （AMZN Q1-2026「Three Months Ended March 31, Twelve Months
 *      Ended March 31, 2025 2026 2025 2026」，TTM 列年份 2026 与
 *      标题财年相同！），TTM ≠ 全年——错当月度值会污染 annual key
 *      （AMZN Q1 live：$93.093B/$151.003B 两个 TTM 值之一落在
 *      (AMZN|FY|null|capital expenditures)，与 Q4 备案真全年值撞
 *      key 判歧义）。Q4 备案的 TTM 列按定义等于全年列；
 *   ④ 列对齐由数据行数值个数驱动：4 列（2 季度+2 全年）或 2 列（纯
 *      全年），其它列数不解析（AMZN Q2 live：3M/6M/TTM 六列拒收）；
 *      全年列=后两列，表头年份 token 取与 headline.fiscalYear 相等者
 *      （MRVL FY2026 = Year Ended January 31, 2026，财年标签与日历
 *      年终年同数，live 实证）；
 *   ⑤ 单位只认百万（(In millions)/(Millions)——四家 live 实证），
 *      千分位报表不解析（错标度 1000 倍比漏报危险）；
 *   ⑥ 括号=现金流出取绝对值；≥1000（百万）折算 billion（指引带以
 *      billion 计价，同量纲），否则保留 million——与其它
 *      annualActuals 值格式一致（结算层 parseMetricValue 单位感知）。
 */
const CF_STATEMENT_TITLE_RE = /statements?\s+of\s+cash\s+flows/i;
const CF_YEAR_LABEL_RE = /(?:twelve\s+months?|fiscal\s+year|year)\s+ended/i;
const CF_MONTH_LABEL_RE = /(?:nine|six|three)\s+months?\s+ended/i;
const CF_CAPEX_ROW_RE = /purchases\s+of\s+property\s+and\s+equipment/i;
// 年份 token 带边界保护：数据行的 "26,536" 不得被误配成 2024 类年份
const CF_YEAR_TOKEN_RE = /(?<![\d.,])(?:19|20)\d{2}(?![\d.,])/g;

function extractAnnualCapexFromTable(text, headline) {
  const t = String(text || '');
  const fy = headline && headline.fiscalYear;
  if (!fy) return [];
  // ③ 仅 Q4 备案：Q1-Q3 备案的全年列标记（Twelve Months Ended）是 TTM
  // 列不是全年列——AMZN Q1-2026 live 实证 TTM 列年份与标题财年相同
  // （2026），只靠年份匹配会把 TTM 值当月度值落进 annual key。Q4 备案
  // 的 TTM 列按定义等于全年列。
  if (headline.quarter !== 4) return [];
  // ① 现金流量表标题锚：capex 行必须属于现金流量表
  const stmt = CF_STATEMENT_TITLE_RE.exec(t);
  if (!stmt) return [];
  // 表头窗：标题后 400 字符（live 实测四家表头都在 @250 内；再往里是
  // 数据行，边界保护的年份正则不会被逗号数字误配）
  const headWin = t.slice(stmt.index, stmt.index + 400);
  // ② 全年列标记 + 其后不得有月份数标记（YTD 列不是全年值）
  const yEnd = CF_YEAR_LABEL_RE.exec(headWin);
  if (!yEnd) return [];
  if (CF_MONTH_LABEL_RE.test(headWin.slice(yEnd.index + yEnd[0].length))) return [];
  // ④ 单位只认百万
  if (!/in\s+millions|\(millions\)/i.test(headWin)) return [];
  // ① capex 行：标题之后第一个匹配（FCF 对账表在报表之后，不抢）
  const row = CF_CAPEX_ROW_RE.exec(t.slice(stmt.index));
  if (!row) return [];
  const rowStart = stmt.index + row.index + row[0].length;
  // 行内连续数值 token（括号=流出/$/逗号/小数点容忍），遇字母（下一行
  // 标签）即停——"…(91,447) Purchases of marketable…" 不吃下一行
  const run = /^(?:\s*\(?\$?\s?[\d.,]+\)?){1,6}/.exec(t.slice(rowStart, rowStart + 300));
  if (!run) return [];
  const nums = (run[0].match(/[\d.,]+/g) || []).map(s => Number(s.replace(/,/g, '')));
  if (nums.length !== 2 && nums.length !== 4) return [];
  // ③ 全年列=后两列；表头年份取与标题财年相等者
  const years = (headWin.match(CF_YEAR_TOKEN_RE) || []).map(Number);
  if (years.length < nums.length) return [];
  const fyYears = years.slice(-2);
  const fyVals = nums.slice(-2);
  const idx = fyYears.indexOf(fy);
  if (idx < 0) return [];
  const v = fyVals[idx];
  if (!(v > 0)) return [];
  const value = v >= 1000 ? `$${Number((v / 1000).toFixed(3))} billion` : `$${v} million`;
  return [{ metric: 'capital expenditures', value, gaapBasis: '' }];
}

/**
 * 主入口：采集 SEC EDGAR 业绩备案与指引。
 * @param {object} opts { tickers?, live?, cacheTtlMs? }
 */
async function collectEdgarFilings(opts = {}) {
  const live = opts.live ?? process.env.FETCH === '1';
  const tickers = (opts.tickers && opts.tickers.length ? opts.tickers : DEFAULT_TICKERS);
  const ttl = opts.cacheTtlMs || 6 * 60 * 60 * 1000;
  const now = Date.now();
  const cache = loadCache();
  if (!live) {
    return cache && Array.isArray(cache.items)
      ? { available: true, items: cache.items, fromCache: true, stale: true, note: '离线模式：使用上次缓存' }
      : { available: false, reason: '离线模式且无 EDGAR 缓存' };
  }
  // ignoreCache 只给测试用：缓存按时间命中、不按 tickers 集合键化，
  // 测试换 ticker 子集时必须绕过，否则拿到的是上一轮全量缓存。
  if (!opts.ignoreCache && cache && cache.fetchedAt && now - cache.fetchedAt < ttl && Array.isArray(cache.items)) {
    return { available: true, items: cache.items, fromCache: true, stale: false, fetchedAt: cache.fetchedAt };
  }
  const items = [];
  const companies = {};
  const errors = [];
  try {
    await sleep(REQUEST_GAP_MS);
    const tmap = await resolveTickers();
    for (const tk of tickers) {
      const rec = tmap[tk];
      if (!rec) { errors.push(`${tk}: ticker 未解析（company_tickers.json 无此代码）`); continue; }
      try {
        await sleep(REQUEST_GAP_MS);
        const { fiscalYearEnd, filings } = await fetchCompanyFilings(rec.cik);
        companies[tk] = { cik: rec.cik, title: rec.title, fiscalYearEnd, earningsFilings: filings.length };
        for (const f of filings) {
          await sleep(REQUEST_GAP_MS);
          let rel = { text: '', docName: '' };
          try { rel = await fetchEarningsRelease(rec.cik, f, f.primaryDocument); } catch (e) { errors.push(`${tk} ${f.filingDate}: 附件抓取失败 ${e.message}`); }
          const { guidance, outlookText } = rel.text ? extractGuidance(rel.text) : { guidance: [], outlookText: '' };
          // [v3.5] 同文抽实际值（过去时）：结算上一财季指引的对账依据
          const actualEx = rel.text ? extractActuals(rel.text) : { quarter: null, fiscalYear: null, actuals: [] };
          const indexUrl = `https://www.sec.gov/Archives/edgar/data/${Number(rec.cik)}/${f.accessionNoDash}/${f.accession}-index.htm`;
          items.push({
            title: `${rec.title} (${tk}) 8-K 业绩发布 · ${f.filingDate}`,
            link: indexUrl,
            pubDate: f.filingDate,
            description: guidance.length
              ? `财报指引（${guidance[0].periodLabel || '期间未标注'}）：${guidance[0].sentence}`
              : `8-K Item 2.02 业绩发布（${rec.title}，${f.filingDate} 提交），备案附件中无数值指引（部分公司只在电话会口头给指引）`,
            body: outlookText,
            source: 'SEC EDGAR',
            origin: 'live',
            company: rec.title,
            ticker: tk,
            form: '8-K',
            accession: f.accession,
            filingDate: f.filingDate,
            fiscalYearEnd,
            docName: rel.docName,
            guidance,
            // [v3.5] 已报告财季的实际值（营收/毛利率）+ 期间，供 earnings-settlement 结算
            actuals: actualEx.actuals,
            actualPeriod: actualEx.fiscalYear ? { quarter: actualEx.quarter, fiscalYear: actualEx.fiscalYear } : null,
            // [v3.15] 全年实际值（Q4 备案「季度+全年」双值句的全年值 + 单值
            // 全年句）——全年指引（META 费用/capex、NVDA/ORCL 全年）到期
            // 时的对账依据。期间锚与 actualPeriod 同一财年
            // （Q4 备案刚结束的财年），结算层按 quarter=null 建 annual key。
            annualActuals: actualEx.annualActuals || [],
          });
        }
      } catch (e) {
        // 单公司失败不拖垮整轮：其余公司的指引照样采
        errors.push(`${tk}: ${e.message}`);
      }
    }
  } catch (e) {
    // ticker 表都拿不到：整段降级，不用任何数据顶替
    return { available: false, reason: `EDGAR 采集失败: ${e.message}`, items: [], errors };
  }
  const result = {
    available: items.length > 0,
    items,
    companies,
    errors,
    fetchedAt: now,
    guidanceCount: items.reduce((n, it) => n + it.guidance.length, 0),
    note: items.length > 0 ? undefined : '本期未采到任何业绩 8-K（公司名单全部失败或近期无 Item 2.02 备案）',
  };
  if (items.length > 0) {
    saveCache({ fetchedAt: now, items, companies, errors });
  }
  return result;
}

/**
 * [v3.13] 指引句索引 key：归一到**指标名词起**（小写、压空白、剥尾部标点）。
 * 为什么：旧版抽取的 14 字符回扩窗口会把句首限定词切掉半个——MRVL 实测
 * "GAAP diluted net income per share is expected to be $0.37" 存进台账的
 * claim 是 "P diluted net income per share…"（GAAP 只剩 P），与当期抽取
 * 句逐字匹配不上，元数据反推失败、到期指引永远 pending。两侧都从名词起
 * 对齐后，"P " 与 "GAAP " 的前缀差异不再影响配对。
 */
function guidanceNounKey(sentence) {
  const s = String(sentence || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const m = s.match(new RegExp(METRIC_NOUNS, 'i'));
  const from = m ? Math.max(0, s.toLowerCase().indexOf(m[0].toLowerCase())) : 0;
  return s.slice(from).replace(/[\s,;:.]+$/, '');
}

module.exports = {
  collectEdgarFilings, extractGuidance, extractActuals, extractAnnualActuals, stripHtml,
  DEFAULT_TICKERS, GUIDANCE_SENTENCE_RE, PERIOD_PATTERNS, GUIDANCE_COLON_BULLET_RE,
  ACTUAL_REVENUE_RE, ACTUAL_REVENUE_COLON_RE, ACTUAL_MARGIN_RE, RESULTS_HEADLINE_RES,
  ACTUAL_SALES_INCREASED_RE, QUARTER_ENDED_RE, MAX_8K_PER_COMPANY,
  // [v3.13] 结算配对用导出：口径推导 / 指标族推导 / 新实际值形态（测试）
  gaapBasisOf, settleMetricOf, guidanceNounKey, METRIC_NOUNS,
  ACTUAL_MARGIN_BULLET_RE, ACTUAL_EPS_RE, ACTUAL_OPINC_RE, ACTUAL_REVENUE_GREW_RE, FULLYEAR_GUARD_RE,
  // [v3.14] META CFO 评论式指引形态 + 多季度守卫 + bullet 营收实际值（测试）
  GUIDANCE_EXPECTS_GAP_RE, MULTI_PERIOD_RE, ACTUAL_REVENUE_BULLET_RE,
  ANNUAL_EXPECT_RE, ANNUAL_BARE_YEAR_RE, ANNUAL_PERIOD_SET, ANNUAL_YEAR_NOUN_RE,
  ANNUAL_PERIOD_PATTERN, GUIDANCE_EXPECTS_RE,
};

if (require.main === module) {
  (async () => {
    const r = await collectEdgarFilings({ live: true });
    console.log(`available=${r.available} items=${r.items ? r.items.length : 0} guidance=${r.guidanceCount || 0} errors=${(r.errors || []).length}`);
    for (const it of (r.items || [])) {
      console.log(`- ${it.title}${it.guidance.length ? ` | 指引 ${it.guidance.length} 条: ${it.guidance.map(g => `${g.metric}=${g.value}(${g.periodLabel || '无期间'})`).join('; ')}` : ' | 无指引'}`);
    }
    for (const e of (r.errors || [])) console.log('  [ERR]', e);
  })().catch(e => { console.error('EDGAR 采集抛错:', e.message); process.exit(1); });
}
