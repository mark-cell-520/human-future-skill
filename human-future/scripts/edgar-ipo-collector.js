#!/usr/bin/env node
'use strict';

/**
 * SEC EDGAR S-1/IPO 备案核查器 — human-future v3.23 新数据源
 *
 * ── 这个模块为什么存在 ───────────────────────────────────────────
 * v3.21 给商业辨别器立了 ipo-claim（IPO/上市过程主张）这个新维度，白纸黑字
 * 写下专属证伪路径：「EDGAR 查无/撤回/定价时间表不符/挂牌后披露矛盾」。
 * 但立库时只接了「文本里提到 S-1 就归公开财报档」这一条**文本判据**，
 * 四条证伪条件里没有任何一条有数据支撑——引擎从来不去 EDGAR 查过任何
 * S-1。后果（v3.22.1 轮 live 实证）：MIT Tech Review「After weeks of
 * frenzied speculation, Anthropic has filed its IPO prospectus.」被判
 * 证据不足/无出处(1)/weak-evidence——而事实上 Anthropic, PBC
 * （CIK 0002130357）确实于 2026-10-26 向 SEC 提交了 S-1
 * （accession 0001628280-26-067168，2026-10-29 browse-edgar 实测），
 * 主张的事实核心经一手登记记录完全成立，引擎却没有能力知道。
 * 「证伪路径写成可观测条件」≠「引擎能执行该检查」——本轮把第一条
 * （EDGAR 查无/在案）接上真数据（登记 corr-2026-043）。
 *
 * ── 数据源与分工 ───────────────────────────────────────────────
 * - browse-edgar 公司检索（www.sec.gov/cgi-bin/browse-edgar，output=atom）：
 *   按公司名解析 SEC 自己的公司归一化（conformed-name + CIK），再取该
 *   公司的 S-1 族备案（type=S-1 覆盖 S-1 与 S-1/A）。选它而不是全文本
 *   检索（efts.sec.gov）的原因：ipo 主张的证伪条件是**逐公司**的
 *   （「这家公司有没有备案」），全文本检索的召回取决于查询措辞
 *   （实测 q="artificial intelligence" 99 条命中的前 15 条全是空壳
 *   公司，Anthropic 反而不在头部），按公司名查才是证伪路径要的语义。
 * - 只做**备案存在性 + 流程事件**核查：匹配到 = 「该公司在窗口内向 SEC
 *   提交了 S-1」；未匹配到 = 「窗口内没有」（公司名匹配是启发式，且主张
 *   可能指向未来的备案动作——不等于已证伪，报告里必须这么写）。
 * - [v3.24] 流程事件（撤回 RW / 定价 424B4）经 data.sec.gov submissions
 *   登记记录观测——v3.23 立档时把「撤回/定价/挂牌后披露」整批列为「不做
 *   也不假装做、留人工执行」，但 browse-edgar 的 type=S-1 只是 SEC 的
 *   **一个端点**：同一公司的 submissions API 一次查询即返回全表单族的
 *   登记记录（live 实测：Cerebras 的 S-1→RW→再备案→424B4 全过程、
 *   Chobani 的 S-1 2021-11-17→RW 2022-09-02、Mobileye Global 的
 *   S-1 2023-06-05→424B4 2023-06-08 全部可观测）——「引擎不能执行」≠
 *   「没有数据支撑」，接新数据源时要扫该机构的其它端点（登记
 *   corr-2026-044）。事件只作可观测上下文：不抬证据档、不改 verdict、
 *   不改推理分（备案动作主张的事实核心由 S-1 记录验证，事件不推翻已
 *   发生的备案；撤回/定价是「IPO 在办」类主张证伪路径的可观测条件，
 *   由下游 agent 结合主张时点解读）。
 * - 仍不做：挂牌后披露矛盾（需要挂牌后的定期报告与 S-1 主张逐条对账，
 *   本轮不采，由人工/下游 agent 执行）。
 *
 * ── 诚实性约束（不可违反）───────────────────────────────────────
 * 1. 只升「备案动作形态」主张的证据档（files/filed/filing/submits +
 *    S-1/IPO/public debut）——文书主体（「S-1 Takeaways」类内容主张）
 *    与承销牵头（「Goldman to Lead IPO」类）只记录 EDGAR 在案事实作
 *    上下文，不抬证据档（内容与承销商身份需要 424B4/备案正文核对，
 *    本轮不采，不虚抬）。
 * 2. SEC fair access：User-Agent 声明身份，请求间隔 ≥120ms（与
 *    edgar-collector 同纪律）；单轮查询预算有上限，超预算的主张如实
 *    记「未核查」。
 * 3. 窗口过滤：只有窗口期（默认 365 天）内的 S-1 族备案算「在办」——
 *    live 实证 Mistral Acquisition CO 的 S-1/A 全是 2008 年，不过滤
 *    会把早已完结的历史备案当成在办 IPO。
 * 4. 网络失败/解析失败/非 200 → 整体降级 available=false 并写明原因，
 *    ipo 主张按原证据档判定，绝不静默跳过、不用缓存旧值顶替。
 * 5. 公司名匹配是启发式（候选名 token 必须全部出现在 SEC 归一化公司
 *    名里），匹配结果的表述必须带公司与 accession，可逐条复核。
 */

const https = require('https');
const { discriminateCommercial, summarizeCommercial } = require('./commercial-discriminator.js');

const SEC_UA = 'HermesAgent human-future-skill (research collection; contact admin@example.com)';
const BROWSE_URL = (name) => 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany'
  + `&company=${encodeURIComponent(name)}&type=S-1&dateb=&owner=include&count=10&output=atom`;
// [v3.24] submissions API（data.sec.gov）：按 CIK 一次查询返回该公司全表单族
// 的登记记录。用它查 RW/424B4 而不是 browse-edgar 的 type=RW/424B4 的原因：
// ① browse-edgar 的 type 参数**只生效第一个**（live 实测 type=S-1&type=RW
// 与 type=S-1 返回完全相同，Mobileye 组合查询只有 S-1 族）；② 同名不同
// type 会解析到不同公司（live 实测「Mobileye」+type=S-1 → Mobileye Global
// Inc. CIK 0001910139，+type=RW → Mobileye B.V. CIK 0001607310），事件
// 必须锚定 S-1 匹配到的同一 CIK 才是同一实体；③ 一个 CIK 查询覆盖全部
// 表单族，比按表单类型多次查询省请求数（单轮预算内）。
const SUBMISSIONS_URL = (cik) => `https://data.sec.gov/submissions/CIK${String(cik).replace(/\D/g, '').padStart(10, '0')}.json`;

/** 在办 IPO 的备案窗口：365 天内的 S-1 族备案才算「在办」（见约束 3）。 */
const IPO_FILING_WINDOW_DAYS = 365;
/** SEC fair access 限速（与 edgar-collector 的 REQUEST_GAP_MS 同值）。 */
const REQUEST_GAP_MS = 120;
/** 单条主张最多查询的公司候选数（控制请求量与误匹配面）。 */
const MAX_CANDIDATES_PER_CLAIM = 5;
/** 单轮总查询预算（SEC fair access + 运行时长）。 */
const MAX_QUERIES_PER_RUN = 12;

/** S-1 族备案形态（browse-edgar 的 type=S-1 会返回 S-1 与 S-1/A）。 */
const S1_FORM_RE = /^S-1(?:\/A)?$/;
/** [v3.24] 撤回备案形态（RW = withdrawal of registration statement）。 */
const RW_FORM_RE = /^RW(?:\/A)?$/;
/** [v3.24] 定价备案形态（424B4 = final prospectus，IPO 定价后提交）。 */
const PRICING_FORM_RE = /^424B4$/;
/** [v3.24] submissions 登记记录里关注的 IPO 流程事件族。 */
const EVENT_FORM_RE = /^(?:S-1(?:\/A)?|RW|424B4)$/;

/**
 * 公司候选提取的停用词：句首大写普通词、法律/市场通用缩写、媒体与
 * 栏目名。目的不是穷举英语，而是把「After/The/Will」这类句首大写词
 * 的无效查询挡掉（实测这些词在 browse-edgar 要么解析到无备案公司、
 * 要么返回 SEC 的坏数据 name="ARRAY(0x...)"，都通不过归一化包含守卫）。
 */
const CANDIDATE_STOPWORDS = new Set([
  'ipo', 's-1', 's1', 'sec', 'edgar', 'the', 'ai', 'a', 'an', 'and', 'or', 'but',
  'ceo', 'cfo', 'cto', 'coo', 'nyse', 'nasdaq', 'inc', 'inc.', 'llc', 'ltd', 'ltd.',
  'corp', 'corp.', 'pbc', 'plc', 'lp', 'llp', 'co', 'co.', 'company', 'group',
  'after', 'before', 'when', 'while', 'despite', 'although', 'however', 'but',
  'this', 'that', 'these', 'those', 'it', 'its', 'his', 'her', 'their', 'our',
  'your', 'we', 'you', 'they', 'he', 'she', 'i', 'in', 'on', 'at', 'to', 'for',
  'with', 'from', 'by', 'as', 'is', 'are', 'was', 'were', 'has', 'have', 'had',
  'lead', 'leads', 'led', 'leading', 'files', 'filed', 'filing', 'submits', 'submitted',
  'will', 'would', 'can', 'could', 'should', 'may', 'might', 'must', 'not', 'no',
  'yes', 'if', 'then', 'than', 'so', 'such', 'both', 'each', 'few', 'more', 'most',
  'other', 'some', 'only', 'own', 'same', 'too', 'very', 'just', 'also', 'now',
  'new', 'amid', 'ahead', 'under', 'over', 'about', 'into', 'via', 'per', 'vs',
  'q1', 'q2', 'q3', 'q4', 'fy', 'us', 'u.s.', 'usa', 'eu', 'uk',
]);

/**
 * 解析 browse-edgar atom。
 * 只认**feed 级** company-info 的 conformed-name（live 实证：查询
 * "After" 时 SEC 返回 entry 内的坏数据 name="ARRAY(0x...)"，没有
 * conformed-name——那种响应必须判 found=false）。
 * @returns {{found: boolean, company: string, cik: string, filings: Array<{form:string, filedAt:string, accession:string, href:string}>}}
 */
function parseBrowseEdgarAtom(xml) {
  const src = String(xml || '');
  const out = { found: false, company: '', cik: '', filings: [] };
  const nameMatch = src.match(/<conformed-name>([^<]*)<\/conformed-name>/);
  if (!nameMatch) return out;
  out.found = true;
  out.company = nameMatch[1].trim();
  const cikMatch = src.match(/<cik>(\d+)<\/cik>/);
  out.cik = cikMatch ? cikMatch[1] : '';
  // 逐 entry 块解析：filing-date 在 filing-type 之前（atom 字段序），
  // 不能用「filing-type 后找 filing-date」的跨 entry 正则（实测会把
  // 下一个 entry 的日期配到这一个 entry 上）。
  const entryRe = /<entry\b[^>]*>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = entryRe.exec(src)) !== null) {
    const e = m[1];
    const form = (e.match(/<filing-type>([^<]*)<\/filing-type>/) || [])[1];
    const filedAt = (e.match(/<filing-date>([^<]*)<\/filing-date>/) || [])[1];
    const accession = (e.match(/<accession-number>([^<]*)<\/accession-number>/) || [])[1];
    const href = (e.match(/<filing-href>([^<]*)<\/filing-href>/) || [])[1];
    if (!form || !filedAt) continue;
    out.filings.push({
      form: form.trim(), filedAt: filedAt.trim(),
      accession: (accession || '').trim(), href: (href || '').replace(/&amp;/g, '&').trim(),
    });
  }
  return out;
}

/**
 * 从主张文本提取公司名候选（按出现顺序去重）。
 * 规则（v3.23 live 冒烟实测修订）：
 * ① 先按 2+ 空格切分——采集层把标题与摘要拼进同一文本时用双空格连接，
 *    不切会让候选跨标题/摘要边界粘连（live 实证：「Payment Costs
 *    Anthropic S-1」这种垃圾候选）；
 * ② 连续大写开头单词序列（1-4 词，容忍 's/&/./-/数字）；
 * ③ 修剪序列首尾的停用词 token（"Lead Anthropic IPO"→"Anthropic"、
 *    "Anthropic PBC"→"Anthropic"）；
 * ④ 修剪后仍 ≥2 token 且内部含停用词或超过 2 token 的，补第一个 token
 *    单独作候选（"Anthropic S-1 Highlights Rising…"→补 "Anthropic"）——
 *    公司名常在垃圾后缀之前，不补则根本查不到它；
 * ⑤ claimSentence 的候选排在前（主张句里的公司名比 trailing 上下文里的
 *    更可能是主张主体）；来源名（媒体名）包含的候选跳过。
 */
function extractCompanyCandidates(text, source, claimSentence) {
  const src = String(text || '');
  const clean = (s) => s.replace(/\u2019/g, "'").replace(/\u2018/g, "'");
  const sourceNorm = clean(String(source || '')).toLowerCase();
  const seen = new Set();
  const out = [];
  const push = (cand) => {
    const key = cand.toLowerCase();
    if (seen.has(key) || cand.length < 3) return;
    if (CANDIDATE_STOPWORDS.has(key)) return;
    if (sourceNorm && sourceNorm.includes(key)) return;
    seen.add(key);
    out.push(cand);
  };
  const scan = (s) => {
    // ① 双空格切分（标题/摘要拼接缝）
    for (const chunk of s.split(/\s{2,}/)) {
      const re = /\b([A-Z][A-Za-z0-9]*(?:['\-&.][A-Za-z0-9]+)*(?:\s+(?:'s\s+)?[A-Z][A-Za-z0-9]*(?:['\-&.][A-Za-z0-9]+)*){0,3})/g;
      let m;
      while ((m = re.exec(chunk)) !== null) {
        const toks = m[1].trim().split(/\s+/);
        // ③ 修剪首尾停用词
        let a = 0, b = toks.length - 1;
        while (a <= b && CANDIDATE_STOPWORDS.has(toks[a].toLowerCase().replace(/'s$/, ''))) a++;
        while (b >= a && CANDIDATE_STOPWORDS.has(toks[b].toLowerCase().replace(/'s$/, ''))) b--;
        if (a > b) continue;
        const trimmed = toks.slice(a, b + 1).join(' ').replace(/\s+'s$/, '');
        push(trimmed);
        // ④ 内部停用词或长序列 → 补首 token
        const rest = toks.slice(a, b + 1);
        if (rest.length >= 2) {
          const interiorStop = rest.slice(1, -1).some(t => CANDIDATE_STOPWORDS.has(t.toLowerCase()));
          if (interiorStop || rest.length > 2) push(rest[0]);
        }
      }
    }
  };
  if (claimSentence) scan(clean(claimSentence));
  scan(clean(src));
  return out;
}

/**
 * 候选名与 SEC 归一化公司名的包含守卫：候选的每个 token 都必须出现在
 * 公司名里（"Anthropic" ⊆ "Anthropic, PBC"）。防止 SEC 模糊匹配把
 * 无关公司算成主张主体。
 */
function nameMatchesCompany(candidate, company) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter(Boolean);
  const cand = norm(candidate);
  const comp = norm(company);
  if (!cand.length || !comp.length) return false;
  return cand.every(t => comp.includes(t));
}

/** 窗口内最近的 S-1 族备案（无则 null）。 */
function pickRecentFiling(filings, opts = {}) {
  return pickRecentByForm(filings, S1_FORM_RE, opts);
}

/**
 * [v3.24] 窗口内最近的某形态备案（泛化实现，S-1/RW/424B4 共用）。
 * 窗口纪律与 pickRecentFiling 完全一致：只有窗口期内的登记记录算事件——
 * live 实证 Mistral Acquisition CO 的 S-1/A 全是 2008 年、Mobileye B.V.
 * 的 RW 是 2018-02-07，不过滤会把早已完结的历史备案当成在办事件。
 * @param {Array<{form:string, filedAt:string}>} filings
 * @param {RegExp} formRe 表单形态正则
 * @param {{now?: Date|string, windowDays?: number}} opts
 */
function pickRecentByForm(filings, formRe, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const windowDays = opts.windowDays || IPO_FILING_WINDOW_DAYS;
  const cutoff = now.getTime() - windowDays * 86400000;
  const recent = (filings || [])
    .filter(f => formRe.test(f.form) && Date.parse(f.filedAt) >= cutoff)
    .sort((a, b) => Date.parse(b.filedAt) - Date.parse(a.filedAt));
  return recent.length ? recent[0] : null;
}

/**
 * [v3.24] 解析 data.sec.gov submissions JSON → IPO 流程事件族
 * （S-1 族/RW/424B4）。只取 filings.recent（最近约 1000 条，窗口内的
 * 事件必在其中；更早的分页文件对 365 天窗口无意义）。
 * @returns {{company: string, events: Array<{form:string, filedAt:string, accession:string}>}}
 */
function parseSubmissionEvents(json) {
  let j = json;
  if (typeof json === 'string') {
    try { j = JSON.parse(json); } catch (_) { return { company: '', events: [] }; }
  }
  const company = (j && j.name) ? String(j.name).trim() : '';
  const rec = j && j.filings && j.filings.recent;
  const events = [];
  if (rec && Array.isArray(rec.form)) {
    for (let i = 0; i < rec.form.length; i++) {
      const form = String(rec.form[i] || '').trim();
      const filedAt = String((rec.filingDate || [])[i] || '').trim();
      if (!EVENT_FORM_RE.test(form) || !filedAt) continue;
      events.push({
        form, filedAt,
        accession: String((rec.accessionNumber || [])[i] || '').trim(),
      });
    }
  }
  return { company, events };
}

/** 默认 http：带 UA 的 https.get（不跟随重定向；实测 atom 直返 200）。
 *  [v3.24] accept 参数：submissions API 要 application/json。 */
function defaultHttp(url, accept) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': SEC_UA, 'Accept': accept || 'application/atom+xml' } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    }).on('error', reject);
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * 单公司查询：browse-edgar → atom 解析。任何失败都返回 {ok:false}，
 * 不抛出（调用方决定降级措辞）。
 */
async function lookupCompanyS1(name, opts = {}) {
  const http = opts.http || defaultHttp;
  try {
    const res = await http(BROWSE_URL(name));
    if (!res || res.status !== 200) {
      return { ok: false, reason: `EDGAR 查询 ${name} 返回 status=${res && res.status}` };
    }
    const parsed = parseBrowseEdgarAtom(res.body);
    if (!parsed.found) return { ok: false, reason: `EDGAR 未解析到公司「${name}」`, notFound: true };
    return { ok: true, company: parsed.company, cik: parsed.cik, filings: parsed.filings };
  } catch (e) {
    return { ok: false, reason: `EDGAR 查询 ${name} 抛错: ${e.message}` };
  }
}

function isIpoResult(r) {
  return r && ((r.kinds || []).includes('ipo') || r.kind === 'ipo');
}

/**
 * [v3.24] 单公司流程事件查询：submissions API（按 CIK，锚定 S-1 匹配到的
 * 同一实体）→ S-1/RW/424B4 族事件。任何失败返回 {ok:false}，不抛出
 * （调用方决定降级措辞）。notFound 只用于「CIK 缺失」这种输入问题——
 * 「查了但没有事件」（ok:true, events:[]）与「查不到」必须分开：
 * 前者是可观测的「窗口内无流程事件」，后者是数据不可用。
 */
async function lookupCompanyEvents(cik, opts = {}) {
  const http = opts.http || defaultHttp;
  const cleanCik = String(cik || '').replace(/\D/g, '');
  if (!cleanCik) return { ok: false, reason: 'CIK 缺失，无法查询流程事件', notFound: true };
  try {
    const res = await http(SUBMISSIONS_URL(cleanCik), 'application/json');
    if (!res || res.status !== 200) {
      return { ok: false, reason: `EDGAR submissions 查询 CIK ${cleanCik} 返回 status=${res && res.status}` };
    }
    const parsed = parseSubmissionEvents(res.body);
    return { ok: true, company: parsed.company, events: parsed.events };
  } catch (e) {
    return { ok: false, reason: `EDGAR submissions 查询 CIK ${cleanCik} 抛错: ${e.message}` };
  }
}

/**
 * 对商业辨别段的 ipo 主张做 EDGAR 备案核查（v3.23 新数据源的编排层，
 * [v3.24] 扩展流程事件观测：撤回 RW / 定价 424B4）。
 *
 * 流程：逐条 ipo 主张 → 提取公司候选（claimSentence 优先）→ 逐个查询
 * browse-edgar（120ms 间隔 + 单轮预算 + run 内 memo）→ 第一个「候选名
 * 通过包含守卫 且 窗口内有 S-1 族备案」的公司即匹配 → [v3.24] 对匹配到
 * 的公司（无匹配时取第一个过守卫的公司）按 CIK 查 submissions 登记记录，
 * 取窗口内 RW/424B4 事件 → 把 edgarVerification（matched + events）挂回
 * claim 重跑辨别器（证据档抬升/ verdict 重算全部由辨别器自己决定，
 * 本模块不代判；事件只作上下文，不参与抬级）。
 *
 * 降级：非 live 模式不发起网络；http 注入时由测试控制。任何查询失败
 * 只影响该条主张的匹配结果，不中断整轮；S-1 查询全部失败时整体
 * available=false（不把「查不到」扮成「查无」）。事件查询失败不影响
 * S-1 核查结论，只在汇总里如实记 eventsAvailable=false。
 *
 * @param {object} cd projection.commercialDiscrimination
 * @param {{live?: boolean, http?: Function, now?: Date|string, gapMs?: number}} opts
 * @returns {Promise<object>} 新的 commercialDiscrimination（带 ipoVerification 汇总）
 */
async function verifyIpoClaims(cd, opts = {}) {
  if (!cd || !cd.available || !Array.isArray(cd.results)) return cd;
  const ipoResults = cd.results.filter(isIpoResult);
  const summary = {
    available: true, checkedClaims: ipoResults.length, verified: 0, contextOnly: 0,
    unmatched: 0, queries: 0, windowDays: IPO_FILING_WINDOW_DAYS,
    // [v3.24] 流程事件（RW/424B4）观测计数
    withdrawn: 0, priced: 0, eventsQueries: 0, eventsFailed: 0, eventsAvailable: true,
    source: 'SEC EDGAR browse-edgar（S-1 族备案检索）+ data.sec.gov submissions（RW/424B4 流程事件）',
    note: '只核查备案存在性与流程事件：匹配到=该公司窗口内向 SEC 提交了 S-1；未匹配到=窗口内没有'
      + '（公司名匹配为启发式，不等于已证伪）。撤回（RW）/定价（424B4）事件经 submissions 登记'
      + '记录观测（同一 CIK、同一 365 天窗口）；事件只作可观测上下文，不抬证据档、不改判定。'
      + '挂牌后披露矛盾仍需人工/下游核对。',
  };
  if (ipoResults.length === 0) {
    return Object.assign({}, cd, {
      ipoVerification: Object.assign(summary, { note: '本期无 ipo 主张，未发起 EDGAR 查询。' + summary.note }),
    });
  }
  if (opts.live === false) {
    return Object.assign({}, cd, {
      ipoVerification: {
        available: false, checkedClaims: ipoResults.length, verified: 0, contextOnly: 0,
        unmatched: 0, queries: 0, windowDays: IPO_FILING_WINDOW_DAYS,
        reason: '非 live 模式（FETCH!=1）且无本轮采集，未发起 EDGAR 查询；ipo 主张按原证据档判定',
      },
    });
  }

  const http = opts.http || defaultHttp;
  const now = opts.now ? new Date(opts.now) : new Date();
  const gapMs = opts.gapMs === undefined ? REQUEST_GAP_MS : opts.gapMs;
  const memo = new Map();        // 候选名 → S-1 查询结果（run 内去重）
  const eventsMemo = new Map();  // [v3.24] CIK → submissions 查询结果（run 内去重）
  const verificationByIndex = new Map();

  outer:
  for (let i = 0; i < cd.results.length; i++) {
    const r = cd.results[i];
    if (!isIpoResult(r)) continue;
    const candidates = extractCompanyCandidates(r.text, r.source, r.claimSentence)
      .slice(0, MAX_CANDIDATES_PER_CLAIM);
    const checked = [];
    let matched = null;
    let failReason = null;
    let firstGuarded = null;   // [v3.24] 第一个通过包含守卫的公司（无 S-1 匹配时事件上下文的归属）
    for (const c of candidates) {
      if (summary.queries >= MAX_QUERIES_PER_RUN) {
        failReason = `单轮 EDGAR 查询预算（${MAX_QUERIES_PER_RUN} 次）已用尽，本条未完成核查`;
        break;
      }
      let res = memo.get(c);
      if (res === undefined) {
        if (summary.queries > 0 && gapMs > 0) await sleep(gapMs);
        res = await lookupCompanyS1(c, { http });
        summary.queries++;
        memo.set(c, res);
      }
      checked.push(c);
      if (!res.ok) {
        // 网络/解析类失败（不是「查无此公司」）记原因，但继续试后续候选
        if (!res.notFound) failReason = res.reason;
        continue;
      }
      // 包含守卫先于 S-1 判定：公司名不对的候选既不匹配也不作为事件归属
      // （v3.23 只在有 S-1 时才查守卫，事件查询需要守卫先行的公司身份）。
      if (!nameMatchesCompany(c, res.company)) continue;
      if (!firstGuarded) firstGuarded = { candidate: c, company: res.company, cik: res.cik };
      const filing = pickRecentFiling(res.filings, { now, windowDays: IPO_FILING_WINDOW_DAYS });
      if (filing && !matched) {
        matched = { candidate: c, company: res.company, cik: res.cik, form: filing.form, filedAt: filing.filedAt, accession: filing.accession, href: filing.href };
        break;
      }
    }
    if (checked.length === 0) {
      failReason = failReason || '未从主张文本提取到公司名候选';
    }
    // [v3.24] 流程事件查询：锚定 matched 的公司（无匹配时第一个过守卫的
    // 公司——「S-1 未匹配但 RW 在案」是撤回类证伪条件要观测的形态）。
    // 按 CIK 查保证与 S-1 匹配同一实体（同名不同 type 在 browse-edgar 会
    // 解析到不同公司，live 实证 Mobileye 案例）。
    let events = null;
    let eventsUnavailableReason = null;
    const eventTarget = matched || firstGuarded;
    if (eventTarget && eventTarget.cik) {
      if (summary.queries >= MAX_QUERIES_PER_RUN) {
        eventsUnavailableReason = `单轮 EDGAR 查询预算（${MAX_QUERIES_PER_RUN} 次）已用尽，RW/424B4 事件未核查（S-1 核查结果不受影响）`;
      } else {
        let ev = eventsMemo.get(eventTarget.cik);
        if (ev === undefined) {
          if (summary.queries > 0 && gapMs > 0) await sleep(gapMs);
          ev = await lookupCompanyEvents(eventTarget.cik, { http });
          summary.queries++;
          summary.eventsQueries++;
          eventsMemo.set(eventTarget.cik, ev);
        }
        if (ev.ok) {
          // 「查了但没有事件」与「查不到」分开：ok:true + 空事件 = 窗口内
          // 无 RW/424B4（可观测的无事件），不是数据不可用。
          const withdrawal = pickRecentByForm(ev.events, RW_FORM_RE, { now, windowDays: IPO_FILING_WINDOW_DAYS });
          const pricing = pickRecentByForm(ev.events, PRICING_FORM_RE, { now, windowDays: IPO_FILING_WINDOW_DAYS });
          events = {
            company: ev.company || eventTarget.company, cik: eventTarget.cik,
            withdrawal, pricing,
          };
        } else if (!ev.notFound) {
          summary.eventsFailed++;
          eventsUnavailableReason = ev.reason;
        }
      }
    }
    verificationByIndex.set(i, { matched, checked, reason: failReason, events, eventsUnavailableReason });
    if (summary.queries >= MAX_QUERIES_PER_RUN) break outer;
  }

  // 挂 edgarVerification 重跑辨别器：证据档/ verdict / decisionRelevant
  // 的重算全部在辨别器内完成（单一判定源），本模块不代判。
  const newResults = cd.results.map((r, i) => {
    const v = verificationByIndex.get(i);
    if (!v) return r;
    const reDisc = discriminateCommercial({
      text: r.text, claimSentence: r.claimSentence, source: r.source, date: r.date,
      url: r.url, category: r.category, edgarVerification: v,
    });
    if (reDisc.edgarIpoCheck && reDisc.edgarIpoCheck.upgraded) summary.verified++;
    else if (reDisc.edgarIpoCheck && reDisc.edgarIpoCheck.matched) summary.contextOnly++;
    else summary.unmatched++;
    // [v3.24] 流程事件计数（只作上下文，不影响上面的分级）
    const ev = reDisc.edgarIpoCheck && reDisc.edgarIpoCheck.events;
    if (ev && ev.withdrawal) summary.withdrawn++;
    if (ev && ev.pricing) summary.priced++;
    return reDisc;
  });

  // [v3.24] 事件查询整体失败时如实记 eventsAvailable=false——S-1 核查结论
  // 不受影响（available 不变），但「窗口内无事件」与「事件查不到」不能混。
  if (summary.eventsQueries > 0 && summary.eventsFailed === summary.eventsQueries) {
    summary.eventsAvailable = false;
    summary.eventsReason = 'EDGAR submissions 查询失败（网络或解析），RW/424B4 流程事件不可见（S-1 备案核查结果不受影响）';
  }

  // 全部主张都因查询失败（网络/解析，不是「查无此公司」）未匹配时如实
  // 降级——不把「查不到」扮成「查无」（诚实性约束 4）。
  const anyQueryFailed = [...memo.values()].some(v => !v.ok && !v.notFound);
  if (anyQueryFailed && summary.verified + summary.contextOnly === 0 && summary.unmatched === ipoResults.length) {
    summary.available = false;
    summary.reason = 'EDGAR 查询失败（网络或解析），ipo 主张按原证据档判定';
  }
  // 汇总必须随重跑结果重算（summarizeCommercial 单一事实来源）——否则
  // 报告头部的决策相关计数/证据等级分布与逐条结果自相矛盾。
  return Object.assign({}, cd, {
    results: newResults,
    summary: summarizeCommercial(newResults),
    ipoVerification: summary,
  });
}

module.exports = {
  IPO_FILING_WINDOW_DAYS,
  REQUEST_GAP_MS,
  MAX_CANDIDATES_PER_CLAIM,
  MAX_QUERIES_PER_RUN,
  S1_FORM_RE,
  // [v3.24] 流程事件族（撤回/定价）与 submissions 端点
  RW_FORM_RE,
  PRICING_FORM_RE,
  EVENT_FORM_RE,
  SUBMISSIONS_URL,
  BROWSE_URL,
  parseBrowseEdgarAtom,
  parseSubmissionEvents,
  extractCompanyCandidates,
  nameMatchesCompany,
  pickRecentFiling,
  pickRecentByForm,
  lookupCompanyS1,
  lookupCompanyEvents,
  verifyIpoClaims,
};
