---
name: human-future-v2
title: "人类未来 · 文明推演引擎 v3.4.0"
version: "3.4.0"
description: |-
  人类未来技能 v3.4.0 — 新辨别维度「财报指引」+ 新数据源 SEC EDGAR：
  v3.4（2026-10-25）接上市公司一手备案：8-K（Item 2.02 业绩发布）的 EX-99
  附件里有厂商自报的下一期数值指引——"Revenue is expected to be $108.0
  billion, plus or minus 2%"（NVIDIA FY2027 Q3，2026-08-26 备案）。有主体
  （公司）、有事件（下一财季实际值）、有结算机制（下一期财报公布），是
  v2.13 起记录六轮的边界缺口「RSS 前瞻表述多为意图声明、不可结算」的
  第一次实质推进（Metaculus/Epoch AI 类预测源全部不可达后的换路）。
  采集器 edgar-collector：company_tickers.json 解析 14 家境内备案人
  （NVDA/AMD/AVGO/MRVL/MU/MSFT/GOOGL/AMZN/META/ORCL/CRWV/IBM/DELL/PLTR）
  → submissions JSON（FYE+近期 8-K）→ index.json 挑 EX-99 → 指引句抽取
  （指标+is/are expected to be+数值，五家公司五种句式实证；财季期间就近
  匹配+同比引用排除）。live 实测 28 条业绩备案、32 条数值指引；MSFT/GOOGL
  只在电话会口头给指引，如实报「无数值指引」不编造。forecast-discriminator
  新增 verdict earnings-guidance：结算点按财季期间+fiscalYearEnd 推算为
  估计值（财季/财年结束+45 天公布滞后，dueBasis=estimated-fiscal，产品
  各处不得当精确日引用）；指引自动登记 prediction-ledger 到期结算 Brier，
  先验取中性 0.5（FactSet「77% 超预期」是 vs 分析师预期的口径，挪用即
  本引擎要抓的口径错位，note 写明）。同轮维护（不单独涨号）：run-pipeline
  banner 版本漂移（3.1.1→3.4.0，corr-2026-014 同型）；prediction-ledger
  自测补 evidence（v2.13 起坏掉的既有 bug，stash 对照实证）；台账幂等 id
  加 metric+value 维度（MRVL GAAP/非 GAAP 同同时点互撞、非 GAAP 被静默
  丢弃）；同义务去重 key 加 dueOn（跨财季同文指引是不同事件）。测试
  214→230 项；6 轮反向验证全部精确失败（摘除接入→源级断言/摘除 verdict→
  5 条/摘除 dueOn 推算→5 条/摘除 id value 维度→幂等断言/摘除期间对比
  排除→期间断言/摘除句点处理→2 条）。版本号理由：新数据源+新辨别维度，
  用户可感知（报告「预测辨别」段首次出现带结算期的可结算主张）。
  历史：v3.3.1 — 维护级（非新辨别维度）：survey-finding 精度修复 + 版本号漂移修复：
  v3.3.1（2026-10-25）修 v3.3.0 轮 live 实证的两条误报与一处版本漂移。① survey-finding
  收紧——旧正则 (survey|study|…)\s+(of|by|from|…) 把「调查名词+介词」的 incidental
  搭配当成研究发现：EconBrowser 站点导航 "Analysis of current economic conditions
  and policy"（analysis of）与 LWiAI 播客列表 "interpretability research from
  Anthropic"（research from）两条误报进商业辨别段。收紧为二选一：调查名词+发现
  动词相邻（study found / research shows / analysis indicates…）或调查名词+of+量化
  对象（survey of 1,200 / survey of almost 11,000，容忍数量副词）。live 全池实测
  旧模式 7 条命中里 4 条真主张全保留（Survey of 2,018 / survey of almost 11,000 /
  Study Shows / study found）、3 条 incidental 搭配精确消除（含 Fed 导航 "Payments
  Research Reports"——连带把无 live 实证的 report 动词形态一并收紧，代价如实记录：
  "a survey of enterprises found 34%" 无量化对象形态与 "survey reports that X"
  不再命中，按 v3.0.0c「漏报比误报诚实」接受）。端到端实跑商业辨别段 8→6 条，
  Grok 真调查主张保留。② 版本号漂移修复——VERSION=3.3.0 而 projection
  meta.version 停在 3.2.2、package.json 停在 3.2.1，同一份报告两个版本号，v3.1
  修过同型（banner/meta）但另两处腐烂了四个补丁轮；四处对齐 3.3.1 并加「版本号
  一致性」断言（VERSION/package.json/projection meta/run-pipeline meta）。③ 三处
  「播客不进辨别」测试夹具补强为 live 误报原句——旧夹具 description 压根不触发
  模式门，断言恒真空转两个版本（反向验证实证：恢复旧正则后三处旧断言立刻真失败）。
  登记 corr-2026-014（版本漂移）/corr-2026-015（误报+夹具空转）。测试 207→214 项；
  3 轮反向验证全部精确失败（恢复旧正则→v3.3.1 4 失败+三处旧断言各 1 失败/收紧过头
  摘形式 B→3 失败/版本漂移复发→恰好 1 失败）。版本号理由：精度修复+漂移修复=末位
  补丁，本轮没有新辨别维度。
  历史：v3.3.0 商业主张辨别器新增并购/交易过程主张形态（新辨别维度，live 实证
  Instacart 出售探索与 Ramp/Airwallex 破裂交易两条 MISS 后扩库）；
  v3.2.2 低置信度守门段端到端接通 cron 注入（第七次同型断链修复）；
  v3.2.1 预测校准与台账状态端到端接通（第六次同型断链）；
  v3.2 新增产能/供给约束主张形态（新辨别维度，live 实证补齐已知边界漏检）。

  人类未来技能 v3.2.0 — 商业主张辨别器新增「产能/供给约束主张」形态（新辨别维度）：
  v3.2（2026-10-25）给 commercial-discriminator 的 COMMERCIAL_CLAIM_PATTERNS 增加
  capacity-claim——SKILL.md 自 v3.0.0c 记在「已知边界」的漏检（"AWS Largely Sold
  Out Of Capacity Into 2028" 产能主张，当时形态库实为 13 种而文档写「14 种」，
  全部不命中、整条不进辨别），
  本轮实跑该条就在 258 条 live 池里（The Information 简报），逐条过形态门确认
  MISS 后扩库：新 kind 'capacity' + 专属证伪条件（第三方产能跟踪/扩容/预留量）
  + 类目映射 market_claims + 报告与 cron 注入的中文标签。供给侧约束（需求>供给
  → 定价权/扩产周期）是 AI 算力市场的一阶信号，漏掉它商业辨别看不见最重要的
  市场事实之一。精度设计按 v3.0.0c 教训（漏报比误报诚实、没有实证不扩模式）：
  必须「供给名词+耗尽谓语」相邻共现，sold out 紧邻产能名词——storage capacity /
  capacity building / capacity to reason / 演唱会与座位 sold out / waitlist for
  silicon 类比 / 扩产新闻全部不命中（8 条精度回归）；形态族覆盖售罄/耗尽/
  分配殆尽/短缺/需求超供给（含 has been 与形容词间隔、过去时态）。
  live 实测：258 条里精确命中 1 条（就是 AWS 那条），报告「商业主张辨别」段
  辨别数 5→6，该条判 证据不足/无出处(1)/推理 0/3——标题-only 不虚抬为决策相关。
  维护级同轮（不单独涨号）：① 公式桥 Brier 样本按同义务去重——同一份报告里
  「认知公式评估」段样本=3 而「预测台账」段已结算=1（3 条 EU AI Act 同义务
  条目），两个自相矛盾的样本数正是本引擎要抓的口径错位，按 v2.16 口径对齐；
  ② 测试夹具残留自愈——npm test 进程异常死亡（SIGKILL/EPIPE）时 exit 还原不
  执行，夹具条目残留真实台账，轻则污染 pending 计数、重则让 v2.16 record()
  探针抛「id 已存在」整套测试崩溃（2026-10-25 实测连续两轮各留一批、第三轮
  直接崩），加夹具签名自愈 + 探针幂等；③ 文档计数纠错——SKILL.md/代码注释自
  v3.0.0c 写「14 种商业主张形态」而实际只有 13 种（与 v3.1 修正的「17 个源」
  同型文档计数错误），新增后真实条数为 14，按代码实测改正。
  测试 183→192 项；6 轮反向验证全部精确失败（摘除模式→6 条、摘除精度收紧→3 条、
  摘除证伪条件→1 条、摘除 cron 注入标签→1 条、摘除公式桥去重→1 条、摘除报告
  标签→1 条；其中摘除报告标签一轮第一版 0 失败——断言被段内 note 文本里的
  「产能/供给约束」喂饱，已改为只认渲染出的「类型:」行）。

  人类未来技能 v3.1.1 — 口径错位检测段：精度修复 + 端到端接通：
  v3.1.1（2026-10-25）修 2026-10-25 live 轮逐条复核出来的 7 条误报——
  友谊勋章「Order of Dostyk」被 capacity 侧 /订单|order/ 当成采购订单、
  democracy/democrat 里的 demo 子串、gigawatts/average/navigation 里的
  GA 子串、「limited to two players」被当成灰度、「available in preview」
  与产品名带 Preview 的正确表述被判错位、「on target + demonstrate」
  跨句两件事、「our researchers + safety at the frontier」相隔 2000+ 字符、
  benchmark 主张与促销页脚「15% off」相隔 1200+ 字符。修法：五个模式
  （capacity-vs-order / benchmark-vs-capability / demo-vs-ga /
  roadmap-vs-result / vendor-selfreport-vs-verification）启用同句判定
  sentenceScoped（口径错位是「同一句话里把两件事说成一件事」，跨句共现
  常是两件不相关的事），demo-vs-ga 加 \b 词边界 + 只认完成态可用性断言
  + 灰度语义收紧，capacity B 侧只认采购语义；另三个模式无 live 误报
  实证，保持整段判定——没有证据就改判据是另一种不严谨。命中带触发句
  （evidenceSentence），报告与注入都可逐条复核。同时补 cron 注入段读取
  proj.claimMismatches——这是 v2.9/v2.13/v2.17/v3.0.0c 之后第五次同型
  断链（引擎产出 + formatReport 渲染都有，注入脚本从未读，agent 完全
  看不到；该段引用纪律「同一句内带限定」的材料一直都在报告文件里躺着）。
  测试 171→183 项；5 轮反向验证全部精确失败（摘除 demo-vs-ga 修复→5 条、
  摘除 capacity 修复→1 条、摘除同句判定→1 条、摘除 cron 注入段→1 条、
  摘除触发句透传→2 条）。live 实测：同轮数据重跑，口径错位命中 14 条→
  1 条真命中（DeepMind ForTy 森林制图 90%/95% 跑分主张，触发句在产物里）。
  版本号理由：修 bug + 断链修复 = 末位补丁，不涨 x.0；本轮没有新辨别维度。

  人类未来技能 v3.1.0 — 心虫商业未来推演（v3.1 接入 0 调用模块自我修正登记簿）：
  v3.1（2026-10-25）接入 self-correction-ledger——该模块自 v2.4 存在、
  data/self-corrections.json 有 7 条真实修正（绕月≠登月 / v2.4 假能力三项审计 /
  sitemap 页面简介≠新闻正文……），docstring 铁律「每次修正落盘，下次推演先读簿子
  再说话」，但 live pipeline（scripts/）从未 require 过它，只有早期死副本
  human-future/scripts/run-pipeline.js 调过——簿子记了、没人读。本轮接进引擎
  （report.selfCorrectionLedger）+ 报告段（「自我修正登记簿」，位置在总体摘要之后、
  信号热度分组之前，先对旧账再解读新信号）+ cron 注入段（第 8 段，带口径限定）；
  同时修 recurringPatterns 高危计数口径：旧代码 severity === 'high' 严格过滤，
  漏掉数据里 2 条 critical（v2.4 假能力审计），接入后会少报高危数（说 4 实际 6），
  改为按等级表（critical > high > medium > low）比较，critical 排最前。
  测试 164→171 项；5 轮反向验证全部精确失败（摘除引擎接线→4 条、摘除报告渲染→2 条、
  摘除 cron 注入段→1 条、恢复旧计数口径→2 条、摘除等级排序→1 条）。
  维护级（不涨号的那部分）：SKILL.md 采集源计数修正——实际 23 个源
  （tech 2 + humanities 1 + frontier_models 12 + economy 4 + business 4），
  旧文写「17 个」，且分项加总本身也不等于 17。

  人类未来技能 v3.0.0 — 心虫商业未来推演（v3.0.0c 修复端到端断链）：
  v3.0.0（f118603，10-22）新增 business 采集域（TechCrunch AI / The Information /
  Last Week in AI / ProductHunt）与商业主张辨别器 commercial-discriminator——
  辨别「关于市场的陈述」（可证伪性/证据等级四级/推理三要素/证伪条件），与
  forecast-discriminator 的「关于未来的预测」分工；5 个商业主题域（市场主张/
  竞品/资本/客户采用/合规需求）；报告段「商业主张辨别」。
  2026-10-24 v3.0.0c：① 修复该段端到端断链——引擎产出、formatReport 渲染，
  但 cron 注入脚本从未读取 proj.commercialDiscrimination（v2.9/v2.13/v2.17
  之后第四次同型断链，「接口存在 ≠ 端到端到达」），本轮补上注入段并加源级
  断言防复发；② 候选抽取加精度门：旧触发器「含 $/%/market 关键词即算候选」
  把 7 条 Fed FOMC 公告、LWiAI 播客、TechCrunch 促销页脚（"Get your pass ...
  REGISTER NOW"，还因 2/3 推理分被判★决策相关）混入辨别，实测 19 条里 18 条
  kind=unclassified；现候选题句必须命中 14 种商业主张形态之一（标题参与判定），
  实测同轮 248 条 live 里 6 条进辨别（估值 2/竞品 1/融资 1/采用 2）；
  ③ 三处句式召回（raises nearly $16B / "$1.25T valuation" 两种语序 /
  beat generalist doctors）与证据等级修正（according to a study in Science
  归第三方调查而非无出处）。测试 155→164 项；7 轮反向验证全部精确失败
  （摘除注入段→1 条失败、摘除精度门→3 条、摘除副词组→3 条、摘除透传→2 条、
  摘除竞品目标→1 条、摘除估值语序→1 条、摘除报告渲染→1 条）。
  已知边界：模式库外真实句式仍会漏（"AWS Largely Sold Out Of Capacity
  Into 2028" 产能主张）；站点导航/页脚 boilerplate 偶有漏网（本轮 6 条里
  1 条 EconBrowser 导航文本）；本段不生成商业建议，「心虫该怎么做」由报告
  agent 判断并标注归属。

  人类未来技能 v2.17 — 接入外部预测基准源 Good Judgment Open（gjopen.com）：
  v2.13 起挂在「已知边界」的缺口（RSS 前瞻表述多为意图声明，缺带硬截止日的
  可结算预测）本轮推进——2026-10-24 复测全部外部预测源，只剩 GJOpen 可达
  （Metaculus API 403 带 UA 仍 403 / Manifold 连接超时 / Polymarket gamma-api
  DNS 落到不可达 IP / Kalshi 超时 / PredictIt 301 / Epoch AI 只有统计数据无
  预测类数据）。GJOpen /questions?q= 公开可抓（需浏览器 UA，裸 curl 406），
  每问题带 ISO 截止时间。新增 prediction-benchmark-collector（9 个实测有返回的
  查询、按问题 id 去重、6h 缓存、抓取失败不覆盖旧缓存），报告新增段
  「外部预测基准（Good Judgment Open 开放问题）」：按主题分组 + 近截止排序 +
  结构对照（本期 RSS 可结算率 vs 外部全部带硬截止日）+ per-claim 主题相邻
  匹配（共享实词 ≥2 才命中，单专名不命中——实测本轮 7 条 claim 0 匹配，
  如实展示不凑数）。边界如实声明：GJOpen 群体预测概率需登录可见，本引擎
  不采集不估计，任何层不得对这些问题声称知道市场概率；匹配只说明「该主题
  有硬截止日问题在跟踪」，主题相邻非同题，不构成概率参照。
  本轮实测：9 查询 → 32 个未截止开放问题（AI 采用率 9 / 太空 7 / AI 安全 5 /
  前沿厂商 4 / 模型基准排名 3 / 地缘与能源 2 / 气候 1 / 监管 1）；
  cron 注入脚本已接该段（第 6 段，含「N 条能匹配」回显）。
  测试新增 8 项断言（全套实测 155 项）；反向验证：摘除实体解码 → 1 条失败，
  摘除去重 → 3 条失败，摘除缓存检查 → 1 条失败，minShared 降到 1 → 1 条失败
  （单专名误命中），摘除报告渲染 → 2 条失败，摘除 available 门 → 1 条失败。

  人类未来技能 v2.16（上一版记录）— 修复「基准概率」辨别维度断链：台账条目存 `domain`、
  辨别器读 `p.category`，本地台账同类历史分支自 v2.13 声明起从未激活。
  修复含三部分：① 字段映射兼容读 category||domain + record() 双写；
  ② 同义务去重（同一现实事件被多个页面重复登记只计一次——实测台账 3 条
  EU AI Act 条目证据来源完全相同，是同一义务；不去重会把一次兑现计成
  三次、兑现率虚高到 100%，比不断链更糟）；③ 样本 <3 诚实降级：仍用
  通用先验但报告如实展示本地已结算条数，不再一律显示 sample=0。
  本轮真实数据实测：报告「预测辨别」段新增「本地台账同类历史」行，
  regulatory_action 显示「已结算 1 条（同义务去重后，原始登记 3 条），
  兑现 1 条——样本 <3 不具统计性，基准概率仍取通用先验」。
  测试新增 7 项断言（全套实测 147 项）；反向验证：摘除字段映射 → 4 条
  断言失败，摘除去重 → 4 条失败，摘除报告渲染 → 1 条失败。

  人类未来技能 v2.15（上一版记录）— 预测辨别器新增「文本性质」子判别：指南/参考页文本不是预测。
  条目=页面标题+页面简介，辨别段把 "A Practical Guide to Article 50 / What providers
  and deployers must do by August 2026" 这类页面文本判成可结算预测（dueOn=2026-Q3）
  登记进台账，同一句 boilerplate 在三个页面重复出现、登记三次全部结算 true。
  参考文本没有任何主张主体，与「意图声明」是两类对象，旧代码把它贴上「意图声明」
  标签属于误判。修复：新增 REFERENCE_TEXT_PATTERNS（只认页面框架措辞 guide /
  overview / this page aims to / what X must do，不碰内容词，不误杀真实承诺），
  新 verdict 'reference-text' 优先级高于不可证伪模式，settleable=false 不进台账，
  报告汇总行单列「非预测文本 N 条」。本轮真实数据实测：4 条 EU AI Act 指南页
  从「裸断言/可结算」改判「非预测文本/不可结算」，可结算 2→1。测试新增 7 项断言
  （全套实测 140 项，此前 SKILL.md 记的 69 是漏计笔误，已按实测改正），
  反向验证：摘除判据→4 条断言精确失败（真实样本/优先级/汇总计数/端到端台账）。

  人类未来技能 v2.14 — sitemap 源修复「假发布日期」：lastmod 是页面最后修改时间不是
  发布时间，旧页被编辑会更新 lastmod。实测 anthropic.com 按 lastmod 取「最新 12 条」
  时 7 条是旧页（100k-context-windows 发布于 2023-05-11，lastmod 2026-10-15），
  报告里的发布日期全是假的。修复：对 lastmod 最新的 24 个候选抓页面抽真实发布时间
  （JSON-LD datePublished / article:published_time / <time datetime>），按真实发布
  时间排名；抓不到页面的回退 lastmod 但打 _dateSource='sitemap-lastmod' 标记，
  报告层 dateProvenance 统计两种出处。实测代价：fetchAll 8s→14-19s（页面解析放在
  所有 RSS 落地之后串行做，不占现有源的 8 秒超时窗口——塞进同一次 Promise.all 会挤
  掉 ECB/NBER，git stash 对照实验证实过）。测试 59→69 项断言，含 mock fetch 反向
  验证（摘除修复→3 条核心断言失败）。

  人类未来技能 v2.13 — v2.13 方向转变：**引擎不再自己生成未来，改为辨别他人关于未来的主张**。
  - 停止假推演：阶段标签从「第一阶段（未来 0-12 个月）」改为「信号最集中方向（本期热度第 1-2 位）」；
    报告标题从「分阶段推演」改为「信号热度分组（按本期活跃度排序，非推演）」
  - 新增 forecast-discriminator（预测辨别器）：对每条含前瞻承诺的信号做四维辨别——
    可证伪性 / 基准概率 / 推理有效性（机制+先行指标+反例条件）/ 证伪条件
  - 新增报告段「预测辨别」：输出「这些关于未来的主张，哪些站得住脚」，而非「我认为未来会怎样」
  - 校准警告：宣称置信度显著高于同类基准概率时给出落差提示（实测 95% vs 35% → 60 个百分点）
  - 已知边界：RSS 与博客正文里的前瞻表述多为意图声明（无时间点），可结算预测需接
    Metaculus / Epoch AI / 厂商路线图等专门预测源，当前采集范围不含
  
  人类未来技能 v2.12 — v2.12 瘦身：SKILL.md 从 48KB 降到 11KB，cron 每轮 prompt 从 52K 降到约 15K 字符。
  历史升级清单（v2.5→v2.11）与 v2.2 设计文档已归档至 references/upgrade-history.md，按需加载。
  
  当前能力（v2.11 实测）：
  - 采集：13 个 RSS 源并行抓取（约 4 秒），FETCH_BODY=1 时抓最新 24 条正文（实测 17 条成功）
  - 专项大模型域：frontier_models 采集域 + 推演主题域 + 独立报告段（来源分布/最新进展倒序/周度节奏）
  - 推演：11 个主题域，9 个组件接入（因果图/跨域传导/趋势判定/时间轴/来源分级/口径错位/认知公式/低置信度守门/预测台账）
  - 源归一化：每源折算为篇/周取域内中位数，消除 RSS 返回窗口差异造成的假趋势（实测抓到 3 个假象域）
  - 口径错位检测：8 个模式含 3 个专项大模型模式（跑分vs能力/demo vs GA/厂商自述vs验证），实测 9 条命中
  - 测试：52 项断言，每项修复都做过反向验证（摘除修复 → 对应断言失败）
  
  已知边界（如实声明，不得对外宣称已解决）：
  - 心虫 think() 对「多事实块新闻推演」输入实测恒定 confidence=0.4-0.45，
    连单条原子事实也恒定，该输入形态下不具备可用辨别能力。
    管线用的是 discriminate()/crossAnalyze() 等 stateless 检查器而非 think()。
  - psychology / philosophy 两个域暂无 RSS 源，离线模式下只读知识库。
  - 正文抓取覆盖率 17/24（openai.com 403、arstechnica.com 405、interconnects 链接失效）。
  - 归一化在源数 <3 的域基本无效（中位数退化为均值），已在报告中标注。
  
  适用场景：
  - 追踪事件间的因果传导链（A→B→C→D）
  - 追踪预测准确度，建立校准曲线
  - 两遍分析（快速扫描 → 深度挖掘）
  - 信号频率分析与异常检测
  - 跨域知识吸收与融合
---

# 人类未来 · 文明推演引擎 v3.0.0

> 数据采集（RSS 真联网 + 可选正文增强 + 外部预测基准 GJOpen）→ 心虫 stateless 检查器 → 三年推演引擎。
> 当前状态与实测数字见下一节，历史版本记录见 references/upgrade-history.md。

---

## 当前状态（v3.4.0 实测）

以下数字全部来自 2026-10-25 的 `FETCH=1 FETCH_BODY=1 node scripts/run-pipeline.js` 实跑
（v3.3.1 轮 270 条 live 信号；v3.3.0 轮 258 条、v3.2.2 轮 270 条、v3.1.1 轮 270 条、
v3.1 轮 258 条），不是宣称值。v2.17/v3.0.0c 轮次数字（248-258 条 live、36.7 秒、
基准冷启动）见 frontmatter 历史记录。

**采集层**
- 源：23 个（tech 2 + humanities 1 + frontier_models 12 + economy 4 + business 4
  + psychology/philosophy 各 0）。frontier_models 的 12 = 9 个 RSS + Anthropic sitemap
  + EU AI Act Timeline + NIST（旧版 SKILL.md 写「17 个」且分项加总也不等于 17，
  v3.1 按代码实际修正——这是文档维护，不是能力变化）

**SEC EDGAR 采集层（v3.4 新增）**
- 来源：SEC EDGAR 公开 API（data.sec.gov submissions + Archives index.json），
  实测可达（2026-10-25：200/2.6s）；UA 声明身份 + 120ms 请求间隔（fair access）
- 公司名单：14 家境内备案人（NVDA/AMD/AVGO/MRVL/MU/MSFT/GOOGL/AMZN/META/
  ORCL/CRWV/IBM/DELL/PLTR），ticker→CIK 走 company_tickers.json 权威映射
- 采集对象：8-K Item 2.02（业绩发布）最近 2 次/公司 + EX-99 附件正文；
  指引句 = 指标名词 + is/are expected to be + 数值（五家公司五种句式实证），
  附财季期间（就近匹配，同比引用排除）、容差、前提削减
- 实测产出：28 条业绩备案 / 32 条数值指引（11 家有数值）；MSFT/GOOGL/AVGO/
  CRWV/IBM/DELL/PLTR 只在电话会口头给指引或无数值——如实报「无数值指引」
- 缓存：.cache/edgar-filings.json TTL 6h；位置在所有 RSS 落地之后（v2.14 纪律）
- 已知边界：外国私人发行人（TSM/ARM/NBIS）交 6-K 不交 8-K，不在名单内；
  结算点是估计值（财季/财年结束+45 天），不是精确日期
- 并行抓取：`Promise.all`，实测约 4 秒（旧串行最坏 104 秒）
- 正文增强：`FETCH_BODY=1` 时抓最新 24 条，实测 17 条成功（openai.com 403 / arstechnica 405 / interconnects 链接失效）
- 实测产出：258 条 live（2026-10-25 v3.3.0 轮；同日 v3.2.2 轮 270 条、v3.1.1 轮 270 条、
  v3.1 轮 258 条、v3.0.0c 轮 248 条），其中专项大模型域与商业域为主体

**商业采集层（v3.0.0 新增）**
- business 域 4 源：TechCrunch AI / The Information / Last Week in AI / ProductHunt
  （实测 12 个候选后选定；Crunchbase/CIO 403、Import AI 连接失败、HN 仅 1 条且非 AI 分类，明确不可用不重复试）

**外部预测基准层（v2.17 新增）**
- 来源：Good Judgment Open（gjopen.com），专业预测平台；`/questions?q=<词>` 公开可抓
  （需浏览器 UA，裸 curl 406）
- 查询集：9 个（artificial intelligence / large language model / AI safety / openai /
  anthropic / spacex / nuclear / regulation / climate），均为实测有返回的查询；
  'AI' / 'gene' 因子串误配（匹配到 Saudi / general）已剔除
- 实测产出：32 个未截止开放问题（AI 采用率 9 / 太空 7 / AI 安全 5 / 前沿厂商 4 /
  模型基准排名 3 / 地缘与能源 2 / 气候 1 / 监管 1），按问题 id 跨查询去重
- 缓存：`human-future/.cache/benchmark-gjopen.json`，TTL 6h；抓取失败不覆盖旧缓存，
  全部失败时有过期缓存就标注 degraded 使用，没有则如实报不可用
- 位置纪律：采集在所有 RSS 抓取落地之后做（v2.14 对照实验教训：新网络负载塞进
  现有源的 Promise.all 会挤掉慢源的 8 秒超时窗口）

**推演层**（project-future.js，v3 引擎）
- 主题域：16 个（frontier_models 排在最前避免被 ai_capability 同批关键词吞掉；11 个文明级域 + 5 个商业域）
- 接入组件：causal-graph-engine / cross-domain-conduction / signal-decay-resonance /
  timeline-conflict-detector / source-credibility-grader / claim-mismatch-detector /
  cognitive-formula-bridge / low-confidence-gate / prediction-ledger /
  prediction-benchmark-collector（v2.17，仅真采到时才写进 meta.reasoningEngines）/
  edgar-collector（v3.4，SEC 一手财报备案，见采集层）/
  commercial-discriminator（v3.0.0，商业主张辨别）/
  self-correction-ledger（v3.1，0 调用模块接入，无条件执行——簿子读不到时
  available=false 且原因写明，不静默返回空）
- 实测各模块可用性：因果链 ✅（共现兜底）/ 跨域传导 ✅ / 趋势判定 ✅（源归一化）/
  时间轴 ✅（16 点，需正文）/ 来源分级 ✅（T1 62 / T2 92 / T3 48 / T4 68，23 个独立源；
  旧版 SKILL.md 写 T4 0 是 business 域接入前的数字，v3.2.2 按实测修正）/
  口径错位 ✅（v3.1.1 精度门后：2026-10-25 轮 270 条 live 实测 1 条真命中带触发句；
  修复前同型数据 14 条命中里 7 条经逐条复核为误报——勋章当订单、democracy 里的
  demo、gigawatts 里的 GA、limited to two players、on target+demonstrate、
  our researchers+safety、benchmark+促销页脚；五个模式同句判定，另三个无实证
  不改判据）/
  外部预测基准 ✅（32 个开放问题，per-claim 主题匹配本轮 0/7，如实展示）/
  SEC 财报指引 ✅（v3.4：28 条业绩备案进 live、32 条数值指引进「预测辨别」段，
  verdict=earnings-guidance 可结算、dueOn 为财季估计值，自动进台账）/
  预测辨别器新 verdict ✅（earnings-guidance：财报指引单列——结构上是
  「指标+数值+结算期」最硬的可结算形态，但推理三要素通常不出现，用
  reasoningScore 判会掉进「裸断言」误标；先验中性 0.5，口径注明
  FactSet 超预期率不可挪用）/
  商业主张辨别 ✅（6 条，精度门后；v3.2 新增产能/供给约束形态后含 AWS 售罄
  主张一条——修复前该条 13 种形态全部不命中、整条不进辨别；判 证据不足/无出处(1)/
  推理 0/3，标题-only 不虚抬为决策相关；v3.3 新增并购/交易过程形态后含 Instacart
  出售探索与 Ramp/Airwallex 破裂交易两条——扩容前 14 种形态全部不命中、
  整条不进辨别；均判 不可证伪（无量化）/无出处(1)，标题-only 不虚抬为决策相关；
  v3.3.1 survey-finding 精度修复后 8→6 条——EconBrowser 站点导航与 LWiAI 播客
  列表两条 incidental 误报消除，Grok 真调查主张保留）/
  自我修正登记簿 ✅（14 条修正：critical 2 / high 9 / medium 3；v3.3.1 登记
  corr-2026-014（版本号漂移：projection meta 停 3.2.2/package.json 停 3.2.1，
  四处对齐+一致性断言）与 corr-2026-015（survey-finding 误报+三处播客夹具
  空转）；v3.3 登记
  corr-2026-013（计数错误同型复发：新注释写「15 种」实为扩容前 14 种，提交前
  捕获并加模式计数断言）；v3.2.2 登记
  corr-2026-012（第七次同型断链：低置信度守门派生漏注入），critical 排最前；
  v3.2.1 登记 corr-2026-011（第六次同型断链）；v3.1.1 登记 corr-2026-009：
  口径错位检测 7 条误报 + 第五次同型断链）
  [v3.2.1] 预测校准与台账状态 ✅（ledgerStatus + formulaAssessment 进 cron 注入第
  8.5 段：Brier/兑现率/待结算/逾期 + 贝叶斯 posterior/折扣/风险，三条口径限定；
  端到端实测 Brier 0.3025/样本 1/待结算 2，公式段与台账段样本一致）
  [v3.2.2] 低置信度守门 ✅（lowConfidenceGate 进 cron 注入第 3.5 段：整体置信度/
  阈值/通过与 disclosure 原文 + 被拦阶段名单，三条口径限定；端到端实测整体
  0.43 未通过、被拦 2 阶段、段序 summary<守门<阶段结论）

**口径错位检测层（v3.1.1：精度门 + 端到端接通）**
- 精度门（sentenceScoped）：口径错位是「同一句话里把两件事说成一件事」。五个模式
  （capacity-vs-order / benchmark-vs-capability / demo-vs-ga / roadmap-vs-result /
  vendor-selfreport-vs-verification）要求两侧在同一句内共现；另三个
  （detection-vs-correction / flyby-vs-landing / trial-vs-approval）没有 live
  误报实证，保持整段判定——没有证据就改判据是另一种不严谨。
- 语义收紧（demo-vs-ga）：\b 词边界（demo 不碰 democracy/democrat、GA 不碰
  gigawatts/average/navigation）；limited 只认灰度语义（limited access/rollout/
  beta/testing，「limited to two players」不是灰度）；B 侧只认完成态可用性断言
  （is now available / general availability / now shipping），「available in
  preview」与「we launched X Preview」是正确表述不是错位。
- 采购语义收紧（capacity-vs-order B 侧）：中文订单/交付、shipped、pre-order、
  order book、backlog、orders for <数字>；「Order of Dostyk」友谊勋章与
  "in order to" 不再是订单。
- 触发句（evidenceSentence）：每条命中带「是哪句话触发的」，报告与 cron 注入
  都可逐条复核——命中可审计，不是只给一个标签。
- 端到端：cron 注入脚本第 6.5 段读 proj.claimMismatches（v2.9/v2.13/v2.17/
  v3.0.0c 之后第五次同型断链修复：引擎产出 + formatReport 渲染都有，注入脚本
  从未读，agent 完全看不到）。注入带口径限定（只判表述形态、引用必须同句带限定）。

**商业推演层（v3.0.0 新增，v3.0.0c 修复端到端断链）**
- 定位：v3.0.0 起引擎双轨——文明级信号（人类未来，11 域）+ 商业级辨别（心虫商业未来，5 域）。
  f118603 的目的转变：「文明级信号无法回答商业决策问题」。
- 5 个商业主题域：市场主张 / 竞品与替代方案 / 资本与商业模式 / 客户采用与场景 / 合规需求。
  business 桶归类：关键词优先，兜底 market_claims（商业新闻本质都是关于市场的主张或动作）。
- 商业主张辨别器（commercial-discriminator.js）：辨别「关于市场的陈述」，
  四维判据与 forecast-discriminator 分工——
  预测看「有没有时点」，市场主张看「有没有量化与证据等级」；
  预测看「同类历史兑现率」，市场主张看「是调查自述、厂商口径还是独立验证」。
  证据等级：独立验证(4) > 第三方调查/公开财报(3) > 厂商自述/媒体报道(2) > 无出处(1)；
  推理三要素：样本/对照/反例；verdict：factual / unfalsifiable / weak-evidence /
  thin-reasoning / well-formed；decisionRelevant = 证据≥3 或推理≥2 且非不可证伪。
- [v3.0.0c] 精度门：候选题句必须命中商业主张形态（COMMERCIAL_CLAIM_PATTERNS）之一，
  标题参与判定。实测依据：旧关键词触发器把 7 条 Fed FOMC 公告、LWiAI 播客、
  TechCrunch 促销页脚（"Get your pass ... REGISTER NOW"，★决策相关）混入，
  19 条里 18 条 kind=unclassified。修复后同轮 248 条 live → 6 条进辨别。
  [v3.2 计数纠错] 本节与代码注释自 v3.0.0c 起写「14 种商业主张形态」，实跑
  核对当时只有 13 种——与 v3.1 修正的「17 个源」同型文档计数错误。v3.2 新增
  产能/供给约束后真实条数为 14（逐条列出见 commercial-discriminator.js）。
  [v3.3 再纠错] v3.3 新增并购/交易过程（ma-claim）后真实条数为 15；ma-claim
  注释里「扩容前 14 种全部不命中」的 14 指扩容前形态数，不是当时文档口径。
- [v3.0.0c] 端到端断链修复：v3.0.0 起引擎产出 commercialDiscrimination、
  formatReport 渲染「商业主张辨别」段，但 cron 注入脚本从未读取该字段——
  报告文件里躺着、agent 完全看不到。这是 v2.9/v2.13/v2.17 之后第四次同型断链。
  本轮补上注入段（含口径限定与证据图例），测试加源级断言防复发。
  [v3.1.1 补记] 同型断链第五次发生在口径错位检测段（claimMismatches，v2.4
  接入、v2.9 修好字段断链，14 条命中/轮但注入脚本从未读）。教训升级：
  「新报告段 ≠ 交付完成」不只适用于新段——**每一段交付时都要问注入脚本里
  有没有**，否则端到端判据（agent prompt 里能不能看到）永远有漏。
- 纪律（心虫铁律）：只辨别主张的表述与证据质量，不判断内容真假，
  不生成「心虫应该怎么做」的商业建议——那由报告 agent 判断并标注归属。

**[v3.2] 产能/供给约束主张（capacity-claim，新辨别维度）**
- 定位：v3.0.0c 起记在「已知边界」的覆盖缺口——"AWS Largely Sold Out Of
  Capacity Into 2028"（The Information 简报标题）13 种形态全部不命中，整条
  不进辨别。2026-10-25 实跑该条就在 258 条 live 池里，逐条过形态门确认
  MISS 后扩库。供给侧约束（需求>供给 → 定价权/扩产周期）是 AI 算力市场的
  一阶信号，漏掉它商业辨别看不见最重要的市场事实之一。
- 形态族：售罄（sold out of capacity / capacity is sold out，容忍形容词）、
  耗尽/分配殆尽（exhausted / allocated / committed，含 has been 形态）、
  短缺（shortage of AI chips，容忍形容词间隔）、需求超供给（demand exceeds
  supply / orders outpaced inventory，容忍间隔与过去时态）。
- 精度设计（v3.0.0c 教训：漏报比误报诚实、没有实证不扩模式）：必须「供给
  名词 + 耗尽谓语」相邻共现。storage capacity / capacity building / capacity
  to reason（普通 capacity 词）、演唱会与体育场 sold out（无产能名词相邻）、
  waitlist for silicon（MIT TR 解释性类比）、break the power bottleneck
  （解题不是售罄）、扩产新闻全部不命中——8 句精度回归进测试。
- 判别结果（live 实测）：该条判 证据不足 / 无出处(1) / 推理 0/3，不虚抬为
  ★决策相关——标题-only 条目只拿到主张本身，出处与样本都要等正文或交叉
  验证。证伪条件走 capacity 专属路径（第三方产能/利用率跟踪、后续扩容、
  预留量口径）。类目归 market_claims。
- 端到端：引擎候选门（isClaimForm 用同一个模式库）→ discriminateCommercial
  → formatReport KIND_CN「产能/供给约束」→ cron 注入第 6 段同标签。
  [v3.3 更新] 仍在库外的市场句式：产品发布公告、可核验的市场价格事实
  （"Shares Rally 10%"）——下轮候选，扩库须逐条配测试。

**[v3.3] 并购/交易过程主张（ma-claim，新辨别维度）**
- 定位：v3.0.0c 起记在「已知边界」的第二个覆盖缺口——"Instacart Is Exploring
  a Sale" 与 "Ramp Investors Went Nuclear Against Airwallex After Doomed Deal"
  （均为 The Information）扩容前 14 种形态全部不命中，整条不进辨别。2026-10-25
  实跑该两条就在 258 条 live 池里，逐条过形态门确认 MISS 后扩库。交易过程
  （并购/出售/谈判/破裂）是资本与商业模式域的一阶信号（交易塑竞争格局、
   Deal 破裂塑信任成本），漏掉它商业辨别看不见市场结构变化的主要通道之一。
- 形态族：探索/权衡类（exploring / considering / weighing / pursuing + sale /
  takeover / merger / acquisition / buyout / deal）、谈判类（in talks to
  acquire / buy / sell / be acquired，容忍 advanced / early / exclusive 等
  前置修饰与 enters / entered / holding / resumed 动词形态）、交易状态类
  （doomed / collapsed / failed / faltering / stalled / dead deal，deal falls
  through / talks collapsed 谓语形态）。
- 精度设计（v3.0.0c 教训：漏报比误报诚实、没有实证不扩模式）：只认「交易是
  主张主体」的句式。不认裸 "sale talks" 名词短语——live 实证「Instacart
  Shares Rally 10% After The Information Reports Sale Talks」的主张主体是
  股价（可核验的市场价格事实，v3.2 已决议非待辨别主张），"Reports Sale
  Talks" 是媒体转述的从属成分；不认 IPO/ahead of IPO（估值形态已覆盖该条）、
  bare "in talks"（无交易对象的谈判不是可证伪主张）、"exploring options"
  （战略措辞非交易主张）、eyes+非交易名词（inDrive "eyes 2027 robotaxi
  tests" 是测试计划不是收购）。8 句精度回归进测试。
- 判别结果（live 实测）：两条均判 不可证伪（无量化）/ 无出处(1) / 推理 0-1/3，
  不虚抬为 ★决策相关——标题-only 条目只拿到主张本身，交易金额、当事方确认、
  时间表都要等正文或交叉验证。证伪条件走 ma 专属路径（当事方公开否认、
  谈判破裂或交易被监管否决、最终交割条款/估值与主张情形不符）。类目归
  capital_flow。
- 端到端：引擎候选门（isClaimForm 用同一个模式库）→ discriminateCommercial
  → formatReport KIND_CN「并购/交易过程」→ cron 注入第 6 段同标签。live
  实测商业辨别段 6→8 条，byKind 新增 ma:2。仍在库外的交易句式：无交易对象
  的裸谈判（"in talks"）、"eyes a stake" 类少数股权动作——等有 live 实证再扩。

**[v3.3.1] survey-finding 精度修复（维护级，非新辨别维度）**
- 定位：v3.3.0 轮 live 实证的两条误报——EconBrowser 站点导航 "Analysis of
  current economic conditions and policy"（命中 "analysis of"）与 LWiAI 播客
  列表 "interpretability research from Anthropic"（命中 "research from"）
  进了商业辨别段。旧 survey-finding 正则 `(survey|study|…)\s+(of|by|from|…)`
  把「调查名词+介词」的 incidental 搭配当成研究发现：两句都没有发现动词、
  没有量化对象，是博客副标题/播客话题列举，不是主张。
- 修法（收紧为二选一）：A. 调查名词+发现动词相邻（study found / research
  shows / analysis indicates…）；B. 调查名词+of+量化对象（survey of 1,200 /
  survey of almost 11,000，容忍数量副词——v3.0.0c funding 副词容忍的同型
  教训）。连带把无 live 实证的 report 动词形态一并收紧（Fed 站点导航
  "Payments Research Reports" 是名词标签短语，live 实证）。
- live 全池实测：旧模式 7 条命中里 4 条真主张全保留（Survey of 2,018 /
  survey of almost 11,000 / Study Shows / study found）、3 条 incidental
  搭配精确消除；端到端商业辨别段 8→6 条，Grok 真调查主张保留。代价如实
  记录：无量化对象且动词不相邻的 "a survey of enterprises found 34%" 与
  "survey reports that X" 形态不再命中——按 v3.0.0c 纪律「漏报比误报诚实」
  接受，等有 live 实证再议。
- 同轮维护（不单独涨号）：① 版本号漂移修复——VERSION=3.3.0 而 projection
  meta.version 停在 3.2.2、package.json 停在 3.2.1（v3.1 修过 banner/meta
  同型，另两处腐烂四个补丁轮），四处对齐 3.3.1 并加一致性断言；
  ② v3.0.0c/v3.2/v3.3 三处「播客不进辨别」测试夹具补强为 live 误报原句
  （旧 description 压根不触发模式门、断言恒真空转两个版本——恢复旧正则后
  三处旧断言立刻真失败，实证补强生效）。
- 测试 207→214 项；3 轮反向验证全部精确失败（恢复旧正则→v3.3.1 4 失败+
  三处旧断言各 1 失败/收紧过头摘形式 B→3 失败/版本漂移复发→恰好 1 失败）。
  登记 corr-2026-014（版本漂移）/corr-2026-015（误报+夹具空转）。
- 版本号理由：精度修复+漂移修复=末位补丁；本轮没有新辨别维度。

**自我修正登记簿层（v3.1 接入的 0 调用模块）**
- 定位：这是接入，不是新写。self-correction-ledger.js 自 v2.4 存在，
  `human-future/data/self-corrections.json` 有 14 条真实修正（绕月≠登月、
  v2.4 假能力三项审计、stateless 检查器覆盖缺口、sitemap 页面简介≠新闻正文、
  指南页文本≠预测、口径错位检测 7 条误报+第五次断链、v3.2 公式桥样本口径
  不一致+文档计数错误+测试夹具残留、v3.2.1 第六次断链、v3.2.2 第七次断链
  +差集结案纪律、v3.3 计数错误同型复发+模式计数断言、v3.3.1 版本号漂移
  +survey-finding 误报与夹具空转等），模块 docstring 的铁律写着「每次修正
  落盘，下次推演先读簿子再说话」——但 v3.1 之前 live pipeline（scripts/）
  从未 require 过它，只有早期死副本 human-future/scripts/run-pipeline.js
  调过。簿子记了、没人读。
- 接入路径（三段都真跑到）：引擎 `buildSelfCorrectionLedger()` 调模块自身
  API（load() / recurringPatterns() / SEVERITY_RANK）→ `report.selfCorrectionLedger`
  → formatReport 渲染「自我修正登记簿」段（位置：总体摘要之后、信号热度分组
  之前——先对旧账再解读新信号，放中段等于没放）→ cron 注入脚本第 8 段读取
  （带口径限定：是引擎自己的历史错误，不是本期新闻的事实判定，不得引用为外部证据）。
- [v3.1 维护] 计数口径修复：recurringPatterns() 旧代码 `severity === 'high'`
  严格过滤，漏掉数据里 2 条 critical（都是「整段推演作废」级的假能力审计），
  接入后会少报高危数（说 4 实际 6）。改为按等级表比较（critical > high >
  medium > low），critical 排最前。这是修 bug，不算升级——升级点是接入本身。
- 边界（如实声明）：登记簿 14 条（v3.3.1 轮新增 corr-2026-014/015 后；
  v3.2.2 轮 e2e 实跑的报告快照在登记前，显示 10 条），样本随每次真实修正
  自然增长，引擎不代笔登记；本段不生成「所以本期该怎么做」的建议，
  只呈现「曾经错在哪」。

**心虫层**
- 入口：`~/heartflow/src/index.js`（74 个 stateless 检查器）
- 本体入口：`~/heartflow/src/core/heartflow.js`（HeartFlow 类）
- 已知边界：`think()` 在新闻推演输入上实测恒定 confidence=0.4-0.45，不具备可用辨别能力，
  管线用 stateless 检查器。这条边界自 v2.5 记录至今未变。

## v2.13 方向转变：从「生成未来」到「辨别未来主张」

**为什么转**：v2.12 及以前的「推演」是假推演。逐段核对过：
- `stages` 的操作是 `ds.slice(i*2, i*2+2)`——按当前信号热度排序后贴时间标签，
  而 `describeStage()` 自己的描述写「当前信号最集中的方向……属于正在发生的进展」，
  与「未来 0-12 个月」的标签直接矛盾
- `turningPoints` 代码注释自述「此为本期观察到的最近信号，非未来事件预测」
- `formulaAssessment` 贝叶斯先验写死 0.5，注释写「这是方法演示，不是校准过的概率」
- `predictionLedger` 登记的「预测」是「X 方向在本期内保持活跃」，到期日 2027，sample=0

**转成什么**：引擎不再产出「我认为未来会怎样」，而是产出「**这些关于未来的主张，
哪些站得住脚**」。这是 Layer 1（辨别者）的独有位置——大模型能生成预测，
但能系统性辨别预测质量并长期跟踪结算的，没有。

**辨别四维**（`human-future/scripts/forecast-discriminator.js`）：
1. 可证伪性——有主体 + 有事件 + 有时点；「AI 会继续进步」这类是修辞不是预测。
   [v2.15] 含文本性质子判别：指南/参考页文本（页面标题+简介，"A Practical Guide
   to…"、"This page aims to provide an overview…"）没有任何主张主体，连「意图声明」
   都不是——单列 verdict 'reference-text'，不可结算、不进台账。实测依据：EU AI Act
   Timeline 指南页曾被判可结算并登记三次全部结算 true（同一义务重复计数）。
2. 基准概率——同类历史兑现率。[v2.16] 断链修复：台账条目存 `domain`、
   辨别器旧代码读 `p.category`，本地台账分支自 v2.13 声明起从未激活；
   现兼容读两个字段 + 同义务去重（同一现实事件被多个页面重复登记只计
   一次，实测 3 条 EU AI Act 条目是同一义务）后才计数；去重后样本 <3
   仍用通用先验，但报告如实展示本地已结算条数，不再一律显示 sample=0
3. 推理有效性——是否给出机制 / 先行指标 / 反例条件，三要素缺一降一级
4. 证伪条件——明确写出「观察到什么就说明这条错了」；没有则无法结算

**已知边界（如实声明）**：
- 当前采集源（RSS + 博客正文）里的前瞻表述**多为意图声明**（"we expect to expand
  access"、"aim to simplify"），没有时间点，判为不可结算。实测 5 条全部如此。
  [v2.17] 本轮实测依旧：7 条含前瞻承诺信号中可结算 1 条（14%）。
- 要拿到真正可结算的预测，需接 Metaculus / Epoch AI / 厂商路线图等专门预测源。
  [v2.17] 本轮已接入其中一个——**Good Judgment Open**：9 个查询实测采到 32 个
  带硬截止日的开放问题，报告段「外部预测基准」与 cron 注入均已接通。
  但**其余源仍不可达**（2026-10-24 实测，如实记录）：
  Metaculus API 403（带浏览器 UA 仍 403）、Manifold API 连接超时、
  Polymarket gamma-api DNS 落到不可达 IP、Kalshi 选举 API 超时、PredictIt 301、
  Epoch AI 数据页只有芯片/模型/公司等统计数据、无预测类数据。
- [v2.17] GJOpen 边界：① 群体预测概率（crowd forecast）需登录可见，本引擎
  不采集、不估计，任何层不得对这些问题声称知道市场概率；② 单问题详情页
  302 跳登录，抓不到 resolution criteria 正文；③ 活跃问题池很小（几百个），
  AI 覆盖集中在采用率/基准排名/厂商事件，九大域里量子/基因编辑/长寿/脑机接口
  等域 GJOpen 无开放问题（AGI / quantum / fusion / crispr / longevity /
  humanoid / brain 查询实测 0 返回）；④ per-claim 主题相邻匹配是关键词匹配
  （共享实词 ≥2），主题相邻非同题，不构成概率参照——本轮实测 0/7 命中，
  报告如实写 0，不用模糊匹配凑数。
- 基准概率目前仍以通用先验为主：本地台账去重后同类样本 <3 时不作统计
  结论（实测 regulatory_action 去重后仅 1 条），但报告已如实展示本地
  已结算条数。[v2.16] 已修复此前的字段映射断链（存 `domain` 读
  `p.category`，分支永不激活）并加上同义务去重；样本随台账积累自然
  增长，不需要再改代码。

**商业主张辨别的已知边界（v3.0.0c 如实声明，v3.3 更新）**：
- 模式库外的真实主张句式仍会漏：v3.2 起 "AWS Largely Sold Out Of Capacity
  Into 2028"（产能主张）已进模式库（capacity-claim，含售罄/耗尽/分配殆尽/
  短缺/需求超供给形态族）；v3.3 起 "Instacart Is Exploring a Sale" 与
  "Ramp Investors Went Nuclear Against Airwallex After Doomed Deal"（并购/
  交易过程主张）已进模式库（ma-claim，含探索/权衡、谈判、交易状态三族）；
  仍在库外的有 "Instacart Shares Rally 10%"（市场反应——可核验的市场价格
  事实，非待辨别主张）、ProductHunt 产品发布（产品公告非市场主张）。
  漏掉比把 Fed 公告当商业主张诚实，但覆盖率是真实缺口——扩模式库须逐条配测试。
- 站点导航/页脚 boilerplate：v3.0.0c 轮起漏网（EconBrowser 导航文本因句内含
  "analysis of" 命中调查研究形态），[v3.2 复测] 同型漏网仍在（EconBrowser 导航
  与 LWiAI 播客条目进辨别）。
  [v3.3.1 修复] 根因不在「按站点类型判」而在 survey-finding 模式本身把
  「调查名词+介词」的 incidental 搭配当成研究发现——收紧为「调查名词+发现动词
  相邻」或「调查名词+of+量化对象」二选一后，live 全池 4 条真主张全保留、
  3 条 incidental 搭配（analysis of / research from / Fed 导航 Research
  Reports）精确消除，端到端商业辨别段 8→6 条。剩余边界：boilerplate 的其它
  形态（促销页脚已被形态门挡掉）暂无 live 实证，不无证据加过滤器。
- 无摘要条目（The Information 简报、ProductHunt）只有标题可辨，
  证据等级多为「无出处(1)」——不是主张没出处，是抽取层只拿到标题。
- 本段不生成商业建议。「这对心虫意味着什么」由报告 agent 判断并标注归属，
  引擎不代劳——这是心虫铁律，不是能力缺失。

**测试**
- `npm test`：**230 项断言**（实测各 section 汇总；v3.3.1 的 214 + v3.4 新增 16：
  5 项采集器抽取（NVDA/AMZN/AMD/MRVL/MU 五种 live 句式命中 / 4 类精度回归 0 误报 /
  期间就近+同比排除+Oracle 两种期间形态 / 小数不截断+句点不冲段 / 词边界）+
  5 项辨别器（带元数据判 earnings-guidance+估计结算点 / 无 FYE 不猜结算点 /
  no-timeline 不误杀 / 全年指引财年结算点 / 中性先验口径注明）+
  5 项端到端（extractSignals 透传+不重复收录 / 幂等 id metric+value 维度 /
  formatReport 渲染四行 / collect-news 源级接线 / 注入脚本 VERDICT_CN+汇总+结构行）+
  1 项版本号（banner 与 VERSION 对齐，corr-2026-014 同型）。
  6 轮反向验证全部精确失败：摘除 EDGAR 接入→源级断言失败；摘除 verdict 分支→5 条；
  摘除财季 dueOn 推算→5 条；摘除 id value 维度→幂等断言失败；摘除期间对比排除→
  期间断言失败；摘除句点处理（恢复裸 [^.;•]）→2 条。
  历史：v3.3 的 207 + v3.3.1 新增 7：
  2 项模式级误报回归（EconBrowser 导航句 / LWiAI 播客列表句，live 实证原句
  不再命中 survey-finding）+
  1 项模式级真命中保留（live 全池 4 条真主张原句全保留 + Fed 导航 Research
  Reports 消除）+
  1 项判别级真命中保留（既有夹具「survey of 1,200 enterprises found 34%」
  仍判结构完整，收紧不打穿）+
  1 项端到端候选门（两条 live 误报原文进 signals，整条不进商业辨别段）+
  1 项端到端不误杀（真调查主张与误报同批仍进辨别且判结构完整+决策相关）+
  1 项版本号一致性（VERSION/package.json/projection meta/run-pipeline meta
  四处对齐，corr-2026-014 的防腐烂断言））。
  同轮维护：v3.0.0c/v3.2/v3.3 三处「播客不进辨别」夹具补强为 live 误报原句
  （旧 description 不触发模式门、断言恒真空转两个版本——反向验证实证：
  恢复旧正则后三处旧断言立刻真失败）。
  v3.3.1 三轮反向验证全部精确失败：恢复旧 survey-finding 正则→v3.3.1 4 条
  失败 + v3.0.0c/v3.2/v3.3 各 1 条失败（误报回归+夹具补强双生效）；
  收紧过头摘除量化对象形式 B→3 条失败（真命中保留生效）；
  版本号漂移复发（projection meta 改回 3.2.2）→恰好 1 条失败（仅版本一致性）。
  v3.3 五轮反向验证全部精确失败：摘除 ma-claim 模式→7 条；摘除 ma 证伪条件→1 条；
  摘除 formatReport KIND_CN→1 条；摘除 cron 注入标签→1 条；摘除精度收紧
  （正则加回裸 sale talks 名词短语）→1 条（精度回归生效）。
  历史新增明细——v3.2.2 新增 3（
  1 项注入脚本源级+位置纪律（读 ~/.hermes/scripts/hf-cron-fetch.sh 验
  proj.lowConfidenceGate / 旧版报告路径 / overall 未通过分支语义「不得作为结论引用」
  / 被拦阶段名单 / 两条口径限定——守门不是新闻内容真假判定、未通过不得引用为结论
  预测或行动依据 / 段序必须先于「推演阶段结论」）+
  1 项引擎产出与阈值语义一致（applyLowConfidenceGate 的 allowed 由 score 与
  threshold 0.6 比较决定：0.43 拦/0.9 放行/stage 0.71 放行/0.48 拦，双向防写死）+
  1 项断链审计差集闭环（静态提取 project-future.js generate() 的产出字段 vs
  注入脚本 proj.X 读取字段，差集必须等于 12 段逐段结案的有意省略清单——
  v3.2.1 纪律「差集审计每轮做」固化为每轮测试动作：新字段漏注入或清单腐烂
  ——接入后忘了移除——都失败）。
  v3.2.2 六轮反向验证全部精确失败：摘除整个守门注入段→2 条（组 1+组 3）；
  摘除口径限定三行→1 条；把注入段移到「推演阶段结论」之后→1 条（位置纪律）；
  引擎 overall.allowed 写死 true→1 条（组 2 阈值语义）；省略清单移除 risks→1 条
  （差集非空）；清单加入已接入字段 lowConfidenceGate→1 条（结案腐烂）。
  每轮先基线 3/0、摘除后断言必须生效、每轮 diff 校验还原到位、收尾基线全绿。
  v3.2.1 新增 3（注入脚本源级读 ledgerStatus/formulaAssessment / 引擎产出与台账
  数据文件逐条一致防编数字 / 两段样本口径一致防回退）；五轮反向验证全部精确失败。
  v3.2 新增 9：
  1 项 live 实证命中（The Information「AWS Largely Sold Out Of Capacity Into
  2028」→ kind=capacity，标题-only 判 证据不足/无出处(1)/推理 0/3 不虚抬）+
  1 项专属证伪条件与类目映射（第三方产能跟踪/扩容/预留量，market_claims）+
  1 项形态族召回售罄/耗尽/分配殆尽（含 has been 形态）+
  1 项形态族召回短缺与需求超供给（含形容词间隔与过去时态）+
  1 项精度回归 8 句（storage capacity / capacity building / capacity to reason /
  演唱会与座位 sold out / waitlist for silicon 类比 / 解题式 bottleneck /
  扩产新闻全部不命中）+
  1 项引擎端到端（候选门放行 + formatReport 渲染「类型: 产能/供给约束」行与
  证伪条件——只认渲染出的标签行，段内 note 文本也含该字符串，泛匹配会空转）+
  1 项精度门未破（Fed 公告/播客仍不进辨别）+
  1 项 cron 注入 KIND_CN 含 capacity+
  1 项维护：公式桥 Brier 样本同义务去重（3 条登记 → 2 个义务））。
  v3.2 六轮反向验证全部精确失败：摘除 capacity-claim 模式→6 条失败；
  摘除精度收紧（恢复 40 字宽窗正则）→3 条失败（召回 #3/#4 + 精度 #5——
  宽窗同时丢 has-been/形容词间隔召回又误命中座位容量句）；
  摘除证伪条件条目→1 条；摘除 cron 注入标签→1 条；摘除公式桥去重→1 条；
  摘除报告渲染标签→1 条。第一版报告标签断言 0 失败（被段内 note 文本里的
  「产能/供给约束」喂饱，断言空转），已改为只认「类型:」渲染行后精确失败。
  v3.1.1 新增 12：
  6 项误报回归（勋章当订单 / democracy 含 demo / gigawatts 含 GA /
  limited to two players / available in preview 与产品名带 Preview /
  跨句共现三种形态，每条对应一个 live 实证误报，修复后必须不命中）+
  1 项 Gemini 4 Argon 同句真命中保留（benchmark 与 demo 两个模式都必须命中）+
  1 项其余四个 sentenceScoped 模式同句真命中保留 +
  1 项 splitSentences 不在小数点处拆句 +
  1 项引擎级（误报条目计数 0 + 真命中保留 + 命中带触发句）+
  1 项端到端渲染（报告 markdown 出现口径错位段与触发句）+
  1 项注入脚本源级（读 ~/.hermes/scripts/hf-cron-fetch.sh 验 claimMismatches /
  口径限定 / 0 命中路径 / 不可用路径 / 旧版报告路径））。
  v3.1.1 五轮反向验证全部精确失败：摘除 demo-vs-ga 修复（恢复旧正则）→5 条失败；
  摘除 capacity 修复→1 条；摘除同句判定（sentenceScoped 全置 false）→1 条；
  摘除 cron 注入段→1 条；摘除触发句透传与渲染→2 条。
  反向验证中抓到过一次断言空转并已修：误报回归 #2/#4 第一版把 A/B 两侧放在
  不同句，旧正则下 B 侧压根不匹配、断言恒真通过——已改为同句用例，摘除修复
  后才真正失败。
  v3.1 新增 7 项（自我修正登记簿接入）：
  1 项引擎源级接线（require self-correction-ledger + 调 load/recurringPatterns
  + report.selfCorrectionLedger 落位 + 接入组件清单）+
  1 项产出与数据文件逐条一致（total/highSeverity/bySeverity/lessons 对得上
  self-corrections.json，防引擎编数字）+
  1 项 critical 排最前（等级排序，摘除 → corr-2026-002 不在首位）+
  1 项端到端渲染（generate→formatReport 出现登记簿段、severity 分布行、
  更正/教训结构、真实教训内容）+
  1 项段序纪律（登记簿段必须在信号热度分组之前）+
  1 项注入脚本源级（读 ~/.hermes/scripts/hf-cron-fetch.sh 验
  selfCorrectionLedger / 口径限定 / 不可用路径 / 旧版报告路径）+
  1 项模块计数口径（recurringPatterns 高危数含 critical））。
  v3.1 五轮反向验证全部精确失败：摘除引擎接线→4 条失败；摘除报告渲染→2 条；
  摘除 cron 注入段→1 条；恢复旧计数口径（严格 == high）→2 条；
  摘除等级排序→1 条。
  v3.0.0c 新增 9 项：注入脚本源级（commercialDiscrimination/口径限定/不可用
  路径/证据图例）/ 端到端渲染（商业段+主张句+证伪条件，Fed 公告不混入）/
  精度门（Fed 公告/播客/促销页脚/安全新闻整体挡外）/ 精度门不误杀（标题即
  主张的无摘要条目仍进辨别）/ 融资句式副词容忍 / 估值两种语序 / 竞品人类
  目标与 according to a study 归第三方调查 / claimSentence 透传 / 源级门
  存在性与旧触发器未复活。
  v3.0.0c 七轮反向验证全部精确失败：摘除注入段→1 条失败；摘除精度门→3 条；
  摘除 funding 副词组→3 条；摘除 claimSentence 透传→2 条；摘除竞品目标与
  survey 扩展→1 条；摘除估值语序→1 条；摘除报告段渲染→1 条。
  每项修复都做过反向验证（摘除修复 → 对应断言失败）：v2.17 实测摘除实体
  解码 → 1 条断言失败；摘除去重 → 3 条失败；摘除缓存新鲜度检查 → 1 条失败；
  minShared 降到 1 → 1 条失败（单专名误命中）；摘除报告段渲染 → 2 条失败；
  摘除 reasoningEngines 的 available 门 → 1 条失败。

**cron 注入脚本**（`~/.hermes/scripts/hf-cron-fetch.sh`，不在本仓、不受版本控制）
- 跑法：`FETCH=1 FETCH_BODY=1 node scripts/run-pipeline.js` → 提取摘要 → 心虫 think()
- 注入段（按序）：心虫 stateless 检查器 / live 条目 / 推演 summary /
  **低置信度守门（v3.2.2 补入，第 3.5 段，含口径限定与位置纪律——lowConfidenceGate
  自 v3 引擎起产出+渲染，注入脚本从未读，第七次同型断链；段序必须在推演阶段结论
  之前：限定先于被限定者到达 agent）** /
  推演阶段 /
  预测辨别 / **商业主张辨别（v3.0.0c 补入，第 6 段；KIND_CN 标签随形态库扩充：
  v3.2 产能/供给约束、v3.3 并购/交易过程，注入与报告同标签）** /
  **口径错位检测（v3.1.1 补入，第 6.5 段，含触发句与口径限定——此前引擎产出+
  报告渲染都有，注入脚本从未读，第五次同型断链）** /
  **外部预测基准（v2.17 新增，第 7 段）** /
  **自我修正登记簿（v3.1 新增，第 8 段，含口径限定）** /
  **预测校准与台账状态（v3.2.1 补入，第 8.5 段，含口径限定——ledgerStatus 与
  formulaAssessment 自 v2.13 起产出+渲染，注入脚本从未读，第六次同型断链）** /
  live 新闻宣称辨伪 / KB 条目数
- 专项域分区：F 编号明细前 20 条 + 全量按来源/按周聚合概览
- 排序必须用 `Date.parse` 比较，**不能用 `localeCompare`**：RFC 822 字符串
  （"Wed, 14 Oct 2026"）按字符串比会得到错误顺序，实测 10-19 的条目被排到第 6 位
- 改动前先备份：`cp ~/.hermes/scripts/hf-cron-fetch.sh{,.bak-$(date +%Y%m%d)}`
- [v2.17] 外部预测基准段注入纪律：新报告段必须同步进注入脚本，否则「引擎产出了
  但 agent 看不到」——v2.9 / v2.13 / v2.14 已踩过同型断链（字段失配 / 注入漏读 /
  重建丢字段）。注入内容含口径限定（不含群体概率、不回答、主题相邻非同题）
  与「N 条能匹配」回显
- [v3.0.0c] **同型断链再次实证（接口存在 ≠ 端到端到达）**：v3.0.0（f118603）的
  商业主张辨别段 10-22 落地，引擎产出 + formatReport 渲染都有，唯独 cron 注入
  脚本没读 proj.commercialDiscrimination——直到 10-24 审计才发现，报告文件里
  躺着、agent 完全看不到。教训升级为纪律：**新增报告段 ≠ 交付完成；端到端判据是
  「注入脚本里有没有、agent prompt 里能不能看到」**，不是「引擎产出了没有」。
  本轮已补注入段 + 源级断言（读 ~/.hermes/scripts/hf-cron-fetch.sh 验
  commercialDiscrimination），摘除注入段 → 断言失败。注意注入脚本不在本仓、
  不受版本控制，改它之前先 `cp` 备份（如 .bak-20261024）
- [v3.2.1] **第六次同型断链实证 + 纪律升级**：断链审计（最新 full-report 的
  projection 全字段 vs 注入脚本读取字段做差集）发现 15 个段「产出了、渲染了、
  注入从未读」，其中 ledgerStatus / formulaAssessment 实质内容最多——
  v2.13 方向转变的核心承诺「长期跟踪结算、建立校准曲线」的唯一数据出口没进
  agent prompt，且 v3.2 刚修好的 Brier 去重口径 agent 看不到。纪律升级：
  **断链审计必须是 projection 全字段 vs 注入脚本的系统性差集，每轮做**——
  v3.1.1 只补了当期发现的一段、没把全量差集固化为动作，老段又躺了两个版本。
  差集里每一段逐个确认「有意省略还是断链」，不许默认「渲染了就算交付」。
  注入新段必须同时带口径限定（小样本不具统计性/公式段是方法演示/引擎不自动
  结算）——没有限定的原始数字比不递更危险。本轮补第 8.5 段 + 3 项断言
  （注入源级/产出与台账文件一致防编数字/两段样本口径一致防回退），5 轮反向
  验证全部精确失败。
- [v3.2.2] **第七次同型断链实证 + 差集结案纪律**：v3.2.2 轮把 v3.2.1 留下的
  13 段差集逐段复核内容后确认 lowConfidenceGate 是断链不是有意省略——
  整体置信度 0.43 < 阈值 0.6、「该输出不得作为结论引用」的守门披露渲染在
  报告里但注入脚本从未读，agent 每轮在没有置信度门槛的情况下消费推演输出。
  纪律再升级（登记 corr-2026-012）：**差集审计的产出不是「修掉最严重的几段」
  而是「每一段都有结案记录」**——有意省略必须带理由（12 段结案清单：与 live
  条目重叠的 turningPoints、agent 可自行归纳的 risks/opportunities、与
  「引擎不生成建议」纪律冲突的 recommendations、被守门段覆盖的 confidence、
  共现非因果的 causalChains、静态先验的 crossDomainConduction、随源数波动的
  trendClassification、重复实现的 frontierModelSection 等），断链当轮修或排期；
  结案清单已进测试（组 3 断言：差集必须等于清单，新字段漏注入=断链复发，
  清单腐烂=接入后忘了移除）。另立**段序纪律**：元数据披露类段（守门/校准/
  登记簿）的限定必须先于被限定者到达 agent——本轮守门段放在 summary 之后、
  阶段结论之前，放后面等于没放。


### 历史升级与修复清单（v2.5 → v2.11）

已归档至 [references/upgrade-history.md](references/upgrade-history.md)，不在本文件重复。

归档原因：SKILL.md 会被 cron 每两小时全量注入 agent prompt（实测 52K 字符/轮），
历史清单对「本轮要写什么报告」无作用，只对「下次改这个技能时」有用。
按需加载：`skill_view(name, file_path='references/upgrade-history.md')`。

当前版本能力见 frontmatter description；常驻纪律见下方「关于「上次是假的」这类说法」。

### 关于「上次是假的」这类说法（本技能的工作纪律）

修复后不许用「之前整个是假的」给自己的修复抬价。判定标准只有一条：

**能不能写出一个可重跑的测试，让读者自己确认缺陷存在过、且已被修好。**

- 有测试 → 说「某一段是固定模板」，并指出测试名和运行命令。
- 没测试 → 只说「我观察到 X」，并说明我没能证明它是系统性的。
- 每次修复至少新增一个「缺陷复发即失败」的断言（如本技能的
  「旧固定模板句未复活」），否则下次优化时无法证明这次不是假的。

### 架构说明（关于版本号）

v2.4 → v2.5 不是架构重构（不构成大版本），而是「宣称能力 → 真实可运行」的
补 gates 修复 + 虚标纠正。按用户版号纪律，末位为补丁，此处取 x.0 是因为
用户可感知（pipeline 从跑不通到跑通），但它**不是**新辨别维度，
后续若加新辨别维度才算能力升级。

## 口径错位实例库（2026-10-12 增补，逐条有可重跑检索佐证）

一，Google 与 Constellation 的 3590 MW 不是单一新建核电合同：890 MW 来自 11 台现役反应堆升容（20 年购电协议，首台 2028 供电，全部到 2032），另 2700 MW 是不绑定具体电源的 15 年长期供应协议，不新建任何反应堆。出处：Google 新闻室与 Constellation 公告 2026-10-06，SiliconANGLE、Chosun、WSJ 转引。

二，RSA 新攻击是签名伪造，不是从公钥恢复私钥；只对无格式填充的 textbook RSA 纯签名有效；原始研究出自 2007 年，新的是实现；亚指数级而非多项式级；1024 位伪造实测耗 1380 CPU 核年。主流带填充的 RSA 实现不受影响。出处：Ars Technica 2026-09-24；Bruce Schneier 2026-09-28 纠偏；IACR ePrint。

三，Nature 新闻「世界首例让人变年轻的疗法已用于人体」标题需带限定：ER-100 一期临床首例给药的公司公告日期为 2026-06-09，终点是安全性与耐受性，主要完成时间 2027-05，全部完成 2032-03，不是疗效验证。出处：Nature d41586-026-01836-7；Life Biosciences 公告 2026-06-09；ClinicalTrials.gov NCT07290244。

四，量子纠错的 10 倍、30 倍全部是电路级仿真或外推，不是硬件实测。Google 团队 10 倍来自仿真内存实验，30 倍来自作者明言过大而无法仿真或解码的编码外推；IBM 288 物理量子比特保 12 逻辑量子比特为已发表研究结果，Quantum Starling 目标年 2029；相关论文均未经同行评审。出处：arXiv 预印本 2026-10-02；GCN 2026-10-08。

引用以上四类新闻时，必须在同一句内带上限定，不得只留完成态短语。

## References（历史记录与工作方法）

- [upgrade-history.md](references/upgrade-history.md) — **v2.5→v2.11 全部升级与修复清单 + v2.2 设计文档 + v2.5 时代状态描述**（2026-10-20 归档）。改这个技能前先读它，否则会重复踩已修过的坑
- [expansion-sessions.md](references/expansion-sessions.md) — 各版本增量扩展历史与来源获取模式
- [integration-patterns.md](references/integration-patterns.md) — 跨域来源集成与技能更新方法
- [gate-format-lessons-2026-09-16.md](references/gate-format-lessons-2026-09-16.md) — 门禁策略决策与已知误报维度清单
- [v0.5.0-upgrade-notes.md](references/v0.5.0-upgrade-notes.md) — v0.4.0 → v0.5.0 升级记录
