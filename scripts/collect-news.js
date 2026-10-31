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
// [v3.4] SEC EDGAR 业绩备案采集器（新数据源）。它自带缓存与限速，
// 由 collectAll 在所有 RSS 落地之后调用——位置纪律同 v2.14 的 sitemap
// 日期解析：新网络负载不塞进现有源的 Promise.all。
const { collectEdgarFilings } = require('../human-future/scripts/edgar-collector.js');

// 九大域的 RSS 源。用户关心的推演域：AI 智能体安全与监管 / 诺贝尔奖 / 脑机接口 /
// 基因编辑 / 长寿衰老逆转 / 量子计算 / 人形机器人 / AI 能源与电网 / 太空探索
//
// [v2.7 新增] frontier_models「专项大模型」域：
//   用户 2026-10-20 要求「增加一个专项大模型的趋势和最新进展」。原采集源里
//   没有任何一家模型厂商的一手源，导致大模型方向的信号只能从二手科技媒体
//   转述里捡，且型号更新（GPT/Gemini/Claude/开源家族）几乎必然滞后。
//   本域 12 个源（9 个 v2.7 实测源 + Anthropic sitemap / EU AI Act / NIST），
//   每源最多取 12 条，防止 OpenAI 那种 1300 条的历史 feed 把候选池撑爆。
//   [2026-10-31 源可靠性审计] v2.7 当年写的是「8 秒超时内全部返回 200」，
//   2026-10-31 复测证明这句话对 MIT News 不成立：实测 27-40 秒才返回
//   （530KB），8 秒默认超时下 14 轮报告里只进去 8 轮。慢源已按源给
//   超时预算（见下方 timeoutMs），不再靠全局 FETCH_TIMEOUT_MS 一刀切。
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
    // [2026-10-31 源可靠性审计] timeoutMs=45000：2026-10-31 串行复测该源
    // 27.1 秒 / 40.0 秒才返回（530KB），8 秒默认超时下整源被静默丢掉——
    // 14 轮报告里只进去 8 轮（缺的轮次日志只有一行 [WARN] 抓取失败，
    // 没有任何断言会红，所以这个缺口存在了很久没人发现）。
    // 与 EU AI Act 同款做法：慢源单独给预算，不抬高全局 FETCH_TIMEOUT_MS
    // （健康源仍在 8 秒内返回，不为个别慢源拖慢每一轮）。
    { name: 'MIT News - AI', url: 'https://news.mit.edu/rss/topic/artificial-intelligence2',
      timeoutMs: 45000 },
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
  // [2026-10-31 源可靠性审计] ECB/NBER 按源给超时预算。
  // v2.14 只把 sitemap 页面解析移出第一阶段，没解决 RSS 并行抢占本身：
  // 2026-10-31 复测 NBER 1.7-18 秒大幅波动、ECB 偶发 >8 秒，14 轮报告里
  // NBER 只进 10 轮、ECB 12 轮（npm test 自己的采集段也在打
  // 「economy/NBER Working Papers 抓取失败: This operation was aborted」）。
  economy: [
    { name: 'Federal Reserve (Monetary)', url: 'https://www.federalreserve.gov/feeds/press_monetary.xml' },
    { name: 'ECB Press', url: 'https://www.ecb.europa.eu/rss/press.html', timeoutMs: 25000 },
    { name: 'NBER Working Papers', url: 'https://www.nber.org/rss/new.xml', timeoutMs: 30000 },
    { name: 'EconBrowser', url: 'https://econbrowser.com/feed' },
  ],
  // ── 商业域 ────────────────────────────────────────────────────
  // [v3.0.0] 心虫商业未来推演专用采集域。
  //
  // 为什么加：v2.13 及以前的推演对象是「人类文明」——AI 能力、生物技术、
  // 太空、治理。用户明确推演目的已变：**为了让心虫在未来商业中拿到结果**。
  // 文明级信号无法回答「心虫该做什么商业决策」，需要的是市场主张、竞品动向、
  // 资本流向、客户采用、合规需求这五类商业信号。
  //
  // 选源（实测 12 个候选，全部验证过可达性与内容对口）：
  //   TechCrunch AI → 融资/产品发布/竞品动作（实测含 DeepSeek $15B、
  //     Anthropic Claude Duet 等一手商业事件）
  //   The Information → 商业科技深度新闻（实测含 Nvidia B300、a16z、
  //     Meta 股票、Tesla capex 等资本市场信号）
  //   LastWeekInAI → 每周 AI 摘要（实测含 misalignment incidents 计数——
  //     这是「辨别/信任」需求是否真实存在的直接证据）
  //   ProductHunt → 产品发布（实测含 Claude Duet 等——看什么在出货、
  //     怎么定位、怎么定价）
  //
  // 与 economy 域的分工：economy 是宏观政策与研究（央行/学术），
  // business 是微观商业动作（融资/竞品/产品）。两者都进商业辨别层。
  business: [
    { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
    { name: 'The Information', url: 'https://www.theinformation.com/feed' },
    { name: 'Last Week in AI', url: 'https://lastweekin.ai/feed' },
    { name: 'ProductHunt', url: 'https://www.producthunt.com/feed' },
  ],
  // ── 全球新闻域（2026-10-31 全球多极化扩容）─────────────────────
  // 为什么加：v3.29 及以前的全部 RSS 源是英美主导（MIT TR/Nature/OpenAI/
  // Fed/ECB/TechCrunch…），心理与哲学两个域甚至是空的。推演「人类未来」
  // 却只读单极大国的叙事，等于用一只手鼓掌。本轮补上多极视角：
  //   欧洲公共广播（BBC/Guardian/DW/France24）——规范与社福叙事
  //   全球南方（Al Jazeera）——非西方视角的国际报道
  //   亚太（SCMP 英文）——中国与亚太的英文一手报道（不比二手转述）
  //   科学（Science news）——自然科学顶刊新闻（补 humanities 深度）
  //   太空（SpaceNews）——太空域的一手行业源（原来只有关键词没有源）
  //   防务地缘（Defense One）——军事/地缘信号
  //   财经（CNBC top news）——全球资本市场
  // 全部 2026-10-31 实测可达且解析出真实条目（BBC 35/SCMP 50/半岛 25）。
  global: [
    { name: 'BBC News - World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
    { name: 'The Guardian - World', url: 'https://www.theguardian.com/world/rss' },
    { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
    { name: 'France 24 (English)', url: 'https://www.france24.com/en/rss' },
    { name: 'Deutsche Welle - World', url: 'https://rss.dw.com/rdf/rss-en-world' },
    { name: 'SCMP - China/Asia', url: 'https://www.scmp.com/rss/91/feed' },
    { name: 'Science News', url: 'https://www.science.org/rss/news_current.xml' },
    { name: 'SpaceNews', url: 'https://spacenews.com/feed/' },
    { name: 'Defense One', url: 'https://www.defenseone.com/rss/all/' },
    { name: 'CNBC Top News', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
  ],
};

const DOMAIN_NAMES = {
  tech: '科技',
  humanities: '人文',
  frontier_models: '专项大模型',
  psychology: '心理',
  philosophy: '哲学',
  economy: '宏观经济',
  // [2026-10-31] 全球新闻域：多极国际源（英/欧/全球南方/亚太/科学/太空/防务/财经）
  global: '全球新闻',
  // [v3.4] SEC EDGAR 一手财报备案（8-K Item 2.02 业绩发布 + EX-99 附件）
  sec_filings: 'SEC 财报备案',
  business: '商业动态',
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

// [v2.14] sitemap 源的「真实发布时间」解析。
//
// 为什么需要：sitemap 只有 <lastmod>（页面最后修改时间），它**不是**发布时间。
// 实测证据（2026-10-24 探针 + cron 报告）：
//   - anthropic.com/news/100k-context-windows 发布于 2023-05-11，lastmod 却是
//     2026-10-15——一条三年前的旧闻，按 lastmod 排会被当成十天前的新闻；
//   - cron 报告实测抽查：按 lastmod 取的「最新 12 条」里 7 条是旧页修订，
//     真正的新发布被旧页编辑挤掉，报告日期全是假的。
// 修法：对 lastmod 最新的 N 个候选逐个抓页面，从 HTML 抽真实发布时间
// （JSON-LD datePublished / meta article:published_time / <time datetime>），
// 按**真实发布时间**重排后再截断到 MAX_ITEMS_PER_SOURCE。
// 抓不到页面的条目保留 lastmod 但打 _dateSource='sitemap-lastmod' 标记，
// 下游可识别「这是修改时间不是发布时间」，不得当发布日引用。
const SITEMAP_DATE_CANDIDATES = 24;   // 候选池：lastmod 最新的 N 条参与日期解析
const SITEMAP_DATE_TIMEOUT_MS = 6000; // 单页超时：比正文抓取短，失败即回退 lastmod
const SITEMAP_DATE_BATCH = 6;         // 有界并发：只打单一主机（如 anthropic.com），
                                      // 6 并发对 CDN 站点无压力，且把 24 个候选的
                                      // 串行批次数从 6 降到 4（实测每批约 2.5-3 秒）

// [v2.14] 页面 HTML 进程内缓存。sitemap 日期解析与正文增强抓的是同一批页面
// （Anthropic 页面实测 150-220KB），不缓存等于每页抓两遍。
// 只缓存成功结果；失败的（超时/403）不缓存，让正文阶段还有一次机会。
const pageHtmlCache = new Map();

/** 抓页面原始 HTML（带进程内缓存）。content-type 非 HTML 返回空串。 */
async function fetchPageHtml(url, timeoutMs = BODY_TIMEOUT_MS) {
  if (!url || !/^https?:\/\//.test(url)) return '';
  if (pageHtmlCache.has(url)) return pageHtmlCache.get(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
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
    const text = await res.text();
    pageHtmlCache.set(url, text);
    return text;
  } catch (_) {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

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
 * [v2.14] 从页面原始 HTML 里抽真实发布时间。
 *
 * 为什么不能只信 sitemap 的 lastmod：见 SITEMAP_DATE_CANDIDATES 处的实测记录
 * （100k-context-windows 发布于 2023-05-11，lastmod 2026-10-15）。
 *
 * 三种信源按可靠性排序，取第一个通过合理性校验的：
 *   1. JSON-LD `"datePublished":"..."`（Anthropic 等 Next.js 站在
 *      <script type="application/ld+json"> 里，探针实测存在）
 *   2. <meta article:published_time content="...">（属性顺序不定，正则按标签整体匹配）
 *   3. <time datetime="...">
 *
 * 合理性校验：未来日期（> 现在 + 1 天）一律拒绝——那可能是排期、模板占位或
 * 解析错误，不能当发布时间。全部信源都失败返回 null，由调用方回退 lastmod。
 *
 * 注意：必须在**原始 HTML** 上抽，stripHtml 会把 <script>（JSON-LD 所在处）
 * 整个删掉。
 */
function extractPublishDate(html) {
  if (!html) return null;
  const candidates = [];
  const ld = html.match(/"datePublished"\s*:\s*"([^"]+)"/i);
  if (ld) candidates.push(ld[1]);
  const metaRe = /<meta\b[^>]*>/gi;
  let m;
  while ((m = metaRe.exec(html))) {
    const tag = m[0];
    if (/article:published_time|og:published_time|name=["']date["']/i.test(tag)) {
      const c = tag.match(/content\s*=\s*"([^"]+)"/i);
      if (c) candidates.push(c[1]);
    }
  }
  const time = html.match(/<time\b[^>]*datetime\s*=\s*"([^"]+)"/i);
  if (time) candidates.push(time[1]);
  const now = Date.now();
  for (const c of candidates) {
    const t = Date.parse(c);
    if (!isNaN(t) && t <= now + 86400000) return new Date(t).toUTCString();
  }
  return null;
}

/**
 * 抓单条正文。失败返回空串，不抛错。
 *
 * 为什么不能简单 slice(0, N)：v2.9 第一版实测 DeepMind 博客页前 6000 字符
 * 全是导航菜单（"Innovation & AI / Products & platforms / Company news / ..."），
 * 真正的跑分数据（DeepSWE 77.9%、AutomationBench 51.3%）在 8000+ 字符处。
 * 直接截断等于把关键口径切掉，正文增强等于白做。
 * 因此这里做两步：先按正文字符密度跳过站点头部，再截断到正文主体。
 *
 * [v2.14] 改走 fetchPageHtml（带进程内缓存）：sitemap 日期解析阶段已经抓过
 * 同一批页面，直接复用，不重复请求。
 */
async function fetchBody(url) {
  if (!url || !/^https?:\/\//.test(url)) return '';
  const raw = await fetchPageHtml(url);
  if (!raw) return '';
  return extractMainContent(stripHtml(raw));
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
  // [v3.4] EDGAR 条目不走正文增强：它们的 link 是备案索引页
  // （不是发布正文），抓回来会覆盖采集器挂好的 outlook 文本；且其
  // 正文在采集时已经从 EX-99 附件拿到，没有二次抓取的需要。
  const targets = items.filter(it => it.source !== 'SEC EDGAR').slice(0, MAX_BODY_ITEMS);
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
 * [v2.13] Sitemap 采集器（为什么需要它）。
 *
 * Anthropic 官方博客没有 RSS（实测 /news/rss.xml、/rss.xml、
 * /feed.xml、/research/rss.xml 全部 404），但它是本期唯一发布带明确时间点
 * 可结算预测的厂商源（IoT 自复制研究写「今年底达到该能力水平」）。
 * 缺了它，预测辨别器只能抓到意图声明，抓不到可结算预测——
 * 实测 agent 自己发现了这个缺口并写明「采集范围决定辨别上限」。
 *
 * sitemap.xml 有 <loc> + <lastmod>。与 RSS 的区别：不含标题与摘要，
 * 标题从 URL 末段推导（连字符转空格），摘要留空——
 * 下游需要内容时会走 FETCH_BODY 抓正文。
 *
 * [v2.14] 诚实性约束已升级为真修复：lastmod 是「页面最后修改时间」不是
 * 「发布时间」，修订旧文也会更新 lastmod。v2.13 时代只在注释里声明这个
 * 区别，报告照用 lastmod 当发布日——实测 12 条「最新」里 7 条是旧页。
 * v2.14 起改抓页面抽真实发布时间，见 fetchSitemapEntries /
 * resolveSitemapDates 两个阶段的文档。
 */
/**
 * [v2.14] sitemap 采集第一阶段：只抓 XML，按 lastmod 取候选池。
 * 不碰页面——页面日期解析是第二阶段（resolveSitemapDates）的事。
 * 拆开的原因：见 fetchAll 里的竞争实测记录。
 */
async function fetchSitemapEntries(src) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), src.timeoutMs || FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(src.url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'human-future-skill/2.0 (knowledge collection)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const blocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];
    const entries = [];
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
      entries.push({
        // 标题从 slug 推导：连字符转空格。这是推导值不是原标题，
        // 下游引用时应注意（正文抓取后可获得真标题）。
        title: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        link: loc,
        lastMod: mod,
      });
    }
    // 候选池按 lastmod 倒序取。lastmod 是「近期被动过」的筛选器，
    // 真实发布时间决定池内排名——那是第二阶段的事。
    const byLastModDesc = (a, b) => {
      const ta = Date.parse(a.lastMod || '');
      const tb = Date.parse(b.lastMod || '');
      if (isNaN(ta) && isNaN(tb)) return 0;
      if (isNaN(ta)) return 1;
      if (isNaN(tb)) return -1;
      return tb - ta;
    };
    entries.sort(byLastModDesc);
    return { ok: true, candidates: entries.slice(0, SITEMAP_DATE_CANDIDATES) };
  } catch (e) {
    return { ok: false, error: e.message, candidates: [] };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * [v2.14] sitemap 采集第二阶段：抓候选页面抽真实发布时间，按真实发布时间
 * 排名后截断到 MAX_ITEMS_PER_SOURCE。
 *
 * 为什么不能只信 sitemap 的 lastmod：lastmod 是页面最后修改时间，旧页被编辑
 * （加相关链接、修错别字）也会更新 lastmod。实测 anthropic.com 按 lastmod
 * 取「最新 12 条」时 7 条是旧页——100k-context-windows 发布于 2023-05-11，
 * lastmod 2026-10-15，会被当成十天前的新闻，真正的新发布反而被挤掉，
 * 报告里的发布日期全是假的。
 *
 * lastmod 仍然有用：它决定哪些页面近期被动过，是候选池的筛选器。
 * 真实发布时间决定候选之间的最终排名，两者分工不同。
 *
 * 抓不到页面的条目保留 lastmod 但打 _dateSource='sitemap-lastmod' 标记，
 * 下游可识别「这是修改时间不是发布时间」，不得当发布日引用。
 */
async function resolveSitemapDates(src, candidates) {
  const pool = candidates.slice(0, SITEMAP_DATE_CANDIDATES);
  // 有界并发抓候选页面，抽真实发布时间。失败的条目保留 lastmod 并打标记。
  let resolved = 0;
  for (let i = 0; i < pool.length; i += SITEMAP_DATE_BATCH) {
    const batch = pool.slice(i, i + SITEMAP_DATE_BATCH);
    const htmls = await Promise.all(
      batch.map(e => fetchPageHtml(e.link, SITEMAP_DATE_TIMEOUT_MS)));
    for (const [j, e] of batch.entries()) {
      const pub = extractPublishDate(htmls[j]);
      if (pub) {
        e.pubDate = pub;
        e._dateSource = 'page-published';
        resolved++;
      } else {
        e.pubDate = e.lastMod ? new Date(e.lastMod).toUTCString() : '';
        e._dateSource = 'sitemap-lastmod';
      }
    }
  }
  // 最终排名按 pubDate（此时已是真实发布时间，回退条目才是 lastmod）。
  // 必须用 Date.parse 比较，不能用 localeCompare——RFC 822/ISO 字符串
  // 按字典序排会得到错误顺序（hf-cron-fetch.sh 踩过同一个坑）。
  pool.sort((a, b) => {
    const ta = Date.parse(a.pubDate || '');
    const tb = Date.parse(b.pubDate || '');
    if (isNaN(ta) && isNaN(tb)) return 0;
    if (isNaN(ta)) return 1;
    if (isNaN(tb)) return -1;
    return tb - ta;
  });
  const fellBack = pool.length - resolved;
  if (fellBack > 0) {
    console.log(`  [sitemap] ${src.name}: ${resolved} 条用页面真实发布时间，`
      + `${fellBack} 条回退 lastmod（页面抓取失败，日期是修改时间不是发布时间）`);
  }
  const items = pool.slice(0, MAX_ITEMS_PER_SOURCE).map(e => ({
    title: e.title,
    link: e.link,
    pubDate: e.pubDate,
    description: '',
    source: src.name,
    origin: 'live',
    // 标记这是 sitemap 来源，及日期的真实出处：
    //   page-published  = 从页面 HTML 抽到的发布时间（可信）
    //   sitemap-lastmod = 页面没抓到，退化为 lastmod（修改时间，≠ 发布时间）
    _fromSitemap: true,
    _dateSource: e._dateSource,
    _lastModified: e.lastMod ? new Date(e.lastMod).toUTCString() : '',
  }));
  return { ok: true, items };
}

/** sitemap 采集完整流程（两阶段合一）。测试与单独调用用这个入口。 */
async function fetchSitemap(src) {
  const phase1 = await fetchSitemapEntries(src);
  if (!phase1.ok) return { ok: false, error: phase1.error, items: [] };
  return resolveSitemapDates(src, phase1.candidates);
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
  // [v2.14] 第一阶段：所有源并行——sitemap 源只抓 XML，不抓页面。
  //
  // 第二阶段（sitemap 页面日期解析）刻意放在所有 RSS 落地之后串行做。
  // 实测教训（2026-10-24，git stash 对照实验）：把 24 个页面请求塞进第一阶段的
  // Promise.all，会与慢源竞争网络——ECB/NBER 在 8 秒超时下被挤出超时预算，
  // 经济域 live 源从 3-4 个掉到 2 个，v2.13i 测试连续两次失败
  // （原始代码 2/2 通过，改动后 2/2 失败，竞争是真实回退不是抖动）。
  // 两段分离后，页面解析不再占用任何现有源的超时窗口。
  const results = await Promise.all(needFetch.map(({ domain, src }) =>
    (src.type === 'sitemap' ? fetchSitemapEntries(src) : fetchFeed(src))));
  // [2026-10-31 源可靠性审计] 失败源串行重试一轮。
  //
  // 2026-10-31 实测：23 个源一把 Promise.all 时，每轮有 1-3 个源被丢，
  // 而且丢的是谁逐轮轮换（MIT News / 微软研究院 / NBER / Ars Technica 都丢过）——
  // 同一个源单独请求 0.5-3.6 秒就回来，并行下却 27-40 秒或被连接重置。
  // 这是**竞争**不是源坏：把超时从 8 秒抬到 45 秒也只剩部分缓解
  // （MIT News 仍在 45 秒档下被丢过，NBER 出过 fetch failed 连接错）。
  //
  // 串行重试只跑失败的那 1-3 个源，没有竞争，几乎必然成功；
  // 代价是每轮多 1-5 秒（只在真有失败时才花）。
  // 与正文抓取的有界并发（4 条一批）是同一条纪律：别让 20 多个请求
  // 同时挤一条出口。
  const failedJobs = [];
  for (let i = 0; i < needFetch.length; i++) {
    if (!results[i] || !results[i].ok) failedJobs.push(i);
  }
  for (const i of failedJobs) {
    const { domain, src } = needFetch[i];
    const r = await (src.type === 'sitemap' ? fetchSitemapEntries(src) : fetchFeed(src));
    results[i] = r;
    if (r.ok) {
      console.log(`  [live] ${domain}/${src.name}: ${r.items.length} 条（并行竞争失败，串行重试成功）`);
    }
  }
  for (let i = 0; i < needFetch.length; i++) {
    const { src } = needFetch[i];
    if (src.type !== 'sitemap') continue;
    const r1 = results[i];
    if (r1 && r1.ok) {
      results[i] = await resolveSitemapDates(src, r1.candidates);
    }
  }
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
    // [v3.4] SEC EDGAR 采集：所有 RSS 落地之后做（v2.14 位置纪律）。
    // 自带 6h 缓存，cron 两小时一轮也多数轮次零网络；单公司失败只丢
    // 该家，采集器整体抛错时该域如实缺席，不用任何数据顶替。
    try {
      const edgar = await collectEdgarFilings({ live: true });
      if (edgar.available && edgar.items.length) {
        live.sec_filings = {
          domain: 'sec_filings',
          name: DOMAIN_NAMES.sec_filings,
          news: edgar.items,
        };
        const withGuide = edgar.items.filter(it => it.guidance && it.guidance.length).length;
        console.log(`  [live] sec_filings/SEC EDGAR: ${edgar.items.length} 条`
          + `（${withGuide} 家含数值指引${edgar.fromCache ? '，缓存命中' : ''}）`);
      } else {
        console.log(`  [WARN] sec_filings/SEC EDGAR 不可用: ${edgar.reason || '(未说明原因)'}`);
      }
    } catch (e) {
      console.log(`  [WARN] sec_filings/SEC EDGAR 采集抛错，该域缺席: ${e.message}`);
    }
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
  fetchSitemap, fetchSitemapEntries, resolveSitemapDates,
  fetchPageHtml, extractPublishDate,
  // 测试专用：清理页面 HTML 进程内缓存（mock fetch 的用例之间需要隔离）
  _clearPageHtmlCache: () => pageHtmlCache.clear(),
};
