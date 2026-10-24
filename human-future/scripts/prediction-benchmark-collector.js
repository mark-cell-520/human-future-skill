#!/usr/bin/env node
'use strict';

/**
 * 外部预测基准采集器（v2.17）— Good Judgment Open（gjopen.com）
 *
 * 为什么需要：SKILL.md「已知边界」自 v2.13 起记录——RSS 与博客正文里的前瞻
 * 表述多为意图声明（"we expect to expand access"），没有时间点，判为不可
 * 结算；要拿到真正可结算的预测，需接 Metaculus / Epoch AI / 厂商路线图等
 * 专门预测源。2026-10-24 复测：Metaculus API 403（带 UA 仍 403）、
 * Manifold 连接超时、Polymarket gamma-api DNS 被解析到不可达 IP、
 * Kalshi 超时、PredictIt 301、Epoch AI 只有统计数据无预测类数据。
 * **唯一可达且内容对口的是 Good Judgment Open**：
 *   - /questions?q=<词> 公开可抓（需浏览器 UA，裸 curl 得 406）
 *   - 每个问题带 ISO 截止时间（data-localizable-timestamp，ends_at）
 *   - 问题是「带硬截止日的规范预测形态」，正是 RSS 里最缺的东西
 * 边界（如实声明，不得对外宣称已解决）：
 *   - GJOpen 的**群体预测概率需登录可见**，本模块不采集、不估计，
 *     任何层不得对这些问题声称知道市场概率
 *   - 单问题详情页 302 跳登录，抓不到 resolution criteria 正文
 *   - 活跃问题池很小（约几百个），AI 覆盖集中在采用率/基准排名/厂商事件
 *
 * 采集纪律：
 *   - 查询集只保留实测有返回的查询；'AI' 实测是子串误配（返回 PMI/油价/
 *     Supreme Court 垃圾），'gene' 同样误配 "general"——已剔除并注明
 *   - 缓存 TTL 6h（cron 两小时一轮，多数轮次零网络）
 *   - 抓取失败不覆盖旧缓存；全部失败时有过期缓存就用并标注 degraded
 *   - 本模块只回答「有哪些带硬截止日的开放问题」，不回答这些问题本身
 */

const fs = require('fs');
const path = require('path');

const SOURCE = 'Good Judgment Open';
const SOURCE_URL = 'https://www.gjopen.com';
const CACHE_PATH = path.join(__dirname, '..', '.cache', 'benchmark-gjopen.json');
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PER_QUERY_TIMEOUT_MS = 10000;
// gjopen 对裸 curl 返回 406，必须带浏览器 UA（实测 2026-10-24）。
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  + ' (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

/**
 * 查询集 → 主题分组（cluster）。
 * 每条都是 2026-10-24 实测有返回的查询；0 返回的（AGI / quantum / fusion /
 * crispr / longevity / humanoid / brain / machine learning / mars / gpt /
 * deepmind / AI model / AI regulation）不列入——查了也是空。
 * 'AI' / 'gene' 是子串误配（匹配到 "Saudi" / "general"），剔以防污染。
 */
const QUERIES = [
  { q: 'artificial intelligence', cluster: 'ai_adoption' },
  { q: 'large language model', cluster: 'frontier_benchmarks' },
  { q: 'AI safety', cluster: 'ai_safety' },
  { q: 'openai', cluster: 'frontier_vendors' },
  { q: 'anthropic', cluster: 'frontier_vendors' },
  { q: 'spacex', cluster: 'space' },
  { q: 'nuclear', cluster: 'geopolitics_energy' },
  { q: 'regulation', cluster: 'governance' },
  { q: 'climate', cluster: 'climate' },
];

const CLUSTER_CN = {
  ai_adoption: 'AI 采用率',
  frontier_benchmarks: '模型基准排名',
  ai_safety: 'AI 安全',
  frontier_vendors: '前沿厂商',
  space: '太空',
  geopolitics_energy: '地缘与能源',
  governance: '监管',
  climate: '气候',
  other: '其他',
};

/** HTML 实体通用解码：命名实体 + 数字实体（&#39; / &#x27;）。 */
function decodeEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

/**
 * 解析 gjopen /questions?q= 页面。
 *
 * 页面结构（实测）：每行一个问题，`<h5> <a href=".../questions/<id>-<slug>">
 * <span>标题</span></a></h5>`，同块内 subtext 有唯一的
 * `data-localizable-timestamp="<ISO>"`（ends_at，即截止时间）。
 * 注意：页面只有截止时间，**没有发布时间**——上游不为问题提供 starts_at，
 * 不得把截止日当发布日引用。
 *
 * @param {string} html
 * @returns {Array<{id:string,title:string,closesAt:string|null,url:string}>}
 */
function parseQuestions(html) {
  const out = [];
  const blocks = String(html || '').split('<h5>');
  for (const b of blocks.slice(1)) {
    const m = b.match(/href="(https:\/\/www\.gjopen\.com\/questions\/(\d+)-[^"]*)"[^>]*>\s*<span>([\s\S]*?)<\/span>/);
    if (!m) continue;
    const title = decodeEntities(m[3].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (!title) continue;
    const t = b.match(/data-localizable-timestamp="([^"]+)"/);
    out.push({
      id: m[2],
      title,
      closesAt: t ? t[1] : null,
      url: m[1],
    });
  }
  return out;
}

/**
 * 实词抽取（主题匹配用）。停用词 + 纯数字 + 月份/季度/年份一律剔除——
 * 它们是时间词不是主题词（"March 2027" 与任何问题都共享，没有区分度）。
 * 轻量词形归一：长度 >4 且以 s 结尾的去尾 s（models→model），
 * 两侧同一变换，只求一致不求语言学正确。
 */
const STOPWORDS = new Set([
  'what', 'will', 'would', 'shall', 'should', 'could', 'when', 'where', 'which',
  'whose', 'there', 'their', 'them', 'they', 'this', 'that', 'these', 'those',
  'from', 'with', 'without', 'into', 'over', 'under', 'about', 'above', 'below',
  'between', 'during', 'before', 'after', 'until', 'while', 'than', 'then',
  'have', 'has', 'had', 'been', 'being', 'does', 'done', 'more', 'most', 'less',
  'least', 'such', 'same', 'other', 'others', 'some', 'many', 'much', 'each',
  'every', 'any', 'all', 'both', 'either', 'neither', 'none', 'also', 'just',
  'only', 'even', 'still', 'yet', 'ever', 'never', 'always', 'often', 'according',
  'based', 'using', 'used', 'make', 'made', 'take', 'taken', 'give', 'given',
  'first', 'last', 'next', 'final', 'end', 'begin', 'start', 'reach', 'exceed',
  'value', 'closing', 'close', 'open', 'percent', 'percentage', 'rate', 'ratio',
  'number', 'amount', 'total', 'average', 'mean', 'point', 'level', 'index',
  'report', 'reported', 'announce', 'announced', 'publicly', 'public',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
]);

function significantTerms(text) {
  const words = String(text || '').toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  const out = new Set();
  for (const w of words) {
    out.add(w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w);
  }
  return out;
}

/**
 * 主题相邻匹配：claim 与开放问题共享实词 ≥minShared 即算命中。
 *
 * 命中语义（必须随结果一起带给报告层，不许单独出现）：
 *   只说明「该主题在专业预测平台有硬截止日的问题在跟踪」，
 *   **不是同题，更不是概率参照**（GJOpen crowd forecast 需登录，未采集）。
 * 取 ≥2 共享实词是为了精度：仅共享 'openai' 一个专名的两条文本，
 * 问题可以完全不同（发布计划 vs 上市市值），那种相邻没有辨别价值。
 *
 * @returns {{matched:number, questions:Array, caveat:string}}
 */
function matchQuestions(text, questions, opts = {}) {
  const minShared = opts.minShared || 2;
  const maxResults = opts.maxResults || 3;
  const terms = significantTerms(text);
  const caveat = '主题相邻非同题：共享实词只说明话题相邻，不代表同一问题；'
    + '本匹配不提供概率参照（GJOpen 群体预测概率需登录，本引擎未采集）。';
  if (terms.size === 0 || !Array.isArray(questions) || questions.length === 0) {
    return { matched: 0, questions: [], caveat };
  }
  const hits = [];
  for (const q of questions) {
    const qt = significantTerms(q.title);
    const shared = [...terms].filter(t => qt.has(t));
    if (shared.length >= minShared) {
      hits.push({
        id: q.id, title: q.title, url: q.url, cluster: q.cluster,
        closesAt: q.closesAt, daysLeft: q.daysLeft, sharedTerms: shared,
      });
    }
  }
  hits.sort((a, b) => b.sharedTerms.length - a.sharedTerms.length);
  return { matched: hits.length, questions: hits.slice(0, maxResults), caveat };
}

/** 缓存 payload → 返回形状（不变量：available 只有真拿到问题才为 true）。 */
function shapeOf(payload, extra = {}) {
  return {
    available: Array.isArray(payload.questions) && payload.questions.length > 0,
    source: payload.source || SOURCE,
    sourceUrl: payload.sourceUrl || SOURCE_URL,
    fetchedAt: payload.fetchedAt || null,
    queriesRun: Array.isArray(payload.queriesRun) ? payload.queriesRun : [],
    questions: Array.isArray(payload.questions) ? payload.questions : [],
    ...extra,
  };
}

/**
 * 采集 GJOpen 开放问题。
 *
 * @param {object} opts
 * @param {boolean} [opts.live] 是否允许联网（默认 process.env.FETCH==='1'）
 * @param {Function} [opts.fetchImpl] 测试注入： (url, init) => Promise<Response-like>
 * @param {number} [opts.now] 测试注入当前时间戳
 * @param {string} [opts.cachePath] 测试注入缓存路径
 * @param {number} [opts.cacheTtlMs]
 * @param {Array} [opts.queries]
 * @returns {Promise<object>} { available, questions, source, fetchedAt, fromCache, stale, errors, reason? }
 */
async function collectBenchmark(opts = {}) {
  const {
    live = process.env.FETCH === '1',
    fetchImpl = null,
    now = Date.now(),
    cachePath = CACHE_PATH,
    cacheTtlMs = CACHE_TTL_MS,
    queries = QUERIES,
  } = opts;
  const doFetch = fetchImpl || ((url, init) => fetch(url, init));

  // 1. 缓存优先（TTL 内零网络）
  let cached = null;
  try {
    if (fs.existsSync(cachePath)) cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  } catch (_) { cached = null; }
  if (cached && Array.isArray(cached.questions)
    && (now - (cached.fetchedAt || 0)) < cacheTtlMs) {
    return shapeOf(cached, { fromCache: true, stale: false });
  }

  // 2. 未开 FETCH：有过期缓存就老实标注着用，没有就报不可用（不编造）
  if (!live) {
    if (cached && Array.isArray(cached.questions) && cached.questions.length > 0) {
      return shapeOf(cached, {
        fromCache: true, stale: true,
        degradedReason: '未开启 FETCH=1 且缓存已过期，使用过期缓存（截止时间可能已变化）',
      });
    }
    return {
      available: false,
      reason: '未开启 FETCH=1 且无可用缓存，不编造外部预测基准',
    };
  }

  // 3. 真抓取：单主机 9 个查询，有界并发（每查询 10s 超时）
  const results = await Promise.all(queries.map(async (q) => {
    try {
      const resp = await doFetch(`${SOURCE_URL}/questions?q=${encodeURIComponent(q.q)}`, {
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
        signal: AbortSignal.timeout(PER_QUERY_TIMEOUT_MS),
      });
      if (!resp.ok) return { q, ok: false, error: `HTTP ${resp.status}` };
      const html = await resp.text();
      return { q, ok: true, questions: parseQuestions(html) };
    } catch (e) {
      return { q, ok: false, error: e.message };
    }
  }));

  const errors = results.filter(r => !r.ok).map(r => ({ query: r.q.q, error: r.error }));
  const okOnes = results.filter(r => r.ok);

  // 4. 全部失败：不覆盖旧缓存；有旧缓存就标注降级着用
  if (okOnes.length === 0) {
    if (cached && Array.isArray(cached.questions) && cached.questions.length > 0) {
      return shapeOf(cached, {
        fromCache: true, stale: true, errors,
        degradedReason: `GJOpen 本轮采集全部失败（${errors.map(e => e.error).join('; ')}），使用过期缓存`,
      });
    }
    return {
      available: false,
      reason: `GJOpen 采集全部失败: ${errors.map(e => `${e.query}=${e.error}`).join('; ')}`,
      errors,
    };
  }

  // 5. 按问题 id 去重（同一问题会被多个查询命中，只计一次）
  const byId = new Map();
  for (const r of okOnes) {
    for (const p of r.questions) {
      if (!p.id) continue;
      if (!byId.has(p.id)) {
        byId.set(p.id, { ...p, cluster: r.q.cluster, matchedBy: [r.q.q] });
      } else {
        byId.get(p.id).matchedBy.push(r.q.q);
      }
    }
  }
  const questions = [...byId.values()];
  const payload = {
    fetchedAt: now, source: SOURCE, sourceUrl: SOURCE_URL,
    queriesRun: queries.map(q => q.q), questions,
  };
  // 写缓存失败只警告不中断（v2.13 教训：catch (_) {} 会吞掉真 bug）
  try {
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(payload), 'utf-8');
  } catch (e) {
    console.log(`  [WARN] 写 GJOpen 基准缓存失败: ${e.message}`);
  }
  return shapeOf(payload, { fromCache: false, stale: false, errors });
}

module.exports = {
  SOURCE, SOURCE_URL, CACHE_PATH, CACHE_TTL_MS, QUERIES, CLUSTER_CN,
  parseQuestions, significantTerms, matchQuestions, collectBenchmark,
};
