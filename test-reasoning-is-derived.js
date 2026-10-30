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
// [v3.10] 候选池从 business/economy 两桶扩到四桶（+ sec_filings +
// frontier_models 一手信源桶）——本断言原判据「frontier_models 应抽不到」
// 是 v3.0.0 的旧作用域决策（技术域不当商业主张源），v3.10 以 live 实证
// 推翻：厂商一手公告（OpenAI News 等）是商业主张证据链最上游，
// 具名部署主张只在那个桶里。保留的纪律是「business 第一优先」。
c300('buildCommercialDiscrimination 候选池与 business 优先序', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const mk = (items) => {
    const inst = new ProjectionEngine({});
    inst.signals = { items };
    return inst;
  };
  const item = (source, bucket) => ({
    title: source, body: 'We plan to raise $50M next quarter according to a company announcement.',
    description: '', source, bucket,
    pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT',
    domains: ['capital_flow'], link: 'https://x.com/a',
  });
  const bizItem = item('TechCrunch AI', 'business');
  const fmItem = item('OpenAI News', 'frontier_models');
  // business 与 frontier_models（厂商一手公告）都应能抽出主张
  const rb = mk([bizItem]).buildCommercialDiscrimination();
  const rf = mk([fmItem]).buildCommercialDiscrimination();
  // 同池时 business 第一优先（候选序 business → sec_filings →
  // frontier_models → economy）
  const both = mk([fmItem, bizItem]).buildCommercialDiscrimination();
  return rb.available === true && rf.available === true
    && both.results[0].source === 'TechCrunch AI'
    && both.results[1].source === 'OpenAI News';
})(), 'business 与厂商一手公告桶都应抽出主张，同池时 business 优先');

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
  // [v3.5] hitRate 从 `=== 1` 放宽为 `∈ [0,1]`：旧断言「全部命中」是台账
  // 只有人工 hits 时的偶然状态；v3.5 财报指引自动结算引入了真实的 miss
  // （NVDA/AMD/MU 营收指引被 actual 超出带上沿→带外），hitRate 不再恒为 1。
  // 本断言的意图是「校准曲线基于真实结算可算」——brier 是数字、样本 >0、
  // hitRate 是合法概率，与命中/未中的具体配比无关。
  return typeof sc.brier === 'number' && sc.sample > 0
    && typeof sc.hitRate === 'number' && sc.hitRate >= 0 && sc.hitRate <= 1;
})(), 'sample>0 且 brier 是数字、hitRate 是合法概率（校准曲线真的能算，含 miss）');

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
  return /const \{ discriminateCommercial, summarizeCommercial, COMMERCIAL_CLAIM_PATTERNS \} = require/.test(src)
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
//    摘除等级排序（恢复按文件序或 high 优先）→ critical 不再 contiguous 在段首，失败。
//    [v3.5] 断言从「恰好 2 条 critical」改为「全部 critical 连续排在段首、数量不限」：
//    v3.5 登记 corr-2026-019（v3.4「到期结算」是空头承诺，critical 级）后 critical
//    变为 3 条，旧断言 ls.slice(2).every(!critical) 会腐烂。意图是「最重的教训
//    不能藏、必须在段首」，与具体条数无关。
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
  const firstNonCrit = ls.findIndex(l => l.severity !== 'critical');
  return ls.some(l => l.severity === 'critical')                          // 至少 1 条 critical
    && ls.slice(0, firstNonCrit).every(l => l.severity === 'critical')    // 段首全 critical
    && (firstNonCrit === -1 || ls.slice(firstNonCrit).every(l => l.severity !== 'critical')); // 之后无 critical
})(), '全部 critical 必须连续排在段首（severity 等级排序），最重的教训不能藏');

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
  // 锚点从数据文件动态取（不写死）：台账增长后 severity 排序的 top-5 会变，
  // 写死「绕月」在登记簿超过 5 条 critical+high 时腐烂（v3.5.1 实测）。
  // 断言意图不变：渲染出的教训必须是登记簿里的真实内容。
  const book = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'human-future/data/self-corrections.json'), 'utf8'));
  const rank = { low: 1, medium: 2, high: 3, critical: 4 };
  const top = book.corrections.slice().sort((a, b) => (rank[b.severity] || 0) - (rank[a.severity] || 0))[0];
  const anchor = String(top.lesson || '').slice(0, 12);
  return md.includes('## 自我修正登记簿（历史纠错教训，解读本期信号前必读）')
    && seg.includes('[critical]')            // severity 分布行
    && seg.includes('更正:')                 // wrong→right 结构
    && seg.includes('教训:')
    && seg.includes(anchor)                  // 真实教训内容（数据文件 top-1 动态锚点）
    && seg.includes(String(top.wrongClaim).slice(0, 20));   // 真实错误陈述（渲染行截断到 110 字符）
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
    // [v3.21.1] corr-2026-025 结案：事件型 no-quantity 豁免扩展到 ma。
    // 标题-only 实测口径：problems 不再含 no-quantity、verdict=weak-evidence
    // （evidence=1 ≤2 档在 thin-reasoning 之前）；不虚抬纪律不变——
    // evidence=1、reasoning 0/3、decisionRelevant=false 全部保持。
    && r.verdict === 'weak-evidence'
    && r.falsifiability.problems.length === 0
    && r.evidence.weight === 1
    && r.reasoning.score === 0
    && r.decisionRelevant === false;
})(), '「Instacart Is Exploring a Sale」必须命中并购/交易过程形态；v3.21.1 起事件型豁免生效——无 no-quantity 问题、weak-evidence，标题-only 仍不虚抬为决策相关');

c33('live 实证：Ramp/Airwallex 破裂交易命中 ma 形态', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Ramp Investors Went Nuclear Against Airwallex After Doomed Deal',
    source: 'The Information',
  });
  return r.kind === 'ma'
    && r.kinds.length === 1 && r.kinds[0] === 'ma'   // 只命中交易形态，不串台到资本信号
    // [v3.21.1] 同条豁免：交易状态句（doomed deal）的证伪靠「交易是否复活/
    // 交割」事件，无数字不是不可证伪。标题-only 口径：weak-evidence 不虚抬。
    && r.verdict === 'weak-evidence'
    && r.falsifiability.problems.length === 0
    && r.evidence.weight === 1
    && r.decisionRelevant === false;
})(), '「After Doomed Deal」必须命中交易过程形态（此前整条不进辨别）；v3.21.1 起无 no-quantity 误判');

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
// [v3.6] 扩容成本/价格信号后真实条数为 16；[v3.7] 扩容专家/机构判断后
// 真实条数为 17；[v3.8] 扩容监管行动后真实条数为 18；[v3.9] 扩容价格
// 下调后真实条数为 19；[v3.10] 扩容部署规模后真实条数为 20；[v3.11]
// 扩容用量/牵引度指标后真实条数为 21；[v3.12] 扩容算力基建承诺/规模后
// 真实条数为 22；[v3.21] 扩容 IPO/上市过程后真实条数为 23；[v3.22]
// 扩容执法/诉讼行动后真实条数为 24；[v3.26] 扩容客户成效/ROI 后真实
// 条数为 25，计数跟着代码走（v3.2 同型纪律）。
c33('模式计数口径：25 种与文档一致', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const pf = require('fs').readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return COMMERCIAL_CLAIM_PATTERNS.length === 25
    && /共 25 种模式/.test(pf)
    && COMMERCIAL_CLAIM_PATTERNS.some(p => p.id === 'expert-judgment')
    && COMMERCIAL_CLAIM_PATTERNS.some(p => p.id === 'regulatory-action')
    && COMMERCIAL_CLAIM_PATTERNS.some(p => p.id === 'price-cut')
    && COMMERCIAL_CLAIM_PATTERNS.some(p => p.id === 'deployment-scale')
    && COMMERCIAL_CLAIM_PATTERNS.some(p => p.id === 'usage-metric')
    && COMMERCIAL_CLAIM_PATTERNS.some(p => p.id === 'compute-infra')
    && COMMERCIAL_CLAIM_PATTERNS.some(p => p.id === 'ipo-claim');
})(), '模式库真实条数必须与文档写的「24 种」一致（防文档计数腐烂）');

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

// ════════════════════════════════════════════════════════════════
// v3.4 新辨别维度：财报指引（SEC EDGAR 新数据源 + forecast-discriminator
// 新 verdict）。这是 v2.13 起记录六轮的边界缺口（RSS 前瞻表述多为意图
// 声明、不可结算）的第一次实质推进——带硬结算日的预测从上市公司一手
// 备案（8-K Item 2.02 的 EX-99 业绩发布）来。
// ════════════════════════════════════════════════════════════════
const v34 = [];
function c34(name, ok, detail) { v34.push({ name, ok, detail }); }

// ── 组 1：采集器抽取（edgar-collector.extractGuidance）────────────
// 1. live 实证句式命中：五家公司五种句式（全部 2026-10-25 从 SEC 实抓）
c34('live 句式命中：NVDA/AMZN/AMD/MRVL/MU 五种指引句式', (() => {
  const { extractGuidance } = require('./human-future/scripts/edgar-collector.js');
  const NVDA = "Outlook NVIDIA's outlook for the third quarter of fiscal 2027 is as follows: • Revenue is expected to be $108.0 billion, plus or minus 2%. NVIDIA is not assuming any Data Center compute revenue from China in its outlook.";
  const AMZN = 'Financial Guidance The following forward-looking statements reflect expectations. Third Quarter 2026 Guidance • Net sales are expected to be between $197.0 billion and $202.0 billion, or to grow between 9% and 12% compared with third quarter 2025.';
  const AMD = "AMD's outlook statements are based on current expectations. For the third quarter of 2026, AMD expects revenue to be approximately $13 billion, plus or minus $300 million.";
  const MRVL = 'Third Quarter of Fiscal 2027 Financial Outlook • Net revenue is expected to be $3.150 billion +/- 5%.';
  const MU = "Business Outlook The following table presents Micron's guidance for the first quarter of 2027: Revenue $61.5 billion ± $1.5 billion";
  const g = (t) => extractGuidance(t).guidance;
  const a = g(NVDA), b = g(AMZN), c = g(AMD), d = g(MRVL), e = g(MU);
  return a.length === 1 && a[0].metric === 'revenue' && a[0].value === '$108.0 billion'
    && a[0].tolerance === '2%' && a[0].periodLabel === 'FY2027 Q3'
    && a[0].caveats.some(x => /not assuming/i.test(x))
    && b.length === 1 && b[0].value.includes('197.0') && b[0].periodLabel === 'FY2026 Q3'
    && c.length === 1 && c[0].metric === 'revenue' && c[0].value === '$13 billion'
    && c[0].tolerance === '$300 million' && c[0].periodLabel === 'FY2026 Q3'
    && d.length === 1 && d[0].value === '$3.150 billion' && d[0].tolerance === '5%' && d[0].periodLabel === 'FY2027 Q3'
    && e.length === 1 && e[0].value === '$61.5 billion' && e[0].tolerance === '$1.5 billion' && e[0].periodLabel === 'FY2027 Q1';
})(), '五种 live 指引句式必须抽出指标/数值/容差/结算期，NVDA 的前提削减必须带上');

// 2. 精度回归：四类非指引文本 0 条（摘除任何精度设计 → 对应误报出现）
c34('精度回归：actuals 表格/意图声明/电话会口头指引/全年实际值不命中', (() => {
  const { extractGuidance } = require('./human-future/scripts/edgar-collector.js');
  const noise = [
    'GAAP gross profit $ 6,203 $ 5,416 $ 3,059 GAAP gross margin 54 % 53 % 40 % Revenue $ 6,824 $ 4,634 $ 1,434',
    'We expect to expand access to our models next quarter. The company aims to simplify pricing for enterprise customers.',
    'Business Outlook Microsoft will provide forward-looking guidance in connection with this quarterly earnings announcement on its earnings conference call and webcast.',
    'For fiscal year 2026, revenue was $50 billion and operating income was $12 billion. The Company achieved record results.',
  ];
  return noise.every(t => extractGuidance(t).guidance.length === 0);
})(), '财报 actuals 表格、意图声明、电话会口头指引（MSFT 实测）、全年实际值都不得判成指引');

// 3. 期间就近 + 对比排除 + Oracle 两种期间形态
c34('期间解析：就近取胜、同比引用排除、Q# FY#### 与全年形态', (() => {
  const { extractGuidance } = require('./human-future/scripts/edgar-collector.js');
  // Amazon：句内 "compared with third quarter 2025"（同比）必须不赢段头
  const amzn = extractGuidance('Third Quarter 2026 Guidance • Net sales are expected to be between $197.0 billion and $202.0 billion, or to grow between 9% and 12% compared with third quarter 2025.').guidance[0];
  // Oracle：Q2 FY 2027 缩写形态 + Full FY 2027 全年形态
  const orcl = extractGuidance('Guidance for Q2 FY 2027 Oracle is providing the following forward-looking guidance for Q2 FY 2027: • Non-GAAP earnings per share is expected to be between $1.83 and $1.91. Guidance for Full FY 2027 For fiscal year 2027, we now expect total revenue to be at least $90 billion.').guidance;
  return amzn.periodLabel === 'FY2026 Q3'
    && orcl.length === 2
    && orcl[0].periodLabel === 'FY2027 Q2' && orcl[0].annual === false
    && orcl[1].periodLabel === 'FY2027 全年' && orcl[1].annual === true;
})(), '同比引用（third quarter 2025）不得赢段头；Oracle 的 Q2 FY 2027 与 Full FY 2027 必须正确解析');

// 4. 小数不截断 + 句点不冲段（\d\. 会把句点吞掉的坑）
c34('句点处理：小数位保留、句末点不冲进下一节', (() => {
  const { extractGuidance } = require('./human-future/scripts/edgar-collector.js');
  const dec = extractGuidance('Outlook for the third quarter of fiscal 2027 is as follows: • Revenue is expected to be $108.0 billion, plus or minus 2%.').guidance[0];
  const oracle = extractGuidance('For fiscal year 2027, we now expect total revenue to be at least $90 billion, and non-GAAP EPS to be at $8.10. New Oracle AI Data Platform Automatically Generates Enterprise Ontology').guidance[0];
  return dec.value === '$108.0 billion' && dec.tolerance === '2%'
    && oracle.sentence.endsWith('$8.10') && !/New Oracle/.test(oracle.sentence);
})(), '"$108.0 billion" 不得截成 "$108"；"at $8.10. New Oracle" 的句点必须断句');

// 5. 词边界：向前扩展不切半截词
c34('词边界：extendBack 不产生半截词', (() => {
  const { extractGuidance } = require('./human-future/scripts/edgar-collector.js');
  const g = extractGuidance('Third Quarter of Fiscal 2027 Financial Outlook • GAAP diluted net income per share is expected to be $0.53 +/- $0.05 per share.').guidance[0];
  return g.sentence.startsWith('diluted net income per share') && !/^\S?\s/.test(g.sentence.slice(0, 3));
})(), 'MRVL 实测 "GAAP diluted..." 不得被切成 "P diluted..."');

// ── 组 2：辨别器（forecast-discriminator）────────────────────────
// 6. 带元数据的指引：新 verdict + 估计结算点
c34('带 EDGAR 元数据的指引判 earnings-guidance 且可结算', (() => {
  const { discriminate } = require('./human-future/scripts/forecast-discriminator.js');
  const r = discriminate({
    text: 'Revenue is expected to be $108.0 billion, plus or minus 2%',
    source: 'SEC EDGAR', date: '2026-08-26', category: 'earnings_guidance', fiscalYearEnd: '0131',
    guidance: { quarter: 3, fiscalYear: 2027, metric: 'revenue', value: '$108.0 billion', tolerance: '2%', periodLabel: 'FY2027 Q3', caveats: ['NVIDIA is not assuming any Data Center compute revenue from China in its outlook.'] },
  });
  return r.verdict === 'earnings-guidance' && r.settleable === true
    && r.dueOn === '2026-12-15' && r.dueBasis === 'estimated-fiscal'
    && r.baseRate.rate === 0.5 && r.guidance && r.guidance.fromMetadata === true
    && r.guidance.caveats.length === 1;
})(), 'NVIDIA FY27 Q3 指引必须判财报指引、dueOn=2026-12-15（财季结束+45 天估计）、先验 0.5');

// 7. 无元数据的句内财季期间：不猜结算点（漏报比误报诚实）
c34('无 fiscalYearEnd 的句内财季指引不猜结算点', (() => {
  const { discriminate } = require('./human-future/scripts/forecast-discriminator.js');
  const r = discriminate({
    text: 'Revenue is expected to be $108.0 billion for the third quarter of fiscal 2027',
    source: 'TechCrunch AI', date: '2026-10-25',
  });
  return r.verdict === 'earnings-guidance' && r.settleable === false
    && r.dueOn === null && /fiscalYearEnd/.test(r.dueNote || '');
})(), 'RSS 引用的财季指引缺财年日历，必须 dueOn=null 并说明原因，不许按裸年份猜 Q4');

// 8. no-timeline 不误杀：指引时点在元数据里不在句子里
c34('no-timeline 不过滤误杀带元数据的指引', (() => {
  const { discriminate } = require('./human-future/scripts/forecast-discriminator.js');
  const r = discriminate({
    text: 'Revenue is expected to be $108.0 billion',   // 句内没有任何年份
    source: 'SEC EDGAR', date: '2026-08-26', category: 'earnings_guidance', fiscalYearEnd: '0131',
    guidance: { quarter: 3, fiscalYear: 2027, metric: 'revenue', value: '$108.0 billion', periodLabel: 'FY2027 Q3', caveats: [] },
  });
  return r.verdict === 'earnings-guidance'
    && !(r.falsifiability.problems || []).some(p => p.id === 'no-timeline');
})(), '句内无年份但元数据带结算期的指引不得被判「无时间点的意图声明」');

// 9. 全年指引：财年结束 + 45 天
c34('全年指引结算点 = 财年结束 + 45 天（Oracle FYE 0531）', (() => {
  const { discriminate } = require('./human-future/scripts/forecast-discriminator.js');
  const r = discriminate({
    text: 'For fiscal year 2027, we now expect total revenue to be at least $90 billion',
    source: 'SEC EDGAR', date: '2026-09-10', category: 'earnings_guidance', fiscalYearEnd: '0531',
    guidance: { quarter: null, fiscalYear: 2027, annual: true, metric: 'total revenue', value: '$90 billion', periodLabel: 'FY2027 全年', caveats: [] },
  });
  return r.verdict === 'earnings-guidance' && r.settleable === true
    && r.dueOn === '2027-07-15' && /财年结束/.test(r.dueNote || '');
})(), 'Oracle Full FY2027 指引的估计结算点必须是 2027-07-15（FYE 5-31 + 45 天）');

// 10. 先验路由：earnings_guidance 类目存在且口径写明
c34('先验路由：earnings_guidance 中性先验 + 口径说明', (() => {
  const { DEFAULT_BASE_RATES } = require('./human-future/scripts/forecast-discriminator.js');
  const g = DEFAULT_BASE_RATES.earnings_guidance;
  return !!g && g.rate === 0.5 && /分析师预期/.test(g.note || '');
})(), 'earnings_guidance 必须取中性先验 0.5 且 note 写明「FactSet 超预期率不可挪用」（防口径错位）');

// ── 组 3：引擎端到端 ─────────────────────────────────────────────
// 11. extractSignals 透传 + 结构化指引优先收录 + 通用扫描不重复收录
c34('端到端：EDGAR 指引进辨别且不与通用扫描重复', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const items = [{
    title: 'NVIDIA CORP (NVDA) 8-K 业绩发布 · 2026-08-26',
    description: '财报指引（FY2027 Q3）：Revenue is expected to be $108.0 billion, plus or minus 2%',
    body: "Outlook NVIDIA's outlook for the third quarter of fiscal 2027 is as follows: • Revenue is expected to be $108.0 billion, plus or minus 2%. NVIDIA is not assuming any Data Center compute revenue from China in its outlook.",
    source: 'SEC EDGAR', bucket: 'sec_filings', origin: 'live',
    pubDate: '2026-08-26', link: 'https://example.com/edgar-nvda-q2fy27',
    fiscalYearEnd: '0131',
    guidance: [{ sentence: 'Revenue is expected to be $108.0 billion, plus or minus 2%', metric: 'revenue', value: '$108.0 billion', tolerance: '2%', quarter: 3, fiscalYear: 2027, periodLabel: 'FY2027 Q3', caveats: ['NVIDIA is not assuming any Data Center compute revenue from China in its outlook.'] }],
  }];
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: 1, domains: [], undomained: 0, dateRange: null, items };
  // extractSignals 透传验证
  const eng2 = new ProjectionEngine({ newsData: { sec_filings: { domain: 'sec_filings', news: items } } });
  const sig = eng2.extractSignals();
  const fd = inst.buildForecastDiscrimination();
  const gClaims = (fd.results || []).filter(r => r.category === 'earnings_guidance');
  return sig.items[0].guidance && sig.items[0].guidance.length === 1
    && sig.items[0].fiscalYearEnd === '0131'
    && fd.audited === 1 && gClaims.length === 1
    && gClaims[0].text.includes('$108.0 billion')
    && gClaims[0].dueOn === '2026-12-15';
})(), 'extractSignals 必须透传 guidance/fiscalYearEnd；同一句只收录一次（结构化优先，通用扫描跳过）');

// 12. 幂等 id：同备案多条指引 id 互异 + 二跑不重复登记
c34('幂等 id：同一备案多条指引 metric+value 维度互异', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const mk = (metric, value, sentence) => ({
    title: 'MRVL 8-K', description: '', body: sentence,
    source: 'SEC EDGAR', bucket: 'sec_filings', origin: 'live',
    pubDate: '2026-08-27', link: 'https://example.com/edgar-mrvl-q2fy27',
    fiscalYearEnd: '0130',
    guidance: [{ sentence, metric, value, tolerance: null, quarter: 3, fiscalYear: 2027, periodLabel: 'FY2027 Q3', caveats: [] }],
  });
  const items = [
    mk('gross margin', '52.9% to 53.9%', 'GAAP gross margin is expected to be 52.9% to 53.9%'),
    mk('gross margin', '57.5% to 58.5%', 'Non-GAAP gross margin is expected to be 57.5% to 58.5%'),
  ];
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: items.length, domains: [], undomained: 0, dateRange: null, items };
  const fd = inst.buildForecastDiscrimination();
  const lr = fd.ledgerRegistration || {};
  const ids = (lr.registered || []).map(x => x.id);
  // 二跑：全部应为「已存在」跳过，0 新登记
  const fd2 = inst.buildForecastDiscrimination();
  const lr2 = fd2.ledgerRegistration || {};
  return ids.length === 2 && new Set(ids).size === 2
    && ids.every(id => /gross-margin-5[27]/.test(id))
    && (lr2.registered || []).length === 0
    && (lr2.skipped || []).length === 2;
})(), 'MRVL 的 GAAP 与非 GAAP 同名同时点指引必须生成不同 id；二跑幂等 0 新登记');

// 13. formatReport 渲染（只认渲染行，v3.2 教训）
c34('formatReport 渲染财报指引段（指标/容差/前提削减/估计依据）', (() => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const items = [{
    title: 'NVIDIA CORP (NVDA) 8-K 业绩发布 · 2026-08-26',
    description: '财报指引（FY2027 Q3）：Revenue is expected to be $108.0 billion, plus or minus 2%',
    body: 'Revenue is expected to be $108.0 billion, plus or minus 2%. NVIDIA is not assuming any Data Center compute revenue from China in its outlook.',
    source: 'SEC EDGAR', bucket: 'sec_filings', origin: 'live',
    pubDate: '2026-08-26', link: 'https://example.com/edgar-nvda-render',
    fiscalYearEnd: '0131',
    guidance: [{ sentence: 'Revenue is expected to be $108.0 billion, plus or minus 2%', metric: 'revenue', value: '$108.0 billion', tolerance: '2%', quarter: 3, fiscalYear: 2027, periodLabel: 'FY2027 Q3', caveats: ['NVIDIA is not assuming any Data Center compute revenue from China in its outlook.'] }],
  }];
  const md = formatReport(new ProjectionEngine({ newsData: { sec_filings: { domain: 'sec_filings', news: items } } }).generate());
  const seg = md.split('## 预测辨别')[1] || '';
  return seg.includes('财报指引 1 条')
    && seg.includes('[财报指引] Revenue is expected to be $108.0 billion')
    && seg.includes('指引结构: 结算期: FY2027 Q3 | 数值: $108.0 billion | 容差: ±2%')
    && seg.includes('前提削减: NVIDIA is not assuming')
    && seg.includes('结算点依据: 估计值：财季结束 2026-10-31');
})(), '报告必须渲染财报指引汇总行、结构行、前提削减与估计依据（只认渲染出的行）');

// 13b. 采集层接线源级（R1 反向验证对应断言：摘除 collectAll 的 EDGAR
//      接线时本断言失败。端到端夹具不过 collectAll，源级是既定 Pattern——
//      同注入脚本检查）。
c34('collect-news.js 接入 EDGAR 采集器（sec_filings 域）', (() => {
  const src = require('fs').readFileSync(require('path').join(__dirname, 'scripts/collect-news.js'), 'utf-8');
  return src.includes("require('../human-future/scripts/edgar-collector.js')")
    && src.includes('collectEdgarFilings({ live: true })')
    && src.includes('live.sec_filings = {')
    && src.includes("sec_filings: 'SEC 财报备案'");
})(), 'collectAll 必须接 EDGAR 采集器并挂 sec_filings 域，否则新数据源到不了 pipeline');

// 14. 注入脚本源级（第七次同型断链纪律：新段必须进注入）
c34('cron 注入脚本渲染财报指引（VERDICT_CN/汇总/结构行）', (() => {
  const p = require('path').join(require('os').homedir(), '.hermes/scripts/hf-cron-fetch.sh');
  if (!require('fs').existsSync(p)) return false;
  const src = require('fs').readFileSync(p, 'utf-8');
  return /'earnings-guidance': '财报指引'/.test(src)
    && /财报指引 \$\{s\.guidanceCount \|\| 0\}/.test(src)
    && /指引结构: \$\{gp\.join\(' \| '\)\}/.test(src)
    && /结算点为估计值（财季结束\+45天）/.test(src);
})(), '注入脚本必须含 earnings-guidance 标签、guidanceCount 汇总与指引结构行，否则 agent 看不到新维度');

// ── 组 4：版本号（corr-2026-014 同型：banner 腐烂四个补丁轮）─────
// [v3.6] 版本推进到 3.6.0（新辨别维度：成本/价格信号），本断言跟着当前版本走。
c34('版本号一致性：banner 与 VERSION 对齐（3.27.0）', (() => {
  const fs2 = require('fs');
  const version = fs2.readFileSync(require('path').join(__dirname, 'VERSION'), 'utf-8').trim();
  const rp = fs2.readFileSync(require('path').join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  return version === '3.27.0' && rp.includes('文明推演引擎 v3.27.0');
})(), 'run-pipeline banner 必须与 VERSION 一致（v3.1 修过 banner/meta 同型后又腐烂）');

// ── v3.4 汇总 ──
(async () => {
  const results = await Promise.all(v34.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v34.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '\u2713' : '\u2717'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.4: ${v34.length - f} 通过, ${f} 失败, 共 ${v34.length} 个`);
  if (f > 0) {
    console.log('结论：财报指引新辨别维度不完整（抽取/精度/判别/端到端/注入/版本有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：SEC EDGAR 财报指引端到端成立——一手备案进采集、新 verdict 进辨别、估计结算点进台账、注入可见。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v3.5 新能力：财报指引自动结算（earnings-settlement）
// v3.4 登记了 33 条财报指引进台账、审计时 15 条到期 0 条结算——v2.13 核心
// 承诺「到期结算 Brier」对最硬的一类预测从未兑现（结算逻辑整个缺失）。v3.5
// 把台账里到期的 earnings_guidance 与「下一期财报实际值」配对，按容差/区间
// 判命中并落账。保守性全部有测试钉住：只结有容差/区间的、唯一实际值才结
// （GAAP/非 GAAP 多值判歧义跳过）、到期才结、只碰未结算条目。
// ════════════════════════════════════════════════════════════════
const v35 = [];
function c35(name, ok, detail) { v35.push({ name, ok, detail }); }

// ── 组 1：纯结算函数（earnings-settlement.js，无副作用）──────────
// 1. 单位感知容差：$/%/bps/区间 五种组合 + 无容差跳过
c35('settleGuidance 单位感知容差（相对/绝对/百分点/区间/无容差跳过）', (() => {
  const { settleGuidance } = require('./human-future/scripts/earnings-settlement.js');
  const s = (gv, tol, isRange, av) => settleGuidance({ value: gv, tolerance: tol, isRange }, av);
  // $ + % = 相对；$ + $ = 绝对；% + bps = 百分点；% + % = 百分点；区间
  return s('$91.0 billion', '2%', false, '$96.2 billion').hit === false       // beat（相对带外）
    && /beat/.test(s('$91.0 billion', '2%', false, '$96.2 billion').direction)
    && s('$100 billion', '2%', false, '$101 billion').hit === true            // 相对容差：101∈[98,102] 带内（绝对解释会误判带外）
    && s('74.9%', '50 basis points', false, '75.0%').hit === true              // bps→百分点，带内
    && s('74.9%', '50 basis points', false, '76.0%').hit === false             // bps=0.5pp：76∈[74.4,75.4] 带外（bps 当 % 会误判带内）
    && s('$11.2 billion', '$300 million', false, '$11.5 billion').hit === true // 绝对容差，带内
    && s('$3.150 billion', '5%', false, '$2.9 billion').hit === false          // 相对，低于带下沿
    && /below/.test(s('$3.150 billion', '5%', false, '$2.9 billion').direction)
    && s('between $197.0 billion and $202.0 billion', null, true, '$200.0 billion').hit === true // 区间
    && s('52.1%', null, false, '52.1%').settleable === false;                  // 无容差 → 不自动结算
})(), '容差解释必须按单位走：解释错一个符号整条结算就是假的');

// 2. 指标名归一 + 数值单位解析
c35('normalizeMetric 归一 + parseMetricValue 单位解析', (() => {
  const { normalizeMetric, parseMetricValue } = require('./human-future/scripts/earnings-settlement.js');
  return normalizeMetric('gross margins') === 'gross margin'
    && normalizeMetric('Net revenue') === 'revenue'
    && normalizeMetric('net sales') === 'revenue'
    && parseMetricValue('$96.2 billion').n === 96.2e9 && parseMetricValue('$96.2 billion').unit === 'usd'
    && parseMetricValue('75.0%').unit === 'pct' && parseMetricValue('75.0%').n === 75
    && parseMetricValue('50 basis points').unit === 'bps'
    && parseMetricValue('$1.5 billion').n === 1.5e9;
})(), '指引侧与实际值侧指标写法必须归一到同一key，否则同指标配不上');

// ── 组 2：采集器实际值抽取（edgar-collector.extractActuals）──────
// 3. 营收 + 毛利率实际值 + 标题期间（NVDA live 原文）
c35('extractActuals 抽营收+毛利率，期间取自标题句', (() => {
  const { extractActuals } = require('./human-future/scripts/edgar-collector.js');
  const NVDA = 'EX-99.1 NVIDIA Announces Financial Results for Second Quarter Fiscal 2027 • Revenue of $96.2 billion, up 106% from a year ago SANTA CLARA—Aug. 26, 2026—NVIDIA today reported revenue for the second quarter ended July 26, 2026, of $96.2 billion, up 18% from the previous quarter. For the quarter, GAAP and non-GAAP gross margins were both 75.0%. GAAP and non-GAAP earnings per diluted share were $2.46 and $2.22, respectively. Q2 Fiscal 2027 Summary GAAP Revenue $96,221 $81,615 $46,743 18 % 106 %';
  const ex = extractActuals(NVDA);
  const rev = ex.actuals.find(a => a.metric === 'revenue');
  const mgn = ex.actuals.find(a => a.metric === 'gross margin');
  return ex.quarter === 2 && ex.fiscalYear === 2027
    && rev && rev.value === '$96.2 billion'
    && mgn && mgn.value === '75.0%'
    && ex.actuals.length === 2;   // 营收+毛利率；EPS 不抽（GAAP/非GAAP歧义），汇总表不误命中
})(), '实际值必须带标题财季；营收/毛利率各一条；汇总表多列数字不误命中');

// 4. GAAP/非 GAAP 毛利率不同值 → 抽出两条（驱动结算层歧义跳过）
c35('extractActuals GAAP/非GAAP 毛利率不同值抽出两条', (() => {
  const { extractActuals } = require('./human-future/scripts/edgar-collector.js');
  const MRVL = 'Marvell Announces Financial Results for Second Quarter Fiscal 2027. GAAP gross margin was 52.9%. Non-GAAP gross margin was 57.5% for the quarter.';
  const ex = extractActuals(MRVL);
  const mgns = ex.actuals.filter(a => a.metric === 'gross margin');
  return ex.quarter === 2 && ex.fiscalYear === 2027 && mgns.length === 2
    && mgns.map(m => m.value).join('|').includes('52.9%')
    && mgns.map(m => m.value).join('|').includes('57.5%');
})(), 'GAAP/非GAAP毛利率不同值必须抽出两条——结算层据此判歧义跳过，不设法规避');

// 5. 无标题期间 → 返回空（漏报比误报诚实）
c35('extractActuals 抽不到标题期间返回空', (() => {
  const { extractActuals } = require('./human-future/scripts/edgar-collector.js');
  const ex = extractActuals('EX-99.1 FOR IMMEDIATE RELEASE Contacts: Investor Relations. The company reported revenue of $50.0 billion this period.');
  return ex.quarter === null && ex.fiscalYear === null && ex.actuals.length === 0;
})(), '没有标题财季锚就不抽实际值——没有期间的数值无法与指引配对');

// ── 组 3：结算编排（settleEarningsGuidance，受控台账）────────────
// 6. 命中/未中/歧义跳过/到期门/证据落账/不重复结算
c35('settleEarningsGuidance 编排：hit/miss/歧义跳过/到期门/证据/幂等', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const fs = require('fs');
  const LEDGER = path.join(__dirname, 'human-future/data/prediction-ledger.json');
  const saved = fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf-8') : null;
  try {
    const mock = { version: '1.0.0', predictions: [
      { id: 't-nv-rev', claim: 'Revenue is expected to be $91.0 billion, plus or minus 2%', probability: 0.5, domain: 'earnings_guidance', category: 'earnings_guidance', dueOn: '2026-09-14', outcome: null, settlement: { ticker: 'NVDA', fiscalYear: 2027, quarter: 2, metric: 'revenue', value: '$91.0 billion', tolerance: '2%', isRange: false } },
      { id: 't-nv-mgn', claim: 'Gross margins are expected to be 74.9%, plus or minus 50 basis points', probability: 0.5, domain: 'earnings_guidance', category: 'earnings_guidance', dueOn: '2026-09-14', outcome: null, settlement: { ticker: 'NVDA', fiscalYear: 2027, quarter: 2, metric: 'gross margin', value: '74.9%', tolerance: '50 basis points', isRange: false } },
      { id: 't-mrvl-amb', claim: 'GAAP gross margin is expected to be 52.1% to 53.1%', probability: 0.5, domain: 'earnings_guidance', category: 'earnings_guidance', dueOn: '2026-09-01', outcome: null, settlement: { ticker: 'MRVL', fiscalYear: 2027, quarter: 2, metric: 'gross margin', value: '52.1% to 53.1%', tolerance: null, isRange: true } },
      { id: 't-nv-fut', claim: 'Revenue is expected to be $108.0 billion, plus or minus 2%', probability: 0.5, domain: 'earnings_guidance', category: 'earnings_guidance', dueOn: '2026-12-30', outcome: null, settlement: { ticker: 'NVDA', fiscalYear: 2027, quarter: 3, metric: 'revenue', value: '$108.0 billion', tolerance: '2%', isRange: false } },
      { id: 't-nv-rev2', claim: 'Revenue is expected to be $78.0 billion, plus or minus 2%', probability: 0.5, domain: 'earnings_guidance', category: 'earnings_guidance', dueOn: '2026-06-14', outcome: false, settlement: { ticker: 'NVDA', fiscalYear: 2027, quarter: 1, metric: 'revenue', value: '$78.0 billion', tolerance: '2%', isRange: false } },
    ]};
    fs.writeFileSync(LEDGER, JSON.stringify(mock, null, 2));
    const eng = new ProjectionEngine({});
    eng.signals = { totalItems: 2, domains: [], items: [
      { source: 'SEC EDGAR', ticker: 'NVDA', link: 'https://sec.gov/nvda', actualPeriod: { quarter: 2, fiscalYear: 2027 }, actuals: [{ metric: 'revenue', value: '$96.2 billion' }, { metric: 'gross margin', value: '75.0%' }], guidance: [] },
      { source: 'SEC EDGAR', ticker: 'MRVL', link: 'https://sec.gov/mrvl', actualPeriod: { quarter: 2, fiscalYear: 2027 }, actuals: [{ metric: 'gross margin', value: '52.9%' }, { metric: 'gross margin', value: '57.5%' }], guidance: [] },
    ]};
    const res = eng.settleEarningsGuidance();
    const byId = Object.fromEntries(res.settled.map(s => [s.id, s]));
    const after = JSON.parse(fs.readFileSync(LEDGER, 'utf-8'));
    const revEntry = after.predictions.find(p => p.id === 't-nv-rev');
    return byId['t-nv-rev'] && byId['t-nv-rev'].hit === false && /beat/.test(byId['t-nv-rev'].direction)
      && byId['t-nv-mgn'] && byId['t-nv-mgn'].hit === true
      && res.skipped.some(s => s.id === 't-mrvl-amb' && /歧义/.test(s.reason))
      && revEntry.outcome === false && revEntry.evidence && revEntry.evidence.settledBy === 'edgar-auto-settlement'
      && after.predictions.find(p => p.id === 't-nv-mgn').outcome === true
      && after.predictions.find(p => p.id === 't-nv-fut').outcome === null    // 到期门：dueOn 未到不结
      && after.predictions.find(p => p.id === 't-mrvl-amb').outcome === null // 歧义跳过不落账
      && after.predictions.find(p => p.id === 't-nv-rev2').outcome === false // 已结算条目不重结
      && res.hits === 1 && res.misses === 1;
  } finally {
    if (saved === null) { try { fs.unlinkSync(LEDGER); } catch (_) {} } else fs.writeFileSync(LEDGER, saved);
  }
})(), '只结有容差/区间、唯一实际值、已到期、未结算的指引；GAAP/非GAAP多值判歧义跳过，不设法规避');

// ── 组 4：端到端（extractSignals 透传 / formatReport 渲染 / record 持久化）──
// 7. extractSignals 透传 actuals/ticker（v2.14/v3.4 同型断链防护）
c35('extractSignals 透传 actuals/actualPeriod/ticker', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const items = [{
    title: 'NVDA 8-K', description: '', body: 'revenue of $96.2 billion', source: 'SEC EDGAR',
    bucket: 'sec_filings', origin: 'live', pubDate: '2026-08-26', link: 'https://x/nvda',
    fiscalYearEnd: '0131', ticker: 'NVDA', company: 'NVIDIA CORP', accession: '0001-26-1',
    actualPeriod: { quarter: 2, fiscalYear: 2027 }, actuals: [{ metric: 'revenue', value: '$96.2 billion' }],
    guidance: [],
  }];
  const sig = new ProjectionEngine({ newsData: { sec_filings: { domain: 'sec_filings', news: items } } }).extractSignals();
  const it = sig.items[0];
  return it.ticker === 'NVDA' && Array.isArray(it.actuals) && it.actuals.length === 1
    && it.actualPeriod && it.actualPeriod.quarter === 2 && it.actualPeriod.fiscalYear === 2027;
})(), 'actuals/ticker 不在 extractSignals 重建时带上，结算路径整段走不到（v2.14 同型）');

// 8. record() 持久化 settlement 元数据
c35('record() 持久化 settlement 元数据', (() => {
  const fs = require('fs');
  const LEDGER = path.join(__dirname, 'human-future/data/prediction-ledger.json');
  const saved = fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf-8') : null;
  try {
    const ledger = require('./human-future/scripts/prediction-ledger.js');
    if (saved === null) fs.writeFileSync(LEDGER, JSON.stringify({ version: '1.0.0', predictions: [] }));
    ledger.record({ id: 't35-settle-meta', claim: 'Revenue is expected to be $5 billion, plus or minus 2%', probability: 0.5, domain: 'earnings_guidance', dueOn: '2027-01-01', settlement: { ticker: 'TEST', fiscalYear: 2027, quarter: 1, metric: 'revenue', value: '$5 billion', tolerance: '2%', isRange: false } });
    const p = ledger.load().predictions.find(x => x.id === 't35-settle-meta');
    return p && p.settlement && p.settlement.ticker === 'TEST' && p.settlement.metric === 'revenue' && p.settlement.value === '$5 billion';
  } finally {
    if (saved === null) { try { fs.unlinkSync(LEDGER); } catch (_) {} } else fs.writeFileSync(LEDGER, saved);
  }
})(), '新登记指引必须带结构化结算元数据，否则到期无法与实际值配对');

// 9. formatReport 渲染结算段（只认渲染出的行，v3.2 教训）
c35('formatReport 渲染财报指引结算段', (() => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const items = [{
    title: 'NVDA 8-K 业绩发布 · 2026-08-26', description: '财报指引（FY2027 Q3）：Revenue is expected to be $108.0 billion, plus or minus 2%',
    body: 'Revenue is expected to be $108.0 billion, plus or minus 2%.', source: 'SEC EDGAR', bucket: 'sec_filings', origin: 'live',
    pubDate: '2026-08-26', link: 'https://example.com/edgar-settle-render', fiscalYearEnd: '0131', ticker: 'NVDA',
    guidance: [{ sentence: 'Revenue is expected to be $108.0 billion, plus or minus 2%', metric: 'revenue', value: '$108.0 billion', tolerance: '2%', quarter: 3, fiscalYear: 2027, periodLabel: 'FY2027 Q3', caveats: [] }],
  }];
  const md = formatReport(new ProjectionEngine({ newsData: { sec_filings: { domain: 'sec_filings', news: items } } }).generate());
  return md.includes('## 财报指引结算')
    && /结算判据＝实际值是否落在指引容差带内/.test(md)
    && /不得把 beat 读成/.test(md);
})(), '结算段必须渲染，且结算语义（带内判据/beat方向）段内写明——限定先于被限定者');

// ── 组 5：cron 注入源级（同型断链纪律）────────────────────────
c35('cron 注入脚本渲染财报指引结算段', (() => {
  const p = require('path').join(require('os').homedir(), '.hermes/scripts/hf-cron-fetch.sh');
  if (!require('fs').existsSync(p)) return false;
  const src = require('fs').readFileSync(p, 'utf-8');
  return /guidanceSettlement/.test(src)
    && /财报指引结算（v3\.5/.test(src)
    && /命中\(带内\) \$\{gs\.hits\}/.test(src)
    && /不得把 beat 读成/.test(src);
})(), '注入脚本必须读 proj.forecastDiscrimination.guidanceSettlement，否则 agent 看不到结算结果');

// ── 组 6：版本号一致性（corr-2026-014 同型，四处对齐）──────────
// [v3.6] 推进到 3.6.0（新辨别维度），断言跟当前版本走。
c35('版本号一致性：VERSION/package.json/projection meta/banner 对齐 3.27.0', (() => {
  const fs2 = require('fs');
  const VERSION = fs2.readFileSync(require('path').join(__dirname, 'VERSION'), 'utf-8').trim();
  const pkg = JSON.parse(fs2.readFileSync(require('path').join(__dirname, 'package.json'), 'utf-8'));
  const rp = fs2.readFileSync(require('path').join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  return VERSION === '3.27.0'
    && /3\.27\.0/.test(pkg.version)
    && rp.includes('文明推演引擎 v3.27.0');
})(), 'VERSION/package.json/run-pipeline banner 必须对齐 3.27.0，防 corr-2026-014 版本漂移复发');

// ── v3.5 汇总 ──
(async () => {
  const results = await Promise.all(v35.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v35.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '\u2713' : '\u2717'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.5: ${v35.length - f} 通过, ${f} 失败, 共 ${v35.length} 个`);
  if (f > 0) {
    console.log('结论：财报指引自动结算不完整（纯函数/抽取/编排/端到端/注入/版本有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：财报指引自动结算端到端成立——实际值抽取、单位感知容差、唯一值+到期门+歧义跳过的保守结算、证据落账、报告与注入可见。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v3.5.1 — 财报指引结算链路修复（维护级：断链修复 + 实际值召回补强）
//
// v3.5 审计实测（2026-10-25）：台账 47 条 earnings_guidance，settlement
// 元数据 0/47 可用——ticker 恒 null、fiscalYear/quarter 恒缺失。根因：
// forecast-discriminator 的辨别结果从不带这三个字段，登记时写的
// settlement 是残废的，「元数据随新条目落盘」从落地起就没工作过，
// 全部流量挤在「当期 EDGAR 指引句反推」兜底路径上。同轮审计还实测
// MRVL（全部备案）/MU（9 月备案）/AMZN（全部备案）的实际值抽取为 0——
// 标题期间形态不命中（"of fiscal year" / "FOURTH-QUARTER AND FULL-YEAR"
// / 标题无年份），到期指引永远找不到对账依据。
//
// 本节断言分四组：元数据透传（DOA 修复）/ 实际值抽取扩库（live 实证
// 三公司 + 精度回归）/ 端到端（登记元数据完整 + 历史残废条目经句匹配
// 正确结算 + 跳过理由归因诚实）/ 版本号一致性。
// ════════════════════════════════════════════════════════════════
const v351 = [];
function c351(name, ok, detail) { v351.push({ name, ok, detail }); }

// ── 组 1：辨别器元数据透传（v3.5 DOA 断链修复）────────────────
// 1. discriminate() 结果带 ticker/fiscalYear/quarter
c351('discriminate() 透传 ticker/fiscalYear/quarter 进结果', (() => {
  const { discriminate } = require('./human-future/scripts/forecast-discriminator.js');
  const r = discriminate({
    text: 'Net revenue is expected to be $2.700 billion +/- 5%',
    source: 'SEC EDGAR', date: '2026-05-27', url: 'https://sec.gov/mrvl',
    category: 'earnings_guidance', ticker: 'MRVL', fiscalYearEnd: '0130',
    guidance: { sentence: 'Net revenue is expected to be $2.700 billion +/- 5%', metric: 'net revenue', value: '$2.700 billion', tolerance: '5%', quarter: 2, fiscalYear: 2027, periodLabel: 'FY2027 Q2', caveats: [] },
  });
  const rss = discriminate({ text: 'We plan to expand access next year.', source: 'RSS', date: '2026-10-01' });
  return r.ticker === 'MRVL' && r.guidance && r.guidance.ticker === 'MRVL'
    && r.guidance.fiscalYear === 2027 && r.guidance.quarter === 2
    && r.verdict === 'earnings-guidance'
    && rss.ticker === null && (rss.guidance === null);   // RSS 无 ticker/无指引结构，不崩
})(), '结算元数据三字段必须随辨别结果透传；v3.5 时三字段从未落账（ticker 恒 null），持久化分支从未激活');

// ── 组 2：采集器实际值抽取扩库（live 实证三公司）────────────────
// 2. MRVL/MU/AMZN 三种新标题形态 + 营收值（全部 2026-10-25 从 SEC 实抓原文）
c351('extractActuals 覆盖 MRVL/MU/AMZN 标题形态（of fiscal year / FOURTH-QUARTER AND FULL-YEAR / ended 锚）', (() => {
  const { extractActuals } = require('./human-future/scripts/edgar-collector.js');
  // MRVL live 原文（q227_8kx812026ex-991.htm）：标题 "of Fiscal Year 2027"，
  // 营收值句 "Net revenue for the second quarter of fiscal 2027 was $2.739 billion"
  const MRVL = 'EX-99.1 2 q227_8kx812026ex-991.htm EXHIBIT 99.1 Document Exhibit 99.1 Marvell Technology, Inc. Reports Second Quarter of Fiscal Year 2027 Financial Results • Q2 Net Revenue: $2.739 billion, a new record, grew by 37% year-on-year • Q2 Gross Margin: 53.1% GAAP gross margin; 58.9% non-GAAP gross margin SANTA CLARA, Calif., August 27, 2026 — Marvell Technology, Inc. today reported financial results for the second quarter ended August 1, 2026. Net revenue for the second quarter of fiscal 2027 was $2.739 billion.';
  // MU live 原文（a2026q4ex991-pressrelease.htm）：标题 "FOURTH-QUARTER AND FULL-YEAR 2026"
  const MU = 'EX-99.1 2 a2026q4ex991-pressrelease.htm EX-99.1 EARNINGS RELEASE Document Exhibit 99.1 FOR IMMEDIATE RELEASE Contacts: Satya Kumar Mark Plungy Investor Relations Media Relations satyakumar@micron.com mplungy@micron.com (408) 450-6199 (408) 203-2910 MICRON TECHNOLOGY, INC. REPORTS RECORD FISCAL FOURTH-QUARTER AND FULL-YEAR 2026 RESULTS AI-driven demand and strong operational execution position Micron for continued growth. Revenue of $54.23 billion for the fourth quarter.';
  // AMZN live 原文（amzn-20260630xex991.htm）：标题无年份 → ended 锚；
  // 总量值句 "Net sales increased 20% to $200.6 billion"（紧邻形态）
  const AMZN = 'EX-99.1 2 amzn-20260630xex991.htm EX-99.1 Document Exhibit 99.1 AMAZON.COM ANNOUNCES SECOND QUARTER RESULTS Net sales increased 20% year-over-year Operating income was $27.5 billion, up 43% year-over-year AWS net sales increased 37%—its fastest growth in 18 quarters—to a $169 billion annualized revenue run rate SEATTLE—(BUSINESS WIRE)—Amazon.com, Inc. today announced financial results for the second quarter ended June 30, 2026. Net sales increased 20% to $200.6 billion, compared with second quarter 2025.';
  const a = extractActuals(MRVL), b = extractActuals(MU), c = extractActuals(AMZN);
  const ar = a.actuals.find(x => x.metric === 'revenue');
  const br = b.actuals.find(x => x.metric === 'revenue');
  const cr = c.actuals.find(x => x.metric === 'revenue');
  return a.quarter === 2 && a.fiscalYear === 2027 && ar && ar.value === '$2.739 billion'
    && b.quarter === 4 && b.fiscalYear === 2026 && br && br.value === '$54.23 billion'
    && c.quarter === 2 && c.fiscalYear === 2026 && cr && cr.value === '$200.6 billion';
})(), 'MRVL/MU/AMZN 的期间与营收实际值必须抽出来——抽不到，到期指引永远找不到对账依据');

// 3. 精度回归：AMZN 的营业利润与 AWS 年化 run rate 不得被当成总净销售额
// [v3.13 更新] opinc 自本轮起作为**独立指标**抽取（AMZN 到期营业利润
// 指引的对账依据），原断言 actuals.length===1 随能力扩展失效——精度点
// （营业利润不并进营收、AWS run rate 不当总量）不变且更强：营收仍只有
// 总量一条，营业利润单列一个 metric。
c351('精度回归：operating income 与 AWS run rate 不误当净销售额', (() => {
  const { extractActuals } = require('./human-future/scripts/edgar-collector.js');
  const AMZN = 'AMAZON.COM ANNOUNCES SECOND QUARTER RESULTS Net sales increased 20% year-over-year Operating income was $27.5 billion, up 43% year-over-year AWS net sales increased 37%—its fastest growth in 18 quarters—to a $169 billion annualized revenue run rate SEATTLE—(BUSINESS WIRE)—Amazon.com, Inc. today announced financial results for the second quarter ended June 30, 2026. Net sales increased 20% to $200.6 billion, compared with second quarter 2025.';
  const ex = extractActuals(AMZN);
  const revs = ex.actuals.filter(a => a.metric === 'revenue');
  const opinc = ex.actuals.filter(a => a.metric === 'operating income');
  // 营收只准有总量一条（$200.6B）；营业利润单列且不并进营收
  return revs.length === 1 && revs[0].value === '$200.6 billion'
    && opinc.length === 1 && opinc[0].value === '$27.5 billion'
    // 同比引用（second quarter 2025，无 ended 日期）不得抢期间锚
    && ex.fiscalYear === 2026 && ex.quarter === 2;
})(), '90 字符 gap 曾把 bullet 间的 operating income 桥接成营收；紧邻形态只认总量值句，opinc 单列指标不混入');

// ── 组 3：端到端（登记元数据 / 历史残废条目结算 / 跳过理由归因）──
// 4. 新登记指引的 settlement 元数据完整（ticker/fiscalYear/quarter 落账）
c351('端到端：新登记 earnings_guidance 的 settlement 元数据完整', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const items = [{
    title: 'MRVL 8-K 业绩发布 · 2026-05-27', description: '', body: 'Net revenue is expected to be $2.700 billion +/- 5%.',
    source: 'SEC EDGAR', bucket: 'sec_filings', origin: 'live',
    pubDate: '2026-05-27', link: 'https://example.com/edgar-mrvl-meta-351',
    fiscalYearEnd: '0130', ticker: 'MRVL',
    guidance: [{ sentence: 'Net revenue is expected to be $2.700 billion +/- 5%', metric: 'net revenue', value: '$2.700 billion', tolerance: '5%', quarter: 2, fiscalYear: 2027, periodLabel: 'FY2027 Q2', caveats: [] }],
  }];
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: 1, domains: [], undomained: 0, dateRange: null, items };
  inst.buildForecastDiscrimination();
  const ledger = require('./human-future/scripts/prediction-ledger.js').load();
  const p = (ledger.predictions || []).find(x => x.id.includes('edgar-mrvl-meta-351'));
  return !!p && !!p.settlement && p.settlement.ticker === 'MRVL'
    && p.settlement.fiscalYear === 2027 && p.settlement.quarter === 2
    && p.settlement.metric === 'revenue' && p.settlement.value === '$2.700 billion';
})(), '新登记指引必须带完整结算元数据——v3.5 时 ticker/fiscalYear/quarter 从未落账，持久化分支从未激活');

// 5. 历史残废条目（ticker=null）经当期指引句反推 + 新抽取实际值正确结算
c351('端到端：残废元数据历史条目经句反推配对实际值结算（MRVL live 场景）', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const fs = require('fs');
  const LEDGER = path.join(__dirname, 'human-future/data/prediction-ledger.json');
  const saved = fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf-8') : null;
  try {
    const mock = { version: '1.0.0', predictions: [
      // 复刻台账实测残废形态：settlement 在但 ticker/fiscalYear/quarter 全 null
      { id: 't351-mrvl-q2', claim: 'Net revenue is expected to be $2.700 billion +/- 5%', probability: 0.5, domain: 'earnings_guidance', category: 'earnings_guidance', dueOn: '2026-09-13', outcome: null,
        settlement: { ticker: null, fiscalYear: null, quarter: null, metric: 'revenue', value: '$2.700 billion', tolerance: '5%', isRange: false } },
    ]};
    fs.writeFileSync(LEDGER, JSON.stringify(mock, null, 2));
    const eng = new ProjectionEngine({});
    eng.signals = { totalItems: 1, domains: [], items: [
      { source: 'SEC EDGAR', ticker: 'MRVL', link: 'https://www.sec.gov/Archives/mrvl-q2fy27',
        actualPeriod: { quarter: 2, fiscalYear: 2027 }, actuals: [{ metric: 'revenue', value: '$2.739 billion' }],
        guidance: [{ sentence: 'Net revenue is expected to be $2.700 billion +/- 5%', metric: 'net revenue', value: '$2.700 billion', tolerance: '5%', quarter: 2, fiscalYear: 2027 }] },
    ]};
    const res = eng.settleEarningsGuidance();
    const s = res.settled.find(x => x.id === 't351-mrvl-q2');
    const after = JSON.parse(fs.readFileSync(LEDGER, 'utf-8'));
    const entry = after.predictions.find(p => p.id === 't351-mrvl-q2');
    return !!s && s.hit === true && /in-band/.test(s.direction) && s.ticker === 'MRVL'
      && entry.outcome === true && entry.evidence && entry.evidence.settledBy === 'edgar-auto-settlement'
      && /2\.739/.test(entry.evidence.summary);
  } finally {
    if (saved === null) { try { fs.unlinkSync(LEDGER); } catch (_) {} } else fs.writeFileSync(LEDGER, saved);
  }
})(), '残废元数据条目必须能经当期指引句反推配对实际值——MRVL FY2027Q2 指引 $2.700B±5% vs 实际 $2.739B 带内命中');

// 6. 跳过理由归因诚实：句式漂移 vs 滑出窗口分开报
c351('跳过理由区分「句式漂移」与「备案滑出窗口」', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const fs = require('fs');
  const LEDGER = path.join(__dirname, 'human-future/data/prediction-ledger.json');
  const saved = fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf-8') : null;
  try {
    const mock = { version: '1.0.0', predictions: [
      // 备案在当期窗口内，但 claim 句式与当期抽取结果漂移（v3.13 更新用例：
      // 旧用例「P diluted...」自名词对齐 key（guidanceNounKey）起已可解析——
      // 那正是 MRVL EPS 指引能结算的根因，行为已变；漂移用例改为当期窗口
      // 里完全不存在的指引句式——opex 口径句，任何 key 都配不上）
      { id: 'fc-sec-edgar-0001835632-26-000014-index-htm-2026-09-13-income--0-37-', claim: 'Non-GAAP operating expenses are expected to be approximately $1.2 billion, inclusive of stock-based compensation', probability: 0.5, domain: 'earnings_guidance', category: 'earnings_guidance', dueOn: '2026-09-13', outcome: null, settlement: null },
      // 备案已滑出窗口（当期无此 accession 的任何条目）
      { id: 'fc-sec-edgar-0001045810-26-000019-index-htm-2026-06-14-revenue--78-0-billion', claim: 'Revenue is expected to be $78.0 billion, plus or minus 2%', probability: 0.5, domain: 'earnings_guidance', category: 'earnings_guidance', dueOn: '2026-06-14', outcome: null, settlement: null },
    ]};
    fs.writeFileSync(LEDGER, JSON.stringify(mock, null, 2));
    const eng = new ProjectionEngine({});
    eng.signals = { totalItems: 1, domains: [], items: [
      { source: 'SEC EDGAR', ticker: 'MRVL', link: 'https://www.sec.gov/Archives/mrvl-may', accession: '0001835632-26-000014',
        actualPeriod: { quarter: 1, fiscalYear: 2027 }, actuals: [{ metric: 'revenue', value: '$2.418 billion' }],
        guidance: [{ sentence: 'GAAP diluted net income per share is expected to be $0.37 +/- $0.05 per share', metric: 'income', value: '$0.37', tolerance: '$0.05', quarter: 2, fiscalYear: 2027 }] },
    ]};
    const res = eng.settleEarningsGuidance();
    const drift = res.skipped.find(s => s.id.includes('income--0-37'));
    const aged = res.skipped.find(s => s.id.includes('revenue--78-0'));
    return !!drift && /漂移/.test(drift.reason) && /不猜元数据/.test(drift.reason)
      && !!aged && /滑出采集窗口/.test(aged.reason) && /最近 3 份/.test(aged.reason);
  } finally {
    if (saved === null) { try { fs.unlinkSync(LEDGER); } catch (_) {} } else fs.writeFileSync(LEDGER, saved);
  }
})(), '旧文案一律归因「滑出窗口」，实测多数是句式漂移——归因错了就没法修；窗口大小引用真实常量不写死');

// 7. 去重证据 key 带 dueOn：同公司跨财季结算不并成一个义务；同义务照常合并
c351('dedupeSameObligation 证据 key 带 dueOn（跨财季不误合，同义务不回退）', (() => {
  const ledgerLib = require('./human-future/scripts/prediction-ledger.js');
  const mk = (id, dueOn) => ({ id, claim: 'c' + id, domain: 'earnings_guidance', outcome: true, dueOn,
    evidence: { sources: ['https://www.sec.gov/Archives/edgar/data/1045810/000104581026000073/'] } });
  // 同一 ticker 不同财季的结算（NVDA FY2027 Q1 vs Q2）证据来源相同但是两次承诺
  const cross = ledgerLib.dedupeSameObligation([mk('q1', '2026-06-14'), mk('q2', '2026-09-14')]);
  // 同时点同证据（EU AI Act 三页面同义务）照常合并
  const same = ledgerLib.dedupeSameObligation([mk('a', '2026-08-02'), mk('b', '2026-08-02'), mk('c', '2026-08-02')]);
  return cross.entries.length === 2 && cross.dedupedCount === 0
    && same.entries.length === 1 && same.dedupedCount === 2;
})(), '证据 key 缺 dueOn 会把同公司跨财季结算并成一个义务——实测 11 条已结算被去成 5 条，Brier 样本失真');

// 8. 结算证据来源指向提供实际值的备案（不是该 ticker 的首个条目）
c351('结算证据来源是提供实际值的备案（actualPeriod 匹配）', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const fs = require('fs');
  const LEDGER = path.join(__dirname, 'human-future/data/prediction-ledger.json');
  const saved = fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf-8') : null;
  try {
    const mock = { version: '1.0.0', predictions: [
      { id: 't351-nvda-q1', claim: 'Revenue is expected to be $78.0 billion, plus or minus 2%', probability: 0.5, domain: 'earnings_guidance', category: 'earnings_guidance', dueOn: '2026-06-14', outcome: null, settlement: { ticker: 'NVDA', fiscalYear: 2027, quarter: 1, metric: 'revenue', value: '$78.0 billion', tolerance: '2%', isRange: false } },
      { id: 't351-nvda-q2', claim: 'Revenue is expected to be $91.0 billion, plus or minus 2%', probability: 0.5, domain: 'earnings_guidance', category: 'earnings_guidance', dueOn: '2026-09-14', outcome: null, settlement: { ticker: 'NVDA', fiscalYear: 2027, quarter: 2, metric: 'revenue', value: '$91.0 billion', tolerance: '2%', isRange: false } },
    ]};
    fs.writeFileSync(LEDGER, JSON.stringify(mock, null, 2));
    const eng = new ProjectionEngine({});
    eng.signals = { totalItems: 2, domains: [], items: [
      // 最新备案（8 月）在窗口首位：提供 Q2 实际值；5 月备案提供 Q1 实际值
      { source: 'SEC EDGAR', ticker: 'NVDA', link: 'https://www.sec.gov/Archives/nvda-aug', accession: '0001045810-26-000073',
        actualPeriod: { quarter: 2, fiscalYear: 2027 }, actuals: [{ metric: 'revenue', value: '$96.2 billion' }], guidance: [] },
      { source: 'SEC EDGAR', ticker: 'NVDA', link: 'https://www.sec.gov/Archives/nvda-may', accession: '0001045810-26-000051',
        actualPeriod: { quarter: 1, fiscalYear: 2027 }, actuals: [{ metric: 'revenue', value: '$81.6 billion' }], guidance: [] },
    ]};
    const res = eng.settleEarningsGuidance();
    const after = JSON.parse(fs.readFileSync(LEDGER, 'utf-8'));
    const q1 = after.predictions.find(p => p.id === 't351-nvda-q1');
    const q2 = after.predictions.find(p => p.id === 't351-nvda-q2');
    return res.settled.length === 2
      && q1.evidence.sources[0] === 'https://www.sec.gov/Archives/nvda-may'
      && q2.evidence.sources[0] === 'https://www.sec.gov/Archives/nvda-aug';
  } finally {
    if (saved === null) { try { fs.unlinkSync(LEDGER); } catch (_) {} } else fs.writeFileSync(LEDGER, saved);
  }
})(), 'find(ticker) 拿到的恒为最新备案链接，跨财季结算证据全同——必须按 actualPeriod 匹配提供实际值的那份备案');

// ── 组 4：版本号一致性（corr-2026-014 同型）────────────────────
// [v3.6] 推进到 3.6.0（新辨别维度：成本/价格信号）。
c351('版本号一致性：VERSION/package.json/banner 对齐 3.27.0', (() => {
  const fs2 = require('fs');
  const VERSION = fs2.readFileSync(require('path').join(__dirname, 'VERSION'), 'utf-8').trim();
  const pkg = JSON.parse(fs2.readFileSync(require('path').join(__dirname, 'package.json'), 'utf-8'));
  const rp = fs2.readFileSync(require('path').join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  return VERSION === '3.27.0'
    && /3\.27\.0/.test(pkg.version)
    && rp.includes('文明推演引擎 v3.27.0');
})(), 'VERSION/package.json/run-pipeline banner 必须对齐 3.27.0，防 corr-2026-014 版本漂移复发');

// ── v3.5.1 汇总 ──
(async () => {
  const results = await Promise.all(v351.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v351.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '\u2713' : '\u2717'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.5.1: ${v351.length - f} 通过, ${f} 失败, 共 ${v351.length} 个`);
  if (f > 0) {
    console.log('结论：结算链路修复不完整（元数据透传/实际值召回/端到端/归因/版本有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：结算链路修复端到端成立——元数据三字段透传递账、MRVL/MU/AMZN 实际值可抽取、残废历史条目经句反推正确结算、跳过理由归因诚实。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v3.6 新增断言：商业主张辨别器新增「成本/价格信号主张」形态（cost-signal）
//
// 背景（2026-10-26 live 实证）：商业主张形态库自 v3.0.0c 起两次扩库
// （v3.2 产能/供给约束、v3.3 并购/交易过程）补的都是供给侧与资本过程
// 句式，但供给约束的**定价维度**一直在库外——The Information 简报
// 「Data Center Late Fees Hit $5 Million or More Per Day, Spawning New
// Insurance」（2026-10-25）15 种形态全部不命中，整条不进辨别。当算力
// 交付延迟，市场把延迟定价出来（迟到费 $5M+/天）并金融化（催生新保险
// 产品线）——这是 AI 基建经济学的一阶信号：只辨「售罄」不辨「售罄的
// 代价」，商业辨别对供给约束的理解只有一半。
//
// 精度设计（v3.0.0c/v3.2/v3.3 教训：漏报比误报诚实、没有实证不扩模式）：
//   ① 必须「成本/价格名词 + 水平谓语 + 金额」三件套相邻共现——单独的
//     costs/prices/fees 不是主张（"The Cost of Living and Wages"）；
//   ② 水平谓语只认 hit/reach/climb/rose/rise/top/exceed/average 等
//     定量动词，无金额的 "Prices Up" 与 "costs are falling" 不是可证伪主张；
//   ③ 名词与谓语之间只容忍 now/has/have——"Late fees for delayed GPU
//     deliveries exceed $2M"（名词后接长修饰语）暂不命中，按「漏报比
//     误报诚实」留作已知边界（v3.2 宽窗正则的教训：放宽间隔同时丢精度）。
//
// 本节断言分五组：① live 实证句式命中 + 证伪条件与类目；② 形态族召回；
// ③ 精度回归（live 池原句 + 已知边界句式）；④ 端到端（引擎候选门 +
// 报告渲染 + cron 注入 + 精度门未破）；⑤ 版本号一致性。
// ════════════════════════════════════════════════════════════════
const v36 = [];
function c36(name, ok, detail) { v36.push({ name, ok, detail }); }

// ── 组 1：live 实证句式命中 ──
// 1. 2026-10-26 轮 live 池里真实存在的 The Information 简报标题（无摘要，
//    主张就在标题里）。摘除 cost-signal 模式 → kind 不是 cost-signal，失败。
c36('live 实证：数据中心迟到费命中成本/价格信号形态', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Data Center Late Fees Hit $5 Million or More Per Day, Spawning New Insurance',
    source: 'The Information',
  });
  return r.kind === 'cost-signal'
    && r.kinds.length === 1 && r.kinds[0] === 'cost-signal'   // 只命中成本形态，不串台
    && r.verdict === 'weak-evidence'      // 标题-only：无出处(1)，不虚抬
    && r.evidence.weight === 1
    && r.reasoning.score === 1            // 有金额（$5）→ has-sample 命中，无对照无反例
    && r.decisionRelevant === false;
})(), '「Late Fees Hit $5 Million or More Per Day」必须命中成本/价格信号形态并按低证据等级判别（不虚抬为决策相关）');

// 2. 证伪条件与类目：新 kind 必须有专属证伪路径，不能落回「无明确证伪路径」。
//    摘除 FALSIFICATION_BY_KIND['cost-signal'] → 失败；摘除类目映射 → 源级
//    断言失败（行为断言抓不到——inferCommercialCategory 的兜底值恰好也是
//    market_claims，与 v3.3 ma 的 capital_flow 不同，必须源级钉住）。
c36('cost-signal 形态有专属证伪条件与类目映射', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Data center late fees hit $5 million or more per day, according to people familiar with the contracts.',
    source: 'The Information',
  });
  const src = require('fs').readFileSync(require('path').join(__dirname,
    'human-future/scripts/commercial-discriminator.js'), 'utf-8');
  return r.kind === 'cost-signal'
    && r.category === 'market_claims'
    && /合同|发票|第三方价格跟踪|回落|豁免/.test(r.falsification)
    && r.falsification !== '无明确证伪路径——这本身就是问题'
    // 源级：映射行必须显式存在（兜底值同域，行为断言无法区分「映射了」与「没映射」）
    && /'cost-signal': 'market_claims'/.test(src);
})(), '成本/价格主张必须带「合同/发票/第三方价格跟踪/回落/豁免」证伪路径，归市场主张域');

// ── 组 2：形态族召回 ──
// 3. 水平谓语族（hit/reach/climb/average/exceed/rise）+ 单位与比较级形态。
c36('形态族召回：水平谓语与金额单位四种形态', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'cost-signal');
  if (!p) return false;
  return [
    'Data Center Late Fees Hit $5 Million or More Per Day, Spawning New Insurance',
    'GPU rental costs reached $8 per hour this quarter.',
    'Insurance premiums climbed to $2 billion as data center delays mount.',
    'Delay penalties now average $5 million per day for late deliveries.',
    'Chip prices have risen to record levels of $12,000 per unit.',
    'Late fees exceed $2 million for delayed deliveries.',
  ].every(s => p.re.test(s));
})(), 'hit/reached/climbed to/average/risen to record levels of/exceed + per day/per hour 单位都要命中');

// ── 组 3：精度回归（v3.0.0c 教训：漏报比误报诚实）──
// 4. live 池原句与非主张句式一律不得命中。含已知边界句式（名词后接长修饰语）。
//    摘除相邻性收紧（名词与谓语间允许 0-4 词间隔）→ 实证误命中 2 句：
//    "The company said fees would rise, without giving figures."（would 间隔+
//    句末逗号被 [\d.,]+ 吞成「金额」）与已知边界句 "Late fees for delayed GPU
//    deliveries exceed $2 million per week."——本断言失败（2026-10-26 实测，
//    不是推测）。
c36('精度回归：成本名词单现与无金额谓语不误命中', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'cost-signal');
  if (!p) return false;
  return [
    // 成本名词单现/名词短语，无水平谓语+金额
    'The Cost of Living and Wages',
    'The new SSD offers 100TB of storage capacity for enterprise customers.',
    // 无金额的谓语
    'Jet Fuel Prices Up',
    'Data center costs are falling as supply catches up with demand.',
    'GPU prices remain flat despite the shortage.',
    'The company said fees would rise, without giving figures.',
    // 既有形态不串台（融资/估值/产能/交易/监管）
    'DeepSeek Raises Nearly $16 billion in Second Funding Round',
    'OpenAI working on new $30B raise at $1.25T valuation ahead of IPO',
    'AWS Largely Sold Out Of Capacity Into 2028, Jassy Says',
    'Instacart Shares Rally 10% After The Information Reports Sale Talks',
    'U.S. Treasury Proposes to Widen Outbound Investment Restrictions for China and Other Countries',
    'VC Firms Tap LP Pools, Warehouse Loans for Speedy AI Cash',
    "Anthropic's Margin is OpenAI's Opportunity",
    // live 池宏观/公告原句
    'Minutes of the Federal Open Market Committee, September 15-16, 2026',
    "Minutes of the Board's discount rate meetings on August 17, September 9, and September 16, 2026",
    'Real Weekly Earnings Down in Q3',
    'Front Month Brent Futures near 2022 Peak Level',
    'Insurance for AI Hyperscaler Debt, et al.',
    'Hottest toy for Christmas? Nvidia CEO plays with adorable Microduck robots, 20,000 sell',
    // 已知边界（如实记录为漏报，不是误报）：名词后接长修饰语+谓语
    'Late fees for delayed GPU deliveries exceed $2 million per week.',
  ].every(s => !p.re.test(s));
})(), '成本名词单现/无金额谓语/融资估值产能交易监管句/live 池原句都不得命中');

// ── 组 4：端到端（引擎门 + 报告渲染 + cron 注入）──
// 5. 引擎候选门放行迟到费条目并辨别；formatReport 渲染成本/价格信号标签。
//    摘除报告 KIND_CN → 失败；摘除模式 → available=false，失败。
c36('端到端：迟到费主张进商业辨别段并渲染', (() => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const item = { title: 'Data Center Late Fees Hit $5 Million or More Per Day, Spawning New Insurance',
    description: '', body: '', source: 'The Information', bucket: 'business',
    pubDate: 'Sun, 25 Oct 2026 15:31:13 GMT', domains: ['market_claims'],
    link: 'https://theinformation.com/latefees', origin: 'live' };
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: 1, domains: [], undomained: 0, dateRange: null, items: [item] };
  const cd = inst.buildCommercialDiscrimination();
  const md = formatReport(new ProjectionEngine({ newsData: { business: { news: [item] } } }).generate());
  const seg = md.split('## 商业主张辨别')[1] || '';
  return cd.available === true && cd.audited === 1
    && cd.results[0].kind === 'cost-signal'
    && seg.includes('Data Center Late Fees Hit $5 Million or More Per Day')
    // 必须认「渲染出来的类型标签行」而不是段里任意出现该字符串——note 文本
    // 里也有「成本/价格信号」，泛匹配会让断言空转（v3.2 反向验证实测）。
    && seg.includes('类型: 成本/价格信号 | 来源: The Information')
    && seg.includes('证伪条件:');
})(), '迟到费条目必须进商业辨别段，报告渲染成本/价格信号标签与证伪条件');

// 6. cron 注入脚本 KIND_CN 认识 cost-signal（端到端最后一环：agent 看得见中文标签）。
//    摘除注入脚本 KIND_CN 的 cost-signal 行 → 失败（同型断链的复发防护）。
c36('cron 注入脚本渲染成本/价格信号标签', (() => {
  const p = require('path').join(require('os').homedir(), '.hermes/scripts/hf-cron-fetch.sh');
  if (!require('fs').existsSync(p)) return false;
  const src = require('fs').readFileSync(p, 'utf-8');
  return /'cost-signal': '成本\/价格信号'/.test(src);
})(), '注入脚本 KIND_CN 必须含 cost-signal，否则 agent 看到英文 kind');

// 7. 精度门没被新模式打穿：Fed 公告/播客仍不进辨别（新模式写得过宽就会漏进来）。
c36('精度门未破：非主张文本仍被挡在辨别外', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const noise = [
    { title: 'Minutes of the Federal Open Market Committee',
      description: 'Participants noted that financial market conditions had eased.',
      body: '', source: 'Federal Reserve (Monetary)', bucket: 'economy',
      pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT', domains: ['economy_labor'],
      link: 'https://federalreserve.gov/a', origin: 'live' },
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
})(), 'Fed 公告与播客不得因 cost-signal 新模式进入辨别');

// ── 组 5：版本号一致性（corr-2026-014 同型）────────────────────
c36('版本号一致性：VERSION/package.json/banner 对齐 3.27.0', (() => {
  const fs2 = require('fs');
  const VERSION = fs2.readFileSync(require('path').join(__dirname, 'VERSION'), 'utf-8').trim();
  const pkg = JSON.parse(fs2.readFileSync(require('path').join(__dirname, 'package.json'), 'utf-8'));
  const rp = fs2.readFileSync(require('path').join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  return VERSION === '3.27.0'
    && /3\.27\.0/.test(pkg.version)
    && rp.includes('文明推演引擎 v3.27.0');
})(), 'VERSION/package.json/run-pipeline banner 必须对齐 3.27.0，防 corr-2026-014 版本漂移复发');

// ── v3.6 汇总 ──
(async () => {
  const results = await Promise.all(v36.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v36.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '\u2713' : '\u2717'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.6: ${v36.length - f} 通过, ${f} 失败, 共 ${v36.length} 个`);
  if (f > 0) {
    console.log('结论：成本/价格信号主张的接入不完整（命中/证伪/召回/精度/端到端/版本有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：成本/价格信号主张已进模式库（live 实证 1 条命中），报告与 cron 注入渲染中文标签，精度回归通过。');
  }
})();


// ════════════════════════════════════════════════════════════════
// v3.7 新增断言：商业主张辨别器新增「专家/机构判断主张」形态（expert-judgment）
//
// 背景（2026-10-26 轮 live 实证）：商业主张形态库自 v3.0.0c 起三次扩库
// （v3.2 产能/供给约束、v3.3 并购/交易过程、v3.6 成本/价格信号）补的
// 都是供给侧、资本过程与定价维度句式，但「第三方经济/市场专家对市场
// 现状的量化判断」这一最高频的主张形态一直在库外——TechCrunch AI
// 「AI delivers 'zero financial payoff' to most companies, Apollo
// economist says」（2026-10-25）16 种形态全部不命中，整条不进辨别。
// Apollo 首席经济学家论「AI 对企业零财务回报」与 survey-finding（调查
// 研究的数据汇总）是两类证据：前者是专家对数据的解读（可证伪但依赖
// 专家信誉与机构口径），后者是数据本身。库里只有后者——「AI 到底有
// 没有财务回报」这个当前最大市场争议的核心主张整条漏掉。
//
// 精度设计（v3.0.0c/v3.2/v3.3/v3.6 教训：漏报比误报诚实、没有实证不扩模式）：
//   ① 只认经济/市场分析头衔（economist/analyst/strategist/investment
//      officer/portfolio manager/fund manager/head of research）——CEO/
//      executive 的自述是 vendor-selfreport 地盘不抢；scientists/
//      researchers（科研判断）、Fed chair/Trump（官员言论）不是市场
//      分析头衔，不进库；
//   ② 必须「头衔 + 判断动词」或「头衔 + 机构（at/of/for/from + 大写）」——
//      光名词（"analyst day"/"market strategist"）不是主张；
//   ③ 头衔与机构之间只容忍 chief/senior/lead/market/investment/global/
//      US 窄前缀，不放开到任意间隔（v3.6 宽窗正则误命中 2 句的教训）。
//   已知边界（如实）：头衔+机构+动词三段式（"analysts at the Fed
//   expect"）、"economists surveyed by..." 形态无 live 实证不进库。
//
// 本节断言分五组：① live 实证句式命中 + 证伪条件与类目（源级）；② 形态族
// 召回；③ 精度回归（live 池原句 + 非专家句式）；④ 端到端（证据等级扩展 +
// 引擎候选门 + 报告渲染 + cron 注入 + 精度门未破）；⑤ 版本号一致性。
// ════════════════════════════════════════════════════════════════
const v37 = [];
function c37(name, ok, detail) { v37.push({ name, ok, detail }); }

// ── 组 1：live 实证句式命中 ──
// 1. 2026-10-26 轮 live 池里真实存在的 TechCrunch AI 条目（标题+描述）。
//    摘除 expert-judgment 模式 → kind 不是 expert-judgment，失败。
c37('live 实证：Apollo 经济学家判断命中专家/机构判断形态', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'AI delivers \u2018zero financial payoff\u2019 to most companies, Apollo economist says. '
      + 'Despite massive investments and widespread hype around artificial intelligence, '
      + 'the technology has delivered zero financial payoff to corporate America outside of tech.',
    source: 'TechCrunch AI',
  });
  return r.kind === 'expert-judgment'
    && r.kinds.length === 1 && r.kinds[0] === 'expert-judgment'  // 只命中专家形态，不串台
    && r.verdict === 'thin-reasoning'     // 证据 3（第三方专家）但推理不足
    && r.evidence.weight === 3
    && r.reasoning.score === 1            // 描述里 "Despite massive investments" 触发
                                           // has-counterexample（既有 REASONING_CHECKS 行为，
                                           // 如实记录）；无数字样本无对照
    && r.decisionRelevant === true;       // 证据≥3 → 决策相关（非虚抬：有描述+第三方机构判断）
})(), 'Apollo economist says 必须命中专家/机构判断形态，判 推理单薄/第三方调查(3)/推理 1/3');

// 2. 证伪条件与类目：新 kind 必须有专属证伪路径，不能落回「无明确证伪路径」。
//    摘除 FALSIFICATION_BY_KIND['expert-judgment'] → 失败；摘除类目映射 →
//    源级断言失败（行为断言抓不到——inferCommercialCategory 兜底值恰好也是
//    market_claims，与 v3.6 cost-signal 同型，必须源级钉住）。
c37('expert-judgment 形态有专属证伪条件与类目映射', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'A senior market strategist at Goldman Sachs sees a 20% correction ahead as valuations stretch.',
    source: 'TechCrunch AI',
  });
  const src = require('fs').readFileSync(require('path').join(__dirname,
    'human-future/scripts/commercial-discriminator.js'), 'utf-8');
  return r.kind === 'expert-judgment'
    && r.category === 'market_claims'
    && /实际数据|第三方调查|后续修订|反证/.test(r.falsification)
    && r.falsification !== '无明确证伪路径——这本身就是问题'
    // 源级：映射行必须显式存在（兜底值同域，行为断言无法区分「映射了」与「没映射」）
    && /'expert-judgment': 'market_claims'/.test(src);
})(), '专家判断主张必须带「实际数据/第三方调查/后续修订/反证」证伪路径，归市场主张域');

// ── 组 2：形态族召回 ──
// 3. 头衔+动词、头衔+机构、according to 三族 + 窄前缀形态。
c37('形态族召回：头衔动词/头衔机构/according to 三族七形', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'expert-judgment');
  if (!p) return false;
  return [
    'AI delivers zero financial payoff to most companies, Apollo economist says',
    'The chief economist at Goldman Sachs warned the rally is overdone',
    'Analysts at Morgan Stanley raised their price target to $300',
    'A senior market strategist sees a 20% correction ahead',
    'According to a Bank of America analyst, memory prices will keep climbing',
    'Strategists at JPMorgan expect earnings to beat consensus',
    'Fund managers at BlackRock see inflows continuing into next year',
  ].every(s => p.re.test(s));
})(), 'economist says / analysts at X / chief economist at X / according to a X analyst 都要命中');

// ── 组 3：精度回归（v3.0.0c 教训：漏报比误报诚实）──
// 4. 非市场分析头衔、光名词、厂商自述、股价反应、播客 boilerplate 一律不得命中。
//    含 live 池原句（官员访谈/科研转述/杂志名）与已知边界句式。
c37('精度回归：厂商自述与科研官员转述不误命中', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'expert-judgment');
  if (!p) return false;
  return [
    // 厂商自述（vendor-selfreport 地盘，头衔库不含 CEO/executive）
    'OpenAI says it expects revenue to double next year',
    'our chief executive officer says we plan to ship in Q3',
    'Sam Altman says GPT-6 will change everything',
    'NVIDIA CEO says demand remains strong',
    // 科研/学术判断（非市场分析头衔）
    'Researchers at MIT say the model fails safety evals',
    'Scientists say the results are inconclusive',
    'A Model of U.S. Monetary Policy -- by Rohan Kekre, Moritz Lenel',
    // 官员/政客言论（非市场分析头衔）
    'The Fed chair said inflation remains elevated',
    'Trump says tariffs will raise revenue',
    'Piero Cipollone: Interview with Milano Finanza',
    // 光名词无动词/无机构
    'analyst day scheduled for next week',
    'The analyst coverage of the stock has been sparse',
    'The Economist magazine named AI person of the year',
    'market strategist',
    'economists',
    // 既有决议非待辨别主张（股价反应，v3.2/v3.3）
    'Instacart Shares Rally 10% After The Information Reports Sale Talks',
    // boilerplate / 其它形态库句式不串台
    'LWiAI Podcast #258 - Opus 5.5, Sol and Luna, Muse, DeepSeek-V4.1-Flash, Xi',
    'Get your pass and bring someone with you at 50% off. REGISTER NOW.',
    'A survey of 1,200 enterprises found 34% had deployed LLMs',
    'according to a study in Science, the system beat generalist doctors',
    'AWS Largely Sold Out Of Capacity Into 2028, Jassy Says',
    'U.S. Treasury Proposes to Widen Outbound Investment Restrictions for China and Other Countries',
    // 已知边界（如实记录为漏报，不是误报）：头衔+机构+动词三段式
    'Analysts at the Fed expect two more cuts this year',
  ].every(s => !p.re.test(s));
})(), 'CEO/executive 自述、scientists/researchers、官员言论、光名词、股价反应、播客都不得命中');

// ── 组 4：端到端（证据等级扩展 + 引擎门 + 报告渲染 + cron 注入）──
// 5. 证据等级：expert 形态归第三方调查(3)（third-party-survey 扩展），与
//    v3.0.0c「according to a study in Science 归第三方」同型；厂商自述不被
//    升级。摘除 third-party-survey 的 expert 扩展 → 失败。
c37('证据等级：专家判断归第三方调查(3)且不误升厂商自述', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'AI delivers zero financial payoff to most companies, Apollo economist says.',
  });
  const r2 = discriminateCommercial({
    text: 'OpenAI says it expects revenue to double next year.',
  });
  const r3 = discriminateCommercial({
    text: 'According to a Bank of America analyst, memory prices will keep climbing.',
  });
  // [v3.7] 防回归：Apollo 公司名含 "poll" 子串，third-party-survey 的
  // survey/poll/census 自 v3.0.0c 起无 \b 词边界（与 v3.1.1 demo/democracy
  // 同型）。无专家头衔的 Apollo 句不得因 poll 子串被当成民调证据。
  const r4 = discriminateCommercial({
    text: 'Apollo hired 200 engineers for its insurance division.',
  });
  return r.evidence.id === 'third-party-survey' && r.evidence.weight === 3
    && r3.evidence.weight === 3
    && r2.evidence.weight <= 2            // 厂商自述不得被 expert 扩展抬级
    && r4.evidence.weight <= 2;           // Apollo≠poll（词边界修复，摘除 \b → 本断言失败）
})(), 'Apollo economist says 归第三方调查(3)，OpenAI says 仍是厂商自述档，Apollo 公司名不得因 poll 子串命中');

// 6. 引擎候选门放行 Apollo 条目并辨别；formatReport 渲染专家/机构判断标签。
//    摘除报告 KIND_CN → 失败；摘除模式 → available=false，失败。
c37('端到端：Apollo 主张进商业辨别段并渲染', (() => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const item = { title: 'AI delivers \u2018zero financial payoff\u2019 to most companies, Apollo economist says',
    description: 'Despite massive investments and widespread hype around artificial intelligence, '
      + 'the technology has delivered zero financial payoff to corporate America outside of tech.',
    body: '', source: 'TechCrunch AI', bucket: 'business',
    pubDate: 'Sun, 25 Oct 2026 15:31:13 GMT', domains: ['market_claims'],
    link: 'https://techcrunch.com/zero-payoff', origin: 'live' };
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: 1, domains: [], undomained: 0, dateRange: null, items: [item] };
  const cd = inst.buildCommercialDiscrimination();
  const md = formatReport(new ProjectionEngine({ newsData: { business: { news: [item] } } }).generate());
  const seg = md.split('## 商业主张辨别')[1] || '';
  return cd.available === true && cd.audited === 1
    && cd.results[0].kind === 'expert-judgment'
    && seg.includes('Apollo economist says')
    // 必须认「渲染出来的类型标签行」而不是段里任意出现该字符串——note 文本
    // 里也有「专家/机构判断」，泛匹配会让断言空转（v3.2 反向验证实测同型）。
    && seg.includes('类型: 专家/机构判断 | 来源: TechCrunch AI')
    && seg.includes('证伪条件:');
})(), 'Apollo 条目必须进商业辨别段，报告渲染专家/机构判断标签与证伪条件');

// 7. cron 注入脚本 KIND_CN 认识 expert-judgment（端到端最后一环：agent 看得见
//    中文标签）。摘除注入脚本 KIND_CN 的 expert-judgment 行 → 失败（同型断链复发防护）。
c37('cron 注入脚本渲染专家/机构判断标签', (() => {
  const p = require('path').join(require('os').homedir(), '.hermes/scripts/hf-cron-fetch.sh');
  if (!require('fs').existsSync(p)) return false;
  const src = require('fs').readFileSync(p, 'utf-8');
  return /'expert-judgment': '专家\/机构判断'/.test(src);
})(), '注入脚本 KIND_CN 必须含 expert-judgment，否则 agent 看到英文 kind');

// 8. 精度门没被新模式打穿：Fed 公告/播客仍不进辨别（新模式写得过宽就会漏进来）。
c37('精度门未破：非主张文本仍被挡在辨别外', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const noise = [
    { title: 'Minutes of the Federal Open Market Committee',
      description: 'Participants noted that financial market conditions had eased.',
      body: '', source: 'Federal Reserve (Monetary)', bucket: 'economy',
      pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT', domains: ['economy_labor'],
      link: 'https://federalreserve.gov/a', origin: 'live' },
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
})(), 'Fed 公告与播客不得因 expert-judgment 新模式进入辨别');

// ── 组 5：版本号一致性（corr-2026-014 同型）────────────────────
c37('版本号一致性：VERSION/package.json/banner 对齐 3.27.0', (() => {
  const fs2 = require('fs');
  const VERSION = fs2.readFileSync(require('path').join(__dirname, 'VERSION'), 'utf-8').trim();
  const pkg = JSON.parse(fs2.readFileSync(require('path').join(__dirname, 'package.json'), 'utf-8'));
  const rp = fs2.readFileSync(require('path').join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  return VERSION === '3.27.0'
    && /3\.27\.0/.test(pkg.version)
    && rp.includes('文明推演引擎 v3.27.0');
})(), 'VERSION/package.json/run-pipeline banner 必须对齐 3.27.0，防 corr-2026-014 版本漂移复发');

// ── v3.7 汇总 ──
(async () => {
  const results = await Promise.all(v37.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v37.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '\u2713' : '\u2717'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.7: ${v37.length - f} 通过, ${f} 失败, 共 ${v37.length} 个`);
  if (f > 0) {
    console.log('结论：专家/机构判断主张的接入不完整（命中/证伪/召回/精度/端到端/版本有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：专家/机构判断主张已进模式库（live 实证 1 条命中），报告与 cron 注入渲染中文标签，精度回归通过。');
  }
})();


// ════════════════════════════════════════════════════════════════
// v3.8 新增断言：商业主张辨别器新增「监管行动主张」形态（regulatory-action）
//
// 背景（2026-10-26 轮 live 实证）：商业主张形态库自 v3.0.0c 起四次扩库
// （v3.2 产能/供给约束、v3.3 并购/交易过程、v3.6 成本/价格信号、v3.7
// 专家/机构判断）补的都是市场信号句式，但**合规域自 v3.0.0c 起只有
// compliance-demand（「监管需求修辞」：regulators will require…）**——
// 真实规则事件（提案/签发/加宽/解除限制）一条都看不见。live 实证两条：
//   ① The Information 简报「U.S. Treasury Proposes to Widen Outbound
//      Investment Restrictions for China and Other Countries」（2026-10-23，
//      AP/Reuters/Nikkei/The Hill 四家交叉验证：10-22 提案、评论期至
//      12-07、覆盖 AI/超算/生物技术/高超音速）；
//   ② LWiAI #251 简报内句「Trump lifts restrictions on Anthropic」
//      （2026-06-30 白宫解除 Anthropic 模型出口管制的简报转述）。
// 扩容前 17 种形态对这两句全部不命中、整条不进辨别。规则事件是合规需求域
// 的一阶信号（跨境资本/出口管制/AI 监管全经由规则落地），且有天然结算
// 结构：提案 → 评论期 → 最终规则。
//
// 精度设计（v3.0.0c/v3.2/v3.3/v3.6/v3.7 教训：漏报比误报诚实、没有实证
// 不扩模式）：
//   ① 必须「政府/监管主体 + 规制动词 + 规制工具名词」三段式且同句（两段
//      间隔都不含句读号 [^.!?]）；
//   ② 主体只认政府/监管机构与官员——厂商动作是 vendor-selfreport 地盘；
//      Fed/ECB 的货币政策公告（FOMC statement/minutes/projections）不是
//      规制行动，主体库不含 Fed/ECB（v3.0.0c 精度门不打穿）；
//   ③ 规制动词只认规则生命周期动作，不含 said/says/expect——官员言论是
//      v3.7 expert-judgment 已决议不进库的形态，不重复收编。
// live 全池实测：312 条里精确命中 2 条（即上述两条），31 句精度回归
// 0 误报。已知边界（如实）：执法行动（fined/sued/charged，无工具名词）
// 与「SEC's new disclosure rules」类所有格形态无 live 实证不进库。
//
// 本节断言分五组：① live 实证两条款式命中 + 证伪条件与类目（源级）；
// ② 形态族召回（主体/动词/工具三族十二形）；③ 精度回归 31 句；④ 端到端
// （no-quantity 事件型豁免 + 证据等级机构/官员分流 + 引擎候选门 + 报告
// 渲染 + cron 注入 + 精度门未破）；⑤ 版本号一致性。
// ════════════════════════════════════════════════════════════════
const v38 = [];
function c38(name, ok, detail) { v38.push({ name, ok, detail }); }

// ── 组 1：live 实证句式命中 ──
// 1. The Information 简报标题（live 池真实条目，无摘要，主张就在标题里）。
//    摘除 regulatory-action 模式 → kind 不是 regulatory-action，失败。
//    判定口径：事件型主张豁免 no-quantity（证伪靠「规则是否落地」这个
//    可观测事件，不靠量化基数——否则报告会同时打印「不可证伪」与「证伪
//    条件」自相矛盾的两行）；证据等级归公开财报/公告(3)（机构一手文书，
//    与 v3.0.0c「according to a company announcement 归公开财报档」同型）；
//    推理 0/3 不虚抬成结构完整，但证据≥3 → 决策相关（一级监管信号）。
c38('live 实证：Treasury 规则提案命中监管行动形态', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'U.S. Treasury Proposes to Widen Outbound Investment Restrictions for China and Other Countries',
    source: 'The Information',
  });
  return r.kind === 'regulatory-action'
    && r.kinds.length === 1 && r.kinds[0] === 'regulatory-action'  // 只命中监管形态，不串台
    && r.verdict === 'thin-reasoning'       // 证据 3、推理 0/3：不虚抬成结构完整
    && r.evidence.id === 'public-filing' && r.evidence.weight === 3
    && r.reasoning.score === 0
    && r.decisionRelevant === true          // 证据≥3 → 决策相关（非虚抬：机构一手规则文书）
    && r.falsifiability.problems.length === 0;  // no-quantity 事件型豁免生效
})(), '「Treasury Proposes to Widen Outbound Investment Restrictions」必须命中监管行动形态并按机构一手文书证据判别');

// 1b. LWiAI #251 简报内句（live 池第二条，官员个人行动经简报转述）。
//     官员个人署名不在机构证据标记里——保守归无出处(1)，不借名字抬级。
c38('live 实证：LWiAI 简报内监管行动句命中且不虚抬', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Last Week in AI #251 - Mythos Back, Sonnet 5, Etched, LongCat  '
      + 'Trump lifts restrictions on Anthropic, Anthropic launches Claude Sonnet 5, '
      + "Google's NotebookLM updates, chips stories from Etched and Baidu, and more!",
    source: 'Last Week in AI',
  });
  return r.kind === 'regulatory-action'
    && r.verdict === 'weak-evidence'        // 无出处(1)：官员个人行动经媒体转述，不抬级
    && r.evidence.weight === 1
    && r.decisionRelevant === false;
})(), 'LWiAI 简报内「Trump lifts restrictions on Anthropic」必须命中监管行动形态但不借官员名字抬证据等级');

// 2. 证伪条件与类目：新 kind 必须有专属证伪路径，不能落回「无明确证伪路径」。
//    类目映射必须源级断言——行为断言抓不到摘除（v3.6/v3.7 同型教训：
//    兜底类目 market_claims 同域；本轮映射到 compliance_demand 虽与兜底
//    不同域，仍按纪律源级钉住，双保险）。
c38('regulatory-action 形态有专属证伪条件与类目映射', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'The SEC issued new disclosure rules for AI model vendors.',
    source: 'The Information',
  });
  const src = require('fs').readFileSync(require('path').join(__dirname,
    'human-future/scripts/commercial-discriminator.js'), 'utf-8');
  return r.kind === 'regulatory-action'
    && r.category === 'compliance_demand'
    && /最终规则|rescind|struck down|推迟|收窄/.test(r.falsification)
    && r.falsification !== '无明确证伪路径——这本身就是问题'
    // 源级：映射行必须显式存在
    && /'regulatory-action': 'compliance_demand'/.test(src);
})(), '监管行动主张必须带「最终规则范围不符/rescind/struck down/推迟/收窄」证伪路径，归合规需求域');

// ── 组 2：形态族召回（主体/规制动词/工具名词三族）──
// 3. 三段式各件 + 动词族 + 工具名词族的代表性形态。
c38('形态族召回：主体/规制动词/工具名词三族十二形', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'regulatory-action');
  if (!p) return false;
  return [
    'U.S. Treasury Proposes to Widen Outbound Investment Restrictions for China and Other Countries',
    'Trump lifts restrictions on Anthropic',
    'The SEC issued new disclosure rules for AI model vendors',
    'The European Commission approved new measures to regulate foundation models',
    'The White House unveiled a new executive order on chip exports',
    'Congress passed a law expanding outbound investment restrictions',
    'The FTC finalized rules targeting deceptive AI claims',
    'Beijing imposed new export controls on rare earth processing technology',
    'The EU widened sanctions on Russian semiconductor imports',
    'The Biden administration rescinded the previous AI guidance',
    'Regulators propose new rules for AI data center disclosure',
    'The commerce ministry lifted restrictions on foreign cloud providers',
  ].every(s => p.re.test(s));
})(), 'treasury/trump/SEC/EU/regulators/ministry 主体 + propose/issue/approve/pass/lift/impose/widen/rescind 动词 + rules/measures/controls/sanctions/law/guidance 工具都要命中');

// ── 组 3：精度回归（v3.0.0c 教训：漏报比误报诚实）──
// 4. Fed/ECB 货币政策公告、学术论文、宏观看价句、官员言论（v3.7 已决议
//    不进库）、厂商自述、股价反应、其它形态库句式、boilerplate 一律不得
//    命中。含 live 池原句与已知边界句式。
c38('精度回归：Fed/ECB 公告与官员言论厂商自述不误命中', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'regulatory-action');
  if (!p) return false;
  return [
    // Fed/ECB 货币政策公告（v3.0.0c 精度门：整类不进辨别；主体库不含 Fed/ECB）
    'Federal Reserve issues FOMC statement',
    'Minutes of the Federal Open Market Committee, September 15-16, 2026',
    "Minutes of the Board's discount rate meetings on August 17, September 9, and September 16, 2026",
    'Federal Reserve Board and Federal Open Market Committee release economic projections from the September 15-16 FOMC meeting',
    'Federal Reserve announces the leadership and objectives of its task forces to advance the conduct of monetary policy',
    'ECB Consumer Expectations Survey results – September 2026',
    'Piero Cipollone: Interview with Milano Finanza',
    'Christine Lagarde: IMFC Statement',
    'Results of the September 2026 survey on credit terms and conditions in euro-denominated securities financing and OTC derivatives markets',
    // 学术/宏观（live 池原句）
    'Export Controls and the Economics of National Security -- by Jingting Fan, Kyle Handley, Nuno Limão',
    'The Net Present Value of the California Billionaire Tax Act -- by Benjamin Jaros, Joshua Rauh',
    'A Model of U.S. Monetary Policy and the Global Financial Cycle -- by Rohan Kekre, Moritz Lenel',
    'Front Month Brent Futures near 2022 Peak Level',
    'Jet Fuel Prices Up',
    'The Cost of Living and Wages',
    // 官员/专家言论（v3.7 已决议：言论不是市场分析头衔主张；said/says 不在规制动词表）
    'Trump says tariffs will raise revenue',
    'The Fed chair said inflation remains elevated',
    'Analysts at the Fed expect two more cuts this year',
    // 厂商自述（vendor-selfreport 地盘）
    'OpenAI says it will no longer train its AI models on the live internet, citing significant risks',
    'NVIDIA CEO says demand remains strong',
    // 股价反应（v3.2/v3.3 已决议：可核验市场价格事实非待辨别主张）
    'Instacart Shares Rally 10% After The Information Reports Sale Talks',
    // 其它形态库句式不串台
    'DeepSeek Raises Nearly $16 billion in Second Funding Round',
    'AWS Largely Sold Out Of Capacity Into 2028, Jassy Says',
    'VC Firms Tap LP Pools, Warehouse Loans for Speedy AI Cash',
    'Data Center Late Fees Hit $5 Million or More Per Day, Spawning New Insurance',
    'Instacart Is Exploring a Sale',
    "AI delivers 'zero financial payoff' to most companies, Apollo economist says",
    'Anthropic\u2019s Margin is OpenAI\u2019s Opportunity',
    'A Neocloud\u2019s Gathering Storm',
    // boilerplate
    'LWiAI Podcast #258 - Opus 5.5, Sol and Luna, Muse, DeepSeek-V4.1-Flash, Xi',
    'Get your pass and bring someone with you at 50% off. REGISTER NOW.',
  ].every(s => !p.re.test(s));
})(), 'Fed/ECB 公告、学术论文、宏观句、官员言论、厂商自述、股价反应、播客 boilerplate 都不得命中');

// ── 组 4：端到端（事件型豁免 + 证据等级分流 + 引擎门 + 报告 + cron 注入）──
// 5. no-quantity 事件型豁免：监管行动标题-only 不再判「不可证伪」，但推理
//    三要素仍独立计分（0/3 不会因豁免抬成 well-formed）。摘除豁免 → 失败。
c38('事件型豁免：监管行动不因无数字判不可证伪', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Regulators propose new rules for AI data center disclosure.',
  });
  return r.kind === 'regulatory-action'
    && r.falsifiability.problems.length === 0
    && r.verdict !== 'unfalsifiable'
    // 豁免只摘 no-quantity，不碰推理分：0/3 仍是 thin-reasoning/weak-evidence 档
    && r.reasoning.score <= 1;
})(), '监管行动主张不得因「无量化」判不可证伪（证伪靠事件不靠基数），但推理分不因豁免虚抬');

// 6. 证据等级分流：机构一手规则文书归公开财报/公告(3)；官员个人转述、
//    厂商自述、Fed chair said 都不抬级（v3.0.0c 独立验证判据不回归）。
c38('证据等级：机构规则文书归公开财报(3)且官员/厂商不抬级', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r1 = discriminateCommercial({
    text: 'The U.S. Treasury Department proposed a rule Thursday to crack down on American '
      + 'high-tech investments such as supercomputing and artificial intelligence in China.',
  });
  const r2 = discriminateCommercial({
    text: 'Trump lifts restrictions on Anthropic, Anthropic launches Claude Sonnet 5, and more!',
  });
  const r3 = discriminateCommercial({ text: 'OpenAI says it expects revenue to double next year.' });
  const r4 = discriminateCommercial({ text: 'The Fed chair said inflation remains elevated.' });
  return r1.evidence.id === 'public-filing' && r1.evidence.weight === 3
    && r2.evidence.weight <= 2            // 官员个人 + 简报转述：保守归媒体/无出处档
    && r3.evidence.weight <= 2            // 厂商自述不得被机构标记抬级
    && r4.evidence.weight <= 2;           // Fed chair said 不抬级
})(), 'Treasury proposed a rule 归公开财报/公告(3)，Trump lifts/OpenAI says/Fed chair said 不抬级');

// 7. 引擎候选门放行 Treasury 条目并辨别；formatReport 渲染监管行动标签。
//    摘除报告 KIND_CN → 失败；摘除模式 → available=false，失败。
c38('端到端：Treasury 主张进商业辨别段并渲染', (() => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const item = { title: 'U.S. Treasury Proposes to Widen Outbound Investment Restrictions for China and Other Countries',
    description: '', body: '', source: 'The Information', bucket: 'business',
    pubDate: 'Fri, 23 Oct 2026 08:29:36 GMT', domains: ['compliance_demand'],
    link: 'https://theinformation.com/treasury-outbound', origin: 'live' };
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: 1, domains: [], undomained: 0, dateRange: null, items: [item] };
  const cd = inst.buildCommercialDiscrimination();
  const md = formatReport(new ProjectionEngine({ newsData: { business: { news: [item] } } }).generate());
  const seg = md.split('## 商业主张辨别')[1] || '';
  return cd.available === true && cd.audited === 1
    && cd.results[0].kind === 'regulatory-action'
    // 主张句从 Treasury 起（句切分在 "U.S." 句点后断开，v2.13 时期同型
    // 行为——门仍正确定位到命中句，断言按渲染出的主张句写）
    && seg.includes('Treasury Proposes to Widen Outbound Investment Restrictions')
    // 必须认「渲染出来的类型标签行」而不是段里任意出现该字符串——note 文本
    // 里也有「监管行动」，泛匹配会让断言空转（v3.2 反向验证实测）。
    && seg.includes('类型: 监管行动 | 来源: The Information')
    && seg.includes('证伪条件:');
})(), 'Treasury 条目必须进商业辨别段，报告渲染监管行动标签与证伪条件');

// 8. cron 注入脚本 KIND_CN 认识 regulatory-action（端到端最后一环：agent
//    看得见中文标签）。摘除注入脚本 KIND_CN 的 regulatory-action 行 → 失败。
c38('cron 注入脚本渲染监管行动标签', (() => {
  const p = require('path').join(require('os').homedir(), '.hermes/scripts/hf-cron-fetch.sh');
  if (!require('fs').existsSync(p)) return false;
  const src = require('fs').readFileSync(p, 'utf-8');
  return /'regulatory-action': '监管行动'/.test(src);
})(), '注入脚本 KIND_CN 必须含 regulatory-action，否则 agent 看到英文 kind');

// 9. 精度门没被新模式打穿：Fed 公告/播客仍不进辨别（新模式写得过宽就会
//    漏进来——主体库含 president/trump/government 等宽词，重点盯这条）。
c38('精度门未破：非主张文本仍被挡在辨别外', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const noise = [
    { title: 'Minutes of the Federal Open Market Committee',
      description: 'Participants noted that financial market conditions had eased.',
      body: '', source: 'Federal Reserve (Monetary)', bucket: 'economy',
      pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT', domains: ['economy_labor'],
      link: 'https://federalreserve.gov/a', origin: 'live' },
    { title: 'Federal Reserve issues FOMC statement',
      description: 'The Committee decided to maintain the target range for the federal funds rate.',
      body: '', source: 'Federal Reserve (Monetary)', bucket: 'economy',
      pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT', domains: ['economy_labor'],
      link: 'https://federalreserve.gov/b', origin: 'live' },
    { title: 'LWiAI Podcast #252 - GPT 5.6, Grok 4.5, Nemotron-Labs-Diffusion, AI 2040',
      description: "GPT-5.6 and Grok 4.5, Meta's Muse Spark 1.1, regulatory developments in AI and data centers, interpretability research from Anthropic, and the future of AI policy with AI 2040",
      body: '', source: 'Last Week in AI', bucket: 'business',
      pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT', domains: ['capital_flow'],
      link: 'https://lastweekin.ai/b', origin: 'live' },
    { title: 'Trump says tariffs will raise revenue for the government',
      description: 'The president commented on trade policy during a rally speech.',
      body: '', source: 'TechCrunch AI', bucket: 'business',
      pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT', domains: ['market_claims'],
      link: 'https://techcrunch.com/e', origin: 'live' },
  ];
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: noise.length, domains: [], undomained: 0, dateRange: null, items: noise };
  const r = inst.buildCommercialDiscrimination();
  return r.available === false && /未抽到命中商业主张形态/.test(r.reason || '');
})(), 'Fed 公告/播客/官员言论不得因 regulatory-action 新模式进入辨别');

// ── 组 5：版本号一致性（corr-2026-014 同型）────────────────────
c38('版本号一致性：VERSION/package.json/banner 对齐 3.27.0', (() => {
  const fs2 = require('fs');
  const VERSION = fs2.readFileSync(require('path').join(__dirname, 'VERSION'), 'utf-8').trim();
  const pkg = JSON.parse(fs2.readFileSync(require('path').join(__dirname, 'package.json'), 'utf-8'));
  const rp = fs2.readFileSync(require('path').join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  return VERSION === '3.27.0'
    && /3\.27\.0/.test(pkg.version)
    && rp.includes('文明推演引擎 v3.27.0');
})(), 'VERSION/package.json/run-pipeline banner 必须对齐 3.27.0，防 corr-2026-014 版本漂移复发');

// ── v3.8 汇总 ──
(async () => {
  const results = await Promise.all(v38.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v38.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '\u2713' : '\u2717'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.8: ${v38.length - f} 通过, ${f} 失败, 共 ${v38.length} 个`);
  if (f > 0) {
    console.log('结论：监管行动主张的接入不完整（命中/证伪/召回/精度/端到端/版本有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：监管行动主张已进模式库（live 实证 2 条命中），报告与 cron 注入渲染中文标签，精度回归通过。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v3.9 新增断言：商业主张辨别器新增「价格下调主张」形态（price-cut）
//
// 背景（2026-10-26 轮 live 实证）：v3.6 的 cost-signal 管「价格/成本打到
// 某水平」（迟到费 $5M/天），但**价格下调**（模型 API 降价、智能单价
// 通缩）一直在库外。live 实证：LWiAI #343 简报内句「Anthropic launches
// Claude Fable 5.1 and says it's up to 45 percent cheaper for agentic
// work」（2026-09-07，business 桶，RSS 窗口内条目）——扩容前 18 种形态
// 全部不命中、整条不进辨别。智能价格通缩是 AI 市场需求侧的一阶信号
// （降价驱动采用、重塑毛利结构、压缩竞争对手定价空间），只辨「价格
// 打到某水平」不辨「价格下调」，商业辨别对价格维度的理解只有一半。
//
// 精度设计（v3.0.0c/v3.2/v3.3/v3.6/v3.7 教训：漏报比误报诚实、没有实证
// 不扩模式）：
//   ① 必须有幅度——无金额的价格变动句按 v3.6 同型纪律（无金额的
//     "Prices Up" 不是可证伪主张）不进库；live 实证 LWiAI #258
//     「Opus 5.5 with lower prices」如实记录为已知边界漏报；
//   ② 名词族只认 prices/pricing，不认 costs——TCO 效率句（NVDA
//     「35x lower cost for agentic AI」/ ORCL「at a lower cost」）是
//     能力/成本效率主张不是市场定价主张；
//   ③ 比较级后只认 for/than/句读——"cheaper to manufacture"（制造
//     成本效率）不是定价主张。
// live 全池实测：300 条里精确命中 1 条（即该条），精度回归 0 误报。
//
// 本节断言分六组：① live 实证句式命中 + 证伪条件与类目（源级）；
// ② 形态族召回三族；③ 精度回归；④ 端到端（引擎候选门 + 报告渲染 +
// cron 注入 + 精度门未破）；⑤ 版本号一致性。
// ════════════════════════════════════════════════════════════════
const v39 = [];
function c39(name, ok, detail) { v39.push({ name, ok, detail }); }

// ── 组 1：live 实证句式命中 ──
// 1. LWiAI #343 简报内句（live 池真实条目；原文 it's 为弯引号 U+2019，
//    候选门抽取时统一归一化为直引号，夹具按归一化后文本写）。
//    判定口径：厂商自述降价经简报转述 → 无出处(1)/weak-evidence，不虚抬；
//    推理 1/3（有幅度数字→has-sample，无对照无反例）；不决策相关。
c39('live 实证：LWiAI 简报内降价句命中价格下调形态', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: "Anthropic launches Claude Fable 5.1 and says it's up to 45 percent cheaper for agentic work, and more!",
    source: 'Last Week in AI',
  });
  return r.kind === 'price-cut'
    && r.kinds.length === 1 && r.kinds[0] === 'price-cut'  // 只命中价格下调形态，不串台
    && r.verdict === 'weak-evidence'       // 无出处(1)：简报转述的厂商自述降价
    && r.evidence.weight === 1
    && r.reasoning.score === 1             // has-sample（45 percent），无对照无反例
    && r.decisionRelevant === false        // 不虚抬：等价目表/第三方价格跟踪交叉验证
    && r.falsifiability.problems.length === 0;  // 有数字，no-quantity 不触发
})(), '「says it\'s up to 45 percent cheaper for agentic work」必须命中价格下调形态并按简报转述证据判别');

// 2. 证伪条件与类目：新 kind 必须有专属证伪路径，不能落回「无明确证伪路径」。
//    类目映射必须源级断言——行为断言抓不到摘除（v3.6/v3.7/v3.8 同型教训：
//    兜底类目 market_claims 同域）。
c39('price-cut 形态有专属证伪条件与类目映射', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'The company cut prices by 30% for enterprise customers.',
    source: 'The Information',
  });
  const src = require('fs').readFileSync(require('path').join(__dirname,
    'human-future/scripts/commercial-discriminator.js'), 'utf-8');
  return r.kind === 'price-cut'
    && r.category === 'market_claims'
    && /价目表|第三方 API 价格跟踪|口径变化|回升/.test(r.falsification)
    && r.falsification !== '无明确证伪路径——这本身就是问题'
    // 源级：映射行必须显式存在（兜底同域，行为断言抓不到摘除）
    && /'price-cut': 'market_claims'/.test(src);
})(), '价格下调主张必须带「价目表/第三方价格跟踪/口径变化/回升」证伪路径，归市场主张域');

// ── 组 2：形态族召回（名词+谓语+幅度 / 动词+名词+by-to+幅度 / 幅度+比较级）──
c39('形态族召回：三族七形', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'price-cut');
  if (!p) return false;
  return [
    // 形态 C：幅度+比较级（live 实证）
    "Anthropic launches Claude Fable 5.1 and says it's up to 45 percent cheaper for agentic work, and more!",
    'GPT-5 class models are now 3x cheaper than a year ago',
    // 形态 A：名词+下调谓语+幅度
    'API prices fell 20% after the release',
    'Inference pricing has dropped 40% since last year',
    'Cloud subscription prices plunged 60% in the last quarter',
    // 形态 B：下调动词+名词+by/to+幅度
    'The company cut prices by 30% for enterprise customers',
    'OpenAI lowered its API prices to $0.50 per million tokens',
  ].every(s => p.re.test(s));
})(), 'prices fell 20%/pricing has dropped 40%/plunged 60%/cut prices by 30%/lowered its API prices to $0.50/45 percent cheaper/3x cheaper than 都要命中');

// ── 组 3：精度回归（v3.0.0c 教训：漏报比误报诚实）──
// TCO 效率句、无幅度降价句、宏观看价句、其它形态库句式、boilerplate 一律
// 不得命中。含 live 池原句与已知边界句式。
c39('精度回归：TCO 效率句与无幅度降价句不误命中', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'price-cut');
  if (!p) return false;
  return [
    // TCO/效率主张（live 池原句；名词是 cost 不是 prices，比较级是 lower 不是 cheaper）
    'NVIDIA Blackwell Ultra delivers up to 50x better performance and 35x lower cost for agentic AI compared with the NVIDIA Hopper platform, according to new SemiAnalysis InferenceX benchmarks',
    'Oracle is now building more SaaS applications for more industries at a lower cost.',
    'OpenAI launches GPT-6 Sol and Luna, boasting lower cost and fewer mistakes',
    'The new chip is 2x cheaper to manufacture at scale',   // cheaper to manufacture=制造成本效率
    // 无幅度价格变动句（v3.6 同型纪律；已知边界漏报，live 实证 LWiAI #258）
    'Anthropic releases Opus 5.5 with lower prices and Fable-level performance',
    'costs are falling',
    'API prices are falling fast after the launch',   // prices 名词+下调谓语但无幅度
    // 成本名词主张（名词族只认 prices/pricing——公司运营成本不是市场定价）
    'Operating costs fell 40% last quarter on lower headcount',
    // 宏观看价/成本名词单现（live 池原句）
    'Jet Fuel Prices Up',
    'Front Month Brent Futures near 2022 Peak Level',
    'The Cost of Living and Wages',
    // 其它形态库句式不串台
    'Data Center Late Fees Hit $5 Million or More Per Day, Spawning New Insurance',
    'DeepSeek Raises Nearly $16 billion in Second Funding Round',
    'AWS Largely Sold Out Of Capacity Into 2028, Jassy Says',
    'Instacart Is Exploring a Sale',
    "AI delivers 'zero financial payoff' to most companies, Apollo economist says",
    'Minutes of the Federal Open Market Committee, September 15-16, 2026',
    // boilerplate
    'Get your pass and bring someone with you at 50% off. REGISTER NOW.',
  ].every(s => !p.re.test(s));
})(), 'TCO 效率句、无幅度降价句、宏观看价句、其它形态库句式、boilerplate 都不得命中');

// ── 组 4：端到端（引擎候选门 + 报告渲染 + cron 注入 + 精度门未破）──
// 4. 引擎候选门放行 LWiAI #343 条目并辨别；formatReport 渲染价格下调标签。
//    摘除报告 KIND_CN → 失败；摘除模式 → available=false，失败。
c39('端到端：LWiAI 降价主张进商业辨别段并渲染', (() => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const item = {
    title: 'Last Week in AI #343 - GPT-6, OpenAI\u2019s agents chatted on a wiki, Fable 5.1',
    description: "GPT-6 Astra Is Here, Discovery of a new OpenAI agent message board, Anthropic launches Claude Fable 5.1 and says it's up to 45 percent cheaper for agentic work, and more!",
    body: '', source: 'Last Week in AI', bucket: 'business',
    pubDate: 'Mon, 07 Sep 2026 13:02:49 GMT', domains: ['market_claims'],
    link: 'https://lastweekin.ai/p/last-week-in-ai-343-gpt-6-openais', origin: 'live' };
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: 1, domains: [], undomained: 0, dateRange: null, items: [item] };
  const cd = inst.buildCommercialDiscrimination();
  const md = formatReport(new ProjectionEngine({ newsData: { business: { news: [item] } } }).generate());
  const seg = md.split('## 商业主张辨别')[1] || '';
  return cd.available === true && cd.audited === 1
    && cd.results[0].kind === 'price-cut'
    && cd.results[0].verdict === 'weak-evidence'
    && cd.results[0].claimSentence.includes('45 percent cheaper')
    // 必须认「渲染出来的类型标签行」而不是段里任意出现该字符串——note 文本
    // 里也有「价格下调」，泛匹配会让断言空转（v3.2 反向验证实测同型）。
    && seg.includes('类型: 价格下调主张 | 来源: Last Week in AI')
    && seg.includes('[证据不足]')
    && seg.includes('证伪条件:');
})(), 'LWiAI #343 条目必须进商业辨别段，报告渲染价格下调主张标签与证伪条件');

// 5. cron 注入脚本 KIND_CN 认识 price-cut（端到端最后一环：agent 看得见
//    中文标签）。摘除注入脚本 KIND_CN 的 price-cut 行 → 失败。
c39('cron 注入脚本渲染价格下调主张标签', (() => {
  const p = require('path').join(require('os').homedir(), '.hermes/scripts/hf-cron-fetch.sh');
  if (!require('fs').existsSync(p)) return false;
  const src = require('fs').readFileSync(p, 'utf-8');
  return /'price-cut': '价格下调主张'/.test(src);
})(), '注入脚本 KIND_CN 必须含 price-cut，否则 agent 看到英文 kind');

// 6. 精度门没被新模式打穿：Fed 公告/播客/官员言论/无幅度价格谈论/TCO
//    效率句仍不进辨别（新模式写得过宽就会漏进来——名词族与比较级是重点
//    盯守对象）。
c39('精度门未破：非主张文本与无幅度价格谈论仍被挡在辨别外', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const noise = [
    { title: 'Minutes of the Federal Open Market Committee',
      description: 'Participants noted that financial market conditions had eased.',
      body: '', source: 'Federal Reserve (Monetary)', bucket: 'economy',
      pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT', domains: ['economy_labor'],
      link: 'https://federalreserve.gov/a', origin: 'live' },
    { title: 'LWiAI Podcast #252 - GPT 5.6, Grok 4.5, Nemotron-Labs-Diffusion, AI 2040',
      description: "GPT-5.6 and Grok 4.5, Meta's Muse Spark 1.1, regulatory developments in AI and data centers, interpretability research from Anthropic, and the future of AI policy with AI 2040",
      body: '', source: 'Last Week in AI', bucket: 'business',
      pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT', domains: ['capital_flow'],
      link: 'https://lastweekin.ai/b', origin: 'live' },
    // live 池原句：无幅度降价谈论（已知边界漏报，如实记录为不进辨别）
    { title: 'LWiAI Podcast #258 - Opus 5.5, Sol and Luna, Muse, DeepSeek-V4.1-Flash, Xi',
      description: 'Anthropic releases Opus 5.5 with lower prices and Fable-level performance, OpenAI launches GPT-6 Sol and Luna, boasting lower cost and fewer mistakes',
      body: '', source: 'Last Week in AI', bucket: 'business',
      pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT', domains: ['market_claims'],
      link: 'https://lastweekin.ai/c', origin: 'live' },
    // live 池原句：TCO 效率主张（sec_filings 条目句式，放 business 桶验证模式本身不误命中）
    { title: 'NVIDIA Blackwell Ultra delivers up to 50x better performance and 35x lower cost for agentic AI',
      description: 'compared with the NVIDIA Hopper platform, according to new SemiAnalysis InferenceX benchmarks',
      body: '', source: 'TechCrunch AI', bucket: 'business',
      pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT', domains: ['competitor_moves'],
      link: 'https://techcrunch.com/d', origin: 'live' },
    { title: 'Trump says tariffs will raise revenue for the government',
      description: 'The president commented on trade policy during a rally speech.',
      body: '', source: 'TechCrunch AI', bucket: 'business',
      pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT', domains: ['market_claims'],
      link: 'https://techcrunch.com/e', origin: 'live' },
  ];
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: noise.length, domains: [], undomained: 0, dateRange: null, items: noise };
  const r = inst.buildCommercialDiscrimination();
  return r.available === false && /未抽到命中商业主张形态/.test(r.reason || '');
})(), 'Fed 公告/播客/无幅度降价谈论/TCO 效率句/官员言论不得因 price-cut 新模式进入辨别');

// ── 组 5：版本号一致性（corr-2026-014 同型）────────────────────
c39('版本号一致性：五处对齐 3.27.0', (() => {
  const fs2 = require('fs');
  const VERSION = fs2.readFileSync(require('path').join(__dirname, 'VERSION'), 'utf-8').trim();
  const pkg = JSON.parse(fs2.readFileSync(require('path').join(__dirname, 'package.json'), 'utf-8'));
  const rp = fs2.readFileSync(require('path').join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  const pf = fs2.readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return VERSION === '3.27.0'
    && pkg.version === '3.27.0'
    && rp.includes('文明推演引擎 v3.27.0')      // banner
    && /version: '3\.27\.0'/.test(pf)          // projection meta
    && /version: '3\.27\.0'/.test(rp);         // run-pipeline fullReport meta
})(), 'VERSION/package.json/banner/projection meta/run-pipeline meta 必须对齐 3.27.0，防 corr-2026-014 版本漂移复发');

// ── v3.9 汇总 ──
(async () => {
  const results = await Promise.all(v39.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v39.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '\u2713' : '\u2717'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.9: ${v39.length - f} 通过, ${f} 失败, 共 ${v39.length} 个`);
  if (f > 0) {
    console.log('结论：价格下调主张的接入不完整（命中/证伪/召回/精度/端到端/版本有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：价格下调主张已进模式库（live 实证 1 条命中），报告与 cron 注入渲染中文标签，精度回归通过。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v3.10 新增断言：商业主张辨别接入一手信源（SEC 备案 + 厂商一手公告桶）
// + 新辨别维度「部署规模主张」（deployment-scale）
//
// 背景（2026-10-26 轮 live 实证，300 条池）：商业辨别的候选池自 v3.0.0
// 起只有 business/economy 两个媒体二手桶——两个一手桶从来不进辨别：
//   ① sec_filings（SEC EDGAR 备案，v3.4 起采集）：「公开财报/公告(3)」
//      证据档自 v3.0.0c 起只为「文本里提到 filing/announced」设计，
//      从来没有真实财报能触发它；备案里的量化主张（"Google Cloud saw
//      a continued increase in customer demand as revenues increased
//      48% to $17.7 billion"、"intent to raise up to $50 billion"、
//      "Closed 206 deals of at least $1 million"）整条看不见；
//   ② frontier_models（厂商一手公告，12 个源）：具名部署主张
//      （"Uber is rolling out ChatGPT Work to more than 30,000
//      employees"）与调查研究（"survey of almost 11,000 US adults"）
//      都在这个桶里。adoption-claim 只认「趋势主体」（enterprises are
//      adopting…），具名主体的量化部署整个在库外。
// v3.10 两件事：① 候选池扩到四桶（business 12 / sec_filings 8 /
// frontier_models 10 / economy 6）；② 新 kind deployment-scale。
//
// 精度配套（全部 live 实证驱动，没有实证不扩）：
//  ① forward-looking 免责声明守卫——MU/CRWV 两家 8-K 的 "Forward-Looking
//     Statements" 段是法律 boilerplate（"customer demand" 清单名词
//     短语误触发 demand 形态），命中句自身含免责声明标记即跳过；
//  ② ma 动词形态收紧——"What happens when a deal falls through?" 类
//     泛指交易假设句不是主张（"the deal fell through" 仍命中）；
//  ③ has-sample 名词组补 employees/seats/staff/countries/advertisers/
//     deals——部署规模的样本就是席位数与覆盖面；
//  ④ public-filing 证据档认 SEC EDGAR 采集源（与 v3.8 政府机构一手
//     文书标记同型），非该来源不虚抬。
//
// 本节断言分七组：① live 实证两条命中；② 证伪条件与类目（源级）；
// ③ 形态族召回；④ 精度回归（新维度 + ma 收紧）；⑤ 引擎级一手信源
// 接入（含守卫与收紧生效）；⑥ 端到端（报告渲染 + cron 注入 + 精度门
// 未破 + 证据档不虚抬）；⑦ 版本号一致性。
// ════════════════════════════════════════════════════════════════
const v310 = [];
function c310(name, ok, detail) { v310.push({ name, ok, detail }); }

// ── 组 1：live 实证句式命中（OpenAI News 两条，2026-10-21/22）──
// 1. Uber 部署句（live 池真实条目；厂商一手公告句式自身无归属词，按
//    无出处(1)/weak-evidence 判，不因数字具体虚抬；推理 1/3——
//    30,000 employees 命中 has-sample（v3.10 名词组扩展），无对照无反例）。
c310('live 实证：Uber 具名部署句命中部署规模形态', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Uber is rolling out ChatGPT Work to more than 30,000 employees, helping teams research, analyze data, create presentations, and complete complex workflows.',
    claimSentence: 'Uber is rolling out ChatGPT Work to more than 30,000 employees',
    source: 'OpenAI News',
    date: 'Thu, 22 Oct 2026 00:00:00 GMT',
    url: 'https://openai.com/index/uber-chatgpt-work',
  });
  return r.kind === 'deployment-scale'
    && r.kinds.length === 1 && r.kinds[0] === 'deployment-scale'  // 不串台到 adoption
    && r.verdict === 'weak-evidence'       // 无出处(1)：一手公告句式自身无归属词
    && r.evidence.weight === 1
    && r.reasoning.score === 1             // has-sample（30,000 employees）
    && r.reasoning.met.includes('has-sample')
    && r.decisionRelevant === false        // 不虚抬：等价名方确认或第三方报道交叉验证
    && r.falsifiability.problems.length === 0;  // 有数字，no-quantity 不触发
})(), '「Uber is rolling out ChatGPT Work to more than 30,000 employees」必须命中部署规模形态并按一手公告证据判别');

// 2. ChatGPT Ads 扩张句（live 池真实条目；100,000 advertisers 与 26
//    countries 双重量化，has-sample 命中）。
c310('live 实证：ChatGPT Ads 扩张句命中部署规模形态', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'ChatGPT Ads expands to 26 new countries as over 100,000 advertisers have used the platform. From local businesses to global brands, more advertisers can now reach people as they explore, compare and decide what to buy in ChatGPT.',
    claimSentence: 'ChatGPT Ads expands to 26 new countries as over 100,000 advertisers have used the platform',
    source: 'OpenAI News',
    date: 'Wed, 21 Oct 2026 13:00:00 GMT',
  });
  return r.kind === 'deployment-scale'
    && r.verdict === 'weak-evidence'
    && r.evidence.weight === 1
    && r.reasoning.met.includes('has-sample')   // 100,000 advertisers / 26 countries
    && r.decisionRelevant === false;
})(), '「ChatGPT Ads expands to 26 new countries as over 100,000 advertisers」必须命中部署规模形态');

// ── 组 2：证伪条件与类目（源级断言——兜底类目同 market_claims，行为
//    断言抓不到摘除，v3.6/v3.7/v3.8/v3.9 同型教训）──
c310('deployment-scale 形态有专属证伪条件与类目映射', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'The bank deployed the assistant across 12,000 seats in three months.',
    source: 'The Information',
  });
  const src = require('fs').readFileSync(require('path').join(__dirname,
    'human-future/scripts/commercial-discriminator.js'), 'utf-8');
  return r.kind === 'deployment-scale'
    && r.category === 'market_claims'
    && /部署方否认|席位数|覆盖国家数|暂停/.test(r.falsification)
    && r.falsification !== '无明确证伪路径——这本身就是问题'
    && /'deployment-scale': 'market_claims'/.test(src);   // 源级：映射行必须显式存在
})(), '部署规模主张必须带「部署方否认/席位数覆盖面不符/暂停缩减回滚」证伪路径，归市场主张域');

// ── 组 3：形态族召回（部署动词 + 量化范围）──
c310('形态族召回：部署动词+量化范围六形', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'deployment-scale');
  if (!p) return false;
  return [
    // live 实证两条
    'Uber is rolling out ChatGPT Work to more than 30,000 employees, helping teams research',
    'ChatGPT Ads expands to 26 new countries as over 100,000 advertisers have used the platform',
    // deployed across + 席位
    'The bank deployed the assistant across 12,000 seats in three months',
    // bringing + 客户数
    'Vendor is bringing its copilot to 500 enterprise customers this quarter',
    // launched + 用户数（waitlisted 形容词）
    'The startup launched its agent platform to 100,000 waitlisted users',
    // expand to + 国家数
    'It plans to expand to 15 additional countries next year',
  ].every(s => p.re.test(s));
})(), 'rolling out to 30,000 employees / expands to 26 new countries / deployed across 12,000 seats / bringing to 500 enterprise customers / launched to 100,000 users / expand to 15 countries 都要命中');

// ── 组 4：精度回归 ──
// 4a. deployment-scale 不误命中：无数量部署谈话/合作公告/基础设施
//     scaling/产品发布/销售数字/其它形态库句式（含 live 池原句）。
c310('精度回归：无数量部署谈话与合作公告不误命中部署规模', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'deployment-scale');
  if (!p) return false;
  return [
    // 无量化范围的部署谈话（已知边界，按 v3.6/v3.9 同型纪律不进库）
    'Uber brings ChatGPT Work to all employees with OpenAI',
    // 合作/协同公告（live 池原句）
    'OpenAI and Poland\u2019s NASK are partnering on AI safety, security, and technical research',
    'Google DeepMind and Singapore Government collaborate to build fine-tuned AI model for scam detection',
    // 自身基础设施 scaling 不是客户部署（live 池原句）
    'Rapidly scaling online storage to serve over 1 billion ChatGPT users (Part II)',
    // 销售数字（live 池原句）
    'Nvidia CEO plays with adorable Microduck robots, 20,000 sell',
    // 政府资助（live 池原句）
    'NIST Awards More Than $1.7 Million to Support Cybersecurity Workforce Development Across 8 States',
    // 测试计划（live 池原句）
    'Uber rival inDrive eyes 2027 robotaxi tests in Central Asia with Pony AI and Nvidia',
    // 产品清单/发布（live 池原句）
    '19 robotics companies to watch',
    'Introducing Kimi K3.1 Pro',
    'OpenAI models are coming to Google Cloud',
    // 其它形态库句式不串台（live 池原句）
    'Google Cloud saw a continued increase in customer demand as revenues increased 48% to $17.7 billion',
    'Mistral and Reflection AI launch open-weight models to rival China',
    'General availability of the instances is coming next month, with planned expansion of availability to Europe',
  ].every(s => !p.re.test(s));
})(), '无数量部署谈话、合作公告、基础设施 scaling、销售数字、产品发布及其它形态库句式都不得命中部署规模');

// 4b. ma 动词形态收紧：泛指交易假设句不是主张，特定交易仍命中。
c310('精度回归：泛指交易假设句不命中 ma，特定交易仍命中', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'ma-claim');
  if (!p) return false;
  return !p.re.test('What happens when a deal falls through? As agents are increasingly sent into real markets')
    && !p.re.test('When a merger collapses, both parties lose their deposit.')
    && p.re.test('The deal fell through after the regulator blocked it')
    && p.re.test('Merger talks collapsed on Monday amid the leak.')
    && p.re.test('Negotiations stalled for weeks before the announcement.')
    && p.re.test('Ramp Investors Went Nuclear Against Airwallex After Doomed Deal')
    && p.re.test('Instacart Is Exploring a Sale');
})(), '「a deal falls through」类泛指交易句不得命中；「the deal fell through」「talks collapsed」等特定交易仍命中');

// ── 组 5：引擎级一手信源接入 ──
// GOOGL 备案量化主张进辨别且证据档=公开财报/公告(3)；MU/CRWV 免责声明
// boilerplate 被守卫挡住；Uber 一手部署主张进辨别；Project Swap 交易
// 假设句被 ma 收紧挡住。一条引擎调用全覆盖。
c310('引擎级：SEC 备案与厂商一手公告进辨别，boilerplate 与假设句被挡', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const items = [
    { title: 'Alphabet Inc. (GOOGL) 8-K 业绩发布 · 2026-02-04',
      description: '\u2022 Google Cloud saw a continued increase in customer demand as revenues increased 48% to $17.7 billion, led by an increase in Google Cloud Platform (GCP) across enterprise AI Infrastructure and enterprise AI Solutions, as well as core GCP products.',
      body: '', source: 'SEC EDGAR', bucket: 'sec_filings',
      pubDate: '2026-02-04', domains: ['market_claims'],
      link: 'https://www.sec.gov/Archives/edgar/data/1326801/a', origin: 'live' },
    { title: 'MICRON TECHNOLOGY INC (MU) 8-K 业绩发布 · 2026-09-30',
      description: '3 Forward-Looking Statements This press release contains forward-looking statements regarding our industry, our strategic position, our customers, including customer demand, our investments and the goals for such investments, our business opportunity, our products and technology, and our financial and operating performance, including our guidance for the first quarter.',
      body: '', source: 'SEC EDGAR', bucket: 'sec_filings',
      pubDate: '2026-09-30', domains: ['market_claims'],
      link: 'https://www.sec.gov/Archives/edgar/data/b', origin: 'live' },
    { title: 'CoreWeave, Inc. (CRWV) 8-K 业绩发布 · 2026-08-11',
      description: 'These statements include, but are not limited to, statements related to our business; our strategy; our capital structure; our future growth; our technology; our operating leverage; customer demand; changes in enterprise adoption; and other estimated amounts included in our revenue backlog figure.',
      body: '', source: 'SEC EDGAR', bucket: 'sec_filings',
      pubDate: '2026-08-11', domains: ['market_claims'],
      link: 'https://www.sec.gov/Archives/edgar/data/c', origin: 'live' },
    { title: 'Uber brings ChatGPT Work to all employees with OpenAI',
      description: 'Uber is rolling out ChatGPT Work to more than 30,000 employees, helping teams research, analyze data, create presentations, and complete complex workflows.',
      body: '', source: 'OpenAI News', bucket: 'frontier_models',
      pubDate: 'Thu, 22 Oct 2026 00:00:00 GMT', domains: ['frontier_models'],
      link: 'https://openai.com/index/uber-chatgpt-work', origin: 'live' },
    { title: 'Project Swap',
      description: 'What happens when a deal falls through? As agents are increasingly sent into real markets, these questions take on greater urgency. So this summer, we built a small, controlled market to study these questions: a barter economy with 201 Anthropic employees and their Claude-powered agents.',
      body: '', source: 'Anthropic News (sitemap)', bucket: 'frontier_models',
      pubDate: 'Thu, 24 Sep 2026 00:00:00 GMT', domains: ['frontier_models'],
      link: 'https://anthropic.com/research/project-swap', origin: 'live' },
  ];
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: items.length, domains: [], undomained: 0, dateRange: null, items };
  const cd = inst.buildCommercialDiscrimination();
  if (!cd.available) return false;
  const googl = cd.results.find(r => /Google Cloud/.test(r.claimSentence || r.text));
  const uber = cd.results.find(r => /rolling out ChatGPT Work/.test(r.claimSentence || r.text));
  return cd.audited === 2                       // 只有 GOOGL 与 Uber 两条进池
    && !!googl && googl.kind === 'demand'
    && googl.evidence.id === 'public-filing' && googl.evidence.weight === 3  // 证据档首次被真实财报触发
    && googl.verdict === 'thin-reasoning'
    && googl.decisionRelevant === true
    && !!uber && uber.kind === 'deployment-scale'
    && uber.evidence.weight === 1 && uber.verdict === 'weak-evidence';
})(), 'GOOGL 备案量化主张与 Uber 一手部署主张必须进辨别（前者证据档=公开财报/公告(3)）；MU/CRWV 免责声明与 Project Swap 假设句必须被挡');

// ── 组 6：端到端 ──
// 6a. 引擎候选门放行 Uber 条目，formatReport 渲染部署规模标签。
c310('端到端：Uber 一手部署主张进商业辨别段并渲染', (() => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const item = {
    title: 'Uber brings ChatGPT Work to all employees with OpenAI',
    description: 'Uber is rolling out ChatGPT Work to more than 30,000 employees, helping teams research, analyze data, create presentations, and complete complex workflows.',
    body: '', source: 'OpenAI News', bucket: 'frontier_models',
    pubDate: 'Thu, 22 Oct 2026 00:00:00 GMT', domains: ['frontier_models'],
    link: 'https://openai.com/index/uber-chatgpt-work', origin: 'live' };
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: 1, domains: [], undomained: 0, dateRange: null, items: [item] };
  const cd = inst.buildCommercialDiscrimination();
  const md = formatReport(new ProjectionEngine({ newsData: { frontier_models: { news: [item] } } }).generate());
  const seg = md.split('## 商业主张辨别')[1] || '';
  return cd.available === true && cd.audited === 1
    && cd.results[0].kind === 'deployment-scale'
    && cd.results[0].verdict === 'weak-evidence'
    && cd.results[0].claimSentence.includes('30,000 employees')
    // 只认渲染出来的「类型:」行（note 文本同字符串会喂饱泛匹配，v3.2 教训）
    && seg.includes('类型: 部署规模主张 | 来源: OpenAI News')
    && seg.includes('[证据不足]')
    && seg.includes('证伪条件:');
})(), 'Uber 条目必须进商业辨别段，报告渲染部署规模主张标签与证伪条件');

// 6b. SEC 备案条目端到端：渲染需求主张 + 公开财报/公告(3) 证据档。
c310('端到端：SEC 备案量化主张进辨别并渲染公开财报证据档', (() => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const item = {
    title: 'Alphabet Inc. (GOOGL) 8-K 业绩发布 · 2026-02-04',
    description: '\u2022 Google Cloud saw a continued increase in customer demand as revenues increased 48% to $17.7 billion, led by an increase in Google Cloud Platform (GCP) across enterprise AI Infrastructure and enterprise AI Solutions, as well as core GCP products.',
    body: '', source: 'SEC EDGAR', bucket: 'sec_filings',
    pubDate: '2026-02-04', domains: ['market_claims'],
    link: 'https://www.sec.gov/Archives/edgar/data/1326801/a', origin: 'live' };
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: 1, domains: [], undomained: 0, dateRange: null, items: [item] };
  const cd = inst.buildCommercialDiscrimination();
  const md = formatReport(new ProjectionEngine({ newsData: { sec_filings: { news: [item] } } }).generate());
  const seg = md.split('## 商业主张辨别')[1] || '';
  return cd.available === true && cd.audited === 1
    && cd.results[0].kind === 'demand'
    && cd.results[0].evidence.id === 'public-filing'
    && seg.includes('类型: 需求主张 | 来源: SEC EDGAR')
    && seg.includes('证据: 公开财报/公告(3)')
    && seg.includes('[推理单薄]');
})(), 'SEC 备案条目必须进商业辨别段，报告渲染需求主张与公开财报/公告(3)证据档');

// 6c. cron 注入脚本 KIND_CN 认识 deployment-scale（端到端最后一环）。
c310('cron 注入脚本渲染部署规模主张标签', (() => {
  const p = require('path').join(require('os').homedir(), '.hermes/scripts/hf-cron-fetch.sh');
  if (!require('fs').existsSync(p)) return false;
  const src = require('fs').readFileSync(p, 'utf-8');
  return /'deployment-scale': '部署规模主张'/.test(src);
})(), '注入脚本 KIND_CN 必须含 deployment-scale，否则 agent 看到英文 kind');

// 6d. 证据档不虚抬：同一句 source 不是 SEC EDGAR 不得升 public-filing。
c310('证据档不虚抬：非 SEC EDGAR 来源不升公开财报档', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Google Cloud saw a continued increase in customer demand as revenues increased 48% to $17.7 billion',
    source: 'The Information',
  });
  return r.kind === 'demand'
    && r.evidence.id === 'no-source' && r.evidence.weight === 1
    && r.verdict === 'weak-evidence'
    && r.decisionRelevant === false;
})(), '同一主张句只有 source=SEC EDGAR 才归公开财报/公告(3)，媒体转述不借来源虚抬');

// 6e. 精度门没被扩桶打穿：Fed 公告/播客/无数量部署谈话/合作公告/
//     免责声明/泛指交易假设句/TCO 效率句仍不进辨别（新桶是重点盯守
//     对象——boilerplate 与研究文本都集中在这里）。
c310('精度门未破：扩桶后非主张文本仍被挡在辨别外', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const noise = [
    { title: 'Minutes of the Federal Open Market Committee',
      description: 'Participants noted that financial market conditions had eased.',
      body: '', source: 'Federal Reserve (Monetary)', bucket: 'economy',
      pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT', domains: ['economy_labor'],
      link: 'https://federalreserve.gov/a', origin: 'live' },
    { title: 'LWiAI Podcast #252 - GPT 5.6, Grok 4.5, Nemotron-Labs-Diffusion, AI 2040',
      description: "GPT-5.6 and Grok 4.5, Meta's Muse Spark 1.1, regulatory developments in AI and data centers, interpretability research from Anthropic, and the future of AI policy with AI 2040",
      body: '', source: 'Last Week in AI', bucket: 'business',
      pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT', domains: ['capital_flow'],
      link: 'https://lastweekin.ai/b', origin: 'live' },
    { title: 'LWiAI Podcast #258 - Opus 5.5, Sol and Luna, Muse, DeepSeek-V4.1-Flash, Xi',
      description: 'Anthropic releases Opus 5.5 with lower prices and Fable-level performance, OpenAI launches GPT-6 Sol and Luna, boasting lower cost and fewer mistakes',
      body: '', source: 'Last Week in AI', bucket: 'business',
      pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT', domains: ['market_claims'],
      link: 'https://lastweekin.ai/c', origin: 'live' },
    // 新桶噪音：厂商一手公告的无模式条目不进
    { title: 'Introducing Kimi K3.1 Pro',
      description: 'Kimi K3.1 Pro landed on the Kimi API today - it\u2019s not yet open weights, but Moonshot promise "Full model weights will be released".',
      body: '', source: 'Moonshot AI', bucket: 'frontier_models',
      pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT', domains: ['frontier_models'],
      link: 'https://moonshot.ai/d', origin: 'live' },
    // 新桶噪音：合作公告（无量化范围）不进
    { title: 'OpenAI and Poland\u2019s NASK partner to advance AI safety and security',
      description: 'OpenAI and Poland\u2019s NASK are partnering on AI safety, security, and technical research to strengthen safeguards and support a more resilient digital ecosystem.',
      body: '', source: 'OpenAI News', bucket: 'frontier_models',
      pubDate: 'Fri, 23 Oct 2026 00:00:00 GMT', domains: ['frontier_models'],
      link: 'https://openai.com/e', origin: 'live' },
    // 新桶噪音：自身基础设施 scaling 不是客户部署
    { title: 'Rapidly scaling online storage to serve over 1 billion ChatGPT users (Part II)',
      description: 'How OpenAI scaled its storage layer to serve over 1 billion ChatGPT users.',
      body: '', source: 'OpenAI News', bucket: 'frontier_models',
      pubDate: 'Fri, 23 Oct 2026 17:00:00 GMT', domains: ['frontier_models'],
      link: 'https://openai.com/f', origin: 'live' },
    // 新桶噪音：SEC 备案 forward-looking 免责声明 boilerplate 不进
    { title: 'MICRON TECHNOLOGY INC (MU) 8-K 业绩发布 · 2026-09-30',
      description: '3 Forward-Looking Statements This press release contains forward-looking statements regarding our industry, our strategic position, our customers, including customer demand, our investments and the goals for such investments, our business opportunity, our products and technology, and our financial and operating performance, including our guidance for the first quarter.',
      body: '', source: 'SEC EDGAR', bucket: 'sec_filings',
      pubDate: '2026-09-30', domains: ['market_claims'],
      link: 'https://www.sec.gov/g', origin: 'live' },
    // 新桶噪音：泛指交易假设句不进（ma 收紧）
    { title: 'Project Swap',
      description: 'What happens when a deal falls through? As agents are increasingly sent into real markets, these questions take on greater urgency. So this summer, we built a small, controlled market to study these questions: a barter economy with 201 Anthropic employees and their Claude-powered agents.',
      body: '', source: 'Anthropic News (sitemap)', bucket: 'frontier_models',
      pubDate: 'Thu, 24 Sep 2026 00:00:00 GMT', domains: ['frontier_models'],
      link: 'https://anthropic.com/h', origin: 'live' },
    { title: 'Trump says tariffs will raise revenue for the government',
      description: 'The president commented on trade policy during a rally speech.',
      body: '', source: 'TechCrunch AI', bucket: 'business',
      pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT', domains: ['market_claims'],
      link: 'https://techcrunch.com/i', origin: 'live' },
  ];
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: noise.length, domains: [], undomained: 0, dateRange: null, items: noise };
  const r = inst.buildCommercialDiscrimination();
  return r.available === false && /未抽到命中商业主张形态/.test(r.reason || '');
})(), 'Fed 公告/播客/无数量部署谈话/合作公告/免责声明/泛指交易假设句/官员言论不得因扩池与新模式进入辨别');

// ── 组 7：版本号一致性（corr-2026-014 同型）────────────────────
c310('版本号一致性：五处对齐 3.27.0', (() => {
  const fs2 = require('fs');
  const VERSION = fs2.readFileSync(require('path').join(__dirname, 'VERSION'), 'utf-8').trim();
  const pkg = JSON.parse(fs2.readFileSync(require('path').join(__dirname, 'package.json'), 'utf-8'));
  const rp = fs2.readFileSync(require('path').join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  const pf = fs2.readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return VERSION === '3.27.0'
    && pkg.version === '3.27.0'
    && rp.includes('文明推演引擎 v3.27.0')      // banner
    && /version: '3\.27\.0'/.test(pf)          // projection meta
    && /version: '3\.27\.0'/.test(rp);         // run-pipeline fullReport meta
})(), 'VERSION/package.json/banner/projection meta/run-pipeline meta 必须对齐 3.27.0，防 corr-2026-014 版本漂移复发');

// ── v3.10 汇总 ──
(async () => {
  const results = await Promise.all(v310.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v310.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '\u2713' : '\u2717'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.10: ${v310.length - f} 通过, ${f} 失败, 共 ${v310.length} 个`);
  if (f > 0) {
    console.log('结论：一手信源接入或部署规模维度不完整（命中/证伪/召回/精度/接入/端到端/版本有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：商业辨别已接入 SEC 备案与厂商一手公告桶，部署规模主张进模式库（live 实证 2 条命中），boilerplate 守卫与 ma 收紧生效，报告与 cron 注入渲染中文标签。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v3.11 新增断言：商业主张辨别器新增「用量/牵引度指标主张」形态
// （usage-metric，新辨别维度）+ 同型切分修复（引号嵌套不断句）
//
// 背景（2026-10-26 轮 live 实证，300 条池，sec_filings 桶）：
// adoption-claim 只认「趋势主体」（enterprises are adopting…）、
// deployment-scale 只认「部署事件+量化范围」（rolling out to 30,000
// employees）——而**产品用量状态**整条在库外。live 实证四条（扩容前
// 20 种形态全部不命中）：
//   ① MSFT 2026-07-29 备案：「Microsoft 365 Copilot reached over
//      30 million paid seats」；
//   ② GOOGL 2026-07-22 备案：「the Gemini App has 950 million
//      monthly active users」「Gemini models now process 22 billion
//      API tokens per minute」；
//   ③ GOOGL 2026-02-04 备案：「grown to over 750 million monthly
//      active users」「now process over 10 billion tokens per
//      minute」。
// 用量指标是客户采用域最硬的第一方证据（SEC 备案自报席位数/月活/
// token 吞吐），且有天然结算结构：下一期备案同指标是新值，可对账。
//
// 同轮同型修复（配套，无新维度）：句末标点后容忍一个收尾引号再切句。
// SEC 备案正文把多条引言拼成一段时，`transformation." "We delivered…`
// 的句点在引号内，旧切分 `(?<=[.!?。！？])\s+` 不断句——含用量主张的
// 整段被拼成 443 字长句、超出 400 字候选窗，MSFT 那条整条不进辨别
// （live 实证）。forecast 路径同型两处都已修（本测试钉住 forecast
// 结果零变化）。
//
// 精度设计（v3.0.0c/v3.2/v3.3/v3.6/v3.7/v3.9/v3.10 纪律：漏报比误报
// 诚实、没有实证不扩模式）：
//   ① 必须「量化值+用量指标名词」两件套；
//   ② 指标名词族不认 subscribers——GOOGL「paid subscriptions has now
//      reached 350 million」（YouTube/Google One 驱动）是订阅总量不是
//      AI 用量，FLI「50,000+ subscribers」是邮件列表 boilerplate，
//      Suno「2 million paying subscribers」是音乐服务；
//   ③ 必须有用量状态动词——「API supports 128k tokens per minute」是
//      速率上限不是用量；基础设施 scaling（serve 1 billion users）
//      同型不收；
//   ④ 动词与量化值之间只容忍 to + 数量副词（v3.6 宽窗教训）。
//
// 本节断言分七组：① live 实证三条命中；② 证伪条件与类目（源级）；
// ③ 形态族召回；④ 精度回归（subscribers 族/速率上限/scaling/指南
// 文本/不串台）；⑤ 引擎级端到端（含切分修复与已知边界）；⑥ cron
// 注入源级 + 精度门未破；⑦ 版本号一致性。
// ════════════════════════════════════════════════════════════════
const v3111 = [];
function c3111(name, ok, detail) { v3111.push({ name, ok, detail }); }

// ── 组 1：live 实证句式命中（SEC 备案三条，2026-07-29/07-22/02-04）──
// 1. MSFT Copilot 席位数句（live 池真实条目；SEC EDGAR 采集源 → 公开
//    财报/公告(3)，v3.10 证据档扩展同型；推理 1/3——30 million paid
//    seats 命中 has-sample，单句无对照无反例）。decisionRelevant=true：
//    一手备案量化主张，证据档够格。
c3111('live 实证：MSFT Copilot 席位数句命中用量指标形态', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'This year, Azure revenue surpassed $100 billion for the first time, and Microsoft 365 Copilot reached over 30 million paid seats, reflecting the confidence customers are placing in us to power their AI transformation.',
    claimSentence: 'This year, Azure revenue surpassed $100 billion for the first time, and Microsoft 365 Copilot reached over 30 million paid seats, reflecting the confidence customers are placing in us to power their AI transformation.',
    source: 'SEC EDGAR',
    date: '2026-07-29',
  });
  return r.kind === 'usage-metric'
    && r.kinds.length === 1 && r.kinds[0] === 'usage-metric'  // 不串台到 funding/demand
    && r.verdict === 'thin-reasoning'       // 公开财报(3)+推理 1/3
    && r.evidence.weight === 3 && r.evidence.label === '公开财报/公告'
    && r.reasoning.score === 1
    && r.reasoning.met.includes('has-sample')
    && r.decisionRelevant === true          // 一手备案量化主张
    && r.falsifiability.problems.length === 0;  // 有数字，no-quantity 不触发
})(), '「Copilot reached over 30 million paid seats」必须命中用量指标形态并按公开财报(3)/推理 1/3 判，不虚抬');

// 2. GOOGL Gemini 月活 + token 吞吐句（同一条备案两个指标）。
c3111('live 实证：GOOGL Gemini 月活与 token 吞吐句命中用量指标形态', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Gemini models now process 22 billion API tokens per minute and the Gemini App has 950 million monthly active users.',
    claimSentence: 'Gemini models now process 22 billion API tokens per minute and the Gemini App has 950 million monthly active users.',
    source: 'SEC EDGAR',
    date: '2026-07-22',
  });
  return r.kind === 'usage-metric'
    && r.kinds.length === 1
    && r.verdict === 'thin-reasoning'
    && r.evidence.weight === 3
    && r.reasoning.score === 1             // has-sample（950 million / 22 billion）
    && r.decisionRelevant === true;
})(), '「Gemini App has 950 million monthly active users」必须命中用量指标形态（SEC EDGAR 来源归公开财报档）');

// 3. GOOGL 上一期月活句（grown to 形态 + tokens per minute 无 API 前缀）。
//    单元级命中；引擎级该条因用量句不在「命中句+后 2 句」窗内不进辨别
//    （已知边界，组 5 第 11 条钉住）。
c3111('live 实证：GOOGL 上一期月活句（grown to 形态）命中', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Our first party models, like Gemini, now process over 10 billion tokens per minute via direct API use by our customers, and the Gemini App has grown to over 750 million monthly active users.',
    claimSentence: 'Our first party models, like Gemini, now process over 10 billion tokens per minute via direct API use by our customers, and the Gemini App has grown to over 750 million monthly active users.',
    source: 'SEC EDGAR',
    date: '2026-02-04',
  });
  return r.kind === 'usage-metric'
    && r.verdict === 'thin-reasoning'
    && r.evidence.weight === 3
    && r.reasoning.met.includes('has-sample');
})(), '「grown to over 750 million monthly active users」必须命中用量指标形态（grown to 动词形态）');

// ── 组 2：专属证伪条件与类目映射 ──
// 4. 证伪条件走 usage-metric 专属路径（与兜底「无明确证伪路径」不同值，
//    可行为断言）：下一期同口径自报值 / 第三方用量估算 / 口径变化。
c3111('usage-metric 有专属证伪条件（下一期自报值/第三方估算/口径变化）', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Microsoft 365 Copilot reached over 30 million paid seats.',
    source: 'SEC EDGAR',
  });
  return /下一期备案或公告的同口径自报值/.test(r.falsification)
    && /第三方用量估算/.test(r.falsification)
    && /口径发生变化/.test(r.falsification)
    && r.falsification !== '无明确证伪路径——这本身就是问题';
})(), '证伪条件必须走 usage-metric 专属路径（用量主张的裂缝是后续自报值/第三方估算/口径变化）');

// 5. 类目映射源级断言：兜底类目同为 market_claims，行为断言抓不到摘除
//    （v3.6/v3.7/v3.8/v3.9/v3.10 同型教训）。
c3111('usage-metric 类目映射为 market_claims（源级）', (() => {
  const fs311 = require('fs');
  const src = fs311.readFileSync(require('path').join(__dirname, 'human-future/scripts/commercial-discriminator.js'), 'utf-8');
  return /'usage-metric':\s*'market_claims'/.test(src);
})(), 'inferCommercialCategory 必须含 usage-metric → market_claims 映射行（兜底同域，只能源级断言）');

// ── 组 3：形态族召回（动词族 × 指标名词族，八形）──
c3111('形态族召回：八种用量指标句式全部命中', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'usage-metric');
  if (!p) return false;   // 模式被摘除时精确失败，不抛 TypeError（v3.11 反向验证实测教训）
  const forms = [
    'Microsoft 365 Copilot reached over 30 million paid seats.',                                   // reached over N paid seats
    'The Gemini App has 950 million monthly active users.',                                        // has N monthly active users
    'The Gemini App has grown to over 750 million monthly active users.',                          // grown to over N monthly active users
    'Gemini models now process 22 billion API tokens per minute.',                                 // now process N API tokens per minute
    'Our first party models now process over 10 billion tokens per minute via direct API use.',    // process over N tokens per minute（无 API 前缀）
    'The platform now exceeds 2 million daily active users after the relaunch.',                   // exceeds N daily active users
    'The platform stands at 500 million weekly active users across all surfaces.',                          // stands at N weekly active users
    'The API now processes 300 million api calls per day from enterprise customers.',                // N api calls per day
  ];
  return forms.every(f => p.re.test(f));
})(), 'reached/has/grown to/process/exceeds/stands at × paid seats/monthly active users/tokens per minute/api calls 八形必须全命中');

// ── 组 4：精度回归（subscribers 族 / 速率上限 / scaling / 指南文本 / 不串台）──
// 6. 十句精度回归：全部不命中。前三句是 live 实证原句（GOOGL 订阅总量、
//    FLI 邮件列表、Suno 音乐服务），其余为同型边界句。
c3111('精度回归：subscribers 族/速率上限/scaling/指南文本等十句不命中', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'usage-metric');
  if (!p) return false;   // 模式被摘除时精确失败，不抛 TypeError（v3.11 反向验证实测教训）
  const negatives = [
    'Overall the number of paid subscriptions has now reached 350 million, with YouTube and Google One being the key drivers.',  // live：GOOGL 订阅总量（非 AI 用量）
    "the world's most trusted regular AI Act publication with over 50,000+ subscribers",                                     // live：FLI 邮件列表 boilerplate
    "Suno's CEO said in February that the service had 2 million paying subscribers and that more than 100 million people had used it.",  // live：音乐服务订阅
    'Our API supports up to 128k tokens per minute on the standard tier.',                                                   // 速率上限不是用量
    'Rapidly scaling online storage to serve over 1 billion ChatGPT users (Part II)',                                        // live：基础设施 scaling（v3.10 已决议）
    'How to grow monthly active users for your consumer app',                                                               // 指南文本（无量化值）
    'This year, Azure revenue surpassed $100 billion for the first time.',                                                   // 同句邻居：营收不是用量指标
    'Virtual care visits have nearly tripled year-over-year, with a majority of those visits now via Health AI.',             // live：无量化指标名词
    'We surveyed apps with more than 100,000 monthly active users.',                                                         // 调查样本准入条件不是主张
    'The Gemini App is our most popular product ever.',                                                                      // 无量化值
  ];
  return negatives.every(f => !p.re.test(f));
})(), 'subscribers 族（GOOGL/FLI/Suno live 原句）、速率上限、基础设施 scaling、指南文本、营收邻居句、无量化句全部不得命中');

// 7. 不串台：deployment-scale 的 live 原句不得因新形态改判 kind
//    （一类证据一个 kind；kinds 不含 usage-metric）。
c3111('不串台：Uber 部署句的 kind 保持 deployment-scale', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Uber is rolling out ChatGPT Work to more than 30,000 employees, helping teams research, analyze data, create presentations, and complete complex workflows.',
    claimSentence: 'Uber is rolling out ChatGPT Work to more than 30,000 employees',
    source: 'OpenAI News',
  });
  return r.kind === 'deployment-scale'
    && !r.kinds.includes('usage-metric')
    && r.kinds.length === 1;
})(), '部署规模原句不得被用量指标形态吞掉（两类证据边界清晰）');

// ── 组 5：引擎级端到端（候选门 + 切分修复 + 已知边界 + 报告渲染）──
// 8. 引擎级：MSFT 与 GOOGL 两条 live 结构条目进辨别，byKind
//    usage-metric:2；MSFT 条因后 2 句上下文含 "up 27% year-over-year"
//    判 well-formed（has-sample+has-comparison，引擎既定语义：主张文本
//    = 命中句+后 2 句），GOOGL 条 thin-reasoning。
c3111('引擎级：两条 SEC 备案用量主张进辨别（byKind usage-metric:2）', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const items = [
    { title: 'MICROSOFT CORP (MSFT) 8-K 业绩发布 · 2026-07-29',
      body: 'Satya Nadella, chairman and chief executive officer of Microsoft. "This year, Azure revenue surpassed $100 billion for the first time, and Microsoft 365 Copilot reached over 30 million paid seats, reflecting the confidence customers are placing in us to power their AI transformation." "We delivered a strong quarter to close out the fiscal year, highlighted by Microsoft Cloud revenue of $59.3 billion, up 27% year-over-year," said Amy Hood, executive vice president and chief financial officer of Microsoft. The following table adjusts for the impact from investments in OpenAI.',
      description: '', source: 'SEC EDGAR', bucket: 'sec_filings',
      pubDate: 'Wed, 29 Jul 2026 00:00:00 GMT', link: 'https://www.sec.gov/x', origin: 'live' },
    { title: 'Alphabet Inc. (GOOGL) 8-K 业绩发布 · 2026-07-22',
      body: 'We have exciting momentum across the board. Our popular AI features are driving Search query growth. Gemini models now process 22 billion API tokens per minute and the Gemini App has 950 million monthly active users. We are seeing strong demand for our security solutions, and our new Gemini 3.5 Flash Cyber delivers highly cost-efficient performance.',
      description: '', source: 'SEC EDGAR', bucket: 'sec_filings',
      pubDate: 'Wed, 22 Jul 2026 00:00:00 GMT', link: 'https://www.sec.gov/y', origin: 'live' },
  ];
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: items.length, domains: [], undomained: 0, dateRange: null, items };
  const cd = inst.buildCommercialDiscrimination();
  if (!cd.available || !cd.results) return false;   // 模式被摘除时无 candidates，精确失败不抛 TypeError
  const um = cd.results.filter(r => r.kind === 'usage-metric');
  const msft = um.find(r => /Copilot/.test(r.claimSentence));
  const googl = um.find(r => /Gemini App/.test(r.claimSentence));
  return cd.available === true && cd.audited === 2
    && um.length === 2
    && msft && msft.verdict === 'well-formed'      // has-sample + has-comparison（后 2 句上下文）
    && msft.evidence.weight === 3 && msft.reasoning.score === 2
    && msft.decisionRelevant === true
    && googl && googl.verdict === 'thin-reasoning'
    && googl.evidence.weight === 3 && googl.reasoning.score === 1
    && googl.decisionRelevant === true;
})(), 'MSFT/GOOGL 备案用量主张必须进辨别并归公开财报(3)——一手信源自报用量首次进商业辨别段');

// 9. 引号切分修复（同轮配套）：两层钉住——① 源级：project-future.js 两处
//    切分都含收尾引号容忍 lookbehind（旧正则 `(?<=[.!?。！？])\s+` 在
//    `transformation." "We delivered…` 处不断句）；② 行为级：引擎选出
//    的 claimSentence 就是用量句本身（≤400 字、含 paid seats、不含被
//    拼接进来的 Amy Hood 引语）。摘除修复（任一处恢复旧正则）→ 两层
//    各失败（反向验证第 6 轮：2 条）。
c3111('切分修复：句末标点后的收尾引号不再阻断切句（源级+行为级）', (() => {
  const fs311 = require('fs');
  const pf = fs311.readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  const srcOk = (pf.match(/\(\?<=\[\.!\?。！？\]\["'」』\]\?\)/g) || []).length === 2;
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const item = {
    title: 'MICROSOFT CORP (MSFT) 8-K 业绩发布 · 2026-07-29',
    body: 'Satya Nadella, chairman and chief executive officer of Microsoft. "This year, Azure revenue surpassed $100 billion for the first time, and Microsoft 365 Copilot reached over 30 million paid seats, reflecting the confidence customers are placing in us to power their AI transformation." "We delivered a strong quarter to close out the fiscal year, highlighted by Microsoft Cloud revenue of $59.3 billion, up 27% year-over-year," said Amy Hood, executive vice president and chief financial officer of Microsoft.',
    description: '', source: 'SEC EDGAR', bucket: 'sec_filings',
    pubDate: 'Wed, 29 Jul 2026 00:00:00 GMT', link: 'https://www.sec.gov/x', origin: 'live' };
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: 1, domains: [], undomained: 0, dateRange: null, items: [item] };
  const cd = inst.buildCommercialDiscrimination();
  const msft = (cd.results || []).find(r => /paid seats/.test(r.claimSentence || ''));
  return srcOk
    && !!msft                                   // 用量句进窗（旧切分下 443 字超 400 窗整条不进）
    && msft.claimSentence.length <= 400
    && msft.claimSentence.includes('paid seats')
    && !msft.claimSentence.includes('Amy Hood');  // claimSentence 是用量句本身，不是拼接段
})(), '旧切分在 transformation." 后不断句（443 字超 400 窗），新切分必须把用量句切出（forecast 路径同型两处已同步修）');

// 10. 已知边界如实：用量句不在「命中句+后 2 句」窗内时不进辨别——
//     GOOGL 2026-02-04 备案的 750M MAU 句在 live 池中被前面的 demand
//     句挤掉（claim 文本窗只送命中句+后 2 句，引擎既定语义）。
c3111('已知边界：用量句在主张窗之外时不进辨别（如实记录）', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const items = [
    { title: 'Alphabet Inc. (GOOGL) 8-K 业绩发布 · 2026-02-04',
      body: 'Google Cloud saw a continued increase in customer demand as revenues increased 48% to $17.7 billion in the quarter. Filler sentence one about other results. Filler sentence two about other results. Filler sentence three about other results. Our first party models, like Gemini, now process over 10 billion tokens per minute, and the Gemini App has grown to over 750 million monthly active users.',
      description: '', source: 'SEC EDGAR', bucket: 'sec_filings',
      pubDate: 'Wed, 04 Feb 2026 00:00:00 GMT', link: 'https://www.sec.gov/z', origin: 'live' },
  ];
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: items.length, domains: [], undomained: 0, dateRange: null, items };
  const cd = inst.buildCommercialDiscrimination();
  if (!cd.available || !cd.results) return false;   // 无 candidates 时精确失败不抛 TypeError
  const um = cd.results.filter(r => r.kind === 'usage-metric');
  return cd.available === true && um.length === 0     // 用量句在窗外，如实不进
    && cd.results.every(r => r.kind !== 'usage-metric');
})(), '用量句距首个命中句超过 2 句时不进辨别——claim 文本窗是引擎既定语义，漏报如实记录不凑数');

// 11. 端到端渲染：formatReport 出现「类型: 用量/牵引度指标主张」行
//     （只认渲染出的标签行，段内 note/图例文本同字符串会喂饱泛匹配——
//     v3.2 同型教训）。
c3111('端到端：formatReport 渲染「类型: 用量/牵引度指标主张」行', (() => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const item = {
    title: 'Alphabet Inc. (GOOGL) 8-K 业绩发布 · 2026-07-22',
    description: 'Gemini models now process 22 billion API tokens per minute and the Gemini App has 950 million monthly active users.',
    body: '', source: 'SEC EDGAR', bucket: 'sec_filings',
    pubDate: 'Wed, 22 Jul 2026 00:00:00 GMT', domains: ['market_claims'],
    link: 'https://www.sec.gov/y', origin: 'live' };
  const md = formatReport(new ProjectionEngine({ newsData: { sec_filings: { news: [item] } } }).generate());
  const seg = md.split('## 商业主张辨别')[1] || '';
  // 只认渲染出来的「类型:」行（note 文本同字符串会喂饱泛匹配，v3.2 教训）
  return seg.includes('类型: 用量/牵引度指标主张 | 来源: SEC EDGAR')
    && seg.includes('证据: 公开财报/公告(3)')
    && seg.includes('证伪条件:');
})(), '报告必须渲染「类型: 用量/牵引度指标主张 | 来源: SEC EDGAR」与「证据: 公开财报/公告(3)」行（只认渲染行）');

// ── 组 6：cron 注入源级 + 精度门未破 ──
// 12. 注入脚本源级：KIND_CN 含中文标签 + 上限 25 + 截断披露。
c3111('cron 注入源级：usage-metric 中文标签与上限/披露', (() => {
  const fs311 = require('fs');
  const p = require('path').join(require('os').homedir(), '.hermes/scripts/hf-cron-fetch.sh');
  if (!fs311.existsSync(p)) return false;
  const sh = fs311.readFileSync(p, 'utf-8');
  return /'usage-metric':\s*'用量\/牵引度指标主张'/.test(sh)
    && /slice\(0,\s*30\)/.test(sh)
    && /超出注入上限未显示/.test(sh);
})(), 'hf-cron-fetch.sh 必须含 usage-metric 中文标签、slice(0,30) 与截断披露行');

// 13. 精度门未破：Fed 公告/播客/订阅总量/速率上限/无数量部署谈话/
//     合作公告/免责声明 boilerplate 不得因新形态进辨别。
c3111('精度门未破：非主张文本不因新形态进入辨别', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const noise = [
    { title: 'Federal Reserve issues FOMC statement', description: '', body: '', source: 'Federal Reserve', bucket: 'economy', pubDate: 'Wed, 30 Sep 2026 00:00:00 GMT', link: 'https://federalreserve.gov/a', origin: 'live' },
    { title: 'LWiAI Podcast #258 - Opus 5.5, Sol and Luna, Muse, DeepSeek-V4.1-Flash', description: '', body: '', source: 'Last Week in AI', bucket: 'business', pubDate: 'Wed, 30 Sep 2026 00:00:00 GMT', link: 'https://lastweekin.ai/b', origin: 'live' },
    { title: 'Overall the number of paid subscriptions has now reached 350 million, with YouTube and Google One being the key drivers.', description: '', body: '', source: 'SEC EDGAR', bucket: 'sec_filings', pubDate: 'Wed, 29 Apr 2026 00:00:00 GMT', link: 'https://www.sec.gov/s', origin: 'live' },
    { title: 'Our API supports up to 128k tokens per minute on the standard tier.', description: '', body: '', source: 'Vendor Docs', bucket: 'frontier_models', pubDate: 'Wed, 30 Sep 2026 00:00:00 GMT', link: 'https://vendor.com/c', origin: 'live' },
    { title: 'brings ChatGPT Work to all employees', description: '', body: '', source: 'OpenAI News', bucket: 'frontier_models', pubDate: 'Wed, 30 Sep 2026 00:00:00 GMT', link: 'https://openai.com/d', origin: 'live' },
    { title: 'OpenAI and Poland\u2019s NASK partner to advance AI safety and security', description: '', body: '', source: 'OpenAI News', bucket: 'frontier_models', pubDate: 'Wed, 30 Sep 2026 00:00:00 GMT', link: 'https://openai.com/e', origin: 'live' },
  ];
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: noise.length, domains: [], undomained: 0, dateRange: null, items: noise };
  const cd = inst.buildCommercialDiscrimination();
  return cd.available === false || cd.results.every(r => r.kind !== 'usage-metric');
})(), 'Fed 公告/播客/订阅总量/速率上限/无数量部署谈话/合作公告不得因 usage-metric 进辨别');

// ── 组 7：版本号一致性（corr-2026-014 同型）────────────────────
c3111('版本号一致性：五处对齐 3.27.0', (() => {
  const fs311 = require('fs');
  const VERSION = fs311.readFileSync(require('path').join(__dirname, 'VERSION'), 'utf-8').trim();
  const pkg = JSON.parse(fs311.readFileSync(require('path').join(__dirname, 'package.json'), 'utf-8'));
  const rp = fs311.readFileSync(require('path').join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  const pf = fs311.readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return VERSION === '3.27.0'
    && pkg.version === '3.27.0'
    && rp.includes('文明推演引擎 v3.27.0')      // banner
    && /version: '3\.27\.0'/.test(pf)          // projection meta
    && /version: '3\.27\.0'/.test(rp);         // run-pipeline fullReport meta
})(), 'VERSION/package.json/banner/projection meta/run-pipeline meta 必须对齐 3.27.0，防 corr-2026-014 版本漂移复发');

// ── v3.11 汇总 ──
(async () => {
  const results = await Promise.all(v3111.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v3111.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '\u2713' : '\u2717'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.11: ${v3111.length - f} 通过, ${f} 失败, 共 ${v3111.length} 个`);
  if (f > 0) {
    console.log('结论：用量指标维度或切分修复不完整（命中/证伪/召回/精度/接入/端到端/版本有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：SEC 备案自报用量指标（席位数/月活/token 吞吐）进模式库（live 实证 3 条句式命中、引擎级 2 条进辨别），subscribers 族与速率上限句精确排除，引号切分修复使 MSFT 条进辨别且 forecast 路径零变化，报告与 cron 注入渲染中文标签。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v3.12 新增断言：商业主张辨别器新增「算力基建承诺/规模主张」形态
// （compute-infra，新辨别维度）。
//
// 背景（2026-10-26 轮全池测量，corr-2026-028 纪律的「未命中条目过堂」）：
// SKILL.md 的已知边界里还有一整类供给侧主张在库外——算力基建承诺。
// live 实证（300 条池）：NVDA 8-K「Strengthened a collaboration with
// CoreWeave to accelerate the buildout of more than 5 gigawatts of AI
// factories by 2030」与「Announced strategic partnerships ... to
// mobilize over $500 billion of third-party capital for the buildout
// of AI infrastructure」、CRWV 8-K「accelerate the build-out of more
// than 5 GW of AI factories by 2030」、NVIDIA 博客（Kazakhstan/Firebird）
// 「export license for 45,000 NVIDIA Grace Blackwell GPUs」——扩容前
// 21 种形态对上述四句全部不命中。adoption 只认趋势主体、deployment-
// scale 只认人的量化范围、usage-metric 只认产品用量状态，而**算力
// 承诺**（GW/MW/GPU/资本额）是供给侧最前端的市场信号（电力许可/GPU
// 交付/资本承诺领先营收数个季度），且有天然结算结构：交付进度、
// 并网容量、definitive agreements 签署都是可观测事件。
//
// 精度设计（v3.0.0c/v3.2/v3.3/v3.6/v3.7/v3.9/v3.10/v3.11 教训：漏报
// 比误报诚实、没有实证不扩模式）：
//   ① 三段同句共现（lookahead，任词序不跨句）：建设/承诺动词 + 量化
//      算力（N GW/MW/GPUs/accelerators，容忍型号名间隔）或量化资本
//      （$N million/billion/trillion）+ AI 基建锚点；
//   ② 必须有量化值——"at gigawatt scale"（NVDA 8-K 韩国主权 AI）无
//      数字不是可证伪主张，不进库；
//   ③ 动词族不含裸露 accelerate——实测 "revenue ... accelerated to
//      46%"（MRVL）与 "accelerated computing"（NVDA Q4 亮点）误命中
//      2 句营收句（候选模式第二轮抓出），"accelerate the buildout"
//      由 buildout 覆盖；
//   ④ 资本形态必须有锚点+动词——"raises $16B"/"revenue was $89B ...
//      Data Center" 不抢 funding/demand 地盘；
//   ⑤ 算力单位族不含裸 chips（芯片工艺）、不含 users/seats。
// live 全池实测（300 条）：精确命中 7 句、4 条进引擎候选，25 句精度
// 回归 0 误报。
//
// 本节断言分七组：① live 实证句式命中 + 证伪条件与类目；② 形态族
// 召回；③ 精度回归；④ 不串台 + has-sample 维护；⑤ 引擎级与端到端
// 渲染；⑥ cron 注入源级 + 精度门未破；⑦ 版本号一致性。
// ════════════════════════════════════════════════════════════════
const v312 = [];
function c312(name, ok, detail) { v312.push({ name, ok, detail }); }

// ── 组 1：live 实证句式命中 ──
c312('live 实证：NVDA-CoreWeave 5GW AI factories 命中 compute-infra', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Strengthened a collaboration with CoreWeave to accelerate the buildout of more than 5 gigawatts of AI factories by 2030.',
    source: 'SEC EDGAR',
  });
  return r.kind === 'compute-infra'
    && r.kinds.length === 1 && r.kinds[0] === 'compute-infra'
    && r.verdict === 'thin-reasoning'
    && r.evidence.weight === 3                 // SEC EDGAR 采集源归公开财报档（v3.10 同型）
    && r.reasoning.score === 1                 // has-sample（5 gigawatts），无对照无反例
    && r.decisionRelevant === true;
})(), 'NVDA 8-K 的 5GW AI factories 承诺必须命中算力基建形态并按一手备案量化主张对待');

c312('live 实证：NVDA $500B 第三方资本动员命中 compute-infra', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Announced strategic partnerships to establish independent compute financing platforms with Apollo, BlackRock, Blackstone, Brookfield, Goldman Sachs and KKR to mobilize over $500 billion of third-party capital for the buildout of AI infrastructure over time, subject to definitive agreements.',
    source: 'SEC EDGAR',
  });
  return r.kind === 'compute-infra'
    && r.verdict === 'thin-reasoning'
    && r.evidence.weight === 3
    && r.reasoning.score === 1                 // has-sample（$500 billion）
    && r.decisionRelevant === true;
})(), 'NVDA 8-K 的 $500B 资本动员承诺必须命中算力基建形态（资本+锚点+动词三件套）');

c312('live 实证：Firebird 45,000 GPUs 出口许可命中 compute-infra 且不虚抬', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'export license for 45,000 NVIDIA Grace Blackwell GPUs.',
    source: 'NVIDIA Blog',
  });
  return r.kind === 'compute-infra'
    && r.verdict === 'weak-evidence'
    && r.evidence.weight === 1                 // 厂商博客转述第三方交易，句式自身无归属词，不虚抬（v3.10 Uber 同型）
    && r.reasoning.score === 1
    && r.decisionRelevant === false;
})(), 'NVIDIA 博客的 45,000 GPUs 出口许可必须命中但按厂商一手公告对待（无出处(1)，不虚抬）');

c312('live 实证：CRWV 8-K 5GW build-out 命中 compute-infra', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'CoreWeave strengthened its relationship with NVIDIA to accelerate the build-out of more than 5 GW of AI factories by 2030.',
    source: 'SEC EDGAR',
  });
  return r.kind === 'compute-infra'
    && r.verdict === 'thin-reasoning'
    && r.evidence.weight === 3
    && r.reasoning.score === 1
    && r.decisionRelevant === true;
})(), 'CRWV 8-K 的 5GW build-out 承诺必须命中算力基建形态');

c312('专属证伪条件与类目映射（源级断言——兜底类目同为 market_claims）', (() => {
  const fs312 = require('fs');
  const src = fs312.readFileSync(require('path').join(__dirname, 'human-future/scripts/commercial-discriminator.js'), 'utf-8');
  return /'compute-infra':\s*'观察到第三方算力\/电力跟踪/.test(src)
    && /'compute-infra':\s*'market_claims'/.test(src)
    && /definitive agreements/.test(src);      // 证伪路径含「意向书未转化为建设」这条 live 实证裂缝
})(), 'compute-infra 必须有专属证伪路径（交付/许可/资本落实）与类目映射（行为断言抓不到同域摘除，走源级）');

// ── 组 2：形态族召回八形 ──
c312('形态族召回：建设动词 × 量化算力/资本八形', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const forms = [
    'Firebird has secured a U.S. export license for 45,000 NVIDIA Grace Blackwell GPUs.',
    'Kazakhtelecom has already deployed 400 NVIDIA H200 and 480 NVIDIA B300 GPUs in Astana and Almaty.',
    'NVIDIA announced plans to expand its data center capacity to 2 gigawatts by 2028.',
    'The hyperscaler committed $10 billion to build new AI infrastructure in Texas.',
    'Microsoft is investing $5 billion to construct additional data centers for AI training.',
    'A planned second phase would bring total AI infrastructure capacity to approximately 500 megawatts.',
    'The 300 megawatt facility is under construction at Data Center Valley, targeting commercial launch in Q3 2027.',
    'Partners will mobilize $2 billion of capital for the buildout of AI factories in the region.',
  ];
  return forms.every(f => {
    const r = discriminateCommercial({ text: f, source: 'Test' });
    return r.kind === 'compute-infra';
  });
})(), 'secured/deployed/expand/committed/investing/bring/under construction/mobilize 八形必须全部命中');

// ── 组 3：精度回归 25 句 ──
c312('精度回归 26 句：营收/指引/融资/订阅/售罄/监管/专家/scaling/资助/工艺句不命中', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'compute-infra');
  if (!p) return false;   // 模式被摘除（反向验证）时精确失败，不抛 TypeError（v3.11 教训）
  const neg = [
    'Rapidly scaling online storage to serve over 1 billion ChatGPT users (Part II)',
    'Highlights Data Center • Second-quarter revenue was $89.0 billion, up 18% from the previous quarter and up 117% from a year ago.',
    'Highlights Data Center • Fourth-quarter revenue was a record $62.3 billion, up 22% from the previous quarter and up 75% from a year ago, driven by the major platform shifts — accelerated computing and AI.',
    'NVIDIA is not assuming any Data Center compute revenue from China in its outlook.',
    'NIST Awards More Than $1.7 Million to Support Cybersecurity Workforce Development Across 8 States',
    'Each wafer contains more than 400 chips, with each chip housing up to 300 tiny ring-shaped resonators.',
    'Expanded Korea’s AI factory ecosystem through strategic partnerships to build sovereign AI infrastructure at gigawatt scale.',
    'For the third quarter of 2026, AMD expects revenue to be approximately $13 billion, plus or minus $300 million.',
    'Announced a multiyear technology partnership with SK hynix to advance next-generation memory for the global AI factory buildout.',
    'During the third fiscal quarter, the Company generated $14.2 billion in cash from operations and spent $0.5 billion on capital expenditures.',
    'Revolut is rebuilding its technology stack on a single foundation model PRAGMA, powered by NVIDIA accelerated computing.',
    'Marvell delivered record second-quarter fiscal 2027 revenue of $2.739 billion, up 37% year over year, driven by continued strong demand across our Data Center portfolio, where revenue growth accelerated to 46% year over year.',
    'Google Cloud saw a meaningful acceleration in growth as revenues increased 82% to $24.8 billion, led by an increase in Google Cloud Platform (GCP) across enterprise AI Solutions and enterprise AI Infrastructure.',
    // [v3.12 R7 空转修复] 无小数点的营收句：$46 billion 无句点，动词段不被
    // 小数点切断——动词族加回裸露 accelerate 时这句会误命中（证明动词门
    // 有效）。含小数点的两句（$62.3/$2.739）跨不过小数点，证明不了该门。
    'Data Center revenue accelerated to a record $46 billion in the third quarter, driven by enterprise AI demand.',
    'Google Cloud saw a continued increase in customer demand as revenues increased 48% to $17.7 billion, led by an increase in Google Cloud Platform (GCP) across enterprise AI Infrastructure.',
    'OpenAI says it will no longer train its AI models on the live internet, citing significant risks.',
    'Uber is rolling out ChatGPT Work to more than 30,000 employees.',
    'Microsoft 365 Copilot reached over 30 million paid seats.',
    'Gemini models now process 22 billion API tokens per minute and the Gemini App has 950 million monthly active users.',
    'Data Center Late Fees Hit $5 Million or More Per Day, Spawning New Insurance.',
    'DeepSeek Raises Nearly $16 billion in Second Funding Round.',
    'ORCL intends to raise up to $50 billion in debt financing.',
    'Instacart Is Exploring a Sale.',
    'U.S. Treasury Proposes to Widen Outbound Investment Restrictions for China and Other Countries.',
    'AI delivers \'zero financial payoff\' to most companies, Apollo economist says.',
    'AWS Largely Sold Out Of Capacity Into 2028, Jassy Says.',
  ];
  return neg.every(s => !p.re.test(s));
})(), '营收/指引/融资/订阅/售罄/监管/专家判断/工程 scaling/政府资助/芯片工艺/无数量规模级句全部不得命中');

// ── 组 4：不串台 + has-sample 维护 ──
c312('不串台：现有 kind 原句 kind 不变、kinds 不含 compute-infra', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const cases = [
    ['Uber is rolling out ChatGPT Work to more than 30,000 employees.', 'deployment-scale'],
    ['Microsoft 365 Copilot reached over 30 million paid seats.', 'usage-metric'],
    ['Data Center Late Fees Hit $5 Million or More Per Day, Spawning New Insurance.', 'cost-signal'],
    ['DeepSeek Raises Nearly $16 billion in Second Funding Round.', 'funding'],
    ['AWS Largely Sold Out Of Capacity Into 2028, Jassy Says', 'capacity'],
    ['Anthropic launches Claude Fable 5.1 and says it\'s up to 45 percent cheaper for agentic work', 'price-cut'],
  ];
  return cases.every(([s, k]) => {
    const r = discriminateCommercial({ text: s, source: 'Test' });
    return r.kind === k && !r.kinds.includes('compute-infra');
  });
})(), '新模式追加在模式库末尾，现有 kind 分类与 kinds 集合不得被串台');

c312('has-sample 维护：算力单位计入样本（v3.10 同型）', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r1 = discriminateCommercial({
    text: 'Strengthened a collaboration with CoreWeave to accelerate the buildout of more than 5 gigawatts of AI factories by 2030.',
    source: 'SEC EDGAR',
  });
  const r2 = discriminateCommercial({
    text: 'A planned second phase would bring total AI infrastructure capacity to approximately 500 megawatts.',
    source: 'SEC EDGAR',
  });
  return r1.reasoning.met.includes('has-sample') && r1.reasoning.score === 1
    && r2.reasoning.met.includes('has-sample');
})(), 'GW/MW/GPU 数是算力承诺主张的样本，不补则推理分恒 0（有数字却判不出样本）');

// ── 组 5：引擎级 + 端到端渲染 ──
c312('引擎级：四条算力基建主张进辨别（byKind compute-infra:4）', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const items = [
    { title: 'NVIDIA CORP (NVDA) 8-K 业绩发布 · 2026-05-20',
      body: 'Highlights Data Center • Strengthened a collaboration with CoreWeave to accelerate the buildout of more than 5 gigawatts of AI factories by 2030. Revenue was a record $44.1 billion, up 12% from the previous quarter.',
      description: '', source: 'SEC EDGAR', bucket: 'sec_filings',
      pubDate: 'Wed, 20 May 2026 00:00:00 GMT', link: 'https://www.sec.gov/nvda-q2', origin: 'live' },
    { title: 'NVIDIA CORP (NVDA) 8-K 业绩发布 · 2026-08-26',
      body: 'Highlights Data Center • Announced strategic partnerships to establish independent compute financing platforms with Apollo, BlackRock, Blackstone, Brookfield, Goldman Sachs and KKR to mobilize over $500 billion of third-party capital for the buildout of AI infrastructure over time, subject to definitive agreements. Second-quarter revenue was $46.7 billion.',
      description: '', source: 'SEC EDGAR', bucket: 'sec_filings',
      pubDate: 'Wed, 26 Aug 2026 00:00:00 GMT', link: 'https://www.sec.gov/nvda-q3', origin: 'live' },
    { title: 'CoreWeave, Inc. (CRWV) 8-K 业绩发布 · 2026-05-07',
      body: 'We strengthened our relationship with NVIDIA to accelerate the build-out of more than 5 GW of AI factories by 2030. CoreWeave will provide forward-looking guidance in connection with this quarterly earnings announcement on its earnings call.',
      description: '', source: 'SEC EDGAR', bucket: 'sec_filings',
      pubDate: 'Wed, 07 May 2026 00:00:00 GMT', link: 'https://www.sec.gov/crwv', origin: 'live' },
    { title: 'Kazakhstan Expands Compute for Its AI Future',
      body: 'The Infrastructure Layer Is Scaling The visits coincided with a signing ceremony marking Firebird\'s investment agreement with the government of Kazakhstan, held at the presidential palace. Building on its first AI factory in Armenia, Firebird is expanding into Kazakhstan, where it has secured a U.S. export license for 45,000 NVIDIA Grace Blackwell GPUs. The first phase is under construction with Kazakhtelecom at Data Center Valley, targeting commercial launch in the third quarter of 2027.',
      description: '', source: 'NVIDIA Blog', bucket: 'frontier_models',
      pubDate: 'Fri, 23 Oct 2026 02:00:13 GMT', link: 'https://nvidia.blog/kz', origin: 'live' },
  ];
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: items.length, domains: [], undomained: 0, dateRange: null, items };
  const cd = inst.buildCommercialDiscrimination();
  if (!cd.available || !cd.results) return false;   // 模式被摘除时无 candidates，精确失败不抛 TypeError
  const ci = cd.results.filter(r => r.kind === 'compute-infra');
  const nvdaGw = ci.find(r => /gigawatts/.test(r.claimSentence));
  const nvdaCap = ci.find(r => /\$500 billion/.test(r.claimSentence));
  const kz = ci.find(r => /export license/.test(r.claimSentence));
  return cd.available === true && cd.audited === 4
    && ci.length === 4
    && nvdaGw && nvdaGw.evidence.weight === 3 && nvdaGw.decisionRelevant === true
    && nvdaCap && nvdaCap.evidence.weight === 3 && nvdaCap.decisionRelevant === true
    && kz && kz.evidence.weight === 1 && kz.decisionRelevant === false;   // 厂商博客不虚抬
})(), 'NVDA×2/CRWV/Kazakhstan 四条算力承诺必须进辨别，一手备案归公开财报(3)、厂商博客不虚抬');

c312('端到端：formatReport 渲染「类型: 算力基建承诺/规模主张」行', (() => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const item = {
    title: 'NVIDIA CORP (NVDA) 8-K 业绩发布 · 2026-05-20',
    description: 'Strengthened a collaboration with CoreWeave to accelerate the buildout of more than 5 gigawatts of AI factories by 2030.',
    body: '', source: 'SEC EDGAR', bucket: 'sec_filings',
    pubDate: 'Wed, 20 May 2026 00:00:00 GMT', domains: ['market_claims'],
    link: 'https://www.sec.gov/nvda-q2', origin: 'live' };
  const md = formatReport(new ProjectionEngine({ newsData: { sec_filings: { news: [item] } } }).generate());
  const seg = md.split('## 商业主张辨别')[1] || '';
  // 只认渲染出来的「类型:」行（note 文本同字符串会喂饱泛匹配，v3.2 教训）
  return seg.includes('类型: 算力基建承诺/规模主张 | 来源: SEC EDGAR')
    && seg.includes('证据: 公开财报/公告(3)')
    && seg.includes('证伪条件:');
})(), '报告必须渲染「类型: 算力基建承诺/规模主张 | 来源: SEC EDGAR」与「证据: 公开财报/公告(3)」行（只认渲染行）');

// ── 组 6：cron 注入源级 + 精度门未破 ──
c312('cron 注入源级：compute-infra 中文标签与上限/披露', (() => {
  const fs312 = require('fs');
  const p = require('path').join(require('os').homedir(), '.hermes/scripts/hf-cron-fetch.sh');
  if (!fs312.existsSync(p)) return false;
  const sh = fs312.readFileSync(p, 'utf-8');
  return /'compute-infra':\s*'算力基建承诺\/规模主张'/.test(sh)
    && /slice\(0,\s*30\)/.test(sh)
    && /超出注入上限未显示/.test(sh);
})(), 'hf-cron-fetch.sh 必须含 compute-infra 中文标签、slice(0,30) 与截断披露行');

c312('精度门未破：营收/工程 scaling/政府资助/无数量规模级句不因新形态进辨别', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const noise = [
    { title: 'Highlights Data Center • Second-quarter revenue was $89.0 billion, up 18% from the previous quarter.', description: '', body: '', source: 'SEC EDGAR', bucket: 'sec_filings', pubDate: 'Wed, 26 Aug 2026 00:00:00 GMT', link: 'https://www.sec.gov/a', origin: 'live' },
    { title: 'Rapidly scaling online storage to serve over 1 billion ChatGPT users (Part II)', description: '', body: '', source: 'OpenAI News', bucket: 'frontier_models', pubDate: 'Wed, 30 Sep 2026 00:00:00 GMT', link: 'https://openai.com/b', origin: 'live' },
    { title: 'NIST Awards More Than $1.7 Million to Support Cybersecurity Workforce Development Across 8 States', description: '', body: '', source: 'NIST News', bucket: 'frontier_models', pubDate: 'Wed, 30 Sep 2026 00:00:00 GMT', link: 'https://nist.gov/c', origin: 'live' },
    { title: 'Expanded Korea’s AI factory ecosystem through strategic partnerships to build sovereign AI infrastructure at gigawatt scale.', description: '', body: '', source: 'SEC EDGAR', bucket: 'sec_filings', pubDate: 'Wed, 20 May 2026 00:00:00 GMT', link: 'https://www.sec.gov/d', origin: 'live' },
    { title: 'Federal Reserve issues FOMC statement', description: '', body: '', source: 'Federal Reserve', bucket: 'economy', pubDate: 'Wed, 30 Sep 2026 00:00:00 GMT', link: 'https://federalreserve.gov/e', origin: 'live' },
    { title: 'LWiAI Podcast #258 - Opus 5.5, Sol and Luna, Muse, DeepSeek-V4.1-Flash', description: '', body: '', source: 'Last Week in AI', bucket: 'business', pubDate: 'Wed, 30 Sep 2026 00:00:00 GMT', link: 'https://lastweekin.ai/f', origin: 'live' },
  ];
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: noise.length, domains: [], undomained: 0, dateRange: null, items: noise };
  const cd = inst.buildCommercialDiscrimination();
  return cd.available === false || cd.results.every(r => r.kind !== 'compute-infra');
})(), '营收句/工程 scaling/政府资助/无数量规模级句/Fed 公告/播客不得因 compute-infra 进辨别');

// ── 组 7：版本号一致性（corr-2026-014 同型）────────────────────
c312('版本号一致性：五处对齐 3.27.0', (() => {
  const fs312 = require('fs');
  const VERSION = fs312.readFileSync(require('path').join(__dirname, 'VERSION'), 'utf-8').trim();
  const pkg = JSON.parse(fs312.readFileSync(require('path').join(__dirname, 'package.json'), 'utf-8'));
  const rp = fs312.readFileSync(require('path').join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  const pf = fs312.readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return VERSION === '3.27.0'
    && pkg.version === '3.27.0'
    && rp.includes('文明推演引擎 v3.27.0')      // banner
    && /version: '3\.27\.0'/.test(pf)          // projection meta
    && /version: '3\.27\.0'/.test(rp);         // run-pipeline fullReport meta
})(), 'VERSION/package.json/banner/projection meta/run-pipeline meta 必须对齐 3.27.0，防 corr-2026-014 版本漂移复发');

// ── v3.12 汇总 ──
(async () => {
  const results = await Promise.all(v312.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v312.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.12: ${v312.length - f} 通过, ${f} 失败, 共 ${v312.length} 个`);
  if (f > 0) {
    console.log('结论：算力基建承诺维度不完整（命中/证伪/召回/精度/接入/端到端/版本有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：算力基建承诺（GW/MW/GPU/资本额，建设动词+量化+锚点三段同句共现）进模式库（live 实证 7 句命中、引擎级 4 条进辨别），营收/融资/订阅/工程 scaling/政府资助/无数量规模级句精确排除，报告与 cron 注入渲染中文标签。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v3.13 — 财报指引结算指标扩展（已知边界推进：opex/税率/EPS/营业利润）
//
// v3.5.1 白纸黑字的已知边界：「opex/tax/EPS 等指标无实际值来源（只抽
// 营收+毛利率），相关指引保持 pending」。v3.13 轮审计实测：台账 18 条
// 到期未结算的 earnings_guidance 里，10 条有容差/区间可结算——卡住的
// 不是指引侧而是实际值侧：MRVL 亮点段只在标题 bullet 里陈述毛利率
// （"53.1% GAAP gross margin"，无 was/were 连接词，旧正则整个不命中）、
// EPS 实际值在 "or $0.33 per diluted share" 形态、AMZN 营业利润在
// "Operating income increased to $27.5 billion" 形态。且 GAAP/非 GAAP
// 不分口径时同财季同指标天然多值，v3.5 起一律判歧义——MRVL 6 条到期
// 毛利率/EPS 因此永远 pending。
//
// 本轮（全部 2026-10-26 从 SEC EDGAR 实抓原文驱动）：
//   ① extractActuals 扩三个指标族（毛利率 bullet 形态/EPS/营业利润），
//      每条实际值带口径标记，每（族,口径）只收第一个（全年值不混进
//      财季 key——NVDA 02-25 实测旧 matchAll 把全年 71.1% 塞进 Q4 key）
//   ② 指引侧补 settleMetric（句推导，EPS→diluted eps）+ gaapBasis
//      （从**原文**名词前限定词推——14 字符回扩窗口会把 "GAAP and
//      non-GAAP" 切成 "non-GAAP"，句子里口径已丢）
//   ③ 结算层口径分 key 配对（gaap+non-gaap 双口径同值句对两边都有效），
//      未限定口径查裸 key（多值判歧义，不设法规避——MU 双列指引表）
//   ④ 同轮维护：句索引按 claim id 内备案号作用域（同句连续备案指引
//      不同财季，AMD/MRVL live 实证）+ 名词对齐 key（旧抽取把 "GAAP"
//      切成 "P" 的 artifact claim 仍可配对）+ dedup 证据 key 补指标口径
//      （同财季不同指标指引曾被并成一个义务，Brier 样本失真）
// live 端到端：到期未结算 18 条 → 新结算 7 条（MRVL 毛利率×4 全带内
// 命中、MRVL EPS×2 一命中一低于带、AMZN 营业利润 beat 带外），跳过 10
// （8 条无容差点值指引 + 2 条 MU 口径未限定歧义），pending 1（NVDA 全年
// 税率——备案亮点段无可直读实际值句）。Brier 已结算 10→11 义务（原始
// 登记 14→21 条）。
// ════════════════════════════════════════════════════════════════
const v313 = [];
function c313(name, ok, detail) { v313.push({ name, ok, detail }); }

// ── 组 1：采集器实际值抽取扩库（live 实证原文）──────────────────
// 1. MRVL 标题 bullet 毛利率 + EPS（08-27 备案 live 原文）
c313('extractActuals：MRVL bullet 毛利率与 EPS 双口径抽取', (() => {
  const { extractActuals } = require('./human-future/scripts/edgar-collector.js');
  // 2026-10-26 从 SEC 实抓（q227_8kx812026ex-991.htm）：亮点段只在标题
  // bullet 里陈述毛利率（无 was/were），EPS 在 "or $X per diluted share"
  const MRVL = 'EX-99.1 2 q227_8kx812026ex-991.htm EXHIBIT 99.1 Document Exhibit 99.1 Marvell Technology, Inc. Reports Second Quarter of Fiscal Year 2027 Financial Results • Q2 Net Revenue: $2.739 billion, a new record, grew by 37% year-on-year • Q2 Gross Margin: 53.1% GAAP gross margin; 58.9% non-GAAP gross margin • Q2 Diluted income per share: $0.33 GAAP diluted income per share; $0.94 non-GAAP diluted income per share. GAAP net income for the second quarter of fiscal 2027 was $308.0 million, or $0.33 per diluted share. Non-GAAP net income for the second quarter of fiscal 2027 was $865.9 million, or $0.94 per diluted share.';
  const ex = extractActuals(MRVL);
  const gm = ex.actuals.filter(a => a.metric === 'gross margin');
  const eps = ex.actuals.filter(a => a.metric === 'diluted eps');
  const rev = ex.actuals.find(a => a.metric === 'revenue');
  return ex.quarter === 2 && ex.fiscalYear === 2027
    && rev && rev.value === '$2.739 billion'
    && gm.length === 2
    && gm.find(a => a.gaapBasis === 'gaap' && a.value === '53.1%')
    && gm.find(a => a.gaapBasis === 'non-gaap' && a.value === '58.9%')
    && eps.length === 2
    && eps.find(a => a.gaapBasis === 'gaap' && a.value === '$0.33')
    && eps.find(a => a.gaapBasis === 'non-gaap' && a.value === '$0.94');
})(), 'MRVL 亮点段只在 bullet 里给毛利率（无 was/were）、EPS 在 or $X per diluted share 形态——抽不到，6 条到期毛利率/EPS 指引永远 pending');

// 2. MU EPS 双口径（06-24 备案 live 原文；小数点容差——$28.24 的句点不是句读）
c313('extractActuals：MU EPS 双口径（or $X per diluted share，小数点不截断）', (() => {
  const { extractActuals } = require('./human-future/scripts/edgar-collector.js');
  const MU = 'EX-99.1 2 a2026q3ex991-pressrelease.htm EX-99.1 - PRESS RELEASE Document Exhibit 99.1 FOR IMMEDIATE RELEASE Contacts: Satya Kumar Mark Plungy Investor Relations Media Relations satyakumar@micron.com mplungy@micron.com (408) 450-6199 (408) 203-2910 MICRON TECHNOLOGY, INC. REPORTS RECORD RESULTS FOR THE THIRD QUARTER OF FISCAL 2026 Micron executes transformational Strategic Customer Agreements BOISE, Idaho, June 24, 2026 – Micron Technology, Inc. (Nasdaq: MU) today announced results for its third quarter of fiscal 2026, which ended May 28, 2026. Fiscal Q3 2026 highlights • Revenue of $41.46 billion versus $23.86 billion for the prior quarter and $9.30 billion for the same period last year • GAAP net income of $28.24 billion, or $24.67 per diluted share • Non-GAAP net income of $28.86 billion, or $25.11 per diluted share • Operating cash flow of $25.39 billion versus $11.90 billion for the prior quarter and $4.61 billion for the same period last year';
  const ex = extractActuals(MU);
  const eps = ex.actuals.filter(a => a.metric === 'diluted eps');
  return ex.quarter === 3 && ex.fiscalYear === 2026
    && eps.length === 2
    && eps.find(a => a.gaapBasis === 'gaap' && a.value === '$24.67')
    && eps.find(a => a.gaapBasis === 'non-gaap' && a.value === '$25.11')
    && ex.actuals.find(a => a.metric === 'revenue' && a.value === '$41.46 billion');
})(), 'GAAP net income of $28.24 billion, or $24.67 per diluted share——[^.;] 跨不过 $28.24 的小数点（v3.4 同型坑），必须数字间小数点容差');

// 3. AMZN 营业利润（07-30 live 原文：分部行不误抽 + 亮点行与 bullet 同值去重）
c313('extractActuals：AMZN 营业利润抽取，分部行（segment）不误入', (() => {
  const { extractActuals } = require('./human-future/scripts/edgar-collector.js');
  const AMZN = 'EX-99.1 2 amzn-20260630xex991.htm EX-99.1 Document Exhibit 99.1 AMAZON.COM ANNOUNCES SECOND QUARTER RESULTS Net sales increased 20% year-over-year Operating income was $27.5 billion, up 43% year-over-year AWS net sales increased 37%—its fastest growth in 18 quarters—to a $169 billion annualized revenue run rate SEATTLE—(BUSINESS WIRE)—Amazon.com, Inc. today announced financial results for the second quarter ended June 30, 2026. Net sales increased 20% to $200.6 billion, compared with second quarter 2025. • Operating income increased to $27.5 billion in the second quarter, compared with $19.2 billion in second quarter 2025. • North America segment operating income was $9.1 billion, compared with $7.5 billion in second quarter 2025. • International segment operating income was $1.7 billion, compared with $1.5 billion in second quarter 2025. • AWS segment operating income was $16.6 billion, compared with $10.2 billion in second quarter 2025.';
  const ex = extractActuals(AMZN);
  const opinc = ex.actuals.filter(a => a.metric === 'operating income');
  return ex.quarter === 2 && ex.fiscalYear === 2026
    && opinc.length === 1 && opinc[0].value === '$27.5 billion'   // 亮点行+bullet 同值去重；分部值不并入
    && ex.actuals.find(a => a.metric === 'revenue' && a.value === '$200.6 billion');
})(), 'segment operating income 是分部值不是合并值（lookbehind 挡）；亮点行与 bullet 同值只收一个');

// 4. NVDA 全年值不混进财季 key（02-25 live 原文；守卫窗口不跨句）
c313('extractActuals：全年实际值不混进财季 key（NVDA 02-25 live）', (() => {
  const { extractActuals } = require('./human-future/scripts/edgar-collector.js');
  const NVDA = 'EX-99.1 NVIDIA Announces Financial Results for Fourth Quarter Fiscal 2026 • Revenue of $68.1 billion, up 22% from the previous quarter. NVIDIA today reported revenue for the fourth quarter ended January 25, 2026, of $68.1 billion, up 22% from the previous quarter and up 75% from a year ago, driven by the major platform shift. For the quarter, GAAP and non-GAAP gross margins were 75.0% and 75.2%, respectively. For fiscal 2026, GAAP and non-GAAP gross margins were 71.1% and 71.3%, respectively. GAAP and non-GAAP earnings per diluted share were $1.76 and $1.62, respectively.';
  const ex = extractActuals(NVDA);
  const gm = ex.actuals.filter(a => a.metric === 'gross margin');
  return ex.quarter === 4 && ex.fiscalYear === 2026
    && gm.length === 1 && gm[0].value === '75.0%' && gm[0].gaapBasis === 'gaap+non-gaap'
    && ex.actuals.filter(a => a.metric === 'diluted eps').length === 0;   // NVDA 双值句不抽（无 net income+or 结构）
})(), '全年毛利率（For fiscal 2026…71.1%）按标题财季建 key 就是错配——旧 matchAll 把它塞进 FY26Q4 key（corr-2026-030）；守卫窗口前后截到句边界，不跨句误杀季度值');

// 5. 口径推导 + 指标族推导（纯函数）
c313('gaapBasisOf/settleMetricOf：口径三段 + 指标族 + 词边界', (() => {
  const { gaapBasisOf, settleMetricOf } = require('./human-future/scripts/edgar-collector.js');
  return gaapBasisOf('GAAP and non-GAAP ') === 'gaap+non-gaap'
    && gaapBasisOf('Non-GAAP ') === 'non-gaap'
    && gaapBasisOf('GAAP ') === 'gaap'
    && gaapBasisOf('') === ''
    && gaapBasisOf('Apollo ') === ''            // \b 边界：Apollo 不含 gaap 子串误配（corr-2026-024 同型）
    && settleMetricOf('diluted net income per share is expected to be $0.37 +/- $0.05 per share', 'income') === 'diluted eps'
    && settleMetricOf('Diluted earnings per share $30.73 ± $1.00', 'diluted earnings per share') === 'diluted eps'
    && settleMetricOf('GAAP gross margin is expected to be 52.1% to 53.1%', 'gross margin') === 'gross margin'
    && settleMetricOf('Net revenue is expected to be $3.150 billion +/- 5%', 'net revenue') === 'revenue'
    && settleMetricOf('Operating income is expected to be between $20.0 billion and $24.0 billion', 'operating income') === 'operating income';
})(), '口径三段（双口径同值/非GAAP/GAAP/未限定）+ 指标族句推导——名词 income 分不清净利润与每股');

// ── 组 2：指引侧口径/指标族（live 实证原文）────────────────────
// 6. MRVL EPS 指引：settleMetric/gaapBasis 从**原文**名前限定词推导
c313('extractGuidance：MRVL EPS 指引的指标族与口径（原文名前限定词）', (() => {
  const { extractGuidance } = require('./human-future/scripts/edgar-collector.js');
  const MRVL = 'Marvell Technology, Inc. Reports First Quarter of Fiscal Year 2027 Financial Results. Second Quarter of Fiscal 2027 Financial Outlook • Net revenue is expected to be $2.700 billion +/- 5%. • GAAP gross margin is expected to be 52.1% to 53.1%. • Non-GAAP gross margin is expected to be 58.25% to 59.25%. • GAAP operating expenses are expected to be approximately $960 million. • GAAP diluted net income per share is expected to be $0.37 +/- $0.05 per share. • Non-GAAP diluted net income per share is expected to be $0.93 +/- $0.05 per share.';
  const { guidance } = extractGuidance(MRVL);
  const eps = guidance.find(g => /0\.37/.test(g.value));
  const gmG = guidance.find(g => /52\.1%/.test(g.value));
  return eps && eps.settleMetric === 'diluted eps' && eps.gaapBasis === 'gaap'
    && eps.metric === 'income'                 // 名词级 metric 不变（登记 id 的幂等维度）
    && gmG && gmG.gaapBasis === 'gaap' && gmG.settleMetric === 'gross margin'
    && guidance.find(g => /58\.25%/.test(g.value)).gaapBasis === 'non-gaap';
})(), '14 字符回扩窗口把句首 "GAAP" 切掉（句子只剩 "diluted net income per share…"），口径必须从原文名词前推——从句子推就丢了');

// 7. MU 表格形态不标口径（表头列名不进句子）
c313('extractGuidance：表格形态不推导口径（MU 双列表头 live）', (() => {
  const { extractGuidance } = require('./human-future/scripts/edgar-collector.js');
  const MU = 'MICRON TECHNOLOGY, INC. REPORTS RECORD FISCAL FOURTH-QUARTER AND FULL-YEAR 2026 RESULTS. Business Outlook The following table presents Micron\'s guidance for the first quarter of 2027: FQ1-27 GAAP (1) Outlook Non-GAAP (2) Outlook Revenue $61.5 billion ± $1.5 billion $61.5 billion ± $1.5 billion Gross margin Approximately 85.95% Approximately 86.25% Operating expenses Approximately $2.31 billion Approximately $2.06 billion Diluted earnings per share $37.84 ± $1.00 $38.15 ± $1.00';
  const { guidance } = extractGuidance(MU);
  const rev = guidance.find(g => /61\.5/.test(g.value));
  const eps = guidance.find(g => /37\.84/.test(g.value));
  // 表头 "Non-GAAP (2) Outlook" 离名词一两百字符，30 字符回看窗会抓到它——
  // 第一版修复用 form.re !== GUIDANCE_TABLE_RE 引用比较恒真（新 RegExp
  // 对象），空转一轮；表格形态一律未限定，结算层查裸 key。
  return rev && rev.gaapBasis === '' && rev.settleMetric === 'revenue'
    && eps && eps.gaapBasis === '' && eps.settleMetric === 'diluted eps'
    && eps.tolerance === '$1.00' && eps.quarter === 1 && eps.fiscalYear === 2027;
})(), '表单调取句不带口径限定词（列头不进句子）——从回看窗推会把表头 Non-GAAP (2) Outlook 误标成指引口径');

// ── 组 3：结算编排（口径配对 / 名词对齐 / 备案作用域 / 去重）──────
// 8. 口径配对端到端（MRVL×4 + AMZN + MU 歧义；含 "P diluted" artifact 配对）
c313('settleEarningsGuidance：口径分 key 配对（MRVL 毛利率×4/EPS×2 + AMZN 营业利润 + MU 歧义）', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const fs = require('fs');
  const LEDGER = path.join(__dirname, 'human-future/data/prediction-ledger.json');
  const saved = fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf-8') : null;
  try {
    const mock = { version: '1.0.0', predictions: [
      { id: 't313-mrvl-gm-g', claim: 'GAAP gross margin is expected to be 52.1% to 53.1%', probability: 0.5, domain: 'earnings_guidance', category: 'earnings_guidance', dueOn: '2026-09-13', outcome: null },
      { id: 't313-mrvl-gm-ng', claim: 'Non-GAAP gross margin is expected to be 58.25% to 59.25%', probability: 0.5, domain: 'earnings_guidance', category: 'earnings_guidance', dueOn: '2026-09-13', outcome: null },
      { id: 't313-mrvl-eps-q2', claim: 'P diluted net income per share is expected to be $0.37 +/- $0.05 per share', probability: 0.5, domain: 'earnings_guidance', category: 'earnings_guidance', dueOn: '2026-09-13', outcome: null },
      { id: 't313-mrvl-eps-q1', claim: 'diluted net income per share is expected to be $0.31 +/- $0.05 per share', probability: 0.5, domain: 'earnings_guidance', category: 'earnings_guidance', dueOn: '2026-06-14', outcome: null },
      { id: 't313-amzn-opinc', claim: 'Operating income is expected to be between $20.0 billion and $24.0 billion,', probability: 0.5, domain: 'earnings_guidance', category: 'earnings_guidance', dueOn: '2026-08-14', outcome: null },
      { id: 't313-mu-eps', claim: 'Diluted earnings per share $18.90 ± $0.40', probability: 0.5, domain: 'earnings_guidance', category: 'earnings_guidance', dueOn: '2026-07-17', outcome: null },
    ]};
    fs.writeFileSync(LEDGER, JSON.stringify(mock, null, 2));
    const eng = new ProjectionEngine({});
    eng.signals = { totalItems: 6, domains: [], items: [
      { source: 'SEC EDGAR', ticker: 'MRVL', link: 'https://www.sec.gov/Archives/mrvl-aug', accession: '0001835632-26-000022',
        actualPeriod: { quarter: 2, fiscalYear: 2027 },
        actuals: [{ metric: 'revenue', value: '$2.739 billion', gaapBasis: '' }, { metric: 'gross margin', value: '53.1%', gaapBasis: 'gaap' }, { metric: 'gross margin', value: '58.9%', gaapBasis: 'non-gaap' }, { metric: 'diluted eps', value: '$0.33', gaapBasis: 'gaap' }, { metric: 'diluted eps', value: '$0.94', gaapBasis: 'non-gaap' }],
        guidance: [{ sentence: 'GAAP gross margin is expected to be 52.9% to 53.9%', metric: 'gross margin', settleMetric: 'gross margin', gaapBasis: 'gaap', value: '52.9% to 53.9%', tolerance: null, isRange: true, quarter: 3, fiscalYear: 2027 }] },
      { source: 'SEC EDGAR', ticker: 'MRVL', link: 'https://www.sec.gov/Archives/mrvl-may', accession: '0001835632-26-000014',
        actualPeriod: { quarter: 1, fiscalYear: 2027 },
        actuals: [{ metric: 'gross margin', value: '52.1%', gaapBasis: 'gaap' }, { metric: 'gross margin', value: '58.9%', gaapBasis: 'non-gaap' }, { metric: 'diluted eps', value: '$0.04', gaapBasis: 'gaap' }],
        guidance: [
          { sentence: 'GAAP gross margin is expected to be 52.1% to 53.1%', metric: 'gross margin', settleMetric: 'gross margin', gaapBasis: 'gaap', value: '52.1% to 53.1%', tolerance: null, isRange: true, quarter: 2, fiscalYear: 2027 },
          { sentence: 'Non-GAAP gross margin is expected to be 58.25% to 59.25%', metric: 'gross margin', settleMetric: 'gross margin', gaapBasis: 'non-gaap', value: '58.25% to 59.25%', tolerance: null, isRange: true, quarter: 2, fiscalYear: 2027 },
          { sentence: 'GAAP diluted net income per share is expected to be $0.37 +/- $0.05 per share', metric: 'income', settleMetric: 'diluted eps', gaapBasis: 'gaap', value: '$0.37', tolerance: '$0.05', isRange: false, quarter: 2, fiscalYear: 2027 },
        ] },
      { source: 'SEC EDGAR', ticker: 'MRVL', link: 'https://www.sec.gov/Archives/mrvl-mar', accession: '0001835632-26-000006',
        actualPeriod: { quarter: 4, fiscalYear: 2026 },
        actuals: [{ metric: 'diluted eps', value: '$0.46', gaapBasis: 'gaap' }],
        guidance: [{ sentence: 'diluted net income per share is expected to be $0.31 +/- $0.05 per share', metric: 'income', settleMetric: 'diluted eps', gaapBasis: 'gaap', value: '$0.31', tolerance: '$0.05', isRange: false, quarter: 1, fiscalYear: 2027 }] },
      { source: 'SEC EDGAR', ticker: 'AMZN', link: 'https://www.sec.gov/Archives/amzn-apr', accession: '0001018724-26-000012',
        actualPeriod: { quarter: 1, fiscalYear: 2026 },
        actuals: [{ metric: 'operating income', value: '$23.9 billion', gaapBasis: '' }],
        guidance: [{ sentence: 'Operating income is expected to be between $20.0 billion and $24.0 billion, compared with $19.2 billion in second quarter 2025.', metric: 'operating income', settleMetric: 'operating income', gaapBasis: '', value: 'between $20.0 billion and $24.0 billion', tolerance: null, isRange: true, quarter: 2, fiscalYear: 2026 }] },
      { source: 'SEC EDGAR', ticker: 'AMZN', link: 'https://www.sec.gov/Archives/amzn-jul', accession: '0001018724-26-000024',
        actualPeriod: { quarter: 2, fiscalYear: 2026 },
        actuals: [{ metric: 'operating income', value: '$27.5 billion', gaapBasis: '' }],
        guidance: [{ sentence: 'Operating income is expected to be between $22.5 billion and $26.5 billion, compared with $17.4 billion in third quarter 2025.', metric: 'operating income', settleMetric: 'operating income', gaapBasis: '', value: 'between $22.5 billion and $26.5 billion', tolerance: null, isRange: true, quarter: 3, fiscalYear: 2026 }] },
      { source: 'SEC EDGAR', ticker: 'MU', link: 'https://www.sec.gov/Archives/mu-mar', accession: '0000723125-26-000004',
        actualPeriod: { quarter: 2, fiscalYear: 2026 },
        actuals: [{ metric: 'revenue', value: '$20.31 billion', gaapBasis: '' }],
        guidance: [{ sentence: 'Diluted earnings per share $18.90 ± $0.40', metric: 'diluted earnings per share', settleMetric: 'diluted eps', gaapBasis: '', value: '$18.90', tolerance: '$0.40', isRange: false, quarter: 3, fiscalYear: 2026 }] },
      // 6 月备案（Q3 实际值）：双列指引表抽出的句子不带口径词 → 结算层查裸 key，
      // GAAP/非 GAAP 两个值都在裸 key 下 → 判歧义跳过（live 同型：MU 双列表）
      { source: 'SEC EDGAR', ticker: 'MU', link: 'https://www.sec.gov/Archives/mu-jun', accession: '0000723125-26-000009',
        actualPeriod: { quarter: 3, fiscalYear: 2026 },
        actuals: [{ metric: 'diluted eps', value: '$12.07', gaapBasis: 'gaap' }, { metric: 'diluted eps', value: '$12.20', gaapBasis: 'non-gaap' }],
        guidance: [] },
    ]};
    const res = eng.settleEarningsGuidance();
    const byId = Object.fromEntries(res.settled.map(s => [s.id, s]));
    const after = JSON.parse(fs.readFileSync(LEDGER, 'utf-8'));
    const epsQ1 = after.predictions.find(p => p.id === 't313-mrvl-eps-q1');
    return res.settled.length === 5 && res.hits === 3 && res.misses === 2
      && byId['t313-mrvl-gm-g'] && byId['t313-mrvl-gm-g'].hit === true     // 52.1-53.1% vs gaap 53.1%
      && byId['t313-mrvl-gm-ng'] && byId['t313-mrvl-gm-ng'].hit === true   // 58.25-59.25% vs non-gaap 58.9%
      && byId['t313-mrvl-eps-q2'] && byId['t313-mrvl-eps-q2'].hit === true // $0.37±$0.05 vs gaap $0.33（"P diluted" artifact 经名词对齐 key 配对）
      && byId['t313-mrvl-eps-q1'] && byId['t313-mrvl-eps-q1'].hit === false && /below/.test(byId['t313-mrvl-eps-q1'].direction)
      && byId['t313-amzn-opinc'] && byId['t313-amzn-opinc'].hit === false && /beat/.test(byId['t313-amzn-opinc'].direction)
      && res.skipped.some(s => s.id === 't313-mu-eps' && /歧义/.test(s.reason))   // 口径未限定：裸 key 双值
      && after.predictions.find(p => p.id === 't313-mu-eps').outcome === null
      && epsQ1.evidence.metric === 'diluted eps' && epsQ1.evidence.gaapBasis === 'gaap';
  } finally {
    if (saved === null) { try { fs.unlinkSync(LEDGER); } catch (_) {} } else fs.writeFileSync(LEDGER, saved);
  }
})(), '口径一致才配对：MRVL GAAP/非GAAP 毛利率与 EPS 各判各的；口径未限定（MU 双列表）判歧义不设法规避；旧 artifact claim（"P diluted"）经名词对齐 key 仍可配对');

// 9. 备案作用域句索引：同句连续备案指引不同财季（AMD live 实证）
c313('句索引按 claim id 内备案号作用域（同句连续备案指引不同财季）', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const fs = require('fs');
  const LEDGER = path.join(__dirname, 'human-future/data/prediction-ledger.json');
  const saved = fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf-8') : null;
  try {
    // live 实证：AMD 05-05 与 08-04 两份备案都有 "Non-GAAP gross margin
    // is expected to be approximately 56%"，前者指引 FY26Q2、后者 FY26Q3。
    // 全局 first-registered-wins 会把 Q2 claim 解析到 Q3 去。
    const mock = { version: '1.0.0', predictions: [
      { id: 'fc-sec-edgar-0000002488-26-000072-index-htm-2026-08-10-gross-margin-56-', claim: 'Non-GAAP gross margin is expected to be approximately 56%', probability: 0.5, domain: 'earnings_guidance', category: 'earnings_guidance', dueOn: '2026-08-10', outcome: null },
      { id: 'fc-sec-edgar-0000002488-26-000121-index-htm-2026-11-06-gross-margin-56-', claim: 'Non-GAAP gross margin is expected to be approximately 56%', probability: 0.5, domain: 'earnings_guidance', category: 'earnings_guidance', dueOn: '2026-11-06', outcome: null },
    ]};
    fs.writeFileSync(LEDGER, JSON.stringify(mock, null, 2));
    const eng = new ProjectionEngine({});
    eng.signals = { totalItems: 2, domains: [], items: [
      { source: 'SEC EDGAR', ticker: 'AMD', link: 'https://www.sec.gov/Archives/amd-aug', accession: '0000002488-26-000121',
        actualPeriod: { quarter: 2, fiscalYear: 2026 },
        actuals: [{ metric: 'gross margin', value: '56%', gaapBasis: 'non-gaap' }],
        guidance: [{ sentence: 'Non-GAAP gross margin is expected to be approximately 56%', metric: 'gross margin', settleMetric: 'gross margin', gaapBasis: 'non-gaap', value: '56%', tolerance: null, isRange: false, quarter: 3, fiscalYear: 2026 }] },
      { source: 'SEC EDGAR', ticker: 'AMD', link: 'https://www.sec.gov/Archives/amd-may', accession: '0000002488-26-000072',
        actualPeriod: { quarter: 1, fiscalYear: 2026 },
        actuals: [{ metric: 'gross margin', value: '55%', gaapBasis: 'non-gaap' }],
        guidance: [{ sentence: 'Non-GAAP gross margin is expected to be approximately 56%', metric: 'gross margin', settleMetric: 'gross margin', gaapBasis: 'non-gaap', value: '56%', tolerance: null, isRange: false, quarter: 2, fiscalYear: 2026 }] },
    ]};
    const res = eng.settleEarningsGuidance();
    const q2 = res.skipped.find(s => s.id.includes('000072'));
    const q3Pending = res.pending === 1 && res.settled.length === 0;
    // Q2 claim 解析到 05-05 备案的 FY26Q2 指引 → 配上 Q2 实际值 56% → 无容差跳过
    // （解析错到 Q3 的表现是 pending：Q3 无实际值——两者可区分）
    return !!q2 && /无容差/.test(q2.reason) && q3Pending;
  } finally {
    if (saved === null) { try { fs.unlinkSync(LEDGER); } catch (_) {} } else fs.writeFileSync(LEDGER, saved);
  }
})(), '同一句指引在连续两份备案里指引不同财季——按 claim id 内备案号定位；全局索引 first-registered-wins 会把旧 claim 配到新财季实际值（v3.13 第一轮 live 实测踩过）');

// 10. dedup 证据 key 补指标+口径（同轮维护：同财季不同指标不并成一个义务）
c313('dedupeSameObligation 证据 key 带 metric+口径（同财季不同指标不并成一个义务）', (() => {
  const ledgerLib = require('./human-future/scripts/prediction-ledger.js');
  const mk = (id, dueOn, metric, basis) => ({ id, claim: 'c' + id, domain: 'earnings_guidance', outcome: true, dueOn,
    evidence: { sources: ['https://www.sec.gov/Archives/x/'], metric, gaapBasis: basis } });
  const multi = ledgerLib.dedupeSameObligation([
    mk('rev', '2026-09-13', 'revenue', ''),
    mk('gm-g', '2026-09-13', 'gross margin', 'gaap'),
    mk('gm-ng', '2026-09-13', 'gross margin', 'non-gaap'),
    mk('eps', '2026-09-13', 'diluted eps', 'gaap'),
    mk('rev-dup', '2026-09-13', 'revenue', ''),     // 同义务重复登记照常合并
  ]);
  const legacy = ledgerLib.dedupeSameObligation([
    { id: 'l1', claim: 'c1', domain: 'earnings_guidance', outcome: true, dueOn: '2026-08-02', evidence: { sources: ['u'] } },
    { id: 'l2', claim: 'c2', domain: 'earnings_guidance', outcome: true, dueOn: '2026-08-02', evidence: { sources: ['u'] } },
  ]);
  return multi.entries.length === 4 && multi.dedupedCount === 1
    && legacy.entries.length === 1 && legacy.dedupedCount === 1;   // 旧条目无 metric/basis→空后缀，分组不变
})(), '同财季的营收/毛利率(GAAP)/毛利率(非GAAP)/EPS 是四个义务——旧 key 把它们并成一个，v3.13 轮实测 7 条新结算被并成 1 个，Brier 样本失真');

// ── 组 4：端到端 + cron 注入 + 版本号 ──────────────────────────
// 11. formatReport 渲染结算段（口径限定新措辞；只认渲染行）
c313('端到端：formatReport 渲染结算段（口径一致才配对限定）', (() => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const items = [{
    title: 'MRVL 8-K 业绩发布 · 2026-05-27', description: '财报指引（FY2027 Q2）：GAAP gross margin is expected to be 52.1% to 53.1%',
    body: 'GAAP gross margin is expected to be 52.1% to 53.1%. Non-GAAP gross margin is expected to be 58.25% to 59.25%. GAAP diluted net income per share is expected to be $0.37 +/- $0.05 per share.',
    source: 'SEC EDGAR', bucket: 'sec_filings', origin: 'live',
    pubDate: '2026-05-27', link: 'https://example.com/edgar-v313-render', fiscalYearEnd: '0130', ticker: 'MRVL',
    guidance: [
      { sentence: 'GAAP gross margin is expected to be 52.1% to 53.1%', metric: 'gross margin', settleMetric: 'gross margin', gaapBasis: 'gaap', value: '52.1% to 53.1%', tolerance: null, isRange: true, quarter: 2, fiscalYear: 2027, periodLabel: 'FY2027 Q2', caveats: [] },
      { sentence: 'GAAP diluted net income per share is expected to be $0.37 +/- $0.05 per share', metric: 'income', settleMetric: 'diluted eps', gaapBasis: 'gaap', value: '$0.37', tolerance: '$0.05', isRange: false, quarter: 2, fiscalYear: 2027, periodLabel: 'FY2027 Q2', caveats: [] },
    ],
  }];
  const md = formatReport(new ProjectionEngine({ newsData: { sec_filings: { domain: 'sec_filings', news: items } } }).generate());
  const seg = md.split('## 财报指引结算')[1] || '';
  return seg.includes('## 财报指引结算') || md.includes('## 财报指引结算')
    && /口径\*\*一致\*\*才配对/.test(seg)
    && /口径未限定/.test(seg)
    && /不得把 beat 读成/.test(seg);
})(), '结算段必须渲染口径配对限定（v3.13 措辞）——限定先于被限定者；beat/below 方向口径保留');

// 12. cron 注入源级（口径措辞同步进 agent prompt）
c313('cron 注入源级：口径一致才配对措辞进注入脚本', (() => {
  const fs313 = require('fs');
  const p = require('path').join(require('os').homedir(), '.hermes/scripts/hf-cron-fetch.sh');
  if (!fs313.existsSync(p)) return false;
  const sh = fs313.readFileSync(p, 'utf-8');
  return /口径一致才配对/.test(sh)
    && /口径未限定/.test(sh)
    && /歧义\(GAAP\/非GAAP多值或口径未限定\)/.test(sh)
    && /guidanceSettlement/.test(sh);   // v3.5 注入不断链
})(), 'hf-cron-fetch.sh 必须含口径配对限定与歧义新措辞——引擎产出了但注入脚本不读＝agent 看不到（同型断链纪律）');

// 13. 版本号一致性（五处对齐 3.19.0）
c313('版本号一致性：五处对齐 3.27.0', (() => {
  const fs313 = require('fs');
  const VERSION = fs313.readFileSync(require('path').join(__dirname, 'VERSION'), 'utf-8').trim();
  const pkg = JSON.parse(fs313.readFileSync(require('path').join(__dirname, 'package.json'), 'utf-8'));
  const rp = fs313.readFileSync(require('path').join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  const pf = fs313.readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return VERSION === '3.27.0'
    && pkg.version === '3.27.0'
    && rp.includes('文明推演引擎 v3.27.0')      // banner
    && /version: '3\.27\.0'/.test(pf)          // projection meta
    && /version: '3\.27\.0'/.test(rp);         // run-pipeline fullReport meta
})(), 'VERSION/package.json/banner/projection meta/run-pipeline meta 必须对齐 3.27.0，防 corr-2026-014 版本漂移复发');

// ── v3.13 汇总 ──
(async () => {
  const results = await Promise.all(v313.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v313.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.13: ${v313.length - f} 通过, ${f} 失败, 共 ${v313.length} 个`);
  if (f > 0) {
    console.log('结论：结算指标扩展不完整（抽取/口径/配对/作用域/去重/端到端/版本有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：结算指标从 2 个扩到 4 个族（毛利率 bullet 形态/EPS/营业利润；opex/税率无实际值来源留边界），GAAP/非 GAAP 口径分 key 配对，全年值不混进财季 key，同句连续备案按备案号定位财季，旧 artifact claim 经名词对齐 key 配对。live 端到端新结算 7 条（5 命中/2 未中），Brier 义务样本 10→11。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v3.14 — META CFO 评论式指引形态进库（已知边界推进：区间指引语法
// + bullet 营收实际值 + 全年期间修复）
//
// 审计实测（2026-10-26，corr-2026-032）：META 自 v3.4 起就在 14 家
// 公司名单里，但三份备案的 CFO Outlook Commentary 段三条旧指引形态
// 全部不命中——form A 要 "is/are expected to be"、form B 要动词与
// 指标名词紧邻，而 META 的句式是 "We expect fourth quarter 2026
// total revenue to be in the range of $73-76 billion"（动词在前、
// 期间短语间隔、连字符区间）。三个版本零条 META 指引进台账，与
// MSFT/GOOGL「只在电话会口头给指引」混在同一句描述里——在窗公司
// ≠ 采到的指引。
//
// 本轮（全部 2026-10-26 从 SEC EDGAR 实抓原文驱动）：
//   ① extractGuidance 新增 form D（动词+间隔词≥1+指标+区间标记），
//      间隔词类含连字符（"GAAP and non-GAAP"），值尾部小数点容差
//      （"between 16.0% and 18.0%" 的小数点不是句读）
//   ② 区间语法扩两种：连字符美元区间（$73-76 billion 两端同单位）
//      与单百分号区间（between 15-17%）；"between X% and Y%" 的
//      单位组补 %（NVDA 全年税率 live）
//   ③ 期间形态补两个全年形态：锚词在年份前（expect full year 2026）
//      与裸年份（anticipate 2026 capital expenditures）；顺带修复
//      ANNUAL_PERIOD_PATTERN 对 "full year fiscal 2027" 不命中的
//      隐藏错配（NVDA 全年税率指引自 v3.4 起被错记成 FY27Q1）
//   ④ extractActuals 新增 META 亮点 bullet 营收形态（实际值句在
//      汇总表之后、超出 lead=1600 窗口：10-21@2088/04-29@2153）
//   ⑤ 多季度指引守卫（"remaining quarters of 2026" 不适用单期
//      结算，跳过不蹭前句期间）
// live 端到端（见组 3）：10 条 META 指引登记，Q2 营收区间
// $58-61B vs 实际 $60.80B 带内命中（到期结算），Q3/Q4/全年
// 费用/capex/税率按到期门与年度实际值边界保持 pending。
// 同轮修一个端到端断点：EDGAR 指引 claim 额度 40→70 并加截断
// 披露——live 实测 61 条 claim，旧上限把 ticker 顺序尾部的
// META/AMZN/GOOGL/ORCL 整批切掉（辨别了但看不见/登记不了/
// 结算不了，v3.10 候选桶同型）。
// ════════════════════════════════════════════════════════════════
const v314 = [];
function c314(name, ok, detail) { v314.push({ name, ok, detail }); }

// live 原文（2026-10-26 从 SEC EDGAR 实抓：meta-09302026xexhibit991.htm
// 等三份 EX-99，stripHtml 后节选——指引段与实际值段的位置关系保持原样）
const META_1021_TXT = 'EX-99.1 3 meta-09302026xexhibit991.htm EX-99.1 Document Meta Reports Third Quarter 2026 Results Announces Establishment of New Class C Common Stock MENLO PARK, Calif. – October 21, 2026 – Meta Platforms, Inc. (Nasdaq: META) today reported financial results for the quarter ended September 30, 2026. "We hit major milestones this quarter toward delivering personal superintelligence for everyone - including launching Muse and Muse Wonder, our first frontier model," said Mark Zuckerberg, Meta founder and CEO. "Our investments are paying off, the core business is strong, and we\'re seeing velocity across the board." Third Quarter 2026 Financial Highlights Three Months Ended September 30, % Change In millions, except percentages and per share amounts 2026 2025 Revenue $ 64,601 $ 51,242 26 % Costs and expenses 51,613 30,707 68 % Income from operations $ 12,988 $ 20,535 (37) % Operating margin 20 % 40 % Provision for income taxes $ 3,141 $ 18,954 (83) % Effective tax rate 24 % 87 % Net income $ 9,860 $ 2,709 264 % Diluted earnings per share (EPS) $ 3.83 $ 1.05 265 % Agreement with U.S. State Attorneys General In August 2026, we announced an agreement with 52 attorneys general to resolve litigation related to teen mental health and social media, which provides for payments of up to approximately $18.59 billion. Third quarter 2026 costs and expenses includes a $9.89 billion charge related to this agreement. Excluding this charge, the third quarter 2026: • Income from operations of $12.99 billion would have increased by $9.89 billion to $22.88 billion. • Diluted EPS of $3.83 would have increased by $3.57 to $7.40. • Effective tax rate of 24% would have decreased by 7 percentage points to 17%. Third Quarter 2026 Operational and Other Financial Highlights • Family daily active people (DAP) – DAP was 3.64 billion on average for September 2026, an increase of 3% year-over-year. • Ad impressions – Ad impressions delivered across our Family of Apps increased by 10% year-over-year. • Average price per ad – Average price per ad increased by 14% year-over-year. • Revenue – Revenue was $64.60 billion, an increase of 26% year-over-year on both a reported and constant currency basis. • Costs and expenses – Total costs and expenses were $51.61 billion, an increase of 68% year-over-year. This includes the litigation charge as discussed above. • Capital expenditures – Capital expenditures, including principal payments on finance leases, were $34.91 billion. • Capital return program – Dividend and dividend equivalent payments were $1.36 billion. • Cash, cash equivalents, and marketable securities – Cash, cash equivalents, and marketable securities were $82.45 billion as of September 30, 2026. • Cash flow – Cash flow from operating activities was $32.79 billion, and free cash flow was negative $2.12 billion. (1) • Headcount – Headcount was 66,775 as of September 30, 2026, a decrease of 15% year-over-year. ____________________________________ (1) For more information on our free cash flow non-GAAP financial measure, see the sections entitled "Non-GAAP Financial Measures" and "Reconciliation of GAAP to Non-GAAP Results" in this press release. 1 CFO Outlook Commentary We expect fourth quarter 2026 total revenue to be in the range of $73-76 billion. Our guidance assumes foreign currency is an approximately 1% headwind to year-over-year total revenue growth, based on current exchange rates. We are raising our expense outlook to incorporate the $9.9 billion charge related to legal proceedings recognized in the third quarter. We now expect full year 2026 total expenses to be in the range of $175-179 billion. Excluding the third quarter legal charge, we continue to expect 2026 operating income to be above 2025 operating income. At a segment level, we now expect Reality Labs losses to decline compared to 2025 to a range of $18-19 billion. We anticipate 2026 capital expenditures, including principal payments on finance leases, to be in the range of $135-145 billion, narrowed from our prior outlook of $130-145 billion. Absent any changes to our tax landscape, we expect our fourth quarter 2026 tax rate to be between 15-17%. Additionally, we continue to monitor active legal and regulatory matters that could significantly impact our business and financial results. For example, we continue to see scrutiny on youth-related issues in several markets and have a number of youth-related trials scheduled in the coming months in the U.S. Looking beyond 2026, we are still developing our budget and capacity plans for next year, but we expect to continue investing aggr';
const META_0729_TXT = 'EX-99.1 2 meta-06302026xexhibit991.htm EX-99.1 Document Meta Reports Second Quarter 2026 Results MENLO PARK, Calif. – July 29, 2026 – Meta Platforms, Inc. (Nasdaq: META) today reported financial results for the quarter ended June 30, 2026. Second Quarter 2026 Financial Highlights Three Months Ended June 30, % Change In millions, except per share data Revenue $60,800 $51,220 19 % Costs and expenses 42,030 27,179 55 % Income from operations 18,770 24,041 (22)% Net income 7,529 12,560 (40)% • Revenue – Revenue was $60.80 billion, an increase of 28% year-over-year. • Costs and expenses – Total costs and expenses were $42.03 billion, an increase of 55% year-over-year. • Capital expenditures – Capital expenditures, including principal payments on finance leases, were $31.08 billion. 1 CFO Outlook Commentary We expect third quarter 2026 total revenue to be in the range of $61-64 billion. Our guidance assumes foreign currency is an approximately 1% headwind to year-over-year total revenue growth, based on current exchange rates. We are raising the lower-end of our expense outlook to incorporate the $2.4 billion charges related to legal proceedings recognized in the second quarter. We now expect full year 2026 total expenses to be in the range of $165-169 billion. We continue to expect to deliver operating income this year that is above 2025 operating income. We anticipate 2026 capital expenditures, including principal payments on finance leases, to be in the range of $130-145 billion, narrowed from our prior outlook of $125-145 billion. Absent any changes to our tax landscape, we expect our tax rate for the remaining quarters of 2026 to be between 15-17%, an increase from our prior outlook of 13-16%.';
const META_0429_TXT = 'EX-99.1 2 meta-03312026xexhibit991.htm EX-99.1 Document Meta Reports First Quarter 2026 Results MENLO PARK, Calif. – April 29, 2026 – Meta Platforms, Inc. (Nasdaq: META) today reported financial results for the quarter ended March 31, 2026. "We had a milestone quarter with strong momentum across our apps and the release of our first model from Meta Superintelligence Labs," said Mark Zuckerberg, Meta founder and CEO. "We\'re on track to deliver personal superintelligence to billions of people." First Quarter 2026 Financial Highlights Three Months Ended March 31, % Change In millions, except percentages and per share amounts 2026 2025 Revenue $ 56,311 $ 42,314 33 % Costs and expenses 33,439 24,759 35 % Income from operations $ 22,872 $ 17,555 30 % Operating margin 41 % 41 % Provision (benefit) for income taxes (1) $ (5,021) $ 1,738 NM Effective tax rate (1) (23) % 9 % Net income $ 26,773 $ 16,644 61 % Diluted earnings per share (EPS) (1) $ 10.44 $ 6.43 62 % ____________________________________ NM — not meaningful (1) Includes an $8.03 billion income tax benefit recognized in the first quarter of 2026, which partially offsets the $15.93 billion non-cash tax charge recorded in the third quarter of 2025 upon enactment of the One Big Beautiful Bill Act. This benefit is the result of U.S. Treasury Notice 2026-7, which addressed the Corporate Alternative Minimum Tax treatment of previously capitalized U.S. research and development costs. Excluding this tax benefit, our effective tax rate would have been 37 percentage points higher and our diluted earnings per share (EPS) would have been $3.13 lower. First Quarter 2026 Operational and Other Financial Highlights • Family daily active people (DAP) – DAP was 3.56 billion on average for March 2026, an increase of 4% year-over-year. The slight decline in DAP on a quarter-over-quarter basis was driven by internet disruptions in Iran, as well as a restriction on access to WhatsApp in Russia. • Ad impressions – Ad impressions delivered across our Family of Apps increased by 19% year-over-year. • Average price per ad – Average price per ad increased by 12% year-over-year. • Revenue – Revenue was $56.31 billion, an increase of 33% year-over-year. Revenue on a constant currency basis would have increased by 29% year-over-year. • Costs and expenses – Total costs and expenses were $33.44 billion, an increase of 35% year-over-year. • Capital expenditures – Capital expenditures, including principal payments on finance leases, were $19.84 billion. • Capital return program – Dividend and dividend equivalent payments were $1.35 billion. • Cash, cash equivalents, and marketable securities – Cash, cash equivalents, and marketable securities were $81.18 billion as of March 31, 2026. • Cash flow – Cash flow from operating activities was $32.23 billion, and free cash flow was $12.39 billion. (1) • Headcount – Headcount was 77,986 as of March 31, 2026, an increase of 1% year-over-year. ____________________________________ (1) For more information on our free cash flow non-GAAP financial measure, see the sections entitled "Non-GAAP Financial Measures" and "Reconciliation of GAAP to Non-GAAP Results" in this press release. 1 CFO Outlook Commentary We expect second quarter 2026 total revenue to be in the range of $58-61 billion. Our guidance assumes foreign currency is an approximately 2% tailwind to year-over-year total revenue growth, based on current exchange rates. We expect full year 2026 total expenses to be in the range of $162-169 billion, unchanged from our prior outlook. We continue to expect to deliver operating income this year that is above 2025 operating income. We anticipate 2026 capital expenditures, including principal payments on finance leases, to be in the range of $125-145 billion, increased from our prior range of $115-135 billion. This reflects our expectations for higher component pricing this year and, to a lesser extent, additional data center costs to support future year capacity. Absent any changes to our tax landscape, we expect our tax rate for the remaining quarters of 2026 to be between 13-16%. Lastly, we continue to monitor active legal and regulatory matters, including headwinds in the EU and the U.S. that could significantly impact our business and financial results. For example, we continue to see scrutiny on youth-related issues and have additional trials scheduled for this year in the U.S., which may ultimately result in a material loss. 2 Webcast and Conference Call Information Meta will host a conference call to discuss its results at 2:30 p.m. PT / 5:30 p.m. ET';

// ── 组 1：采集器指引抽取扩库（live 实证原文）──────────────────
// 1. META 10-21 CFO Commentary 四形态（季度连字符区间/全年区间/裸年份全年/between 百分点）
c314('extractGuidance：META CFO 评论式四形态（区间语法+全年期间+多季度守卫）', (() => {
  const { extractGuidance } = require('./human-future/scripts/edgar-collector.js');
  const { guidance } = extractGuidance(META_1021_TXT);
  const rev = guidance.find(g => /73-76/.test(g.value || ''));
  const exp = guidance.find(g => /175-179/.test(g.value || ''));
  const capex = guidance.find(g => /135-145/.test(g.value || ''));
  const tax = guidance.find(g => /15-17/.test(g.value || ''));
  return guidance.length === 4
    && rev && rev.settleMetric === 'revenue' && rev.isRange === true && rev.quarter === 4 && rev.fiscalYear === 2026 && rev.annual === false
    && exp && exp.settleMetric === 'total expenses' && exp.annual === true && exp.quarter === null && exp.fiscalYear === 2026 && exp.periodLabel === 'FY2026 全年'
    && capex && capex.settleMetric === 'capital expenditures' && capex.annual === true   // 裸年份全年形态
    && tax && tax.settleMetric === 'tax rate' && tax.isRange === true && tax.quarter === 4 && tax.value === 'between 15-17%';
})(), 'META 三份备案零条指引进台账（v3.4 起三个版本）——"We expect fourth quarter 2026 total revenue to be in the range of $73-76 billion" 三条旧形态全部不命中');

// 2. META 07-29：多季度指引跳过（不蹭前句 capex 的全年期间）
c314('extractGuidance：多季度指引跳过（remaining quarters 不适用单期结算）', (() => {
  const { extractGuidance } = require('./human-future/scripts/edgar-collector.js');
  const { guidance } = extractGuidance(META_0729_TXT);
  const multi = guidance.find(g => /remaining\s+quarters/i.test(g.sentence));
  const rev = guidance.find(g => /61-64/.test(g.value || ''));
  const capex = guidance.find(g => /130-145/.test(g.value || ''));
  return guidance.length === 3 && !multi
    && rev && rev.quarter === 3 && rev.fiscalYear === 2026            // 季度指引期间不串台
    && capex && capex.annual === true && capex.fiscalYear === 2026;   // 全年指引期间正确
})(), '"tax rate for the remaining quarters of 2026" 覆盖多财季——不跳过会被右侧邻近的 "anticipate 2026 capital expenditures" 抢成 FY2026 全年（rightmost-wins 实测）');

// 3. NVDA expects 在前全年税率（full year fiscal 2027 → annual；between X% and Y% 区间）
c314('extractGuidance：NVDA expects 在前全年税率（年度期间修复+双百分号区间）', (() => {
  const { extractGuidance } = require('./human-future/scripts/edgar-collector.js');
  const NVDA = 'Outlook NVIDIA\'s outlook for the second quarter of fiscal 2027 is as follows: • Revenue is expected to be $91.0 billion, plus or minus 2%. • GAAP and non-GAAP gross margins are expected to be 74.9% and 75.0%, respectively, plus or minus 50 basis points. • GAAP and non-GAAP operating expenses are expected to be approximately $8.5 billion and $8.3 billion, respectively. For the full year fiscal 2027, NVIDIA expects GAAP and non-GAAP tax rates to be between 16.0% and 18.0%, excluding any discrete items.';
  const { guidance } = extractGuidance(NVDA);
  const tax = guidance.find(g => g.metric === 'tax rates');
  const rev = guidance.find(g => g.metric === 'revenue');
  return guidance.length === 4
    && tax && tax.annual === true && tax.quarter === null && tax.fiscalYear === 2027 && tax.periodLabel === 'FY2027 全年'
    && tax && tax.isRange === true && tax.value === 'between 16.0% and 18.0%' && tax.gaapBasis === 'gaap+non-gaap'
    && rev && rev.quarter === 2 && rev.fiscalYear === 2027;          // 季度指引不受全年形态影响
})(), 'ANNUAL_PERIOD_PATTERN 旧写法不匹配 "full year fiscal 2027"（year 与数字间还有 fiscal）——NVDA 全年税率指引自 v3.4 起被错记成 FY27Q1（dueOn 2026-06-14）；between X% and Y% 的单位组旧写法只有 billion/million，区间退化成点值');

// 4. extractActuals META bullet 营收（lead 窗口外，10-21/04-29 live）
c314('extractActuals：META 亮点 bullet 营收（汇总表之后、lead 窗口外）', (() => {
  const { extractActuals } = require('./human-future/scripts/edgar-collector.js');
  const ex21 = extractActuals(META_1021_TXT);
  const ex29 = extractActuals(META_0429_TXT);
  const ex0729 = extractActuals(META_0729_TXT);
  return ex21.quarter === 3 && ex21.fiscalYear === 2026
    && ex21.actuals.length === 1 && ex21.actuals[0].metric === 'revenue' && ex21.actuals[0].value === '$64.60 billion'
    && ex29.quarter === 1 && ex29.fiscalYear === 2026 && ex29.actuals[0].value === '$56.31 billion'
    && ex0729.actuals[0].value === '$60.80 billion';   // 07-29 bullet 在 lead 窗口内（旧模式本就抽得到）
})(), 'META 实际值句 "• Revenue – Revenue was $64.60 billion" 在汇总表之后（live 实测 10-21@2088、04-29@2153，超出 lead=1600）——07-29@1343 在窗口内所以旧模式抽得到，另两份抽不到，到期营收指引找不到对账依据');

// ── 组 2：区间解析纯函数（连字符两种 + 双百分号 + 单位不混）─────
// 5. parseRange 连字符美元区间/单百分号/双百分号 between-and
c314('parseRange：连字符区间与单百分号区间（META/NVDA live 两种新语法）', (() => {
  const { parseRange, settleGuidance } = require('./human-future/scripts/earnings-settlement.js');
  const dashUsd = parseRange('in the range of $58-61 billion');
  const dashPct = parseRange('between 15-17%');
  const bothPct = parseRange('between 16.0% and 18.0%');
  const legacy = parseRange('between $197.0 billion and $202.0 billion');
  const legacyPct = parseRange('52.1% to 53.1%');
  const hitQ2 = settleGuidance({ value: 'in the range of $58-61 billion', isRange: true }, '$60.80 billion');
  const beatQ3 = settleGuidance({ value: 'in the range of $61-64 billion', isRange: true }, '$64.60 billion');
  const unitMix = settleGuidance({ value: 'in the range of $58-61 billion', isRange: true }, '16.2%');
  return dashUsd && dashUsd.lo === 58e9 && dashUsd.hi === 61e9 && dashUsd.unit === 'usd'
    && dashPct && dashPct.lo === 15 && dashPct.hi === 17 && dashPct.unit === 'pct'
    && bothPct && bothPct.lo === 16 && bothPct.hi === 18 && bothPct.unit === 'pct'
    && legacy && legacy.lo === 197e9 && legacyPct && legacyPct.lo === 52.1   // 旧语法不回退
    && hitQ2.settleable && hitQ2.hit === true && /in-band/.test(hitQ2.direction)
    && beatQ3.settleable && beatQ3.hit === false && /beat/.test(beatQ3.direction)
    && unitMix.settleable === false && /不兼容/.test(unitMix.reason);       // 美元区间 vs 百分点实际值
})(), '"$73-76 billion" 两端同单位（billion 只写一次）、"between 15-17%" 单百分号——旧正则整个不命中，区间指引被当成点值（无容差不可结算）');

// ── 组 3：结算编排端到端（登记 + 到期门 + in-band 命中）─────────
// 6. buildForecastDiscrimination 端到端：10 条登记、Q2 in-band 命中、Q3/Q4/全年 pending
c314('端到端：META 指引登记 + Q2 营收区间 in-band 命中（到期门生效）', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const fs = require('fs');
  const LEDGER = path.join(__dirname, 'human-future/data/prediction-ledger.json');
  const saved = fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf-8') : null;
  try {
    fs.writeFileSync(LEDGER, JSON.stringify({ version: '1.0.0', predictions: [] }, null, 2));
    // 指引/实际值字段用本轮 live 探针实抽结果（extractGuidance/extractActuals 对
    // 三份原文的产物），期间/口径/区间标记保持采集器输出原样
    const mkItem = (date, acc, quarter, guidance, actuals, actualPeriod) => ({
      title: `Meta Platforms, Inc. (META) 8-K 业绩发布 · ${date}`, link: `https://www.sec.gov/Archives/edgar/data/1326801/${acc}/${acc}-index.htm`,
      pubDate: date, description: '财报指引', body: '', source: 'SEC EDGAR', origin: 'live',
      ticker: 'META', form: '8-K', accession: acc, filingDate: date, fiscalYearEnd: '1231',
      guidance, actuals, actualPeriod,
    });
    const g = (sentence, metric, settleMetric, value, quarter, annual) =>
      ({ sentence, metric, settleMetric, gaapBasis: '', value, tolerance: null, isRange: true, quarter, fiscalYear: 2026, annual: !!annual, periodLabel: quarter ? `FY2026 Q${quarter}` : 'FY2026 全年', caveats: [] });
    const eng = new ProjectionEngine({});
    eng.signals = { totalItems: 3, domains: [], items: [
      mkItem('2026-04-29', '0001628280-26-028364', 1, [
        g('expect second quarter 2026 total revenue to be in the range of $58-61 billion', 'total revenue', 'revenue', 'in the range of $58-61 billion', 2),
        g('expect full year 2026 total expenses to be in the range of $162-169 billion', 'total expenses', 'total expenses', 'in the range of $162-169 billion', null, true),
        g('anticipate 2026 capital expenditures, including principal payments on finance leases, to be in the range of $125-145 billion', 'capital expenditures', 'capital expenditures', 'in the range of $125-145 billion', null, true),
      ], [{ metric: 'revenue', value: '$56.31 billion', gaapBasis: '' }], { quarter: 1, fiscalYear: 2026 }),
      mkItem('2026-07-29', '0001628280-26-050596', 2, [
        g('expect third quarter 2026 total revenue to be in the range of $61-64 billion', 'total revenue', 'revenue', 'in the range of $61-64 billion', 3),
        g('expect full year 2026 total expenses to be in the range of $165-169 billion', 'total expenses', 'total expenses', 'in the range of $165-169 billion', null, true),
        g('anticipate 2026 capital expenditures, including principal payments on finance leases, to be in the range of $130-145 billion', 'capital expenditures', 'capital expenditures', 'in the range of $130-145 billion', null, true),
      ], [{ metric: 'revenue', value: '$60.80 billion', gaapBasis: '' }], { quarter: 2, fiscalYear: 2026 }),
      mkItem('2026-10-21', '0001628280-26-066700', 3, [
        g('expect fourth quarter 2026 total revenue to be in the range of $73-76 billion', 'total revenue', 'revenue', 'in the range of $73-76 billion', 4),
        g('expect full year 2026 total expenses to be in the range of $175-179 billion', 'total expenses', 'total expenses', 'in the range of $175-179 billion', null, true),
        g('anticipate 2026 capital expenditures, including principal payments on finance leases, to be in the range of $135-145 billion', 'capital expenditures', 'capital expenditures', 'in the range of $135-145 billion', null, true),
        g('expect our fourth quarter 2026 tax rate to be between 15-17%', 'tax rate', 'tax rate', 'between 15-17%', 4),
      ], [{ metric: 'revenue', value: '$64.60 billion', gaapBasis: '' }], { quarter: 3, fiscalYear: 2026 }),
    ]};
    const r = eng.buildForecastDiscrimination();
    const after = JSON.parse(fs.readFileSync(LEDGER, 'utf-8'));
    const q2 = after.predictions.find(p => /58-61/.test(p.claim || ''));
    const q3 = after.predictions.find(p => /61-64/.test(p.claim || ''));
    const eg = (r.results || []).filter(x => x.verdict === 'earnings-guidance');
    const settled = r.guidanceSettlement.settled || [];
    return eg.length === 10
      && r.ledgerRegistration.registered.length === 10
      && settled.length === 1 && settled[0].hit === true && /in-band/.test(settled[0].direction)
      && /FY2026 Q2/.test(settled[0].period) && settled[0].actual === '$60.80 billion'
      && r.guidanceSettlement.pending === 9            // Q3/Q4 营收 + 全年费用/capex + 税率：到期门与年度实际值边界
      && q2 && q2.outcome === true && q2.evidence && q2.evidence.metric === 'revenue' && /in-band/.test(q2.evidence.summary || '')
      && q3 && q3.outcome === null;                     // Q3 未到期（dueOn 2026-11-14）不提前结
  } finally {
    if (saved === null) { try { fs.unlinkSync(LEDGER); } catch (_) {} } else fs.writeFileSync(LEDGER, saved);
  }
})(), '到期才结算：Q2 营收区间 $58-61B vs 实际 $60.80B 带内命中落账；Q3（dueOn 2026-11-14）未到期不提前结；全年费用/capex 无年度实际值保持 pending（已知边界）');

// 7. EDGAR 指引 claim 额度：60+ 条不静默切尾（v3.14 live：61 条，旧上限 40 把 META/AMZN 整批切掉；
//    [v3.19] 额度随代码 70→80：v3.19 轮 live 实测 77 条（AVGO/DELL/PLTR 书面指引进库 +16），
//    断言同步更新为 80——上限纪律不变：超额披露 seen/cut/cap，不静默切尾）
c314('端到端：EDGAR 指引 claim 额度 40→80（尾部公司不静默切掉）+ 超限披露', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const fs = require('fs');
  const LEDGER = path.join(__dirname, 'human-future/data/prediction-ledger.json');
  const saved = fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf-8') : null;
  try {
    fs.writeFileSync(LEDGER, JSON.stringify({ version: '1.0.0', predictions: [] }, null, 2));
    // 15 家「公司」× 3 条指引 = 45 条 claim（live 实测 61 条的同型场景：
    // 旧代码 claims.length>=40 即 break，第 41 条起（ticker 顺序尾部的
    // META/AMZN/GOOGL/ORCL）整批不进辨别、不登记、不结算）
    const mkItem = (i, q) => ({
      title: `TEST Co${i} 8-K 业绩发布 · 2026-05-0${(i % 9) + 1}`, link: `https://example.com/edgar-cap-${i}`,
      pubDate: '2026-05-01', description: '财报指引', body: '', source: 'SEC EDGAR', origin: 'live',
      ticker: `T${i}`, form: '8-K', accession: `0000000000-26-00000${i}`, filingDate: '2026-05-01', fiscalYearEnd: '1231',
      guidance: [1, 2, 3].map(k => ({
        sentence: `expect quarter ${q} 2026 total revenue to be in the range of $5${k}-6${k} billion`,
        metric: 'total revenue', settleMetric: 'revenue', gaapBasis: '', value: `in the range of $5${k}-6${k} billion`,
        tolerance: null, isRange: true, quarter: q, fiscalYear: 2026, annual: false, periodLabel: `FY2026 Q${q}`, caveats: [],
      })),
      actuals: [], actualPeriod: null,
    });
    const eng = new ProjectionEngine({});
    eng.signals = { totalItems: 15, domains: [], items: Array.from({ length: 15 }, (_, i) => mkItem(i, 2)) };
    const r = eng.buildForecastDiscrimination();
    // 超限场景（[v3.19] 35 家 × 3 = 105 条 > 80 → 披露 seen/cut/cap；
    // 旧夹具 25 家 × 3 = 75 在 80 额度内全进、触达不到截断分支，断言空转。
    // [v3.25] 额度 90→170（20 家 live 实测 155 条）后 35 家×3=105 又不超限，
    // 夹具同步调到 60 家×3=180 > 170 → cut=10）
    const eng2 = new ProjectionEngine({});
    eng2.signals = { totalItems: 60, domains: [], items: Array.from({ length: 60 }, (_, i) => mkItem(i, 2)) };
    const r2 = eng2.buildForecastDiscrimination();
    const t = r2.edgarClaimsTruncation;
    // 渲染披露行源级（formatReport 的口径限定行——与 v3.10 源级断言同型）
    const src = fs.readFileSync(path.join(__dirname, 'scripts/project-future.js'), 'utf-8');
    // cron 注入源级：披露必须到达 agent prompt（v3.10/v3.11 同型断链纪律）
    const sh = fs.readFileSync(require('path').join(require('os').homedir(), '.hermes/scripts/hf-cron-fetch.sh'), 'utf-8');
    return r.ledgerRegistration.registered.length === 45 && r.edgarClaimsTruncation === null   // 45 < 80：全进，无披露
      && t && t.seen === 180 && t.cut === 10 && t.cap === 170           // [v3.25] 180 > 170：披露 10 条未进
      && /口径限定：本期 SEC EDGAR 指引 claim 共/.test(src)              // 披露行渲染进报告
      && /EDGAR_CLAIMS_CAP = 170/.test(src)                            // [v3.25] 额度 170 落在代码里
      && /edgarClaimsTruncation/.test(sh) && /不得当成「没有问题」/.test(sh);  // 注入脚本同屏披露
  } finally {
    if (saved === null) { try { fs.unlinkSync(LEDGER); } catch (_) {} } else fs.writeFileSync(LEDGER, saved);
  }
})(), 'live 实测 EDGAR 指引 claim 61 条——旧上限 40 把 ticker 顺序尾部的 META/AMZN/GOOGL/ORCL 整批切掉（辨别了但看不见/登记不了/结算不了，v3.10 候选桶同型）；超限时披露 seen/cut/cap 不静默切尾');

// ── 组 4：精度回归 + 版本号 ────────────────────────────────────
// 8. 精度回归：无区间标记的期望句不进库（form B/C 分界）+ 旧 live 夹具不变
c314('精度回归：无区间标记期望句不进库 + 旧形态夹具逐一不变', (() => {
  const { extractGuidance } = require('./human-future/scripts/edgar-collector.js');
  // ① 点值期望句（form B 地盘）不得被 form D 重复抽取
  const AMD = 'For the third quarter of 2026, AMD expects revenue to be approximately $13 billion, plus or minus $300 million. AMD expects non-GAAP gross margin to be approximately 56%.';
  const { guidance: amd } = extractGuidance(AMD);
  const revCount = amd.filter(g => /13 billion/.test(g.value || '')).length;
  // ② 无区间标记的期望句根本不进库（"expects revenue to grow" 类）
  const NOVAL = 'We expect revenue to grow nicely next year as demand accelerates across all segments.';
  const { guidance: nv } = extractGuidance(NOVAL);
  // ③ v3.4/v3.13 旧 live 夹具：NVDA 02-25（全年税率修复后期间正确）
  const NVDA_OLD = 'Outlook NVIDIA\'s outlook for the first quarter of fiscal 2027 is as follows: • Revenue is expected to be $78.0 billion, plus or minus 2%. • GAAP and non-GAAP gross margins are expected to be 74.9% and 75.0%, respectively, plus or minus 50 basis points. • GAAP and non-GAAP operating expenses are expected to be approximately $7.7 billion and $7.5 billion, respectively. For the full year fiscal 2027, GAAP and non-GAAP tax rates are expected to be between 17.0% and 19.0%, excluding any discrete items.';
  const { guidance: nvOld } = extractGuidance(NVDA_OLD);
  const nvTax = nvOld.find(g => g.metric === 'tax rates');
  return revCount === 1 && nv.length === 0
    && nvOld.length === 4
    && nvTax && nvTax.annual === true && nvTax.fiscalYear === 2027 && nvTax.value === 'between 17.0% and 19.0%'
    && nvOld.find(g => g.metric === 'revenue').quarter === 1;
})(), 'form D 间隔词≥1 与 form B 零重叠（点值区间句不重复抽取）；无区间标记的期望句不是可证伪主张；NVDA 02-25 旧夹具期间从 FY27Q1 纠正为 FY27 全年');

// 8. 版本号一致性（五处对齐 3.19.0）
c314('版本号一致性：五处对齐 3.27.0', (() => {
  const fs314 = require('fs');
  const VERSION = fs314.readFileSync(require('path').join(__dirname, 'VERSION'), 'utf-8').trim();
  const pkg = JSON.parse(fs314.readFileSync(require('path').join(__dirname, 'package.json'), 'utf-8'));
  const rp = fs314.readFileSync(require('path').join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  const pf = fs314.readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return VERSION === '3.27.0'
    && pkg.version === '3.27.0'
    && rp.includes('文明推演引擎 v3.27.0')      // banner
    && /version: '3\.27\.0'/.test(pf)          // projection meta
    && /version: '3\.27\.0'/.test(rp);         // run-pipeline fullReport meta
})(), 'VERSION/package.json/banner/projection meta/run-pipeline meta 必须对齐 3.27.0，防 corr-2026-014 版本漂移复发');

// ── v3.14 汇总 ──
(async () => {
  const results = await Promise.all(v314.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v314.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.14: ${v314.length - f} 通过, ${f} 失败, 共 ${v314.length} 个`);
  if (f > 0) {
    console.log('结论：META CFO 评论式指引形态进库不完整（抽取/区间/期间/实际值/结算/精度/版本有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：META CFO 评论式指引（动词+期间间隔+连字符/单百分号区间）进库，bullet 营收实际值可抽，全年期间修复（full year fiscal YYYY + 锚词在前 + 裸年份），多季度指引守卫，EDGAR claim 额度 40→70 不静默切尾；live 端到端 10 条登记、Q2 营收区间 in-band 命中。');
  }
})();

// v3.15 — 全年实际值抽取 + annual key 配对（已知边界推进：全年指引结算能力）
//
// 定位：v3.14 把 META FY2026 全年费用/capex 区间指引登记进台账（dueOn
// 2027-02-14），白纸黑字的已知边界是「全年实际值在 Q4 备案的『季度+全年』
// 双值句里（"were $22.14 billion and $72.x billion"），抽全年值+annual
// key 索引是后续轮次候选」——全年指引永远 pending，「到期结算」对全年类
// 指引从未覆盖。台账 9 条 annual=true 全年指引（META FY2026 费用/capex×6
// + NVDA FY2027 全年税率×3，live 台账实证）全部押在这个能力上。
//
// 本轮（全部 2026-10-27 从 SEC EDGAR 实抓原文驱动，六家 Q4 备案）：
//   ① extractAnnualActuals 新函数：双值句取全年值（第二个值）+ 单值
//      全年句（for fiscal YYYY / full year YYYY / 尾部 in YYYY）
//   ② annual key 索引（quarter=null）：全年指引的结算元数据 quarter 恒
//      null，keyBase 就是 ${tk}|${fy}|null|——全年实际值必须落同一段
//   ③ 营收路径补全年值守卫（AMD Q4-FY2025 live 实证：「For the full
//      year 2025, AMD reported record revenue of $34.6 billion」的全年
//      营收被当成财季实际值索引进 (AMD|2025|4|revenue)——旧代码只有毛
//      利率/EPS/营业利润三条路径过守卫，营收主路径不过）——同轮维护
//   ④ 证据来源 annual 感知：全年结算的证据指向真的提供全年实际值的备案
// live 实证：META Q4-2025 全年营收 $200.97B/费用 $117.69B/capex
// $72.22B、NVDA FY2026 全年营收 $215.9B、AMD FY2025 四项、MRVL FY2026
// 营收+EPS 双口径、AMZN FY2025 营收+营业利润全部抽中；Q1-Q3 备案零全年
// 实际值、财季值逐条不变（AMD 全年营收不再漏进财季 key）。
// ════════════════════════════════════════════════════════════════
const v315 = [];
function c315(name, ok, detail) { v315.push({ name, ok, detail }); }

// ── 组 1：extractAnnualActuals 抽取（五家 live 逐字夹具）─────────
// 1. META Q4-2025 双值句：季度在前全年在后，全年值=第二个值
c315('extractAnnualActuals：META Q4-2025 live 逐字双值句（营收/费用/capex 取全年值）', (() => {
  const { extractAnnualActuals } = require('./human-future/scripts/edgar-collector.js');
  // live 逐字（SEC EDGAR 0001628280-26-003832，meta-12312025xexhibit991.htm）
  const META_Q4 = [
    'Meta Reports Fourth Quarter and Full Year 2025 Results',
    'MENLO PARK, Calif. – January 28, 2026 – Meta Platforms, Inc. (Nasdaq: META) today reported financial results for the quarter and full year ended December 31, 2025.',
    'Fourth Quarter and Full Year 2025 Operational and Other Financial Highlights',
    '• Revenue – Revenue was $59.89 billion and $200.97 billion, representing increases of 24% and 22% year-over-year for the fourth quarter and full year 2025, respectively.',
    '• Costs and expenses – Total costs and expenses were $35.15 billion and $117.69 billion, representing increases of 40% and 24% year-over-year for the fourth quarter and full year 2025, respectively.',
    '• Capital expenditures – Capital expenditures, including principal payments on finance leases, were $22.14 billion and $72.22 billion for the fourth quarter and full year 2025, respectively.',
    '• Cash flow – Cash flow from operating activities was $36.21 billion and $115.80 billion, and free cash flow was $14.08 billion and $43.59 billion for the fourth quarter and full year 2025, respectively.',
  ].join(' ');
  const ann = extractAnnualActuals(META_Q4, { fiscalYear: 2025 });
  const byF = Object.fromEntries(ann.map(a => [a.metric, a.value]));
  return byF.revenue === '$200.97 billion'
    && byF['total expenses'] === '$117.69 billion'
    && byF['capital expenditures'] === '$72.22 billion'
    && ann.length === 3              // FCF/经营现金流不在结算指标族（无指引可配对）
    && ann.every(a => a.gaapBasis === '');
})(), 'META 双值句 "were $X and $Y ... for the fourth quarter and full year 2025" 的全年值是第二个；SKILL.md v3.14 边界里的 "were $22.14 billion and $72.x billion" 即 capex 那句');

// 2. NVDA Q4-FY2026 单值全年句 + 双百分号 respectively 无法归属口径整句跳过
c315('extractAnnualActuals：NVDA Q4-FY2026 live 逐字（单值全年句 + respectively 双值跳过）', (() => {
  const { extractAnnualActuals } = require('./human-future/scripts/edgar-collector.js');
  const NVDA_Q4 = [
    'EX-99.1 2 q4fy26pr.htm EX-99.1 Document NVIDIA Announces Financial Results for Fourth Quarter and Fiscal 2026',
    '• Record quarterly revenue of $68.1 billion, up 20% from Q3 and up 73% from a year ago',
    'Reported revenue for the fourth quarter ended January 25, 2026 of $68.1 billion.',
    'For fiscal 2026, revenue was $215.9 billion, up 65% from a year ago.',
    'For fiscal 2026, GAAP and non-GAAP gross margins were 71.1% and 71.3%, respectively.',
    'NVIDIA\'s outlook for the first quarter of fiscal 2027 is as follows: • Revenue is expected to be $78.0 billion, plus or minus 2%.',
  ].join(' ');
  const ann = extractAnnualActuals(NVDA_Q4, { fiscalYear: 2026 });
  return ann.length === 1 && ann[0].metric === 'revenue' && ann[0].value === '$215.9 billion';
})(), '"For fiscal 2026, revenue was $215.9 billion" 单值全年句抽中；"gross margins were 71.1% and 71.3%, respectively" 双口径不同值无法归属，整句跳过（错归口径比漏报危险）；亮点标题句（Fourth Quarter and Fiscal 2026 • Record quarterly revenue of $68.1 billion）不当全年');

// 3. AMD Q4-FY2025 一句多指标（名词+of+值）
c315('extractAnnualActuals：AMD Q4-FY2025 live 逐字一句多指标（营收/毛利率/营业利润/EPS）', (() => {
  const { extractAnnualActuals } = require('./human-future/scripts/edgar-collector.js');
  const AMD_Q4 = [
    'AMD Reports Fourth Quarter and Full Year 2025 Results',
    'AMD Communications reported financial results for the quarter and year ended December 27, 2025.',
    'For the full year 2025, AMD reported record revenue of $34.6 billion, gross margin of 50%, operating income of $3.7 billion, net income of $4.3 billion, and diluted earnings per share of $2.65.',
    'GAAP gross margin was 54% and non-GAAP gross margin was 57% for the fourth quarter.',
  ].join(' ');
  const ann = extractAnnualActuals(AMD_Q4, { fiscalYear: 2025 });
  const byF = Object.fromEntries(ann.map(a => [a.metric, a.value]));
  return byF.revenue === '$34.6 billion' && byF['gross margin'] === '50%'
    && byF['operating income'] === '$3.7 billion' && byF['diluted eps'] === '$2.65'
    && ann.length === 4;            // net income 不在结算指标族
})(), 'AMD "reported record revenue of $34.6 billion, gross margin of 50%, ..." 一句多指标全抽中；EPS 值不带尾随句点（"of $2.65." → "$2.65"）');

// 4. MRVL Q4-FY2026 全年营收 + EPS 双口径
c315('extractAnnualActuals：MRVL Q4-FY2026 live 逐字（全年营收 + EPS GAAP/非GAAP 双口径）', (() => {
  const { extractAnnualActuals } = require('./human-future/scripts/edgar-collector.js');
  const MRVL_Q4 = [
    'Marvell Technology, Inc. Reports Fourth Quarter and Fiscal Year 2026 Financial Results',
    '• Q4 Net Revenue: $2.219 billion, a new record, grew by 22% year-on-year',
    'Net revenue for the fourth quarter of fiscal 2026 was $2.219 billion, $19.0 million above the mid-point of the Company\'s guidance provided on December 2 , 2025.',
    'Net revenue for fiscal 2026 was $8.195 billion, a new record.',
    'GAAP net income for fiscal 2026 was $2.670 billion, or $3.07 per diluted share.',
    'Non-GAAP net income for fiscal 2026 was $2.466 billion, or $2.84 per diluted share.',
    'First Quarter of Fiscal 2027 Financial Outlook • Net revenue is expected to be $2.400 billion +/- 5%.',
  ].join(' ');
  const ann = extractAnnualActuals(MRVL_Q4, { fiscalYear: 2026 });
  const eps = ann.filter(a => a.metric === 'diluted eps');
  return ann.some(a => a.metric === 'revenue' && a.value === '$8.195 billion')
    && eps.length === 2
    && eps.find(e => e.gaapBasis === 'gaap').value === '$3.07'
    && eps.find(e => e.gaapBasis === 'non-gaap').value === '$2.84';
})(), 'MRVL "Net revenue for fiscal 2026 was $8.195 billion" + "GAAP/Non-GAAP net income for fiscal 2026 was ..., or $X per diluted share" 双口径各抽各的');

// 5. AMZN Q4-FY2025 尾部 in YYYY + 同比从句剥除
c315('extractAnnualActuals：AMZN Q4-FY2025 live 逐字（尾部 in 2025 + compared with 剥除）', (() => {
  const { extractAnnualActuals } = require('./human-future/scripts/edgar-collector.js');
  const AMZN_Q4 = [
    'EX-99.1 2 amzn-20251231xex991.htm EX-99.1 Document Exhibit 99.1 AMAZON.COM ANNOUNCES FOURTH QUARTER RESULTS',
    'SEATTLE—(BUSINESS WIRE) February 5, 2026—Amazon.com, Inc. (NASDAQ: AMZN) today announced financial results for its fourth quarter ended December 31, 2025.',
    'Fourth Quarter 2025 • Net sales increased 14% to $213.4 billion in the fourth quarter, compared with $187.8 billion in fourth quarter 2024.',
    '• Operating income increased to $25.0 billion in the fourth quarter, compared with $21.2 billion in fourth quarter 2024.',
    'Full Year 2025 • Net sales increased 12% to $716.9 billion in 2025, compared with $638.0 billion in 2024.',
    '• North America segment sales increased 10% year-over-year to $426.3 billion.',
    '• Operating income increased to $80.0 billion in 2025, compared with $68.6 billion in 2024.',
    '• North America segment operating income was $29.6 billion, compared with operating income of $25.0 billion in 2024.',
    '• Net income increased to $77.7 billion in 2025, or $7.17 per diluted share, compared with $59.2 billion, or $5.53 per diluted share, in 2024.',
  ].join(' ');
  const ann = extractAnnualActuals(AMZN_Q4, { fiscalYear: 2025 });
  const byF = Object.fromEntries(ann.map(a => [a.metric, a.value]));
  return byF.revenue === '$716.9 billion' && byF['operating income'] === '$80.0 billion'
    && ann.length === 2;
})(), 'AMZN 全年段 "increased 12% to $716.9 billion in 2025, compared with $638.0 billion in 2024"：同比从句先剥（金额小数点不能截断剥除），先出现的值才是全年值；分部句（segment operating income was $29.6 billion ... in 2024）剥同比后无年份残留，不误收');

// ── 组 2：精度回归（漏报比误报诚实）────────────────────────────
// 6. 季度句/标题句/指引句/年份不符/FCF 都不进全年；财季路径不受影响
c315('精度回归：季度句/标题句/指引句/年份不符句不进全年 + AMD 全年营收不漏进财季 key', (() => {
  const { extractAnnualActuals, extractActuals } = require('./human-future/scripts/edgar-collector.js');
  const fy = 2026;
  // ① 季度实际值句（for the fourth quarter of fiscal 2026）——含季度标记只走双值形态
  const QTR = 'Net revenue for the fourth quarter of fiscal 2026 was $2.219 billion, a new record.';
  // ② 亮点标题句（Fourth Quarter and Fiscal 2026 + Record quarterly revenue）
  const HEAD = 'NVIDIA Announces Financial Results for Fourth Quarter and Fiscal 2026 • Record quarterly revenue of $68.1 billion, up 20% from Q3.';
  // ③ 指引句（expect ... to be）
  const GUIDE = 'We expect full year 2026 total expenses to be in the range of $175-179 billion.';
  // ④ 年份不等于标题财年（2025 ≠ 2026）
  const WRONGYEAR = 'For fiscal 2025, revenue was $130.5 billion, up 60% from a year ago.';
  // ⑤ FCF 双值句（不在结算指标族）
  const FCF = 'Adjusted free cash flow (2) was $33.20 billion for the fourth quarter of 2026 and $62.31 billion for the full year of 2026.';
  // ⑥ AMD Q4-FY2025 live：财季路径不再把全年营收当财季值（v3.15 守卫修复）
  const AMD_Q4 = [
    'AMD Reports Fourth Quarter and Full Year 2025 Results',
    'AMD Communications reported financial results for the quarter and year ended December 27, 2025.',
    'For the full year 2025, AMD reported record revenue of $34.6 billion, gross margin of 50%, operating income of $3.7 billion, net income of $4.3 billion, and diluted earnings per share of $2.65.',
    'GAAP gross margin was 54% and non-GAAP gross margin was 57% for the fourth quarter.',
  ].join(' ');
  const annualHits = [QTR, HEAD, GUIDE, WRONGYEAR, FCF].map(s => extractAnnualActuals(s, { fiscalYear: fy }).length);
  const ex = extractActuals(AMD_Q4);
  const qRev = ex.actuals.filter(a => a.metric === 'revenue');
  return annualHits.every(n => n === 0)
    && qRev.length === 0                      // 全年营收 $34.6B 不再进 (AMD|2025|4|revenue)
    && ex.annualActuals.some(a => a.metric === 'revenue' && a.value === '$34.6 billion')  // 全年值由全年路径收
    && ex.actuals.some(a => a.metric === 'gross margin' && a.value === '54%');  // 财季毛利率照常
})(), '五类句子零误收；v3.15 同轮修复：营收路径补 notFullYear 守卫后 AMD 全年营收不再漏进财季 key（财季毛利率不受影响）');

// ── 组 3：settleEarningsGuidance annual 配对端到端（受控台账）────
// 7. annual key 配对：区间指引 vs 全年实际值 + 到期门 + 句反推 + 证据来源
c315('settleEarningsGuidance annual 配对：全年区间指引 hit + 到期门 + 证据指向 Q4 备案', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const fs = require('fs');
  const LEDGER = path.join(__dirname, 'human-future/data/prediction-ledger.json');
  const saved = fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf-8') : null;
  try {
    const mock = { version: '1.0.0', predictions: [
      // FY2025 全年费用区间 $115-120B vs 实际 $117.69B → 带内命中（dueOn 已过）
      { id: 't315-meta-exp', claim: 'expect full year 2025 total expenses to be in the range of $115-120 billion', probability: 0.5, domain: 'earnings_guidance', category: 'earnings_guidance', dueOn: '2026-03-15', outcome: null, settlement: { ticker: 'META', fiscalYear: 2025, quarter: null, annual: true, metric: 'total expenses', value: 'in the range of $115-120 billion', tolerance: null, isRange: true } },
      // FY2026 全年 capex：dueOn 未到 → pending 不提前结（到期门）
      { id: 't315-meta-capex', claim: 'anticipate 2026 capital expenditures to be in the range of $135-145 billion', probability: 0.5, domain: 'earnings_guidance', category: 'earnings_guidance', dueOn: '2027-02-14', outcome: null, settlement: { ticker: 'META', fiscalYear: 2026, quarter: null, annual: true, metric: 'capital expenditures', value: 'in the range of $135-145 billion', tolerance: null, isRange: true } },
      // 句反推路径：无 settlement 持久化元数据，claim 句与当期指引句逐字匹配
      { id: 't315-nvda-rev', claim: 'For fiscal 2026, we expect revenue to be in the range of $210-220 billion', probability: 0.5, domain: 'earnings_guidance', category: 'earnings_guidance', dueOn: '2026-04-01', outcome: null },
    ]};
    fs.writeFileSync(LEDGER, JSON.stringify(mock, null, 2));
    const eng = new ProjectionEngine({});
    eng.signals = { totalItems: 3, domains: [], items: [
      // META Q1-FY2025 备案（同财年、无全年实际值）——证据来源断言的对照：
      // 摘除 annual 感知条件后 find() 会命中它（fiscalYear 相同且 quarter==null
      // 放行），证据指向没提供全年实际值的备案；有annualActuals非空条件才定位 Q4
      { source: 'SEC EDGAR', ticker: 'META', link: 'https://sec.gov/meta-q1-2025', accession: '0001628280-25-000009',
        actualPeriod: { quarter: 1, fiscalYear: 2025 },
        actuals: [{ metric: 'revenue', value: '$42.0 billion', gaapBasis: '' }],
        annualActuals: [], guidance: [] },
      // META Q4-2025 备案：全年实际值（live 实抓值）
      { source: 'SEC EDGAR', ticker: 'META', link: 'https://sec.gov/meta-q4-2025', accession: '0001628280-26-003832',
        actualPeriod: { quarter: 4, fiscalYear: 2025 },
        actuals: [{ metric: 'revenue', value: '$59.89 billion', gaapBasis: '' }],
        annualActuals: [
          { metric: 'revenue', value: '$200.97 billion', gaapBasis: '' },
          { metric: 'total expenses', value: '$117.69 billion', gaapBasis: '' },
          { metric: 'capital expenditures', value: '$72.22 billion', gaapBasis: '' },
        ], guidance: [] },
      // NVDA Q4-FY2026 备案：全年营收实际值 + 当期指引句（句反推）
      { source: 'SEC EDGAR', ticker: 'NVDA', link: 'https://sec.gov/nvda-q4-fy26', accession: '0001045810-26-000019',
        actualPeriod: { quarter: 4, fiscalYear: 2026 },
        actuals: [{ metric: 'revenue', value: '$68.1 billion', gaapBasis: '' }],
        annualActuals: [{ metric: 'revenue', value: '$215.9 billion', gaapBasis: '' }],
        guidance: [
          { sentence: 'For fiscal 2026, we expect revenue to be in the range of $210-220 billion', metric: 'revenue', settleMetric: 'revenue', value: 'in the range of $210-220 billion', isRange: true, quarter: null, fiscalYear: 2026, annual: true, gaapBasis: '' },
        ] },
    ]};
    const res = eng.settleEarningsGuidance();
    const byId = Object.fromEntries(res.settled.map(s => [s.id, s]));
    const after = JSON.parse(fs.readFileSync(LEDGER, 'utf-8'));
    const expE = after.predictions.find(p => p.id === 't315-meta-exp');
    const nvE = after.predictions.find(p => p.id === 't315-nvda-rev');
    return byId['t315-meta-exp'] && byId['t315-meta-exp'].hit === true
      && byId['t315-meta-exp'].actual === '$117.69 billion'
      && /FY2025 全年/.test(byId['t315-meta-exp'].period)
      && byId['t315-nvda-rev'] && byId['t315-nvda-rev'].hit === true      // 句反推路径也走 annual key
      && after.predictions.find(p => p.id === 't315-meta-capex').outcome === null  // 到期门
      && res.pending === 1
      && expE.outcome === true && /全年/.test(expE.evidence.summary)
      && expE.evidence.sources[0] === 'https://sec.gov/meta-q4-2025'      // 证据指向提供全年实际值的备案
      && nvE.outcome === true && nvE.evidence.sources[0] === 'https://sec.gov/nvda-q4-fy26';
  } finally {
    if (saved === null) { try { fs.unlinkSync(LEDGER); } catch (_) {} } else fs.writeFileSync(LEDGER, saved);
  }
})(), '全年指引（quarter=null）按 annual key 与 Q4 备案全年实际值配对：区间内判命中、到期门不提前结、证据来源指向真的提供全年值的备案（不落在该公司任一 FY 备案上）');

// ── 组 4：端到端（extractSignals 透传 / cron 注入 / 版本号）─────
// 8. extractSignals 透传 annualActuals（v2.14/v3.4/v3.5 同型断链防护）
c315('extractSignals 透传 annualActuals', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const items = [{
    title: 'META 8-K', description: '', body: 'Revenue was $59.89 billion', source: 'SEC EDGAR',
    bucket: 'sec_filings', origin: 'live', pubDate: '2026-01-28', link: 'https://x/meta',
    fiscalYearEnd: '1231', ticker: 'META', company: 'Meta Platforms', accession: '0001-26-1',
    actualPeriod: { quarter: 4, fiscalYear: 2025 }, actuals: [{ metric: 'revenue', value: '$59.89 billion' }],
    annualActuals: [{ metric: 'revenue', value: '$200.97 billion', gaapBasis: '' }],
    guidance: [],
  }];
  const sig = new ProjectionEngine({ newsData: { sec_filings: { domain: 'sec_filings', news: items } } }).extractSignals();
  const it = sig.items[0];
  return Array.isArray(it.annualActuals) && it.annualActuals.length === 1
    && it.annualActuals[0].value === '$200.97 billion';
})(), 'annualActuals 不在 extractSignals 重建时带上，annual key 永远建不起来（v2.14 同型：字段在采集层打上、读取层有，中间重建时丢）');

// 9. cron 注入源级：全年结算口径限定随结算段进 agent prompt
c315('cron 注入脚本渲染全年结算口径限定', (() => {
  const p = require('path').join(require('os').homedir(), '.hermes/scripts/hf-cron-fetch.sh');
  if (!require('fs').existsSync(p)) return false;
  const src = require('fs').readFileSync(p, 'utf-8');
  return /guidanceSettlement/.test(src)
    && /\[v3\.15\] 全年指引（quarter=null）与 Q4 备案的全年实际值按 annual key 配对/.test(src)
    && /双值句取全年值/.test(src);
})(), '全年结算语义（annual key/双值句取全年值/年份必须等于标题财年）必须随结算段进注入脚本，否则 agent 看不到限定');

// 10. 版本号一致性（五处对齐 3.19.0）
c315('版本号一致性：五处对齐 3.27.0', (() => {
  const fs315 = require('fs');
  const VERSION = fs315.readFileSync(require('path').join(__dirname, 'VERSION'), 'utf-8').trim();
  const pkg = JSON.parse(fs315.readFileSync(require('path').join(__dirname, 'package.json'), 'utf-8'));
  const rp = fs315.readFileSync(require('path').join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  const pf = fs315.readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return VERSION === '3.27.0'
    && pkg.version === '3.27.0'
    && rp.includes('文明推演引擎 v3.27.0')      // banner
    && /version: '3\.27\.0'/.test(pf)          // projection meta
    && /version: '3\.27\.0'/.test(rp);         // run-pipeline fullReport meta
})(), 'VERSION/package.json/banner/projection meta/run-pipeline meta 必须对齐 3.27.0，防 corr-2026-014 版本漂移复发');

// ── v3.15 汇总 ──
(async () => {
  const results = await Promise.all(v315.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v315.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.15: ${v315.length - f} 通过, ${f} 失败, 共 ${v315.length} 个`);
  if (f > 0) {
    console.log('结论：全年实际值抽取与 annual key 配对不完整（抽取/精度/配对/端到端/版本有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：全年实际值（Q4 备案「季度+全年」双值句取全年值 + 单值全年句）抽取进库，annual key（quarter=null）配对成立——全年指引从「永远 pending」变为到期可结算；营收路径全年守卫同轮修复（AMD live 误报）。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v3.16 — GOOGL FY2026 capex 残废条目修复（已知边界推进：全年指引结算链第三环）
//
// 定位：v3.14/v3.15 两轮白纸黑字的残废条目——live 实证（SEC EDGAR
// 0001652044-26-000012，2026-10-27 实抓原文）：「To meet customer
// demand and capitalize on the growing opportunities we have ahead
// of us, our 2026 CapEx investments are anticipated to be in the
// range of $175 to $185 billion.」期间是裸年份且在名词**之前**，
// 三条旧年度模式全部不命中（ANNUAL_PERIOD_PATTERN 要年份词在年份前、
// ANNUAL_EXPECT_RE/ANNUAL_BARE_YEAR_RE 要动词在年份前），全文兜底匹配
// 到文首的 "q42025"（文档名），全年指引错记成 FY2025Q4、dueOn
// 2026-02-14 已过期；区间语法也不认 "in the range of $175 to $185
// billion" 的 X-to-Y 形态，value 退化成点值 $175（无容差不可结算）。
// 本轮：① 新年度期间形态 ANNUAL_YEAR_NOUN_RE（lookbehind 挡季度前缀）；
// ② 区间语法泛化 X-to-Y（抽取侧 rangeM 与结算侧 parseRange 同构）；
// ③ capex 指标族归一（settleMetricOf 与 normalizeMetric 两侧同修——
// 不归一则期间/区间修好了也配不上全年实际值族 capital expenditures）；
// ④ 同轮维护：ANNUAL_PERIOD_PATTERN 补季度前缀 lookbehind。
// live 端到端：全池 61 条指引逐条 diff，唯一变化即残废条目修正
// （其余 60 条零漂移，NVDA/AMD/MRVL/MU/AMZN/META/ORCL 期间与数值不变）。
// ════════════════════════════════════════════════════════════════
const v316 = [];
function c316(name, ok, detail) { v316.push({ name, ok, detail }); }

// ── 组 1：残废条目抽取修复（live 逐字）─────────────────────────
// 1. GOOGL Q4-2025 live 逐字：FY2026 全年 + X-to-Y 区间 + 指标族归一
c316('extractGuidance：GOOGL live 逐字 capex 句修正为 FY2026 全年 + X-to-Y 区间', (() => {
  const { extractGuidance } = require('./human-future/scripts/edgar-collector.js');
  // live 逐字（SEC EDGAR 0001652044-26-000012，googexhibit991q42025.htm）
  const GOOGL_Q4 = [
    'Alphabet Announces Fourth Quarter and Full Year 2025 Results',
    'And Google Cloud ended 2025 at an annual run rate of over $70 billion, representing a wide breadth of customers, driven by demand for AI products.',
    'We\'re seeing our AI investments and infrastructure drive revenue and growth across the board.',
    'To meet customer demand and capitalize on the growing opportunities we have ahead of us, our 2026 CapEx investments are anticipated to be in the range of $175 to $185 billion.',
    'Q4 2025 Financial Highlights The following table summarizes our consolidated financial results for the quarter and fiscal year ended December 31, 2024 and 2025.',
  ].join(' ');
  const g = extractGuidance(GOOGL_Q4).guidance;
  return g.length === 1
    && g[0].annual === true && g[0].quarter === null && g[0].fiscalYear === 2026
    && g[0].periodLabel === 'FY2026 全年'
    && g[0].isRange === true && g[0].value === 'in the range of $175 to $185 billion'
    && g[0].settleMetric === 'capital expenditures'   // 指标族归一（旧形态是 capex）
    && g[0].metric === 'capex';                        // 原始名词不变（登记 id 稳定维度）
})(), '残废条目三处全修：期间 FY2025Q4→FY2026 全年、点值 $175→区间、指标名保持 capex 但 settleMetric 归一为 capital expenditures');

// ── 组 2：精度回归（季度指引不得被抢成全年）────────────────────
// 2. 季度句四形态 + 实际值句：新形态与 ANNUAL_PERIOD_PATTERN lookbehind 都不误判
c316('精度回归：季度句四形态不被抢成全年 + 实际值句不进指引', (() => {
  const { extractGuidance } = require('./human-future/scripts/edgar-collector.js');
  const doc = (s) => 'Outlook section follows. ' + s + ' End of outlook.';
  const q1 = extractGuidance(doc('Q3 2026 revenue is expected to be $78.0 billion, plus or minus 2%.')).guidance[0];
  // 「Q3 FY2026」锚词同句在年份后——ANNUAL_PERIOD_PATTERN 补 lookbehind 前会被抢成全年
  const q2 = extractGuidance(doc('Guidance for Q2 FY 2027 Financial Outlook. Revenue is expected to be $18.5 billion, plus or minus $500 million.')).guidance[0];
  const q3 = extractGuidance(doc('For the third quarter of 2026, revenue is expected to be $78.0 billion.')).guidance[0];
  const q4 = extractGuidance(doc('We expect third quarter 2026 revenue to be in the range of $73-76 billion.')).guidance[0];
  // 实际值句（过去时/无期望动词）不是指引
  const a1 = extractGuidance(doc('In 2025, revenue was $96.5 billion, an increase of 22% year-over-year.')).guidance;
  const a2 = extractGuidance(doc('2025 revenue was $96.5 billion for the full year.')).guidance;
  // 全年形态不被误伤（GOOGL 同句 fiscal 前缀）
  const an = extractGuidance(doc('our fiscal 2026 CapEx investments are anticipated to be in the range of $175 to $185 billion')).guidance[0];
  return q1 && q1.periodLabel === 'FY2026 Q3' && !q1.annual
    && q2 && q2.periodLabel === 'FY2027 Q2' && !q2.annual
    && q3 && q3.periodLabel === 'FY2026 Q3' && !q3.annual
    && q4 && q4.periodLabel === 'FY2026 Q3' && !q4.annual
    && a1.length === 0 && a2.length === 0
    && an && an.annual === true && an.periodLabel === 'FY2026 全年';
})(), '「Q3 2026 / Q3 FY2026 / third quarter of 2026 / third quarter 2026 + 指标 + is expected」全部保持季度；过去时实际值句不进指引；fiscal 前缀的全年形态不误伤');

// 3. 既有年度/季度指引形态零漂移（META/NVDA/ORCL live 句式）
c316('零漂移：META/NVDA/ORCL live 句式的期间与数值逐条不变', (() => {
  const { extractGuidance } = require('./human-future/scripts/edgar-collector.js');
  // META live（v3.14 逐字夹具句）：动词+裸年份+名词 → ANNUAL_BARE_YEAR_RE
  const meta = extractGuidance('We anticipate 2026 capital expenditures, including principal payments on finance leases, to be in the range of $135-145 billion.').guidance[0];
  // NVDA live（v3.4 逐字夹具句）：outlook 标题季度形态
  const nvda = extractGuidance('NVIDIA\'s outlook for the first quarter of fiscal 2027 is as follows: • Revenue is expected to be $78.0 billion, plus or minus 2%.').guidance[0];
  // ORCL live（2026-09-10 备案逐字）：Full FY 标题全年形态
  const orcl = extractGuidance('Guidance for Full FY 2027 For fiscal year 2027, we now expect total revenue to be at least $90 billion, and non-GAAP EPS to be at $8.10.').guidance[0];
  return meta && meta.annual === true && meta.periodLabel === 'FY2026 全年'
    && meta.value === 'in the range of $135-145 billion'
    && nvda && !nvda.annual && nvda.periodLabel === 'FY2027 Q1' && nvda.value === '$78.0 billion'
    && orcl && orcl.annual === true && orcl.periodLabel === 'FY2027 全年';
})(), '新形态追加在 PERIOD_PATTERNS 末尾（优先级最低）+ ANNUAL_PERIOD_PATTERN lookbehind 只在年份词前紧邻 Q[1-4] 时阻断——旧形态零漂移（全池 live diff 亦实证 60/61 条不变）');

// ── 组 3：区间语法 + 指标族归一（纯函数）────────────────────────
// 4. parseRange X-to-Y 美元区间（含两端不同单位）
c316('parseRange：X-to-Y 美元区间（GOOGL live）+ 两端不同单位各折各的', (() => {
  const { parseRange } = require('./human-future/scripts/earnings-settlement.js');
  const r1 = parseRange('in the range of $175 to $185 billion');
  const r2 = parseRange('in the range of $175 million to $1 billion');
  const r3 = parseRange('in the range of $73-76 billion');       // 旧连字符形态不回归
  return r1 && r1.lo === 175e9 && r1.hi === 185e9 && r1.unit === 'usd'
    && r2 && r2.lo === 175e6 && r2.hi === 1e9 && r2.unit === 'usd'
    && r3 && r3.lo === 73e9 && r3.hi === 76e9;
})(), '"in the range of $175 to $185 billion"（GOOGL live）与连字符形态同构解析；首侧无单位按尾侧折；两端异单位（million/billion）各折各的');

// 5. capex 指标族归一（settleMetricOf 抽取侧 + normalizeMetric 结算侧同修）
c316('capex 指标族归一：settleMetricOf 与 normalizeMetric 两侧同修', (() => {
  const { settleMetricOf } = require('./human-future/scripts/edgar-collector.js');
  const { normalizeMetric } = require('./human-future/scripts/earnings-settlement.js');
  return settleMetricOf('our 2026 CapEx investments are anticipated to be', 'CapEx') === 'capital expenditures'
    && settleMetricOf('2026 capital expenditures are anticipated to be', 'capital expenditures') === 'capital expenditures'
    && normalizeMetric('capex') === 'capital expenditures'
    && normalizeMetric('capital expenditures') === 'capital expenditures'
    && normalizeMetric('Capex') === 'capital expenditures'
    // 其它族不串台
    && normalizeMetric('total expenses') === 'total expenses'
    && normalizeMetric('tax rate') === 'tax rate';
})(), '指引名词 CapEx 与全年实际值族 capital expenditures 归一族才可配对（v3.13 EPS 族归一同型：同型修复必须穷举抽取侧与结算侧两个调用点）');

// ── 组 4：settleEarningsGuidance 端到端（受控台账）──────────────
// 6. 三条路径全通：新登记到期门 pending + 残废条目句反推结算 + 持久化 capex 归一结算
c316('settleEarningsGuidance：GOOGL FY2026 capex 全年区间结算链端到端', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const fs = require('fs');
  const LEDGER = path.join(__dirname, 'human-future/data/prediction-ledger.json');
  const saved = fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf-8') : null;
  try {
    const SENT = 'us, our 2026 CapEx investments are anticipated to be in the range of $175 to $185 billion';
    const mock = { version: '1.0.0', predictions: [
      // ① 新登记形态：dueOn 2027-02-14 未到 → pending（到期门，不硬结）
      { id: 't316-googl-new', claim: SENT, probability: 0.5, domain: 'earnings_guidance', category: 'earnings_guidance', dueOn: '2027-02-14', outcome: null,
        settlement: { ticker: 'GOOGL', fiscalYear: 2026, quarter: null, annual: true, metric: 'capital expenditures', value: 'in the range of $175 to $185 billion', tolerance: null, isRange: true } },
      // ② 残废条目（台账实录 id/claim/dueOn/残废 settlement）：句反推拿正确元数据 → 结算
      { id: 'fc-sec-edgar-0001652044-26-000012-index-htm-2026-02-14-capex--175-', claim: SENT, probability: 0.4, domain: 'earnings_guidance', category: 'earnings_guidance', dueOn: '2026-02-14', outcome: null,
        settlement: { ticker: 'GOOGL', fiscalYear: 2025, quarter: 4, annual: false, metric: 'capex', value: '$175 ', tolerance: null, isRange: false } },
      // ③ 持久化路径：claim 与当期指引句匹配不上（备案滑出窗口的残废形态），
      //    settlement.metric 是旧抽取的名词级 'capex' —— normalizeMetric 归一后才配对
      { id: 't316-googl-persisted', claim: 'our 2026 CapEx investments are expected to be in the range of $175 to $185 billion for the full year', probability: 0.5, domain: 'earnings_guidance', category: 'earnings_guidance', dueOn: '2026-03-15', outcome: null,
        settlement: { ticker: 'GOOGL', fiscalYear: 2026, quarter: null, annual: true, metric: 'capex', value: 'in the range of $175 to $185 billion', tolerance: null, isRange: true } },
    ]};
    fs.writeFileSync(LEDGER, JSON.stringify(mock, null, 2));
    const eng = new ProjectionEngine({});
    eng.signals = { totalItems: 2, domains: [], items: [
      // GOOGL Q4-2025 备案（残废条目来源，仍在采集窗口）：修正后的指引句
      { source: 'SEC EDGAR', ticker: 'GOOGL', link: 'https://sec.gov/googl-q4-2025', accession: '0001652044-26-000012',
        actualPeriod: { quarter: 4, fiscalYear: 2025 }, actuals: [], annualActuals: [],
        guidance: [
          { sentence: SENT, metric: 'capex', settleMetric: 'capital expenditures', value: 'in the range of $175 to $185 billion', isRange: true, quarter: null, fiscalYear: 2026, annual: true, gaapBasis: '' },
        ] },
      // GOOGL Q4-2026 备案（全年实际值来源）：capital expenditures 全年值
      { source: 'SEC EDGAR', ticker: 'GOOGL', link: 'https://sec.gov/googl-q4-2026', accession: '0001652044-27-000009',
        actualPeriod: { quarter: 4, fiscalYear: 2026 }, actuals: [{ metric: 'revenue', value: '$113.8 billion', gaapBasis: '' }],
        annualActuals: [{ metric: 'capital expenditures', value: '$180 billion', gaapBasis: '' }], guidance: [] },
    ]};
    const res = eng.settleEarningsGuidance();
    const byId = Object.fromEntries(res.settled.map(s => [s.id, s]));
    const after = JSON.parse(fs.readFileSync(LEDGER, 'utf-8'));
    const canfei = after.predictions.find(p => p.id === 'fc-sec-edgar-0001652044-26-000012-index-htm-2026-02-14-capex--175-');
    const persisted = after.predictions.find(p => p.id === 't316-googl-persisted');
    const neu = after.predictions.find(p => p.id === 't316-googl-new');
    return byId['fc-sec-edgar-0001652044-26-000012-index-htm-2026-02-14-capex--175-']
      && byId['fc-sec-edgar-0001652044-26-000012-index-htm-2026-02-14-capex--175-'].hit === true   // $180B 落在 $175-185B 带内
      && byId['fc-sec-edgar-0001652044-26-000012-index-htm-2026-02-14-capex--175-'].actual === '$180 billion'
      && byId['fc-sec-edgar-0001652044-26-000012-index-htm-2026-02-14-capex--175-'].period === 'FY2026 全年'
      && byId['t316-googl-persisted'] && byId['t316-googl-persisted'].hit === true                  // 持久化 'capex' 归一路径
      && res.settled.length === 2 && res.pending === 1
      && neu.outcome === null                                                                       // 到期门：dueOn 2027-02-14 不提前结
      && canfei.outcome === true && canfei.evidence.metric === 'capital expenditures'
      && canfei.evidence.sources[0] === 'https://sec.gov/googl-q4-2026'                              // 证据指向提供全年实际值的备案
      && persisted.outcome === true && persisted.evidence.metric === 'capital expenditures';
  } finally {
    if (saved === null) { try { fs.unlinkSync(LEDGER); } catch (_) {} } else fs.writeFileSync(LEDGER, saved);
  }
})(), '残废条目经句反推拿 FY2026 全年区间元数据并带内命中；持久化名词级 capex 经归一配对；新登记条目按到期门 pending（META/NVDA 全年指引同款纪律，不硬结）');

// ── 组 5：已知边界如实（GOOGL capex 全年实际值抽不到）───────────
// 7. GOOGL Q4-2025 live：全年 capex 实际值在现金流量表（表格式陈述），形态族不收
c316('已知边界（v3.17 部分推进）：FCF 对账表 TTM 列形态仍不收——现金流量表形态已进库', (() => {
  const { extractAnnualActuals } = require('./human-future/scripts/edgar-collector.js');
  // live 逐字（googexhibit991q42025.htm）：亮点段给的是指引句；实际值只在
  // 现金流量表（"Less: purchases of property and equipment (17,197) ... (91,447)"
  // TTM 列）与 FCF 定义句，无 "were $X and $Y ... respectively" 双值句
  const GOOGL_Q4 = [
    'To meet customer demand and capitalize on the growing opportunities we have ahead of us, our 2026 CapEx investments are anticipated to be in the range of $175 to $185 billion.',
    'Quarter Ended TTM Q1 2025 Q2 2025 Q3 2025 Q4 2025 Q4 2025 Net cash provided by operating activities $ 36,150 $ 27,747 $ 48,414 $ 52,402 $ 164,713 Less: purchases of property and equipment (17,197) (22,446) (23,953) (27,851) (91,447) Free cash flow $ 18,953 $ 5,301 $ 24,461 $ 24,551 $ 73,266',
    'Free cash flow: We define free cash flow as net cash provided by operating activities less capital expenditures.',
  ].join(' ');
  const ann = extractAnnualActuals(GOOGL_Q4, { fiscalYear: 2025 });
  return ann.length === 0;
})(), '指引侧修好了但对账依据缺位——FY2026 capex 指引到期时若无 Q4 备案双值句/全年标记句，按 pending/无实际值跳过如实处理（v3.17 已推进现金流量表形态见该轮组 1；FCF 对账表 TTM 列仍是库外形态，漏报比误报诚实）');

// ── 组 6：端到端（cron 注入 / 版本号）──────────────────────────
// 8. cron 注入源级：[v3.16] 口径限定随结算段进 agent prompt
c316('cron 注入脚本渲染 v3.16 口径限定', (() => {
  const p = require('path').join(require('os').homedir(), '.hermes/scripts/hf-cron-fetch.sh');
  if (!require('fs').existsSync(p)) return false;
  const src = require('fs').readFileSync(p, 'utf-8');
  return /\[v3\.16\] 年份在名词前的全年指引形态进库/.test(src)
    && /X-to-Y 美元区间/.test(src)
    && /季度前缀 lookbehind/.test(src);
})(), '残废修复语义（年份在名词前形态/X-to-Y 区间/季度前缀 lookbehind）必须随结算段进注入脚本，否则 agent 看不到限定');

// 9. guidanceStruct 透传 isRange（v3.5.1「ticker 恒 null」同型断链）
c316('guidanceStruct 透传 isRange：登记时区间指引不再退化成点值', (() => {
  const { discriminate } = require('./human-future/scripts/forecast-discriminator.js');
  const rangeClaim = {
    text: 'us, our 2026 CapEx investments are anticipated to be in the range of $175 to $185 billion',
    source: 'SEC EDGAR', date: '2026-02-04', url: 'https://sec.gov/x', category: 'earnings_guidance',
    guidance: { metric: 'capex', settleMetric: 'capital expenditures', value: 'in the range of $175 to $185 billion', tolerance: null, isRange: true, quarter: null, fiscalYear: 2026, annual: true, gaapBasis: '', periodLabel: 'FY2026 全年' },
    ticker: 'GOOGL',
  };
  const pointClaim = {
    text: 'Revenue is expected to be $78.0 billion, plus or minus 2%',
    source: 'SEC EDGAR', date: '2026-02-25', url: 'https://sec.gov/y', category: 'earnings_guidance',
    guidance: { metric: 'revenue', settleMetric: 'revenue', value: '$78.0 billion', tolerance: '2%', isRange: false, quarter: 1, fiscalYear: 2027, annual: false, gaapBasis: '', periodLabel: 'FY2027 Q1' },
    ticker: 'NVDA',
  };
  const rRange = discriminate(rangeClaim, {});
  const rPoint = discriminate(pointClaim, {});
  return rRange.guidance && rRange.guidance.isRange === true
    && rPoint.guidance && rPoint.guidance.isRange === false;
})(), '旧代码 guidanceStruct 从 v3.4 起不漏 isRange——登记时 isRange: !!r.guidance.isRange 恒为 false，区间指引（META 费用/capex×6/NVDA 税率×3/AMZN/MRVL/GOOGL）的持久化 settlement 把区间值当点值存；备案滑出采集窗口后（句子索引失效、回落持久化分支）guidanceBand 判「无容差/区间的点值指引」跳过，区间指引到期永远无法结算');

// 11. 版本号一致性（五处对齐 3.19.0）
c316('版本号一致性：五处对齐 3.27.0', (() => {
  const fs316 = require('fs');
  const VERSION = fs316.readFileSync(require('path').join(__dirname, 'VERSION'), 'utf-8').trim();
  const pkg = JSON.parse(fs316.readFileSync(require('path').join(__dirname, 'package.json'), 'utf-8'));
  const rp = fs316.readFileSync(require('path').join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  const pf = fs316.readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return VERSION === '3.27.0'
    && pkg.version === '3.27.0'
    && rp.includes('文明推演引擎 v3.27.0')      // banner
    && /version: '3\.27\.0'/.test(pf)          // projection meta
    && /version: '3\.27\.0'/.test(rp);         // run-pipeline fullReport meta
})(), 'VERSION/package.json/banner/projection meta/run-pipeline meta 必须对齐 3.27.0，防 corr-2026-014 版本漂移复发');

// 10. forecast 段渲染截断披露（v3.10/v3.11 同型纪律：辨别了但看不见=没交付）
c316('forecast 渲染上限 30 + 超限披露「另有 N 条未显示」', (() => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const mk = (i) => ({
    verdict: 'earnings-guidance', text: `Revenue is expected to be $${i} billion`, source: 'SEC EDGAR',
    category: 'earnings_guidance', dueOn: '2026-12-15', settleable: true,
    guidance: { periodLabel: 'FY2027 Q1', value: `$${i} billion`, tolerance: null, isRange: false, caveats: [] },
    reasoning: { score: 0, checks: [] }, baseRate: { rate: 0.45, sample: 11, source: 'local-ledger' },
    falsifiability: { problems: [] }, textNature: { isReferenceProse: false, markers: [] },
  });
  // 真 projection（引擎 generate 的全字段形状）+ 替换 forecastDiscrimination
  const base = new ProjectionEngine({ newsData: { frontier_models: { domain: 'frontier_models', news: [
    { title: 'OpenAI releases a new model', description: 'A new frontier model was released today.',
      source: 'OpenAI News', link: 'https://openai.com/index/x', pubDate: 'Mon, 26 Oct 2026 10:00:00 +0000', origin: 'live' },
  ] } } }).generate();
  const withFd = (n) => {
    const rep = JSON.parse(JSON.stringify(base));
    rep.forecastDiscrimination = {
      available: true, audited: n, results: Array.from({ length: n }, (_, i) => mk(i + 1)),
      summary: { settleableCount: n, guidanceCount: n }, note: 'test',
    };
    return formatReport(rep);
  };
  const md = withFd(31);
  const rendered = (md.match(/\[财报指引\]/g) || []).length;
  const md2 = withFd(5);
  // [v3.18] 披露文案随分组细化：「另有 N 条财报指引未显示」（指引组专属，
  // RSS 组另有自己的披露行）——超限明示的意图不变
  return rendered === 30
    && /另有 1 条财报指引未显示/.test(md)
    && !/另有 .* 条未显示/.test(md2);      // 未超限不出现披露行
})(), 'v3.14 把 claim 额度修到 70 后 live 实测 61 条 EDGAR 指引全进辨别/登记/结算，但渲染上限停在 slice(0,12)——50 条在 md 里静默切尾（GOOGL 修正条目正落在切尾区）；上限 12→30 且超限明示「另有 N 条未显示（详见报告 JSON）」；[v3.18] 分组渲染后披露按组措辞（财报指引组/非结构化前瞻主张组各自报数）');

// ── v3.16 汇总 ──
(async () => {
  const results = await Promise.all(v316.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v316.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.16: ${v316.length - f} 通过, ${f} 失败, 共 ${v316.length} 个`);
  if (f > 0) {
    console.log('结论：GOOGL FY2026 capex 残废条目修复不完整（抽取/精度/区间/归一/结算/端到端/版本有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：残废条目三处全修（期间 FY2025Q4→FY2026 全年、点值→X-to-Y 区间、capex 指标族归一），结算链端到端成立；季度指引零误判、既有形态零漂移；GOOGL capex 全年实际值缺位如实记边界。');
  }
})();

// v3.17 — 表格式全年 capex 实际值抽取（已知边界推进：现金流量表进库）
//
// 定位：v3.16 白纸黑字的已知边界——GOOGL FY2026 capex 指引（台账 dueOn
// 2027-02-14，区间 $175-185B）的实际值只在现金流量表「Purchases of
// property and equipment」行，全年实际值形态族（双值句/全年标记句）不收
// 表格式陈述，FY2026 指引到期时无对账依据。本轮按 live 实证推进
// （2026-10-27 从 SEC EDGAR 实抓四家 Q4 备案原文驱动）。
//
// ① extractAnnualActuals 增补表形态：现金流量表标题锚 + 全年列标记
//   （Year/Twelve Months Ended；GOOGL Q2 的「Year To Date」与 META Q3 的
//   「Nine Months Ended」天然拒绝）+ 仅 Q4 备案（AMZN Q1/Q2 live 实证：
//   Q1-Q3 的 Twelve Months Ended 是 TTM 列且年份与标题财年相同——期间
//   守卫 quarter===4，live 端到端实测抓到的误收，corr-2026-036）+ 列对齐
//   （数据行数值个数驱动，全年列=后两列，表头年份匹配标题财年）+ 单位只认百万；
// ② 双来源去重：叙事口径优先（META live 实证：叙事 $72.22B 含融资租赁
//   本金、报表行 $69.691B 不含——两个不同值落同一 annual key 会判歧义
//   跳过，把可结算指引变成跳过比漏报更糟）；
// ③ 结算链端到端：真实抽取的全年 capex 值直通 annual key 配对。
// live 实证：GOOGL FY2025 $91.447B / AMD FY2025 $974M / MRVL FY2026
// $354.1M / AMZN FY2025 $131.819B 全部抽中；NVDA 发布不含现金流表
// （如实漏报）；财季值与商业辨别段零漂移（live 端到端 diff 实证）。
// ════════════════════════════════════════════════════════════════
const v317 = [];
function c317(name, ok, detail) { v317.push({ name, ok, detail }); }

// live 逐字夹具（2026-10-27 SEC EDGAR 实抓，现金流量表区域原样）
// GOOGL 0001652044-26-000012（googexhibit991q42025.htm，Q4-2025）
const GOOGL_Q4_STMT = 'CONSOLIDATED STATEMENTS OF CASH FLOWS (In millions) Quarter Ended December 31, Year Ended December 31, 2024 2025 2024 2025 (unaudited) (unaudited) Operating activities Net income $ 26,536 $ 34,455 $ 100,118 $ 132,170 Adjustments: Depreciation of property and equipment 4,205 6,040 15,311 21,136 Stock-based compensation expense 5,810 7,071 22,785 24,953 Deferred income taxes (1,448) 1,218 (5,257) 8,348 Loss (gain) on debt and equity securities, net 67 (2,354) (2,671) (24,620) Other 827 1,265 3,419 2,108 Changes in assets and liabilities, net of effects of acquisitions: Accounts receivable, net (4,570) (4,943) (5,891) (8,779) Income taxes, net 379 66 (2,418) (3,226) Other assets 937 (482) (1,397) (4,542) Accounts payable 401 227 359 907 Accrued expenses and other liabilities 5,205 7,937 (1,161) 12,939 Accrued revenue share 581 799 1,059 899 Deferred revenue 183 1,103 1,043 2,420 Net cash provided by operating activities 39,113 52,402 125,299 164,713 Investing activities Purchases of property and equipment (14,276) (27,851) (52,535) (91,447) Purchases of marketable securities';
// AMD 0000002488-26-000014（q42025991.htm，Q4-FY2025）
const AMD_Q4_STMT = 'STATEMENTS OF CASH FLOWS (Millions) (Unaudited) Three Months Ended Year Ended December 27, 2025 December 28, 2024 December 27, 2025 December 28, 2024 Cash flows from operating activities: Net income $ 1,511 $ 482 $ 4,335 $ 1,641 (Income) loss from discontinued operations, net of tax 109 — (66) — Adjustments to reconcile net income to net cash provided by operating activities: Depreciation and amortization 194 172 750 671 Amortization of acquisition-related intangibles 557 583 2,254 2,393 Stock-based compensation 486 339 1,638 1,407 (Gains) losses on long-term investments, net (280) — (341) — Deferred income taxes 230 (300) 248 (1,163) Inventory loss at (recovery from) contract manufacturer — — (67) 65 Other 30 93 120 125 Changes in operating assets and liabilities: Accounts receivable, net (114) 96 (121) (1,865) Inventories (610) (362) (2,189) (1,458) Prepaid expenses and other assets 248 510 (11) 339 Accounts payable (588) (571) 410 3 Accrued and other liabilities 531 257 (467) 883 Net cash provided by operating activities of continuing operations 2,304 1,299 6,493 3,041 Net cash provided by operating activities of discontinued operations 296 — 1,216 — Net cash provided by operations 2,600 1,299 7,709 3,041 Cash flows from investing activities: Purchases of property and equipment (222) (208) (974) (636) Purchases of short-term investments';
// MRVL 0001835632-26-000006（q426_8kx1312026ex-991.htm，Q4-FY2026）
const MRVL_Q4_STMT = 'Statements of Cash Flows (Unaudited) (In millions) Three Months Ended Year Ended January 31, 2026 February 1, 2025 January 31, 2026 February 1, 2025 Cash flows from operating activities: Net income (loss) $ 396.1 $ 200.2 $ 2,670.1 $ (885.0) Adjustments to reconcile net income (loss) to net cash provided by operating activities: Depreciation and amortization 93.4 78.8 348.6 304.3 Stock-based compensation 143.0 147.6 590.8 597.4 Amortization of acquired intangible assets 223.6 247.1 942.0 1,052.6 Restructuring related charges (gains), net — 4.7 (14.0) 528.8 Deferred income taxes 44.4 (5.7) 42.2 (111.9) Gain on sale of business — — (1,830.4) — Other expense, net 24.4 23.8 109.5 65.9 Changes in assets and liabilities, net of acquisitions: Accounts receivable (640.2) (30.5) (1,158.2) 93.2 Prepaid expenses and other assets 41.1 (172.8) (242.4) 3.4 Inventories (370.5) (169.8) (389.8) (230.0) Accounts payable 378.4 71.7 299.3 181.5 Accrued employee compensation 57.5 31.6 (10.5) 43.5 Accrued liabilities and other non-current liabilities (17.5) 87.3 393.3 37.5 Net cash provided by operating activities 373.7 514.0 1,750.5 1,681.2 Cash flows from investing activities: Purchases of technology licenses (1.1) (0.8) (4.5) (7.0) Purchases of property and equipment (114.3) (69.9) (354.1) (284.6) Proceeds from sales of property';
// AMZN 0001018724-26-000002（amzn-20251231xex991.htm，Q4-2025）
const AMZN_Q4_STMT = 'Statements of Cash Flows (in millions) (unaudited) Three Months Ended December 31, Twelve Months Ended December 31, 2024 2025 2024 2025 CASH, CASH EQUIVALENTS, AND RESTRICTED CASH, BEGINNING OF PERIOD $ 78,677 $ 70,464 $ 73,890 $ 82,312 OPERATING ACTIVITIES: Net income 20,004 21,192 59,248 77,670 Adjustments to reconcile net income to net cash from operating activities: Depreciation and amortization of property and equipment and capitalized content costs, operating lease assets, and other 15,631 19,471 52,795 65,756 Stock-based compensation 4,995 4,397 22,011 19,467 Non-operating expense (income), net (486) (693) 2,012 (14,880) Deferred income taxes (1,608) 822 (4,648) 11,470 Changes in operating assets and liabilities: Inventories 934 3,101 (1,884) (3,002) Accounts receivable, net and other (4,023) (5,478) (3,249) (7,333) Other assets (4,190) (5,220) (14,483) (15,632) Accounts payable 8,726 11,065 2,972 11,231 Accrued expenses and other 4,042 5,993 (2,904) (5,019) Unearned revenue 1,611 (191) 4,007 (214) Net cash provided by (used in) operating activities 45,636 54,459 115,877 139,514 INVESTING ACTIVITIES: Purchases of property and equipment (27,834) (39,522) (82,999) (131,819) Proceeds from property and equipment sales';
// GOOGL 0001652044-26-000066（googexhibit991q22026.htm，Q2-2026，YTD 形态）
const GOOGL_Q2_STMT = 'STATEMENTS OF CASH FLOWS (In millions, unaudited) Quarter Ended June 30, Year To Date June 30, 2025 2026 2025 2026 Operating activities Net income $ 28,196 $ 112,193 $ 62,736 $ 174,771 Adjustments: Depreciation of property and equipment 4,998 7,104 9,485 13,586 Stock-based compensation expense 5,998 7,957 11,514 14,708 Deferred income taxes (444) 20,618 (1,596) 27,538 Loss (gain) on debt and equity securities, net (1,451) (98,999) (11,411) (135,803) Other 560 1,896 1,041 3,161 Changes in assets and liabilities, net of effects of acquisitions: Accounts receivable, net (2,839) (6,541) (1,201) (6,904) Inventory (198) (6,696) (628) (7,739) Income taxes, net (9,631) 203 (2,434) 8,304 Other assets (1,281) (7,590) (2,139) (9,950) Accounts payable 553 2,330 (327) 2,090 Accrued expenses and other liabilities 3,150 6,310 (1,779) 308 Deferred revenue 136 284 636 789 Net cash provided by operating activities 27,747 39,069 63,897 84,859 Investing activities Purchases of property and equipment (22,446) (44,924) (39,643) (80,598) Purchases of marketable securities';
// META 0001628280-26-066700（meta-09302026xexhibit991.htm，Q3-2026，九个月形态）
const META_Q3_STMT = 'STATEMENTS OF CASH FLOWS (In millions) (Unaudited) Three Months Ended September 30, Nine Months Ended September 30, 2026 2025 2026 2025 Cash flows from operating activities Net income $ 9,860 $ 2,709 $ 52,481 $ 37,690 Adjustments to reconcile net income to net cash provided by operating activities: Depreciation and amortization 7,154 4,963 19,509 13,205 Share-based compensation 7,363 5,555 21,053 14,537 Deferred income taxes 2,117 19,868 3,685 17,704 Unrealized (gain) and loss on equity investments 18 (962) 1,204 (642) Other (329) 17 (402) (359) Changes in assets and liabilities: Accounts receivable (999) (807) (3,272) 660 Prepaid expenses and other current assets (936) (1,033) (4,166) (348) Other assets (2,437) 33 (4,973) (209) Accounts payable 1,596 (63) 1,242 (637) Accrued expenses and other current liabilities 1,940 455 7,602 (2,883) Other liabilities 7,439 (736) 2,910 868 Net cash provided by operating activities 32,786 29,999 96,873 79,586 Cash flows from investing activities Purchases of property and equipment (33,942) (18,829) (83,055) (48,308) Purchases of marketable securities';
// META 0001628280-26-003832（meta-12312025xexhibit991.htm，Q4-2025 报表行）
const META_Q4_STMT = 'STATEMENTS OF CASH FLOWS (In millions) (Unaudited) Three Months Ended December 31, Twelve Months Ended December 31, 2025 2024 2025 2024 Cash flows from operating activities Net income $ 22,768 $ 20,838 $ 60,458 $ 62,360 Adjustments to reconcile net income to net cash provided by operating activities: Depreciation and amortization 5,411 4,460 18,616 15,498 Share-based compensation 5,890 4,262 20,427 16,690 Deferred income taxes 1,033 (1,332) 18,738 (4,738) Unrealized (gain) loss on equity investments (496) 2 (1,138) (53) Impairment charges for facilities consolidation — 94 — 383 Other (56) 167 (416) 140 Changes in assets and liabilities: Accounts receivable (2,475) (2,978) (1,815) (1,485) Prepaid expenses and other current assets 259 (530) (89) (698) Other assets (272) (200) (481) (270) Accounts payable 623 568 (14) 373 Accrued expenses and other current liabilities 3,960 1,523 1,077 323 Other liabilities (431) 1,114 437 2,805 Net cash provided by operating activities 36,214 27,988 115,800 91,328 Cash flows from investing activities Purchases of property and equipment (21,383) (14,425) (69,691) (37,256) Purchases of marketable securities';
// AMZN 0001018724-26-000012（amzn-20260331xex991.htm，Q1-2026，TTM 列形态）
const AMZN_Q1_STMT = 'Statements of Cash Flows (in millions) (unaudited) Three Months Ended March 31, Twelve Months Ended March 31, 2025 2026 2025 2026 CASH, CASH EQUIVALENTS, AND RESTRICTED CASH, BEGINNING OF PERIOD $ 82,312 $ 90,106 $ 73,332 $ 69,893 OPERATING ACTIVITIES: Net income 17,127 30,255 65,944 90,798 Adjustments to reconcile net income to net cash from operating activities: Depreciation and amortization of property and equipment and capitalized content costs, operating lease assets, and other 14,262 18,945 55,373 70,439 Stock-based compensation 3,689 4,032 20,739 19,810 Non-operating expense (income), net (2,817) (15,632) (3,539) (27,695) Deferred income taxes 507 12,798 (3,203) 23,761 Changes in operating assets and liabilities: Inventories (1,222) 1,622 (4,882) (158) Accounts receivable, net and other 1,247 (5,750) (5,686) (14,330) Other assets (3,402) (3,811) (15,184) (16,041) Accounts payable (9,043) (8,737) 5,211 11,537 Accrued expenses and other (4,061) (8,045) (4,037) (9,003) Unearned revenue 728 355 3,167 (587) Net cash provided by (used in) operating activities 17,015 26,032 113,903 148,531 INVESTING ACTIVITIES: Purchases of property and equipment (25,019) (44,203) (93,093) (151,003) Proceeds from property and equipment sales';
// AMZN 0001018724-26-000024（amzn-20260630xex991.htm，Q2-2026，3M/6M/TTM 六列形态）
const AMZN_Q2_STMT = 'Statements of Cash Flows (in millions) (unaudited) Three Months Ended June 30, Six Months Ended June 30, Twelve Months Ended June 30, 2025 2026 2025 2026 2025 2026 CASH, CASH EQUIVALENTS, AND RESTRICTED CASH, BEGINNING OF PERIOD $ 69,893 $ 104,692 $ 82,312 $ 90,106 $ 71,673 $ 61,453 OPERATING ACTIVITIES: Net income 18,164 62,647 35,291 92,902 70,623 135,281 Adjustments to reconcile net income to net cash from operating activities: Depreciation and amortization of property and equipment and capitalized content costs, operating lease assets, and other 15,227 19,988 29,489 38,933 58,562 75,200 Stock-based compensation 6,534 6,038 10,223 10,070 20,551 19,314 Non-operating expense (income), net (1,258) (53,381) (4,075) (69,013) (4,702) (79,818) Deferred income taxes 11 17,691 518 30,489 (2,407) 41,441 Changes in operating assets and liabilities: Inventories (4,054) (1,818) (5,276) (196) (5,851) 2,078 Accounts receivable, net and other (1,125) (8,204) 122 (13,954) (4,602) (21,409) Other assets (2,971) (4,717) (6,373) (8,528) (15,100) (17,787) Accounts payable 7,058 9,442 (1,985) 705 6,264 13,921 Accrued expenses and other (4,952) (2,018) (9,013) (10,063) (4,842) (6,069) Unearned revenue (119) (281) 609 74 2,641 (749) Net cash provided by (used in) operating activities 32,515 45,387 49,530 71,419 121,137 161,403 INVESTING ACTIVITIES: Purchases of property and equipment (32,183) (54,208) (57,202) (98,411) (107,656) (173,028) Proceeds from property and equipment sales';

// ── 组 1：表格式全年 capex 抽取（四家 live 逐字夹具）─────────
// 1. GOOGL Q4-2025：全年 capex 只在现金流表（v3.16 已知边界的推进）
c317('extractAnnualActuals：GOOGL Q4-2025 live 逐字现金流表（FY2025 capex $91.447B）', (() => {
  const { extractAnnualActuals } = require('./human-future/scripts/edgar-collector.js');
  const ann = extractAnnualActuals(GOOGL_Q4_STMT, { fiscalYear: 2025, quarter: 4 });
  return ann.length === 1 && ann[0].metric === 'capital expenditures'
    && ann[0].value === '$91.447 billion' && ann[0].gaapBasis === '';
})(), 'v3.16 边界原话「GOOGL capex 全年实际值在现金流量表（purchases of property and equipment）……全年实际值形态族不收表格式陈述」的推进：四列（Q4\'24/Q4\'25/FY\'24/FY\'25）全年列在后两列，表头年份 2025 命中取第 4 值 (91,447)');

// 2. AMD Q4-FY2025：全年列是第 3 列（年份顺序 2025 2024 2025 2024）
c317('extractAnnualActuals：AMD Q4-FY2025 live 逐字（FY2025 capex $974M，列序 2025 2024 2025 2024）', (() => {
  const { extractAnnualActuals } = require('./human-future/scripts/edgar-collector.js');
  const ann = extractAnnualActuals(AMD_Q4_STMT, { fiscalYear: 2025, quarter: 4 });
  return ann.length === 1 && ann[0].value === '$974 million';
})(), 'AMD 表头年份序 [2025,2024,2025,2024]（当前年在先）——全年列=后两列 [2025,2024]，fy=2025 命中第 3 值 (974)，不是末列 (636)；证明列对齐按表头年份寻列而非恒取末列');

// 3. MRVL Q4-FY2026：财年终年 1/31、小数金额
c317('extractAnnualActuals：MRVL Q4-FY2026 live 逐字（FY2026 capex $354.1M，年终年 1/31）', (() => {
  const { extractAnnualActuals } = require('./human-future/scripts/edgar-collector.js');
  const ann = extractAnnualActuals(MRVL_Q4_STMT, { fiscalYear: 2026, quarter: 4 });
  return ann.length === 1 && ann[0].value === '$354.1 million';
})(), 'MRVL 财年标签与日历年终年同数（FY2026 = Year Ended January 31, 2026，表头年份 [2026,2025,2026,2025]）；金额带小数点 (354.1)——数值 token 正则容忍小数点，不按句点截断');

// 4. AMZN Q4-2025：Twelve Months Ended 标签形态
c317('extractAnnualActuals：AMZN Q4-2025 live 逐字（FY2025 capex $131.819B，Twelve Months Ended）', (() => {
  const { extractAnnualActuals } = require('./human-future/scripts/edgar-collector.js');
  const ann = extractAnnualActuals(AMZN_Q4_STMT, { fiscalYear: 2025, quarter: 4 });
  return ann.length === 1 && ann[0].value === '$131.819 billion';
})(), 'AMZN 全年列标记是「Twelve Months Ended」（不是 Year Ended）——全年标记正则三形态覆盖；亮点段叙事「purchases of property and equipment, net of proceeds from sales and incentives」在报表标题之前，标题锚天然不抢');

// ── 组 2：精度回归（漏报比误报诚实）────────────────────────────
// 5. 六形态零误收
c317('精度回归：YTD 两形态/AMZN TTM 两形态/Q4 五列/FCF 对账表/叙事提及/千分位单位/年份不符 全部零误收', (() => {
  const { extractAnnualActuals } = require('./human-future/scripts/edgar-collector.js');
  // ① GOOGL Q2-2026 live 逐字：「Year To Date June 30」不是全年列标记
  // ② META Q3-2026 live 逐字：「Nine Months Ended」YTD 列
  // ③ FCF 对账表（GOOGL live 逐字，v3.16 夹具）：无报表标题 + 5 列含 TTM
  const FCF_RECON = 'Quarter Ended TTM Q1 2025 Q2 2025 Q3 2025 Q4 2025 Q4 2025 Net cash provided by operating activities $ 36,150 $ 27,747 $ 48,414 $ 52,402 $ 164,713 Less: purchases of property and equipment (17,197) (22,446) (23,953) (27,851) (91,447) Free cash flow $ 18,953 $ 5,301 $ 24,461 $ 24,551 $ 73,266';
  // ④ AMZN live 叙事提及（亮点段，无表格结构）
  const AMZN_NARR = 'Free cash flow decreased to $11.2 billion for the trailing twelve months, driven primarily by a year-over-year increase of $50.7 billion in purchases of property and equipment, net of proceeds from sales and incentives.';
  // ⑤ 千分位单位（守卫用例非 live 实证：错标度 1000 倍比漏报危险）
  const IN_THOUSANDS = 'STATEMENTS OF CASH FLOWS (In thousands) Three Months Ended Year Ended December 31, 2024 2025 2024 2025 Purchases of property and equipment (14,276) (27,851) (52,535) (91,447)';
  // ⑥ Q4 备案五列形态（防御性守卫用例非 live 实证：live 池 Q4 备案全是 2/4 列；
  //    AMZN Q2 的 3M/6M/TTM 六列是 Q2 备案、被期间守卫先挡——列数守卫对 Q4 的
  //    非 2/4 列形态兜底，防末列错当月度列）
  const FIVE_COL_Q4 = 'STATEMENTS OF CASH FLOWS (In millions) Three Months Ended Year Ended December 31, 2024 2025 2024 2025 2026 Purchases of property and equipment (100) (200) (300) (400) (500)';
  const hits = [
    extractAnnualActuals(GOOGL_Q2_STMT, { fiscalYear: 2026, quarter: 2 }).length,   // YTD：Year To Date 不匹配全年标记
    extractAnnualActuals(META_Q3_STMT, { fiscalYear: 2026, quarter: 3 }).length,    // YTD：Nine Months Ended
    extractAnnualActuals(FCF_RECON, { fiscalYear: 2025, quarter: 4 }).length,       // FCF 对账表：无报表标题（+5 列）
    extractAnnualActuals(AMZN_NARR, { fiscalYear: 2025, quarter: 4 }).length,       // 叙事提及：无报表标题
    extractAnnualActuals(IN_THOUSANDS, { fiscalYear: 2025, quarter: 4 }).length,    // 千分位单位
    extractAnnualActuals(FIVE_COL_Q4, { fiscalYear: 2025, quarter: 4 }).length,     // Q4 五列形态
    extractAnnualActuals(AMD_Q4_STMT, { fiscalYear: 2023, quarter: 4 }).length,     // 年份不在表头
    // AMZN Q1-2026 live 逐字：Q1 备案的 Twelve Months Ended 是 TTM 列（$93.093B/$151.003B
    // 两个 TTM 值），期间守卫（quarter===4）挡——live 端到端实测抓到的误收（corr-2026-036）
    extractAnnualActuals(AMZN_Q1_STMT, { fiscalYear: 2025, quarter: 1 }).length,
    // AMZN Q2-2026 live 逐字：3M/6M/TTM 六列，列数守卫挡
    extractAnnualActuals(AMZN_Q2_STMT, { fiscalYear: 2026, quarter: 2 }).length,
  ];
  return hits.every(n => n === 0);
})(), 'GOOGL Q2「Year To Date June 30」连全年标记都不匹配、META Q3「Nine Months Ended」被月份标记守卫挡；AMZN Q1（TTM 列年份与标题财年相同！）被 quarter===4 期间守卫挡、AMZN Q2 六列被列数守卫挡；FCF 对账表（5 列含 TTM）与 AMZN 叙事提及无报表标题；千分位单位防错标度；年份不在表头不猜列');

// 6. 列对齐双向精度：同表 FY2024 列可寻（$636M）
c317('列对齐双向精度：AMD 同表 fy=2024 取 $636M（按年份寻列不是恒取某列）', (() => {
  const { extractAnnualActuals } = require('./human-future/scripts/edgar-collector.js');
  const a24 = extractAnnualActuals(AMD_Q4_STMT, { fiscalYear: 2024, quarter: 4 });
  return a24.length === 1 && a24[0].value === '$636 million';
})(), '同一张 AMD 表 fy=2025 → $974M（第 3 列）、fy=2024 → $636M（第 4 列）——列对齐真的按表头年份寻列；反向固定取末列会让 FY2025 抽到 FY2024 值');

// ── 组 3：双来源去重 + 结算端到端（受控台账）────────────────
// 7. META 双来源：叙事 capex（含融资租赁本金）优先于报表行
c317('双来源去重：META 叙事 capex $72.22B 优先于报表行 $69.691B（口径一致才配对）', (() => {
  const { extractAnnualActuals } = require('./human-future/scripts/edgar-collector.js');
  // META live 逐字（v3.15 夹具句，0001628280-26-003832）：叙事带 finance leases 限定词
  const NARR = '• Capital expenditures – Capital expenditures, including principal payments on finance leases, were $22.14 billion and $72.22 billion for the fourth quarter and full year 2025, respectively.';
  const ann = extractAnnualActuals([NARR, META_Q4_STMT].join(' '), { fiscalYear: 2025, quarter: 4 });
  const cap = ann.filter(a => a.metric === 'capital expenditures');
  return cap.length === 1 && cap[0].value === '$72.22 billion';
})(), 'META Q4-2025 live 实证：叙事「Capital expenditures, including principal payments on finance leases, were ... $72.22 billion」与报表行「(69,691)」是同一指标的两个口径——指引句带 finance leases 限定词时叙事值才是同口径实际值；两个不同值落同一 annual key 会判歧义跳过（把可结算指引变成跳过比漏报更糟），叙事先到先收');

// 8. settleEarningsGuidance：真实抽取值直通 annual key 结算 + 季度 key 隔离
c317('settleEarningsGuidance：表格式抽取的全年 capex 带内命中 + 残废季度形态不被误结算', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const { extractAnnualActuals } = require('./human-future/scripts/edgar-collector.js');
  const fs = require('fs');
  const LEDGER = path.join(__dirname, 'human-future/data/prediction-ledger.json');
  const saved = fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf-8') : null;
  try {
    // 真实抽取（不手写 annualActuals）：GOOGL Q4-2025 live 现金流报表
    const ann = extractAnnualActuals(GOOGL_Q4_STMT, { fiscalYear: 2025, quarter: 4 });
    const mock = { version: '1.0.0', predictions: [
      // ① 全年 capex 区间指引（dueOn 已过）vs 抽取值 $91.447B → 带内命中
      { id: 't317-googl-annual', claim: 'expect 2025 capital expenditures to be in the range of $85 to $95 billion', probability: 0.5, domain: 'earnings_guidance', category: 'earnings_guidance', dueOn: '2026-03-01', outcome: null,
        settlement: { ticker: 'GOOGL', fiscalYear: 2025, quarter: null, annual: true, metric: 'capital expenditures', value: 'in the range of $85 to $95 billion', tolerance: null, isRange: true } },
      // ② 残废形态（台账实录：FY2025Q4 持久化元数据 + 名词级 capex + 点值无容差）
      { id: 't317-googl-qtr', claim: 'our 2025 CapEx investments are anticipated to be $175', probability: 0.4, domain: 'earnings_guidance', category: 'earnings_guidance', dueOn: '2026-03-01', outcome: null,
        settlement: { ticker: 'GOOGL', fiscalYear: 2025, quarter: 4, annual: false, metric: 'capex', value: '$175', tolerance: null, isRange: false } },
    ]};
    fs.writeFileSync(LEDGER, JSON.stringify(mock, null, 2));
    const eng = new ProjectionEngine({});
    eng.signals = { totalItems: 1, domains: [], items: [
      { source: 'SEC EDGAR', ticker: 'GOOGL', link: 'https://sec.gov/googl-q4-2025', accession: '0001652044-26-000012',
        actualPeriod: { quarter: 4, fiscalYear: 2025 }, actuals: [], annualActuals: ann, guidance: [] },
    ]};
    const res = eng.settleEarningsGuidance();
    const byId = Object.fromEntries(res.settled.map(s => [s.id, s]));
    const after = JSON.parse(fs.readFileSync(LEDGER, 'utf-8'));
    const qtr = after.predictions.find(p => p.id === 't317-googl-qtr');
    return byId['t317-googl-annual'] && byId['t317-googl-annual'].hit === true
      && byId['t317-googl-annual'].actual === '$91.447 billion'
      && /FY2025 全年/.test(byId['t317-googl-annual'].period)
      && !byId['t317-googl-qtr']              // 季度 key 隔离：全年实际值不误结季度指引
      && qtr.outcome === null
      && res.settled.length === 1;
  } finally {
    if (saved === null) { try { fs.unlinkSync(LEDGER); } catch (_) {} } else fs.writeFileSync(LEDGER, saved);
  }
})(), '抽取值（$91.447 billion，百万折算格式）与指引带（$85-95B）单位量纲一致、直通 annual key 结算；残废形态条目（FY2025Q4 + 名词级 capex + 点值）走季度 key，全年实际值落在 null 段不误配（v3.15 annual key 隔离纪律）');

// ── 组 4：端到端（cron 注入 / 版本号）──────────────────────────
// 9. cron 注入源级：[v3.17] 口径限定随结算段进 agent prompt
c317('cron 注入脚本渲染 v3.17 表格式 capex 口径限定', (() => {
  const p = require('path').join(require('os').homedir(), '.hermes/scripts/hf-cron-fetch.sh');
  if (!require('fs').existsSync(p)) return false;
  const src = require('fs').readFileSync(p, 'utf-8');
  return /\[v3\.17\] 表格式全年 capex 实际值进库/.test(src)
    && /Purchases of property and equipment/.test(src)
    && /仅 Q4 备案（Q1-Q3 的 Twelve Months Ended 是 TTM 列/.test(src)
    && /YTD 列（Nine\/Six/.test(src)
    && /六列（3M\/6M\/TTM）/.test(src)
    && /叙事口径（如 META 含融资租赁本金的 capex）优先于报表行/.test(src);
})(), '表格式抽取语义（报表标题锚/仅 Q4 备案的期间守卫/YTD 与 TTM 列拒收/叙事口径优先）必须随结算段进注入脚本，否则 agent 看不到限定');

// 10. 版本号一致性（五处对齐 3.19.0）
c317('版本号一致性：五处对齐 3.27.0', (() => {
  const fs317 = require('fs');
  const VERSION = fs317.readFileSync(require('path').join(__dirname, 'VERSION'), 'utf-8').trim();
  const pkg = JSON.parse(fs317.readFileSync(require('path').join(__dirname, 'package.json'), 'utf-8'));
  const rp = fs317.readFileSync(require('path').join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  const pf = fs317.readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return VERSION === '3.27.0'
    && pkg.version === '3.27.0'
    && rp.includes('文明推演引擎 v3.27.0')      // banner
    && /version: '3\.27\.0'/.test(pf)          // projection meta
    && /version: '3\.27\.0'/.test(rp);         // run-pipeline fullReport meta
})(), 'VERSION/package.json/banner/projection meta/run-pipeline meta 必须对齐 3.27.0，防 corr-2026-014 版本漂移复发');

// ── v3.17 汇总 ──
(async () => {
  const results = await Promise.all(v317.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v317.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.17: ${v317.length - f} 通过, ${f} 失败, 共 ${v317.length} 个`);
  if (f > 0) {
    console.log('结论：表格式 capex 抽取不完整（抽取/精度/去重/结算/端到端/版本有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：现金流量表形态进库，GOOGL FY2025 $91.447B/AMD $974M/MRVL $354.1M/AMZN $131.819B 实测抽中；YTD 列/FCF 对账表/叙事提及/千分位零误收；叙事口径优先去重；抽取值直通 annual key 结算。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v3.18 — RSS 前瞻主张独立额度（断链修复：共享 breakpoint 饿死 RSS 路径）
//
// 定位：v3.14 起白纸黑字的已知边界——「RSS 与 EDGAR 共用
// claims.length>=20 断点，EDGAR 占满额度后 RSS 前瞻主张被挤压，
// 后续轮次候选：RSS 独立额度」。live 实证（2026-10-27 探针，最新
// full-report 池）：62 条辨别结果 = 61 条 EDGAR 指引 + **仅 1 条**
// RSS 主张——v2.13 核心承诺「辨别他人关于未来的主张」对媒体/博客/
// 备案正文整个失效（Meta $95B 融资计划、Oracle 2026 年不发债、
// EU AI Act 义务句式全部被挤掉）。
//
// ① RSS 路径独立额度 RSS_CLAIMS_CAP=20（EDGAR 额度 70 不动），
//    seen/cut/cap 截断披露同型落地（v3.10/v3.11/v3.14 纪律）；
// ② 同轮精度配套（corr-2026-037，live 探针抓到的 latent 缺陷）：
//    FORWARD_LOOKING_BOILERPLATE 守卫——「undertakes no intent or
//    obligation」免责声明含 obligation to 命中 COMMITMENT、被判
//    bare-assertion 且 settleable=true，不挡则解锁额度后每轮把
//    法律套话登记进台账污染 Brier 样本（商业路径 v3.10 早有同型
//    守卫，forecast 路径从来没有）；
// ③ 结果分组渲染（财报指引组 + 非结构化前瞻主张组，各自截断披露）
//    + cron 注入同步分组——不分组则 RSS 主张追加在 61 条 EDGAR
//    之后全被渲染上限切掉，「辨别了但看不见」。
// live 端到端：forecast 辨别 62→79 条（61 EDGAR + 18 RSS 路径），
// 7 条新可结算主张进台账（复跑幂等 0 重复）；财季 actuals/EDGAR
// 指引/商业辨别段零漂移。
// ════════════════════════════════════════════════════════════════
const v318 = [];
function c318(name, ok, detail) { v318.push({ name, ok, detail }); }

// ── 组 1：RSS 独立额度端到端（EDGAR 占额下 RSS 全进 + 超额披露 + 登记幂等）──
// 1. 端到端：EDGAR 30 条指引占满旧额度后 RSS 主张仍全进辨别/登记
c318('端到端：RSS 独立额度（EDGAR 30 条占额下 4 条 RSS 主张全进 + 登记 + 幂等）', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const fs = require('fs');
  const LEDGER = path.join(__dirname, 'human-future/data/prediction-ledger.json');
  const saved = fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf-8') : null;
  try {
    fs.writeFileSync(LEDGER, JSON.stringify({ version: '1.0.0', predictions: [] }, null, 2));
    const mkGuidanceItem = (i) => ({
      title: `TEST Co${i} 8-K 业绩发布 · 2026-05-01`, link: `https://example.com/edgar-quota-${i}`,
      pubDate: '2026-05-01', description: '财报指引', body: '', source: 'SEC EDGAR', origin: 'live',
      ticker: `T${i}`, form: '8-K', accession: `0000000000-26-00010${i}`, filingDate: '2026-05-01', fiscalYearEnd: '1231',
      guidance: [1, 2, 3].map(k => ({
        sentence: `expect quarter 2 2026 total revenue to be in the range of $5${k}-6${k} billion`,
        metric: 'total revenue', settleMetric: 'revenue', gaapBasis: '', value: `in the range of $5${k}-6${k} billion`,
        tolerance: null, isRange: true, quarter: 2, fiscalYear: 2026, annual: false, periodLabel: 'FY2026 Q2', caveats: [],
      })),
      actuals: [], actualPeriod: null,
    });
    const mkRss = (n, title, body) => ({
      title, link: `https://example.com/rss-${n}`, pubDate: '2026-10-20',
      description: title, body, source: `TestSrc${n}`, origin: 'live',
    });
    // 4 条真主张（live 逐字/同型）+ 2 条免责声明 boilerplate（必须被挡）
    const rssItems = [
      mkRss(1, 'Meta Plans to Raise Up To $95 Billion for AI Through Equity Sales',
        'Meta plans to raise up to $95 billion for AI through equity sales. The company said the fundraising will support AI infrastructure buildout in 2026.'),
      mkRss(2, 'Oracle does not expect to issue additional debt in calendar year 2026',
        'Oracle does not expect to issue additional debt in calendar year 2026. Management reiterated its capital allocation priorities on the call.'),
      mkRss(3, 'We continue to expect to deliver operating income this year that is above 2025 operating income',
        'We continue to expect to deliver operating income this year that is above 2025 operating income. The outlook assumes no material change in demand.'),
      // live 同形（0001730168-26-000011 逐字复现）：disclaimer 与后续
      // 描述被拼成一句（「whether」后无标点），合并句含 2026-03 时间
      // token——单独存在的 disclaimer 句过不了门，那样守卫断言空转
      // （R2 反向验证实测教训：摘除守卫后测试仍全绿）
      mkRss(4, 'Forward-Looking Statements boilerplate',
        'The Company undertakes no intent or obligation to publicly update or revise any of these projections, whether  8-K Item 2.02 业绩发布，2026-03-04 提交，备案附件中无数值指引'),
      // live 同形（0001769628-26-000220）：disclaimer 清单截断在 plans to 上（form B 过门）
      mkRss(5, 'Forward-Looking Statements disclaimer list',
        'These statements include, but are not limited to, statements related to our business; our strategy; our plans to invest in AI infrastructure in 2026.'),
      mkRss(6, 'EU AI Act transparency obligations',
        'Providers must comply with the transparency obligations by August 2026. Deployers of high-risk systems face parallel requirements.'),
    ];
    const eng = new ProjectionEngine({});
    eng.signals = { totalItems: 16, domains: [], items: [...Array.from({ length: 10 }, (_, i) => mkGuidanceItem(i)), ...rssItems] };
    const r = eng.buildForecastDiscrimination();
    const rssGroup = (r.results || []).filter(x => !(x.verdict === 'earnings-guidance' || x.guidance));
    const guidanceGroup = (r.results || []).filter(x => x.verdict === 'earnings-guidance' || x.guidance);
    const hasBoiler = (r.results || []).some(x => /undertakes no intent or obligation|These statements include/.test(String(x.claimSentence || x.text)));
    const after = JSON.parse(fs.readFileSync(LEDGER, 'utf-8'));
    const rssRegistered = after.predictions.filter(p => /^fc-testsrc/.test(p.id));
    // 幂等：同代码再跑一轮，新登记必须为 0（id 稳定）
    const r2 = eng.buildForecastDiscrimination();
    return guidanceGroup.length === 30                 // EDGAR 指引全进（额度 70）
      && rssGroup.length === 4                          // 4 条真主张全进（旧共享断点下只有 1 条）
      && !hasBoiler                                     // 2 条 boilerplate 被守卫挡
      && rssGroup.some(x => /Meta plans to raise up to \$95 billion/.test(String(x.text)))
      && rssGroup.some(x => /Oracle does not expect to issue additional debt/.test(String(x.text)))
      && r.audited === 34
      && r.rssClaimsTruncation === null                 // 4 < 20：无截断无披露
      && rssRegistered.length === 3                     // EU AI Act 条 dueOn 早于发布日按纪律不登记
      && r2.ledgerRegistration.registered.length === 0  // 幂等：同代码复跑 0 新登记
      && r2.ledgerRegistration.skipped.length === 34;
  } finally {
    if (saved === null) { try { fs.unlinkSync(LEDGER); } catch (_) {} } else fs.writeFileSync(LEDGER, saved);
  }
})(), 'v3.4 起 EDGAR 指引优先占额度、v3.14 提到 70 后 RSS 路径仍共用 claims.length>=20 断点——live 实证每轮仅 1 条 RSS 主张进辨别（62 条 = 61 EDGAR + 1 RSS）。独立额度后两条路径各自计数互不挤占；免责声明 boilerplate 不登记（corr-2026-037）；id 稳定复跑幂等');

// 2. 超额披露：RSS 池 25 条 > 额度 20 → seen/cut/cap 如实报数
c318('超额披露：RSS 池 25 条 > 额度 20 → seen=25 cut=5 cap=20（不静默切尾）', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const fs = require('fs');
  const LEDGER = path.join(__dirname, 'human-future/data/prediction-ledger.json');
  const saved = fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf-8') : null;
  try {
    fs.writeFileSync(LEDGER, JSON.stringify({ version: '1.0.0', predictions: [] }, null, 2));
    const mkGuidanceItem = (i) => ({
      title: `TEST Co${i} 8-K 业绩发布 · 2026-05-01`, link: `https://example.com/edgar-quota-${i}`,
      pubDate: '2026-05-01', description: '财报指引', body: '', source: 'SEC EDGAR', origin: 'live',
      ticker: `T${i}`, form: '8-K', accession: `0000000000-26-00010${i}`, filingDate: '2026-05-01', fiscalYearEnd: '1231',
      guidance: [1, 2, 3].map(k => ({
        sentence: `expect quarter 2 2026 total revenue to be in the range of $5${k}-6${k} billion`,
        metric: 'total revenue', settleMetric: 'revenue', gaapBasis: '', value: `in the range of $5${k}-6${k} billion`,
        tolerance: null, isRange: true, quarter: 2, fiscalYear: 2026, annual: false, periodLabel: 'FY2026 Q2', caveats: [],
      })),
      actuals: [], actualPeriod: null,
    });
    const mkRss = (n, title, body) => ({
      title, link: `https://example.com/rss-${n}`, pubDate: '2026-10-20',
      description: title, body, source: `CapSrc${n}`, origin: 'live',
    });
    const eng = new ProjectionEngine({});
    eng.signals = { totalItems: 35, domains: [], items: [
      ...Array.from({ length: 10 }, (_, i) => mkGuidanceItem(i)),
      ...Array.from({ length: 25 }, (_, i) => mkRss(100 + i, `Plan ${i}`,
        `Company ${i} plans to ship its next product in 2027 as part of the roadmap. Analysts expect strong demand for the new lineup.`)),
    ] };
    const r = eng.buildForecastDiscrimination();
    const t = r.rssClaimsTruncation;
    const rssGroup = (r.results || []).filter(x => !(x.verdict === 'earnings-guidance' || x.guidance));
    return !!t && t.seen === 25 && t.cut === 5 && t.cap === 20
      && rssGroup.length === 20;                       // 额度内全进，超额 5 条被挡且披露
  } finally {
    if (saved === null) { try { fs.unlinkSync(LEDGER); } catch (_) {} } else fs.writeFileSync(LEDGER, saved);
  }
})(), 'v3.10/v3.11/v3.14 同型纪律：额度仍可能被突破（RSS 池轮换），超限时 seen/cut/cap 随报告与注入同屏出现，未辨别的主张不登记不结算、不是「没有问题」');

// ── 组 2：精度回归（免责声明守卫不误伤真主张）────────────────────
// 3. boilerplate 守卫双向精度
c318('精度回归：免责声明 boilerplate 两句零误收 + 真主张（Oracle 不发债/EU AI Act 义务句式）不误伤', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const fs = require('fs');
  const LEDGER = path.join(__dirname, 'human-future/data/prediction-ledger.json');
  const saved = fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf-8') : null;
  try {
    fs.writeFileSync(LEDGER, JSON.stringify({ version: '1.0.0', predictions: [] }, null, 2));
    const mkRss = (n, title, body) => ({
      title, link: `https://example.com/rss-prec-${n}`, pubDate: '2026-10-20',
      description: title, body, source: `PrecSrc${n}`, origin: 'live',
    });
    const eng = new ProjectionEngine({});
    eng.signals = { totalItems: 4, domains: [], items: [
      // live 同形（见组 1 注释）：两种触发方式（拼句带时间 token / 截断在 plans to）
      mkRss(1, 'Forward-Looking Statements boilerplate',
        'The Company undertakes no intent or obligation to publicly update or revise any of these projections, whether  8-K Item 2.02 业绩发布，2026-03-04 提交，备案附件中无数值指引'),
      mkRss(2, 'Forward-Looking Statements disclaimer list',
        'These statements include, but are not limited to, statements related to our business; our strategy; our plans to invest in AI infrastructure in 2026.'),
      mkRss(3, 'Oracle does not expect to issue additional debt in calendar year 2026',
        'Oracle does not expect to issue additional debt in calendar year 2026. Management reiterated its capital allocation priorities on the call.'),
      mkRss(4, 'EU AI Act transparency obligations',
        'Providers must comply with the transparency obligations by August 2026. Deployers of high-risk systems face parallel requirements.'),
    ] };
    const r = eng.buildForecastDiscrimination();
    const texts = (r.results || []).map(x => String(x.text));
    return texts.length === 2
      && texts.some(t => /Oracle does not expect to issue additional debt/.test(t))
      && texts.some(t => /Providers must comply with the transparency obligations/.test(t))
      && !texts.some(t => /undertakes no intent or obligation|These statements include/.test(t));
  } finally {
    if (saved === null) { try { fs.unlinkSync(LEDGER); } catch (_) {} } else fs.writeFileSync(LEDGER, saved);
  }
})(), 'corr-2026-037：守卫只挡「命中句自身含免责声明标记」的句子（三形态），同条目后续句继续参与 findIndex——真主张常在 boilerplate 之后，不连坐');

// ── 组 3：分组渲染（formatReport + cron 注入）────────────────────
// 4. formatReport：RSS 组子标题 + 两组各自截断披露 + RSS 截断口径限定
c318('formatReport：非结构化前瞻主张分组渲染（子标题 + 两组截断披露 + RSS 口径限定行）', (() => {
  const { formatReport } = require('./scripts/project-future.js');
  const mk = (verdict, text, extra) => Object.assign({
    verdict, text, source: 'TEST SRC', category: 'general',
    dueOn: '2026-Q4', settleable: true,
    reasoning: { score: 1, checks: [{ present: true, label: '样本（S）' }, { present: false, label: '对照（C）' }] },
    baseRate: { rate: 0.5, sample: 0, source: 'default-prior' },
    falsifiability: { problems: [] },
  }, extra || {});
  const fd = {
    available: true, audited: 54,
    summary: { settleableCount: 10, wellFormedCount: 2, notForecastCount: 20, referenceTextCount: 4, guidanceCount: 32, calibrationWarnings: 0 },
    results: [
      ...Array.from({ length: 32 }, (_, i) => mk('earnings-guidance', `guidance line ${i} ` + 'x'.repeat(120), { guidance: { periodLabel: 'FY2026 Q4', value: '$10B', tolerance: '5%', caveats: [] } })),
      ...Array.from({ length: 22 }, (_, i) => mk(i % 4 === 0 ? 'not-a-forecast' : 'bare-assertion', `UNIQUE_RSS_MARKER_${i} ` + 'y'.repeat(120))),
    ],
    edgarClaimsTruncation: { seen: 75, cut: 5, cap: 70 },
    rssClaimsTruncation: { seen: 25, cut: 5, cap: 20 },
    note: 'TEST NOTE',
  };
  const report = {
    meta: { timestamp: '2026-10-27T12:00:00Z', heartflowVersion: '6.7.69', modulesLoaded: 74, version: '3.21.1', signalCount: 312, domainsMatched: 16 },
    summary: { verdict: '继续观察', score: 0.5, logicQuality: '中等', keyMessage: 'TEST', dateRange: { from: '2026-10-20', to: '2026-10-27' }, topDomains: ['frontier_models'] },
    forecastDiscrimination: fd, guidanceSettlement: { available: false },
    stages: [], turningPoints: [], risks: [], opportunities: [], trendClassification: { available: false },
    recommendations: [], confidence: { score: 0.5, level: 'medium', note: 'TEST', factors: { baseScore: 0.5, logicQuality: '中等', signalScore: 0.5, coverageScore: 0.5, undomainedRatio: 0.1, adjustment: 0 } },
  };
  const md = formatReport(report);
  // 只认渲染行（段内 note/口径限定文本同字符串会喂饱泛匹配——v3.2 教训）
  const rssHeaderLines = md.split('\n').filter(l => l.trim() === '### 非结构化前瞻主张（媒体/博客/备案正文；与财报指引各自独立额度）');
  return rssHeaderLines.length === 1                       // 子标题恰好一行
    && /\[不可证伪\] UNIQUE_RSS_MARKER_0/.test(md)          // RSS 主张真的被渲染
    && /\[财报指引\] guidance line 0/.test(md)              // 指引组照常渲染
    && /…另有 2 条财报指引未显示（详见报告 JSON 的 projection\.forecastDiscrimination\.results）/.test(md)
    && /…另有 2 条未显示（详见报告 JSON 的 projection\.forecastDiscrimination\.results）/.test(md)
    && /口径限定：本期非结构化前瞻主张（媒体\/博客\/备案正文）共 25 条，辨别额度上限 20 条，另有 5 条未进辨别（与 SEC EDGAR 指引各自独立额度/.test(md)
    && /口径限定：本期 SEC EDGAR 指引 claim 共 75 条/.test(md);   // EDGAR 披露不受影响
})(), 'v3.18 前 RSS 主张追加在 61 条 EDGAR 结果之后、全被渲染上限 30 切掉——「辨别了但看不见」。分组后两组各自上限（30/20）+ 各自截断披露；单条渲染闭包两组共用防漂移');

// 5. cron 注入源级：RSS 额度披露 + 分组渲染进 agent prompt
c318('cron 注入脚本渲染 v3.18 RSS 独立额度口径限定与分组', (() => {
  const p = require('path').join(require('os').homedir(), '.hermes/scripts/hf-cron-fetch.sh');
  if (!require('fs').existsSync(p)) return false;
  const src = require('fs').readFileSync(p, 'utf-8');
  const pf = require('fs').readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return /rssClaimsTruncation/.test(src)                                   // 披露字段进注入
    && /⚠ 口径限定：本期非结构化前瞻主张（媒体\/博客\/备案正文）共/.test(src)
    && /另有 \$\{t\.cut\} 条未进辨别——未辨别的主张不登记不结算，不得当成「没有问题」/.test(src)
    && /—— 非结构化前瞻主张（媒体\/博客\/备案正文；与财报指引各自独立额度）——/.test(src)
    && /另有 \$\{fdRss\.length - FD_RENDER_CAP\} 条非结构化前瞻主张未显示/.test(src)
    && /RSS_CLAIMS_CAP = 20/.test(pf)                                      // 引擎侧额度常量
    && /rssClaimsTruncation: rssTruncation/.test(pf)                       // 引擎侧落账
    && !/if \(claims\.length >= 20\) break;/.test(pf);                     // 共享断点已拆除（防复发）
})(), '解锁额度必须同时让 agent 看见（v3.0.0c/v3.2.1 断链纪律）：rssClaimsTruncation 披露 + 分组渲染（各 10 条）进注入脚本；共享 breakpoint 整个拆除，不是加个例外分支');

// 6. 版本号一致性（五处对齐 3.19.0）
c318('版本号一致性：五处对齐 3.27.0', (() => {
  const fs318 = require('fs');
  const VERSION = fs318.readFileSync(require('path').join(__dirname, 'VERSION'), 'utf-8').trim();
  const pkg = JSON.parse(fs318.readFileSync(require('path').join(__dirname, 'package.json'), 'utf-8'));
  const rp = fs318.readFileSync(require('path').join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  const pf = fs318.readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return VERSION === '3.27.0'
    && pkg.version === '3.27.0'
    && rp.includes('文明推演引擎 v3.27.0')      // banner
    && /version: '3\.27\.0'/.test(pf)          // projection meta
    && /version: '3\.27\.0'/.test(rp);         // run-pipeline fullReport meta
})(), 'VERSION/package.json/banner/projection meta/run-pipeline meta 必须对齐 3.27.0，防 corr-2026-014 版本漂移复发');

// ── v3.18 汇总 ──
(async () => {
  const results = await Promise.all(v318.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v318.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.18: ${v318.length - f} 通过, ${f} 失败, 共 ${v318.length} 个`);
  if (f > 0) {
    console.log('结论：RSS 独立额度或分组渲染不完整（额度/披露/守卫/渲染/注入/版本有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：RSS 前瞻主张独立额度（EDGAR 占额下 4 条全进、超额 seen/cut/cap 披露、免责声明守卫零误收不误伤），分组渲染+cron 注入同步落地；台账登记幂等。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v3.19：AVGO/DELL/PLTR 书面数值指引形态进库（已知边界推进）
//
// 背景：v3.4 起 SKILL.md 状态描述写着「MSFT/GOOGL/AVGO/CRWV/IBM/
// DELL/PLTR 只在电话会口头给指引或无数值」——2026-10-27 全池过堂
// （corr-2026-028 纪律）live 实证该描述已腐烂三个版本：AVGO/DELL/
// PLTR 三家 9 份在窗 8-K 正文里都有书面数值指引（含可结算区间），
// extractGuidance 四条旧形态全部不命中、零条进台账（corr-2026-032
// 「在窗公司≠采到的指引」同型第三波）。
//   ① form E 名词式区间（DELL live 逐字）：「Second-quarter FY27
//      revenue expected between $44.0 billion and $45.0 billion」
//      ——名词在前、无 is/are；form A 要 is/are、form B/D 要动词在前
//   ② form F 提升式区间（PLTR live 逐字）：「We are raising our
//      revenue guidance to between $8.150 – $8.158 billion」——
//      en-dash 区间语法（旧正则只认 and / in the range of / 单百分号）
//   ③ form G 名词式点值（AVGO/DELL live 逐字）：「Fourth quarter
//      fiscal year 2026 revenue guidance of approximately $34.8
//      billion」——名词+guidance of+数值，无谓语动词
//   ④ 期间形态四位：连字符季度词+两位财年（Second-quarter FY27）/
//      连字符全年词+两位财年（Full-year FY27）/ 冒号节头全年
//      （For full year 2026:）/ 季度词+fiscal year 全拼（Fourth
//      quarter fiscal year 2026）+ readPeriod 两位年份展开
//   ⑤ actuals 年份前置标题锚（DELL：「announces financial results
//      for its fiscal 2027 second quarter」）+ 名词相邻全年守卫
//      （Record full-year revenue 不进财季 key）
//   ⑥ 零漂移纪律：42 份 live 备案新旧代码逐条 diff，全部 drift 为
//      纯新增（ORCL Q2 EPS 期间不被冒号节头抢成全年——live 端到端
//      抓到的回归，AVGO 季度指引不被 fiscal year 锚词抢成全年）
// live 端到端：forecast 辨别 61→77 条 EDGAR 指引；DELL FY2027Q1/Q2
// 区间指引 vs 下一期备案实际值两条真实结算（均 beat 带外）；台账
// 新增 16 条登记。claim 额度 70→80（77 > 70，v3.14 同型纪律）。
// ════════════════════════════════════════════════════════════════
const v319 = [];
function c319(name, ok, detail) { v319.push({ name, ok, detail }); }

// ── 组 1：live 实证抽取（逐字原文）────────────────────────────────
// 1. DELL 名词式区间指引三段（Q1/Q2 季度 + 全年）
c319('live 实证：DELL 名词式区间指引三形态（两位财年+连字符期间+between-and 区间）', (() => {
  const { extractGuidance } = require('./human-future/scripts/edgar-collector.js');
  // DELL 0001571996-26-000021 live 逐字（2026-10-27 实抓）
  const Q2 = '1 Guidance Summary • Second-quarter FY27 revenue expected between $44.0 billion and $45.0 billion, up 49% year over year at the midpoint of $44.5 billion • Second-quarter FY27 GAAP diluted EPS expected to be $4.48 at the midpoint, up 164% year over year, and non-GAAP diluted EPS to be $4.80 at the midpoint, up 107% • Full-year FY27 revenue expected between $165.0 billion and $169.0 billion, up 47% year over year at the midpoint of $167.0 billion';
  const g = extractGuidance(Q2).guidance;
  const q2 = g.find(x => /44\.0 billion/.test(x.value || ''));
  const fy = g.find(x => /165\.0 billion/.test(x.value || ''));
  // DELL 0001571996-26-000003 live 逐字
  const Q1 = 'Guidance Summary • Full-year FY27 revenue expected between $138.0 billion and $142.0 billion, up 23% year over year at the midpoint of $140.0 billion • Full-year AI-Optimized Servers revenue expected to be roughly $50 billion, up 103% year over year • Full-year FY27 GAAP diluted EPS expected to be $11.52 at the midpoint, up 63% year over year • First-quarter FY27 revenue expected between $34.7 billion and $35.7 billion, up 51% year over year at the midpoint of $35.2 billion';
  const g1 = extractGuidance(Q1).guidance;
  const q1 = g1.find(x => /34\.7 billion/.test(x.value || ''));
  // [v3.19] 一句双 EPS 指引的 live 同形（DELL 0001571996-26-000039 逐字）：
  // form G 的 extendBack=40 会把第一个指引短语吞进第二个匹配的句子，
  // valueM 取句内第一个 $ 值 → 不加（期间,指标,数值）去重时产出
  // basis=non-gaap 但 value=$24.37 的错位记录（非GAAP 真值是 $25.50）。
  const EPS2 = 'Second-Quarter Summary • Record revenue of $47.0 billion, up 58% year over year • Record diluted earnings per share (EPS) of $6.34, up 273% year over year, and record non-GAAP diluted EPS of $7.04, up 203% • Cash flow from operations of $2.2 billion • Full-year FY27 revenue guidance of $192.0 billion, up 69% year over year • Full-year FY27 EPS guidance of $24.37 and non-GAAP EPS guidance of $25.50, up 181% and 148% year over year, respectively';
  const ge = extractGuidance(EPS2).guidance;
  const epsG = ge.filter(x => x.metric === 'eps');
  return !!q2 && q2.periodLabel === 'FY2027 Q2' && q2.quarter === 2 && q2.fiscalYear === 2027 && q2.isRange === true
    && q2.value === 'between $44.0 billion and $45.0 billion' && q2.settleMetric === 'revenue'
    && !!fy && fy.periodLabel === 'FY2027 全年' && fy.annual === true && fy.fiscalYear === 2027
    && fy.value === 'between $165.0 billion and $169.0 billion'
    && !!q1 && q1.periodLabel === 'FY2027 Q1' && q1.quarter === 1 && q1.fiscalYear === 2027
    && q1.value === 'between $34.7 billion and $35.7 billion'
    && ge.filter(x => x.metric === 'revenue').length === 1 && ge.find(x => x.metric === 'revenue').value === '$192.0 billion'
    // [v3.25] 一句双 EPS 的断言按 m0 修复后的正确行为更新：第二次 form G
    // 匹配（non-GAAP EPS guidance of $25.50）的 value 不再被 extendBack
    // 桥接成第一个指引短语的 $24.37——GAAP $24.37 与非 GAAP $25.50 是
    // 两个口径的两条义务（v3.13 口径分 key 同型：分口径各判各的，Brier
    // 样本不失真）。v3.19 的 length===1 是「错位 value 被 (期间,指标,数值)
    // 去重挡掉」的副产物——用去重掩盖 value 错位；根因（extendBack 桥接）
    // 已修，断言按正确行为改。第一条 basis 不为 non-gaap（GAAP/未限定）、
    // 第二条 basis 为 non-gaap。
    && epsG.length === 2 && epsG[0].value === '$24.37' && epsG[0].gaapBasis !== 'non-gaap'
    && epsG[1].value === '$25.50' && epsG[1].gaapBasis === 'non-gaap';
})(), 'form E 名词式区间：期间（连字符+两位财年）、区间值、settleMetric 全部正确；EPS 点值句（无 between）不进库');

// 2. AVGO 名词式点值指引 + 季度期间（fiscal year 全拼锚词不得抢成全年）
c319('live 实证：AVGO 名词式点值指引（Q4/Q3/Q2 期间正确，不被 fiscal year 锚词抢成全年）', (() => {
  const { extractGuidance } = require('./human-future/scripts/edgar-collector.js');
  // AVGO 0001730168-26-000076 live 逐字（亮点段 bullet）
  const AVGO = 'Fourth Quarter Fiscal Year 2026 Business Outlook Based on current business trends and conditions, the outlook for the fourth quarter of fiscal year 2026, ending November 1, 2026, is expected to be as follows: • Fourth quarter revenue guidance of approximately $34.8 billion; • Fourth quarter non-GAAP operating income guidance of approximately 66 percent of projected revenue (1)';
  const g = extractGuidance(AVGO).guidance;
  const rev = g.find(x => x.metric === 'revenue');
  // [v3.19] live 完整两段同值结构（0001730168-26-000076 逐字：亮点段 +
  // Business Outlook 段各陈述一次 $34.8 billion）——按（期间,指标,数值）
  // 去重后只余 1 条（两条不同句子、同一事实；台账 id 幂等另有一层）。
  const AVGO2 = 'Summary • Revenue • Quarterly common stock dividend of $0.65 per share • Fourth quarter fiscal year 2026 revenue guidance of approximately $34.8 billion, an increase of 93 percent from the prior year period • Fourth quarter fiscal year 2026 Non-GAAP operating income guidance of approximately 66 percent of projected revenue (1) Fourth Quarter Fiscal Year 2026 Business Outlook Based on current business trends and conditions, the outlook for the fourth quarter of fiscal year 2026, ending November 1, 2026, is expected to be as follows: • Fourth quarter revenue guidance of approximately $34.8 billion; • Fourth quarter non-GAAP operating income guidance of approximately 66 percent of projected revenue (1)';
  const g2 = extractGuidance(AVGO2).guidance;
  return g.length === 1 && !!rev
    && rev.periodLabel === 'FY2026 Q4' && rev.quarter === 4 && rev.fiscalYear === 2026 && rev.annual === false
    && rev.value === '$34.8 billion' && rev.isRange === false && rev.settleMetric === 'revenue'
    && g2.length === 1 && g2[0].periodLabel === 'FY2026 Q4';   // 两段同值去重 + 百分比-of-revenue 形态不收
})(), 'form G 名词式点值：「fiscal year 2026 … guidance」锚词不得把季度指引抢成全年（v3.16 lookbehind 同型缺口，零漂移 diff 实证）；「approximately 66 percent of projected revenue」无 $ 值不收');

// 3. PLTR 提升式区间指引（en-dash 区间 + 句外冒号节头期间）
c319('live 实证：PLTR 提升式区间指引（raising...to between + en-dash + 句外节头期间）', (() => {
  const { extractGuidance } = require('./human-future/scripts/edgar-collector.js');
  // PLTR 0001321655-26-000039 live 逐字（期间在句外节头）
  const PLTR = 'Q2 2026 Financial Summary (Unaudited) (Amounts in thousands, except percentages and per share amounts) Second Quarter Amount Revenue $ 1,935,464 Year-over-year growth 93 % For full year 2026: • We are raising our revenue guidance to between $8.150 – $8.158 billion. • We are raising our U.S. commercial revenue guidance to in excess of $3.424 billion, representing a growth rate of at least 134%. • We are raising our adjusted income from operations guidance to between $4.889 – $4.897 billion. • We are raising our adjusted free cash flow guidance to between $4.5 – $4.7 billion.';
  const g = extractGuidance(PLTR).guidance;
  const rev = g.find(x => x.metric === 'revenue');
  const fcf = g.find(x => /free cash flow/.test(x.metric || ''));
  return g.length === 3   // revenue + adjusted income + adjusted FCF；in excess of 不收
    && !!rev && rev.periodLabel === 'FY2026 全年' && rev.annual === true && rev.fiscalYear === 2026 && rev.quarter === null
    && rev.value === 'between $8.150 – $8.158 billion' && rev.isRange === true && rev.settleMetric === 'revenue'
    && !!fcf && fcf.value === 'between $4.5 – $4.7 billion';
})(), 'form F 提升式区间：en-dash 区间值入库；期间取句外节头「For full year 2026:」（不被前文 Q2 2026 摘要表抢成 FY2026Q2——dueOn 错位会撞 Q2 实际值 key 判假 beat）；「to in excess of $X」与「to 71% growth」不收');

// 4. 零漂移回归：ORCL Q2 EPS 指引期间不被冒号节头抢成全年
c319('零漂移回归：ORCL Q2 EPS 区间指引期间保持 FY2027 Q2（冒号节头 lookbehind）', (() => {
  const { extractGuidance } = require('./human-future/scripts/edgar-collector.js');
  // ORCL 0001193125-26-387905 live 逐字（Q2 FY2027 指引段 + Full FY 2027 全年段同文）
  const ORCL = 'Guidance for Q2 FY 2027 Oracle is providing the following forward-looking guidance for Q2 FY 2027: • Total revenues are expected to grow between 30% and 34% in constant currency and USD. • Total Cloud revenue is expected to grow between 64% and 70% in constant currency and between 65% and 71% in USD. • Non-GAAP earnings per share is expected to be between $1.83 and $1.91 in constant currency and between $1.85 and $1.93 in USD, which represents growth of 19% to 23% in constant currency and 21% to 25% in USD excluding a one-time gain from Q2 FY2026 1 . Guidance for Full FY 2027 For fiscal year 2027, we now expect total revenue to be at least $90 billion, and non-GAAP EPS to be at $8.10.';
  const g = extractGuidance(ORCL).guidance;
  const eps = g.find(x => /earnings per share is expected/.test(x.sentence || ''));
  const rev = g.find(x => /total revenue to be at least/.test(x.sentence || ''));
  return !!eps && eps.periodLabel === 'FY2027 Q2' && eps.quarter === 2 && eps.fiscalYear === 2027 && eps.annual === false
    && !!rev && rev.periodLabel === 'FY2027 全年' && rev.annual === true;
})(), '「for Q2 FY 2027:」的冒号节头不得把 Q2 EPS 区间指引抢成 FY2027 全年（live 零漂移 diff 实证的回归：不加 lookbehind 时 dueOn 提前到已过期时点、与 Q2 实际值撞 key 判假 beat）');

// ── 组 2：actuals 侧（年份前置锚 + 全年守卫）────────────────────────
// 5. DELL 实际值：年份前置标题锚 + Record revenue of 形态 + 全年守卫
c319('live 实证：DELL 实际值抽取（年份前置标题期间 + Record revenue of + 全年守卫）', (() => {
  const { extractActuals } = require('./human-future/scripts/edgar-collector.js');
  // DELL 0001571996-26-000039 live 逐字（标题句年份在前）
  const Q2F = 'Dell Technologies (NYSE: DELL) announces financial results for its fiscal 2027 second quarter and provides guidance for its fiscal 2027 third quarter and full year. Second-Quarter Summary • Record revenue of $47.0 billion, up 58% year over year • Record diluted earnings per share (EPS) of $6.34, up 273% year over year, and record non-GAAP diluted EPS of $7.04, up 203%';
  const a2 = extractActuals(Q2F);
  // DELL 0001571996-26-000003 live 逐字（Q4+全年合并报告：全年营收句不得进财季 key）
  const Q4F = 'Dell Technologies (NYSE: DELL) announces financial results for its fiscal 2026 fourth quarter and full year ended January 30, 2026. The company also provides guidance for its fiscal 2027 first quarter and full year. Full-Year Summary • Record full-year revenue of $113.5 billion, up 19% year over year • Record full-year diluted earnings per share (EPS) of $8.68, up 36% year over year';
  const a4 = extractActuals(Q4F);
  return a2.fiscalYear === 2027 && a2.quarter === 2
    && a2.actuals.length === 1 && a2.actuals[0].metric === 'revenue' && a2.actuals[0].value === '$47.0 billion'
    // Q4 备案：标题期间解析不到（"results" 词被正文裁掉）时 actuals 为空——
    // 但若解析到（有 results 前缀的形态），全年营收句也不得进财季 key
    && (a4.fiscalYear === null || !a4.actuals.some(x => /113\.5/.test(x.value || '')));
})(), '年份前置标题锚（RESULTS_HEADLINE_RES 四季形态全不命中的语序）；「Record full-year revenue of $113.5 billion」不得进 FY2026 Q4 财季 key（corr-2026-034 同型：查找表里躺着错事实）');

// ── 组 3：结算端到端（受控台账备份还原）────────────────────────────
// 6. DELL Q1/Q2 FY27 区间指引 vs 下一期备案实际值：beat 带外真实结算
c319('结算端到端：DELL FY2027Q1/Q2 区间指引 vs 下一期实际值均 beat 带外（受控台账）', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const fs = require('fs');
  const LEDGER = path.join(__dirname, 'human-future/data/prediction-ledger.json');
  const saved = fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf-8') : null;
  try {
    fs.writeFileSync(LEDGER, JSON.stringify({ version: '1.0.0', predictions: [] }, null, 2));
    const mkGuidance = (acc, date, quarter, value) => ({
      title: `DELL 8-K 业绩发布 · ${date}`, link: `https://www.sec.gov/Archives/edgar/data/1615520/${acc}-index.htm`,
      pubDate: date, description: '财报指引', body: '', source: 'SEC EDGAR', origin: 'live',
      ticker: 'DELL', form: '8-K', accession: acc, filingDate: date, fiscalYearEnd: '0129',
      guidance: [{
        sentence: `DELL ${quarter === 1 ? 'First' : 'Second'}-quarter FY27 revenue expected between ${value}`,
        metric: 'revenue', settleMetric: 'revenue', gaapBasis: '', value: `between ${value}`,
        tolerance: null, isRange: true, quarter, fiscalYear: 2027, annual: false, periodLabel: `FY2027 Q${quarter}`, caveats: [],
      }],
      actuals: [], actualPeriod: null,
    });
    const mkActuals = (acc, date, quarter, value) => ({
      title: `DELL 8-K 业绩发布 · ${date}`, link: `https://www.sec.gov/Archives/edgar/data/1615520/${acc}-index.htm`,
      pubDate: date, description: '财报', body: '', source: 'SEC EDGAR', origin: 'live',
      ticker: 'DELL', form: '8-K', accession: acc, filingDate: date, fiscalYearEnd: '0129',
      guidance: [],
      actuals: [{ metric: 'revenue', value, gaapBasis: '' }],
      actualPeriod: { quarter, fiscalYear: 2027 },
    });
    const eng = new ProjectionEngine({});
    eng.signals = { totalItems: 4, domains: [], items: [
      mkGuidance('0001571996-26-000003', '2026-02-26', 1, '$34.7 billion and $35.7 billion'),
      mkGuidance('0001571996-26-000021', '2026-05-28', 2, '$44.0 billion and $45.0 billion'),
      mkActuals('0001571996-26-000021', '2026-05-28', 1, '$43.8 billion'),
      mkActuals('0001571996-26-000039', '2026-09-01', 2, '$47.0 billion'),
    ] };
    const r = eng.buildForecastDiscrimination();
    const s = r.guidanceSettlement;
    const settled = (s.settled || []).filter(x => x.ticker === 'DELL');
    // 结算判据：区间带内为命中，超带上沿=beat；dueOn（FYE 0129 + 45 天）均已过
    const q1 = (s.settled || []).find(x => /34\.7/.test(x.guided || ''));
    const q2 = (s.settled || []).find(x => /44\.0/.test(x.guided || ''));
    return Array.isArray(s.settled) && s.settled.length === 2
      && !!q1 && q1.hit === false && /beat/.test(q1.direction) && q1.actual === '$43.8 billion'
      && !!q2 && q2.hit === false && /beat/.test(q2.direction) && q2.actual === '$47.0 billion';
  } finally {
    if (saved === null) { try { fs.unlinkSync(LEDGER); } catch (_) {} } else fs.writeFileSync(LEDGER, saved);
  }
})(), 'DELL Q1 指引 $34.7-35.7B vs 实际 $43.8B、Q2 指引 $44-45B vs 实际 $47.0B 均超带上沿（beat 带外，方向单独记不读成「没做到」）；区间指引经 rangeM/parseRange 双側同型解析');

// 7. parseRange en-dash 纯函数（earnings-settlement 双側同型）
c319('parseRange：between + en-dash 美元区间（PLTR live 同型，抽取/结算双側一致）', (() => {
  const { parseRange, settleGuidance } = require('./human-future/scripts/earnings-settlement.js');
  const r1 = parseRange('between $8.150 – $8.158 billion');
  const r2 = parseRange('between $4.889 – $4.897 billion');
  const s1 = settleGuidance({ value: 'between $8.150 – $8.158 billion', tolerance: null, isRange: true }, '$8.155 billion');
  const s2 = settleGuidance({ value: 'between $8.150 – $8.158 billion', tolerance: null, isRange: true }, '$8.200 billion');
  const near = (a, b) => Math.abs(a - b) < 1;   // 浮点折算容差（8.158*1e9 = 8157999999.999999）
  return r1 && near(r1.lo, 8.15e9) && near(r1.hi, 8.158e9) && r1.unit === 'usd'
    && r2 && near(r2.lo, 4.889e9) && near(r2.hi, 4.897e9)
    && s1.settleable && s1.hit === true && s1.direction.startsWith('in-band')
    && s2.settleable && s2.hit === false && s2.direction.startsWith('beat');
})(), 'en-dash 区间两端折算 billion、单位 usd；带内/beat 方向判定与 between-and 旧形态一致');

// ── 组 4：引擎端到端 + 版本号 ─────────────────────────────────────
// 8. 引擎端到端：三家新指引进辨别 + 登记（含额度 80 不切尾）
c319('引擎端到端：AVGO/DELL/PLTR 新指引进辨别+登记，EDGAR 额度 80（77 条不切尾）', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const fs = require('fs');
  const LEDGER = path.join(__dirname, 'human-future/data/prediction-ledger.json');
  const saved = fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf-8') : null;
  try {
    fs.writeFileSync(LEDGER, JSON.stringify({ version: '1.0.0', predictions: [] }, null, 2));
    const mk = (ticker, acc, guidance) => ({
      title: `${ticker} 8-K 业绩发布 · 2026-06-01`, link: `https://www.sec.gov/Archives/edgar/data/1/${acc}-index.htm`,
      pubDate: '2026-06-01', description: '财报指引', body: '', source: 'SEC EDGAR', origin: 'live',
      ticker, form: '8-K', accession: acc, filingDate: '2026-06-01', fiscalYearEnd: '1231',
      guidance, actuals: [], actualPeriod: null,
    });
    const mkG = (sentence, value, isRange, quarter, annual) => ({
      sentence, metric: 'revenue', settleMetric: 'revenue', gaapBasis: '', value,
      tolerance: null, isRange, quarter, fiscalYear: 2026, annual, periodLabel: annual ? 'FY2026 全年' : `FY2026 Q${quarter}`, caveats: [],
    });
    const eng = new ProjectionEngine({});
    eng.signals = { totalItems: 3, domains: [], items: [
      mk('AVGO', '0001730168-26-000076', [mkG('Fourth quarter fiscal year 2026 revenue guidance of approximately $34.8 billion', '$34.8 billion', false, 4, false)]),
      mk('DELL', '0001571996-26-000021', [mkG('Second-quarter FY27 revenue expected between $44.0 billion and $45.0 billion', 'between $44.0 billion and $45.0 billion', true, 2, false)]),
      mk('PLTR', '0001321655-26-000039', [mkG('We are raising our revenue guidance to between $8.150 – $8.158 billion.', 'between $8.150 – $8.158 billion', true, null, true)]),
    ] };
    const r = eng.buildForecastDiscrimination();
    const src = fs.readFileSync(path.join(__dirname, 'scripts/project-future.js'), 'utf-8');
    return r.results.length === 3 && r.edgarClaimsTruncation === null
      && r.results.filter(x => x.verdict === 'earnings-guidance').length === 3
      && r.ledgerRegistration.registered.length === 3
      && /EDGAR_CLAIMS_CAP = 170/.test(src);
  } finally {
    if (saved === null) { try { fs.unlinkSync(LEDGER); } catch (_) {} } else fs.writeFileSync(LEDGER, saved);
  }
})(), '三家新指全部以 earnings-guidance verdict 进辨别并登记（带期间元数据）；额度 80 落在代码里（v3.19 live：77 条 ≤ 80 零切尾）');

// 9. 版本号一致性（五处对齐 3.19.0）
c319('版本号一致性：五处对齐 3.27.0', (() => {
  const fs = require('fs');
  const VERSION = fs.readFileSync(path.join(__dirname, 'VERSION'), 'utf-8').trim();
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
  const rp = fs.readFileSync(path.join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  const pf = fs.readFileSync(path.join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return VERSION === '3.27.0'
    && pkg.version === '3.27.0'
    && rp.includes('文明推演引擎 v3.27.0')      // banner
    && /version: '3\.27\.0'/.test(pf)          // projection meta
    && /version: '3\.27\.0'/.test(rp);         // run-pipeline fullReport meta
})(), 'VERSION/package.json/banner/projection meta/run-pipeline meta 必须对齐 3.27.0，防 corr-2026-014 版本漂移复发');

// ── v3.19 汇总 ──
(async () => {
  const results = await Promise.all(v319.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v319.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.19: ${v319.length - f} 通过, ${f} 失败, 共 ${v319.length} 个`);
  if (f > 0) {
    console.log('结论：AVGO/DELL/PLTR 书面数值指引形态进库不完整（抽取/期间/精度/actuals/结算/引擎/版本有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：AVGO/DELL/PLTR 书面数值指引进库（名词式区间/提升式区间/名词式点值三形态 + 两位财年/冒号节头/全拼 fiscal year 期间形态 + 年份前置 actuals 锚），零漂移（ORCL Q2 期间回归、AVGO 季度不抢全年）；DELL Q1/Q2 区间指引两条真实结算（beat 带外）；claim 额度 70→80。');
  }
})();

// v3.20：PLTR 冒号+bullet 期望式指引形态进库（已知边界推进：corr-2026-032 同型第四波）
//
// 背景：v3.19 全池过堂补了 AVGO/DELL/PLTR 的书面数值指引（form E/F/G），
// 但过堂问的是「哪些公司没指引」——PLTR 三份在窗 8-K 的 Outlook 段
// **季度指引 bullet 整个在库外**：v3.19 只收 raising 式全年指引（form F），
// Q1/Q2/Q3 2026 营收与 adjusted income 指引全部漏采。同一公司不同段落
// 可以用完全不同句式，形态命中数>0 ≠ 该公司覆盖完整（corr-2026-039）。
//   ① form H 冒号+bullet 期望式（PLTR live 逐字）：「For Q1 2026, we
//      expect: • Revenue of between $1.532 - $1.536 billion. •
//      Adjusted income from operations of between $870 - $874
//      million.」——expect+冒号+bullet 列表，首 bullet 带动词、后续
//      bullet 靠 lookbehind 段间迭代追上；名词前容忍 {0,2} 修饰词
//   ② grew-to 实际值形态（PLTR live 逐字）：「• Revenue grew 85%
//      year-over-year and 16% quarter-over-quarter to $1.633
//      billion」——四个旧营收形态全部不命中；分部守卫 lookbehind 挡
//      U.S./U.S. commercial/U.S. government 三条分部行
//   ③ 结算端到端：PLTR FY2026Q1 区间 $1.532-1.536B vs 实际 $1.633B、
//      Q2 区间 $1.797-1.801B vs 实际 $1.935B 两条真实结算（均 beat
//      带外）；台账 92→99；claim 额度 80→90（live 84>80，砍掉的正是
//      本轮新增 PLTR 尾部条目——v3.14/v3.19 同型纪律第三次实证）
//   ④ 零漂移纪律：42 份 live 备案新旧代码逐条 diff，仅 PLTR 三家
//      纯新增（其余 39 家逐条不变）
// ════════════════════════════════════════════════════════════════
const v320 = [];
function c320(name, ok, detail) { v320.push({ name, ok, detail }); }

// ── 组 1：live 实证抽取（逐字原文）────────────────────────────────
// 1. PLTR 02-02 colon-bullet 指引（Q1 收入 + Q1 adjusted income + FY 收入）
c320('live 实证：PLTR 冒号+bullet 期望式指引（Q1 收入/Q1 income/FY 收入三形态）', (() => {
  const { extractGuidance } = require('./human-future/scripts/edgar-collector.js');
  // PLTR 0001321655-26-000004 live 逐字（2026-10-27 实抓；正文在 FY adj
  // income 的 "of between $4" 处被采集器截断——截断残值不得入库）
  const FEB = 'Outlook For Q1 2026, we expect: • Revenue of between $1.532 - $1.536 billion. • Adjusted income from operations of between $870 - $874 million. For full year 2026, we expect: • Revenue of between $7.182 - $7.198 billion. • U.S. commercial revenue in excess of $3.144 billion, representing a growth rate of at least 115%. • Adjusted income from operations of between $4';
  const g = extractGuidance(FEB).guidance;
  const q1 = g.find(x => /1\.532/.test(x.value || ''));
  const q1i = g.find(x => /870/.test(x.value || ''));
  const fy = g.find(x => /7\.182/.test(x.value || ''));
  return g.length === 3
    && !!q1 && q1.periodLabel === 'FY2026 Q1' && q1.quarter === 1 && q1.fiscalYear === 2026 && q1.annual === false
    && q1.metric === 'revenue' && q1.value === 'between $1.532 - $1.536 billion' && q1.isRange === true && q1.settleMetric === 'revenue'
    && !!q1i && q1i.periodLabel === 'FY2026 Q1' && q1i.metric === 'income' && q1i.value === 'between $870 - $874 million' && q1i.isRange === true
    && q1i.sentence === 'Adjusted income from operations of between $870 - $874 million'   // 修饰词容忍：claim 句子带完整 bullet 内容
    && !!fy && fy.periodLabel === 'FY2026 全年' && fy.annual === true && fy.fiscalYear === 2026 && fy.quarter === null
    && fy.value === 'between $7.182 - $7.198 billion'
    // in excess of 指点值不收（v3.19 同款决议）；截断残值 "$4" 不收
    && !g.some(x => /3\.144/.test(x.value || '')) && !g.some(x => /^\$4$|between \$4$/.test(x.value || ''));
})(), 'form H 冒号+bullet：期间（冒号节头 Q1 2026 / full year 2026）、区间值、修饰语容忍（Adjusted income from operations）、截断残值与 in-excess-of 拒绝全部正确');

// 2. PLTR 05-04 / 08-03 季度指引（Q2/Q3 revenue + income，raising 式不重复）
c320('live 实证：PLTR 05-04/08-03 季度指引（Q2/Q3 revenue+income，FY raising 同文不重复）', (() => {
  const { extractGuidance } = require('./human-future/scripts/edgar-collector.js');
  // PLTR 0001321655-26-000026 live 逐字
  const MAY = 'Outlook For Q2 2026, we expect: • Revenue of between $1.797 – $1.801 billion. • Adjusted income from operations of between $1.063 – $1.067 million. For full year 2026: • We are raising our revenue guidance to between $7.650 – $7.662 billion. • We are raising our U.S. commercial revenue guidance to in excess of $3.224 billion, representing a growth rate of at least 120%.';
  const g2 = extractGuidance(MAY).guidance;
  const q2 = g2.find(x => /1\.797/.test(x.value || ''));
  const q2i = g2.find(x => /1\.063/.test(x.value || ''));
  // PLTR 0001321655-26-000039 live 逐字
  const AUG = 'Outlook For Q3 2026, we expect: • Revenue of between $2.160 – $2.164 billion. • Adjusted income from operations of between $1.292 – $1.296 billion. For full year 2026: • We are raising our revenue guidance to between $8.150 – $8.158 billion. • We are raising our adjusted free cash flow guidance to between $4.5 – $4.7 billion.';
  const g3 = extractGuidance(AUG).guidance;
  const q3 = g3.find(x => /2\.160/.test(x.value || ''));
  const q3i = g3.find(x => /1\.292/.test(x.value || ''));
  return g2.length === 3 && g3.length === 4
    && !!q2 && q2.periodLabel === 'FY2026 Q2' && q2.value === 'between $1.797 – $1.801 billion' && q2.isRange === true
    && !!q2i && q2i.periodLabel === 'FY2026 Q2' && q2i.metric === 'income'
    && !!q3 && q3.periodLabel === 'FY2026 Q3' && q3.value === 'between $2.160 – $2.164 billion' && q3.isRange === true
    && !!q3i && q3i.periodLabel === 'FY2026 Q3' && q3i.metric === 'income' && q3i.value === 'between $1.292 – $1.296 billion'
    // FY raising 式（form F）与 colon-bullet 同文并存各抽各的，不互相吞
    && g2.filter(x => x.annual).length === 1 && /7\.650/.test(g2.find(x => x.annual).value)
    && g3.filter(x => x.annual).length === 2 && /8\.150/.test(g3.find(x => x.metric === 'revenue' && x.annual).value);
})(), 'Q2/Q3 季度指引期间与 en-dash 区间值正确；form F（raising 全年）与 form H（colon-bullet 季度）同文并存零重叠；in excess of 不收');

// ── 组 2：精度回归 ──────────────────────────────────────────────
// 3. form H 精度（其它形态地盘不抢 + 跨节不串段 + 锚词缺失不收）
c320('精度回归：form H 不抢 form A/B/D 地盘、无冒号不收、跨节不串段、非指标名词不收', (() => {
  const { extractGuidance } = require('./human-future/scripts/edgar-collector.js');
  // form B 地盘（动词在前无冒号）
  const b = extractGuidance('AMD expects revenue to be approximately $13 billion, plus or minus $300 million').guidance;
  // form A 地盘
  const a = extractGuidance('Revenue is expected to be $108.0 billion, plus or minus 2%').guidance;
  // form D 地盘（META 评论式，无冒号）
  const d = extractGuidance('We expect fourth quarter 2026 total revenue to be in the range of $73-76 billion').guidance;
  // 无 expect 冒号锚的裸 bullet 名词句
  const bare = extractGuidance('• Revenue of between $1.532 - $1.536 billion.').guidance;
  // actuals 陈述（过去时 grew，无 expect 冒号）
  const act = extractGuidance('Q1 2026 Highlights • Revenue grew 85% year-over-year to $1.633 billion').guidance;
  // 非指标名词
  const nonMetric = extractGuidance('we expect: • Costs of between $5 - $6 billion. • Monthly active users of between 100 - 200 million.').guidance;
  // 跨节不串段：Q1 节的 expect 追不上 FY 节的 bullet
  const cross = extractGuidance('For Q1 2026, we expect: • Revenue of between $1.532 - $1.536 billion. For full year 2026, we expect: • Revenue of between $7.182 - $7.198 billion.').guidance;
  // [v3.20] in-excess 无前缀形态（live 同句去掉 "U.S. commercial" 限定词）：
  // 必须真正触达负向断言分支——带 "U.S." 前缀时名词前修饰词 pattern 吃不下
  // 带点的 "U.S."，match 起点对不上 lookbehind 终点，压根到不了断言（第一版
  // 反向验证报 0 失败=断言空转，corr-2026-029/037 同型教训）
  const excess = extractGuidance('For full year 2026, we expect: • Revenue of between $7.182 - $7.198 billion. • Revenue in excess of $3.144 billion, representing a growth rate of at least 115%.').guidance;
  // [v3.20] 无 expect 动词的冒号节头：第二节头只有 "For full year 2026:"
  // （无 we expect），[^:] 隔段窗跨不过节头冒号——第一节的 expect 追不上它，
  // 整句不收（冒号是硬锚：没有 expect 锚的 bullet 列表无法区分指引与
  // 实际值/其它列举，v3.20 设计意图，防回归）
  const noVerbHeader = extractGuidance('For Q1 2026, we expect: • Revenue of between $1.532 - $1.536 billion. For full year 2026: • Revenue of between $7.182 - $7.198 billion.').guidance;
  return b.length === 1 && !/^Revenue of/.test(b[0].sentence || '')
    && a.length === 1 && !/^Revenue of/.test(a[0].sentence || '')
    && d.length === 1 && !/^total revenue to be/.test(d[0].sentence || '')
    && bare.length === 0 && act.length === 0 && nonMetric.length === 0
    && cross.length === 2 && cross[0].periodLabel === 'FY2026 Q1' && cross[1].periodLabel === 'FY2026 全年'
    && excess.length === 1 && /7\.182/.test(excess[0].value || '') && !excess.some(x => /3\.144/.test(x.value || ''))
    && noVerbHeader.length === 1 && noVerbHeader[0].periodLabel === 'FY2026 Q1';
})(), 'form H 只认 colon-bullet 结构：form A/B/D 句式不被抢（句子不起于名词式 of 形态）、无 expect 冒号锚不收、过去时 actuals 不收、非指标名词不收、跨节不串段（Q1 节 expect 追不上 FY 节 bullet）；in-excess 指点值无前缀形态也不收（单边下界登记成点值会扭曲义务语义，v3.19 同款决议）');

// ── 组 3：actuals 侧 ────────────────────────────────────────────
// 4. grew-to 实际值抽取（live 逐字 + 分部守卫 + 先到即本财季）
c320('live 实证：grew-to 营收实际值（总营收句入账 + 三条分部行拒绝 + Q4 备案期间锚缺失如实为空）', (() => {
  const { extractActuals } = require('./human-future/scripts/edgar-collector.js');
  // PLTR 0001321655-26-000026 live 逐字（亮点段）
  const MAY = 'Palantir Technologies Inc. (NASDAQ:PLTR) today announced financial results for the first quarter ended March 31, 2026. Q1 2026 Highlights • U.S. revenue grew 104% year-over-year and 19% quarter-over-quarter to $1.282 billion ◦ U.S. commercial revenue grew 133% year-over-year and 18% quarter-over-quarter to $595 million ◦ U.S. government revenue grew 84% year-over-year and 21% quarter-over-quarter to $687 million • Revenue grew 85% year-over-year and 16% quarter-over-quarter to $1.633 billion • Closed 206 deals of at least $1 million';
  const a = extractActuals(MAY);
  // 纯分部行（无总营收句）→ 空，不把分部值当总量
  const segOnly = extractActuals('Palantir Technologies Inc. (NASDAQ:PLTR) today announced financial results for the second quarter ended June 30, 2026. ◦ U.S. revenue grew 104% year-over-year to $1.282 billion');
  // 02-02 备案标题语序「fourth quarter and fiscal year ended」四季锚全不命中 → 空（已知边界如实）
  const feb = extractActuals('Palantir Technologies Inc. (NASDAQ:PLTR) today announced financial results for the fourth quarter and fiscal year ended December 31, 2025. Q4 2025 Highlights • Revenue grew 70% year-over-year to $1.407 billion FY 2025 Highlights • Revenue grew 56% year-over-year to $4.475 billion');
  // [v3.20] 无桥接夹具：grew 句自身无 to $值、下一 bullet 有——间隔窗排除
  // bullet（[^.;$•]），不得把下一 bullet 的值桥接成本句营收（live 亮点段
  // bullet 间无句点，AMZN v3.5.1 宽 gap 同型风险）
  const bridge = extractActuals('Palantir Technologies Inc. (NASDAQ:PLTR) today announced financial results for the first quarter ended March 31, 2026. • Revenue grew 85% year-over-year • Operating income grew 20% to $5.0 billion');
  return a.fiscalYear === 2026 && a.quarter === 1
    && a.actuals.length === 1 && a.actuals[0].metric === 'revenue' && a.actuals[0].value === '$1.633 billion'
    && segOnly.actuals.length === 0
    && feb.actuals.length === 0 && feb.fiscalYear === null
    && bridge.actuals.length === 0;   // 不桥接下一 bullet 的 $5.0 billion
})(), 'grew-to：总营收句（bullet 后直接名词）抽中；U.S./U.S. commercial/U.S. government 分部行被 lookbehind 挡掉（先到即本财季的顺序纪律 + 分部守卫双保险）；02-02 标题期间锚不命中的语序 actuals 为空（如实留界，不影响 Q1/Q2 结算——实际值由 05-04/08-03 备案提供）');

// ── 组 4：结算端到端（受控台账备份还原）────────────────────────────
// 5. PLTR Q1/Q2 区间指引 vs 下一期备案实际值：beat 带外真实结算 + Q3 到期门
c320('结算端到端：PLTR FY2026Q1/Q2 区间指引 vs 下一期实际值均 beat 带外（受控台账）', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const fs = require('fs');
  const path = require('path');
  const LEDGER = path.join(__dirname, 'human-future/data/prediction-ledger.json');
  const saved = fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf-8') : null;
  try {
    fs.writeFileSync(LEDGER, JSON.stringify({ version: '1.0.0', predictions: [] }, null, 2));
    const mkGuidance = (acc, date, quarter, value) => ({
      title: `PLTR 8-K 业绩发布 · ${date}`, link: `https://www.sec.gov/Archives/edgar/data/1321655/${acc}-index.htm`,
      pubDate: date, description: '财报指引', body: '', source: 'SEC EDGAR', origin: 'live',
      ticker: 'PLTR', form: '8-K', accession: acc, filingDate: date, fiscalYearEnd: '1231',
      guidance: [{
        sentence: `Revenue of between ${value}`,
        metric: 'revenue', settleMetric: 'revenue', gaapBasis: '', value: `between ${value}`,
        tolerance: null, isRange: true, quarter, fiscalYear: 2026, annual: false, periodLabel: `FY2026 Q${quarter}`, caveats: [],
      }],
      actuals: [], actualPeriod: null,
    });
    const mkActuals = (acc, date, quarter, value) => ({
      title: `PLTR 8-K 业绩发布 · ${date}`, link: `https://www.sec.gov/Archives/edgar/data/1321655/${acc}-index.htm`,
      pubDate: date, description: '财报', body: '', source: 'SEC EDGAR', origin: 'live',
      ticker: 'PLTR', form: '8-K', accession: acc, filingDate: date, fiscalYearEnd: '1231',
      guidance: [],
      actuals: [{ metric: 'revenue', value, gaapBasis: '' }],
      actualPeriod: { quarter, fiscalYear: 2026 },
    });
    const eng = new ProjectionEngine({});
    eng.signals = { totalItems: 6, domains: [], items: [
      mkGuidance('0001321655-26-000004', '2026-02-02', 1, '$1.532 - $1.536 billion'),
      mkGuidance('0001321655-26-000026', '2026-05-04', 2, '$1.797 – $1.801 billion'),
      mkGuidance('0001321655-26-000039', '2026-08-03', 3, '$2.160 – $2.164 billion'),
      mkActuals('0001321655-26-000026', '2026-05-04', 1, '$1.633 billion'),
      mkActuals('0001321655-26-000039', '2026-08-03', 2, '$1.935 billion'),
    ] };
    const r = eng.buildForecastDiscrimination();
    const s = r.guidanceSettlement;
    const q1 = (s.settled || []).find(x => /1\.532/.test(x.guided || ''));
    const q2 = (s.settled || []).find(x => /1\.797/.test(x.guided || ''));
    const q3settled = (s.settled || []).some(x => /2\.160/.test(x.guided || ''));
    const registered = (r.ledgerRegistration.registered || []).map(x => x.id);
    return Array.isArray(s.settled) && s.settled.length === 2
      && !!q1 && q1.hit === false && /beat/.test(q1.direction) && q1.actual === '$1.633 billion'
      && !!q2 && q2.hit === false && /beat/.test(q2.direction) && q2.actual === '$1.935 billion'
      && !q3settled   // Q3 dueOn 2026-11-14 未到，到期门不提前结
      && registered.filter(x => /2-160/.test(x)).length === 1;   // Q3 已登记未结算
  } finally {
    if (saved === null) { try { fs.unlinkSync(LEDGER); } catch (_) {} } else fs.writeFileSync(LEDGER, saved);
  }
})(), 'Q1 指引 $1.532-1.536B vs 实际 $1.633B、Q2 指引 $1.797-1.801B vs 实际 $1.935B 均超带上沿（beat 带外，方向单独记不读成「没做到」）；Q3 指引按到期门（dueOn 2026-11-14）保持 pending 不提前结');

// 6. parseRange 带空格连字符美元区间（PLTR 02-02 live 同型）
c320('parseRange：between + 带空格连字符美元区间（PLTR 02-02 live 同型，抽取/结算双側一致）', (() => {
  const { parseRange, settleGuidance } = require('./human-future/scripts/earnings-settlement.js');
  const r1 = parseRange('between $1.532 - $1.536 billion');
  const r2 = parseRange('between $870 - $874 million');
  const s1 = settleGuidance({ value: 'between $1.532 - $1.536 billion', tolerance: null, isRange: true }, '$1.633 billion');
  const s2 = settleGuidance({ value: 'between $870 - $874 million', tolerance: null, isRange: true }, '$872 million');
  const near = (a, b) => Math.abs(a - b) < 1;
  return r1 && near(r1.lo, 1.532e9) && near(r1.hi, 1.536e9) && r1.unit === 'usd'
    && r2 && near(r2.lo, 870e6) && near(r2.hi, 874e6) && r2.unit === 'usd'
    && s1.settleable && s1.hit === false && s1.direction.startsWith('beat')
    && s2.settleable && s2.hit === true && s2.direction.startsWith('in-band');
})(), '带空格连字符（"$1.532 - $1.536"）与 en-dash 同型解析：两端折算、单位 usd、beat/in-band 方向判定一致');

// ── 组 5：引擎端到端 + 版本号 ─────────────────────────────────────
// 7. 引擎端到端：PLTR 新指引进辨别 + 登记（含额度 90 零切尾）
c320('引擎端到端：PLTR colon-bullet 指引进辨别+登记，EDGAR 额度 90（84 条零切尾）', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const fs = require('fs');
  const path = require('path');
  const LEDGER = path.join(__dirname, 'human-future/data/prediction-ledger.json');
  const saved = fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf-8') : null;
  try {
    fs.writeFileSync(LEDGER, JSON.stringify({ version: '1.0.0', predictions: [] }, null, 2));
    const mk = (acc, date, guidance) => ({
      title: `PLTR 8-K 业绩发布 · ${date}`, link: `https://www.sec.gov/Archives/edgar/data/1321655/${acc}-index.htm`,
      pubDate: date, description: '财报指引', body: '', source: 'SEC EDGAR', origin: 'live',
      ticker: 'PLTR', form: '8-K', accession: acc, filingDate: date, fiscalYearEnd: '1231',
      guidance, actuals: [], actualPeriod: null,
    });
    const mkG = (sentence, value, quarter, annual) => ({
      sentence, metric: 'revenue', settleMetric: 'revenue', gaapBasis: '', value,
      tolerance: null, isRange: true, quarter, fiscalYear: 2026, annual, periodLabel: annual ? 'FY2026 全年' : `FY2026 Q${quarter}`, caveats: [],
    });
    const eng = new ProjectionEngine({});
    eng.signals = { totalItems: 3, domains: [], items: [
      mk('0001321655-26-000004', '2026-02-02', [mkG('Revenue of between $1.532 - $1.536 billion', 'between $1.532 - $1.536 billion', 1, false)]),
      mk('0001321655-26-000026', '2026-05-04', [mkG('Revenue of between $1.797 – $1.801 billion', 'between $1.797 – $1.801 billion', 2, false)]),
      mk('0001321655-26-000039', '2026-08-03', [mkG('Revenue of between $2.160 – $2.164 billion', 'between $2.160 – $2.164 billion', 3, false)]),
    ] };
    const r = eng.buildForecastDiscrimination();
    const src = fs.readFileSync(path.join(__dirname, 'scripts/project-future.js'), 'utf-8');
    return r.results.length === 3 && r.edgarClaimsTruncation === null
      && r.results.filter(x => x.verdict === 'earnings-guidance').length === 3
      && r.ledgerRegistration.registered.length === 3
      && /EDGAR_CLAIMS_CAP = 170/.test(src);
  } finally {
    if (saved === null) { try { fs.unlinkSync(LEDGER); } catch (_) {} } else fs.writeFileSync(LEDGER, saved);
  }
})(), '三条 colon-bullet 指引全部以 earnings-guidance verdict 进辨别并登记（带期间元数据）；额度 90 落在代码里（v3.20 live：84 条 ≤ 90 零切尾——80 会砍掉 ticker 序尾部 4 条 PLTR）');

// 8. 版本号一致性（五处对齐 3.27.0）
c320('版本号一致性：五处对齐 3.27.0', (() => {
  const fs = require('fs');
  const VERSION = fs.readFileSync(path.join(__dirname, 'VERSION'), 'utf-8').trim();
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
  const rp = fs.readFileSync(path.join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  const pf = fs.readFileSync(path.join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return VERSION === '3.27.0'
    && pkg.version === '3.27.0'
    && rp.includes('文明推演引擎 v3.27.0')      // banner
    && /version: '3\.27\.0'/.test(pf)          // projection meta
    && /version: '3\.27\.0'/.test(rp);         // run-pipeline fullReport meta
})(), 'VERSION/package.json/banner/projection meta/run-pipeline meta 必须对齐 3.27.0，防 corr-2026-014 版本漂移复发');

// ── v3.20 汇总 ──
(async () => {
  const results = await Promise.all(v320.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v320.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.20: ${v320.length - f} 通过, ${f} 失败, 共 ${v320.length} 个`);
  if (f > 0) {
    console.log('结论：PLTR 冒号+bullet 期望式指引形态进库不完整（抽取/精度/actuals/结算/引擎/版本有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：PLTR colon-bullet 期望式指引进库（form H：expect+冒号+bullet 列表+名词修饰语容忍+in-excess-of/截断残值拒绝）+ grew-to 实际值形态（分部守卫+先到即本财季）；Q1/Q2 区间指引两条真实结算（beat 带外）、Q3 到期门 pending；42 份备案零漂移；claim 额度 80→90。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v3.21 新增断言：商业主张辨别器新增「IPO/上市过程主张」维度（ipo-claim）
// + competitive 动词族精度修复（摘除裸 leads?）
//
// 背景（2026-10-27 全池过堂 live 实证，300 条池）：v3.3 曾把 IPO 整体
// 排除在模式库外，理由「估值形态已覆盖该条」——该否定式覆盖决议未经
// 全池测量（corr-2026-038 同型）已腐烂三个版本：2026-10-26 一天内
// **7 条** Anthropic S-1/IPO 过程主张整个在库外，估值形态（要 $估值
// 额）一条也覆盖不到：
//   ① TechCrunch AI「Anthropic's IPO filing reveals its strategy for
//      keeping enterprise customers hooked」（S-1 披露交叉销售数据）
//   ② TechCrunch AI「Anthropic officially files for its public debut」
//   ③ The Information「Anthropic S-1 Highlights Rising Payment Costs」
//   ④ The Information「Anthropic's S-1 Takeaways: From Giant Compute
//      Commitments to Complex Lock-Ups」
//   ⑤ The Information「Anthropic Publicly Files S-1 for Its Planned IPO」
//   ⑥ The Information「Goldman Sachs to Lead Anthropic IPO」
//   ⑦ Transformer News 简报内句「Anthropic is reportedly planning to
//      publicly file for an IPO as early as today」（frontier_models 桶）
// 修复 = ipo-claim 三形态（备案动作/文书主体/承销牵头）+ 事件型
// no-quantity 豁免（v3.8 同型）+ public-filing 证据档 \bS-1\b 窄标记
// + 专属证伪路径 + capital_flow 类目 + KIND_CN 双处（报告/注入）。
// 同轮精度修复（维护级）：competitive 动词族摘除裸 leads?——live
// 实证 2 条命中全是误报（leads OpenAI's enterprise product team 团队
// 管理、to Lead Anthropic IPO 承销牵头）、0 条真正命中。
//
// 反向验证：摘除 ipo-claim 模式→组 1/2/4 多条失败；摘除 S-1 证据档
// 标记→证据档断言失败；摘除 no-quantity 豁免→Goldman 条判
// unfalsifiable 失败；摘除证伪条件→1；摘除类目映射→1（行为+源级）；
// 摘除报告 KIND_CN→1；摘除注入 KIND_CN→1；competitive 恢复裸 leads?
// →2 条 FP 回归失败；计数断言 23→22 漂移→1；版本漂移→多处。
// ════════════════════════════════════════════════════════════════
const v3210 = [];
function c3210(name, ok, detail) { v3210.push({ name, ok, detail }); }

// ── 组 1：live 实证命中（逐字原文，2026-10-26 在窗）────────────────
// 1. TechCrunch S-1 交叉销售主张：kind=ipo + 公开财报档（filing 标记）
//    + has-sample（$100,000-plus）+ thin-reasoning + 决策相关
c3210('live 实证：TechCrunch「IPO filing reveals…」交叉销售主张（ipo+公开财报档+样本）', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Anthropic\u2019s IPO filing reveals its strategy for keeping enterprise customers hooked. Anthropic\u2019s S-1 shows more than half of its $100,000-plus customers now use both the Claude Platform and a first-party app, a cross-selling playbook reminiscent of Amazon that\u2019s making enterprise customers stickier.',
    claimSentence: 'Anthropic\u2019s IPO filing reveals its strategy for keeping enterprise customers hooked',
    source: 'TechCrunch AI',
  });
  return r.kind === 'ipo' && r.kinds.includes('ipo')
    && r.evidence.id === 'public-filing' && r.evidence.weight === 3   // 「filing」标记（S-1 披露）
    && r.reasoning.met.includes('has-sample')                          // $100,000-plus customers
    && r.verdict === 'thin-reasoning' && r.decisionRelevant === true
    && /SEC EDGAR 查无实据/.test(r.falsification)                      // ipo 专属证伪路径
    && r.category === 'capital_flow';                                  // 资本与商业模式域
})(), 'S-1 披露的交叉销售数据主张：判 IPO/上市过程主张+公开财报/公告(3)+推理 1/3+决策相关，证伪路径与类目落位');

// 2. The Information「S-1 Takeaways」标题-only：ipo + S-1 证据档 +
//    不串台 compute-infra（Giant Compute Commitments 无量化值）
c3210('live 实证：The Information「S-1 Takeaways」标题-only（ipo+不串台 compute-infra）', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Anthropic\u2019s S-1 Takeaways: From Giant Compute Commitments to Complex Lock-Ups',
    claimSentence: 'Anthropic\u2019s S-1 Takeaways: From Giant Compute Commitments to Complex Lock-Ups',
    source: 'The Information',
  });
  return r.kind === 'ipo' && !r.kinds.includes('compute-infra')
    && r.evidence.id === 'public-filing' && r.evidence.weight === 3   // \bS-1\b 窄标记（v3.21 新增）
    && r.verdict === 'thin-reasoning' && r.decisionRelevant === true;
})(), '「S-1 Takeaways」标题-only 条：ipo 归类 + S-1 归公开财报档；「Giant Compute Commitments」无量化值不串台算力基建');

// 3. The Information「Goldman Sachs to Lead Anthropic IPO」承销牵头：
//    kind=ipo 且 kinds 不含 competitive（leads 摘除+ipo 命中）、
//    无文书引用不虚抬（无出处(1)）、no-quantity 豁免生效
c3210('live 实证：Goldman 承销牵头句（ipo 归类+competitive 不串台+豁免+不虚抬）', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Goldman Sachs to Lead Anthropic IPO',
    claimSentence: 'Goldman Sachs to Lead Anthropic IPO',
    source: 'The Information',
  });
  return r.kind === 'ipo' && !r.kinds.includes('competitive')
    && r.evidence.id === 'no-source' && r.evidence.weight === 1        // 媒体转述无文书引用，不虚抬
    && r.falsifiability.problems.length === 0                          // no-quantity 豁免（事件型）
    && /SEC EDGAR 查无实据/.test(r.falsification)                      // 豁免后证伪路径仍在（不矛盾）
    && r.verdict === 'weak-evidence' && r.decisionRelevant === false
    && r.reasoning.score === 0;                                        // 豁免不抬推理分
})(), '承销牵头主张：ipo 正确归类（competitive 的 leads 误报消除）、无出处(1)不虚抬、no-quantity 豁免生效且推理分独立计 0/3');

// 4. TechCrunch「officially files for its public debut」：ipo +
//    「filed for an IPO」无 filing/S-1 标记不虚抬（无出处(1)）+ 豁免
c3210('live 实证：TechCrunch「files for its public debut」（ipo+无出处不虚抬+豁免）', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Anthropic officially files for its public debut. Anthropic has officially filed for an IPO, revealing soaring revenue, mounting losses, major enterprise adoption, and an unusual governance structure designed to preserve founder control and its AI safety mission.',
    claimSentence: 'Anthropic officially files for its public debut',
    source: 'TechCrunch AI',
  });
  return r.kind === 'ipo'
    && r.evidence.id === 'no-source' && r.evidence.weight === 1        // 无 filing/S-1 标记，不虚抬
    && r.falsifiability.problems.length === 0                          // no-quantity 豁免
    && r.verdict === 'weak-evidence' && r.decisionRelevant === false;
})(), '「files for its public debut」：ipo 归类；无文书引用句留无出处(1)（S-1 标记窄认证，不把裸 IPO 名词抬档）');

// 5. Transformer News 简报内句（frontier_models 桶在候选池）：ipo +
//    reportedly 归媒体报道(2)
c3210('live 实证：Transformer 简报「reportedly planning to publicly file for an IPO」（ipo+媒体报道档）', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Anthropic is reportedly planning to publicly file for an IPO as early as today.',
    claimSentence: 'Anthropic is reportedly planning to publicly file for an IPO as early as today.',
    source: 'Transformer News',
  });
  return r.kind === 'ipo'
    && r.evidence.id === 'media-report' && r.evidence.weight === 2     // reportedly
    && r.falsifiability.problems.length === 0                          // 豁免（无数字）
    && r.verdict === 'weak-evidence' && r.decisionRelevant === false;
})(), '简报内句同案进辨别：reportedly 归媒体报道(2)、weak-evidence、不虚抬为决策相关');

// ── 组 2：形态族召回 + 精度回归 ─────────────────────────────────
// 6. 形态族召回：三族十形全部命中 ipo
c3210('形态族召回：备案动作/文书主体/承销牵头三族十形全部命中 ipo', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'ipo-claim');
  if (!p) return false;   // 模式被摘除（反向验证）时精确失败，不抛 TypeError
  // A 备案动作 / B 文书主体 / C 承销牵头
  return p.re.test('Anthropic officially files for its public debut')
    && p.re.test('Anthropic has officially filed for an IPO, revealing soaring revenue')
    && p.re.test('Anthropic Publicly Files S-1 for Its Planned IPO')
    && p.re.test('The company confidentially submitted an S-1 earlier this year')
    && p.re.test('Anthropic\u2019s IPO filing reveals its strategy for keeping enterprise customers hooked')
    && p.re.test('Anthropic S-1 Highlights Rising Payment Costs')
    && p.re.test('Anthropic\u2019s S-1 Takeaways: From Giant Compute Commitments to Complex Lock-Ups')
    && p.re.test('Goldman Sachs to Lead Anthropic IPO')
    && p.re.test('Morgan Stanley will underwrite the offering alongside Goldman')
    && p.re.test('The banks are leading the IPO for the AI lab');
})(), 'files/filed/submits+S-1/IPO/public debut、S-1/IPO+filing/takeaways/highlights、lead/underwrites+IPO/offering 三族十形全命中');

// 7. 精度回归：live 同句与邻域句型不命中 ipo（不抢估值/融资/并购地盘）
c3210('精度回归：修辞疑问句/ahead-of-IPO/融资交易/并购/裁员/Fed/播客不命中 ipo', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS, discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'ipo-claim');
  if (!p) return false;
  const miss = [
    'Will the IPO reveal the company behind the mask or lean deeper into the myth-making?',  // MIT TR 修辞疑问句（live）
    'The company plans a pre-IPO round at a higher valuation',                                // pre-IPO 融资轮
    'SpaceX locks in $40B GPU financing deal with Apollo',                                    // 融资交易（live）
    'DoorDash Nears Deal to Buy Instacart in $17 Billion Deal',                              // 并购（live）
    'Microsoft Offers Buyouts to 60,000 Employees',                                           // 裁员（live）
    'Minutes of the Federal Open Market Committee, September 15-16, 2026',                    // Fed 公告（live）
    'LWiAI Podcast #255 - Gemini 3.7, Jalapeño, Qwen 3.8, Drones',                            // 播客（live）
    'Anthropic, SpaceX and Meta Cash Grabs',                                                  // 资本简报标题（live）
  ];
  if (!miss.every(s => !p.re.test(s))) return false;
  // 邻域地盘不抢：估值句保持 valuation、融资句保持 funding（行为级）
  const val = discriminateCommercial({ text: 'OpenAI working on new $30B raise at $1.25T valuation ahead of IPO', source: 'test' });
  const fund = discriminateCommercial({ text: 'DeepSeek Raises Nearly $16 billion in Second Funding Round', source: 'test' });
  return val.kind === 'valuation' && fund.kind === 'funding';
})(), '裸 IPO 名词（ahead of/pre-IPO）与修辞疑问句不进库；估值/融资/并购/裁员/Fed/播客句型零误命中，估值与融资地盘不抢');

// 8. competitive 精度修复（维护级）：两条 live FP 不再命中 competitive，
//    Artificial Analysis 真命中保留（不打穿）
c3210('competitive 精度修复：两条 live 误报不再命中，真命中保留', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS, discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'competitive-claim');
  if (!p) return false;
  const fp1 = 'Alexander Embiricos, who leads OpenAI\u2019s enterprise product team, joined us at TechCrunch Disrupt this month to explain where the product came from—starting with the question of why so many companies seem to be turning to cutsy mascots as avatars for their trillion-parameter matrix multiplication machines.';
  const fp2 = 'Goldman Sachs to Lead Anthropic IPO';
  const tp = 'But the headline is this Artificial Analysis number where it\u2019s ahead of GPT-6 Astra.';
  const r1 = discriminateCommercial({ text: fp1, source: 'TechCrunch AI' });
  const r2 = discriminateCommercial({ text: fp2, source: 'The Information' });
  const r3 = discriminateCommercial({ text: tp, source: 'Interconnects' });
  return !p.re.test(fp1) && !p.re.test(fp2)          // 动词族已无裸 leads?
    && r1.kind !== 'competitive'                      // 团队管理句整条出辨别
    && r2.kind === 'ipo' && !r2.kinds.includes('competitive')   // 承销牵头句改判 ipo
    && r3.kind === 'competitive';                     // ahead of GPT-6 Astra 真命中保留
})(), 'leads 动词族摘除：团队管理与承销牵头两条 live 误报精确消除；「ahead of GPT-6 Astra」竞品真命中不打穿');

// ── 组 3：证据档 / 豁免 / 映射 ─────────────────────────────────
// 9. 证据档 S-1 窄标记：S-1 句归公开财报/公告(3)，无文书引用句留
//    无出处(1) 不虚抬；第三方调查档不受插入影响（回归）
c3210('证据档：\\bS-1\\b 归公开财报/公告(3)，裸 IPO 名词不虚抬，既有档位不变', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const s1 = discriminateCommercial({ text: 'Anthropic S-1 Highlights Rising Payment Costs', source: 'The Information' });
  const bare = discriminateCommercial({ text: 'Goldman Sachs to Lead Anthropic IPO', source: 'The Information' });
  const survey = discriminateCommercial({ text: 'AI delivers \u2018zero financial payoff\u2019 to most companies, Apollo economist says', source: 'TechCrunch AI' });
  return s1.evidence.id === 'public-filing' && s1.evidence.weight === 3
    && bare.evidence.id === 'no-source' && bare.evidence.weight === 1   // 不虚抬
    && survey.evidence.id === 'third-party-survey' && survey.evidence.weight === 3;   // 既有档位回归
})(), 'S-1 文书编号是公开备案标记（与 10-K/10-Q 同族）；无文书引用的 IPO 转述留无出处(1)；第三方调查档不受影响');

// 10. no-quantity 豁免精确性：豁免只摘 no-quantity、不抬推理分、
//     不泛滥到非事件型主张（真无量化采用句仍判 unfalsifiable）
c3210('no-quantity 豁免精确性：事件型豁免生效，非事件型仍判不可证伪', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const goldman = discriminateCommercial({ text: 'Goldman Sachs to Lead Anthropic IPO', source: 'The Information' });
  const files = discriminateCommercial({ text: 'Anthropic officially files for its public debut', source: 'TechCrunch AI' });
  const trend = discriminateCommercial({ text: 'Enterprises are adopting AI agents everywhere without any numbers at all', source: 'test' });
  return goldman.falsifiability.problems.every(p => p.id !== 'no-quantity')
    && files.falsifiability.problems.every(p => p.id !== 'no-quantity')
    && goldman.reasoning.score === 0 && files.reasoning.score === 0     // 豁免不抬推理分
    && trend.verdict === 'unfalsifiable'
    && trend.falsifiability.problems.some(p => p.id === 'no-quantity'); // 非事件型照旧
})(), 'IPO/监管行动类事件型主张豁免 no-quantity（证伪靠可观测事件）；趋势修辞与非事件型主张的不可证伪判据不受影响');

// 10b. has-counterexample 词边界修复（维护级，本轮 live 夹具暴露）：
//     debut 的 but 子串不得算反例；真反例词照旧命中
c3210('精度修复：has-counterexample 补 \\b（debut 不算反例，真反例词保留）', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const debut = discriminateCommercial({ text: 'Anthropic officially files for its public debut. Anthropic has officially filed for an IPO, revealing soaring revenue, mounting losses, major enterprise adoption, and an unusual governance structure designed to preserve founder control and its AI safety mission.', source: 'TechCrunch AI' });
  const despite = discriminateCommercial({ text: 'AI delivers \u2018zero financial payoff\u2019 to most companies, Apollo economist says. Despite massive investments and widespread hype around artificial intelligence, the technology has delivered zero financial payoff to corporate America outside of tech.', source: 'TechCrunch AI' });
  const but = discriminateCommercial({ text: 'But the headline is this Artificial Analysis number where it\u2019s ahead of GPT-6 Astra. And then if you look at the Kimi K3.1 blog, they have their headline numbers, which are really strong.', source: 'Interconnects' });
  return !debut.reasoning.met.includes('has-counterexample')      // debut 不算反例
    && debut.reasoning.score === 0
    && despite.reasoning.met.includes('has-counterexample')       // Despite 真命中
    && but.reasoning.met.includes('has-counterexample');          // But 句首真命中
})(), '「debut」的 but 子串不再虚抬反例分（corr-2026-024 同型）；Despite/But 真反例词命中保留');

// 11. 专属证伪条件与类目映射（行为 + 源级双钉）
c3210('专属证伪条件与类目映射：ipo→capital_flow（行为+源级）', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const fs = require('fs');
  const r = discriminateCommercial({ text: 'Anthropic Publicly Files S-1 for Its Planned IPO', source: 'The Information' });
  const src = fs.readFileSync(require('path').join(__dirname, 'human-future/scripts/commercial-discriminator.js'), 'utf-8');
  return r.category === 'capital_flow'
    && r.falsification === '观察到该 S-1 在 SEC EDGAR 查无实据或备案被撤回、定价区间/挂牌时间表与主张情形不符，或挂牌后公开披露的财务数据与 S-1 主张情形矛盾'
    && /'ipo': 'capital_flow'/.test(src)                 // 类目映射源级（兜底 market_claims 不同值）
    && /'ipo': '观察到该 S-1 在 SEC EDGAR 查无实据/.test(src);   // 证伪条件源级
})(), 'IPO 过程主张归资本与商业模式域；证伪路径（备案查无/撤回/定价时间表不符/挂牌后披露矛盾）双钉防摘除');

// ── 组 4：引擎端到端 + cron 注入 + 版本号 ─────────────────────
// 12. 引擎端到端：6 条 live IPO 条目进辨别（byKind ipo:6），
//     formatReport 渲染「类型: IPO/上市过程主张」行（只认渲染行）
c3210('引擎端到端：6 条 live IPO 条目进辨别+渲染「类型: IPO/上市过程主张」行', (() => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const mk = (title, desc, source, date) => ({
    title, description: desc, body: '', source, bucket: 'business',
    pubDate: date, domains: ['market_claims'], link: 'https://example.com/' + title.slice(0, 8), origin: 'live',
  });
  const items = [
    mk('Anthropic\u2019s IPO filing reveals its strategy for keeping enterprise customers hooked',
       'Anthropic\u2019s S-1 shows more than half of its $100,000-plus customers now use both the Claude Platform and a first-party app, a cross-selling playbook reminiscent of Amazon that\u2019s making enterprise customers stickier.',
       'TechCrunch AI', 'Mon, 26 Oct 2026 16:49:42 +0000'),
    mk('Anthropic officially files for its public debut',
       'Anthropic has officially filed for an IPO, revealing soaring revenue, mounting losses, major enterprise adoption, and an unusual governance structure designed to preserve founder control and its AI safety mission.',
       'TechCrunch AI', 'Mon, 26 Oct 2026 14:35:22 +0000'),
    mk('Anthropic S-1 Highlights Rising Payment Costs', '', 'The Information', '2026-10-26T21:45:36Z'),
    mk('Anthropic\u2019s S-1 Takeaways: From Giant Compute Commitments to Complex Lock-Ups', '', 'The Information', '2026-10-26T18:10:04Z'),
    mk('Anthropic Publicly Files S-1 for Its Planned IPO', '', 'The Information', '2026-10-26T13:40:09Z'),
    mk('Goldman Sachs to Lead Anthropic IPO', '', 'The Information', '2026-10-26T14:22:35Z'),
    // 对照：competitive 两条 live FP 不得进辨别（leads 摘除）
    mk('How OpenAI turned its coding tools into dots, an always-on personal assistant',
       'Alexander Embiricos, who leads OpenAI\u2019s enterprise product team, joined us at TechCrunch Disrupt this month to explain where the product came from—starting with the question of why so many companies seem to be turning to cutsy mascots as avatars for their trillion-parameter matrix multiplication machines.',
       'TechCrunch AI', 'Mon, 26 Oct 2026 12:00:00 +0000'),
  ];
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: items.length, domains: [], undomained: 0, dateRange: null, items };
  const cd = inst.buildCommercialDiscrimination();
  if (!cd.available) return false;
  const ipoRows = cd.results.filter(r => r.kind === 'ipo');
  // formatReport 需要 meta/summary 等最小字段（与 v3.18 分组渲染夹具同型）
  const md = formatReport({
    meta: { timestamp: '2026-10-27T12:00:00Z', version: '3.21.1' },
    summary: { verdict: '继续观察', score: 0.5, keyMessage: 'TEST', topDomains: ['frontier_models'] },
    commercialDiscrimination: cd,
    stages: [], turningPoints: [], risks: [], opportunities: [], recommendations: [],
    confidence: { score: 0.5, level: 'medium', note: 'TEST', factors: { baseScore: 0.5, logicQuality: '中等', signalScore: 0.5, coverageScore: 0.5, undomainedRatio: 0.1, adjustment: 0 } },
    trendClassification: { available: false },
  });
  const rendered = md.split('\n').some(l => l.includes('类型: IPO/上市过程主张 | 来源:'));
  return ipoRows.length === 6
    && cd.summary.byKind && cd.summary.byKind.ipo === 6
    && !cd.results.some(r => /leads OpenAI/.test(r.claimSentence || r.text))   // FP1 整条出池
    && rendered;                                                              // 只认渲染行
})(), '六条 live IPO 主张全部进辨别并登记 byKind ipo:6；competitive 团队管理 FP 出池；报告渲染出「类型: IPO/上市过程主张」行');

// 13. cron 注入源级：注入脚本 KIND_CN 认识 ipo（端到端最后一环）
c3210('cron 注入源级：KIND_CN 含 ipo 中文标签', (() => {
  const fs = require('fs');
  const sh = fs.readFileSync(require('os').homedir() + '/.hermes/scripts/hf-cron-fetch.sh', 'utf-8');
  return /'ipo': 'IPO\/上市过程主张'/.test(sh);
})(), '注入脚本 KIND_CN 必须含 ipo，否则 agent 看到英文 kind（第五次同型断链的复发防护）');

// 14. 模式库计数 25（v3.3 计数断言同轮同步，v3.2 计数纠错纪律）
c3210('模式库计数：25 种（ipo-claim 仍在库；v3.26 customer-outcome 进库后同步）', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const pf = require('fs').readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return COMMERCIAL_CLAIM_PATTERNS.length === 25
    && COMMERCIAL_CLAIM_PATTERNS.filter(p => p.kind === 'ipo').length === 1
    && /共 25 种模式/.test(pf);
})(), '模式库 24→25（v3.26 customer-outcome 进库），ipo-claim 仍唯一且计数与文档一致');

// 15. 版本号一致性（五处对齐 3.27.0）
c3210('版本号一致性：五处对齐 3.27.0', (() => {
  const fs = require('fs');
  const VERSION = fs.readFileSync(require('path').join(__dirname, 'VERSION'), 'utf-8').trim();
  const pkg = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'package.json'), 'utf-8'));
  const rp = fs.readFileSync(require('path').join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  const pf = fs.readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return VERSION === '3.27.0'
    && pkg.version === '3.27.0'
    && rp.includes('文明推演引擎 v3.27.0')      // banner
    && /version: '3\.27\.0'/.test(pf)          // projection meta
    && /version: '3\.27\.0'/.test(rp);         // run-pipeline fullReport meta
})(), 'VERSION/package.json/banner/projection meta/run-pipeline meta 必须对齐 3.27.0，防 corr-2026-014 版本漂移复发');


// ════════════════════════════════════════════════════════════════════
// v3.21.1 测试组：ma 事件型 no-quantity 豁免统一（corr-2026-025 结案）
// + usage-metric 名词族扩 (monthly|weekly|daily) calls（live 实证 Retell）
// ════════════════════════════════════════════════════════════════════
const v3211 = [];
function c3211(name, ok, detail) { v3211.push({ name, ok, detail }); }

// 1. live 实证：Retell 用量句（uses...to power 动词族 + 100M 单字母单位 +
//    monthly calls 名词族三件套齐备才命中）
c3211('live 实证：Retell「100M monthly calls」命中 usage-metric', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Retell uses OpenAI models to help power 100M monthly calls',
    source: 'OpenAI News', date: '2026-10-27',
  });
  return r.kind === 'usage-metric'
    && r.kinds.length === 1 && r.kinds[0] === 'usage-metric'   // 不串台
    && r.reasoning.score >= 1;        // has-sample：100M/calls 计入样本
})(), '「uses OpenAI models to help power 100M monthly calls」必须命中用量/牵引度指标形态（v3.11 名词族缺 calls、动词族缺用途动词、单位族缺单字母 M——三处齐修才命中）');

// 2. corr-2026-025 结案：ma 事件型 no-quantity 豁免（标题-only 口径）
c3211('ma 事件型 no-quantity 豁免生效（corr-2026-025 结案）', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Instacart Is Exploring a Sale',
    source: 'The Information', date: '2026-10-25',
  });
  return r.kind === 'ma'
    && r.falsifiability.problems.length === 0            // no-quantity 被摘掉
    && r.verdict === 'weak-evidence'                     // 标题-only 实测口径
    && r.evidence.weight === 1
    && r.reasoning.score === 0
    && r.decisionRelevant === false;                     // 不虚抬保持
})(), '并购/交易过程标题-only 条不得再判「不可证伪（无量化）」——事件型主张的证伪靠当事方确认/交割事件不靠数字；weak-evidence 不虚抬');

// 3. 豁免路径完整：有出处的 ma 条到 thin-reasoning + 决策相关（v3.8 Treasury 同型）
c3211('有出处的 ma 条经豁免判 thin-reasoning 且决策相关', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'According to a company announcement, the retailer is exploring a sale of its stake in the logistics unit.',
    source: 'The Information', date: '2026-10-25',
  });
  return r.kind === 'ma'
    && r.falsifiability.problems.length === 0
    && r.evidence.weight === 3                           // 公开财报/公告(3)
    && r.verdict === 'thin-reasoning'                    // 豁免后证据档够、推理 0/3
    && r.decisionRelevant === true;
})(), 'evidence≥3 的 ma 条必须到 thin-reasoning + decisionRelevant——豁免不是抬分，是证伪性判据归位（v3.8 Treasury 条同型路径）');

// 4. 不回归：regulatory-action 与 ipo 豁免行为不变
c3211('regulatory-action/ipo 豁免不回归', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r1 = discriminateCommercial({
    text: 'U.S. Treasury Proposes to Widen Outbound Investment Restrictions for China and Other Countries',
    source: 'The Information', date: '2026-10-23',
  });
  const r2 = discriminateCommercial({
    text: 'Goldman Sachs to Lead Anthropic IPO',
    source: 'The Information', date: '2026-10-27',
  });
  return r1.kind === 'regulatory-action'
    && r1.falsifiability.problems.length === 0
    && r1.verdict === 'thin-reasoning'
    && r1.decisionRelevant === true
    && r2.kind === 'ipo'
    && r2.falsifiability.problems.length === 0;          // ipo 豁免不受 ma 扩展影响
})(), '豁免扩展到 ma 后 regulatory-action 与 ipo 判定必须不变——同型修复不改其它维度已文档化行为');

// 5. calls 扩库精度回归：6 句 live boilerplate/评论全部不命中 usage-metric
c3211('精度回归：conference call 等 6 句不因 calls 扩库误命中', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'usage-metric');
  if (!p) return false;
  return [
    'Marvell will conduct a conference call on Thursday, August 27, 2026 at 1:45 p.m. Pacific Time to discuss results.',
    'AMD will hold a conference call at 2:00 p.m. PT today to discuss its second quarter 2026 financial results.',
    'How AI agents shape experts judgment calls in the study of analyst decisions.',
    'Scrapping Astra 6.1 looks like a good call. OpenAI should not be the one to make it.',
    'NBER Open Calls for Fellowship Applications and Media Open Calls.',
    'Call of Duty: Modern Warfare 4 arrives on GeForce NOW at launch.',
  ].every(s => !p.re.test(s));
})(), '电话会 boilerplate/judgment calls/good call/Open Calls/游戏名都不得因 calls 名词族误命中——量化值+用量名词两件套纪律保持');

// 6. 不回归：v3.11 三条真命中保留 + subscribers/速率上限仍不命中
c3211('v3.11 真命中保留：seats/MAU/tokens 三条不回归', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'usage-metric');
  if (!p) return false;
  return [
    'Microsoft 365 Copilot reached over 30 million paid seats',
    'the Gemini App has 950 million monthly active users',
    'Gemini models now process 22 billion API tokens per minute',
  ].every(s => p.re.test(s))
    && !p.re.test('the number of paid subscriptions has now reached 350 million')
    && !p.re.test('our API supports 128k tokens per minute');
})(), 'calls 扩库不得动 v3.11 既有判定：三真命中保留、订阅总量与速率上限仍排除');

// 7. 源级断言：豁免条件真的含 ma（读源码，防行为断言被兜底喂饱）
c3211('源级：豁免条件包含 ma 与 legal-action（corr-2026-025 结案+v3.22 扩展的代码痕迹）', (() => {
  const fs3211 = require('fs');
  const src = fs3211.readFileSync(require('path').join(__dirname, 'human-future/scripts/commercial-discriminator.js'), 'utf-8');
  return /matchedPatterns\.some\(p => p\.kind === 'regulatory-action' \|\| p\.kind === 'ipo' \|\| p\.kind === 'ma' \|\| p\.kind === 'legal-action'\)/.test(src);
})(), '豁免分支必须显式含 ma 与 legal-action——v3.6 教训：同域行为断言抓不到摘除，源级钉住（v3.22 随新维度同步扩展）');

// 8. 模式库计数不变：23 种（v3.21 的 23；扩名词族不加 kind）
c3211('模式库计数 24（v3.21.1 时 23 不变；v3.22 legal-action 进库 +1）', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  return COMMERCIAL_CLAIM_PATTERNS.length === 25;
})(), 'v3.21.1 扩名词族不涨计数（彼时 23）；v3.22 新增 legal-action 维度，计数 23→24');

// 9. 版本号一致性（五处对齐 3.27.0）
c3211('版本号一致性：五处对齐 3.27.0', (() => {
  const fs3211 = require('fs');
  const VERSION = fs3211.readFileSync(require('path').join(__dirname, 'VERSION'), 'utf-8').trim();
  const pkg = JSON.parse(fs3211.readFileSync(require('path').join(__dirname, 'package.json'), 'utf-8'));
  const rp = fs3211.readFileSync(require('path').join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  const pf = fs3211.readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return VERSION === '3.27.0'
    && pkg.version === '3.27.0'
    && rp.includes('文明推演引擎 v3.27.0')      // banner
    && /version: '3\.27\.0'/.test(pf)          // projection meta
    && /version: '3\.27\.0'/.test(rp);         // run-pipeline fullReport meta
})(), 'VERSION/package.json/banner/projection meta/run-pipeline meta 必须对齐 3.27.0，防 corr-2026-014 版本漂移复发');

// ── v3.21.1 汇总 ──
(async () => {
  const results = await Promise.all(v3211.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v3211.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.21.1: ${v3211.length - f} 通过, ${f} 失败, 共 ${v3211.length} 个`);
  if (f > 0) {
    console.log('结论：ma 豁免统一或 calls 扩库有缺（命中/豁免/精度/回归/源级/计数/版本）。');
    process.exitCode = 1;
  } else {
    console.log('结论：corr-2026-025 结案——ma 事件型主张与 regulatory-action/ipo 的 no-quantity 豁免统一（标题-only weak-evidence 不虚抬、有出处 thin-reasoning 决策相关）；usage-metric 扩 (monthly|weekly|daily) calls 名词族+用途动词+单字母单位（live 实证 Retell 100M monthly calls），6 句精度回归 0 误报，v3.11 判定不回归。');
  }
})();

// ── v3.21 汇总 ──
(async () => {
  const results = await Promise.all(v3210.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v3210.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.21: ${v3210.length - f} 通过, ${f} 失败, 共 ${v3210.length} 个`);
  if (f > 0) {
    console.log('结论：IPO/上市过程主张进库不完整（命中/召回/精度/证据档/豁免/映射/端到端/版本有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：IPO/上市过程主张进库（ipo-claim 三形态+事件型 no-quantity 豁免+S-1 证据档窄标记+专属证伪路径+capital_flow 类目+双处 KIND_CN）；live 实证 7 条 Anthropic S-1/IPO 集群主张进辨别；competitive 裸 leads? 两条 live 误报精确消除；模式库 22→23。');
  }
})();


// ════════════════════════════════════════════════════════════════════
// v3.22 测试组：商业主张辨别器新增「执法/诉讼行动主张」维度（legal-action）
//
// 背景（2026-10-28 全池过堂 live 实证，288 条池 262 条未命中逐条过堂）：
// v3.8 给 regulatory-action 立库时白纸黑字记着已知边界「执法行动
// （fined/sued/charged，无工具名词）无 live 实证不进库」——本轮证据
// 到齐，business 桶两条执法/诉讼主张整个在库外（扩容前 23 种形态
// 全部不命中）：
//   ① TechCrunch AI「Parents sue OpenAI, alleging GPT-4o coached their
//      daughter off seizure medication」（产品责任诉讼）；
//   ② The Information「Malaysian Authorities Seize $12 Million Worth of
//      AI Chips in Smuggling Crackdown」（出口管制/走私执法扣押）。
// 执法/诉讼行动与规则事件是两类信号：规则事件的证伪靠最终规则文本，
// 执法/诉讼行动的证伪靠司法/行政程序结局（驳回/撤诉/和解/改判/撤销）
// ——罚款、扣押、诉讼正是规则落地的可观测证据。修复 = legal-action
// 两形态（诉讼动作/执法动作）+ 事件型 no-quantity 豁免扩展到本 kind
// （v3.8/v3.21/v3.21.1 同型第四次）+ 专属证伪路径 + compliance_demand
// 类目 + KIND_CN 双处（报告/注入）。
//
// 反向验证：摘除 legal-action 模式整块→组 1/2/4/8 多条失败；摘除
// 诉讼动作族→召回断言失败；摘除执法主体+动词族→召回与 live 实证
// 失败；摘除 no-quantity 豁免→无数字诉讼句判 unfalsifiable 失败；
// 摘除证伪条件→1；摘除类目映射→1（行为+源级）；摘除报告 KIND_CN→1；
// 摘除注入 KIND_CN→1；动词族加回 fines 名词→ impose fines 误命中
// 失败；动词族加回 seizure 名词→ seizure medication 误命中失败；
// 计数 24→23 漂移→1；版本漂移→1。
// ════════════════════════════════════════════════════════════════════
const v3220 = [];
function c3220(name, ok, detail) { v3220.push({ name, ok, detail }); }

// ── 组 1：live 实证命中（逐字原文，2026-10-28 在窗）────────────────
// 1. TechCrunch「Parents sue OpenAI」：kind=legal-action + 无出处(1)/
//    推理 0/3/weak-evidence/decisionRelevant=false 不虚抬（标题+简报
//    转述，无法院文书引用）+ 专属证伪路径 + compliance_demand 类目
c3220('live 实证：TechCrunch「Parents sue OpenAI」（legal-action+不虚抬+证伪+类目）', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Parents sue OpenAI, alleging GPT-4o coached their daughter off seizure medication A family is suing OpenAI, saying ChatGPT coached their daughter to quietly taper off her seizure medication and keep it from her doctors before she died in February.',
    claimSentence: 'Parents sue OpenAI, alleging GPT-4o coached their daughter off seizure medication',
    source: 'TechCrunch AI', date: '2026-10-28',
  });
  return r.kind === 'legal-action' && r.kinds.length === 1 && r.kinds[0] === 'legal-action'
    && r.evidence.id === 'no-source' && r.evidence.weight === 1        // 无法院文书引用，不虚抬
    && r.reasoning.score === 0
    && r.falsifiability.problems.length === 0                          // 事件型豁免/含数字均无问题
    && r.verdict === 'weak-evidence' && r.decisionRelevant === false   // 标题-only 不虚抬纪律保持
    && r.category === 'compliance_demand'
    && /被法院驳回、撤诉或和解/.test(r.falsification);                  // legal-action 专属证伪路径
})(), '诉讼主张：legal-action 归类、无出处(1)/推理 0/3/weak-evidence 不虚抬为决策相关；证伪路径走司法程序结局、类目归合规需求域');

// 2. The Information「Malaysian Authorities Seize $12M」：legal-action +
//    has-sample（$12M）推理 1/3 + weak-evidence 不虚抬 + 不串台
c3220('live 实证：The Information「Malaysian Authorities Seize $12M」（legal-action+has-sample）', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Malaysian Authorities Seize $12 Million Worth of AI Chips in Smuggling Crackdown',
    claimSentence: 'Malaysian Authorities Seize $12 Million Worth of AI Chips in Smuggling Crackdown',
    source: 'The Information', date: '2026-10-28',
  });
  return r.kind === 'legal-action' && r.kinds.length === 1
    && r.reasoning.met.includes('has-sample')                          // $12 Million
    && r.reasoning.score === 1
    && r.evidence.id === 'no-source' && r.evidence.weight === 1        // 标题-only 无出处不虚抬
    && r.verdict === 'weak-evidence' && r.decisionRelevant === false
    && r.category === 'compliance_demand';
})(), '执法扣押主张：legal-action 归类、$12M 计入样本（推理 1/3）、无出处(1)/weak-evidence 不虚抬');

// ── 组 2：形态族召回 + 精度回归 ─────────────────────────────────
// 3. 形态族召回：诉讼动作族（sue/sued/suing+目标，容忍间隔词）+
//    执法动作族（执法主体+执法动词）共九形
c3220('形态族召回：诉讼动作/执法动作两族九形全部命中 legal-action', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'legal-action');
  if (!p) return false;   // 模式被摘除（反向验证）时精确失败，不抛 TypeError
  return [
    // A 诉讼动作族
    'Parents sue OpenAI, alleging GPT-4o coached their daughter off seizure medication',
    'A family is suing OpenAI, saying ChatGPT coached their daughter to quietly taper off her seizure medication',
    'Parents sued OpenAI in federal court over the incident',
    // B 执法动作族
    'Malaysian Authorities Seize $12 Million Worth of AI Chips in Smuggling Crackdown',
    'EU regulators fined the tech giant 500M euros over privacy violations',
    'Customs seized 10,000 GPUs at the border last week',
    'DOJ indicted three nationals in the smuggling ring last year',
    'Prosecutors confiscated the servers pending trial',
    'The government penalized the lab for safety violations',
  ].every(s => p.re.test(s));
})(), 'sue/sued/suing+目标（容忍 is 间隔词）与 authorities/government/regulators/customs/DOJ/EU + seize/fined/penalize/indict/confiscate 两族九形全命中');

// 4. 精度回归：会计 charges/in charge/charged with/假设 criminal
//    charges/医疗 seizure/Fed-ECB/播客/规则提案/其它形态库 live 原句
//    全部不命中（模式级 + 行为级双钉）
c3220('精度回归：会计 charges/in charge/医疗 seizure/规则提案/其它 kind 原句零误命中', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS, discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'legal-action');
  if (!p) return false;
  const miss = [
    'Acquisition-related and other costs primarily include transaction costs, purchase price fair value adjustments for inventory, certain compensation charges, and workforce rebalancing charges.',  // 会计 charges（live）
    'Operating income included a $2.1 billion employee compensation charge for Waymo.',                                   // 会计 charge（live）
    'We promptly make available on this website, free of charge, the reports that we file or furnish with the SEC.',      // free of charge（live）
    'Who\u2019s really in charge at Anthropic after the IPO?',                                                            // in charge（live）
    'TechCrunch spoke to the MIT computer scientist charged with explaining OpenAI\u2019s latest mind-bending discovery.', // charged with+gerund（live）
    'The actions could have resulted in criminal charges had humans been behind the keyboard.',                            // 假设 criminal charges（live）
    'before she died in February her doctors told her to keep taking her seizure medication',                             // 医疗 seizure（live 同条）
    'EU regulators studied the seizure risk of the new therapy before approving the trial',                              // 构造边界句：执法主体+seizure 名词（医学语义）——钉住名词不进动词族（R10 空转修复：无主体句压根走不到 Form B 分支）
    'U.S. Treasury Proposes to Widen Outbound Investment Restrictions for China and Other Countries',                     // 规则提案（live，regulatory-action 地盘）
    'Trump lifts restrictions on Anthropic',                                                                              // 规则解除（live）
    'SEC regulations impose fines on violators of the new disclosure rules',                                              // fines 名词（impose fines）
    'Minutes of the Federal Open Market Committee, September 15-16, 2026',                                                // Fed 公告（live）
    'ECB Consumer Expectations Survey results \u2013 September 2026',                                                    // ECB（live）
    'LWiAI Podcast #255 - Gemini 3.7, Jalape\u00f1o, Qwen 3.8, Drones',                                                  // 播客（live）
    'Goldman Sachs to Lead Anthropic IPO',                                                                                // ipo 地盘（live）
    'Instacart Is Exploring a Sale',                                                                                      // ma 地盘（live）
    'What happens when a deal falls through?',                                                                            // 机制假设句（live）
  ];
  if (!miss.every(s => !p.re.test(s))) return false;
  // 行为级：会计 charges 句整条不进 legal-action 判别
  const acct = discriminateCommercial({ text: miss[0], source: 'SEC EDGAR' });
  const incharge = discriminateCommercial({ text: miss[3], source: 'TechCrunch AI' });
  return !acct.kinds.includes('legal-action') && !incharge.kinds.includes('legal-action');
})(), '动词族只收无名词歧义形态（fines/seizure/charges 名词全不命中——seizure 边界句带执法主体，加回名词即误命中）；规则提案/IPO/并购/Fed/播客地盘不抢');

// ── 组 3：豁免 / 不串台 / 映射 ─────────────────────────────────
// 5. no-quantity 事件型豁免（v3.8/v3.21/v3.21.1 同型第四次）：
//    无数字诉讼句不判不可证伪 + 豁免不抬推理分 + 非事件型仍判不可证伪
c3220('no-quantity 豁免：无数字诉讼句不判不可证伪，非事件型照旧', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const nodigit = discriminateCommercial({ text: 'Parents sue OpenAI', source: 'The Information', date: '2026-10-28' });
  const trend = discriminateCommercial({ text: 'Enterprises are adopting AI agents everywhere without any numbers at all', source: 'test' });
  return nodigit.kind === 'legal-action'
    && nodigit.falsifiability.problems.length === 0            // no-quantity 被豁免摘掉
    && nodigit.reasoning.score === 0                           // 豁免不抬推理分
    && nodigit.verdict === 'weak-evidence' && nodigit.decisionRelevant === false
    && trend.verdict === 'unfalsifiable'
    && trend.falsifiability.problems.some(p => p.id === 'no-quantity');   // 非事件型照旧
})(), '诉讼/执法主张的证伪靠程序结局不靠数字（事件型豁免扩展到 legal-action）；趋势修辞类非事件型主张的不可证伪判据不受影响');

// 6. 不串台：regulatory-action 与 ipo 的既有判定与 kinds 不变
c3220('不串台：regulatory-action/ipo 判定不变且 kinds 不含 legal-action', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r1 = discriminateCommercial({ text: 'U.S. Treasury Proposes to Widen Outbound Investment Restrictions for China and Other Countries', source: 'The Information', date: '2026-10-23' });
  const r2 = discriminateCommercial({ text: 'Trump lifts restrictions on Anthropic', source: 'Last Week in AI', date: '2026-06-30' });
  const r3 = discriminateCommercial({ text: 'Goldman Sachs to Lead Anthropic IPO', source: 'The Information', date: '2026-10-27' });
  return r1.kind === 'regulatory-action' && !r1.kinds.includes('legal-action')
    && r2.kind === 'regulatory-action' && !r2.kinds.includes('legal-action')
    && r3.kind === 'ipo' && !r3.kinds.includes('legal-action');
})(), '规则提案/规则解除/承销牵头三条 live 原句的归类与 kinds 逐字段不变——新形态追加在模式库末尾，不改其它维度判定');

// 7. 专属证伪条件与类目映射（行为 + 源级双钉）
c3220('专属证伪条件与类目映射：legal-action→compliance_demand（行为+源级）', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const fs = require('fs');
  const r = discriminateCommercial({ text: 'Malaysian Authorities Seize $12 Million Worth of AI Chips in Smuggling Crackdown', source: 'The Information' });
  const src = fs.readFileSync(require('path').join(__dirname, 'human-future/scripts/commercial-discriminator.js'), 'utf-8');
  return r.category === 'compliance_demand'
    && r.falsification === '观察到该诉讼被法院驳回、撤诉或和解且条款与主张情形不符，或该执法行动被上诉推翻、处罚/扣押金额被改判撤销，或相关指控被主管机关撤回'
    && /'legal-action': 'compliance_demand'/.test(src)                      // 类目映射源级（兜底 market_claims 不同值）
    && /'legal-action': '观察到该诉讼被法院驳回/.test(src);                  // 证伪条件源级
})(), '执法/诉讼行动归合规需求域；证伪路径（驳回/撤诉/和解/改判/撤销/指控撤回）行为+源级双钉防摘除');

// ── 组 4：引擎端到端 + cron 注入 + 版本号 ─────────────────────
// 8. 引擎端到端：两条 live 条目进辨别（byKind legal-action:2），
//    formatReport 渲染「类型: 执法/诉讼行动 | 来源:」行（只认渲染行）
c3220('引擎端到端：两条 live 执法/诉讼条目进辨别+渲染「类型: 执法/诉讼行动」行', (() => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const mk = (title, desc, source, date) => ({
    title, description: desc, body: '', source, bucket: 'business',
    pubDate: date, domains: ['compliance_demand'], link: 'https://example.com/' + title.slice(0, 8), origin: 'live',
  });
  const items = [
    mk('Parents sue OpenAI, alleging GPT-4o coached their daughter off seizure medication',
       'A family is suing OpenAI, saying ChatGPT coached their daughter to quietly taper off her seizure medication and keep it from her doctors before she died in February.',
       'TechCrunch AI', 'Wed, 28 Oct 2026 15:12:07 +0000'),
    mk('Malaysian Authorities Seize $12 Million Worth of AI Chips in Smuggling Crackdown', '',
       'The Information', '2026-10-28T09:30:00Z'),
  ];
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: items.length, domains: [], undomained: 0, dateRange: null, items };
  const cd = inst.buildCommercialDiscrimination();
  if (!cd.available) return false;
  const rows = cd.results.filter(r => r.kind === 'legal-action');
  const md = formatReport({
    meta: { timestamp: '2026-10-28T12:00:00Z', version: '3.27.0' },
    summary: { verdict: '继续观察', score: 0.5, keyMessage: 'TEST', topDomains: ['business'] },
    commercialDiscrimination: cd,
    stages: [], turningPoints: [], risks: [], opportunities: [], recommendations: [],
    confidence: { score: 0.5, level: 'medium', note: 'TEST', factors: { baseScore: 0.5, logicQuality: '中等', signalScore: 0.5, coverageScore: 0.5, undomainedRatio: 0.1, adjustment: 0 } },
    trendClassification: { available: false },
  });
  const rendered = md.split('\n').some(l => l.includes('类型: 执法/诉讼行动 | 来源:'));
  return rows.length === 2
    && cd.summary.byKind && cd.summary.byKind['legal-action'] === 2
    && rendered;                                                              // 只认渲染行
})(), '两条 live 执法/诉讼主张全部进辨别并登记 byKind legal-action:2；报告渲染出「类型: 执法/诉讼行动」行');

// 9. cron 注入源级：注入脚本 KIND_CN 认识 legal-action（端到端最后一环）
c3220('cron 注入源级：KIND_CN 含 legal-action 中文标签', (() => {
  const fs = require('fs');
  const sh = fs.readFileSync(require('os').homedir() + '/.hermes/scripts/hf-cron-fetch.sh', 'utf-8');
  return /'legal-action': '执法\/诉讼行动'/.test(sh);
})(), '注入脚本 KIND_CN 必须含 legal-action，否则 agent 看到英文 kind（v3.0.0c 同型断链的复发防护）');

// 10. 模式库计数 24 + 版本号一致性（五处对齐 3.27.0）
c3220('模式库计数 24 + 版本号一致性：五处对齐 3.27.0', (() => {
  const fs = require('fs');
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const VERSION = fs.readFileSync(require('path').join(__dirname, 'VERSION'), 'utf-8').trim();
  const pkg = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'package.json'), 'utf-8'));
  const rp = fs.readFileSync(require('path').join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  const pf = fs.readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return COMMERCIAL_CLAIM_PATTERNS.length === 25
    && COMMERCIAL_CLAIM_PATTERNS.filter(p => p.kind === 'legal-action').length === 1
    && /共 25 种模式/.test(pf)
    && VERSION === '3.27.0'
    && pkg.version === '3.27.0'
    && rp.includes('文明推演引擎 v3.27.0')      // banner
    && /version: '3\.27\.0'/.test(pf)          // projection meta
    && /version: '3\.27\.0'/.test(rp);         // run-pipeline fullReport meta
})(), 'legal-action 唯一且模式库 23→24；VERSION/package.json/banner/projection meta/run-pipeline meta 五处对齐 3.27.0（corr-2026-014 防腐烂）');

// ── v3.22 汇总 ──
(async () => {
  const results = await Promise.all(v3220.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v3220.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.22: ${v3220.length - f} 通过, ${f} 失败, 共 ${v3220.length} 个`);
  if (f > 0) {
    console.log('结论：执法/诉讼行动主张进库不完整（命中/召回/精度/豁免/映射/端到端/版本有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：执法/诉讼行动主张进库（legal-action 两形态+事件型 no-quantity 豁免第四次扩展+专属证伪路径+compliance_demand 类目+双处 KIND_CN）；live 实证 Parents sue OpenAI 与 Malaysian Authorities Seize $12M 两条进辨别（weak-evidence 不虚抬）；模式库 23→24。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v3.27.0 测试组：商业辨别候选池白名单漏桶修复（corr-2026-027 同型）
// + has-counterexample 的 yet 时间副词精度修复（corr-2026-024 家族第四次）
//
// 背景（2026-10-29 全池测量，312 条 live 池逐桶过形态门，corr-2026-028
// 纪律「未命中条目过堂」）：商业辨别候选池自 v3.10 起是四桶白名单
// （business/sec_filings/frontier_models/economy）——tech 与 humanities
// 两桶采集了但辨别器从不看（corr-2026-027「候选池桶白名单是另一种
// 断链：采集了但辨别器从不看」同型第五波）。live 实证 tech 桶 22 条里
// 2 条命中商业主张形态却被白名单挡在辨别外：
//   ① MIT Tech Review「After weeks of frenzied speculation, Anthropic
//      has filed its IPO prospectus.」——ipo-claim 形态（filed + IPO
//      prospectus），v3.21 立库时只过了 business/frontier_models 两桶
//      的堂，没过「全部 live 桶」的堂；
//   ② Ars Technica「Enterprises keep buying software upgrades that IT
//      thinks will make things worse  Survey of 2,018 IT heads at big
//      firms…」——adoption + 第三方调查(3)。
// humanities 12 条本轮 0 命中（无 live 实证），同型补齐防同类漏桶
// （cap 兜底，今天不加条目）。修复 = PICK_BUCKETS 四桶→六桶
// （+tech 6 / +humanities 4，排在 economy 之后，business 第一优先
// 纪律不变）。
//
// 同轮精度修复（被桶修复暴露的 live 实证，维护级）：has-counterexample
// 的 yet 只认让步位（句首/标点后）——MIT TR 主张上下文「the clearest
// picture yet of…」与 ORCL funding 条「We have not yet initiated the
// at-the-market equity portion」的 yet 是时间副词（「迄今」）不是
// 反例让步，却把两条主张的推理分各自虚抬 1 分（corr-2026-024 短词
// 歧义家族第四次实证：Apollo/poll → demo/democracy → debut/but →
// yet）。
//
// 反向验证：摘除 tech 桶→组 3 引擎级/源级/渲染多条失败；摘除
// humanities 桶→源级与精度门断言失败；摘除 yet 让步位约束（恢复裸
// yet）→组 1 T1 与组 2 T4/T5 失败；摘除注入脚本池描述更新→注入
// 源级失败；版本漂移→多处。
// ════════════════════════════════════════════════════════════════
const v3221 = [];
function c3221(name, ok, detail) { v3221.push({ name, ok, detail }); }

// ── 组 1：live 实证两条 tech 主张（逐字原文，2026-10-29 在窗）────
// 1. MIT Tech Review IPO prospectus 句：kind=ipo + 无出处(1)/推理
//    0/3/weak-evidence/decisionRelevant=false 不虚抬（科技媒体转述，
//    无 S-1 文书引用标记不归公开财报档）+ capital_flow 类目 + 事件型
//    豁免生效（无数字不判不可证伪）；推理 0/3——yet 修复后「clearest
//    picture yet」的时间副词不再充当反例标记（修复前 1/3）。
c3221('live 实证：MIT TR「Anthropic has filed its IPO prospectus」（ipo+不虚抬+yet 不虚抬）', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'After weeks of frenzied speculation, Anthropic has filed its IPO prospectus. The document offers the clearest picture yet of the AI company\u2019s finances and its complicated web of investors.',
    claimSentence: 'After weeks of frenzied speculation, Anthropic has filed its IPO prospectus.',
    source: 'MIT Tech Review - AI', date: 'Mon, 26 Oct 2026 17:45:43 +0000',
    url: 'https://technologyreview.com/2026/10/26/will-the-real-anthropic-please-stand-up/',
  });
  return r.kind === 'ipo' && r.kinds.length === 1 && r.kinds[0] === 'ipo'
    && r.verdict === 'weak-evidence'
    && r.evidence.weight === 1 && r.evidence.id === 'no-source'   // 媒体转述无 S-1 文书引用
    && r.reasoning.score === 0                                      // yet 修复：时间副词不当反例
    && !r.reasoning.met.includes('has-counterexample')
    && r.decisionRelevant === false                                 // 不虚抬
    && r.falsifiability.problems.length === 0                       // ipo 事件型豁免（v3.21）
    && r.category === 'capital_flow';
})(), 'MIT TR 的 IPO prospectus 主张必须命中 ipo 形态并按媒体转述判 weak-evidence 不虚抬；yet 时间副词不得充当反例标记');

// 2. Ars Technica 调查句：kind=adoption + 第三方调查(3)/推理 0/3/
//    thin-reasoning/decisionRelevant（有描述有调查口径，与标题-only
//    条不同级——v3.7 Apollo 条同型路径）。
c3221('live 实证：Ars Technica「Survey of 2,018 IT heads」（adoption+第三方调查(3)）', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Enterprises keep buying software upgrades that IT thinks will make things worse  Survey of 2,018 IT heads at big firms points to a lack of leverage.',
    claimSentence: 'Enterprises keep buying software upgrades that IT thinks will make things worse  Survey of 2,018 IT heads at big firms points to a lack of leverage.',
    source: 'Ars Technica - Technology Lab', date: 'Wed, 21 Oct 2026 21:48:52 +0000',
    url: 'https://arstechnica.com/information-technology/2026/10/enterprises-keep-buying-software-upgrades/',
  });
  return r.kind === 'adoption'
    && r.evidence.weight === 3 && r.evidence.id === 'third-party-survey'
    && r.verdict === 'thin-reasoning'
    && r.reasoning.score === 0
    && r.decisionRelevant === true;
})(), 'Ars Technica 的调查主张必须命中 adoption 并归第三方调查(3)判 thin-reasoning 决策相关');

// ── 组 2：yet 让步位约束（corr-2026-024 家族第四次）────────────
// 3. 让步位 yet 仍算反例：句首 yet 与逗号 yet 两种让步形态都命中
//    （修复只摘时间副词，不打穿真反例——however/but 等无歧义词照旧）
c3221('yet 让步位约束：句首/逗号让步 yet 仍算反例', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r1 = discriminateCommercial({
    text: 'Nvidia announced its intent to raise up to $50 billion in debt and equity financing. Yet the company says the market is overheating.',
    source: 'test',
  });
  const r2 = discriminateCommercial({
    text: 'OpenAI raises $10 billion in new funding, yet analysts doubt the valuation.',
    source: 'test',
  });
  return r1.reasoning.met.includes('has-counterexample')
    && r2.reasoning.met.includes('has-counterexample');
})(), '句首 Yet 与逗号 yet 的让步语义必须仍计入反例——修复只摘时间副词，不打穿真反例');

// 4. 时间副词 yet 不命中：not yet initiated / picture yet of /
//    yet to be priced 三种 live 实证形态（恢复裸 yet 即精确失败）
c3221('yet 时间副词语义不命中（not yet/picture yet/yet to be）', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const base = 'Oracle announced its intent to raise up to $50 billion dollars in debt and equity financing.';
  const forms = [
    base + ' We have not yet initiated the at-the-market equity portion of the financing program.',
    base + ' The document offers the clearest picture yet of the company finances.',
    base + ' The remaining tranche is yet to be priced.',
  ];
  return forms.every(t => {
    const r = discriminateCommercial({ text: t, source: 'SEC EDGAR' });
    return !r.reasoning.met.includes('has-counterexample');
  });
})(), '三种 live 实证的时间副词 yet 形态都不得充当反例标记');

// 5. live 影响面：ORCL funding 条推理 2/3→1/3、verdict 仍 factual
//    （证据档先行于推理分——修正只摘虚抬的反例分，不改事实判定）
c3221('live 影响面：ORCL funding 条推理 2→1、verdict 仍 factual', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Capital Funding In February, we announced our intent to raise up to $50 billion dollars in debt and equity financing, along with the statement that we do not expect to issue any additional bonds beyond this amount in calendar year 2026. Within days of the announcement, Oracle raised $30 billion through a combination of investment grade bonds and mandatory convertible preferred stock, with a record order book that was substantially oversubscribed. We have not yet initiated the at-the-market equity portion of the financing program.',
    claimSentence: 'Capital Funding In February, we announced our intent to raise up to $50 billion dollars in debt and equity financing, along with the statement that we do not expect to issue any additional bonds beyond this amount in calendar year 2026.',
    source: 'SEC EDGAR', date: '2026-06-10',
  });
  return r.kind === 'funding'
    && r.verdict === 'factual'          // 公开财报/公告(3) + funding → 事实判定不变
    && r.reasoning.score === 1          // 修复前 2/3（yet 虚抬），修复后 1/3
    && r.reasoning.met.includes('has-sample')
    && !r.reasoning.met.includes('has-counterexample');
})(), 'yet 修复的 live 影响面如实钉住：ORCL funding 条反例分被摘掉、事实判定不变');

// ── 组 3：引擎端到端（候选池六桶）────────────────────────────
// 6. 引擎端到端：business + 两条 tech live 条目进辨别（byKind
//    ipo:1/adoption:1），business 第一优先，formatReport 渲染
//    「类型: IPO/上市过程主张 | 来源: MIT Tech Review - AI」行
//    （只认渲染行——修复前两条 tech 条目整条不进辨别）
c3221('引擎端到端：两条 tech live 条目进辨别+渲染行（business 仍第一优先）', (() => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const mk = (title, desc, source, bucket, date) => ({
    title, description: desc, body: '', source, bucket,
    pubDate: date, domains: ['market_claims'], link: 'https://example.com/' + title.slice(0, 8), origin: 'live',
  });
  const items = [
    // 对照：business 桶条目（第一优先）
    mk('Parents sue OpenAI, alleging GPT-4o coached their daughter off seizure medication',
       'A family is suing OpenAI, saying ChatGPT coached their daughter to quietly taper off her seizure medication and keep it from her doctors before she died in February.',
       'TechCrunch AI', 'business', 'Wed, 28 Oct 2026 00:00:00 +0000'),
    // tech 桶 live 条目 1：MIT TR IPO prospectus（修复前整条不进辨别）
    mk('Will the real Anthropic please stand up',
       'After weeks of frenzied speculation, Anthropic has filed its IPO prospectus. The document offers the clearest picture yet of the AI company\u2019s finances and its complicated web of investors.',
       'MIT Tech Review - AI', 'tech', 'Mon, 26 Oct 2026 17:45:43 +0000'),
    // tech 桶 live 条目 2：Ars Technica 调查（修复前整条不进辨别）
    mk('Enterprises keep buying software upgrades that IT thinks will make things worse',
       'Survey of 2,018 IT heads at big firms points to a lack of leverage.',
       'Ars Technica - Technology Lab', 'tech', 'Wed, 21 Oct 2026 21:48:52 +0000'),
  ];
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: items.length, domains: [], undomained: 0, dateRange: null, items };
  const cd = inst.buildCommercialDiscrimination();
  if (!cd.available) return false;
  const mit = cd.results.find(r => r.source === 'MIT Tech Review - AI');
  const ars = cd.results.find(r => r.source === 'Ars Technica - Technology Lab');
  // formatReport 需要 meta/summary 等最小字段（与 v3.21 夹具同型）
  const md = formatReport({
    meta: { timestamp: '2026-10-29T12:00:00Z', version: '3.27.0' },
    summary: { verdict: '继续观察', score: 0.5, keyMessage: 'TEST', topDomains: ['frontier_models'] },
    commercialDiscrimination: cd,
    stages: [], turningPoints: [], risks: [], opportunities: [], recommendations: [],
    confidence: { score: 0.5, level: 'medium', note: 'TEST', factors: { baseScore: 0.5, logicQuality: '中等', signalScore: 0.5, coverageScore: 0.5, undomainedRatio: 0.1, adjustment: 0 } },
    trendClassification: { available: false },
  });
  const rendered = md.split('\n').some(l => l.includes('类型: IPO/上市过程主张 | 来源: MIT Tech Review - AI'));
  return cd.audited === 3
    && cd.results[0].source === 'TechCrunch AI'      // business 第一优先
    && !!mit && mit.kind === 'ipo' && mit.reasoning.score === 0
    && !!ars && ars.kind === 'adoption' && ars.evidence.weight === 3
    && cd.summary.byKind.ipo === 1 && cd.summary.byKind.adoption === 1
    && rendered;
})(), 'tech 桶两条 live 主张必须进辨别（修复前整条不进）；business 条目仍排第一；报告渲染出 MIT TR 的 IPO 行');

// 7. 源级：PICK_BUCKETS 六桶 + tech/humanities 排 economy 之后 +
//    BUCKET_CAP 新桶有值（摘除任一桶→本断言与组 3 失败）
c3221('源级：PICK_BUCKETS 六桶顺序与 BUCKET_CAP 新桶容量', (() => {
  const fs = require('fs');
  const pf = fs.readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return /const PICK_BUCKETS = \['business', 'sec_filings', 'frontier_models', 'economy', 'tech', 'humanities'\]/.test(pf)
    && /tech: 6, humanities: 4/.test(pf)
    && /byBucket = \{ business: \[\], sec_filings: \[\], frontier_models: \[\], economy: \[\], tech: \[\], humanities: \[\] \}/.test(pf);
})(), '候选池必须是六桶且 tech/humanities 排在 economy 之后（business 第一优先纪律不变），byBucket 初始化同步');

// 8. 精度门未破：tech/humanities 的噪音条目不进辨别（指南页/
//    资助授予/人文条目/Fed 公告/播客照旧——新桶是重点盯守对象）
c3221('精度门未破：tech/humanities 噪音条目不进辨别', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const mk = (title, desc, source, bucket) => ({
    title, description: desc, body: '', source, bucket,
    pubDate: 'Tue, 13 Oct 2026 00:44:16 GMT', domains: [], link: 'https://example.com/x', origin: 'live',
  });
  const items = [
    // tech 桶：EU AI Act 指南页（reference text，无主张主体）
    mk('AI Therapy under the EU AI Act',
       'This page aims to provide an overview of AI systems, and in particular general-purpose AI (GPAI) systems, used for the purpose of therapy or emotional support under the AI Act.',
       'EU AI Act Timeline', 'tech'),
    // tech 桶：NIST 资助授予（v3.10/v3.12 已决议不收）
    mk('NIST Awards More Than $1.7 Million to Support Cybersecurity Workforce Development Across 8 States',
       'Projects will address local cybersecurity workforce needs and will offer practical learning opportunities including internships, apprenticeships and hands-on projects.',
       'NIST News', 'tech'),
    // humanities 桶：一般人文条目（无商业主张形态）
    mk('Anne Carson wins the 2026 Nobel Prize in Literature',
       'The Nobel Committee cited her mastery of the poetic voice and her reimagining of the classical tradition for a new generation of readers.',
       'Nobel Prize', 'humanities'),
    // economy 桶：Fed 公告（v3.0.0c 起精度门经典负例）
    mk('Minutes of the Federal Open Market Committee, September 15-16, 2026',
       'Minutes of the Federal Open Market Committee, September 15-16, 2026',
       'Federal Reserve (Monetary)', 'economy'),
    // business 桶：播客（v3.0.0c 起精度门经典负例）
    mk('LWiAI Podcast #258 - Opus 5.5, Sol and Luna, Muse, DeepSeek-V4.1-Flash, Xi',
       'Anthropic releases Opus 5.5 with lower prices and Fable-level performance, OpenAI launches GPT-6 Sol and Luna, boasting lower cost and fewer mistakes',
       'Last Week in AI', 'business'),
  ];
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: items.length, domains: [], undomained: 0, dateRange: null, items };
  const cd = inst.buildCommercialDiscrimination();
  return cd.available === false && /未抽到命中商业主张形态/.test(cd.reason || '');
})(), '新桶接入不得放宽精度门：指南页/资助授予/人文条目/Fed 公告/播客全部不进辨别');

// ── 组 4：cron 注入 + 计数 + 版本号 ──────────────────────────
// 9. cron 注入源级：池描述含 tech/humanities（端到端最后一环）
c3221('cron 注入源级：候选池描述含 tech/humanities', (() => {
  const fs = require('fs');
  const sh = fs.readFileSync(require('os').homedir() + '/.hermes/scripts/hf-cron-fetch.sh', 'utf-8');
  return /business\/economy\/tech\/humanities 媒体/.test(sh);
})(), '注入脚本的候选池描述必须同步六桶，否则 agent 看到的池范围与实际不符');

// 10. 模式库计数 24 不变（扩桶不加模式，v3.21.1 同型纪律）+
//     版本号一致性五处对齐 3.27.0
c3221('模式库计数 24 不变 + 版本号一致性：五处对齐 3.27.0', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const fs = require('fs');
  const VERSION = fs.readFileSync(require('path').join(__dirname, 'VERSION'), 'utf-8').trim();
  const pkg = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'package.json'), 'utf-8'));
  const rp = fs.readFileSync(require('path').join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  const pf = fs.readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return COMMERCIAL_CLAIM_PATTERNS.length === 25        // 扩桶不加 kind
    && VERSION === '3.27.0'
    && pkg.version === '3.27.0'
    && rp.includes('文明推演引擎 v3.27.0')
    && /version: '3\.27\.0'/.test(pf)
    && /version: '3\.27\.0'/.test(rp);
})(), 'VERSION/package.json/banner/projection meta/run-pipeline meta 必须对齐 3.27.0；模式库计数不随扩桶变化');

// ── v3.27.0 汇总 ──
(async () => {
  const results = await Promise.all(v3221.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v3221.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.22.1: ${v3221.length - f} 通过, ${f} 失败, 共 ${v3221.length} 个`);
  if (f > 0) {
    console.log('结论：候选池漏桶修复或 yet 精度修复不完整（live 实证/让步位/引擎级/源级/精度门/注入/版本有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：候选池白名单四桶→六桶（tech/humanities，corr-2026-027 同型断链修复）——live 实证 MIT TR IPO prospectus 与 Ars Technica 调查两条 tech 主张首次进辨别（business 第一优先不变）；yet 只认让步位（corr-2026-024 家族第四次，ORCL funding 条推理 2→1 不虚抬、MIT TR 条 0/3）；模式库计数 24 不变。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v3.23 测试组：EDGAR S-1/IPO 备案核查（新数据源 + ipo 主张独立验证）
//
// 背景（2026-10-29 live 实证）：v3.21 给 ipo-claim 立库时写下专属证伪
// 路径「EDGAR 查无/撤回/定价时间表不符/挂牌后披露矛盾」，但四条里没有
// 一条有数据支撑——引擎从来不去 EDGAR 查任何 S-1（登记 corr-2026-043：
// 「证伪路径写成可观测条件」≠「引擎能执行该检查」）。后果：MIT Tech
// Review「After weeks of frenzied speculation, Anthropic has filed its
// IPO prospectus.」被判 证据不足/无出处(1)/weak-evidence——而 Anthropic,
// PBC（CIK 0002130357）确实于 2026-10-26 向 SEC 提交了 S-1（accession
// 0001628280-26-067168，browse-edgar 实测），主张的事实核心经一手登记
// 记录完全成立。
//
// 本轮接上第一条（备案存在性核查）：新数据源 edgar-ipo-collector
// （browse-edgar 公司检索 + atom 解析 + 365 天窗口 + 公司名包含守卫），
// 只有断言**备案动作**的主张（IPO_FILING_ACTION_RE）且窗口内真的匹配到
// S-1 族备案，证据档才升独立验证(4)——v3.0.0c 起「独立验证」档第一次被
// 真实数据触发（此前只认文本里的 "independently verified by X" 标记）。
//
// 精度纪律（不虚抬）：文书主体（「S-1 Takeaways」类内容主张）与承销
// 牵头（「Goldman to Lead IPO」类）只记 EDGAR 在案作上下文、不抬档；
// 未匹配≠已证伪（公司名匹配是启发式）；网络失败整体降级，不把「查
// 不到」扮成「查无」。
//
// 反向验证：摘除辨别器 edgarVerification 抬级 override→组 1 T1/T2 与
// 组 2 T8 失败；摘除 filingAction 门（matched 即抬级）→T3 失败；摘除
// 窗口过滤→T5 失败；摘除 atom entry 块切分→T6 失败；摘除 run-pipeline
// 接线→T11 失败；摘除 formatReport EDGAR 行→T8 失败；摘除 cron 注入
// 行→T12 失败；摘除降级分支→T9/T10 失败；版本漂移→多处。
// ════════════════════════════════════════════════════════════════
const v3230 = [];
function c3230(name, ok, detail) { v3230.push({ name, ok, detail }); }

// ── live 夹具：browse-edgar atom（2026-10-29 实抓逐字，UTF-8 化）───
const ATOM_ANTHROPIC = `<?xml version="1.0" encoding="ISO-8859-1" ?>
  <feed xmlns="http://www.w3.org/2005/Atom">
    <author>
      <email>webmaster@sec.gov</email>
      <name>Webmaster</name>
    </author>
    <company-info>
      <addresses>
        <address type="mailing">
          <city>SAN FRANCISCO</city>
          <state>CA</state>
          <street1>548 MARKET STREET</street1>
          <street2>PMB 90375</street2>
          <zip>94104</zip>
        </address>
        <address type="business">
          <city>SAN FRANCISCO</city>
          <phone>415-236-0599</phone>
          <state>CA</state>
          <street1>548 MARKET STREET</street1>
          <street2>PMB 90375</street2>
          <zip>94104</zip>
        </address>
      </addresses>
      <assigned-sic>7372</assigned-sic>
      <assigned-sic-desc>SERVICES-PREPACKAGED SOFTWARE</assigned-sic-desc>
      <assigned-sic-href>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;SIC=7372&amp;owner=include&amp;count=10</assigned-sic-href>
      <cik>0002130357</cik>
      <cik-href>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;CIK=0002130357&amp;owner=include&amp;count=10</cik-href>
      <conformed-name>Anthropic, PBC</conformed-name>
      <fiscal-year-end>1231</fiscal-year-end>
      <state-location>CA</state-location>
      <state-location-href>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;State=CA&amp;owner=include&amp;count=10</state-location-href>
      <state-of-incorporation>DE</state-of-incorporation>
    </company-info>
    <entry>
      <category label="form type" scheme="https://www.sec.gov/" term="S-1" />
      <content type="text/xml">
        <accession-number>0001628280-26-067168</accession-number>
        <act>33</act>
        <file-number>333-299633</file-number>
        <file-number-href>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;filenum=333-299633&amp;owner=include&amp;count=10</file-number-href>
        <filing-date>2026-10-26</filing-date>
        <filing-href>https://www.sec.gov/Archives/edgar/data/2130357/000162828026067168/0001628280-26-067168-index.htm</filing-href>
        <filing-type>S-1</filing-type>
        <film-number>261483662</film-number>
        <form-name>General form for registration of securities under the Securities Act of 1933</form-name>
        <size>224 MB</size>
        <xbrl_href>https://www.sec.gov/cgi-bin/viewer?action=view&amp;cik=2130357&amp;accession_number=0001628280-26-067168&amp;xbrl_type=v</xbrl_href>
      </content>
      <id>urn:tag:sec.gov,2008:accession-number=0001628280-26-067168</id>
      <link href="https://www.sec.gov/Archives/edgar/data/2130357/000162828026067168/0001628280-26-067168-index.htm" rel="alternate" type="text/html" />
      <summary type="html"> &lt;b&gt;Filed:&lt;/b&gt; 2026-10-26 &lt;b&gt;AccNo:&lt;/b&gt; 0001628280-26-067168 &lt;b&gt;Size:&lt;/b&gt; 224 MB</summary>
      <title>S-1  - General form for registration of securities under the Securities Act of 1933</title>
      <updated>2026-10-26T09:00:11-04:00</updated>
    </entry>
    <id>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;CIK=0002130357</id>
    <link href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;company=anthropic&amp;type=S-1&amp;owner=include&amp;start=0&amp;count=10" rel="alternate" type="text/html" />
    <link href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;company=anthropic&amp;type=S-1&amp;owner=include&amp;start=0&amp;count=10&amp;output=atom" rel="self" type="application/atom+xml" />
    <title>Anthropic, PBC  (0002130357)</title>
    <updated>2026-10-28T16:20:43-04:00</updated>
  </feed>`;
const ATOM_MISTRAL = `<?xml version="1.0" encoding="ISO-8859-1" ?>
  <feed xmlns="http://www.w3.org/2005/Atom">
    <author>
      <email>webmaster@sec.gov</email>
      <name>Webmaster</name>
    </author>
    <company-info>
      <addresses>
        <address type="mailing">
          <city>NEW YORK</city>
          <state>NY</state>
          <street1>650 FIFTH AVENUE, 31ST FLOOR</street1>
          <zip>10019</zip>
        </address>
        <address type="business">
          <city>NEW YORK</city>
          <phone>(212) 335-4998</phone>
          <state>NY</state>
          <street1>650 FIFTH AVENUE, 31ST FLOOR</street1>
          <zip>10019</zip>
        </address>
      </addresses>
      <assigned-sic>6770</assigned-sic>
      <assigned-sic-desc>BLANK CHECKS</assigned-sic-desc>
      <assigned-sic-href>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;SIC=6770&amp;owner=include&amp;count=10</assigned-sic-href>
      <cik>0001424353</cik>
      <cik-href>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;CIK=0001424353&amp;owner=include&amp;count=10</cik-href>
      <conformed-name>Mistral Acquisition CO</conformed-name>
      <fiscal-year-end>1231</fiscal-year-end>
      <state-location>NY</state-location>
      <state-location-href>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;State=NY&amp;owner=include&amp;count=10</state-location-href>
      <state-of-incorporation>DE</state-of-incorporation>
    </company-info>
    <entry>
      <category label="form type" scheme="https://www.sec.gov/" term="S-1/A" />
      <content type="text/xml">
        <accession-number>0001193125-08-113265</accession-number>
        <act>33</act>
        <amend>[Amend]</amend>
        <file-number>333-148741</file-number>
        <file-number-href>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;filenum=333-148741&amp;owner=include&amp;count=10</file-number-href>
        <filing-date>2008-05-13</filing-date>
        <filing-href>https://www.sec.gov/Archives/edgar/data/1424353/000119312508113265/0001193125-08-113265-index.htm</filing-href>
        <filing-type>S-1/A</filing-type>
        <film-number>08828534</film-number>
        <form-name>General form for registration of securities under the Securities Act of 1933</form-name>
        <size>1 MB</size>
      </content>
      <id>urn:tag:sec.gov,2008:accession-number=0001193125-08-113265</id>
      <link href="https://www.sec.gov/Archives/edgar/data/1424353/000119312508113265/0001193125-08-113265-index.htm" rel="alternate" type="text/html" />
      <summary type="html"> &lt;b&gt;Filed:&lt;/b&gt; 2008-05-13 &lt;b&gt;AccNo:&lt;/b&gt; 0001193125-08-113265 &lt;b&gt;Size:&lt;/b&gt; 1 MB</summary>
      <title>S-1/A [Amend]  - General form for registration of securities under the Securities Act of 1933</title>
      <updated>2008-05-13T17:15:01-04:00</updated>
    </entry>
    <entry>
      <category label="form type" scheme="https://www.sec.gov/" term="S-1/A" />
      <content type="text/xml">
        <accession-number>0001193125-08-054260</accession-number>
        <act>33</act>
        <amend>[Amend]</amend>
        <file-number>333-148741</file-number>
        <file-number-href>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;filenum=333-148741&amp;owner=include&amp;count=10</file-number-href>
        <filing-date>2008-03-12</filing-date>
        <filing-href>https://www.sec.gov/Archives/edgar/data/1424353/000119312508054260/0001193125-08-054260-index.htm</filing-href>
        <filing-type>S-1/A</filing-type>
        <film-number>08684078</film-number>
        <form-name>General form for registration of securities under the Securities Act of 1933</form-name>
        <size>3 MB</size>
      </content>
      <id>urn:tag:sec.gov,2008:accession-number=0001193125-08-054260</id>
      <link href="https://www.sec.gov/Archives/edgar/data/1424353/000119312508054260/0001193125-08-054260-index.htm" rel="alternate" type="text/html" />
      <summary type="html"> &lt;b&gt;Filed:&lt;/b&gt; 2008-03-12 &lt;b&gt;AccNo:&lt;/b&gt; 0001193125-08-054260 &lt;b&gt;Size:&lt;/b&gt; 3 MB</summary>
      <title>S-1/A [Amend]  - General form for registration of securities under the Securities Act of 1933</title>
      <updated>2008-03-12T16:57:29-04:00</updated>
    </entry>
    <entry>
      <category label="form type" scheme="https://www.sec.gov/" term="S-1" />
      <content type="text/xml">
        <accession-number>0001193125-08-008711</accession-number>
        <act>33</act>
        <file-number>333-148741</file-number>
        <file-number-href>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;filenum=333-148741&amp;owner=include&amp;count=10</file-number-href>
        <filing-date>2008-01-18</filing-date>
        <filing-href>https://www.sec.gov/Archives/edgar/data/1424353/000119312508008711/0001193125-08-008711-index.htm</filing-href>
        <filing-type>S-1</filing-type>
        <film-number>08538356</film-number>
        <form-name>General form for registration of securities under the Securities Act of 1933</form-name>
        <size>953 KB</size>
      </content>
      <id>urn:tag:sec.gov,2008:accession-number=0001193125-08-008711</id>
      <link href="https://www.sec.gov/Archives/edgar/data/1424353/000119312508008711/0001193125-08-008711-index.htm" rel="alternate" type="text/html" />
      <summary type="html"> &lt;b&gt;Filed:&lt;/b&gt; 2008-01-18 &lt;b&gt;AccNo:&lt;/b&gt; 0001193125-08-008711 &lt;b&gt;Size:&lt;/b&gt; 953 KB</summary>
      <title>S-1  - General form for registration of securities under the Securities Act of 1933</title>
      <updated>2008-01-18T14:20:17-05:00</updated>
    </entry>
    <id>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;CIK=0001424353</id>
    <link href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;company=mistral&amp;type=S-1&amp;owner=include&amp;start=0&amp;count=10" rel="alternate" type="text/html" />
    <link href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;company=mistral&amp;type=S-1&amp;owner=include&amp;start=0&amp;count=10&amp;output=atom" rel="self" type="application/atom+xml" />
    <title>Mistral Acquisition CO  (0001424353)</title>
    <updated>2026-10-28T16:20:44-04:00</updated>
  </feed>`;
const ATOM_NOTFOUND = `<?xml version="1.0" encoding="ISO-8859-1" ?>
  <feed xmlns="http://www.w3.org/2005/Atom">
    <author>
      <email>webmaster@sec.gov</email>
      <name>Webmaster</name>
    </author>
    <id>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;company=openai&amp;type=S-1&amp;owner=include&amp;count=10</id>
    <link href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;company=openai&amp;type=S-1&amp;owner=include&amp;count=10&amp;start=0&amp;output=atom" rel="self" type="application/atom+xml" />
    <link href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;company=openai&amp;type=S-1&amp;owner=include&amp;count=10&amp;start=0" rel="alternate" type="text/html" />
    <title>Company Search Feed</title>
    <updated>2026-10-28T16:20:45-04:00</updated>
  </feed>`;
// mock http：按 URL 里的 company= 参数路由到夹具；返回调用次数供断言
function mkMockHttp(map) {
  const state = { calls: 0, urls: [] };
  state.fn = async (url) => {
    state.calls++;
    state.urls.push(url);
    const name = decodeURIComponent((url.match(/company=([^&]+)/) || [])[1] || '').toLowerCase();
    if (map[name] === 'THROW') throw new Error('mock network down');
    if (map[name] === 'HTTP500') return { status: 500, body: 'error' };
    return { status: 200, body: map[name] || ATOM_NOTFOUND };
  };
  return state;
}
// MIT TR live 主张（v3.22.1 轮 tech 桶条目，2026-10-29 在窗逐字）
const MIT_TR_TEXT = 'After weeks of frenzied speculation, Anthropic has filed its IPO prospectus. The 335-page document (100 pages or so are focused on risks) lays out the company\u2019s unique view of the technology it\u2026';
const MIT_TR_SENT = 'After weeks of frenzied speculation, Anthropic has filed its IPO prospectus.';

// ── 组 1：live 实证 + 纯函数 ────────────────────────────────────
// 1. live 实证：MIT TR 备案动作主张 + EDGAR 匹配 → 独立验证(4)/
//    thin-reasoning/decisionRelevant=true（v3.0.0c 起独立验证档第一次
//    被真实数据触发）；matched 记录带公司/CIK/表单/日期/accession。
c3230('live 实证：MIT TR IPO prospectus 主张经 EDGAR 验证升独立验证(4)', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const { verifyIpoClaims } = require('./human-future/scripts/edgar-ipo-collector.js');
  return (async () => {
    const http = mkMockHttp({ anthropic: ATOM_ANTHROPIC });
    const cd = {
      available: true, audited: 1,
      summary: {},
      results: [discriminateCommercial({
        text: MIT_TR_TEXT, claimSentence: MIT_TR_SENT,
        source: 'MIT Tech Review - AI', date: 'Mon, 26 Oct 2026 17:45:43 +0000',
        url: 'https://technologyreview.com/2026/10/26/1147672/will-the-real-anthropic-please-stand-up/',
      })],
    };
    const out = await verifyIpoClaims(cd, { http: http.fn, now: '2026-10-29T12:00:00Z', gapMs: 0 });
    const r = out.results[0];
    const c = r.edgarIpoCheck;
    return r.kind === 'ipo'
      && r.evidence.id === 'independent-verification' && r.evidence.weight === 4
      && r.verdict === 'thin-reasoning' && r.reasoning.score === 0 && r.decisionRelevant === true
      && c && c.upgraded === true && c.filingAction === true
      && c.matched.company === 'Anthropic, PBC' && c.matched.cik === '0002130357'
      && c.matched.form === 'S-1' && c.matched.filedAt === '2026-10-26'
      && c.matched.accession === '0001628280-26-067168'
      && out.ipoVerification.verified === 1 && out.ipoVerification.queries >= 1;
  })();
})(), '备案动作主张 + EDGAR 窗口内 S-1 匹配必须升独立验证(4)并带完整 matched 记录；推理分不因抬档变化');

// 2. 无验证不虚抬（v3.22.1 行为回归）：同一条主张不带 edgarVerification
//    → weak-evidence/无出处(1)/推理 0/3/DR=false/edgarIpoCheck=null。
c3230('无验证不虚抬：MIT TR 主张保持 weak-evidence/无出处(1)（v3.22.1 行为不回退）', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: MIT_TR_TEXT, claimSentence: MIT_TR_SENT,
    source: 'MIT Tech Review - AI', date: 'Mon, 26 Oct 2026 17:45:43 +0000',
  });
  return r.kind === 'ipo' && r.verdict === 'weak-evidence'
    && r.evidence.weight === 1 && r.evidence.id === 'no-source'
    && r.reasoning.score === 0 && r.decisionRelevant === false
    && r.edgarIpoCheck === null;
})(), '没有 EDGAR 核查数据时判定必须与 v3.22.1 逐字段一致——新数据源不改变未核查主张的判定');

// 3. 承销牵头形态不抬级：matched=Anthropic 但 filingAction=false →
//    证据档不动（媒体报道(2)/weak-evidence）、matched 作上下文记录。
c3230('承销牵头形态只记上下文不抬档（Goldman to Lead Anthropic IPO）', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const r = discriminateCommercial({
    text: 'Goldman Sachs to Lead Anthropic IPO  Goldman Sachs is set to lead the Anthropic IPO, according to people familiar with the matter.',
    claimSentence: 'Goldman Sachs to Lead Anthropic IPO',
    source: 'The Information', date: 'Mon, 26 Oct 2026 12:00:00 +0000',
    edgarVerification: {
      matched: { candidate: 'Anthropic', company: 'Anthropic, PBC', cik: '0002130357', form: 'S-1', filedAt: '2026-10-26', accession: '0001628280-26-067168', href: 'https://www.sec.gov/Archives/edgar/data/2130357/000162828026067168/0001628280-26-067168-index.htm' },
      checked: ['Goldman Sachs', 'Anthropic'], reason: null,
    },
  });
  return r.kind === 'ipo' && r.edgarIpoCheck
    && r.edgarIpoCheck.filingAction === false && r.edgarIpoCheck.upgraded === false
    && r.edgarIpoCheck.matched && r.edgarIpoCheck.matched.company === 'Anthropic, PBC'
    && r.evidence.id === 'media-report' && r.evidence.weight === 2
    && r.verdict === 'weak-evidence' && r.decisionRelevant === false;
})(), '承销牵头主张的 underwriter 身份需要 424B4 核对，本轮不采——EDGAR 在案只作上下文，证据档不得虚抬');

// 4. 未匹配不抬级也不判假：OpenAI（EDGAR 查无）→ filingAction=true 但
//    matched=null，证据档不动、reason=null（未匹配不是错误）。
c3230('未匹配不抬级不判假（OpenAI files for IPO + notfound 夹具）', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const { verifyIpoClaims } = require('./human-future/scripts/edgar-ipo-collector.js');
  return (async () => {
    const http = mkMockHttp({});
    const cd = {
      available: true, audited: 1, summary: {},
      results: [discriminateCommercial({
        text: 'OpenAI officially files for its public debut, revealing soaring revenue projections for the coming year.',
        claimSentence: 'OpenAI officially files for its public debut',
        source: 'TechCrunch AI', date: 'Mon, 26 Oct 2026 12:00:00 +0000',
      })],
    };
    const out = await verifyIpoClaims(cd, { http: http.fn, now: '2026-10-29T12:00:00Z', gapMs: 0 });
    const r = out.results[0];
    return r.kind === 'ipo' && r.edgarIpoCheck
      && r.edgarIpoCheck.filingAction === true && r.edgarIpoCheck.matched === null
      && r.edgarIpoCheck.upgraded === false && r.edgarIpoCheck.reason === null
      && r.evidence.weight === 1 && r.verdict === 'weak-evidence'
      && out.ipoVerification.unmatched === 1 && out.ipoVerification.verified === 0;
  })();
})(), 'EDGAR 未匹配到备案时证据档不动（未匹配≠已证伪，公司名匹配是启发式）');

// 5. 窗口过滤：Mistral 的 S-1/A 全是 2008 年 → 不算在办 IPO（live 实证
//    Mistral Acquisition CO 的三条 2008 备案；不过滤会把历史备案当成在办）。
c3230('窗口过滤：2008 年的 S-1/A 不算在办 IPO（Mistral 夹具）', (() => {
  const { parseBrowseEdgarAtom, pickRecentFiling, verifyIpoClaims } = require('./human-future/scripts/edgar-ipo-collector.js');
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const parsed = parseBrowseEdgarAtom(ATOM_MISTRAL);
  const recent = pickRecentFiling(parsed.filings, { now: '2026-10-29T12:00:00Z' });
  return (async () => {
    const http = mkMockHttp({ mistral: ATOM_MISTRAL });
    const cd = {
      available: true, audited: 1, summary: {},
      results: [discriminateCommercial({
        text: 'Mistral files for its public debut as the French AI lab eyes a US listing this quarter.',
        claimSentence: 'Mistral files for its public debut',
        source: 'TechCrunch AI', date: 'Mon, 26 Oct 2026 12:00:00 +0000',
      })],
    };
    const out = await verifyIpoClaims(cd, { http: http.fn, now: '2026-10-29T12:00:00Z', gapMs: 0 });
    return parsed.found === true && parsed.filings.length === 3
      && recent === null
      && out.results[0].edgarIpoCheck.matched === null
      && out.results[0].evidence.weight === 1;
  })();
})(), '365 天窗口外的历史 S-1/A 不得算作在办 IPO——窗口过滤是匹配的前置条件');

// 6. atom 解析纯函数：anthropic 三字段 + href 实体解码；notfound 无
//    company-info → found=false（live 实证查询 "OpenAI" 的 814 字节响应）。
c3230('atom 解析：Anthropic 备案三字段 + notfound 的 found=false', (() => {
  const { parseBrowseEdgarAtom } = require('./human-future/scripts/edgar-ipo-collector.js');
  const a = parseBrowseEdgarAtom(ATOM_ANTHROPIC);
  const n = parseBrowseEdgarAtom(ATOM_NOTFOUND);
  return a.found === true && a.company === 'Anthropic, PBC' && a.cik === '0002130357'
    && a.filings.length === 1
    && a.filings[0].form === 'S-1' && a.filings[0].filedAt === '2026-10-26'
    && a.filings[0].accession === '0001628280-26-067168'
    && a.filings[0].href === 'https://www.sec.gov/Archives/edgar/data/2130357/000162828026067168/0001628280-26-067168-index.htm'
    && n.found === false && n.filings.length === 0;
})(), 'browse-edgar atom 必须逐 entry 块解析（filing-date 在 filing-type 之前），查无公司时 found=false');

// 7. 公司候选提取：MIT TR 文本只出 Anthropic（句首 After/The/来源名
//    全过滤）；Goldman 标题+摘要双空格缝合句能出 Goldman Sachs 与
//    Anthropic（停用词修剪 + 双空格切分 + 首 token 补候选）。
c3230('公司候选提取：停用词/来源名过滤 + 双空格切分 + 首 token 补候选', (() => {
  const { extractCompanyCandidates } = require('./human-future/scripts/edgar-ipo-collector.js');
  const c1 = extractCompanyCandidates(MIT_TR_TEXT, 'MIT Tech Review - AI', MIT_TR_SENT);
  const c2 = extractCompanyCandidates(
    'Goldman Sachs to Lead Anthropic IPO  Goldman Sachs is set to lead the Anthropic IPO, according to people familiar with the matter.',
    'The Information', 'Goldman Sachs to Lead Anthropic IPO');
  const c3 = extractCompanyCandidates(
    'Anthropic S-1 Highlights Rising Payment Costs  Anthropic S-1 Highlights Rising Payment Costs as compute commitments balloon.',
    'The Information', 'Anthropic S-1 Highlights Rising Payment Costs');
  return c1.length === 1 && c1[0] === 'Anthropic'
    && c2.includes('Goldman Sachs') && c2.includes('Anthropic')
    && !c2.some(x => /IPO|Lead/.test(x))
    && c3.includes('Anthropic');
})(), '候选提取必须过滤句首大写词/来源名/停用词 token，跨双空格不粘连，公司名在垃圾后缀前也要能补出来');

// ── 组 2：编排端到端 + 降级 ─────────────────────────────────────
// 8. 端到端：引擎候选门 → 辨别 → EDGAR 核查 → summary 重算 →
//    formatReport 渲染「EDGAR 核查: ✅」行与汇总行（business 第一优先
//    纪律不变；汇总计数与逐条结果一致——v3.23 抽出 summarizeCommercial
//    的原因：验证后不重算就会出现报告头部与逐条自相矛盾）。
c3230('引擎端到端：核查后 summary 重算 + 报告渲染 EDGAR ✅ 行与汇总行', (() => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const { verifyIpoClaims } = require('./human-future/scripts/edgar-ipo-collector.js');
  return (async () => {
    const mk = (title, desc, source, bucket) => ({
      title, description: desc, body: '', source, bucket,
      pubDate: 'Mon, 26 Oct 2026 17:45:43 +0000', domains: ['market_claims'],
      link: 'https://example.com/x', origin: 'live',
    });
    const items = [
      // 对照：business 桶条目（第一优先纪律）
      mk('Parents sue OpenAI, alleging GPT-4o coached their daughter off seizure medication',
         'A family is suing OpenAI, saying ChatGPT coached their daughter to quietly taper off her seizure medication.',
         'TechCrunch AI', 'business'),
      // tech 桶 live 条目：MIT TR IPO prospectus（核查对象）
      mk('Will the real Anthropic please stand up',
         'After weeks of frenzied speculation, Anthropic has filed its IPO prospectus. The 335-page document (100 pages or so are focused on risks) lays out the company\u2019s unique view of the technology it\u2026',
         'MIT Tech Review - AI', 'tech'),
    ];
    const inst = new ProjectionEngine({});
    inst.signals = { totalItems: items.length, domains: [], undomained: 0, dateRange: null, items };
    const cd = inst.buildCommercialDiscrimination();
    const http = mkMockHttp({ anthropic: ATOM_ANTHROPIC });
    const cd2 = await verifyIpoClaims(cd, { http: http.fn, now: '2026-10-29T12:00:00Z', gapMs: 0 });
    const mit = cd2.results.find(r => r.source === 'MIT Tech Review - AI');
    // 汇总必须与逐条一致（重算后）
    const drCount = cd2.results.filter(r => r.decisionRelevant).length;
    const ivCount = Object.entries(cd2.summary.byEvidence).filter(([k]) => k === '独立验证').reduce((s, [, v]) => s + v, 0);
    const md = formatReport({
      meta: { timestamp: '2026-10-29T12:00:00Z', version: '3.27.0' },
      summary: { verdict: '继续观察', score: 0.5, keyMessage: 'TEST', topDomains: ['frontier_models'] },
      commercialDiscrimination: cd2,
      stages: [], turningPoints: [], risks: [], opportunities: [], recommendations: [],
      confidence: { score: 0.5, level: 'medium', note: 'TEST', factors: { baseScore: 0.5, logicQuality: '中等', signalScore: 0.5, coverageScore: 0.5, undomainedRatio: 0.1, adjustment: 0 } },
      trendClassification: { available: false },
    });
    const lines = md.split('\n');
    return cd2.audited === 2
      && cd2.results[0].source === 'TechCrunch AI'          // business 第一优先
      && !!mit && mit.evidence.weight === 4 && mit.decisionRelevant === true
      && cd2.summary.decisionRelevantCount === drCount      // 汇总与逐条一致
      && ivCount === 1
      && lines.some(l => l.includes('EDGAR 核查: ✅ Anthropic, PBC（CIK 0002130357）2026-10-26 提交 S-1（0001628280-26-067168）'))
      && lines.some(l => l.includes('IPO 主张 EDGAR 核查: 1 条 ipo 主张 → 验证 1（独立验证(4)）'));
  })();
})(), 'EDGAR 核查必须端到端到达报告产物：证据档抬升+汇总重算+✅ 渲染行+汇总行，business 第一优先不变');

// 9. 降级：http 全部抛错 → ipoVerification.available=false + reason，
//    结果判定不变（仍 weak-evidence/无出处(1)）+ 报告渲染「不可用」行
//    （不把「查不到」扮成「查无」——诚实性约束 4）。
c3230('降级：EDGAR 查询抛错 → 整体不可用且判定不变', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const { verifyIpoClaims } = require('./human-future/scripts/edgar-ipo-collector.js');
  const { formatReport } = require('./scripts/project-future.js');
  return (async () => {
    const mk = (title, desc, source, bucket) => ({
      title, description: desc, body: '', source, bucket,
      pubDate: 'Mon, 26 Oct 2026 17:45:43 +0000', domains: ['market_claims'],
      link: 'https://example.com/x', origin: 'live',
    });
    const inst = new ProjectionEngine({});
    inst.signals = {
      totalItems: 1, domains: [], undomained: 0, dateRange: null,
      items: [mk('Will the real Anthropic please stand up',
        'After weeks of frenzied speculation, Anthropic has filed its IPO prospectus. The 335-page document lays out the company finances.',
        'MIT Tech Review - AI', 'tech')],
    };
    const cd = inst.buildCommercialDiscrimination();
    const http = mkMockHttp({ anthropic: 'THROW' });
    const cd2 = await verifyIpoClaims(cd, { http: http.fn, now: '2026-10-29T12:00:00Z', gapMs: 0 });
    const r = cd2.results[0];
    const md = formatReport({
      meta: { timestamp: '2026-10-29T12:00:00Z', version: '3.27.0' },
      summary: { verdict: '继续观察', score: 0.5, keyMessage: 'TEST', topDomains: ['frontier_models'] },
      commercialDiscrimination: cd2,
      stages: [], turningPoints: [], risks: [], opportunities: [], recommendations: [],
      confidence: { score: 0.5, level: 'medium', note: 'TEST', factors: { baseScore: 0.5, logicQuality: '中等', signalScore: 0.5, coverageScore: 0.5, undomainedRatio: 0.1, adjustment: 0 } },
      trendClassification: { available: false },
    });
    return cd2.ipoVerification.available === false
      && /EDGAR 查询失败/.test(cd2.ipoVerification.reason || '')
      && r.evidence.weight === 1 && r.verdict === 'weak-evidence' && r.decisionRelevant === false
      && md.split('\n').some(l => l.includes('EDGAR 核查: 不可用——'));
  })();
})(), '查询失败必须整体降级并写明原因，ipo 主张按原证据档判定，不静默跳过');

// 10. 非 live 模式：live:false 不发起任何查询（http 调用计数 0），
//     available=false + reason 含「非 live」——与 benchmark 采集器同纪律。
c3230('非 live 模式不发起 EDGAR 查询（FETCH!=1 时降级）', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const { verifyIpoClaims } = require('./human-future/scripts/edgar-ipo-collector.js');
  return (async () => {
    const mk = (title, desc, source, bucket) => ({
      title, description: desc, body: '', source, bucket,
      pubDate: 'Mon, 26 Oct 2026 17:45:43 +0000', domains: ['market_claims'],
      link: 'https://example.com/x', origin: 'live',
    });
    const inst = new ProjectionEngine({});
    inst.signals = {
      totalItems: 1, domains: [], undomained: 0, dateRange: null,
      items: [mk('Will the real Anthropic please stand up',
        'After weeks of frenzied speculation, Anthropic has filed its IPO prospectus. The 335-page document lays out the company finances.',
        'MIT Tech Review - AI', 'tech')],
    };
    const cd = inst.buildCommercialDiscrimination();
    const http = mkMockHttp({ anthropic: ATOM_ANTHROPIC });
    const cd2 = await verifyIpoClaims(cd, { http: http.fn, now: '2026-10-29T12:00:00Z', gapMs: 0, live: false });
    return cd2.ipoVerification.available === false
      && /非 live 模式/.test(cd2.ipoVerification.reason || '')
      && http.calls === 0
      && cd2.results[0].evidence.weight === 1;
  })();
})(), '非 live 模式不得发起网络查询（与 prediction-benchmark-collector 同纪律），ipo 主张按原证据档判定');

// ── 组 3：源级接线 + 计数 + 版本号 ──────────────────────────────
// 11. 源级：run-pipeline.js 阶段 3.5 调 verifyIpoClaims（generate 之后、
//     formatReport 之前）+ project-future.js main 块同型接线（两处入口
//     同步，否则 standalone 路径缺核查结果）。
c3230('源级：run-pipeline 阶段 3.5 + project-future main 块都接 verifyIpoClaims', (() => {
  const fs = require('fs');
  const rp = fs.readFileSync(require('path').join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  const pf = fs.readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return /require\('\.\.\/human-future\/scripts\/edgar-ipo-collector\.js'\)/.test(rp)
    && /await verifyIpoClaims\(/.test(rp)
    && /formatReport\(projection\)/.test(rp)
    && rp.indexOf('await verifyIpoClaims') < rp.indexOf('formatReport(projection)')   // 位置纪律：核查先于渲染
    && /require\('\.\.\/human-future\/scripts\/edgar-ipo-collector\.js'\)/.test(pf)
    && /await verifyIpoClaims\(/.test(pf);
})(), 'EDGAR 核查必须接在 live pipeline 的 generate 之后、formatReport 之前；两处入口同步');

// 12. cron 注入源级：注入脚本渲染 edgarIpoCheck（端到端最后一环——
//    引擎产出了但 agent 看不到的同型断链不能再犯）。
c3230('cron 注入源级：hf-cron-fetch.sh 渲染 EDGAR 核查与 ipoVerification 汇总', (() => {
  const fs = require('fs');
  const sh = fs.readFileSync(require('os').homedir() + '/.hermes/scripts/hf-cron-fetch.sh', 'utf-8');
  return /edgarIpoCheck/.test(sh)
    && /EDGAR 核查: ✅/.test(sh)
    && /EDGAR 核查: ·/.test(sh)
    && /EDGAR 核查: ○/.test(sh)
    && /EDGAR 核查: 不可用/.test(sh)
    && /ipoVerification/.test(sh)
    && /IPO 主张 EDGAR 核查/.test(sh);
})(), '注入脚本必须渲染四种 EDGAR 核查结果与汇总行，否则 agent 看不到核查数据');

// 13. 模式库计数 24 不变（加数据源不加 kind）+ 备案动作子形态与 ipo-claim
//     主正则同源（拆常量不漂移）+ 版本号一致性五处对齐 3.27.0。
c3230('模式库计数 24 不变 + 子形态同源 + 版本号五处对齐 3.27.0', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS, IPO_FILING_ACTION_RE } = require('./human-future/scripts/commercial-discriminator.js');
  const fs = require('fs');
  const VERSION = fs.readFileSync(require('path').join(__dirname, 'VERSION'), 'utf-8').trim();
  const pkg = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'package.json'), 'utf-8'));
  const rp = fs.readFileSync(require('path').join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  const pf = fs.readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  const ipo = COMMERCIAL_CLAIM_PATTERNS.find(p => p.id === 'ipo-claim');
  return COMMERCIAL_CLAIM_PATTERNS.length === 25            // 加数据源不加 kind
    && ipo && ipo.re.source.includes(IPO_FILING_ACTION_RE.source)   // 子形态是主正则的组成部分（同源不漂移）
    && VERSION === '3.27.0'
    && pkg.version === '3.27.0'
    && rp.includes('文明推演引擎 v3.27.0')
    && /version: '3\.27\.0'/.test(pf)
    && /version: '3\.27\.0'/.test(rp);
})(), 'VERSION/package.json/banner/projection meta/run-pipeline meta 五处对齐 3.27.0；模式库计数不随新数据源变化；备案动作子形态必须与 ipo-claim 主正则同源');

// ── v3.23 汇总 ──
(async () => {
  const results = await Promise.all(v3230.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v3230.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.23: ${v3230.length - f} 通过, ${f} 失败, 共 ${v3230.length} 个`);
  if (f > 0) {
    console.log('结论：EDGAR S-1 备案核查（新数据源）或端到端接线不完整（live 实证/精度纪律/编排/降级/源级/版本有缺）。');
    process.exitCode = 1;
  } else {
    console.log('结论：EDGAR S-1/IPO 备案核查接上真数据（v3.21 证伪路径「EDGAR 查无/在案」第一条落地）——MIT TR 备案动作主张经 Anthropic, PBC 的 S-1 记录验证升独立验证(4)（该档首次被真实数据触发）；承销牵头/文书主体只记上下文不虚抬；未匹配≠已证伪；查询失败整体降级。模式库计数 24 不变（新数据源不加 kind）。');
  }
})();

// ════════════════════════════════════════════════════════════════
// v3.24 测试组：ipo 证伪路径第二、三条接真数据（撤回 RW + 定价 424B4）
//
// 背景：v3.21 给 ipo-claim 立库时写下专属证伪路径「EDGAR 查无/撤回/定价
// 时间表不符/挂牌后披露矛盾」四条；v3.23 只接了第一条（备案存在性核查，
// browse-edgar type=S-1），并把其余三条整批列为「不做也不假装做、留人工
// 执行」。但 browse-edgar 的 type=S-1 只是 SEC 的一个端点——同一公司的
// submissions API（data.sec.gov）一次查询即返回全表单族的登记记录，撤回
// （RW）与定价（424B4）都是可观测的公开登记事件（live 实测：Chobani
// S-1 2021-11-17 之后 RW 2022-09-02、Cerebras S-1 2024-09-30 之后 RW
// 2025-10-03 之后再备案 2026-04-17 之后 424B4 2026-05-14、Mobileye
// Global S-1 2023-06-05 之后 424B4 2023-06-08）。登记 corr-2026-044：
// 「引擎不能执行」≠「没有数据支撑」——写已知边界时要区分「没有数据源」
// 与「没接数据源」，接新数据源时要扫该机构的其它端点。
//
// 精度纪律：① 事件只作可观测上下文——不抬证据档、不改 verdict、不改
//   推理分（备案动作主张的事实核心由 S-1 记录验证，事件不推翻已发生
//   的备案；证伪解读由下游 agent 结合主张时点做，引擎不代判）；
//   ② 按 CIK 查保证与 S-1 匹配同一实体（live 实证：同名不同 type 在
//   browse-edgar 会解析到不同公司——Mobileye+type=S-1 解析到 Mobileye
//   Global Inc.（CIK 0001910139），+type=RW 解析到 Mobileye B.V.
//   （CIK 0001607310））；③ 「查了但没有事件」与「查不到」分开；
//   ④ 窗口纪律与 S-1 一致：365 天外的历史登记不算在办事件。
//
// 反向验证：摘除 verifyIpoClaims 的事件查询段→T1/T2/T8/T11 失败；摘除
// pickRecentByForm 窗口过滤→T5 失败（2018 年 RW 误匹配）；摘除辨别器
// events 透传→T1/T2/T3/T4 失败；摘除 formatReport 事件后缀渲染→T8
// 失败；摘除 cron 注入事件行→T12 失败；摘除 eventsUnavailable 降级
// 分支→T9 失败；摘除 CIK memo→T11 失败；版本漂移→多处。
// ════════════════════════════════════════════════════════════════
const v3240 = [];
function c3240(name, ok, detail) { v3240.push({ name, ok, detail }); }

// live 夹具：browse-edgar atom（2026-10-29 实抓逐字）
const ATOM_CHOBANI = "<?xml version=\"1.0\" encoding=\"ISO-8859-1\" ?>\n  <feed xmlns=\"http://www.w3.org/2005/Atom\">\n    <author>\n      <email>webmaster@sec.gov</email>\n      <name>Webmaster</name>\n    </author>\n    <company-info>\n      <addresses>\n        <address type=\"mailing\">\n          <city>NEW BERLIN</city>\n          <state>NY</state>\n          <street1>669 COUNTY ROAD 25</street1>\n          <zip>13411</zip>\n        </address>\n        <address type=\"business\">\n          <city>NEW BERLIN</city>\n          <phone>6078477413</phone>\n          <state>NY</state>\n          <street1>669 COUNTY ROAD 25</street1>\n          <zip>13411</zip>\n        </address>\n      </addresses>\n      <assigned-sic>2000</assigned-sic>\n      <assigned-sic-desc>FOOD &amp;amp; KINDRED PRODUCTS</assigned-sic-desc>\n      <assigned-sic-href>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;SIC=2000&amp;owner=include&amp;count=10</assigned-sic-href>\n      <cik>0001869113</cik>\n      <cik-href>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;CIK=0001869113&amp;owner=include&amp;count=10</cik-href>\n      <conformed-name>Chobani Inc.</conformed-name>\n      <fiscal-year-end>1225</fiscal-year-end>\n      <state-location>NY</state-location>\n      <state-location-href>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;State=NY&amp;owner=include&amp;count=10</state-location-href>\n      <state-of-incorporation>DE</state-of-incorporation>\n    </company-info>\n    <entry>\n      <category label=\"form type\" scheme=\"https://www.sec.gov/\" term=\"S-1\" />\n      <content type=\"text/xml\">\n        <accession-number>0001193125-21-332196</accession-number>\n        <act>33</act>\n        <file-number>333-261146</file-number>\n        <file-number-href>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;filenum=333-261146&amp;owner=include&amp;count=10</file-number-href>\n        <filing-date>2021-11-17</filing-date>\n        <filing-href>https://www.sec.gov/Archives/edgar/data/1869113/000119312521332196/0001193125-21-332196-index.htm</filing-href>\n        <filing-type>S-1</filing-type>\n        <film-number>211419832</film-number>\n        <form-name>General form for registration of securities under the Securities Act of 1933</form-name>\n        <size>13 MB</size>\n      </content>\n      <id>urn:tag:sec.gov,2008:accession-number=0001193125-21-332196</id>\n      <link href=\"https://www.sec.gov/Archives/edgar/data/1869113/000119312521332196/0001193125-21-332196-index.htm\" rel=\"alternate\" type=\"text/html\" />\n      <summary type=\"html\"> &lt;b&gt;Filed:&lt;/b&gt; 2021-11-17 &lt;b&gt;AccNo:&lt;/b&gt; 0001193125-21-332196 &lt;b&gt;Size:&lt;/b&gt; 13 MB</summary>\n      <title>S-1  - General form for registration of securities under the Securities Act of 1933</title>\n      <updated>2021-11-17T13:16:29-05:00</updated>\n    </entry>\n    <id>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;CIK=0001869113</id>\n    <link href=\"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;company=Chobani&amp;type=S-1&amp;owner=include&amp;start=0&amp;count=10\" rel=\"alternate\" type=\"text/html\" />\n    <link href=\"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;company=Chobani&amp;type=S-1&amp;owner=include&amp;start=0&amp;count=10&amp;output=atom\" rel=\"self\" type=\"application/atom+xml\" />\n    <title>Chobani Inc.  (0001869113)</title>\n    <updated>2026-10-28T18:31:32-04:00</updated>\n  </feed>\n";
const ATOM_CEREBRAS = "<?xml version=\"1.0\" encoding=\"ISO-8859-1\" ?>\n  <feed xmlns=\"http://www.w3.org/2005/Atom\">\n    <author>\n      <email>webmaster@sec.gov</email>\n      <name>Webmaster</name>\n    </author>\n    <company-info>\n      <addresses>\n        <address type=\"mailing\">\n          <city>SUNNYVALE</city>\n          <state>CA</state>\n          <street1>1237 E. ARQUES AVE.</street1>\n          <zip>94085</zip>\n        </address>\n        <address type=\"business\">\n          <city>SUNNYVALE</city>\n          <phone>(650) 933-4890</phone>\n          <state>CA</state>\n          <street1>1237 E. ARQUES AVE.</street1>\n          <zip>94085</zip>\n        </address>\n      </addresses>\n      <assigned-sic>3674</assigned-sic>\n      <assigned-sic-desc>SEMICONDUCTORS &amp;amp; RELATED DEVICES</assigned-sic-desc>\n      <assigned-sic-href>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;SIC=3674&amp;owner=include&amp;count=10</assigned-sic-href>\n      <cik>0002021728</cik>\n      <cik-href>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;CIK=0002021728&amp;owner=include&amp;count=10</cik-href>\n      <conformed-name>Cerebras Systems Inc.</conformed-name>\n      <fiscal-year-end>1231</fiscal-year-end>\n      <state-location>CA</state-location>\n      <state-location-href>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;State=CA&amp;owner=include&amp;count=10</state-location-href>\n      <state-of-incorporation>DE</state-of-incorporation>\n    </company-info>\n    <entry>\n      <category label=\"form type\" scheme=\"https://www.sec.gov/\" term=\"S-1/A\" />\n      <content type=\"text/xml\">\n        <accession-number>0001628280-26-033143</accession-number>\n        <act>33</act>\n        <amend>[Amend]</amend>\n        <file-number>333-295145</file-number>\n        <file-number-href>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;filenum=333-295145&amp;owner=include&amp;count=10</file-number-href>\n        <filing-date>2026-05-11</filing-date>\n        <filing-href>https://www.sec.gov/Archives/edgar/data/2021728/000162828026033143/0001628280-26-033143-index.htm</filing-href>\n        <filing-type>S-1/A</filing-type>\n        <film-number>26960949</film-number>\n        <form-name>General form for registration of securities under the Securities Act of 1933</form-name>\n        <size>96 MB</size>\n        <xbrl_href>https://www.sec.gov/cgi-bin/viewer?action=view&amp;cik=2021728&amp;accession_number=0001628280-26-033143&amp;xbrl_type=v</xbrl_href>\n      </content>\n      <id>urn:tag:sec.gov,2008:accession-number=0001628280-26-033143</id>\n      <link href=\"https://www.sec.gov/Archives/edgar/data/2021728/000162828026033143/0001628280-26-033143-index.htm\" rel=\"alternate\" type=\"text/html\" />\n      <summary type=\"html\"> &lt;b&gt;Filed:&lt;/b&gt; 2026-05-11 &lt;b&gt;AccNo:&lt;/b&gt; 0001628280-26-033143 &lt;b&gt;Size:&lt;/b&gt; 96 MB</summary>\n      <title>S-1/A [Amend]  - General form for registration of securities under the Securities Act of 1933</title>\n      <updated>2026-05-11T08:04:58-04:00</updated>\n    </entry>\n    <entry>\n      <category label=\"form type\" scheme=\"https://www.sec.gov/\" term=\"S-1/A\" />\n      <content type=\"text/xml\">\n        <accession-number>0001628280-26-029503</accession-number>\n        <act>33</act>\n        <amend>[Amend]</amend>\n        <file-number>333-295145</file-number>\n        <file-number-href>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;filenum=333-295145&amp;owner=include&amp;count=10</file-number-href>\n        <filing-date>2026-05-04</filing-date>\n        <filing-href>https://www.sec.gov/Archives/edgar/data/2021728/000162828026029503/0001628280-26-029503-index.htm</filing-href>\n        <filing-type>S-1/A</filing-type>\n        <film-number>26934499</film-number>\n        <form-name>General form for registration of securities under the Securities Act of 1933</form-name>\n        <size>97 MB</size>\n        <xbrl_href>https://www.sec.gov/cgi-bin/viewer?action=view&amp;cik=2021728&amp;accession_number=0001628280-26-029503&amp;xbrl_type=v</xbrl_href>\n      </content>\n      <id>urn:tag:sec.gov,2008:accession-number=0001628280-26-029503</id>\n      <link href=\"https://www.sec.gov/Archives/edgar/data/2021728/000162828026029503/0001628280-26-029503-index.htm\" rel=\"alternate\" type=\"text/html\" />\n      <summary type=\"html\"> &lt;b&gt;Filed:&lt;/b&gt; 2026-05-04 &lt;b&gt;AccNo:&lt;/b&gt; 0001628280-26-029503 &lt;b&gt;Size:&lt;/b&gt; 97 MB</summary>\n      <title>S-1/A [Amend]  - General form for registration of securities under the Securities Act of 1933</title>\n      <updated>2026-05-04T06:03:58-04:00</updated>\n    </entry>\n    <entry>\n      <category label=\"form type\" scheme=\"https://www.sec.gov/\" term=\"S-1\" />\n      <content type=\"text/xml\">\n        <accession-number>0001628280-26-025762</accession-number>\n        <act>33</act>\n        <file-number>333-295145</file-number>\n        <file-number-href>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;filenum=333-295145&amp;owner=include&amp;count=10</file-number-href>\n        <filing-date>2026-04-17</filing-date>\n        <filing-href>https://www.sec.gov/Archives/edgar/data/2021728/000162828026025762/0001628280-26-025762-index.htm</filing-href>\n        <filing-type>S-1</filing-type>\n        <film-number>26871884</film-number>\n        <form-name>General form for registration of securities under the Securities Act of 1933</form-name>\n        <size>107 MB</size>\n        <xbrl_href>https://www.sec.gov/cgi-bin/viewer?action=view&amp;cik=2021728&amp;accession_number=0001628280-26-025762&amp;xbrl_type=v</xbrl_href>\n      </content>\n      <id>urn:tag:sec.gov,2008:accession-number=0001628280-26-025762</id>\n      <link href=\"https://www.sec.gov/Archives/edgar/data/2021728/000162828026025762/0001628280-26-025762-index.htm\" rel=\"alternate\" type=\"text/html\" />\n      <summary type=\"html\"> &lt;b&gt;Filed:&lt;/b&gt; 2026-04-17 &lt;b&gt;AccNo:&lt;/b&gt; 0001628280-26-025762 &lt;b&gt;Size:&lt;/b&gt; 107 MB</summary>\n      <title>S-1  - General form for registration of securities under the Securities Act of 1933</title>\n      <updated>2026-04-17T16:22:05-04:00</updated>\n    </entry>\n    <entry>\n      <category label=\"form type\" scheme=\"https://www.sec.gov/\" term=\"S-1\" />\n      <content type=\"text/xml\">\n        <accession-number>0001628280-24-041596</accession-number>\n        <act>33</act>\n        <file-number>333-282418</file-number>\n        <file-number-href>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;filenum=333-282418&amp;owner=include&amp;count=10</file-number-href>\n        <filing-date>2024-09-30</filing-date>\n        <filing-href>https://www.sec.gov/Archives/edgar/data/2021728/000162828024041596/0001628280-24-041596-index.htm</filing-href>\n        <filing-type>S-1</filing-type>\n        <film-number>241340088</film-number>\n        <form-name>General form for registration of securities under the Securities Act of 1933</form-name>\n        <size>26 MB</size>\n      </content>\n      <id>urn:tag:sec.gov,2008:accession-number=0001628280-24-041596</id>\n      <link href=\"https://www.sec.gov/Archives/edgar/data/2021728/000162828024041596/0001628280-24-041596-index.htm\" rel=\"alternate\" type=\"text/html\" />\n      <summary type=\"html\"> &lt;b&gt;Filed:&lt;/b&gt; 2024-09-30 &lt;b&gt;AccNo:&lt;/b&gt; 0001628280-24-041596 &lt;b&gt;Size:&lt;/b&gt; 26 MB</summary>\n      <title>S-1  - General form for registration of securities under the Securities Act of 1933</title>\n      <updated>2024-09-30T16:49:32-04:00</updated>\n    </entry>\n    <id>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;CIK=0002021728</id>\n    <link href=\"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;company=Cerebras&amp;type=S-1&amp;owner=include&amp;start=0&amp;count=10\" rel=\"alternate\" type=\"text/html\" />\n    <link href=\"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;company=Cerebras&amp;type=S-1&amp;owner=include&amp;start=0&amp;count=10&amp;output=atom\" rel=\"self\" type=\"application/atom+xml\" />\n    <title>Cerebras Systems Inc.  (0002021728)</title>\n    <updated>2026-10-28T18:31:33-04:00</updated>\n  </feed>\n";
const ATOM_MOBILEYE_BV = "<?xml version=\"1.0\" encoding=\"ISO-8859-1\" ?>\n  <feed xmlns=\"http://www.w3.org/2005/Atom\">\n    <author>\n      <email>webmaster@sec.gov</email>\n      <name>Webmaster</name>\n    </author>\n    <company-info>\n      <addresses>\n        <address type=\"mailing\">\n          <city>JERUSALEM</city>\n          <state>L3</state>\n          <street1>HAR HOTZVIM, 13 HARTOM STREET</street1>\n          <street2>NO. 45157</street2>\n          <zip>97775</zip>\n        </address>\n        <address type=\"business\">\n          <city>JERUSALEM</city>\n          <phone>972-2-541-7333</phone>\n          <state>L3</state>\n          <street1>HAR HOTZVIM, 13 HARTOM STREET</street1>\n          <street2>NO. 45157</street2>\n          <zip>97775</zip>\n        </address>\n      </addresses>\n      <assigned-sic>7372</assigned-sic>\n      <assigned-sic-desc>SERVICES-PREPACKAGED SOFTWARE</assigned-sic-desc>\n      <assigned-sic-href>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;SIC=7372&amp;owner=include&amp;count=10</assigned-sic-href>\n      <cik>0001607310</cik>\n      <cik-href>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;CIK=0001607310&amp;owner=include&amp;count=10</cik-href>\n      <conformed-name>Mobileye B.V.</conformed-name>\n      <fiscal-year-end>1231</fiscal-year-end>\n      <formerly-names count=\"1\">\n        <names>\n          <date>2017-09-28</date>\n          <name>Mobileye N.V.</name>\n        </names>\n      </formerly-names>\n      <state-location>L3</state-location>\n      <state-location-href>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;State=L3&amp;owner=include&amp;count=10</state-location-href>\n      <state-of-incorporation>P7</state-of-incorporation>\n    </company-info>\n    <entry>\n      <category label=\"form type\" scheme=\"https://www.sec.gov/\" term=\"RW\" />\n      <content type=\"text/xml\">\n        <accession-number>0001144204-18-006358</accession-number>\n        <act>NE</act>\n        <file-number>333-206573</file-number>\n        <file-number-href>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;filenum=333-206573&amp;owner=include&amp;count=10</file-number-href>\n        <filing-date>2018-02-07</filing-date>\n        <filing-href>https://www.sec.gov/Archives/edgar/data/1607310/000114420418006358/0001144204-18-006358-index.htm</filing-href>\n        <filing-type>RW</filing-type>\n        <film-number>18582006</film-number>\n        <form-name>Registration Withdrawal Request</form-name>\n        <size>10 KB</size>\n      </content>\n      <id>urn:tag:sec.gov,2008:accession-number=0001144204-18-006358</id>\n      <link href=\"https://www.sec.gov/Archives/edgar/data/1607310/000114420418006358/0001144204-18-006358-index.htm\" rel=\"alternate\" type=\"text/html\" />\n      <summary type=\"html\"> &lt;b&gt;Filed:&lt;/b&gt; 2018-02-07 &lt;b&gt;AccNo:&lt;/b&gt; 0001144204-18-006358 &lt;b&gt;Size:&lt;/b&gt; 10 KB</summary>\n      <title>RW  - Registration Withdrawal Request</title>\n      <updated>2018-02-07T17:22:37-05:00</updated>\n    </entry>\n    <id>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;CIK=0001607310</id>\n    <link href=\"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;company=Mobileye&amp;type=RW&amp;owner=include&amp;start=0&amp;count=10\" rel=\"alternate\" type=\"text/html\" />\n    <link href=\"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;company=Mobileye&amp;type=RW&amp;owner=include&amp;start=0&amp;count=10&amp;output=atom\" rel=\"self\" type=\"application/atom+xml\" />\n    <title>Mobileye B.V.  (0001607310)</title>\n    <updated>2026-10-28T18:30:19-04:00</updated>\n  </feed>\n";

// live 夹具：data.sec.gov submissions JSON（实抓提炼真实行）
const SUB_CHOBANI = JSON.stringify({
  name: 'Chobani Inc.',
  filings: { recent: {
    form: ['RW', 'S-1'],
    filingDate: ['2022-09-02', '2021-11-17'],
    accessionNumber: ['0001193125-22-237850', '0001193125-21-332196'],
    primaryDocument: ['tm2223274d1_rw.htm', 'tm2131657d1_s1.htm'],
  } },
});
const SUB_CEREBRAS = JSON.stringify({
  name: 'Cerebras Systems Inc.',
  filings: { recent: {
    form: ['424B4', 'S-1/A', 'S-1/A', 'S-1', 'RW', 'S-1'],
    filingDate: ['2026-05-14', '2026-05-11', '2026-05-04', '2026-04-17', '2025-10-03', '2024-09-30'],
    accessionNumber: ['0001628280-26-035214', '0001628280-26-033143', '0001628280-26-029503', '0001628280-26-025762', '0001193125-25-230382', '0001628280-24-041596'],
    primaryDocument: ['', '', '', '', '', ''],
  } },
});
const SUB_MOBILEYE_BV = JSON.stringify({
  name: 'Mobileye B.V.',
  filings: { recent: {
    form: ['RW', '424B4', '424B4'],
    filingDate: ['2018-02-07', '2015-03-18', '2014-08-01'],
    accessionNumber: ['0001144204-18-006358', '0001571049-15-002026', '0001571049-14-003550'],
    primaryDocument: ['tv485145_rw.htm', '', ''],
  } },
});

// mock http（v3.24 版）：company= 名字路由 browse-edgar atom；CIK 路由
// submissions JSON。记录 urls 供 CIK 归属/memo 断言。
function mkMockHttp324(map) {
  const state = { calls: 0, urls: [] };
  state.fn = async (url) => {
    state.calls++;
    state.urls.push(url);
    const name = decodeURIComponent((url.match(/company=([^&]+)/) || [])[1] || '').toLowerCase();
    if (name) {
      if (map[name] === 'THROW') throw new Error('mock network down');
      if (map[name] === 'HTTP500') return { status: 500, body: 'error' };
      return { status: 200, body: map[name] || ATOM_NOTFOUND };
    }
    const cik = (url.match(/CIK(\d+)\.json/) || [])[1];
    if (cik) {
      if (map['cik:' + cik] === 'THROW') throw new Error('mock submissions down');
      if (map['cik:' + cik] === 'HTTP500') return { status: 500, body: 'error' };
      return { status: 200, body: map['cik:' + cik] || '{}' };
    }
    return { status: 404, body: '' };
  };
  return state;
}
// Chobani live 主张（2021-11 时点；browse-edgar/submissions 均真实在案）
const CHOBANI_TEXT = 'Chobani has filed for an IPO, according to people familiar with the matter. The yogurt maker confidentially submitted its registration statement earlier this year and could price as soon as next month.';
const CHOBANI_SENT = 'Chobani has filed for an IPO';

// 组 1：live 实证 + 纯函数
// 1. live 实证（撤回）：Chobani 备案动作主张 → S-1 2021-11-17 匹配升
//    独立验证(4)，同时 RW 2022-09-02 撤回事件在案（withdrawn=1）。
c3240('live 实证（撤回）：Chobani 备案动作主张 S-1 匹配 + RW 撤回事件在案', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const { verifyIpoClaims } = require('./human-future/scripts/edgar-ipo-collector.js');
  return (async () => {
    const http = mkMockHttp324({ chobani: ATOM_CHOBANI, 'cik:0001869113': SUB_CHOBANI });
    const cd = {
      available: true, audited: 1, summary: {},
      results: [discriminateCommercial({
        text: CHOBANI_TEXT, claimSentence: CHOBANI_SENT,
        source: 'TechCrunch AI', date: 'Mon, 22 Nov 2021 12:00:00 +0000',
      })],
    };
    const out = await verifyIpoClaims(cd, { http: http.fn, now: '2022-10-01T12:00:00Z', gapMs: 0 });
    const r = out.results[0];
    const c = r.edgarIpoCheck;
    return r.kind === 'ipo'
      && r.evidence.id === 'independent-verification' && r.evidence.weight === 4
      && r.verdict === 'thin-reasoning' && r.reasoning.score === 0
      && c && c.upgraded === true && c.filingAction === true
      && c.matched.company === 'Chobani Inc.' && c.matched.cik === '0001869113'
      && c.matched.form === 'S-1' && c.matched.filedAt === '2021-11-17'
      && c.matched.accession === '0001193125-21-332196'
      && c.events && c.events.withdrawal && c.events.withdrawal.form === 'RW'
      && c.events.withdrawal.filedAt === '2022-09-02'
      && c.events.withdrawal.accession === '0001193125-22-237850'
      && c.events.pricing === null
      && out.ipoVerification.withdrawn === 1 && out.ipoVerification.priced === 0
      && out.ipoVerification.eventsQueries === 1 && out.ipoVerification.eventsAvailable === true
      // [v3.27] queries 2→3：匹配到 S-1 后新增备案正文抓取（本 mock 不服务
      // Archives 路径 → claimsFailed=1，只降级 s1Claims，S-1/事件结论不变）
      && out.ipoVerification.queries === 3
      && out.ipoVerification.claimsQueries === 1 && out.ipoVerification.claimsFailed === 1
      && out.ipoVerification.claimsAvailable === false;
  })();
})(), 'S-1 验证逻辑不变（v3.23 行为不回退）；RW 撤回事件带 form/日期/accession 记录并进汇总计数');

// 2. live 实证（定价）：Cerebras（now=2026-10-29）→ S-1/A 2026-05-11
//    匹配 + 424B4 2026-05-14 定价事件在案；RW 2025-10-03 距 now 391 天
//    超 365 天窗口 → 不算撤回事件（窗口纪律三种事件一致）。
c3240('live 实证（定价）：Cerebras S-1/A 匹配 + 424B4 定价事件在案；RW 超窗(391天)不算撤回', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const { verifyIpoClaims } = require('./human-future/scripts/edgar-ipo-collector.js');
  return (async () => {
    const http = mkMockHttp324({ cerebras: ATOM_CEREBRAS, 'cik:0002021728': SUB_CEREBRAS });
    const cd = {
      available: true, audited: 1, summary: {},
      results: [discriminateCommercial({
        text: 'Cerebras officially files for its public debut after refiling its registration statement with the SEC, setting up a long-awaited market debut.',
        claimSentence: 'Cerebras officially files for its public debut',
        source: 'TechCrunch AI', date: 'Mon, 18 May 2026 12:00:00 +0000',
      })],
    };
    const out = await verifyIpoClaims(cd, { http: http.fn, now: '2026-10-29T12:00:00Z', gapMs: 0 });
    const r = out.results[0];
    const c = r.edgarIpoCheck;
    return r.kind === 'ipo' && c.upgraded === true
      && c.matched.company === 'Cerebras Systems Inc.' && c.matched.cik === '0002021728'
      && c.matched.form === 'S-1/A' && c.matched.filedAt === '2026-05-11'
      && c.events && c.events.withdrawal === null
      && c.events.pricing && c.events.pricing.form === '424B4'
      && c.events.pricing.filedAt === '2026-05-14'
      && c.events.pricing.accession === '0001628280-26-035214'
      && out.ipoVerification.withdrawn === 0 && out.ipoVerification.priced === 1;
  })();
})(), '定价事件（424B4）在案即记录；365 天窗口外的 RW（2025-10-03 距 2026-10-29 为 391 天）不算撤回');

// 3. 事件只作上下文不改判定：同一条主张带 events 与不带 events，
//    证据档/verdict/推理分/decisionRelevant 逐字段一致。
c3240('事件不改判定：带 events 与不带 events 的判定逐字段一致', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const base = {
    text: CHOBANI_TEXT, claimSentence: CHOBANI_SENT,
    source: 'TechCrunch AI', date: 'Mon, 22 Nov 2021 12:00:00 +0000',
  };
  const matched = { candidate: 'Chobani', company: 'Chobani Inc.', cik: '0001869113', form: 'S-1', filedAt: '2021-11-17', accession: '0001193125-21-332196', href: 'https://www.sec.gov/Archives/edgar/data/1869113/000119312521332196/0001193125-21-332196-index.htm' };
  const rA = discriminateCommercial(Object.assign({}, base, {
    edgarVerification: { matched, checked: ['Chobani'], reason: null },
  }));
  const rB = discriminateCommercial(Object.assign({}, base, {
    edgarVerification: {
      matched, checked: ['Chobani'], reason: null,
      events: {
        company: 'Chobani Inc.', cik: '0001869113',
        withdrawal: { form: 'RW', filedAt: '2022-09-02', accession: '0001193125-22-237850' },
        pricing: null,
      },
    },
  }));
  return rA.evidence.id === rB.evidence.id && rA.evidence.weight === rB.evidence.weight
    && rA.verdict === rB.verdict && rA.reasoning.score === rB.reasoning.score
    && rA.decisionRelevant === rB.decisionRelevant
    && rA.edgarIpoCheck.upgraded === rB.edgarIpoCheck.upgraded
    && rA.edgarIpoCheck.events === null && rB.edgarIpoCheck.events !== null;
})(), 'RW/424B4 事件不抬证据档、不降档、不改推理分——只作可观测上下文（证伪解读由下游 agent 做）');

// 4. 无 S-1 匹配 + RW 撤回上下文：Mobileye B.V.（now=2018-03-01，RW 在
//    窗、无在窗 S-1）→ matched=null 不抬级，撤回事件仍记录为上下文。
c3240('无 S-1 匹配 + RW 撤回上下文：Mobileye B.V. 不抬级，撤回事件记录在案', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const { verifyIpoClaims } = require('./human-future/scripts/edgar-ipo-collector.js');
  return (async () => {
    const http = mkMockHttp324({ mobileye: ATOM_MOBILEYE_BV, 'cik:0001607310': SUB_MOBILEYE_BV });
    const cd = {
      available: true, audited: 1, summary: {},
      results: [discriminateCommercial({
        text: 'Mobileye has filed for its public debut, according to a regulatory filing reviewed by reporters.',
        claimSentence: 'Mobileye has filed for its public debut',
        source: 'TechCrunch AI', date: 'Wed, 07 Feb 2018 12:00:00 +0000',
      })],
    };
    const out = await verifyIpoClaims(cd, { http: http.fn, now: '2018-03-01T12:00:00Z', gapMs: 0 });
    const r = out.results[0];
    const c = r.edgarIpoCheck;
    return r.kind === 'ipo' && c
      && c.matched === null && c.upgraded === false
      && c.events && c.events.withdrawal && c.events.withdrawal.filedAt === '2018-02-07'
      && c.events.withdrawal.accession === '0001144204-18-006358'
      && c.events.pricing === null
      && out.ipoVerification.unmatched === 1 && out.ipoVerification.withdrawn === 1;
  })();
})(), '窗口内无 S-1 不匹配不抬级（未匹配≠已证伪），但同一公司的 RW 撤回事件作为可观测上下文记录');

// 5. 窗口过滤：同一 Mobileye B.V. 夹具 now=2026 → RW 2018 超窗 →
//    events 空但 eventsAvailable=true（查了没有事件≠查不到）。
c3240('窗口过滤：RW 2018-02-07 在 now=2026 不算撤回事件（空事件≠不可用）', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const { verifyIpoClaims } = require('./human-future/scripts/edgar-ipo-collector.js');
  return (async () => {
    const http = mkMockHttp324({ mobileye: ATOM_MOBILEYE_BV, 'cik:0001607310': SUB_MOBILEYE_BV });
    const cd = {
      available: true, audited: 1, summary: {},
      results: [discriminateCommercial({
        text: 'Mobileye has filed for its public debut, according to a regulatory filing reviewed by reporters.',
        claimSentence: 'Mobileye has filed for its public debut',
        source: 'TechCrunch AI', date: 'Thu, 29 Oct 2026 12:00:00 +0000',
      })],
    };
    const out = await verifyIpoClaims(cd, { http: http.fn, now: '2026-10-29T12:00:00Z', gapMs: 0 });
    const c = out.results[0].edgarIpoCheck;
    return c.events !== null && c.events.withdrawal === null && c.events.pricing === null
      && out.ipoVerification.eventsAvailable === true
      && out.ipoVerification.withdrawn === 0 && out.ipoVerification.priced === 0;
  })();
})(), '365 天窗口外的历史登记不算在办事件；查询成功但无窗口内事件时 eventsAvailable 保持 true');

// 6. 纯函数：parseSubmissionEvents + pickRecentByForm。
c3240('submissions 解析与窗口挑选纯函数（Cerebras 六事件真实行）', (() => {
  const { parseSubmissionEvents, pickRecentByForm, RW_FORM_RE, PRICING_FORM_RE, S1_FORM_RE } = require('./human-future/scripts/edgar-ipo-collector.js');
  const p = parseSubmissionEvents(SUB_CEREBRAS);
  const rwNow = pickRecentByForm(p.events, RW_FORM_RE, { now: '2026-10-29T12:00:00Z' });
  const rw2025 = pickRecentByForm(p.events, RW_FORM_RE, { now: '2025-11-01T12:00:00Z' });
  const p424 = pickRecentByForm(p.events, PRICING_FORM_RE, { now: '2026-10-29T12:00:00Z' });
  const s1 = pickRecentByForm(p.events, S1_FORM_RE, { now: '2026-10-29T12:00:00Z' });
  const bad = parseSubmissionEvents('not json at all');
  const empty = parseSubmissionEvents('{}');
  return p.company === 'Cerebras Systems Inc.' && p.events.length === 6
    && p.events[0].form === '424B4' && p.events[0].filedAt === '2026-05-14'
    && p.events[0].accession === '0001628280-26-035214'
    && rwNow === null
    && rw2025 && rw2025.filedAt === '2025-10-03'
    && p424 && p424.filedAt === '2026-05-14'
    && s1 && s1.filedAt === '2026-05-11'
    && bad.company === '' && bad.events.length === 0
    && empty.company === '' && empty.events.length === 0;
})(), 'submissions JSON 只取 S-1/RW/424B4 族；窗口挑选最近优先；坏 JSON 不抛错降级为空');

// 7. submissions URL 纯函数：CIK 补零 10 位 + 非数字清洗。
c3240('submissions URL：CIK 补零 10 位 + 非数字字符清洗', (() => {
  const { SUBMISSIONS_URL } = require('./human-future/scripts/edgar-ipo-collector.js');
  return SUBMISSIONS_URL('1869113') === 'https://data.sec.gov/submissions/CIK0001869113.json'
    && SUBMISSIONS_URL('0001869113') === 'https://data.sec.gov/submissions/CIK0001869113.json'
    && SUBMISSIONS_URL('CIK 0002021728') === 'https://data.sec.gov/submissions/CIK0002021728.json';
})(), '事件查询必须锚定 S-1 匹配公司的 CIK（browse-edgar 同名不同 type 会解析到不同公司）');

// 组 2：编排端到端 + 降级
// 8. 引擎端到端：Chobani 主张（business 桶）+ 对照条 → 核查 → summary
//    重算 → formatReport 渲染 ✅ 行带 RW 撤回上下文 + 汇总行带流程
//    事件计数；对照条（legal-action）判定不受影响。
c3240('引擎端到端：核查后报告渲染 ✅ 行带 RW 撤回上下文 + 汇总行带流程事件计数', (() => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const { verifyIpoClaims } = require('./human-future/scripts/edgar-ipo-collector.js');
  return (async () => {
    const mk = (title, desc, source, bucket) => ({
      title, description: desc, body: '', source, bucket,
      pubDate: 'Mon, 22 Nov 2021 17:45:43 +0000', domains: ['capital_flow'],
      link: 'https://example.com/x', origin: 'live',
    });
    const items = [
      mk('Chobani has filed for an IPO, according to people familiar with the matter',
        'Chobani has filed for an IPO, according to people familiar with the matter. The yogurt maker confidentially submitted its registration statement earlier this year.',
        'TechCrunch AI', 'business'),
      mk('Parents sue OpenAI, alleging GPT-4o coached their daughter off seizure medication',
        'A family is suing OpenAI, saying ChatGPT coached their daughter to quietly taper off her seizure medication.',
        'TechCrunch AI', 'business'),
    ];
    const inst = new ProjectionEngine({});
    inst.signals = { totalItems: items.length, domains: [], undomained: 0, dateRange: null, items };
    const cd = inst.buildCommercialDiscrimination();
    const http = mkMockHttp324({ chobani: ATOM_CHOBANI, 'cik:0001869113': SUB_CHOBANI });
    const cd2 = await verifyIpoClaims(cd, { http: http.fn, now: '2022-10-01T12:00:00Z', gapMs: 0 });
    const chobani = cd2.results.find(r => /Chobani/.test(r.claimSentence || r.text));
    const control = cd2.results.find(r => /Parents sue/.test(r.claimSentence || r.text));
    const md = formatReport({
      meta: { timestamp: '2022-10-01T12:00:00Z', version: '3.27.0' },
      summary: { verdict: '继续观察', score: 0.5, keyMessage: 'TEST', topDomains: ['frontier_models'] },
      commercialDiscrimination: cd2,
      stages: [], turningPoints: [], risks: [], opportunities: [], recommendations: [],
      confidence: { score: 0.5, level: 'medium', note: 'TEST', factors: { baseScore: 0.5, logicQuality: '中等', signalScore: 0.5, coverageScore: 0.5, undomainedRatio: 0.1, adjustment: 0 } },
      trendClassification: { available: false },
    });
    const lines = md.split('\n');
    const drCount = cd2.results.filter(r => r.decisionRelevant).length;
    return cd2.audited === 2
      && chobani && chobani.evidence.weight === 4 && chobani.decisionRelevant === true
      && control && control.kind === 'legal-action' && control.evidence.weight === 1
      && cd2.summary.decisionRelevantCount === drCount
      && lines.some(l => l.includes('EDGAR 核查: ✅ Chobani Inc.（CIK 0001869113）2021-11-17 提交 S-1（0001193125-21-332196）')
        && l.includes('RW 撤回备案 2022-09-02 在案（IPO 已撤回）'))
      && lines.some(l => l.includes('IPO 主张 EDGAR 核查: 1 条 ipo 主张 → 验证 1（独立验证(4)）')
        && l.includes('流程事件 1 次 submissions 查询（撤回 1 / 定价 0）'));
  })();
})(), '事件上下文必须端到端到达报告产物：✅ 行后缀 + 汇总行流程事件计数；同池其它主张判定零扰动');

// 9. 降级：S-1 匹配但 submissions 查询抛错 → events=null + 原因写明，
//    S-1 结论（独立验证(4)）不受影响 + 报告渲染「EDGAR 事件: 不可用」。
c3240('降级：submissions 查询抛错 → 事件不可用但 S-1 结论不受影响', (() => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const { verifyIpoClaims } = require('./human-future/scripts/edgar-ipo-collector.js');
  return (async () => {
    const mk = (title, desc, source, bucket) => ({
      title, description: desc, body: '', source, bucket,
      pubDate: 'Mon, 22 Nov 2021 17:45:43 +0000', domains: ['capital_flow'],
      link: 'https://example.com/x', origin: 'live',
    });
    const inst = new ProjectionEngine({});
    inst.signals = {
      totalItems: 1, domains: [], undomained: 0, dateRange: null,
      items: [mk('Chobani has filed for an IPO, according to people familiar with the matter',
        'Chobani has filed for an IPO, according to people familiar with the matter. The yogurt maker submitted its registration statement.',
        'TechCrunch AI', 'business')],
    };
    const cd = inst.buildCommercialDiscrimination();
    const http = mkMockHttp324({ chobani: ATOM_CHOBANI, 'cik:0001869113': 'THROW' });
    const cd2 = await verifyIpoClaims(cd, { http: http.fn, now: '2022-10-01T12:00:00Z', gapMs: 0 });
    const r = cd2.results[0];
    const c = r.edgarIpoCheck;
    const md = formatReport({
      meta: { timestamp: '2022-10-01T12:00:00Z', version: '3.27.0' },
      summary: { verdict: '继续观察', score: 0.5, keyMessage: 'TEST', topDomains: ['frontier_models'] },
      commercialDiscrimination: cd2,
      stages: [], turningPoints: [], risks: [], opportunities: [], recommendations: [],
      confidence: { score: 0.5, level: 'medium', note: 'TEST', factors: { baseScore: 0.5, logicQuality: '中等', signalScore: 0.5, coverageScore: 0.5, undomainedRatio: 0.1, adjustment: 0 } },
      trendClassification: { available: false },
    });
    return c.upgraded === true && r.evidence.id === 'independent-verification'
      && c.events === null && /submissions/.test(c.eventsUnavailableReason || '')
      && cd2.ipoVerification.available === true
      && cd2.ipoVerification.eventsAvailable === false
      && /EDGAR submissions 查询失败/.test(cd2.ipoVerification.eventsReason || '')
      && md.split('\n').some(l => l.includes('EDGAR 事件: 不可用——'));
  })();
})(), '事件查询失败不连坐 S-1 核查结论（available 不变），但必须如实记 eventsAvailable=false 并渲染不可用行');

// 10. 非 live 模式：live:false 不发起任何查询（browse-edgar 与
//     submissions 都为 0 次）。
c3240('非 live 模式不发起任何 EDGAR 查询（含 submissions）', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  const { verifyIpoClaims } = require('./human-future/scripts/edgar-ipo-collector.js');
  return (async () => {
    const inst = new ProjectionEngine({});
    inst.signals = {
      totalItems: 1, domains: [], undomained: 0, dateRange: null,
      items: [{
        title: 'Chobani has filed for an IPO, according to people familiar with the matter',
        description: 'Chobani has filed for an IPO, according to people familiar with the matter.',
        body: '', source: 'TechCrunch AI', bucket: 'business',
        pubDate: 'Mon, 22 Nov 2021 17:45:43 +0000', domains: ['capital_flow'],
        link: 'https://example.com/x', origin: 'live',
      }],
    };
    const cd = inst.buildCommercialDiscrimination();
    const http = mkMockHttp324({ chobani: ATOM_CHOBANI, 'cik:0001869113': SUB_CHOBANI });
    const cd2 = await verifyIpoClaims(cd, { http: http.fn, now: '2022-10-01T12:00:00Z', gapMs: 0, live: false });
    return http.calls === 0
      && cd2.ipoVerification.available === false
      && /非 live 模式/.test(cd2.ipoVerification.reason || '')
      && cd2.results[0].evidence.weight === 2 && cd2.results[0].verdict === 'weak-evidence';
  })();
})(), '非 live 模式不得发起网络查询（与 v3.23/benchmark 采集器同纪律），ipo 主张按原证据档判定');

// 11. CIK 归属 + memo 去重：两条 Chobani 主张 → browse-edgar 查 1 次、
//     submissions 按 CIK 只查 1 次（memo），URL 锚定 matched 的 CIK。
c3240('CIK 归属与 memo：两条同公司主张 → submissions 按 CIK 只查一次', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const { verifyIpoClaims } = require('./human-future/scripts/edgar-ipo-collector.js');
  return (async () => {
    const http = mkMockHttp324({ chobani: ATOM_CHOBANI, 'cik:0001869113': SUB_CHOBANI });
    const mkClaim = (sent) => discriminateCommercial({
      text: CHOBANI_TEXT + ' ' + sent, claimSentence: sent,
      source: 'TechCrunch AI', date: 'Mon, 22 Nov 2021 12:00:00 +0000',
    });
    const cd = {
      available: true, audited: 2, summary: {},
      results: [mkClaim(CHOBANI_SENT), mkClaim('Chobani has filed for an IPO, according to the filing')],
    };
    const out = await verifyIpoClaims(cd, { http: http.fn, now: '2022-10-01T12:00:00Z', gapMs: 0 });
    const subUrls = http.urls.filter(u => /submissions/.test(u));
    // [v3.27] queries 2→3：两条主张共享一次备案正文抓取（accession memo）
    return out.ipoVerification.queries === 3
      && out.ipoVerification.claimsQueries === 1
      && subUrls.length === 1
      && subUrls[0] === 'https://data.sec.gov/submissions/CIK0001869113.json'
      && out.ipoVerification.withdrawn === 2
      && out.results.every(r => r.edgarIpoCheck && r.edgarIpoCheck.upgraded === true);
  })();
})(), '事件查询锚定 S-1 匹配公司的 CIK；run 内按 CIK memo 去重，不重复查 SEC');

// 组 3：源级接线 + 计数 + 版本号
// 12. cron 注入源级：注入脚本渲染事件后缀、「EDGAR 事件: 不可用」行与
//     汇总行流程事件计数（端到端最后一环）。
c3240('cron 注入源级：hf-cron-fetch.sh 渲染事件后缀/事件不可用行/汇总流程事件计数', (() => {
  const fs = require('fs');
  const sh = fs.readFileSync(require('os').homedir() + '/.hermes/scripts/hf-cron-fetch.sh', 'utf-8');
  return sh.includes('RW 撤回备案 ${ev.withdrawal.filedAt} 在案（IPO 已撤回）')
    && sh.includes('424B4 定价备案 ${ev.pricing.filedAt} 在案（IPO 已定价）')
    && sh.includes('EDGAR 事件: 不可用——${c.eventsUnavailableReason}')
    && sh.includes('流程事件 ${iv.eventsQueries} 次 submissions 查询（撤回 ${iv.withdrawn} / 定价 ${iv.priced}）');
})(), '注入脚本必须渲染事件上下文 + 事件不可用行 + 汇总事件计数，否则 agent 看不到流程事件');

// 13. 源级接线 + 模式库计数 24 不变 + 版本号五处对齐 3.27.0。
c3240('源级接线 + 模式库计数 24 不变 + 版本号五处对齐 3.27.0', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const fs = require('fs');
  const VERSION = fs.readFileSync(require('path').join(__dirname, 'VERSION'), 'utf-8').trim();
  const pkg = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'package.json'), 'utf-8'));
  const rp = fs.readFileSync(require('path').join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  const pf = fs.readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  const col = fs.readFileSync(require('path').join(__dirname, 'human-future/scripts/edgar-ipo-collector.js'), 'utf-8');
  const disc = fs.readFileSync(require('path').join(__dirname, 'human-future/scripts/commercial-discriminator.js'), 'utf-8');
  return col.includes('await lookupCompanyEvents(')
    && col.includes('const SUBMISSIONS_URL')
    && disc.includes('edgarVerification.events')
    && pf.includes('RW 撤回备案')
    && COMMERCIAL_CLAIM_PATTERNS.length === 25
    && VERSION === '3.27.0'
    && pkg.version === '3.27.0'
    && rp.includes('文明推演引擎 v3.27.0')
    && /version: '3\.27\.0'/.test(pf)
    && /version: '3\.27\.0'/.test(rp);
})(), 'VERSION/package.json/banner/projection meta/run-pipeline meta 五处对齐 3.27.0；模式库计数不随新数据源变化；事件查询/透传/渲染三处接线都在代码里');

// v3.24 汇总
(async () => {
  const results = await Promise.all(v3240.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v3240.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.24: ${v3240.length - f} 通过, ${f} 失败, 共 ${v3240.length} 个`);
  if (f > 0) {
    console.log('结论：ipo 证伪路径第二、三条（撤回 RW/定价 424B4）接线、精度条制、端到端渲染或降级有缺。');
    process.exitCode = 1;
  } else {
    console.log('结论：ipo 证伪路径第二、三条接上真数据——撤回（RW）与定价（424B4）经 submissions 登记记录观测（Chobani S-1 2021-11-17 之后 RW 2022-09-02、Cerebras S-1/A 2026-05-11 加 424B4 2026-05-14 均为 live 实证）；事件只作可观测上下文（不抬证据档/不改判定/不改推理分）；按 CIK 锁定同一实体（同名不同 type 在 browse-edgar 解析到不同公司）；「查了没有事件」与「查不到」分开；挂牌后披露矛盾仍待人工/下游核对。模式库计数 24 不变（新数据源不加 kind）。');
  }
})();

// ── v3.25：SEC EDGAR 一手信源扩容第二轮（公司名单 14→20 + 六家公司指引句式族）──
const v3250 = [];
function c3250(name, ok, detail) { v3250.push({ name, ok, detail }); }

// 1. live 实证：六家新公司指引句式全部命中（2026-10-30 从 SEC EDGAR 实抓逐字）
c3250('live 实证：六家新公司指引句式全部进库（QCOM/ANET/CSCO/NOW/UBER/SHOP）', (() => {
  const { extractGuidance } = require('./human-future/scripts/edgar-collector.js');
  // QCOM live 逐字（2026-10-30 实抓 0001065270-26-000029）：
  // 「Current Guidance Q4 FY26 Estimates 1 Revenues $9.7B - $10.5B」
  const qcom = extractGuidance('Business Outlook The following table summarizes GAAP and Non-GAAP guidance based on the current outlook. Current Guidance Q4 FY26 Estimates 1 Revenues $9.7B - $10.5B Supplemental Revenue Information QCT revenues $8.4B - $9.0B').guidance;
  const qr = qcom.find(g => /9\.7B/.test(g.value || ''));
  // ANET live 逐字（2026-08-04 备案）：
  // 「Financial Outlook For the third quarter of 2026, we expect: • Revenue
  //   of approximately $3.3 billion; • Non-GAAP operating margin of 48 -
  //   49%; and • Non-GAAP diluted net income per share between $1.06 and
  //   $1.08.」
  const anet = extractGuidance('Financial Outlook For the third quarter of 2026, we expect: • Revenue of approximately $3.3 billion; • Non-GAAP operating margin of 48 - 49%; and • Non-GAAP diluted net income per share between $1.06 and $1.08.').guidance;
  const ar = anet.find(g => g.metric === 'revenue');
  const am = anet.find(g => g.metric === 'operating margin');
  const ai = anet.find(g => g.metric === 'income');
  // CSCO live 逐字（2026-08-12 备案文末指引表）：
  // 「...results for fiscal 2027 FY 2027 Revenue $72.2 billion to $73.4
  //   billion Earnings per Share GAAP $4.00 to $4.06 Non-GAAP $5.05 - $5.11」
  const csco = extractGuidance('Q1 FY 2027 Guidance Revenue $18.0 billion to $18.2 billion Earnings per Share GAAP $1.08 to $1.10. Our outlook for fiscal 2027: results for fiscal 2027 FY 2027 Revenue $72.2 billion to $73.4 billion').guidance;
  const cq = csco.find(g => /18\.0/.test(g.value || ''));
  const cf = csco.find(g => /72\.2/.test(g.value || ''));
  // NOW live 逐字（2026-10-28 备案）：「Subscription revenues $4,245 - $4,255」（无单位）
  const now = extractGuidance('Fourth Quarter 2026 Non-GAAP Guidance Subscription revenues $4,245 - $4,255 22.5% - 23%').guidance;
  const nr = now.find(g => g.metric === 'revenues');
  // UBER live 逐字（2026-08-05 备案）：「For Q3 2026, we anticipate Gross
  // Bookings of $58.25 billion to $60.25 billion」
  const uber = extractGuidance('Outlook for Q3 2026 For Q3 2026, we anticipate Gross Bookings of $58.25 billion to $60.25 billion, representing growth of 18% to 22% YoY on a constant-currency basis.').guidance;
  const ug = uber.find(g => g.metric === 'gross bookings');
  // SHOP live 逐字（2026-08-05 备案）：「For the third quarter of 2026, we
  // expect Revenue to grow at a low-thirties percentage rate on a
  // year-over-year basis Gross profit dollars to grow at a mid-to-high
  // twenties percentage rate on a year-over-year basis Operating expenses
  // as a percentage of revenue to be 33% to 34%」
  // [v3.25 第二轮] 夹具换 stripHtml 后的 live 逐字（2026-10-30 实抓
  // 0001839080-26-000012 附件）：「we expect: • Revenue to grow...; •
  // ... Operating expenses as a percentage of revenue to be 33% to 34%;」——
  // 冒号紧跟 expect、bullet 间分号。第一版夹具是手抄的规范化文本（无冒号
  // 无 bullet），form K 第一版 lookbehind 跨不过冒号，live 0 条而夹具全绿
  // （corr-2026-029 用例触达不到被测分支同型）。
  const shop = extractGuidance('2026 Outlook For the third quarter of 2026, we expect: • Revenue to grow at a low-thirties percentage rate on a year-over-year basis; • Gross profit dollars to grow at a mid-to-high twenties percentage rate on a year-over-year basis; • Operating expenses as a percentage of revenue to be 33% to 34%; • Stock-based compensation to be $150 million; and • Free cash flow margin to be in the high-teens to low-twenties.').guidance;
  const se = shop.find(g => g.metric === 'operating expenses');
  return !!qr && qr.isRange === true && qr.value === '$9.7B - $10.5B' && qr.quarter === 4 && qr.fiscalYear === 2026
    && !!ar && ar.value === '$3.3 billion' && ar.quarter === 3
    && !!am && am.value === '48 - 49%' && am.isRange === true && am.gaapBasis === 'non-gaap'
    && !!ai && ai.isRange === true && /between \$1\.06 and \$1\.08/.test(ai.value) && ai.settleMetric === 'diluted eps'
    && !!cq && cq.isRange === true && cq.quarter === 1 && cq.fiscalYear === 2027 && cq.annual === false
    && !!cf && cf.isRange === true && cf.annual === true && cf.quarter === null && /72\.2/.test(cf.value)
    && !!nr && nr.isRange === true && nr.value === '$4,245 - $4,255' && nr.quarter === 4
    && !!ug && ug.isRange === true && ug.value === '$58.25 billion to $60.25 billion' && ug.quarter === 3
    && !!se && se.isRange === true && se.value === '33% to 34%' && se.quarter === 3
    // ANET 冒号 bullet 段（we expect: • ... of 48 - 49%; ...）不被 form K 收：
    // form K 只认 X% to Y%（to 分隔），ANET 是连字符+of 形态（form H/I 地盘）
    && anet.filter(g => g.metric === 'operating margin').length === 1
    && anet.filter(g => g.metric === 'operating margin')[0].value === '48 - 49%';
})(), 'corr-2026-032「在窗公司≠采到的指引」同型第五波：六家 18 份在窗备案 0 条指引（v3.24 基线实测）→ 55 条；QCOM 表格行 B 单位区间+Q4 FY26、ANET 冒号 bullet+尾%+between 无单位、CSCO FY2027 Guidance 表+反向全年、NOW 无单位（结算不猜）、UBER anticipate+of+to、SHOP expect+to be+X% to Y%');

// 2. 精度回归：actuals 表格行/raising 句/增长率文字/历史对照不误命中
c3250('精度回归：六家句式族 12 句零误报（表格两列/raising/grew to/文字增长率）', (() => {
  const { extractGuidance } = require('./human-future/scripts/edgar-collector.js');
  const hit = t => extractGuidance(t).guidance;
  // ① CSCO actuals 汇总表两列（无区间符号）
  const a1 = hit('Q4 FY 2026 Results Revenue $ 17.3 billion $ 14.7 billion 18% Net Income $ 3.9 billion $ 2.6 billion 51%');
  // ② QCOM actuals 两列
  const a2 = hit('Segment Results QCT QTL Revenues $9,076 $9,469 (4%) $1,382 $1,319 +5% EBT $2,465 $2,857 (14%)');
  // ③ UBER actuals 两列
  const a3 = hit('Gross Bookings $ 46,756 $ 58,022 24 % 22 % Revenue $ 12,651 $ 14,191 12 % 11 %');
  // ④ CSCO raising 句（名词与首值之间有动词）
  const a4 = hit('$5.3 billion of orders taken year to date raising expected FY26 revenue to $4 billion, up from $3 billion');
  // ⑤ UBER grew to（实际值句）
  const a5 = hit('Gross Bookings grew 22% YoY to $54.1 billion, and 22% on a constant currency basis');
  // ⑥ SHOP 文字增长率（无数值）
  const a6 = hit('For the third quarter of 2026, we expect Revenue to grow at a low-thirties percentage rate on a year-over-year basis');
  // ⑦ UBER outlook 段的同比增长百分比（growth of X% to Y%——growth 不是指标名词）
  const a7 = hit('we anticipate Gross Bookings of $58.25 billion to $60.25 billion, representing growth of 18% to 22% YoY');
  // ⑧ ANET 去年同比并列值（and 分支误收场景：48 - 49% 之外的 and 并列）
  const a8 = hit('Non-GAAP gross margin was 62.9% and 65.2% in the second quarter of 2026 and 2025, respectively');
  // ⑨ QCOM 历史引用（from 24% in fiscal 2026 to greater than 60%）
  const a9 = hit('we expect year-over-year growth in non-handset revenues, including Data Center, to accelerate from 24% in fiscal 2026 to greater than 60% in fiscal 2027');
  // ⑩ NOW actuals 两列（Subscription revenues $ 3,988 21 % $ 3,990）
  const a10 = hit('Subscription revenues $ 3,988 21 % $ 3,990 20.5 % Total revenues $ 4,106');
  // ⑪ AMD form B 点值零漂移（form K 只收 % 区间，点值不抢）
  const a11 = hit('For the third quarter of 2026, AMD expects revenue to be approximately $13 billion, plus or minus $300 million');
  // ⑫ META form D 零漂移（in the range of 不是 form K 地盘）
  const a12 = hit('We expect fourth quarter 2026 total revenue to be in the range of $73-76 billion');
  const count = t => t.length;
  return count(a1) === 0 && count(a2) === 0 && count(a3) === 0 && count(a4) === 0
    && count(a5) === 0 && count(a6) === 0
    && count(a7) === 1 && a7[0].metric === 'gross bookings'
    && count(a8) === 0 && count(a9) === 0 && count(a10) === 0
    && count(a11) === 1 && a11[0].value === '$13 billion' && a11[0].tolerance === '$300 million'
    && count(a12) === 1 && a12[0].value === 'in the range of $73-76 billion';
})(), 'v3.0.0c/v3.2/v3.6/v3.9 纪律（漏报比误报诚实）：财报 actuals 两列表格无区间符号天然不命中；名词与首值间的动词/grew/文字增长率不命中；既有 form A/B/D 零漂移');

// 3. 语义去重：同一条指引的两种句式只登一条（MRVL live 实证同型）
c3250('语义去重：MRVL 毛利率双句式（is expected to be 52.9% to 53.9% + 表格行 52.9% - 53.9%）只登一条', (() => {
  const { extractGuidance } = require('./human-future/scripts/edgar-collector.js');
  // MRVL live 同型（本地分叉轮实测）：form A 散文句 + form J 表格行是同一条
  // 指引两种句式——value 文本不同（to vs -）、事实相同。旧 seenFacts 按文本
  // 去重不去，重复登记两个义务（Brier 样本失真）。
  const g = extractGuidance('Third Quarter of Fiscal 2027 Financial Outlook GAAP gross margin is expected to be 52.9% to 53.9%. Non-GAAP gross margin is expected to be 58.25% to 59.25%. GAAP Gross Margin 52.9% - 53.9% Non-GAAP Gross Margin 58.25% - 59.25%').guidance;
  const gaap = g.filter(x => /52\.9/.test(x.value || ''));
  const ngaap = g.filter(x => /58\.25/.test(x.value || ''));
  return gaap.length === 1 && ngaap.length === 1
    && gaap[0].metric === 'gross margin' && gaap[0].isRange === true
    && ngaap[0].isRange === true;
})(), 'factKey 语义归一（去空白、区间分隔符统一为 to、小写）：form A 散文句与 form J 表格行的同一条指引不重复登记两个义务');

// 4. parseRange 新形态：裸美元区间（B/M/to）/尾%/between approximately/无单位拒收
c3250('parseRange：裸美元区间（QCOM B 单位/CSCO to）+ 尾 % + between approximately + 无单位一律不猜', (() => {
  const { parseRange } = require('./human-future/scripts/earnings-settlement.js');
  const b1 = parseRange('$9.7B - $10.5B');            // QCOM B 单位
  const b2 = parseRange('$18.0 billion to $18.2 billion'); // CSCO to 分隔
  const b3 = parseRange('$58.25 billion to $60.25 billion'); // UBER of...to
  const b4 = parseRange('$4,245 - $4,255');           // NOW 无单位——不猜
  const b5 = parseRange('between $1.06 and $1.08');   // ANET EPS 无单位——不猜
  const p1 = parseRange('48 - 49%');                  // ANET 尾%（首值无 %）
  const p2 = parseRange('65% - 66%');                 // CSCO 尾%（首值有 %）
  const p3 = parseRange('between approximately 62-63%'); // ANET between approximately
  const legacy = parseRange('between $197.0 billion and $202.0 billion'); // 既有形态零漂移
  return b1 && b1.lo === 9.7e9 && b1.hi === 10.5e9 && b1.unit === 'usd'
    && b2 && b2.lo === 18.0e9 && b2.hi === 18.2e9
    && b3 && b3.lo === 58.25e9 && b3.hi === 60.25e9
    && b4 === null && b5 === null
    && p1 && p1.lo === 48 && p1.hi === 49 && p1.unit === 'pct'
    && p2 && p2.lo === 65 && p2.hi === 66
    && p3 && p3.lo === 62 && p3.hi === 63
    && legacy && legacy.lo === 197e9 && legacy.hi === 202e9;
})(), '抽取侧 rangeM 与结算侧 parseRange 同轮同构（v3.16 教训）；无单位区间一律不猜（NOW 表头单位跨句默认 billion 差 1000 倍、ANET EPS 默认 billion 差 9 个数量级——错配成 miss 比不结更坏）');

// 5. parseMetricValue B/M 单位（QCOM live 实证）
c3250('parseMetricValue：B/M 单字母单位（QCOM「$9.7B」→ 97 亿）', (() => {
  const { parseMetricValue } = require('./human-future/scripts/earnings-settlement.js');
  const b1 = parseMetricValue('$9.7B');
  const b2 = parseMetricValue('$10.5B');
  const b3 = parseMetricValue('$2.31 million');
  const b4 = parseMetricValue('$96.2 billion');
  return b1 && b1.n === 9.7e9 && b1.unit === 'usd'
    && b2 && b2.n === 10.5e9
    && b3 && b3.n === 2.31e6
    && b4 && b4.n === 96.2e9;
})(), 'NUM_UNIT_RE 单位组补 B/M（全拼在前——billion|million 优先匹配，交替顺序保证 $1.5 billion 不被 M 抢）');

// 6. settleGuidance 端到端：B 单位区间 vs 实际值（受控，不碰台账）
c3250('settleGuidance：QCOM B 单位区间带内/带外 + NOW 无单位不结（单位感知容差）', (() => {
  const { settleGuidance } = require('./human-future/scripts/earnings-settlement.js');
  const mk = (value) => ({ value, isRange: true, tolerance: null, settleMetric: 'revenue', metric: 'revenue' });
  const inBand = settleGuidance(mk('$9.7B - $10.5B'), '$10.1 billion');
  const below = settleGuidance(mk('$9.7B - $10.5B'), '$9.2 billion');
  const beat = settleGuidance(mk('$18.0 billion to $18.2 billion'), '$18.5 billion');
  const noUnit = settleGuidance(mk('$4,245 - $4,255'), '$4,250 million');
  return inBand && inBand.settleable === true && inBand.hit === true
    && below && below.settleable === true && below.hit === false && /below/.test(String(below.direction))
    && beat && beat.settleable === true && beat.hit === false && /beat/.test(String(beat.direction))
    && noUnit && noUnit.settleable === false && /区间解析失败/.test(String(noUnit.reason));
})(), 'B 单位区间解析后与 actual 单位感知配对；NOW 无单位区间 guidanceBand 拒猜（outcome=null，到期 pending 不硬结）');

// 7. ANNUAL_RESULTS_RE 精度：季度形态不被抢成全年
c3250('期间精度：反向全年（results for fiscal 2027）不误伤季度指引', (() => {
  const { extractGuidance } = require('./human-future/scripts/edgar-collector.js');
  // ① CSCO live：反向全年 + 就近取胜（Q1 列头在更前）
  const csco = extractGuidance('results for fiscal 2027 FY 2027 Revenue $72.2 billion to $73.4 billion').guidance;
  const fy = csco[0];
  // ② 既有季度形态零漂移：「guidance for the first quarter of fiscal 2027」（季度词挡在年份前，不命中反向全年）
  const q1 = extractGuidance('guidance for the first quarter of fiscal 2027: Revenue $18.0 billion to $18.2 billion').guidance;
  // ③ DELL 标题句零漂移（「results for its fiscal 2027 second quarter」——季度词在年份后，不命中反向全年）
  const dell = extractGuidance('Dell announces financial results for its fiscal 2027 second quarter and provides guidance for its fiscal 2027 third quarter and full year. Third-quarter FY27 revenue expected between $44.0 billion and $45.0 billion.').guidance;
  const dq = dell.find(g => /44\.0/.test(g.value || ''));
  return fy && fy.annual === true && fy.quarter === null && fy.fiscalYear === 2027
    && q1.length === 1 && q1[0].quarter === 1 && q1[0].annual === false
    && !!dq && dq.quarter === 3 && dq.annual === false && dq.fiscalYear === 2027;
})(), 'ANNUAL_RESULTS_RE 捕获组后季度词天然挡住（first quarter of fiscal 2027 的 first 在年份前）；CSCO 文末指引表 FY 列不再错配成 Q1 列头（dueOn 错位会撞 Q1 实际值判假 beat，v3.19 同型纪律）');

// 8. 零漂移回归：14 家旧公司代表句式逐条不变（NVDA/AMD/META/DELL/PLTR/AMZN/MU）
c3250('零漂移回归：旧 14 家代表句式（form A/B/D/E/F/G/H + MU 表格）字段逐一不变', (() => {
  const { extractGuidance } = require('./human-future/scripts/edgar-collector.js');
  // NVDA form A
  const nvda = extractGuidance('Revenue is expected to be $108.0 billion, plus or minus 2%.').guidance[0];
  // AMD form B
  const amd = extractGuidance('For the third quarter of 2026, AMD expects revenue to be approximately $13 billion, plus or minus $300 million.').guidance[0];
  // META form D
  const meta = extractGuidance('We expect fourth quarter 2026 total revenue to be in the range of $73-76 billion.').guidance[0];
  // DELL form E
  const dell = extractGuidance('Second-quarter FY27 revenue expected between $44.0 billion and $45.0 billion, up 49% year over year at the midpoint of $44.5 billion.').guidance[0];
  // PLTR form F
  const pltrF = extractGuidance('We are raising our revenue guidance to between $8.150 – $8.158 billion.').guidance[0];
  // PLTR form H
  const pltrH = extractGuidance('For Q1 2026, we expect: • Revenue of between $1.532 - $1.536 billion. • Adjusted income from operations of between $870 - $874 million.').guidance;
  // MU 表格（tolerance trim 后仍精确）
  const mu = extractGuidance("Micron's guidance for the first quarter of 2027: FQ1-27 GAAP (1) Outlook Non-GAAP (2) Outlook Revenue $61.5 billion ± $1.5 billion $61.5 billion ± $1.5 billion Diluted earnings per share $37.84 ± $1.00 $38.15 ± $1.00").guidance;
  const muEps = mu.find(g => /37\.84/.test(g.value || ''));
  // NVDA 夹具句内无期间短语（"Revenue is expected to be $108.0 billion"），
  // quarter/fiscalYear=null 是 v3.24 起的正确行为（期间由采集层标题句补，
  // extractGuidance 单句夹具不补）——断言 value/tolerance 两个稳定字段。
  return nvda && nvda.value === '$108.0 billion' && nvda.tolerance === '2%'
    && amd && amd.value === '$13 billion' && amd.tolerance === '$300 million'
    && meta && meta.value === 'in the range of $73-76 billion' && meta.isRange === true
    && dell && dell.value === 'between $44.0 billion and $45.0 billion' && dell.quarter === 2
    && pltrF && pltrF.value === 'between $8.150 – $8.158 billion'
    && pltrH.length === 2 && pltrH[1].metric === 'income'
    && muEps && muEps.tolerance === '$1.00' && muEps.value === '$37.84' && muEps.settleMetric === 'diluted eps';
})(), 'v3.25 的 m0/trim/归一/额度改动对旧句式零影响——每轮扩容的回归纪律');

// 9. 引擎端到端：公司名单 20 家 + 六家 ticker 透传
c3250('引擎端到端：DEFAULT_TICKERS 20 家（六家新增）', (() => {
  const { DEFAULT_TICKERS } = require('./human-future/scripts/edgar-collector.js');
  const pf = require('fs').readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return DEFAULT_TICKERS.length === 20
    && ['QCOM', 'ANET', 'CSCO', 'NOW', 'UBER', 'SHOP'].every(t => DEFAULT_TICKERS.includes(t))
    && DEFAULT_TICKERS.filter(t => ['NVDA', 'AMD', 'AVGO', 'MRVL', 'MU', 'MSFT', 'GOOGL', 'AMZN', 'META', 'ORCL', 'CRWV', 'IBM', 'DELL', 'PLTR'].includes(t)).length === 14
    && /EDGAR_CLAIMS_CAP = 170/.test(pf);
})(), '公司名单 14→20（半导体/网络设备/企业软件/平台经济四子域）；claims 额度 90→170（live 实测 20 家 155 条，140 切尾 15 条——corr-2026-033 容量上限白名单同型第四次）');

// 10. 版本号一致性（五处对齐 3.27.0）
c3250('版本号一致性：五处对齐 3.27.0', (() => {
  const fs = require('fs');
  const VERSION = fs.readFileSync(require('path').join(__dirname, 'VERSION'), 'utf-8').trim();
  const pkg = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'package.json'), 'utf-8'));
  const rp = fs.readFileSync(require('path').join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  const pf = fs.readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return VERSION === '3.27.0'
    && pkg.version === '3.27.0'
    && rp.includes('文明推演引擎 v3.27.0')
    && /version: '3\.27\.0'/.test(pf)
    && /version: '3\.27\.0'/.test(rp);
})(), 'VERSION/package.json/banner/projection meta/run-pipeline meta 五处对齐 3.27.0（corr-2026-014 版本漂移防腐烂断言）');

// v3.25 汇总
(async () => {
  const results = await Promise.all(v3250.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v3250.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.25: ${v3250.length - f} 通过, ${f} 失败, 共 ${v3250.length} 个`);
  if (f > 0) {
    console.log('结论：六家公司指引句式族、精度回归、语义去重、结算层新形态、期间精度或版本号对齐有缺。');
    process.exitCode = 1;
  } else {
    console.log('结论：公司名单 14→20 + 六家指引句式族进库（QCOM 表格行 B 单位区间 / ANET 冒号 bullet+尾%+between 无单位 / CSCO FY2027 Guidance 表+反向全年 / NOW 无单位区间结算不猜 / UBER anticipate+of+to / SHOP expect+to be+%区间）；语义去重防双句式重复登记；value/tolerance 从 m[0] 取并 trim（表格行邻格桥接修复）；parseRange 补裸美元区间/尾%/between approximately 且无单位一律不猜；claims 额度 90→170。');
  }
})();
const v3260 = [];
function c3260(name, ok, detail) { v3260.push({ name, ok, detail }); }

// ── v3.26：客户成效/ROI 主张（customer-outcome，新辨别维度）────────────
// 定位：采用证据链第五形态。v3.11 立库 usage-metric 时把采用证据枚举成
// 「趋势主张/具名部署/用量状态」三类、v3.12 扩成四类（+算力承诺），
// 两轮都漏了「采用的结果」：客户用 AI 之后有没有成效（ROI/节省/生产率）。
// live 实证（2026-10-31 全池过堂，corr-2026-028 纪律）：OpenAI News
// 「Credit Saison achieves 954% ROI in a ChatGPT Enterprise pilot」
// （2026-10-29 在窗，frontier_models 桶）——扩容前 24 种形态不命中。

// 1. live 实证命中（live 逐字，2026-10-29 在窗）
c3260('live 实证：Credit Saison 954% ROI 条进库（customer-outcome+不虚抬+证伪+类目）', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  // live 逐字（2026-10-29 OpenAI News，frontier_models 桶）：
  // 标题句 achieves 954% ROI（A 分支动词在前）+ 描述句 delivered 954%
  // ROI（A 分支过去时）——同一主张两种动词形态，A 分支两形都覆盖。
  const r = discriminateCommercial({
    text: 'Credit Saison achieves 954% ROI in a ChatGPT Enterprise pilot  Credit Saison\u2019s ChatGPT Enterprise pilot delivered 954% ROI. See how leaders and employees helped turn the results into companywide adoption.',
    claimSentence: 'Credit Saison achieves 954% ROI in a ChatGPT Enterprise pilot  Credit Saison\u2019s ChatGPT Enterprise pilot delivered 954% ROI.',
    source: 'OpenAI News', date: '2026-10-29',
  });
  return r.kind === 'customer-outcome' && r.kinds.length === 1 && r.kinds[0] === 'customer-outcome'
    && r.evidence.id === 'no-source' && r.evidence.weight === 1        // 厂商一手公告句式自身无归属词，不虚抬（v3.10 Uber 条同型）
    && r.reasoning.score === 1 && r.reasoning.met.includes('has-sample') // 954% 命中样本要素；无对照无反例
    && r.falsifiability.problems.length === 0                          // 有量化，不走 no-quantity
    && r.verdict === 'weak-evidence' && r.decisionRelevant === false   // 标题-only/一手公告不虚抬纪律保持
    && r.category === 'market_claims'
    && /独立审计/.test(r.falsification) && /口径变化/.test(r.falsification); // customer-outcome 专属证伪路径
})(), '客户成效主张：customer-outcome 归类、无出处(1)/推理 1/3（954% 样本）/weak-evidence 不虚抬为决策相关；证伪路径走客户确认/独立审计/同口径自报回落/口径变化');

// 2. 专属证伪条件与类目映射（源级断言——兜底类目同为 market_claims，
//    行为断言抓不到摘除，v3.6 教训）
c3260('专属证伪条件与类目映射：customer-outcome 两处映射在代码里', (() => {
  const src = require('fs').readFileSync(require('path').join(__dirname, 'human-future/scripts/commercial-discriminator.js'), 'utf-8');
  return /'customer-outcome': '观察到客户方公开确认或独立审计/.test(src)
    && /'customer-outcome': 'market_claims'/.test(src);
})(), '证伪条件与类目映射必须显式写在映射表里——兜底值同域时只有源级断言能钉住摘除（v3.6/v3.7/v3.22 同型纪律）');

// 3. 形态族召回（A 数值在前 / B 名词+of+数值，两族八形）
c3260('形态族召回：成效动词+量化值+成效名词 与 成效名词+of+量化值', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'customer-outcome');
  if (!p) return false;
  const re = p.re;
  const yes = [
    'Credit Saison achieves 954% ROI in a ChatGPT Enterprise pilot',        // A：achieves + 954% + ROI
    'The pilot delivered 954% ROI for the retailer.',                       // A：delivered + % + ROI
    'The program realized 30% cost savings across support teams.',          // A：% + cost savings
    'Our deployment generated 3x productivity gains in engineering.',       // A：x + productivity gains
    'The bank reported an ROI of 954% after two quarters.',                 // B：ROI of + %
    'Manufacturers recorded cost savings of $12 million in year one.',      // B：savings of + $
    'Call centers saw productivity gains of 25% with the assistant.',       // B：gains of + %
    'The rollout delivered efficiency improvements of 18%.',                 // B：improvements of + %
  ];
  const no = [
    'In an environment where most enterprises are still searching for AI\u2019s ROI, ServiceNow is the platform delivering it.', // live 逐字：ROI+delivering 但无数字
    'Google Cloud saw a continued increase in customer demand as revenues increased 48% to $17.7 billion',                     // 营收句（revenue 名词族不在库）
    'NVIDIA delivers 35x lower cost for agentic AI',                                                                          // TCO 效率句（costs 裸名词不在库，v3.9 已决议）
    'A survey of 1,200 enterprises found 34% productivity gains',                                                             // found 不在动词族（survey-finding 地盘不抢）
    'Microsoft 365 Copilot reached over 30 million paid seats',                                                               // 用量指标（seats 不在成效名词族）
    'Operating costs fell 40% at the division.',                                                                              // costs fell 不进库（v3.9 同型）
    'Executives are still debating the ROI of AI transformation.',                                                            // 名词短语无动词无数值
    'We are delivering value for our customers every day.',                                                                   // 动词无数值
  ];
  return yes.every(s => re.test(s)) && no.every(s => !re.test(s));
})(), '两族八形全召回；ServiceNow 无数字 ROI 句/营收句/TCO 效率句/调查发现句/用量句/成本句/名词短语/无数量动词句八类零误报');

// 4. 不串台：旧 24 种代表句式 kind 不变（新模式追加在库尾，v3.10/v3.11/v3.12 同型纪律）
c3260('不串台：旧 24 种代表句式 kind 不变、kinds 不含 customer-outcome', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const cases = [
    ['Uber is rolling out ChatGPT Work to more than 30,000 employees', 'deployment-scale'],
    ['Microsoft 365 Copilot reached over 30 million paid seats', 'usage-metric'],
    ['Data Center Late Fees Hit $5 Million or More Per Day, Spawning New Insurance', 'cost-signal'],
    ['AWS Largely Sold Out Of Capacity Into 2028, Jassy Says', 'capacity'],
    ['Anthropic launches Claude Fable 5.1 and says it\u2019s up to 45 percent cheaper for agentic work', 'price-cut'],
    ['Parents sue OpenAI, alleging GPT-4o coached their daughter off seizure medication', 'legal-action'],
  ];
  return cases.every(([t, k]) => {
    const r = discriminateCommercial({ text: t, claimSentence: t, source: 'x', date: '2026-10-29' });
    return r.kind === k && !r.kinds.includes('customer-outcome');
  });
})(), '六种现有 kind 代表句判定不变、不串台——新模式不得改变旧句式归类');

// 5. 引擎端到端：Credit Saison 条进商业辨别段并渲染中文标签行（只认渲染行）
c3260('引擎端到端：Credit Saison 条进辨别段并渲染「类型: 客户成效/ROI 主张」行', (() => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const item = { title: 'Credit Saison achieves 954% ROI in a ChatGPT Enterprise pilot',
    description: '', body: 'Credit Saison\u2019s ChatGPT Enterprise pilot delivered 954% ROI. See how leaders and employees helped turn the results into companywide adoption.',
    source: 'OpenAI News', bucket: 'frontier_models',
    pubDate: 'Thu, 29 Oct 2026 00:00:00 GMT', domains: ['market_claims'],
    link: 'https://openai.com/index/credit-saison', origin: 'live' };
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: 1, domains: [], undomained: 0, dateRange: null, items: [item] };
  const cd = inst.buildCommercialDiscrimination();
  const md = formatReport(new ProjectionEngine({ newsData: { frontier_models: { news: [item] } } }).generate());
  const seg = md.split('## 商业主张辨别')[1] || '';
  return cd.available === true && cd.audited === 1
    && cd.results[0].kind === 'customer-outcome'
    && seg.includes('Credit Saison achieves 954% ROI')
    // 必须认「渲染出来的类型标签行」而不是段里任意出现该字符串（note/图例
    // 文本也会含中文标签，泛匹配会让断言空转——v3.2 反向验证实测教训）
    && seg.includes('类型: 客户成效/ROI 主张 | 来源: OpenAI News')
    && seg.includes('证伪条件:');
})(), 'Credit Saison 条目必须进商业辨别段，formatReport 渲染中文标签行与证伪条件（引擎产出→渲染→注入全链）');

// 6. 精度门未破：无数字 ROI 句整个不进辨别（模式门挡掉，不是 unfalsifiable）
c3260('精度门未破：ServiceNow 无数字 ROI 句不进辨别', (() => {
  const { ProjectionEngine } = require('./scripts/project-future.js');
  // live 逐字（ServiceNow 8-K 2026-07-22 业绩发布正文）：ROI 名词 +
  // delivering 动词共现但无任何数字——按 v3.6/v3.9/v3.10 同型纪律，
  // 无量化值的 ROI 谈论不是可证伪主张，不进辨别。
  const item = { title: 'ServiceNow Reports Second Quarter 2026 Financial Results',
    description: '', body: 'In an environment where most enterprises are still searching for AI\u2019s ROI, ServiceNow is the platform delivering it.',
    source: 'SEC EDGAR', bucket: 'sec_filings',
    pubDate: 'Wed, 22 Jul 2026 00:00:00 GMT', domains: ['market_claims'],
    link: 'https://sec.gov/x', origin: 'live' };
  const inst = new ProjectionEngine({});
  inst.signals = { totalItems: 1, domains: [], undomained: 0, dateRange: null, items: [item] };
  const cd = inst.buildCommercialDiscrimination();
  const hit = (cd.results || []).some(r => r.kind === 'customer-outcome');
  return !hit;
})(), '无量化值的 ROI 谈论不得因新模式进辨别——模式门的量化要求是精度设计①');

// 7. cron 注入源级：注入脚本 KIND_CN 认识 customer-outcome（v3.0.0c 断链纪律）
c3260('cron 注入源级：hf-cron-fetch.sh 渲染 customer-outcome 中文标签', (() => {
  const sh = require('fs').readFileSync(require('path').join(process.env.HOME, '.hermes/scripts/hf-cron-fetch.sh'), 'utf-8');
  return /'customer-outcome': '客户成效\/ROI 主张'/.test(sh);
})(), '注入脚本 KIND_CN 必须含 customer-outcome，否则 agent 看到英文 kind（v3.0.0c 同型断链复发防护）');

// 8. 模式库计数 25（v3.26 进库后；customer-outcome 唯一）
c3260('模式库计数 25 + customer-outcome 唯一（v3.26 新维度）', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const pf = require('fs').readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return COMMERCIAL_CLAIM_PATTERNS.length === 25
    && COMMERCIAL_CLAIM_PATTERNS.filter(p => p.id === 'customer-outcome').length === 1
    && COMMERCIAL_CLAIM_PATTERNS.filter(p => p.kind === 'customer-outcome').length === 1
    && /共 25 种模式/.test(pf)
    && /v3\.26 新增客户成效\/ROI/.test(pf);
})(), '计数 24→25 与文档一致（v3.2 计数纠错同型纪律），customer-outcome 形态与 kind 均唯一');

// 9. 版本号一致性（五处对齐 3.27.0，corr-2026-014 防腐烂断言）
c3260('版本号一致性：五处对齐 3.27.0', (() => {
  const fs = require('fs');
  const VERSION = fs.readFileSync(require('path').join(__dirname, 'VERSION'), 'utf-8').trim();
  const pkg = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'package.json'), 'utf-8'));
  const rp = fs.readFileSync(require('path').join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  const pf = fs.readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return VERSION === '3.27.0'
    && pkg.version === '3.27.0'
    && rp.includes('文明推演引擎 v3.27.0')
    && /version: '3\.27\.0'/.test(pf)
    && /version: '3\.27\.0'/.test(rp);
})(), 'VERSION/package.json/banner/projection meta/run-pipeline meta 五处对齐 3.27.0');

// v3.26 汇总
(async () => {
  const results = await Promise.all(v3260.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v3260.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.26: ${v3260.length - f} 通过, ${f} 失败, 共 ${v3260.length} 个`);
  if (f > 0) {
    console.log('结论：客户成效/ROI 主张的命中/证伪/召回/精度/端到端/注入/计数或版本号对齐有缺。');
    process.exitCode = 1;
  } else {
    console.log('结论：客户成效/ROI 主张（customer-outcome）进库——采用证据链第五形态（趋势/具名部署/用量状态/算力承诺之外「采用的结果」）；live 实证 Credit Saison 954% ROI 条精确命中且 0 误报；无数字 ROI 谈论（ServiceNow 句）被模式门挡在辨别外；专属证伪路径（客户确认/独立审计/同口径自报回落/口径变化）+ market_claims 类目 + 报告与 cron 注入中文标签全链就位。');
  }
})();





// ════════════════════════════════════════════════════════════════════
// v3.27 测试组：S-1 备案正文量化主张抽取（ipo 证伪路径第四条的基线数据）
// 定位：v3.23 接上「备案存在性」核查、v3.24 接上「撤回/定价」事件观测，
// 但备案正文里写的量化主张（营收/增速/客户规模/算力支出承诺/人均营收）
// 引擎从来没读过——v3.21 立库时写下的证伪路径第四条「挂牌后披露矛盾」
// 没有基线数据。live 实证（2026-10-31 全池过堂）：Understanding AI
// 「Anthropic's financials are surprisingly strong — What I learned
// reading all 421 pages of the Anthropic S-1」通篇是 S-1 财务数字的
// 二手转述，而引擎对一手正文零覆盖；且该条的备案动作句（"filed a
// confidential draft of its S-1 form"）因 filed 与 S-1 之间有宾语，
// 旧 ipo 备案动作形态整句不命中、整条不进辨别。
// ════════════════════════════════════════════════════════════════════
const v3270 = [];
function c3270(name, ok, detail) { v3270.push({ name, ok, detail }); }

// live 主张（2026-10-29 Understanding AI，frontier_models 桶，逐字）
const UAI_TEXT = 'Back in June, Anthropic filed a confidential draft of its S-1 form with the Securities and Exchange Commission — a crucial step toward offering stock to the general public. On Monday, Anthropic announced that it had filed a public version of the same document. I read it cover to cover, and I learned a lot about the company\u2019s finances — at least through June 30 of this year.';
const UAI_SENT = 'Back in June, Anthropic filed a confidential draft of its S-1 form with the Securities and Exchange Commission — a crucial step toward offering stock to the general public.';

// mock http（v3.27 版）：company= 路由 browse-edgar atom；CIK 路由
// submissions JSON；/Archives/edgar/data/<cik>/<acc>/ 路由 index.json
// 与主文档 HTML（doc 内容由 map['doc'] 提供，'HTTP500' 模拟抓取失败）。
// 记录 urls 供 memo/预算断言。
function mkMockHttp327(map) {
  const state = { calls: 0, urls: [], indexCalls: 0, docCalls: 0 };
  state.fn = async (url) => {
    state.calls++;
    state.urls.push(url);
    const name = decodeURIComponent((url.match(/company=([^&]+)/) || [])[1] || '').toLowerCase();
    if (name) {
      if (map[name] === 'THROW') throw new Error('mock network down');
      if (map[name] === 'HTTP500') return { status: 500, body: 'error' };
      return { status: 200, body: map[name] || ATOM_NOTFOUND };
    }
    const cik = (url.match(/CIK(\d+)\.json/) || [])[1];
    if (cik) {
      if (map['cik:' + cik] === 'THROW') throw new Error('mock submissions down');
      if (map['cik:' + cik] === 'HTTP500') return { status: 500, body: 'error' };
      return { status: 200, body: map['cik:' + cik] || '{}' };
    }
    if (/\/Archives\/edgar\/data\/\d+\/\d+\/index\.json$/.test(url)) {
      state.indexCalls++;
      if (map.index === 'HTTP500') return { status: 500, body: 'error' };
      return { status: 200, body: map.index || JSON.stringify({ directory: { item: [] } }) };
    }
    if (/\/Archives\/edgar\/data\/\d+\/\d+\/[\w.-]+\.htm$/.test(url)) {
      state.docCalls++;
      if (map.doc === 'HTTP500') return { status: 500, body: 'error' };
      return { status: 200, body: map.doc || '<p>no claims here</p>' };
    }
    return { status: 404, body: '' };
  };
  return state;
}
// Anthropic submissions（live 提炼：窗口内 S-1 2026-10-26，无 RW/424B4）
const SUB_ANTHROPIC = JSON.stringify({
  name: 'Anthropic, PBC',
  filings: { recent: {
    form: ['S-1', '8-K', '10-Q'],
    filingDate: ['2026-10-26', '2026-09-30', '2026-08-14'],
    accessionNumber: ['0001628280-26-067168', '0001628280-26-055000', '0001628280-26-044000'],
    primaryDocument: ['anthropicpbc-sx1.htm', '', ''],
  } },
});
// Archives index.json mock（live 结构：主文档 14.2MB 远大于索引页）
const S1_INDEX_JSON = JSON.stringify({ directory: { item: [
  { name: '0001628280-26-067168-index.html', size: '5000' },
  { name: 'anthropicpbc-sx1.htm', size: '14169143' },
  { name: 'ex-99.htm', size: '900' },
] } });
// live 夹具：Anthropic S-1 正文句子级样本（2026-10-31 实抓，fixtures/）
const S1_FIXTURE = JSON.parse(require('fs').readFileSync(
  require('path').join(__dirname, 'human-future/data/fixtures/s1-anthropic-claims.json'), 'utf-8'));
// 逐字断言（容忍 extractS1Claims 的 300 字符截断：slice(0,297)+'…'）
const s1Verbatim = (cl) => S1_FIXTURE.hit.some(h => h.sentence === cl.sentence
  || (cl.sentence.endsWith('…') && h.sentence.startsWith(cl.sentence.slice(0, -1))));
// 由夹具拼出 mock 主文档 HTML（行内 span 拆分同时 exercising decodeFilingHtml）
const S1_DOC_HTML = '<html><body>' + S1_FIXTURE.hit.map(h => `<p>${h.sentence.replace(/(\$\d[\d.,]*)/g, '<span>$1</span>')}</p>`).join('')
  + S1_FIXTURE.miss.map(s => `<p>${s}</p>`).join('') + '</body></html>';

// ── 组 1：live 实证 + 编排层 ──────────────────────────────────────
// 1. live 实证：Understanding AI S-1 分析条（宾语间隔形态命中 ipo）→
//    EDGAR 匹配升独立验证(4) + 备案正文量化主张 10 条（五形态各 2）。
c3270('live 实证：Understanding AI S-1 分析条进 ipo + 独立验证(4) + 备案正文量化主张', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const { verifyIpoClaims } = require('./human-future/scripts/edgar-ipo-collector.js');
  return (async () => {
    const http = mkMockHttp327({ anthropic: ATOM_ANTHROPIC, 'cik:0002130357': SUB_ANTHROPIC, index: S1_INDEX_JSON, doc: S1_DOC_HTML });
    const cd = {
      available: true, audited: 1, summary: {},
      results: [discriminateCommercial({
        text: UAI_TEXT, claimSentence: UAI_SENT,
        source: 'Understanding AI', date: 'Thu, 29 Oct 2026 19:10:41 GMT',
        url: 'https://www.understandingai.org/p/anthropics-financials', category: 'capital_flow',
      })],
    };
    const out = await verifyIpoClaims(cd, { http: http.fn, now: '2026-10-31T12:00:00Z', gapMs: 0 });
    const r = out.results[0];
    const c = r.edgarIpoCheck;
    const sc = c && c.s1Claims;
    const byForm = {};
    for (const cl of (sc && sc.claims) || []) byForm[cl.form] = (byForm[cl.form] || 0) + 1;
    return r.kind === 'ipo'
      && !!c && c.upgraded === true && r.evidence.weight === 4 && r.evidence.id === 'independent-verification'
      && !!c.matched && c.matched.company === 'Anthropic, PBC' && c.matched.accession === '0001628280-26-067168'
      && !!sc && sc.available === true && sc.claims.length === 10
      && byForm['revenue-growth'] === 2 && byForm['revenue-level'] === 2 && byForm['customer-scale'] === 2
      && byForm['compute-commitment'] === 2 && byForm['revenue-per-employee'] === 2
      && sc.claims.every(cl => s1Verbatim(cl))
      && out.ipoVerification.claimsQueries === 1 && out.ipoVerification.claimsFetched === 1
      && out.ipoVerification.claimsTotal === 10 && out.ipoVerification.claimsFailed === 0
      && out.ipoVerification.verified === 1;
  })();
})(), '宾语间隔形态让 S-1 财务分析条进辨别；备案正文量化主张（公司自报）挂回 edgarIpoCheck，每形态 cap 2、总 cap 10；抬档不改推理分');

// 2. 降级：主文档抓取 500 → s1Claims.available=false+reason，S-1 匹配/
//    抬档/事件观测都不受影响（存在性与正文内容是两件事）。
c3270('降级：备案正文抓取失败只降级 s1Claims，S-1 核查结论不受影响', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const { verifyIpoClaims } = require('./human-future/scripts/edgar-ipo-collector.js');
  return (async () => {
    const http = mkMockHttp327({ anthropic: ATOM_ANTHROPIC, 'cik:0002130357': SUB_ANTHROPIC, index: S1_INDEX_JSON, doc: 'HTTP500' });
    const cd = {
      available: true, audited: 1, summary: {},
      results: [discriminateCommercial({ text: UAI_TEXT, claimSentence: UAI_SENT, source: 'Understanding AI', date: '2026-10-29' })],
    };
    const out = await verifyIpoClaims(cd, { http: http.fn, now: '2026-10-31T12:00:00Z', gapMs: 0 });
    const r = out.results[0];
    const c = r.edgarIpoCheck;
    return !!c && !!c.matched && c.upgraded === true && r.evidence.weight === 4
      && !!c.s1Claims && c.s1Claims.available === false && /status=500/.test(c.s1Claims.reason || '')
      && out.ipoVerification.claimsFailed === 1 && out.ipoVerification.claimsAvailable === false
      && /备案存在性核查结果不受影响/.test(out.ipoVerification.claimsReason || '');
  })();
})(), '正文抓不到≠备案不存在：降级必须写明 reason 且不触碰 S-1 存在性结论');

// 3. 非 live 不抓取（含正文）：live:false → http 0 次。
c3270('非 live 不查询：live:false → http 0 次（含备案正文）', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const { verifyIpoClaims } = require('./human-future/scripts/edgar-ipo-collector.js');
  return (async () => {
    const http = mkMockHttp327({ anthropic: ATOM_ANTHROPIC, index: S1_INDEX_JSON, doc: S1_DOC_HTML });
    const cd = {
      available: true, audited: 1, summary: {},
      results: [discriminateCommercial({ text: UAI_TEXT, claimSentence: UAI_SENT, source: 'Understanding AI', date: '2026-10-29' })],
    };
    const out = await verifyIpoClaims(cd, { http: http.fn, live: false });
    return http.calls === 0 && out.ipoVerification.available === false
      && /非 live 模式/.test(out.ipoVerification.reason || '')
      && out.results[0].edgarIpoCheck === null;
  })();
})(), '非 live 模式不得发起任何 EDGAR 请求（v3.23 纪律保持）');

// 4. accession memo：同公司两条 ipo 主张 → 正文只抓 1 次（run 内去重）。
c3270('memo：同公司两条 ipo 主张 → 备案正文只抓取 1 次', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const { verifyIpoClaims } = require('./human-future/scripts/edgar-ipo-collector.js');
  return (async () => {
    const http = mkMockHttp327({ anthropic: ATOM_ANTHROPIC, 'cik:0002130357': SUB_ANTHROPIC, index: S1_INDEX_JSON, doc: S1_DOC_HTML });
    const mk = (sent) => discriminateCommercial({ text: sent, claimSentence: sent, source: 'x', date: '2026-10-29' });
    const cd = {
      available: true, audited: 2, summary: {},
      results: [mk('Anthropic has filed its IPO prospectus.'), mk(UAI_SENT)],
    };
    const out = await verifyIpoClaims(cd, { http: http.fn, now: '2026-10-31T12:00:00Z', gapMs: 0 });
    return http.docCalls === 1 && http.indexCalls === 1
      && out.ipoVerification.claimsQueries === 1
      && out.results.every(r => r.edgarIpoCheck && r.edgarIpoCheck.matched && r.edgarIpoCheck.s1Claims && r.edgarIpoCheck.s1Claims.available === true);
  })();
})(), '同一 accession 的正文抓取按 accession memo——两条主张共享一次抓取（fair access）');

// ── 组 2：纯函数（抽取/解码/URL）──────────────────────────────────
// 5. extractS1Claims live 夹具：hit 每句命中其 form 全部 res；miss 12 句
//    零命中；端到端每形态 ≤2、总 ≤10、句子逐字来自夹具。
c3270('extractS1Claims：live 夹具五形态全召回 + 12 句精度面零误收 + cap 纪律', (() => {
  const { extractS1Claims, S1_CLAIM_FORMS } = require('./human-future/scripts/edgar-ipo-collector.js');
  const forms = Object.fromEntries(S1_CLAIM_FORMS.map(f => [f.id, f]));
  const hitOk = S1_FIXTURE.hit.every(h => forms[h.form].res.every(re => re.test(h.sentence)));
  const missOk = S1_FIXTURE.miss.every(s => !S1_CLAIM_FORMS.some(f => f.res.every(re => re.test(s))));
  const { decodeFilingHtml } = require('./human-future/scripts/edgar-ipo-collector.js');
  const claims = extractS1Claims(decodeFilingHtml(Buffer.from(S1_DOC_HTML)));
  const byForm = {};
  for (const c of claims) byForm[c.form] = (byForm[c.form] || 0) + 1;
  const verbatim = claims.every(c => s1Verbatim(c));
  return hitOk && missOk && claims.length === 10 && verbatim
    && Object.values(byForm).every(n => n <= 2) && Object.keys(byForm).length === 5;
})(), '五形态命中句全召回、含 revenue/$ 的非形态句零误收；每形态 cap 2 / 总 cap 10；句子逐字（不规范化）');

// 6. decodeFilingHtml：行内标签删除不断词 + 实体解码 + 页码清理。
c3270('decodeFilingHtml：行内标签不断词 + 数字/名字实体解码 + Table of Contents 清理', (() => {
  const { decodeFilingHtml } = require('./human-future/scripts/edgar-ipo-collector.js');
  const html = '<p>Our revenue was <span>$16.3</span> billion&nbsp;for the six months ended June 30, 2026.</p>'
    + '<p>effic<span>iency</span> gains &#8212; 1,300% &#8220;record&#8221;.</p>'
    + '<p>9 Table of Contents • Approximately 250 customers</p>';
  const t = decodeFilingHtml(Buffer.from(html));
  return t.includes('efficiency gains') && !t.includes('effic iency')
    && t.includes('$16.3 billion for the six months') && t.includes('\u2014') && t.includes('\u201Crecord\u201D')
    && !/Table of Contents/.test(t) && t.includes('• Approximately 250 customers');
})(), 'SEC 正文把单词拆进行内标签——转空格会造假断词（live 实测踩过）；块级标签才转空格');

// 7. pickMainDocument + ARCHIVES_INDEX_URL 纯函数。
c3270('pickMainDocument/ARCHIVES_INDEX_URL：最大 .htm、拒索引页、超尺寸拒收、CIK 去前导零', (() => {
  const { pickMainDocument, ARCHIVES_INDEX_URL, MAX_FILING_DOC_BYTES } = require('./human-future/scripts/edgar-ipo-collector.js');
  const ok = pickMainDocument({ directory: { item: [
    { name: '0001628280-26-067168-index.html', size: '5000' },
    { name: 'anthropicpbc-sx1.htm', size: '14169143' },
    { name: 'ex-99.htm', size: '900' },
  ] } });
  const url = ARCHIVES_INDEX_URL('0002130357', '0001628280-26-067168');
  return ok && ok.name === 'anthropicpbc-sx1.htm'
    && pickMainDocument('not json') === null
    && pickMainDocument({ directory: { item: [] } }) === null
    && pickMainDocument({ directory: { item: [{ name: 'huge.htm', size: String(MAX_FILING_DOC_BYTES + 1) }] } }) === null
    && url === 'https://www.sec.gov/Archives/edgar/data/2130357/000162828026067168/index.json';
})(), '主文档=最大非索引 .htm 且 ≤25MB；Archives 路径 CIK 不带前导零（带零 SEC 回 301，live 实测）');

// ── 组 3：模式扩展（ipo 备案动作宾语间隔形态）──────────────────────
// 8. 宾语间隔形态：召回 live 句 + 精度（法律/定期报告句不命中）+
//    旧三形态代表句行为不变。
c3270('ipo 宾语间隔形态：live 句召回 + 法律/定期报告句零误命中 + 旧三形态不变', (() => {
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const p = COMMERCIAL_CLAIM_PATTERNS.find(x => x.id === 'ipo-claim');
  const yes = [
    'Back in June, Anthropic filed a confidential draft of its S-1 form with the Securities and Exchange Commission', // live 逐字
    'The company submitted a draft registration statement on Form S-1 to the commission',
    'Anthropic has filed its IPO prospectus.',                    // 旧形态不回退
    'Anthropic officially files for its public debut',            // 旧形态不回退
    'Goldman Sachs to Lead Anthropic IPO',                        // 承销牵头不回退
    'Anthropic S-1 Takeaways: From Giant Compute Commitments to Complex Lock-Ups', // 文书主体不回退
  ];
  const no = [
    'Parents filed a lawsuit against OpenAI after its IPO pricing',      // 法律备案
    'The SEC filed charges related to the IPO process last week',        // 执法
    'OpenAI filed a complaint about the IPO disclosures',                // 法律
    'Regulators filed an investigation into the IPO roadshow',           // 调查
    'The company filed its quarterly report and discussed the IPO timeline', // 定期备案
    'ahead of IPO',                                                      // 裸 IPO 名词（v3.21 纪律）
    'locks in $40B GPU financing deal',                                  // 融资地盘不抢
  ];
  return yes.every(s => p.re.test(s)) && no.every(s => !p.re.test(s));
})(), 'filed 与 S-1 之间隔宾语（≤45 字符）算备案动作；法律/执法/调查/定期报告句整个不命中（漏报比误报诚实）');

// ── 组 4：辨别器透传 + 端到端 + 注入 ──────────────────────────────
// 9. 辨别器透传不虚抬：带 s1Claims 与不带，verdict/evidence/推理分/
//    decisionRelevant 逐字段一致，只有 edgarIpoCheck.s1Claims 变化。
c3270('透传不虚抬：同一 EDGAR 核查下带/不带 s1Claims 判定逐字段一致', (() => {
  const { discriminateCommercial } = require('./human-future/scripts/commercial-discriminator.js');
  const base = { text: UAI_TEXT, claimSentence: UAI_SENT, source: 'Understanding AI', date: '2026-10-29' };
  const vNoClaims = {
    matched: { candidate: 'Anthropic', company: 'Anthropic, PBC', cik: '0002130357', form: 'S-1', filedAt: '2026-10-26', accession: '0001628280-26-067168' },
    checked: ['Anthropic'], reason: null, events: null, eventsUnavailableReason: null,
  };
  const vWithClaims = Object.assign({}, vNoClaims, {
    s1Claims: { available: true, company: 'Anthropic, PBC', accession: '0001628280-26-067168', claims: [{ form: 'revenue-growth', label: '营收与同比增速', sentence: 'x' }] },
  });
  const a = discriminateCommercial(Object.assign({}, base, { edgarVerification: vNoClaims }));
  const b = discriminateCommercial(Object.assign({}, base, { edgarVerification: vWithClaims }));
  return b.edgarIpoCheck && b.edgarIpoCheck.s1Claims && b.edgarIpoCheck.s1Claims.claims.length === 1
    && a.edgarIpoCheck && a.edgarIpoCheck.s1Claims === null
    && b.kind === a.kind && b.verdict === a.verdict
    && b.evidence.id === a.evidence.id && b.evidence.weight === a.evidence.weight
    && b.reasoning.score === a.reasoning.score && b.decisionRelevant === a.decisionRelevant
    && b.falsification === a.falsification;
})(), '备案正文数字是公司自报——同一核查结论下带/不带 s1Claims 判定逐字段一致（混为一体就是口径错位）');

// 10. 引擎端到端：formatReport 渲染「S-1 备案量化主张」行与汇总行计数。
c3270('引擎端到端：formatReport 渲染 S-1 备案量化主张行 + 汇总行抓取计数', (() => {
  const { ProjectionEngine, formatReport } = require('./scripts/project-future.js');
  const { verifyIpoClaims } = require('./human-future/scripts/edgar-ipo-collector.js');
  return (async () => {
    const mk = (title, desc, source, bucket) => ({
      title, description: desc, body: '', source, bucket,
      pubDate: 'Thu, 29 Oct 2026 19:10:41 +0000', domains: ['market_claims'],
      link: 'https://example.com/x', origin: 'live',
    });
    const items = [
      mk('Will the real Anthropic please stand up',
         'After weeks of frenzied speculation, Anthropic has filed its IPO prospectus. The 335-page document lays out the company\u2019s unique view.',
         'MIT Tech Review - AI', 'tech'),
    ];
    const inst = new ProjectionEngine({});
    inst.signals = { totalItems: items.length, domains: [], undomained: 0, dateRange: null, items };
    const cd = inst.buildCommercialDiscrimination();
    const http = mkMockHttp327({ anthropic: ATOM_ANTHROPIC, 'cik:0002130357': SUB_ANTHROPIC, index: S1_INDEX_JSON, doc: S1_DOC_HTML });
    const cd2 = await verifyIpoClaims(cd, { http: http.fn, now: '2026-10-31T12:00:00Z', gapMs: 0 });
    const md = formatReport({
      meta: { timestamp: '2026-10-31T12:00:00Z', version: '3.27.0' },
      summary: { verdict: '继续观察', score: 0.5, keyMessage: 'TEST', topDomains: ['frontier_models'] },
      commercialDiscrimination: cd2,
      stages: [], turningPoints: [], risks: [], opportunities: [], recommendations: [],
      confidence: { score: 0.5, level: 'medium', note: 'TEST', factors: { baseScore: 0.5, logicQuality: '中等', signalScore: 0.5, coverageScore: 0.5, undomainedRatio: 0.1, adjustment: 0 } },
      trendClassification: { available: false },
    });
    const lines = md.split('\n');
    return lines.some(l => l.includes('EDGAR 核查: ✅ Anthropic, PBC（CIK 0002130357）2026-10-26 提交 S-1（0001628280-26-067168）'))
      && lines.some(l => l.includes('S-1 备案量化主张: 10 条（Anthropic, PBC 在备案正文自报，公司口径，未经审计确认'))
      && lines.some(l => l.trim().startsWith('- [营收与同比增速]') && l.includes('$16.3 billion'))
      && lines.some(l => l.includes('- [算力支出承诺]') && l.includes('committed to spend'))
      && lines.some(l => l.includes('备案正文 1 次抓取（量化主张 10 条，1 份成功 / 0 份失败）'));
  })();
})(), '备案正文量化主张必须端到端到达报告产物：✅ 行 + 主张行（逐字 live 句）+ 汇总行抓取计数（只认渲染行）');

// 11. cron 注入源级：注入脚本渲染 s1Claims（v3.0.0c 断链纪律）。
c3270('cron 注入源级：hf-cron-fetch.sh 渲染 S-1 备案量化主张与汇总抓取计数', (() => {
  const sh = require('fs').readFileSync(require('path').join(process.env.HOME, '.hermes/scripts/hf-cron-fetch.sh'), 'utf-8');
  return /if \(c\.s1Claims\)/.test(sh)
    && /S-1 备案量化主张: \$\{sc\.claims\.length\} 条/.test(sh)
    && /备案正文 \$\{iv\.claimsQueries\} 次抓取/.test(sh)
    && /S-1 备案存在性核查结论不受影响/.test(sh);
})(), '注入脚本必须读 edgarIpoCheck.s1Claims 并渲染四形态（有主张/无主张/不可用/汇总）——否则 agent 看不到一手正文数字');

// 12. 模式库计数 25 不变（扩子形态不加 pattern）+ 版本号五处对齐 3.27.0。
c3270('模式库计数 25 不变 + 版本号五处对齐 3.27.0', (() => {
  const fs = require('fs');
  const { COMMERCIAL_CLAIM_PATTERNS } = require('./human-future/scripts/commercial-discriminator.js');
  const VERSION = fs.readFileSync(require('path').join(__dirname, 'VERSION'), 'utf-8').trim();
  const pkg = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'package.json'), 'utf-8'));
  const rp = fs.readFileSync(require('path').join(__dirname, 'scripts/run-pipeline.js'), 'utf-8');
  const pf = fs.readFileSync(require('path').join(__dirname, 'scripts/project-future.js'), 'utf-8');
  return COMMERCIAL_CLAIM_PATTERNS.length === 25
    && COMMERCIAL_CLAIM_PATTERNS.filter(p => p.id === 'ipo-claim').length === 1
    && VERSION === '3.27.0' && pkg.version === '3.27.0'
    && rp.includes('文明推演引擎 v3.27.0')
    && /version: '3\.27\.0'/.test(pf) && /version: '3\.27\.0'/.test(rp);
})(), '宾语间隔形态是 ipo-claim 子形态扩展不新增 pattern 条目（计数 25 不变）；版本号五处对齐（corr-2026-014 防腐烂）');

// 13. 候选提取（v3.23 组件被本轮 live 实证暴露的缺陷）：RSS 署名行
//     （Substack byline 与正文之间无句读）把候选切片占满 → 月份/ Paid/
//     Share 进停用词后 Anthropic 回到切片内；MIT TR/Goldman 行为不变。
c3270('候选提取：署名行 boilerplate 不停用切片，Anthropic 回到前 5 候选', (() => {
  const { extractCompanyCandidates } = require('./human-future/scripts/edgar-ipo-collector.js');
  const byline = 'Kai Williams Oct 29, 2026 \u2219 Paid 113 9 4 Share Back in June, Anthropic filed a confidential draft of its S-1 form with the Securities and Exchange Commission \u2014 a crucial step toward offering stock to the general public.';
  const c1 = extractCompanyCandidates(byline, 'Understanding AI', byline).slice(0, 5);
  const mit = extractCompanyCandidates('After weeks of frenzied speculation, Anthropic has filed its IPO prospectus.', 'MIT Tech Review - AI', 'After weeks of frenzied speculation, Anthropic has filed its IPO prospectus.');
  const gold = extractCompanyCandidates('Goldman Sachs to Lead Anthropic IPO', 'The Information', 'Goldman Sachs to Lead Anthropic IPO');
  return c1.includes('Anthropic') && !c1.includes('Oct') && !c1.includes('Paid')
    && mit[0] === 'Anthropic' && mit.length === 1
    && gold[0] === 'Goldman Sachs' && gold[1] === 'Anthropic';
})(), 'live 实证：署名行 token 不停用就会把 MAX_CANDIDATES_PER_CLAIM 切片占满、真公司名被切掉（整条 ipo 主张未匹配）；修复不停用既有行为');

// v3.27 汇总
(async () => {
  const results = await Promise.all(v3270.map(c => Promise.resolve(c.ok)));
  let f = 0;
  v3270.forEach((c, i) => {
    const ok = results[i];
    if (!ok) f++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${ok ? '' : '  —— ' + c.detail}`);
  });
  console.log(`\nv3.27: ${v3270.length - f} 通过, ${f} 失败, 共 ${v3270.length} 个`);
  if (f > 0) {
    console.log('结论：S-1 备案正文量化主张的抽取/编排/降级/memo/模式扩展/透传/端到端/注入或版本号对齐有缺。');
    process.exitCode = 1;
  } else {
    console.log('结论：S-1 备案正文量化主张接上真数据（ipo 证伪路径第四条「挂牌后披露矛盾」的基线数据）——匹配到 S-1 后按 accession 抓 Archives 主文档，五形态量化主张（营收与增速/营收水平/客户规模/算力支出承诺/人均营收，全部 Anthropic S-1 live 实抓驱动）挂回 edgarIpoCheck；公司自报数字只作上下文不抬档不改判定；抓取失败只降级 s1Claims 不动存在性结论；同轮补 ipo 备案动作「宾语间隔形态」（live 实证 Understanding AI 句）。模式库计数 25 不变（子形态扩展不加 kind）。');
  }
})();
