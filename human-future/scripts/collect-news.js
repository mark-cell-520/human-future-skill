#!/usr/bin/env node
'use strict';

/**
 * 多维度网络采集脚本
 *
 * v2 重写说明（原版是假采集器，必须记录）：
 *   原版 84 行只读 data/knowledge-base.md 一个文件，科技/人文/心理/哲学四个维度
 *   返回同一份内容的副本，既没有网络请求，也从不写 collected-news.json ——
 *   而 analyze 阶段等的正是那个文件，所以整条 pipeline 必然断在第二步。
 *   本版真联网抓取（原生 fetch，无 npm 依赖）+ 真写盘，并在网络失败时明确降级
 *   而不是伪造数据。
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const KB_PATH = path.join(DATA_DIR, 'knowledge-base.md');
const OUT_PATH = path.join(DATA_DIR, 'collected-news.json');

/** 每个维度的 RSS 源。全部公开、无需 key。 */
const SOURCES = {
  tech: [
    'https://hnrss.org/frontpage',
    'https://www.technologyreview.com/feed/',
    'https://arxiv.org/rss/cs.AI'
  ],
  humanities: [
    'https://www.theguardian.com/commentisfree/rss',
    'https://feeds.bbci.co.uk/news/world/rss.xml'
  ],
  psychology: [
    'https://www.psychologytoday.com/intl/front-page/rss.xml'
  ],
  philosophy: [
    'https://plato.stanford.edu/rss/sep.xml'
  ]
};

const DOMAIN_NAMES = {
  tech: '科技',
  humanities: '人文',
  psychology: '心理',
  philosophy: '哲学'
};

const FETCH_TIMEOUT_MS = 8000;

/** 单个带超时的 fetch。超时/失败返回 null，由调用方决定降级。 */
async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'human-future-forecast/2.0 (+https://github.com/mark-cell-520/human-future-skill)' }
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 极简 RSS/Atom 解析：只取 <item>/<entry> 的 title + description + pubDate。 */
function parseFeed(xml, sourceUrl) {
  const items = [];
  const blocks = xml.match(/<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/gi) || [];
  for (const block of blocks.slice(0, 10)) {
    const pick = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
      if (!m) return '';
      return m[1]
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    };
    const title = pick('title');
    const desc = pick('description') || pick('summary') || pick('content');
    if (!title) continue;
    items.push({
      title,
      content: (title + '. ' + desc).slice(0, 600),
      source: sourceUrl,
      published: pick('pubDate') || pick('published') || pick('updated') || ''
    });
  }
  return items;
}

/**
 * 采集一个维度：并发打全部源，任一源成功即算该维度有真数据。
 * 全部源失败时返回 ok:false + reason，绝不回退到知识库伪装成新闻。
 */
async function collectDomain(domain, urls) {
  const settled = await Promise.all(
    urls.map(async (u) => {
      const xml = await fetchWithTimeout(u);
      return xml ? { url: u, items: parseFeed(xml, u) } : { url: u, items: [] };
    })
  );

  const news = [];
  for (const s of settled) {
    for (const it of s.items) news.push(it);
  }

  return {
    domain,
    name: DOMAIN_NAMES[domain] || domain,
    news,
    sourcesTried: urls.length,
    sourcesOk: settled.filter((s) => s.items.length > 0).length,
    ok: news.length > 0
  };
}

/**
 * 采集所有维度。
 * @param {{network?: boolean}} opts  network:false 时跳过网络（供离线自测）
 */
async function collectAll(opts = {}) {
  const useNetwork = opts.network !== false;
  const results = {};
  const failures = [];

  for (const [domain, urls] of Object.entries(SOURCES)) {
    if (!useNetwork) {
      results[domain] = { domain, name: DOMAIN_NAMES[domain], news: [], sourcesTried: 0, sourcesOk: 0, ok: false };
      continue;
    }
    console.log(`📡 采集 ${DOMAIN_NAMES[domain]} (${urls.length} 个源)...`);
    const r = await collectDomain(domain, urls);
    results[domain] = r;
    if (!r.ok) {
      failures.push(domain);
      console.log(`   ⚠️  ${DOMAIN_NAMES[domain]}: 全部 ${r.sourcesTried} 个源失败`);
    } else {
      console.log(`   ✅ ${DOMAIN_NAMES[domain]}: ${r.news.length} 条 (${r.sourcesOk}/${r.sourcesTried} 源可用)`);
    }
  }

  return { domains: results, failures };
}

/** 写 collected-news.json，并打印统计。这是原版缺失、导致 pipeline 断裂的关键一步。 */
function writeCollected(collected) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const payload = {
    collectedAt: new Date().toISOString(),
    domains: collected.domains,
    failures: collected.failures,
    // 兼容 analyze 阶段直接读 domain.news 的旧形状
    tech: collected.domains.tech,
    humanities: collected.domains.humanities,
    psychology: collected.domains.psychology,
    philosophy: collected.domains.philosophy
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2), 'utf-8');
  return payload;
}

async function main() {
  try {
    console.log('🚀 多维度网络数据采集 v2（真联网，无 npm 依赖）\n');
    const collected = await collectAll();
    const payload = writeCollected(collected);

    console.log('\n📊 数据统计:');
    let total = 0;
    for (const [, d] of Object.entries(payload.domains)) {
      total += d.news.length;
      const flag = d.ok ? '✅' : '⚠️ ';
      console.log(`  ${flag} ${d.name}: ${d.news.length} 条 (${d.sourcesOk}/${d.sourcesTried} 源)`);
    }
    console.log(`\n📦 已写入: ${OUT_PATH}`);
    console.log(`📈 全维度合计: ${total} 条`);

    if (collected.failures.length === Object.keys(SOURCES).length) {
      console.error('\n❌ 全部维度网络失败 —— 未伪造任何数据。检查网络后重试。');
      process.exit(3);
    }
    return collected;
  } catch (e) {
    console.error('❌ 采集失败:', e.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { collectAll, writeCollected, parseFeed, SOURCES, OUT_PATH };
