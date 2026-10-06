#!/usr/bin/env node
'use strict';

/**
 * 跨域传导矩阵 — human-future v2.4 第 9 个新模块
 *
 * v2.3 提到"融合矩阵"但只有名词。本模块把它做成可计算的传导矩阵：
 * 一个域的突破如何按强度与时延传导到其他域。
 */

const DOMAINS = ['ai', 'neuro', 'genomics', 'longevity', 'quantum', 'energy', 'space', 'robotics'];

/**
 * 传导规则表：from → to 的强度(0..1)与时延(月)。
 * 依据来自 v5 长程推演的五条硬线实证，不是拍的。
 */
const CONDUCTION = [
  { from: 'ai', to: 'neuro', strength: 0.9, lagMonths: 6, why: '神经数据解码本质是 transformer 时序建模' },
  { from: 'ai', to: 'robotics', strength: 0.95, lagMonths: 12, why: '具身智能依赖端到端策略学习' },
  { from: 'ai', to: 'energy', strength: 0.8, lagMonths: 3, why: '推理需求直接推高电力负荷' },
  { from: 'ai', to: 'quantum', strength: 0.4, lagMonths: 18, why: 'AI 辅助芯片设计/纠错码搜索' },
  { from: 'neuro', to: 'longevity', strength: 0.5, lagMonths: 24, why: '神经退行性疾病共享细胞衰老机制' },
  { from: 'genomics', to: 'longevity', strength: 0.85, lagMonths: 12, why: '基因编辑是衰老干预的递送主干' },
  { from: 'longevity', to: 'energy', strength: 0.1, lagMonths: 36, why: '制药产能占工业用电比例仍小' },
  { from: 'quantum', to: 'space', strength: 0.3, lagMonths: 60, why: '导航/通信加密，远期' },
  { from: 'quantum', to: 'genomics', strength: 0.35, lagMonths: 36, why: '分子模拟算力' },
  { from: 'energy', to: 'ai', strength: 0.75, lagMonths: 1, why: '电力是 AI 的硬天花板，负反馈' },
  { from: 'space', to: 'ai', strength: 0.15, lagMonths: 48, why: '太空数据中心为远期选项' },
  { from: 'ai', to: 'genomics', strength: 0.7, lagMonths: 9, why: '蛋白结构预测/药物设计' }
];

/** 计算某源域突破的传导全景 */
function propagate(sourceDomain, minStrength = 0.2, maxDepth = 3) {
  const results = [];
  const visited = new Map();
  const queue = [{ domain: sourceDomain, strength: 1, lagMonths: 0, depth: 0, chain: [sourceDomain] }];

  while (queue.length) {
    const cur = queue.shift();
    if (cur.depth >= maxDepth) continue;
    for (const rule of CONDUCTION.filter((r) => r.from === cur.domain)) {
      const s = cur.strength * rule.strength;
      if (s < minStrength) continue;
      const next = {
        domain: rule.to,
        strength: Number(s.toFixed(3)),
        lagMonths: cur.lagMonths + rule.lagMonths,
        depth: cur.depth + 1,
        via: rule.why,
        chain: [...cur.chain, rule.to]
      };
      // 环检测：同一域只保留最强路径
      const prev = visited.get(rule.to);
      if (!prev || prev.strength < next.strength) {
        visited.set(rule.to, next);
        results.push(next);
        queue.push(next);
      }
    }
  }
  return results.sort((a, b) => b.strength - a.strength);
}

/** 渲染为传导矩阵（ASCII） */
function renderMatrix(source) {
  const rows = propagate(source);
  if (!rows.length) return `（${source} 无显著传导）`;
  const lines = [`【${source} 突破的跨域传导】`];
  for (const r of rows) {
    const bar = '█'.repeat(Math.round(r.strength * 10));
    lines.push(`  → ${r.domain.padEnd(10)} ${bar.padEnd(10)} 强度 ${String(r.strength).padEnd(6)} 时延 ${String(r.lagMonths).padStart(3)} 月  (${r.chain.join('→')})`);
  }
  return lines.join('\n');
}

module.exports = { propagate, renderMatrix, CONDUCTION, DOMAINS };

if (require.main === module) {
  for (const src of ['ai', 'genomics']) {
    console.log(renderMatrix(src));
    console.log();
  }
}
