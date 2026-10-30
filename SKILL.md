---
name: human-future-v2
title: "人类未来 · 文明推演引擎 v3.26.0"
version: "3.26.0"
description: |-
  人类未来技能 v3.26.0 — 客户成效/ROI 主张进库（新辨别维度 customer-outcome，采用证据链第五形态）：2026-10-31 全池过堂（corr-2026-028 纪律：312 条 live 池逐桶过形态门、未命中条目逐条过堂）live 实证 OpenAI News「Credit Saison achieves 954% ROI in a ChatGPT Enterprise pilot」（2026-10-29 在窗，frontier_models 桶）——扩容前 24 种形态全部不命中，整条不进辨别。v3.11 立库 usage-metric 时把采用证据枚举成「趋势主张/具名部署/用量状态」三类、v3.12 扩成四类（+算力承诺），两轮都漏了**采用的结果**：客户用 AI 之后到底有没有成效（ROI/节省/生产率）——企业采购方最关心的证据形态、厂商案例研究里唯一带量化结果的句子。customer-outcome 两形态族（全部 live 实证驱动）：A 成效动词+量化值+成效名词（achieves 954% ROI / delivered 954% ROI，数值在前）；B 成效名词+of+量化值（an ROI of 954% / cost savings of $12 million，名词在前）。成效名词族：ROI / return on investment / (cost) savings / productivity (gain|improvement|uplift) / efficiency (gain|improvement) / cost reduction / payback；动词族只认成效达成动词（achieve/deliver/generate/realize/report/record/post/see）。精度设计（漏报比误报诚实、没有实证不扩模式）：① 必须「量化值+成效名词」相邻共现——live 实证 ServiceNow 8-K「most enterprises are still searching for AI's ROI, ServiceNow is the platform delivering it」含 ROI 名词与 delivering 动词但无任何数字，整个不命中（无量化值的 ROI 谈论不是可证伪主张，v3.6/v3.9/v3.10 同型纪律）；② 名词族不含 revenue/margin/income/orders（GOOGL「revenues increased 48% to $17.7 billion」是 demand 地盘）与 costs 裸名词（NVDA「35x lower cost」TCO 效率句，v3.9 已决议）；③ 动词族不含 found（survey-finding 地盘不抢）；④ 数值与名词之间不容长间隔（"$12 million in annual savings" 无 live 实证不进库）；⑤ has/have+成效名词（"the pilot has a 6-month payback"）无 live 实证不进库。本轮实测抓到并修复模式自身缺陷一处：A/B 两分支名词族 improvement/uplift 缺复数形态（improvements?）——「efficiency improvements of 18%」整句漏采，而夹具首版的 produced 又不在动词族，两层缺陷各自单独看都像设计如此（登记 corr-2026-048）。live 端到端（312 条池，EDGAR 缓存先删再跑）：pipeline exit 0、customer-outcome 精确命中 1 条（即 Credit Saison 条、0 误报）、判 证据不足/无出处(1)/推理 1/3（954% 命中 has-sample）/weak-evidence/decisionRelevant=false 不虚抬（厂商一手公告句式自身无归属词，v3.10 Uber 条同型）；其余 kind 计数逐一不变（零串台零丢失）；旧 24 种代表句式零漂移（测试钉住）。专属证伪路径（客户方公开确认或独立审计的 ROI 测算与主张值不符/下一期同口径自报值回落/第三方测算不支持/口径变化——统计窗口/基线年替换/成本项漏计/样本自选）+ market_claims 类目 + 报告与 cron 注入中文标签「客户成效/ROI 主张」全链就位。测试 485→494 项；8 轮反向验证全部精确失败（摘除模式整块→live 实证/端到端/计数/摘除证伪条件映射→1/摘除类目映射→1（源级）/摘除名词族单复数修复→召回夹具精确失败/摘除 formatReport KIND_CN→端到端/摘除注入 KIND_CN→注入源级/摘除量化要求→ServiceNow 句误入辨别/版本漂移→多处；每轮还原字节校验一致、收尾 494/0）。登记 corr-2026-048（模式族 A/B 两分支名词族单复数不同步+召回夹具动词/名词必须是族内真实成员，medium）；登记簿 46→47 条。仍在库外（如实）：in 间隔形态（"$12 million in annual savings"）、has/have+成效名词语法、produce 类未枚举动词——等有 live 实证再扩。
  历史：v3.25.0 — SEC EDGAR 一手信源扩容第二轮（公司名单 14→20 + 六家公司指引句式族进库，已知边界推进）：v3.24 基线 live 复测（2026-10-30）六家境内备案人（QCOM/ANET/CSCO/NOW/UBER/SHOP）各 3 份 Item 2.02 业绩 8-K 在采集窗口内，18 份备案数值指引 0 条进台账——指引句式全部在库外（corr-2026-032「在窗公司≠采到的指引」同型第五波）。本轮（全部 2026-10-30 SEC EDGAR 实抓原文驱动）：① 公司名单 14→20（半导体/网络设备/企业软件/平台经济四子域）；② extractGuidance 补三种句式族——form J 表格行/无动词区间（QCOM「Current Guidance Q4 FY26 Estimates 1 Revenues $9.7B - $10.5B」B 单位、CSCO「FY 2027 Guidance Revenue $18.0 billion to $18.2 billion」to 分隔、NOW「Subscription revenues $4,245 - $4,255」无单位、UBER「we anticipate Gross Bookings of $58.25 billion to $60.25 billion」of+to）、form K expect+名词+to be+X% to Y%（SHOP「Operating expenses as a percentage of revenue to be 33% to 34%」，只收纯 % 区间不抢 form B 点值与 form D in-the-range 地盘）、form L between-and 两形态（ANET「Non-GAAP diluted net income per share between $1.06 and $1.08」per-share 无单位 +「gross margin between approximately 62-63%」），form H 泛化 of approximately 与尾 % 分支（ANET 冒号 bullet「Revenue of approximately $3.3 billion」「operating margin of 48 - 49%」）；名词族补 operating margin/gross bookings/adjusted ebitda（不互套现有词，corr-2026-032 幂等纪律）；③ 期间模式补 Q 缩写+FY+两位年份（QCOM「Q4 FY26」）与反向全年（CSCO「results for fiscal 2027」锚词在年份前——旧 ANNUAL 模式全部要求年份在前，FY 列错配成 Q1 列头、全年指引按季度结算点到期撞 Q1 实际值判假 beat，v3.19 同型纪律）；④ 语义去重（factKey 归一：去空白+区间分隔符统一 to——MRVL「is expected to be 52.9% to 53.9%」form A 与表格行「52.9% - 53.9%」form J 是同一条指引两种句式，不重复登记两个义务）；⑤ value/tolerance 改从 m[0] 取并 trim+去尾标点（表格行 strip 后单元格间无句点，extendBack 把邻格名词与值桥进句子——CSCO live 实证 operating margin 行 metric 变成 gross margin、value 变成邻居营收区间；连带修正 v3.19「一句双 EPS」夹具：第二次 form G 匹配取到正确值 $25.50，GAAP/非 GAAP 分口径两条义务）；⑥ 结算层 parseRange 补裸美元区间（无 between/无 in the range of）与尾 %、parseMetricValue 补 B/M 单位，**无单位区间一律不猜**（NOW 表头单位跨句、ANET EPS between——默认 billion 差 1000 倍/9 个数量级，错配成 miss 比不结更坏）；⑦ claims 额度 90→170（live 实测 20 家 155 条，140 切尾 15 条——corr-2026-033 容量上限白名单同型第四次）。live 端到端：18 份备案指引 0→58 条（QCOM 15/CSCO 18/ANET 7/UBER 9/NOW 6/SHOP 3）、财报指引辨别 106→159 条、SEC EDGAR 备案 42→60 条（47 份含数值指引）、edgarClaimsTruncation null（158 条 ≤ cap 170 零切顶；90→170 因 140 live 实测切尾 15 条）；旧 14 家代表句式零漂移（form A/B/D/E/F/G/H+MU 表格字段逐一不变）。form K 的 live 逐字是「we expect: • ...; • Operating expenses as a percentage of revenue to be 33% to 34%;」冒号+分号 bullet——lookbehind 窗容忍（第一版词字符链跨不过冒号，live 0 条而手抄夹具全绿，corr-2026-047）。测试 475→485 项；6 轮反向验证全部精确失败（摘除名单六家→1/摘除 form J→3/摘除 form L→1/摘除无单位拒收→2/摘除反向全年→2/摘除语义归一→1；每轮还原字节校验一致、收尾 485/0）。登记 corr-2026-045（正则字面量与 new RegExp 模板的反斜杠层级不同+per-company catch 吞 ReferenceError，medium）/corr-2026-046（表格行无句点，extendBack 桥接邻格名词与值，medium）/corr-2026-047（测试夹具必须 live 逐字——手抄规范化走不到被测分支，medium）。仍在库外（如实）：UBER gross bookings/EBITDA、SHOP opex、QCOM EPS 实际值侧无行内单位或无对应抽取形态（pending）；NOW 区间单位在表头不猜；SHOP「Revenue to grow at a low-thirties percentage rate」文字增长率与「Stock-based compensation to be $150 million」点值（非 % 区间）不收（v3.6/v3.9 同型纪律）；CSCO「Non-GAAP $1.32 to $1.34」行无名词（strip 后表格行丢结构）漏采。
  历史：v3.24.0 - 新认知能力：ipo 证伪路径第二、三条接真数据（撤回 RW +
  定价 424B4，EDGAR submissions 登记记录）——v3.21 给 ipo-claim 立库时写下
  证伪路径「EDGAR 查无/撤回/定价时间表不符/挂牌后披露矛盾」四条，v3.23 只接了
  第一条（browse-edgar S-1 备案存在性核查）并把其余三条整批列为「由人工/下游
  agent 执行」；但 browse-edgar 的 type=S-1 只是 SEC 的一个端点——同一公司的
  submissions API（data.sec.gov）一次查询即返回全表单族登记记录，撤回（RW）与
  定价（424B4）都是可观测的公开登记事件（登记 corr-2026-044：「引擎不能执行」
  ≠「没有数据支撑」）。live 实证：Chobani S-1 2021-11-17 之后 RW 2022-09-02、
  Cerebras S-1 2024-09-30 之后 RW 2025-10-03 之后再备案 2026-04-17 之后 424B4
  2026-05-14、Mobileye Global S-1 2023-06-05 之后 424B4 2023-06-08。本轮
  edgar-ipo-collector 对匹配到（无匹配时首个过守卫）的公司按 CIK 查 submissions，
  取 365 天窗口内 RW/424B4 事件。精度纪律（不虚抬）：① 事件只作可观测上下文——
  不抬证据档、不改 verdict、不改推理分（备案动作主张的事实核心由 S-1 记录验证，
  事件不推翻已发生的备案；证伪解读由下游 agent 结合主张时点做）；② 按 CIK 查
  保证与 S-1 匹配同一实体（live 实证同名不同 type 在 browse-edgar 会解析到不同
  公司：Mobileye+type=S-1 → Mobileye Global Inc. CIK 0001910139，+type=RW →
  Mobileye B.V. CIK 0001607310）；③「查了但没有事件」与「查不到」分开（前者
  eventsAvailable=true 空事件，后者整体降级写明原因）；④ 窗口纪律与 S-1 一致
  （365 天外历史登记不算在办事件）。端到端：报告与 cron 注入的「EDGAR 核查」行
  带事件后缀（RW 撤回备案/424B4 定价备案在案）+「EDGAR 事件: 不可用」降级行 +
  汇总行流程事件计数（撤回 N / 定价 M）。live 端到端（312 条池）：1 条 ipo 主张
  核查、2 次 SEC 查询（1 browse-edgar + 1 submissions）、Anthropic S-1 在案且
  窗口内无 RW/424B4（无事件≠不可用）；零漂移 diff vs v3.23 基线：商业辨别段
  audited 22 条、byKind 逐一不变、byEvidence 与 decisionRelevant 14 条不变、
  MIT TR 条仍独立验证(4)/thin-reasoning；forecast 辨别 106 条与结算段（0 新
  结算/跳过 6、ledger brier 0.2377/样本 16）逐条零漂移。剩余边界（如实）：
  挂牌后披露矛盾仍无数据支撑，由人工/下游核对。测试 462→475 项；8 轮反向验证
  全部精确失败。登记簿 42→43 条（corr-2026-044）。
  历史：v3.23.0 新数据源 EDGAR S-1/IPO 备案核查（ipo 主张独立验证，v3.21 证伪
  路径第一条「EDGAR 查无/在案」落地）——
  2026-10-29 live 实证后果：MIT Tech Review「After weeks of frenzied speculation,
  Anthropic has filed its IPO prospectus.」被判 weak-evidence/无出处(1)——而
  Anthropic, PBC（CIK 0002130357）确实于 2026-10-26 向 SEC 提交了 S-1（accession
  0001628280-26-067168，browse-edgar 实测），主张的事实核心经一手登记记录完全
  成立。本轮接入新数据源 edgar-ipo-collector（browse-edgar 公司检索 + atom 解析
  + 365 天在办窗口 + 公司名 token 包含守卫 + 120ms 间隔 + 单轮查询预算）：对
  ipo 主张提取公司名候选查 EDGAR，**备案动作形态**（files/filed/filing/submits +
  S-1/IPO/public debut）且窗口内真匹配到 S-1 族备案的证据档升独立验证(4)——
  该档自 v3.0.0c 起只认文本标记，立库 22 个版本首次被真实数据触发。live 端到端
  （312 条池，零漂移 diff：商业辨别段 audited 22 条、byKind 逐一不变，唯一变化
  即 MIT TR 条 无出处(1)/weak-evidence → 独立验证(4)/thin-reasoning/
  decisionRelevant=true，matched 记录带公司/CIK/表单/日期/accession）：forecast
  辨别 106 条与结算段（0 新结算/跳过 6、ledger brier 0.2377/样本 16）逐条 diff
  零漂移；报告与 cron 注入渲染「EDGAR 核查: ✅」行与汇总行。精度纪律（不虚抬）：
  文书主体（「S-1 Takeaways」类内容主张）与承销牵头（「Goldman to Lead IPO」类）
  只记 EDGAR 在案作上下文不抬档（内容/承销商身份需 424B4 核对，本轮不采）；
  未匹配≠已证伪（公司名匹配是启发式）；查询失败整体降级 available=false，不把
  「查不到」扮成「查无」。撤回/定价/挂牌三条证伪条件仍无数据支撑，留已知边界。
  同轮维护：汇总计数抽为 summarizeCommercial 单一事实来源（验证后重跑结果必须
  重算汇总，否则报告头部与逐条自相矛盾）；报告池描述补六桶（v3.22.1 只改了注入
  脚本漏改渲染层）。测试 449→462 项；9 轮反向验证全部精确失败。登记簿 41→42 条。
  历史：v3.22.1 候选池白名单漏桶修复（维护级）；v3.22.0 执法/诉讼行动主张进库
  （新辨别维度 legal-action）；v3.21.1 corr-2026-025 结案（ma 豁免统一）+
  usage-metric 扩 calls；v3.21.0 IPO/上市过程主张进库（新辨别维度）；
  v3.20 PLTR 冒号+bullet 期望式指引形态；v3.19 AVGO/DELL/PLTR 书面数值指引形态；
  v3.18 RSS 前瞻主张独立额度；v3.17 表格式全年 capex 实际值抽取；v3.16 GOOGL
  FY2026 capex 残废条目修复；v3.15 全年实际值抽取+annual key 配对；v3.14 META
  CFO 评论式指引形态；v3.13 财报指引结算指标扩展；v3.12 算力基建承诺/规模主张
  （新辨别维度）；v3.11 用量/牵引度指标主张+引号切分修复；v3.10 一手信源桶接入
  +部署规模主张；v3.9 价格下调主张；v3.8 监管行动主张；v3.7 专家/机构判断主张；
  v3.6 成本/价格信号主张；v3.5.1 结算链路修复（维护）；v3.5 财报指引自动结算；
  v3.4 财报指引+SEC EDGAR；v3.3.1 survey-finding 精度修复（维护）；v3.3 并购/
  交易过程主张；v3.2.2/3.2.1 断链修复；v3.2 产能/供给约束主张；v3.1.1 口径错位
  精度修复；v3.1 接入 self-correction-ledger；v3.0.0c 商业段断链修复；v2.17 接入
  GJOpen；v2.13 停止假推演。
---
---

# 人类未来 · 文明推演引擎 v3.26.0

> 数据采集（RSS 真联网 + 可选正文增强 + 外部预测基准 GJOpen）→ 心虫 stateless 检查器 → 三年推演引擎。
> 当前状态与实测数字见下一节，历史版本记录见 references/upgrade-history.md。

---

## 当前状态（v3.26.0 实测）

以下数字全部来自 live 实跑。v3.26.0 轮（2026-10-31，EDGAR 缓存先删再跑）：
`FETCH=1 FETCH_BODY=1 node scripts/run-pipeline.js` pipeline exit 0、**客户成效/
ROI 主张进库（新辨别维度 customer-outcome）**——全池过堂（corr-2026-028 纪律，
312 条池逐桶过形态门、未命中条目逐条过堂）live 实证 OpenAI News「Credit Saison
achieves 954% ROI in a ChatGPT Enterprise pilot」（2026-10-29 在窗）扩容前 24 种
形态全部不命中：采用证据链第五形态（趋势主张/具名部署/用量状态/算力承诺之外
「采用的结果」）。live 端到端：customer-outcome 精确命中 1 条（即该条、0 误报）、
判 证据不足/无出处(1)/推理 1/3（954% 命中 has-sample）/weak-evidence/
decisionRelevant=false 不虚抬（厂商一手公告句式自身无归属词）；商业辨别段
audited 21 条（其余 kind 计数逐一不变，零串台零丢失）；模式库计数 24→25；
forecast 辨别与结算段随到期门自然推进（本轮未动 forecast 路径）。同轮修复模式
自身缺陷：A/B 两分支名词族 improvement/uplift 补复数形态（improvements?——live
夹具「efficiency improvements of 18%」整句漏采，登记 corr-2026-048）。测试
485→494 项；8 轮反向验证全部精确失败。版本号理由：新辨别维度（新 kind + 两族
形态 + 专属证伪路径 + 端到端标签）且用户可感知（报告「商业主张辨别」段首次出现
「类型: 客户成效/ROI 主张」行）= x.0。
（v3.25.0 轮（2026-10-30，EDGAR 缓存先删再跑）：
`FETCH=1 FETCH_BODY=1 node scripts/run-pipeline.js` pipeline exit 0、**公司名单
14→20**（QCOM/ANET/CSCO/NOW/UBER/SHOP 六家新增——live 复测各 3 份 Item 2.02
在窗、18 份备案数值指引 0 条进台账，corr-2026-032 同型第五波）后 SEC EDGAR
备案 42→60 条（47 份含数值指引）、财报指引辨别 106→159 条、18 份备案指引
0→58 条（QCOM 15/CSCO 18/ANET 7/UBER 9/NOW 6/SHOP 3）、edgarClaims-
Truncation null（158 条 ≤ cap 170 零切顶；90→170 因 140 实测切尾 15 条）、
已结算与 pending 随到期门自然推进。六家句式族全部 live
实证驱动：QCOM 表格行 B 单位区间+Q4 FY26、ANET 冒号 bullet（of approximately/
尾 %/between 无单位）、CSCO FY2027 Guidance 表（to 分隔+反向全年 results for
fiscal 2027）、NOW 无单位表格行区间（单位在表头，结算侧不猜）、UBER
anticipate+of+to 区间（gross bookings/adjusted ebitda 名词族）、SHOP expect+to
be+X% to Y%（operating expenses——live 逐字「we expect: • ...; • Operating
expenses as a percentage of revenue to be 33% to 34%;」冒号+分号 bullet，
lookbehind 窗容忍，corr-2026-047）。精度纪律：actuals 两列表格（无区间符号）、
raising/grew-to 句、文字增长率（low-thirties percentage rate）零误收；MRVL 双
句式语义去重（同指引两种句式不重复登记）；无单位区间一律不猜（默认 billion 差
1000 倍/9 个数量级——错配成 miss 比不结更坏）。旧 14 家代表句式零漂移（form
A/B/D/E/F/G/H+MU 表格字段逐一不变，测试钉住）。v3.24.0 轮（2026-10-29）实跑
数字：`FETCH=1 FETCH_BODY=1 node scripts/run-pipeline.js` pipeline exit 0、312 条
live 信号（business 48 + economy 46 +
frontier_models 142 + sec_filings 42 + tech 22 + humanities 12）；**新认知能力：
frontier_models 142 + sec_filings 42 + tech 22 + humanities 12）；**新认知能力：
ipo 证伪路径第二、三条接真数据**（撤回 RW + 定价 424B4，EDGAR submissions
登记记录）——v3.23 立档时把「撤回/定价/挂牌后披露」整批列为「由人工/下游
agent 执行」，但 browse-edgar 的 type=S-1 只是 SEC 的一个端点：同一公司的
submissions API（data.sec.gov）按 CIK 一次查询即返回全表单族登记记录
（登记 corr-2026-044「引擎不能执行 ≠ 没有数据支撑」——写已知边界时要区分
「没有数据源」与「没接数据源」）。live 实证（browse-edgar + data.sec.gov
实抓逐字）：Chobani Inc. S-1 2021-11-17 → RW 2022-09-02（289 天内同在
365 天窗口）、Cerebras Systems S-1 2024-09-30 → RW 2025-10-03 → 再备案
2026-04-17 → 424B4 2026-05-14、Mobileye Global S-1 2023-06-05 → 424B4
2023-06-08、Mobileye B.V. RW 2018-02-07（窗口过滤负例）。edgar-ipo-collector
对匹配到（无匹配时首个过守卫）的公司按 CIK 查 submissions，取 365 天窗口内
RW/424B4 事件。精度纪律（不虚抬）：① 事件只作可观测上下文——不抬证据档、
不改 verdict、不改推理分（备案动作主张的事实核心由 S-1 记录验证，事件不
推翻已发生的备案；证伪解读由下游 agent 结合主张时点做，引擎不代判）；
② 按 CIK 查锚定 S-1 匹配到的同一实体（live 实证同名不同 type 在 browse-edgar
会解析到不同公司：Mobileye+type=S-1 → Mobileye Global Inc. CIK 0001910139、
+type=RW → Mobileye B.V. CIK 0001607310）；③「查了但没有事件」与「查不到」
分开（前者 eventsAvailable=true 的空事件，后者整体降级写明原因）；
④ 窗口纪律与 S-1 一致（365 天外历史登记不算在办事件）。端到端：报告与
cron 注入的「EDGAR 核查」行带事件后缀（RW 撤回备案/424B4 定价备案在案）+
「EDGAR 事件: 不可用」降级行 + 汇总行流程事件计数（撤回 N / 定价 M）。
live 端到端（312 条池）：1 条 ipo 主张核查、2 次 SEC 查询（1 browse-edgar
+ 1 submissions）、Anthropic, PBC S-1 在案且窗口内无 RW/424B4（无事件≠
不可用，eventsAvailable=true）；零漂移 diff vs v3.23 基线：312 池各桶逐一
不变、商业辨别段 audited 22 条、byKind 逐一不变（expert-judgment:1/ma:1/
funding:4/price-cut:1/regulatory-action:1/compute-infra:3/usage-metric:3/
demand:3/adoption:4/ipo:1）、byEvidence 与 decisionRelevant 14 条不变、
MIT TR 条仍独立验证(4)/thin-reasoning；forecast 辨别 106 条与结算段
（0 新结算/跳过 6、ledger brier 0.2377/样本 16）逐条零漂移。剩余边界
（如实）：挂牌后披露矛盾（挂牌后定期报告与 S-1 主张逐条对账）仍无数据
支撑，由人工/下游 agent 执行。测试 462→475 项；8 轮反向验证全部精确失败。
登记簿 42→46 条（corr-2026-044/045/046/047，medium）。
（v3.23.0 轮：pipeline exit 0、312 条 live 信号（business 48 + economy 46 +
frontier_models 142 + sec_filings 42 + tech 22 + humanities 12）；**新数据源：
EDGAR S-1/IPO 备案核查**（v3.21 立库 ipo-claim 时写下的证伪路径「EDGAR 查无/
撤回/定价时间表不符/挂牌后披露矛盾」四条里第一条接上真数据，登记 corr-2026-043
「证伪路径写成可观测条件 ≠ 引擎能执行该检查」）——live 实证 v3.22.1 轮判
weak-evidence/无出处(1) 的 MIT Tech Review「After weeks of frenzied speculation,
Anthropic has filed its IPO prospectus.」，经 browse-edgar 公司检索匹配到
**Anthropic, PBC（CIK 0002130357）2026-10-26 提交的 S-1**（accession
0001628280-26-067168）：备案动作形态主张的证据档升**独立验证(4)**——该档自
v3.0.0c 起只认文本里的「independently verified by X」标记，立库 22 个版本首次
被真实数据触发；判定变 thin-reasoning/推理 0/3（抬档不抬推理分）/
decisionRelevant=true，matched 记录（公司/CIK/表单/日期/accession）进报告与
cron 注入的「EDGAR 核查: ✅」行。零漂移 diff（v3.22.1 基线 vs v3.23.0 实测）：
商业辨别段 audited 22→22、byKind 逐一不变（legal-action:2/funding:4/ma:1/
price-cut:1/regulatory-action:1/compute-infra:3/usage-metric:3/demand:3/
adoption:3/ipo:1），证据等级分布唯一变化即 无出处 11→10 + 独立验证 0→1、
decisionRelevant 11→12；forecast 辨别 106 条逐条一致、rssClaimsTruncation
seen=21/cut=1/cap=20 一致；结算段 0 新结算/跳过 6、ledger brier 0.2377/样本 16/
pending 77 零变化（核查不碰台账）。精度纪律：文书主体（「Anthropic S-1
Highlights Rising Payment Costs」类）与承销牵头（「Goldman Sachs to Lead
Anthropic IPO」类）主张同样匹配到 Anthropic 的 S-1，但只记「· 在案」上下文、
**不抬证据档**（内容与承销商身份需 424B4/备案正文核对，本轮不采）；未匹配
（如 OpenAI 无 EDGAR 备案）不抬级也不判假——「EDGAR 查无」是本类主张的证伪
条件之一，公司名匹配是启发式，不等于已证伪；EDGAR 查询失败（网络/解析）整体
降级 available=false 并写明原因，ipo 主张按原证据档判定，不把「查不到」扮成
「查无」。同轮维护（不单独涨号）：汇总计数抽为 summarizeCommercial 单一事实
来源（辨别后重跑结果必须重算汇总——否则报告头部「决策相关 N 条/证据等级分布」
与逐条结果自相矛盾，正是引擎自己要抓的口径错位）；formatReport 的候选池描述
补六桶（v3.22.1 只同步了注入脚本、漏了渲染层）；ipo-claim 正则拆出命名子形态
IPO_FILING_ACTION_RE（备案动作子形态的单一事实来源，辨别器与核查器共用，
防两处正则漂移）。测试 449→462 项；9 轮反向验证全部精确失败。登记簿 41→42 条
（corr-2026-043，medium）。
（v3.22.1 轮：pipeline exit 0、312 条 live 信号（business 48 + economy 46 +
frontier_models 142 + sec_filings 42 + tech 22 + humanities 12）；商业辨别
候选池白名单漏桶修复（corr-2026-027 同型断链：tech/humanities 采集了但辨别器
从不看）的 live 端到端——全池测量（corr-2026-028 纪律「未命中条目过堂」：
312 条池逐桶过形态门，候选桶未命中 256 条逐条过堂）live 实证 tech 桶 22 条里
**2 条真实商业主张**被四桶白名单挡在辨别外：MIT Tech Review「After weeks of
frenzied speculation, Anthropic has filed its IPO prospectus.」（ipo-claim
形态：filed + IPO prospectus——v3.21 立库时只过了 business/frontier_models
两桶的堂，没过「全部 live 桶」的堂）与 Ars Technica「Enterprises keep buying
software upgrades that IT thinks will make things worse  Survey of 2,018 IT
heads at big firms…」（adoption + 第三方调查(3)）；PICK_BUCKETS 四桶→六桶
（+tech 6 / +humanities 4，排在 economy 之后，business 第一优先纪律不变；
humanities 12 条本轮 0 命中、同型补齐防同类漏桶）后全池复测：商业辨别段
audited 22→24 条含 ipo:1/adoption 新条目（MIT TR 条判 weak-evidence/无出处(1)/
推理 0/3/decisionRelevant=false 不虚抬——科技媒体转述无 S-1 文书引用；Ars 条判
thin-reasoning/第三方调查(3)/推理 0/3/decisionRelevant——有描述有调查口径，
与标题-only 条不同级），其余 kind 计数逐一不变（零串台零丢失），渲染/注入
上限 30 未触顶。同轮精度修复（维护级，被桶修复暴露的 live 实证）：
has-counterexample 的 yet 只认让步位（句首/标点后）——MIT TR 主张上下文
「the clearest picture yet of…」与 ORCL funding 条「We have not yet initiated
the at-the-market equity portion」的 yet 是时间副词（「迄今」）不是反例
让步，却把两条主张的推理分各自虚抬 1 分（corr-2026-024 短词歧义家族第四次
实证：Apollo/poll → demo/democracy → debut/but → yet）；修复后 ORCL 条
推理 2/3→1/3（verdict 仍 factual——证据档先行于推理分）、MIT TR 条 1/3→0/3
不虚抬；forecast 辨别 106 条与结算段逐条 diff 零漂移（结算幂等 0 新结算/
跳过 6/pending 60、ledger brier 0.2377/样本 16 不变）；模式库计数 24 不变
（扩桶不加 kind）。测试 439→449 项；5 轮反向验证全部精确失败（摘除 tech 桶
→引擎级/源级/渲染多条/摘除 humanities 桶→源级（精度门是负向断言，摘桶后负例「更真」抓不到，源级断言才是它的钉子）/摘除 yet 让步位约束
→live 实证+时间副词三形态+ORCL 影响面/摘除注入脚本池描述更新→注入源级/
版本漂移→多处）。登记 corr-2026-042（候选池白名单是逐桶的活结论——每轮
全池测量必须输出全部六桶的形态门命中分布，不只当轮新形态的桶；v3.10 修
sec_filings/frontier_models 漏桶时同型只过了四桶的堂）；登记簿 40→41 条。
版本号理由：断链修复+同轮精度修复=末位补丁（维护级，非新辨别维度——
用户铁律「修 bug 算维护」，不拿断链修复报升级）。
（v3.22.0 轮：pipeline exit 0、312 条 live 信号（business 48 + economy 46 +
frontier_models 142 + sec_filings 42 + tech 22 + humanities 12）；执法/诉讼行动
主张进库（legal-action，新辨别维度）的 live 端到端——全池测量（corr-2026-028
纪律「未命中条目过堂」：当日较早的 288 条池 262 条未命中逐条过堂，business
桶唯一新 kind 候选是两条执法/诉讼主张（v3.8 已知边界「执法行动无工具名词」的
live 实证；扩库后复跑的本轮 312 条池精确命中该 2 条、0 误报）：TechCrunch
AI「Parents sue OpenAI, alleging GPT-4o coached their daughter off seizure
medication」与 The Information「Malaysian Authorities Seize $12 Million Worth
of AI Chips in Smuggling Crackdown」——扩容前 23 种形态全部不命中。legal-action
两形态（诉讼动作 sue/sued/suing+目标；执法动作 执法主体+执法动词）进库后全池
复测精确命中 2 条（即该两条、0 误报——会计 charges/in charge/charged with/
医疗 seizure/Fed-ECB/播客/规则提案 26 句精度回归全部不命中），其余 kind 计数
逐一不变；两条 live 实证进商业辨别段均判 weak-evidence/无出处(1)（标题-only
媒体转述无法院文书引用，不虚抬）/推理 0-1/3（Malaysia 条 has-sample=$12M）/
decisionRelevant=false；事件型 no-quantity 豁免第四次扩展到 legal-action
（无数字诉讼句不判「不可证伪: 无量化」，豁免不抬推理分）；forecast 辨别 69 条
与结算段逐条 diff 零漂移（结算幂等 0 新结算/跳过 6/pending 60、ledger brier
0.2377/样本 16 不变）；商业辨别段 audited 22 条含 legal-action:2（v3.21.1 轮
19 条是 v3.21.1 池，波动如实记录，本轮未触顶 30 上限）。同轮维护（不单独涨号）：
去重三处 v3.21 重复粘贴注释；历史版本断言全量同步 3.22.0。
（v3.21.1 轮：pipeline exit 0、288 条 live 信号；ma 事件型 no-quantity
豁免统一（corr-2026-025 结案）+ usage-metric 扩 (monthly|weekly|daily)
calls 的 live 端到端——全池测量（corr-2026-028 纪律「未命中条目过堂」）
253 条未命中逐条过堂，无新 kind 候选（sec_filings 未命中 28 条全是财报
指引/无数值指引备案，forecast 路径已覆盖；frontier_models 未命中 144 条
逐条过堂唯一候选是 Retell 用量句），经名词族/动词族/单位组三处扩库后
全池复测 usage-metric 命中 3→4（精确 +1 即 Retell 条、0 误报），其余
kind 计数逐一不变；Retell 条进商业辨别段判 weak-evidence/无出处(1)/
推理 2/3（has-sample=100M/calls + has-counterexample=while）/decisionRelevant
（推理≥2 既定语义）；ma 标题-only 豁免的 live 效果由 Instacart/Ramp 原句
夹具钉住——本轮 live 池唯一 ma 条（Onsemi in Talks to Buy Startup for
About $1 Billion）自带金额不经过豁免路径，判 weak-evidence/无出处(1)/
推理 1/3 不虚抬；结算层复跑幂等 0 新结算、跳过 4、pending 25；forecast
辨别 69 条（v3.18 RSS 独立额度生效后构成：非结构化前瞻主张 23 条含 3 条
截断披露 + 财报指引 50 条；分组渲染与两组截断披露均在报告与注入脚本就位）；商业辨别段 audited 19 条（288 条池；v3.21 轮 26 条是
v3.21 池，波动如实记录，本轮未触顶））；
（v3.21.0 轮：pipeline exit 0、IPO/上市过程主张进库的 live 端到端——
v3.3 曾把 IPO 整体排除在模式库外，理由「估值形态已覆盖该条」，该否定式覆盖
决议未经全池测量腐烂三个版本（corr-2026-038/039 同型第四次实证）：
2026-10-26 一天内 **7 条** Anthropic S-1/IPO 过程主张整个在库外——
① live 逐字七条：TechCrunch AI「Anthropic's IPO filing reveals its strategy
for keeping enterprise customers hooked」（S-1 披露交叉销售数据）、
「Anthropic officially files for its public debut」（"has officially filed
for an IPO, revealing soaring revenue…"）、The Information「Anthropic S-1
Highlights Rising Payment Costs」「Anthropic's S-1 Takeaways: From Giant
Compute Commitments to Complex Lock-Ups」「Anthropic Publicly Files S-1
for Its Planned IPO」「Goldman Sachs to Lead Anthropic IPO」与 Transformer
News 简报内句「Anthropic is reportedly planning to publicly file for an
IPO as early as today」；
② ipo-claim 三形态（备案动作 files/filed/filing/submits+S-1/IPO/public
debut；文书主体 S-1/IPO+filing/takeaways/highlights 名词形态；承销牵头
lead/underwrites+[^.!?]{0,40}+IPO/offering/listing/debut）——不认裸
IPO 名词（ahead of IPO 归估值地盘）、动词形态无 live 实证不进库（MIT TR
修辞疑问句收紧）、不抢融资/并购地盘；
③ 事件型 no-quantity 豁免扩到 ipo（v3.8 同型：证伪靠备案/定价/挂牌可观测
事件，豁免只摘 no-quantity 不抬推理分）；public-filing 证据档补 \bS-1\b
窄标记（S-1 句归公开财报/公告(3)，无文书引用的 Goldman 承销转述留无出处(1)
不虚抬）；专属证伪路径（EDGAR 查无/撤回/定价时间表不符/挂牌后披露矛盾）
+ capital_flow 类目；
④ live 端到端：商业辨别段 22→26 条含 ipo:7（business 6 + frontier_models
1；S-1 句判 thin-reasoning+决策相关，简报转述/reportedly 句判 weak-evidence
不虚抬）；同轮精度修复（维护）：competitive 动词族摘除裸 leads?（两条 live
误报——团队管理句整条出池、承销句改判 ipo；Artificial Analysis 真命中保留）、
has-counterexample 补 \b 词边界（debut 的 but 子串不再虚抬反例分，
corr-2026-024 同型第三次实证）；模式库计数 22→23；渲染/注入上限 30 未触顶。
（v3.20.0 轮：pipeline exit 0、PLTR 冒号+bullet 期望式指引形态进库的
live 端到端——v3.19 全池过堂补了 AVGO/DELL/PLTR 的书面数值指引（form E/F/G），
但没过「已命中公司的其它段落还有没有漏」的堂（corr-2026-039）：PLTR 三份在窗
8-K 的 Outlook 段**季度指引 bullet 整个在库外**，Q1/Q2/Q3 2026 营收与
adjusted income 指引全部漏采（corr-2026-032「在窗公司≠采到的指引」同型第四波）：
① form H 冒号+bullet 期望式（PLTR live 逐字：「For Q1 2026, we expect: •
Revenue of between $1.532 - $1.536 billion. • Adjusted income from
operations of between $870 - $874 million.」——expect+冒号+bullet 列表，
首 bullet 带动词、后续 bullet 靠 [^:] 隔段 lookbehind 追上；名词前容忍
{0,2} 修饰词；「to in excess of $X」指点值不收、无 expect 动词的冒号节头
不收、截断残值（正文被裁的 "$4"）不收）；
② grew-to 实际值形态（PLTR live 逐字：「• Revenue grew 85% year-over-year
and 16% quarter-over-quarter to $1.633 billion」——增长动词+同比%+to+
绝对值，四个旧营收形态全部不命中；分部守卫 lookbehind 挡 U.S./U.S.
commercial/U.S. government 三条分部行；间隔窗排除 bullet 防跨 bullet 桥接；
先到即本财季）；
③ live 端到端：forecast 辨别 95→104 条（86 EDGAR + 18 RSS，edgarClaims
Truncation=null 零切尾）；PLTR FY2026Q1 区间 $1.532-1.536B vs 实际
$1.633B、Q2 区间 $1.797-1.801B vs 实际 $1.935B 两条真实结算（均 beat
带外，台账 92→101：PLTR 02-02×5/05-04×2/08-03×2，Q3 指引按到期门
pending，同代码复跑幂等 0 新登记）；42 份备案新旧代码逐条 diff 纯新增
零漂移（41 家不变，仅 PLTR 02-02 因新 lookbehind 到达 FY 节更远 bullet
而 +2 条全年指引）；claim 额度 80→90（live 实测 84>80，砍掉的正是本轮
新增 PLTR 尾部条目——v3.14/v3.19 同型纪律第三次实证：新形态的主张总落在
ticker 序尾部，涨额度必须与扩库同轮做）。
（v3.19.0 轮：pipeline exit 0、AVGO/DELL/PLTR 书面数值指引形态进库的
live 端到端——v3.4 起 SKILL.md 状态描述写着「MSFT/GOOGL/AVGO/CRWV/IBM/DELL/PLTR
只在电话会口头给指引或无数值」，2026-10-27 全池过堂（corr-2026-028 纪律）live
实证该描述腐烂三个版本：三家 9 份在窗 8-K 正文都有书面数值指引（含可结算区间），
extractGuidance 四条旧形态全部不命中、零条进台账（corr-2026-032「在窗公司≠采到
的指引」同型第三波）：
① form E 名词式区间（DELL live 逐字：「Second-quarter FY27 revenue expected
between $44.0 billion and $45.0 billion」——指标名词在前、无 is/are；
form A 要 is/are expected to be、form B/D 要动词在前，三条旧形态全不命中）；
② form F 提升式区间（PLTR live 逐字：「We are raising our revenue guidance
to between $8.150 – $8.158 billion」——en-dash 区间语法旧正则三种全部
不命中；「to 71% growth」与「to in excess of $X」不收）；
③ form G 名词式点值（AVGO/DELL live 逐字：「Fourth quarter fiscal year
2026 revenue guidance of approximately $34.8 billion」——名词+guidance
of+数值无谓语动词；点值无容差不结算但登记，与 AMD opex 点值同型）；
④ 期间形态四位 + lookbehind 两处（连字符季度词/全年词+两位财年 FY27、
冒号节头全年「For full year 2026:」、季度词+fiscal year 全拼；ANNUAL_
PERIOD_PATTERN 与 ANNUAL_HEADER_RE 补季度词 lookbehind——零漂移 diff 实证：
不加则 AVGO 季度指引被 fiscal year 锚词抢成全年、ORCL Q2 EPS 指引被
「Q2 FY 2027:」冒号节头抢成全年，dueOn 错位会撞 Q2 实际值 key 判假 beat）；
⑤ actuals 年份前置标题锚（DELL「announces financial results for its
fiscal 2027 second quarter」）+ 名词相邻全年守卫（Record full-year
revenue 不进财季 key）+ 同（期间,指标,数值）去重（DELL 一句双 EPS 的
错位记录：form G extendBack 把第一个指引短语吞进第二个匹配的句子）；
⑥ 结算侧 parseRange/rangeM 双側同构补 between+en-dash 美元区间。
live 端到端：forecast 辨别 79→95 条（77 EDGAR + 18 RSS，edgarClaims
Truncation=null 零切尾）；DELL FY2027Q1 区间 $34.7-35.7B vs 实际
$43.8B、Q2 区间 $44-45B vs 实际 $47.0B 两条真实结算（均 beat 带外，
台账 76→92：AVGO×3/DELL×6/PLTR×6/ORCL 重述×1，2 条新增即结算，同代码
复跑幂等 0 新登记）；42 份备案新旧代码逐条 diff 全部纯新增零漂移；
md 报告结算段出现两条 DELL beat、财报指引组出现 AVGO/DELL/PLTR 指引
（另有 48 条未显示按 v3.16 披露纪律）。已知边界（如实）：DELL Q3
FY27 指引只在表格形态（"Third-Quarter Guidance Q3FY27 Revenue $ 49.0
81 %"——form C 要 ± 容差，点值表格不收，无结算需求）；PLTR 增长效率
指引（"raising our full-year revenue guidance to 71% growth"）与
"in excess of" 指点值不收（单边下界登记成点值会扭曲义务语义）；
[v3.20 已推进] PLTR colon-bullet 季度指引（form H）与 grew-to 营收
实际值已进库，FY2026Q1/Q2 区间指引两条真实结算（beat 带外），Q3 指引
dueOn 2026-11-14 按到期门 pending；PLTR 按千位上报（Amounts in
thousands），FY2026 全年实际值到期（2027-02）时的千分位单位折算是
下轮候选；PLTR 02-02 备案标题语序「fourth quarter and fiscal year
ended」四季期间锚全不命中、actuals 为空（无 Q4 2025 在窗指引，无结算
需求，如实留界——Q1/Q2 结算的实际值由 05-04/08-03 备案提供）；
[v3.20 新增候选] IBM 文字数字区间（"in the range of four-to-five
percent"——拼写数字非阿拉伯数字，值解析需词-数转换，无 live 实证不扩）、
DELL 2026-02-26
2026-02-26 备案标题句的 "results" 词被正文裁掉，年份前置锚匹配不到、
actuals 为空（无 Q4 FY2026 在窗指引，无结算需求，如实留界）；
ORCL FY2027 全年营收句内带 non-GAAP EPS 致 settleMetric 取错族
（v3.15/v3.16/v3.17 连续三轮的下轮候选「指标族名词优先」，本轮未动——
该条无容差不可结算所以无错误结局）。
（v3.18.0 轮：pipeline exit 0、RSS 前瞻主张独立额度的 live 端到端——
v3.14 起白纸黑字的已知边界「RSS 与 EDGAR 共用 claims.length>=20 断点，EDGAR
占满额度后 RSS 前瞻主张被挤压，后续轮次候选：RSS 独立额度」本轮按 live 实证
修复（探针实测：62 条辨别结果 = 61 条 EDGAR 指引 + **仅 1 条** RSS——v2.13
核心承诺「辨别他人关于未来的主张」对媒体/博客/备案正文的前瞻表述整个失效，
Meta $95B 融资计划、Oracle 2026 年不发债、EU AI Act 义务句式全部被挤掉）：
① 非结构化前瞻主张独立额度 RSS_CLAIMS_CAP=20（EDGAR 额度 70 不动），
seen/cut/cap 截断披露同型落地（v3.10/v3.11/v3.14 纪律：超限不静默切尾）；
② 同轮精度配套（corr-2026-037，live 探针抓到的 latent 缺陷）：
FORWARD_LOOKING_BOILERPLATE 守卫——「undertakes no intent or obligation」
免责声明含 obligation to 命中 COMMITMENT，live 原文里该句还与后续描述拼成
一句（0001730168-26-000011：「…these projections, whether  8-K Item 2.02
业绩发布，2026-03-04 提交…」无标点间隔）带 2026-03 时间 token，或截断在
plans to 上走 form B（0001769628-26-000220），不挡则解锁额度后每轮把法律
套话登记进台账污染 Brier 样本（商业路径 v3.10 早有同型守卫，forecast 路径
从来没有）；③ 结果分组渲染（财报指引组 + 非结构化前瞻主张组，各自截断披露）
+ cron 注入同步分组——不分组则 RSS 主张追加在 61 条 EDGAR 之后全被渲染
上限切掉，「辨别了但看不见」。live 端到端：forecast 辨别 62→79 条
（61 条结构化指引 + 18 条 RSS 路径，其中 1 条被辨别器判 earnings-guidance）；
7 条新可结算主张进台账（ledger 69→76：NVDA/AMZN×2/META×3/IBM×2 的备案
正文前瞻句，dueOn 2026-12-31），同代码复跑幂等 0 新登记；61 条结构化指引/
71 条财季 actuals/结算段（0 新结算/跳过 4：AMD 点值无容差×2 + MU 口径
未限定歧义×2/pending 41）/商业辨别 21 条逐条 diff 零漂移；md 报告出现
「### 非结构化前瞻主张」分组与两组截断披露。已知边界（如实）：RSS 池
超 20 条时超额段被挡且披露（本轮 17-18 条未触顶）；免责声明守卫只挡
「命中句自身含标记」的句子，同条目后续句继续参与抽取（真主张常在
boilerplate 之后，不连坐）。
（v3.17.0 轮：pipeline exit 0、表格式全年 capex 实际值抽取的 live
端到端——v3.16 白纸黑字的已知边界「GOOGL capex 全年实际值在现金流量表
（purchases of property and equipment），全年实际值形态族不收表格式陈述——
FY2026 capex 指引到期时可能无对账依据（下轮候选）」本轮按 live 实证推进
（SEC EDGAR 实抓四家 Q4 备案原文驱动）：extractAnnualActuals 增补表格式
形态——现金流量表标题锚（STATEMENTS OF CASH FLOWS）+ 全年列标记
（Year/Twelve Months/Fiscal Year Ended，GOOGL Q2 的「Year To Date」与
META Q3 的「Nine Months Ended」天然拒绝）+ **仅 Q4 备案**（AMZN Q1 live
实证：Q1-Q3 的 Twelve Months Ended 是 TTM 列且 TTM 列年份与标题财年相同，
期间守卫 quarter===4——live 端到端实测抓到的误收，corr-2026-036）+ 列对齐
（数据行数值个数驱动：4 列=2 季度+2 全年、2 列=纯全年，其它列数不解析；
全年列=后两列，表头年份 token 匹配标题财年——AMD 表头年份序 2025 2024
2025 2024，财年 2025 命中第 3 列 $974M 不是末列 $636M；MRVL FY2026=Year
Ended January 31, 2026，财年标签与日历年终年同数）+ 单位只认百万（千分位
报表防错标度 1000 倍）+ ≥1000 折算 billion 与指引带同量纲；双来源去重：
叙事口径优先（META live 实证：叙事「Capital expenditures, including
principal payments on finance leases, were ... $72.22 billion」与报表行
「(69,691)」口径不一致——两个不同值落同一 annual key 会判歧义跳过，把可
结算指引变成跳过比漏报更糟）。live 端到端：GOOGL FY2025 $91.447B/AMD
FY2025 $974M/MRVL FY2026 $354.1M/AMZN FY2025 $131.819B 四家全年 capex
全部抽中并进报告产物（newsData.sec_filings[].annualActuals）；NVDA 发布
不含现金流表如实漏报；GOOGL FY2026 capex 指引（dueOn 2027-02-14）按到期门
保持 pending——不硬结；信号池各桶条数/62 条 forecast 辨别/61 条指引/财季
actuals 逐条 diff 零漂移；结算段幂等 0 新结算/跳过 4（AMD 点值无容差×2 +
MU 口径未限定歧义×2）/pending 41、ledger 69 条零变化；同代码复跑幂等
（商业辨别段 21 条是 RSS 池轮换后的稳定值——改前轮 22 条里 OpenAI News 的
Uber 条目转出采集窗，与 EDGAR 抽取改动无关，复跑两轮 21 条逐条一致）。
已知边界（如实）：FCF 对账表 TTM 列形态（GOOGL live 实证 5 列）仍不收；
MU Q4 备案的资本开支行标签是「Investments in capital expenditures, net」
（非 GAAP 对账表 5 列），行标签族只认 purchases of property and
equipment——MU 无 capex 指引所以无结算需求；ORCL FY2027 全年营收句句内带
non-GAAP EPS，settleMetric 句级推导取错族（metric 与 value 错位）——该条
无容差不可结算所以无错误结局，下轮候选：指标族名词优先；
（v3.15.0 轮：pipeline exit 0、300 条 live 信号、全年实际值抽取
+ annual key 配对的 live 端到端——四家在窗 Q4 备案的全年实际值全部抽中并
进报告产物（newsData.sec_filings[].annualActuals）：NVDA Q4-FY2026 全年
营收 $215.9B、AMD Q4-FY2025 营收 $34.6B+毛利率 50%+营业利润 $3.7B+EPS
$2.65、MRVL Q4-FY2026 营收 $8.195B+EPS $3.07(GAAP)/$2.84(非GAAP)、AMZN
Q4-FY2025 营收 $716.9B+营业利润 $80.0B；META Q4-2025 备案（窗口外）实抓
验证同年抽出营收 $200.97B/费用 $117.69B/capex $72.22B；全部 Q1-Q3 备案零
全年实际值（双值句/全年标记句只在 Q4 备案出现）；台账 9 条 annual=true
全年指引（META FY2026 费用/capex×6 + NVDA FY2027 全年税率×3，dueOn
2027-02-14/03-17）按到期门保持 pending——不硬结；forecast 辨别 61 条与
上轮逐条一致、结算段幂等 0 新结算/跳过 4（AMD 点值无容差×2 + MU 口径
未限定歧义×2）/pending 40、ledger 68 条零变化（零串台零丢失）；同轮修复
AMD Q4-FY2025 全年营收漏进财季 key（营收路径补全年值守卫）；商业辨别段
25 条（live 池波动，未动商业形态库）；
（v3.14.0 轮：pipeline exit 0、312 条 live 信号、META CFO 评论式指引形态进库的
live 端到端——三份 META 备案（10-21/07-29/04-29）抽到 10 条量化区间指引
（营收 Q4 $73-76B/Q3 $61-64B/Q2 $58-61B、全年费用 $175-179B/$165-169B/
$162-169B、全年 capex $135-145B/$130-145B/$125-145B、Q4 税率 15-17%），
10 条全部登记进台账；META FY2026Q2 营收区间 $58-61B vs 实际 $60.80B
**带内命中**（引擎第一条 META 结算，Q3/Q4 营收与全年费用/capex/税率按
到期门与年度实际值边界 pending）；NVDA 全年税率指引×3 期间归位
FY2027 全年（旧代码错记 FY27Q1，corr-2026-033）；GOOGL capex 与 AMZN
net-sales/opinc 指引同轮补登（旧 claim 额度 40 的尾部截断修复，见下）；
台账已结算 11→12 条、去重后 Brier 样本 11→12 个义务（brier 0.2635、
兑现率 0.5=6/12）；最终代码复跑幂等 0 新结算、跳过 4 条（AMD 点值
无容差×2 + MU 口径未限定歧义×2）、pending 40；forecast 辨别 61 条
（旧 claim 额度 40 切尾修复后 61 条 EDGAR 指引全进，无截断披露——
额度 70）；商业辨别段与 forecast 段其余部分和上轮一致（本轮只动
EDGAR 指引抽取/结算链，未动商业形态库）；
（v3.13.0 轮：pipeline exit 0、288 条 live 信号（专项大模型域 162）、
财报指引结算指标扩展的 live 端到端——到期未结算 18 条 → 新结算 7 条
（MRVL FY2027Q1/Q2 毛利率×4 全带内命中、MRVL EPS×2 一命中一低于带、
AMZN FY2026Q2 营业利润 beat 带外），台账已结算 11→18 条、去重后 Brier
样本 11 个义务（brier 0.2548、兑现率 0.455=5/11）；最终代码复跑幂等
0 新结算、跳过 4 条（AMD 点值指引无容差×2 + MU 双列 EPS 口径未限定
歧义×2——live 实证口径分支生效）、pending 25；商业辨别段 27 条、forecast
辨别 41 条、byKind 12 种与 v3.12 轮逐一一致（零串台零丢失））；
（v3.12.0 轮：pipeline exit 0、300 条 live 信号（business 48 + economy 46 +
frontier_models 142 + sec_filings 42 + tech 22 + humanities 12）、商业辨别段 23→27 条
含新维度算力基建承诺/规模 4 条（byKind 新增 compute-infra:4——NVDA 备案
「Announced strategic partnerships ... to mobilize over $500 billion of
third-party capital for the buildout of AI infrastructure」与「Strengthened
a collaboration with CoreWeave to accelerate the buildout of more than 5
gigawatts of AI factories by 2030」均判 推理单薄/公开财报/公告(3)/推理 1/3、
decisionRelevant；CRWV 备案「accelerate the build-out of more than 5 GW of
AI factories by 2030」判 结构完整/公开财报/公告(3)/推理 2/3、
decisionRelevant；NVIDIA 博客（Kazakhstan/Firebird）「export license for
45,000 NVIDIA Grace Blackwell GPUs」判 证据不足/无出处(1)/推理 1/3、
不虚抬——厂商博客句式自身无归属词；公开财报/公告证据档 8→11 条；
decisionRelevant 10→13 条；原 12 种 kind 计数逐一不变，零串台零丢失；
hf-cron-fetch.sh 注入段 agent 可见「类型: 算力基建承诺/规模主张」；渲染/
注入上限同步 25→30，audited 27 未触顶、截断披露行就位；forecast 辨别
41 条与上轮逐条一致——本轮只加商业形态，未动 forecast 路径）；
v3.11.0 轮：pipeline exit 0、300 条 live 信号（business 48 + economy 46 +
frontier_models 142 + sec_filings 42 + tech 22 + humanities 12）、商业辨别段 20→23 条
含新维度用量/牵引度指标 2 条（byKind 新增 usage-metric:2——MSFT 备案
「Microsoft 365 Copilot reached over 30 million paid seats」判 结构完整/
公开财报/公告(3)/推理 2/3、decisionRelevant（has-sample+has-comparison，
对照来自命中句后 2 句上下文的 "up 27% year-over-year"）；GOOGL 备案
「Gemini models now process 22 billion API tokens per minute and the
Gemini App has 950 million monthly active users」判 推理单薄/公开财报/
公告(3)/推理 1/3、decisionRelevant——厂商在 SEC 备案里自报的席位数/月活/
token 吞吐首次进商业辨别，下一期备案同指标可对账；公开财报/公告证据档
5→8 条；GOOGL「paid subscriptions has now reached 350 million」
（YouTube/Google One 驱动）与 FLI/Suno subscribers 句被精度纪律挡在库外；
hf-cron-fetch.sh 注入段 agent 可见「类型: 用量/牵引度指标主张」；渲染/
注入上限同步 20→25/16→25，audited 23 未触顶、截断披露行就位）；
v3.10.0 轮：pipeline exit 0、300 条 live 信号（business 48 + economy 46 +
frontier_models 142 + sec_filings 42 + tech 22 + humanities 12）、商业辨别段 10→20 条
含新维度部署规模 2 条（byKind 新增 deployment-scale:2——OpenAI News「Uber is
rolling out ChatGPT Work to more than 30,000 employees」与「ChatGPT Ads expands
to 26 new countries as over 100,000 advertisers have used the platform」，均判
证据不足/无出处(1)/推理 1/3、不虚抬——厂商一手公告句式自身无归属词，等价名方
确认或第三方报道交叉验证）与 SEC 备案量化主张 4 条（GOOGL「Google Cloud saw a
continued increase in customer demand as revenues increased 48% to $17.7 billion」
判 推理单薄/公开财报/公告(3)/推理 1/3、decisionRelevant——一手备案量化主张，
证据档首次被真实财报触发；ORCL funding $50B 与 PLTR 成交数据判 factual/
公开财报/公告(3)；公开财报/公告证据档 1→5 条；MU/CRWV forward-looking 免责声明
boilerplate 被守卫挡住不进辨别）；hf-cron-fetch.sh 注入段 agent 可见
「类型: 部署规模主张」；
v3.9.0 轮：pipeline exit 0、321 条 live 信号、商业辨别段 9→10 条
含新维度价格下调 1 条（byKind 新增 price-cut:1——LWiAI #343 简报内句
「Anthropic launches Claude Fable 5.1 and says it's up to 45 percent cheaper
for agentic work」判 证据不足/无出处(1)/推理 1/3、不虚抬——简报转述的厂商
自述降价，等价目表或第三方价格跟踪交叉验证；hf-cron-fetch.sh 注入段 agent
可见「类型: 价格下调主张」；300 条覆盖审计轮与 321 条端到端轮实测均只命中
该 1 条）；
v3.8.0 轮：pipeline exit 0、312 条 live 信号（business 48 + economy 46 +
frontier_models 142 + sec_filings 42 + tech 22 + humanities 12）、商业辨别段 8→10 条
含新维度监管行动 2 条（byKind 新增 regulatory-action:2——Treasury 提案条判
推理单薄/公开财报/公告(3)/推理 0/3、decisionRelevant；LWiAI 简报内句判
证据不足/无出处(1)/推理 0/3、不虚抬，hf-cron-fetch.sh 注入段 agent 可见
「类型: 监管行动」；该轮 byKind 全量 expert-judgment:1 / regulatory-action:2 /
ma:2 / adoption:1 / valuation:1 / cost-signal:1 / capacity:1 / funding:1）；
v3.7.0 轮：商业辨别段 7→8 条
含新维度专家/机构判断 1 条（byKind 新增 expert-judgment:1，该条判 推理单薄/
第三方调查(3)/推理 0-1/3，decisionRelevant，hf-cron-fetch.sh 注入段 agent 可见
「类型: 专家/机构判断」）；v3.6.0 轮：商业辨别段 6→7 条含新维度成本/价格信号 1 条；
v3.5.1 轮：42 条 EDGAR 备案进 live、新结算 4 条；
v3.5 轮：28 条 EDGAR 备案、7 条结算；v3.3.1 轮 270 条 live 信号；
v3.3.0 轮 258 条、v3.2.2 轮 270 条、v3.1.1 轮 270 条、v3.1 轮 258 条），不是宣称值。
v2.17/v3.0.0c 轮次数字（248-258 条 live、36.7 秒、基准冷启动）见 frontmatter 历史记录。

**财报指引自动结算层（v3.5 新能力，v3.5.1 链路修复）**
- 定位：兑现 v2.13 核心承诺「到期结算 Brier」对最硬预测类（earnings_guidance）的
  第一次落地。v3.4 登记 33 条、审计实测 15 条到期 0 条结算（结算逻辑整个缺失）。
- [v3.5.1 断链修复] 结算元数据透传链：v3.5 实测 47 条 earnings_guidance 的
  settlement.ticker 恒为 null、fiscalYear/quarter 恒缺失——辨别结果从不带这三个
  字段，「元数据随新条目落账」从落地起没工作过，全部流量挤在句匹配兜底路径。
  三字段已透传（r.ticker / r.guidance.fiscalYear / r.guidance.quarter），新登记
  条目元数据完整；测试钉住「落账后的字段值非空」，不只字段存在。
- [v3.5.1 召回补强] 实际值抽取覆盖：MRVL（全部备案，标题 "of Fiscal Year 2027"）、
  MU（9 月备案，"FOURTH-QUARTER AND FULL-YEAR 2026"）、AMZN（全部备案，标题无
  年份走正文 "quarter ended June 30, 2026" 锚 + 紧邻 "Net sales increased 20%
  to $200.6 billion" 营收形态）。精度回归：AMZN 亮点段 operating income 与 AWS
  年化 run rate 不得被当成总净销售额（宽 gap 名词组扩 sales 的误配已回退，
  sales 只认紧邻形态）。
- 实际值抽取：`edgar-collector.extractActuals` 从同一份 EX-99 抽「上一财季实际值」
  （过去时 was/were/of，与指引的期望时态对立）；期间取自标题句（三种语序 +
  v3.5.1 通用季度+年份形态 + quarter-ended 正文锚）。指标覆盖：v3.5 起两个
  头条（营收 of/was/were + AMZN increased 紧邻形态 / 毛利率 was/were）→ v3.13
  五个族（+ MRVL 冒号 bullet 营收 "Net Revenue: $2.739 billion" / MRVL 标题
  bullet 毛利率 "53.1% GAAP gross margin" 无连接词形态 / EPS "or $X per
  diluted share" / AMZN 合并营业利润，分部行用 lookbehind 挡）→ v3.14 六个
  族（+ META 亮点 bullet 营收 "• Revenue – Revenue was $64.60 billion"，
  实际值句在汇总表之后、超出 lead=1600 窗口，搜索窗放宽到前 8000 字符、
  五段紧邻结构保精度）。每条实际值
  带口径标记（gaapBasisOf），每（指标族,口径）只收第一个匹配（先本季、后
  全年；同口径重复陈述去重），全年值守卫（FULLYEAR_GUARD_RE + 句边界截断
  窗口，corr-2026-030）。[v3.15] 营收三形态（主形态/sales-increased/冒号）
  补 notFullYear 守卫——旧代码只有毛利率/EPS/营业利润过守卫，AMD Q4-FY2025
  live 实证「For the full year 2025, AMD reported record revenue of $34.6
  billion」的全年营收被当成财季实际值索引进 (AMD|2025|4|revenue)（无 Q4
  营收指引所以没造成错结算，但查找表里躺着错事实）。
- [v3.15] 全年实际值抽取（`extractAnnualActuals`，已知边界推进）：全年指引
  （annual=true，quarter=null）的对账依据此前整个缺失——v3.14 边界原话
  「全年实际值在 Q4 备案的『季度 and 全年』双值句里，抽全年值+annual key
  索引是后续轮次候选」。两种形态（全部 2026-10-27 live 实抓驱动）：① 双值句
  （META「Total costs and expenses were $35.15 billion and $117.69
  billion ... for the fourth quarter and full year 2025,
  respectively」）——季度在前全年在后，取第二个值；② 单值全年句四形态
  （NVDA「For fiscal 2026, revenue was $215.9 billion」/ AMD 一句多指标
  「reported record revenue of $34.6 billion, gross margin of 50%,
  operating income of $3.7 billion, ... diluted earnings per share of
  $2.65」/ MRVL「Net revenue for fiscal 2026 was」+ GAAP 前缀 EPS「or $X
  per diluted share」双口径 / AMZN 尾部「in 2025」——同比从句先剥，剥除
  字符类带小数点容差）。精度纪律：句内全年标记年份必须等于备案标题财年
  （Q4 备案刚结束的财年）；含季度标记的句子只走双值形态；未来时态守卫
  （expect/anticipate ... to be 是指引不是实际值）；双百分号 respectively
  （NVDA 全年毛利率 71.1% and 71.3%）无法归属口径整句跳过；FCF/经营现金流
  不在结算指标族。扫描窗前 8000 字符（live 实测六家全年句全部在 @600-@3100）。
- [v3.15] annual key 配对（settleEarningsGuidance）：全年实际值按
  `${tk}|${fy}|null|[口径 ]指标` 建索引（口径化 key + 裸 key 双登记，与财季
  路径同规则）——全年指引元数据 quarter 恒 null，keyBase 天然落在 null 段；
  与财季 key 不冲突（extractActuals 抽不到季度期间时 actuals 为空）。证据
  来源 annual 感知：全年结算的证据必须是**真的提供了全年实际值**的备案
  （annualActuals 非空），旧条件按 fiscalYear 匹配会命中该公司任一 FY 备案
  （META FY2026 有三份），证据指向没提供该值的备案。
- 指引抽取覆盖：v3.4 起三种句式（名词+is/are expected to be / expects 在前
  / 表格相邻）→ v3.14 四种（+ META CFO 评论式「expect <期间/所有格间隔>
  <指标> to be in the range of $X-Y billion / between X-Y%」：动词在前、
  间隔词≥1（含连字符——"GAAP and non-GAAP"）、必须有区间标记；间隔词≥1
  与 form B 零重叠）→ [v3.19] 七种（+ form E 名词式区间：DELL live
  「Second-quarter FY27 revenue expected between $44.0 billion and
  $45.0 billion」——名词在前无 is/are、expected 紧邻名词（只容忍可选
  is/are）、between-and 区间；+ form F 提升式区间：PLTR live
  「We are raising our revenue guidance to between $8.150 – $8.158
  billion」——raise 动词+名词与 guidance 间 {0,3} 修饰语+{0,40} 间隔、
  必须有 to between 区间标记（增长率指点与 in excess of 不收）；
  + form G 名词式点值：AVGO/DELL live「Fourth quarter fiscal year 2026
  revenue guidance of approximately $34.8 billion」——名词+guidance
  of+数值，点值登记不结算）。[v3.20] 八种（+ form H 冒号+bullet 期望式：
  PLTR live「For Q1 2026, we expect: • Revenue of between $1.532 -
  $1.536 billion. • Adjusted income from operations of between $870 -
  $874 million.」——expect+冒号+bullet 列表，首 bullet 带动词、后续
  bullet 靠 [^:] 隔段 lookbehind 追上（节头必含冒号，隔段窗跨不过节；
  V8 嵌套懒量化两迭代实测走不通，冒号隔段是可靠结构）；名词与 of 间
  容忍 {0,40} 修饰语、名词前容忍 {0,2} 修饰词；in excess of 指点值
  与无 expect 动词的冒号节头不收；数值部分要求单位或第二区间腿——
  采集器正文截断产生的残值（"of between $4"）不入库）。区间语法：
  between X and Y / X% to Y% →
  v3.14 补连字符美元区间（$73-76 billion 两端同单位）、单百分号区间
  （between 15-17%）与双百分号 between-and（NVDA 全年税率 16.0% and
  18.0%）→ [v3.19] 补 between + en-dash 美元区间（PLTR「$8.150 –
  $8.158 billion」，rangeM 与 earnings-settlement parseRange 双側同构，
  v3.16「只改一侧」教训）。期间形态：[v3.19] 补四位——连字符季度词+
  两位财年（Second-quarter FY27，readPeriod <100 +2000 展开）、连字符
  全年词+两位财年（Full-year FY27）、冒号节头全年（For full year 2026:，
  PLTR 期间在句外节头、锚词跨不过 bullet）、季度词+fiscal year 全拼
  （Fourth quarter fiscal year 2026）；ANNUAL_PERIOD_PATTERN 与
  ANNUAL_HEADER_RE 同轮补季度词 lookbehind（v3.16 ANNUAL_YEAR_NOUN_RE
  同型：不加则季度指引被年度形态抢成全年——AVGO/ORCL live 零漂移实证）。
  [v3.19] 同（期间,指标,数值）去重：一句双指引（DELL「EPS guidance
  of $24.37 and non-GAAP EPS guidance of $25.50」）的 extendBack 会把
  第一个短语吞进第二个匹配的句子产出错位记录；AVGO 亮点段+Outlook
  段同值两句合同一事实。actuals 侧：[v3.19] 年份前置标题锚
  （RESULTS_YEARFIRST_RE——「results for its fiscal 2027 second
  quarter」，DELL live；捕获组 1=年份 2=季度词与四季形态相反、单独
  赋值）+ FULLYEAR_GUARD_RE 补名词相邻全年标记（full-year revenue
  等——META 双值句的 "and full year 2025, respectively" 在数值之后
  不相邻，季度值照常收）。
- 指引 claim 额度（project-future buildForecastDiscrimination）：v3.14 起
  40→70 且超限披露 seen/cut/cap——live 实测 61 条 claim（form D 新增
  META 10 条 + NVDA 全年税率 3 条后），旧上限把 ticker 顺序尾部的
  META/AMZN/GOOGL/ORCL 整批切掉（辨别了但看不见/登记不了/结算不了）。
  [v3.19] 70→80：form E/F/G 进库后 live 实测 77 条（AVGO×3/DELL×6/
  PLTR×6/ORCL 重述×1 新增 16 条），70 会切掉 ticker 顺序尾部 7 条
  （v3.14 同型纪律第二次实证）。
  [v3.20] 80→90：form H（PLTR colon-bullet 季度指引）进库后 live 实测
  84 条（+7：PLTR 02-02×5/05-04×2/08-03×2），80 把 ticker 顺序尾部的
  4 条整批切掉——被砍的正是本轮新增的 PLTR 条目（v3.14/v3.19 同型纪律
  第三次实证：新形态的主张总落在 ticker 序尾部，涨额度必须与扩库同轮做）
  （v3.14 同型纪律第二次实证；live 端到端 edgarClaimsTruncation=null
  零切尾）。
  [v3.18] RSS 前瞻主张独立额度 RSS_CLAIMS_CAP=20——v3.14 提额后 RSS 路径
  仍共用 claims.length>=20 断点，EDGAR 61 条占满后 RSS 每轮仅 1 条进辨别
  （live 实证 62 条 = 61 EDGAR + 1 RSS），v2.13 核心承诺对媒体/博客/备案
  正文整个失效；两路径各自额度、各自披露（rssClaimsTruncation seen/cut/cap
  同型），EDGAR 优先只影响拼接顺序不再决定 RSS 存活。同轮加
  FORWARD_LOOKING_BOILERPLATE 守卫（免责声明 boilerplate 不是预测，
  corr-2026-037）与结果分组渲染（财报指引组 + 非结构化前瞻主张组各自
  上限与截断披露——不分组 RSS 主张全被渲染上限切掉）。
- 结算判据（earnings-settlement.js）：outcome=实际值是否落在指引容差带内
  [guided ± tolerance]（区间指引落区间内）。单位感知：$+%=相对、$+$=绝对、
  %+bps=百分点、%+%=百分点。方向（beat 超带上沿 / below 低于带下沿 / in-band）
  单独记进 evidence，不混入布尔——不得把 beat 读成「公司没做到」。
- 保守性（全有测试）：只结有容差/区间的；(ticker,财季,指标) 唯一实际值才结
  （GAAP/非GAAP 多值判歧义跳过，不设法规避）；到期才结（dueOn 未到不提前结）；
  只碰 outcome===null 的条目（幂等，不重复结算）。
- live 实测：18 条正确结算（v3.5 轮 7 条 + v3.5.1 轮 4 条 + v3.13 轮 7 条：
  MRVL FY2027Q1/Q2 毛利率×4 全带内 [GAAP 52.1-53.1% vs 53.1%、58.25-59.25%
  vs 58.9%、51.4-52.4% vs 52.1%]、MRVL EPS×2 [$0.37±$0.05 vs $0.33 命中、
  $0.31±$0.05 vs $0.04 below]、AMZN FY2026Q2 营业利润 $20-24B vs $27.5B
  beat 带外）。v3.13 前 11 条（v3.5 轮 7 条 + v3.5.1 轮 4 条：MRVL FY2027Q1/Q2
  营收 $2.400B±5% vs $2.418B、$2.700B±5% vs $2.739B 均带内命中；MU FY2026Q4
  $50B±$1B vs $54.23B、AMZN FY2026Q2 $194-199B vs $200.6B 均 beat 带外。
  NVDA/AMD/MU 营收被 actual 超出带上沿→beat/带外，毛利率命中→带内；MU Q3
  $33.5B±$750M vs $41.46B 经复核是 HBM 超级周期真实 21% beat）。MRVL
  GAAP/非GAAP 毛利率经 matchAll 修正后正确判歧义跳过（首版单 match 会把非GAAP
  指引错配到 GAAP actual，测试抓出并修复）。
- [v3.5.1] 跳过理由归因诚实：按 id 内 accession 反查当期采集窗口，区分「句式
  漂移（窗口内有备案但 claim 匹配不上）」与「备案滑出采集窗口（最近 3 份之外）」，
  窗口大小引用 MAX_8K_PER_COMPANY 常量不写死。live 实测 3 条跳过：2 条句式
  漂移（MRVL income 指引，claim 是旧版抽取结果）+ 1 条 GAAP/非GAAP 歧义。
- [v3.5.1] 去重口径第三处同型修复：证据 key 补 dueOn（v3.4 给文本 key 加过、
  漏了证据 key）——同公司跨财季结算曾被并成一个义务（11 条已结算去成 5 条，
  Brier 样本失真），修复后 9 条；结算证据来源改按 actualPeriod 匹配提供实际值
  的备案（不再 find(ticker) 拿最新备案链接）。
- [v3.13] 口径标记与结算指标族（指引侧）：settleMetric 从**指引句**推导
  （每股句→diluted eps，名词级 metric 对 EPS 是 income 与实际值侧配不上），
  gaapBasis 从**原文**指标名词前 30 字符限定词推导（14 字符回扩窗口会把句首
  "GAAP and non-GAAP" 切成 "non-GAAP"，句子里口径已丢；表格形态一律未限定
  ——列头 "GAAP (1) Outlook Non-GAAP (2) Outlook" 离名词一两百字符不进句子，
  MU 双列指引表实测，从回看窗推会误标）。两字段随辨别结果透传
  （forecast-discriminator）+ 落账（v3.5.1 三字段同型断链的再一次：少了
  这两个，结算层只能用名词级 metric 配对、口径丢失则同财季同指标天然多值）。
- [v3.13] 口径分 key 配对（结算层）：实际值查找表 (ticker|财季|[口径 ]指标)
  → 值数组；口径候选序 BASIS_FALLBACK（gaap→[gaap, gaap+non-gaap, '']、
  non-gaap→[non-gaap, gaap+non-gaap, '']、gaap+non-gaap→四态、''→['']），
  先用元数据口径再回落双口径同值形态最后裸 key；裸 key 多值=口径未限定
  歧义，判跳过不设法规避（MU 双列指引表 live 实证：两条 EPS 指引均走
  此路径）。口径化实际值同时登记裸 key——无限定口径的旧元数据查找行为
  不变（NVDA 双口径同值 "both 75.0%" 只余一条照常结算）。
- [v3.13] 句索引三 key × 备案作用域：逐字归一句（历史默认）/ 前 60 字符
  （容忍 claim 截断）/ 名词对齐 key guidanceNounKey（旧抽取把 "GAAP" 切成
  "P" 的 artifact claim 仍可配对）× 两个作用域（claim id 内备案号优先——
  同一句指引出现在连续两份备案且指引不同财季时，全局 first-registered-wins
  会把旧 claim 解析到新财季去，AMD live 实证；备案滑出窗口的残废条目靠
  全局句兜底）。元数据解析改为**当期指引句反推优先**、持久化 settlement
  兜底（颠倒顺序：句元数据带指标族+口径，旧 settlement.metric 是名词级归一）。
- [v3.13 断链修复 corr-2026-031] settle() 证据落账：project-future 传的
  metric/gaapBasis 被 settle() 的白名单式 evidence 构造静默丢弃（只写
  sources/summary/settledBy）——dedupeSameObligation 证据 key 读的正是
  这两个字段，「同财季不同指标不并成一个义务」在 live 数据上永不生效。
  已补落账（旧结算不补字段，去重 key 对旧条目走空后缀、分组不变——v3.13
  轮 7 条新结算落账于修复前，evidence 无这两个字段，如实记录不补造）。
- [v3.13] 同义务去重证据 key 补 metric+口径维度：同财季的营收/毛利率
  (GAAP)/毛利率(非GAAP)/EPS 是四个义务，旧 key（类目+dueOn+证据源）把它们
  并成一个（实测 7 条新结算被并成 1 个，Brier 样本失真）。
- 端到端：引擎 settleEarningsGuidance → report.guidanceSettlement → formatReport
  「财报指引结算」段 → cron 注入第 6.5 段（跳过分类含歧义/滑出/漂移三档；
  v3.13 歧义措辞同步为「GAAP/非GAAP多值或口径未限定」，限定句加「口径
  **一致**才配对（MRVL 毛利率/EPS 分口径各判各的）」。
- 已知边界（如实）：v3.5.1 前登记且指引备案已滑出窗口的残废条目无法反推元数据，
  诚实留待后续轮次（re-fetch 修复候选）；EPS/营业利润指标 v3.13 已推进
  （MRVL/MU/AMZN live 实证可结算）；**opex 指引全是点值无容差**
  （NVDA/MRVL/MU live 实证，"approximately $X billion"），相关指引保持
  pending/无容差跳过；**全年实际值 v3.15 已抽**（META Q4-2025 全年营收
  $200.97B/费用 $117.69B/capex $72.22B live 实证，annual key 配对成立），
  但台账内全年指引到期时间都在未来（META FY2026 due 2027-02-14、NVDA
  FY2027 全年税率 due 2027-03-17），按到期门保持 pending——不硬结；
  **NVDA 全年毛利率双百分号 respectively**（"GAAP and non-GAAP gross
  margins were 71.1% and 71.3%, respectively"）两个口径不同值、respectively
  归属逻辑未实现，整句跳过（错归口径比漏报危险）；**FCF/经营现金流不在
  结算指标族**（META/MU 双值句都有该指标，无指引可配对故不收）；
  **税率实际值在备案亮点段无可直读句**
  （META Q4 税率区间 15-17% 与 NVDA 全年税率区间已登记待结算，亮点段
  只有对比句式没有干净的 effective tax rate was X% 句）；**GOOGL FY2026
  capex 残废条目 v3.16 已修复**（年份在名词前的全年形态 ANNUAL_YEAR_NOUN_RE
  进库 + X-to-Y 区间语法 + capex 指标族归一，台账按 FY2026 全年区间指引
  重登记，dueOn 2027-02-14），**表格式全年 capex 实际值 v3.17 已抽取**
  （现金流量表「Purchases of property and equipment」行：标题锚 + 全年列
  标记 + 仅 Q4 备案 + 列对齐取标题财年列——GOOGL FY2025 $91.447B live
  实证）——剩余库边界：FCF 对账表 TTM 列形态（5 列）不收；MU 的行标签族
  是「Investments in capital expenditures, net」（非 GAAP 对账表）不在库
  （MU 无 capex 指引，无结算需求）；
  **ORCL FY2027 全年营收指引 settleMetric 取错族**（live 实证：「Guidance
  for Full FY 2027 ... total revenue to be at least $90 billion, and
  non-GAAP EPS to be at $8.10」——句级推导被句内 EPS 带跑，metric 与
  value 错位；该条无容差不可结算所以无错误结局，下轮候选：指标族名词
  优先）；**isRange 透传断链 v3.16 已修**（guidanceStruct 从 v3.4 起不漏
  isRange，区间指引持久化 settlement 恒退化——备案滑出窗口后区间指引
  到期永远无法结算，corr-2026-035）；MRVL 毛利率为MRVL 毛利率为
  GAAP/非GAAP 双值，v3.13 起按口径分 key 各判各的；v3.13 轮 7 条新结算
  落账于 settle() 修复前，evidence 无 metric/gaapBasis 字段（去重时按旧
  口径并组，4 个义务而非 7 个——向后生效不补造）。

**采集层**
- 源：23 个（tech 2 + humanities 1 + frontier_models 12 + economy 4 + business 4
  + psychology/philosophy 各 0）。frontier_models 的 12 = 9 个 RSS + Anthropic sitemap
  + EU AI Act Timeline + NIST（旧版 SKILL.md 写「17 个」且分项加总也不等于 17，
  v3.1 按代码实际修正——这是文档维护，不是能力变化）

**SEC EDGAR 采集层（v3.4 新增）**
- 来源：SEC EDGAR 公开 API（data.sec.gov submissions + Archives index.json），
  实测可达（2026-10-25：200/2.6s）；UA 声明身份 + 120ms 请求间隔（fair access）
- [v3.23] 第二个 EDGAR 数据源：S-1/IPO 备案核查（browse-edgar 公司检索，
  edgar-ipo-collector.js）——与 8-K 采集层分工：8-K 层采「业绩发布正文」
  （指引/实际值抽取），S-1 层查「备案存在性」（ipo 主张的独立验证）。
  见 [v3.23] 章节
- [v3.24] 同一数据源的第二个端点：data.sec.gov submissions（按 CIK 查全表单族
  登记记录）——撤回（RW）/定价（424B4）流程事件观测（ipo 证伪路径第二、三条，
  v3.23 曾整批列为人工执行）。选它而不是 browse-edgar 的 type=RW/424B4 的原因
  （全部 live 实证）：① browse-edgar 的 type 参数只生效第一个（type=S-1&type=RW
  与 type=S-1 返回完全相同）；② 同名不同 type 会解析到不同公司（Mobileye
  +type=S-1 → Mobileye Global Inc.，+type=RW → Mobileye B.V.），事件必须锚定
  S-1 匹配到的同一 CIK；③ 一个 CIK 查询覆盖全部表单族。见 [v3.24] 章节
- [v3.25] 公司名单 14→20 家境内备案人（+QCOM/ANET/CSCO/NOW/UBER/SHOP，覆盖
  半导体/网络设备/企业软件/平台经济四子域）。v3.24 基线 live 复测（2026-10-30）：
  六家各 3 份 Item 2.02 在窗、18 份备案数值指引 0 条进台账——指引句式全部在库外
  （corr-2026-032「在窗公司≠采到的指引」同型第五波：v3.14 起每轮都在补已命中
  公司的句式，从没问过「还有哪些公司在窗但零指引」）。ticker→CIK 走
  company_tickers.json 权威映射
- 采集对象：8-K Item 2.02（业绩发布）最近 3 次/公司（v3.5 从 2→3，见下）+ EX-99
  附件正文；指引句 = 指标名词 + 期望动词/数值相邻共现，[v3.25] 起十一种句式
  （v3.13 的五种 + [v3.14] META CFO 评论式 form D + [v3.19] 名词式区间 form E/
  提升式 form F/名词式点值 form G + [v3.20] 冒号+bullet form H + [v3.25]
  表格行/无动词区间 form J/expect+to be+%区间 form K/between-and 两形态 form L；
  form H 的 of 后容忍 approximately 与尾 % 区间），附财季期间（就近匹配，同比
  引用排除）、容差、前提削减；实际值句 = 指标 + 过去时（was/were/of）+ 数值，
  期间取自标题句（v3.5 extractActuals，[v3.25] 复数营收 revenues?）
- [v3.25] 实测产出：60 条业绩备案 / 141 条财报指引辨别（20 家中 17 家有书面
  数值指引；18 份新六家备案 0→55 条指引）。旧产出（[v3.20] live）：42 条业绩
  备案 / 86 条数值指引（14 家中 10 家有书面数值指引）；MSFT/GOOGL/CRWV/IBM
  只在电话会口头给指引或无数值——
  如实报「无数值指引」（v3.20 轮按 corr-2026-038 纪律复测刷新：四家在窗
  8-K 正文无数值期望句，否定式状态维持）；[v3.19 修正] v3.4 起本行写着
  「AVGO/CRWV/IBM/DELL/PLTR 口头给指引」——live 实证 AVGO/DELL/PLTR 备案
  里都有书面数值指引（form E/F/G 已进库），该描述腐烂三个版本
  （corr-2026-038）；[v3.20 补充] PLTR 的季度指引在 colon-bullet 里
  （form H），v3.19 只收了它的 raising 式全年指引——已命中公司的其它
  段落仍可能整段在库外（corr-2026-039）
- [v3.5] MAX_8K_PER_COMPANY 2→3：自动结算需要「指引备案 + 下一期实际值备案」
  这对连续备案同在采集窗口内。2 份每轮只能结最近一季（清 3 条积压），3 份能
  同时结最近两季。成本约 14 个额外请求（120ms 间隔下可忽略）。
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
- [v3.10] 商业辨别候选池四桶：business 12 / sec_filings 8 / frontier_models 10 /
  economy 6（business 第一优先）。v3.10 前只有 business/economy 两个媒体二手桶，
  SEC 备案与厂商一手公告里的量化主张从不进辨别（见「商业主张辨别」层 v3.10 段）
  [v3.12] sec_filings 8→10：算力基建承诺主张进池后 sec_filings 候选增至 10 条，
  8 会把尾部的 $64B server orders 与 PLTR 营收增长主张静默切掉
  [v3.22.1] 候选池四桶→六桶：+tech 6 / +humanities 4（排在 economy 之后，
  business 第一优先不变）——全池测量 live 实证 tech 桶 2 条真实商业主张
  （MIT TR「Anthropic has filed its IPO prospectus」ipo 形态、Ars Technica
  「Survey of 2,018 IT heads」调查主张）被白名单挡在辨别外（corr-2026-027
  同型断链：采集了但辨别器从不看；humanities 本轮 0 命中，同型补齐防漏桶）
  [v3.23] ipo 主张的 EDGAR 独立验证（新数据源，见 [v3.23] 章节）：辨别后的
  ipo 主张按公司名查 browse-edgar，备案动作形态 + 窗口内 S-1 匹配 → 证据档
  升独立验证(4)（该档首次被真实数据触发）；文书主体/承销牵头只记上下文

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
  earnings-settlement（v3.5，财报指引自动结算：extractActuals 抽实际值 +
  单位感知容差带 + 到期指引导账对账，见「财报指引自动结算层」）/
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
  财报指引自动结算 ✅（v3.5：到期 earnings_guidance 与「下一期财报实际值」
  配对落账，判据=实际值落在指引容差带内，方向 beat/below 单独记；live 实测
  7 条正确结算，MRVL GAAP/非GAAP 毛利率正确判歧义跳过；见「财报指引自动结算层」）/
  商业主张辨别 ✅（10 条，精度门后；v3.2 新增产能/供给约束形态后含 AWS 售罄
  主张一条——修复前该条 13 种形态全部不命中、整条不进辨别；判 证据不足/无出处(1)/
  推理 0/3，标题-only 不虚抬为决策相关；v3.3 新增并购/交易过程形态后含 Instacart
  出售探索与 Ramp/Airwallex 破裂交易两条——扩容前 14 种形态全部不命中、
  整条不进辨别；v3.3 轮当时判 不可证伪（无量化）/无出处(1)，[v3.21.1 起]
  corr-2026-025 结案后同两条改判 weak-evidence/无出处(1)/推理 0-1/3
  （事件型 no-quantity 豁免统一，decisionRelevant=false 不虚抬纪律保持）；
  v3.3.1 survey-finding 精度修复后 8→6 条——EconBrowser 站点导航与 LWiAI 播客
  列表两条 incidental 误报消除，Grok 真调查主张保留；
  v3.6 新增成本/价格信号形态后含数据中心迟到费一条——扩容前 15 种形态全部
  不命中、整条不进辨别；判 证据不足/无出处(1)/推理 1/3，标题-only 不虚抬；
  v3.7 新增专家/机构判断形态后含 Apollo 经济学家「AI delivers zero financial
  payoff to most companies」一条——扩容前 16 种形态全部不命中、整条不进辨别；
  判 推理单薄/第三方调查(3)/推理 0-1/3，有描述不虚抬但推理要素确实缺，
  decisionRelevant；live 文本窗口被 TechCrunch 正文促销内容占用（ Despite 句
  未进窗口→推理 0/3），与测试夹具 1/3 的差异如实记录）/
  v3.8 新增监管行动形态后含 Treasury 规则提案与 LWiAI 简报内句两条——扩容前
  17 种形态全部不命中、整条不进辨别；Treasury 条判 推理单薄/公开财报/公告(3)/
  推理 0/3、decisionRelevant（机构一手规则文书），LWiAI 条判 证据不足/无出处(1)/
  推理 0/3、不虚抬（官员个人行动经简报转述不借名字抬级））/
  v3.9 新增价格下调形态后含 LWiAI #343 简报内句一条——扩容前 18 种形态全部
  不命中、整条不进辨别；判 证据不足/无出处(1)/推理 1/3、不虚抬（简报转述的
  厂商自述降价，等价目表或第三方价格跟踪交叉验证）；
  v3.10 候选池接入一手信源桶（SEC 备案 + 厂商一手公告，四桶）并新增部署规模
  形态后含 Uber 30,000 employees 与 ChatGPT Ads 26 countries 两条——扩容前
  19 种形态全部不命中、整条不进辨别；均判 证据不足/无出处(1)/推理 1/3、
  不虚抬（厂商一手公告句式自身无归属词，等价名方确认或第三方报道交叉验证）；
  SEC 备案量化主张同轮进段（GOOGL 判 推理单薄/公开财报/公告(3)/推理 1/3、
  decisionRelevant——证据档首次被真实财报触发；公开财报/公告 1→5 条））/
  自我修正登记簿 ✅（38 条修正：critical 4 / high 17 / medium 17（含 corr-2026-024/025 两条前轮手写条目未设 severity、按 medium 计；v3.9 起走模块 record() 默认 medium；v3.10 新增 corr-2026-027：一手信源桶从不进商业辨别候选池+扩池暴露的三个精度缺陷，high；v3.14 新增 corr-2026-032/033，v3.15 新增 corr-2026-034：营收抽值路径从落地起没过全年值守卫，AMD Q4-FY2025 live 实证全年营收混进财季 key；v3.16 新增 corr-2026-035：残废条目修复必须连到结算配对全链——GOOGL capex 修好抽取侧（期间/区间/指标族三环）时同轮发现 guidanceStruct 从 v3.4 起不漏 isRange，区间指引持久化 settlement 恒退化，备案滑出窗口后到期永远无法结算（v3.5.1「ticker 恒 null」/v3.13「metric 被丢弃」同型第三次），high；v3.17 新增 corr-2026-036：全年列标记≠全年列——AMZN Q1 live 实证 Q1-Q3 备案的「Twelve Months Ended」是 TTM 列且 TTM 列年份与标题财年相同，只靠列标记+年份匹配会把 TTM 值当月度值落进 annual key 与 Q4 真全年值撞 key 判歧义；期间守卫必须锚备案季度（quarter===4）。live 端到端的零漂移 diff 抓到夹具覆盖不到的形态（AMZN Q1 的 TTM 列），medium；v3.18 新增 corr-2026-037：同型缺陷分路径各修各的——商业路径 v3.10 早有 forward-looking 免责声明守卫，forecast 路径从来没有，且 RSS 路径被共享断点饿死时 boilerplate 句压根进不了辨别，「没有触发机会」被当成「没有问题」；解锁 RSS 额度前 live 探针实测免责声明套话能过全部抽取门（拼句带 2026-03 时间 token 或截断在 plans to 上走 form B）且被判 settleable 会污染台账；精度夹具必须用能真正触达被测分支的 live 同形句子（第一版用单独存在的 disclaimer 句、断言空转，R2 反向验证抓出），medium；v3.19 新增 corr-2026-038：SKILL.md 的状态描述是会腐烂的「活结论」——v3.4 写下「AVGO/DELL/PLTR 只在电话会口头给指引或无数值」之后连续三个版本没人复核，2026-10-27 全池过堂（corr-2026-028 纪律）live 实证三家 9 份在窗 8-K 都有书面数值指引（含可结算区间）、四条旧形态全部不命中零条进台账；「某公司没有 X」这类否定式状态必须随每轮全池测量刷新，不能当永久事实引用；同轮零漂移 diff（42 份备案新旧代码逐条比对）抓到两个夹具覆盖不到的期间回归（AVGO 季度指引被 fiscal year 锚词抢成全年、ORCL Q2 EPS 指引被冒号节头抢成全年——v3.16 lookbehind 只加给了 ANNUAL_YEAR_NOUN_RE，同族另外两个年度形态漏加），medium）；v3.20 新增 corr-2026-039：扩库轮的测量必须覆盖「已命中公司」的全部段落——v3.19 过了「哪些公司没指引」的堂，没过「已命中公司的其它段落还有没有漏」的堂，live 实证 PLTR 三份在窗 8-K 的 Outlook 段季度指引 bullet 整个在库外（expect+冒号+bullet 列表结构，form A/B/D/E/F/G 七种形态全部不命中，corr-2026-032 同型第四波）；同一公司不同段落可以用完全不同句式（PLTR：raising 式全年 + colon-bullet 季度 + grew-to 实际值陈述三种句式三种形态），形态命中数>0 ≠ 该公司覆盖完整；同轮两个「夹具没触达被测分支」实测：in-excess 负向断言第一版被 live 句的 "U.S." 前缀挡在断言前面（名词前修饰词 pattern 吃不下带点的 "U.S."，match 起点对不上 lookbehind 终点，补无前缀夹具后才精确失败）、截断残值守卫被 V8 lookbehind 两迭代失败挡在前面（职责错配，改 [^:] 隔段结构后才回到数值守卫）——corr-2026-029/037 同型第三次实证，medium）；v3.3.1 登记
  corr-2026-014（版本号漂移：projection meta 停 3.2.2/package.json 停 3.2.1，
  四处对齐+一致性断言）与 corr-2026-015（survey-finding 误报+三处播客夹具
  空转）；v3.3 登记
  corr-2026-013（计数错误同型复发：新注释写「15 种」实为扩容前 14 种，提交前
  捕获并加模式计数断言）；v3.2.2 登记
  corr-2026-012（第七次同型断链：低置信度守门派生漏注入），critical 排最前；
  v3.2.1 登记 corr-2026-011（第六次同型断链）；v3.1.1 登记 corr-2026-009：
  口径错位检测 7 条误报 + 第五次同型断链；v3.7 登记 corr-2026-024：
  third-party-survey 的 (survey|poll|census) 无 \b 词边界——"Apollo" 含
  "poll" 子串被当成民调证据（无边界子串同型缺陷第三次实证），沉睡四个补丁轮
  直到新维度放行含 Apollo 条目才暴露）；v3.8 登记 corr-2026-025：
  no-quantity 不可证伪判据对事件型主张是类别错位（"Treasury Proposes to
  Widen Outbound Investment Restrictions" 的证伪靠规则是否落地不靠基数），
  v3.8 给 regulatory-action 加豁免、ma 同型不一致留待下轮统一（旧维度行为
  已文档化已测试，本轮不改只登记）；v3.9 登记 corr-2026-026：
  文档计数与历史断言名称腐烂（package.json description 把 v3.8 测试数写成
  276 实为 278；v3.4 段断言名称停在「（3.7.0）」而代码已改 3.8.0）——
  corr-2026-013/014 同型，涨号轮收尾必须全量 grep 旧版本号与旧计数
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
  [v3.10 再纠错] v3.10 新增部署规模（deployment-scale）后真实条数为 20
  （v3.2→14 / v3.3→15 / v3.6→16 / v3.7→17 / v3.8→18 / v3.9→19 / v3.10→20，
  计数断言每轮跟代码走，v3.2 计数纠错同型纪律）。
  [v3.11 再纠错] v3.11 新增用量/牵引度指标（usage-metric）后真实条数为 21
  （v3.10→20 / v3.11→21，计数断言同轮同步）。
  [v3.12 再纠错] v3.12 新增算力基建承诺/规模（compute-infra）后真实条数为 22
  （v3.11→21 / v3.12→22，计数断言同轮同步）。
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
  [v3.6 更新] 「Data Center Late Fees Hit $5 Million or More Per Day」已进
  模式库（cost-signal，成本/价格信号）；库外剩余：名词后接长修饰语的迟到费
  句式与 rates/tariffs 宏观看价名词，等有 live 实证再扩。
  [v3.7 更新] 「AI delivers 'zero financial payoff' to most companies, Apollo
  economist says」已进模式库（expert-judgment，专家/机构判断）；库外剩余：
  头衔+机构+动词三段式（"analysts at the Fed expect"）与 "economists surveyed
  by" 形态，等有 live 实证再扩。

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
- 判别结果（live 实测）：v3.3 轮当时两条均判 不可证伪（无量化）/ 无出处(1) /
  推理 0-1/3。[v3.21.1 更新] corr-2026-025 结案——no-quantity 事件型豁免
  扩展到 ma 后，同两条改判 weak-evidence/无出处(1)/推理 0-1/3，
  decisionRelevant=false（标题-only 不虚抬纪律保持）：证伪性判据归位，
  不再对同一主张同时输出「不可证伪: 无量化」与 ma 专属证伪条件（当事方
  公开否认、谈判破裂或交易被监管否决、最终交割条款/估值与主张情形不符）
  两行自相矛盾的输出；evidence≥3 的 ma 条走 thin-reasoning +
  decisionRelevant=true（v3.8 Treasury 条同型路径）。
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


**[v3.6] 成本/价格信号主张（cost-signal，新辨别维度）**
- 定位：供给约束的定价维度缺口。v3.2 的 capacity-claim 管「供给耗尽」
  （"AWS Largely Sold Out Of Capacity Into 2028"），但「耗尽的代价」一直在库外——
  2026-10-26 轮 live 实证：The Information「Data Center Late Fees Hit $5 Million
  or More Per Day, Spawning New Insurance」15 种形态全部不命中，整条不进辨别。
  当算力交付延迟，市场把延迟定价出来（迟到费 $5M+/天）并金融化（催生新保险
  产品线）——这是 AI 基建经济学的一阶信号，只辨「售罄」不辨「售罄的代价」，
  商业辨别对供给约束的理解只有一半。
- 形态族：成本/价格名词（late fees / delay fees / delay costs / fees / costs /
  premiums / penalties / prices）+ 水平谓语（hit / reach / climb to / rose /
  rise / top / exceed / average，容忍 now/has/have 与 record levels of /
  as much as 等窄填充）+ 金额（$+单位+or more+per day/hour 等期间）。
- 精度设计（v3.0.0c/v3.2/v3.3 教训：漏报比误报诚实、没有实证不扩模式）：
  ① 必须「名词+谓语+金额」三件套相邻共现——单独的 costs/prices/fees 不是主张
  （"The Cost of Living and Wages"）；② 水平谓语只认定量动词，无金额的
  "Prices Up" 与 "costs are falling" 不是可证伪主张；③ 名词与谓语之间只容忍
  now/has/have——实测放宽到 0-4 词间隔会误命中 2 句（"The company said fees
  would rise, without giving figures." 的 would 间隔+句末逗号被 [\d.,]+ 吞成
  金额；已知边界句 "Late fees for delayed GPU deliveries exceed $2 million
  per week."），按 v3.2 宽窗正则的教训保持相邻收紧。
- 判别结果（live 实测）：该条判 证据不足 / 无出处(1) / 推理 1/3（有金额→has-sample
  命中，无对照无反例），不虚抬为 ★决策相关——标题-only 条目只拿到主张本身。
  证伪条件走 cost-signal 专属路径（合同/发票/第三方价格跟踪与该值不符、成本项
  回落/被豁免/改入口径）。类目归 market_claims。
- 端到端：引擎候选门（isClaimForm 用同一个模式库）→ discriminateCommercial
  → formatReport KIND_CN「成本/价格信号」→ cron 注入第 6 段同标签。live 实测
  商业辨别段 6→7 条，byKind 新增 cost-signal:1。仍在库外的看价句式：名词后接
  长修饰语（"Late fees for delayed GPU deliveries exceed $2M"）、rates/tariffs
  等宏观看价名词——等有 live 实证再扩。
- 测试 250→258 项；6 轮反向验证全部精确失败（摘除模式→6 条失败含端到端/计数/
  召回/精度/摘除证伪条件→1/摘除类目映射→1（源级，兜底类目同域行为断言抓不到）/
  摘除报告标签→1/摘除注入标签→1/放宽名词-谓语间隔→1）。模式库计数 15→16
  （v3.3 的计数断言同步更新，v3.2 计数纠错同型纪律）。
- 版本号理由：新辨别维度（新 kind + 专属证伪路径 + 端到端标签），用户可感知
  （报告「商业主张辨别」段首次出现「类型: 成本/价格信号」行）。

**[v3.7] 专家/机构判断主张（expert-judgment，新辨别维度）**
- 定位：「第三方专家解读数据」这一最高频主张形态的缺口。v3.0.0c 起库里有
  survey-finding（调查研究的数据汇总），但「某位具名经济/市场专家对市场现状
  的量化判断」一直在库外——2026-10-26 轮 live 实证：TechCrunch AI「AI
  delivers 'zero financial payoff' to most companies, Apollo economist
  says」（2026-10-25）16 种形态全部不命中，整条不进辨别。Apollo 首席经济学家
  论「AI 对企业零财务回报」与调查研究是两类证据：前者是专家对数据的解读
  （可证伪但依赖专家信誉与机构口径），后者是数据本身。「AI 到底有没有财务
  回报」是当前最大市场争议，漏掉它商业辨别对争议核心失明。
- 形态族：① 头衔 + 判断动词（economist says / analysts expect / strategists
  see / warns / argues / estimates / notes / predicts / cautions / told 等）；
  ② 头衔 + 机构（economists at X / analysts of X / strategists for X，
  机构名排除 the/a/an 小词）；③ according to a/an/the + 窄修饰 + 头衔
  （according to a Bank of America analyst）。头衔库只认经济/市场分析头衔：
  economist / analyst / strategist / investment officer / portfolio manager /
  fund manager / head(director) of research。
- 精度设计（v3.0.0c/v3.2/v3.3/v3.6 教训：漏报比误报诚实、没有实证不扩模式）：
  ① 只认经济/市场分析头衔——CEO/executive 的自述是 vendor-selfreport 地盘
  不抢（"OpenAI says" / "NVIDIA CEO says" 不命中）；scientists/researchers
  （科研判断）、Fed chair/Trump（官员言论）不是市场分析头衔不进库；
  ② 必须「头衔+动词」或「头衔+机构」——光名词（"analyst day" /
  "market strategist" / "The Economist magazine"）不是主张；③ 头衔与机构间
  只容忍 chief/senior/lead/market/investment/global/US 窄前缀。
  已知边界（如实）：头衔+机构+动词三段式（"analysts at the Fed expect"）、
  "economists surveyed by" 形态无 live 实证不进库。全池 300 条 live 实测精确
  命中 1 条（即该条），21 句精度回归 0 误报。
- 判别结果（live 实测）：该条判 推理单薄 / 第三方调查(3) / 推理 0-1/3，
  decisionRelevant=true——与 v3.2/v3.3/v3.6 的标题-only 条不同：这条有
  TechCrunch 描述、第三方机构经济学家公开发表的研究观点，证据等级够；
  推理要素确实缺（无样本无对照，Despite 句在 live 文本窗口外，夹具复现
  窗口内为 1/3）。不虚抬为「结构完整」。证伪条件走 expert-judgment 专属路径
  （时点后实际数据/第三方调查/机构自身后续修订不符、同业同口径反证）。
  类目归 market_claims。
- 端到端：引擎候选门（isClaimForm 用同一个模式库）→ discriminateCommercial
  → formatReport KIND_CN「专家/机构判断」→ cron 注入第 6 段同标签。live 实测
  商业辨别段 7→8 条，byKind 新增 expert-judgment:1。证据等级同轮扩展：
  third-party-survey 加 expert 形态（与 v3.0.0c「according to a study in
  Science 归第三方」同型），厂商自述不被抬级（"OpenAI says" 仍 ≤2）。
- 同轮修一个既有缺陷（corr-2026-024，维护级）：third-party-survey 的
  (survey|poll|census) 自 v3.0.0c 起无 \b 词边界——"Apollo" 公司名含
  "poll" 子串，任何含 Apollo 的句子都被当成民调证据。该缺陷沉睡四个补丁轮：
  含 Apollo 的条目此前整条不进辨别段，poll 分支没有触发机会；v3.7 放行后
  round 6 反向验证报 0 失败（断言被 poll 子串喂饱）才抓到。修 \b + 防回归
  断言（round 7 恢复无边界→精确失败 1 条）。教训：「该分支没有触发机会」
  不等于「该分支是对的」——每轮扩库后要顺带对被放行的新文本跑证据等级/
  推理判据的逐支核对。
- 测试 258→267 项（新增 9：live 实证命中 / 专属证伪条件与类目映射（源级，
  兜底类目同 market_claims）/ 形态族召回三族七形 / 精度回归 21 句 / 证据等级
  归第三方调查(3)且不误升厂商自述且 Apollo≠poll / 引擎端到端渲染 / cron
  注入源级 / 精度门未破 / 版本号一致性 3.7.0）；7 轮反向验证全部精确失败：
  摘除模式→6 条（live 实证/证伪条件/召回/精度/端到端/模式计数）；摘除证伪
  条件→1；摘除类目映射→1（源级）；摘除报告 KIND_CN→1；摘除注入 KIND_CN→1；
  摘除证据等级 expert 动词分支→2（第一版 round 6 报 0 失败——poll 子串把
  断言喂饱，修 \b 后才精确失败，即 corr-2026-024 的发现过程）；恢复 poll
  无词边界→1。
- 版本号理由：新辨别维度（新 kind + 专属证伪路径 + 端到端标签 + 证据等级
  扩展），用户可感知（报告「商业主张辨别」段首次出现「类型: 专家/机构判断」行）。

**[v3.8] 监管行动主张（regulatory-action，新辨别维度）**
- 定位：合规域自 v3.0.0c 起只有 compliance-demand（「监管需求修辞」：
  regulators will require…），**真实规则事件**（提案/签发/加宽/解除限制）
  一条都看不见——而规则事件才是合规需求域的一阶信号（跨境资本、出口管制、
  AI 监管全部经由规则落地）。2026-10-26 轮 live 实证两条：The Information
  简报「U.S. Treasury Proposes to Widen Outbound Investment Restrictions for
  China and Other Countries」（2026-10-23；AP/Reuters/Nikkei/The Hill 四家
  交叉验证：10-22 提案、评论期至 12-07、落实 2025-12 立法、覆盖 AI/超算/
  生物技术/高超音速、$50,000 以上投资口径）与 LWiAI #251 简报内句「Trump
  lifts restrictions on Anthropic」（2026-06-30 白宫解除 Anthropic 模型
  出口管制的简报转述）——扩容前 17 种形态全部不命中，整条不进辨别。且该
  形态有天然结算结构：提案 → 评论期 → 最终规则，与引擎「辨别+跟踪结算」
  定位同构。
- 形态族：① 政府/监管主体（treasury/SEC/FTC/DOJ/White House/Congress/EU/
  regulators/ministry/beijing/president/trump/…，**Fed/ECB 不含**——货币
  政策公告不是规制行动，v3.0.0c 精度门不打穿）；② 规制动词（propose/
  announce/issue/impose/sign/enact/pass/finalize/adopt/approve/widen/
  expand/tighten/loosen/relax/ease/ban/block/strike down/overturn/rescind/
  veto/delay/fine/penalize/sue/investigate/subpoena/order/mandate/curb/
  clamp/crack down/lift/unveil/publish/release）；③ 规制工具名词（rules/
  regulations/restrictions/curbs/limits/caps/bans/tariffs/sanctions/export
  controls/requirements/legislation/laws/bills/executive orders/frameworks/
  guidance/orders/mandates/directives/statutes/acts/measures）。三段式同句
  共现，两段间隔都不含句读号（[^.!?]{0,40}）。
- 精度设计（v3.0.0c/v3.2/v3.3/v3.6/v3.7 教训：漏报比误报诚实、没有实证不扩
  模式）：① 主体缺位不是监管行动（"OpenAI says…" 是 vendor-selfreport
  地盘）；② 规制动词不含 said/says/expect——官员言论是 v3.7 expert-
  judgment 已决议不进库的形态，不重复收编（"Trump says tariffs will raise
  revenue" 不命中）；③ Fed/ECB 公告（FOMC statement/minutes/projections）
  主体库不含。全池 312 条 live 实测精确命中 2 条（即上述两条），31 句精度
  回归 0 误报（Fed/ECB 公告/NBER 论文/宏观看价句/官员言论/厂商自述/股价
  反应/播客 boilerplate/其它形态库句式全部不命中）。
- 判别结果（live 实测）：Treasury 条判 推理单薄 / 公开财报/公告(3) / 推理
  0/3、decisionRelevant——证据档同轮扩展（public-filing 增加政府机构一手
  文书标记：federal register/proposed rule/final rule + 机构名 + 发文动词，
  与 v3.0.0c「according to a company announcement 归公开财报档」同型；
  官员个人转述/厂商自述/Fed chair said 都不抬级）；LWiAI 条判 证据不足 /
  无出处(1) / 推理 0/3、不虚抬。
- 同轮维护（不单独涨号）：事件型 no-quantity 豁免——监管行动的证伪靠
  「规则是否落地/范围是否相符」的可观测事件，不靠量化基数；不豁免则报告
  对同一条主张同时打印「不可证伪: 无量化」与「证伪条件: 观察到最终规则…」
  两行自相矛盾的输出。豁免只摘 no-quantity（无主体/趋势修辞/无出处保留），
  推理三要素仍独立计分（0/3 不虚抬成 well-formed）。ma 事件型主张同型不
  一致登记 corr-2026-025 下轮统一。[v3.21.1 结案] 豁免已扩展到 ma——
  标题-only ma 条 unfalsifiable → weak-evidence（不虚抬纪律保持），
  evidence≥3 的 ma 条 → thin-reasoning + decisionRelevant=true；
  regulatory-action/ipo 行为逐字段不变（有断言钉住）。判定行为变化写进
  v3.3 章节判别结果段与本轮登记簿 fix 字段，不改写 v3.8 当时的事实记录。
- 端到端：引擎候选门（isClaimForm 用同一个模式库）→ discriminateCommercial
  → formatReport KIND_CN「监管行动」→ cron 注入第 6 段同标签。live 实测
  商业辨别段 8→10 条，byKind 新增 regulatory-action:2。
- 仍在库外的监管句式：执法行动（fined/sued/charged，无工具名词——AP 原文
  "Treasury issued a $200,000 fine against a U.S.-based company" 因无工具
  名词不命中，如实记录为漏报）**[v3.22 已结案：legal-action 新维度进库，
  live 实证「Malaysian Authorities Seize $12 Million Worth of AI Chips in
  Smuggling Crackdown」与「Parents sue OpenAI」——见 [v3.22] 章节； AP 原文
  该句因动词 base-form "fine" 有名词歧义仍不进库，留已知边界]**、
  「SEC's new disclosure rules」类所有格形态、
  州层立法主体（california 等）——等有 live 实证再扩。

**[v3.9] 价格下调主张（price-cut，新辨别维度）**
- 定位：价格维度的下半边缺口。v3.6 的 cost-signal 管「价格/成本打到某
  水平」（"Data Center Late Fees Hit $5 Million or More Per Day"），但
  **价格下调**（模型 API 降价、智能单价通缩）一直在库外——2026-10-26 轮
  live 实证：LWiAI #343 简报内句「Anthropic launches Claude Fable 5.1 and
  says it's up to 45 percent cheaper for agentic work」（2026-09-07，
  business 桶）扩容前 18 种形态全部不命中、整条不进辨别。智能价格通缩是
  AI 市场需求侧的一阶信号（降价驱动采用、重塑毛利结构、压缩竞争对手定价
  空间），只辨「价格打到某水平」不辨「价格下调」，商业辨别对价格维度的
  理解只有一半。
- 形态族：① 名词+下调谓语+幅度（prices fell 20% / inference pricing has
  dropped 40% / subscription prices plunged 60%）；② 下调动词+名词+by/to+
  幅度（cut prices by 30% / lowered its API prices to $0.50）；③ 幅度+
  比较级（45 percent cheaper / 3x cheaper than，比较级后只认 for/than/句读）。
- 精度设计（v3.0.0c/v3.2/v3.3/v3.6/v3.7 教训：漏报比误报诚实、没有实证
  不扩模式）：① 必须有幅度——无金额的价格变动句（"with lower prices"/
  "costs are falling"/"API prices are falling"）按 v3.6 同型纪律（无金额的
  "Prices Up" 不是可证伪主张）不进库，live 实证 LWiAI #258「Opus 5.5 with
  lower prices」如实记录为已知边界漏报；② 名词族只认 prices/pricing，
  不认 costs——TCO 效率句（NVDA「35x lower cost for agentic AI」/ ORCL
  「at a lower cost」/ "Operating costs fell 40%"）是能力/成本效率主张不是
  市场定价主张；③ 比较级后只认 for/than/句读——"cheaper to manufacture"
  是制造成本效率不是定价主张。全池实测（300 条覆盖审计轮 + 321 条端到端轮）
  精确命中 1 条（即该条），精度回归 0 误报。
- 判别结果（live 实测）：该条判 证据不足 / 无出处(1) / 推理 1/3（有幅度
  数字→has-sample，无对照无反例）、不虚抬为 ★决策相关——简报转述的厂商
  自述降价，等价目表或第三方 API 价格跟踪交叉验证。证伪条件走 price-cut
  专属路径（价目表/第三方价格跟踪与主张值不符、降价实为功能/用量配额削减
  的口径变化、价格回升）。类目归 market_claims。
- 端到端：引擎候选门（isClaimForm 用同一个模式库）→ discriminateCommercial
  → formatReport KIND_CN「价格下调主张」→ cron 注入第 6 段同标签。live 实测
  商业辨别段 9→10 条，byKind 新增 price-cut:1。
- 仍在库外的价格句式：无幅度降价谈论（"with lower prices"，已知边界漏报，
  等有 live 实证再议）、costs 名词族（TCO/运营成本，有意排除）、
  "price war" 类竞争定价形态——等有 live 实证再扩。

**[v3.10] 部署规模主张（deployment-scale，新辨别维度）+ 商业辨别接入一手信源**
- 定位（候选池断链）：商业辨别的候选池自 v3.0.0 起只有 business/economy 两个
  媒体二手桶——两个一手桶从来不进辨别。① sec_filings（SEC EDGAR 备案，
  v3.4 起采集）：「公开财报/公告(3)」证据档自 v3.0.0c 起只为「文本里提到
  filing/announced」设计，从来没有真实财报能触发它；备案里的量化主张
  （"Google Cloud saw a continued increase in customer demand as revenues
  increased 48% to $17.7 billion"、"intent to raise up to $50 billion"、
  "Closed 206 deals of at least $1 million"）整条看不见。② frontier_models
  （厂商一手公告，12 个源）：具名部署主张（"Uber is rolling out ChatGPT
  Work to more than 30,000 employees"）与调查研究（"survey of almost
  11,000 US adults"，Anthropic 员工 vs 公众预期调查）都在这个桶里。一手
  信源是商业主张证据链的最上游，只辨媒体转述等于把最高质量的证据档晾着。
  同时 adoption-claim 只认「趋势主体」（enterprises are adopting…），
  **具名主体的量化部署**——厂商一手公告与案例研究里最高频的采用证据形态
  ——整个在库外。2026-10-26 轮 300 条 live 实测：扩容前 19 种形态对上述
  两句全部不命中。
- 候选池扩展（v3.10）：business 12 / sec_filings 8 / frontier_models 10 /
  economy 6，business 仍第一优先（[v3.12] sec_filings 8→10，见当前状态段）（v3.0.0 的优先纪律保留，断言钉住同池时
  business 排前）。live 实测：形态门在 sec_filings 42 条里命中 6 条
  （4 条真主张 + 2 条 forward-looking 免责声明 boilerplate，已加守卫）、
  frontier_models 142 条里命中 7 条（6 条真主张 + 1 条交易机制假设句，
  ma 动词形态已收紧）。结果与渲染上限同步 16→20 / 12→20 / cron 10→16
  （辨别条数变多后切掉尾部等于「辨别了但看不见」）。
- 新维度形态族（deployment-scale，部署规模主张）：部署/扩张动词
  （rolling out / rolls out / rolled out / deploy(s|ing|ed) / bringing /
  brings / brought / expands to / expanding to / launch(e[sd]|ing) for-to）
  + 量化范围（N employees / seats / staff / workers / users / advertisers /
  customers / countries / companies / developers / businesses /
  enterprises / organizations / banks / hospitals / retailers），容忍数量
  副词（more than / over / up to）与一个窄形容词（new / additional /
  waitlisted…）。
- 精度设计（v3.0.0c/v3.2/v3.3/v3.6/v3.7/v3.9 教训：漏报比误报诚实、没有
  实证不扩模式）：① 必须有量化范围——无数量的部署谈话（"brings ChatGPT
  Work to all employees"）按 v3.6/v3.9 同型纪律（无金额的价格变动句不是
  可证伪主张）不进库；② 只认部署/扩张动词——合作公告（partner /
  collaborate）、自身基础设施 scaling（"scaling storage to serve 1 billion
  users" 是自身容量不是客户部署）、产品发布、销售数字（"20,000 sell"）
  都不是部署规模主张；③ 动词与数量之间不容任词间隔（[^.!?]{0,40}，
  v3.6 宽窗正则误命中 2 句的教训）。全池实测精确命中 2 条（即 Uber 与
  ChatGPT Ads 两条），13 句精度回归 0 误报。
- 判别结果（live 实测）：两条都判 证据不足 / 无出处(1) / 推理 1/3
  （30,000 employees 与 100,000 advertisers 命中 has-sample——v3.10 名词组
  补 employees/seats/staff/countries/advertisers/deals，无对照无反例）、
  不虚抬为 ★决策相关——厂商一手公告句式自身无归属词（无 "we/our"），
  等价名方确认或第三方报道交叉验证。证伪条件走 deployment-scale 专属
  路径（部署方否认 / 席位数覆盖国家数与主张值不符 / 部署暂停缩减回滚；
  厂商一手公告需第三方或当事方确认才能升级证据档）。类目归 market_claims。
- 证据档同轮扩展（v3.10）：public-filing 增加 SEC EDGAR 采集源标记
  （claim.source === 'SEC EDGAR' 即归公开财报/公告(3)，与 v3.8 政府机构
  一手文书标记同型；非该来源不虚抬——同句 source=The Information 仍判
  无出处(1)，有断言钉住）。live 实测公开财报/公告证据档 1→5 条。
- 同轮精度配套（全部 live 实证驱动）：① forward-looking 免责声明守卫——
  MU/CRWV 两家 8-K 的「Forward-Looking Statements」段是法律 boilerplate
  （"These statements include, but are not limited to, ... customer
  demand" 的清单名词短语误触发 demand 形态），命中句自身含免责声明标记
  （forward-looking statements / these statements include / statements
  related to）即跳过，不碰窗口内其它句子；② ma 动词形态收紧——"What
  happens when a deal falls through?"（Anthropic 研究博文，交易机制假设
  句）的 "a deal" 泛指不是可证伪的交易主张，交易名词前无冠词
  （"talks collapsed"）或特定限定（"the deal fell through"）仍命中。
- 端到端：引擎候选门（isClaimForm 用同一个模式库，四桶）→
  discriminateCommercial → formatReport KIND_CN「部署规模主张」→ cron
  注入第 6 段同标签。live 实测商业辨别段 10→20 条，byKind 新增
  deployment-scale:2；该轮 byKind 全量 expert-judgment:1 / adoption:4 /
  cost-signal:1 / capacity:1 / ma:2 / regulatory-action:2 / funding:3 /
  price-cut:1 / demand:2 / deployment-scale:2 / competitive:1。
- 仍在库外的部署句式：无量化范围的部署谈话（"brings X to all
  employees"，已知边界漏报）、合作/协同公告、eyes+测试计划、政府资助
  授予（"NIST Awards $1.7M"）——等有 live 实证再扩。

**[v3.11] 用量/牵引度指标主张（usage-metric，新辨别维度）+ 引号切分修复**
- 定位：采用证据的第三形态缺口。adoption-claim 只认「趋势主体」
  （enterprises are adopting…）、deployment-scale 只认「部署事件+量化
  范围」（rolling out to 30,000 employees）——而**产品用量状态**
  （"Microsoft 365 Copilot reached over 30 million paid seats"、
  "the Gemini App has 950 million monthly active users"、"Gemini models
  now process 22 billion API tokens per minute"）整条在库外。live 实证
  （2026-10-26 轮 300 条池，sec_filings 桶，v3.10 扩池后进池）：扩容前
  20 种形态对上述四句全部不命中。用量指标是客户采用域最硬的第一方
  证据——厂商在 SEC 备案里自报的席位数/月活/token 吞吐，且有天然结算
  结构：下一期备案的同指标是新值，可对账。三类采用证据分工：趋势主张
  靠调查/汇总证伪，具名部署靠「当事方确认+席位数核实」证伪，用量状态
  靠「下一期自报值+第三方估算+口径变化」证伪。
- 形态族：用量状态动词（has/have/had/reached/grown to/exceeds/
  surpasses/tops/process…/stands at，容忍 now 前缀）+ 量化值
  （N million/billion/thousand…，容忍数量副词与 to）+ 用量指标名词
  （(monthly|weekly|daily) active users / paid seats / (api) tokens
  per minute/second/hour/day / api calls）。
- 精度设计（v3.0.0c/v3.2/v3.3/v3.6/v3.7/v3.9/v3.10 教训：漏报比误报
  诚实、没有实证不扩模式）：① 必须「量化值+用量指标名词」两件套——
  单独的 active users/tokens 不是主张（"how to grow monthly active
  users" 是指南文本）；② 指标名词族不认 subscribers——live 实证
  "the number of paid subscriptions has now reached 350 million, with
  YouTube and Google One being the key drivers"（GOOGL 2026-04-29
  备案）是订阅总量不是 AI 产品用量，LWiAI/FLI 站点 "over 50,000+
  subscribers" 是邮件列表 boilerplate，Suno "2 million paying
  subscribers" 是音乐服务（与 v3.9 名词族只认 prices 不认 costs 同型）；
  ③ 必须有用量状态动词——"our API supports 128k tokens per minute"
  是速率上限不是用量（supports/allows/offers 不是用量动词），v3.10
  已决议的基础设施 scaling（"scaling storage to serve 1 billion
  users" 是自身容量）同型不收；④ 只认「数值在前」语序（live 实证四句
  全部如此）——名词在前语序（"monthly active users reached 950
  million"）会放行 "apps with monthly active users exceeding
  100,000" 类调查样本准入条件误报，留作已知边界。live 全池实测
  （300 条）：精确命中 4 条（MSFT Copilot 30M paid seats、GOOGL
  Gemini 950M/750M MAU、GOOGL 22B/10B tokens per minute），10 句精度
  回归 0 误报。
- 判别结果（live 实测）：MSFT 条判 结构完整 / 公开财报/公告(3) /
  推理 2/3、decisionRelevant（has-sample+has-comparison，对照来自
  命中句后 2 句上下文的 "up 27% year-over-year"——引擎既定语义：
  主张文本=命中句+后 2 句）；GOOGL 条判 推理单薄 / 公开财报/公告(3) /
  推理 1/3、decisionRelevant。两条都不虚抬为无前提的一手事实：证伪
  路径明确（下一期备案同口径自报值/第三方用量估算/口径变化）。
- 同轮同型修复（配套，无新维度）：句末标点后容忍一个收尾引号再切句。
  SEC 备案正文把多条引言拼成一段时，`transformation." "We delivered…`
  的句点在引号内，旧切分 `(?<=[.!?。！？])\s+` 不断句——含用量主张的
  整段被拼成 443 字长句、超出 400 字候选窗，MSFT 条整条不进辨别
  （live 实证）。两处切分点（forecast 候选路径 + 商业候选路径）同步
  修，V8 支持变量长 lookbehind。实测 forecast 辨别结果零变化
  （41 条逐条签名比对一致），商业辨别 20→23 条（+2 usage-metric、
  +1 被救回的 DELL 融资真主张）。
- 同轮维护（不单独涨号）：渲染/注入上限 20→25 / 16→25 并加截断披露
  （audited 23 > 旧上限 20，切掉尾部=「辨别了但看见不全」，超出时
  明确写「另有 N 条未显示」不静默切尾）；available:false 路径的桶
  描述从「business/economy」更正为四桶（v3.10 扩池后的文档腐烂）；
  package.json description 把 v3.9 内容挂在 v3.10.0 版本号下
  （corr-2026-026 同型），按实测重写。
- 端到端：引擎候选门（isClaimForm 用同一个模式库，四桶）→
  discriminateCommercial → formatReport KIND_CN「用量/牵引度指标主张」
  → cron 注入第 6 段同标签。live 实测商业辨别段 20→23 条，byKind
  新增 usage-metric:2；该轮 byKind 全量 expert-judgment:1 /
  adoption:4 / cost-signal:1 / capacity:1 / ma:2 / regulatory-action:2
  / funding:4 / price-cut:1 / usage-metric:2 / demand:2 /
  deployment-scale:2 / competitive:1。
- 仍在库外的用量句式：名词在前语序（"monthly active users reached
  950 million"，已知边界——与抽样条件句共用正则会误报，等 live
  实证再议）、增长率形态（"40% quarter on quarter growth in paid
  monthly active users"——GOOGL 2026-04-29 备案该句在采集正文里被
  截断，且增长率主张的证伪结构与水平值不同，等完整实证再扩）、
  subscribers 族（有意排除）、GOOGL 2026-02-04 备案的 750M MAU 句
  （用量句距首个命中句超过 2 句、不在 claim 文本窗内，已知边界漏报，
  测试钉住）、无量化用量的名词短语——等有 live 实证再扩。

**[v3.12] 算力基建承诺/规模主张（compute-infra，新辨别维度）**
- 定位：采用/供给证据的第四形态缺口。adoption-claim 只认「趋势主体」
  （enterprises are adopting…）、deployment-scale 只认「部署事件+人的
  量化范围」（rolling out to 30,000 employees）、usage-metric 只认
  「产品用量状态」（30M paid seats / 950M MAU / 22B tokens per
  minute）——而**算力基建承诺**（"accelerate the buildout of more than
  5 gigawatts of AI factories by 2030"、"mobilize over $500 billion
  of third-party capital for the buildout of AI infrastructure"、
  "export license for 45,000 NVIDIA Grace Blackwell GPUs"）整条在库外。
  live 实证（2026-10-26 轮 300 条池，corr-2026-028 纪律的全池测量
  「未命中条目过堂」——sec_filings 的 8-K highlights 段与
  frontier_models 的厂商博客）：扩容前 21 种形态对上述四句全部不命中。
  算力承诺是供给侧最前端的市场信号——电力许可/GPU 交付/资本承诺领先
  营收数个季度，且有天然结算结构：交付进度、并网容量、definitive
  agreements 签署都是可观测事件。四类采用/供给证据分工：趋势主张靠
  调查证伪，具名部署靠当事方确认证伪，用量状态靠下一期自报值证伪，
  算力承诺靠交付/许可/资本落实证伪。
- 形态族：三段同句共现（lookahead 保证任词序、不跨句）——① 建设/承诺
  动词（buildout/expands/mobilize/deploy/invest/commit/secured/
  license/commission/construct/bring/under construction/commercial
  launch）；② 量化算力（N GW/MW/gigawatts/megawatts/GPUs/
  accelerators，容忍 NVIDIA 型号名间隔）或量化资本（$N
  million/billion/trillion）；③ AI 基建锚点（AI factory/AI
  infrastructure/data center/compute/GPU/NVIDIA…）。
- 精度设计（v3.0.0c/v3.2/v3.3/v3.6/v3.7/v3.9/v3.10/v3.11 教训：漏报
  比误报诚实、没有实证不扩模式）：① 必须有量化值——"build
  sovereign AI infrastructure at gigawatt scale"（NVDA 8-K，韩国
  主权 AI）无数字不是可证伪主张，不进库；② 动词族不含裸露
  accelerate——候选模式第一轮独立三段测试实测 "revenue … accelerated
  to 46%"（MRVL 8-K）与 "accelerated computing"（NVDA Q4 亮点段）
  误命中 2 句营收句；改 lookahead 后这两句因金额含小数点反而跨不过
  段（"$62.3"/"$2.739" 的句点把 [^.!?] 段切断，动词段到不了句末的
  accelerated）——小数点切断是附带防线不是设计意图，无小数点的营收
  句（"Data Center revenue accelerated to a record $46 billion"）
  照样误命中，动词门必须留（精度回归第 26 句钉住），"accelerate the
  buildout" 由 buildout 动词本身覆盖；③ 资本
  形态必须有 AI 基建锚点+动词——"raises $16B"（融资）、"revenue was
  $89.0B … Data Center"（营收）都不是基建承诺，不抢 funding/demand
  地盘；④ 算力单位族不含裸 chips（"each wafer contains more than 400
  chips" 是芯片工艺）、不含 users/seats（用量指标与部署规模的地盘）。
  live 全池实测（300 条）：精确命中 7 句、4 条进引擎候选，26 句精度
  回归 0 误报。
- 判别结果（live 实测）：NVDA $500B 资本动员与 NVDA-CoreWeave 5GW 两条
  判 推理单薄/公开财报/公告(3)/推理 1/3、decisionRelevant（SEC EDGAR
  采集源归公开财报档，v3.10 同型）；CRWV 8-K 5GW 判 结构完整/公开
  财报/公告(3)/推理 2/3、decisionRelevant（对照来自拼接段上下文）；
  NVIDIA 博客 Firebird 45,000 GPUs 判 证据不足/无出处(1)/推理 1/3、
  不虚抬（厂商博客句式自身无归属词，与 v3.10 Uber 条同型）。证伪条件
  走 compute-infra 专属路径（第三方算力/电力跟踪的交付进度或规模不符、
  基建未按主张时点落地、「承诺」实为未签署最终协议的意向书）。类目归
  market_claims。
- 同轮维护（不单独涨号）：① has-sample 名词组补算力单位（容忍 NVIDIA
  型号名间隔）——算力承诺主张的样本就是 GW/MW/GPU 数与资本额，不补则
  推理分恒 0（v3.10 补 employees/countries 同型）；② sec_filings 候选
  桶 8→10——新维度进池后 sec_filings 候选增至 10 条，8 会把尾部的
  $64B server orders 与 PLTR 营收增长主张静默切掉（「辨别了但看不
  见」，v3.10/v3.11 上限纪律同型）；③ 渲染/注入上限 25→30（audited
  27 超旧上限 25，不静默切尾）。
- 端到端：引擎候选门（isClaimForm 用同一个模式库，四桶）→
  discriminateCommercial → formatReport KIND_CN「算力基建承诺/规模
  主张」→ cron 注入第 6 段同标签。live 实测商业辨别段 23→27 条，
  byKind 新增 compute-infra:4；该轮 byKind 全量 expert-judgment:1 /
  adoption:4 / cost-signal:1 / capacity:1 / ma:2 / regulatory-action:2
  / funding:4 / price-cut:1 / compute-infra:4 / usage-metric:2 /
  demand:2 / deployment-scale:2 / competitive:1——原 12 种 kind 计数
  逐一不变（零串台零丢失，不串台断言钉住）；公开财报/公告证据档
  8→11 条；decisionRelevant 10→13 条。
- 仍在库外的算力句式：无量化数的规模级表述（"at gigawatt scale"，
  已知边界）、营收/指引句（"Data Center revenue was $89.0B" 是财报
  事实归 forecast 路径）、政府资助授予（"NIST Awards $1.7M"，v3.10
  已决议不收）、自身工程 scaling 叙述（"scaling storage to serve 1
  billion users"）、无动词的存量描述（"the data center houses 5,000
  GPUs" 是容量描述不是承诺）——等有 live 实证再扩。已知边界（切分）：
  [v3.26 起] 「Credit Saison achieves 954% ROI in a ChatGPT Enterprise
  pilot」类客户成效/ROI 主张已进模式库（customer-outcome，成效动词+量化值+
  成效名词/成效名词+of+量化值两族；必须有量化值，无数字 ROI 谈论不进库）；
  库外剩余：in 间隔形态（"$12 million in annual savings"）、has/have+成效
  名词语法（"the pilot has a 6-month payback"）、produce 类未枚举动词——
  等有 live 实证再扩。
  Firebird 主张句在 "U.S." 句点后被切开，主张句从 "export license
  for 45,000…" 片段起（主体 Firebird 在前一段，与 v3.8 Treasury 条
  同型），claim 文本窗仍含后 2 句（"under construction … commercial
  launch Q3 2027" 与 "500 megawatts"），结算相关信息不丢。

**[v3.22] 执法/诉讼行动主张（legal-action，新辨别维度）**
- 定位：合规需求域自 v3.8 起只有 regulatory-action（真实规则事件：提案/签发/
  加宽/解除限制），**执法/诉讼行动**（罚款/扣押/起诉/查封）一条都看不见——而
  v3.8 立库时白纸黑字记着已知边界「执法行动（fined/sued/charged，无工具名词）
  无 live 实证不进库」。2026-10-28 全池过堂（corr-2026-028 纪律，312 条池
  262 条未命中逐条过堂）live 实证该边界可以结案：business 桶两条执法/诉讼
  主张整个在库外——TechCrunch AI「Parents sue OpenAI, alleging GPT-4o coached
  their daughter off seizure medication」与 The Information「Malaysian
  Authorities Seize $12 Million Worth of AI Chips in Smuggling Crackdown」
  （扩容前 23 种形态全部不命中）。执法/诉讼行动与规则事件是两类信号：规则
  事件的证伪靠最终规则文本，执法/诉讼行动的证伪靠司法/行政程序结局（驳回/
  撤诉/和解/改判/撤销）——罚款、扣押、诉讼正是规则落地的可观测证据
  （Malaysia 扣押 AI 芯片是出口管制/走私执法的一阶信号，Parents v. OpenAI
  是产品责任风险的一阶信号），漏掉它商业辨别对合规需求域「规则之后发生
  什么」失明。
- 形态族（两族，全部 live 实证驱动）：① 诉讼动作（sue/sues/sued/suing +
  capitalized target，容忍 ≤2 个短小写间隔词——"A family is suing OpenAI"/
  "sued OpenAI in federal court"）；② 执法动作（执法主体 authorities/
  government/regulators/police/customs/prosecutors/attorneys general/DOJ/
  SEC/FTC/treasury/EU/White House/ministry/Congress… + [^.!?]{0,40} + 执法
  动词 seize/fined/penalize/indict/confiscate…）。
- 精度设计（v3.0.0c/v3.2/v3.3/v3.6/v3.7/v3.9/v3.10/v3.11/v3.12/v3.21 教训：
  漏报比误报诚实、没有实证不扩模式）：① 动词族只收无名词歧义的形态——
  fined/fining 收而 fines（名词：impose fines）不收；seize（动词）收而
  seizure（名词，live 实证 "seizure medication" 是医疗场景）不收；
  indicts/indicted 收而 indictment 名词不匹配；charge/charged 有意不进
  动词族（live 实证 sec_filings 桶的会计 "charges"：restructuring/
  compensation/impairment charges、free of charge、in charge、charged with
  explaining 四类全部不命中）；② 不抢 regulatory-action 地盘——规则提案/
  签署/加宽句（Treasury Proposes to Widen…/Trump lifts restrictions…）不含
  执法动词，整条不命中；③ 事件型 no-quantity 豁免扩展到本 kind（v3.8/v3.21/
  v3.21.1 同型第四次）：诉讼/执法主张的证伪靠程序结局不靠数字，标题-only
  无数字条不判「不可证伪: 无量化」，豁免只摘 no-quantity、推理三要素仍独立
  计分；④ 无 live 实证的形态不进库：bare "lawsuit against" 名词句、
  "settles with" 和解句、被动语态（"OpenAI sued by parents"）、
  "charged/faced charges"（名词歧义）、base-form "fine"（名词歧义）——等有
  live 实证再扩。live 全池实测（312 条）：精确命中 2 条（即上述两条），
  26 句精度回归 0 误报。
- 判别结果（live 实测）：Parents 条判 证据不足 / 无出处(1) / 推理 0/3、
  decisionRelevant=false（标题+媒体转述，无法院文书引用）；Malaysia 条判
  证据不足 / 无出处(1) / 推理 1/3（has-sample=$12 Million）、
  decisionRelevant=false——标题-only 不虚抬纪律保持（与 v3.8 LWiAI 条/
  v3.10 Uber 条同型）。证伪条件走 legal-action 专属路径（诉讼被法院驳回/
  撤诉/和解且条款与主张情形不符，或执法行动被上诉推翻、处罚/扣押金额被
  改判撤销，或相关指控被主管机关撤回）。类目归 compliance_demand。
- 端到端：引擎候选门（isClaimForm 用同一个模式库）→ discriminateCommercial
  → formatReport KIND_CN「执法/诉讼行动」→ cron 注入第 6 段同标签。live
  实测商业辨别段 audited 22 条，byKind 新增 legal-action:2；其余 kind 计数
  逐一不变（零串台零丢失）。
- 同轮维护（不单独涨号）：① 去重三处 v3.21 重复粘贴的注释（S-1 证据档/
  has-counterexample/ipo 证伪条件与类目映射——v3.21.1 声称顺修过但漏了
  这三处，本轮实测发现并去重）；② 豁免源级断言与 124 处历史版本断言随
  涨号全量同步 3.22.0（corr-2026-026 纪律）；③ v3.3/v3.21/v3.21.1 三处
  模式库计数断言 23→24 同步（v3.2 计数纠错同型纪律）。
- 仍在库外的执法/诉讼句式：bare "lawsuit against" 名词句、"settles with"
  和解句、被动语态（"OpenAI sued by parents"）、"charged/faced charges"
  （名词歧义）、base-form "fine"（名词歧义）、州层立法主体（v3.8 已登记的
  同类边界）——等有 live 实证再扩。登记 corr-2026-041（已知边界的修法预设
  可能与实证所需形态不同——v3.8 边界字面写「扩工具名词」，live 实证需要的是
  「执法主体+执法动词」两段式新维度；过堂已知边界时要按实证句子的结构修，
  不按边界记录的修法修）。

**[v3.23] EDGAR S-1/IPO 备案核查（新数据源：ipo 主张独立验证）**
- 定位：v3.21 给 ipo-claim 立库时写下专属证伪路径「EDGAR 查无/撤回/定价时间表
  不符/挂牌后披露矛盾」，并称「备案文件在 EDGAR 可查……撤回事例可证伪」——但
  四条证伪条件里没有任何一条有数据支撑：EDGAR 采集层自 v3.4 起只收 14 家公司
  的 8-K Item 2.02，从来不去查任何 S-1（登记 corr-2026-043：「证伪路径写成
  可观测条件」≠「引擎能执行该检查」——新维度立库时必须把证伪路径逐条分成
  「引擎现在有数据能查」与「需人工/下游执行」两类）。live 实证的后果：
  MIT Tech Review「After weeks of frenzied speculation, Anthropic has filed
  its IPO prospectus.」（2026-10-26，tech 桶）在 v3.22.1 轮被判
  weak-evidence/无出处(1)/decisionRelevant=false——而 Anthropic, PBC
  （CIK 0002130357）确实于 2026-10-26 向 SEC 提交了 S-1（accession
  0001628280-26-067168，2026-10-29 browse-edgar 实测），主张的事实核心经
  一手登记记录完全成立。连带事实：独立验证(4) 证据档自 v3.0.0c 起只认文本里
  的「independently verified by X / third-party audit」标记，立库 22 个版本
  从未被真实数据触发过。
- 数据源（edgar-ipo-collector.js，新模块）：browse-edgar 公司检索
  （www.sec.gov/cgi-bin/browse-edgar，output=atom）——按公司名让 SEC 自己做
  公司归一化（conformed-name + CIK），再取该公司的 S-1 族备案（type=S-1 覆盖
  S-1 与 S-1/A）。选它而不是全文本检索（efts.sec.gov）的原因：ipo 主张的
  证伪条件是**逐公司**的（「这家公司有没有备案」），全文本检索的召回取决于
  查询措辞（实测 q="artificial intelligence" 30 天 99 条命中，前 15 条全是
  空壳公司，Anthropic 反而不在头部），按公司名查才是证伪路径要的语义。
  只做备案存在性核查，不采集、不估计任何非公开信息。
- 流程（run-pipeline 阶段 3.5，generate 之后、formatReport 之前）：逐条 ipo
  主张 → 提取公司名候选（claimSentence 优先；双空格切分+停用词修剪+首 token
  补候选；来源名包含的候选跳过）→ 逐个查 browse-edgar（120ms 间隔 + 单轮
  预算 12 次 + run 内 memo）→ 第一个「候选名通过 token 包含守卫 且 窗口内有
  S-1 族备案」的公司即匹配 → edgarVerification 挂回 claim 重跑辨别器
  （证据档/verdict/decisionRelevant 重算全在辨别器内，编排层不代判）。
- 精度设计（不虚抬，全部有断言）：① 只升**备案动作形态**（IPO_FILING_ACTION_
  RE：files/filed/filing/submits + S-1/IPO/public debut）且 matched 的主张
  ——文书主体（「S-1 Takeaways」类内容主张）与承销牵头（「Goldman to Lead
  IPO」类）匹配到同一份 S-1 也只记「· 在案」上下文，不抬档（内容与承销商
  身份需 424B4/备案正文核对，本轮不采）；② 365 天在办窗口——live 实证
  Mistral Acquisition CO 的 S-1/A 全是 2008 年，不过滤会把历史备案当成在办
  IPO；③ 公司名 token 包含守卫（候选每个 token 都须出现在 SEC 归一化公司名
  里，"Anthropic" ⊆ "Anthropic, PBC"）——防 SEC 模糊匹配把无关公司算成
  主张主体（实测查询 "After"/"The" 返回 SEC 坏数据 name="ARRAY(0x...)"，
  无 conformed-name 直接判 found=false）；④ 未匹配不抬级也不判假（「EDGAR
  查无」是证伪条件之一，公司名匹配是启发式，不等于已证伪）；⑤ 推理三要素
  独立计分，抬档不改推理分（MIT TR 条 0/3 仍是 0/3）；⑥ 查询失败（网络/
  解析，区别于「查无此公司」）整体降级 available=false 并写明原因，不把
  「查不到」扮成「查无」；⑦ 非 live 模式（FETCH!=1）不发起查询。
- 端到端：引擎候选门（六桶）→ 辨别 → 阶段 3.5 EDGAR 核查 → formatReport
  「EDGAR 核查: ✅/·/○/不可用」四形态行 + 「IPO 主张 EDGAR 核查」汇总行 →
  cron 注入第 6 段同标签（四种形态与汇总都注入——引擎产出了但 agent 看不到
  的同型断链不能再犯）。live 实测：1 条 ipo 主张核查、1 次 SEC 查询、
  验证 1（独立验证(4)），零漂移 diff 见「当前状态」段。
- 同轮维护（不单独涨号）：① 汇总计数抽为 summarizeCommercial（辨别器导出，
  buildCommercialDiscrimination 与 verifyIpoClaims 共用）——辨别后重跑结果
  必须重算汇总，否则报告头部「决策相关 12 条/证据等级分布」与逐条结果
  自相矛盾（引擎自己要抓的口径错位）；② formatReport 候选池描述补六桶
  （v3.22.1 只同步了注入脚本、漏改渲染层）；③ ipo-claim 正则拆出命名子形态
  IPO_FILING_ACTION_RE 并导出——备案动作子形态的单一事实来源（辨别器与
  核查器共用，防两处正则漂移，corr-2026-013/026 同型纪律），正则源文本与
  v3.21 立库时逐字一致（拆常量不改行为，15 条用例实证）。
- 仍在库外的 ipo 证伪条件（如实）：撤回（RW 备案）与定价（424B4）**[v3.24 已接
  真数据：submissions 登记记录观测，见 [v3.24] 章节]**；剩余挂牌后披露矛盾
  （挂牌后定期报告与 S-1 主张逐条对账）仍无数据支撑，由人工/下游 agent 执行；
  公司名匹配是启发式（单 token 候选可能匹配到无关公司），matched 记录带公司与
  accession 供逐条复核。
- 版本号理由：新数据源 + 新认知能力（ipo 主张独立验证，独立验证(4) 档首次
  被真实数据触发）且用户可感知（报告与注入首次出现「EDGAR 核查」行与
  「独立验证(4)」证据档）= x.0。

**[v3.24] ipo 证伪路径第二、三条：撤回 RW / 定价 424B4（新认知能力，submissions 登记记录）**
- 定位：v3.23 立档时把「撤回（RW 备案）、定价区间（424B4）、挂牌后披露矛盾」
  整批列为「不做也不假装做、留人工执行」——但 browse-edgar 的 type=S-1 只是
  SEC 的一个端点。同一公司的 submissions API（data.sec.gov，按 CIK）一次查询
  即返回全表单族的登记记录，撤回与定价都是可观测的公开登记事件（登记
  corr-2026-044：「引擎不能执行」≠「没有数据支撑」——写已知边界时要区分
  「没有数据源」与「没接数据源」，接新数据源时要扫该机构的其它端点）。
  live 实证（2026-10-29 browse-edgar + data.sec.gov 实抓逐字）：Chobani Inc.
  （CIK 0001869113）S-1 2021-11-17 → RW 2022-09-02（相隔 289 天，同在 365 天
  窗口——IPO 撤回的可观测形态）；Cerebras Systems Inc.（CIK 0002021728）
  S-1 2024-09-30 → RW 2025-10-03（撤回）→ 再备案 S-1 2026-04-17 → 424B4
  2026-05-14（定价）——撤回过又再来的完整过程；Mobileye Global Inc.（CIK
  0001910139）S-1 2023-06-05 → 424B4 2023-06-08；Mobileye B.V.（CIK 0001607310）
  RW 2018-02-07（窗口过滤负例）。
- 数据源与选型（全部 live 实证，不用 browse-edgar 的 type=RW/424B4 的原因）：
  ① browse-edgar 的 type 参数**只生效第一个**——type=S-1&type=RW&type=424B4 与
  type=S-1 返回完全相同（Mobileye 组合查询只有 S-1 族）；② 同名不同 type 会
  解析到不同公司——「Mobileye」+type=S-1 解析到 Mobileye Global Inc.（CIK
  0001910139），+type=RW 解析到 Mobileye B.V.（CIK 0001607310），事件必须锚定
  S-1 匹配到的同一 CIK 才是同一实体；③ 一个 CIK 查询覆盖全部表单族，比按表单
  类型多次查询省请求数（单轮预算 12 次内：live 每条约 2 次查询）。
- 流程（edgar-ipo-collector.js）：逐条 ipo 主张 → 公司候选查 browse-edgar
  （type=S-1，v3.23 逻辑不变）→ 匹配到（或首个过包含守卫）的公司按 CIK 查
  submissions → parseSubmissionEvents 取 S-1/RW/424B4 族登记记录 →
  pickRecentByForm 取 365 天窗口内最近的 RW/424B4 → events 挂回 claim 重跑
  辨别器（只透传，不代判）。run 内 memo 两级：候选名 → S-1 结果、CIK →
  submissions 结果。
- 精度设计（不虚抬，全部有断言）：① 事件只作可观测上下文——不抬证据档、
  不改 verdict、不改推理分：备案动作主张的事实核心（备案是否存在）由 S-1
  记录验证，事件不推翻已发生的备案；撤回是「IPO 在办」类主张证伪路径的
  可观测条件、定价是流程推进的可观测事件，但结合主张时点判断是否证伪由
  下游 agent 做，引擎不代判（MIT TR 条抬档后若公司撤回，报告同时显示
  「独立验证(4)」与「RW 撤回备案在案」两个事实，不互相掩盖）；② 按 CIK
  查锚定同一实体（Mobileye 双公司 live 实证）；③「查了但没有事件」与
  「查不到」分开——前者 eventsAvailable=true 的空事件（Anthropic live
  实证：S-1 在案、窗口内无 RW/424B4），后者 eventsAvailable=false + reason
  且 S-1 核查结论不受影响（available 不变）；④ 窗口纪律与 S-1 一致：365 天
  外的历史登记不算在办事件（Mobileye B.V. RW 2018-02-07、Cerebras RW
  2025-10-03 距 live 时点 391 天均不算撤回）；⑤ 非 live 模式不发起任何
  查询（含 submissions）。
- 端到端：formatReport 的「EDGAR 核查」四种形态行带事件后缀（✅/·/○ 行尾
  追加「；RW 撤回备案 YYYY-MM-DD 在案（IPO 已撤回）/；424B4 定价备案
  YYYY-MM-DD 在案（IPO 已定价）」）+ 事件查询失败时单独渲染「EDGAR 事件:
  不可用——原因」行（不把「事件查不到」静默成「窗口内无事件」）+ 汇总行
  「流程事件 N 次 submissions 查询（撤回 X / 定价 Y）」；cron 注入第 6 段
  同措辞同步（四形态 + 事件后缀 + 事件不可用行 + 汇总计数）。
- 判别结果（live 实测）：本期 1 条 ipo 主张（MIT TR/Anthropic）核查、2 次
  SEC 查询（1 browse-edgar + 1 submissions）：S-1 在案升独立验证(4)（v3.23
  行为不回退），窗口内无 RW/424B4（eventsAvailable=true，撤回 0/定价 0——
  无事件≠不可用）。夹具驱动的真实案例判定：Chobani 备案动作主张 matched
  S-1 + withdrawal 事件、Cerebras matched S-1/A + pricing 事件（RW 超窗不算）、
  Mobileye B.V. 无 S-1 匹配 + withdrawal 上下文（不抬级）。
- 同轮维护（不单独涨号）：辨别器 edgarIpoCheck 透传 events/eventsUnavailable
  Reason 两字段；run-pipeline 与 project-future main 块的控制台输出带流程
  事件计数。
- 仍在库外的 ipo 证伪条件（如实）：只剩挂牌后披露矛盾（挂牌后定期报告与
  S-1 主张逐条对账）无数据支撑，由人工/下游 agent 执行；公司名匹配是启发式
  （单 token 候选可能匹配到无关公司），matched 与事件记录都带公司/CIK/
  accession 供逐条复核。
- 测试 462→475 项（v3.24 新增 13：live 撤回实证/live 定价实证+窗口/事件
  不改判定/无 S-1 匹配+RW 上下文/窗口过滤/纯函数/URL 纯函数/引擎端到端/
  事件降级/非 live/CIK 归属 memo/注入源级/源级+计数+版本）。
- 版本号理由：新认知能力（ipo 证伪路径四条中第二条、第三条接上真数据，
  引擎从「只能查备案存在性」扩展到「能观测撤回与定价事件」）且用户可感知
  （报告与注入首次出现事件后缀行与流程事件计数）= x.0。

**[v3.26] 客户成效/ROI 主张（customer-outcome，新辨别维度）**
- 定位：采用证据链的第五形态缺口。v3.11 立库 usage-metric 时把采用证据枚举成
  「趋势主张（adoption）/具名部署（deployment-scale）/用量状态（usage-metric）」
  三类、v3.12 扩成四类（+算力承诺 compute-infra），两轮都漏了**采用的结果**：
  客户用 AI 之后到底有没有成效（ROI/节省/生产率）——而这是企业采购方最关心
  的证据形态，也是厂商案例研究（case study）里唯一带量化结果的句子。漏掉它，
  商业辨别对「采用的价值」失明：只看得见部署了多少席位、处理了多少 token，
  看不见部署之后发生了什么。2026-10-31 全池过堂（corr-2026-028 纪律：312 条
  live 池逐桶过形态门、未命中条目逐条过堂）live 实证：OpenAI News「Credit
  Saison achieves 954% ROI in a ChatGPT Enterprise pilot」（2026-10-29 在窗，
  frontier_models 桶）——扩容前 24 种形态全部不命中，整条不进辨别。
- 形态族（两族，全部 live 实证驱动）：A 成效动词 + 量化值 + 成效名词
  （数值在前）：「achieves 954% ROI」「delivered 954% ROI」（Credit Saison
  live 逐字两句式）；B 成效名词 + of + 量化值（名词在前）：「an ROI of
  954%」「cost savings of $12 million」。成效名词族：ROI / return on
  investment / (cost) savings / productivity (gain|improvement|uplift) /
  efficiency (gain|improvement) / cost reduction / payback；动词族只认成效
  达成动词（achieve/deliver/generate/realize/report/record/post/see）。
- 精度设计（v3.0.0c/v3.2/v3.3/v3.6/v3.7/v3.9/v3.10/v3.11/v3.12/v3.21/v3.22
  教训：漏报比误报诚实、没有实证不扩模式）：① 必须「量化值 + 成效名词」相邻
  共现（中间只容忍空白）——live 实证 ServiceNow 8-K「most enterprises are
  still searching for AI's ROI, ServiceNow is the platform delivering it」
  含 ROI 名词与 delivering 动词但**无任何数字**，整个不命中（无量化值的 ROI
  谈论不是可证伪主张，v3.6/v3.9/v3.10 同型纪律）；② 成效名词族不含
  revenue/margin/income/orders——厂商自身财报句（GOOGL「revenues increased
  48% to $17.7 billion」）是 demand 地盘不是客户成效；不含 costs 裸名词——
  TCO 效率句（NVDA「35x lower cost」）按 v3.9 已决议不进库；③ 动词族不含
  found——survey-finding 地盘（「survey of 1,200 enterprises found 34%」）
  不抢；④ 数值与名词之间不容长间隔——"$12 million in annual savings" 形态
  （in 间隔）无 live 实证不进库；⑤ 「has/have + 成效名词」形态（"the pilot
  has a 6-month payback"）无 live 实证不进库，动词族只收成效达成动词。
  live 全池实测（312 条池）：精确命中 1 条（即 Credit Saison 条），8 句精度
  回归 0 误报，旧 24 种代表句式零漂移（不串台测试钉住）。
- 同轮修复模式自身缺陷（登记 corr-2026-048）：A/B 两分支名词族的
  improvement/uplift 缺复数形态——live 夹具「The rollout delivered
  efficiency improvements of 18%.」（复数）整句漏采，而首版召回夹具的
  produced 又不在动词族，两层缺陷各自单独看都像「设计如此」。修法：名词族
  统一 improvements?/uplifts?（A/B 两分支共 4 处同改）。
- 判别结果（live 实测）：Credit Saison 条判 证据不足 / 无出处(1) / 推理 1/3
  （954% 命中 has-sample，无对照无反例）、weak-evidence、decisionRelevant
  =false——厂商一手公告句式自身无归属词（无 "we/our"），等价名方确认或第三方
  报道交叉验证（v3.10 Uber 条同型）。证伪条件走 customer-outcome 专属路径
  （客户方公开确认或独立审计的 ROI 测算与主张值不符、下一期同口径自报值
  回落、第三方测算不支持、或「成效」实为口径变化——统计窗口/基线年替换/
  成本项漏计/样本自选）。类目归 market_claims。
- 端到端：引擎候选门（六桶）→ discriminateCommercial → formatReport
  KIND_CN「客户成效/ROI 主张」→ cron 注入第 6 段同标签。live 实测商业辨别段
  audited 21 条，byKind 新增 customer-outcome:1，其余 kind 计数逐一不变
  （零串台零丢失）；模式库计数 24→25。
- 仍在库外的成效句式：in 间隔形态（"$12 million in annual savings"）、
  has/have+成效名词语法（"the pilot has a 6-month payback"）、produce 类
  未枚举动词——等有 live 实证再扩。

**[v3.22.1] 商业辨别候选池白名单漏桶修复（断链修复，维护级，非新辨别维度）**
- 定位：候选池白名单是逐桶的活结论——corr-2026-027（v3.10「候选池桶白名单
  是另一种断链：采集了但辨别器从不看」）同型第五波。2026-10-29 全池测量
  （corr-2026-028 纪律：312 条 live 池逐桶过形态门，候选桶未命中 256 条
  逐条过堂）live 实证 tech 与 humanities 两桶采集了（tech 22 + humanities
  12）但商业辨别候选池自 v3.10 起只有四桶白名单（business/sec_filings/
  frontier_models/economy）——tech 桶 22 条里 2 条真实商业主张整个在
  辨别外：MIT Tech Review「After weeks of frenzied speculation, Anthropic
  has filed its IPO prospectus.」（ipo-claim 形态：filed + IPO prospectus
  ——v3.21 立库时只过了 business/frontier_models 两桶的堂，7 条 Anthropic
  IPO 集群 live 实证全来自这两桶，没过「全部已采集桶」的堂）与 Ars
  Technica「Enterprises keep buying software upgrades that IT thinks will
  make things worse  Survey of 2,018 IT heads at big firms…」（adoption +
  第三方调查(3)）。候选池差集审计（projection 字段 vs 注入脚本）抓不到这种
  断链——两头都「没有」这个字段，只有逐桶过形态门的全池测量能抓到。
- 修复：PICK_BUCKETS 四桶→六桶（+tech 6 / +humanities 4，排在 economy
  之后，business 第一优先纪律不变、v3.10 断言钉住；humanities 12 条本轮
  0 命中、无 live 实证，同型补齐防同类漏桶、cap 兜底今天不加条目）。
  live 端到端：商业辨别段 audited 22→24 条含 ipo:1/adoption 新条目
  （MIT TR 条判 weak-evidence/无出处(1)/推理 0/3/decisionRelevant=false
  不虚抬——科技媒体转述无 S-1 文书引用标记；Ars 条判 thin-reasoning/
  第三方调查(3)/推理 0/3/decisionRelevant——有描述有调查口径，与标题-only
  条不同级，v3.7 Apollo 条同型路径）；其余 kind 计数逐一不变（零串台零丢失），
  渲染/注入上限 30 未触顶；forecast 辨别 106 条与结算段（幂等 0 新结算/
  跳过 6/pending 60、ledger brier 0.2377/样本 16 不变）逐条 diff 零漂移；
  模式库计数 24 不变（扩桶不加 kind，v3.21.1 同型纪律）。
- 同轮精度修复（维护级，被桶修复暴露的 live 实证）：has-counterexample
  的 yet 只认让步位（句首或标点后）——MIT TR 主张上下文「the clearest
  picture yet of…」与 ORCL funding 条「We have not yet initiated the
  at-the-market equity portion」的 yet 是时间副词（「迄今」）不是反例
  让步，却把两条主张的推理分各自虚抬 1 分（corr-2026-024 短词歧义家族
  第四次实证：Apollo/poll → demo/democracy → debut/but → yet；全池另实测
  debut/distributed/contribute 等 11 条候选误报面的同族方法：按位置分工）。
  修复后 ORCL 条推理 2/3→1/3（verdict 仍 factual——证据档先行于推理分，
  事实判定不变）、MIT TR 条 1/3→0/3 不虚抬；让步形态（句首 Yet / 逗号
  yet）仍算反例，修复只摘时间副词不打穿真反例。
- 端到端：引擎候选门（六桶）→ discriminateCommercial → formatReport
  KIND_CN「IPO/上市过程主张」「采用主张」→ cron 注入第 6 段（候选池描述
  同轮同步为「business/economy/tech/humanities 媒体 + SEC 备案/厂商一手
  公告」——本机注入脚本不在版本控制，改前备份 .bak-20261029）。
- 测试 439→449 项；5 轮反向验证全部精确失败（摘除 tech 桶→引擎级/源级/
  渲染多条/摘除 humanities 桶→源级（精度门是负向断言，摘桶后负例「更真」抓不到，源级断言才是它的钉子）/摘除 yet 让步位约束→live 实证
  +时间副词三形态+ORCL 影响面/摘除注入池描述更新→注入源级/版本漂移→多处）。
  登记 corr-2026-042（候选池白名单是逐桶的活结论——每轮全池测量必须输出
  全部已采集桶的形态门命中分布，不只当轮新形态的桶）；登记簿 40→41 条。
- 版本号理由：断链修复+同轮精度修复=末位补丁（3.22.1）。用户铁律「修 bug
  算维护，禁止拿维护报升级」——本轮无新辨别维度/新数据源/0 调用模块接入，
  不涨 x.0。

**[v3.21] IPO/上市过程主张（ipo-claim，新辨别维度）**
- 定位：资本与商业模式域的覆盖缺口，且是一次「否定式覆盖决议腐烂」——
  v3.3 曾把 IPO 整体排除在模式库外，理由「估值形态已覆盖该条」，该决议
  未经全池测量（corr-2026-038/039 同型第四次实证）。2026-10-27 全池过堂
  live 实证：2026-10-26 一天内 **7 条** Anthropic S-1/IPO 过程主张整个
  在库外，估值形态（要 $估值额）一条也覆盖不到：TechCrunch AI
  「Anthropic's IPO filing reveals its strategy for keeping enterprise
  customers hooked」（S-1 披露交叉销售数据）、「Anthropic officially
  files for its public debut」、The Information「Anthropic S-1 Highlights
  Rising Payment Costs」「Anthropic's S-1 Takeaways: From Giant Compute
  Commitments to Complex Lock-Ups」「Anthropic Publicly Files S-1 for Its
  Planned IPO」「Goldman Sachs to Lead Anthropic IPO」与 Transformer
  News 简报内句「Anthropic is reportedly planning to publicly file for
  an IPO as early as today」。IPO 过程（S-1 备案 → 定价 → 挂牌 → 锁定期
  解禁）是资本市场一阶信号，且有天然结算结构：备案文件在 EDGAR 可查、
  定价区间与挂牌时点可观测、撤回事例可证伪——与 regulatory-action
  （提案→最终规则）、ma（探索→交割）同构。
- 形态族（三族，全部 live 实证驱动）：① 备案动作（files/filed/filing/
  submits + S-1/IPO/public debut）；② 文书主体（S-1/IPO + filing/
  takeaways/highlights 名词形态——动词形态无 live 实证不进库，MIT TR
  修辞疑问句 "Will the IPO reveal…" 实测收紧）；③ 承销牵头（lead/
  leads/led/leading/underwrites + [^.!?]{0,40} + IPO/offering/
  listing/debut）。
- 精度设计（v3.0.0c/v3.2/v3.3/v3.6/v3.7/v3.9/v3.10/v3.11/v3.12 教训：
  漏报比误报诚实、没有实证不扩模式）：① 不认裸 IPO 名词——"ahead of
  IPO"（估值形态地盘，v3.3 原决议）与 "pre-IPO round" 无备案/挂牌动作
  动词，整个不命中；② 不抢融资/交易地盘——"locks in $40B GPU
  financing deal"（funding 候选）、"Nears Deal to Buy Instacart in
  $17 Billion Deal"（ma 候选）无 IPO/S-1 标记，全部不命中；③ 事件型
  no-quantity 豁免（v3.8 regulatory-action 同型）：IPO 过程主张的证伪靠
  「备案是否存在/是否撤回/是否挂牌」可观测事件，不靠量化基数——
  "Goldman Sachs to Lead Anthropic IPO" 无数字但不是不可证伪。豁免只摘
  no-quantity，推理三要素仍独立计分。
- 同轮配套（v3.21）：① public-filing 证据档补 \bS-1\b 窄标记——S-1 是
  SEC 公开备案文书，与 10-K/10-Q 同族（v3.8 政府机构一手文书/v3.10 SEC
  EDGAR 采集源同型扩展）；不认裸 IPO 名词，"Goldman Sachs to Lead
  Anthropic IPO" 是媒体转述无文书引用，仍归无出处(1) 不虚抬；
  ② 专属证伪路径（EDGAR 查无/撤回/定价时间表不符/挂牌后披露矛盾）+
  capital_flow 类目 + KIND_CN 双处（报告+注入）。
- 判别结果（live 实测）：7 条全部进辨别（business 6 + frontier_models
  1）。S-1 句归公开财报/公告(3) 判 thin-reasoning+决策相关；无文书引用
  与简报转述句（reportedly）留无出处(1)/媒体报道(2) 判 weak-evidence、
  不虚抬。证伪条件走 ipo 专属路径。类目归 capital_flow。
- 同轮精度修复（维护级，全部 live 实证驱动）：① competitive 动词族
  摘除裸 leads?——2 条命中全是误报（"who leads OpenAI's enterprise
  product team" 团队管理、"Goldman Sachs to Lead Anthropic IPO" 承销
  牵头）、0 条真正命中；「leads the market」无 live 实证留已知边界；
  ② has-counterexample 补 \b 词边界——本轮 live 夹具暴露的 latent
  缺陷："files for its public debut" 的 "debut" 含 "but" 子串，把 IPO
  主张推理分从 0/3 虚抬到 1/3（corr-2026-024 Apollo/poll 同型第三次
  实证；全池另实测 debut/distributed/contribute/debugging/
  distribution/attribute 11 条候选误报面）。
- 仍在库外的资本句式：无备案/挂牌动作的裸 IPO 谈论（"ahead of IPO"、
  "pre-IPO round"——估值/融资地盘）、定价与挂牌事件形态（"prices its
  IPO"/"begins trading"——无 live 实证不进库）、"leads the market"
  （competitive 动词族摘除后的已知边界）——等有 live 实证再扩。

**自我修正登记簿层（v3.1 接入的 0 调用模块）**
- 定位：这是接入，不是新写。self-correction-ledger.js 自 v2.4 存在，
  `human-future/data/self-corrections.json` 有 25 条真实修正（绕月≠登月、
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
- 边界（如实声明）：登记簿 43 条（v3.13 轮新增 corr-2026-030/031、v3.14 轮
  新增 corr-2026-032/033、v3.15 轮新增 corr-2026-034、v3.16 轮新增
  corr-2026-035、v3.17 轮新增 corr-2026-036、v3.18 轮新增 corr-2026-037、
  v3.19 轮新增 corr-2026-038、v3.20 轮新增 corr-2026-039、v3.21 轮新增
  corr-2026-040、v3.22 轮新增 corr-2026-041、v3.22.1 轮新增 corr-2026-042、
  v3.23 轮新增 corr-2026-043、v3.24 轮新增 corr-2026-044 后：
  critical 4 / high 18 / medium 21（含 corr-2026-024/025 两条前轮手写条目
  未设 severity、按 medium 计）——corr-2026-044 记的是「引擎不能执行 ≠
  没有数据支撑」——v3.23 把 ipo 证伪路径的「撤回（RW）/定价（424B4）」整批
  列为「由人工/下游 agent 执行」，但 browse-edgar 的 type=S-1 只是 SEC 的一个
  端点：同一公司的 submissions API（data.sec.gov）按 CIK 一次查询即返回全表单
  族登记记录，撤回与定价都是可观测的公开登记事件（live 实证 Chobani
  S-1 2021-11-17→RW 2022-09-02、Cerebras S-1→RW→再备案→424B4 全过程）；
  写已知边界时要区分「没有数据源」与「没接数据源」，接新数据源（或给能力
  写证伪路径）时要扫该机构的其它端点，不能因第一个端点只覆盖一类表单就
  判定其余需人工；
  corr-2026-043 记的是「证伪路径写成可观测
  条件 ≠ 引擎能执行该检查」——v3.21 立库 ipo-claim 时写下证伪路径「EDGAR
  查无/撤回/定价时间表不符/挂牌后披露矛盾」，但四条里没有任何一条有数据
  支撑（EDGAR 采集层只收 8-K，从不查 S-1），live 实证 MIT TR「Anthropic
  has filed its IPO prospectus」被判无出处(1) 而 Anthropic PBC 的 S-1 确实
  在案；新维度立库时必须把证伪路径逐条分成「引擎现在有数据能查」与「需人工/
  下游执行」两类，前者当轮接数据或明确记待接；另：辨别后的任何重判都要连带
  汇总重算（v3.23 抽出 summarizeCommercial 的起因）；
  corr-2026-042 记的是「候选池白名单是逐桶的
  活结论」——tech/humanities 两桶采集了但辨别器从不看（corr-2026-027 同型
  第五波），2026-10-29 全池测量 live 实证 tech 桶 2 条真实商业主张（MIT TR
  IPO prospectus / Ars Technica 调查）被白名单挡在辨别外；每轮全池测量必须
  输出全部已采集桶的形态门命中分布，不只当轮新形态的桶，候选池差集审计
  （projection vs 注入脚本）抓不到这种断链——两头都「没有」这个字段；
  corr-2026-041 记的是「已知边界的修法预设
  可能与实证所需形态不同」——v3.8 边界字面写「执法行动扩工具名词」，
  2026-10-28 live 实证（Malaysia Authorities Seize）需要的是「执法主体+
  执法动词」两段式新维度，按边界字面修法扩库一条也修不好；过堂已知边界时
  要按实证句子的结构修，不按边界记录的修法修（同型：corr-2026-032「在窗
  公司≠采到的指引」——边界记录的是现象，修法必须从现象句子本身推）；
  corr-2026-040 记的是「否定式覆盖决议必须随每轮全池测量刷新」；
  corr-2026-037 记的是「同型缺陷分路径
  各修各的 + 没有触发机会不等于没有问题」——商业辨别路径 v3.10 早有
  forward-looking 免责声明守卫，forecast 路径从来没有；RSS 路径被共享
  断点饿死时 boilerplate 句压根进不了辨别，该分支的缺陷因此沉睡四个
  版本。解锁 RSS 独立额度前的 live 探针实测：免责声明套话能过 forecast
  路径全部抽取门（「undertakes no intent or obligation」含 obligation to
  命中 COMMITMENT，live 原文里与后续描述拼成一句带 2026-03 时间 token，
  或截断在 plans to 上走 form B），辨别器判 bare-assertion 且
  settleable=true——不挡则每轮把法律套话登记进台账污染 Brier 样本；
  且精度夹具必须用能真正触达被测分支的 live 同形句子（第一版夹具用
  单独存在的 disclaimer 句、不过门、断言空转，R2 反向验证报 0 失败
  才发现）；corr-2026-034 记的是「守卫写在本函数里
  ≠ 每条抽值路径都过了哨」——v3.13 给毛利率/EPS/营业利润加了 notFullYear
  全年值守卫（corr-2026-030），营收三形态从 v3.5 落地起从没调过守卫，AMD
  Q4-FY2025 live 实证全年营收 $34.6B 被当成财季实际值索引进
  (AMD|2025|4|revenue)（无 Q4 营收指引所以没造成错结算，但查找表里躺着
  错事实）；corr-2026-029 记的是「反向验证报 0
  失败的新空转形态：用例触达不到被测分支」——v3.12 精度回归用两句金额含
  小数点的营收句钉 accelerate 动词门，小数点的句点切断 [^.!?] lookahead
  段，R7 摘除修复后用例恒真（0 失败），补无小数点营收句才精确失败；
  corr-2026-030 记的是「matchAll 全部匹配时要想同类陈述的其它期间」——
  财报亮点段先本季后全年，全年实际值按标题财季建 key 就是错配（NVDA 02-25
  实测 71.1% 全年毛利率混进 FY26Q4 key），期间守卫窗口还必须截到句边界
  （第一版跨句窗把下一句的全年标记算到本财季值头上，季度值被误杀）；
  corr-2026-031 记的是「传参 ≠ 落账」的端到端断链新形态——settle() 白名单
  式 evidence 构造静默丢弃调用方传的 metric/gaapBasis，而 dedupe 证据 key
  读的正是这两个字段，mock 测试（夹具直接构造 evidence）全绿而 live 数据
  上修复永不生效；断言必须读落账后的字段值；含 corr-2026-024/025
  两条前轮手写条目未设 severity、
  按 medium 计；corr-2026-027 记的是「候选池桶白名单是另一种断链」：SEC 备案与
  厂商一手公告采集了三个版本，商业辨别器的门口却写着「只认 business/economy」，
  「公开财报/公告(3)」证据档从来没有真实财报能触发；corr-2026-028 记的是
  「扩池轮的全池测量只测当轮新形态」：v3.10 把一手桶接进候选池时只问了
  「deployment-scale 命中几条」，没问「还有哪些形态在这两个桶里 MISS」——
  usage-metric（SEC 备案自报席位数/月活/token 吞吐）是同一轮扩池的受益者
  却又漏了一个版本，扩池轮的测量必须输出新桶全部命中按 kind 分布 + 未命中
  条目过堂；
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

**商业主张辨别的已知边界（v3.0.0c 如实声明，v3.8 更新）**：
- 模式库外的真实主张句式仍会漏：v3.2 起 "AWS Largely Sold Out Of Capacity
  Into 2028"（产能主张）已进模式库（capacity-claim，含售罄/耗尽/分配殆尽/
  短缺/需求超供给形态族）；v3.3 起 "Instacart Is Exploring a Sale" 与
  "Ramp Investors Went Nuclear Against Airwallex After Doomed Deal"（并购/
  交易过程主张）已进模式库（ma-claim，含探索/权衡、谈判、交易状态三族）；
  v3.6 起 "Data Center Late Fees Hit $5 Million or More Per Day, Spawning New
  Insurance"（成本/价格信号主张）已进模式库（cost-signal，名词+水平谓语+金额
  三件套相邻共现）；
  v3.7 起 "AI delivers 'zero financial payoff' to most companies, Apollo
  economist says"（专家/机构判断主张）已进模式库（expert-judgment，经济/市场
  分析头衔+判断动词或+机构）；
  v3.8 起 "U.S. Treasury Proposes to Widen Outbound Investment Restrictions
  for China and Other Countries"（监管行动主张）已进模式库（regulatory-
  action，政府/监管主体+规制动词+规制工具名词三段式同句共现；Fed/ECB 主体
  库不含）；
  v3.9 起 "Anthropic launches Claude Fable 5.1 and says it's up to 45 percent
  cheaper for agentic work"（价格下调主张）已进模式库（price-cut，价格
  名词+下调谓语+幅度/下调动词+价格名词+by-to+幅度/幅度+比较级三族；名词族
  只认 prices/pricing 不认 costs，必须有幅度）；
  v3.10 起 "Uber is rolling out ChatGPT Work to more than 30,000 employees"
  与 "ChatGPT Ads expands to 26 new countries as over 100,000 advertisers
  have used the platform"（部署规模主张）已进模式库（deployment-scale，
  部署/扩张动词+量化范围；必须有量化范围，只认部署动词不认合作/scaling/
  产品发布/销售数字），且候选池同轮接入一手信源桶（sec_filings +
  frontier_models，v3.10 前只有 business/economy 两个媒体二手桶）；
  v3.11 起 "Microsoft 365 Copilot reached over 30 million paid seats" 与
  "the Gemini App has 950 million monthly active users"（用量/牵引度
  指标主张）已进模式库（usage-metric，用量状态动词+量化值+用量指标
  名词；必须有量化值+指标名词两件套，subscribers 族与速率上限句有意
  排除，只认数值在前语序）；
  v3.12 起 "accelerate the buildout of more than 5 gigawatts of AI
  factories by 2030" 与 "mobilize over $500 billion of third-party
  capital for the buildout of AI infrastructure"（算力基建承诺/规模
  主张）已进模式库（compute-infra，建设/承诺动词+量化算力或资本+AI
  基建锚点三段同句共现；必须有量化值，裸露 accelerate 与裸 chips 不
  收，资本形态不抢融资/营收地盘）；
  仍在库外的有 "Instacart Shares Rally 10%"（市场反应——可核验的市场价格
  事实，非待辨别主张）、ProductHunt 产品发布（产品公告非市场主张）、
  "Late fees for delayed GPU deliveries exceed $2M"（名词后接长修饰语，
  v3.6 实测放宽间隔会误命中 2 句，保持相邻收紧）、rates/tariffs 等宏观
  看价名词（无 live 实证不进库）、监管执法行动（"Treasury issued a
  $200,000 fine against a U.S.-based company"——v3.8 实测漏报如实记录）
  **[v3.22 已结案：legal-action 新维度进库，live 实证「Malaysian Authorities
  Seize $12 Million Worth of AI Chips in Smuggling Crackdown」与「Parents sue
  OpenAI」两条进辨别；该 AP 原句因 base-form "fine" 有名词歧义（impose
  fines）仍不进库，与 "settles with" 和解句/被动语态/charged 名词歧义同留
  已知边界]**、「SEC's new disclosure rules」类所有格形态、州层立法
  主体（california 等）（均无 live 实证不进库）、无幅度降价谈论
  （"Opus 5.5 with lower prices"——v3.9 按 v3.6 同型纪律留作已知边界
  漏报，等有 live 实证再议）、无量化范围的部署谈话（"brings ChatGPT Work
  to all employees"——v3.10 按同型纪律留作已知边界漏报）、合作/协同公告
  （"OpenAI and Poland's NASK partner to advance AI safety"）、eyes+测试
  计划、政府资助授予（"NIST Awards More Than $1.7 Million"）——均等有
  live 实证再议。
  [v3.11 起仍在库外的用量句式] 名词在前语序（"monthly active users
  reached 950 million"——与 "apps with monthly active users exceeding
  100,000" 类抽样条件句共用正体会误报，按「漏报比误报诚实」留边界）、
  增长率形态（"40% quarter on quarter growth in paid monthly active
  users"——GOOGL 2026-04-29 备案该句在采集正文里被截断，且增长率主张
  的证伪结构与水平值不同）、subscribers 族（有意排除：GOOGL 订阅总量/
  FLI 邮件列表/Suno 音乐服务均非 AI 产品用量）、GOOGL 2026-02-04 备案的
  750M MAU 句（用量句距首个命中句超过 2 句、不在 claim 文本窗内——引擎
  既定语义的漏报，测试钉住）、无量化用量的名词短语——均等有 live 实证
  再议。
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
- `npm test`：**494 项断言**（实测各 section 汇总；v3.4 的 230 + v3.5 新增 11 + v3.5.1 新增 9 + v3.6 新增 8 + v3.7 新增 9 + v3.8 新增 11 + v3.9 新增 8 + v3.10 新增 13 + v3.11 新增 15 + v3.12 新增 14 + v3.13 新增 13 + v3.14 新增 9 + v3.15 新增 10 + v3.16 新增 11 + v3.17 新增 10 + v3.18 新增 6 + v3.19 新增 9 + v3.20 新增 8 + v3.21 新增 16 + v3.21.1 新增 9 + v3.22 新增 10 + v3.22.1 新增 10 + v3.23 新增 13 + v3.24 新增 13 + v3.25 新增 10 + v3.26 新增 9：
  2 项纯结算函数（settleGuidance 单位感知容差：相对/绝对/bps/百分点/区间/无容差
  跳过，含区分相对vs绝对的边界用例 / normalizeMetric+parseMetricValue 单位解析）+
  3 项实际值抽取（extractActuals 营收+毛利率+标题期间 / GAAP/非GAAP 不同值抽出
  两条 / 无标题期间返回空）+
  1 项结算编排（settleEarningsGuidance：hit/miss/歧义跳过/到期门/证据落账/幂等，
  受控台账备份还原）+
  1 项 extractSignals 透传 actuals/ticker+
  1 项 record() 持久化 settlement 元数据+
  1 项 formatReport 渲染结算段（带内判据+beat方向口径限定）+
  1 项 cron 注入源级（guidanceSettlement+汇总+口径限定）+
  1 项版本号一致性（VERSION/package.json/banner 对齐 3.5.0）。
  v3.5 五轮反向验证全部精确失败：摘除 extractActuals matchAll（恢复单 match，
  吞掉 GAAP/非GAAP 歧义）→GAAP/非GAAP 抽出两条断言失败；摘除 settleEarningsGuidance
  调用→formatReport 结算段断言失败；摘除单位感知容差（$+% 误当绝对）→容差断言
  失败（首版用例全判 miss 区分不出相对/绝对，补 $100B±2% vs $101B 边界用例后
  精确失败）；摘除 extractSignals actuals 透传→透传断言失败；摘除 record()
  settlement→持久化断言失败。每轮基线全绿、摘除后断言必生效、diff 校验还原到位、
  收尾基线全绿。
  v3.5.1 新增 9（2 项辨别器元数据透传（guidanceStruct 三字段 + 结果级 ticker，RSS 无 ticker 不崩）+
  2 项采集器实际值扩库（MRVL/MU/AMZN 三种 live 标题形态+营收值 / operating income 与 AWS
  run rate 精度回归）+
  1 项登记元数据完整（落账后字段值非空，不只字段存在）+
  1 项残废历史条目经句反推正确结算（MRVL live 场景复现）+
  1 项跳过理由归因（漂移 vs 滑出，窗口大小引用常量）+
  1 项去重证据 key dueOn（跨财季不误合、同义务不回退）+
  1 项证据来源 actualPeriod 匹配+
  1 项版本号一致性（3.5.1））。
  v3.5.1 八轮反向验证全部精确失败：摘除 guidanceStruct 三字段→2 条失败；摘除结果级
  ticker→1 条；摘除通用标题形态→1 条；摘除 ended 锚→2 条；摘除紧邻 sales 形态→2 条；
  摘除归因区分→1 条；摘除去重 dueOn→1 条；摘除 actualPeriod 匹配→1 条。每轮基线全绿、
  摘除后断言必生效、备份还原到位、收尾基线全绿。
  同轮测试维护：v2.13n「Brier 分数基于真实结算可算出」的 hitRate 断言从 `=== 1`
  放宽为 `∈ [0,1]`——旧断言「全部命中」是台账只有人工 hits 时的偶然状态，v3.5
  自动结算引入真实 miss（NVDA/AMD/MU 营收 beat→带外）后 hitRate 不再恒为 1；
  放宽后意图（校准曲线基于真实结算可算，含 miss）保留。
  v3.6 新增 8（1 项 live 实证命中（The Information「Data Center Late Fees Hit
  $5 Million or More Per Day, Spawning New Insurance」→ kind=cost-signal，
  标题-only 判 证据不足/无出处(1)/推理 1/3 不虚抬）+
  1 项专属证伪条件与类目映射（合同/发票/第三方价格跟踪/回落/豁免；类目映射
  源级断言——兜底类目同为 market_claims，行为断言抓不到摘除）+
  1 项形态族召回（hit/reached/climbed to/average/risen to record levels of/
  exceed + per day/per hour 单位）+
  1 项精度回归 21 句（成本名词单现/无金额谓语/融资估值产能交易监管句/live 池
  原句/已知边界长修饰语句全部不命中）+
  1 项引擎端到端（候选门放行 + formatReport 渲染「类型: 成本/价格信号」行与
  证伪条件——只认渲染出的标签行，note 文本同字符串会喂饱泛匹配）+
  1 项 cron 注入源级（读 ~/.hermes/scripts/hf-cron-fetch.sh 验 cost-signal
  中文标签）+
  1 项精度门未破（Fed 公告/播客仍不进辨别）+
  1 项版本号一致性（VERSION/package.json/banner 对齐 3.6.0））。
  v3.6 六轮反向验证全部精确失败：摘除 cost-signal 模式→6 条失败（live 实证/
  证伪条件/召回/精度/端到端/v3.3 计数断言）；摘除证伪条件条目→1 条；摘除类目
  映射行→1 条（源级）；摘除报告 KIND_CN→1 条；摘除注入脚本 KIND_CN→1 条；
  放宽名词-谓语间隔（now/has/have→0-4 词）→1 条（实测误命中 2 句：would 间隔+
  句末逗号被 [\d.,]+ 吞成金额、已知边界句）。每轮基线全绿、摘除后断言必生效、
  备份还原到位、收尾基线全绿。
  v3.7 新增 9（1 项 live 实证命中（TechCrunch AI「AI delivers 'zero financial
  payoff' to most companies, Apollo economist says」→ kind=expert-judgment，
  判 推理单薄/第三方调查(3)/推理 1/3，decisionRelevant——有描述+第三方机构
  判断，与标题-only 条不同级）+
  1 项专属证伪条件与类目映射（时点后实际数据/第三方调查/后续修订/同业反证；
  类目映射源级断言——兜底类目同为 market_claims，行为断言抓不到摘除）+
  1 项形态族召回三族七形（economist says / analysts at X / chief economist
  at X / senior market strategist sees / according to a X analyst /
  strategists at X expect / fund managers at X see）+
  1 项精度回归 21 句（CEO/executive 自述/scientists/researchers/官员言论/
  analyst 名词短语/The Economist 杂志名/股价反应/播客 boilerplate/调查研究
  发现句/已知边界三段式全部不命中）+
  1 项证据等级（expert 形态归第三方调查(3)、according to 分支同归 3、厂商
  自述不抬级、Apollo 公司名不得因 poll 子串命中——corr-2026-024 防回归）+
  1 项引擎端到端（候选门放行 + formatReport 渲染「类型: 专家/机构判断」行与
  证伪条件——只认渲染出的标签行）+
  1 项 cron 注入源级（读 ~/.hermes/scripts/hf-cron-fetch.sh 验 expert-judgment
  中文标签）+
  1 项精度门未破（Fed 公告/播客仍不进辨别）+
  1 项版本号一致性（VERSION/package.json/banner 对齐 3.7.0））。
  模式库计数 16→17（v3.3 的计数断言同步更新，v3.2 计数纠错同型纪律）。
  v3.7 七轮反向验证全部精确失败：摘除模式→6 条；摘除证伪条件→1；摘除类目
  映射→1（源级）；摘除报告 KIND_CN→1；摘除注入 KIND_CN→1；摘除证据等级
  expert 动词分支→2（第一版 round 6 报 0 失败——"Apollo" 的 poll 子串把
  断言喂饱，修 \b 后才精确失败，即 corr-2026-024 发现过程）；恢复 poll
  无词边界→1。每轮基线全绿、摘除后断言必生效、备份还原到位、收尾基线全绿。
  v3.8 新增 11（2 项 live 实证命中（The Information Treasury 提案标题-only
  → kind=regulatory-action，判 推理单薄/公开财报/公告(3)/推理 0/3、
  decisionRelevant——事件型 no-quantity 豁免生效+机构一手文书证据档；
  LWiAI #251 简报内句「Trump lifts restrictions on Anthropic」→ 同 kind，
  判 证据不足/无出处(1)/推理 0/3 不虚抬——官员个人转述不借名字抬级）+
  1 项专属证伪条件与类目映射（最终规则范围不符/rescind/struck down/推迟/
  收窄；类目映射源级断言）+
  1 项形态族召回（主体/规制动词/工具名词三族十二形：treasury/trump/SEC/
  EU/regulators/ministry + propose/issue/approve/pass/lift/impose/widen/
  rescind + rules/measures/controls/sanctions/law/guidance）+
  1 项精度回归 31 句（Fed/ECB 货币政策公告/NBER 论文/宏观看价句/官员言论/
  厂商自述/股价反应/其它形态库句式/播客 boilerplate 全部不命中）+
  1 项事件型 no-quantity 豁免（监管行动不因无数字判不可证伪，且豁免不碰
  推理分）+
  1 项证据等级分流（Treasury proposed a rule 归公开财报(3)；Trump lifts/
  OpenAI says/Fed chair said 不抬级）+
  1 项引擎端到端（候选门放行 + formatReport 渲染「类型: 监管行动」行与
  证伪条件——只认渲染出的标签行；注意句切分在 "U.S." 句点后断开，主张句
  从 Treasury 起，断言按渲染文本写）+
  1 项 cron 注入源级（读 ~/.hermes/scripts/hf-cron-fetch.sh 验
  regulatory-action 中文标签）+
  1 项精度门未破（Fed 公告/播客/官员言论仍不进辨别——新模式主体库含
  president/trump/government 宽词，重点盯守）+
  1 项版本号一致性（VERSION/package.json/projection meta/run-pipeline meta
  五处对齐 3.8.0））。
  模式库计数 17→18（v3.3 的计数断言同步更新，v3.2 计数纠错同型纪律）。
  v3.8 七轮反向验证全部精确失败：摘除模式（含注释）→8 条（含计数断言与
  精度回归的空模式防护）；摘除证伪条件→1；摘除类目映射→1（源级）；摘除
  报告 KIND_CN→1；摘除注入 KIND_CN→1；摘除 no-quantity 事件型豁免→2
  （live 实证判定变回 unfalsifiable + 豁免断言）；摘除证据等级机构标记
  （恢复原 public-filing 档）→2。每轮基线全绿、摘除后断言必生效、备份
  还原到位（filecmp 校验）、收尾基线全绿。
  v3.9 新增 8（1 项 live 实证命中（LWiAI #343 简报内句「Anthropic launches
  Claude Fable 5.1 and says it's up to 45 percent cheaper for agentic work」
  → kind=price-cut，判 证据不足/无出处(1)/推理 1/3、不虚抬——简报转述的
  厂商自述降价，等价目表/第三方价格跟踪交叉验证）+
  1 项专属证伪条件与类目映射（价目表/第三方 API 价格跟踪与主张值不符/
  口径变化/价格回升；类目映射源级断言——兜底类目同为 market_claims，
  行为断言抓不到摘除）+
  1 项形态族召回三族七形（prices fell 20% / pricing has dropped 40% /
  plunged 60% / cut prices by 30% / lowered its API prices to $0.50 /
  45 percent cheaper / 3x cheaper than）+
  1 项精度回归 18 句（TCO 效率句 NVDA「35x lower cost」/ ORCL「at a lower
  cost」/「Operating costs fell 40%」/ cheaper to manufacture / 无幅度降价句
  「with lower prices」「costs are falling」「API prices are falling」/宏观
  看价句/其它形态库句式/boilerplate 全部不命中）+
  1 项引擎端到端（候选门放行 + formatReport 渲染「类型: 价格下调主张」行与
  证伪条件——只认渲染出的标签行）+
  1 项 cron 注入源级（读 ~/.hermes/scripts/hf-cron-fetch.sh 验 price-cut
  中文标签）+
  1 项精度门未破（Fed 公告/播客/无幅度降价谈论/TCO 效率句/官员言论仍不进
  辨别）+
  1 项版本号一致性（VERSION/package.json/banner/projection meta/run-pipeline
  meta 五处对齐 3.9.0））。
  模式库计数 18→19（v3.3 的计数断言同步更新，v3.2 计数纠错同型纪律）。
  v3.9 八轮反向验证全部精确失败：摘除模式（含注释）→6 条（live 实证/
  证伪条件/召回/精度/端到端 + v3.3 计数断言）；摘除证伪条件→1；摘除类目
  映射→1（源级）；摘除报告 KIND_CN→1；摘除注入 KIND_CN→1；放宽精度①
  （Form A 去幅度要求）→1（「API prices are falling」误命中）；放宽精度②
  （名词族加 costs）→1（「Operating costs fell 40%」误命中）；放宽精度③
  （Form C 去比较级后置约束）→1（「cheaper to manufacture」误命中）。每轮
  基线全绿、摘除后断言必生效、备份还原到位（filecmp 校验）、收尾基线全绿。
  v3.10 新增 13（1 项 live 实证命中（OpenAI News「Uber is rolling out
  ChatGPT Work to more than 30,000 employees」→ kind=deployment-scale，
  判 证据不足/无出处(1)/推理 1/3、不虚抬——厂商一手公告句式自身无归属词）
  + 1 项 live 实证命中（「ChatGPT Ads expands to 26 new countries as over
  100,000 advertisers have used the platform」→ 同 kind，100,000 advertisers
  与 26 countries 双重量化命中 has-sample）
  + 1 项专属证伪条件与类目映射（部署方否认/席位数覆盖面不符/暂停缩减回滚；
  类目映射源级断言——兜底类目同为 market_claims，行为断言抓不到摘除）
  + 1 项形态族召回六形（rolling out to 30,000 employees / expands to 26
  new countries / deployed across 12,000 seats / bringing to 500 enterprise
  customers / launched to 100,000 users / expand to 15 countries）
  + 1 项精度回归 12 句（无数量部署谈话/合作公告/基础设施 scaling/销售数字/
  政府资助/测试计划/产品清单/其它形态库句式全部不命中）
  + 1 项精度回归 ma 收紧（泛指交易假设句不命中；the deal fell through/
  talks collapsed/doomed deal/exploring a sale 仍命中）
  + 1 项引擎级一手信源接入（GOOGL 备案量化主张与 Uber 一手部署主张进辨别，
  前者证据档=公开财报/公告(3)；MU/CRWV 免责声明与 Project Swap 假设句被挡）
  + 1 项引擎端到端（候选门放行 + formatReport 渲染「类型: 部署规模主张」行
  与证伪条件——只认渲染出的标签行）
  + 1 项引擎端到端 SEC 备案（「类型: 需求主张 | 来源: SEC EDGAR」+
  「证据: 公开财报/公告(3)」+「[推理单薄]」）
  + 1 项 cron 注入源级（读 ~/.hermes/scripts/hf-cron-fetch.sh 验
  deployment-scale 中文标签）
  + 1 项证据档不虚抬（同句 source=The Information 不升 public-filing，
  防来源字段被滥用）
  + 1 项精度门未破（Fed 公告/播客/无数量部署谈话/合作公告/免责声明/
  泛指交易假设句/官员言论仍不进辨别——新桶是重点盯守对象）
  + 1 项版本号一致性（VERSION/package.json/banner/projection meta/
  run-pipeline meta 五处对齐 3.10.0））。
  v3.10 八轮反向验证全部精确失败：摘除模式（含注释）→6 条（live 实证×2/
  证伪条件/召回/精度/端到端 + v3.3 计数断言）；摘除证伪条件→1；摘除类目
  映射→1（源级）；摘除报告 KIND_CN→1；摘除注入 KIND_CN→1；摘除候选池扩桶
  （PICK_BUCKETS 改回 business/economy）→2（两条一手信源端到端断言）；
  摘除免责声明守卫→1（MU/CRWV boilerplate 进辨别）；摘除 ma lookbehind→1
  （Project Swap 假设句进辨别）。每轮基线全绿、摘除后断言必生效、备份
  还原到位（filecmp 校验）、收尾基线全绿。
  同轮维护（不单独涨号）：6 处历史版本断言硬编码当前版本号（v3.4/v3.5/
  v3.5.1/v3.6/v3.7/v3.8 各段），涨号时同步更新——上轮把 v3.4 段断言名称
  留在「（3.7.0）」而代码已改 3.8.0，名称腐烂两个版本，本轮连名称一起
  改正；package.json description 把 v3.8 测试数写成 276（实为 267+11=278，
  SKILL.md frontmatter 一直是 278），本轮按实测改正。
  v3.11 新增 15（1 项 live 实证命中（MSFT 备案「Microsoft 365 Copilot
  reached over 30 million paid seats」→ kind=usage-metric，判 推理单薄/
  公开财报/公告(3)/推理 1/3、decisionRelevant——SEC EDGAR 采集源归公开
  财报档，v3.10 证据档扩展同型）+ 1 项 live 实证命中（GOOGL 备案
  「Gemini models now process 22 billion API tokens per minute and the
  Gemini App has 950 million monthly active users」→ 同 kind，同判）+
  1 项 live 实证命中（GOOGL 2026-02-04 备案「grown to over 750 million
  monthly active users」→ 同 kind，grown to 动词形态）+ 1 项专属证伪
  条件与类目映射（下一期同口径自报值/第三方用量估算/口径变化；类目映射
  源级断言——兜底类目同为 market_claims，行为断言抓不到摘除）+ 1 项形态
  族召回八形（reached over N paid seats / has N monthly active users /
  grown to over N monthly active users / now process N API tokens per
  minute / process over N tokens per minute / exceeds N daily active
  users / stands at N weekly active users / processes N api calls per
  day）+ 1 项精度回归 10 句（GOOGL 订阅总量/FLI 邮件列表/Suno 音乐服务
  subscribers 族、速率上限 supports 128k tokens per minute、基础设施
  scaling serve 1 billion users、指南文本、营收邻居句、无量化句、调查
  准入条件句全部不命中）+ 1 项不串台（Uber 部署原句 kind 保持
  deployment-scale，kinds 不含 usage-metric）+ 1 项引擎级两条备案用量
  主张进辨别（byKind usage-metric:2；MSFT 条因后 2 句上下文含 "up 27%
  year-over-year" 判 结构完整/推理 2/3，GOOGL 条 推理单薄/推理 1/3）+
  1 项切分修复（源级：project-future.js 两处切分含收尾引号容忍
  lookbehind；行为级：MSFT 条目 claimSentence 是用量句本身 ≤400 字、
  不含拼接进来的 Amy Hood 引语）+ 1 项已知边界如实（用量句距首个命中句
  超过 2 句不进辨别——claim 文本窗是引擎既定语义）+ 1 项端到端渲染
  （formatReport 渲染「类型: 用量/牵引度指标主张 | 来源: SEC EDGAR」+
  「证据: 公开财报/公告(3)」+ 证伪条件行——只认渲染出的标签行）+
  1 项 cron 注入源级（读 ~/.hermes/scripts/hf-cron-fetch.sh 验
  usage-metric 中文标签 + slice(0,25) + 截断披露行）+ 1 项精度门未破
  （Fed 公告/播客/订阅总量/速率上限/无数量部署谈话/合作公告不进辨别）+
  1 项版本号一致性（VERSION/package.json/banner/projection meta/
  run-pipeline meta 五处对齐 3.11.0））。模式库计数 20→21（v3.3 的计数
  断言同步更新，v3.2 计数纠错同型纪律）。
  v3.11 八轮反向验证全部精确失败：摘除模式（含注释）→10 条（v3.11 九条
  + v3.3 计数断言）；摘除证伪条件→1；摘除类目映射→1（源级）；摘除报告
  KIND_CN→1；摘除注入 KIND_CN→1；恢复旧切分正则（两处）→2（源级+行为
  级）；名词族加 subscribers→1（GOOGL 订阅总量句误命中）；动词族加
  supports/allows/offers→2（速率上限句误命中+精度门）。每轮基线全绿、
  摘除后断言必生效、备份还原到位（filecmp 校验）、收尾基线全绿。
  同轮实测教训（已修）：① 摘除模式时 v3.11 测试段曾因 find(...) 返回
  undefined 与 cd.results.filter 抛 TypeError 整段崩溃（反向验证报
  「no summary line」而非精确失败）——模式摘除类测试必须先防护再断言；
  ② 切分修复测试第一版把两个正则硬编码在测试里，摘除代码修复照样过
  （断言空转）——改为源级（读代码数 lookbehind 出现次数）+ 行为级
  （引擎 claimSentence 是用量句本身）双层钉住后才精确失败。
  v3.12 新增 14（1 项 live 实证命中（NVDA 8-K「Strengthened a
  collaboration with CoreWeave to accelerate the buildout of more than
  5 gigawatts of AI factories by 2030」→ kind=compute-infra，判 推理
  单薄/公开财报/公告(3)/推理 1/3、decisionRelevant——SEC EDGAR 采集源
  归公开财报档，v3.10 同型）
  + 1 项 live 实证命中（「Announced strategic partnerships ... to
  mobilize over $500 billion of third-party capital for the buildout
  of AI infrastructure」→ 同 kind，资本+锚点+动词三件套）
  + 1 项 live 实证命中（NVIDIA 博客「export license for 45,000 NVIDIA
  Grace Blackwell GPUs」→ 同 kind，判 证据不足/无出处(1)/推理 1/3、
  不虚抬——厂商博客句式自身无归属词，v3.10 Uber 条同型）
  + 1 项 live 实证命中（CRWV 8-K「accelerate the build-out of more
  than 5 GW of AI factories by 2030」→ 同 kind，同判）
  + 1 项专属证伪条件与类目映射（第三方算力/电力跟踪的交付进度或规模
  不符/基建未落地/意向书未转化；类目映射源级断言——兜底类目同为
  market_claims，行为断言抓不到摘除）
  + 1 项形态族召回八形（secured+export license / deployed+GPUs /
  expand+gigawatts / committed+$ / investing+construct / bring+
  megawatts / under construction+megawatts / mobilize+$）
  + 1 项精度回归 26 句（营收句×5/指引/融资/订阅/售罄/监管/专家判断/
  工程 scaling/政府资助/芯片工艺/无数量规模级句/现有 kind 原句全部
  不命中；第 26 句是无小数点的营收句——R7 空转修复后补，钉住
  accelerate 动词门）
  + 1 项不串台（deployment-scale/usage-metric/cost-signal/funding/
  capacity/price-cut 六个现有 kind 原句 kind 不变、kinds 不含
  compute-infra——新模式追加在模式库末尾）
  + 1 项 has-sample 维护（GW/MW/GPU 数与型号名间隔计入样本，v3.10
  补 employees/countries 同型）
  + 1 项引擎级四条主张进辨别（byKind compute-infra:4；NVDA×2/CRWV
  归公开财报(3)且 decisionRelevant，NVIDIA 博客条无出处(1)不虚抬）
  + 1 项端到端渲染（formatReport 渲染「类型: 算力基建承诺/规模主张 |
  来源: SEC EDGAR」+「证据: 公开财报/公告(3)」+ 证伪条件行——只认
  渲染出的标签行）
  + 1 项 cron 注入源级（读 ~/.hermes/scripts/hf-cron-fetch.sh 验
  compute-infra 中文标签 + slice(0,30) + 截断披露行）
  + 1 项精度门未破（营收句/工程 scaling/政府资助/无数量规模级句/
  Fed 公告/播客不因新形态进辨别）
  + 1 项版本号一致性（VERSION/package.json/banner/projection meta/
  run-pipeline meta 五处对齐 3.12.0））。
  模式库计数 21→22（v3.3 的计数断言同步更新，v3.2 计数纠错同型纪律）。
  v3.12 八轮反向验证全部精确失败：摘除模式→9 条（live 实证×4/证伪
  条件/召回/精度回归/引擎级/端到端 + v3.3 计数断言）；摘除证伪条件→1；
  摘除类目映射→1（源级）；摘除报告 KIND_CN→1；摘除注入 KIND_CN→1；
  去量化值要求（摘除 lookahead 第二段）→3（精度回归+引擎级+精度门，
  "at gigawatt scale" 误命中）；动词族加回裸露 accelerate→1（无
  小数点营收句误命中——第一轮报 0 失败后补回归用例才精确失败，见
  教训②）；摘除 has-sample 算力单位→4（has-sample 断言 + 3 条 live
  实证的推理分断言——$500B 资本句的样本本就由旧正则的 $ 分支覆盖，
  不受影响故不失败）。每轮基线全绿、摘除后断言必生效、备份还原
  到位（filecmp 校验）、收尾基线全绿。
  同轮实测教训（已修）：① 精度回归测试第一版没防护模式被摘除时的
  undefined（v3.11 同型教训的第二次实证）——先防护再断言后才精确
  失败；② R7 反向验证第一轮报 0 失败（断言空转）——根因是两句营收
  回归用例的金额含小数点（"$62.3"/"$2.739"），句点把 [^.!?] 段
  切断，动词族加回 accelerate 也跨不过段，用例证明不了动词门；补
  一句无小数点的营收句后 R7 精确失败。教训：反向验证报 0 失败时
  必须查「是修复无效还是用例触达不到被测分支」，不能改完预期数字
  就收工；③ 小数点切断 [^.!?] 段是 lookahead 同句判定的附带性质——
  金额含小数点的句子跨段共现会被自动阻断（对营收句是有利防线；
  对真主张如 Firebird 的 "U.S. export license for 45,000 GPUs"
  会被 U.S. 句点切碎、主张句从片段起，已知边界如实记录）；④ 反向
  验证驱动第一版对 .sh 注入脚本误用 node --check（bash 脚本报语法
  坏）——改用 bash -n 后 R5 才精确失败。
  v3.13 新增 13（1 项 extractActuals MRVL bullet 毛利率+EPS 双口径抽取
  （live 实抓原文：亮点段只在 bullet 给毛利率无 was/were、EPS 在 or $X per
  diluted share 形态、营收在冒号 bullet 形态——三形态全命中，抽不到 6 条
  到期毛利率/EPS 指引永远 pending）
  + 1 项 MU EPS 双口径（小数点不截断：[^.;] 跨不过 $28.24 的句点，必须
  数字间小数点容差）
  + 1 项 AMZN 营业利润抽取（分部行 segment lookbehind 挡 + 亮点行与 bullet
  同值去重）
  + 1 项全年实际值不混进财季 key（NVDA 02-25 live：季度 75.0% 收、全年
  71.1% 不收；corr-2026-030 防回归）
  + 1 项 gaapBasisOf/settleMetricOf 纯函数（口径四态+词边界 Apollo 不含
  gaap 子串 / 指标族句推导）
  + 1 项 extractGuidance MRVL EPS 指引口径从原文名词前推（14 字符回扩窗口
  切掉句首 GAAP 的 artifact）
  + 1 项 extractGuidance 表格形态不推导口径（MU 双列表头；第一版修复用
  引用比较恒真空转，isTable 标记才精确）
  + 1 项 settleEarningsGuidance 口径分 key 配对端到端（MRVL 毛利率×2/EPS×2
  + AMZN 营业利润 + MU 歧义 + "P diluted" artifact 经名词对齐 key 配对 +
  落账后 evidence.metric/gaapBasis 非空）
  + 1 项句索引备案作用域（同句连续备案指引不同财季，AMD live 实证）
  + 1 项 dedupeSameObligation 证据 key 带 metric+口径（旧条目空后缀分组
  不变）
  + 1 项 formatReport 渲染结算段（口径一致才配对限定+口径未限定措辞——
  只认渲染行）
  + 1 项 cron 注入源级（hf-cron-fetch.sh 口径措辞+歧义新措辞+截断披露）
  + 1 项版本号一致性（五处对齐 3.14.0））。
  v3.14 新增 9（1 项 extractGuidance META CFO 评论式四形态（live 实抓原文：
  季度连字符区间/全年区间/裸年份全年/between 百分点——期间、区间标记、
  settleMetric 族逐一断言）
  + 1 项多季度指引跳过（remaining quarters 不蹭前句 capex 的全年期间——
  rightmost-wins 实证）
  + 1 项 NVDA expects 在前全年税率（full year fiscal 2027 → annual +
  between X% and Y% 区间；旧 ANNUAL_PERIOD_PATTERN 错配修复）
  + 1 项 extractActuals META 亮点 bullet 营收（逐字 live 原文，bullet 在
  lead=1600 窗外 @2078/@2143——第一版夹具把 bullet 搬进窗口内、旧模式
  就抽得到，断言空转，R2 反向验证报 0 失败后换逐字原文）
  + 1 项 parseRange 连字符美元区间/单百分号/双百分号 between-and +
  单位不混（纯函数）
  + 1 项 settleEarningsGuidance/buildForecastDiscrimination 端到端
  （10 条 META 指引登记 + Q2 营收区间 in-band 命中 + Q3 到期门不提前结）
  + 1 项 EDGAR 指引 claim 额度 40→70（45 条全进无披露/75 条披露 seen
  =75 cut=5 cap=70/渲染披露行源级）
  + 1 项精度回归（无区间标记期望句不进库 form B/D 分界 + NVDA 02-25 旧
  夹具期间从 FY27Q1 纠正为 FY27 全年）
  + 1 项版本号一致性（五处对齐 3.14.0））。
  v3.14 六轮反向验证全部精确失败：摘除 form D→3（四形态/多季度/NVDA 年度
  断言）；摘除 bullet 营收形态→1（夹具换逐字 live 原文后精确失败——第一版
  夹具 bullet 在 lead 窗口内、断言空转，corr-2026-029 同型）；恢复旧
  ANNUAL_PERIOD_PATTERN→2（NVDA 年度+精度回归）；摘除多季度守卫→1；摘除
  连字符美元区间→1；摘除单百分号区间→1。每轮基线全绿、摘除后断言必生效、
  diff 校验还原到位、收尾基线全绿（350/0）。
  v3.15 新增 10（5 项 extractAnnualActuals live 逐字抽取（META 双值句三指标
  取全年值+FCF 不收 / NVDA 单值全年句+respectively 双值跳过 / AMD 一句多指标
  四项+EPS 值不带尾随句点 / MRVL 全年营收+EPS 双口径 / AMZN 尾部 in 2025+
  compared with 剥除+分部句不收）+
  1 项精度回归（季度句/亮点标题句/指引句/年份不符句/FCF 五类零误收 + AMD
  全年营收不漏进财季 key、财季毛利率照常——v3.15 营收守卫修复）+
  1 项 settleEarningsGuidance annual 配对端到端（受控台账：全年区间指引 hit、
  到期门、句反推路径、证据来源指向提供全年实际值的 Q4 备案——夹具带同财年
  Q1 备案做对照，摘除 annual 感知条件后证据指向错备案才精确失败）+
  1 项 extractSignals 透传 annualActuals+
  1 项 cron 注入源级（全年结算口径限定行）+
  1 项版本号一致性（五处对齐 3.15.0））。
  v3.15 八轮反向验证全部精确失败：摘除 extractAnnualActuals 函数体→6（五家
  抽取+精度回归）；摘除 annual key 索引段→1（annual 配对）；摘除营收路径
  全年守卫→1（精度回归 AMD 财季 key）；摘除证据来源 annual 感知条件→1
  （annual 配对——第一版报 0 失败：夹具只有一条 META FY2025 备案，摘除后
  find() 仍命中同一备案，断言空转；补同财年 Q1 备案做对照后精确失败）；
  摘除 extractSignals 透传→1；摘除 cron 注入 v3.15 行→1；摘除同比从句
  小数点容差→1（AMZN）；版本号漂移→13。每轮基线全绿、摘除后断言必生效、
  备份还原到位、收尾基线全绿（360/0）。
  v3.16 新增 11（1 项 extractGuidance GOOGL live 逐字（FY2026 全年 + X-to-Y
  区间 + settleMetric 归一，残废条目三处全修）+
  1 项精度回归（「Q3 2026 / Q3 FY2026 / third quarter of 2026 / third
  quarter 2026 + 指标 + is expected」四形态保持季度、过去时实际值句不进
  指引、fiscal 前缀全年形态不误伤——R4 摘除 ANNUAL_PERIOD_PATTERN
  lookbehind 后 Q3 FY2026 用例精确失败）+
  1 项零漂移（META/NVDA/ORCL live 句式期间与数值逐条不变）+
  1 项 parseRange X-to-Y 纯函数（带内/beat/两端异单位各折各的）+
  1 项 capex 指标族归一（settleMetricOf + normalizeMetric 两侧）+
  1 项 settleEarningsGuidance 端到端（受控台账：新登记到期门 pending +
  残废条目经句反推带内命中 + 持久化名词级 capex 归一路径 + 证据来源
  annual 感知）+
  1 项已知边界如实（GOOGL 全年 capex 实际值在现金流表 TTM 列、全年
  形态族不收——下轮候选）+
  1 项 cron 注入源级（[v3.16] 口径限定行）+
  1 项 guidanceStruct isRange 透传（v3.5.1「ticker 恒 null」同型断链）+
  1 项 forecast 渲染上限 30 + 超限披露（真 projection 夹具）+
  1 项版本号一致性（五处对齐 3.16.0））。
  v3.16 八轮反向验证全部精确失败：摘除 ANNUAL_YEAR_NOUN_RE（SET+PATTERNS
  两处）→2（live 逐字+精度回归全年分支）；摘除 X-to-Y 区间泛化（抽取侧
  rangeM + 结算侧 parseRange 正则与函数体同恢复）→3（live 逐字+
  parseRange+结算链——第一版只恢复正则没恢复函数体，mDashUsd[4] 越界
  崩溃而非精确失败，补全后才精确）；摘除 capex 指标族归一（两侧）→3；
  摘除 ANNUAL_PERIOD_PATTERN 季度前缀 lookbehind→1（Q3 FY2026 精度
  回归）；摘除 guidanceStruct isRange 透传→1；摘除 cron 注入 v3.16 行→1；
  摘除渲染披露行+上限回 12→1；版本号漂移→13。每轮基线全绿、摘除后断言
  必生效、hash 校验还原到位、收尾基线全绿（371/0）。
  v3.17 新增 10（4 项 extractAnnualActuals 表格式 live 逐字抽取（GOOGL Q4-2025
  现金流表 FY2025 capex $91.447B——v3.16 边界推进 / AMD Q4-FY2025 $974M 列序
  2025 2024 2025 2024 命中第 3 列不是末列 / MRVL Q4-FY2026 $354.1M 年终年 1/31
  小数 / AMZN Q4-2025 $131.819B Twelve Months Ended 标签）
  + 1 项精度回归九形态零误收（GOOGL Q2「Year To Date」/ META Q3「Nine Months
  Ended」/ AMZN Q1 TTM 列 live 逐字——期间守卫 quarter===4，corr-2026-036 live
  端到端实测抓到的误收 / AMZN Q2 六列 / Q4 五列防御形态 / FCF 对账表 5 列 /
  AMZN 叙事提及 / 千分位单位 / 年份不在表头）
  + 1 项列对齐双向精度（AMD 同表 fy=2024 → $636M，证明按表头年份寻列）
  + 1 项双来源去重（META 叙事 $72.22B 含融资租赁本金优先于报表行 $69.691B）
  + 1 项 settleEarningsGuidance 端到端（真实抽取值直通 annual key 带内命中 +
  残废季度形态条目季度 key 隔离不误结算）
  + 1 项 cron 注入源级（[v3.17] 表格式 capex 口径限定含期间守卫）
  + 1 项版本号一致性（五处对齐 3.17.0））。
  v3.17 六轮反向验证全部精确失败：摘除表格式调用→6（组 1 四家+去重+结算端到端）；
  摘除 quarter===4 期间守卫→1（AMZN Q1 TTM 列误收——live 端到端抓到的缺陷，
  corr-2026-036；第一轮摘除列数守卫报 0 失败=断言空转：AMZN Q2 六列被期间守卫
  先挡，补 Q4 五列防御夹具后才精确失败）；摘除列数 2/4 检查→1（Q4 五列形态
  误收）；摘除表头年份匹配→3（AMD 抽错列+年份不符误收）；摘除单位检查→1
  （千分位错标度）；版本漂移→16。每轮基线全绿、摘除后断言必生效、hash 校验
  还原到位、收尾基线全绿（381/0）。
  v3.18 新增 6（1 项端到端 RSS 独立额度（EDGAR 30 条指引占满旧额度后 4 条
  RSS 主张全进辨别 + 3 条登记 + 同代码复跑 0 新登记幂等——旧共享断点下只有
  1 条）
  + 1 项超额披露（RSS 池 25 条 > 额度 20 → seen=25 cut=5 cap=20，不静默切尾）
  + 1 项精度回归免责声明守卫（live 同形两句零误收：拼句带 2026-03 时间 token /
  截断在 plans to 走 form B——单独存在的 disclaimer 句不过门、断言空转，R2
  反向验证实测教训；Oracle 不发债/EU AI Act 义务句式不误伤）
  + 1 项 formatReport 分组渲染（非结构化前瞻主张子标题 + 两组各自截断披露 +
  RSS 口径限定行，只认渲染行）
  + 1 项 cron 注入源级（rssClaimsTruncation 披露 + 分组渲染 + RSS_CLAIMS_CAP
  常量 + 共享 breakpoint 已拆除防复发）
  + 1 项版本号一致性（五处对齐 3.19.0））。
  v3.18 六轮反向验证全部精确失败：摘除独立额度（恢复共享 break）→3（端到端/
  超额披露/注入源级）；摘除 boilerplate 守卫→2（第一版夹具断言空转，换 live
  同形后精确失败）；摘除 formatReport RSS 组渲染块→1（分组渲染断言）；摘除
  cron 注入 RSS 披露块→1（注入源级）；摘除 rssClaimsTruncation 落账→3；
  版本漂移→17。每轮基线全绿、摘除后断言必生效、备份还原到位、收尾基线全绿
  （387/0）。
  v3.19 新增 9（3 项 live 实证抽取（DELL 名词式区间三形态：Q1/Q2 季度+全年，
  逐字 live 原文，期间/区间值/settleMetric 逐一断言 + 一句双 EPS 的同事实
  去重与错位记录防护 / AVGO 名词式点值：Q4/Q3/Q2 期间正确不被 fiscal year
  锚词抢成全年 + 亮点段与 Outlook 段同值两句去重 + 百分比-of-revenue 不收
  / PLTR 提升式区间：en-dash 区间值 + 句外冒号节头期间不被前文 Q2 摘要表
  抢成 FY2026Q2 + in-excess-of 与增长率形式不收）+
  1 项零漂移回归（ORCL Q2 EPS 区间指引期间保持 FY2027 Q2——冒号节头
  lookbehind，live 零漂移 diff 实证的回归：不加则 dueOn 提前到已过期时点、
  与 Q2 实际值撞 key 判假 beat）+
  1 项 actuals 侧（年份前置标题锚 + Record revenue of 形态 + 全年守卫：
  full-year revenue 不进财季 key）+
  1 项结算端到端（受控台账：DELL FY2027Q1/Q2 区间指引 vs 下一期备案实际值
  均 beat 带外，方向单独记）+
  1 项 parseRange en-dash 纯函数（浮点折算容差断言）+
  1 项引擎端到端（三家新指引进辨别+登记，额度 80 落在代码里）+
  1 项版本号一致性（五处对齐 3.19.0））。
  v3.20 新增 8（3 项 live 实证抽取（PLTR 02-02 colon-bullet 三形态：Q1 收入区间+Q1 adjusted income+FY 收入区间，逐字 live 原文，截断残值 "of between $4" 与 in-excess-of 指点值拒绝 / PLTR 05-04/08-03 季度指引：Q2/Q3 revenue+income 期间与 en-dash 区间值，form F raising 式同文并存零重叠 / grew-to 实际值：总营收句入账+三条分部行拒绝+Q4 备案期间锚缺失如实为空+不跨 bullet 桥接）
  + 1 项 form H 精度回归（form A/B/D 地盘不抢/无 expect 冒号锚不收/过去时 actuals 不收/非指标名词不收/跨节不串段/in-excess 无前缀形态不收——第一版被 live 句 "U.S." 前缀挡在断言前、补无前缀夹具后才精确失败/无 expect 动词的冒号节头不收）
  + 1 项结算端到端（受控台账：Q1 区间 $1.532-1.536B vs 实际 $1.633B、Q2 区间 $1.797-1.801B vs 实际 $1.935B 均 beat 带外；Q3 按到期门 dueOn 2026-11-14 pending 不提前结）
  + 1 项 parseRange 带空格连字符美元区间纯函数（PLTR 02-02 live 同型，抽取/结算双側一致）
  + 1 项引擎端到端（三条 colon-bullet 指引进辨别+登记，额度 90 落在代码里）
  + 1 项版本号一致性（五处对齐 3.20.0））。
  v3.20 十一轮反向验证全部精确失败：摘除 form H→3；摘除 grew-to rv5→1；摘除 in-excess 负向断言→2（第一版 0 失败=断言空转：live 句的 "U.S." 前缀让名词前修饰词 pattern 吃不下、match 起点对不上 lookbehind 终点，压根到不了断言分支——补无前缀 in-excess 夹具后才精确失败，corr-2026-029/037 同型）；摘除名词前修饰词容忍→1（claim 句子文本断言）；[^:] 隔段→跨冒号→1（无 expect 节头被追上说）；摘除截断残值守卫→1（第一版 0 失败=职责错配：V8 lookbehind 嵌套懒量化两迭代走不通、截断 bullet 被 lookbehind 挡在前面压根到不了数值守卫，改 [^:] 隔段结构后守卫职责回到数值部分才精确失败）；摘除分部守卫→1；摘除间隔窗 bullet 排除→1（跨 bullet 桥接）；额度 90→80→1；摘除 parseRange 连字符分支→2；版本漂移→1。每轮基线全绿、摘除后断言必生效、还原校验到位、收尾基线全绿（404/0）。
  v3.21 十一轮反向验证全部精确失败：摘除 ipo-claim 模式整块→12 失败（组 1/2/4 十六条期望断言全覆盖）；摘除 S-1 证据档标记→2；摘除 ipo 的 no-quantity 豁免→4（Goldman/files/Transformer 三条 live 实证+豁免精确性）；摘除 ipo 证伪条件行→3；摘除 ipo 类目映射→3；摘除报告 KIND_CN ipo 行→端到端渲染失败；摘除 cron 注入 KIND_CN ipo 行→注入源级失败；competitive 恢复裸 leads?→2（两条 live FP 回归）；has-counterexample 去 \b→debut 虚抬回归；模式计数 23→22 漂移→1；版本漂移→多处。每轮基线全绿、摘除后断言必生效、还原校验到位、收尾基线全绿（420/0）。实测教训（脚本侧，已修）：反向验证脚本必须后台跑——前台 180s 超时 SIGKILL 会留下摘除中的半成品（第一版实测被 kill 在 R8，competitive leads? 被改回、后续轮次摘除态累积）；且 check_restore 必须在 restore_all 之后跑、还原函数不能带门闩（第一版两个 bug 让每轮误报「还原失败」且摘除态跨轮累积）。
  v3.21 新增 16（5 项 live 实证命中（TechCrunch「IPO filing reveals…」交叉销售主张：kind=ipo+公开财报/公告(3)（filing 标记）+has-sample（$100,000-plus）+thin-reasoning+决策相关 / The Information「S-1 Takeaways」标题-only：ipo+\bS-1\b 窄标记归公开财报档+不串台 compute-infra / 「Goldman Sachs to Lead Anthropic IPO」承销牵头：ipo 归类且 kinds 不含 competitive+无文书引用留无出处(1) 不虚抬+no-quantity 豁免生效+推理分独立计 0/3 / 「files for its public debut」：ipo+无出处不虚抬+豁免 / Transformer 简报「reportedly planning to publicly file for an IPO」：ipo+媒体报道(2)+weak-evidence 不虚抬）
  + 1 项形态族召回三族十形 + 1 项精度回归（MIT TR 修辞疑问句/ahead-of-IPO 估值句/pre-IPO/融资交易/并购/裁员/Fed/播客零误命中，估值与融资地盘不抢）
  + 1 项 competitive 精度修复（两条 live 误报——团队管理句整条出辨别、承销牵头句改判 ipo；「ahead of GPT-6 Astra」真命中不打穿）
  + 1 项证据档 \bS-1\b 标记（S-1 句归公开财报/公告(3)、裸 IPO 名词不虚抬、第三方调查档不受影响）
  + 1 项 no-quantity 豁免精确性（事件型豁免生效+不抬推理分+非事件型仍判不可证伪）
  + 1 项 has-counterexample 词边界修复（debut 不算反例、Despite/But 真反例词保留）
  + 1 项专属证伪条件与类目映射（行为+源级双钉）
  + 1 项引擎端到端（6 条 live IPO 条目进辨别+byKind ipo:6+formatReport 渲染「类型: IPO/上市过程主张」行+competitive FP 出池）
  + 1 项 cron 注入源级 + 1 项模式库计数 23 + 1 项版本号一致性（五处对齐 3.21.0））。
  v3.21.1 新增 9（1 项 live 实证（frontier_models 桶「Retell uses OpenAI
  models to help power 100M monthly calls」→ kind=usage-metric，名词族
  calls+动词族 uses-to-power+单位组单字母 m 三处齐修才命中）
  + 1 项 corr-2026-025 结案（ma 标题-only 豁免：problems 空、
  weak-evidence、evidence=1、推理 0/3、decisionRelevant=false 不虚抬）
  + 1 项豁免路径完整（evidence≥3 的 ma 条 → thin-reasoning +
  decisionRelevant=true，v3.8 Treasury 同型）
  + 1 项 regulatory-action/ipo 不回归（两条逐字段不变）
  + 1 项 calls 扩库精度回归 6 句（conference call/judgment calls/
  good call/Open Calls/Call of Duty/earnings call 全不命中）
  + 1 项 v3.11 不回归（seats/MAU/tokens 三真命中保留 + subscribers/
  速率上限仍排除）
  + 1 项源级断言（豁免条件显式含 ma——同域行为断言抓不到摘除，v3.6 教训）
  + 1 项模式库计数 23 不变（扩名词族不加 kind）
  + 1 项版本号一致性（五处对齐 3.21.1，含 corr-2026-026 纪律的 31 处
  历史断言硬编码版本号全量同步））。
  v3.21.1 四轮反向验证全部精确失败：摘除 ma 豁免条件（|| p.kind === 'ma'）→5
  （v3.3 两条旧断言+豁免标题-only+有出处 thin-reasoning+源级断言）；摘除
  uses-to-power 动词族→1（Retell live 实证）；单位组去单字母 m/b→1
  （Retell 100M）；名词族去 (monthly|weekly|daily) calls→1（Retell）。
  每轮基线全绿、摘除后断言必生效、还原 diff 校验一致、收尾基线全绿（429/0）。
  v3.22 新增 10（2 项 live 实证命中（TechCrunch「Parents sue OpenAI,
  alleging GPT-4o coached their daughter off seizure medication」→ kind=
  legal-action，判 证据不足/无出处(1)/推理 0/3/weak-evidence/decisionRelevant
  =false 不虚抬+专属证伪路径+compliance_demand 类目；The Information
  「Malaysian Authorities Seize $12 Million Worth of AI Chips in Smuggling
  Crackdown」→ 同 kind，has-sample=$12M 推理 1/3、同判不虚抬）
  + 1 项形态族召回两族九形（sue/sued/suing+目标含 is 间隔词；authorities/
  government/regulators/customs/DOJ/EU + seize/fined/penalize/indict/
  confiscate）
  + 1 项精度回归 16 句模式级+行为级双钉（会计 charges 三形/free of charge/
  in charge/charged with explaining/假设 criminal charges/医疗 seizure/
  impose fines 名词/Fed-ECB/播客/规则提案/IPO/并购/机制假设句全部不命中）
  + 1 项 no-quantity 豁免精确性（无数字诉讼句不判不可证伪+豁免不抬推理分+
  非事件型照旧判 unfalsifiable）
  + 1 项不串台（regulatory-action Treasury/Trump 与 ipo Goldman 三条 live
  原句判定与 kinds 不变）
  + 1 项专属证伪条件与类目映射（行为+源级双钉）
  + 1 项引擎端到端（两条 live 条目进辨别+byKind legal-action:2+formatReport
  渲染「类型: 执法/诉讼行动 | 来源:」行——只认渲染行）
  + 1 项 cron 注入源级（读 ~/.hermes/scripts/hf-cron-fetch.sh 验 legal-action
  中文标签）
  + 1 项模式库计数 24 + 版本号一致性（五处对齐 3.22.0））。
  v3.22.1 新增 10（2 项 live 实证命中（MIT Tech Review「After weeks of
  frenzied speculation, Anthropic has filed its IPO prospectus.」→ kind=ipo，
  判 证据不足/无出处(1)/推理 0/3/weak-evidence/decisionRelevant=false 不虚抬
  +事件型豁免生效+capital_flow 类目——修复前整条不进辨别（tech 桶不在候选池），
  且 yet 修复后上下文「clearest picture yet」不再充当反例标记；Ars Technica
  「Survey of 2,018 IT heads at big firms」→ kind=adoption，第三方调查(3)/
  推理 0/3/thin-reasoning/decisionRelevant——有描述有调查口径，与标题-only
  条不同级）
  + 1 项 yet 让步位约束（句首 Yet/逗号 yet 两种让步形态仍算反例——修复只摘
  时间副词不打穿真反例）
  + 1 项 yet 时间副词三形态不命中（not yet initiated/picture yet of/yet to
  be priced——恢复裸 yet 即精确失败）
  + 1 项 yet 修复的 live 影响面（ORCL funding 条推理 2/3→1/3、verdict 仍
  factual——证据档先行于推理分，修正只摘虚抬反例分）
  + 1 项引擎端到端（business+两条 tech live 条目进辨别，audited 3、
  byKind ipo:1/adoption:1、business 第一优先、formatReport 渲染「类型:
  IPO/上市过程主张 | 来源: MIT Tech Review - AI」行——只认渲染行）
  + 1 项源级（PICK_BUCKETS 六桶顺序 + tech/humanities 排 economy 之后 +
  BUCKET_CAP 新桶容量 + byBucket 初始化同步）
  + 1 项精度门未破（EU AI Act 指南页/NIST 资助授予/人文条目/Fed 公告/播客
  在六桶下全部不进辨别——新桶是重点盯守对象）
  + 1 项 cron 注入源级（候选池描述含 tech/humanities）
  + 1 项模式库计数 24 不变（扩桶不加 kind）+ 版本号一致性（五处对齐
  3.22.1））。
  v3.22.1 五轮反向验证全部精确失败（摘除 tech 桶→引擎级/源级/渲染多条/
  摘除 humanities 桶→源级（精度门是负向断言，摘桶后负例「更真」抓不到，源级断言才是它的钉子）/摘除 yet 让步位约束（恢复裸 yet）→live
  实证+时间副词三形态+ORCL 影响面/摘除注入脚本池描述更新→注入源级/版本
  漂移→多处）。每轮基线全绿、摘除后断言必生效、还原 diff 校验一致、收尾
  基线全绿（449/0）。同轮维护（不单独涨号）：102 处历史版本断言硬编码
  3.22.0 全量同步 3.22.1（corr-2026-026 纪律，含 35 处正则转义形态
  /3\.22\.0/——sed 字面替换碰不到转义反斜杠，第二轮专项替换才同步）。
  v3.23 新增 13（1 项 live 实证（MIT Tech Review「Anthropic has filed its IPO
  prospectus」+ browse-edgar 实抓 Anthropic, PBC S-1 夹具：备案动作主张经
  EDGAR 一手登记记录验证升独立验证(4)/thin-reasoning/推理 0/3/
  decisionRelevant=true，matched 带公司/CIK/表单/日期/accession）
  + 1 项无验证不虚抬（同一条主张不带 edgarVerification → v3.22.1 行为逐字段
  不回退：weak-evidence/无出处(1)/DR=false/edgarIpoCheck=null）
  + 1 项承销牵头只记上下文不抬档（Goldman to Lead Anthropic IPO + matched：
  filingAction=false、证据仍媒体报道(2)、upgraded=false）
  + 1 项未匹配不抬级不判假（OpenAI files for IPO + notfound 夹具：
  matched=null、reason=null、证据档不动）
  + 1 项窗口过滤（Mistral 2008 年 S-1/A×3 不算在办——pickRecentFiling=null）
  + 1 项 atom 解析纯函数（Anthropic 三字段 + href 实体解码 + notfound 的
  found=false，逐 entry 块解析）
  + 1 项公司候选提取（停用词/来源名过滤 + 双空格切分 + 停用词修剪 + 首 token
  补候选——live 冒烟实测修订后的规则）
  + 1 项引擎端到端（核查后 summary 用 summarizeCommercial 重算且与逐条一致
  + formatReport 渲染「EDGAR 核查: ✅」行与「IPO 主张 EDGAR 核查」汇总行，
  business 第一优先不变）
  + 1 项降级（http 全抛错 → ipoVerification.available=false + reason + 判定
  不变 + 报告渲染「不可用」行——不把查不到扮成查无）
  + 1 项非 live 不查询（live:false → http 调用 0 次 + 降级原因）
  + 1 项源级（run-pipeline 阶段 3.5 接线且位置在 formatReport 之前 +
  project-future main 块同型）
  + 1 项 cron 注入源级（hf-cron-fetch.sh 渲染 ✅/·/○/不可用四形态 +
  ipoVerification 汇总）
  + 1 项模式库计数 24 不变（新数据源不加 kind）+ 备案动作子形态与 ipo-claim
  主正则同源 + 版本号一致性五处对齐 3.23.0）。
  v3.24 新增 13（1 项 live 实证撤回（Chobani 备案动作主张 + browse-edgar
  S-1 2021-11-17 夹具 + submissions RW 2022-09-02 夹具：S-1 匹配升独立
  验证(4) 不回退 + events.withdrawal 带 form/日期/accession + withdrawn=1）
  + 1 项 live 实证定价（Cerebras S-1/A 2026-05-11 匹配 + 424B4 2026-05-14
  事件在案；RW 2025-10-03 距 live 时点 391 天超窗不算撤回）
  + 1 项事件不改判定（带 events 与不带 events 判定逐字段一致，只有
  edgarIpoCheck.events 从 null 变非空）
  + 1 项无 S-1 匹配 + RW 撤回上下文（Mobileye B.V. now=2018-03-01：
  matched=null 不抬级，撤回事件记录在案）
  + 1 项窗口过滤（RW 2018 在 now=2026 不算事件——空事件≠不可用，
  eventsAvailable=true）
  + 1 项 submissions 解析与窗口挑选纯函数（事件族抽取 + 最近优先 + 窗口外
  null + 坏 JSON 降级）
  + 1 项 submissions URL 纯函数（CIK 补零 10 位 + 非数字清洗）
  + 1 项引擎端到端（formatReport 渲染 ✅ 行带 RW 撤回上下文后缀 + 汇总行
  流程事件计数；同池 legal-action 对照条零扰动；summary 与逐条一致）
  + 1 项降级（submissions 抛错 → events=null + eventsUnavailableReason +
  eventsAvailable=false，S-1 结论（独立验证(4)）不受影响 + 渲染「EDGAR
  事件: 不可用」行）
  + 1 项非 live 不查询（live:false → http 0 次含 submissions）
  + 1 项 CIK 归属与 memo（两条同公司主张 → submissions 按 CIK 只查 1 次，
  URL 锚定 matched 的 CIK）
  + 1 项 cron 注入源级（事件后缀/事件不可用行/汇总流程事件计数）
  + 1 项源级接线 + 模式库计数 24 不变 + 版本号五处对齐 3.24.0）。
  v3.24 八轮反向验证全部精确失败（摘除 verifyIpoClaims 事件查询段→live
  撤回/定价实证+引擎端到端+CIK memo/摘除 pickRecentByForm 窗口过滤→窗口
  过滤断言（2018 年 RW 误匹配）/摘除辨别器 events 透传→四条 live 实证/
  摘除 formatReport 事件后缀→端到端渲染/摘除 cron 注入事件行→注入源级/
  摘除 eventsUnavailable 降级分支→降级断言/摘除 CIK memo→CIK 归属断言/
  版本漂移→多处）。每轮基线全绿、摘除后断言必生效、还原 cmp 字节校验
  一致、收尾基线全绿（475/0）。
  v3.23 九轮反向验证全部精确失败（摘除 edgarUpgraded 抬级 override→live
  实证+无验证不虚抬+引擎端到端/摘除 filingAction 门→承销牵头虚抬回归/
  摘除 365 天窗口过滤→Mistral 2008 误匹配/摘除 atom entry 块切分→解析断言/
  摘除 run-pipeline 接线→源级/摘除 formatReport EDGAR 行→端到端渲染/
  摘除 cron 注入行→注入源级/摘除降级分支→降级断言/版本漂移→多处）。
  每轮基线全绿、摘除后断言必生效、还原 cmp 字节校验一致、收尾基线全绿
  （462/0）。
  v3.22 十二轮反向验证全部精确失败（摘除 legal-action 模式整块→8（v3.22 节
  8 + 三处计数断言）/摘除 sue 形态→4/摘除执法主体+动词族→4/摘除 no-quantity
  豁免→2（v3.22 节 1 + v3.21.1 源级断言 1）/摘除证伪条件→1/摘除类目映射→3/
  摘除报告 KIND_CN→1/摘除注入 KIND_CN→1/动词族加回 fines 名词→1（impose
  fines 误命中）/动词族加回 seizure 名词→1（执法主体+seizure 医学语义边界句
  误命中）/计数文档漂移 24→23→3/版本漂移→多处）。每轮基线全绿、摘除后断言
  必生效、还原 diff 校验一致、收尾基线全绿（439/0）。
  实测教训（均已修）：① 反向验证判定标准必须以**全文件 ✗ 标记总数**为准
  （R4 摘除豁免的失败一条在 v3.22 节、一条在 v3.21.1 节——只数本节汇总行
  会把跨 section 的精确失败误判为「未达预期」；第一版脚本因此被 kill 重跑，
  与 v3.21「前台超时 SIGKILL 留半成品」同型：反向验证脚本必须后台跑）；
  ② R10 第一版断言空转——seizure 名词排除的精度夹具用了无执法主体的医疗句
  （"her doctors told her to keep taking her seizure medication"），Form B 要求
  「执法主体+动词」两段共现，无主体句压根走不到被测分支，加回名词也误命中
  不了、反向验证报 0 失败（corr-2026-029/037 同型第三次实证）；补「EU
  regulators studied the seizure risk」构造边界句（主体+名词、非执法语义）
  后才精确失败。纪律：精度夹具必须让「摘除修复后会误命中的那个结构」真的
  出现在句子里。
  同轮维护（不单独涨号）：本机 hf-cron-fetch.sh 补齐 v3.14-v3.21 注入
  内容（forecast 分组渲染+EDGAR/RSS 截断披露+[v3.15/16/17] 结算口径
  限定+ipo 标签）——本机注入脚本停在 v3.13 导致 6 个源级断言失败
  （引擎产出了但 agent 看不到，真实断链），补齐后 420/0 全绿；顺修
  v3.21 重复粘贴的 ipo 注释。
  历史：v3.19 十轮反向验证全部精确失败：摘除 form E→1；摘除 form F→1；摘除
  form G→2（live 实证+精度回归）；摘除 ANNUAL_HEADER_RE lookbehind→1
  （ORCL Q2 期间回归）；摘除 ANNUAL_PERIOD_PATTERN lookbehind→1（AVGO 不
  抢全年）；摘除年份前置锚→1；摘除全年守卫→1；摘除同事实去重→2（第一版
  夹具没有一句双指引的 live 同形、断言空转报 0 失败，补 DELL EPS 句 +
  AVGO 两段同值结构后精确失败——v3.18「夹具必须触达被测分支」同型）；
  摘除 parseRange en-dash→1；版本漂移→1。每轮基线全绿、摘除后断言必生效、
  hash 校验还原到位、收尾基线全绿（396/0）。
  v3.13 三轮反向验证全部精确失败：摘除冒号营收形态调用点→1（MRVL 抽取
  断言）；摘除 settle() 证据落账两行→1（结算编排断言的 evidence 字段）；
  恢复旧夹具（MU 实际值挂 Q2 actualPeriod + 计数 6/4/2）→1（MU 落空
  pending 到不了歧义分支——夹具自身矛盾：6 条预测里 MU 跳过就不可能
  settled 6）。每轮基线全绿、摘除后断言必生效、备份还原到位（diff 校验）、
  收尾基线全绿（341/0）。
  历史：v3.4 的 230 + v3.4 新增 16：
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
  预测辨别（[v3.18] 起分组注入：财报指引组 10 条 + 非结构化前瞻主张组
  （媒体/博客/备案正文，RSS 独立额度）10 条，两组各自「另有 N 条未显示」；
  读 fd.rssClaimsTruncation 披露 RSS 路径 seen/cut/cap——不分组则 RSS
  主张追加在 61 条 EDGAR 之后全被切掉，「辨别了但看不见」） /
  **财报指引结算（v3.5 补入，预测辨别之后——被结算的对象就是那段
  登记的财报指引，限定先于被限定者；读 proj.forecastDiscrimination.guidanceSettlement，
  含口径限定：outcome=实际值落在指引容差带内，beat/below 方向单独陈述，beat 不得
  读成「公司没做到」；只结有容差/区间且实际值唯一的指引；[v3.13] 歧义措辞同步为
  「GAAP/非GAAP多值或口径未限定」，限定句加「口径**一致**才配对（MRVL 毛利率/EPS
  分口径各判各的），口径未限定（如 MU 双列指引表）判歧义跳过，不设法规避」）** /
  **商业主张辨别（v3.0.0c 补入，第 6 段；KIND_CN 标签随形态库扩充：
  v3.2 产能/供给约束、v3.3 并购/交易过程、v3.6 成本/价格信号、v3.7 专家/机构
  判断、v3.8 监管行动、v3.9 价格下调、v3.10 部署规模、v3.11 用量/牵引度
  指标、v3.12 算力基建承诺/规模、v3.21 IPO/上市过程、v3.22 执法/诉讼行动、
  v3.26 客户成效/ROI，
  注入与报告同标签；
  v3.10 起渲染上限 12→20 / cron 10→16——候选池扩到四桶后辨别条数变多，
  切掉尾部等于「辨别了但看不见」；[v3.11] 20→25 / 16→25 并加截断披露
  （usage-metric 新维度+切分修复后 audited 23 超旧上限，超出时明确写
  「另有 N 条未显示」）；[v3.12] 25→30 / 25→30（算力基建承诺新维度后
  audited 27 超旧上限，上限与 formatReport 同步）；[v3.22.1] 候选池四桶→
  六桶（+tech 6 / +humanities 4，business 第一优先不变，排在 economy 之后）
  后 audited 22→24（live 实证 tech 桶 MIT TR IPO prospectus 与 Ars Technica
  调查两条首次进辨别），上限 30 未触顶；注入脚本的候选池描述同轮同步为
  「business/economy/tech/humanities 媒体 + SEC 备案/厂商一手公告」；
  [v3.23] ipo 主张的「EDGAR 核查: ✅/·/○/不可用」四形态行与汇总行进注入；
  [v3.24] 事件后缀（RW 撤回备案/424B4 定价备案在案）+「EDGAR 事件: 不可用」
  行 + 汇总行流程事件计数（撤回 N / 定价 M）同轮同步——四形态+事件+汇总
  都注入，否则 agent 看不到流程事件（v3.0.0c 同型断链不能再犯））** /
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
