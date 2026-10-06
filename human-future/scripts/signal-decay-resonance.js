#!/usr/bin/env node
'use strict';

/**
 * 信号衰减/共振检测 — human-future v2.4 第 8 个新模块
 *
 * 一条新闻热三天就消失，另一条十年后成为范式转移。本模块对同一主题的
 * 信号序列做频率与衰减分析，区分"一次性事件"与"持续趋势"。
 */

/** 丰度：某主题在各期的计数 */
function signalAbundance(series) {
  // series: [{period: '2026-W40', topic: 'ai-safety', count: 5}]
  const byTopic = new Map();
  for (const s of series) {
    if (!byTopic.has(s.topic)) byTopic.set(s.topic, []);
    byTopic.get(s.topic).push(s);
  }
  return byTopic;
}

/**
 * 衰减率：用首尾两点估算半衰期。count 序列若单调趋 0 → 一次性事件。
 * @returns {number|null} 每期衰减比例；null 表示数据不足
 */
function decayRate(counts) {
  if (counts.length < 3) return null;
  const nz = counts.map((c) => Math.max(c, 0.0001));
  const first = nz[0];
  const last = nz[nz.length - 1];
  if (last >= first) return 0; // 没有衰减
  const halfLife = Math.log(0.5) / Math.log(last / first) * (nz.length - 1);
  return Number((halfLife > 0 ? halfLife : Infinity).toFixed(2));
}

/** 趋势判定 */
function classify(series, topic) {
  const rows = series
    .filter((s) => s.topic === topic)
    .sort((a, b) => String(a.period).localeCompare(String(b.period)));
  const counts = rows.map((r) => r.count);
  const hl = decayRate(counts);
  const total = counts.reduce((a, b) => a + b, 0);

  let verdict;
  if (hl === null) verdict = 'insufficient-data';
  else if (hl === 0 || hl === Infinity) verdict = 'growing-or-flat';
  else if (hl < 4) verdict = 'one-off (快速衰减)';
  else if (hl < 12) verdict = 'trend (持续趋势)';
  else verdict = 'structural (结构性转变)';

  return { topic, periods: rows.length, total, halfLifePeriods: hl, verdict };
}

module.exports = { signalAbundance, decayRate, classify };

if (require.main === module) {
  const series = [
    { period: '2026-W35', topic: 'ai-agent-safety', count: 1 },
    { period: '2026-W36', topic: 'ai-agent-safety', count: 2 },
    { period: '2026-W37', topic: 'ai-agent-safety', count: 4 },
    { period: '2026-W38', topic: 'ai-agent-safety', count: 8 },
    { period: '2026-W39', topic: 'ai-agent-safety', count: 12 },
    { period: '2026-W40', topic: 'ai-agent-safety', count: 16 },
    { period: '2026-W30', topic: 'foldable-iphone', count: 40 },
    { period: '2026-W31', topic: 'foldable-iphone', count: 22 },
    { period: '2026-W32', topic: 'foldable-iphone', count: 6 },
    { period: '2026-W33', topic: 'foldable-iphone', count: 1 }
  ];
  console.log(JSON.stringify(classify(series, 'ai-agent-safety'), null, 1));
  console.log(JSON.stringify(classify(series, 'foldable-iphone'), null, 1));
}
