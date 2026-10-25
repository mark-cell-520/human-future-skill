#!/usr/bin/env node
'use strict';

/**
 * 商业主张辨别器 — human-future v3.0.0 第 10 个新模块
 *
 * 为什么需要：v2.13 的 forecast-discriminator 辨别的是「关于未来的预测」，
 * 判据是可证伪性/基准概率/推理有效性/证伪条件。但心虫商业推演面对的
 * 绝大多数主张**不是预测，而是市场陈述**：
 *
 *   "企业正在大规模采用 AI agent"
 *   "开源模型将杀死付费 AI 产品"
 *   "市场需要可验证的 AI 输出"
 *   "DeepSeek 融资 $15B，说明资本看好开源路线"
 *
 * 这些主张同样需要辨别，但判据不同：
 *   - 预测看「有没有时点」，市场主张看「有没有量化与证据等级」
 *   - 预测看「同类历史兑现率」，市场主张看「是调查自述、厂商口径还是独立验证」
 *   - 预测看「机制/先行指标/反例」，市场主张看「样本/对照/反例」
 *
 * 定位纪律（心虫铁律）：本模块只辨别主张的**表述与证据质量**，
 * 不判断「心虫该不该做某件事」，不生成商业建议。
 * 「这对心虫意味着什么」由报告 agent 自行判断并标注归属。
 *
 * 四维判别（商业向）：
 *   1. 可证伪性 —— 有主体 + 有量化 + 有时点/范围
 *   2. 证据等级 —— 独立验证 > 第三方调查 > 厂商自述 > 无出处修辞
 *   3. 推理有效性 —— 样本/对照/反例三要素
 *   4. 证伪条件 —— 观察到什么就说明这条主张错了
 */

/** 商业主张的形态：用于识别「这句是在做市场陈述」 */
const COMMERCIAL_CLAIM_PATTERNS = [
  // ── 市场采用类 ──
  { id: 'adoption-claim', re: /(enterprises?|companies|businesses?|firms?|organizations?)\s+(are|is|have been|has been)?\s*(adopting|deploying|using|rolling out|embracing|buying|purchasing)/i,
    kind: 'adoption', label: '采用主张' },
  // [v3.0.0] 调查/研究发现类：商业世界最高频的主张形态，第一版漏了。
  // 实测 "A survey of 1,200 enterprises found 34% had deployed LLMs" 无命中。
  { id: 'survey-finding', re: /(survey|study|poll|report|research|analysis|census)\s+(of|by|from|found|shows?|reveals?|indicates?|suggests?)/i,
    kind: 'adoption', label: '调查研究主张' },
  { id: 'finding-with-number', re: /\b\d+(?:\.\d+)?\s*%\s*(?:of\s+)?(enterprises?|companies|firms?|respondents?|users?|developers?|businesses?)/i,
    kind: 'adoption', label: '量化采用数据' },
  { id: 'market-demand-claim', re: /(market|demand|enterprises?|customers?|buyers?)\s+(want|needs?|demands?|is looking for|are looking for|requires?|is demanding)/i,
    kind: 'demand', label: '需求主张' },
  { id: 'replacement-claim', re: /(will|to|could|would)\s+(replace|displace|kill|obsolete|eliminate|disrupt|undercut)\s+(saas|software|services?|jobs?|workers?|vendors?|incumbents?|subscriptions?)/i,
    kind: 'replacement', label: '替代主张' },
  // [v3.0.0] 开源威胁类：第一版要求 open-source 后有 will/could 等情态动词，
  // 但真实句子是 "Open-weight models will kill paid AI products"——
  // 主语是 open-weight models 不是 open source。改为「开源类主语 + 威胁动词」。
  { id: 'open-source-threat', re: /(open[\s-]?(?:source|weight)s?|free models?|open models?|open[\s-]weight releases?)[^.]{0,40}\s+(will|could|would|to|is going to|are going to)?\s*(kill|replace|undercut|erode|threaten|destroy|eat|disrupt)/i,
    kind: 'oss-threat', label: '开源威胁主张' },
  { id: 'market-size-claim', re: /(market|tam|opportunity|sector)\s+(is|will be|to reach|projected|expected|estimated)\s*(at\s*)?\$?\s*[\d.]+\s*(billion|trillion|million|bn|b\b|t\b)/i,
    kind: 'market-size', label: '市场规模主张' },
  // ── 供给约束类 ──
  // [v3.2] SKILL.md 自 v3.0.0c 记在「已知边界」的漏检，2026-10-25 轮仍在
  // live 池里：The Information「AWS Largely Sold Out Of Capacity Into 2028,
  // Jassy Says」——14 种形态全部不命中，整条不进辨别。供给侧约束是 AI
  // 算力市场的一阶信号（需求>供给 → 定价权与扩产周期），漏掉它商业辨别
  // 看不见最重要的市场事实之一。
  // 精度设计（v3.0.0c 教训：漏报比误报诚实，没有实证不扩模式）：
  //   ① 必须「供给名词 + 耗尽/受限谓语」共现且相邻——单独的 capacity
  //     （storage capacity / capacity building / capacity to reason）不是主张；
  //   ② sold out 必须紧邻供给名词（sold out of capacity / capacity is
  //     sold out）——演唱会 "sold out within minutes"、体育场 "seat
  //     capacity of 80,000 and was sold out" 都不是产能主张；
  //   ③ 不认 waitlist/backlog 单独出现——MIT TR「a waitlist for silicon」
  //     是解释性类比不是市场主张；要等有 live 实证再扩，不无证据全量切换。
  { id: 'capacity-claim',
    re: /(?:\bsold[\s-]?out\s+of\s+(?:[a-z-]+\s+){0,2}(?:capacity|compute|supply|inventory|gpus?|chips?|silicon|cloud)\b|\b(?:capacity|compute|supply|inventory|gpus?|chips?|silicon)\s+(?:is\s+|are\s+|has\s+been\s+|have\s+been\s+)?(?:largely\s+|almost\s+|nearly\s+|fully\s+|completely\s+|effectively\s+|mostly\s+)?sold[\s-]?out\b|\b(?:shortage|scarcity|deficit)\s+of\s+(?:[a-z-]+\s+){0,2}(?:capacity|compute|gpus?|chips?|silicon|supply|power|energy)|\b(?:demand|orders?|bookings?|requests?)\s+(?:[a-z-]+\s+){0,3}(?:exceeds?|exceeded|outpaces?|outpaced|outstrips?|outstripped)\s+(?:available\s+)?(?:supply|capacity|inventory)|\b(?:capacity|compute|supply)\s+(?:is\s+|are\s+|has\s+been\s+|have\s+been\s+)?(?:largely\s+|almost\s+|nearly\s+|fully\s+|completely\s+|effectively\s+)?(?:exhausted|allocated|committed))/i,
    kind: 'capacity', label: '产能/供给约束主张' },
  // ── 资本类 ──
  // [v3.0.0c] funding 句式容忍数量副词：实测今日池子里最重要的商业事实
  // "DeepSeek Raises Nearly $16 billion in Second Funding Round"（The Information
  // 简报标题，无摘要）因 "Raises" 与 "$16" 之间隔着 Nearly 而整个模式失配，
  // 被判成 unclassified/weak-evidence。nearly/about/approximately 这类数量
  // 副词不改变句式性质，补进可选组。
  { id: 'funding-claim', re: /(raises?|raised|secures?|secured|closes?|closed)\s+(?:nearly|almost|about|approximately|around|roughly|just|over|more\s+than|up\s+to|some\s+)?\s*\$?[\d.]+\s*(billion|million|bn|m\b|b\b)/i,
    kind: 'funding', label: '融资陈述' },
  // [v3.0.0c] valuation 补两种真实句式：①「$1.25T valuation」「an over $1
  // trillion valuation」——金额在词汇前（实测 OpenAI 融资报道标题
  // "OpenAI working on new $30B raise at $1.25T valuation ahead of IPO"）；
  // ②「value the company at $X」——动词形态（实测同条摘要
  // "Should OpenAI command an over $1 trillion valuation with this round"）。
  // 旧模式只认「词汇在前金额在后」一种语序，这两种全部失配。
  { id: 'valuation-claim', re: /(?:(?:valuation|valued\s+at|values?\s+(?:the\s+company\s+|it\s+)?at|worth)\s*(?:of\s*)?\$\s*[\d.]+[\d.,]*\s*(?:billion|trillion|million|bn|b|t)?|\$\s*[\d.]+[\d.,]*\s*(?:billion|trillion|million|bn|b|t)?\s*valuation)/i,
    kind: 'valuation', label: '估值陈述' },
  { id: 'signal-from-capital', re: /(signals?|shows?|proves?|demonstrates?|indicates?|suggests?)\s+(that\s+)?(investors?|the market|capital|vc|venture)/i,
    kind: 'capital-signal', label: '资本信号解读' },
  // ── 交易过程类 ──
  // [v3.3] SKILL.md 自 v3.0.0c 记在「已知边界」的第二个覆盖缺口，2026-10-25
  // 轮仍在 live 池里：The Information「Instacart Is Exploring a Sale」与
  // 「Ramp Investors Went Nuclear Against Airwallex After Doomed Deal」——
  // 扩容前 14 种形态全部不命中，整条不进辨别。交易过程（并购/出售/谈判/破裂）
  // 是资本与商业模式域的一阶信号（交易塑竞争格局、 Deal 破裂塑信任成本），
  // 漏掉它商业辨别看不见市场结构变化的主要通道之一。
  // 精度设计（v3.0.0c/v3.2 教训：漏报比误报诚实、没有实证不扩模式）：
  //   ① 只认「交易是主张主体」的句式——exploring/considering/weighing/
  //     pursuing + 交易名词、talks to acquire/buy/sell 类谈判句式、
  //     交易状态词（doomed/collapsed/stalled deal）；
  //   ② 不认裸 "sale talks" 名词短语——live 实证「Instacart Shares Rally
  //     10% After The Information Reports Sale Talks」的主张主体是股价
  //     （可核验的市场价格事实，v3.2 已决议非待辨别主张），"Reports Sale
  //     Talks" 是媒体转述的从属成分，整句不进交易主张库；
  //   ③ 不认 IPO/ahead of IPO（估值形态已覆盖该条）、bare "in talks"
  //     （无交易对象的谈判不是可证伪主张，等有 live 实证再扩）、
  //     "exploring options"（战略措辞非交易主张）、"eyes + 非交易名词"
  //     （inDrive "eyes 2027 robotaxi tests" 是测试计划不是收购）。
  { id: 'ma-claim',
    re: /(?:\b(?:exploring|considering|weighing|pursuing)\s+(?:a|an|the|potential|possible)?\s*(?:sale|takeover|merger|acquisition|buyout|deal)\b|\b(?:in|enters?|entered|holding|holds?|resumed?)\s+(?:advanced\s+|early\s+|preliminary\s+|serious\s+|exclusive\s+)?talks?\s+to\s+(?:acquire|buy|sell|purchase|take\s+over|be\s+(?:acquired|bought|sold))\b|\btalks?\s+to\s+(?:acquire|buy|sell|purchase|take\s+over|be\s+(?:acquired|bought|sold))\b|\b(?:doomed|collapsed|failed|faltering|stalled|dead)\s+(?:deal|talks?|merger|acquisition|takeover)\b|\b(?:deal|talks?|merger|acquisition|takeover|negotiations?)\s+(?:collapses?|collapsed|falls?\s+through|fell\s+through|falls?\s+apart|fell\s+apart|stalls?|stalled|died|dies)\b)/i,
    kind: 'ma', label: '并购/交易过程主张' },
  // ── 竞品类 ──
  // [v3.0.0c] 目标名词库补人类专家群：实测今日池子里
  // "Microsoft's new AI diagnostic system beat generalist doctors on hard
  // cases, according to a study in Science"（Mustafa Suleyman 言论，
  // TechCrunch）——旧目标库只有厂商名与 sota，"beat doctors" 完全失配，
  // 这条带 Science 研究引用的竞品能力主张整个漏掉。generalist/human/
  // expert/specialist 是常见前置修饰，一并进可选组。
  { id: 'competitive-claim', re: /(beats?|outperforms?|surpasses?|exceeds?|defeats?|ahead of|leads?)\s+(?:openai|anthropic|google|meta|microsoft|deepseek|qwen|mistral|gpt|claude|gemini|the competition|rivals?|competitors?|sota|(?:generalist\s+|human\s+|expert\s+|specialist\s+)?doctors|radiologists|physicians|humans?|experts?|specialists)/i,
    kind: 'competitive', label: '竞品能力主张' },
  // ── 合规类 ──
  { id: 'compliance-demand', re: /(compliance|regulatory|regulators?|auditors?|liability)\s+(will|could|would|to|is going to)?\s*(require|demand|force|mandate|drive|create|spur|fuel)/i,
    kind: 'compliance', label: '合规需求主张' },
  { id: 'trust-demand', re: /(trust|verification|verifiable|accountability|audit|transparency|provenance|attestation)\s+(is|are|will be|becomes?|grows?)\s+(critical|essential|important|necessary|a requirement|the differentiator|table stakes)/i,
    kind: 'trust', label: '信任需求主张' },
];

/** 不可证伪的商业措辞：无主体、无量化、纯修辞 */
const UNFALSIFIABLE_COMMERCIAL_PATTERNS = [
  { id: 'no-quantity', test: (t) => !/\d/.test(t)
      && !/(few|some|many|most|several|majority|minority)/i.test(t),
    label: '无量化（「很多企业在用」没有基数，任何结果都能被说成应验）',
    guidance: '商业主张至少要给出可数的量：多少家、多少百分比、多少金额。' },
  { id: 'no-subject', test: (t) => /^(the market|enterprises|companies|businesses|everyone|nobody|people|industry)\s+(wants?|needs?|thinks?|believes?|is moving)/i.test(t)
      && !/(according to|survey|report|study|data from|research by)/i.test(t),
    label: '主体模糊（「市场想要 X」没说是谁统计的）',
    guidance: '「市场」不会说话。必须指明是调查、财报、订单还是某人之口。' },
  { id: 'unfalsifiable-trend', test: (t) => /(accelerating|explosive|unstoppable|inevitable|transformative|revolutionary|paradigm|game[\s-]changer|seismic|unprecedented)/i.test(t)
      && !/\d/.test(t),
    label: '趋势修辞（「不可阻挡的趋势」没有可观测的判据）',
    guidance: '形容词不是证据。要么给数字，要么给可观察的先行指标。' },
  { id: 'no-evidence-source', test: (t) => !/(according to|survey|report|study|research|data|filing|earnings|announced|disclosed|per |said|told|cited)/i.test(t)
      && /(is|are|has been|have been)\s+(growing|rising|declining|surging|collapsing|booming)/i.test(t),
    label: '无出处（「X 在增长」没说是谁的数据）',
    guidance: '增长类主张必须带数据来源，否则无法验证。' },
];

  // [v3.0.0] 证据等级匹配顺序很重要：**先匹配出处词，再匹配内容词**。
  // 实测踩坑："Regulators will require AI systems to be independently verified"
  // 里的 "independently verified" 是**主张内容**（要求做什么），
  // 不是**证据来源**（谁验证的）。第一版 independent-verification 排在最前，
  // 结果这句被判「独立验证(4)」，而它其实无任何出处。
  // 规则：独立验证必须与出处标记共现（如 "independently verified by X"、
  // "third-party audit found"），单独出现的内容词不算证据。
  const EVIDENCE_TIERS = [
  { id: 'independent-verification', label: '独立验证', weight: 4,
    test: (t) => /((?:independently|externally)\s+(?:verified|confirmed|audited|reproduced)\s+by|third[\s-]party\s+(?:audit|verification|analysis|review)\s+(?:by|of|found|showed)|peer[\s-]reviewed\s+(?:by|in)|reproduced\s+by|external\s+audit\s+(?:by|found))/i.test(t) },
  { id: 'third-party-survey', label: '第三方调查', weight: 3,
      // [v3.0.0c] 补 "according to a study/survey/report"：实测今日池子里
      // "Microsoft's new AI diagnostic system beat generalist doctors on hard
      // cases, according to a study in Science" 因只认 "study by" 与具名
      // 分析机构而落到「无出处(1)」——发表在 Science 的研究是标准的第三方
      // 证据，不是厂商自述。不碰 "according to a company announcement"
      // （那属公开财报档，在下一级）。
    test: (t) => /(survey|poll|census|study by|research by|according to (?:gartner|idc|forrester|mckinsey|deloitte|analyst|report)|according to a (?:study|survey|poll|report|analysis|paper))/i.test(t) },
  { id: 'public-filing', label: '公开财报/公告', weight: 3,
      // [v3.0.0] 补 announcement(s)/statement(s)：实测融资句
      // "according to a company announcement" 因只认 announced 而漏配，
      // 证据等级掉到「无出处(1)」，融资事实被判成 weak-evidence。
    test: (t) => /(earnings|quarterly results|filing|10-[kq]|sec filing|annual report|press release|announced|announcement|statement|disclosed|confirmation|confirmed)/i.test(t) },
  { id: 'vendor-selfreport', label: '厂商自述', weight: 2,
    test: (t) => /(we|our|the company)\s+(expect|believe|estimate|project|anticipate|aim|plan|target)/i.test(t) },
  { id: 'media-report', label: '媒体报道', weight: 2,
    test: (t) => /(reported|reportedly|sources? (?:say|said|tell|told)|people familiar|according to (?:a |an )?(?:person|source))/i.test(t) },
  { id: 'no-source', label: '无出处', weight: 1,
    test: () => true },
  ];

/** 推理有效性：商业主张的三要素 */
const REASONING_CHECKS = [
  { id: 'has-sample', label: '给出样本（多少家/多少用户/多少钱）',
    test: (t) => /(\d+\s*(?:companies|enterprises|firms|customers|users|developers|respondents|percent|%|million|billion)|\$[\d.]+|n\s*=\s*\d+)/i.test(t) },
  { id: 'has-comparison', label: '给出对照（和谁比/和什么时候比）',
    test: (t) => /(compared to|versus|vs\.?|up from|down from|year[\s-]over[\s-]year|yoy|qoq|against|relative to|than (?:last|previous))/i.test(t) },
  { id: 'has-counterexample', label: '承认反例（什么情况下不成立）',
    test: (t) => /(however|but|although|despite|yet|while|except|unless|if not|conversely|on the other hand|不过|但是|尽管|除非)/i.test(t) },
];

/**
 * 辨别一条商业主张。
 * @param {{text, source?, date?, url?, category?}} claim
 * @param {{ledger?: Array}} opts
 */
function discriminateCommercial(claim, opts = {}) {
  const text = String(claim.text || '');
  const problems = [];
  const matchedPatterns = [];

  // 1. 识别主张形态
  for (const p of COMMERCIAL_CLAIM_PATTERNS) {
    try {
      if (p.re.test(text)) matchedPatterns.push({ id: p.id, kind: p.kind, label: p.label });
    } catch (_) { /* 正则异常不当真 */ }
  }

  // 2. 不可证伪性
  for (const p of UNFALSIFIABLE_COMMERCIAL_PATTERNS) {
    try {
      if (p.test(text)) problems.push({ id: p.id, label: p.label, guidance: p.guidance });
    } catch (_) { /* 同上 */ }
  }

  // 3. 证据等级
  let evidence = EVIDENCE_TIERS[EVIDENCE_TIERS.length - 1];
  for (const t of EVIDENCE_TIERS) {
    try { if (t.test(text)) { evidence = t; break; } } catch (_) { /* 同上 */ }
  }

  // 4. 推理有效性
  const met = [];
  const missing = [];
  for (const c of REASONING_CHECKS) {
    try {
      if (c.test(text)) met.push(c.id);
      else missing.push({ id: c.id, label: c.label });
    } catch (_) { missing.push({ id: c.id, label: c.label }); }
  }

  // ── 综合判定 ──
  // 注意顺序：evidence.weight>=3 会把「公开财报」也判成 well-formed，
  // 但财报类陈述（融资 $X）本质是事实不是主张——单独归为 factual。
  const isFactual = matchedPatterns.some(p => p.kind === 'funding' || p.kind === 'valuation')
    && evidence.weight >= 3;
  const reasoningScore = met.length;
  let verdict;
  if (isFactual) {
    verdict = 'factual';           // 有出处的融资/估值陈述：事实，不需要辨别真伪
  } else if (problems.length > 0) {
    verdict = 'unfalsifiable';     // 无量化/无主体/纯修辞
  } else if (evidence.weight <= 2) {
    verdict = 'weak-evidence';     // 可证伪但证据等级低（厂商自述/媒体）
  } else if (reasoningScore < 2) {
    verdict = 'thin-reasoning';    // 证据够但推理要素不足
  } else {
    verdict = 'well-formed';       // 样本/对照/反例齐备且证据等级高
  }

  // 5. 证伪条件
  const falsification = buildFalsification(matchedPatterns, text);

  return {
    text,
    // [v3.0.0c] 命中句透传。buildCommercialDiscrimination 在候选对象里带了
    // claimSentence（供报告与注入聚焦到主张句本身），但本函数重建返回对象时
    // 把它丢了——报告层 `(r.claimSentence || r.text)` 于是永远退到 600 字
    // 三句上下文，报告行与注入行首显示的是一整段而不是主张句。
    claimSentence: claim.claimSentence || '',
    kind: matchedPatterns.length ? matchedPatterns[0].kind : 'unclassified',
    kinds: matchedPatterns.map(p => p.kind),
    source: claim.source || '(未标注)',
    date: claim.date || '',
    url: claim.url || '',
    category: claim.category || inferCommercialCategory(text, matchedPatterns),
    verdict,
    falsifiability: { problems, ok: problems.length === 0 },
    evidence: { id: evidence.id, label: evidence.label, weight: evidence.weight },
    reasoning: { met, missing, score: reasoningScore },
    falsification,
    // 是否值得心虫关注：证据等级 >=3 或推理 >=2 的商业主张才有决策价值
    decisionRelevant: (evidence.weight >= 3 || reasoningScore >= 2)
      && verdict !== 'unfalsifiable',
  };
}

function buildFalsification(patterns, text) {
  const kind = patterns.length ? patterns[0].kind : 'unclassified';
  const FALSIFICATION_BY_KIND = {
    'adoption': '观察到目标客群的实际采购/部署数据低于主张值，或抽样企业里多数未进入生产',
    'demand': '观察到目标客群的询价/订单/续费率不支持该需求，或采购方明确表示无此需求',
    'replacement': '观察到被替代方的收入/份额在主张时点后未下降，反而增长',
    'market-size': '观察到独立机构的同口径测算显著低于该数字，或该数字的统计口径被公开质疑',
    // [v3.2] 产能/供给约束主张的证伪路径：售罄口径最常见的裂缝是
    // 「含未交付预留量」「后续扩容解除约束」「第三方跟踪显示可用容量未耗尽」。
    'capacity': '观察到第三方产能/利用率跟踪显示可售容量未耗尽（如「售罄」口径含未交付预留量），或厂商后续扩容、新签供应协议使约束解除，或到主张时点后仍能公开下单',
    'funding': '观察到交割公告、监管文件或投资方确认与主张金额不一致',
    'valuation': '观察到后续融资、二级市场交易或财报披露的估值与该数字矛盾',
    'capital-signal': '观察到同一资本方在同类标的上减仓、或该解读被资本方本人否认',
    // [v3.3] 并购/交易过程主张的证伪路径：交易类主张最常见的裂缝是
    // 「当事方否认」「谈判破裂/交易被否决」「最终条款与主张情形不符」。
    'ma': '观察到当事方公开否认、谈判破裂或交易被监管否决，或最终交割的条款/估值与主张情形不符',
    'competitive': '观察到第三方在相同任务、相同口径下的复现结果不支持该领先幅度',
    'oss-threat': '观察到付费产品在主张时点后的收入/份额未受侵蚀，或开源方案的实际采用数据很低',
    'compliance': '观察到监管最终文本不含该义务，或执法记录显示无相关处罚/要求',
    'trust': '观察到采购方在无验证能力的情况下仍大量采购，或验证能力未进入采购评估项',
    'unclassified': '无明确证伪路径——这本身就是问题',
  };
  return FALSIFICATION_BY_KIND[kind] || FALSIFICATION_BY_KIND.unclassified;
}

function inferCommercialCategory(text, patterns) {
  if (patterns.length) {
    const k = patterns[0].kind;
    const M = { adoption: 'market_claims', demand: 'market_claims',
      replacement: 'market_claims', 'market-size': 'market_claims',
      // [v3.2] 供给约束是需求侧的另一面，归市场主张域
      capacity: 'market_claims',
      // [v3.3] 交易过程是资本事件，归资本与商业模式域
      ma: 'capital_flow',
      funding: 'capital_flow', valuation: 'capital_flow', 'capital-signal': 'capital_flow',
      competitive: 'competitor_moves', 'oss-threat': 'competitor_moves',
      compliance: 'compliance_demand', trust: 'compliance_demand' };
    return M[k] || 'market_claims';
  }
  return 'market_claims';
}

module.exports = {
  discriminateCommercial,
  COMMERCIAL_CLAIM_PATTERNS,
  UNFALSIFIABLE_COMMERCIAL_PATTERNS,
  EVIDENCE_TIERS,
  REASONING_CHECKS,
};
