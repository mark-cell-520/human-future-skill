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
 *
 * ── [v3.1.1] 精度门（sentenceScoped）────────────────────────────
 * 口径错位是「同一句话里把两件事说成一件事」。2026-10-25 live 轮实测：
 * 整段共现判定下 14 条命中里至少 7 条是误报（友谊勋章被当成采购订单、
 * democracy 里的 demo、gigawatts 里的 GA、游戏帖的 limited to two、
 * 经济博客的 on target + demonstrate）。误报比漏报更伤辨别力——读者
 * 不再相信这一段，真命中也会被一起跳过。
 * 修法分两层，只按实证开启，不无证据全量切换：
 *   ① 两侧同句共现（sentenceScoped: true，见 splitSentences 注释）；
 *   ② 词边界/语义收紧（\bdemo\b 不碰 democracy、完成态可用性断言、
 *      采购语义订单）。
 * 三个没有 live 误报实证的模式（detection-vs-correction / flyby-vs-landing /
 * trial-vs-approval）保持整段判定——没有证据就改判据是另一种不严谨。
 */

const MISMATCH_PATTERNS = [
  {
    id: 'capacity-vs-order',
    label: '设计产能 vs 实际订单',
    // [v3.1.1] 精度修复，live 实证：NVIDIA Blog「Kazakhstan Expands
    // Compute for Its AI Future」——capacity 在讲「500MW 基础设施规模」，
    // 而 B 侧旧正则 /订单|order|shipped|交付/ 命中的是 "Order of Dostyk,
    // First Class"（哈萨克斯坦授予黄仁勋的友谊勋章），相隔 1300+ 字符。
    // 修法：① B 侧只认采购语义（中文订单/交付、shipped、pre-order、
    // order book、backlog、orders for <数字>、<数字> units ordered），
    // 勋章与 "in order to" 不再是订单；② sentenceScoped，两侧必须同句。
    sentenceScoped: true,
    test: (t) => /产能|capacity|annual/i.test(t)
      && /(订单|交付|shipped|pre-?orders?|order book|backlog|orders?\s+(?:for|of)\s+[\d,]+|[\d,]+\s*(?:units?|sets?|台|件)\s+ordered|placed\s+[\d,]+\s+orders)/i.test(t),
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
    // [v3.1.1] sentenceScoped：live 实证误报——EconBrowser「Forward Price
    // Earnings Ratios」里 "on target"（估值达标，惯语）与 "goes on to
    // demonstrate the above proposition"（论述演示）相隔 450+ 字符、分属
    // 两个话题，整段共现即误命中。路线图 vs 结果的选择性呈现本来就写在
    // 同一句里（"our roadmap targets X; we have demonstrated Y"）。
    sentenceScoped: true,
    test: (t) => /(roadmap|路线图|计划|target|目标|guidance)/i.test(t) && /(demonstrat|已实跑|已验证|shipped)/i.test(t),
    severity: 'high',
    guidance: 'roadmap 是意图，结果是事实。只报其一即为选择性呈现。'
  },
  // [v2.9 增补] 专项大模型域最高发的口径错位。前面 5 个模式都是 v2.4 按
  // 产能/量子/航天/生物写的，没有一个是模型公告的典型形态。
  // 实测依据：DeepMind 的 Gemini 4 Argon 公告正文里有 8 处这类表述——
  // "sets a new state of the art on DeepSWE v1.1 (77.9%)"、
  // "AutomationBench ... ranks #1 with a score of 51.3%"、
  // "beats the published baseline by 40%"。全是单一基准跑分，没有一句说明
  // 通用能力。这正是「跑分 ≠ 通用能力」的活样本。
  {
    id: 'benchmark-vs-capability',
    label: '单一基准跑分 vs 通用能力',
    // [v3.1.1] sentenceScoped：live 实证误报——Interconnects 周刊
    // 「Latest open artifacts (#25)」一条列十几个模型，benchmark 词与
    // 百分比分属不同模型的条目，整段共现即误命中。跑分主张本来就写在
    // 一句里（"sets a new state of the art on DeepSWE v1.1 (77.9%)"），
    // 同句判定不误杀真命中。
    sentenceScoped: true,
    test: (t) => /(benchmark|state of the art|sota|ranks? #|top score|outperform|beats?|leaderboard)/i.test(t)
      && /(\d{1,3}(?:\.\d)?\s?%|score of \d|\bpoints?\b(?!\s+to\b))/i.test(t),
    severity: 'high',
    guidance: '单一基准的分数只说明该任务上的表现，不构成通用能力提升。必须同时说明：'
      + '测的是哪个任务、提示与样本条件、是否有第三方复现。缺任一项即为选择性呈现。'
  },
  // [v3.1.1] 三处精度修复，全部有 2026-10-25 live 轮误报实证：
  // ① \b 词边界——旧正则无边界子串匹配：demo 命中 democracy/democrat
  //    （MIT 民主讲座、EconBrowser 评论区「New Deal democrat」），
  //    GA 命中 gigawatts/average/navigation（MIT 存储成本文、页面导航）。
  //    这是该模式此前的头号误报源，四条 live 命中里三条死在它上面。
  // ② limited 只认灰度语义——「limited access/rollout/beta/testing」
  //    才是可用性层级；「limited to two players」（Simon Willison 的
  //    游戏地图帖）是数量限制，不是灰度。
  // ③ B 侧收紧为完成态可用性断言——「is now available / general
  //    availability / now shipping」才是把预览说成可用的完成态；
  //    「available in preview」（Mistral Large 4 的正确表述）与
  //    「we launched Claude Mythos Preview」（Anthropic 自述，产品名
  //    里就带 Preview）都是正确表述，判成错位比漏报更伤辨别力。
  // ④ sentenceScoped——两侧必须同句（见 splitSentences 注释）。
  {
    id: 'demo-vs-ga',
    label: '演示/预览 vs 正式可用',
    sentenceScoped: true,
    test: (t) => {
      const A = /\b(?:demo|demonstration|preview|early access|waitlist|灰度|试点|pilot)\b/i.test(t)
        || /\blimited\b[^.]{0,40}\b(?:access|rollout|release|beta|testing|availability|testers)\b/i.test(t)
        || /\b(?:rolled out to|rolling out to)\b/i.test(t);
      const B = /\b(?:now|is|are|has|have|just|officially|generally|formally)\s+(?:been\s+)?(?:available|launched|live|shipping|released)\b/i.test(t)
        || /\b(?:general availability|now shipping|went ga|is live|available now)\b/i.test(t)
        || /\bga\b/i.test(t);
      return A && B;
    },
    severity: 'medium',
    guidance: 'demo/preview/限量灰度与 GA 是不同可用性层级。把「正在向可信测试者灰度」'
      + '写成「已可用」是最常见的完成态误导。必须写明当前层级与开放范围。'
  },
  {
    id: 'vendor-selfreport-vs-verification',
    label: '厂商自述 vs 独立验证',
    // [v3.1.1] sentenceScoped：live 实证误报——Anthropic「Expectations
    // For The Future」里 "our researchers follow the same employee"（描述
    // 研究流程）与 "put safety at the frontier"（使命宣言）相隔 2000+
    // 字符、同源不同义，整段共现即命中。厂商自述安全能力的真形态是
    // 一句（"our internal evals show the model is robust against
    // jailbreaks"）。
    sentenceScoped: true,
    test: (t) => /(we (?:found|showed|demonstrated|achieved)|our (?:internal|research)|according to (?:us|our))/i.test(t)
      && /(safety|secure|alignment|resilien|robust|protect)/i.test(t),
    severity: 'medium',
    guidance: '安全与对齐声明来自厂商自己时不是独立验证。第三方复测、红队报告或'
      + '监管认证才算验证；厂商自评只能标注为「厂商自述」。'
  }
];

/**
 * [v3.1.1] 句子切分。
 *
 * 为什么需要它：口径错位是「同一句话里把两件事说成一件事」。旧实现只要求
 * 两侧词族在**整段文本**里共现，而 RSS 正文动辄 6000 字符、跨十几个主题，
 * 跨句共现经常是两件不相关的事。live 实测误报（2026-10-25 轮）：
 *   - NVIDIA Blog「Kazakhstan Expands Compute」：capacity 在讲 500MW
 *     基础设施规模，"Order of Dostyk, First Class"（授予黄仁勋的友谊
 *     勋章）被 /订单|order|shipped|交付/ 当成采购订单，两者相隔 1300+
 *     字符、中间还隔着一整段；
 *   - Interconnects 周刊「Latest open artifacts (#25)」：benchmark 词
 *     与百分比分属不同模型的条目，整段共现即命中。
 * 两侧必须落在同一句才算「说成一件事」——这是精度优先的取舍：可能漏掉
 * 「roadmap 一段、结果一段」式的跨句误导，但漏报比把勋章当订单诚实。
 */
function splitSentences(text) {
  return String(text || '')
    // 在句末标点后的空白处切；小数（77.9%）与缩写（v1.1）的句点后紧跟
    // 非空白字符，不会误切。
    .split(/(?<=[.!?。！？])\s+|\r?\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * @param {string} text 待检文本（宣传口径/新闻/招股书片段）
 * @returns {{matched: Array, verdict: string, score: number, triggerSentences: string[]}}
 *   triggerSentences: 实际触发判定的句子（sentenceScoped 模式才有），
 *   供报告层展示「是哪句话触发的」，使命中可审计而非只给一个标签。
 */
function detectMismatch(text) {
  const t = text || '';
  const sentences = splitSentences(t);
  const triggerSentences = [];
  const matched = MISMATCH_PATTERNS.filter((p) => {
    let hit = false;
    try { hit = p.test(t); } catch (_) { hit = false; }
    if (!hit) return false;
    // 触发句收集对所有模式生效：sentenceScoped 模式取「同句双侧共现」那句；
    // 整段判定的模式取第一处完整匹配的句子（跨句匹配时可能取不到，则
    // evidenceSentence 为 null——报告不展示触发句，但命中本身仍成立）。
    const trigger = sentences.find((s) => { try { return p.test(s); } catch (_) { return false; } });
    if (trigger) triggerSentences.push(trigger);
    if (!p.sentenceScoped) return true;
    // 句子级判定：整段共现只是候选，同一句里两侧共现才是命中。
    return !!trigger;
  });
  const score = matched.reduce((s, p) => s + (p.severity === 'high' ? 2 : 1), 0);
  let verdict = 'clean';
  if (score >= 4) verdict = 'severe-mismatch';
  else if (score >= 2) verdict = 'mismatch-suspected';
  else if (score >= 1) verdict = 'minor-flag';
  return { matched, verdict, score, triggerSentences };
}

module.exports = { detectMismatch, MISMATCH_PATTERNS, splitSentences };

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
  // [v3.1.1] 误报回归样例：全部是 2026-10-25 live 轮实测误报，修复后应为 clean。
  const fpCases = [
    ['勋章当订单', 'Firebird would bring total potential AI infrastructure capacity in Kazakhstan to approximately 500 megawatts. Later that evening, President Tokayev presented Huang with the Order of Dostyk, First Class, for his contribution to the development of artificial intelligence in Kazakhstan.'],
    ['democracy 含 demo', 'At MIT, Martha Minow speaks on sustaining democracy, both by using and overcoming AI. The distinguished legal scholar warns of potential loss of the Enlightenment.'],
    ['gigawatts 含 GA', 'Ask most executives to picture the cost of AI and they will likely see GPUs—racks of accelerators with gigawatts of power—and a waitlist for silicon.'],
    ['limited to two 不是灰度', 'Release: battledrones v14: Compass Rose, a four player map. I added four player online mode - previous maps were limited to two.'],
    ['available in preview 是正确表述', 'French company Mistral released Mistral Large 4, a 1-trillion-parameter multimodal model available in preview with a final version due by the end of the month.'],
    ['产品名带 Preview 不是错位', 'When we launched Claude Mythos Preview, we showed it was able to autonomously find and exploit vulnerabilities in almost every piece of software we pointed it at.'],
  ];
  console.log('─'.repeat(60));
  console.log('误报回归（修复后必须全部 clean）：');
  let bad = 0;
  for (const [name, c] of fpCases) {
    const r = detectMismatch(c);
    const ok = r.matched.length === 0;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ' → 仍命中: ' + r.matched.map(m => m.id).join(',')}`);
  }
  // 真命中不许被修死：v2.9 Gemini 4 Argon 形态（同句双侧共现）。
  const tp = detectMismatch('It sets a new state of the art on DeepSWE v1.1 (77.9%) and is rolling out to trusted testers before general availability');
  const tpOk = tp.matched.some(m => m.id === 'benchmark-vs-capability') && tp.matched.some(m => m.id === 'demo-vs-ga');
  console.log(`  ${tpOk ? '✓' : '✗'} 真命中保留（Gemini 4 Argon 形态）${tpOk ? '' : ' → ' + JSON.stringify(tp.matched.map(m => m.id))}`);
  if (!tpOk) bad++;
  // 真命中保留：其余四个 sentenceScoped 模式的同句真形态各一条。
  const tpCases = [
    ['capacity-vs-order', 'Tesla Fremont 线设计产能 100 万台/年，已下 5000 台部件订单，目标 2026 年产 50000 台'],
    ['roadmap-vs-result', 'Our roadmap targets GA in Q3 2027 and we have demonstrated a working prototype running end-to-end.'],
    ['vendor-selfreport-vs-verification', 'Our internal evaluations show the model is robust against jailbreaks and aligned with our safety guidelines.'],
  ];
  for (const [id, c] of tpCases) {
    const ok = detectMismatch(c).matched.some(m => m.id === id);
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} 真命中保留（${id}）`);
  }
  console.log(bad === 0 ? '\n自测通过：误报清零，真命中保留。' : `\n自测失败：${bad} 项不符预期。`);
}
