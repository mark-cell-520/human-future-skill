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
const DEFAULT_TICKERS = ['NVDA', 'AMD', 'AVGO', 'MRVL', 'MU', 'MSFT', 'GOOGL',
  'AMZN', 'META', 'ORCL', 'CRWV', 'IBM', 'DELL', 'PLTR'];

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
const METRIC_NOUNS = '(?:net revenues?|revenues?|net sales|total revenue|income|earnings|eps|diluted earnings per share|gross margins?|operating expenses|operating income|tax rates?|free cash flow|capital expenditures?|capex)';
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
const ANNUAL_PERIOD_PATTERN = /(?:full\s+)?(?:fiscal\s+year|FY|year)\s*(20\d{2})\b[^.;•]{0,40}?(?:guidance|outlook|expect)/i;
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
];
const QWORD = { first: 1, second: 2, third: 3, fourth: 4, '1st': 1, '2nd': 2, '3rd': 3, '4th': 4 };

// 指引附带的前提削减（口径限定）：同节里「不假设/不含/排除」类句子
const CAVEAT_RE = /(not assuming|does not include|excluding|excluding any|barring|absent|does not assume|not include)/i;

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
// 营收实际值："reported revenue for the second quarter ended July 26, 2026,
// of $96.2 billion" / 亮点行 "Revenue of $96.2 billion" / "revenue was $X"。
// 指标与数值间的 [^.;]{0,90} 吃掉 "for the ... ended <date>, " 这类插入语；
// 汇总表行 "Revenue $96,221 $81,615" 无 of/was/were 连接，天然不命中。
// [v3.5.1 精度教训] 名词组曾加过 sales 容忍 "Net sales were $X billion"——
// live 实测误配：AMZN 亮点段 bullet 间无句点（strip 后连成一片），90 字符
// gap 从 "Net sales increased 20% year-over-year" 桥接到下一句 "Operating
// income was $27.5 billion"，把营业利润当成了营收。sales 形态因此只认
// **紧邻**句式（无 gap）：ACTUAL_SALES_INCREASED_RE。
const ACTUAL_REVENUE_RE = new RegExp(
  `\\b(?:record\\s+|total\\s+|net\\s+)?revenue\\b[^.;]{0,90}?\\b(?:of|was|were)\\s+(?:approximately\\s+)?(\\$\\s?[\\d.,]+\\s*(?:billion|million|bn|m))\\b`, 'i');
// [v3.5.1] "Net sales increased 20% to $200.5 billion"（AMZN live 实证）：
// 亮点 bullet 只给同比增幅+绝对值，没有 of/was/were 连接词。收紧为
// increased+数字%+to **紧邻**形态——容忍间隔会把 AWS 分部的 "net sales
// increased 37%—its fastest growth in 18 quarters—to a $169 billion
// annualized revenue run rate"（年化 run rate，不是季度总量）误当总净销售额。
const ACTUAL_SALES_INCREASED_RE = new RegExp(
  `\\bnet\\s+sales\\s+increased\\s+[\\d.]+\\s*%\\s+to\\s+(\\$\\s?[\\d.,]+\\s*(?:billion|million|bn|m))\\b`, 'i');
// 毛利率实际值："GAAP and non-GAAP gross margins were both 75.0%" /
// "GAAP gross margin was 52.1%"。取第一个（若 GAAP 与非 GAAP 不同值会抽出
// 两条，由结算层唯一性规则挡掉）。
const ACTUAL_MARGIN_RE = new RegExp(
  `\\bgross\\s+margins?\\b[^.;]{0,50}?\\b(?:was|were)\\s+(?:both\\s+|approximately\\s+)?([\\d.]+\\s*%)`, 'i');

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
  const forms = [
    { re: new RegExp(GUIDANCE_SENTENCE_RE.source, 'gi'), extendBack: 14 },
    { re: new RegExp(GUIDANCE_EXPECTS_RE.source, 'gi'), extendBack: 90 },
    { re: new RegExp(GUIDANCE_TABLE_RE.source, 'gi'), extendBack: 0 },
  ];
  const seen = new Set();
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
        if (p === ANNUAL_PERIOD_PATTERN) { annual = true; quarter = null; fiscalYear = Number(pm[1]); }
        else { annual = false; quarter = QWORD[String(pm[1]).toLowerCase()] ?? Number(pm[1]); fiscalYear = Number(pm[2]); }
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
      const COMPARE_BEFORE = /(?:(?:compared\s+(?:with|to|versus|against)|versus|vs\.?|from|than)\s+|\$\s?[\d.,]+\s*(?:billion|million|bn|m)?\s+(?:in\s+)?)$/i;
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
      // 指标/数值/容差/区间
      const metricM = sentence.match(new RegExp(METRIC_NOUNS, 'i'));
      const rangeM = sentence.match(/between\s+\$?\s?([\d.,]+)\s*(billion|million)?\s+and\s+\$?\s?([\d.,]+)\s*(billion|million)?/i)
        || sentence.match(/([\d.]+)\s*%\s+to\s+([\d.]+)\s*%/i);
      const valueM = sentence.match(/\$\s?[\d.,]+\s*(?:billion|million|bn|tn|trillion)?/i)
        || sentence.match(/[\d.]+\s*%/) || sentence.match(/[\d.]+\s*basis points/i);
      const tolM = sentence.match(/(?:\+\/-|±|plus or minus)\s*(\$?\s?[\d.,]+\s*(?:%|billion|million|basis points|bps)?)/i);
      // 前提削减：指引句之后 300 字符内的限定句（实测 NVIDIA 的
      // "NVIDIA is not assuming any Data Center compute revenue from China"
      // 就写在指引句后面一句）。matchEnd 已在上面期间匹配处算好。
      const caveats = [];
      const after = text.slice(matchEnd, matchEnd + 300);
      for (const s of after.split(/(?<=[.!?])\s+/)) {
        if (CAVEAT_RE.test(s) && s.length < 300) caveats.push(s.trim());
      }
      guidance.push({
        sentence,
        metric: metricM ? metricM[0].toLowerCase() : null,
        value: rangeM ? rangeM[0].replace(/\s+/g, ' ') : (valueM ? valueM[0].replace(/\s+/g, ' ') : null),
        isRange: !!rangeM,
        tolerance: tolM ? tolM[1].replace(/\s+/g, ' ') : null,
        quarter, fiscalYear,
        periodPhrase: periodPhrase || null,
        annual: !!annual,
        periodLabel: fiscalYear && quarter ? `FY${fiscalYear} Q${quarter}` : (fiscalYear && annual ? `FY${fiscalYear} 全年` : null),
        caveats,
      });
      if (guidance.length >= 6) break;   // 每份发布最多 6 条指引，防刷屏
    }
    if (guidance.length >= 6) break;
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
 * 只抽营收与毛利率两个头条指标（理由见 ACTUAL_REVENUE_RE 注释）：营收无
 * GAAP/非 GAAP 分歧；毛利率 GAAP=非 GAAP 时只余一条，不同值时抽出两条、
 * 由结算层「唯一实际值才结算」挡掉。metric 用规范名（revenue / gross
 * margin），与指引侧 normalizeMetric 对齐。
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
  if ((!fiscalYear || !quarter) && QUARTER_ENDED_RE) {
    const m = t.slice(0, 2500).match(QUARTER_ENDED_RE);
    if (m) { quarter = QWORD[String(m[1]).toLowerCase()] ?? Number(m[1]); fiscalYear = Number(m[2]); }
  }
  if (!fiscalYear || !quarter) return { quarter: null, fiscalYear: null, actuals: [] };
  const lead = t.slice(0, 1600);   // 亮点段：实际值在开头陈述，避开汇总表多列数字
  const actuals = [];
  // 营收取**第一个**匹配：总收入惯例上在亮点段最前（"Revenue of $96.2B"），
  // 且营收无 GAAP/非 GAAP 分歧——取第一个即总收入，后面的分部营收
  // （"Data Center revenue of $89.0B"）不取，避免把分部当总量。
  const rv = lead.match(ACTUAL_REVENUE_RE);
  if (rv) actuals.push({ metric: 'revenue', value: rv[1].replace(/\s+/g, ' ') });
  else {
    // [v3.5.1] AMZN 形态兜底："Net sales increased 20% to $200.5 billion"
    // （无 of/was/were 连接词，主模式不命中）。紧邻形态，见上方精度注释。
    const rv2 = lead.match(ACTUAL_SALES_INCREASED_RE);
    if (rv2) actuals.push({ metric: 'revenue', value: rv2[1].replace(/\s+/g, ' ') });
  }
  // 毛利率取**全部**匹配：GAAP 与非 GAAP 不同值时抽出两条（MRVL 实测
  // "GAAP gross margin was 52.9% / Non-GAAP ... 57.5%"），驱动结算层
  // 「唯一实际值才结算」判歧义跳过；同值时（NVDA "both 75.0%"）只余一条，
  // 照常结算。用 matchAll（global）——单 match 只取第一个会把歧义吞掉。
  const mgnRe = new RegExp(ACTUAL_MARGIN_RE.source, 'gi');
  for (const m of lead.matchAll(mgnRe)) {
    actuals.push({ metric: 'gross margin', value: m[1].replace(/\s+/g, ' ') });
  }
  return { quarter, fiscalYear, actuals };
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

module.exports = {
  collectEdgarFilings, extractGuidance, extractActuals, stripHtml,
  DEFAULT_TICKERS, GUIDANCE_SENTENCE_RE, PERIOD_PATTERNS,
  ACTUAL_REVENUE_RE, ACTUAL_MARGIN_RE, RESULTS_HEADLINE_RES,
  ACTUAL_SALES_INCREASED_RE, QUARTER_ENDED_RE, MAX_8K_PER_COMPANY,
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
