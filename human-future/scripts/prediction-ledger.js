#!/usr/bin/env node
'use strict';

/**
 * 预测台账 — human-future v2.4 第 6 个新模块
 *
 * v2.3 有"基准评测框架"的设计文档，但没有持久化台账，所以永远无法回答
 * "我们过去预测得准不准"。本模块把每次推演的概率预测落盘，
 * 到期自动结算出 Brier 分数和校准曲线 —— 让推演质量可被度量。
 */

const fs = require('fs');
const path = require('path');

const LEDGER_PATH = path.join(__dirname, '..', 'data', 'prediction-ledger.json');

function load() {
  if (!fs.existsSync(LEDGER_PATH)) return { version: '1.0.0', predictions: [] };
  try {
    return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf-8'));
  } catch {
    return { version: '1.0.0', predictions: [] };
  }
}

function save(ledger) {
  const dir = path.dirname(LEDGER_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2), 'utf-8');
}

/**
 * [v2.16] 同义务去重：同一现实事件被多个页面重复登记时只计一次。
 *
 * 实测依据（2026-10-24 台账实况）：3 条 EU AI Act 已结算条目来自
 * artificialintelligenceact.eu 的三个页面（the-scientific-panel /
 * the-advisory-forum / transparency-rules-article-50），是同一义务
 * （Article 50 透明度要求 2026-08 生效），5 个结算证据来源完全相同。
 * 不去重就把一次兑现计成三次——基准概率虚高到 100%，Brier 与校准
 * 曲线同样失真。SKILL.md v2.15 已把这条列为先决条件：「必须先做
 * 同义务去重再激活本地台账基准概率分支」。
 *
 * 判据（同一结算事件的签名，带上 category 防跨类目误合）：
 *   1. 有 evidence.sources → 排序后的来源集合（同一事件 = 同一组证据；
 *      连页面文案都不同的条目，只要结算证据相同就是同一事件）
 *   2. 无 evidence.sources → 归一化 claim 文本（同文 = 同主张；
 *      未结算条目的重复登记靠这条合并）
 *
 * [v3.5.1] 证据 key 补 dueOn 维度（v3.4 给文本 key 加过、漏了这条——
 * 同型修复必须穷举调用点）：SEC EDGAR 自动结算的 evidence.sources 是该
 * ticker 的备案链接，同一公司不同财季的结算（NVDA FY2027 Q1 与 Q2 指引
 * 是两次不同的承诺）会拿到同一组来源，不加 dueOn 就被并成一个义务——
 * 实测台账 11 条已结算被去成 5 条，Brier 样本与兑现率同步失真。同义务
 * （同时点同证据，如 3 条 EU AI Act）dueOn 相同，照常合并。
 *
 * @param {Array} predictions 台账条目（调用方应只传已结算的）
 * @returns {{entries: Array, dedupedCount: number}} entries 为去重后保留的条目
 */
function dedupeSameObligation(predictions) {
  const seen = new Set();
  const entries = [];
  let dedupedCount = 0;
  for (const p of (Array.isArray(predictions) ? predictions : [])) {
    const cat = p.category || p.domain || 'general';
    const srcs = p.evidence && Array.isArray(p.evidence.sources) ? p.evidence.sources : [];
    // [v3.13] 证据 key 补 metric+口径维度：同一份备案同财季的**不同指标**
    // 指引（营收 vs 毛利率 vs EPS，GAAP vs 非 GAAP）是不同的可证伪主张，
    // 旧 key（类目+dueOn+证据源）把它们并成一个义务——v3.13 轮实测 7 条
    // 新结算（MRVL 毛利率×4/EPS×2+AMZN 营业利润）被并成 1 个，Brier
    // 样本失真（与 v3.4 修 dueOn 同型：那次是跨财季误合，这次是跨指标/
    // 跨口径误合）。旧条目 evidence 无这两个字段→空后缀，分组不变。
    const evMetric = (p.evidence && p.evidence.metric) || '';
    const evBasis = (p.evidence && p.evidence.gaapBasis) || '';
    const key = srcs.length > 0
      ? `ev|${cat}|${p.dueOn || ''}|${srcs.map(s => String(s)).sort().join('|')}|${evMetric}|${evBasis}`
    // [v3.4] 文本 key 带 dueOn：同一指标的指引跨财季会同文（实测 AMD
    // Q2/Q3 2026 两句都是 "gross margin ... approximately 56%"），它们是两次
    // 不同的承诺，结算时合并会把两次兑现计成一次——与 v2.16 要修的「同义务
    // 重复计数」正好相反。带 dueOn 后同义务（同时点同文）仍合并，跨期同文
    // 保持独立。
      : `cl|${cat}|${p.dueOn || ''}|${String(p.claim || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ').trim()}`;
    if (seen.has(key)) { dedupedCount++; continue; }
    seen.add(key);
    entries.push(p);
  }
  return { entries, dedupedCount };
}

/**
 * 登记一条预测。
 * @param {{id, claim, probability, dueOn, rationale?, domain?}} p
 */
function record(p) {
  if (!p.id || typeof p.probability !== 'number') throw new Error('预测需要 id 与 probability');
  if (p.probability < 0 || p.probability > 1) throw new Error('probability 必须在 0..1');
  const ledger = load();
  if (ledger.predictions.some((x) => x.id === p.id)) throw new Error(`预测 id 已存在: ${p.id}`);
  ledger.predictions.push({
    id: p.id,
    claim: p.claim,
    probability: p.probability,
    domain: p.domain || 'general',
    // [v2.16] category 双写：辨别器按 category 匹配同类历史，而这里
    // 历史上只写 domain（值域本就是辨别器的类目词）。旧代码读 p.category
    // 恒为 undefined，「本地台账同类历史」分支自 v2.13 起从未激活。
    // 双写后新条目两个字段都在；历史条目由辨别器侧兼容读取兜底。
    category: p.category || p.domain || 'general',
    rationale: p.rationale || '',
    createdAt: new Date().toISOString(),
    dueOn: p.dueOn || null,
    // [v3.5] 财报指引结构化结算元数据：到期时据此与「下一期财报实际值」
    // 配对结算（见 earnings-settlement.js）。没有它的历史 earnings_guidance
    // 条目由结算层用当期 EDGAR 指引句反推（句匹配），本条只服务新登记。
    settlement: p.settlement || null,
    outcome: null,       // null=未到期, true=发生, false=未发生
    settledAt: null
  });
  save(ledger);
  return ledger.predictions[ledger.predictions.length - 1];
}

/**
 * 结算一条到期预测。
 *
 * [v2.13] evidence 必填理由：结算不留证据，Brier 分数就不可审计——
 * 「已结算」会变成一句无法验证的断言。必须能回答「凭什么判它兑现/未兑现」。
 *
 * @param {string} id
 * @param {boolean} outcome
 * @param {{sources?: string[], summary?: string, settledBy?: string, metric?: string, gaapBasis?: string}} [evidence]
 */
function settle(id, outcome, evidence) {
  const ledger = load();
  const p = ledger.predictions.find((x) => x.id === id);
  if (!p) throw new Error(`找不到预测: ${id}`);
  if (typeof outcome !== 'boolean') throw new Error('outcome 必须是布尔值');
  // [v2.13] 证据必填：至少给出来源或摘要，否则拒绝结算。
  // 不静默填充默认值——那会让「无证据结算」看起来像正常流程。
  if (!evidence || typeof evidence !== 'object'
      || (!Array.isArray(evidence.sources) || evidence.sources.length === 0)
      && typeof evidence.summary !== 'string') {
    throw new Error('结算必须带 evidence（sources 数组或 summary 字符串）——不留证据的结算不可审计');
  }
  p.outcome = outcome;
  p.settledAt = new Date().toISOString();
  p.evidence = {
    sources: Array.isArray(evidence.sources) ? evidence.sources.slice(0, 8) : [],
    summary: String(evidence.summary || '').slice(0, 500),
    settledBy: String(evidence.settledBy || 'unspecified'),
    // [v3.13] 结算指标族与 GAAP 口径随证据落账：同义务去重
    // （dedupeSameObligation）的证据 key 靠这两个维度区分同财季的不同
    // 指标指引——只传不落账，去重 key 永远读空后缀，「同财季的营收/
    // 毛利率/EPS 是四个义务」的修复在 live 数据上不生效（端到端断链）。
    // 旧结算不补字段（无来源），去重 key 对旧条目走空后缀、分组不变。
    ...(typeof evidence.metric === 'string' && evidence.metric ? { metric: evidence.metric } : {}),
    ...(typeof evidence.gaapBasis === 'string' && evidence.gaapBasis ? { gaapBasis: evidence.gaapBasis } : {}),
  };
  save(ledger);
  return p;
}

/** 到期未结算的清单 */
function overdue(now = new Date()) {
  return load().predictions.filter(
    (p) => p.outcome === null && p.dueOn && new Date(p.dueOn) <= now
  );
}

/** 评分：Brier + 按置信度分桶的实际命中率 */
function scorecard() {
  // [v2.16] 同义务去重后再算：同一事件被多个页面重复登记时，一个结果
  // 会被计成多个样本（实测台账 3 条 EU AI Act 同义务条目），Brier 与
  // 校准曲线全部失真。去重痕迹写进返回值，可审计。
  const settledRaw = load().predictions.filter((p) => p.outcome !== null);
  const dedup = dedupeSameObligation(settledRaw);
  const settled = dedup.entries;
  if (!settled.length) return { brier: null, sample: 0, calibration: [], hitRate: null };
  const brier = settled.reduce((s, p) => s + Math.pow(p.probability - (p.outcome ? 1 : 0), 2), 0) / settled.length;
  const hitRate = settled.filter((p) => p.outcome).length / settled.length;
  const bins = [0, 0.2, 0.4, 0.6, 0.8].map((lo, i, arr) => {
    const hi = i === arr.length - 1 ? 1.001 : arr[i + 1];
    const inBin = settled.filter((p) => p.probability >= lo && p.probability < hi);
    return {
      range: `${lo.toFixed(1)}-${Math.min(hi, 1).toFixed(1)}`,
      count: inBin.length,
      observed: inBin.length ? inBin.filter((p) => p.outcome).length / inBin.length : null,
      expected: (lo + Math.min(hi, 1)) / 2
    };
  });
  return { brier: Number(brier.toFixed(4)), sample: settled.length, hitRate: Number(hitRate.toFixed(3)), calibration: bins,
    // [v2.16] 去重痕迹：原始登记条数与去重后样本数分开记录，
    // 「样本被合并过」这件事必须可审计，不能静默。
    settledRaw: settledRaw.length, deduped: dedup.dedupedCount };
}

module.exports = { record, settle, overdue, scorecard, load, dedupeSameObligation, LEDGER_PATH };

if (require.main === module) {
  // 自测：跑完自动清理，不污染真实台账
  const lib = require('./prediction-ledger.js');
  const fs2 = require('fs');
  const backup = fs2.existsSync(lib.LEDGER_PATH) ? fs2.readFileSync(lib.LEDGER_PATH) : null;
  try {
    lib.record({ id: 'selftest-1', claim: '自测：深部脑区光遗传学 2027 前有人体登记', probability: 0.72, dueOn: '2027-12-31', domain: 'neuro' });
    lib.record({ id: 'selftest-2', claim: '自测：量子定义战争 2027 前有立场论文', probability: 0.78, dueOn: '2027-12-31', domain: 'quantum' });
    // [v3.4 维护] v2.13 给 settle() 加了 evidence 必填，但模块自测没跟着改——
    // 自测从 v2.13 起一直在抛错（stash 对照实证：原代码同样失败），
    // 「自测完成」的假象来自 finally 还原。补上 evidence。
    lib.settle('selftest-1', false, { summary: '自测：未发生', sources: ['https://example.com/selftest'] });
    lib.settle('selftest-2', true, { summary: '自测：已发生', sources: ['https://example.com/selftest'] });
    console.log('台账评分:', JSON.stringify(lib.scorecard(), null, 1));
    console.log('到期未结算:', JSON.stringify(lib.overdue(new Date('2028-01-01'))));
  } finally {
    if (backup === null) fs2.unlinkSync(lib.LEDGER_PATH);
    else fs2.writeFileSync(lib.LEDGER_PATH, backup);
    console.log('自测完成，台账已还原');
  }
}
