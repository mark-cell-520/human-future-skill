#!/usr/bin/env node
'use strict';

/**
 * 认知公式桥 — human-future v2.4 新增模块
 *
 * 把人类未来推演从"叙事"升级为"可计算"：用 5 个认知科学/决策论公式
 * 对推演结果做量化评估。全部公式本地实现，无外部依赖。
 *
 * 为什么算真升级：它给推演提供了 v2.3 完全没有的"校准"维度 ——
 * 推演不再只能给方向，还能给出置信度、时间估计、风险期望值。
 */

// ---- 1. 贝叶斯更新：新证据如何改变某预测的概率 ----
function bayesUpdate(prior, likelihoodGivenH, likelihoodGivenNotH) {
  const pEH = likelihoodGivenH, pEnH = likelihoodGivenNotH;
  const num = pEH * prior;
  const den = num + pEnH * (1 - prior);
  return den === 0 ? prior : num / den;
}

// ---- 2. Brier 评分：概率预测的校准误差（越小越好）----
function brierScore(predictions) {
  if (!predictions.length) return null;
  const sum = predictions.reduce((acc, p) => {
    const outcome = p.outcome ? 1 : 0;
    return acc + Math.pow(p.probability - outcome, 2);
  }, 0);
  return sum / predictions.length;
}

// ---- 3. 校准曲线：把预测按置信度分桶，看实际命中率 ----
function calibrationCurve(predictions, buckets = 5) {
  const bins = Array.from({ length: buckets }, () => ({ count: 0, hit: 0, lo: 0, hi: 0 }));
  for (const p of predictions) {
    const idx = Math.min(buckets - 1, Math.floor(p.probability * buckets));
    bins[idx].count += 1;
    bins[idx].hit += p.outcome ? 1 : 0;
  }
  return bins.map((b, i) => ({
    range: `${(i / buckets).toFixed(1)}-${((i + 1) / buckets).toFixed(1)}`,
    count: b.count,
    observed: b.count ? b.hit / b.count : null,
    expected: (i + 0.5) / buckets
  }));
}

// ---- 4. 指数折现：远期影响的现值权重 ----
function exponentialDiscount(futureValue, annualRate, years) {
  return futureValue / Math.pow(1 + annualRate, years);
}

// ---- 5. 风险期望值 + 最坏情况加权（风险厌恶版）----
function riskAdjustedExpectation(scenarios) {
  // scenarios: [{probability, impact(-1..1), worstCase?: bool}]
  let ev = 0;
  let worstEv = 0;
  for (const s of scenarios) {
    ev += s.probability * s.impact;
    if (s.worstCase) worstEv = s.probability * s.impact;
  }
  return { expectedValue: ev, worstCaseContribution: worstEv };
}

/**
 * 对一次推演输出做公式化评估。
 * @param {object} projection 推演结果（含 predictions/milestones/scenarios 可选）
 * @returns {object} 公式化评估报告
 */
function runFormulaBridge(projection = {}) {
  const out = { module: 'cognitive-formula-bridge', version: '1.0.0', formulas: {} };

  // 贝叶斯：把"某里程碑按期发生"的先验 + 今日新闻证据强度做一次更新
  if (projection.milestone) {
    const before = projection.milestone.prior || 0.5;
    const after = bayesUpdate(before, projection.milestone.evidenceStrength || 0.6, 0.4);
    out.formulas.bayes = { prior: before, posterior: Number(after.toFixed(4)), delta: Number((after - before).toFixed(4)) };
  }

  // Brier + 校准：需要历史预测台账
  if (Array.isArray(projection.predictionLedger) && projection.predictionLedger.length) {
    const ledger = projection.predictionLedger;
    out.formulas.brier = { score: Number((brierScore(ledger) ?? -1).toFixed(4)), sample: ledger.length };
    out.formulas.calibration = calibrationCurve(ledger);
  }

  // 折现：远期里程碑的权重
  if (projection.milestone && projection.milestone.yearsAhead) {
    const rate = projection.discountRate ?? 0.1;
    out.formulas.discount = {
      annualRate: rate,
      years: projection.milestone.yearsAhead,
      weight: Number(exponentialDiscount(1, rate, projection.milestone.yearsAhead).toFixed(4))
    };
  }

  // 风险期望
  if (Array.isArray(projection.scenarios) && projection.scenarios.length) {
    out.formulas.risk = riskAdjustedExpectation(projection.scenarios);
  }

  return out;
}

module.exports = {
  bayesUpdate, brierScore, calibrationCurve, exponentialDiscount,
  riskAdjustedExpectation, runFormulaBridge
};

if (require.main === module) {
  // 自测：必须真跑出数字才算这个模块活着
  const demo = runFormulaBridge({
    milestone: { prior: 0.5, evidenceStrength: 0.75, yearsAhead: 2 },
    discountRate: 0.1,
    predictionLedger: [
      { probability: 0.9, outcome: true }, { probability: 0.8, outcome: true },
      { probability: 0.7, outcome: false }, { probability: 0.3, outcome: false },
      { probability: 0.6, outcome: true }
    ],
    scenarios: [
      { probability: 0.5, impact: 0.6 },
      { probability: 0.1, impact: -0.9, worstCase: true }
    ]
  });
  console.log(JSON.stringify(demo, null, 2));
}
