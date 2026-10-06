#!/usr/bin/env node
'use strict';

/**
 * 时间窗冲突检测器 — human-future v2.4 第 4 个新模块
 *
 * 推演里最常见的错是"把不同时间表的事件压到同一年"。本模块把多个
 * roadmap 时间点放进同一时间轴，标出哪些被提前、哪些被推迟、哪些互斥。
 */

function parseWindow(spec) {
  // 支持 "2026", "2026-Q4", "2027-H1", "by 2028", "2026-10"
  const s = String(spec).trim();
  const m = s.match(/(\d{4})(?:-Q([1-4])|-H([12])|-(\d{2}))?/);
  if (!m) return null;
  const year = Number(m[1]);
  let q = 4;
  if (m[2]) q = Number(m[2]);
  else if (m[3]) q = Number(m[3]) === 1 ? 2 : 4;
  else if (m[4]) q = Math.ceil(Number(m[4]) / 3);
  return { year, quarter: q, raw: s, sortKey: year * 10 + Math.min(q, 4) };
}

/**
 * @param {Array<{id, label, claimed, verified?}>} milestones
 * @returns {{ordered, conflicts, summary}}
 */
function detectTimelineConflicts(milestones) {
  const parsed = milestones
    .map((m) => ({ ...m, w: parseWindow(m.claimed) }))
    .filter((m) => m.w)
    .sort((a, b) => a.w.sortKey - b.w.sortKey);

  const conflicts = [];
  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      const a = parsed[i], b = parsed[j];
      // 依赖关系：b 声称不晚于 a，但排序显示 b 更晚 → 提前了
      if (a.dependsOn && a.dependsOn === b.id && a.w.sortKey > b.w.sortKey) {
        conflicts.push({
          type: 'dependency-violation',
          a: a.id, b: b.id,
          detail: `${a.label} 声称 ${a.claimed}，但依赖的 ${b.label} 排在 ${b.claimed} 之后`
        });
      }
      // 互斥关系必须双向判定：声明可能只在任一端出现
      const mutuallyExclusive = a.mutuallyExclusive === b.id || b.mutuallyExclusive === a.id;
      if (mutuallyExclusive && a.w.sortKey === b.w.sortKey) {
        conflicts.push({
          type: 'same-slot',
          a: a.id, b: b.id,
          detail: `${a.label} 与 ${b.label} 互斥却排在同一个时间片`
        });
      }
    }
  }

  return {
    ordered: parsed.map((m) => `${m.w.raw.padEnd(10)} ${m.label}${m.verified ? '  [已证实]' : '  [未证实]'}`),
    conflicts,
    summary: {
      total: parsed.length,
      verified: parsed.filter((m) => m.verified).length,
      claimed: parsed.length - parsed.filter((m) => m.verified).length,
      conflicts: conflicts.length
    }
  };
}

module.exports = { detectTimelineConflicts, parseWindow };

if (require.main === module) {
  // 自测：Artemis 真实时间表（这正是 v4 报告出错的地方）
  const res = detectTimelineConflicts([
    { id: 'a2', label: 'Artemis II 载人绕月', claimed: '2026-04', verified: true },
    { id: 'a3', label: 'Artemis III 交会演示', claimed: '2027', verified: false },
    { id: 'a4', label: 'Artemis IV 首次载人登月', claimed: '2028-H1', verified: false, dependsOn: 'a3' },
    { id: 'wrong', label: '（v4 错误口径）登月', claimed: '2026-04', verified: false, mutuallyExclusive: 'a2' }
  ]);
  console.log(res.ordered.join('\n'));
  console.log('\n冲突:');
  res.conflicts.forEach((c) => console.log(`  [${c.type}] ${c.detail}`));
  console.log('\n汇总:', JSON.stringify(res.summary));
}
