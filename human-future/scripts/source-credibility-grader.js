#!/usr/bin/env node
'use strict';

/**
 * 来源可信度分级器 — human-future v2.4 第 5 个新模块
 *
 * v5 报告里有一条未解矛盾：Tesla Optimus 产量，中文投研自媒体说 5 万台/年，
 * technology.org 引 The Information 说几百台/周且无官方数字。二者不可调和，
 * 必须有一个可复现的取舍规则，而不是凭感觉。
 *
 * 分级依据（可复现，不凭印象）：
 *   T1 官方披露（监管备案/财报原文/政府公告/官方新闻稿）
 *   T2 主流通讯社与专业媒体（Reuters/Bloomberg/BBC/Nature/MIT TR）
 *   T3 行业分析/聚合器（有方法论说明）
 *   T4 自媒体/投研小号/论坛（无署名、无原始出处）
 */

const TIERS = {
  T1: { weight: 1.0, desc: '官方披露：监管备案、财报原文、政府公告、官方新闻稿' },
  T2: { weight: 0.85, desc: '主流通讯社与同行评议出版物' },
  T3: { weight: 0.6, desc: '有方法论的行业分析/聚合器' },
  T4: { weight: 0.25, desc: '自媒体/投研小号/论坛，无原始出处' }
};

const T1_HINTS = /(sec\.gov|nmpa|fda\.gov|nasa\.gov|aisi\.gov\.uk|nobelprize\.org|press-release|earnings|S-1|招股书|备案)/i;
const T2_HINTS = /(reuters|bloomberg|bbc\.com|nature\.com|science\.org|technologyreview|wsj\.com|ft\.com|cnbc|theinformation|scmp|people\.com\.cn|\.gov)/i;
const T3_HINTS = /(gartner|forrester|iea\.org|bcg\.com|deloitte|brookings|mckinsey|analysis|report)/i;

// [v2.8 增补] 以下 hint 表是 v2.4 按当时的采集源写的，只覆盖 Reuters/Nature/
// MIT TR 一类。v2.7 引入 frontier_models 采集域后，实测 12 个 live 来源全部
// 落 T4——包括 openai.com、deepmind.google、blogs.nvidia.com、news.mit.edu
// 这些厂商官方博客与高校新闻室。把它们判成「自媒体/论坛」是错的：
//   一，来源分级报告会显示「T4 自媒体 106 条」，读者以为证据基础是论坛帖；
//   二，更关键的是「厂商自述」这个标识丢了——官方博客正是一手口径所在，
//      判成 T4 后，报告无法区分「厂商自己说」与「第三方转述」。
// 因此按真实来源域补表。补的每一项都能在采集源列表里找到对应条目。
const T1_VENDOR = /(openai\.com|deepmind\.google|anthropic\.com|ai\.meta\.com|mistral\.ai|blogs\.microsoft\.com|microsoft\.com\/en-us\/research|nvidia\.com\/en-us\/research|developer\.nvidia\.com|research\.google|ai\.googleblog\.com|arxiv\.org|clinicaltrials\.gov|patents\.google\.com|blogs\.nvidia\.com|nvidianews\.nvidia\.com)/i;
const T2_ADDED = /(arstechnica\.com|news\.mit\.edu|theverge\.com|techcrunch\.com|wired\.com|scientificamerican\.com|newscientist\.com|economist\.com|nytimes\.com|washingtonpost\.com|theguardian\.com|apnews\.com|nature\.com\/news|securityweek\.com|thehackernews\.com|zdnet\.com|theregister\.com|venturebeat\.com|technologyreview\.com|acs\.org|ieee\.org|acm\.org)/i;
const T3_ADDED = /(substack\.com|interconnects\.ai|understandingai\.org|transformernews\.ai|simonwillison\.net|lesswrong\.com|alignmentforum\.org|epochai\.org|importai\.net|oneusefulthing\.org|importai|analyticsindiamag|venturebeat)/i;

function classifySource(urlOrName) {
  const s = String(urlOrName || '');
  // 顺序即优先级：T1 厂商官方/监管先判，T2 主流媒体，T3 有方法论的分析。
  // [v2.8] 注意 T1_VENDOR 必须排在 T2_ADDED 之前：microsoft.com/en-us/research
  // 同时含 "microsoft.com" 与 "/research"，若先匹配 T2 会把官方研究博客降级。
  if (T1_VENDOR.test(s)) return 'T1';
  if (T1_HINTS.test(s)) return 'T1';
  if (T2_HINTS.test(s)) return 'T2';
  if (T2_ADDED.test(s)) return 'T2';
  if (T3_HINTS.test(s)) return 'T3';
  if (T3_ADDED.test(s)) return 'T3';
  return 'T4';
}

/**
 * 对同一事实的多个互相矛盾的来源做加权裁决。
 * @param {Array<{source, claim, tier?}>} claims
 */
function adjudicate(claims) {
  const scored = claims.map((c) => {
    const tier = c.tier || classifySource(c.source);
    return { ...c, tier, weight: TIERS[tier].weight };
  });

  // 按 claim 归一化后加权投票
  const buckets = new Map();
  for (const c of scored) {
    const key = String(c.claim).trim().slice(0, 80);
    if (!buckets.has(key)) buckets.set(key, { claim: c.claim, weight: 0, sources: [] });
    const b = buckets.get(key);
    b.weight += c.weight;
    b.sources.push(c.source);
  }

  const ranked = [...buckets.values()].sort((a, b) => b.weight - a.weight);
  const margin = ranked.length > 1 ? ranked[0].weight - ranked[1].weight : ranked[0]?.weight ?? 0;

  return {
    ranked,
    winner: ranked[0] || null,
    margin,
    decisive: margin >= 0.6,
    note: decisiveNote(ranked[0], margin)
  };
}

function decisiveNote(winner, margin) {
  if (!winner) return '无可信来源';
  if (margin < 0.3) return '来源分歧接近，无法裁决 —— 必须两条都呈现，不得只引其一';
  if (margin < 0.6) return '倾向性裁决，但证据不够硬 —— 采用高可信来源并记录分歧';
  return `高置信裁决：${winner.sources[0]}（Tier 加权领先 ${margin.toFixed(2)}）`;
}

module.exports = { classifySource, adjudicate, TIERS };

if (require.main === module) {
  // 自测：Optimus 产量矛盾（v5 报告真实记录的那个取舍）
  const res = adjudicate([
    { source: 'technology.org', claim: '几百台/周，官方从未公布产量', tier: 'T3' },
    { source: 'The Information (转引)', claim: '几百台/周，官方从未公布产量', tier: 'T2' },
    { source: '某中文投研自媒体', claim: '2026 全年下线 5 万台', tier: 'T4' },
    { source: 'Tesla Q4 2025 earnings 原文', claim: '几百台/周，官方从未公布产量', tier: 'T1' }
  ]);
  console.log('裁决:', JSON.stringify(res.winner, null, 1));
  console.log('margin:', res.margin.toFixed(2), '| decisive:', res.decisive);
  console.log('note:', res.note);
}
