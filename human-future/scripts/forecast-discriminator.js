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
 * 2. 基准概率（base rate）
 *    - 从历史台账里找同类预测的实际兑现率
 *    - 无同类历史时用「宣布→交付」的通用基准（见 DEFAULT_BASE_RATES）
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

/** 通用基准概率：无同类历史时的默认锚。每个值都注明来源与口径。 */
const DEFAULT_BASE_RATES = {
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

/** 不可证伪的措辞模式：无主体、无时点、或纯价值判断。 */
const UNFALSIFIABLE_PATTERNS = [
  // [v2.13] no-timeline 必须同时认**相对时间**。
  // 实测踩坑：Anthropic 的 "by the end of this year" 不含 20xx，
  // 旧正则不认它，导致这条有明确结算点的预测被误判「无时间点」。
  // 相对时间词与 project-future.js 的 TIME_POINT 保持一致。
  { id: 'no-timeline', test: (t) => !/(20\d{2}|明年|后年|未来|个月内|年内|季度|Q[1-4]|H[12]|soon|by \d|within \d|this\s+year|end\s+of\s+(?:this\s+)?year|year[\s-]end|年底|今年|明年初|年底前|next\s+(?:year|quarter|month)|下季度|下个月)/i.test(t),
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

  // ── 1. 可证伪性 ─────────────────────────────────────────────
  const unfalsifiable = UNFALSIFIABLE_PATTERNS
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
  ];
  let timeMatch = text.match(/(20\d{2})(?:-Q([1-4])|-H([12])|-(\d{2}))?/)
    || text.match(/(\d+)\s*(?:个月|月内|months?)/i);
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
      if (r.re.test(text)) {
        dueOn = r.due();
        dueBasis = 'relative';
        break;
      }
    }
  }

  // ── 2. 基准概率 ─────────────────────────────────────────────
  const category = claim.category || inferCategory(text);
  const ledger = Array.isArray(opts.ledger) ? opts.ledger : [];
  const sameCat = ledger.filter(p => p.category === category && p.outcome !== null && p.outcome !== undefined);
  let baseRate;
  if (sameCat.length >= 3) {
    const hits = sameCat.filter(p => p.outcome === true).length;
    baseRate = {
      rate: Math.round((hits / sameCat.length) * 100) / 100,
      sample: sameCat.length,
      source: 'local-ledger',
      note: `本地台账同类已结算 ${sameCat.length} 条，命中 ${hits} 条`,
    };
  } else {
    const d = DEFAULT_BASE_RATES[category] || DEFAULT_BASE_RATES.vendor_delivery;
    baseRate = { rate: d.rate, sample: d.sample, source: 'default-prior', note: d.note };
  }

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
  if (unfalsifiable.length > 0) {
    verdict = 'not-a-forecast';
    verdictLabel = `不可证伪（${unfalsifiable.map(u => u.label).join('、')}）`;
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

  // 可结算性：有 dueOn 且可证伪
  const settleable = verdict !== 'not-a-forecast' && dueOn !== null;

  return {
    available: true,
    text: text.slice(0, 300),
    source: claim.source || '(未标注)',
    date: claim.date || null,
    url: claim.url || '',
    category,
    falsifiability: {
      ok: unfalsifiable.length === 0,
      problems: unfalsifiable,
    },
    dueOn,
    dueBasis,
    settleable,
    baseRate,
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
    { text: 'OpenAI 将在 2027 年发布 GPT-7', source: 'Probe', date: '2026-10-20' },
    { text: 'AI 会继续进步，未来很美好', source: 'Probe', date: '2026-10-20' },
    { text: 'Gemini 5 将在 2027-Q2 GA，因为算力瓶颈已缓解；若 2027-Q1 未见预览版则说明延期', source: 'Probe', date: '2026-10-20' },
    { text: '我们有 95% 的信心在 2028 年实现 AGI', source: 'Probe', date: '2026-10-20' },
  ];
  for (const c of cases) {
    const r = discriminate(c);
    console.log(`\n[${r.verdict}] ${r.verdictLabel}`);
    console.log(`  文本: ${r.text.slice(0, 60)}`);
    console.log(`  dueOn: ${r.dueOn} | settleable: ${r.settleable} | 推理分: ${r.reasoning.score}/3`);
    console.log(`  基准概率: ${r.baseRate.rate} (sample=${r.baseRate.sample}, ${r.baseRate.source})`);
    if (r.calibrationWarning) console.log(`  ⚠ 校准警告: ${r.calibrationWarning.message}`);
  }
}
