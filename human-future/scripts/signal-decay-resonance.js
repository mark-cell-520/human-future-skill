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
/**
 * 信号衰减率。
 *
 * [v2.10 重写] 旧实现只比较首尾两点（counts[0] vs counts[n-1]），中间形态完全
 * 看不见。实测后果：8 个活跃域里 7 个判 growing-or-flat，判定退化成常数。
 * 反例（都是真实会出现的形态）：
 *   [1, 16, 8, 4, 2]  —— 尖峰后衰减，典型一次性事件。首尾 1→2 判"没有衰减"。
 *   [1, 1, 1, 1, 16]  —— 长期平台后突增。首尾 1→16 判"growing"，中间平台丢失。
 *   [16, 1, 2, 4, 8]  —— 首周异常高后进入上升。首尾 16→8 判"有半衰期"，
 *                        但后半段其实在增长。
 *
 * 新实现：对 log(计数) 做最小二乘线性回归，用**斜率**而非首尾差。
 *   - 斜率 ≈ 0      → 平稳
 *   - 斜率 > 0      → 增长，由半衰期换算公式反推"增长半衰期"
 *   - 斜率 < 0      → 衰减，直接给半衰期
 * 同时保留旧字段名 halfLifePeriods，语义扩展为「形态尺度」：
 *   衰减 = 计数减半所需周期数；增长 = 计数翻倍所需周期数。
 * 这样 growing-or-flat 只会在真的没有趋势时出现。
 *
 * @param {number[]} counts 按周期排序的计数序列
 * @returns {number|null} null = 样本不足；Infinity = 完全平稳；否则为半衰期/倍增周期数
 */
function decayRate(counts) {
  if (!Array.isArray(counts) || counts.length < 3) return null;
  const nz = counts.map((c) => Math.max(c, 0.0001));
  const n = nz.length;
  const xs = nz.map((_, i) => i);
  const ys = nz.map((c) => Math.log(c));

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return Infinity;   // 只有一个周期有值（去重后），无从判断
  const slope = num / den;          // log 空间的每周变化率
  if (Math.abs(slope) < 0.01) return Infinity;   // 视为平稳

  // log 空间斜率 → 半衰期/倍增周期数。
  // 斜率<0 衰减：|slope| 个 log 单位/周，减半需 ln0.5/|slope| 周
  // 斜率>0 增长：翻倍需 ln2/slope 周
  const scale = slope < 0 ? Math.log(0.5) / slope : Math.log(2) / slope;
  return Number((scale > 0 ? scale : Infinity).toFixed(2));
}

/** 趋势判定 */
function classify(series, topic) {
  const rows = series
    .filter((s) => s.topic === topic)
    .sort((a, b) => String(a.period).localeCompare(String(b.period)));
  const counts = rows.map((r) => r.count);
  const hl = decayRate(counts);
  const total = counts.reduce((a, b) => a + b, 0);

  // [v2.10] 判定口径随 decayRate 重写调整：
  //   旧实现返回 0 表示"没有衰减"（= growing），Infinity 表示平稳；
  //   新实现返回 Infinity 表示平稳，正数既可能是衰减半衰期也可能是倍增周期。
  //   因此必须从原始序列判断方向，不能只看 hl 的数值大小。
  //
  //   另外必须单独识别**尖峰形态** [1,16,8,4,2]：这类序列首尾接近、对数回归
  //   斜率接近 0，会被判成 growing-or-flat，但它恰恰是最典型的一次性事件。
  //   判据：最大值不在首尾两端，且最大值 >= 3 倍中位数。
  let verdict;
  let direction = 'flat';
  let shape = 'steady';
  if (hl === null) {
    verdict = 'insufficient-data';
  } else {
    const max = Math.max(...counts);
    const maxIdx = counts.indexOf(max);
    const sorted = [...counts].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const isPeak = maxIdx > 0 && maxIdx < counts.length - 1
      && max >= Math.max(3 * median, 3);
    const first = Math.max(counts[0], 0.0001);
    const last = Math.max(counts[counts.length - 1], 0.0001);

    const isLeadingOutlier = maxIdx === 0 && max >= Math.max(3 * median, 3)
      && last > counts[1] * 1.5;

    if (isLeadingOutlier) {
      // 首端异常高且后续重新上升：[16,1,2,4,8] —— 首周计数远超后续，
      // 但末位又显著高于第二周，说明首周是采集起点异常（常见于新接入源的
      // 第一批全量条目），不是真实起点。判 one-off 而非 growing-or-flat。
      // 必须放在 hl===Infinity 分支**之前**：这类序列首尾对称、回归斜率接近 0，
      // hl 也是 Infinity，若先判 Infinity 会被当成"平稳"放过去（实测踩过）。
      // 必须加 last > counts[1]*1.5 条件：否则 [16,8,4,2,1] 这种正常单调
      // 衰减也会被误判。
      shape = 'leading-outlier';
      direction = 'decaying';
      verdict = 'one-off (快速衰减)';
    } else if (isPeak) {
      shape = 'spike';
      direction = 'decaying';
      verdict = 'one-off (快速衰减)';
    } else if (hl === Infinity || hl === 0) {
      // [v2.10] hl===0 是旧 decayRate 实现的"没有衰减"返回值。新实现不会
      // 产生 0（斜率 <0.01 时返回 Infinity）。这里仍显式处理 0，是为了让
      // 回归测试有效：把 decayRate 换回旧实现时必须被断言抓到，而不是
      // 静默落进下面的 hl<2 分支把平稳序列判成一次性事件（实测踩过）。
      verdict = 'growing-or-flat';
      direction = Math.abs(last - first) / first < 0.05 ? 'flat' : (last > first ? 'rising' : 'decaying');
    } else {
      direction = last > first * 1.05 ? 'rising' : (last < first * 0.95 ? 'decaying' : 'flat');
      if (direction === 'rising') verdict = 'growing-or-flat';
      // [v2.10] 阈值从 4 降到 2：实测 [100,80,64,51,41]（每周衰减约 20%，
      // 半衰期 3.1 周）是典型的缓慢持续下降，被 hl<4 判成 one-off 是误判。
      // 一次性事件的真实形态是半衰期 1-2 周内归零（发布当天爆、下周就没了）。
      // 2-12 周才是持续趋势，>12 周是结构性转变。
      else if (hl < 2) verdict = 'one-off (快速衰减)';
      else if (hl < 12) verdict = 'trend (持续趋势)';
      else verdict = 'structural (结构性转变)';
    }
  }

  return { topic, periods: rows.length, total, halfLifePeriods: hl, direction, shape, verdict };
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
