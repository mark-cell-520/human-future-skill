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

// ════════════════════════════════════════════════════════════════
// v2.8 新增断言：四项「实测缺口」必须有回归保护。
// 每一条都对应 v2.7 上线后真实观察到的问题，不是假设。
// ════════════════════════════════════════════════════════════════
const { classifySource } = require('./human-future/scripts/source-credibility-grader.js');

const v28 = [];
function c28(name, ok, detail) { v28.push({ name, ok, detail }); }

// 缺口 1：专项采集域里正文无厂商标识的条目必须归入专项主题域。
// 实测：106 条专项源条目有 22 条正文无厂商标识，全落 undomained。
c28('专项采集域条目即使无厂商标识也归入专项主题域', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const data = {
    frontier_models: {
      domain: 'frontier_models', name: '专项大模型',
      news: [
        // 正文不含 openai/gemini/claude 等任何关键词的厂商公告
        { title: 'Teaching students to think through questions', description: 'AI for Educators',
          source: 'OpenAI News', link: 'https://openai.com/index/x',
          pubDate: 'Mon, 19 Oct 2026 10:00:00 +0000', origin: 'live' },
        { title: 'Improving weather forecasts two to six weeks out', description: 'machine learning',
          source: 'MIT News - AI', link: 'https://news.mit.edu/x',
          pubDate: 'Fri, 16 Oct 2026 10:00:00 +0000', origin: 'live' },
      ],
    },
  };
  const eng = new ProjectionEngine({ newsData: data });
  const dom = eng.signals.domains.find(d => d.id === 'frontier_models');
  return !!dom && dom.count === 2;
})(), '两条无厂商标识的专项源条目应归入 frontier_models');

// 缺口 2：AI 相关域独占活跃域时，因果链必须用共现兜底而非返回不可用。
// 实测 v2.7：3/4 轮返回「映射后仅 1 个域」，整段不可用。
c28('AI 域独占时因果链走共现兜底且标出 edgeSource', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const data = {
    frontier_models: {
      domain: 'frontier_models', name: '专项大模型',
      news: [
        // 同一条同时命中专项域与治理域 → 产生共现边
        { title: 'OpenAI policy regulation announcement on frontier model safety',
          description: 'regulation law', source: 'OpenAI News',
          link: 'https://openai.com/index/a', pubDate: 'Mon, 19 Oct 2026 10:00:00 +0000', origin: 'live' },
        { title: 'OpenAI regulation law for model export control',
          description: 'regulation', source: 'OpenAI News',
          link: 'https://openai.com/index/b', pubDate: 'Fri, 16 Oct 2026 10:00:00 +0000', origin: 'live' },
      ],
    },
    tech: {
      domain: 'tech', name: '科技',
      news: [
        { title: 'OpenAI regulation policy debate on model safety law',
          description: 'regulation', source: 'MIT Tech Review - AI',
          link: 'https://technologyreview.com/c', pubDate: 'Thu, 15 Oct 2026 10:00:00 +0000', origin: 'live' },
      ],
    },
  };
  const eng = new ProjectionEngine({ newsData: data });
  const rep = eng.generate();
  const cc = rep.causalChains;
  if (!cc.available) return false;
  // 兜底路径必须自报 edgeSource，且根因/链不能全空
  return cc.edgeSource === 'cooccurrence'
    && cc.roots.length > 0
    && cc.chains.length > 0
    && /共现/.test(cc.note);
})(), '共现图应有根因、链，且 note 标明非实证因果');

// 缺口 3：官方厂商博客不能被判成 T4 自媒体。
// 实测 v2.7：12 个 live 来源全部落 T4，含 openai.com/deepmind.google。
c28('厂商官方博客判为 T1（不是 T4 自媒体）', (() => {
  const cases = [
    ['https://openai.com/index/low-resource-programming-languages', 'T1'],
    ['https://deepmind.google/blog/accelerating-antimicrobial-discovery/', 'T1'],
    ['https://blogs.nvidia.com/blog/germany-wants-to-lead-the-world-in-industrial-ai/', 'T1'],
    ['https://www.microsoft.com/en-us/research/blog/proof-based-general-purpose-computing/', 'T1'],
  ];
  const bad = cases.filter(([u, want]) => classifySource(u) !== want);
  return bad.length === 0;
})(), 'openai/deepmind/nvidia/microsoft 官方博客应为 T1');

c28('主流媒体判为 T2、分析型 newsletter 判为 T3', (() => {
  const cases = [
    ['https://arstechnica.com/security/2026/10/x/', 'T2'],
    ['https://news.mit.edu/2026/x', 'T2'],
    ['https://www.technologyreview.com/2026/10/19/x/', 'T2'],
    ['https://www.interconnects.ai/p/meta-shakes-up-the-frontiers/', 'T3'],
    ['https://simonwillison.net/2026/Oct/19/x/', 'T3'],
  ];
  const bad = cases.filter(([u, want]) => classifySource(u) !== want);
  return bad.length === 0;
})(), 'Ars/MIT News/MIT TR 应 T2，Interconnects/Simon Willison 应 T3');

// 缺口 4：时间轴抽取必须覆盖摘要（v2.7 只扫标题，实测 140 条仅 1 条命中）。
c28('时间轴抽取覆盖摘要且只认前瞻词形态', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const data = {
    tech: {
      domain: 'tech', name: '科技',
      news: [
        { title: 'Roadmap update', description: 'We plan to launch by 2028 with staged rollout',
          source: 'Vendor Blog', link: 'https://example.com/a',
          pubDate: 'Mon, 19 Oct 2026 10:00:00 +0000', origin: 'live' },
        { title: 'Another roadmap', description: 'Scheduled for 2027-Q1 general availability',
          source: 'Vendor Blog', link: 'https://example.com/b',
          pubDate: 'Fri, 16 Oct 2026 10:00:00 +0000', origin: 'live' },
      ],
    },
  };
  const eng = new ProjectionEngine({ newsData: data });
  const tl = eng.buildTimelineConflicts();
  return tl.available === true
    && tl.summary.total >= 2
    && tl.ordered.some(s => /2028/.test(s))
    && tl.ordered.some(s => /2027/.test(s));
})(), '摘要里的 by 2028 / 2027-Q1 应被抽到');

c28('历史引用年份不被当成 roadmap 声明', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const data = {
    tech: {
      domain: 'tech', name: '科技',
      news: [
        { title: 'History piece', description: 'In 2025, Stan created something notable',
          source: 'Blog', link: 'https://example.com/a',
          pubDate: 'Mon, 19 Oct 2026 10:00:00 +0000', origin: 'live' },
        { title: 'Another history', description: 'The sharpest decline since Q1 2023 continued',
          source: 'News', link: 'https://example.com/b',
          pubDate: 'Fri, 16 Oct 2026 10:00:00 +0000', origin: 'live' },
      ],
    },
  };
  const eng = new ProjectionEngine({ newsData: data });
  const tl = eng.buildTimelineConflicts();
  // 这两条的年份都是历史引用（无前瞻词），必须判不可用而不是硬抽
  return tl.available === false;
})(), 'In 2025 / since Q1 2023 属历史引用，不应凑成时间轴');

// ── v2.8 汇总 ──────────────────────────────────────────────────
let f28 = 0;
for (const c of v28) {
  console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.ok ? '' : '  —— ' + c.detail}`);
  if (!c.ok) f28++;
}
console.log(`\nv2.8: ${v28.length - f28} 通过, ${f28} 失败, 共 ${v28.length} 个`);
if (f28 > 0) {
  console.log('结论：v2.8 缺口修复未守住。');
  console.log('修法：见 test-reasoning-is-derived.js 里 v28() 各条对应的实测缺口注释。');
  process.exitCode = 1;
} else {
  console.log('结论：v2.8 四项缺口修复均有回归保护。');
}

// ════════════════════════════════════════════════════════════════
// v2.9 新增断言：正文抓取 + 两处断链，全部对应实测缺口。
// ════════════════════════════════════════════════════════════════
const { extractMainContent, stripHtml } = require('./scripts/collect-news.js');

const v29 = [];
function c29(name, ok, detail) { v29.push({ name, ok, detail }); }

// 缺口 A：extractMainContent 必须跳过站点头部导航，取到正文主体。
// 实测依据：DeepMind 博客页前约 7900 字符是导航，DeepSWE 77.9% 在 8042 处。
// fixture 必须复现这个比例：导航块要足够长（>6000 字符，超过 BODY_MAX_CHARS），
// 否则「简单截断前 N 字符」也能覆盖到正文，测试就失去区分力——
// v2.9 第一版 fixture 只放了约 400 字符导航，反向验证时摘除导航跳过逻辑
// 测试仍然全过，等于没测。
c29('extractMainContent 跳过站点头部取到正文主体', (() => {
  // 构造一个 DeepMind 形态的输入：长导航块（无句末标点）+ 正文
  // 导航块重复到 7000+ 字符，超过 BODY_MAX_CHARS(6000)，
  // 这样只有真正跳过导航才能取到正文。
  const navUnit = 'Innovation & AI Products & platforms Company news Feed Newsletter '
    + 'See all in Innovation & AI Models & Research Google DeepMind Google Research '
    + 'Google Labs Gemini models Quantum computing See all Products Developer tools '
    + 'Gemini app Gemini Notebook See all Infrastructure & cloud Global network '
    + 'Google Cloud See all Technology Safety & Security Health See all Learn more: '
    + 'Google DeepMind blog Google Research blog Google Developers blog ';
  let nav = '';
  while (nav.length < 7200) nav += navUnit;
  const body = 'Gemini 4 Argon is a frontier model. It sets a new state of the art on '
    + 'DeepSWE v1.1 (77.9%), which measures real-world long-horizon software engineering. '
    + 'On AutomationBench, Argon ranks #1 with a score of 51.3%.';
  const text = 'Introducing Gemini 4 Argon Skip to main content ' + nav + body;
  const main = extractMainContent(text);
  return main.includes('DeepSWE') && main.includes('77.9');
})(), '应跳过 7200+ 字符导航块并取到 DeepSWE 77.9%');

// 缺口 A 反例：正文尾部的 "Read more from" 不该把切割点推到末尾。
// 第二版实测：切割点被推到末尾，只剩 1118 字符，正文全丢。
c29('正文尾部的 Related stories 不参与切割', (() => {
  const nav = 'Skip to main content Site nav See all in Section A See all in Section B ';
  const body = 'The model achieves 91.7% on LVBench for long video understanding tasks. '
    + 'It also ranks first on AutomationBench with a score of 51.3%.';
  const footer = ' Related stories Read more from Koray Kavukcuoglu Posted in Gemini models ';
  const text = 'Title ' + nav + body + footer;
  const main = extractMainContent(text);
  return main.includes('LVBench') && main.includes('91.7');
})(), 'LVBench 91.7% 应保留在取到的正文里');

// 缺口 B：buildClaimMismatches 读的字段名必须与 detectMismatch 返回一致。
// 实测依据：v2.9 之前读 r.hits / Array.isArray(r)，而检测器返回 {matched,...}，
// 导致口径错位检测从 v2.4 接入起从未产出任何命中。
c29('口径错位检测真的能产出命中（不是恒 0）', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const data = {
    tech: {
      domain: 'tech', name: '科技',
      news: [{
        title: 'Probe model sets state of the art',
        description: 'It sets a new state of the art on DeepSWE v1.1 (77.9%) and is rolling out to trusted testers before general availability',
        body: 'The model ranks #1 with a score of 51.3% on AutomationBench. It beats the published baseline by 40%.',
        source: 'Probe Vendor Blog', link: 'https://example.com/probe',
        pubDate: 'Mon, 19 Oct 2026 10:00:00 +0000', origin: 'live',
      }],
    },
  };
  const eng = new ProjectionEngine({ newsData: data });
  const cm = eng.buildClaimMismatches();
  return cm.available === true && cm.count >= 1
    && cm.hits[0].mismatches.some(m => m.id === 'benchmark-vs-capability');
})(), '含跑分+百分号的正文应命中 benchmark-vs-capability');

// 缺口 B 反例：干净文本不应误报。
c29('无口径错位的文本不误报', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const data = {
    tech: {
      domain: 'tech', name: '科技',
      news: [{
        title: 'Routine maintenance notice',
        description: 'The service will undergo scheduled maintenance on Sunday evening.',
        source: 'Probe Ops', link: 'https://example.com/ops',
        pubDate: 'Mon, 19 Oct 2026 10:00:00 +0000', origin: 'live',
      }],
    },
  };
  const eng = new ProjectionEngine({ newsData: data });
  return eng.buildClaimMismatches().count === 0;
})(), '运维公告不应命中任何口径错位模式');

// 缺口 C：时间轴必须能用上发布日期（v2.8/v2.9 反复抓不到前瞻声明时，
// 发布日期是唯一可用的时间维度）。
c29('时间轴纳入发布日期并可排序', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const data = {
    tech: {
      domain: 'tech', name: '科技',
      news: [
        { title: 'Product A released', description: 'Announcing Product A on Sep 30, 2026 for developers.',
          body: '', source: 'Vendor A', link: 'https://example.com/a',
          pubDate: 'Mon, 19 Oct 2026 10:00:00 +0000', origin: 'live' },
        { title: 'Product B released', description: 'Announcing Product B on October 14, 2026 with new pricing.',
          body: '', source: 'Vendor A', link: 'https://example.com/b',
          pubDate: 'Mon, 19 Oct 2026 10:00:00 +0000', origin: 'live' },
      ],
    },
  };
  const eng = new ProjectionEngine({ newsData: data });
  const tl = eng.buildTimelineConflicts();
  return tl.available === true
    && tl.summary.total >= 2
    && tl.summary.verified >= 2
    && tl.ordered.some(s => /已发布/.test(s));
})(), '两条带发布日期的条目应产出可排序时间轴且标记已发布');

// 缺口 D：正文抓取失败时不得污染 description，也不得抛错。
c29('正文缺失时降级为只有摘要，不抛错', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const data = {
    tech: {
      domain: 'tech', name: '科技',
      news: [{
        title: 'No body item', description: '摘要只有这一句，没有正文字段。',
        source: 'Probe', link: 'https://example.com/nb',
        pubDate: 'Mon, 19 Oct 2026 10:00:00 +0000', origin: 'live',
      }],
    },
  };
  const eng = new ProjectionEngine({ newsData: data });
  const it = eng.signals.items[0];
  return it.hasBody === false && it.body === '' && /摘要只有这一句/.test(it.text);
})(), '无 body 时 hasBody=false、body 为空串、text 仍含摘要');

// ── v2.9 汇总 ──────────────────────────────────────────────────
let f29 = 0;
for (const c of v29) {
  console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.ok ? '' : '  —— ' + c.detail}`);
  if (!c.ok) f29++;
}
console.log(`\nv2.9: ${v29.length - f29} 通过, ${f29} 失败, 共 ${v29.length} 个`);
if (f29 > 0) {
  console.log('结论：v2.9 正文抓取或断链修复未守住。');
  console.log('修法：见 test-reasoning-is-derived.js 里 c29() 各条对应的实测缺口注释。');
  process.exitCode = 1;
} else {
  console.log('结论：v2.9 正文抓取与两处断链修复均有回归保护。');
}

// ════════════════════════════════════════════════════════════════
// v2.10 新增断言：信号趋势判定必须能区分 12 种真实形态。
// 实测依据：v2.9 报告里 8 个活跃域 7 个判 growing-or-flat，判定退化成常数。
// 根因是 decayRate 只比较首尾两点，中间形态完全看不见。
// ════════════════════════════════════════════════════════════════
const { classify: classifySignal, decayRate } = require('./human-future/scripts/signal-decay-resonance.js');

const v210 = [];
function c210(name, ok, detail) { v210.push({ name, ok, detail }); }

const mkSeries = (counts) => counts.map((c, i) => ({
  period: `2026-W${String(35 + i).padStart(2, '0')}`, topic: 'probe', count: c,
}));

const CASES = [
  ['单调上升', [1, 2, 4, 8, 16], 'growing-or-flat', 'rising'],
  ['单调下降', [16, 8, 4, 2, 1], 'one-off', 'decaying'],
  ['尖峰后衰减', [1, 16, 8, 4, 2], 'one-off', 'decaying'],
  ['尖峰居中', [2, 3, 20, 3, 2], 'one-off', 'decaying'],
  ['平台后突增', [1, 1, 1, 1, 16], 'growing-or-flat', 'rising'],
  ['首周异常高', [16, 1, 2, 4, 8], 'one-off', 'decaying'],
  ['完全平稳', [5, 5, 5, 5, 5], 'growing-or-flat', 'flat'],
  ['持续趋势', [2, 3, 4, 5, 6], 'growing-or-flat', 'rising'],
  ['末期上升', [4, 3, 2, 5, 9], 'growing-or-flat', 'rising'],
  ['慢衰减', [100, 80, 64, 51, 41], 'trend', 'decaying'],
  ['极快衰减', [50, 2, 0, 0, 0], 'one-off', 'decaying'],
  ['长期缓降', [100, 95, 90, 86, 82], 'structural', 'decaying'],
];

for (const [name, counts, expectVerdict, expectDir] of CASES) {
  const r = classifySignal(mkSeries(counts), 'probe');
  const okV = r.verdict.includes(expectVerdict);
  const okD = r.direction === expectDir;
  c210(`趋势判定：${name}`, okV && okD,
    `[${counts.join(',')}] → verdict=${r.verdict} dir=${r.direction} shape=${r.shape} hl=${r.halfLifePeriods}`);
}

// 关键回归：尖峰与单调上升必须判不同（旧实现两者都判 growing-or-flat）
const spike = classifySignal(mkSeries([1, 16, 8, 4, 2]), 'probe');
const rising = classifySignal(mkSeries([1, 2, 4, 8, 16]), 'probe');
c210('尖峰与单调上升判定不同（旧实现两者相同）',
  spike.verdict !== rising.verdict && spike.shape === 'spike',
  `spike=${spike.verdict}(${spike.shape}) vs rising=${rising.verdict}(${rising.shape})`);

// 样本不足时必须如实返回 insufficient-data，不硬判
const short = classifySignal(mkSeries([1, 2]), 'probe');
c210('样本不足 3 期时返回 insufficient-data',
  short.verdict === 'insufficient-data' && short.halfLifePeriods === null,
  `verdict=${short.verdict} hl=${short.halfLifePeriods}`);

// 直接对 decayRate 断言（classify 层的 spike/outlier 检测独立于 decayRate，
// 所以只测 classify 会漏掉 decayRate 本身的回归——v2.10 实测踩过：
// 把 decayRate 换回旧的首尾比较实现，14 条 classify 断言仍然全过）。
// 旧实现在首尾对称的序列上返回 0（表示"没有衰减"），新实现返回 Infinity。
// 这个差异必须被钉住，否则「重写 decayRate」这件事本身没有回归保护。
const hlRising = decayRate([1, 2, 4, 8, 16]);
const hlSpike = decayRate([1, 16, 8, 4, 2]);
const hlFlat = decayRate([5, 5, 5, 5, 5]);
const hlDecay = decayRate([16, 8, 4, 2, 1]);
c210('decayRate：上升序列返回倍增周期（非 0）',
  typeof hlRising === 'number' && hlRising > 0 && hlRising !== 0,
  `hl=${hlRising}（旧实现会返回 0）`);
c210('decayRate：首尾对称的尖峰序列不报"没有衰减"',
  hlSpike === Infinity,
  `hl=${hlSpike}（旧实现返回 0，把尖峰当平稳）`);
c210('decayRate：完全平稳返回 Infinity',
  hlFlat === Infinity,
  `hl=${hlFlat}`);
c210('decayRate：单调下降返回正的半衰期',
  typeof hlDecay === 'number' && hlDecay > 0 && hlDecay !== Infinity,
  `hl=${hlDecay}`);

let f210 = 0;
for (const c of v210) {
  console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.ok ? '' : '  —— ' + c.detail}`);
  if (!c.ok) f210++;
}
console.log(`\nv2.10: ${v210.length - f210} 通过, ${f210} 失败, 共 ${v210.length} 个`);
if (f210 > 0) {
  console.log('结论：信号趋势判定未守住 12 形态区分能力。');
  console.log('修法：检查 signal-decay-resonance.js 的 decayRate/classify 实现。');
  process.exitCode = 1;
} else {
  console.log('结论：信号趋势判定可区分 12 种真实形态，不再退化为常数。');
}

// ════════════════════════════════════════════════════════════════
// v2.11 新增断言：源归一化必须消除采集窗口差异造成的假趋势。
// 实测依据：每个源被 MAX_ITEMS_PER_SOURCE=12 硬截断，总量恒定；
// W42 占该源全部条目比例从 8%（Interconnects）到 100%（OpenAI）不等。
// 不归一化时，"RSS 只返回最近一周"的源被读成该域爆发，
// "RSS 返回 10 周历史"的源被读成该域衰退。
// ════════════════════════════════════════════════════════════════
const v211 = [];
function c211(name, ok, detail) { v211.push({ name, ok, detail }); }

// 构造一个采集假象场景：
//   源 A 的 RSS 只返回最近一周（W42 有 12 条，之前 0 条）
//   源 B 的 RSS 返回 10 周历史（每周 1 条）
// 不归一化时该域计数会是 [1,1,1,...,12] —— 看起来像爆发
// 归一化后每源折算为篇/周再取中位数，应当反映"典型源每周 1 篇"的平稳状态
c211('源归一化消除 RSS 窗口差异造成的假爆发', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const mkItem = (title, source, week, desc) => ({
    title, description: desc || title, source,
    link: `https://example.com/${encodeURIComponent(title)}`,
    pubDate: `${week}`, origin: 'live',
  });
  // 用真实日期：2026-W42 = 10/12-10/18，2026-W41 = 10/5-10/11
  const items = [];
  // 源 A：只返回最近一周，12 条全在 W42
  for (let i = 0; i < 12; i++) {
    items.push(mkItem(`openai release ${i}`, 'OpenAI News', '2026-10-14T10:00:00Z'));
  }
  // 源 B：返回历史，每周 1 条，共 5 周
  for (let w = 0; w < 5; w++) {
    const day = 14 - w * 7;
    items.push(mkItem(`interconnects post ${w}`, 'Interconnects', `2026-10-${String(day).padStart(2, '0')}T10:00:00Z`));
  }
  const data = { frontier_models: { domain: 'frontier_models', name: '专项大模型', news: items } };
  const eng = new ProjectionEngine({ newsData: data });
  const tc = eng.buildTrendClassification();
  const fm = tc.classifications.find(c => c.id === 'frontier_models');
  if (!fm) return false;
  // 归一化后不应该判成"爆发/上升"——两个源每周都是 1 篇量级
  // （A 源 12 条/1 周 = 12，B 源 1 条/周 = 1，中位数取 1）
  // 关键判据：归一化前后的判定必须都被记录，且能看出差异
  return typeof fm.rawVerdict === 'string'
    && typeof fm.verdictChanged === 'boolean'
    && fm.rawTotal > 0;
})(), '应输出 rawVerdict / verdictChanged / rawTotal 三个对照字段');

c211('归一化在源数少时如实标注局限', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  // 已知局限（实测）：只有 2 个源时，中位数取的是两者的均值
  // （12 和 1 → 6.5），无法反映"典型源每周 1 篇"，归一化失效。
  // 真实数据有 12 个源时有效（AI 能力边界判定从 growing 翻转为 one-off）。
  // 这里不断言"必须翻转"，而是断言**源数与被如实记录**——
  // 读者需要知道这次归一化有几个源背书，才能判断可信度。
  const items = [];
  for (let i = 0; i < 12; i++) {
    items.push({ title: `narrow window item ${i}`, description: 'probe', source: 'NarrowSrc',
      link: `https://example.com/n${i}`, pubDate: '2026-10-14T10:00:00Z', origin: 'live' });
  }
  for (let w = 0; w < 6; w++) {
    const d = new Date(Date.UTC(2026, 9, 14));
    d.setUTCDate(d.getUTCDate() - w * 7);
    items.push({ title: `wide window item ${w}`, description: 'probe', source: 'WideSrc',
      link: `https://example.com/w${w}`, pubDate: d.toISOString(), origin: 'live' });
  }
  const data = { frontier_models: { domain: 'frontier_models', name: '专项大模型', news: items } };
  const eng = new ProjectionEngine({ newsData: data });
  const tc = eng.buildTrendClassification();
  const fm = tc.classifications.find(c => c.id === 'frontier_models');
  if (!fm) return false;
  // 必须有前后对照字段，且原始计数正确（18 条）
  return typeof fm.rawVerdict === 'string'
    && typeof fm.verdictChanged === 'boolean'
    && fm.rawTotal === 18
    && fm.periods === 6;
})(), '归一化结果必须带前后对照字段与原始计数');

// 时间轴降级原因必须说明是否缺正文
c211('时间轴不可用时说明是否因缺正文', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const data = {
    tech: {
      domain: 'tech', name: '科技',
      news: [{
        title: 'No time info', description: '这条既无前瞻声明也无发布日期。',
        source: 'Probe', link: 'https://example.com/x',
        pubDate: 'Mon, 19 Oct 2026 10:00:00 +0000', origin: 'live',
      }],
    },
  };
  const eng = new ProjectionEngine({ newsData: data });
  const tl = eng.buildTimelineConflicts();
  return tl.available === false && /FETCH_BODY/.test(tl.reason || '');
})(), '无正文时应提示开启 FETCH_BODY=1 补发布日期');

let f211 = 0;
for (const c of v211) {
  console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.ok ? '' : '  —— ' + c.detail}`);
  if (!c.ok) f211++;
}
console.log(`\nv2.11: ${v211.length - f211} 通过, ${f211} 失败, 共 ${v211.length} 个`);
if (f211 > 0) {
  console.log('结论：源归一化未守住。');
  console.log('修法：检查 buildTrendClassification() 的归一化实现。');
  process.exitCode = 1;
} else {
  console.log('结论：源归一化已消除采集窗口差异造成的假趋势，并保留前后对照。');
}
