#!/usr/bin/env node
'use strict';

/**
 * 口径错位检测器 — human-future v2.4 第 2 个新模块
 *
 * 检测"数字达标 vs 能力达标"的错位。这是 v5 长程推演中识别出的核心失败模式：
 *   - 量子：30 逻辑比特 = 检测 + 事后丢弃，非纠错（DOE 明确拒收）
 *   - 机器人：Optimus 订单 5,000 台 vs 口径 50,000 台，差 10 倍
 *   - 太空：绕月成功被报成"登月在即"，实际登月 2028
 *
 * 用法：把一段宣传口径 + 一个可验证事实喂进来，输出错位判定。
 */

const MISMATCH_PATTERNS = [
  {
    id: 'capacity-vs-order',
    label: '设计产能 vs 实际订单',
    test: (t) => /产能|capacity|annual/i.test(t) && /订单|order|shipped|交付/i.test(t),
    severity: 'high',
    guidance: '产能是设计上限，订单是真实需求。两者相差一个数量级以上时，口径即虚。'
  },
  {
    id: 'detection-vs-correction',
    label: '错误检测 vs 错误纠正',
    test: (t) => /(detect|检测|post-?select|丢弃)/i.test(t) && /(correct|纠正|纠错|logical qubit|逻辑量子)/i.test(t),
    severity: 'high',
    guidance: '距离-2 码只能标记错误、靠事后丢弃保留样本；运行中不解码就不算可扩展逻辑比特。'
  },
  {
    id: 'flyby-vs-landing',
    label: '绕行/飞越 vs 着陆/登陆',
    test: (t) => /(flyby|绕月|绕飞|飞越)/i.test(t) && /(land|登月|登陆|着陆|landing)/i.test(t),
    severity: 'medium',
    guidance: '绕月 ≠ 登月。中间还夹交会对接演示任务，时间轴通常再错开一年以上。'
  },
  {
    id: 'trial-vs-approval',
    label: '临床试验 vs 监管批准',
    test: (t) => /(trial|临床|试验)/i.test(t) && /(approv|批准|获批|上市|certif)/i.test(t),
    severity: 'medium',
    guidance: '在试 ≠ 获批。获批又分突破性认定与常规许可，后者才是可规模处方。'
  },
  {
    id: 'roadmap-vs-result',
    label: '路线图承诺 vs 已演示结果',
    test: (t) => /(roadmap|路线图|计划|target|目标|guidance)/i.test(t) && /(demonstrat|已实跑|已验证|shipped)/i.test(t),
    severity: 'high',
    guidance: 'roadmap 是意图，结果是事实。只报其一即为选择性呈现。'
  }
];

/**
 * @param {string} text 待检文本（宣传口径/新闻/招股书片段）
 * @returns {{matched: Array, verdict: string, score: number}}
 */
function detectMismatch(text) {
  const t = text || '';
  const matched = MISMATCH_PATTERNS.filter((p) => p.test(t));
  const score = matched.reduce((s, p) => s + (p.severity === 'high' ? 2 : 1), 0);
  let verdict = 'clean';
  if (score >= 4) verdict = 'severe-mismatch';
  else if (score >= 2) verdict = 'mismatch-suspected';
  else if (score >= 1) verdict = 'minor-flag';
  return { matched, verdict, score };
}

module.exports = { detectMismatch, MISMATCH_PATTERNS };

if (require.main === module) {
  const cases = [
    'Tesla Fremont 线设计产能 100 万台/年，已下 5000 台部件订单，目标 2026 年产 50000 台',
    'Infleqtion 30 logical qubits 用 distance-2 code + post-selection，运行中不解码',
    'Artemis II 完成载人 flyby，媒体称登月在即；首次载人 landing 排在 2028',
    'MCO-010 在 RESTORE phase 2b/3 trial 显示三年视力改善，尚待 FDA approval'
  ];
  for (const c of cases) {
    console.log('─'.repeat(60));
    console.log('CASE:', c.slice(0, 60) + '…');
    console.log(JSON.stringify(detectMismatch(c), null, 1));
  }
}
