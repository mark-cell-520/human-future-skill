#!/usr/bin/env node
'use strict';

/**
 * 自我修正登记簿 — human-future v2.4 第 10 个新模块
 *
 * 铁律：错误推演必须显式记录并给出更正后结论，不得静默改掉。
 * v4 报告把"绕月"误作"登月"、年份提前两年，就是本模块要抓的那类错误。
 * 每次修正落盘，下次推演先读簿子再说话。
 */

const fs = require('fs');
const path = require('path');

const CORRECTIONS_PATH = path.join(__dirname, '..', 'data', 'self-corrections.json');

function load() {
  if (!fs.existsSync(CORRECTIONS_PATH)) return { version: '1.0.0', corrections: [] };
  try {
    return JSON.parse(fs.readFileSync(CORRECTIONS_PATH, 'utf-8'));
  } catch {
    return { version: '1.0.0', corrections: [] };
  }
}

/**
 * 登记一次修正。
 * @param {{id, reportVersion, wrongClaim, rightClaim, evidence, lesson, severity?}} c
 */
function record(c) {
  if (!c.id || !c.wrongClaim || !c.rightClaim) {
    throw new Error('修正需要 id / wrongClaim / rightClaim');
  }
  const book = load();
  if (book.corrections.some((x) => x.id === c.id)) throw new Error(`修正 id 已存在: ${c.id}`);
  book.corrections.push({
    id: c.id,
    reportVersion: c.reportVersion || null,
    wrongClaim: c.wrongClaim,
    rightClaim: c.rightClaim,
    evidence: c.evidence || '',
    lesson: c.lesson || '',
    severity: c.severity || 'medium', // low | medium | high
    recordedAt: new Date().toISOString()
  });
  const dir = path.dirname(CORRECTIONS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CORRECTIONS_PATH, JSON.stringify(book, null, 2), 'utf-8');
  return book.corrections[book.corrections.length - 1];
}

/** 教训清单：供下次推演前通读 */
function lessons() {
  return load().corrections.map((c) => ({
    wrong: c.wrongClaim,
    right: c.rightClaim,
    lesson: c.lesson,
    severity: c.severity
  }));
}

/** 高危错误的模式归纳 —— 这些是推演时最该先自查的 */
function recurringPatterns() {
  const cs = load().corrections;
  const high = cs.filter((c) => c.severity === 'high');
  return {
    total: cs.length,
    highSeverity: high.length,
    topLessons: high.map((c) => c.lesson)
  };
}

module.exports = { record, lessons, recurringPatterns, load, CORRECTIONS_PATH };

if (require.main === module) {
  // 种子数据：v4 报告的真实错误，永久保留（幂等）
  const book = load();
  if (!book.corrections.some((c) => c.id === 'corr-2026-001')) {
    record({
      id: 'corr-2026-001',
      reportVersion: 'v4',
      wrongClaim: 'Artemis 载人登月 2026-04 已完成',
      rightClaim: 'Artemis II 于 2026-04 完成的是载人绕月；首次载人登月为 Artemis IV，约 2028 初',
      evidence: 'NASA 官方任务页：Artemis II 为 Crewed Lunar Flyby，9 天 1 小时 32 分，2026-04-01 发射 04-10 溅落；Artemis III(2027) 为近地轨道交会演示；Artemis IV 目标 2028 初登月',
      lesson: '绕月 ≠ 登月。任务名称相近但性质不同，且中间还夹交会演示任务，时间轴通常再错开一年以上。看到 lunar mission 必须先确认 flyby / docking / landing 三态。',
      severity: 'high'
    });
    console.log('已登记 corr-2026-001');
  }
  console.log('\n=== 修正登记簿 ===');
  console.log(JSON.stringify(lessons(), null, 1));
  console.log('\n=== 模式归纳 ===');
  console.log(JSON.stringify(recurringPatterns(), null, 1));
}
