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
    rationale: p.rationale || '',
    createdAt: new Date().toISOString(),
    dueOn: p.dueOn || null,
    outcome: null,       // null=未到期, true=发生, false=未发生
    settledAt: null
  });
  save(ledger);
  return ledger.predictions[ledger.predictions.length - 1];
}

/** 结算一条到期预测 */
function settle(id, outcome) {
  const ledger = load();
  const p = ledger.predictions.find((x) => x.id === id);
  if (!p) throw new Error(`找不到预测: ${id}`);
  if (typeof outcome !== 'boolean') throw new Error('outcome 必须是布尔值');
  p.outcome = outcome;
  p.settledAt = new Date().toISOString();
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
  const settled = load().predictions.filter((p) => p.outcome !== null);
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
  return { brier: Number(brier.toFixed(4)), sample: settled.length, hitRate: Number(hitRate.toFixed(3)), calibration: bins };
}

module.exports = { record, settle, overdue, scorecard, load, LEDGER_PATH };

if (require.main === module) {
  // 自测：跑完自动清理，不污染真实台账
  const lib = require('./prediction-ledger.js');
  const fs2 = require('fs');
  const backup = fs2.existsSync(lib.LEDGER_PATH) ? fs2.readFileSync(lib.LEDGER_PATH) : null;
  try {
    lib.record({ id: 'selftest-1', claim: '自测：深部脑区光遗传学 2027 前有人体登记', probability: 0.72, dueOn: '2027-12-31', domain: 'neuro' });
    lib.record({ id: 'selftest-2', claim: '自测：量子定义战争 2027 前有立场论文', probability: 0.78, dueOn: '2027-12-31', domain: 'quantum' });
    lib.settle('selftest-1', false);
    lib.settle('selftest-2', true);
    console.log('台账评分:', JSON.stringify(lib.scorecard(), null, 1));
    console.log('到期未结算:', JSON.stringify(lib.overdue(new Date('2028-01-01'))));
  } finally {
    if (backup === null) fs2.unlinkSync(lib.LEDGER_PATH);
    else fs2.writeFileSync(lib.LEDGER_PATH, backup);
    console.log('自测完成，台账已还原');
  }
}
