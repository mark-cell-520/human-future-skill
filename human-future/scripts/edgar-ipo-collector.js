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
const zlib = require('zlib');
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
  // [v3.27] 月份缩写 + 博客署名行 boilerplate——live 实证（2026-10-31
  // Understanding AI 条）：claimSentence 是「Kai Williams Oct 29, 2026 ∙
  // Paid 113 9 4 Share Back in June, Anthropic filed...」（RSS 正文的
  // 署名行与正文之间没有句读，切句切不掉），月份/Paid/Share 等 token
  // 把 MAX_CANDIDATES_PER_CLAIM=5 的候选切片占满，真正的公司名
  // （Anthropic）被切在切片外 → 整条 ipo 主张「未匹配」。停用词修剪
  // 后候选从署名行之后的真实公司名开始。
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  'paid', 'share', 'subscribe', 'sign', 'min', 'read',
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
// [v3.27] Buffer 收集 + gzip 探测解码：SEC 对大文档（S-1 主文档常见
// 5-20MB，Anthropic live 实测 14.2MB）会返回 gzip——旧实现逐 chunk
// `d += c`（隐式 toString）既解不了 gzip 也会在多字节字符跨 chunk 边界
// 时产生乱码。小响应（atom/json）行为不变（无 gzip magic 时原样解码）。
function defaultHttp(url, accept) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': SEC_UA, 'Accept': accept || 'application/atom+xml' } }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        let buf = chunks.length && Buffer.isBuffer(chunks[0])
          ? Buffer.concat(chunks)
          : Buffer.from(chunks.join(''), 'utf8');
        if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
          try { buf = zlib.gunzipSync(buf); } catch (_) {}
        }
        resolve({ status: res.statusCode, body: buf.toString('utf8') });
      });
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

// ── [v3.27] 备案正文（S-1 主文档）抓取与量化财务主张抽取 ──────────────
// 定位：v3.23 让引擎「能查备案存在性」、v3.24 让它「能观测撤回/定价
// 事件」，但备案正文里写的量化主张（营收/增速/客户规模/算力支出承诺/
// 人均营收）引擎从来没读过——v3.21 立库时写下的证伪路径第四条「挂牌
// 后披露矛盾」因此没有基线数据：没有备案自报数字，拿什么和挂牌后的
// 定期报告对账？live 实证（2026-10-31）：Understanding AI「Anthropic's
// financials are surprisingly strong — What I learned reading all 421
// pages of the Anthropic S-1」通篇是 S-1 财务数字的二手转述，而引擎
// 对一手正文零覆盖。本轮接上：匹配到 S-1 备案后按 accession 抓 Archives
// 主文档，抽取五形态量化主张（全部 live 实证驱动，见 S1_CLAIM_FORMS）。
//
// 诚实性约束：
// 1. 备案正文数字是**公司自报**——只作一手信源上下文透传（挂回
//    edgarVerification.s1Claims），不抬证据档、不改 verdict、不改推理
//    分：媒体主张的判定与备案自报数字是两件事，混为一体就是口径错位。
// 2. 抓取失败（网络/解析/超尺寸/无主文档）只记 s1Claims.available=
//    false + reason，S-1 存在性核查结论不受影响（存在性与正文内容是
//    两件事，不把「正文抓不到」静默成「窗口内无备案」）。
// 3. SEC fair access：与其余端点同纪律（UA 声明身份 + 120ms 间隔 +
//    单轮预算 + run 内 memo）；单文档尺寸上限 25MB（S-1 主文档常见
//    5-20MB，Anthropic 的 live 实测 14.2MB）。
// 4. 只认过去时/既成事实的量化陈述（revenue was / committed to spend
//    / customers with）——forward-looking 段落整句跳过（S1_SKIP_RE），
//    预测性表述不是已发生的主张。
// [v3.27] Archives 路径的 CIK **不带前导零**（live 实测：data.sec.gov
// 的 submissions 要补零到 10 位，Archives 的 data/<cik>/ 用裸数字——
// 带前导零的路径 SEC 回 301 重定向，而 defaultHttp 不跟随重定向）。
const ARCHIVES_INDEX_URL = (cik, accession) => `https://www.sec.gov/Archives/edgar/data/${String(cik).replace(/\D/g, '').replace(/^0+/, '')}/${String(accession || '').replace(/-/g, '')}/index.json`;
const MAX_FILING_DOC_BYTES = 25 * 1024 * 1024;
const S1_MAX_CLAIMS = 10;
const S1_PER_FORM_CAP = 2;
const S1_SKIP_RE = /forward-looking/i;

// 五形态量化主张（2026-10-31 Anthropic S-1 live 实抓原文驱动；每形态
// 的 res 数组须全部命中——「营收+金额」与「增速」两件套相邻共现，
// 无量化值的修辞句不进库，v3.26 同型纪律）。
const S1_CLAIM_FORMS = [
  { id: 'revenue-growth', label: '营收与同比增速', res: [
    /\brevenues?\b[^.!?]{0,160}\$\s*[\d.,]+\s*(?:million|billion)/i,
    /growth[^.!?]{0,60}\d+(?:\.\d+)?\s*%/i ] },
  { id: 'revenue-level', label: '营收水平', res: [
    /\b(?:revenue|revenues)\s+(?:was|were|of)\s+\$\s*[\d.,]+\s*(?:million|billion)/i ] },
  { id: 'customer-scale', label: '客户规模', res: [
    /[\d,]+\s+customers?\s+with\s+\$\s*[\d.,]+(?:\s*(?:million|thousand))?\s*(?:or\s+more\s+)?of\s+revenue/i ] },
  { id: 'compute-commitment', label: '算力支出承诺', res: [
    /commit(?:ted|ment|s)?\s+to\s+spend[^.!?]{0,140}\$\s*[\d.,]+\s*(?:million|billion)/i ] },
  { id: 'revenue-per-employee', label: '人均营收', res: [
    /revenue\s+per\s+employee[^.!?]{0,90}\$\s*[\d.,]+\s*(?:million|billion)/i ] },
];

const S1_NAMED_ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  mdash: '—', ndash: '–', hellip: '…',
  rsquo: '\u2019', lsquo: '\u2018', ldquo: '\u201C', rdquo: '\u201D',
};

/**
 * 备案 HTML → 纯文本。块级标签转空格（保句界）、行内标签直接删除
 * （SEC 正文把单词拆进 <span>/<font> 里，转空格会造出 "effic iency"
 * 这类断词 artifact——live 实测踩过）；数字实体与常用名字实体解码；
 * 「N Table of Contents」页码残留与 bullet 间距规整。
 */
function decodeFilingHtml(buf) {
  let t = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf || '');
  t = t.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  t = t.replace(/<\/\s*(p|div|tr|li|h[1-6]|table|thead|tbody)>/gi, ' ');
  t = t.replace(/<br\s*\/?>/gi, ' ');
  t = t.replace(/<[^>]+>/g, '');
  t = t.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in S1_NAMED_ENTITIES ? S1_NAMED_ENTITIES[n.toLowerCase()] : m));
  t = t.replace(/•\s*/g, '• ').replace(/\d{1,3}\s*Table of Contents/g, ' ').replace(/\bTable of Contents\b/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

/**
 * 从 index.json 的目录项里挑主文档：.htm 且非索引页，取尺寸最大者
 * （S-1 主文档是全文，live 实测 Anthropic 14.2MB 远大于其余附件）。
 * 超过 MAX_FILING_DOC_BYTES 的不抓（fair access + 时间预算）。
 */
function pickMainDocument(indexJson) {
  let j;
  try { j = typeof indexJson === 'string' ? JSON.parse(indexJson) : indexJson; } catch (_) { return null; }
  const items = (j && j.directory && j.directory.item) || [];
  const htm = items
    .filter(i => /\.htm[l]?$/i.test(i.name || '') && !/-index\.html?$/i.test(i.name || ''))
    .map(i => ({ name: i.name, size: parseInt(i.size, 10) || 0 }))
    .filter(i => i.size > 0 && i.size <= MAX_FILING_DOC_BYTES)
    .sort((a, b) => b.size - a.size);
  return htm.length ? htm[0] : null;
}

/**
 * 抽取备案正文量化主张。形态优先序（form-major）+ 每形态上限 2 + 总上限
 * 10；同句只归第一个命中的形态（去重 key = 句子前 80 字符归一）。
 * @returns {Array<{form:string,label:string,sentence:string}>}
 */
function extractS1Claims(text) {
  const sents = String(text || '')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim().replace(/\s+([,.;:%])/g, '$1'))
    .filter(s => s.length >= 40 && s.length <= 500 && !S1_SKIP_RE.test(s));
  const out = [];
  const seen = new Set();
  for (const form of S1_CLAIM_FORMS) {
    let perForm = 0;
    for (const s of sents) {
      if (out.length >= S1_MAX_CLAIMS || perForm >= S1_PER_FORM_CAP) break;
      const key = s.toLowerCase().slice(0, 80);
      if (seen.has(key)) continue;
      if (form.res.every(re => re.test(s))) {
        seen.add(key);
        perForm++;
        out.push({
          form: form.id, label: form.label,
          sentence: s.length > 300 ? s.slice(0, 297) + '…' : s,
        });
      }
    }
  }
  return out;
}

/**
 * [v3.27] 备案正文抓取：index.json → 主文档 → 解码 → 主张抽取。
 * 任何失败返回 {ok:false, reason}，不抛出（调用方决定降级措辞）。
 */
async function lookupFilingClaims(cik, accession, opts = {}) {
  const http = opts.http || defaultHttp;
  // Archives 路径 CIK 不带前导零（与 ARCHIVES_INDEX_URL 同一口径）
  const cleanCik = String(cik || '').replace(/\D/g, '').replace(/^0+/, '');
  const cleanAcc = String(accession || '').replace(/-/g, '');
  if (!cleanCik || !cleanAcc) return { ok: false, reason: 'CIK 或 accession 缺失，无法抓取备案正文' };
  try {
    const idx = await http(ARCHIVES_INDEX_URL(cleanCik, cleanAcc), 'application/json');
    if (!idx || idx.status !== 200) {
      return { ok: false, reason: `EDGAR Archives 索引查询返回 status=${idx && idx.status}` };
    }
    const main = pickMainDocument(idx.body);
    if (!main) {
      return { ok: false, reason: '备案目录中未找到可抓取的主文档（.htm 缺失或超过尺寸上限）' };
    }
    const doc = await http(`https://www.sec.gov/Archives/edgar/data/${cleanCik}/${cleanAcc}/${main.name}`, 'text/html');
    if (!doc || doc.status !== 200) {
      return { ok: false, reason: `备案主文档 ${main.name} 抓取返回 status=${doc && doc.status}` };
    }
    const text = decodeFilingHtml(doc.body);
    if (text.length < 1000) {
      return { ok: false, reason: `备案主文档解码后文本过短（${text.length} 字符），疑似解析失败` };
    }
    const claims = extractS1Claims(text);
    return { ok: true, document: main.name, bytes: main.size, claims };
  } catch (e) {
    return { ok: false, reason: `备案正文抓取抛错: ${e.message}` };
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
 * 取窗口内 RW/424B4 事件 → [v3.27] 对匹配到的备案按 accession 抓正文
 * 主文档并抽取量化财务主张（营收/增速/客户规模/算力支出承诺/人均营收）
 * → 把 edgarVerification（matched + events + s1Claims）挂回 claim 重跑
 * 辨别器（证据档抬升/ verdict 重算全部由辨别器自己决定，本模块不代判；
 * 事件与备案正文数字都只作上下文，不参与抬级）。
 *
 * 降级：非 live 模式不发起网络；http 注入时由测试控制。任何查询失败
 * 只影响该条主张的匹配结果，不中断整轮；S-1 查询全部失败时整体
 * available=false（不把「查不到」扮成「查无」）。事件查询失败不影响
 * S-1 核查结论，只在汇总里如实记 eventsAvailable=false；[v3.27] 备案
 * 正文抓取失败同样只记 s1Claims.available=false+reason，不影响 S-1
 * 存在性核查结论（存在性与正文内容是两件事）。
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
    // [v3.27] 备案正文量化主张（S-1 主文档抽取）计数
    claimsQueries: 0, claimsFetched: 0, claimsFailed: 0, claimsTotal: 0, claimsAvailable: true,
    source: 'SEC EDGAR browse-edgar（S-1 族备案检索）+ data.sec.gov submissions（RW/424B4 流程事件）'
      + ' + Archives 备案正文（S-1 主文档量化主张）',
    note: '只核查备案存在性、流程事件与备案正文量化主张：匹配到=该公司窗口内向 SEC 提交了 S-1；'
      + '未匹配到=窗口内没有（公司名匹配为启发式，不等于已证伪）。撤回（RW）/定价（424B4）事件经 '
      + 'submissions 登记记录观测（同一 CIK、同一 365 天窗口）；事件与备案正文数字都只作可观测'
      + '上下文，不抬证据档、不改判定。备案正文量化主张是公司自报数字——v3.21 证伪路径第四条'
      + '「挂牌后披露矛盾」的基线数据：与后续 S-1/A、424B4 定价、挂牌后定期报告同口径对账由'
      + '人工/下游执行，引擎不代判。',
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
  const claimsMemo = new Map();  // [v3.27] accession → 备案正文主张抓取结果（run 内去重）
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
    // [v3.27] 备案正文量化主张抓取：锚定 matched 的 accession（只有
    // 匹配到 S-1 才有正文可抓；firstGuarded 无 accession——「未匹配」
    // 时没有基线数据可抽，不猜）。按 accession memo（同公司多条主张
    // 只抓一次）+ 单轮预算（14MB 级文档，抓取计 1 次查询）。
    // 失败只降级 s1Claims（available=false+reason），S-1 存在性结论
    // 与事件观测都不受影响——存在性与正文内容是两件事。
    let s1Claims = null;
    if (matched && matched.accession) {
      if (summary.queries >= MAX_QUERIES_PER_RUN) {
        s1Claims = { available: false, reason: `单轮 EDGAR 查询预算（${MAX_QUERIES_PER_RUN} 次）已用尽，备案正文未抓取（S-1 备案存在性核查结果不受影响）` };
      } else {
        let fc = claimsMemo.get(matched.accession);
        if (fc === undefined) {
          if (summary.queries > 0 && gapMs > 0) await sleep(gapMs);
          fc = await lookupFilingClaims(matched.cik, matched.accession, { http });
          summary.queries++;
          summary.claimsQueries++;
          // 计数按**文档**计（memo 命中不重复计）——「1 份备案 10 条主张」
          // 与「2 条主张各挂 10 条」不是一回事，汇总行不许虚增。
          if (fc.ok) { summary.claimsFetched++; summary.claimsTotal += fc.claims.length; }
          else summary.claimsFailed++;
          claimsMemo.set(matched.accession, fc);
        }
        if (fc.ok) {
          s1Claims = {
            available: true, company: matched.company, cik: matched.cik,
            accession: matched.accession, document: fc.document, bytes: fc.bytes,
            claims: fc.claims,
          };
        } else {
          s1Claims = { available: false, reason: fc.reason };
        }
      }
    }
    verificationByIndex.set(i, { matched, checked, reason: failReason, events, eventsUnavailableReason, s1Claims });
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

  // [v3.27] 备案正文抓取整体失败时如实记 claimsAvailable=false——同样不
  // 影响 S-1 存在性核查结论：「正文抓不到」与「备案不存在」不能混。
  if (summary.claimsQueries > 0 && summary.claimsFailed === summary.claimsQueries) {
    summary.claimsAvailable = false;
    summary.claimsReason = 'EDGAR Archives 备案正文抓取失败（网络/解析/尺寸），量化主张不可见（S-1 备案存在性核查结果不受影响）';
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
  // [v3.27] 备案正文抓取与量化主张抽取
  ARCHIVES_INDEX_URL,
  MAX_FILING_DOC_BYTES,
  S1_MAX_CLAIMS,
  S1_PER_FORM_CAP,
  S1_CLAIM_FORMS,
  decodeFilingHtml,
  pickMainDocument,
  extractS1Claims,
  lookupFilingClaims,
  verifyIpoClaims,
};
