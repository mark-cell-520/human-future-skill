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
    // [v2.13] Anthropic 官方博客：无 RSS（实测 4 个常见路径全 404），走 sitemap。
    // 它是本期唯一发布带明确时间点可结算预测的厂商源——agent 自己发现这个缺口
    // 并写明「采集范围决定辨别上限」。
    // pathPrefixes 同时覆盖 /news/ 与 /research/：IoT 自复制那篇可结算预测
    // 在 /research/self-replicating-ai，只采 /news/ 会漏掉它（实测踩过）。
    { name: 'Anthropic News (sitemap)', url: 'https://www.anthropic.com/sitemap.xml',
      type: 'sitemap', pathPrefixes: ['/news/', '/research/'] },
    // [v2.13] EU AI Act 实施时间表：**有法定截止日**的预测源。
    //
    // 为什么加：实测通用博客源（AstralCodexTen 等）近期全是 Open Thread 与
    // 书评，0 条预测性句子；Metaculus API 全面 403（Cloudflare 拦截），
    // ?format=rss 返回的是 Next.js HTML 不是真 RSS；Epoch AI 页面 JS 渲染，
    // curl 拿不到内容。真正缺的不是「更多博客」，而是**带硬截止日的承诺**。
    //
    // EU AI Act 的义务表述天然可结算——「providers must do X by August 2026」
    // 有主体、有事件、有法定时点，到点就能验证有没有做到。
    // 实测该源 9 条里有带日期义务句（"must do by August 2026"）。
    // timeoutMs=45000：该源 feed 有 527KB（每条 content:encoded 9-19KB 全文），
    // 8 秒传不完（实测 50 秒）。解析器不读 content:encoded，正文另有 FETCH_BODY
    // 拉，所以这 527KB 纯属浪费——但 HTTP Range 被服务端忽略，只能靠缓存。
    // cacheTtlMs=6h：该源最新条目是 8 月 7 日，6 小时内不会变。
    { name: 'EU AI Act Timeline', url: 'https://artificialintelligenceact.eu/feed/',
      timeoutMs: 45000, cacheTtlMs: 6 * 60 * 60 * 1000 },
    // NIST 新闻：监管节点与标准发布，同样有官方时点。
    { name: 'NIST News', url: 'https://www.nist.gov/news-events/news/rss.xml' },
  ],
  psychology: [],
  philosophy: [],
  // ── 宏观经济域 ────────────────────────────────────────────────
  // [v2.13] 补上长期空缺的经济域采集源。
  //
  // 背景：economy_labor（经济与就业）域在推演引擎里有 32 个关键词，
  // 但 RSS_SOURCES 里从来没有对应源——SKILL.md 的「已知边界」写着
  // 「psychology / philosophy 两个域暂无 RSS 源」，经济域同样没有，
  // 只是没写进去。结果经济域每轮都只读到知识库，没有 live 数据。
  //
  // 选源过程（实测 20+ 个候选，大多数不可用）：
  //   BLS / Census / IMF / OECD / World Bank / WSJ / Economist / FT / Reuters
  //   → 全部 403 或连接失败（反爬或 geo-block）
  //   FRED API → 返回 Site Maintenance 页面（服务端维护中）
  //   FRED fredgraph.csv → 连接失败
  // 最终确认可用且内容对口的 4 个：
  //   Federal Reserve press_monetary → FOMC 声明与经济预测（一手政策数据）
  //   ECB press → 欧元区货币政策与监管（含 pubDate 与 link）
  //   NBER → 经济学工作论文（学术口径，非媒体转述）
  //   EconBrowser → 宏观数据分析（含实际数据解读）
  //
  // 诚实性说明：这些是**政策公告与研究解读**，不是原始统计序列
  // （失业率、CPI 等数值需 FRED/BLS，当前不可用）。
  // 报告里不得把它们当成统计数据引用，只能当「政策与研究动向」。
  economy: [
    { name: 'Federal Reserve (Monetary)', url: 'https://www.federalreserve.gov/feeds/press_monetary.xml' },
    { name: 'ECB Press', url: 'https://www.ecb.europa.eu/rss/press.html' },
    { name: 'NBER Working Papers', url: 'https://www.nber.org/rss/new.xml' },
    { name: 'EconBrowser', url: 'https://econbrowser.com/feed' },
  ],
};

const DOMAIN_NAMES = {
  tech: '科技',
  humanities: '人文',
  frontier_models: '专项大模型',
  psychology: '心理',
  philosophy: '哲学',
  economy: '宏观经济',
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
    // [v2.13] 通用数字实体解码。
    // 实测踩坑：EU AI Act 的 feed 用 &#8217;（弯撇号）、&#8220; 等数字实体，
    // 而上面只硬编码了少数几个。残留的 &#8217; 会让辨别层的正则匹配不到
    // （"they&#8217;ll" 不匹配 "they'll"），报告里也直接显示实体乱码。
    // 用 String.fromCodePoint 统一解码所有 &#NNNN; 与 &#xHHHH; 形态。
    .replace(/&#(\d+);/g, (_, d) => {
      const c = Number(d);
      return (c > 0 && c <= 0x10FFFF) ? String.fromCodePoint(c) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const c = parseInt(h, 16);
      return (c > 0 && c <= 0x10FFFF) ? String.fromCodePoint(c) : _;
    })
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
    // [v2.13] 复用 stripHtml 而不是本地 clean——本地 clean 只解码 5 个实体，
    // EU AI Act 的标题用 &#8217;（弯撇号），残留后报告里直接显示实体乱码，
    // 且辨别层正则匹配不到（"they&#8217;ll" 不匹配 "they'll"）。
    // stripHtml 已含通用数字实体解码。
    const clean = (s) => stripHtml(String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'));
    items.push({
      title: clean(title), link: clean(link), pubDate: clean(pub),
      description: clean(desc).slice(0, 500),
    });
  }
  return items;
}

/**
 * [v2.13] Sitemap 采集器。
 *
 * 为什么需要：Anthropic 官方博客没有 RSS（实测 /news/rss.xml、/rss.xml、
 * /feed.xml、/research/rss.xml 全部 404），但它是本期唯一发布带明确时间点
 * 可结算预测的厂商源（IoT 自复制研究写「今年底达到该能力水平」）。
 * 缺了它，预测辨别器只能抓到意图声明，抓不到可结算预测——
 * 实测 agent 自己发现了这个缺口并写明「采集范围决定辨别上限」。
 *
 * sitemap.xml 有 <loc> + <lastmod>，足以支撑「近期更新了什么」的采集。
 * 与 RSS 的区别：sitemap 不含标题与摘要，只有 URL 和修改日期。
 * 因此标题从 URL 末段推导（连字符转空格），摘要留空——
 * 下游需要内容时会走 FETCH_BODY 抓正文。
 *
 * 诚实性约束：lastmod 是「页面最后修改时间」不是「发布时间」，
 * 两者可能不同（修订旧文也会更新 lastmod）。已在 origin 标记里区分。
 */
async function fetchSitemap(src) {
  const ctrl = new AbortController();
  // [v2.13] 允许按源覆盖超时：EU AI Act 的 feed 有 350KB（含全文），
  // 8 秒传不完必然超时（实测 30 秒都没传完）。src.timeoutMs 可单独放宽。
  const timer = setTimeout(() => ctrl.abort(), src.timeoutMs || FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(src.url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'human-future-skill/2.0 (knowledge collection)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const blocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];
    const items = [];
    for (const b of blocks) {
      const loc = (b.match(/<loc>([\s\S]*?)<\/loc>/) || [])[1] || '';
      const mod = (b.match(/<lastmod>([\s\S]*?)<\/lastmod>/) || [])[1] || '';
      if (!loc) continue;
      // 只取 src.pathPrefixes 限定的条目（如 /news/ 与 /research/），
      // 避免把 careers 页当新闻。兼容旧的单数 pathPrefix 字段。
      const prefixes = src.pathPrefixes || (src.pathPrefix ? [src.pathPrefix] : null);
      if (prefixes && !prefixes.some(p => loc.includes(p))) continue;
      const slug = loc.replace(/\/$/, '').split('/').pop() || '';
      // 末段太短或是纯索引页（如 /news 本身）则跳过
      if (!slug || slug.length < 8) continue;
      items.push({
        // 标题从 slug 推导：连字符转空格。这是推导值不是原标题，
        // 下游引用时应注意（正文抓取后可获得真标题）。
        title: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        link: loc,
        pubDate: mod ? new Date(mod).toUTCString() : '',
        description: '',
        source: src.name,
        origin: 'live',
        // 标记这是 sitemap 来源：lastmod 是修改时间不是发布时间
        _fromSitemap: true,
      });
    }
    // 按 lastmod 倒序取最新的若干条。
    // [v2.13] 必须用 Date.parse 比较，不能用 localeCompare——RFC 822/ISO 字符串
    // 按字典序排会得到错误顺序（hf-cron-fetch.sh 踩过同一个坑）。
    items.sort((a, b) => {
      const ta = Date.parse(a.pubDate || '');
      const tb = Date.parse(b.pubDate || '');
      if (isNaN(ta) && isNaN(tb)) return 0;
      if (isNaN(ta)) return 1;
      if (isNaN(tb)) return -1;
      return tb - ta;
    });
    return { ok: true, items: items.slice(0, MAX_ITEMS_PER_SOURCE) };
  } catch (e) {
    return { ok: false, error: e.message, items: [] };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFeed(src) {
  const ctrl = new AbortController();
  // [v2.13] 同 fetchSitemap：允许按源覆盖超时。
  const timer = setTimeout(() => ctrl.abort(), src.timeoutMs || FETCH_TIMEOUT_MS);
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
  //
  // [v2.13] 慢源缓存：EU AI Act 的 feed 有 527KB（每条 content:encoded 9-19KB
  // 全文），实测单次要 50 秒，而它每 2 小时才更新一次 cron——等于每轮都白等。
  // 更关键的是：解析器不读 content:encoded（只读 description，318 字节），
  // 正文另有 FETCH_BODY 单独拉，所以 feed 里的全文纯属浪费带宽。
  // HTTP Range 请求实测被服务端忽略（仍下 224KB），所以只能靠缓存。
  //
  // 规则：src.cacheTtlMs 非 0 的源，在 TTL 内复用上次结果。
  // 默认 TTL 6 小时——EU AI Act 最新条目是 8 月 7 日，6 小时足够。
  const jobs = [];
  const cacheDir = path.join(__dirname, '..', '.cache');
  const now = Date.now();
  for (const [domain, sources] of Object.entries(RSS_SOURCES)) {
    if (!out[domain]) out[domain] = { domain, name: DOMAIN_NAMES[domain], news: [] };
    for (const src of sources) jobs.push({ domain, src });
  }
  // 先读缓存，把还在 TTL 内的源直接跳过网络请求
  const needFetch = [];
  const cached = new Map();
  for (const job of jobs) {
    const ttl = job.src.cacheTtlMs;
    if (!ttl) { needFetch.push(job); continue; }
    const cf = path.join(cacheDir, `feed-${job.src.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`);
    try {
      if (fs.existsSync(cf)) {
        const c = JSON.parse(fs.readFileSync(cf, 'utf-8'));
        if (now - c.fetchedAt < ttl && Array.isArray(c.items)) {
          cached.set(job, c.items);
          continue;
        }
      }
    } catch (_) { /* 缓存损坏就重新抓 */ }
    needFetch.push(job);
  }
  const results = await Promise.all(needFetch.map(({ domain, src }) =>
    (src.type === 'sitemap' ? fetchSitemap(src) : fetchFeed(src))));
  // 把新抓到的结果写进缓存
  // [v2.13] 注意：r 必须取自 results（抓取结果），不是 needFetch（job 对象）。
  // 实测踩坑：第一版写成 `for (const [i, r] of needFetch.entries())`，
  // r 是 {domain, src} 对象，r.ok 恒为 undefined，缓存从未生成——
  // 而 catch (_) {} 把问题藏住了，白查了很久。
  for (const [i, r] of results.entries()) {
    const { src } = needFetch[i];
    if (!src.cacheTtlMs || !r.ok) continue;
    // [v2.13] 写失败要打印原因，不能静默吞掉——实测缓存从未生成，
    // 而 catch (_) {} 把真实错误藏了，白查了很久。
    try {
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(
        path.join(cacheDir, `feed-${src.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`),
        JSON.stringify({ fetchedAt: now, items: r.items }), 'utf-8');
    } catch (e) {
      console.log(`  [WARN] 写缓存失败 ${src.name}: ${e.message}`);
    }
  }
  // 合并：缓存命中的 + 新抓的
  const allResults = [];
  for (const job of jobs) {
    if (cached.has(job)) {
      allResults.push({ ok: true, items: cached.get(job), fromCache: true });
    } else {
      const idx = needFetch.indexOf(job);
      allResults.push(results[idx]);
    }
  }
  for (const [i, r] of allResults.entries()) {
    const { domain, src } = jobs[i];
    if (r.ok) {
      console.log(`  [live] ${domain}/${src.name}: ${r.items.length} 条${r.fromCache ? '（缓存）' : ''}`);
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
    // [v2.13] 正文增强的选取策略：每源保底 + 关键源加权。
    //
    // 为什么不能只按全库日期取前 N：实测 Anthropic 的
    // /research/self-replicating-ai（10-13）含本期唯一两条带明确时间点的
    // 可结算预测（"by the end of this year"、"by the end of 2026"），
    // 还带机制（ECI 年增 13.7，R²=0.95）与先行指标（ECI 分数）。
    // 但 Anthropic 有 10-19 的更新条目，按日期排时 10-13 那条拿不到额度。
    //
    // 策略：每源保底 1 条，PRIORITY_SOURCES 取更多，剩余额度按全库日期补足。
    //
    // 实测踩过的两个坑：
    //   1. quota=3 时 Anthropic 只拿到 10-19/10-19/10-18 三条，
    //      而 self-replicating-ai（10-13）排第 7，body 仍为 0。
    //   2. quota=6 时 Anthropic 拿到 6 条但仍不含 10-13（该源有 6 条比它新），
    //      且 picked 总数只有 17——额度没用满，因为内层 break 后没有继续补。
    // 所以 priority 源的 quota 要足够大（覆盖该源近期全部），
    // 且补足逻辑必须在所有源处理完之后统一按全库日期走。
    const PRIORITY_SOURCES = ['Anthropic News (sitemap)'];
    const PER_SOURCE_BASE = 1;
    const PER_SOURCE_PRIORITY = 12;   // 覆盖该源一次采集的全部条目
    const bySource = new Map();
    for (const n of all) {
      const s = n.source || '(未标注)';
      if (!bySource.has(s)) bySource.set(s, []);
      bySource.get(s).push(n);
    }
    const byTimeDesc = (a, b) => {
      const ta = Date.parse(a.pubDate || '');
      const tb = Date.parse(b.pubDate || '');
      if (isNaN(ta) && isNaN(tb)) return 0;
      if (isNaN(ta)) return 1;
      if (isNaN(tb)) return -1;
      return tb - ta;
    };
    const picked = [];
    const pickedSet = new Set();
    // 先保底：每源 1 条最新的（保证覆盖所有源）
    for (const [, items] of bySource) {
      items.sort(byTimeDesc);
      if (items[0] && picked.length < MAX_BODY_ITEMS) {
        picked.push(items[0]);
        pickedSet.add(items[0]);
      }
    }
    // 再给 priority 源加权：该源近期条目优先补足
    for (const [src, items] of bySource) {
      if (!PRIORITY_SOURCES.includes(src)) continue;
      items.sort(byTimeDesc);
      for (const it of items.slice(0, PER_SOURCE_PRIORITY)) {
        if (picked.length >= MAX_BODY_ITEMS) break;
        if (pickedSet.has(it)) continue;
        picked.push(it);
        pickedSet.add(it);
      }
    }
    // 最后剩余额度按全库日期补足（用 Date.parse，不用 localeCompare）
    const rest = all.filter(n => !pickedSet.has(n)).sort(byTimeDesc);
    for (const n of rest) {
      if (picked.length >= MAX_BODY_ITEMS) break;
      picked.push(n);
    }
    const st = await enrichWithBody(picked);
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
  fetchSitemap,
};
