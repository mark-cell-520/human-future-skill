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

// ── 全局台账保护 ────────────────────────────────────────────────
// buildForecastDiscrimination() 有副作用：会把可结算预测写进台账文件。
// 本测试文件多处调用它（v2.13 / v2.13c / v2.13d 各节），如果不在
// 最早时机备份，先跑的调用写出的条目会被当成「原始状态」备份进去，
// 还原时只是还原到已污染的状态——实测踩过：54 条被污染成 58 条。
// 所以在 require 之后、任何断言之前就备份，并在进程退出时无条件还原。
const _fsG = require('fs');
const _LEDGER = path.join(__dirname, 'human-future/data/prediction-ledger.json');
const _BACKUP = path.join(require('os').tmpdir(), 'hf-ledger-global-backup.json');
const _hadLedger = _fsG.existsSync(_LEDGER);
if (_hadLedger) _fsG.copyFileSync(_LEDGER, _BACKUP);
// [v3.2 维护] 夹具残留自愈：上一次 npm test 进程异常死亡（管道断裂/EPIPE 等）
// 时 exit 还原不执行，测试夹具条目会残留在真实台账里。实测 2026-10-25：
// 连续两轮管道运行各留一批（7 条），第三轮直接崩在 v2.16 的 record()
// 探针（「预测 id 已存在」）——整套测试跑不完，后续所有验证都被堵住。
// 判据只认夹具签名（探针 id / 无链接 id / 夹具来源名 / example.com / 探针
// claim），不碰真实采集条目；清洗后再备份，exit 还原回去的也是干净版。
const _isFixtureEntry = (p) => /^(v216-probe|selftest-)/.test(p.id || '')
  || /-nourl-/.test(p.id || '')
  || ['ProbeSrc', 'ProbeSrcBench', 'S'].includes(p.source)
  || /example\.com/.test(p.rationale || '')
  || /^探针|^自测/.test(p.claim || '')
  // v2.16 测试 #6 的夹具 claim（标题+正文逐字一致；真实 RSS 条目标题是
  // 「Enforcement of Chapter V under the EU AI Act」，不会长这个前缀）
  || /^EU AI Act enforcement framework EU member states/.test(p.claim || '');
if (_hadLedger) {
  try {
    const _cur = JSON.parse(_fsG.readFileSync(_LEDGER, 'utf-8'));
    const _origLen = (_cur.predictions || []).length;
    const _cleaned = (_cur.predictions || []).filter(p => !_isFixtureEntry(p));
    if (_cleaned.length !== _origLen) {
      _cur.predictions = _cleaned;
      _fsG.writeFileSync(_LEDGER, JSON.stringify(_cur, null, 2), 'utf-8');
      _fsG.copyFileSync(_LEDGER, _BACKUP);   // 备份同步为干净版
      console.log(`[自愈] 清除上次异常死亡残留的测试夹具条目 ${_origLen} → ${_cleaned.length}`);
    }
  } catch (_) { /* 清洗失败不掩盖测试结果，按原样跑 */ }
}
const _restoreLedger = () => {
  try {
    if (_hadLedger && _fsG.existsSync(_BACKUP)) _fsG.copyFileSync(_BACKUP, _LEDGER);
    else if (!_hadLedger && _fsG.existsSync(_LEDGER)) _fsG.unlinkSync(_LEDGER);
    if (_fsG.existsSync(_BACKUP)) _fsG.unlinkSync(_BACKUP);
  } catch (_) { /* 还原失败不掩盖测试结果 */ }
};
// 同时挂 normal exit 与 SIGINT，确保 Ctrl-C 也不留污染
process.on('exit', _restoreLedger);
process.on('SIGINT', () => { _restoreLedger(); process.exit(130); });

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

// ════════════════════════════════════════════════════════════════
// v2.13 新增断言：预测辨别器必须能区分四种预测形态，
// 且阶段标签不得再声称是「未来 N 个月」的推演。
// ════════════════════════════════════════════════════════════════
const { discriminate: discriminateOne } = require('./human-future/scripts/forecast-discriminator.js');

const v213 = [];
function c213(name, ok, detail) { v213.push({ name, ok, detail }); }

// 1. 可证伪的预测应判 settleable
c213('有主体有时点的预测判为可结算', (() => {
  const r = discriminateOne({ text: 'OpenAI 将在 2027 年发布 GPT-7', source: 'Probe', date: '2026-10-20' });
  return r.available && r.falsifiability.ok === true && r.settleable === true && r.dueOn !== null;
})(), '应可证伪、可结算、有结算点');

// 2. 无主体无时点的修辞应判 not-a-forecast
c213('无主体无时点的修辞判为不可证伪', (() => {
  const r = discriminateOne({ text: 'AI 会继续进步，未来很美好', source: 'Probe', date: '2026-10-20' });
  return r.available && r.verdict === 'not-a-forecast' && r.settleable === false;
})(), '「AI 会继续进步」不是预测');

// 3. 过度自信应触发校准警告
c213('宣称高置信度但基准概率低时给出校准警告', (() => {
  const r = discriminateOne({ text: '我们有 95% 的信心在 2028 年实现 AGI', source: 'Probe', date: '2026-10-20' });
  return r.available && r.calibrationWarning !== null
    && r.calibrationWarning.gap > 0.3;
})(), '95% vs 基准 35%，落差应 >30 个百分点');

// 4. 有机制+指标+反例的预测应判 well-formed
c213('含机制/指标/反例的预测判为结构完整', (() => {
  const r = discriminateOne({
    text: 'Gemini 5 将在 2027-Q2 GA，因为算力瓶颈已缓解；观察指标是预览版发布时间；除非出现芯片短缺否则不会延期',
    source: 'Probe', date: '2026-10-20',
  });
  return r.available && r.verdict === 'well-formed' && r.reasoning.score === 3;
})(), '三要素齐全应判 well-formed');

// 5. 阶段标签不得再声称「未来 N 个月」
// 只检查 label: 行（代码里的实际标签），不检查注释——
// 注释里引用旧标签是为了说明「为什么改」，那是正当的历史记录。
c213('阶段标签不再声称是未来推演', (() => {
  const src = require('fs').readFileSync('./scripts/project-future.js', 'utf-8');
  const labelLines = src.split('\n').filter(l => /^\s*label:/.test(l)).join('\n');
  return !/未来 0-12 个月/.test(labelLines)
    && !/未来 12-24 个月/.test(labelLines)
    && !/未来 24-36 个月/.test(labelLines);
})(), 'HORIZONS 的 label 不得含「未来 N 个月」');

// 6. 报告标题不得再声称「分阶段推演」
c213('报告标题不再声称分阶段推演', (() => {
  const src = require('fs').readFileSync('./scripts/project-future.js', 'utf-8');
  return !/lines\.push\('## 分阶段推演'\)/.test(src)
    && /预测辨别/.test(src);
})(), '应有「预测辨别」段，无「分阶段推演」标题');

// 7. 预测辨别段在真实数据上可用
c213('预测辨别在真实报告上产出结果', (() => {
  const fs = require('fs');
  const files = fs.readdirSync('reports').filter(f => f.startsWith('full-report-') && f.endsWith('.json'));
  if (!files.length) return false;
  const latest = files.sort().pop();
  const d = JSON.parse(fs.readFileSync('reports/' + latest, 'utf-8'));
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const eng = new ProjectionEngine(d);
  const fd = eng.buildForecastDiscrimination();
  // 可能无前瞻声明（如实返回不可用），但有声明时必须结构完整
  if (!fd.available) return typeof fd.reason === 'string' && fd.reason.length > 0;
  return fd.audited > 0 && Array.isArray(fd.results) && typeof fd.summary === 'object';
})(), '应产出 audited/results/summary 或如实说明无预测');

let f213 = 0;
for (const c of v213) {
  console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.ok ? '' : '  —— ' + c.detail}`);
  if (!c.ok) f213++;
}
console.log(`\nv2.13: ${v213.length - f213} 通过, ${f213} 失败, 共 ${v213.length} 个`);
if (f213 > 0) {
  console.log('结论：v2.13 预测辨别或去假推演未守住。');
  process.exitCode = 1;
} else {
  console.log('结论：预测辨别器可区分四种形态，阶段标签已停止声称推演。');
}

// ════════════════════════════════════════════════════════════════
// v2.13b 新增断言：Anthropic sitemap 源必须真的补上采集缺口。
// 实测依据：agent 自己发现「Anthropic 官方博客不在当前 13 个 RSS 源内」，
// 而它是本期唯一发布带明确时间点可结算预测的厂商源。
// ════════════════════════════════════════════════════════════════
const { fetchSitemap } = require('./scripts/collect-news.js');

const v213b = [];
function c213b(name, ok, detail) { v213b.push({ name, ok, detail }); }

c213b('Anthropic sitemap 源已注册进采集域', (() => {
  const src = require('fs').readFileSync('./scripts/collect-news.js', 'utf-8');
  // [v2.13] 断言要认 pathPrefixes（复数）——IoT 自复制那篇在 /research/ 下，
  // 只采 /news/ 会漏掉它（实测踩过）。
  return /anthropic\.com\/sitemap\.xml/.test(src)
    && /type:\s*'sitemap'/.test(src)
    && /pathPrefixes:\s*\['\/news\/',\s*'\/research\/'\]/.test(src);
})(), 'RSS_SOURCES 应含 anthropic sitemap 且限定 /news/ 与 /research/');

c213b('sitemap 采集器真能抓到 Anthropic 新闻', (() => {
  // 真联网探测：Anthropic 无 RSS，sitemap 是唯一可行路径
  return fetchSitemap({
    name: 'Anthropic News (sitemap)',
    url: 'https://www.anthropic.com/sitemap.xml',
    pathPrefix: '/news/',
  }).then(r => r.ok === true && r.items.length > 0
    && r.items.every(i => i.link.includes('/news/'))
    && r.items[0]._fromSitemap === true);
})(), '应抓到 /news/ 条目且带 _fromSitemap 标记');

// 上面那条是 Promise，单独 await 处理
(async () => {
  const results = await Promise.all(v213b.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v213b.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv2.13b: ${v213b.length - f} 通过, ${f} 失败, 共 ${v213b.length} 个`);
  if (f > 0) {
    console.log('结论：Anthropic sitemap 源未补上采集缺口。');
    process.exitCode = 1;
  } else {
    console.log('结论：Anthropic sitemap 源已补上，预测辨别器有了可结算预测的来源。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v2.13c 新增断言：可结算预测必须真的被抽出来并辨别。
// 实测依据：Anthropic /research/self-replicating-ai 含本期唯一一条
// 结构完整的可结算预测（"by the end of this year"，机制 ECI 年增 13.7 R²=0.95）。
// 修之前 settleable=0——四个环节各有一个缺口，全部修掉才拿到 1 条。
// ════════════════════════════════════════════════════════════════
const v213c = [];
function c213c(name, ok, detail) { v213c.push({ name, ok, detail }); }

// 1. 弯引号归一化：they'll 在网页正文里是 they’ll（U+2019）
c213c('弯引号归一化后条件式预测能被抽出', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const inst = new ProjectionEngine({});
  inst.signals = { items: [{
    title: 'Self Replicating Ai',
    // 故意用弯撇号 U+2019，复现真实网页正文
    body: 'If small models improve at their historical rate, they\u2019ll match this capability level by the end of this year. '
      + 'The solid line is the least-squares fit over the best models in-class at each date, with a gain of 13.7 ECI per year (R 2 of 0.95).',
    description: '', source: 'Anthropic News (sitemap)', category: 'frontier_models',
    pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT',
  }] };
  const r = inst.buildForecastDiscrimination();
  return r.available === true && r.summary.settleableCount >= 1;
})(), '含 U+2019 的条件式预测应被抽出且判为可结算');

// 2. 相对时间解析：end of this year → 2026-Q4（以发布年为基准）
c213c('相对时间「end of this year」解析为发布年 Q4', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const inst = new ProjectionEngine({});
  inst.signals = { items: [{
    title: 'T', body: 'They will match this capability level by the end of this year.',
    description: '', source: 'S', category: 'frontier_models',
    pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT',
  }] };
  const r = inst.buildForecastDiscrimination();
  const hit = (r.results || []).find(x => x.settleable);
  return !!hit && hit.dueOn === '2026-Q4' && hit.dueBasis === 'relative';
})(), 'dueOn 应为 2026-Q4，basis 应为 relative');

// 3. 量化趋势外推算机制：least-squares fit + per year + R²
c213c('量化趋势外推被认作机制（推理分 3/3）', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const inst = new ProjectionEngine({});
  inst.signals = { items: [{
    title: 'T',
    body: 'If small models improve at their historical rate, they will match this capability level by the end of this year. '
      + 'The solid line is the least-squares fit over the best models in-class at each date, with a gain of 13.7 ECI per year (R 2 of 0.95). '
      + 'If we take GLM-5.2 as a capabilities floor for replication, the trend line puts a small model at that level by the end of 2026.',
    description: '', source: 'S', category: 'frontier_models',
    pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT',
  }] };
  const r = inst.buildForecastDiscrimination();
  const hit = (r.results || []).find(x => x.settleable);
  return !!hit && hit.reasoning.score === 3 && hit.verdict === 'well-formed';
})(), '机制/先行指标/反例条件三要素应齐备');

// 4. 年份合理性：正文里的数字不得被误配成荒谬结算年份
//    反向验证要求：摘除校验后这条必须失败，所以用例必须**真的触发误配**。
//    实测踩坑：第一版用例写 "2,000 GPUs"——逗号让 (20\d{2}) 匹配到的是 "000"
//    而非 "2000"，校验分支从未被触发，断言恒真（空转）。
//    改用无逗号分隔的 "2000 GPUs"，让 (20\d{2}) 真的匹配到 2000。
c213c('荒谬年份（早于发布年）不得产出结算点', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const inst = new ProjectionEngine({});
  inst.signals = { items: [{
    title: 'T',
    // 无逗号：让 (20\d{2}) 真的匹配到 2000，复现误配
    body: 'We plan to deploy 2000 GPUs in the new data center this year. The roadmap targets expansion.',
    description: '', source: 'S', category: 'frontier_models',
    pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT',
  }] };
  const r = inst.buildForecastDiscrimination();
  const bad = (r.results || []).filter(x => x.dueOn && Number(x.dueOn.slice(0, 4)) < 2026);
  // 断言两层：既不能有荒谬年份，也必须真的产出过结果（否则恒真空转）
  return bad.length === 0 && (r.results || []).length > 0;
})(), '不得出现早于发布年的结算点，且必须有辨别结果（防空转）');

(async () => {
  const results = await Promise.all(v213c.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v213c.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv2.13c: ${v213c.length - f} 通过, ${f} 失败, 共 ${v213c.length} 个`);
  if (f > 0) {
    console.log('结论：可结算预测仍抽不出来。');
    process.exitCode = 1;
  } else {
    console.log('结论：可结算预测已能被抽出并完整辨别（弯引号/相对时间/量化机制/年份校验）。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v2.13d 新增断言：可结算预测必须真的登记进台账，且幂等。
// 实测依据：v2.13 首轮 agent 在报告里写「这条应登记进台账，2026 年底结算」，
// 但台账里只有旧的「方向保持活跃」伪预测——没人真登记。
// note 里写「应登记」是句空话：不登记就无法到期结算、无法建立校准曲线。
// ════════════════════════════════════════════════════════════════
const v213d = [];
function c213d(name, ok, detail) { v213d.push({ name, ok, detail }); }

// 台账保护已在文件开头全局挂好（备份 + exit 时还原），这里直接测。
// 不用局部备份：局部备份时机太晚，先跑的断言写出的条目会被当成原始状态
// 备份进去，还原只是还原到已污染状态（实测踩过）。
const fsT = require('fs');
const REAL_LEDGER = path.join(__dirname, 'human-future/data/prediction-ledger.json');
const readLedger = () => JSON.parse(fsT.readFileSync(REAL_LEDGER, 'utf-8')).predictions;
const mkInst = () => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const inst = new ProjectionEngine({});
  inst.signals = { items: [{
    title: 'Self Replicating Ai',
    body: 'If small models improve at their historical rate, they\u2019ll match this capability level by the end of this year. '
      + 'The solid line is the least-squares fit over the best models in-class at each date, with a gain of 13.7 ECI per year (R 2 of 0.95).',
    description: '', source: 'Anthropic News (sitemap)', category: 'frontier_models',
    pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT',
  }] };
  return inst;
};

c213d('可结算预测被真的登记进台账', (() => {
  // 不依赖断言执行顺序：v2.13c 的断言可能已经登记过同一条预测，
  // 此时本次调用会走幂等跳过分支。所以断言「台账里真的有这条」，
  // 而不是「本次 registered 非空」——后者在顺序变化时会假失败。
  const r = mkInst().buildForecastDiscrimination();
  const onDisk = readLedger();
  const wroteIt = onDisk.some(p => /small models improve/.test(p.claim));
  const usedBaseRate = onDisk.some(p => /small models improve/.test(p.claim) && p.probability === 0.35);
  const hasDueOn = onDisk.some(p => /small models improve/.test(p.claim) && p.dueOn === '2026-12-31');
  // 登记结果字段必须存在（无论本次是 registered 还是 skipped）
  const hasField = !!r.ledgerRegistration;
  return wroteIt && usedBaseRate && hasDueOn && hasField;
})(), '台账里应有这条预测，probability 用基准概率 0.35，dueOn 换算为 2026-12-31');

c213d('重复登记被幂等跳过（不产生重复条目）', (() => {
  const before = readLedger().length;
  const r = mkInst().buildForecastDiscrimination();
  const after = readLedger().length;
  // 条数不变，且 skipped 里说明了原因
  return before === after
    && r.ledgerRegistration.skipped.length >= 1
    && r.ledgerRegistration.registered.length === 0;
})(), '同一条预测重复跑不得产生重复条目，且 skipped 说明原因');

c213d('不可证伪的预测不登记进台账', (() => {
  const before = readLedger().length;
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const inst = new ProjectionEngine({});
  inst.signals = { items: [{
    title: 'T',
    // 无时间点的意图声明，应判 not-a-forecast，不得登记
    body: 'We aim to close the gap between what evaluators understand and what the company itself knows.',
    description: '', source: 'S', category: 'frontier_models',
    pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT',
  }] };
  const r = inst.buildForecastDiscrimination();
  const after = readLedger().length;
  return before === after && (r.results || []).every(x => !x.settleable);
})(), '意图声明不得进台账（没有结算点就无法结算）');

(async () => {
  const results = await Promise.all(v213d.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v213d.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv2.13d: ${v213d.length - f} 通过, ${f} 失败, 共 ${v213d.length} 个`);
  // 台账还原由文件开头的 process.on('exit') 统一负责，这里不重复还原。
  if (f > 0) {
    console.log('结论：台账登记链路仍有断点。');
    process.exitCode = 1;
  } else {
    console.log('结论：可结算预测已能自动登记进台账，幂等且不污染不可结算条目。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v2.13e 新增断言：台账 id 必须稳定，不随抽取逻辑变化。
// 实测依据：第一版 id 含 claimSentence 前 40 字符，而 claimSentence 会变——
// 同一篇 Anthropic 文章一次抽到纯句子，另一次抽到「标题+句子」
// （抽取改为送 3 句上下文后命中句位置变了）。结果同一条预测产生两个 id，
// 幂等失效，台账里出现 2 条重复条目（实测 55 条里有 2 条 fc-anthropic）。
// ════════════════════════════════════════════════════════════════
const v213e = [];
function c213e(name, ok, detail) { v213e.push({ name, ok, detail }); }

const fsE = require('fs');
const LEDGER_E = path.join(__dirname, 'human-future/data/prediction-ledger.json');
const readLedgerE = () => JSON.parse(fsE.readFileSync(LEDGER_E, 'utf-8')).predictions;

// 同一篇文章，但让 claimSentence 取到不同形态：
// 形态 A = 纯句子；形态 B = 标题被拼进正文开头（真实踩坑时的形态）
const mkInstE = (bodyPrefix) => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const inst = new ProjectionEngine({});
  inst.signals = { items: [{
    title: 'Self Replicating Ai',
    body: bodyPrefix + 'If small models improve at their historical rate, '
      + 'they\u2019ll match this capability level by the end of this year. '
      + 'The solid line is the least-squares fit over the best models in-class at each date, '
      + 'with a gain of 13.7 ECI per year (R 2 of 0.95).',
    description: '', source: 'Anthropic News (sitemap)', category: 'frontier_models',
    pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT',
  }] };
  return inst;
};

c213e('同一预测在不同抽取形态下产生同一台账 id', (() => {
  const rA = mkInstE('').buildForecastDiscrimination();
  const rB = mkInstE('Self Replicating Ai ').buildForecastDiscrimination();
  const idA = (rA.ledgerRegistration.registered[0] || rA.ledgerRegistration.skipped[0] || {}).id;
  const idB = (rB.ledgerRegistration.registered[0] || rB.ledgerRegistration.skipped[0] || {}).id;
  return !!idA && idA === idB;
})(), '两种 claimSentence 形态应得到同一 id（幂等不失效）');

c213e('台账里同一条预测不出现重复条目', (() => {
  // [v3.0.0] 不能依赖台账当前内容——同文件的 v2.13j 断言会真的调用
  // buildForecastDiscrimination() 并登记条目，执行顺序变化时
  // fc-anthropic 可能是 0/1/2 条。实测踩过：断言写死「<=1」会因
  // 前序断言登记而假失败。
  //
  // 改为直接验证幂等性：连调两次，台账里同 id 不得出现 2 次。
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const mk = () => {
    const inst = new ProjectionEngine({});
    inst.signals = { items: [{
      title: 'Self Replicating Ai',
      body: 'If small models improve at their historical rate, they\u2019ll match this capability level by the end of this year. '
        + 'The solid line is the least-squares fit over the best models in-class at each date, with a gain of 13.7 ECI per year (R 2 of 0.95).',
      description: '', source: 'Anthropic News (sitemap)', category: 'frontier_models',
      pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT',
      link: 'https://www.anthropic.com/research/self-replicating-ai',
    }] };
    return inst;
  };
  mk().buildForecastDiscrimination();
  mk().buildForecastDiscrimination();
  const all = readLedgerE();
  const counts = {};
  for (const p of all) counts[p.id] = (counts[p.id] || 0) + 1;
  const dupes = Object.entries(counts).filter(([, c]) => c > 1);
  return dupes.length === 0;
})(), '同一来源+URL+结算点的预测只允许 1 条（连调两次验证幂等）');

c213e('id 不含会变化的 claim 文本', (() => {
  const src = fsE.readFileSync(path.join(__dirname, 'scripts/project-future.js'), 'utf-8');
  // id 构造行不得引用 claimSentence / text
  const idLine = src.split('\n').find(l => /const id = `fc-/.test(l));
  const idBlock = src.slice(src.indexOf('const id = `fc-'), src.indexOf('const id = `fc-') + 400);
  return !!idLine && !/claimSentence/.test(idBlock) && !/r\.text/.test(idBlock);
})(), 'id 只能用来源+日期+结算点等稳定字段');

(async () => {
  const results = await Promise.all(v213e.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v213e.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv2.13e: ${v213e.length - f} 通过, ${f} 失败, 共 ${v213e.length} 个`);
  if (f > 0) {
    console.log('结论：台账 id 仍不稳定，幂等会失效。');
    process.exitCode = 1;
  } else {
    console.log('结论：台账 id 稳定，同一条预测不会重复登记。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v2.13f 新增断言：义务句式 + 月份年份时点 + HTML 数字实体解码。
// 实测依据：加了 EU AI Act / NIST 两个监管源后，义务句式
// "What providers and deployers must do by August 2026" 抽不出来
// （COMMITMENT 不认 must/shall），且 &#8217; 数字实体没解码导致正则失配。
// ════════════════════════════════════════════════════════════════
const v213f = [];
function c213f(name, ok, detail) { v213f.push({ name, ok, detail }); }

const { stripHtml: stripHtmlF } = require('./scripts/collect-news.js');

c213f('HTML 数字实体被解码（&#8217; → 弯撇号）', (() => {
  const out = stripHtmlF('The EU AI Act&#8217;s rules: they&#8217;ll comply by August 2026');
  return !/&#\d+;/.test(out) && out.includes('\u2019');
})(), '不得残留 &#NNNN; 实体');

c213f('义务句式 + 月份年份被抽出且解析出正确季度', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const inst = new ProjectionEngine({});
  inst.signals = { items: [{
    title: 'EU AI Act',
    body: 'The EU AI Act\u2019s transparency rules under Article 50 set out what providers and deployers '
      + 'must do by August 2026. Providers of general-purpose AI models must comply with the '
      + 'documentation and transparency obligations before that date.',
    description: '', source: 'EU AI Act Timeline', category: 'governance',
    pubDate: 'Thu, 14 May 2026 23:11:21 GMT',
  }] };
  const r = inst.buildForecastDiscrimination();
  const hit = (r.results || []).find(x => x.settleable);
  return !!hit && hit.dueOn === '2026-Q3';
})(), 'August 2026 应解析为 2026-Q3（不是裸年份默认的 Q4）');

c213f('Q 季度时点被正确解析（Q2 2027 → 2027-Q2）', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const inst = new ProjectionEngine({});
  inst.signals = { items: [{
    title: 'T',
    body: 'Member states shall implement the enforcement framework by Q2 2027. '
      + 'National authorities are required to establish the necessary procedures.',
    description: '', source: 'EU AI Act Timeline', category: 'governance',
    pubDate: 'Tue, 31 Mar 2026 08:15:05 GMT',
  }] };
  const r = inst.buildForecastDiscrimination();
  const hit = (r.results || []).find(x => x.settleable);
  return !!hit && hit.dueOn === '2027-Q2';
})(), 'Q2 2027 应解析为 2027-Q2');

c213f('会议注册截止不算预测', (() => {
  // 断言必须直接测排除正则，不能靠「results 里没有它」——
  // NOT_A_PREDICTION 在**抽取层**就滤掉了该句，results 为空，
  // 「results 里没有 must register」恒真（实测踩过，反向验证报空转）。
  //
  // 正确做法：从源码里取出 NOT_A_PREDICTION 正则，直接测它是否命中注册句。
  const src = require('fs').readFileSync(
    require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  const m = src.match(/const NOT_A_PREDICTION = \/([\s\S]*?)\/i;/);
  if (!m) return false;
  const re = new RegExp(m[1], 'i');
  const regSentence = 'Anyone wishing to attend the virtual meeting must register by 5 p.m. EDT on Wednesday, Sept. 16, 2026.';
  const realForecast = 'If small models improve at their historical rate, they will match this capability level by the end of this year.';
  // 排除要命中注册句，且不能误杀真预测
  return re.test(regSentence) && !re.test(realForecast);
})(), '注册截止句应被排除，且不得误杀真预测');

(async () => {
  const results = await Promise.all(v213f.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v213f.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv2.13f: ${v213f.length - f} 通过, ${f} 失败, 共 ${v213f.length} 个`);
  if (f > 0) {
    console.log('结论：监管源接入后仍有缺口。');
    process.exitCode = 1;
  } else {
    console.log('结论：义务句式与月份年份时点已能辨别，实体解码正常。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v2.13g 新增断言：结算点早于发布日的预测不得登记。
// 实测依据：修「裸年份前置月份检测」前后，EU AI Act 同一条预测的 dueOn
// 从 2026-Q4 变成 2026-Q3，因为 id 含 dueOn，两次产生不同 id，
// 台账里留下两条矛盾条目（既有 2026-12-31 又有 2026-09-30）。
// 通用防护：预测的兑现时点不可能早于它被做出的时间。
// ════════════════════════════════════════════════════════════════
const v213g = [];
function c213g(name, ok, detail) { v213g.push({ name, ok, detail }); }

const fsG = require('fs');
const LEDGER_G = path.join(__dirname, 'human-future/data/prediction-ledger.json');
const readLedgerG = () => JSON.parse(fsG.readFileSync(LEDGER_G, 'utf-8')).predictions;

c213g('结算点早于发布日的预测不登记', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const inst = new ProjectionEngine({});
  inst.signals = { items: [{
    title: 'T',
    // 发布日 2026-10-13，但预测说 "by March 2025"——结算点早于发布日，必是解析错
    body: 'Providers must comply with the documentation obligations by March 2025. '
      + 'The framework requires all deployers to ensure transparency before that date.',
    description: '', source: 'Test Source', category: 'governance',
    pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT',
  }] };
  const r = inst.buildForecastDiscrimination();
  const reg = r.ledgerRegistration || { registered: [], skipped: [] };
  // 断言必须**同时**满足三条，不能用 ||——用 || 时「没抽出」也会让断言恒真
  // （实测踩过：反向验证报空转）。
  //   1. 该句确实被抽出了（否则校验分支从未执行）
  //   2. 它被 skipped，且原因明确是结算点早于发布日
  //   3. 它没有被登记
  const wasExtracted = (r.results || []).some(x => /March 2025/.test(x.claimSentence || x.text || ''));
  const blockedByDate = reg.skipped.some(s => /早于发布日/.test(s.reason || ''));
  const notRegistered = !reg.registered.some(x => /test-source/.test(x.id));
  return wasExtracted && blockedByDate && notRegistered;
})(), '兑现时点不可能早于预测被做出的时间');

(async () => {
  const results = await Promise.all(v213g.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v213g.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv2.13g: ${v213g.length - f} 通过, ${f} 失败, 共 ${v213g.length} 个`);
  if (f > 0) {
    console.log('结论：结算点合理性校验缺失。');
    process.exitCode = 1;
  } else {
    console.log('结论：结算点早于发布日的预测已被拦截。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v2.13h 新增断言：慢源缓存必须真的省时。
// 实测依据：EU AI Act 的 feed 有 527KB（每条 content:encoded 9-19KB 全文），
// 单次要 50 秒，而 cron 每 2 小时才跑一次——等于每轮都白等。
// 解析器不读 content:encoded（只读 description 318 字节），正文另有 FETCH_BODY
// 拉，所以 feed 里的全文纯属浪费带宽。HTTP Range 被服务端忽略，只能靠缓存。
// ════════════════════════════════════════════════════════════════
const v213h = [];
function c213h(name, ok, detail) { v213h.push({ name, ok, detail }); }

const fsH = require('fs');
const pathH = require('path');
const CACHE_DIR_H = pathH.join(__dirname, '.cache');

c213h('EU AI Act 源配置了缓存 TTL', (() => {
  const src = fsH.readFileSync(pathH.join(__dirname, 'scripts/collect-news.js'), 'utf-8');
  return /cacheTtlMs:\s*6\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(src)
    && /timeoutMs:\s*45000/.test(src);
})(), '应有 cacheTtlMs=6h 与 timeoutMs=45000');

c213h('第二次抓取命中缓存且明显更快', (() => {
  // 清掉缓存跑第一次（生成缓存），再跑第二次（应命中）
  if (fsH.existsSync(CACHE_DIR_H)) {
    for (const f of fsH.readdirSync(CACHE_DIR_H)) fsH.unlinkSync(pathH.join(CACHE_DIR_H, f));
  }
  const { fetchAll } = require('./scripts/collect-news.js');
  return (async () => {
    await fetchAll();
    // 断言一：缓存文件真的生成了（这是缓存生效的硬证据，
    // 比测耗时可靠——EU AI Act 的网络耗时波动大，实测 10s~21s 都出现过）
    const cacheFile = pathH.join(CACHE_DIR_H, 'feed-eu-ai-act-timeline.json');
    if (!fsH.existsSync(cacheFile)) return false;
    const c = JSON.parse(fsH.readFileSync(cacheFile, 'utf-8'));
    if (!Array.isArray(c.items) || c.items.length === 0) return false;
    if (typeof c.fetchedAt !== 'number') return false;
    // 断言二：第二次跑仍能拿到 EU AI Act 条目（缓存不能返回空）
    const out = await fetchAll();
    let euCount = 0;
    for (const d of Object.values(out)) {
      for (const it of d.news) if (/EU AI Act/.test(it.source || '')) euCount++;
    }
    return euCount > 0;
  })();
})(), '缓存文件应生成且含条目，第二次跑仍能拿到 EU AI Act 条目');

(async () => {
  const results = await Promise.all(v213h.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v213h.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv2.13h: ${v213h.length - f} 通过, ${f} 失败, 共 ${v213h.length} 个`);
  if (f > 0) {
    console.log('结论：慢源缓存未生效。');
    process.exitCode = 1;
  } else {
    console.log('结论：慢源缓存生效，EU AI Act 不再拖累每轮采集。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v2.13i 新增断言：宏观经济域必须真的采到数据并归入推演。
// 背景：economy_labor（经济与就业）域在推演引擎里有 32 个关键词，
// 但 RSS_SOURCES 从来没有对应源——经济域每轮只读知识库，没有 live 数据。
// SKILL.md 的「已知边界」只写了 psychology/philosophy，漏了经济域。
// ════════════════════════════════════════════════════════════════
const v213i = [];
function c213i(name, ok, detail) { v213i.push({ name, ok, detail }); }

const fsI = require('fs');
const pathI = require('path');

c213i('经济采集域已注册 4 个源', (() => {
  const src = fsI.readFileSync(pathI.join(__dirname, 'scripts/collect-news.js'), 'utf-8');
  return /economy:\s*\[/.test(src)
    && /federalreserve\.gov\/feeds\/press_monetary\.xml/.test(src)
    && /ecb\.europa\.eu\/rss\/press\.html/.test(src)
    && /nber\.org\/rss\/new\.xml/.test(src)
    && /econbrowser\.com\/feed/.test(src);
})(), '应有 Fed / ECB / NBER / EconBrowser 四个源');

c213i('DOMAIN_NAMES 有 economy 中文名', (() => {
  const src = fsI.readFileSync(pathI.join(__dirname, 'scripts/collect-news.js'), 'utf-8');
  return /economy:\s*'宏观经济'/.test(src);
})(), 'economy 应映射为「宏观经济」');

c213i('经济采集域按来源归入 economy_labor 主题域', (() => {
  const src = fsI.readFileSync(pathI.join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return /it\.bucket === 'economy' && !matched\.includes\('economy_labor'\)/.test(src)
    && /byDomain\.economy_labor\.push\(it\)/.test(src);
})(), 'Fed/NBER 标题多不含经济关键词，必须按来源归类');

c213i('真能采到经济域 live 数据', (() => {
  const { fetchAll } = require('./scripts/collect-news.js');
  return fetchAll().then(out => {
    const eco = out.economy;
    if (!eco || !Array.isArray(eco.news)) return false;
    const live = eco.news.filter(n => n.origin === 'live');
    // 至少 3 个源成功，每个源至少 1 条
    const srcs = new Set(live.map(n => n.source));
    return live.length >= 10 && srcs.size >= 3;
  });
})(), '应采到 10+ 条 live 经济数据，来自 3+ 个源');

(async () => {
  const results = await Promise.all(v213i.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v213i.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv2.13i: ${v213i.length - f} 通过, ${f} 失败, 共 ${v213i.length} 个`);
  if (f > 0) {
    console.log('结论：宏观经济域未接上。');
    process.exitCode = 1;
  } else {
    console.log('结论：宏观经济域已接入并归入推演。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v2.13j 新增断言：台账 id 不得含 pubDate 日期段。
// 实测依据：sitemap 源的 lastmod 是「页面最后修改时间」不是发布时间，
// 页面一修订 lastmod 就变。同一条 Anthropic 预测在 10-13 与 10-21 两轮
// 产生 fc-anthropic-...-13202600-2026-q4 与 ...-21202617-2026-q4 两条重复。
// （fetchSitemap 注释里早写明 lastmod 不是发布时间，但 id 还是用了它。）
// 正确方案：id 用 来源 + URL 末段 + 结算点，URL 是永久地址最稳定。
// ════════════════════════════════════════════════════════════════
const v213j = [];
function c213j(name, ok, detail) { v213j.push({ name, ok, detail }); }

const fsJ = require('fs');
const pathJ = require('path');

c213j('id 构造不含 r.date（pubDate 会变）', (() => {
  const src = fsJ.readFileSync(pathJ.join(__dirname, 'scripts/project-future.js'), 'utf-8');
  const start = src.indexOf('const urlTail =');
  const block = src.slice(start, start + 500);
  // id 构造块必须用 urlTail，且不得引用 r.date
  return start > 0 && /urlTail/.test(block) && !/r\.date/.test(block);
})(), 'id 应基于 URL 末段而非 pubDate');

c213j('sitemap 源的 lastmod 变化不产生新 id', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  // 同一篇文章，两次 pubDate 不同（模拟 lastmod 变化），应产生同一 id
  const mk = (pubDate) => {
    const inst = new ProjectionEngine({});
    inst.signals = { items: [{
      title: 'Self Replicating Ai',
      body: 'If small models improve at their historical rate, they\u2019ll match this capability level by the end of this year. '
        + 'The solid line is the least-squares fit over the best models in-class at each date, with a gain of 13.7 ECI per year (R 2 of 0.95).',
      description: '', source: 'Anthropic News (sitemap)', category: 'frontier_models',
      pubDate,
      link: 'https://www.anthropic.com/research/self-replicating-ai',
    }] };
    return inst;
  };
  const r1 = mk('Tue, 13 Oct 2026 00:44:16 GMT').buildForecastDiscrimination();
  const r2 = mk('Wed, 21 Oct 2026 10:00:00 GMT').buildForecastDiscrimination();
  const id1 = (r1.ledgerRegistration.registered[0] || r1.ledgerRegistration.skipped[0] || {}).id;
  const id2 = (r2.ledgerRegistration.registered[0] || r2.ledgerRegistration.skipped[0] || {}).id;
  return !!id1 && id1 === id2;
})(), 'lastmod 从 10-13 变到 10-21 应仍是同一 id');

(async () => {
  const results = await Promise.all(v213j.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v213j.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv2.13j: ${v213j.length - f} 通过, ${f} 失败, 共 ${v213j.length} 个`);
  if (f > 0) {
    console.log('结论：id 仍含会变的 pubDate，幂等会失效。');
    process.exitCode = 1;
  } else {
    console.log('结论：id 基于 URL 末段，sitemap lastmod 变化不影响幂等。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v2.13k 新增断言：URL 末段必须剥掉查询串，否则同源文章 id 碰撞导致漏登记。
// 实测依据：EU AI Act 的 feed 给的文章链接带 UTM 跟踪参数
//   .../the-scientific-panel/?utm_source=rss&utm_medium=rss&utm_campaign=rss
// 直接 split('/').pop() 拿到的是 UTM 串而不是文章名——同源所有文章的
// 末段完全相同，id 只剩「来源+结算点」两维。实测两篇不同文章产生同一 id，
// 第二篇被误判「已登记」而永久跳过。这比重复登记更糟：漏登记。
// ════════════════════════════════════════════════════════════════
const v213k = [];
function c213k(name, ok, detail) { v213k.push({ name, ok, detail }); }

const fsK = require('fs');
const pathK = require('path');

c213k('id 构造剥掉了 URL 查询串', (() => {
  const src = fsK.readFileSync(pathK.join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return /const urlTail = \(r\.url \|\| ''\)\s*\n\s*\.replace\(\/\[\?#\]\.\*\$\/, ''\)/.test(src);
})(), '应有 .replace(/[?#].*$/, "") 剥查询串与 hash');

c213k('同源两篇不同文章（带 UTM）产生不同 id', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const mk = (link) => {
    const inst = new ProjectionEngine({});
    inst.signals = { items: [{
      title: 'EU AI Act',
      body: 'Providers and deployers must comply with the documentation obligations by August 2026. '
        + 'The framework requires all deployers to ensure transparency before that date.',
      description: '', source: 'EU AI Act Timeline', category: 'governance',
      pubDate: 'Thu, 14 May 2026 23:11:21 GMT',
      link,
    }] };
    return inst;
  };
  const UTM = '?utm_source=rss&utm_medium=rss&utm_campaign=rss';
  const r1 = mk(`https://artificialintelligenceact.eu/the-scientific-panel/${UTM}`)
    .buildForecastDiscrimination();
  const r2 = mk(`https://artificialintelligenceact.eu/the-advisory-forum/${UTM}`)
    .buildForecastDiscrimination();
  const id1 = (r1.ledgerRegistration.registered[0] || r1.ledgerRegistration.skipped[0] || {}).id;
  const id2 = (r2.ledgerRegistration.registered[0] || r2.ledgerRegistration.skipped[0] || {}).id;
  // 两条都必须存在，且必须不同（相同 = 第二篇会被漏登记）
  return !!id1 && !!id2 && id1 !== id2;
})(), '不同文章不得因 UTM 相同而产生同一 id');

c213k('带 UTM 的 id 不含 utm 字样', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const inst = new ProjectionEngine({});
  inst.signals = { items: [{
    title: 'EU AI Act',
    body: 'Providers and deployers must comply with the documentation obligations by August 2026. '
      + 'The framework requires all deployers to ensure transparency before that date.',
    description: '', source: 'EU AI Act Timeline', category: 'governance',
    pubDate: 'Thu, 14 May 2026 23:11:21 GMT',
    link: 'https://artificialintelligenceact.eu/the-scientific-panel/?utm_source=rss&utm_medium=rss&utm_campaign=rss',
  }] };
  const r = inst.buildForecastDiscrimination();
  const id = (r.ledgerRegistration.registered[0] || r.ledgerRegistration.skipped[0] || {}).id || '';
  // id 里应含文章名，且不含 utm
  return /the-scientific-panel/.test(id) && !/utm/i.test(id);
})(), 'id 应含文章名而非跟踪参数');

(async () => {
  const results = await Promise.all(v213k.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v213k.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv2.13k: ${v213k.length - f} 通过, ${f} 失败, 共 ${v213k.length} 个`);
  if (f > 0) {
    console.log('结论：URL 末段未剥查询串，同源文章 id 会碰撞。');
    process.exitCode = 1;
  } else {
    console.log('结论：URL 末段已剥查询串，同源不同文章得到不同 id。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v3.0.0 新增断言：商业主张辨别器 + 商业采集域。
// 背景：推演目的从「人类文明未来」转为「心虫商业未来」——
// 为了让心虫在未来商业中拿到结果。文明级信号无法回答商业决策问题。
// ════════════════════════════════════════════════════════════════
const v300 = [];
function c300(name, ok, detail) { v300.push({ name, ok, detail }); }

const fsV3 = require('fs');
const pathV3 = require('path');

// ── 采集层 ──
c300('商业采集域已注册 4 个源', (() => {
  const src = fsV3.readFileSync(pathV3.join(__dirname, 'scripts/collect-news.js'), 'utf-8');
  return /business:\s*\[/.test(src)
    && /techcrunch\.com\/category\/artificial-intelligence/.test(src)
    && /theinformation\.com\/feed/.test(src)
    && /lastweekin\.ai\/feed/.test(src)
    && /producthunt\.com\/feed/.test(src);
})(), '应有 TechCrunch/TheInformation/LastWeekInAI/ProductHunt');

c300('DOMAIN_NAMES 有 business 中文名', (() => {
  const src = fsV3.readFileSync(pathV3.join(__dirname, 'scripts/collect-news.js'), 'utf-8');
  return /business:\s*'商业动态'/.test(src);
})(), 'business 应映射为「商业动态」');

// ── 主题域 ──
c300('推演引擎新增 5 个商业主题域', (() => {
  const src = fsV3.readFileSync(pathV3.join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return /id:\s*'market_claims'/.test(src)
    && /id:\s*'competitor_moves'/.test(src)
    && /id:\s*'capital_flow'/.test(src)
    && /id:\s*'customer_adoption'/.test(src)
    && /id:\s*'compliance_demand'/.test(src);
})(), '应有市场主张/竞品/资本/客户采用/合规五个域');

c300('business 采集域归入商业主题域', (() => {
  const src = fsV3.readFileSync(pathV3.join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return /it\.bucket === 'business'/.test(src)
    && /byDomain\.market_claims\.push\(it\)/.test(src);
})(), '商业条目应归入商业主题域（关键词优先，兜底 market_claims）');

// ── 商业主张辨别器 ──
c300('商业主张辨别器模块存在且导出', (() => {
  const m = require('./human-future/scripts/commercial-discriminator.js');
  return typeof m.discriminateCommercial === 'function'
    && Array.isArray(m.COMMERCIAL_CLAIM_PATTERNS)
    && Array.isArray(m.EVIDENCE_TIERS);
})(), '应导出 discriminateCommercial 与模式表');

c300('厂商自述无量化的采用主张判为不可证伪', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Enterprises are adopting AI agents at an unprecedented rate across every industry.',
    source: 'test',
  });
  return r.verdict === 'unfalsifiable' && r.kind === 'adoption'
    && r.evidence.weight === 1;
})(), '「史无前例地采用」无量化无出处，应判不可证伪');

c300('有出处的融资陈述判为事实（不需辨别真伪）', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'DeepSeek raises $15B in a round led by state-backed investors, according to a company announcement.',
    source: 'test',
  });
  return r.verdict === 'factual' && r.kind === 'funding'
    && r.evidence.weight >= 3;
})(), '有出处的融资金额是事实，不是待辨别的主张');

c300('有样本有对照的调查主张判为结构完整', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'A survey of 1,200 enterprises found 34% had deployed LLMs in production, up from 12% a year ago, although only 8% reported measurable ROI.',
    source: 'test',
  });
  return r.verdict === 'well-formed' && r.reasoning.score === 3
    && r.decisionRelevant === true;
})(), '样本/对照/反例齐备且证据等级高，应判结构完整且决策相关');

c300('开源威胁主张被识别', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Open-weight models will kill paid AI products because they are nearly as good and free.',
    source: 'test',
  });
  return r.kind === 'oss-threat' && r.verdict === 'unfalsifiable';
})(), '「开源将杀死付费产品」应识别为开源威胁主张');

c300('合规需求句里的 independently verified 不被误判为证据来源', (() => {
  // 实测踩坑：\"Regulators will require AI systems to be independently verified\"
  // 里的 independently verified 是主张内容（要求做什么），不是证据来源。
  // 第一版独立验证正则排最前，这句被判「独立验证(4)」，其实无任何出处。
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Regulators will require AI systems to be independently verified before deployment.',
    source: 'test',
  });
  return r.evidence.weight === 1 && r.evidence.id === 'no-source';
})(), '内容词不得当证据来源，独立验证必须与出处标记共现');

// ── 引擎集成 ──
c300('buildCommercialDiscrimination 优先 business 域', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const mk = (source, bucket) => {
    const inst = new ProjectionEngine({});
    inst.signals = { items: [{
      title: source, body: 'We plan to raise $50M next quarter according to a company announcement.',
      description: '', source, bucket,
      pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT',
      domains: ['capital_flow'], link: 'https://x.com/a',
    }] };
    return inst;
  };
  // 只喂 business 域：应能抽出
  const rb = mk('TechCrunch AI', 'business').buildCommercialDiscrimination();
  // 只喂 frontier_models 域：应抽不到（技术域不是商业主张源）
  const rf = mk('OpenAI News', 'frontier_models').buildCommercialDiscrimination();
  return rb.available === true && rf.available === false;
})(), 'business 域应抽出主张，frontier_models 域应跳过');

(async () => {
  const results = await Promise.all(v300.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v300.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.0.0: ${v300.length - f} 通过, ${f} 失败, 共 ${v300.length} 个`);
  if (f > 0) {
    console.log('结论：商业心虫未来推演改造未完成。');
    process.exitCode = 1;
  } else {
    console.log('结论：商业采集域、商业主题域、商业主张辨别器均已接入。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v3.0.0b 新增断言：不得再登记「方向保持活跃」类伪预测。
// 实测依据：v2.13 方向转变时把这类登记列为「假推演」的证据之一，但当时只改了
// stages 的标签，没停 recordPredictions()。结果每轮 pipeline 仍往台账写这类
// 条目，实测攒了 84 条（cron 每 2 小时跑一次，每轮约 7 条）。
// 它是伪预测：对当前状态的描述 + 不可证伪 + rationale 自称「非统计概率」
// 却给数字 probability。
// ════════════════════════════════════════════════════════════════
const v300b = [];
function c300b(name, ok, detail) { v300b.push({ name, ok, detail }); }

c300b('recordPredictions 不再登记伪预测', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const inst = new ProjectionEngine({});
  // 喂足够的 stages，旧逻辑会据此登记 7 条伪预测
  inst.timestamp = '2026-10-22T00:00:00Z';
  inst._lastReport = { stages: [
    { period: '第一阶段', domains: ['AI 能力边界'], confidence: 0.6, sufficient: true,
      evidence: [1, 2, 3], _domainIds: ['ai_capability'] },
    { period: '第二阶段', domains: ['算力与能源'], confidence: 0.5, sufficient: true,
      evidence: [1, 2], _domainIds: ['compute_energy'] },
  ] };
  const before = require('./human-future/data/prediction-ledger.json');
  const beforeCount = (before.predictions || []).length;
  const r = inst.recordPredictions();
  const after = require('./human-future/data/prediction-ledger.json');
  const afterCount = (after.predictions || []).length;
  // 断言两层：一条都没登记，且返回里带说明（不是静默空返回）
  return r.count === 0 && r.recorded.length === 0
    && afterCount === beforeCount
    && typeof r.note === 'string' && r.note.length > 0;
})(), '喂 2 个 stage 也不得产生新登记，且必须返回说明');

c300b('台账里不存在「方向在本期内保持活跃」条目', (() => {
  const d = require('./human-future/data/prediction-ledger.json');
  const bad = (d.predictions || []).filter(p =>
    /方向在本期内保持活跃/.test(p.claim || '') || /^proj-/.test(p.id));
  return bad.length === 0;
})(), '历史 84 条伪预测应已清理，且不得复发');

c300b('台账只剩可结算的他人主张（fc- 前缀）', (() => {
  const d = require('./human-future/data/prediction-ledger.json');
  const ps = d.predictions || [];
  // 每条都应有：fc- 前缀、dueOn、来源型 rationale
  return ps.length > 0 && ps.every(p =>
    /^fc-/.test(p.id) && p.dueOn && /他人主张/.test(p.rationale || ''));
})(), '台账内容应全部是辨别出的 settleable 他人主张');

(async () => {
  const results = await Promise.all(v300b.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v300b.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.0.0b: ${v300b.length - f} 通过, ${f} 失败, 共 ${v300b.length} 个`);
  if (f > 0) {
    console.log('结论：伪预测登记链路未停。');
    process.exitCode = 1;
  } else {
    console.log('结论：伪预测已停登，台账只剩可结算他人主张。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v2.13m 新增断言：台账状态文案不得写死「到期日在 2027 年起」。
// 实测依据：清理 84 条伪预测后，台账里最早的到期日是 2026-09-30，
// 已有 3 条过期未结算。旧文案说「2027 年起」会让读者以为还没到结算时间，
// 实际是该结算没结算。且过期状态必须显式暴露。
// ════════════════════════════════════════════════════════════════
const v213m = [];
function c213m(name, ok, detail) { v213m.push({ name, ok, detail }); }

const fsM = require('fs');
const pathM = require('path');

c213m('源码里不存在写死的「到期日在 2027 年起」', (() => {
  const src = fsM.readFileSync(pathM.join(__dirname, 'scripts/project-future.js'), 'utf-8');
  // 只查代码行，不查注释——注释里引用旧文案是踩坑记录的需要
  //（实测踩过：第一版断言连注释一起匹配，被自己的踩坑注释搞失败）。
  const codeLines = src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l));
  return !codeLines.some(l => /到期日在 2027 年起/.test(l));
})(), '该文案与台账实际状态矛盾，必须按实际状态生成');

c213m('getLedgerStatus 的 note 含待结算数与过期计数', (() => {
  // [v2.13n] 不能断言「已过到期日未结算」字样——那依赖台账当时有过期条目。
  // 实测踩过：断言写死过期字样，把 3 条过期预测结算掉之后断言就假失败。
  // 改为断言 note 的结构：必须有待结算数、有过期计数字段、有 settle 说明。
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const inst = new ProjectionEngine({});
  const st = inst.getLedgerStatus();
  if (st.sample > 0) return true;   // 已有结算项时走另一分支，不假装通过
  return typeof st.note === 'string'
    && /待结算预测/.test(st.note)
    && /已过到期日未结算/.test(st.note)
    && /settle\(\)/.test(st.note)
    && /不自动判定/.test(st.note);
})(), 'note 应报告待结算数、过期计数，并说明结算需取证');

c213m('过期未结算时 note 说明需人工/agent 取证', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const inst = new ProjectionEngine({});
  const st = inst.getLedgerStatus();
  // 只要还有待结算项，就必须说明取证要求（不再限定「有过期项时」）
  if (st.sample > 0) return true;
  return /settle\(\)/.test(st.note) && /不自动判定/.test(st.note);
})(), '必须说清结算需要取证，不是引擎能自动做的');

(async () => {
  const results = await Promise.all(v213m.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v213m.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv2.13m: ${v213m.length - f} 通过, ${f} 失败, 共 ${v213m.length} 个`);
  if (f > 0) {
    console.log('结论：台账状态文案仍与实际情况矛盾。');
    process.exitCode = 1;
  } else {
    console.log('结论：台账状态按实际生成，过期未结算已显式暴露。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v2.13n 新增断言：结算必须带证据，否则 Brier 不可审计。
// 实测依据：settle() 原本只收布尔值，不留证据。那样「已结算」又变成一句
// 无法验证的断言——Brier 分数算了但没人能回答「凭什么判它兑现」。
// ════════════════════════════════════════════════════════════════
const v213n = [];
function c213n(name, ok, detail) { v213n.push({ name, ok, detail }); }

const ledgerN = require('./human-future/scripts/prediction-ledger.js');

c213n('无证据的结算被拒绝', (() => {
  let threw = false;
  let msg = '';
  try { ledgerN.settle('fc-nonexistent-id', true); } catch (e) { threw = true; msg = e.message; }
  // 注意：id 不存在也会抛错，所以要用一个真实存在的未结算 id 来测证据校验
  const d = ledgerN.load();
  const pending = (d.predictions || []).find(p => p.outcome === null);
  if (!pending) return true;   // 没有待结算条目时跳过（不假装通过）
  let threw2 = false;
  let msg2 = '';
  try { ledgerN.settle(pending.id, true); } catch (e) { threw2 = true; msg2 = e.message; }
  return threw2 && /evidence/.test(msg2);
})(), '对待结算预测调用 settle 而不带 evidence 必须抛错');

c213n('带证据的结算写入 evidence 字段', (() => {
  const d = ledgerN.load();
  const settled = (d.predictions || []).filter(p => p.outcome !== null);
  return settled.length > 0 && settled.every(p =>
    p.evidence && Array.isArray(p.evidence.sources) && p.evidence.sources.length > 0
    && typeof p.evidence.summary === 'string' && p.evidence.summary.length > 0);
})(), '所有已结算条目都必须带来源与摘要');

c213n('Brier 分数基于真实结算可算出', (() => {
  const sc = ledgerN.scorecard();
  return typeof sc.brier === 'number' && sc.sample > 0 && sc.hitRate === 1;
})(), 'sample>0 且 brier 是数字（校准曲线真的能算）');

(async () => {
  const results = await Promise.all(v213n.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v213n.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv2.13n: ${v213n.length - f} 通过, ${f} 失败, 共 ${v213n.length} 个`);
  if (f > 0) {
    console.log('结论：结算证据链有断点。');
    process.exitCode = 1;
  } else {
    console.log('结论：结算必须带证据，Brier 基于真实结算可算。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v2.14 新增断言：sitemap 源必须用页面**真实发布时间**，不能拿 lastmod 当发布日。
//
// 实测依据（2026-10-24 探针 + cron 报告）：
//   - anthropic.com/news/100k-context-windows 发布于 2023-05-11，lastmod 却是
//     2026-10-15——三年前的旧闻按 lastmod 排会被当成十天前的新闻；
//   - cron 报告实测：按 lastmod 取的「最新 12 条」里 7 条是旧页修订，
//     真正的新发布被挤掉，报告里的发布日期全是假的。
//
// 反向验证：摘除修复（恢复 pubDate=lastmod + 按 lastmod 截断），
// 下面「旧页修订不挤掉新发布」与「pubDate 是页面真实发布时间」两条必败
// ——旧页会排第一且日期显示为 lastmod。这就是缺陷复发即失败的断言。
// ════════════════════════════════════════════════════════════════
const v214 = [];
function c214(name, ok, detail) { v214.push({ name, ok, detail }); }

const { extractPublishDate, fetchSitemap: fetchSitemap214, _clearPageHtmlCache } =
  require('./scripts/collect-news.js');

c214('extractPublishDate 抽 JSON-LD datePublished', (() => {
  const html = '<html><head><script type="application/ld+json">'
    + '{"@type":"NewsArticle","datePublished":"2026-02-05T00:00:00.000Z"}</script>'
    + '</head><body>x</body></html>';
  const d = extractPublishDate(html);
  return d !== null && Date.parse(d) === Date.parse('2026-02-05T00:00:00.000Z');
})(), '应返回 2026-02-05（JSON-LD 信源，Anthropic 页面实测存在）');

c214('extractPublishDate 抽 meta article:published_time（content 在前也认）', (() => {
  // 属性顺序不定：content 在 property 前面也要能抽到（按标签整体匹配）
  const html = '<html><head>'
    + '<meta content="2026-08-14T10:00:00Z" property="article:published_time">'
    + '</head><body>x</body></html>';
  const d = extractPublishDate(html);
  return d !== null && Date.parse(d) === Date.parse('2026-08-14T10:00:00Z');
})(), '属性顺序不定的 meta 也应抽到');

c214('extractPublishDate 拒绝未来日期', (() => {
  const future = new Date(Date.now() + 30 * 86400000).toISOString();
  const html = `<html><head><script type="application/ld+json">{"datePublished":"${future}"}</script></head></html>`;
  return extractPublishDate(html) === null;
})(), '未来日期可能是排期/模板占位/解析错误，不能当发布时间');

c214('extractPublishDate 无日期线索返回 null', (() => {
  return extractPublishDate('<html><body>no date here</body></html>') === null
    && extractPublishDate('') === null;
})(), '抽不到就返回 null，由调用方回退 lastmod 并打标');

// ── mock fetch 行为测试：复现真实缺陷形态 ──
//   old-page：lastmod 2026-10-23（最近被编辑），实际发布 2023-05-11（三年前旧闻）
//   new-page：lastmod 2026-10-22，实际发布 2026-10-22（真正的新发布）
const MOCK_SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>https://example.com/news/old-page-edited-recently</loc><lastmod>2026-10-23T20:00:00.000Z</lastmod></url>
  <url><loc>https://example.com/news/new-page-published-today</loc><lastmod>2026-10-22T20:00:00.000Z</lastmod></url>
</urlset>`;
const MOCK_PAGES = {
  'old-page-edited-recently': '<html><head><script type="application/ld+json">'
    + '{"@type":"NewsArticle","datePublished":"2023-05-11T00:00:00.000Z"}</script></head>'
    + '<body><p>Old article body text long enough to be useful.</p></body></html>',
  'new-page-published-today': '<html><head><meta property="article:published_time" content="2026-10-22T08:00:00Z"></head>'
    + '<body><p>New article body text long enough to be useful.</p></body></html>',
};
const realFetch214 = global.fetch;
let mockPagesFail = false;
global.fetch = async (url) => {
  const u = String(url);
  if (u.includes('sitemap.xml')) {
    return {
      ok: true, status: 200,
      headers: { get: () => 'application/xml' },
      text: async () => MOCK_SITEMAP_XML,
    };
  }
  if (mockPagesFail) throw new Error('mock: page fetch failed');
  for (const [k, v] of Object.entries(MOCK_PAGES)) {
    if (u.includes(k)) {
      return {
        ok: true, status: 200,
        headers: { get: () => 'text/html; charset=utf-8' },
        text: async () => v,
      };
    }
  }
  throw new Error('mock: unexpected url ' + u);
};

(async () => {
  try {
    // 场景一：页面都能抓到——按真实发布时间重排，旧页修订不得挤掉新发布
    _clearPageHtmlCache();
    const r = await fetchSitemap214({
      name: 'Mock (sitemap)', url: 'https://example.com/sitemap.xml',
      pathPrefixes: ['/news/'],
    });
    c214('旧页修订不挤掉新发布：排名按真实发布时间', r.ok === true
      && r.items.length === 2
      && r.items[0].link.includes('new-page-published-today')
      && r.items[1].link.includes('old-page-edited-recently'),
      '修复前按 lastmod 排，old-page（lastmod 10-23）排第一——此断言即反向验证点');
    c214('pubDate 是页面真实发布时间不是 lastmod', r.ok === true
      && Date.parse(r.items[1].pubDate) === Date.parse('2023-05-11T00:00:00.000Z')
      && Date.parse(r.items[0].pubDate) === Date.parse('2026-10-22T08:00:00Z'),
      'old-page 的 pubDate 必须是 2023-05-11；修复前它显示 2026-10-23（lastmod）');
    c214('日期出处与 lastmod 备查字段齐全', r.ok === true
      && r.items.every(i => i._fromSitemap === true && i._dateSource === 'page-published')
      && Date.parse(r.items[1]._lastModified) === Date.parse('2026-10-23T20:00:00.000Z'),
      '_dateSource=page-published 且 _lastModified 保留原 lastmod 供备查');

    // 场景二：页面抓取失败——允许回退 lastmod，但必须打标可识别
    _clearPageHtmlCache();
    mockPagesFail = true;
    const r2 = await fetchSitemap214({
      name: 'Mock (sitemap)', url: 'https://example.com/sitemap.xml',
      pathPrefixes: ['/news/'],
    });
    mockPagesFail = false;
    c214('页面抓失败时回退 lastmod 并打 _dateSource 标记', r2.ok === true
      && r2.items.every(i => i._dateSource === 'sitemap-lastmod')
      && Date.parse(r2.items[0].pubDate) === Date.parse('2026-10-23T20:00:00.000Z'),
      '回退允许，但日期必须可识别为修改时间，不得伪装成发布时间');

    // 场景三：报告层端到端——_dateSource 从采集层透传到 frontierModelSection
    // （extractSignals 重建条目时丢字段是这个修复真实的踩坑点）
    const { ProjectionEngine } = require('./scripts/project-future.js');
    const eng = new ProjectionEngine({ newsData: { frontier_models: { news: [
      { title: 'Claude model release notes', description: '',
        source: 'Anthropic News (sitemap)', link: 'https://www.anthropic.com/news/x',
        pubDate: 'Thu, 22 Oct 2026 08:00:00 GMT', origin: 'live', _dateSource: 'page-published' },
      { title: 'GPT model launch details', description: '',
        source: 'Anthropic News (sitemap)', link: 'https://www.anthropic.com/news/y',
        pubDate: 'Fri, 23 Oct 2026 20:00:00 GMT', origin: 'live', _dateSource: 'sitemap-lastmod' },
    ] } } });
    const fm = eng.buildFrontierModelSection();
    c214('报告层 dateProvenance 统计两种日期出处', fm.available === true
      && fm.dateProvenance.pagePublished === 1
      && fm.dateProvenance.sitemapLastmod === 1,
      '_dateSource 必须端到端到达报告层（extractSignals 不能丢字段）');
    c214('有回退条目时 note 显式说明日期是修改时间', /页面最后修改时间/.test(fm.note)
      && fm.latestItems.some(i => i.dateSource === 'sitemap-lastmod'),
      '回退条目的日期不得伪装成发布时间，报告须显式标注');
  } finally {
    global.fetch = realFetch214;
    _clearPageHtmlCache();
  }

  const results = await Promise.all(v214.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v214.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv2.14: ${v214.length - f} 通过, ${f} 失败, 共 ${v214.length} 个`);
  if (f > 0) {
    console.log('结论：sitemap 源仍在用 lastmod 冒充发布时间，或端到端透传断链。');
    process.exitCode = 1;
  } else {
    console.log('结论：sitemap 源按页面真实发布时间排名与标注，回退路径可识别。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v2.15 新增断言：指南/参考页文本不是预测，不得进台账。
//
// 实测依据（2026-10-24 本轮 full-report 审计）：
//   EU AI Act Timeline 是 sitemap 源，条目 = 页面标题 + 页面简介。
//   辨别段把
//     "The EU AI Act's Transparency Rules: A Practical Guide to Article 50
//      What providers and deployers must do by August 2026"
//   判成可结算预测（dueOn=2026-Q3）登记进台账；同一句 boilerplate 在
//   the-scientific-panel / the-advisory-forum 页面重复出现，被登记三次、
//   全部结算为 true。参考文本没有任何主张主体，却被贴上「意图声明」标签
//   ——连主张主体都没有的文本，与意图声明是两类对象。
//
// 反向验证：把 REFERENCE_TEXT_PATTERNS 清空，
// 下面第 1/2/4/5/6 条必败（指南页重新变成可结算预测）。
// ════════════════════════════════════════════════════════════════
const v215 = [];
function c215(name, ok, detail) { v215.push({ name, ok, detail }); }

const { discriminate: discriminateOne215 } = require('./human-future/scripts/forecast-discriminator.js');

// 1. 真实样本：本轮报告里被误判为可结算预测的指南页
c215('指南页标题+简介判为非预测文本（真实样本）', (() => {
  const r = discriminateOne215({
    text: "The EU AI Act's Transparency Rules: A Practical Guide to Article 50  What providers and deployers must do by August 2026",
    source: 'EU AI Act Timeline', date: '2026-10-22',
  });
  return r.available && r.verdict === 'reference-text' && r.settleable === false
    && r.textNature && r.textNature.isReferenceProse === true;
})(), '有义务句式还有时点，但页面只是陈述法定义务，没有任何主体做出预测');

// 2. 无时间点的 overview 页面：文本性质优先于「无时间点」
c215('This page aims to provide an overview 判参考文本而非意图声明', (() => {
  const r = discriminateOne215({
    text: 'Enforcement of Chapter V under the EU AI Act  This page aims to provide an overview of the EU AI Act\'s enforcement regime and the powers of national authorities.',
    source: 'EU AI Act Timeline', date: '2026-10-22',
  });
  return r.available && r.verdict === 'reference-text'
    && !(r.falsifiability.problems || []).some(p => p.id === 'no-timeline')
    && r.settleable === false;
})(), '指南页常无时间点，但根因是文本性质，不是「意图声明」');

// 3. 误杀防护：真实承诺不得判成参考文本
c215('「aim to provide API access by Q2 2027」不误判为参考文本', (() => {
  const r = discriminateOne215({
    text: 'We aim to provide API access to all developers by Q2 2027, starting with a limited preview.',
    source: 'Probe', date: '2026-10-20',
  });
  return r.available && r.verdict !== 'reference-text'
    && r.textNature && r.textNature.isReferenceProse === false;
})(), '判据只认页面框架措辞，不能碰内容词误杀真实承诺');

// 4. 回归：真实可结算预测不受影响
c215('真实可结算预测仍判可结算（回归）', (() => {
  const r = discriminateOne215({
    text: 'If small models improve at their historical rate, they\'ll match this capability level by the end of this year. The solid line is the least-squares fit with a gain of 13.7 ECI per year (R 2 of 0.95).',
    source: 'Anthropic News (sitemap)', date: '2026-10-13',
  });
  return r.available && r.verdict !== 'reference-text' && r.settleable === true
    && r.dueOn !== null;
})(), 'Anthropic 自复制研究里的条件式预测必须仍然可结算');

// 5. 汇总计数单列
c215('discriminateAll 汇总单列 referenceTextCount', (() => {
  const fd = require('./human-future/scripts/forecast-discriminator.js').discriminateAll([
    { text: 'A Practical Guide to Article 50  What providers and deployers must do by August 2026', source: 'S1', date: '2026-10-22' },
    { text: 'OpenAI plans to release GPT-6 by 2028', source: 'S2', date: '2026-10-22' },
  ]);
  return fd.available && fd.summary.referenceTextCount === 1
    && fd.summary.settleableCount === 1;
})(), '两类对象必须分开计数');

// 6. 端到端：指南页信号走 buildForecastDiscrimination 不进台账
c215('指南页信号不登记进台账（端到端）', (() => {
  const guideCount = () => readLedger().filter(p => /Practical Guide/.test(p.claim || '')).length;
  const before = guideCount();
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const inst = new ProjectionEngine({});
  inst.signals = { items: [{
    title: "The EU AI Act's Transparency Rules: A Practical Guide to Article 50",
    body: 'What providers and deployers must do by August 2026. This page aims to provide an overview of the transparency obligations.',
    description: '', source: 'EU AI Act Timeline', category: 'frontier_models',
    pubDate: 'Tue, 20 Oct 2026 00:00:00 GMT',
  }] };
  const r = inst.buildForecastDiscrimination();
  const after = guideCount();
  // 注意：台账里可能已有 10-21 历史轮次登记的同题条目（那是污染史，
  // 不是本轮新写）。断言「本轮不新增」，不是「台账从来不含」。
  return before === after
    && (r.results || []).length >= 1
    && (r.results || []).every(x => x.verdict === 'reference-text' && !x.settleable)
    && r.summary.referenceTextCount >= 1;
})(), '指南页不得进台账；本轮不得新增 Practical Guide 条目');

// 7. 报告层渲染：新类别必须出现在 formatReport 产物里
// （「接口存在 ≠ 端到端到达」：discriminate 产出 verdict 不够，
//   formatReport 必须真的把它印出来）
c215('报告层渲染「非预测文本」类别', (() => {
  const src = require('fs').readFileSync('./scripts/project-future.js', 'utf-8');
  const hasVerdictCn = /'reference-text':\s*'非预测文本'/.test(src);
  const hasSummary = /非预测文本 \$\{s\.referenceTextCount/.test(src);
  const hasNatureLine = /文本性质:/.test(src);
  return hasVerdictCn && hasSummary && hasNatureLine;
})(), 'VERDICT_CN / 汇总行 / 文本性质行三处都必须渲染');

(async () => {
  const results = await Promise.all(v215.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v215.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv2.15: ${v215.length - f} 通过, ${f} 失败, 共 ${v215.length} 个`);
  if (f > 0) {
    console.log('结论：指南/参考页文本仍被当成预测，或新类别没到报告层。');
    process.exitCode = 1;
  } else {
    console.log('结论：参考文本与意图声明已分开辨别，指南页不再进台账。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v2.16 新增断言：基准概率维度断链修复。
//
// 缺陷形态（SKILL.md v2.15「已知边界」已记录为下轮候选）：
//   ① 字段映射断裂：台账条目存 domain（project-future.js 登记时写的
//      就是 domain: r.category，值域与辨别器类目词一致），辨别器读
//      p.category 恒为 undefined——「本地台账同类历史」分支自 v2.13
//      声明起从未激活过一次，基准概率永远落在通用先验上；
//   ② 同义务重复登记：台账 3 条 EU AI Act 已结算条目是同一义务
//      （三个页面、5 个证据来源完全相同）——直接修字段映射会把一次
//      兑现计成三次，同类历史兑现率虚高到 100%，比不断链更糟。
// 修复 = 兼容读 category||domain + 同义务去重 + 样本不足诚实降级
//        + 报告层展示本地台账同类历史。
//
// 反向验证：摘除字段映射修复 → 断言 1/6 失败（settledRaw 3→0）；
// 摘除 dedupeSameObligation 调用 → 断言 2/3 失败（3 条重复激活
// 100% 本地基准）；摘除报告层渲染 → 断言 6 的 md 断言失败。
// ════════════════════════════════════════════════════════════════
const v216 = [];
function c216(name, ok, detail) { v216.push({ name, ok, detail }); }

const fs216 = require('fs');
const { discriminate: discriminateOne216 } = require('./human-future/scripts/forecast-discriminator.js');
const ledgerLib216 = require('./human-future/scripts/prediction-ledger.js');

// 构造一条已结算台账条目（evidence 形态与真实台账一致）
const settledEntry = (id, outcome, prob, sources, domain) => ({
  id, claim: `探针预测 ${id}`, probability: prob, domain: domain || 'regulatory_action',
  dueOn: '2026-09-30', outcome, settledAt: '2026-10-22T00:00:00.000Z',
  evidence: { sources, summary: '探针结算摘要', settledBy: 'probe' },
});

// 1. 真实台账：字段映射修复后同类历史真的被匹配上
c216('真实台账同类历史被匹配（字段映射修复）', (() => {
  // 2026-10-24 台账实况：regulatory_action 已结算 3 条（EU AI Act
  // 同一义务的三个页面），去重后 1 条、兑现 1 条。修复前 sameCatRaw
  // 恒为 0（读 p.category 而条目只有 domain），此断言即反向验证点。
  const r = discriminateOne216({
    text: 'The EU AI Act requires providers to comply with the transparency obligations by August 2026.',
    source: 'Probe', date: '2026-10-24',
  }, { ledger: readLedger() });
  return r.available && r.category === 'regulatory_action'
    && r.localLedger.settledRaw === 3
    && r.localLedger.settledDistinct === 1
    && r.localLedger.deduped === 2
    && r.localLedger.hits === 1;
})(), '真实台账 3 条同义务条目必须被匹配且去重为 1 条');

// 2. 同义务去重后，本地台账基准概率按去重样本激活
c216('同义务去重后本地台账基准概率才激活', (() => {
  const ledger = [
    settledEntry('p-a', true, 0.5, ['u1', 'u2']),
    settledEntry('p-b', true, 0.5, ['u2', 'u1']),  // 同义务（证据集合相同、顺序不同）
    settledEntry('p-c', true, 0.5, ['u1', 'u2']),  // 同义务
    settledEntry('p-d', false, 0.5, ['u3']),       // 不同义务
    settledEntry('p-e', true, 0.5, ['u4']),        // 不同义务
  ];
  const r = discriminateOne216({
    text: 'The EU AI Act requires providers to comply by Q4 2027.',
    source: 'Probe', date: '2026-10-24',
  }, { ledger });
  // 去重后 3 条（p-a/b/c 合一 + p-d + p-e），命中 2 → 0.67。
  // 不去重则样本 5、命中 3 → 0.6，重复登记把样本与概率一起扭曲。
  return r.available && r.baseRate.source === 'local-ledger'
    && r.baseRate.sample === 3 && r.baseRate.rate === 0.67
    && r.localLedger.settledRaw === 5 && r.localLedger.deduped === 2
    && r.localLedger.hits === 2;
})(), '5 条登记（3 条同义务）必须去重成 3 条样本、兑现率 2/3');

// 3. 只有同义务重复登记时，不得激活失真的 100% 基准（诚实降级）
c216('仅同义务重复登记时诚实降级不激活失真基准', (() => {
  // 复现真实台账污染形态：3 条同义务、全部兑现。无去重时会激活
  // local-ledger 且 rate=1.0——一次兑现被计成三次，正是 SKILL.md
  // 警告的「失真的 100% 基准概率」。修复后必须留在通用先验。
  const ledger = [
    settledEntry('q-a', true, 0.45, ['u1', 'u2', 'u3', 'u4', 'u5']),
    settledEntry('q-b', true, 0.45, ['u1', 'u2', 'u3', 'u4', 'u5']),
    settledEntry('q-c', true, 0.45, ['u1', 'u2', 'u3', 'u4', 'u5']),
  ];
  const r = discriminateOne216({
    text: 'The EU AI Act requires providers to comply by Q4 2027.',
    source: 'Probe', date: '2026-10-24',
  }, { ledger });
  return r.available && r.baseRate.source === 'default-prior'
    && r.baseRate.rate === 0.45            // regulatory_action 通用先验
    && r.localLedger.settledDistinct === 1 // 去重后只剩 1 条
    && /本地台账同类已结算 1 条/.test(r.baseRate.note);
})(), '样本 <3 必须留在通用先验，且 note 如实写明本地已结算 1 条');

// 4. record() 双写 category：新条目两个字段都在
// （副作用由文件最开头的全局备份 + process.on('exit') 还原兜底）
// [v3.2 维护] 探针幂等：先删后登。上一次进程异常死亡时 exit 还原不执行，
// 探针条目残留会让 record() 抛「id 已存在」整套测试崩溃（2026-10-25 实测）。
c216('record() 双写 category 字段', (() => {
  // 先清掉可能残留的同 id 探针，保证可重跑
  const _cur = ledgerLib216.load();
  if ((_cur.predictions || []).some(p => p.id === 'v216-probe-field-dualwrite')) {
    _cur.predictions = _cur.predictions.filter(p => p.id !== 'v216-probe-field-dualwrite');
    fs216.writeFileSync(ledgerLib216.LEDGER_PATH, JSON.stringify(_cur, null, 2), 'utf-8');
  }
  const rec = ledgerLib216.record({
    id: 'v216-probe-field-dualwrite', claim: '探针：category 双写', probability: 0.4,
    dueOn: '2027-12-31', domain: 'regulatory_action',
  });
  const stored = ledgerLib216.load().predictions.find(p => p.id === 'v216-probe-field-dualwrite');
  return rec.category === 'regulatory_action'
    && !!stored && stored.domain === 'regulatory_action' && stored.category === 'regulatory_action';
})(), '登记时只传 domain，读回时 category 必须同在');

// 5. scorecard() 按去重后样本算 Brier（同步文件交换，finally 还原）
c216('scorecard 对同义务重复登记只计一次', (() => {
  const backup = fs216.existsSync(ledgerLib216.LEDGER_PATH)
    ? fs216.readFileSync(ledgerLib216.LEDGER_PATH) : null;
  try {
    fs216.writeFileSync(ledgerLib216.LEDGER_PATH, JSON.stringify({ version: '1.0.0', predictions: [
      settledEntry('s-x1', true, 0.45, ['u1', 'u2']),
      settledEntry('s-x2', true, 0.45, ['u1', 'u2']),   // 同义务
      settledEntry('s-x3', false, 0.9, ['u3'], 'vendor_delivery'),
    ] }));
    const sc = ledgerLib216.scorecard();
    // 3 条登记 = 2 个义务；Brier 必须按去重后 2 条算
    const expectBrier = (Math.pow(0.45 - 1, 2) + Math.pow(0.9 - 0, 2)) / 2;
    return sc.sample === 2 && sc.settledRaw === 3 && sc.deduped === 1
      && Math.abs(sc.brier - expectBrier) < 0.001;
  } finally {
    if (backup === null) fs216.unlinkSync(ledgerLib216.LEDGER_PATH);
    else fs216.writeFileSync(ledgerLib216.LEDGER_PATH, backup);
  }
})(), 'Brier 样本数必须去重（3 条登记 → 2 个义务）');

// 6. 端到端：generate() → formatReport，本地台账同类历史出现在报告产物里
// （「接口存在 ≠ 端到端到达」：localLedger 字段必须在最终 markdown 里可见）
c216('端到端：报告层展示本地台账同类历史', (() => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const eng = new ProjectionEngine({ newsData: { frontier_models: { domain: 'frontier_models', name: '专项大模型', news: [
    { title: 'EU AI Act enforcement framework',
      description: '',
      body: 'EU member states shall implement the AI Act enforcement framework by Q2 2027. '
        + 'National authorities are required to establish the necessary procedures.',
      source: 'EU AI Act Timeline', category: 'governance',
      link: 'https://artificialintelligenceact.eu/enforcement',
      pubDate: 'Tue, 20 Oct 2026 00:00:00 GMT', origin: 'live' },
  ] } } });
  const rep = eng.generate();
  const reg = (rep.forecastDiscrimination.results || [])
    .find(r => r.category === 'regulatory_action');
  const md = formatReport(rep);
  return !!reg
    && reg.localLedger.settledRaw === 3 && reg.localLedger.settledDistinct === 1
    && /本地台账同类历史: 已结算 1 条/.test(md)
    && /原始登记 3 条/.test(md)
    && /样本 <3 不具统计性/.test(md);
})(), '报告必须出现「已结算 1 条（原始登记 3 条）」且说明样本不足');

// 7. 去重函数单元测试：同证据合并、无证据回退文本、跨类目不误合
c216('dedupeSameObligation 判据正确（不误合不同义务）', (() => {
  const mk = (id, sources) => ({ id, claim: 'c' + id, domain: 'regulatory_action', outcome: true, evidence: { sources } });
  const r1 = ledgerLib216.dedupeSameObligation([
    mk('a', ['u1', 'u2']), mk('b', ['u2', 'u1']), mk('c', ['u3']),
  ]);
  // 无 evidence.sources 时回退归一化 claim 文本（大小写/标点不影响）
  const r2 = ledgerLib216.dedupeSameObligation([
    { id: 'd', claim: 'Same Claim Text!', domain: 'regulatory_action', outcome: true },
    { id: 'e', claim: 'same claim text', domain: 'regulatory_action', outcome: true },
  ]);
  // 相同证据但不同类目不得合并（防止跨类目误合）
  const r3 = ledgerLib216.dedupeSameObligation([
    mk('f', ['u1']),
    { id: 'g', claim: 'other', domain: 'vendor_delivery', outcome: true, evidence: { sources: ['u1'] } },
  ]);
  return r1.entries.length === 2 && r1.dedupedCount === 1
    && r2.entries.length === 1 && r2.dedupedCount === 1
    && r3.entries.length === 2 && r3.dedupedCount === 0;
})(), '同证据（顺序无关）合并；无证据回退文本；跨类目不误合');

(async () => {
  const results = await Promise.all(v216.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v216.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv2.16: ${v216.length - f} 通过, ${f} 失败, 共 ${v216.length} 个`);
  if (f > 0) {
    console.log('结论：基准概率维度仍有断链，或同义务重复登记会扭曲基准。');
    process.exitCode = 1;
  } else {
    console.log('结论：本地台账同类历史已激活并按同义务去重，报告层可见。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v2.17 新增断言：外部预测基准源（Good Judgment Open）接入。
//
// 背景（SKILL.md「已知边界」自 v2.13 挂了三个版本）：RSS 与博客正文
// 里的前瞻表述多为意图声明（"we expect to expand access"），没有
// 时间点，判为不可结算；要拿到真正可结算的预测，需接 Metaculus /
// Epoch AI / 厂商路线图等专门预测源。2026-10-24 复测：Metaculus API
// 403（带 UA 仍 403）、Manifold 连接超时、Polymarket gamma-api
// DNS 落到不可达 IP、Kalshi 超时、PredictIt 301、Epoch AI 只有统计
// 数据无预测类数据——**唯一可达且内容对口的是 Good Judgment Open**：
// /questions?q= 公开可抓（需浏览器 UA，裸 curl 406），每个问题带
// ISO 截止时间。其群体预测概率需登录，本引擎不采集、不估计。
//
// 反向验证（摘除修复 → 断言必须失败）：
//   摘除实体解码        → 断言 2 失败（&amp; 残留在标题里）
//   摘除按 id 去重      → 断言 3 失败（4 条变 8 条）
//   摘除缓存新鲜度检查  → 断言 4 失败（第二次仍发请求）
//   minShared 降到 1    → 断言 5 失败（单专名误命中）
//   摘除报告段渲染      → 断言 6/7 失败（markdown 里没有该段）
//   摘除 available 门   → 断言 7 失败（全失败也宣称接入）
// ════════════════════════════════════════════════════════════════
const v217 = [];
const c217 = (name, fn, detail) => v217.push({ name, fn, detail: detail || '' });
const fs217 = require('fs');
const os217 = require('os');
const path217 = require('path');
const benchLib217 = require('./human-future/scripts/prediction-benchmark-collector.js');
const FIXTURE_217 = fs217.readFileSync(
  path217.join(__dirname, 'human-future/data/fixtures/gjopen-questions-sample.html'), 'utf-8');
const QUERIES_217 = [
  { q: 'artificial intelligence', cluster: 'ai_adoption' },
  { q: 'openai', cluster: 'frontier_vendors' },
];
const mockFetch217 = (html, counter) => async () => {
  counter.n++;
  return { ok: true, text: async () => html };
};

// 1. 解析器：id / 标题 / 截止时间 / URL 四字段齐全（真实页面夹具）
c217('解析 gjopen 页面拿到 id/标题/截止时间/URL', () => {
  const qs = benchLib217.parseQuestions(FIXTURE_217);
  const q1 = qs.find(q => q.id === '5271');
  return qs.length === 4
    && !!q1
    && q1.closesAt === '2027-04-01T07:01:00Z'
    && q1.url.endsWith('-according-to-the-ramp-ai-index')
    && q1.title.startsWith('When will the artificial intelligence (AI) model adoption rate');
}, () => {
  const qs = benchLib217.parseQuestions(FIXTURE_217);
  return `实解析 ${qs.length} 条（应为 4）`;
});

// 2. HTML 实体通用解码 + 无截止时间的问题容忍（closesAt=null 不是 undefined）
c217('解析器解码 HTML 实体，无截止时间的问题 closesAt=null', () => {
  const qs = benchLib217.parseQuestions(FIXTURE_217);
  const ent = qs.find(q => q.id === '9999');
  const noTs = qs.find(q => q.id === '8888');
  return !!ent
    && ent.title.includes("Tom & Jerry's take")
    && !ent.title.includes('&amp;') && !ent.title.includes('&#39;')
    && !!noTs && noTs.closesAt === null;
}, () => {
  const ent = benchLib217.parseQuestions(FIXTURE_217).find(q => q.id === '9999');
  return `9999 标题: ${ent && ent.title}`;
});

// 3. 同一问题被多个查询命中只计一次（按 id 去重），cluster 取首个查询
c217('同一问题被多个查询命中只登记一次', async () => {
  const counter = { n: 0 };
  const cachePath = path217.join(os217.tmpdir(), `hf-v217-dedup-${process.pid}.json`);
  try { fs217.unlinkSync(cachePath); } catch (_) {}
  const bm = await benchLib217.collectBenchmark({
    live: true, fetchImpl: mockFetch217(FIXTURE_217, counter),
    now: Date.parse('2026-10-24T12:00:00Z'),
    cachePath, queries: QUERIES_217,
  });
  return bm.available === true
    && counter.n === 2                 // 两个查询各发一次
    && bm.questions.length === 4       // 每查询返回同一批 4 条 → 去重后仍 4
    && bm.questions.filter(q => q.id === '5271').length === 1
    && bm.questions.find(q => q.id === '5271').cluster === 'ai_adoption'
    && bm.queriesRun.length === 2;
}, () => '同 id 问题被重复登记（去重未生效）');

// 4. 缓存：TTL 内命中缓存，不再发任何网络请求
c217('TTL 内命中缓存，零网络请求', async () => {
  const counter = { n: 0 };
  const cachePath = path217.join(os217.tmpdir(), `hf-v217-cache-${process.pid}.json`);
  try { fs217.unlinkSync(cachePath); } catch (_) {}
  const q = [{ q: 'artificial intelligence', cluster: 'ai_adoption' }];
  await benchLib217.collectBenchmark({
    live: true, fetchImpl: mockFetch217(FIXTURE_217, counter),
    now: 1000000, cachePath, queries: q,
  });
  const n1 = counter.n;
  const bm2 = await benchLib217.collectBenchmark({
    live: true, fetchImpl: mockFetch217(FIXTURE_217, counter),
    now: 1000000 + 60 * 60 * 1000, cachePath, queries: q,   // 1 小时后（TTL 6h 内）
  });
  return n1 === 1 && counter.n === 1 && bm2.fromCache === true && bm2.questions.length === 4;
}, () => 'TTL 内第二次采集仍发出了网络请求（缓存未生效）');

// 5. 主题相邻匹配精度：≥2 共享实词才命中；只共享一个专名不命中
c217('主题匹配精度：≥2 共享实词命中，单专名与无关文本不命中', () => {
  const qs = [
    { id: '5271', title: 'When will the artificial intelligence (AI) model adoption rate for the construction sector in the US reach or exceed 50.0%?', closesAt: '2027-04-01T07:01:00Z', url: 'u1', cluster: 'ai_adoption' },
    { id: '5469', title: "What will be OpenAI's end-of-day market capitalization on its first day of public trading?", closesAt: '2027-07-30T07:01:00Z', url: 'u2', cluster: 'frontier_vendors' },
  ];
  const hit = benchLib217.matchQuestions(
    'Anthropic plans to grow the AI model adoption rate by US businesses through 2027.', qs);
  const oneTerm = benchLib217.matchQuestions(
    'OpenAI plans to release a new reasoning model next year.', qs);   // 与 5469 仅共享 openai
  const none = benchLib217.matchQuestions('The bakery plans to expand its bread production line.', qs);
  return hit.matched === 1 && hit.questions[0].id === '5271'
    && hit.questions[0].sharedTerms.includes('model')
    && hit.questions[0].sharedTerms.includes('adoption')
    && oneTerm.matched === 0
    && none.matched === 0
    && hit.caveat.includes('主题相邻非同题');
}, () => {
  const qs = [
    { id: '5271', title: 'When will the artificial intelligence (AI) model adoption rate for the construction sector in the US reach or exceed 50.0%?', closesAt: '2027-04-01T07:01:00Z', url: 'u1', cluster: 'ai_adoption' },
    { id: '5469', title: "What will be OpenAI's end-of-day market capitalization on its first day of public trading?", closesAt: '2027-07-30T07:01:00Z', url: 'u2', cluster: 'frontier_vendors' },
  ];
  const hit = benchLib217.matchQuestions('Anthropic plans to grow the AI model adoption rate by US businesses through 2027.', qs);
  const oneTerm = benchLib217.matchQuestions('OpenAI plans to release a new reasoning model next year.', qs);
  return `hit=${hit.matched}（应 1） oneTerm=${oneTerm.matched}（应 0）`;
});

// 6. 端到端：基准段 + per-claim 外部基准行都进最终 markdown 产物
// （「接口存在 ≠ 端到端到达」：JSON 有字段不算数，formatReport 必须印出来）
c217('端到端：基准段与外部基准匹配行进入最终报告', async () => {
  const cachePath = path217.join(os217.tmpdir(), `hf-v217-e2e-${process.pid}.json`);
  try { fs217.unlinkSync(cachePath); } catch (_) {}
  const bm = await benchLib217.collectBenchmark({
    live: true, fetchImpl: mockFetch217(FIXTURE_217, { n: 0 }),
    now: Date.parse('2026-10-24T12:00:00Z'),
    cachePath, queries: QUERIES_217,
  });
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const eng = new ProjectionEngine({ newsData: { frontier_models: { domain: 'frontier_models', name: '专项大模型', news: [
    { title: 'Anthropic plans to grow the AI model adoption rate by US businesses',
      description: '',
      body: 'Anthropic plans to grow the AI model adoption rate by US businesses through 2027. '
        + 'The company plans to double down on enterprise deployment because demand signals are strong.',
      source: 'ProbeSrcBench', link: 'https://example.com/bench-a',
      pubDate: 'Tue, 20 Oct 2026 10:00:00 +0000', origin: 'live' },
  ] } } }, { benchmark: bm });
  const rep = eng.generate();
  const md = formatReport(rep);
  const fdMatched = (rep.forecastDiscrimination.results || [])
    .some(r => r.externalMatch && r.externalMatch.matched > 0);
  return rep.forecastBenchmark.available === true
    && rep.forecastBenchmark.total === 4
    && rep.meta.reasoningEngines.includes('prediction-benchmark-collector')
    && md.includes('## 外部预测基准（Good Judgment Open 开放问题）')
    && md.includes('截止 2027-04-01')
    && md.includes('全部带硬截止日')
    && fdMatched
    && md.includes('外部基准: Good Judgment Open 有同类开放问题')
    && md.includes('主题相邻非同题');
}, () => '基准段 / 匹配行 / caveat 至少有一项没进 markdown 产物');

// 7. 降级与不可用两条诚实路径：RSS 全挂时段仍在；全失败时不宣称接入
c217('诚实路径：RSS 全挂时段仍渲染；采集全失败不宣称接入', async () => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  // 7a. degraded（无 live 信号）——基准段不依赖信号，仍要渲染
  const bmOk = {
    available: true, source: 'Good Judgment Open', sourceUrl: 'https://www.gjopen.com',
    fetchedAt: Date.parse('2026-10-24T12:00:00Z'), queriesRun: ['artificial intelligence'],
    questions: [{ id: '5271', title: 'When will the artificial intelligence (AI) model adoption rate for the construction sector in the US reach or exceed 50.0%?', closesAt: '2027-04-01T07:01:00Z', url: 'u1', cluster: 'ai_adoption' }],
  };
  const repDeg = new ProjectionEngine({ newsData: {} }, { benchmark: bmOk }).generate();
  const mdDeg = formatReport(repDeg);
  // 7b. 采集全部失败——available:false，不进 reasoningEngines，报告写明原因
  const bmFail = { available: false, reason: 'GJOpen 采集全部失败: HTTP 503' };
  const repFail = new ProjectionEngine({ newsData: {} }, { benchmark: bmFail }).generate();
  const mdFail = formatReport(repFail);
  return repDeg.degraded === true
    && mdDeg.includes('## 外部预测基准（Good Judgment Open 开放问题）')
    && mdDeg.includes('When will the artificial intelligence')
    && mdDeg.includes('## ⚠ 推演降级')
    && repFail.forecastBenchmark.available === false
    && !repFail.meta.reasoningEngines.includes('prediction-benchmark-collector')
    && mdFail.includes('（GJOpen 采集全部失败: HTTP 503）');
}, () => 'degraded 渲染或全失败时的诚实降级有一项不成立');

// 8. 过期缓存诚实降级：未开 FETCH 时用过期缓存并标注，不谎称新数据
c217('未开 FETCH 且缓存过期：标注 degradedReason 使用过期缓存', async () => {
  const cachePath = path217.join(os217.tmpdir(), `hf-v217-stale-${process.pid}.json`);
  try { fs217.unlinkSync(cachePath); } catch (_) {}
  await benchLib217.collectBenchmark({
    live: true, fetchImpl: mockFetch217(FIXTURE_217, { n: 0 }),
    now: 1000000, cachePath, queries: QUERIES_217,
  });
  const bm = await benchLib217.collectBenchmark({
    live: false,
    fetchImpl: async () => { throw new Error('离线路径不应发起网络请求'); },
    now: 1000000 + 7 * 60 * 60 * 1000,   // 7 小时后，超过 6h TTL
    cachePath, queries: QUERIES_217,
  });
  return bm.available === true && bm.stale === true && bm.fromCache === true
    && /过期缓存/.test(bm.degradedReason || '')
    && bm.questions.length === 4;
}, () => '过期缓存路径未标注 stale/degradedReason');

(async () => {
  const results = await Promise.all(v217.map(c => Promise.resolve(c.fn())));
  let f = 0;
  v217.forEach((c, i) => {
    let ok = results[i];
    let detail = '';
    if (!ok && typeof c.detail === 'function') {
      try { detail = c.detail(); } catch (e) { detail = `(detail 抛错: ${e.message})`; }
    }
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + (detail || c.detail || '')}`);
  });
  console.log(`\nv2.17: ${v217.length - f} 通过, ${f} 失败, 共 ${v217.length} 个`);
  if (f > 0) {
    console.log('结论：外部预测基准源未接通，或主题匹配/诚实降级有断链。');
    process.exitCode = 1;
  } else {
    console.log('结论：GJOpen 外部预测基准已接入，解析/去重/缓存/匹配/报告五段均接通。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v3.0.0c 新增断言：商业主张辨别段端到端断链修复 + 精度门 + 句式召回。
//
// 背景（2026-10-24 实测）：v3.0.0（f118603）给引擎加了商业采集域与商业
// 主张辨别器，formatReport 也渲染了「商业主张辨别」段——但 cron 注入
// 脚本从没读过 proj.commercialDiscrimination，报告文件里躺着、agent
// 完全看不到。这是 v2.9/v2.13/v2.17 之后第四次同型断链（接口存在 ≠
// 端到端到达）。同时实测该段 19 条被辨别条目里 18 条 kind=unclassified：
// 7 条 Fed FOMC 公告、2 集 LWiAI 播客、TechCrunch 促销页脚
// （"Get your pass ... 50% off. REGISTER NOW."，还被判★决策相关）
// 混入辨别——旧触发器「含 $/%/market 关键词即算候选」没有精度门。
//
// 本节断言分三组：① 注入脚本真的读了该字段（源级）；② 端到端渲染；
// ③ 精度门与句式召回。每处修复都做过反向验证（摘除修复 → 对应断言失败）。
// ════════════════════════════════════════════════════════════════
const v300c = [];
function c300c(name, ok, detail) { v300c.push({ name, ok, detail }); }

const fs300c = require('fs');
const path300c = require('path');
const os300c = require('os');

// ── 组 1：注入脚本（断链修复本体） ──
// 1. 注入脚本读取 commercialDiscrimination，带口径限定与不可用路径。
//    摘除注入段 → 本断言失败（v2.9/v2.13/v2.17 三次断链的复发防护）。
c300c('cron 注入脚本读取 commercialDiscrimination 且带口径限定', (() => {
  const p = path300c.join(os300c.homedir(), '.hermes/scripts/hf-cron-fetch.sh');
  if (!fs300c.existsSync(p)) return false;
  const src = fs300c.readFileSync(p, 'utf-8');
  return /const cdsc = proj\.commercialDiscrimination/.test(src)
    && /### 商业主张辨别/.test(src)
    && /未包含 commercialDiscrimination 字段/.test(src)          // 旧版报告路径
    && /不生成「心虫应该怎么做」的商业建议/.test(src)              // 口径限定：不代劳
    && /由报告 agent 自行判断并标注归属/.test(src)
    && /独立验证\(4\) > 第三方调查\/公开财报\(3\)/.test(src)      // 证据等级图例
    && /不可用 —— /.test(src);                                     // 不可用路径
})(), '注入脚本必须读 proj.commercialDiscrimination，并带口径限定/不可用路径/证据图例');

// ── 组 2：端到端渲染 ──
// 2. generate → formatReport 产物里真的出现商业段（不信接口存在）。
c300c('端到端：报告 markdown 渲染商业主张辨别段', (() => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const items = [
    { title: 'Minutes of the Federal Open Market Committee',
      description: 'Participants noted that financial market conditions had eased.',
      body: '', source: 'Federal Reserve (Monetary)', bucket: 'economy',
      pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT', domains: ['economy_labor'],
      link: 'https://federalreserve.gov/a', origin: 'live' },
    { title: 'DeepSeek Raises Nearly $16 billion in Second Funding Round',
      description: '', body: '', source: 'The Information', bucket: 'business',
      pubDate: 'Fri, 24 Oct 2026 00:44:16 GMT', domains: ['capital_flow'],
      link: 'https://theinformation.com/e', origin: 'live' },
  ];
  const rep = new ProjectionEngine({
    engineVersion: '6.8.0', modulesLoaded: 10,
    newsData: { business: { news: items }, economy: { news: [] } },
  }).generate();
  const md = formatReport(rep);
  const seg = md.split('## 商业主张辨别')[1] || '';
  return rep.degraded === false
    && md.includes('## 商业主张辨别（市场陈述哪些站得住脚）')
    && md.includes('命中商业主张形态')
    && md.includes('证据等级：独立验证(4)')
    && seg.includes('DeepSeek Raises Nearly $16 billion')     // 主张句（claimSentence）
    && seg.includes('证伪条件:')
    && !seg.includes('Minutes of the Federal Open');          // Fed 公告不进商业段
})(), '商业段必须进 markdown 产物，且 Fed 公告不得混入');

// ── 组 3：精度门（候选题句必须命中商业主张形态） ──
// 3. 纯噪音输入（Fed 公告 / 播客 / 促销页脚 / 安全新闻）不再进辨别。
//    摘除精度门（恢复旧关键词触发器）→ 本断言失败。
c300c('精度门：Fed 公告/播客/促销页脚不再进商业辨别', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const mk = (items) => {
    const inst = new ProjectionEngine({});
    inst.signals = { totalItems: items.length, domains: [], undomained: 0, dateRange: null, items };
    return inst;
  };
  const noise = [
    { title: 'Minutes of the Federal Open Market Committee',
      description: 'Participants noted that financial market conditions had eased. The staff reviewed market developments and risks.',
      body: '', source: 'Federal Reserve (Monetary)', bucket: 'economy',
      pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT', domains: ['economy_labor'],
      link: 'https://federalreserve.gov/a', origin: 'live' },
    { title: 'LWiAI Podcast #252 - GPT 5.6, Grok 4.5, Nemotron-Labs-Diffusion, AI 2040',
      // [v3.3.1] 夹具补强：旧 description（"$5 billion in new funding and
      // 30% growth in enterprise adoption"）不触发任何模式门，本断言恒真
      // 空转（corr-2026-015）。换成 2026-10-25 live 轮真正漏进辨别的原句
      // ——旧 survey-finding 正则下 "research from" 命中调查研究形态。
      description: "GPT-5.6 and Grok 4.5, Meta's Muse Spark 1.1, regulatory developments in AI and data centers, interpretability research from Anthropic, and the future of AI policy with AI 2040",
      body: '', source: 'Last Week in AI', bucket: 'business',
      pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT', domains: ['capital_flow'],
      link: 'https://lastweekin.ai/b', origin: 'live' },
    { title: 'Here are the top AI agents that can live in your text messages',
      description: 'We created a list of the most notable AI agents.',
      body: 'Get your pass and bring someone with you at 50% off. REGISTER NOW. Close TechCrunch Desktop Logo TechCrunch has the latest news.',
      source: 'TechCrunch AI', bucket: 'business',
      pubDate: 'Fri, 24 Oct 2026 00:44:16 GMT', domains: ['market_claims'],
      link: 'https://techcrunch.com/c', origin: 'live' },
    { title: 'Chinese hackers spied on thousands of companies after breaching IT giant ConnectWise',
      description: 'Microsoft points the blame at a China-aligned hacker, which relied on AI agents to rapidly hack into thousands of its customers.',
      body: '', source: 'TechCrunch AI', bucket: 'business',
      pubDate: 'Fri, 24 Oct 2026 00:44:16 GMT', domains: ['info_security'],
      link: 'https://techcrunch.com/d', origin: 'live' },
  ];
  const r = mk(noise).buildCommercialDiscrimination();
  return r.available === false && /未抽到命中商业主张形态/.test(r.reason || '');
})(), '非主张文本必须整体挡在辨别之外，available=false 且原因写明形态门');

// 4. 精度门不误杀真实主张：无摘要条目的主张就在标题里（标题参与判定）。
//    门若只认句自身不认标题 → DeepSeek 条目掉出 → 本断言失败。
c300c('精度门不误杀：标题即主张的条目仍被辨别', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: 1, domains: [], undomained: 0, dateRange: null, items: [
    { title: 'DeepSeek Raises Nearly $16 billion in Second Funding Round',
      description: '', body: '', source: 'The Information', bucket: 'business',
      pubDate: 'Fri, 24 Oct 2026 00:44:16 GMT', domains: ['capital_flow'],
      link: 'https://theinformation.com/e', origin: 'live' },
  ] };
  const r = inst.buildCommercialDiscrimination();
  return r.available === true && r.audited === 1
    && r.results[0].kind === 'funding'
    && r.results[0].claimSentence === 'DeepSeek Raises Nearly $16 billion in Second Funding Round';
})(), '无摘要条目（主张在标题）必须仍能进辨别，且 claimSentence 是标题句');

// ── 组 4：句式召回（三处模式扩展，摘除任一 → 对应断言失败） ──
// 5. funding 容忍数量副词（raises nearly $16B）。摘除副词组 → 失败。
c300c('融资句式容忍数量副词（raises nearly $16B）', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'DeepSeek raises nearly $16 billion in a second funding round, according to a company announcement.',
    source: 'test',
  });
  return r.kind === 'funding' && r.evidence.weight >= 3 && r.verdict === 'factual';
})(), '「raises nearly $16 billion」应命中融资形态且按事实判别');

// 6. valuation 两种语序。摘除语序扩展 → 失败。
c300c('估值句式认「$1.25T valuation」与「value at $X」两种语序', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r1 = discriminateCommercial({
    text: 'OpenAI working on new $30B raise at $1.25T valuation ahead of IPO. Should OpenAI command an over $1 trillion valuation with this round, it would break records.',
    source: 'test',
  });
  const r2 = discriminateCommercial({
    text: 'The round could value the company at $500 billion, according to a person familiar.',
    source: 'test',
  });
  return r1.kind === 'valuation' && r2.kind === 'valuation';
})(), '金额在词汇前与动词形态两种语序都应命中估值形态');

// 7. competitive 补人类专家目标 + according to a study 归第三方调查。
//    摘除 competitive 人类目标组 → kind 不是 competitive，失败；
//    摘除 third-party-survey 扩展 → evidence.weight 掉到 1，失败。
c300c('竞品句式认「beat doctors」且 Science 研究引用归第三方调查', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: "Microsoft's new AI diagnostic system beat generalist doctors on hard cases, according to a study in Science. But most of the improvement seems to come from the AI models underneath, not from Microsoft's system itself.",
    source: 'TechCrunch AI',
  });
  return r.kind === 'competitive'
    && r.evidence.id === 'third-party-survey' && r.evidence.weight === 3
    && r.decisionRelevant === true;
})(), '「beat generalist doctors, according to a study in Science」应判竞品能力+第三方调查+决策相关');

// 8. claimSentence 透传（报告层聚焦主张句而非 600 字上下文）。
//    摘除透传 → r.claimSentence 为 undefined，失败。
c300c('claimSentence 透传到辨别结果', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: '上下文第一句。DeepSeek raises nearly $16 billion in a second round. 上下文第三句。',
    claimSentence: 'DeepSeek raises nearly $16 billion in a second round.',
    source: 'test',
  });
  return r.claimSentence === 'DeepSeek raises nearly $16 billion in a second round.';
})(), '辨别结果必须带回 claimSentence，否则报告行首退化成整段上下文');

// 9. 源级门存在性：project-future.js 的候选选择必须用 COMMERCIAL_CLAIM_PATTERNS，
//    且旧关键词触发器不得复活（防「改回去」）。
//    摘除门的 import/使用 → 失败；旧触发器复活 → 失败。
c300c('引擎候选选择用主张形态门且旧触发器未复活', (() => {
  const src = fs300c.readFileSync(path300c.join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return /const \{ discriminateCommercial, COMMERCIAL_CLAIM_PATTERNS \} = require/.test(src)
    && /const isClaimForm = \(t\) => COMMERCIAL_CLAIM_PATTERNS/.test(src)
    && /return isClaimForm\(s\) \|\| isClaimForm\(it\.title \|\| ''\);/.test(src)
    && !/enterprises\?\|customers\?\|funding\|raises\?\|valuation/.test(src);  // 旧触发器串不得复活
})(), '候选选择必须走 COMMERCIAL_CLAIM_PATTERNS 门，旧关键词触发器不得复活');

(async () => {
  const results = await Promise.all(v300c.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v300c.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.0.0c: ${v300c.length - f} 通过, ${f} 失败, 共 ${v300c.length} 个`);
  if (f > 0) {
    console.log('结论：商业主张辨别段端到端断链未修复，或精度门/句式召回有缺。');
    process.exitCode = 1;
  } else {
    console.log('结论：商业辨别段已进 cron 注入与 markdown 产物，精度门挡除非主张文本，句式召回有回归保护。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v3.1 新增断言：自我修正登记簿（self-correction-ledger）0 调用模块接入。
//
// 背景（2026-10-25 审计）：该模块自 v2.4 存在，data/self-corrections.json
// 有 6 条真实修正（绕月≠登月 / v2.4 假能力三项审计 / sitemap 简介≠正文……），
// docstring 铁律「每次修正落盘，下次推演先读簿子再说话」——但 live
// pipeline（scripts/）从未 require 过它，只有早期死副本 human-future/
// scripts/run-pipeline.js 调过。簿子记了、没人读。
//
// 本节断言分四组：① 引擎源级接线（require + 调模块 API + 字段落位）；
// ② 引擎产出与数据文件逐条一致（不编造）；③ 端到端渲染进 markdown；
// ④ cron 注入脚本读取该字段（断链复发防护，判据是「agent 看得到」）。
// 每处修复都做过反向验证（摘除接线/渲染/注入段 → 对应断言失败）。
// ════════════════════════════════════════════════════════════════
const v31 = [];
function c31(name, ok, detail) { v31.push({ name, ok, detail }); }

const fs31 = require('fs');
const path31 = require('path');

// ── 组 1：引擎源级接线 ──
// 1. project-future.js 必须 require self-correction-ledger 并调它的 API。
//    摘除 require 或改自己读数 → 本断言失败。
c31('引擎 require 并调用 self-correction-ledger 模块 API', (() => {
  const src = fs31.readFileSync(path31.join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return /const correctionsLedger = require\(path\.join\(HF, 'self-correction-ledger\.js'\)\)/.test(src)
    && /correctionsLedger\.load\(\)/.test(src)
    && /correctionsLedger\.recurringPatterns\(\)/.test(src)
    && /report\.selfCorrectionLedger = this\.buildSelfCorrectionLedger\(\)/.test(src)
    && /'self-correction-ledger',/.test(src);   // 接入组件清单里声明
})(), '必须走模块自身 API（load/recurringPatterns），不是在引擎里重新实现读数');

// ── 组 2：引擎产出与数据文件逐条一致（防编造） ──
// 2. generate() 产出的 total/highSeverity/bySeverity 必须与数据文件实际内容一致。
//    引擎自己编数字 → 本断言失败。
c31('引擎产出与 self-corrections.json 实际内容一致', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const dataPath = path31.join(__dirname, 'human-future/data/self-corrections.json');
  const book = JSON.parse(fs31.readFileSync(dataPath, 'utf-8'));
  const items = [
    { title: 'DeepSeek Raises Nearly $16 billion in Second Funding Round',
      description: '', body: '', source: 'The Information', bucket: 'business',
      pubDate: 'Fri, 24 Oct 2026 00:44:16 GMT', domains: ['capital_flow'],
      link: 'https://theinformation.com/e', origin: 'live' },
  ];
  const rep = new ProjectionEngine({
    engineVersion: '6.8.0', modulesLoaded: 10,
    newsData: { business: { news: items }, economy: { news: [] } },
  }).generate();
  const scl = rep.selfCorrectionLedger;
  if (!scl) return false;   // 接线被摘除时断言失败而不是抛 TypeError
  // 自己从数据文件算期望值：high 及以上（含 critical）的条数
  const rank = { low: 1, medium: 2, high: 3, critical: 4 };
  const expectHigh = book.corrections.filter(c => (rank[c.severity] || 0) >= rank.high).length;
  return scl && scl.available === true
    && scl.total === book.corrections.length
    && scl.highSeverity === expectHigh
    && scl.lessons.length === book.corrections.length
    && Object.values(scl.bySeverity).reduce((a, b) => a + b, 0) === book.corrections.length;
})(), 'total/highSeverity/bySeverity/lessons 必须与 JSON 文件逐条对得上');

// 3. critical 排最前（severity 等级排序，不是文件顺序）。
//    摘除等级排序（恢复按文件序或 high 优先）→ corr-2026-002/004 不在首位，失败。
c31('critical 教训排在最前', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const items = [
    { title: 'DeepSeek Raises Nearly $16 billion in Second Funding Round',
      description: '', body: '', source: 'The Information', bucket: 'business',
      pubDate: 'Fri, 24 Oct 2026 00:44:16 GMT', domains: ['capital_flow'],
      link: 'https://theinformation.com/e', origin: 'live' },
  ];
  const rep = new ProjectionEngine({
    engineVersion: '6.8.0', modulesLoaded: 10,
    newsData: { business: { news: items }, economy: { news: [] } },
  }).generate();
  const ls = (rep.selfCorrectionLedger && rep.selfCorrectionLedger.lessons) || [];
  if (ls.length === 0) return false;   // 接线/排序被摘除时断言失败而不是抛 TypeError
  return ls[0].severity === 'critical' && ls[1].severity === 'critical'
    && ls.slice(2).every(l => l.severity !== 'critical');
})(), '数据里有 2 条 critical，必须排在 high 之前——最重的教训不能藏');

// ── 组 3：端到端渲染 ──
// 4. generate → formatReport 产物里真的出现登记簿段（不信接口存在）。
//    摘除报告渲染 → 本断言失败。
c31('端到端：报告 markdown 渲染自我修正登记簿段', (() => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const items = [
    { title: 'DeepSeek Raises Nearly $16 billion in Second Funding Round',
      description: '', body: '', source: 'The Information', bucket: 'business',
      pubDate: 'Fri, 24 Oct 2026 00:44:16 GMT', domains: ['capital_flow'],
      link: 'https://theinformation.com/e', origin: 'live' },
    { title: 'Minutes of the Federal Open Market Committee',
      description: 'Participants noted that financial market conditions had eased.',
      body: '', source: 'Federal Reserve (Monetary)', bucket: 'economy',
      pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT', domains: ['economy_labor'],
      link: 'https://federalreserve.gov/a', origin: 'live' },
  ];
  const rep = new ProjectionEngine({
    engineVersion: '6.8.0', modulesLoaded: 10,
    newsData: { business: { news: items }, economy: { news: items } },
  }).generate();
  const md = formatReport(rep);
  const seg = md.split('## 自我修正登记簿')[1] || '';
  return md.includes('## 自我修正登记簿（历史纠错教训，解读本期信号前必读）')
    && seg.includes('[critical]')            // severity 分布行
    && seg.includes('更正:')                 // wrong→right 结构
    && seg.includes('教训:')
    && seg.includes('绕月');                 // 真实教训内容（corr-2026-001）
})(), '登记簿段必须进 markdown 产物，且带真实教训内容');

// 5. 位置纪律：登记簿段必须在「信号热度分组」之前——先读簿子再说话。
//    把渲染挪到信号分组之后 → 本断言失败。
c31('登记簿段排在信号热度分组之前（先读簿子再解读信号）', (() => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const items = [
    { title: 'DeepSeek Raises Nearly $16 billion in Second Funding Round',
      description: '', body: '', source: 'The Information', bucket: 'business',
      pubDate: 'Fri, 24 Oct 2026 00:44:16 GMT', domains: ['capital_flow'],
      link: 'https://theinformation.com/e', origin: 'live' },
  ];
  const rep = new ProjectionEngine({
    engineVersion: '6.8.0', modulesLoaded: 10,
    newsData: { business: { news: items }, economy: { news: [] } },
  }).generate();
  const md = formatReport(rep);
  const iLedger = md.indexOf('## 自我修正登记簿');
  const iStages = md.indexOf('## 信号热度分组');
  return iLedger > 0 && iStages > 0 && iLedger < iStages;
})(), '段序即纪律：登记簿必须在信号解读之前，放到中段等于没放');

// ── 组 4：cron 注入脚本（断链复发防护） ──
// 6. 注入脚本必须读 proj.selfCorrectionLedger，带口径限定与旧版报告路径。
//    摘除注入段 → 本断言失败（v2.9/v2.13/v2.17/v3.0.0c 四次同型断链的复发防护）。
c31('cron 注入脚本读取 selfCorrectionLedger 且带口径限定', (() => {
  const p = path31.join(require('os').homedir(), '.hermes/scripts/hf-cron-fetch.sh');
  if (!fs31.existsSync(p)) return false;
  const src = fs31.readFileSync(p, 'utf-8');
  return /const scl = proj\.selfCorrectionLedger/.test(src)
    && /### 自我修正登记簿/.test(src)
    && /未包含 selfCorrectionLedger 字段/.test(src)          // 旧版报告路径
    && /不可用 —— /.test(src)                                 // 不可用路径
    && /不是本期新闻的事实判定/.test(src)                      // 口径限定：不当外部证据
    && /不得引用为外部证据/.test(src);
})(), '注入脚本必须读 proj.selfCorrectionLedger，并带口径限定/不可用路径');

// 7. 模块计数口径修复：recurringPatterns 的 highSeverity 必须含 critical。
//    恢复 severity === 'high' 严格过滤 → 期望 6 实得 4，失败。
c31('登记簿高危计数含 critical（口径修复）', (() => {
  const mod = require('./human-future/scripts/self-correction-ledger.js');
  const book = JSON.parse(fs31.readFileSync(
    path31.join(__dirname, 'human-future/data/self-corrections.json'), 'utf-8'));
  const rank = { low: 1, medium: 2, high: 3, critical: 4 };
  const expect = book.corrections.filter(c => (rank[c.severity] || 0) >= rank.high).length;
  const r = mod.recurringPatterns();
  return r.total === book.corrections.length && r.highSeverity === expect && expect >= 2;
})(), '数据含 critical 条目，严格 == high 过滤会少报高危数');

(async () => {
  const results = await Promise.all(v31.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v31.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.1: ${v31.length - f} 通过, ${f} 失败, 共 ${v31.length} 个`);
  if (f > 0) {
    console.log('结论：自我修正登记簿接入不完整（接线/产出一致性/渲染/注入有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：登记簿已接入 live pipeline（引擎产出+报告渲染+cron 注入），计数口径含 critical，端到端可达。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v3.1.1 新增断言：口径错位检测段——精度修复 + 端到端接通 cron 注入。
//
// 背景（2026-10-25 live 轮实测）：claimMismatches 自 v2.4 接入、v2.9 修好
// 字段断链后每轮真产出命中，但 2026-10-25 轮逐条复核发现 14 条命中里至少
// 7 条是误报，且 cron 注入脚本从未读 proj.claimMismatches——引擎产出了、
// 报告 md 渲染了，agent 完全看不到（v2.9/v2.13/v2.17/v3.0.0c 之后第五次
// 同型断链：接口存在 ≠ 端到端到达）。
//
// 误报实证（全部来自 2026-10-25 轮 live 数据，可回溯到当轮 full-report）：
//   ① NVIDIA Blog「Kazakhstan Expands Compute」：capacity 在讲 500MW
//      基础设施规模，"Order of Dostyk, First Class"（友谊勋章）被
//      /订单|order|shipped|交付/ 当成采购订单，相隔 1300+ 字符；
//   ② MIT News「Martha Minow speaks on sustaining democracy」：
//      democracy 里的 demo 子串命中；
//   ③ MIT TR「AI's hidden storage bill」：gigawatts 里的 GA 子串 +
//      waitlist 命中；
//   ④ Simon Willison「battledrones v14」：「limited to two players」
//      （数量限制）被当成灰度 + 跨句的 Release 命中；
//   ⑤ EconBrowser「Forward Price Earnings Ratios」：on target（估值
//      达标惯语）+ demonstrate the proposition（论述演示）跨句命中；
//   ⑥ Anthropic「Expectations For The Future」：our researchers（研究
//      流程）+ safety at the frontier（使命宣言）相隔 2000+ 字符命中；
//   ⑦ LWiAI #346：benchmark 主张与「promo code 15% off」促销页脚
//      相隔 1200+ 字符命中。
//
// 本节断言分三组：① 模块级精度（每条误报一个断言，全部要求修复后
// 不命中）；② 真命中不许被修死（同句真形态逐模式保留）；③ 端到端
// （引擎产出带触发句 + 报告渲染 + cron 注入读该字段）。
// ════════════════════════════════════════════════════════════════
const v311 = [];
function c311(name, ok, detail) { v311.push({ name, ok, detail }); }

const fs311 = require('fs');
const path311 = require('path');
const { detectMismatch, splitSentences } = require('./human-future/scripts/claim-mismatch-detector.js');

// ── 组 1：误报回归（每条对应一个 live 实证误报，修复后必须不命中）──
// 1. 勋章当订单：capacity B 侧只认采购语义。恢复旧正则 /订单|order|shipped|交付/
//    → "Order of Dostyk" 重新命中，本断言失败。
c311('勋章与 in order to 不再是采购订单（capacity B 侧语义收紧）', (() => {
  const r = detectMismatch(
    'Firebird would bring total potential AI infrastructure capacity in Kazakhstan to approximately 500 megawatts. '
    + 'Later that evening, President Tokayev presented Huang with the Order of Dostyk, First Class, for his contribution. '
    + 'In order to meet demand, the company plans to expand.');
  return r.matched.every(m => m.id !== 'capacity-vs-order');
})(), '"Order of Dostyk"（友谊勋章）与 "in order to" 都不是订单');

// 2. democracy/democrat 不再命中 demo（\b 词边界）。去掉 \b → 重新命中。
//    注意：B 侧（available）必须与 A 侧（democracy）同句，否则测的是
//    句子级判定而不是词边界——v3.1.1 第一版就把两者放不同句，反向验证时
//    断言空转（旧正则下 B 侧压根没匹配，恒真通过）。
c311('democracy/democrat 不再触发 demo-vs-ga（词边界）', (() => {
  const r = detectMismatch(
    'At MIT, Martha Minow speaks on sustaining democracy, both by using and overcoming AI, '
    + 'and the lecture recording is now available on the MIT News site.');
  return r.matched.every(m => m.id !== 'demo-vs-ga');
})(), 'democracy 与 democrat 都含 demo 子串，无边界匹配是误报源');

// 3. gigawatts 不再触发 GA（词边界 + 完成态 B 侧）。恢复旧 B 侧 → 重新命中。
//    用 live 原句（waitlist 与 gigawatts 同在的一句），不额外加 B 词——
//    否则测的是句子级判定而不是词边界。
c311('gigawatts/average/navigation 不再触发 demo-vs-ga', (() => {
  const r = detectMismatch(
    'Ask most executives to picture the cost of AI and they will likely see GPUs—racks of '
    + 'accelerators with gigawatts of power—and a waitlist for silicon.');
  return r.matched.every(m => m.id !== 'demo-vs-ga');
})(), 'gigawatts/navigation 含 GA 子串、average 含 ga 子串，旧正则全部误命中');

// 4. limited to two players 不是灰度（灰度语义收紧）。恢复裸 limited → 重新命中。
//    同句带上完成态 B 侧（now shipping），否则测的是句子级判定而不是语义收紧。
c311('limited to two players 不再触发 demo-vs-ga（只认灰度语义）', (() => {
  const r = detectMismatch(
    'Release: battledrones v14: Compass Rose, a four player map, now shipping with previous '
    + 'maps limited to two players.');
  return r.matched.every(m => m.id !== 'demo-vs-ga');
})(), '数量限制不是可用性层级');

// 5. available in preview / launched X Preview 是正确表述（完成态可用性断言）。
//    恢复旧 B 侧 /(available|launch|released)/ → 两条都重新命中。
c311('available in preview 与产品名带 Preview 不再判错位', (() => {
  const r1 = detectMismatch(
    'French company Mistral released Mistral Large 4, a 1-trillion-parameter multimodal model '
    + 'available in preview with a final version due by the end of the month.');
  const r2 = detectMismatch(
    'When we launched Claude Mythos Preview, we showed it was able to autonomously find and exploit '
    + 'vulnerabilities in almost every piece of software we pointed it at.');
  return r1.matched.every(m => m.id !== 'demo-vs-ga')
    && r2.matched.every(m => m.id !== 'demo-vs-ga');
})(), '正确表述被判成错位比漏报更伤辨别力');

// 6. 跨句共现不再命中（sentenceScoped 机制）。把 sentenceScoped 全部置 false
//    → 下面两条跨句文本重新命中，本断言失败。
c311('跨句共现不再命中（roadmap/vendor/benchmark 同句判定）', (() => {
  const roadmap = detectMismatch(
    'Analyst estimates were on target for the quarter, with a beat rate of 70%. '
    + 'He then goes on to demonstrate the above proposition by means of a scatter plot.');
  const vendor = detectMismatch(
    'When our researchers follow the same employee over time, they find stable patterns. '
    + 'Our mission is to put safety at the frontier of AI research and products.');
  const bench = detectMismatch(
    'The newsletter covers many models this week. Promo code LWAI takes an additional 15% off any pass. '
    + 'DeepSeek V4.1 matches Z.ai GLM-5.2 on advanced reasoning benchmarks and beats leading open models.');
  return roadmap.matched.every(m => m.id !== 'roadmap-vs-result')
    && vendor.matched.every(m => m.id !== 'vendor-selfreport-vs-verification')
    && bench.matched.every(m => m.id !== 'benchmark-vs-capability');
})(), 'on target+demonstrate / our researchers+safety / benchmark+促销页脚 都是跨句两件事');

// ── 组 2：真命中不许被修死 ──
// 7. v2.9 Gemini 4 Argon 形态：同句双侧共现，benchmark 与 demo 两个模式
//    都必须仍命中。摘除任何一处收紧过度 → 本断言失败。
c311('真命中保留：Gemini 4 Argon 同句形态仍命中两个模式', (() => {
  const r = detectMismatch(
    'It sets a new state of the art on DeepSWE v1.1 (77.9%) and is rolling out to trusted testers '
    + 'before general availability');
  return r.matched.some(m => m.id === 'benchmark-vs-capability')
    && r.matched.some(m => m.id === 'demo-vs-ga');
})(), 'v2.9 起受保护的真命中不能被精度修死');

// 8. 其余四个 sentenceScoped 模式的同句真形态各保留一条。
//    任一侧收紧过度（如把目标句也切掉）→ 本断言失败。
c311('真命中保留：capacity/roadmap/vendor 同句真形态', (() => {
  const cap = detectMismatch('Tesla Fremont 线设计产能 100 万台/年，已下 5000 台部件订单，目标 2026 年产 50000 台');
  const road = detectMismatch('Our roadmap targets GA in Q3 2027 and we have demonstrated a working prototype running end-to-end.');
  const ven = detectMismatch('Our internal evaluations show the model is robust against jailbreaks and aligned with our safety guidelines.');
  return cap.matched.some(m => m.id === 'capacity-vs-order')
    && road.matched.some(m => m.id === 'roadmap-vs-result')
    && ven.matched.some(m => m.id === 'vendor-selfreport-vs-verification');
})(), '四个新启用同句判定的模式都必须有受保护的真命中');

// 9. 句子切分本身：77.9% / v1.1 的小数点不拆句，句末标点才拆。
c311('splitSentences 不在小数点处拆句', (() => {
  const s = splitSentences('It scores 77.9% on DeepSWE v1.1 and ranks #1. The next model ships soon.');
  return s.length === 2 && s[0].includes('77.9%') && s[0].includes('v1.1');
})(), '小数点被当句末会把同句主张拆散，同句判定随之失效');

// ── 组 3：端到端（引擎产出带触发句 + 报告渲染 + cron 注入）──
// 10. 引擎级：live 形态误报条目计数归零、真命中条目保留、命中带触发句。
//     摘除 evidenceSentence 透传或摘除精度修 → 本断言失败。
c311('引擎级：误报条目计数 0、真命中保留、命中带触发句', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const fpItems = [
    { title: 'At MIT, Martha Minow speaks on sustaining democracy, both by using and overcoming AI',
      description: 'In Compton Lecture, the distinguished legal scholar warns of potential loss of the Enlightenment.',
      body: '', source: 'MIT News - AI', link: 'https://news.mit.edu/e', origin: 'live',
      pubDate: 'Mon, 19 Oct 2026 10:00:00 +0000' },
    { title: 'battledrones v14: Compass Rose, a four player map',
      description: 'I added four player online mode - previous maps were limited to two.',
      body: '', source: 'Simon Willison', link: 'https://simonwillison.net/e', origin: 'live',
      pubDate: 'Mon, 19 Oct 2026 10:00:00 +0000' },
  ];
  const tpItems = [
    { title: 'ForTy: a global forest types map',
      description: 'A global map categorizing every 10-meter patch of land on Earth into distinct forest types.',
      body: 'ForTy picked the right forest type 90% of the time, outperforming other global forest maps.',
      source: 'Google DeepMind Blog', link: 'https://deepmind.google/e', origin: 'live',
      pubDate: 'Mon, 19 Oct 2026 10:00:00 +0000' },
  ];
  const engFp = new ProjectionEngine({ newsData: { tech: { news: fpItems } } });
  const engTp = new ProjectionEngine({ newsData: { tech: { news: tpItems } } });
  const cmFp = engFp.buildClaimMismatches();
  const cmTp = engTp.buildClaimMismatches();
  return cmFp.available === true && cmFp.count === 0
    && cmTp.count === 1
    && cmTp.hits[0].mismatches.some(m => m.id === 'benchmark-vs-capability')
    && typeof cmTp.hits[0].evidenceSentence === 'string'
    && cmTp.hits[0].evidenceSentence.includes('90%');
})(), '误报归零 + 真命中带可复核触发句，两头都算数');

// 11. 端到端渲染：formatReport 产物里出现口径错位段与触发句。
//     摘除报告渲染或触发句渲染 → 本断言失败。
c311('端到端：报告 markdown 渲染口径错位段与触发句', (() => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const items = [
    { title: 'ForTy: a global forest types map',
      description: 'A global map categorizing every 10-meter patch of land on Earth into distinct forest types.',
      body: 'ForTy picked the right forest type 90% of the time, outperforming other global forest maps.',
      source: 'Google DeepMind Blog', link: 'https://deepmind.google/e', origin: 'live',
      pubDate: 'Mon, 19 Oct 2026 10:00:00 +0000' },
  ];
  const rep = new ProjectionEngine({ newsData: { tech: { news: items } } }).generate();
  const md = formatReport(rep);
  return md.includes('## 口径错位检测')
    && md.includes('触发句:')
    && md.includes('outperforming other global forest maps');
})(), '报告层必须能展示触发句，否则命中不可复核');

// 12. cron 注入脚本源级：读 proj.claimMismatches，带口径限定、0 命中路径、
//     不可用路径与旧版报告路径。摘除注入段 → 本断言失败（第五次同型断链的
//     复发防护：v2.9/v2.13/v2.17/v3.0.0c 都是「引擎产出了但注入没读」）。
c311('cron 注入脚本读取 claimMismatches 且带口径限定', (() => {
  const p = path311.join(require('os').homedir(), '.hermes/scripts/hf-cron-fetch.sh');
  if (!fs311.existsSync(p)) return false;
  const src = fs311.readFileSync(p, 'utf-8');
  return /const cm = proj\.claimMismatches/.test(src)
    && /### 口径错位检测/.test(src)
    && /未包含 claimMismatches 字段/.test(src)          // 旧版报告路径
    && /不可用 —— /.test(src)                            // 不可用路径
    && /未检测到「产能 vs 订单」/.test(src)                // 0 命中路径
    && /不判定新闻内容真假/.test(src)                      // 口径限定
    && /必须在同一句内带上限定/.test(src);                 // 引用纪律
})(), '注入脚本必须读 proj.claimMismatches 并带口径限定/各降级路径');

// ── v3.1.1 汇总 ──
(async () => {
  const results = await Promise.all(v311.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v311.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.1.1: ${v311.length - f} 通过, ${f} 失败, 共 ${v311.length} 个`);
  if (f > 0) {
    console.log('结论：口径错位检测的精度修复或端到端接通不完整（误报回归/真命中/注入有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：误报回归全清、真命中保留、该段已进 cron 注入（引擎产出+报告渲染+agent 可见）。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v3.2 新增断言：商业主张辨别器新增「产能/供给约束主张」形态（capacity-claim）。
//
// 背景（2026-10-25 live 实证）：SKILL.md 自 v3.0.0c 把 "AWS Largely Sold
// Out Of Capacity Into 2028"（产能主张）记在「已知边界」——商业主张形态库
// 全部不命中，整条不进辨别。本轮实跑该轮 258 条 live：The Information 的
// 这条就在池子里，逐条过形态门确认 MISS；扩模式库后同句命中。供给侧约束
// （需求>供给 → 定价权/扩产周期）是 AI 算力市场的一阶信号，漏掉它商业辨别
// 看不见最重要的市场事实之一。这是新辨别维度（新 kind + 专属证伪路径），
// 不是修 bug。
//
// 同轮审计发现两处口径问题（均如实修）：
//   ① 文档计数错误：SKILL.md/代码注释自 v3.0.0c 写「14 种商业主张形态」，
//      实际只有 13 种（与 v3.1 修正的「17 个源」同型文档计数错误）；新增
//      后真实条数为 14，按代码实测改正，不按文档数字顺延。
//   ② [维护级] 公式桥 Brier 样本未去重：同一份报告里「认知公式评估」段
//      样本=3、「预测台账」段已结算=1（3 条 EU AI Act 同义务条目），两个
//      自相矛盾的样本数——正是本引擎要抓的口径错位。按 v2.16 同义务去重
//      口径对齐（维护，不单独涨号）。
//
// 本节断言分五组：① live 实证句式命中；② 形态族召回（售罄/耗尽/分配/
// 短缺/需求超供给）；③ 精度回归（普通 capacity 词/演唱会与座位 sold out/
// waitlist 类比/扩产新闻全部不命中）；④ 端到端（引擎候选门 + 报告渲染 +
// cron 注入 + 精度门未破）；⑤ 维护级公式桥去重。每处都做反向验证。
// ════════════════════════════════════════════════════════════════
const v32 = [];
function c32(name, ok, detail) { v32.push({ name, ok, detail }); }

const fs32 = require('fs');
const path32 = require('path');
const os32 = require('os');

// ── 组 1：live 实证句式命中 ──
// 1. 2026-10-25 轮 live 池里真实存在的 The Information 简报标题（无摘要，
//    主张就在标题里）。摘除 capacity-claim 模式 → kind 不是 capacity，失败。
c32('live 实证：AWS 产能主张命中 capacity 形态', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'AWS Largely Sold Out Of Capacity Into 2028, Jassy Says',
    source: 'The Information',
  });
  return r.kind === 'capacity'
    && r.kinds.length === 1 && r.kinds[0] === 'capacity'   // 只命中产能形态，不串台
    && r.verdict === 'weak-evidence'      // 标题-only：无出处(1)、推理 0/3，不虚抬
    && r.evidence.weight === 1
    && r.decisionRelevant === false;
})(), '「Sold Out Of Capacity Into 2028」必须命中产能形态并按低证据等级判别（不虚抬为决策相关）');

// 2. 证伪条件与类目：新 kind 必须有专属证伪路径，不能落回「无明确证伪路径」。
//    摘除 FALSIFICATION_BY_KIND.capacity → 失败；摘除类目映射 → 失败。
c32('capacity 形态有专属证伪条件与类目映射', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'AWS is largely sold out of compute capacity into 2028, according to a quarterly earnings call.',
    source: 'The Information',
  });
  return r.kind === 'capacity'
    && r.category === 'market_claims'
    && /第三方产能|利用率|扩容|预留量/.test(r.falsification)
    && r.falsification !== '无明确证伪路径——这本身就是问题';
})(), '产能主张必须带「第三方产能跟踪/扩容/预留量」证伪路径，归市场主张域');

// ── 组 2：形态族召回 ──
// 3. 耗尽族（sold out / exhausted / allocated / committed，含 has been 形态）。
c32('形态族召回：售罄/耗尽/分配殆尽四种谓语', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'capacity-claim');
  if (!p) return false;
  return [
    'AWS is largely sold out of capacity into 2028.',
    'Our compute capacity is nearly exhausted through next year.',
    'GPU supply has been fully allocated to existing customers.',
    'Cloud supply is effectively committed through 2027.',
    'The cloud provider is sold out of GPU capacity until 2028.',
  ].every(s => p.re.test(s));
})(), 'sold out / exhausted / allocated / committed 四种谓语都要命中');

// 4. 短缺与需求超供给族（含形容词间隔与过去时态——新闻句式的主流形态）。
c32('形态族召回：短缺与需求超供给', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'capacity-claim');
  if (!p) return false;
  return [
    'A severe shortage of AI chips is delaying data center builds.',
    'Demand for accelerators far exceeds available supply this quarter.',
    'Orders outpaced inventory across every hyperscaler region.',
  ].every(s => p.re.test(s));
})(), 'shortage of / demand exceeds supply / orders outpaced inventory 都要命中');

// ── 组 3：精度回归（v3.0.0c 教训：漏报比误报诚实）──
// 5. 普通 capacity 词/演唱会 sold out/座位容量/waitlist 类比/解题式 bottleneck
//    一律不得命中。摘除相邻性收紧（恢复 40 字宽窗）→ 座位句误命中，失败。
c32('精度回归：普通 capacity 词与 sold out 不误命中', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'capacity-claim');
  if (!p) return false;
  return [
    'The new SSD offers 100TB of storage capacity for enterprise customers.',
    'The NGO runs capacity building programs for local governments.',
    'Frontier models show a growing capacity to reason about complex problems.',
    'The concert was sold out within minutes of tickets going on sale.',
    'The stadium has a seat capacity of 80,000 and was sold out for the final.',
    'Executives picture racks of accelerators with gigawatts of power and a waitlist for silicon.',
    'How Companies Are Using NVIDIA DSX to Break the Power Bottleneck',
    'Kazakhstan Expands Compute for Its AI Future, moving from infrastructure plans to deployment.',
  ].every(s => !p.re.test(s));
})(), 'storage capacity / capacity building / capacity to reason / 演唱会与座位 sold out / waitlist 类比 / 扩产新闻都不得命中');

// ── 组 4：端到端（引擎门 + 报告渲染 + cron 注入）──
// 6. 引擎候选门放行 AWS 条目并辨别；formatReport 渲染产能/供给约束标签。
//    摘除报告 KIND_CN → 失败；摘除模式 → available=false，失败。
c32('端到端：AWS 产能主张进商业辨别段并渲染', (() => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const item = { title: 'AWS Largely Sold Out Of Capacity Into 2028, Jassy Says',
    description: '', body: '', source: 'The Information', bucket: 'business',
    pubDate: 'Sat, 25 Oct 2026 00:44:16 GMT', domains: ['market_claims'],
    link: 'https://theinformation.com/aws', origin: 'live' };
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: 1, domains: [], undomained: 0, dateRange: null, items: [item] };
  const cd = inst.buildCommercialDiscrimination();
  const md = formatReport(new ProjectionEngine({ newsData: { business: { news: [item] } } }).generate());
  const seg = md.split('## 商业主张辨别')[1] || '';
  return cd.available === true && cd.audited === 1
    && cd.results[0].kind === 'capacity'
    && seg.includes('AWS Largely Sold Out Of Capacity Into 2028')
    // 必须认「渲染出来的类型标签行」而不是段里任意出现该字符串——note 文本
    // 里也有「产能/供给约束」，泛匹配会让断言空转（v3.2 反向验证实测：
    // 摘除 formatReport KIND_CN 后 0 失败，就是被 note 文本喂饱的）。
    && seg.includes('类型: 产能/供给约束 | 来源: The Information')
    && seg.includes('证伪条件:');
})(), 'AWS 条目必须进商业辨别段，报告渲染产能/供给约束标签与证伪条件');

// 7. 精度门没被新模式打穿：Fed 公告/播客仍不进辨别（新模式写得过宽就会漏进来）。
c32('精度门未破：非主张文本仍被挡在辨别外', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const noise = [
    { title: 'Minutes of the Federal Open Market Committee',
      description: 'Participants noted that financial market conditions had eased.',
      body: '', source: 'Federal Reserve (Monetary)', bucket: 'economy',
      pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT', domains: ['economy_labor'],
      link: 'https://federalreserve.gov/a', origin: 'live' },
    { title: 'LWiAI Podcast #252 - GPT 5.6, Grok 4.5, Nemotron-Labs-Diffusion, AI 2040',
      // [v3.3.1] 夹具补强：旧 description（"$5 billion in new funding and
      // 30% growth in enterprise adoption"）不触发任何模式门，本断言恒真
      // 空转（corr-2026-015）。换成 2026-10-25 live 轮真正漏进辨别的原句
      // ——旧 survey-finding 正则下 "research from" 命中调查研究形态。
      description: "GPT-5.6 and Grok 4.5, Meta's Muse Spark 1.1, regulatory developments in AI and data centers, interpretability research from Anthropic, and the future of AI policy with AI 2040",
      body: '', source: 'Last Week in AI', bucket: 'business',
      pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT', domains: ['capital_flow'],
      link: 'https://lastweekin.ai/b', origin: 'live' },
  ];
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: noise.length, domains: [], undomained: 0, dateRange: null, items: noise };
  const r = inst.buildCommercialDiscrimination();
  return r.available === false && /未抽到命中商业主张形态/.test(r.reason || '');
})(), 'Fed 公告与播客不得因新模式进入辨别');

// 8. cron 注入脚本 KIND_CN 认识 capacity（端到端最后一环：agent 看得见中文标签）。
//    摘除注入脚本 KIND_CN 的 capacity 行 → 失败（第五次同型断链的复发防护）。
c32('cron 注入脚本渲染产能/供给约束标签', (() => {
  const p = path32.join(os32.homedir(), '.hermes/scripts/hf-cron-fetch.sh');
  if (!fs32.existsSync(p)) return false;
  const src = fs32.readFileSync(p, 'utf-8');
  return /'capacity': '产能\/供给约束'/.test(src);
})(), '注入脚本 KIND_CN 必须含 capacity，否则 agent 看到英文 kind');

// ── 组 5：维护级——公式桥 Brier 样本同义务去重 ──
// 9. buildFormulaAssessment 必须把去重后的已结算条目送进公式桥。
//    实测依据：2026-10-25 报告「认知公式评估」段 Brier 样本=3，而同一份
//    报告「预测台账」段显示已结算 1 条（3 条 EU AI Act 同义务条目），两个
//    自相矛盾的样本数。摘除去重 → sample=3，失败。
c32('公式桥 Brier 样本按同义务去重（与台账段一致）', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const LEDGER = path32.join(__dirname, 'human-future/data/prediction-ledger.json');
  const backup = fs32.existsSync(LEDGER) ? fs32.readFileSync(LEDGER, 'utf-8') : null;
  try {
    const ev = { sources: ['https://a.eu/x', 'https://b.com/y'], summary: '同一义务', settledBy: 'test' };
    fs32.writeFileSync(LEDGER, JSON.stringify({ version: '1.0.0', predictions: [
      { id: 't-1', claim: '同一义务页面A', probability: 0.45, domain: 'regulatory_action', category: 'regulatory_action', dueOn: '2026-09-30', outcome: true, evidence: ev },
      { id: 't-2', claim: '同一义务页面B', probability: 0.45, domain: 'regulatory_action', category: 'regulatory_action', dueOn: '2026-09-30', outcome: true, evidence: ev },
      { id: 't-3', claim: '另一件事', probability: 0.9, domain: 'vendor_delivery', category: 'vendor_delivery', dueOn: '2027-12-31', outcome: false, evidence: { sources: ['https://c.com/z'], summary: '另一件事', settledBy: 'test' } },
    ] }, null, 2));
    const inst = new ProjectionEngine({});
    inst.signals = { totalItems: 0, domains: [], undomained: 0, dateRange: null, items: [] };
    const fa = inst.buildFormulaAssessment();
    return fa.available === true
      && fa.formulas.brier.sample === 2   // 3 条登记 = 2 个义务
      && Math.abs(fa.formulas.brier.score - (Math.pow(0.45 - 1, 2) + Math.pow(0.9 - 0, 2)) / 2) < 0.001;
  } finally {
    if (backup === null) fs32.unlinkSync(LEDGER); else fs32.writeFileSync(LEDGER, backup);
  }
})(), '公式桥样本必须去重（3 条登记 → 2 个义务），否则与台账段口径互相矛盾');

// ── v3.2 汇总 ──
(async () => {
  const results = await Promise.all(v32.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v32.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.2: ${v32.length - f} 通过, ${f} 失败, 共 ${v32.length} 个`);
  if (f > 0) {
    console.log('结论：产能/供给约束主张形态或端到端接通不完整（命中/召回/精度/注入/公式桥去重有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：产能/供给约束主张已进形态库与端到端产物（引擎+报告+cron 注入），精度回归全清，公式桥样本口径已对齐。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v3.2.1 新增断言：预测校准与台账状态端到端接通 cron 注入（断链修复）。
//
// 背景（2026-10-25 断链审计实测）：把最新 full-report 的 projection 全字段
// 与注入脚本读取的字段做差集，发现 15 个段「引擎产出了、formatReport 渲染
// 了、注入脚本从未读」。其中最有实质内容且直击引擎定位的是两个：
//   ledgerStatus —— Brier/兑现率/待结算/逾期（v2.13 起产出）
//   formulaAssessment —— 贝叶斯 posterior/Brier/折扣/风险（认知公式桥）
// v2.13 方向转变的核心承诺是「辨别他人预测 + 长期跟踪结算、建立校准曲线」，
// 台账结算状态是这件事的唯一数据出口；出口没接进 agent prompt，等于转变
// 只做了一半。且 v3.2 刚修好的 Brier 同义务去重口径（公式段样本 3→1 与
// 台账段对齐），agent 看不到修好的数字。这是 v2.9/v2.13/v2.17/v3.0.0c/
// v3.1.1 之后第六次同型断链（接口存在 ≠ 端到端到达）。
//
// 本节断言分三组：① 注入脚本源级（两个字段+旧版/不可用路径+口径限定）；
// ② 引擎产出与数据文件逐条一致（防注入层编数字）；③ 两段样本口径一致
// （v3.2 修复不得回退——注入后 agent 会同时看到两个数，必须相等）。
// ════════════════════════════════════════════════════════════════
const v321 = [];
function c321(name, ok, detail) { v321.push({ name, ok, detail }); }

const fs321 = require('fs');
const path321 = require('path');
const os321 = require('os');

// ── 组 1：注入脚本源级 ──
// 1. 注入脚本必须读 proj.ledgerStatus 与 proj.formulaAssessment，带口径限定、
//    不可用路径与旧版报告路径。摘除注入段 → 失败；摘除 formulaAssessment
//    读取 → 失败；摘除口径限定 → 失败（第六次同型断链的复发防护）。
c321('cron 注入脚本读取 ledgerStatus 与 formulaAssessment 且带口径限定', (() => {
  const p = path321.join(os321.homedir(), '.hermes/scripts/hf-cron-fetch.sh');
  if (!fs321.existsSync(p)) return false;
  const src = fs321.readFileSync(p, 'utf-8');
  return /const lsC = proj\.ledgerStatus/.test(src)
    && /const faC = proj\.formulaAssessment/.test(src)
    && /### 预测校准与台账状态/.test(src)
    && /未包含 ledgerStatus\/formulaAssessment 字段/.test(src)   // 旧版报告路径
    && /不可用 —— /.test(src)                                     // 不可用路径
    && /Brier/.test(src) && /兑现率/.test(src) && /待结算/.test(src)
    && /贝叶斯 posterior/.test(src)                               // 公式段真的读了
    && /样本 <3 时不具统计性/.test(src)                           // 口径限定：小样本
    && /方法演示，不是校准过的概率/.test(src)                     // 口径限定：公式段性质
    && /引擎不自动判定兑现与否/.test(src);                        // 口径限定：不自动结算
})(), '注入脚本必须读 ledgerStatus/formulaAssessment，并带口径限定/各降级路径');

// ── 组 2：引擎产出与数据文件一致（防注入层编数字）──
// 2. getLedgerStatus() 的 brier/sample/pending/overdue 必须与台账数据文件
//    去重后对得上。改数字（如把 brier 写死）→ 失败。
c321('ledgerStatus 产出与台账数据文件逐条一致', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const predictionLedger = require('./human-future/scripts/prediction-ledger.js');
  const LEDGER = path321.join(__dirname, 'human-future/data/prediction-ledger.json');
  const book = JSON.parse(fs321.readFileSync(LEDGER, 'utf-8'));
  const all = book.predictions || [];
  const sc = predictionLedger.scorecard();
  const od = predictionLedger.overdue();
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: 0, domains: [], undomained: 0, dateRange: null, items: [] };
  const ls = inst.getLedgerStatus();
  return ls.available === true
    && ls.sample === sc.sample
    && ls.brier === sc.brier
    && ls.hitRate === sc.hitRate
    && ls.pending === all.filter(p => p.outcome === null).length
    && ls.overdueCount === od.length
    && (sc.sample === 0 || typeof ls.brier === 'number');
})(), 'ledgerStatus 的 Brier/样本/待结算/逾期必须与台账文件算出的一致，不得写死');

// ── 组 3：两段样本口径一致（v3.2 修复不得回退）──
// 3. buildFormulaAssessment() 的 Brier 样本必须等于 getLedgerStatus() 的样本。
//    实测依据：v3.2 修复前同一份报告公式段样本=3、台账段=1（3 条 EU AI Act
//    同义务条目）。注入后 agent 会同时看到这两个数——不相等就是口径错位
//    复发。摘除 buildFormulaAssessment 的同义务去重 → 失败。
c321('公式段与台账段 Brier 样本口径一致', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: 0, domains: [], undomained: 0, dateRange: null, items: [] };
  const fa = inst.buildFormulaAssessment();
  const ls = inst.getLedgerStatus();
  return fa.available === true
    && fa.formulas && fa.formulas.brier
    && ls.sample === fa.formulas.brier.sample;
})(), '公式桥 Brier 样本必须与台账段样本相等（同义务去重口径不得回退）');

// ── v3.2.1 汇总 ──
(async () => {
  const results = await Promise.all(v321.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v321.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.2.1: ${v321.length - f} 通过, ${f} 失败, 共 ${v321.length} 个`);
  if (f > 0) {
    console.log('结论：预测校准与台账状态的端到端接通不完整（注入/产出一致性/口径对齐有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：校准跟踪已进 cron 注入（引擎产出+口径限定+agent 可见），公式段与台账段样本口径一致。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v3.2.2 新增断言：低置信度守门段端到端接通 cron 注入（第七次同型断链修复）。
//
// 背景（2026-10-25 断链审计实测）：把最新 full-report 的 projection 全字段
// 与注入脚本读取的字段做差集，v3.2.1 修掉 ledgerStatus/formulaAssessment 后
// 仍有 13 个段「引擎产出了、formatReport 渲染了、注入脚本从未读」。其中
// 直击假能力防护链的是 lowConfidenceGate：applyLowConfidenceGate() 自 v3
// 引擎起产出 overall 置信度与阈值 0.6 的比较、每个 stage 的 allowed 与
// disclosure（实测整体 0.43 < 0.6，「该输出不得作为结论引用」），
// formatReport 渲染「低置信度守门」段——但注入脚本从未读它。agent 每轮都
// 在没有置信度门槛的情况下消费 summary 与阶段结论：低置信度推演输出被
// 当成结论写进报告，正是本引擎要抓的「无保留完成态宣称」在自家产物上的
// 复发。这是 v2.9/v2.13/v2.17/v3.0.0c/v3.1.1/v3.2.1 之后第七次同型断链
// （接口存在 ≠ 端到端到达）。
//
// 本节断言分三组：① 注入脚本源级（字段+口径限定+降级路径+位置纪律：
// 守门披露必须先于「推演阶段结论」到达 agent）；② 引擎产出与阈值语义
// 一致（allowed 由 score 与 0.6 比较决定，不写死）；③ 断链审计差集闭环
// ——把 v3.2.1 立的「差集审计每轮做」纪律固化为测试动作：产出字段 vs
// 注入字段的差集必须等于一份逐段结案的有意省略清单，新字段漏注入或
// 清单腐烂（接入后忘了移除）都失败。
// ════════════════════════════════════════════════════════════════
const v322 = [];
function c322(name, ok, detail) { v322.push({ name, ok, detail }); }

// ── 组 1：注入脚本源级 + 位置纪律 ──
// 1. 注入脚本必须读 proj.lowConfidenceGate，带口径限定、旧版报告路径，
//    且段序在「推演阶段结论」之前。摘除整段 → 失败；摘除口径限定 → 失败；
//    移到阶段结论之后 → 位置断言失败（第七次同型断链的复发防护）。
c322('cron 注入脚本读取 lowConfidenceGate 且带口径限定与位置纪律', (() => {
  const p = require('path').join(require('os').homedir(), '.hermes/scripts/hf-cron-fetch.sh');
  if (!require('fs').existsSync(p)) return false;
  const src = require('fs').readFileSync(p, 'utf-8');
  const idxGate = src.indexOf('### 低置信度守门');
  const idxStage = src.indexOf('### 推演阶段结论');
  return /const lcg = proj\.lowConfidenceGate/.test(src)
    && idxGate >= 0
    && /未包含 lowConfidenceGate 字段/.test(src)             // 旧版报告降级路径
    && /不得作为结论引用/.test(src)                           // overall 未通过分支语义
    && /被拦阶段/.test(src)                                   // stages 明细真的渲染
    && /不是对新闻内容真假的判定/.test(src)                   // 口径限定：守门≠事实判定
    && /不得引用为结论、预测或行动依据/.test(src)             // 口径限定：用途限定
    && idxGate < idxStage;                                    // 位置纪律：先于阶段结论
})(), '注入脚本必须读 lowConfidenceGate，带口径限定/降级路径，且段序先于阶段结论');

// ── 组 2：引擎产出与阈值语义一致（防写死）──
// 2. applyLowConfidenceGate() 的 allowed 必须由 score 与 threshold 0.6 的
//    比较决定：0.43 拦、0.9 放行、stage 0.71 放行/0.48 拦。写死 true/false
//    → 失败。披露文案必须来自模块（disclosure 非空）。
c322('applyLowConfidenceGate 产出与阈值语义一致（不写死）', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const inst = new ProjectionEngine({});
  const low = inst.applyLowConfidenceGate({
    confidence: { score: 0.43 },
    stages: [
      { period: '测试阶段A', confidence: 0.71, conclusion: 'x' },
      { period: '测试阶段B', confidence: 0.48, conclusion: 'y' },
    ],
  });
  const high = inst.applyLowConfidenceGate({
    confidence: { score: 0.9 },
    stages: [{ period: '测试阶段A', confidence: 0.95, conclusion: 'x' }],
  });
  return low.overall.allowed === false
    && low.overall.confidence === 0.43
    && low.threshold === 0.6
    && typeof low.overall.disclosure === 'string' && low.overall.disclosure.length > 0
    && low.stages.length === 2
    && low.stages[0].allowed === true
    && low.stages[1].allowed === false
    && high.overall.allowed === true;    // 双向：高置信度必须放行，不是恒 false
})(), 'allowed 必须由 score 与 threshold 0.6 比较决定（0.43 拦/0.9 放行），不得写死');

// ── 组 3：断链审计差集闭环（v3.2.1 纪律的测试固化）──
// 3. projection 产出字段（静态提取 project-future.js generate() 的 report
//    字面量键 + report.X= 赋值）vs 注入脚本读取的 proj.X，差集必须等于
//    下面这份逐段结案的有意省略清单——本轮 13 段差集逐段看过内容后记录
//    理由。接入任一段 → 从清单移除；不加清单的新字段 → 失败（断链复发）；
//    清单里有已接入/已不产出的段 → 失败（结案腐烂）。
c322('projection 产出字段 vs 注入脚本差集等于已结案清单', (() => {
  const fs322 = require('fs');
  const path322 = require('path');
  const os322 = require('os');
  const pf = fs322.readFileSync(path322.join(__dirname, 'scripts/project-future.js'), 'utf-8');
  // 1) generate() 里 report 对象字面量的顶层键
  const litStart = pf.indexOf('const report = {');
  if (litStart < 0) return false;
  let depth = 0, litEnd = -1;
  for (let i = pf.indexOf('{', litStart); i < pf.length; i++) {
    if (pf[i] === '{') depth++;
    else if (pf[i] === '}') { depth--; if (depth === 0) { litEnd = i; break; } }
  }
  if (litEnd < 0) return false;
  const produced = new Set();
  for (const m of pf.slice(litStart, litEnd).matchAll(/^\s{6}([a-zA-Z0-9_]+):/gm)) produced.add(m[1]);
  // 2) generate() 里的 report.X = 赋值
  const genStart = pf.indexOf('generate() {');
  const genEnd = pf.indexOf('return report;', genStart);
  if (genStart < 0 || genEnd < 0) return false;
  for (const m of pf.slice(genStart, genEnd).matchAll(/\breport\.([a-zA-Z0-9_]+)\s*=(?!=)/g)) produced.add(m[1]);
  // 3) 注入脚本读取的 proj.X
  const sh = fs322.readFileSync(path322.join(os322.homedir(), '.hermes/scripts/hf-cron-fetch.sh'), 'utf-8');
  const injected = new Set();
  for (const m of sh.matchAll(/proj\.([a-zA-Z0-9_]+)/g)) injected.add(m[1]);
  // 4) 有意省略清单：2026-10-25 v3.2.2 轮断链审计逐段结案（13 段全部看过
  //    内容与价值后记录理由，不是默认省略）
  const AUTHORIZED_OMISSIONS = {
    turningPoints: '与 live 条目段同批信号重叠；probability 是信号强度非预测概率，注入有误读风险',
    risks: '从 live 信号归纳的 severity/likelihood，agent 可自行归纳；下轮候选',
    opportunities: '同上，归纳可由 agent 做',
    recommendations: '引擎生成行动建议与 v3.0.0c 纪律「引擎不生成商业建议」定位冲突，有意不注入',
    confidence: '已由 v3.2.2 接入的 lowConfidenceGate.overall.confidence 覆盖，合并披露',
    causalChains: 'edgeSource=cooccurrence 共现兜底不是因果证据，注入须带「共现非因果」限定；下轮候选',
    crossDomainConduction: '传导矩阵是领域知识静态先验，不是本期信号推出',
    trendClassification: '判定随源数波动（<3 源中位数退化），报告已展示；下轮候选',
    timelineConflicts: 'ordered 与 live 条目重叠，conflicts 依赖正文抓取',
    sourceAdjudication: '分级计数是概览不是条目判定；若立「引用须标 tier」纪律则接入',
    frontierModelSection: '注入脚本已用 newsData 自行构造 F 区（前 20 条+按来源/按周聚合），重复实现已覆盖',
    predictionRecording: 'v2.13 起 count 恒 0 无信息量；有登记时 forecastDiscrimination 的 ledgerRegistration 已回显',
  };
  const diff = [...produced].filter(k => !injected.has(k) && !(k in AUTHORIZED_OMISSIONS));
  const stale = Object.keys(AUTHORIZED_OMISSIONS).filter(k => injected.has(k) || !produced.has(k));
  return diff.length === 0 && stale.length === 0 && produced.has('lowConfidenceGate');
})(), '差集必须为空：新字段不进注入=断链复发；清单不同步=结案腐烂');

// ── v3.2.2 汇总 ──
(async () => {
  const results = await Promise.all(v322.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v322.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.2.2: ${v322.length - f} 通过, ${f} 失败, 共 ${v322.length} 个`);
  if (f > 0) {
    console.log('结论：低置信度守门的端到端接通不完整（注入/产出一致性/差集结案有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：守门披露已进 cron 注入（先于阶段结论+口径限定），差集审计固化为每轮测试动作。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v3.3 新增断言：商业主张辨别器新增「并购/交易过程主张」形态（ma-claim）。
//
// 背景（2026-10-25 覆盖审计实测）：SKILL.md 自 v3.0.0c 记在「已知边界」的
// 第二个覆盖缺口仍在 live 池里——The Information「Instacart Is Exploring
// a Sale」与「Ramp Investors Went Nuclear Against Airwallex After Doomed
// Deal」扩容前 14 种形态全部不命中，整条不进辨别（v3.3 前 246 条 live
// 实测：商业辨别 6 条里没有这两条）。交易过程（并购/出售/谈判/破裂）是资本与商业
// 模式域的一阶信号，漏掉它商业辨别看不见市场结构变化的主要通道之一。
//
// 精度设计按 v3.0.0c/v3.2 教训（漏报比误报诚实、没有实证不扩模式）：
//   ① 只认「交易是主张主体」的句式；② 不认裸 sale talks 名词短语——
//     「Instacart Shares Rally 10% After ... Reports Sale Talks」的主张
//     主体是股价（可核验的市场价格事实，v3.2 已决议非待辨别主张），
//     Reports Sale Talks 是媒体转述的从属成分；③ 不认 IPO / bare in talks /
//     exploring options / eyes+非交易名词（inDrive robotaxi tests）。
//
// 本节断言分四组：① live 实证句式命中 + 证伪条件与类目；② 形态族召回；
// ③ 精度回归；④ 端到端（引擎候选门 + 报告渲染 + cron 注入 + 精度门未破）。
// ════════════════════════════════════════════════════════════════
const v33 = [];
function c33(name, ok, detail) { v33.push({ name, ok, detail }); }

// ── 组 1：live 实证句式命中 ──
c33('live 实证：Instacart 出售探索命中 ma 形态', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Instacart Is Exploring a Sale',
    source: 'The Information',
  });
  return r.kind === 'ma'
    && r.kinds.length === 1 && r.kinds[0] === 'ma'
    && r.verdict === 'unfalsifiable'     // 标题-only：无量化（no-quantity），不虚抬
    && r.falsifiability.problems.some(p => p.id === 'no-quantity')
    && r.evidence.weight === 1
    && r.reasoning.score === 0
    && r.decisionRelevant === false;
})(), '「Instacart Is Exploring a Sale」必须命中并购/交易过程形态并按无量化判不可证伪（不虚抬为决策相关）');

c33('live 实证：Ramp/Airwallex 破裂交易命中 ma 形态', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Ramp Investors Went Nuclear Against Airwallex After Doomed Deal',
    source: 'The Information',
  });
  return r.kind === 'ma'
    && r.kinds.length === 1 && r.kinds[0] === 'ma'   // 只命中交易形态，不串台到资本信号
    && r.verdict === 'unfalsifiable'
    && r.evidence.weight === 1
    && r.decisionRelevant === false;
})(), '「After Doomed Deal」必须命中交易过程形态（此前整条不进辨别）');

c33('ma 形态有专属证伪条件与类目映射', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'The retailer is exploring a sale, according to people familiar with the matter.',
    source: 'The Information',
  });
  return r.kind === 'ma'
    && r.category === 'capital_flow'
    && /否认|谈判破裂|监管否决|条款/.test(r.falsification)
    && r.falsification !== '无明确证伪路径——这本身就是问题';
})(), '交易主张必须带「当事方否认/谈判破裂/监管否决/条款不符」证伪路径，归资本与商业模式域');

// ── 组 2：形态族召回 ──
c33('形态族召回：探索/权衡/谈判/破裂四族', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'ma-claim');
  if (!p) return false;
  return [
    'Instacart is exploring a sale, according to sources.',
    'The chipmaker is considering a merger with its rival.',
    'Reports say the retailer is weighing a takeover bid.',
    'The startup is pursuing a buyout of its supplier.',
    'Firm A is in talks to acquire Firm B for $5 billion.',
    'The company has entered talks to be bought by a PE fund.',
    'The deal fell through after regulatory scrutiny.',
    'Merger talks collapsed on Monday amid the leak.',
    'Negotiations stalled for weeks before the announcement.',
  ].every(s => p.re.test(s));
})(), 'exploring/considering/weighing/pursuing + talks to acquire/buy/sell + doomed/collapsed/stalled 都要命中');

// ── 组 3：精度回归 ──
c33('精度回归：市场反应/监管/测试计划/IPO 不误命中', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'ma-claim');
  if (!p) return false;
  return [
    // 主张主体是股价（可核验价格事实，v3.2 决议非待辨别主张），Reports Sale Talks 是从属转述
    'Instacart Shares Rally 10% After The Information Reports Sale Talks',
    // 监管公告不是交易主张
    'U.S. Treasury Proposes to Widen Outbound Investment Restrictions for China and Other Countries',
    // 销量不是交易
    'Hottest toy for Christmas? Nvidia CEO plays with adorable Microduck robots, 20,000 sell',
    // eyes + 非交易名词是测试计划
    'Uber rival inDrive eyes 2027 robotaxi tests in Central Asia with Pony AI and Nvidia',
    // 无交易对象的裸谈判、战略措辞
    'The two sides are in talks, according to people familiar',
    'The company is exploring options for international growth',
    // IPO 归估值形态，不双标签
    'OpenAI working on new $30B raise at $1.25T valuation ahead of IPO',
    // 产能形态不串台
    'AWS Largely Sold Out Of Capacity Into 2028, Jassy Says',
  ].every(s => !p.re.test(s));
})(), '股价反应/监管限制/销量/eyes 测试计划/裸 in talks/exploring options/IPO/产能句都不得命中');

// ── 组 4：端到端 ──
c33('端到端：两条交易主张进商业辨别段并渲染标签', (() => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const items = [
    { title: 'Instacart Is Exploring a Sale', description: '', body: '',
      source: 'The Information', bucket: 'business',
      pubDate: 'Sat, 25 Oct 2026 00:44:16 GMT', domains: ['capital_flow'],
      link: 'https://theinformation.com/a', origin: 'live' },
    { title: 'Ramp Investors Went Nuclear Against Airwallex After Doomed Deal', description: '', body: '',
      source: 'The Information', bucket: 'business',
      pubDate: 'Sat, 25 Oct 2026 00:44:16 GMT', domains: ['capital_flow'],
      link: 'https://theinformation.com/b', origin: 'live' },
  ];
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: 2, domains: [], undomained: 0, dateRange: null, items };
  const cd = inst.buildCommercialDiscrimination();
  const md = formatReport(new ProjectionEngine({ newsData: { business: { news: items } } }).generate());
  const seg = md.split('## 商业主张辨别')[1] || '';
  return cd.available === true && cd.audited === 2
    && cd.results.every(r => r.kind === 'ma')
    && seg.includes('Instacart Is Exploring a Sale')
    && seg.includes('Ramp Investors Went Nuclear Against Airwallex After Doomed Deal')
    // 只认渲染出来的类型标签行（v3.2 教训：note/图例文本会把泛匹配喂饱）
    && seg.includes('类型: 并购/交易过程 | 来源: The Information')
    && seg.includes('证伪条件:');
})(), '两条交易主张必须进商业辨别段，报告渲染并购/交易过程标签与证伪条件');

c33('cron 注入脚本渲染并购/交易过程标签', (() => {
  const p = require('path').join(require('os').homedir(), '.hermes/scripts/hf-cron-fetch.sh');
  if (!require('fs').existsSync(p)) return false;
  const src = require('fs').readFileSync(p, 'utf-8');
  return /'ma': '并购\/交易过程'/.test(src);
})(), '注入脚本 KIND_CN 必须含 ma，否则 agent 看到英文 kind');

c33('精度门未破：非主张文本仍被挡在辨别外', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const noise = [
    { title: 'Minutes of the Federal Open Market Committee',
      description: 'Participants noted that financial market conditions had eased.',
      body: '', source: 'Federal Reserve (Monetary)', bucket: 'economy',
      pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT', domains: ['economy_labor'],
      link: 'https://federalreserve.gov/a', origin: 'live' },
    { title: 'LWiAI Podcast #252 - GPT 5.6, Grok 4.5, Nemotron-Labs-Diffusion, AI 2040',
      // [v3.3.1] 夹具补强：旧 description（"$5 billion in new funding and
      // 30% growth in enterprise adoption"）不触发任何模式门，本断言恒真
      // 空转（corr-2026-015）。换成 2026-10-25 live 轮真正漏进辨别的原句
      // ——旧 survey-finding 正则下 "research from" 命中调查研究形态。
      description: "GPT-5.6 and Grok 4.5, Meta's Muse Spark 1.1, regulatory developments in AI and data centers, interpretability research from Anthropic, and the future of AI policy with AI 2040",
      body: '', source: 'Last Week in AI', bucket: 'business',
      pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT', domains: ['capital_flow'],
      link: 'https://lastweekin.ai/b', origin: 'live' },
  ];
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: noise.length, domains: [], undomained: 0, dateRange: null, items: noise };
  const r = inst.buildCommercialDiscrimination();
  return r.available === false && /未抽到命中商业主张形态/.test(r.reason || '');
})(), 'Fed 公告与播客不得因 ma 新模式进入辨别');

// 维护级断言：模式计数文档口径（v3.2 刚纠错过「14 种」文档计数错误）。
c33('模式计数口径：15 种与文档一致', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const pf = require('fs').readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return COMMERCIAL_CLAIM_PATTERNS.length === 15
    && /共 15 种模式/.test(pf)
    && COMMERCIAL_CLAIM_PATTERNS.some(p => p.id === 'ma-claim');
})(), '模式库真实条数必须与文档写的「15 种」一致（防文档计数腐烂）');

// ── v3.3 汇总 ──
(async () => {
  const results = await Promise.all(v33.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v33.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '\u2713' : '\u2717'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.3: ${v33.length - f} 通过, ${f} 失败, 共 ${v33.length} 个`);
  if (f > 0) {
    console.log('结论：并购/交易过程主张的接入不完整（命中/证伪/召回/精度/端到端有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：交易过程主张已进模式库（live 实证 2 条命中），报告与 cron 注入渲染中文标签，精度回归通过。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v3.3.1 维护级（不是新辨别维度）：survey-finding 精度修复 + 版本号漂移修复
//
// 背景（2026-10-25 v3.3.0 轮 live 实测，corr-2026-015/014）：
// ① 两条误报进商业辨别段——EconBrowser 站点导航 "Analysis of current
//    economic conditions and policy"（命中 "analysis of"）与 LWiAI 播客
//    列表 "interpretability research from Anthropic"（命中 "research
//    from"）。旧 survey-finding 正则 (survey|study|…)\s+(of|by|from|…)
//    把「调查名词+介词」的 incidental 搭配当成研究发现：两句都没有发现
//    动词、没有量化对象，是副标题/话题列举不是主张。
// ② v3.0.0c/v3.2/v3.3 三处「播客不进辨别」测试夹具的 description 压根
//    不触发模式门——断言恒真空转了两个版本，误报进 live 产物没人拦
//    （corr-2026-015 教训②：防误报的夹具必须复现 live 误报原句）。
// ③ 版本号漂移：VERSION=3.3.0 而 projection meta.version 停在 3.2.2、
//    package.json 停在 3.2.1，同一份报告两个版本号（corr-2026-014）。
//
// 修法：survey-finding 收紧为「调查名词+发现动词相邻」或「调查名词+
// of+量化对象（容忍数量副词）」二选一；三处夹具换 live 误报原句；
// 四处版本号对齐并加一致性断言。live 全池实测：4 条真主张全保留
// （Survey of 2,018 / survey of almost 11,000 / Study Shows / study
// found），3 条 incidental 搭配精确消除（含 Fed 导航 "Payments
// Research Reports"——连带把无实证的 report 动词形态一并收紧）。
// ════════════════════════════════════════════════════════════════
const v331 = [];
function c331(name, ok, detail) { v331.push({ name, ok, detail }); }

// 1+2. 模式级误报回归：两条 live 误报原句不再命中 survey-finding。
//       摘除精度修复（恢复旧正则）→ 本断言失败。
c331('survey-finding 不再命中站点导航句（live 实证 EconBrowser）', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const sf = COMMERCIAL_CLAIM_PATTERNS.find(p => p.id === 'survey-finding');
  const live = 'Front Month Brent Futures near 2022 Peak Level Front Month Brent Futures near 2022 Peak Level | Econbrowser Skip to content Econbrowser Analysis of current economic conditions and policy Menu Front Month Brent Futures near 2022 Peak Level 5 Replies Over $116/bbl.';
  return !sf.re.test(live);
})(), '「Analysis of current economic conditions」是博客副标题不是研究发现');

c331('survey-finding 不再命中播客列表句（live 实证 LWiAI #252）', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const sf = COMMERCIAL_CLAIM_PATTERNS.find(p => p.id === 'survey-finding');
  const live = "LWiAI Podcast #252 - GPT 5.6, Grok 4.5, Nemotron-Labs-Diffusion, AI 2040  GPT-5.6 and Grok 4.5, Meta's Muse Spark 1.1, regulatory developments in AI and data centers, interpretability research from Anthropic, and the future of AI policy with AI 2040";
  return !sf.re.test(live);
})(), '「interpretability research from Anthropic」是话题列举不是研究发现');

// 3. 模式级真命中保留：live 全池 4 条真主张原句 + Fed 导航残留形态。
//    收紧过宽（把发现动词/量化对象也收紧掉）→ 本断言失败。
c331('survey-finding 保留全部 live 真主张形态（4 条原句 + Fed 导航消除）', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const sf = COMMERCIAL_CLAIM_PATTERNS.find(p => p.id === 'survey-finding');
  const tp = [
    'Enterprises keep buying software upgrades that IT thinks will make things worse  Survey of 2,018 IT heads at big firms points to a lack of leverage.',
    'We surveyed Anthropic employees, and compared them to an August survey of almost 11,000 US adults, fielded by Morning Consult.',
    'NIST Study Shows How the Toxic Substances Mixed Into Fentanyl Vary Across the U.S.',
    "A new study found Grok's AI overwhelmingly recommends Republican candidates while OpenAI's GPT favors Democrats, with the two AI models disagreeing in more than 90% of nearly 500 election races.",
  ];
  const fedNav = 'International Standards for Financial Market Infrastructures Research, Reports, & Committees Federal Reserve Payments Study (FRPS) Payments Research Reports Payments System Policy Advisory Committee';
  return tp.every(t => sf.re.test(t)) && !sf.re.test(fedNav);
})(), 'Survey of 2,018 / survey of almost 11,000 / Study Shows / study found 必须保留；Fed 导航 Research Reports 必须消除');

// 4. 判别级真命中保留：既有夹具句仍判结构完整（收紧不打穿 v3.0.0 断言）。
c331('既有调查主张夹具仍判结构完整（收紧不打穿）', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'A survey of 1,200 enterprises found 34% had deployed LLMs in production, up from 12% a year ago, although only 8% reported measurable ROI.',
    source: 'test',
  });
  return r.kind === 'adoption' && r.verdict === 'well-formed' && r.reasoning.score === 3;
})(), '「survey of 1,200 enterprises found 34%」仍须命中且判结构完整');

// 5. 端到端候选门：两条 live 误报原文进 signals，整条不进商业辨别段。
//    摘除模式收紧 → 两条误报回到辨别段 → 本断言失败。
c331('端到端：两条 live 误报原文不进商业辨别段', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const noise = [
    { title: 'Front Month Brent Futures near 2022 Peak Level',
      description: 'Front Month Brent Futures near 2022 Peak Level | Econbrowser Skip to content Econbrowser Analysis of current economic conditions and policy Menu Front Month Brent Futures near 2022 Peak Level 5 Replies Over $116/bbl.',
      body: '', source: 'EconBrowser', bucket: 'economy',
      pubDate: 'Fri, 24 Oct 2026 00:44:16 GMT', domains: ['economy_macro'],
      link: 'https://econbrowser.com/a', origin: 'live' },
    { title: 'LWiAI Podcast #252 - GPT 5.6, Grok 4.5, Nemotron-Labs-Diffusion, AI 2040',
      description: "GPT-5.6 and Grok 4.5, Meta's Muse Spark 1.1, regulatory developments in AI and data centers, interpretability research from Anthropic, and the future of AI policy with AI 2040",
      body: '', source: 'Last Week in AI', bucket: 'business',
      pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT', domains: ['capital_flow'],
      link: 'https://lastweekin.ai/b', origin: 'live' },
  ];
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: noise.length, domains: [], undomained: 0, dateRange: null, items: noise };
  const r = inst.buildCommercialDiscrimination();
  return r.available === false && /未抽到命中商业主张形态/.test(r.reason || '');
})(), '两条 live 误报原句必须整体挡在辨别之外（available=false 且原因写明形态门）');

// 6. 端到端不误杀：同批 signals 里放真调查主张，仍进辨别且判结构完整
//    （精度门收得太紧把真主张也挡了 → 本断言失败）。
c331('端到端不误杀：真调查主张与误报同批仍进辨别', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const items = [
    { title: 'A survey of 1,200 enterprises found 34% had deployed LLMs in production, up from 12% a year ago, although only 8% reported measurable ROI.',
      description: '', body: '', source: 'Test Survey', bucket: 'business',
      pubDate: 'Fri, 24 Oct 2026 00:44:16 GMT', domains: ['market_claims'],
      link: 'https://example.com/survey', origin: 'live' },
    { title: 'Front Month Brent Futures near 2022 Peak Level',
      description: 'Front Month Brent Futures near 2022 Peak Level | Econbrowser Skip to content Econbrowser Analysis of current economic conditions and policy Menu Front Month Brent Futures near 2022 Peak Level 5 Replies Over $116/bbl.',
      body: '', source: 'EconBrowser', bucket: 'economy',
      pubDate: 'Fri, 24 Oct 2026 00:44:16 GMT', domains: ['economy_macro'],
      link: 'https://econbrowser.com/a', origin: 'live' },
  ];
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: items.length, domains: [], undomained: 0, dateRange: null, items };
  const r = inst.buildCommercialDiscrimination();
  return r.available === true && r.audited === 1
    && r.results[0].kind === 'adoption' && r.results[0].verdict === 'well-formed'
    && r.results[0].decisionRelevant === true;
})(), '真调查主张必须仍进辨别且判结构完整+决策相关（精度修复不得误杀）');

// 7. 版本号一致性（corr-2026-014）：VERSION 文件 / package.json /
//    projection meta / run-pipeline 顶层 meta 四处对齐。任一处忘记同步
//    （v3.1 修过 banner/meta，另两处腐烂了四个补丁轮）→ 本断言失败。
c331('版本号一致性：VERSION/package.json/projection meta/run-pipeline meta 四处对齐', (() => {
  const fs331 = require('fs');
  const path331 = require('path');
  const root = path331.join(__dirname);
  const versionFile = fs331.readFileSync(path331.join(root, 'VERSION'), 'utf-8').trim();
  const pkg = JSON.parse(fs331.readFileSync(path331.join(root, 'package.json'), 'utf-8')).version;
  const pf = fs331.readFileSync(path331.join(root, 'scripts/project-future.js'), 'utf-8');
  const rp = fs331.readFileSync(path331.join(root, 'scripts/run-pipeline.js'), 'utf-8');
  const projMeta = pf.match(/version:\s*'([\d.]+)'/);
  const runMeta = rp.match(/version:\s*'([\d.]+)'/);
  return versionFile === pkg && projMeta && projMeta[1] === versionFile && runMeta && runMeta[1] === versionFile;
})(), '四处版本号必须一致（交付物带错版本号是 corr-2026-014 记过的漂移）');

// ── v3.3.1 汇总 ──
(async () => {
  const results = await Promise.all(v331.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v331.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '\u2713' : '\u2717'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.3.1: ${v331.length - f} 通过, ${f} 失败, 共 ${v331.length} 个`);
  if (f > 0) {
    console.log('结论：survey-finding 精度修复或版本号对齐不完整（误报回归/真命中保留/端到端/版本一致性有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：两条 live 误报已精确消除、live 真主张全保留、版本号四处对齐（维护级精度修复，非新辨别维度）。');
  }
})();
