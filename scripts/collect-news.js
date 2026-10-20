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
//
// [v2.7 新增] frontier_models「专项大模型」域：
//   用户 2026-10-20 要求「增加一个专项大模型的趋势和最新进展」。原采集源里
//   没有任何一家模型厂商的一手源，导致大模型方向的信号只能从二手科技媒体
//   转述里捡，且型号更新（GPT/Gemini/Claude/开源家族）几乎必然滞后。
//   本域 9 个源全部经过实测可达（8 秒超时内全部返回 200 且有 item/entry），
//   每源最多取 8 条，防止 OpenAI 那种 1300 条的历史 feed 把候选池撑爆。
//   厂商一手源 + 两家分析型 newsletter（Interconnects / Understanding AI /
//   Transformer News）覆盖「官方发布」与「业界解读」两侧。
const RSS_SOURCES = {
  tech: [
    { name: 'MIT Tech Review - AI', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed' },
    { name: 'Ars Technica - Technology Lab', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab' },
  ],
  humanities: [
    { name: 'Nature News', url: 'https://www.nature.com/nature.rss' },
  ],
  frontier_models: [
    { name: 'OpenAI News', url: 'https://openai.com/news/rss.xml' },
    { name: 'Google DeepMind Blog', url: 'https://deepmind.google/blog/rss.xml' },
    { name: 'Microsoft Research Blog', url: 'https://www.microsoft.com/en-us/research/feed/' },
    { name: 'NVIDIA Blog', url: 'https://blogs.nvidia.com/feed/' },
    { name: 'MIT News - AI', url: 'https://news.mit.edu/rss/topic/artificial-intelligence2' },
    { name: 'Interconnects', url: 'https://www.interconnects.ai/feed' },
    { name: 'Understanding AI', url: 'https://www.understandingai.org/feed' },
    { name: 'Transformer News', url: 'https://www.transformernews.ai/feed' },
    { name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/' },
  ],
  psychology: [],
  philosophy: [],
};

const DOMAIN_NAMES = {
  tech: '科技',
  humanities: '人文',
  frontier_models: '专项大模型',
  psychology: '心理',
  philosophy: '哲学',
};

const FETCH_TIMEOUT_MS = 8000;
const MAX_ITEMS_PER_SOURCE = 12;
// [v2.9] 正文抓取开关与预算。
// 为什么需要正文：v2.8 实测 RSS 摘要只给导语——DeepMind 的 Gemini 4 Argon
// 公告在正文里有 8 处关键口径（introductory price $2/$10、95% off、
// DeepSWE 77.9%、AutomationBench 51.3%、Fairwind 限量、"before making Argon
// available"），摘要里一个都没有。于是时间轴检测抽不到声明、口径错位检测
// 抽不到数字，两个模块连续零可用。
//
// 纪律：
//   - 默认关闭（FETCH_BODY=1 才启用），因为 140 条 × 正文抓取会把单轮 pipeline
//     从约 30 秒推到数分钟，且多数条目下游用不到正文。
//   - 只抓最新 N 条（MAX_BODY_ITEMS），按 pubDate 倒序，越新的越值得抓。
//   - 单条失败只丢该条正文（body 保持空），绝不抛错、绝不用知识库内容顶替。
//   - 抓到的正文只进 body 字段，不覆盖 description——description 是 RSS 原值，
//     两者来源不同，混淆会让下游无法判断哪句是摘要哪句是正文。
const MAX_BODY_ITEMS = 24;
const BODY_TIMEOUT_MS = 12000;
const BODY_MAX_CHARS = 6000;
// 用浏览器 UA：部分站点（Ars Technica 等）对非浏览器 UA 返回 405。
// 这不是绕过付费墙，只是让公开文章页面对脚本可见。
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** 把 HTML 压成纯文本：去 script/style/标签、解实体、压空白。 */
function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'").replace(/&mdash;/g, '—').replace(/&rsquo;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

/**
 * 抓单条正文。失败返回空串，不抛错。
 *
 * 为什么不能简单 slice(0, N)：v2.9 第一版实测 DeepMind 博客页前 6000 字符
 * 全是导航菜单（"Innovation & AI / Products & platforms / Company news / ..."），
 * 真正的跑分数据（DeepSWE 77.9%、AutomationBench 51.3%）在 8000+ 字符处。
 * 直接截断等于把关键口径切掉，正文增强等于白做。
 * 因此这里做两步：先按正文字符密度跳过站点头部，再截断到正文主体。
 */
async function fetchBody(url) {
  if (!url || !/^https?:\/\//.test(url)) return '';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BODY_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
    });
    if (!res.ok) return '';
    const ct = res.headers.get('content-type') || '';
    // 只处理 HTML；RSS/PDF/图片一律跳过（PDF 要另走解析器，不在本步范围）
    if (!/text\/html|application\/xhtml/i.test(ct)) return '';
    const raw = stripHtml(await res.text());
    return extractMainContent(raw);
  } catch (_) {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 从 strip 后的全文里取主体内容。
 *
 * 为什么不能简单 slice(0, N)：v2.9 实测 DeepMind 博客页前约 7900 字符全是
 * 导航菜单，真正的跑分数据（DeepSWE 77.9%）在 8042 字符处。
 *
 * 前三版的失败都记在这里，避免第四次踩同一个坑：
 *   第一版「3 连句平均长度 >= 60」→ DeepMind 导航块没有句末标点，整块粘成
 *     一句 3351 字符的"句"，判据在第一句误触发，start=0。
 *   第二版「取最靠后的导航串」→ 页面末尾 "Read more from Koray..." 把切割点
 *     推到末尾，只剩 1118 字符，正文全丢。
 *   第三版「取第一个导航串 + 跳到第一个长句」→ 第一个"长句"就是整块导航
 *     （3351 字符无标点），切割点仍落在导航块内部，DeepSWE 取不到。
 *
 * 现在用：**跳过整块导航**。站点头部的可靠特征是导航串成族出现——
 * DeepMind 页面里 "See all in" 出现 4 次、"See all" 出现 8+ 次、
 * "Back ..." 出现 4 次。做法：找最后一个"族成员"的位置，从那之后取。
 * 族成员限定为「只可能出现在导航里」的串（See all / Back Innovation /
 * Back Products / Explore our / Jump to / Main menu / Skip to ...），
 * **不含** Newsletter / Related stories / Read more from / Posted in
 * ——后四者也可能出现在正文尾部或作者信息里，第二版就是被它们拖到末尾的。
 */
function extractMainContent(text) {
  if (!text) return '';
  // 只可能出现在站点头部的导航族。取最靠后的一个作为导航块终点。
  const NAV_FAMILY = [
    'See all in', 'See all Products', 'See all Platforms', 'See all Devices',
    'See all Technology', 'See all Infrastructure', 'See all Learn',
    'Back Innovation', 'Back Products', 'Back to top',
    'Explore our', 'Jump to', 'Main menu', 'Skip to main content',
    'skip to content', 'Skip to navigation',
  ];
  let cut = -1;
  let hitMarker = '';
  for (const m of NAV_FAMILY) {
    const idx = text.lastIndexOf(m);
    if (idx > cut) { cut = idx; hitMarker = m; }
  }
  let start = 0;
  if (cut >= 0) {
    // 从导航块终点往后扫，跳过残余短串（栏目名、单字链接），落到长句上。
    const tail = text.slice(cut + hitMarker.length, cut + hitMarker.length + 600);
    const sents = tail.split(/(?<=[.!?。！？])\s+/);
    let acc = cut + hitMarker.length;
    for (const s of sents) {
      if (s.length >= 40) break;
      acc += s.length + 1;
    }
    start = acc;
  }
  return text.slice(start, start + BODY_MAX_CHARS);
}

/**
 * 给条目补正文。只处理传入的 items（调用方已按需筛好），
 * 并发上限用有界并发：24 条同时打 24 个站点可能触发对方限流。
 */
async function enrichWithBody(items, opts = {}) {
  const want = opts.want ?? process.env.FETCH_BODY === '1';
  if (!want) return { attempted: 0, succeeded: 0 };
  const targets = items.slice(0, MAX_BODY_ITEMS);
  let succeeded = 0;
  // 有界并发：4 条一批。实测 24 条分 6 批约 15-25 秒完成。
  const BATCH = 4;
  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH);
    const bodies = await Promise.all(batch.map(it => fetchBody(it.link)));
    for (const [j, it] of batch.entries()) {
      const b = bodies[j];
      if (b && b.length > 200) {   // 太短的多半是导航/登录页，不当正文
        it.body = b;
        succeeded++;
      }
    }
  }
  return { attempted: targets.length, succeeded };
}

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
    frontier_models: mk('frontier_models'),
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
    return {
      ok: true,
      items: parseFeed(xml).slice(0, MAX_ITEMS_PER_SOURCE)
        .map(it => ({ ...it, source: src.name, origin: 'live' })),
    };
  } catch (e) {
    // 不在这里 throw：改成返回 {ok:false}，让 fetchAll 并行收集结果。
    // 串行版用 try/catch 包裹是因为 await 会中断循环；并行版 Promise.all
    // 里任何一个 throw 都会让整个采集失败，所以必须把失败收敛成值。
    return { ok: false, error: e.message, items: [] };
  } finally {
    clearTimeout(timer);
  }
}

/** 真联网采集。任何源失败只丢该源，不影响其他源；全部失败则由调用方降级 */
async function fetchAll(opts = {}) {
  const out = {};
  // 并行抓取：旧版按域串行 await，单源超时 8 秒 × 13 源 = 最坏 104 秒。
  // 源之间互不依赖，并行后总耗时约等于最慢的那个源。
  const jobs = [];
  for (const [domain, sources] of Object.entries(RSS_SOURCES)) {
    if (!out[domain]) out[domain] = { domain, name: DOMAIN_NAMES[domain], news: [] };
    for (const src of sources) jobs.push({ domain, src });
  }
  const results = await Promise.all(jobs.map(({ domain, src }) => fetchFeed(src)));
  for (const [i, r] of results.entries()) {
    const { domain, src } = jobs[i];
    if (r.ok) {
      console.log(`  [live] ${domain}/${src.name}: ${r.items.length} 条`);
      out[domain].news.push(...r.items);
    } else {
      console.log(`  [WARN] ${domain}/${src.name} 抓取失败: ${r.error}`);
    }
  }
  for (const domain of Object.keys(out)) {
    if (!out[domain].news.length) delete out[domain];
  }

  // [v2.9] 正文增强（FETCH_BODY=1 时）。
  // 只抓全库最新的若干条，不按域分配——避免某个域把额度占满而最新的那条没抓到。
  if (opts.wantBody ?? process.env.FETCH_BODY === '1') {
    const all = [];
    for (const d of Object.values(out)) all.push(...d.news);
    all.sort((a, b) => String(b.pubDate || '').localeCompare(String(a.pubDate || '')));
    const st = await enrichWithBody(all);
    console.log(`  [body] 正文增强: 尝试 ${st.attempted} 条, 成功 ${st.succeeded} 条`);
    if (st.succeeded === 0 && st.attempted > 0) {
      console.log('  [WARN] 正文增强 0 成功：可能是站点反爬或网络问题。'
        + '下游将只有 RSS 摘要，时间轴与口径错位检测可能证据不足（已按降级处理）');
    }
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

// [v2.9] extractMainContent / stripHtml / enrichWithBody 一并导出：
// 测试要能直接验证「跳过站点头部」这段逻辑，不必每次真联网。
// 不导出的话，正文抓取的正确性只能靠跑完整 pipeline 观察，那太晚也太贵。
module.exports = {
  collectAll, loadFromKnowledgeBase, fetchAll, parseFeed,
  fetchBody, enrichWithBody, extractMainContent, stripHtml,
};
