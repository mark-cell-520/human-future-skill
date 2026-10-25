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
  //
  // [v3.3.1] 精度修复：旧模式 `(survey|study|…)\s+(of|by|from|…)` 把 incidental
  // 介词短语当成调查研究主张。live 实证（2026-10-25 v3.3.0 轮，两条误报进辨别）：
  //   ① EconBrowser 站点导航 "Analysis of current economic conditions and
  //      policy"——"analysis of" 是博客副标题不是研究发现；
  //   ② LWiAI 播客列表 "interpretability research from Anthropic"——
  //      "research from" 是话题列举不是研究发现。
  // 二者共同点：调查名词+介词，但没有发现动词、也没有量化对象—— incidental
  // 搭配，不是「研究发现」结构。收紧为二选一：
  //   A. 调查名词 + 发现动词相邻（study found / research shows / analysis
  //      indicates…）；
  //   B. 调查名词 + of + 量化对象（survey of 1,200 / survey of almost
  //      11,000，容忍数量副词——v3.0.0c funding 副词容忍的同型教训）。
  // live 全池实测：旧模式 7 条命中里 4 条真主张全保留（Survey of 2,018 /
  // survey of almost 11,000 / Study Shows / study found），3 条 incidental
  // 搭配精确消除（analysis of / research from / Research Reports——后者是
  // Fed 站点导航 "Payments Research Reports"，report 作名词的标签短语）。
  // 代价如实记录：① 无量化对象且发现动词不与名词相邻的 "a survey of
  // enterprises found 34%" 形态不再命中；② "survey reports that X" 的
  // report 动词形态不再命中（本轮无 live 实证，按 v3.0.0c 纪律「漏报比
  // 误报诚实」接受，等有 live 实证再议）。
  { id: 'survey-finding',
    re: /(?:(?:surveys?|stud(?:y|ies)|polls?|research|analyses|analysis|census)\s+(?:found|finds|shows?|reveals?|revealing|indicates?|indicating|suggests?|suggesting|concludes?|concluding|estimates?|estimating)\b|(?:surveys?|stud(?:y|ies)|polls?|census|analyses|analysis)\s+of\s+(?:nearly|almost|about|approximately|around|roughly|over|more\s+than|some\s+)?\s*[\d,]+)/i,
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
  // ── 成本/价格类 ──
  // [v3.6] 2026-10-26 轮 live 实证的新漏检：The Information 简报
  // 「Data Center Late Fees Hit $5 Million or More Per Day, Spawning New
  // Insurance」——扩容前 15 种形态全部不命中，整条不进辨别。供给侧约束
  // （v3.2 的 capacity-claim 管「供给耗尽」）的**定价维度**此前完全不可见：
  // 当算力交付延迟，市场把延迟定价出来（迟到费 $5M+/天）并金融化
  // （催生新保险产品）——这是 AI 基建经济学的一阶信号，漏掉它商业辨别
  // 只看得见「售罄」看不见「售罄的代价」。
  // 精度设计（v3.0.0c/v3.2/v3.3 教训：漏报比误报诚实、没有实证不扩模式）：
  //   ① 必须「成本/价格名词 + 水平谓语 + 金额」三件套相邻共现——单独的
  //     costs/prices/fees 不是主张（"The Cost of Living and Wages"）；
  //   ② 水平谓语只认 hit/reach/climb/rose/rise/top/exceed/average 等
  //     定量动词，"Prices Up"（无金额）与 "costs are falling"（无金额）
  //     都不是可证伪主张；
  //   ③ 名词与谓语之间只容忍 now/has/have——"Late fees for delayed GPU
  //     deliveries exceed $2M"（名词后接长修饰语）暂不命中，按「漏报比
  //     误报诚实」留作已知边界，等有 live 实证再扩（v3.2 宽窗正则的教训：
  //     放宽间隔同时丢精度）。
  // 已知边界（如实）：rates/tariffs 等宏观看价名词无 live 实证不进库；
  // 股价反应（"Shares Rally 10%"）按 v3.2/v3.3 决议仍是非待辨别主张。
  { id: 'cost-signal',
    re: /(?:late\s+fees?|delay\s+(?:fees?|costs?|penalt\w*)|fees?|costs?|premiums?|penalt(?:y|ies)|prices?)\s+(?:now\s+|has\s+|have\s+)?(?:hit|hits|reach(?:es|ed)?|climb(?:ed|s)?\s+to|rose|risen|rise|top|exceed(?:s|ed)?|average[sd]?)\s*(?:to\s+)?(?:(?:record|peak|all[-\s]?time[-\s]?high)\s+levels?\s+of\s+)?(?:an?\s+average\s+of\s+|as\s+(?:much|high)\s+as\s+)?(?:nearly|almost|about|approximately|around|roughly|over|more\s+than|up\s+to|some\s+)?\s*\$?\s*[\d.,]+\s*(?:million|billion|trillion|percent|%)?(?:\s*(?:or\s+more|or\s+higher|or\s+less|plus))?(?:\s*(?:per|a|an)\s*(?:day|hour|week|month|year|gpu|chip|unit|megawatt|mw))?/i,
    kind: 'cost-signal', label: '成本/价格信号主张' },
  // ── 价格下调类 ──
  // [v3.9] 2026-10-26 轮 live 实证的新漏检：LWiAI #343 简报内句「Anthropic
  // launches Claude Fable 5.1 and says it's up to 45 percent cheaper for
  // agentic work」——扩容前 18 种形态全部不命中，整条不进辨别。v3.6 的
  // cost-signal 管「价格/成本打到某水平」（迟到费 $5M/天），但**价格下调**
  // （模型 API 降价、智能单价通缩）一直在库外——而智能价格通缩是 AI 市场
  // 需求侧的一阶信号（降价驱动采用、重塑毛利结构、压缩竞争对手定价空间），
  // 只辨「价格打到某水平」不辨「价格下调」，商业辨别对价格维度的理解只有
  // 一半。
  // 精度设计（v3.0.0c/v3.2/v3.3/v3.6/v3.7 教训：漏报比误报诚实、没有实证
  // 不扩模式）：
  //   ① 必须有幅度——无金额的价格变动句（"with lower prices"/"costs are
  //     falling"）按 v3.6 同型纪律（无金额的 "Prices Up" 不是可证伪主张）
  //     不进库；live 实证 LWiAI #258「Opus 5.5 with lower prices」如实记录
  //     为已知边界漏报；
  //   ② 名词族只认 prices/pricing，不认 costs——TCO 效率句（NVDA「35x
  //     lower cost for agentic AI」/ ORCL「at a lower cost」）是能力/成本
  //     效率主张不是市场定价主张，放进库会把性能评测当价格信号；
  //   ③ 比较级后只认 for/than/句读——"cheaper to manufacture"（制造成本
  //     效率）不是定价主张；
  //   ④ 三形态族：名词+下调谓语+幅度（prices fell 20%）、下调动词+名词+
  //     by/to+幅度（cuts prices by 30%）、幅度+比较级（45 percent cheaper）。
  // live 全池实测：300 条里精确命中 1 条（即 LWiAI #343 条），精度回归
  // 0 误报（TCO 效率句/无幅度降价句/成本名词单现/宏观看价句/其它形态库
  // 句式/boilerplate 全部不命中）。
  { id: 'price-cut',
    re: /(?:\b(?:prices?|pricing)\s+(?:now\s+|has\s+|have\s+|is\s+|are\s+)?(?:cut|cuts|cutting|lower(?:s|ed|ing)?|drop(?:s|ped|ping)?|fall(?:s|ing)?|fell|declin\w+|decreas\w+|slash(?:es|ed)?|reduc\w+|tumbl\w+|plung\w+|sink(?:s|ing)?|sank|sunk)\b[^.!?]{0,25}?\d|\b(?:cut|cuts|lower(?:s|ed)?|drop(?:s|ped)?|slash(?:es|ed)?|reduc(?:es|ed))\s+(?:its\s+|their\s+)?(?:api\s+|inference\s+|model\s+|token\s+|subscription\s+)?(?:prices?|pricing)\s+(?:by|to)\s+(?:nearly|almost|about|approximately|around|roughly|over|more\s+than|up\s+to|some\s+)?\$?[\d.,]+|\b\d+(?:\.\d+)?\s*(?:%|percent|x|×)\s+(?:cheaper|less\s+expensive)\b(?:\s+(?:for|than)\b|[,.;!?]|$))/i,
    kind: 'price-cut', label: '价格下调主张' },
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
  // ── 专家/机构判断类 ──
  // [v3.7] 2026-10-26 轮 live 实证的新漏检：TechCrunch AI「AI delivers
  // 'zero financial payoff' to most companies, Apollo economist says」
  // ——扩容前 16 种形态全部不命中，整条不进辨别。第三方经济/市场专家对
  // 市场现状的量化判断是商业世界最高频的主张形态之一（Apollo 首席经济学家
  // 论 AI 企业 ROI、卖方 strategist 论估值修正），且与 survey-finding
  // （调查研究的数据汇总）是两类证据：前者是专家对数据的解读（可证伪但
  // 依赖专家信誉与机构口径），后者是数据本身。库里自 v3.0.0c 起只有后者，
  // 「AI 到底有没有财务回报」这个当前最大市场争议的核心主张整条漏掉。
  // 精度设计（v3.0.0c/v3.2/v3.3/v3.6 教训：漏报比误报诚实、没有实证不扩模式）：
  //   ① 只认经济/市场分析头衔（economist/analyst/strategist/investment
  //      officer/portfolio manager/fund manager/head of research）——
  //      CEO/executive 的自述是 vendor-selfreport 地盘不抢；scientists/
  //      researchers（科研判断）、Fed chair/Trump（官员言论）不是市场
  //      分析头衔，不进库；
  //   ② 必须「头衔 + 判断动词」或「头衔 + 机构」结构——光名词
  //      （"analyst day"/"market strategist"）不是主张；
  //   ③ 头衔与机构之间容忍 chief/senior/market/US 等窄前缀，
  //      不放开到任意间隔（v3.6 宽窗正则误命中 2 句的教训）。
  { id: 'expert-judgment',
    re: /(?:(?:(?:chief|senior|lead|market|investment|global|us|u\.s\.)\s+)?(?:economists?|analysts?|strategists?|investment\s+officers?|portfolio\s+managers?|fund\s+managers?|heads?\s+of\s+research|directors?\s+of\s+research)\s+(?:at|of|for|from)\s+(?!(?:the|a|an|of|its|his|her|their|our|this|that|some|many|most)\b)[A-Za-z][\w&.]*|(?:economists?|analysts?|strategists?)\s+(?:says?|said|warns?|warned|argues?|argued|believes?|believed|estimates?|estimated|sees?|saw|thinks?|notes?|noted|expects?|expected|predicts?|predicted|calls?|called|cautions?|cautioned|told|points?\s+out)|according\s+to\s+(?:a|an|the)\s+(?:[\w\s&.]{0,30}?\s+)?(?:economist|analyst|strategist))/i,
    kind: 'expert-judgment', label: '专家/机构判断主张' },
  // ── 监管行动类 ──
  // [v3.8] 2026-10-26 轮 live 实证的新漏检：The Information 简报「U.S.
  // Treasury Proposes to Widen Outbound Investment Restrictions for China
  // and Other Countries」（2026-10-23）与 LWiAI #251 简报内句「Trump lifts
  // restrictions on Anthropic」——扩容前 17 种形态全部不命中，整条不进辨别。
  // 合规域自 v3.0.0c 起只有 compliance-demand（「监管需求修辞」：regulators
  // will require…），**真实规则事件**（提案/签发/加宽/解除限制）一条都看不
  // 见——而规则事件才是合规需求域的一阶信号（跨境资本、出口管制、AI 监管
  // 全部经由规则落地），且该形态有天然结算结构：提案 → 评论期 → 最终规则，
  // 与引擎「辨别+跟踪结算」定位同构（本期 Treasury 提案评论期至 2026-12-07，
  // AP/Reuters/Nikkei/The Hill 四家交叉验证其存在）。
  // 精度设计（v3.0.0c/v3.2/v3.3/v3.6/v3.7 教训：漏报比误报诚实、没有实证
  // 不扩模式）：
  //   ① 必须「政府/监管主体 + 规制动词 + 规制工具名词」三段式且同句
  //      （两段间隔都不含句读号 [^.!?]）——单独的 restrictions/tariffs
  //      不是主张，主体缺位不是监管行动；
  //   ② 主体只认政府/监管机构与官员（treasury/SEC/FTC/EU/regulators/
  //      president…）——厂商动作（"OpenAI says…"）是 vendor-selfreport
  //      地盘不抢；Fed/ECB 的货币政策公告（FOMC statement/minutes/
  //      projections）不是规制行动，主体库不含 Fed/ECB（v3.0.0c 精度门）；
  //   ③ 规制动词只认规则生命周期动作（propose/issue/sign/finalize/widen/
  //      lift/ban…），不含 said/says/expect——官员言论是 v3.7 expert-
  //      judgment 已决议不进库的形态，不重复收编。
  // live 全池实测：312 条里精确命中 2 条（即上述两条），31 句精度回归
  // 0 误报（Fed/ECB 公告/NBER 论文/宏观看价句/官员言论/厂商自述/股价
  // 反应/播客 boilerplate/其它形态库句式全部不命中）。
  // 已知边界（如实）：执法行动（fined/sued/charged，无工具名词）与
  // 「SEC's new disclosure rules」类所有格形态无 live 实证不进库。
  { id: 'regulatory-action',
    re: /(?:\b(?:treasury|securities\s+and\s+exchange\s+commission|sec|federal\s+trade\s+commission|ftc|department\s+of\s+justice|doj|white\s+house|congress|senate|parliament|lawmakers?|legislators?|european\s+(?:commission|union|parliament)|\beu\b|brussels|regulators?|regulatory\s+(?:bodies|agencies|body|agency)|federal\s+(?:government|agency|regulators?)|state\s+(?:government|regulators?)|national\s+government|government|administration|ministry|ministers?|commerce\s+department|state\s+department|\bofac\b|\bbis\b|\bbeijing\b|president|\btrump\b|\bbiden\b|prime\s+minister|chancellor|governor|attorneys?\s+general)\b[^.!?]{0,40}?\b(?:proposes?|proposed|proposing|announces?|announced|issues?|issued|issuing|imposes?|imposed|signs?|signed|signing|enacts?|enacted|passes?|passed|finaliz\w+|finalis\w+|adopts?|adopted|approves?|approved|widen(?:s|ed)?|expand(?:s|ed)?|tighten(?:s|ed)?|loosen(?:s|ed)?|relax(?:es|ed|ing)?|eases?|eased|bans?|banned|blocked?|blocks?|struck\s+down|strikes\s+down|overturn\w+|rescind\w+|vetoes?|vetoed|delay\w+|fine[sd]?|penali[sz]\w+|sues?|sued|suing|investigat\w+|subpoena\w+|orders?|ordered|mandate[sd]?|curbs?|clamp\w*|cracks?\s+down|cracked\s+down|lifts?|lifted|unveils?|unveiled|publishes?|published|releases?|released)\b[^.!?]{0,40}?\b(?:rules?|regulations?|restrictions?|curbs?|limits?|caps?|bans?|tariffs?|sanctions?|export\s+controls?|requirements?|legislation|laws?|bills?|executive\s+orders?|frameworks?|guidance|orders?|mandates?|directives?|statutes?|acts?|measures?)\b)/i,
    kind: 'regulatory-action', label: '监管行动主张' },
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
      // [v3.7] survey/poll/census 补 \b 词边界：live 实证抓到的既有缺陷——
      // "Apollo" 公司名含 "poll" 子串，无边界时被当成民调证据（与 v3.1.1
      // demo/democracy、GA/gigawatts 同型）。该缺陷自 v3.0.0c 起存在但从未
      // 暴露：含 Apollo 的条目此前整条不进商业辨别段，poll 分支没有触发机会。
    test: (t) => /(?:\bsurveys?|\bpolls?|\bcensus|study by|research by|according to (?:gartner|idc|forrester|mckinsey|deloitte|analyst|report)|according to a (?:study|surveys?|polls?|report|analysis|paper)|(?:(?:chief|senior|lead|market|investment|global|us|u\.s\.)\s+)?(?:economists?|analysts?|strategists?)\s+(?:at|of|for|from)\s+(?!(?:the|a|an|of|its|his|her|their|our|this|that|some|many|most)\b)[A-Za-z][\w&.]*|\b(?:economists?|analysts?|strategists?)\s+(?:says?|said|warns?|warned|argues?|argued|believes?|believed|estimates?|estimated|sees?|saw|thinks?|notes?|noted|expects?|expected|predicts?|predicted|calls?|called|cautions?|cautioned|told)\b|according\s+to\s+(?:a|an|the)\s+(?:[\w\s&.]{0,30}?\s+)?(?:economist|analyst|strategist))/i.test(t) },
  { id: 'public-filing', label: '公开财报/公告', weight: 3,
      // [v3.0.0] 补 announcement(s)/statement(s)：实测融资句
      // "according to a company announcement" 因只认 announced 而漏配，
      // 证据等级掉到「无出处(1)」，融资事实被判成 weak-evidence。
      // [v3.8] 补政府机构一手文书标记（federal register/proposed rule/
      // final rule + 机构名 + 发文动词）：监管行动主张的证据基础就是政府
      // 自己的规则文书（与 v3.0.0c「according to a company announcement
      // 归公开财报档」同型）——不扩的话每条监管行动主张都会被判「无出处(1)」，
      // 而它的证据等级恰是该形态能拿到的最强一档。只认**机构**主体
      // （treasury/SEC/White House/administration…），不认个人官员
      // （Trump/Biden 个人署名的行动经媒体转述时保守归媒体档，防 newsletter
      // roundup 借官员名字抬级）；Fed/ECB 的货币政策公告不适用（主体不含
      // Fed/ECB，且其动词 said 不在标记动词表——"The Fed chair said" 仍是
      // 无出处档，v3.0.0c 的独立验证判据教训不回归）。
    test: (t) => /(earnings|quarterly results|filing|10-[kq]|sec filing|annual report|press release|announced|announcement|statement|disclosed|confirmation|confirmed|federal register|proposed rule|final rule|(?:treasury|securities and exchange commission|\bsec\b|federal trade commission|\bftc\b|department of justice|\bdoj\b|white house|european commission|\beu\b|commerce department|state department|\bofac\b|regulators?|government|administration|\bbeijing\b)\s+(?:department\s+)?(?:proposes?|proposed|proposing|announces?|announced|issues?|issued|issuing|imposes?|imposed|signs?|signed|enacts?|enacted|passes?|passed|finaliz\w+|finalis\w+|adopts?|adopted|approves?|approved|widen(?:s|ed)?|expand(?:s|ed)?|tighten(?:s|ed)?|loosen(?:s|ed)?|relax(?:es|ed|ing)?|eases?|eased|bans?|banned|blocked?|blocks?|struck\s+down|overturn\w+|rescind\w+|vetoes?|vetoed|lifts?|lifted|unveils?|unveiled|publishes?|published|releases?|released|said|says))/i.test(t) },
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

  // [v3.8] 事件型主张的 no-quantity 豁免：监管行动的证伪性靠「规则是否
  // 落地/范围是否相符」这个可观测事件，不靠量化基数——no-quantity 的判据
  // （「很多企业在用」没有基数，任何结果都能被说成应验）对事件型形态是
  // 类别错位：`Treasury Proposes to Widen Outbound Investment Restrictions`
  // 要么能在 Federal Register 查到要么不能，与有没有数字无关。不豁免的
  // 后果是报告对同一条主张同时打印「不可证伪: 无量化」与「证伪条件: 观察
  // 到最终规则…」两行自相矛盾的输出。豁免范围从严：只摘 no-quantity，
  // 无主体/趋势修辞/无出处三类问题保留；推理三要素仍独立计分（0/3 仍判
  // thin-reasoning，不因豁免抬成 well-formed）；ma 事件型表单证伪性判据
  // 同型不一致（仍被 no-quantity 命中）登记 corr-2026-025，下轮统一，
  // 本轮不改旧维度已文档化已测试的判定行为。
  if (matchedPatterns.some(p => p.kind === 'regulatory-action')) {
    for (let i = problems.length - 1; i >= 0; i--) {
      if (problems[i].id === 'no-quantity') problems.splice(i, 1);
    }
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
    // [v3.6] 成本/价格信号主张的证伪路径：价格水平类主张最常见的裂缝是
    // 「口径不可比（含不含税/含不含预留量）」「第三方价格跟踪不支持」
    // 「该成本项后续回落或被豁免」。
    'cost-signal': '观察到合同/发票/第三方价格跟踪数据显示该成本或价格水平与主张值不符，或主张时点后该成本项已回落/被豁免/改入口径',
    // [v3.9] 价格下调主张的证伪路径：降价类主张最常见的裂缝是「第三方
    // 价格跟踪不支持该降幅」「降价实为功能/用量配额削减的口径变化」
    // （表面单价降、实际获得价值升）「后续又涨回」。价目表与第三方
    // API 价格跟踪是可观测的，不需要等财报。
    'price-cut': '观察到厂商公开价目表或第三方 API 价格跟踪显示主张时点后价格未下降、降幅显著小于主张值，或「降价」实为功能/用量配额削减的口径变化（表面单价下降而实际获得价值上升），或主张时点后价格回升',
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
    // [v3.7] 专家/机构判断主张的证伪路径：判断类主张最常见的裂缝是
    // 「时点后的实际数据不支持」「机构自身后续修订」「同业同口径反证」。
    'expert-judgment': '观察到主张时点后的实际数据、第三方调查或该机构自身的后续修订与判断不符，或同业机构在同口径下提出反证',
    // [v3.8] 监管行动主张的证伪路径：规则类主张最常见的裂缝是「最终文本
    // 与提案情形不符」「规则没落地（被 rescind/struck down/无限期推迟）」
    // 「评论期后正式文本显著收窄」。Treasury 2026-10-22 提案的评论期
    // 2026-12-07 截止，最终规则即结算点。
    'regulatory-action': '观察到最终规则或立法的范围与主张情形不符（未涵盖主张的部门或交易类型）、规则未生效即被 rescind/struck down/无限期推迟，或评论期后的正式文本显著收窄',
    'unclassified': '无明确证伪路径——这本身就是问题',
  };
  return FALSIFICATION_BY_KIND[kind] || FALSIFICATION_BY_KIND.unclassified;
}

function inferCommercialCategory(text, patterns) {
  if (patterns.length) {
    const k = patterns[0].kind;
    const M = { adoption: 'market_claims', demand: 'market_claims',
      replacement: 'market_claims', 'market-size': 'market_claims',
      // [v3.6] 成本/价格水平是市场事实，归市场主张域
      'cost-signal': 'market_claims',
      // [v3.9] 价格下调（智能单价通缩）是市场价格事实，归市场主张域
      'price-cut': 'market_claims',
      // [v3.2] 供给约束是需求侧的另一面，归市场主张域
      capacity: 'market_claims',
      // [v3.7] 专家/机构判断是关于市场状况的主张，归市场主张域
      'expert-judgment': 'market_claims',
      // [v3.8] 监管行动是合规需求域最具体的 instantiation，归合规需求域
      'regulatory-action': 'compliance_demand',
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
