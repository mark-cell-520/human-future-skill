#!/usr/bin/env node
'use strict';

/**
 * 低频置信度守门器 — human-future v2.4 第 7 个新模块
 *
 * 玩家铁律：引擎 confidence < 0.6 时，禁止拿低置信度结论冒充判断。
 * 本模块把这条纪律变成强制闸门：任何推演产物先过这里，低置信度必须显式标注。
 */

const THRESHOLD = 0.6;

/**
 * @param {{confidence: number, conclusion?: string, producer?: string}} engineResult
 * @returns {{allowed: boolean, label: string, disclosure: string|null}}
 */
function gate(engineResult) {
  const conf = typeof engineResult.confidence === 'number' ? engineResult.confidence : null;

  if (conf === null) {
    return {
      allowed: true,
      label: 'no-engine-output',
      disclosure: '本次无引擎输出，全部结论为人工判断（已在正文标注）。'
    };
  }

  if (conf >= THRESHOLD) {
    return {
      allowed: true,
      label: 'usable',
      disclosure: null
    };
  }

    return {
      allowed: false,
      label: 'low-confidence',
      disclosure:
        `引擎 confidence=${conf} 低于阈值 ${THRESHOLD}，该输出不得作为结论引用。` +
        '以下分析为人工判断，与引擎输出无关。'
    };
  }

/**
 * 把守门声明嵌进报告文本。
 * @param {string} report 报告正文
 * @param {{confidence: number|null}} engineResult
 */
function annotate(report, engineResult) {
  const g = gate(engineResult);
  if (!g.disclosure) return report;
  return `> ⚠️ **置信度守门**：${g.disclosure}\n\n${report}`;
}

module.exports = { gate, annotate, THRESHOLD };

if (require.main === module) {
  const cases = [
    { confidence: 0.85, conclusion: '结论A' },
    { confidence: 0.4, conclusion: '结论B' },
    { confidence: null, conclusion: null }
  ];
  for (const c of cases) {
    const g = gate(c);
    console.log(`confidence=${c.confidence} -> ${g.allowed ? '✅' : '⛔'} ${g.label}`);
    if (g.disclosure) console.log(`   ${g.disclosure}`);
  }
  console.log('\n=== 注入示例 ===');
  console.log(annotate('# 报告正文\n\n内容…', { confidence: 0.4 }).split('\n')[0]);
}
