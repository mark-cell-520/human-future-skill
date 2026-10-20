#!/usr/bin/env node
/**
 * test-reasoning-is-derived.js — 证明「推演结构」不是固定模板的自检测试。
 *
 * 背景：2026-10-12 之前 buildAnalysisText() 里的【推演结构】段是 6 月手写的
 * 常量（前提1..4 / 推理过程 / 结论），无论采集到什么新闻都原样输出。心虫
 * discriminate() 判的是那段固定文本，于是每期报告的 verdict/score 描述的
 * 是模板而不是本期数据。
 *
 * 这个测试把那个缺陷钉住：喂两套不同数据，要求【推演结构】段必须不同，
 * 且必须包含本期真实统计出来的数字。任何人跑一次就能自己判断，
 * 不需要相信审计者怎么说。
 *
 * 运行：node test-reasoning-is-derived.js
 * 退出码：0 = 推演结构随数据变化；1 = 退化成固定模板（假推演复发）
 */
'use strict';

const path = require('path');
const { buildAnalysisText } = require('./scripts/heartflow-analyze.js');

/** 构造一个域的数据集。titles 是新闻标题，src 是来源名。 */
function dataset(domainName, src, titles, pubDate) {
  return {
    tech: {
      domain: 'tech',
      name: domainName,
      news: titles.map((t, i) => ({
        title: t,
        link: `https://example.com/${domainName}/${i}`,
        pubDate: pubDate,
        description: 'probe fixture',
        source: src,
        origin: 'live',
      })),
    },
  };
}

const A = dataset('科技', 'ProbeSrcA', ['Alpha one', 'Alpha two', 'Alpha three'],
                  'Fri, 09 Oct 2026 09:00:00 +0000');
const B = dataset('人文', 'ProbeSrcB', ['Beta only'],
                  'Mon, 05 Oct 2026 09:00:00 +0000');

const textA = buildAnalysisText(A);
const textB = buildAnalysisText(B);

/** 取出【推演结构】段（到下一个【或文本结束）。 */
function reasoningSection(text) {
  const i = text.indexOf('【推演结构】');
  if (i < 0) return null;
  const j = text.indexOf('【', i + 1);
  return text.slice(i, j < 0 ? undefined : j);
}

const secA = reasoningSection(textA);
const secB = reasoningSection(textB);

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
}

check('两套数据都能生成推演结构段', !!secA && !!secB,
      `A=${secA ? secA.length + ' chars' : 'null'} B=${secB ? secB.length + ' chars' : 'null'}`);

if (secA && secB) {
  check('推演结构段随数据变化（不是固定模板）', secA.trim() !== secB.trim(),
        secA.trim() === secB.trim() ? '两次输出完全相同 → 假推演复发' : '两次输出不同');

  // A 有 3 条，B 有 1 条——本期统计数字必须出现在各自文本里
  check('A 段含本期真实条数（3）', secA.includes('3'), 'A 应提到 3 条信号');
  check('B 段含本期真实条数（1）', secB.includes('1'), 'B 应提到 1 条信号');
  check('A 段含本期域名（科技）', secA.includes('科技'), 'A 应提到域名 科技');
  check('B 段含本期域名（人文）', secB.includes('人文'), 'B 应提到域名 人文');
  check('A 段含本期来源（ProbeSrcA）', secA.includes('ProbeSrcA'), 'A 应提到来源 ProbeSrcA');
  check('B 段含本期来源（ProbeSrcB）', secB.includes('ProbeSrcB'), 'B 应提到来源 ProbeSrcB');
  check('A 段时间跨度为 2026-10-09', secA.includes('2026-10-09'), 'A 应含真实日期');
  check('B 段时间跨度为 2026-10-05', secB.includes('2026-10-05'), 'B 应含真实日期');
  check('推演结构标明数据来源（非固定模板）', secA.includes('真实数据推导'),
        '应含「由本期真实数据推导」标记');

  // 旧模板的标志性句子：任何一句复活都算复发
  const TEMPLATE_MARKERS = [
    'AI 技术从通用工具向垂直专业助手和自主 agent 转变',
    '算力军备竞赛加剧，芯片自主化趋势明显',
    '2026-2029 年是人类决定 AI 走向的关键窗口期',
    'AGI 政策化 + 规模化部署 + 新兴技术突破',
  ];
  const revived = TEMPLATE_MARKERS.filter(m => secA.includes(m) || secB.includes(m));
  check('旧固定模板句未复活', revived.length === 0,
        revived.length ? `复发: ${revived[0]}` : '无旧模板句');
}

// ── 输出 ────────────────────────────────────────────────────────────
let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.ok ? '' : '  —— ' + c.detail}`);
  if (!c.ok) failed++;
}
console.log(`\n${checks.length - failed} 通过, ${failed} 失败, 共 ${checks.length} 个`);

// ════════════════════════════════════════════════════════════════
// v2.7 新增断言：专项大模型域（frontier_models）必须真的被采集、被归类、
// 被输出。这三件事任何一件断掉，用户要的「专项大模型趋势」就是空话。
// 每个断言都可在本地重跑，不需要相信审计者的说法。
// ════════════════════════════════════════════════════════════════
const { collectAll, loadFromKnowledgeBase, fetchAll } = require('./scripts/collect-news.js');
const { DOMAINS } = require('./scripts/project-future.js');

// 1. RSS_SOURCES 必须声明 frontier_models 域（collect-news.js 的常量不外露，
//    用 loadFromKnowledgeBase 的返回结构间接验证域名映射存在）。
const kb = loadFromKnowledgeBase();
check('采集器已声明 frontier_models 域（含知识库降级路径）',
      !!kb.frontier_models && kb.frontier_models.name === '专项大模型',
      kb.frontier_models ? `name=${kb.frontier_models.name}` : '域缺失');

// 2. 推演引擎的主题域表必须有 frontier_models，且关键词含主流厂商。
const fmDomain = DOMAINS.find(d => d.id === 'frontier_models');
check('推演引擎主题域含 frontier_models', !!fmDomain,
      fmDomain ? `name=${fmDomain.name}` : 'DOMAINS 里没有 frontier_models');
if (fmDomain) {
  const mustHaveKw = ['openai', 'anthropic', 'claude', 'gemini', 'deepseek', 'qwen'];
  const missing = mustHaveKw.filter(k => !fmDomain.kw.includes(k));
  check('专项域关键词覆盖主流厂商', missing.length === 0,
        missing.length ? `缺关键词: ${missing.join(', ')}` : `${fmDomain.kw.length} 个关键词`);
}

// 3. 真实采集：FETCH=1 下 frontier_models 域必须拿到 live 条目。
//    这一步真联网，失败时如实记为失败，不用假数据糊过去。
(async () => {
  if (process.env.SKIP_LIVE_PROBE !== '1') {
    try {
      const live = await fetchAll();
      const fmItems = (live.frontier_models || {}).news || [];
      check('真联网采集到 frontier_models live 条目', fmItems.length > 0,
            `实得 ${fmItems.length} 条`);
      if (fmItems.length) {
        const allLive = fmItems.every(n => n.origin === 'live');
        check('专项域条目均带 origin=live 标记', allLive,
              allLive ? '全部 origin=live' : '存在未标记来源的条目');
        const withLink = fmItems.filter(n => n.link).length;
        check('专项域条目带可引用链接', withLink > 0,
              `${withLink}/${fmItems.length} 条有 link`);
      }
    } catch (e) {
      check('真联网采集到 frontier_models live 条目', false, `采集抛错: ${e.message}`);
    }
  }

  // 4. 专项报告段必须由真实信号生成（不是固定文案）。
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const fakeLive = {
    tech: { domain: 'tech', name: '科技', news: [] },
    frontier_models: {
      domain: 'frontier_models', name: '专项大模型',
      news: [
        { title: 'OpenAI releases probe model A', description: 'probe', source: 'ProbeSrcFM',
          link: 'https://example.com/a', pubDate: 'Tue, 20 Oct 2026 10:00:00 +0000', origin: 'live' },
        { title: 'Anthropic ships probe model B', description: 'probe', source: 'ProbeSrcFM2',
          link: 'https://example.com/b', pubDate: 'Fri, 16 Oct 2026 10:00:00 +0000', origin: 'live' },
      ],
    },
  };
  const eng = new ProjectionEngine({ newsData: fakeLive });
  const sec = eng.buildFrontierModelSection() || {};
  check('专项段随信号生成（available=true）', sec.available === true,
        sec.available ? `total=${sec.total}` : `reason=${sec.reason}`);
  check('专项段条目数与输入一致', sec.total === 2,
        `输入 2 条 → 输出 ${sec.total} 条`);
  check('专项段列出独立来源数', sec.distinctSources === 2,
        `distinctSources=${sec.distinctSources}`);
  check('专项段含真实标题（非模板）',
        (sec.latestItems || []).some(i => String(i.title).includes('probe model A')),
        (sec.latestItems || []).map(i => i.title).join(' / ') || '(无 latestItems)');

  // 反向验证：空输入时必须如实报不可用，而不是编一段出来。
  const empty = new ProjectionEngine({ newsData: {} }).buildFrontierModelSection() || {};
  check('无专项信号时如实报不可用（不编造）', empty.available === false && !!empty.reason,
        `available=${empty.available} reason=${empty.reason}`);

  // ── 汇总输出 ─────────────────────────────────────────────────
  // 必须在 finally 里跑：上面任何断言抛错（缺陷导致 crash）时，
  // 也要把已完成的断言打出来、以非零码退出。否则反向验证看到的是
  // 一段堆栈而不是「哪些断言失败了」——那不算有效的失败信号。
  let failed2 = 0;
  for (const c of checks) {
    console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.ok ? '' : '  —— ' + c.detail}`);
    if (!c.ok) failed2++;
  }
  console.log(`\n${checks.length - failed2} 通过, ${failed2} 失败, 共 ${checks.length} 个`);
  if (failed2 > 0) {
    console.log('\n结论：专项大模型域未接通。');
    console.log('修法：检查 collect-news.js 的 RSS_SOURCES、project-future.js 的 DOMAINS、');
    console.log('      以及 buildFrontierModelSection() 是否被 generate() 挂进 report。');
    process.exitCode = 1;
  } else {
    console.log('\n结论：专项大模型域采集、归类、输出三段均接通。');
  }
})().catch((e) => {
  // 兜底：测试自身崩了也要报失败，不能让非零退出码藏在未捕获异常里
  console.log(`\n✗ 测试执行期抛错: ${e && e.message}`);
  console.log('这属于测试自身缺陷或被测代码崩溃，按失败处理。');
  process.exitCode = 1;
});
