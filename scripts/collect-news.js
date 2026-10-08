#!/usr/bin/env node
'use strict';

/**
 * 多维度数据采集脚本
 *
 * 数据来源分两层，优先级从高到低：
 *   1. 真实联网采集（FETCH=1 时）：用 Node 内置 fetch 打 RSS/Atom 源，抓取近期条目
 *   2. 本地知识库降级（默认）：读 ../data/knowledge-base.md
 *
 * 关键诚实性约束（用户铁律）：
 *   - 网络失败时如实降级并打印 [WARN]，绝不拿本地知识库伪装成今天抓到的新闻
 *   - 返回结构里带 origin 字段标记每条数据的真实来源（live / knowledge-base）
 *   - 本地知识库里的内容是累积知识，其中「预测」列标明是推测，不得当已发生事实引用
 *
 * 域归属说明：RSS 源本身有主题偏向，且同一源会跨域发文
 * （例：Ars Technica 的 technology-lab feed 同時发 AI 与安全新闻，Nature News 发了
 * 大量生物/地球科学新闻）。这些条目按实际源归入声明域，但**下游使用者必须按
 * 标题自行判断是否属于自己关注的九大域**，不得假设「在 tech 桶里就等于 AI 新闻」。
 */

const fs = require('fs');
const path = require('path');

// 九大域的 RSS 源。用户关心的推演域：AI 智能体安全与监管 / 诺贝尔奖 / 脑机接口 /
// 基因编辑 / 长寿衰老逆转 / 量子计算 / 人形机器人 / AI 能源与电网 / 太空探索
const RSS_SOURCES = {
  tech: [
    { name: 'MIT Tech Review - AI', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed' },
    { name: 'Ars Technica - Technology Lab', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab' },
  ],
  humanities: [
    { name: 'Nature News', url: 'https://www.nature.com/nature.rss' },
  ],
  psychology: [],
  philosophy: [],
};

const DOMAIN_NAMES = {
  tech: '科技',
  humanities: '人文',
  psychology: '心理',
  philosophy: '哲学',
};

const FETCH_TIMEOUT_MS = 8000;
const MAX_ITEMS_PER_SOURCE = 12;

/** 从知识库加载数据（降级路径），原样保留旧行为但标注 origin */
function loadFromKnowledgeBase() {
  const kbPath = path.join(__dirname, '..', 'data', 'knowledge-base.md');

  if (!fs.existsSync(kbPath)) {
    throw new Error('知识库文件不存在: ' + kbPath);
  }

  const kbContent = fs.readFileSync(kbPath, 'utf-8');

  const mk = (domain) => ({
    domain,
    name: DOMAIN_NAMES[domain],
    news: [{ source: 'knowledge-base', origin: 'knowledge-base', content: kbContent }],
  });

  return {
    tech: mk('tech'),
    humanities: mk('humanities'),
    psychology: mk('psychology'),
    philosophy: mk('philosophy'),
  };
}

/** 极简 RSS/Atom 解析：抽 <item>/<entry> 的 title + pubDate + link */
function parseFeed(xml) {
  const items = [];
  // <item> ... </item>（RSS）或 <entry> ... </entry>（Atom）
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/g)
    || xml.match(/<entry[\s>][\s\S]*?<\/entry>/g)
    || [];
  for (const b of blocks) {
    const title = (b.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || '';
    const link = (b.match(/<link[^>]*href="([^"]+)"/) || [])[1]
      || (b.match(/<link[^>]*>([\s\S]*?)<\/link>/) || [])[1]
      || '';
    const pub = (b.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/) || [])[1]
      || (b.match(/<published[^>]*>([\s\S]*?)<\/published>/) || [])[1]
      || (b.match(/<updated[^>]*>([\s\S]*?)<\/updated>/) || [])[1]
      || '';
    const desc = (b.match(/<description[^>]*>([\s\S]*?)<\/description>/) || [])[1]
      || (b.match(/<summary[^>]*>([\s\S]*?)<\/summary>/) || [])[1]
      || '';
    const clean = (s) => String(s)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ').trim();
    items.push({
      title: clean(title), link: clean(link), pubDate: clean(pub),
      description: clean(desc).slice(0, 500),
    });
  }
  return items;
}

async function fetchFeed(src) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(src.url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'human-future-skill/2.0 (knowledge collection)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    return parseFeed(xml).slice(0, MAX_ITEMS_PER_SOURCE)
      .map(it => ({ ...it, source: src.name, origin: 'live' }));
  } finally {
    clearTimeout(timer);
  }
}

/** 真联网采集。任何源失败只丢该源，不影响其他源；全部失败则由调用方降级 */
async function fetchAll() {
  const out = {};
  for (const [domain, sources] of Object.entries(RSS_SOURCES)) {
    const news = [];
    for (const src of sources) {
      try {
        const items = await fetchFeed(src);
        console.log(`  [live] ${domain}/${src.name}: ${items.length} 条`);
        news.push(...items);
      } catch (e) {
        console.log(`  [WARN] ${domain}/${src.name} 抓取失败: ${e.message}`);
      }
    }
    if (news.length) out[domain] = { domain, name: DOMAIN_NAMES[domain], news };
  }
  return out;
}

/**
 * 采集所有维度的数据
 * @param {object} opts { live: boolean }  live=true 走真联网，失败自动降级知识库
 */
async function collectAll(opts = {}) {
  const wantLive = opts.live ?? process.env.FETCH === '1';

  if (wantLive) {
    console.log('🌐 真实联网采集（FETCH=1）...\n');
    const live = await fetchAll();
    const total = Object.values(live).reduce((n, d) => n + d.news.length, 0);
    if (total > 0) {
      console.log(`✅ 联网采集完成，共 ${total} 条\n`);
      return live;
    }
    console.log('[WARN] 所有联网源均失败，降级为本地知识库（origin=knowledge-base，不得当作今日新闻）\n');
  } else {
    console.log('📚 从知识库加载多维度数据（离线模式，fetch 需 FETCH=1）...\n');
  }

  const results = loadFromKnowledgeBase();

  console.log('✅ 数据加载完成\n');
  console.log('📊 数据统计（origin 标注真实来源）:');
  for (const [domain, data] of Object.entries(results)) {
    const origins = [...new Set(data.news.map(n => n.origin))].join(',');
    console.log(`  ${data.name}: ${data.news.length} 条数据 [origin=${origins}]`);
  }

  return results;
}

async function main() {
  try {
    const results = await collectAll();
    console.log('\n📈 数据采集完成');
    return results;
  } catch (e) {
    console.error('❌ 采集失败:', e.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { collectAll, loadFromKnowledgeBase, fetchAll, parseFeed };
