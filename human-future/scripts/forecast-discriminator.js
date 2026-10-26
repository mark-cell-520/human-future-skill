#!/usr/bin/env node
'use strict';

/**
 * 预测辨别器 — human-future v2.13 第 10 个组件
 *
 * ── 这个模块为什么存在 ───────────────────────────────────────────
 * v2.12 及以前的「推演」是假推演：stages 按当前信号热度排序后贴上
 * 「未来 0-12 个月」标签，turningPoints 的代码注释自己写着「非未来事件预测」，
 * formulaAssessment 的贝叶斯先验写死 0.5 并注明「方法演示」。
 *
 * v2.13 换做法：**引擎不再自己生成未来，而是辨别他人关于未来的主张**。
 * 这是 Layer 1（辨别者）的独有位置——大模型能生成预测，
 * 但能系统性辨别预测质量并长期跟踪结算的，没有。
 *
 * ── 辨别什么（四个维度，全部可复现）─────────────────────────────
 * 1. 可证伪性（falsifiability）
 *    - 有明确主体（谁）+ 明确事件（什么）+ 明确时点（何时）→ 可证伪
 *    - 「AI 会继续进步」「未来很美好」这类无主体无时点 → 不可证伪
 *    - 不可证伪的预测不是预测，是修辞
 *    - [v2.15] 子判别「文本性质」：指南/参考页文本（页面标题+简介，
 *      "A Practical Guide to…"、"This page aims to provide an overview…"）
 *      没有任何主张主体，连「意图声明」都不是——单列 reference-text，
 *      不可结算、不进台账。实测依据见 REFERENCE_TEXT_PATTERNS 注释。
 * 2. 基准概率（base rate）
 *    - 从历史台账里找同类预测的实际兑现率
 *    - [v2.16] 同类历史按「同义务去重」后计数：同一现实事件被多个页面
 *      重复登记只算一次（实测 3 条 EU AI Act 条目是同一义务）
 *    - 无同类历史或去重后样本 <3 时用「宣布→交付」的通用基准
 *      （见 DEFAULT_BASE_RATES），并如实标注本地台账已结算条数
 *    - 基准概率是辨别的锚：宣称 90% 置信度而同类历史兑现率 30%，即为过度自信
 * 3. 推理有效性（reasoning validity）
 *    - 是否给出机制（为什么）
 *    - 是否给出可观察的先行指标（怎么提前知道）
 *    - 是否承认反例条件（什么情况下我错）
 *    - 三者缺一，推理强度降一级
 * 4. 证伪条件（falsifier）
 *    - 明确写出「观察到什么就说明这条预测错了」
 *    - 没有证伪条件的预测无法结算，只能进「不可结算」桶
 *
 * ── 诚实性约束（不可违反）──────────────────────────────────────
 * - 本模块只辨别**表述与结构**，不辨别事实真假。它没有外部世界知识。
 * - 基准概率来自历史台账，样本不足时必须标注 sample size，不得伪装成统计结论。
 * - 不得因为一条预测「结构良好」就判定它「可能为真」——结构良好只说明可结算。
 */

// [v3.13] 口径/指标族推导复用 EDGAR 采集器（单一事实源，两边判据一致）
const { gaapBasisOf, settleMetricOf } = require('./edgar-collector.js');
const { dedupeSameObligation } = require('./prediction-ledger.js');

/** 通用基准概率：无同类历史时的默认锚。每个值都注明来源与口径。 */
// [v3.4] 财报指引（earnings guidance）先验。口径说明（重要）：
// FactSet Earnings Insight 的「77% 公司收入超预期」是**实际值 vs 分析师
// 一致预期**，不是「实际值 vs 公司自身指引」——两个口径差一个「指引
// 通常打得保守」的系统性偏差，直接挪用就是本引擎自己要抓的口径错位。
// 检索无果（2026-10-25 两组检索未找到可引用的「指引兑现率」公开统计），
// 故取中性 0.5，待本地台账积累后替换。
const DEFAULT_BASE_RATES = {
  earnings_guidance: { rate: 0.5, sample: 0, note: '通用先验（中性），无本地历史；FactSet 的「超预期率」是 vs 分析师预期的口径，不可挪用为「兑现自身指引」' },
  // 「厂商宣布 X 月内交付」的历史兑现率。口径：从宣布日到期交付日，
  // 以厂商官方 GA 公告为准，不含延期后交付。
  vendor_delivery: { rate: 0.35, sample: 0, note: '通用先验，无本地历史；需台账积累后替换' },
  // 「研究者预测 N 年内实现突破」：口径为同行评审论文的明确时间声明。
  researcher_timeline: { rate: 0.25, sample: 0, note: '通用先验，无本地历史' },
  // 「监管机构将在 N 个月内通过/禁止 X」。
  regulatory_action: { rate: 0.45, sample: 0, note: '通用先验，无本地历史' },
  // 「能力指标将在 N 个月内提升 X%」。
  capability_milestone: { rate: 0.4, sample: 0, note: '通用先验，无本地历史' },
};

/**
 * [v2.15] 参考/指南文本模式：百科式页面文本不是任何主体做出的预测。
 *
 * 实测踩坑（2026-10-24 本轮 full-report）：EU AI Act Timeline 是 sitemap 源，
 * 条目 = 页面标题 + 页面简介。辨别段把
 *   "The EU AI Act's Transparency Rules: A Practical Guide to Article 50
 *    What providers and deployers must do by August 2026"
 * 当成一条可结算预测（dueOn=2026-Q3）登记进台账；同一句 boilerplate 在
 * the-scientific-panel / the-advisory-forum 页面重复出现，被登记三次、
 * 全部结算为 true。这类文本没有任何主体在做出预测——页面只是在陈述
 * 法定义务。当前标签「意图声明」是错的：意图声明至少是某个主体的前瞻
 * 表述，参考文本连主张主体都没有。
 *
 * 误判后果：① 台账被非预测污染，同一义务被重复计数；②「不可证伪」桶
 * 混入两类完全不同的对象，报告的辨别结论失真。
 *
 * 判据设计纪律：只认**页面框架措辞**（guide / overview / this page aims
 * to / what X must do），不碰内容词——"aims to provide API access"
 * 是真实承诺不是参考文本，不能误杀。
 */
const REFERENCE_TEXT_PATTERNS = [
  { id: 'guide-page',
    test: (t) => /(a practical guide|practical guide to|guide to article \d+|step-by-step guide|this page aims to|this page provides|this article (?:aims to|provides)|aims to (?:provide|give|explain|summar|outline) an? (?:overview|guide|introduction|primer|explainer)|(?:provides?|offers?) an? (?:overview|introduction|primer|explainer) (?:of|to|on)|primer on|what (?:providers|deployers|organisations|organizations|companies|developers|users) (?:must|need to|should) do)/i.test(t),
    label: '指南/参考页文本',
    guidance: '这是页面标题与简介组成的参考文本，没有任何主体在做出预测，不能登记结算。' },
];

// ── [v3.4] 财报指引（新辨别维度）────────────────────────────────
// 定位：v2.13 起记录的边界「RSS 前瞻表述多为意图声明、不可结算」的推进——
// 带硬结算日的预测不只在预测平台，也在上市公司 8-K（Item 2.02）的
// EX-99 业绩发布里："Revenue is expected to be $108.0 billion, plus or
// minus 2%"（NVIDIA FY2027 Q3 指引）。有主体（公司）、有事件（下一财季
// 实际值）、有结算机制（下一期财报公布）。判据与 edgar-collector 的
// 判据与 edgar-collector 的抽取模式同源（三条 live 实证句式：指标+is/are expected to be+数值）。
// [v3.14] total expenses 与 edgar-collector 的 METRIC_NOUNS 同步（META 全年
// 费用指引 live 实证）——两份名词表历来一致，只改一处会让 RSS 文本路径与
// 结构化元数据路径对同一句式给出不同判定。
const GUIDANCE_METRIC = '(?:net revenues?|revenues?|net sales|total revenue|total expenses|income|earnings|eps|diluted earnings per share|gross margins?|operating expenses|operating income|tax rates?|free cash flow|capital expenditures?|capex)';
const GUIDANCE_TEXT_RE = new RegExp(
  `(?:${GUIDANCE_METRIC})\\b[^.;•]{0,140}?\\b(?:is|are)\\s+(?:expected|projected|anticipated|forecast|guided)\\s+to\\s+be\\b[^.;•]{0,80}?[\\d$%]`,
  'i');
// 句内财季期间："third quarter of fiscal 2027" / "Q3 FY2027" / "Q3 2027"
const FISCAL_PERIOD_RE = /(?:(?:for\s+the\s+)?(first|second|third|fourth|1st|2nd|3rd|4th)\s+quarter\s+(?:of\s+)?(?:fiscal\s+)?(20\d{2})\b|Q([1-4])\s*(?:FY\s*)?(20\d{2}))/i;
const QWORD_NUM = { first: 1, second: 2, third: 3, fourth: 4, '1st': 1, '2nd': 2, '3rd': 3, '4th': 4 };

/**
 * 财季期间 → 日历结算点（估计值）。
 *
 * fiscalYearEnd 形如 '0131'（NVDA）/ '0630'（MSFT）/ '1226'（AMD）/
 * '0902'（MU）——EDGAR submissions JSON 的权威字段。财季结束月 =
 * FYE 月 - 3×(4-季度)，跨年回绕；结束日取 FYE 日（月内同日近似）。
 * 结算点 = 财季结束 + REPORT_LAG_DAYS 天——财报公布滞后的保守中位
 * （实测 NVDA 约 3.5 周、MSFT 约 4 周、MU 约 1 周、慢的可达 6 周以上；
 *  取 45 天保证「到期未结算」只在实际值已公开之后出现，方向保守）。
 *
 * 诚实性：返回 dueBasis='estimated-fiscal'，任何层不得把这个日期
 * 当作精确结算日引用；实际结算以下一期财报公布值为准。
 */
const REPORT_LAG_DAYS = 45;
function fiscalPeriodToDueOn(quarter, fiscalYear, fiscalYearEnd, annual) {
  if (!fiscalYear || !fiscalYearEnd) return null;
  if (!annual && !quarter) return null;
  const fyeMonth = Number(String(fiscalYearEnd).slice(0, 2));
  const fyeDay = Number(String(fiscalYearEnd).slice(2, 4)) || 28;
  if (!(fyeMonth >= 1 && fyeMonth <= 12)) return null;
  // 全年指引：结算点 = 该财年的 FYE 日 + 滞后；季度指引：财季结束月 =
  // FYE 月 - 3×(4-季度)，跨年回绕（0 基计算）。
  const endMonth0 = annual ? fyeMonth : fyeMonth - 3 * (4 - quarter);
  const endMonth = ((endMonth0 - 1 + 12) % 12) + 1;
  const endYear = annual ? fiscalYear : fiscalYear + Math.floor((endMonth0 - 1) / 12);
  const day = Math.min(fyeDay, new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate());
  const quarterEnd = new Date(Date.UTC(endYear, endMonth - 1, day));
  const settle = new Date(quarterEnd);
  settle.setUTCDate(settle.getUTCDate() + REPORT_LAG_DAYS);
  return {
    dueOn: settle.toISOString().slice(0, 10),
    dueBasis: 'estimated-fiscal',
    quarterEnd: quarterEnd.toISOString().slice(0, 10),
    note: `估计值：${annual ? '财年' : '财季'}结束 ${quarterEnd.toISOString().slice(0, 10)}（按 FYE ${fiscalYearEnd} 推算）+${REPORT_LAG_DAYS} 天公布滞后；实际以下期财报为准`,
  };
}

/** 不可证伪的措辞模式：无主体、无时点、或纯价值判断。 */
const UNFALSIFIABLE_PATTERNS = [
  // [v2.13] no-timeline 必须同时认**相对时间**与**月份+年份**。
  // 实测踩坑：Anthropic 的 "by the end of this year" 不含 20xx，
  // 旧正则不认它，导致这条有明确结算点的预测被误判「无时间点」。
  // EU AI Act 的 "by August 2026" 是月份+年份形态，同样要认。
  // 相对时间词与 project-future.js 的 TIME_POINT 保持一致。
  { id: 'no-timeline', test: (t) => !/(20\d{2}|明年|后年|未来|个月内|年内|季度|Q[1-4]|H[12]|soon|by \d|within \d|this\s+year|end\s+of\s+(?:this\s+)?year|year[\s-]end|年底|今年|明年初|年底前|next\s+(?:year|quarter|month)|下季度|下个月|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+20\d{2}|Q[1-4]\s+20\d{2})/i.test(t),
    label: '无时间点（意图声明，非可结算预测）', guidance: '没有时点的前瞻表述是意图或愿景，无法结算，只能算观点。' },
  { id: 'vague-subject', test: (t) => /(AI|技术|社会|世界|行业|我们|人们|大家)\s*(会|将|可能|应该|需要)/.test(t)
    && !/(OpenAI|Google|Anthropic|Meta|Microsoft|NVIDIA|DeepSeek|阿里|字节|腾讯|百度|某公司|该公司|厂商)/.test(t),
    label: '主体模糊', guidance: '「AI 会……」没有指明是谁在行动，无法验证也无法证伪。' },
  { id: 'value-judgment', test: (t) => /(应该|必须|需要|重要的是|意味着|标志着|时代|革命|颠覆)/.test(t)
    && !/(将|会|预计|计划|目标|定于)/.test(t),
    label: '价值判断', guidance: '这是立场表述不是预测，没有真假可言。' },
  { id: 'unbounded-quantity', test: (t) => /(大幅|显著|迅速|极大|巨大|空前|历史性|突破性)/.test(t)
    && !/\d/.test(t),
    label: '无量化的程度词', guidance: '「大幅提升」没有基数与目标值，任何结果都能被说成应验。' },
];

/** 推理有效性的检查项：给出机制 / 先行指标 / 反例条件。 */
const REASONING_CHECKS = [
  { id: 'has-mechanism', label: '给出机制（为什么）',
    // [v2.13] 补上**量化趋势外推**这一形态。
    // 实测踩坑：Anthropic 的机制是
    //   "improve at their historical rate" + "least-squares fit" +
    //   "a gain of 13.7 ECI per year (R 2 of 0.95)"
    // 这是「历史速率外推 + 回归拟合 + 量化斜率」，是比因果连接词更强的机制，
    // 但旧判据只认 because/due to/driven by，导致推理分 0/3——
    // 明明有 R²=0.95 的拟合却判「无机制」。
    test: (t) => /(因为|由于|基于|得益于|驱动|导致|源于|because|due to|driven by|owing to|historical\s+rate|trend\s+line|least[\s-]squares|regression|per\s+year|annual\s+(?:gain|growth|rate)|年增|年均|趋势线|回归|历史速率|拟合|R\s*[²2]|R-squared)/i.test(t) },
  { id: 'has-leading-indicator', label: '给出先行指标（怎么提前知道）',
    // 同上：ECI 分数就是先行指标，但旧判据不认「指标名 + 数值」这种形态。
    test: (t) => /(指标|信号|观察|监测|先行|领先|若.*则|当.*时|indicator|signal|watch for|if .* then|ECI|benchmark|score\s+of|index\s+of|capabilit(?:y|ies)\s+(?:level|floor|ceiling)|floor|ceiling|分数|得分|基准线|能力线)/i.test(t) },
  { id: 'has-counterfactual', label: '承认反例条件（什么情况下我错）',
    // 同上：条件式预测（"If X, they'll Y"）本身就是反例条件——
    // X 不成立则预测不成立。旧判据只认 unless/otherwise/fails to。
    test: (t) => /(除非|如果不|反之|否则|失败|未达|低于|高于|unless|if not|otherwise|fails? to|if\s+\w+.*,\s*(?:they|it|we|the)\s*(?:'ll|will|would)|若.*则|如果.*就)/i.test(t) },
];

/**
 * 辨别单条预测。
 *
 * @param {object} claim { text, source, date, url?, category? }
 * @param {object} opts { ledger?: Array } 传入历史台账用于基准概率
 * @returns {object} 辨别结果
 */
function discriminate(claim, opts = {}) {
  const text = String(claim.text || '').trim();
  if (!text) return { available: false, reason: '空输入' };

  // ── [v3.4] 财报指引识别 ─────────────────────────────────────
  // 两条来路：① claim.guidance 元数据（SEC EDGAR 采集器解析的结构化
  // 指引，带 quarter/fiscalYear/metric/value/tolerance/caveats）；
  // ② 句式为指引形态（RSS 引用的厂商指引，无元数据）。
  const guidanceMeta = (claim.guidance && (claim.guidance.quarter || claim.guidance.annual)
    && claim.guidance.fiscalYear)
    ? claim.guidance : null;
  const isGuidanceText = GUIDANCE_TEXT_RE.test(text);
  const isGuidance = !!guidanceMeta || isGuidanceText;
  // 指引的时点可能在元数据里（句子里没有年份）——no-timeline 判据必须认它
  const guidanceHasTimeline = !!guidanceMeta
    || FISCAL_PERIOD_RE.test(text)
    || /(20\d{2}|Q[1-4]\s*20\d{2})/i.test(text);

  // ── 1. 可证伪性 ─────────────────────────────────────────────
  const unfalsifiable = UNFALSIFIABLE_PATTERNS
    .filter(p => { try { return p.test(text); } catch (_) { return false; } })
    .map(p => ({ id: p.id, label: p.label, guidance: p.guidance }))
    // [v3.4] 指引的时点在元数据里不在句子里：不过滤的话「Revenue is
    // expected to be $108.0 billion」会被 no-timeline 判成「无时间点的
    // 意图声明」——而它带着全引擎最硬的结算点（下一期财报）。
    .filter(u => !(u.id === 'no-timeline' && guidanceHasTimeline));

  // [v2.15] 参考/指南文本：优先级高于「不可证伪」模式。
  //
  // 顺序理由：指南页的标题+简介往往**没有时间点**（"This page aims to
  // provide an overview…"），若先判 unfalsifiable，它会被贴上「意图声明」
  // 标签——但参考文本连主张主体都没有，与意图声明是两类对象，
  // 报告结论会失真。文本性质是先于结构的判别。
  const referenceText = REFERENCE_TEXT_PATTERNS
    .filter(p => { try { return p.test(text); } catch (_) { return false; } })
    .map(p => ({ id: p.id, label: p.label, guidance: p.guidance }));

  // 抽取显式时间点（用于结算日）
  //
  // [v2.13] 必须同时覆盖**相对时间**。实测踩坑：Anthropic 的
  // "they'll match this capability level by the end of this year"
  // 用的是 `end of this year`——不含 20xx，旧正则只认绝对年份和「N 个月」，
  // 导致这条质量最高的可结算预测 dueOn=null、settleable=false。
  //
  // 相对时间以 claim.date 为基准解析（claim.date 是信号发布日）。
  // 解析不出基准日期时退回当前日期，并在 note 里说明基准来源。
  const baseDate = (() => {
    const t = claim.date ? Date.parse(claim.date) : NaN;
    return isNaN(t) ? new Date() : new Date(t);
  })();
  const baseYear = baseDate.getUTCFullYear();
  const RELATIVE = [
    { re: /end\s+of\s+(?:this\s+)?year|year[\s-]end|年底|年底前/i, due: () => `${baseYear}-Q4` },
    { re: /(?:early|start|beginning)\s+of\s+(?:next\s+)?year|明年初|年初/i, due: () => `${baseYear + 1}-Q1` },
    { re: /next\s+year|明年|后年/i, due: () => `${baseYear + 1}-Q4` },
    { re: /this\s+year|今年|年内/i, due: () => `${baseYear}-Q4` },
    { re: /next\s+quarter|下季度|下一季度/i, due: () => `${baseYear}-Q${((baseDate.getUTCMonth() / 3 | 0) + 2 > 4 ? 1 : (baseDate.getUTCMonth() / 3 | 0) + 2)}` },
    { re: /next\s+month|下个月|下月/i, due: () => {
      const d = new Date(baseDate); d.setUTCMonth(d.getUTCMonth() + 1);
      return d.toISOString().slice(0, 10);
    } },
    // [v2.13] 月份+年份（"by August 2026"）→ 换算成该月所在季度。
    // EU AI Act 这类监管源的时点就是月份+年份形态，必须能解析出结算点。
    { re: /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(20\d{2})/i,
      due: (m) => {
        const MON = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
          august: 8, september: 9, october: 10, november: 11, december: 12 };
        const mo = MON[String(m[1]).toLowerCase()];
        const yr = Number(m[2]);
        return `${yr}-Q${Math.ceil(mo / 3)}`;
      } },
    { re: /Q([1-4])\s+(20\d{2})/i, due: (m) => `${m[2]}-Q${m[1]}` },
  ];
  let timeMatch = text.match(/(20\d{2})(?:-Q([1-4])|-H([12])|-(\d{2}))?/)
    || text.match(/(\d+)\s*(?:个月|月内|months?)/i);
  // [v2.13] 裸年份可能是「月份+年份」的一部分，此时不能按 Q4 处理。
  //
  // 实测踩坑：EU AI Act 的 "must do by August 2026" 被 (20\d{2}) 先匹配到
  // 裸年份 2026，走 absolute 分支默认 Q4，产出 dueOn=2026-Q4——
  // 但 August 在 Q3。同样 "by Q2 2027" 被匹配成裸 2027 → Q4，实际是 Q2。
  //
  // 规则：如果年份前面紧邻月份名或 Q 标记，就不是裸年份，
  // 清掉 timeMatch 让相对时间分支的月份解析接管。
  if (timeMatch && /^\d{4}/.test(timeMatch[0]) && timeMatch.index !== undefined) {
    const before = text.slice(Math.max(0, timeMatch.index - 20), timeMatch.index);
    if (/(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+$/i.test(before)
      || /\bQ[1-4]\s+$/i.test(before)) {
      timeMatch = null;
    }
  }
  let dueOn = null;
  let dueBasis = null;
  // [v2.13] 年份合理性校验。
  // 实测踩坑：NVIDIA 那条正文里有 "2,000" 这类数字，被 (20\d{2}) 误配成
  // 年份 2000，产出 dueOn=2000-Q4——一个 26 年前的结算点，荒谬。
  // 规则：绝对年份必须落在 [发布年, 发布年+15] 区间内，否则视为误配，
  // 继续尝试相对时间。
  const YEAR_MIN = baseYear;
  const YEAR_MAX = baseYear + 15;
  const yearIsPlausible = (y) => y >= YEAR_MIN && y <= YEAR_MAX;
  if (timeMatch && /^\d{4}/.test(timeMatch[0]) && !yearIsPlausible(Number(timeMatch[1]))) {
    // 误配：清掉 timeMatch，落到相对时间分支
    timeMatch = null;
  }
  if (timeMatch) {
    if (/^\d{4}/.test(timeMatch[0])) {
      const y = Number(timeMatch[1]);
      const q = timeMatch[2] ? Number(timeMatch[2]) : (timeMatch[3] ? (timeMatch[3] === '1' ? 2 : 4) : (timeMatch[4] ? Math.ceil(Number(timeMatch[4]) / 3) : 4));
      dueOn = `${y}-Q${q}`;
      dueBasis = 'absolute';
    } else {
      const months = Number(timeMatch[1]);
      const d = new Date(baseDate);
      d.setUTCMonth(d.getUTCMonth() + months);
      dueOn = d.toISOString().slice(0, 10);
      dueBasis = 'relative-months';
    }
  } else {
    // 绝对时间没命中时试相对时间
    for (const r of RELATIVE) {
      const m = text.match(r.re);
      if (m) {
        dueOn = r.due(m);
        dueBasis = 'relative';
        break;
      }
    }
  }

  // [v3.4] 指引结算点覆盖：通用解析（裸年份→Q4）对财季期间是错的
  // （"third quarter of fiscal 2027" 不是 2027-Q4），元数据算完直接
  // 覆盖；没有 fiscalYearEnd 日历的句内财季期间显式置空——不猜。
  let guidanceDueNote = null;
  if (guidanceMeta) {
    const est = fiscalPeriodToDueOn(guidanceMeta.quarter, guidanceMeta.fiscalYear, claim.fiscalYearEnd, !!guidanceMeta.annual);
    if (est) { dueOn = est.dueOn; dueBasis = est.dueBasis; guidanceDueNote = est.note; }
    else { dueOn = null; dueBasis = null; guidanceDueNote = '财季期间解析失败（fiscalYearEnd 缺失或异常），不猜结算点'; }
  } else if (isGuidanceText && FISCAL_PERIOD_RE.test(text) && !claim.fiscalYearEnd) {
    dueOn = null; dueBasis = null;
    guidanceDueNote = '句内财季期间缺 fiscalYearEnd 元数据，无法换算日历结算点（漏报比误报诚实）';
  }

  // ── 2. 基准概率 ─────────────────────────────────────────────
  const category = claim.category || inferCategory(text);
  const ledger = Array.isArray(opts.ledger) ? opts.ledger : [];
  // [v2.16] 断链修复：台账条目存的是 domain（project-future.js 登记时
  // 写的就是 domain: r.category，值域与辨别器类目词一致），旧代码读
  // p.category 恒为 undefined——「本地台账同类历史」分支自 v2.13 声明
  // 起从未激活过一次，基准概率永远落在通用先验上。现在两个字段都认：
  // record() 从 v2.16 起双写 category，历史条目只有 domain 也能匹配。
  const sameCatRaw = ledger.filter(p => (p.category || p.domain) === category
    && p.outcome !== null && p.outcome !== undefined);
  // [v2.16] 同义务去重：同一现实事件被多个页面重复登记时只计一次。
  // 实测台账里 3 条 EU AI Act 条目（三个页面、5 个证据来源完全相同）
  // 是同一义务；不去重就把一次兑现计成三次，同类历史兑现率虚高到
  // 100%——比「永远用先验」更糟的失真。这是 SKILL.md 写明的先决条件。
  const dedup = dedupeSameObligation(sameCatRaw);
  const sameCat = dedup.entries;
  let baseRate;
  if (sameCat.length >= 3) {
    const hits = sameCat.filter(p => p.outcome === true).length;
    baseRate = {
      rate: Math.round((hits / sameCat.length) * 100) / 100,
      sample: sameCat.length,
      source: 'local-ledger',
      note: `本地台账同类已结算 ${sameCat.length} 条（同义务去重后，原始登记 ${sameCatRaw.length} 条），命中 ${hits} 条`,
    };
  } else {
    const d = DEFAULT_BASE_RATES[category] || DEFAULT_BASE_RATES.vendor_delivery;
    // [v2.16] 样本不足（1-2 条）时仍用通用先验——1 条历史不构成统计
    // 结论——但不再谎称「无本地历史」：有 1 条就说 1 条，样本不足是
    // 样本不足，和一条都没有是两件事，note 里分开写。
    baseRate = sameCat.length > 0
      ? { rate: d.rate, sample: d.sample, source: 'default-prior',
          note: `通用先验；本地台账同类已结算 ${sameCat.length} 条（同义务去重后），样本 <3 不作统计结论` }
      : { rate: d.rate, sample: d.sample, source: 'default-prior', note: d.note };
  }
  // [v2.16] 本地台账观测值：即使不进基准概率也如实展示，报告层可见。
  const localLedger = {
    settledRaw: sameCatRaw.length,
    settledDistinct: sameCat.length,
    deduped: dedup.dedupedCount,
    hits: sameCat.filter(p => p.outcome === true).length,
  };

  // ── 3. 推理有效性 ───────────────────────────────────────────
  const reasoning = REASONING_CHECKS.map(c => {
    let ok = false;
    try { ok = c.test(text); } catch (_) { ok = false; }
    return { id: c.id, label: c.label, present: ok };
  });
  const reasoningScore = reasoning.filter(r => r.present).length;

  // ── 4. 证伪条件 ─────────────────────────────────────────────
  const hasFalsifier = reasoning.find(r => r.id === 'has-counterfactual')?.present
    || /(证伪|反例|失败条件|什么情况.*错|falsif)/i.test(text);

  // ── 综合判定 ───────────────────────────────────────────────
  // 判定只描述「这条预测的结构质量」，不描述「它是否为真」。
  let verdict, verdictLabel;
  if (referenceText.length > 0) {
    // [v2.15] 参考/指南文本优先：它不是任何主体做出的预测，
    // 与「意图声明」是两类对象，必须分开计数、分开展示。
    verdict = 'reference-text';
    verdictLabel = `非预测文本（${referenceText.map(u => u.label).join('、')}）`;
  } else if (unfalsifiable.length > 0) {
    verdict = 'not-a-forecast';
    verdictLabel = `不可证伪（${unfalsifiable.map(u => u.label).join('、')}）`;
  } else if (isGuidance) {
    // [v3.4] 财报指引单列：结构上是「指标+数值+结算期」的可结算形态，
    // 但推理三要素（机制/先行指标/反例）在指引句里通常不出现——用
    // reasoningScore 判它会掉进「裸断言」，而指引与「AI 会继续进步」
    // 不是一类对象。指引的质量维度是结算硬度/容差/前提削减，不是推理。
    verdict = 'earnings-guidance';
    verdictLabel = '财报指引（厂商自报预测，带结算期）';
  } else if (reasoningScore === 0) {
    verdict = 'bare-assertion';
    verdictLabel = '裸断言（无机制、无指标、无反例）';
  } else if (reasoningScore < 3) {
    verdict = 'weakly-supported';
    verdictLabel = `支撑不足（${reasoning.filter(r => !r.present).map(r => r.label)} 缺失）`;
  } else {
    verdict = 'well-formed';
    verdictLabel = '结构完整（可结算）';
  }

  // 可结算性：有 dueOn、可证伪、且不是参考文本
  // [v2.15] reference-text 即使解析出了时间点（指南页副标题里的
  // "by August 2026"）也不可结算——没有任何主体对它负责。
  const settleable = verdict !== 'not-a-forecast' && verdict !== 'reference-text' && dueOn !== null;

  // [v3.4] 指引结构透传（元数据优先，句内解析兜底）
  // [v3.5.1] ticker/fiscalYear/quarter 三字段补进结构：v3.5 把它们写进
  // 登记时的 settlement 元数据，但辨别结果从未带过这三个字段——实测台账
  // 47 条 earnings_guidance 的 settlement.ticker 恒为 null、fiscalYear/
  // quarter 恒缺失，「元数据随新条目落盘」从落地起就没工作过（结算层
  // 持久化分支 p.settlement.ticker 从未激活过一次，全部流量挤在句匹配
  // 兜底路径上，指引备案一滑出采集窗口就永久无法结算）。
  const guidanceStruct = isGuidance ? {
    metric: guidanceMeta ? guidanceMeta.metric : (text.match(new RegExp(GUIDANCE_METRIC, 'i')) || [null])[0],
    value: guidanceMeta ? guidanceMeta.value : (text.match(/\$\s?[\d.,]+\s*(?:billion|million)?|[\d.]+\s*%/) || [null])[0],
    tolerance: guidanceMeta ? guidanceMeta.tolerance : (text.match(/(?:\+\/-|±|plus or minus)\s*(\$?\s?[\d.,]+\s*(?:%|billion|million|basis points)?)/i) || [null, null])[1],
    ticker: claim.ticker || null,
    fiscalYear: guidanceMeta ? (guidanceMeta.fiscalYear ?? null) : null,
    quarter: guidanceMeta ? (guidanceMeta.quarter ?? null) : null,
    periodLabel: guidanceMeta ? guidanceMeta.periodLabel : null,
    annual: guidanceMeta ? !!guidanceMeta.annual : false,
    caveats: guidanceMeta ? (guidanceMeta.caveats || []) : [],
    // [v3.13] 口径标记 + 结算指标族透传（v3.5.1 补过 ticker/fiscalYear/
    // quarter 三字段的同型断链——少了这两个，结算层只能用名词级 metric
    // 配对：MRVL EPS 指引指标名是 income，与实际值侧 diluted eps 配不上；
    // GAAP/非 GAAP 口径丢失则同财季同指标天然多值、一律判歧义跳过）。
    // 无元数据路径（句内解析兜底）从 claim 文本补推，推不到就是 ''。
    gaapBasis: guidanceMeta ? (guidanceMeta.gaapBasis || '') : (() => {
      // 无元数据路径（句内解析兜底，RSS 来源）：只认指标名词**前**的限定词
      // ——「GAAP gross margin is expected to…」。不扫全句：句尾提一句
      // non-GAAP 的句子（口径说明 boilerplate）会被误标。
      const tx = String(text || '');
      const mm = tx.match(new RegExp(GUIDANCE_METRIC, 'i'));
      if (!mm) return '';
      const idx = tx.toLowerCase().indexOf(mm[0].toLowerCase());
      return gaapBasisOf(tx.slice(Math.max(0, idx - 30), idx));
    })(),
    settleMetric: guidanceMeta
      ? (guidanceMeta.settleMetric || null)
      : settleMetricOf(String(text || ''), (text.match(new RegExp(GUIDANCE_METRIC, 'i')) || [null])[0]),
    fromMetadata: !!guidanceMeta,
  } : null;

  return {
    available: true,
    text: text.slice(0, 300),
    source: claim.source || '(未标注)',
    date: claim.date || null,
    url: claim.url || '',
    // [v3.5.1] ticker 透传：SEC EDGAR 指引的登记结算元数据靠它把指引对到
    // 具体公司的财报实际值。RSS 来源没有 ticker，为 null 不参与结算。
    ticker: claim.ticker || null,
    category,
    dueBasis: dueBasis || null,
    dueNote: guidanceDueNote || null,
    guidance: guidanceStruct,
    falsifiability: {
      ok: unfalsifiable.length === 0 && referenceText.length === 0,
      // [v2.15] reference-text 命中时不列 unfalsifiable problems：
      // 指南页「没有时间点」的根因是文本性质，再印一条「意图声明」
      // 等于用错误的理由描述正确的判定——两类标签不能同时贴。
      problems: referenceText.length > 0 ? [] : unfalsifiable,
    },
    // [v2.15] 文本性质：这条输入是不是「某个主体做出的预测」。
    // 指南/参考页文本（页面标题+简介）没有主张主体，与意图声明是两类对象。
    textNature: {
      isReferenceProse: referenceText.length > 0,
      markers: referenceText,
    },
    dueOn,
    dueBasis,
    settleable,
    baseRate,
    // [v2.16] 本地台账同类历史观测值（去重前后条数、去重数、兑现数）。
    // 样本不足不进基准概率时也如实展示，报告层渲染。
    localLedger,
    reasoning: {
      checks: reasoning,
      score: reasoningScore,
      maxScore: reasoning.length,
    },
    hasFalsifier,
    verdict,
    verdictLabel,
    // 置信度校准提示：宣称高置信度但基准概率低时给出警告
    calibrationWarning: buildCalibrationWarning(text, baseRate),
    note: '本结果只辨别预测的表述与结构质量，不判断其内容真假；'
      + '基准概率样本不足时已在 sample 字段标明，不得当统计结论引用。',
  };
}

/** 从文本推断预测类别（用于匹配基准概率）。 */
function inferCategory(text) {
  const t = String(text || '');
  if (/(监管|法案|禁令|批准|合规|regulat|ban|approv|law|act)/i.test(t)) return 'regulatory_action';
  if (/(性能|准确率|跑分|基准|提升|达到|benchmark|accuracy|performance)/i.test(t)) return 'capability_milestone';
  if (/(发布|上线|交付|推出|可用|GA|launch|ship|release|available)/i.test(t)) return 'vendor_delivery';
  if (/(研究|论文|学者|实验室|researcher|paper|study)/i.test(t)) return 'researcher_timeline';
  return 'vendor_delivery';
}

/** 宣称置信度 vs 基准概率的落差警告。 */
function buildCalibrationWarning(text, baseRate) {
  const m = text.match(/(\d{1,3})\s*%\s*(?:的)?(?:信心|把握|概率|置信|confidence|likely|chance)/i)
    || text.match(/(?:信心|把握|概率|置信|confidence)\s*(?:为|是|达)?\s*(\d{1,3})\s*%/i);
  if (!m) return null;
  const claimed = Number(m[1]) / 100;
  if (isNaN(claimed)) return null;
  const gap = claimed - baseRate.rate;
  if (gap <= 0.15) return null;
  return {
    claimed,
    baseRate: baseRate.rate,
    gap: Math.round(gap * 100) / 100,
    message: `宣称置信度 ${Math.round(claimed * 100)}%，同类基准概率 ${Math.round(baseRate.rate * 100)}%`
      + `（sample=${baseRate.sample}），落差 ${Math.round(gap * 100)} 个百分点。`
      + (baseRate.sample < 3 ? '注意：基准概率来自通用先验而非本地历史，此警告强度有限。' : ''),
  };
}

/**
 * 批量辨别 + 汇总。
 * @param {Array<object>} claims
 * @param {object} opts { ledger?: Array }
 */
function discriminateAll(claims, opts = {}) {
  const items = Array.isArray(claims) ? claims : [];
  const results = [];
  for (const c of items) {
    try {
      const r = discriminate(c, opts);
      if (r.available) results.push(r);
    } catch (_) { /* 单条失败不影响其他条 */ }
  }
  const byVerdict = {};
  for (const r of results) byVerdict[r.verdict] = (byVerdict[r.verdict] || 0) + 1;
  const settleable = results.filter(r => r.settleable);
  return {
    available: results.length > 0,
    audited: results.length,
    results,
    summary: {
      byVerdict,
      settleableCount: settleable.length,
      notForecastCount: byVerdict['not-a-forecast'] || 0,
      // [v2.15] 参考/指南文本单列：它不是「意图声明」，没有主张主体，
      // 混进 not-a-forecast 会让报告的辨别结论失真。
      referenceTextCount: byVerdict['reference-text'] || 0,
      // [v3.4] 财报指引条数（SEC EDGAR 一手备案的厂商自报预测）
      guidanceCount: byVerdict['earnings-guidance'] || 0,
      wellFormedCount: byVerdict['well-formed'] || 0,
      calibrationWarnings: results.filter(r => r.calibrationWarning).length,
    },
    note: '只辨别表述与结构，不判断内容真假；可结算的预测应登记进 prediction-ledger 到期结算 Brier。',
  };
}

module.exports = { discriminate, discriminateAll, inferCategory, DEFAULT_BASE_RATES };

if (require.main === module) {
  // 自测：四种典型形态
  const cases = [
    // [v3.4] 财报指引（带 EDGAR 元数据）：应判 earnings-guidance + settleable
    {
      text: 'Revenue is expected to be $108.0 billion, plus or minus 2%',
      source: 'SEC EDGAR', date: '2026-08-26', category: 'earnings_guidance',
      fiscalYearEnd: '0131',
      guidance: { quarter: 3, fiscalYear: 2027, metric: 'revenue', value: '$108.0 billion', tolerance: '2%', periodLabel: 'FY2027 Q3', caveats: ['NVIDIA is not assuming any Data Center compute revenue from China in its outlook.'] },
    },
    { text: 'OpenAI 将在 2027 年发布 GPT-7', source: 'Probe', date: '2026-10-20' },
    { text: 'AI 会继续进步，未来很美好', source: 'Probe', date: '2026-10-20' },
    { text: 'Gemini 5 将在 2027-Q2 GA，因为算力瓶颈已缓解；若 2027-Q1 未见预览版则说明延期', source: 'Probe', date: '2026-10-20' },
    { text: '我们有 95% 的信心在 2028 年实现 AGI', source: 'Probe', date: '2026-10-20' },
    // [v2.15] 指南/参考页文本：有义务句式还有时点，但不是预测
    { text: "The EU AI Act's Transparency Rules: A Practical Guide to Article 50  What providers and deployers must do by August 2026", source: 'EU AI Act Timeline', date: '2026-10-22' },
  ];
  for (const c of cases) {
    const r = discriminate(c);
    console.log(`\n[${r.verdict}] ${r.verdictLabel}`);
    console.log(`  文本: ${r.text.slice(0, 60)}`);
    console.log(`  dueOn: ${r.dueOn} | settleable: ${r.settleable} | 推理分: ${r.reasoning.score}/3`);
    console.log(`  基准概率: ${r.baseRate.rate} (sample=${r.baseRate.sample}, ${r.baseRate.source})`);
    if (r.calibrationWarning) console.log(`  ⚠ 校准警告: ${r.calibrationWarning.message}`);
    if (r.textNature && r.textNature.isReferenceProse) {
      console.log(`  文本性质: ${r.textNature.markers.map(m => m.label).join('、')}（非预测文本，不进台账）`);
    }
  }
}
