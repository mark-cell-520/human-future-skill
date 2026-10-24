---
name: human-future-v2
title: "人类未来 · 文明推演引擎 v2.16"
version: "2.16.0"
description: |-
  人类未来技能 v2.16 — 修复「基准概率」辨别维度断链：台账条目存 `domain`、
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

# 人类未来 · 文明推演引擎 v2.12

> 数据采集（RSS 真联网 + 可选正文增强）→ 心虫 stateless 检查器 → 三年推演引擎。
> 当前状态与实测数字见下一节，历史版本记录见 references/upgrade-history.md。

---

## 当前状态（v2.12 实测）

以下数字全部来自 2026-10-20 一次 `FETCH=1 FETCH_BODY=1 node scripts/run-pipeline.js` 实跑，
不是宣称值。

**采集层**
- RSS 源：13 个（tech 2 + humanities 1 + frontier_models 9 + psychology/philosophy 各 0）
- 并行抓取：`Promise.all`，实测约 4 秒（旧串行最坏 104 秒）
- 正文增强：`FETCH_BODY=1` 时抓最新 24 条，实测 17 条成功（openai.com 403 / arstechnica 405 / interconnects 链接失效）
- 实测产出：140 条 live，其中专项大模型域 112 条

**推演层**（project-future.js，v3 引擎）
- 主题域：11 个（frontier_models 排在最前，避免被 ai_capability 的同批关键词吞掉）
- 接入组件：causal-graph-engine / cross-domain-conduction / signal-decay-resonance /
  timeline-conflict-detector / source-credibility-grader / claim-mismatch-detector /
  cognitive-formula-bridge / low-confidence-gate / prediction-ledger
- 实测各模块可用性：因果链 ✅（共现兜底）/ 跨域传导 ✅ / 趋势判定 ✅（源归一化）/
  时间轴 ✅（16 点，需正文）/ 来源分级 ✅（T1 47 / T2 45 / T3 48 / T4 0）/ 口径错位 ✅（9 条命中）

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
- 要拿到真正可结算的预测，需接 Metaculus / Epoch AI / 厂商路线图等专门预测源，
  当前采集范围不含。这是下一步工作，不是已解决。2026-10-24 实测：Metaculus API
  需登录 token（403）、Manifold API 本机不可达（连接超时）、PredictIt 301、
  Epoch AI 数据页只有芯片/模型/公司等统计数据、无预测类数据——外部预测源
  接入本轮检索无果，如实记录。
- 基准概率目前仍以通用先验为主：本地台账去重后同类样本 <3 时不作统计
  结论（实测 regulatory_action 去重后仅 1 条），但报告已如实展示本地
  已结算条数。[v2.16] 已修复此前的字段映射断链（存 `domain` 读
  `p.category`，分支永不激活）并加上同义务去重；样本随台账积累自然
  增长，不需要再改代码。

**测试**
- `npm test`：**147 项断言**（实测各 section 汇总；v2.16 之前 140 + 本轮新增 7：
  1 项真实台账字段映射（3 条同义务条目被匹配且去重为 1）+ 1 项去重后本地
  基准激活（5 条登记含 3 条同义务 → 3 样本 2/3 兑现）+ 1 项样本不足诚实降级
  （仅同义务重复不得激活 100% 失真基准，note 写明本地已结算 1 条）+ 1 项
  record() 双写 category + 1 项 scorecard 按去重样本算 Brier + 1 项端到端
  （generate→formatReport 出现「已结算 1 条（原始登记 3 条）」且标注样本
  不足）+ 1 项去重判据单元（同证据合并/无证据回退文本/跨类目不误合））。
  每项修复都做过反向验证（摘除修复 → 对应断言失败）：v2.16 实测摘除字段
  映射修复 → 4 条断言失败；摘除去重 → 4 条断言失败；摘除报告渲染 → 1 条
  断言失败。

**cron 注入脚本**（`~/.hermes/scripts/hf-cron-fetch.sh`，不在本仓、不受版本控制）
- 跑法：`FETCH=1 FETCH_BODY=1 node scripts/run-pipeline.js` → 提取摘要 → 心虫 think()
- 专项域分区：F 编号明细前 20 条 + 全量按来源/按周聚合概览
- 排序必须用 `Date.parse` 比较，**不能用 `localeCompare`**：RFC 822 字符串
  （"Wed, 14 Oct 2026"）按字符串比会得到错误顺序，实测 10-19 的条目被排到第 6 位
- 改动前先备份：`cp ~/.hermes/scripts/hf-cron-fetch.sh{,.bak-$(date +%Y%m%d)}`


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
