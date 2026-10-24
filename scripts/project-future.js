#!/usr/bin/env node
'use strict';

/**
 * 三年推演引擎 v2
 *
 * ── 为什么要重写（2026-10-08）──────────────────────────────────────────
 * v1 的 5 个核心方法（generateStages / identifyTurningPoints / assessRisks /
 * identifyOpportunities / generateRecommendations）全部是 `return [ ... ]`
 * 写死常量，内容固化为 2026-09 的一批新闻（OpenAI Astra、Crusoe $3.9B、
 * Waymo 新加坡等），与 analysis 输入完全无关。
 *
 * 后果：无论采集到什么新闻，报告永远输出同一套 2026-09 的旧内容。
 * 这不是"推演能力弱"，是"没有推演"。
 *
 * v2 的做法：把新闻按主题域聚合成信号，再让阶段/转折点/风险/机会
 * 全部从真实信号推导。每个结论都带 evidence（引用到具体条目），
 * 信号不足时如实降级，不用模板内容填充。
 *
 * ── 诚实性约束（不可违反）────────────────────────────────────────────
 * 1. 心虫是工具不是权威：心虫判的是"措辞形态"，不是事实真假。
 *    本引擎只用它做信号筛选，不用它的事实性结论。
 * 2. 每个阶段/风险/机会必须带 evidence 条目引用，无证据的不输出。
 * 3. 信号少于阈值时明确写"证据不足，无法形成可靠推演"，
 *    禁止用常识性套话填充（那正是 v1 的问题）。
 * 4. confidence 由信号强度决定，不由模板写死。
 */

const fs = require('fs');
const path = require('path');

// ── 接入 v2.4 已有的推演组件（此前全部零引用，从未接进 pipeline）────────
// 这些模块是 v2.4 时写的，方法名、自测、诚实性注释都在，但没有任何
// 调用方。所以「推演内容少」不是因为没工具，是工具没接线。
// 路径：本文件在 <skill>/scripts/，组件在 <skill>/human-future/scripts/，
// 故为 ../human-future/scripts/（只上一级，不是两级）。
const HF = path.join(__dirname, '..', 'human-future', 'scripts');
const { CausalGraph } = require(path.join(HF, 'causal-graph-engine.js'));
const { propagate, renderMatrix } = require(path.join(HF, 'cross-domain-conduction.js'));
const { classify: classifySignal } = require(path.join(HF, 'signal-decay-resonance.js'));
const { detectTimelineConflicts, parseWindow } = require(path.join(HF, 'timeline-conflict-detector.js'));
const { classifySource, adjudicate } = require(path.join(HF, 'source-credibility-grader.js'));
const { detectMismatch } = require(path.join(HF, 'claim-mismatch-detector.js'));
const { runFormulaBridge } = require(path.join(HF, 'cognitive-formula-bridge.js'));
const { gate: lowConfidenceGate } = require(path.join(HF, 'low-confidence-gate.js'));
const predictionLedger = require(path.join(HF, 'prediction-ledger.js'));
// [v2.13] 预测辨别器：引擎不再自己生成未来，改为辨别他人关于未来的主张。
// 这是 v2.13 的方向转变——见 SKILL.md「v2.13 方向转变」一节。
const { discriminateAll: discriminateForecasts } = require(path.join(HF, 'forecast-discriminator.js'));
// [v3.0.0] 商业主张辨别器：心虫商业未来推演的核心新能力。
// 与 forecast-discriminator 的分工：后者辨别「关于未来的预测」（要时点），
// 前者辨别「关于市场的陈述」（要量化与证据等级）。商业推演面对的绝大多数
// 主张是后者——"企业正在采用 AI agent"、"开源将杀死付费产品"这类。
const { discriminateCommercial } = require(path.join(HF, 'commercial-discriminator.js'));

/** 主题域定义：关键词命中即归入该域。顺序即优先级。 */
// [v2.7 新增] frontier_models「专项大模型」：
// 用户要求专项跟踪「大模型的趋势和最新进展」。放在最前是因为它的关键词
// 最宽（openai/anthropic/gemini/gpt/claude…），若排在 ai_capability 之后，
// 同一条新闻会被算作「AI 能力边界」而漏进专项域；且原 ai_capability 的关键词
// 已含 gpt/gemini/claude，重复命中会让两个域拿到同一批条目、专项域失去意义。
// 顺序优先 = 该条同时命中时算专项域。project-future 的多域命中逻辑仍会保留
// 其他域的命中，不会丢信号。
const DOMAINS = [
  { id: 'frontier_models', name: '专项大模型',
    kw: ['openai', 'gpt-5', 'gpt-6', 'chatgpt', 'o1', 'o3', 'sora', 'anthropic',
      'claude', 'gemini', 'deepmind', 'gemma', 'llama', 'meta ai', 'qwen',
      'deepseek', 'mistral', 'grok', 'kimi', 'moonshot', 'glm', 'ernie', 'minimax',
      'frontier model', 'foundation model', 'pretraining', 'scaling law',
      'context window', 'benchmark', 'mmlu', 'swe-bench', 'lmsys', 'chatbot arena'] },
  { id: 'ai_capability', name: 'AI 能力边界',
    kw: ['agi', 'llm', 'model', 'gpt', 'claude', 'gemini', 'qwen', 'reasoning', 'agent', 'inference', 'frontier', 'openai', 'anthropic', 'deepmind'] },
  { id: 'ai_safety', name: 'AI 安全与对齐',
    kw: ['safety', 'alignment', 'jailbreak', 'prompt injection', 'red team', 'vulnerability', 'exploit', 'misuse', 'guardrail', 'backdoor'] },
  { id: 'compute_energy', name: '算力与能源',
    kw: ['gpu', 'chip', 'semiconductor', 'nvidia', 'tsmc', 'datacenter', 'data center', 'nuclear', 'fusion', 'geothermal', 'battery', 'energy', 'grid'] },
  { id: 'robotics_auto', name: '机器人与自动驾驶',
    kw: ['robot', 'autonomous', 'self-driving', 'waymo', 'robotaxi', 'humanoid', 'drone'] },
  { id: 'biotech_longevity', name: '生物技术与长寿',
    kw: ['crispr', 'gene', 'genomic', 'longevity', 'aging', 'vaccine', 'clinical', 'fda', 'drug', 'therapy', 'protein', 'biotech'] },
  { id: 'neuro_bci', name: '神经科学与脑机接口',
    kw: ['neuralink', 'bci', 'brain-computer', 'neuroscience', 'neural interface', 'eeg'] },
  { id: 'space', name: '太空与技术主权',
    kw: ['spacex', 'nasa', 'starship', 'satellite', 'mars', 'orbit', 'artemis', 'military space'] },
  { id: 'governance', name: '治理与监管',
    kw: ['regulation', 'regulator', 'law', 'policy', 'ban', 'treaty', 'sanction', 'congress', 'eu ai act', 'export control', 'tariff'] },
  { id: 'economy_labor', name: '经济与就业',
    kw: ['job', 'employment', 'layoff', 'wage', 'labor', 'productivity', 'gdp', 'inflation', 'startup', 'funding', 'ipo', 'valuation', 'revenue'] },
  { id: 'info_security', name: '信息安全与隐私',
    kw: ['breach', 'leak', 'ransomware', 'malware', 'phishing', 'privacy', 'surveillance', 'zero-day', 'cve', 'encryption'] },
  { id: 'society_culture', name: '社会与人文',
    kw: ['education', 'mental health', 'psychology', 'philosophy', 'society', 'culture', 'humanities', 'ethics'] },
  // ── 商业主题域（v3.0.0 心虫商业未来推演）─────────────────────
  //
  // 为什么单列 5 个而不是复用 economy_labor：economy_labor 的关键词是
  // job/gdp/inflation 这类宏观劳动力指标，而心虫要回答的是商业决策问题——
  // 市场主张站不站得住、竞品在做什么、钱往哪流、客户在买什么、合规创造什么
  // 需求。这五类各有独立的辨别维度，混在一个域里会互相稀释热度。
  //
  // 纪律：这些域只做「信号归类 + 热度 + 主张辨别」，不生成「心虫应该怎么做」。
  // 商业结论由报告 agent 依据这些信号自行判断并标注归属，引擎不代劳。
  { id: 'market_claims', name: '市场主张',
    kw: ['market', 'demand', 'adoption', 'enterprise', 'procurement', 'replace',
      'disrupt', 'tam', 'market size', 'willingness to pay', 'roi', 'survey',
      'analyst', 'gartner', 'forecast', 'projected market', 'boom', 'bubble'] },
  { id: 'competitor_moves', name: '竞品与替代方案',
    kw: ['competitor', 'rival', 'launch', 'launches', 'release', 'released',
      'generally available', 'pricing', 'price cut', 'free tier', 'open source',
      'open-weight', 'acquire', 'acquisition', 'acquihire', 'partnership',
      'benchmark', 'sota', 'state of the art', 'beats', 'outperform'] },
  { id: 'capital_flow', name: '资本与商业模式',
    kw: ['funding', 'raises', 'raised', 'series a', 'series b', 'series c',
      'seed round', 'valuation', 'ipo', 'revenue', 'arr', 'burn rate', 'investors',
      'venture', 'vc', 'unicorn', 'profitab', 'margin', 'monetiz'] },
  { id: 'customer_adoption', name: '客户采用与场景',
    kw: ['deployment', 'deploy', 'pilot', 'case study', 'use case', 'rollout',
      'integration', 'api', 'sdk', 'developer', 'enterprise customers', 'churn',
      'renewal', 'contract', 'proof of concept', 'poc'] },
  { id: 'compliance_demand', name: '合规需求',
    kw: ['compliance', 'audit', 'certification', 'liability', 'attestation',
      'disclosure', 'transparency requirement', 'conformity', 'assessment',
      'eu ai act', 'regulator', 'enforcement', 'penalty', 'fine'] },
];

/** 阶段模板：只决定"取第几热的域"，内容由信号填充 */
// [v2.13] 阶段标签改为如实描述，不再用「未来 N 个月」的推演外壳。
//
// 为什么改：这三个标签承诺的是未来，而 generateStages() 的实际操作是
// `ds.slice(i*2, i*2+2)` —— 按当前信号热度排序后取前 2、次 2、再次 2 个域。
// 那是「当下哪些域最活跃」的排名，不是「未来 0-12 个月会发生什么」的推演。
// 旧标签与 describeStage() 自己的描述直接矛盾：
//   旧标签写的是「第一阶段（未来 0-12 个月）」，而描述写「当前信号最集中的方向……
//   属于正在发生的进展」——标签承诺未来，描述承认现在。
// 用推演的外壳包新闻，比明说没推演更糟——它让读者以为有预测。
//
// 新标签如实说明这是什么：按本期信号热度排序的域分组。
// 真正的推演能力在 v2.13 由 forecast-discriminator 提供（辨别他人的预测），
// 不在这个函数里。
const HORIZONS = [
  { label: '信号最集中方向（本期热度第 1-2 位）' },
  { label: '次级活跃方向（本期热度第 3-4 位）' },
  { label: '再次级方向（本期热度第 5-6 位）' },
];

class ProjectionEngine {
  constructor(analysisResult) {
    this.analysis = analysisResult || {};
    this.timestamp = new Date().toISOString();
    this.signals = this.extractSignals();
  }

  // ───────────────────────────────────────────────────────────────
  // 信号提取：把新闻条目按主题域聚合，统计热度与时间分布
  // ───────────────────────────────────────────────────────────────
  extractSignals() {
    const newsData = this.analysis.newsData || {};
    const items = [];
    for (const [bucket, v] of Object.entries(newsData)) {
      for (const n of (v && v.news) || []) {
        // 接受 live 与 live-search 两种来源标记：
        // live = RSS 真采集；live-search = 本轮 web_search 检索并已人工核对来源与日期。
        // knowledge-base 降级条目仍被排除——那是历史累积知识，不得当新闻信号。
        if (n.origin !== 'live' && n.origin !== 'live-search') continue;
        items.push({
          title: String(n.title || ''),
          // [v2.9] text 含正文（若抓到）：时间轴抽取与口径错位检测都需要
          // RSS 摘要里没有的数字和发布声明。body 为空时退化为原行为。
          text: `${n.title || ''} ${n.description || ''} ${n.body || ''}`,
          // [v2.8] description 必须单独保留：buildTimelineConflicts() 要按
          // 「标题 vs 摘要」区别对待（标题里的 2026-10 是发布声明，摘要里的多
          // 为例程日期）。v2.8 第一版只读 it.description，而这里从未挂过该字段，
          // 于是抽取恒为空、时间轴连续不可用。测试用例（摘要含 by 2028）抓到了它。
          description: String(n.description || ''),
          // [v2.9] 正文单独保留，且带长度标记：下游要能区分「这句来自摘要」
          // 与「这句来自正文」，两者可信度不同（摘要是源方写的导语，正文是全文）。
          body: String(n.body || ''),
          hasBody: !!(n.body && String(n.body).length > 200),
          // [v2.14] sitemap 源日期出处透传。不传的话 buildFrontierModelSection
          // 里数 _dateSource 恒为 0——字段在采集层打上、在报告层读取，中间
          // 被 extractSignals 重建条目时丢掉，「端到端到达」断在这一环。
          // 实测教训：接口存在不等于产物里有，必须端到端验证。
          _dateSource: n._dateSource || '',
          source: n.source || '(未标注)',
          link: n.link || '',
          pubDate: n.pubDate || '',
          bucket,
          origin: n.origin,
        });
      }
    }

    // 按域归类（一条可属多域）
    const byDomain = {};
    for (const d of DOMAINS) byDomain[d.id] = [];
    for (const it of items) {
      const low = it.text.toLowerCase();
      let matched = [];
      for (const d of DOMAINS) {
        if (d.kw.some(k => low.includes(k))) {
          byDomain[d.id].push(it);
          matched.push(d.id);
        }
      }
      // [v2.8] 采集域即归类依据：来自 frontier_models 采集域的条目，
      // 即使正文不含任何厂商标识，也归入专项主题域。
      //
      // 为什么需要这条：实测 106 条专项源条目里有 22 条正文无厂商标识——
      // OpenAI 的教育版公告、DeepMind 的蛋白质/Private AI Compute、MIT News 的
      // 天气预报与供应链报告、Interconnects 的播客与观点文。它们来自专项源但
      // 讲的是教育/气象/学术生态，关键词一个都不命中，于是全落进 undomained，
      // 把未归类占比推到 0.27，且专项趋势段漏掉它们。
      //
      // 「来源是厂商/专项源」本身就是比正文更可靠的归类信号：用户要的是
      // 「这些源在关注什么」，不是「这些源里哪些含厂商名」。
      // 副作用如实记录：这会让专项域条目数从 42 涨到约 64，domainsMatched 不变，
      // 未归类占比下降。它不改变其他任何域的归属。
      if (it.bucket === 'frontier_models' && !matched.includes('frontier_models')) {
        byDomain.frontier_models.push(it);
        matched.push('frontier_models');
      }
      // [v2.13] 经济采集域同样按来源归类。
      // 与 frontier_models 同理：Fed 的 FOMC 声明、NBER 的论文标题里
      // 往往不含「经济/就业/通胀」这类关键词（如 "Minutes of the Federal Open
      // Market Committee"、"Export Controls and the Economics of National
      // Security"），纯靠关键词会全落进 undomained。
      // 「来自央行/经济学研究源」本身就是比正文更可靠的归类信号。
      if (it.bucket === 'economy' && !matched.includes('economy_labor')) {
        byDomain.economy_labor.push(it);
        matched.push('economy_labor');
      }
      // [v3.0.0] 商业采集域：先靠商业主题域关键词匹配（融资/竞品/采用/合规
      // 各有专门关键词），匹配不上才兜底到 market_claims。
      //
      // 为什么不直接按来源分派：business 的 4 个源话题跨度大——
      // TechCrunch 同时有融资（"raises $15B"）和竞品（"Claude Duet app"），
      // ProductHunt 全是产品发布。关键词能分开它们，来源不能。
      // 兜底到 market_claims 而不是 undomained：商业新闻本质都是关于市场的
      // 主张或动作，归进「市场主张」比「未归类」诚实。
      if (it.bucket === 'business') {
        const commercialDomains = ['market_claims', 'competitor_moves',
          'capital_flow', 'customer_adoption', 'compliance_demand'];
        const hitCommercial = commercialDomains.filter(d => matched.includes(d));
        if (hitCommercial.length === 0) {
          byDomain.market_claims.push(it);
          matched.push('market_claims');
        }
      }
      it.domains = matched;
    }

    // 时间分布：用来判断哪些域在"加速"（近期条目占比高）
    const dates = items.map(i => Date.parse(i.pubDate)).filter(x => !isNaN(x));
    const newest = dates.length ? Math.max(...dates) : null;
    const recentCut = newest ? newest - 30 * 86400000 : null; // 30 天窗口

    const domainStats = DOMAINS.map(d => {
      const arr = byDomain[d.id];
      const recent = recentCut
        ? arr.filter(i => { const t = Date.parse(i.pubDate); return !isNaN(t) && t >= recentCut; }).length
        : 0;
      return {
        id: d.id, name: d.name, count: arr.length, recent,
        items: arr,
        // 热度 = 近期占比加权，没有日期时退化为均分
        heat: arr.length === 0 ? 0 : (recentCut ? (recent / arr.length) * 0.6 + (arr.length / Math.max(1, items.length)) * 0.4 : 0.5),
      };
    }).filter(s => s.count > 0).sort((a, b) => b.heat - a.heat || b.count - a.count);

    return {
      totalItems: items.length,
      domains: domainStats,
      undomained: items.filter(i => i.domains.length === 0).length,
      dateRange: dates.length
        ? { from: new Date(Math.min(...dates)).toISOString().slice(0, 10), to: new Date(Math.max(...dates)).toISOString().slice(0, 10) }
        : null,
      items,
    };
  }

  generate() {
    const degraded = this.signals.totalItems === 0;
    const report = {
      meta: {
        version: '3.0.0',
        heartflowVersion: this.analysis.engineVersion,
        timestamp: this.timestamp,
        modulesLoaded: this.analysis.modulesLoaded,
        signalCount: this.signals.totalItems,
        domainsMatched: this.signals.domains.length,
        // v3：声明实际接入的推演组件，避免"宣称接入了但没跑"
        reasoningEngines: [
          'causal-graph-engine', 'cross-domain-conduction', 'signal-decay-resonance',
          'timeline-conflict-detector', 'source-credibility-grader',
          'claim-mismatch-detector', 'cognitive-formula-bridge', 'low-confidence-gate',
          'prediction-ledger',
        ],
      },
      degraded,
      degradedReason: degraded ? '无 live 新闻信号，无法形成基于证据的推演' : null,
      summary: this.generateSummary(),
      stages: degraded ? [] : this.generateStages(),
      turningPoints: degraded ? [] : this.identifyTurningPoints(),
      risks: degraded ? [] : this.assessRisks(),
      opportunities: degraded ? [] : this.identifyOpportunities(),
      recommendations: degraded ? [] : this.generateRecommendations(),
      confidence: this.calculateConfidence(),
    };

    if (!degraded) {
      // ── v3 新增：真正的推演（此前这些能力从未被调用）────────────
      report.causalChains = this.buildCausalChains();
      report.crossDomainConduction = this.buildCrossDomainConduction();
      report.trendClassification = this.buildTrendClassification();
      report.timelineConflicts = this.buildTimelineConflicts();
      report.sourceAdjudication = this.buildSourceAdjudication();
      report.claimMismatches = this.buildClaimMismatches();
      report.forecastDiscrimination = this.buildForecastDiscrimination();
      // [v3.0.0] 商业主张辨别：心虫商业未来推演的核心新段
      report.commercialDiscrimination = this.buildCommercialDiscrimination();
      report.frontierModelSection = this.buildFrontierModelSection();
      report.formulaAssessment = this.buildFormulaAssessment();
      report.lowConfidenceGate = this.applyLowConfidenceGate(report);
      report.ledgerStatus = this.getLedgerStatus();
      // 登记本次预测（供未来结算 Brier 分数）——必须在 ledgerStatus 之后，
      // 这样本次报告里能看到"本次登记了几条"
      this._lastReport = report;
      report.predictionRecording = this.recordPredictions();
      report.ledgerStatus.recordedThisRun = report.predictionRecording.count;
    }
    return report;
  }

  // ───────────────────────────────────────────────────────────────
  // v3：把当期高热度域连成因果图，找根因、终局与最强干预点。
  // 节点来自真实信号条目；边来自 CONDUCTION 规则 + 域内共现。
  // ───────────────────────────────────────────────────────────────
  buildCausalChains() {
    const ds = this.signals.domains.slice(0, 5);
    if (ds.length < 2) {
      return { available: false, reason: '活跃域少于 2 个，无法建立域间因果链' };
    }
    // 本引擎域 id → cross-domain-conduction 的域 id。
    // 不映射的话 CONDUCTION 规则一条都匹配不上，因果链必然为空。
    // [v2.8] 映射到同一传导域的多个主题域合并为一个节点，但保留各自的
    // 专项身份：合并后若只有 1 个传导域，退而用「域内共现」建子图。
    //
    // 背景（v2.7 引入的回归）：v2.7 把 frontier_models 也映射到 'ai'，
    // 于是 top5 里 ai_capability(74) + frontier_models(42) 合并后 used 只有
    // 1 个 key，因果链连续返回「映射后仅 1 个域」而不画图——3/4 轮不可用。
    // 这不是真实状态：两个域的信号确实同时活跃，只是传导表把 AI 视为一个域。
    // 正确做法：传导域 <2 时，用主题域之间的条目共现建图（同一条新闻命中
    // 两个主题域 = 这两个域在本期存在关联），并明确标注边来自共现而非实证规则。
    const MAP = {
      ai_capability: 'ai', ai_safety: 'ai', frontier_models: 'ai', compute_energy: 'energy',
      neuro_bci: 'neuro', biotech_longevity: 'genomics',
      robotics_auto: 'robotics', space: 'space', governance: 'ai',
    };
    const CONDUCTION = require(path.join(HF, 'cross-domain-conduction.js')).CONDUCTION;

    const g = new CausalGraph();
    // 用传导表的域 id 作为节点 id，否则 addEdge 会因端点不存在抛错
    const used = new Map(); // 传导域id -> 本引擎域对象
    for (const d of ds) {
      const cid = MAP[d.id];
      if (!cid) continue;
      if (!used.has(cid)) used.set(cid, d);
      const merged = used.get(cid);
      // 同源多个域（如 ai_capability 与 ai_safety 都映射到 ai）合并计数
      merged._merged = merged._merged || [];
      if (d !== merged) merged._merged.push(d);
    }

    // 边来自实证传导规则（强度 >= 0.5）——优先路径
    let edgeSource = 'conduction';
    if (used.size >= 2) {
      for (const [cid, d] of used) {
        const count = d.count + ((d._merged || []).reduce((s, x) => s + x.count, 0));
        g.addNode(cid, `${d.name}${d._merged && d._merged.length ? ' 等' : ''}（${count} 条信号）`, 'domain');
      }
      for (const rule of CONDUCTION) {
        if (rule.strength < 0.5) continue;
        if (used.has(rule.from) && used.has(rule.to)) {
          g.addEdge(rule.from, rule.to, rule.why, rule.strength);
        }
      }
    }

    // [v2.8] 传导域不足 2 个（AI 相关域独占 top5）时的兜底：
    // 改用主题域级共现建图。同一条新闻同时命中两个主题域，说明本期这两个域
    // 被同一批事件牵连——这是从真实数据得到的关联，不是臆造。
    // 与实证规则的区别必须在输出里写明，不得混为「因果」。
    if (g.edges.length === 0) {
      edgeSource = 'cooccurrence';
      const nodeSet = new Set();
      const edgeCount = new Map();
      for (const it of this.signals.items) {
        const doms = (it.domains || []).filter(x => ds.some(d => d.id === x));
        for (const a of doms) {
          nodeSet.add(a);
          for (const b of doms) {
            if (a === b) continue;
            const key = `${a}->${b}`;
            edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
          }
        }
      }
      if (nodeSet.size < 2) {
        return { available: false, reason: `映射后仅 ${used.size} 个域有对应传导源，且主题域共现不足，无法建立因果链` };
      }
      for (const id of nodeSet) {
        const d = ds.find(x => x.id === id);
        g.addNode(id, `${d.name}（${d.count} 条信号）`, 'domain');
      }
      // 共现是无向关联，若两个方向都加边，每个节点入度出度都非零，
      // roots()/outcomes() 全为空，因果链与干预点也出不来——图建了却读不出
      // 任何结构（v2.8 第一版实测：根因(无)、终局(无)、因果链空、干预点空）。
      // 做法：按域热度排序定主方向（热域 → 冷域），只加单向边。
      // 热度来自 signals.domains 的排序（extractSignals 已按 heat 排好）。
      const heatRank = new Map(ds.map((d, i) => [d.id, i]));
      const added = new Set();
      for (const [key, cnt] of [...edgeCount].sort((a, b) => b[1] - a[1])) {
        const [from, to] = key.split('->');
        const pairKey = [from, to].sort().join('|');
        if (added.has(pairKey)) continue;   // 一对域只保留共现次数最多的方向
        added.add(pairKey);
        const strength = Math.min(0.9, 0.3 + cnt * 0.1);
        // 方向按热度：热域在前，作为"被牵连的起点"
        const [hot, cold] = heatRank.get(from) <= heatRank.get(to) ? [from, to] : [to, from];
        const hotCnt = edgeCount.get(`${hot}->${cold}`) || cnt;
        const s2 = Math.min(0.9, 0.3 + hotCnt * 0.1);
        g.addEdge(hot, cold, `本期 ${hotCnt} 条信号同时命中两个域（共现，非实证因果）`, s2);
      }
    }

    if (g.edges.length === 0) {
      return { available: false, reason: '本期域之间没有强度 >=0.5 的实证传导关系' };
    }
    return {
      available: true,
      edgeSource,
      roots: g.roots().map(n => n.label),
      outcomes: g.outcomes().map(n => n.label),
      chains: g.allPaths().slice(0, 6).map(p =>
        p.map(id => (g.nodes.get(id) || {}).label || id).join(' → ')),
      leveragePoints: g.leveragePoints().slice(0, 5).map(lp => ({
        node: lp.node.label,
        pathsBroken: lp.pathsBroken,
        ratio: Math.round(lp.ratio * 100) / 100,
      })),
      note: edgeSource === 'conduction'
        ? '边来自 cross-domain-conduction 的实证规则表，不是本引擎臆造的因果关系'
        : '边来自本期主题域共现（同一信号命中多个域），不是实证因果规则；只表示这些域在本期被同一批事件牵连',
    };
  }

  // ───────────────────────────────────────────────────────────────
  // v3：从当期最热域出发，算它向其他域的传导全景（强度+时延）
  // ───────────────────────────────────────────────────────────────
  buildCrossDomainConduction() {
    // [v2.8] 从最热域出发找传导源；frontier_models 与 ai_capability 同属 ai，
    // 所以专项域登顶时仍用 'ai' 作传导源，不再返回"没有对应源域"。
    // v2.7 的 MAP 漏了 frontier_models，导致专项域成为 top1 的那几轮
    // 跨域传导整段不可用（实测 3/4 轮）。
    const MAP = {
      ai_capability: 'ai', ai_safety: 'ai', frontier_models: 'ai', compute_energy: 'energy',
      neuro_bci: 'neuro', biotech_longevity: 'genomics',
      robotics_auto: 'robotics', space: 'space', governance: 'ai',
    };
    // 选第一个能映射到传导源的最热域（不是无条件取 domains[0]）
    const top = this.signals.domains.find(d => MAP[d.id]);
    if (!top) return { available: false, reason: '本期活跃域均无对应传导源域' };
    const src = MAP[top.id];
    if (!src) {
      return { available: false, reason: `域「${top.name}」在传导矩阵中没有对应源域`, source: top.id };
    }
    const rows = propagate(src, 0.3, 3);
    return {
      available: true,
      source: `${top.name} → ${src}`,
      matrix: renderMatrix(src),
      topTargets: rows.slice(0, 5).map(r => ({
        domain: r.domain, strength: r.strength, lagMonths: r.lagMonths,
        chain: r.chain.join('→'), why: r.via,
      })),
      note: '强度与时延来自实证规则表；只表示"若该域突破，最可能沿哪条线传导"，不是概率',
    };
  }

  // ───────────────────────────────────────────────────────────────
  // v3：把每条信号按周聚合成序列，判定"一次性事件/持续趋势/结构性转变"。
  // 单期样本不足时如实返回 insufficient-data，不硬判。
  // ───────────────────────────────────────────────────────────────
  buildTrendClassification() {
    // 需要 >=3 个周期才能算衰减，本期数据通常只有 1-2 周 → 多数会得到
    // insufficient-data。这是诚实结果，不是 bug。
    // [v2.11] 源归一化。
    //
    // 为什么必须做：实测每个源都被 MAX_ITEMS_PER_SOURCE=12 硬截断，所以
    // 「本周条目数」混了两种完全不同的信号——
    //   a) 该源本周真的发了多少篇；
    //   b) 该源的 RSS 返回窗口有多宽。
    // 实测 W42 占该源全部条目的比例：OpenAI 100%、Simon Willison 100%、
    // NVIDIA 92% … Interconnects 8%、Microsoft Research 10%。
    // 不归一化时，一个"RSS 只返回最近一周"的源会被读成"该域正在爆发"，
    // 而一个"RSS 返回 10 周历史"的源会被读成"该域在衰退"。
    //
    // 归一化方法：每个源在其**有数据的周**内按「篇/周」折算，再按源取中位数，
    // 避免单源高频淹没其他源（OpenAI 一周 12 篇 vs Interconnects 一周 1 篇）。
    // 中位数而非均值：均值会被单一高产源拉走，中位数反映"典型源的行为"。
    //
    // 诚实性约束：归一化后的序列是**折算值**不是真实计数，必须在输出里标明，
    // 且原始计数一并保留，让读者能自己对比。
    const srcWeek = new Map();   // source -> Map(week -> count)
    for (const it of this.signals.items) {
      const t = Date.parse(it.pubDate);
      if (isNaN(t)) continue;
      const d = new Date(t);
      const week = `${d.getUTCFullYear()}-W${String(Math.ceil(((t - new Date(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7)).padStart(2, '0')}`;
      const src = it.source || '(未标注)';
      if (!srcWeek.has(src)) srcWeek.set(src, new Map());
      srcWeek.get(src).set(week, (srcWeek.get(src).get(week) || 0) + 1);
    }

    const byWeek = new Map();          // 原始计数（保留供对比）
    const byWeekNorm = new Map();      // 源归一化后的折算值
    for (const it of this.signals.items) {
      const t = Date.parse(it.pubDate);
      if (isNaN(t)) continue;
      const d = new Date(t);
      const week = `${d.getUTCFullYear()}-W${String(Math.ceil(((t - new Date(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7)).padStart(2, '0')}`;
      for (const dom of it.domains) {
        if (!byWeek.has(dom)) byWeek.set(dom, new Map());
        byWeek.get(dom).set(week, (byWeek.get(dom).get(week) || 0) + 1);
      }
    }

    // 折算：每个源在其活跃周内按 篇/周 计，域内取各源的中位数
    const allWeeks = new Set();
    for (const m of srcWeek.values()) for (const w of m.keys()) allWeeks.add(w);
    for (const [dom, weeks] of byWeek) {
      // 找出该域每个源各周的计数
      const perSrc = new Map();   // source -> Map(week -> count)
      for (const it of this.signals.items) {
        if (!it.domains.includes(dom)) continue;
        const t = Date.parse(it.pubDate);
        if (isNaN(t)) continue;
        const d = new Date(t);
        const week = `${d.getUTCFullYear()}-W${String(Math.ceil(((t - new Date(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7)).padStart(2, '0')}`;
        const src = it.source || '(未标注)';
        if (!perSrc.has(src)) perSrc.set(src, new Map());
        perSrc.get(src).set(week, (perSrc.get(src).get(week) || 0) + 1);
      }
      const norm = new Map();
      for (const w of allWeeks) {
        const rates = [];
        for (const [, wm] of perSrc) {
          if (wm.has(w)) rates.push(wm.get(w));   // 该源该周在该域的条目数
        }
        if (rates.length === 0) continue;
        rates.sort((a, b) => a - b);
        const mid = Math.floor(rates.length / 2);
        const median = rates.length % 2 ? rates[mid] : (rates[mid - 1] + rates[mid]) / 2;
        norm.set(w, Math.round(median * 100) / 100);
      }
      byWeekNorm.set(dom, norm);
    }

    const series = [];        // 归一化序列（用于判定）
    const seriesRaw = [];     // 原始计数序列（供对比）
    for (const [topic, weeks] of byWeekNorm) {
      for (const [period, count] of weeks) series.push({ period, topic, count, normalized: true });
    }
    for (const [topic, weeks] of byWeek) {
      for (const [period, count] of weeks) seriesRaw.push({ period, topic, count });
    }
    const out = [];
    for (const d of this.signals.domains.slice(0, 8)) {
      const r = classifySignal(series, d.id);
      // 原始序列也跑一遍，用于在报告里标注"归一化前后判定是否改变"
      const rRaw = classifySignal(seriesRaw, d.id);
      out.push({
        domain: d.name, id: d.id, periods: r.periods, total: r.total,
        halfLifePeriods: r.halfLifePeriods,
        // [v2.10] direction/shape 是重写 decayRate 后新增的两个维度：
        // direction = rising/decaying/flat，shape = steady/spike/leading-outlier。
        // 缺了它们，读者只看到 verdict 看不到"为什么这么判"——
        // 尤其是 one-off，必须能看出是尖峰还是首端异常还是正常衰减。
        direction: r.direction || null, shape: r.shape || null,
        verdict: r.verdict,
        // [v2.11] 归一化前后对照：verdictChanged=true 说明该域的"趋势"
        // 主要是采集假象，真实信号方向相反。这是本表最重要的可信度标记。
        rawVerdict: rRaw.verdict,
        rawDirection: rRaw.direction || null,
        verdictChanged: r.verdict !== rRaw.verdict,
        rawTotal: (byWeek.get(d.id) && [...byWeek.get(d.id).values()].reduce((a, b) => a + b, 0)) || 0,
        // [v2.11] 归一化的源数背书。实测局限：只有 2 个源时中位数退化为
        // 两者均值，归一化基本失效；源数越多中位数越能反映"典型源行为"。
        // 不写出来读者无法判断这次的归一化值有多少可信度。
        normalizedFromSources: (() => {
          const srcs = new Set();
          for (const it of this.signals.items) {
            if (it.domains.includes(d.id)) srcs.add(it.source || '(未标注)');
          }
          return srcs.size;
        })(),
      });
    }
    const judged = out.filter(o => o.verdict !== 'insufficient-data');
    return {
      available: series.length > 0,
      classifications: out,
      judgedCount: judged.length,
      // [v2.11] 归一化说明必须写在 note 里：折算值不是真实计数。
      note: '计数已做源归一化（每源折算为篇/周后取域内中位数），'
        + '避免"RSS 返回窗口宽的源"被读成衰退、"只返回近期条目的源"被读成爆发；'
        + 'rawVerdict 列为未归一化的原始判定，verdictChanged=true 表示该域趋势主要是采集假象。'
        + '另：需要同一主题 >=3 个周期的计数才能判定半衰期，单期样本一律返回 insufficient-data',
    };
  }

  // ───────────────────────────────────────────────────────────────
  // v3：把信号里出现的 roadmap 时间点放进同一时间轴，检测冲突。
  // ───────────────────────────────────────────────────────────────
  buildTimelineConflicts() {
    // [v2.8] 从标题 + 摘要里抽取 "2027" / "2027-Q1" / "2026-10" / "by 2028" 等时间声明。
    //
    // 为什么扩到摘要：v2.7 实测 140 条 live 里标题含年份的只有 1 条，
    // 而标题+摘要有 7 条。厂商公告的时间声明（"first half of 2027"、
    // "2026-10-13 GA"、"by 2028"）绝大多数写在正文而非标题，只扫标题等于
    // 连续多轮零可用。扩到摘要后可用性由数据决定，不再由抽取位置决定。
    //
    // 但要防一种失真：摘要里的年份可能只是引用别的事件（"In 2025, Stan
    // ... created ..."、"since Q1 2023"），那不是本条的 roadmap 声明。
    //
    // 第一版把裸 in/on/from/through 也当前瞻词，实测 "In 2025, Stan created"
    // 与 "since Q1 2023" 都被抽成 milestone——这两个恰恰是最典型的历史引用。
    // 因此前瞻词分两档：
    //   强前瞻词（明确指向未来）：by / until / ahead of / expected / planned /
    //     scheduled / target / launch / ship / available / release / roll out /
    //     debut / 至 / 到 / 将在 / 计划 / 预计 / 拟于 / 定于 —— 后面跟年份即声明
    //   弱前瞻词（in / on / during / from / through）：必须搭配未来标记
    //     （will / would / plans / next / coming / upcoming / 未来 / 未来几年）
    //     才认，单独出现不认。
    // 另外 "since/for/ago/back in/last/past" 是显式历史标记，出现即否决该年份。
    const milestones = [];
    const seen = new Set();
    const STRONG = /(?:by|until|till|ahead of|expected|plan(?:s|ned|ning)?|scheduled|target(?:s|ing)?|launch(?:es|ing|ed)?|ship(?:s|ping)?|availab(?:le|ility)|releas(?:e|es|ing)|roll(?:s|ing)?\s?out|debut(?:s|ing)?|至|到|将在|计划|预计|拟于|定于|预计于)\s*[^.;]{0,24}?(20\d{2})(-Q[1-4]|-H[12]|-\d{2})?(?:\s|$|[.,;)）])/gi;
    const WEAK = /(?:in|on|during|from|through)\s*[^.;]{0,24}?(?:will|would|plans?|planned|next|coming|upcoming|future|未来|将来)[^.;]{0,24}?(20\d{2})(-Q[1-4]|-H[12]|-\d{2})?(?:\s|$|[.,;)）])/gi;
    const HISTORICAL = /(?:since|for\s+\d|ago|back\s+in|last\s+year|past\s+\d|in\s+the\s+past|histor\w+)/i;
    const STRUCTURED = /(20\d{2})(-Q[1-4]|-H[12])(?![-\d])/g;
    const YEAR_MONTH = /(20\d{2})-(\d{2})(?![\d])/g;
    for (const it of this.signals.items) {
      // [v2.9] 抽取范围：标题 + 正文（若有）+ 摘要。
      // 正文优先于摘要，因为 v2.8 实测 RSS 摘要只给导语——DeepMind 的
      // Gemini 4 Argon 公告在正文里有 "Argon is currently rolling out to trusted
      // cyber defenders through the Fairwind Program"、"Argon will launch at an
      // introductory price" 等发布形态声明，摘要里一个都没有。
      // 有正文时仍要保留摘要：摘要可能是源方特意提炼的时间点，正文里反而没有。
      const text = `${it.title || ''} ${it.body || ''} ${(it.description || '').slice(0, 400)}`;
      const found = [];
      // 1) 强前瞻词 + 年份（最高可信：是声明不是引用）
      let m;
      STRONG.lastIndex = 0;
      while ((m = STRONG.exec(text)) !== null) {
        found.push(`${m[1]}${m[2] || ''}`);
      }
      // 2) 弱前瞻词 + 未来标记 + 年份
      WEAK.lastIndex = 0;
      while ((m = WEAK.exec(text)) !== null) {
        found.push(`${m[1]}${m[2] || ''}`);
      }
      // 3) 结构化 2027-Q1 / 2027-H2（本身就是声明形态）
      STRUCTURED.lastIndex = 0;
      while ((m = STRUCTURED.exec(text)) !== null) {
        found.push(`${m[1]}${m[2]}`);
      }
      // 4) 2026-10 这类年月（只认标题：标题里的是发布声明，摘要里多为例程日期）
      if (/20\d{2}-\d{2}/.test(it.title || '')) {
        YEAR_MONTH.lastIndex = 0;
        while ((m = YEAR_MONTH.exec(it.title)) !== null) {
          found.push(`${m[1]}-${m[2]}`);
        }
      }
      // 5) 历史引用否决：整条文本带显式历史标记时，只保留结构化季度/年月
      //    （"2027-Q1 GA" 这种即使在回顾文里也是声明），丢掉裸年份。
      let usable = found;
      if (HISTORICAL.test(text)) {
        usable = found.filter(f => /-Q[1-4]|-H[12]|-\d{2}$/.test(f));
      }
      for (const claimed of usable) {
        const id = `${it.source}:${claimed}:${it.title.slice(0, 20)}`;
        if (seen.has(id)) continue;
        seen.add(id);
        milestones.push({
          id, label: it.title.slice(0, 80), claimed,
          verified: false,   // 信号里声称的时间点一律未证实
          source: it.source, link: it.link,
        });
        if (milestones.length >= 12) break;
      }
      if (milestones.length >= 12) break;
    }
    // [v2.9] 补一类被完全漏掉的时间信息：**发布日期本身**。
    //
    // 为什么加：v2.8/v2.9 反复抓不到「前瞻性时间声明」——实测 Argon 公告正文里
    // 只有 "as soon as possible"（无具体时间点）和发布日期 "Sep 30, 2026"。
    // 但发布日期本身就是时间轴上最有价值的一维：同一厂商多款产品的发布间隔、
    // 某域的发布密度随周变化，都只能从发布日期算出来。
    //
    // 第一版只扫 title+description，实测 0 命中：DeepMind 的发布日期
    // （"Sep 30, 2026"）写在正文里，RSS 摘要不含它。所以必须连 body 一起扫。
    //
    // 纪律：发布日期是已发生事实，与前瞻声明性质不同，必须分开存：
    //   - claimed 用 "2026-09-30" 这种可排序形式（parseWindow 认 -MM）
    //   - label 加「已发布」前缀，ordered 里能与前瞻声明区分
    //   - verified=true——发布日期是源方标注的事实，不是声称
    const PUB_DATE = /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+20\d{2})|(20\d{2}-\d{2}-\d{2})/i;
    for (const it of this.signals.items) {
      const src = `${it.title || ''} ${it.body || ''} ${(it.description || '').slice(0, 300)}`;
      const pm = PUB_DATE.exec(src);
      if (!pm) continue;
      const t = Date.parse(pm[1] || pm[2]);
      if (isNaN(t)) continue;
      const claimed = new Date(t).toISOString().slice(0, 10);
      const id = `${it.source}:pub:${claimed}:${it.title.slice(0, 20)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      milestones.push({
        id, label: `[已发布] ${it.title.slice(0, 70)}`, claimed,
        verified: true,
        source: it.source, link: it.link,
      });
      if (milestones.length >= 16) break;
    }

    if (milestones.length < 2) {
      // [v2.11] 降级原因要说清：本模块的时间点有三类来源（前瞻声明 /
      // 结构化季度 / 发布日期），其中**发布日期主要在正文里**（实测 DeepMind
      // 的 "Sep 30, 2026" 写在正文，RSS 摘要不含）。没有 FETCH_BODY=1 时
      // 这一类整体缺失，可用时间点会大幅减少。笼统说"未抽到"会让读者以为
      // 是抽取规则的问题，实际是数据深度的问题——两者修法完全不同。
      const withBody = this.signals.items.filter(i => i.hasBody).length;
      const total = this.signals.items.length;
      const reason = withBody === 0 && total > 0
        ? `未抽到 2 个以上可排序时间点。注意：本次 ${total} 条 live 信号均无正文`
          + `（未开启 FETCH_BODY=1），而发布日期主要写在正文里，这一类时间点整体缺失。`
          + `开启后实测可获得 16 个可排序时间点。`
        : `从 ${total} 条 live 信号（其中 ${withBody} 条有正文）中，`
          + `未抽到 2 个以上可排序时间点（前瞻声明或发布日期）`;
      return { available: false, reason };
    }
    const res = detectTimelineConflicts(milestones);
    return {
      available: true,
      ordered: res.ordered,
      conflicts: res.conflicts,
      summary: res.summary,
      note: 'verified=false 表示该时间点只是来源声称，未经独立证实；'
        + '抽取范围含摘要，只认前瞻词或结构化季度/年月形态，不含正文里的历史引用',
    };
  }

  // ───────────────────────────────────────────────────────────────
  // v3：对同一域内互相矛盾的说法做来源加权裁决（T1..T4）
  // ───────────────────────────────────────────────────────────────
  buildSourceAdjudication() {
    // 本期 RSS 条目大多同源（MIT TR / Ars Technica），没有真正的多方矛盾，
    // 所以这一步通常只能给出"来源分级分布"，不能给出裁决。如实报告。
    const tiers = {};
    for (const it of this.signals.items) {
      const t = classifySource(it.link || it.source);
      tiers[t] = (tiers[t] || 0) + 1;
    }
    return {
      available: this.signals.items.length > 0,
      tierDistribution: tiers,
      distinctSources: [...new Set(this.signals.items.map(i => i.source))].length,
      note: '裁决需要同一事实的多个矛盾来源；同源 RSS 不构成矛盾，故本期只给分级分布',
    };
  }

  // ───────────────────────────────────────────────────────────────
  // v3：对信号标题做口径错位检测（产能vs订单、检测vs纠正等）
  // ───────────────────────────────────────────────────────────────
  buildClaimMismatches() {
    const hits = [];
    for (const it of this.signals.items) {
      // [v2.9 修断链] detectMismatch() 返回 {matched, verdict, score}，
      // 旧代码读的是 r.hits / Array.isArray(r)——两个都不存在，于是
      // arr 恒为空数组，口径错位检测从 v2.4 接入起就从未产出过任何命中。
      // 实测佐证：v2.9 给 Argon 正文跑 detectMismatch 明确返回 2 个
      // matched（benchmark-vs-capability / demo-vs-ga），而同期报告
      // claimMismatches.count 仍是 0。字段名不匹配是唯一原因。
      const r = detectMismatch(it.text || it.title) || {};
      const arr = Array.isArray(r.matched) ? r.matched : [];
      if (arr.length) {
        hits.push({
          title: it.title.slice(0, 100), source: it.source, link: it.link,
          verdict: r.verdict, score: r.score,
          // hasBody 标明这条命中的依据来自正文还是只有摘要：
          // 摘要命中的可信度低于正文命中（摘要是源方导语，可能是提炼过的）
          hasBody: !!it.hasBody,
          mismatches: arr.map(m => ({
            id: m.id, label: m.label, severity: m.severity, guidance: m.guidance,
          })),
        });
      }
    }
    return {
      available: true,
      count: hits.length,
      hits: hits.slice(0, 8),
      note: '口径错位检测：识别「设计产能 vs 实际订单」这类数字达标但能力未达标的表述。'
        + 'hasBody=true 表示命中依据来自抓到的正文，false 表示只有 RSS 摘要',
    };
  }

  // ───────────────────────────────────────────────────────────────
  // v3：用认知公式对推演做量化评估（贝叶斯/折现/风险期望）
  // ───────────────────────────────────────────────────────────────
  buildFormulaAssessment() {
    const top = this.signals.domains[0];
    const bridge = runFormulaBridge({
      milestone: top ? {
        prior: 0.5,
        evidenceStrength: Math.min(1, 0.3 + top.heat * 0.7),
        yearsAhead: 2,
      } : null,
      discountRate: 0.1,
      predictionLedger: predictionLedger.load().predictions.filter(p => p.outcome !== null),
      scenarios: this.assessRisks().slice(0, 3).map(r => ({
        probability: r.likelihood,
        impact: -0.5,
        worstCase: r.severity === '高',
      })),
    });
    return {
      available: true,
      formulas: bridge.formulas,
      note: '贝叶斯先验固定 0.5（无外部先验），证据强度由域热度推导；这是方法演示，不是校准过的概率',
    };
  }

  // ───────────────────────────────────────────────────────────────
  // v3：低置信度守门——confidence<0.6 的结论必须显式标注
  // ───────────────────────────────────────────────────────────────
  applyLowConfidenceGate(report) {
    const gates = [];
    for (const s of report.stages || []) {
      const g = lowConfidenceGate({ confidence: s.confidence, conclusion: s.conclusion, producer: 'project-future-v3' });
      gates.push({ stage: s.period, confidence: s.confidence, allowed: g.allowed, label: g.label, disclosure: g.disclosure });
    }
    const overall = lowConfidenceGate({ confidence: report.confidence.score, producer: 'project-future-v3' });
    return {
      overall: { confidence: report.confidence.score, allowed: overall.allowed, label: overall.label, disclosure: overall.disclosure },
      stages: gates,
      threshold: 0.6,
    };
  }

  // ───────────────────────────────────────────────────────────────
  // v3：预测台账状态——回答"我们过去预测得准不准"
  // ───────────────────────────────────────────────────────────────
  getLedgerStatus() {
    const sc = predictionLedger.scorecard();
    const od = predictionLedger.overdue();
    return {
      available: true,
      brier: sc.brier, sample: sc.sample, hitRate: sc.hitRate,
      calibration: sc.calibration,
      overdueCount: od.length,
      pending: (predictionLedger.load().predictions || []).filter(p => p.outcome === null).length,
      note: sc.sample === 0
        ? (() => {
            const now = new Date().toISOString().slice(0, 10);
            const all = predictionLedger.load().predictions || [];
            const pend = all.filter(p => p.outcome === null);
            // [v2.13] 过期未结算要单独计数并显式暴露。
            // 实测踩坑：旧文案写死「到期日在 2027 年起」，但清理伪预测后
            // 台账里最早的到期日是 2026-09-30——已有 3 条过期未结算。
            // 文案说 2027 会让读者以为还没到结算时间，实际是**该结算没结算**。
            const overdue = pend.filter(p => p.dueOn && p.dueOn < now).length;
            return pend.length > 0
              ? `台账已有 ${pend.length} 条待结算预测`
                + `（其中 ${overdue} 条已过到期日未结算），暂无已结算项，`
                + `故 Brier 暂不可算——不是没登记。`
                + `到期后需人工/agent 取证调用 settle() 才出 Brier——`
                + `引擎不自动判定兑现与否，那需要证据，不是规则能替的`
              : '台账暂无任何预测，无法计算 Brier 分数——推演质量暂不可度量';
          })()
        : `基于 ${sc.sample} 条已结算预测`,
    };
  }

  // ───────────────────────────────────────────────────────────────
  // [v2.13 修正] 不再登记「方向保持活跃」类伪预测。
  //
  // 为什么停：v2.13 方向转变时，明确把这类登记列为「假推演」的证据之一——
  //   「predictionLedger 登记的『预测』是『X 方向在本期内保持活跃』，
  //     到期日 2027，sample=0」
  // 但当时只改了 stages 的标签，没停这个方法。结果每一轮 pipeline 仍在往台账里
  // 写这类条目，实测攒了 84 条（cron 每 2 小时跑一次，每轮约 7 条）。
  //
  // 它为什么是伪预测：
  //   - 「方向在本期内保持活跃」是**对当前状态的描述**，不是对未来的预测
  //   - 到期日设为 1-3 年后，但主张本身没有可证伪的条件——
  //     「保持活跃」在任何结果下都能被解释成应验
  //   - rationale 自己写着「域热度推导，非统计概率」，probability 却是数字
  //
  // 现在的登记路径只有一条：buildForecastDiscrimination() 里
  // settleable=true 的**他人主张**（有主体、有事件、有时点，可到期结算）。
  // 那才是 v2.13 之后台账该有的内容。
  //
  // 幂等说明：历史上的 84 条 proj- 条目已单独清理，不影响本条改动。
  // ───────────────────────────────────────────────────────────────
  recordPredictions() {
    // 显式返回说明而不是静默返回空——否则报告里「本次登记 0 条」
    // 看起来像登记失败，而实际上是设计如此。
    return {
      recorded: [],
      count: 0,
      skipped: [],
      errors: [],
      note: 'v2.13 起不再登记「方向在本期内保持活跃」类伪预测（那是对当前状态的'
        + '描述，不是可证伪的预测）。台账只登记 buildForecastDiscrimination()'
        + '辨别出的 settleable 他人主张——有主体、有事件、有时点，可到期结算。',
    };
  }

  dueDateFor(period) {
    // 第一阶段 0-12 个月 → 一年后结算；后续阶段顺延。
    // 注意：period 是中文「第一阶段」，第(.)阶段 抓到的是全角「一」，
    // Number() 会得 NaN → new Date() 抛 Invalid time value。必须做中文数字映射。
    const CN = { '一': 1, '二': 2, '三': 3, '1': 1, '2': 2, '3': 3 };
    const m = /第(.)阶段/.exec(period || '');
    const idx = (m && CN[m[1]]) || 1;
    const d = new Date(this.timestamp);
    if (isNaN(d.getTime())) return null;   // 时间戳异常时不猜日期
    d.setUTCMonth(d.getUTCMonth() + idx * 12);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  generateSummary() {
    const r = this.analysis.results || {};
    const disc = r.discrimination || {};
    const sg = this.signals;
    return {
      verdict: disc.verdict || 'unknown',
      score: disc.overallScore || 0,
      logicQuality: (r.logic || {}).reasoningQuality || 'unknown',
      moralDimensions: ((r.moral || {}).foundations || []).map(f => f.foundation),
      // v2：摘要改由真实信号构成
      signalCount: sg.totalItems,
      topDomains: sg.domains.slice(0, 3).map(d => `${d.name}(${d.count})`),
      dateRange: sg.dateRange,
      keyMessage: this.extractKeyMessage(disc.verdict, disc.overallScore, (r.logic || {}).reasoningQuality),
    };
  }

  extractKeyMessage(verdict, score, logicQuality) {
    if (this.signals.totalItems === 0) {
      return '本次无 live 新闻信号，推演引擎不做无证据推断';
    }
    const parts = [];
    if (verdict === 'block') parts.push('输入数据存在显著风险信号');
    if (logicQuality === 'poor') parts.push('推演逻辑质量偏低');
    parts.push(`基于 ${this.signals.totalItems} 条 live 信号、${this.signals.domains.length} 个主题域`);
    return parts.join('，');
  }

  // ───────────────────────────────────────────────────────────────
  // 阶段推演：按"域热度 × 时间新鲜度"分三阶段
  // 最热的进第一阶段，次热的进第二、三阶段，避免三段重复同一批域
  // ───────────────────────────────────────────────────────────────
  generateStages() {
    const ds = this.signals.domains;
    if (ds.length === 0) return [];
    const out = [];

    for (const [i, h] of HORIZONS.entries()) {
      const slice = ds.slice(i * 2, i * 2 + 2).filter(Boolean);
      if (slice.length === 0) continue;

      const evidence = [];
      // 同一条新闻可能命中多个域（DOMAINS 顺序扫描但允许多域命中），
      // 两个域的 items 会含同一条 link。不去重则同一 stage 的证据数组
      // 出现重复条目，读者会以为证据量比实际多。
      const seenKey = new Set();
      for (const d of slice) {
        for (const it of d.items.slice(0, 3)) {
          const key = it.link || it.title;
          if (seenKey.has(key)) continue;
          seenKey.add(key);
          evidence.push({
            domain: d.name,
            title: it.title.slice(0, 120),
            source: it.source,
            date: it.pubDate || '(未标注)',
            link: it.link,
          });
        }
      }

      const total = slice.reduce((s, d) => s + d.count, 0);
      out.push({
        period: h.label,
        domains: slice.map(d => d.name),
        _domainIds: slice.map(d => d.id),   // 供预测台账生成可读 id
        description: this.describeStage(slice, i),
        evidence,
        keyEvents: slice.map(d => `${d.name}：${d.count} 条信号（近 30 天 ${d.recent} 条）`),
        riskLevel: this.stageRisk(slice),
        confidence: this.stageConfidence(slice, i),
        indicators: slice.map(d => `${d.name}信号量与近期占比`),
        conclusion: this.stageConclusion(slice, i),
        // v2 新增：信号量不足以支撑阶段判断时显式标注，避免读者把
        // "只有 2 条信号的阶段"当成可靠推演
        sufficient: total >= 5,
        insufficientReason: total < 5
          ? `本阶段仅 ${total} 条 live 信号，低于 5 条阈值，只作为观察方向记录，不构成阶段结论`
          : null,
      });
    }
    return out;
  }

  describeStage(slice, idx) {
    const names = slice.map(d => d.name).join('、');
    if (idx === 0) {
      return `当前信号最集中的方向：${names}。这些域近期条目占比高，属于正在发生的进展。`;
    }
    return `次级活跃方向：${names}。信号量少于第一阶段，多处于早期或周期性波动。`;
  }

  stageRisk(slice) {
    // 信号量不足时不允许给高/中——否则会出现"基于 2 条信号的高风险阶段"
    // 这种自相矛盾的输出（结论自己说"低于 5 条不应引用"，风险却标高）。
    const total = slice.reduce((s, d) => s + d.count, 0);
    if (total < 5) return '证据不足';
    const riskDomains = slice.filter(d => ['ai_safety', 'info_security', 'governance', 'space'].includes(d.id));
    if (riskDomains.length >= 2) return '高';
    if (riskDomains.length === 1) return '中';
    return '低';
  }

  /** 置信度由信号量与新鲜度决定，不用模板写死 */
  stageConfidence(slice, idx) {
    const total = this.signals.totalItems;
    const share = slice.reduce((s, d) => s + d.count, 0) / Math.max(1, total);
    const freshness = slice.reduce((s, d) => s + d.heat, 0) / slice.length;
    const raw = Math.min(1, share * 1.2) * 0.5 + freshness * 0.5 - idx * 0.1;
    return Math.round(Math.max(0.1, Math.min(0.95, raw)) * 100) / 100;
  }

  stageConclusion(slice, idx) {
    const names = slice.map(d => d.name).join('、');
    const capped = slice.reduce((s, d) => s + d.count, 0);
    return `本阶段主要观察 ${names}。基于 ${capped} 条 live 信号，置信度 ${this.stageConfidence(slice, idx)}；`
      + '信号量低于 5 条的方向不应作为结论引用。';
  }

  // ───────────────────────────────────────────────────────────────
  // 转折点：近期（30 天内）高热度域中的最新信号
  // 只输出已观察到的事实，不预测未观察到的"未来事件"
  // ───────────────────────────────────────────────────────────────
  identifyTurningPoints() {
    const out = [];
    const recentWindow = 30 * 86400000;
    const now = Date.now();

    for (const d of this.signals.domains.slice(0, 6)) {
      const recent = d.items
        .map(it => ({ it, t: Date.parse(it.pubDate) }))
        .filter(x => !isNaN(x.t) && now - x.t <= recentWindow)
        .sort((a, b) => b.t - a.t);
      if (recent.length === 0) continue;

      const top = recent[0];
      out.push({
        year: new Date(top.t).toISOString().slice(0, 10),
        event: top.it.title.slice(0, 140),
        impact: d.count >= 5 ? '高' : d.count >= 3 ? '中' : '低',
        type: d.name,
        probability: Math.round(Math.min(0.9, 0.4 + d.heat * 0.5) * 100) / 100,
        evidence: { source: top.it.source, link: top.it.link },
        note: '此为本期观察到的最近信号，非未来事件预测；probability 由域热度推导，不是统计概率',
      });
    }
    return out.sort((a, b) => b.probability - a.probability);
  }

  // ───────────────────────────────────────────────────────────────
  // [v2.7 新增] 专项大模型趋势段：把 frontier_models 域的信号整理成
  // 「来源分布 + 最新进展倒序 + 周度节奏」三块，直接回答用户要求的
  // 「专项大模型的趋势和最新进展」。
  //
  // 诚实性约束：
  //   - 只输出 origin=live / live-search 的真实条目，不带 knowledge-base
  //   - 不判断哪个模型更强（那是能力评测，不是本引擎的职责）
  //   - 发布日期一律原样给出，不做「今天发布」的伪装
  // ───────────────────────────────────────────────────────────────
  buildFrontierModelSection() {
    const d = this.signals.domains.find(x => x.id === 'frontier_models');
    const note = '本节只做信号整理与节奏统计，不评判模型能力高低；'
      + '发布日期为来源标注的原值，超过 24 小时的条目不代表近期发生。';
    if (!d || d.count === 0) {
      return {
        available: false,
        reason: '本期未采集到 frontier_models 域的 live 信号',
        note,
      };
    }

    const parsed = d.items
      .map(it => ({ it, t: Date.parse(it.pubDate) }))
      .filter(x => !isNaN(x.t))
      .sort((a, b) => b.t - a.t);
    const allDates = parsed.map(x => x.t);
    const dateRange = allDates.length
      ? {
          from: new Date(Math.min(...allDates)).toISOString().slice(0, 10),
          to: new Date(Math.max(...allDates)).toISOString().slice(0, 10),
        }
      : { from: '(无日期)', to: '(无日期)' };
    const now = Date.now();
    const recent30d = parsed.filter(x => now - x.t <= 30 * 86400000).length;

    // [v2.14] sitemap 源日期出处透明化。
    // v2.14 修复的问题：sitemap 只有 lastmod（页面修改时间），旧页被编辑会更新
    // lastmod，按它排序取「最新」会把旧闻当新闻、发布日期全是假的。
    // 现在的条目分两种日期出处（collect-news.js 打标）：
    //   page-published  = 从页面 HTML 抽到的真实发布时间
    //   sitemap-lastmod = 页面抓取失败，退化为 lastmod——这是修改时间不是发布
    //                     时间，实际发布时间可能更早，报告必须显式说明，
    //                     否则下游会把修改时间当发布日引用。
    const dateFallback = d.items.filter(i => i._dateSource === 'sitemap-lastmod').length;
    const datePublished = d.items.filter(i => i._dateSource === 'page-published').length;
    const note2 = dateFallback > 0
      ? note + ` 注意：${dateFallback} 条 sitemap 源条目的日期是页面最后修改时间`
        + '（页面抓取失败未能获取发布时间），实际发布时间可能更早，引用须标注。'
      : note;

    const bySrc = new Map();
    for (const { it } of parsed) {
      const s = it.source || '(未标注)';
      if (!bySrc.has(s)) bySrc.set(s, { source: s, count: 0, latest: '' });
      const e = bySrc.get(s);
      e.count++;
      if (!e.latest) e.latest = it.pubDate ? it.pubDate.slice(0, 16) : '';
    }
    const sourceBreakdown = [...bySrc.values()].sort((a, b) => b.count - a.count);

    // 周度节奏：按 ISO 周聚合条目数，回答「这个域最近是不是在加速」
    const byWeek = new Map();
    for (const { t } of parsed) {
      const dt = new Date(t);
      const week = `${dt.getUTCFullYear()}-W${String(Math.ceil(((t - new Date(dt.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7)).padStart(2, '0')}`;
      byWeek.set(week, (byWeek.get(week) || 0) + 1);
    }
    const series = [...byWeek.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 8)
      .map(([week, count]) => ({ week, count }));

    return {
      available: true,
      total: d.count,
      distinctSources: bySrc.size,
      dateRange,
      recent30d,
      dateProvenance: { pagePublished: datePublished, sitemapLastmod: dateFallback },
      sourceBreakdown,
      latestItems: parsed.slice(0, 12).map(({ it }) => ({
        title: it.title.slice(0, 160),
        source: it.source || '(未标注)',
        date: it.pubDate ? it.pubDate.slice(0, 16) : '(未标注)',
        // [v2.14] 日期出处随条目给出，下游引用时可判断该日期是发布时间
        // 还是页面修改时间（sitemap-lastmod）
        dateSource: it._dateSource || 'source-pubdate',
        link: it.link,
      })),
      series,
      note: note2,
    };
  }

  // ───────────────────────────────────────────────────────────────
  // 风险：只从"安全/治理/隐私"类域的真实信号推导
  // ───────────────────────────────────────────────────────────────
  assessRisks() {
    const riskDomainIds = ['ai_safety', 'info_security', 'governance', 'space'];
    const out = [];
    for (const d of this.signals.domains) {
      if (!riskDomainIds.includes(d.id)) continue;
      if (d.count < 2) continue; // 少于 2 条不构成风险信号
      out.push({
        risk: d.name,
        description: `本期采集到 ${d.count} 条${d.name}相关 live 信号（近 30 天 ${d.recent} 条），`
          + `来源包括 ${[...new Set(d.items.map(i => i.source))].slice(0, 3).join('、')}。`,
        severity: d.count >= 6 ? '高' : d.count >= 4 ? '中' : '低',
        likelihood: Math.round(Math.min(0.9, 0.3 + d.heat * 0.6) * 100) / 100,
        evidence: d.items.slice(0, 3).map(i => ({ title: i.title.slice(0, 100), source: i.source, link: i.link })),
        mitigation: '需针对具体信号逐条核实后制定，本引擎不输出通用对策模板',
      });
    }
    return out;
  }

  // ───────────────────────────────────────────────────────────────
  // [v2.13] 预测辨别：从本期信号里抽出含前瞻声明的条目，逐条辨别其
  // 可证伪性 / 基准概率 / 推理有效性 / 证伪条件。
  //
  // 与「推演」的根本区别：这里不产出「我认为未来会怎样」，
  // 而是产出「这些关于未来的主张，哪些站得住脚」。
  // 这是 Layer 1（辨别者）的独有位置。
  //
  // 抽取判据：只取**含前瞻词**的条目（将/会/计划/预计/by 20xx/roadmap…），
  // 且句子长度足够承载一个完整主张。纯事实陈述（已发布、已披露）不取——
  // 那不是预测。
  // ───────────────────────────────────────────────────────────────
  buildForecastDiscrimination() {
    // [v2.13] 抽取判据必须收紧。
    //
    // 第一版用「含 will/将/计划 就抽」，实测 10 条里 7 条是技术描述句——
    // "the robot's inference will be confined to the onboard GPU"、
    // "Argon will launch at an introductory price of $2"。这些句子里 will
    // 只是语法将来时或定价说明，不是对未来的承诺。把它们当预测辨别，
    // 产出的是「不可证伪：无时间点」的噪音。
    //
    // 收紧为两类真预测形态：
    //   A. 前瞻词 + 时间点（"will launch in 2027"、"将于 2027 年发布"）
    //   B. 承诺/目标结构（"plans to"、"aims to"、"目标"、"roadmap"、"有望"）
    // 且排除纯定价/设计说明（"at a price of"、"is confined to"、"will be able to"）。
    // [v2.13] 抽取判据必须同时覆盖**相对时间**。
    //
    // 实测踩坑：Anthropic 的 self-replicating-ai 正文里有两条教科书级可结算预测
    //   "If small models improve at their historical rate, they'll match this
    //    capability level by the end of this year."
    //   "the trend line puts a small model at that level by the end of 2026."
    // 第一条用 `by the end of this year`——相对时间，不含 20xx，
    // 我的 TIME 正则不认它，COMMIT 也不命中（没有 plans to 这类词）。
    // 结果这条质量最高的预测被漏掉，只能抓到意图声明。
    //
    // 因此 TIME 必须含相对时间词，COMMITMENT 必须含条件式预测
    // （"if X, they'll Y"、"X will Y by Z"）——条件句本身就是预测的典型形态。
    //
    // [v2.13] 还要认**义务句式**：EU AI Act 这类监管源的表述是
    //   "What providers and deployers must do by August 2026"
    // 有主体（providers）、有事件（must do）、有法定时点（August 2026），
    // 是比厂商意图声明更硬的可结算预测——到点就能验证有没有做到。
    // 实测该句式 COMMITMENT 不命中（没有 plans to 这类词），必须补。
    const TIME_POINT = /(20\d{2}(?:-Q[1-4]|-H[12]|-\d{2})?|明年|后年|未来\s*\d+\s*年?|个月内|年内|季度|Q[1-4]|H[12]|within\s+\d|in\s+20\d{2}|by\s+20\d{2}|next\s+(?:year|quarter|month)|this\s+year|end\s+of\s+(?:this\s+)?year|year[\s-]end|年底|今年|明年初|年底前|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+20\d{2}|20\d{2}\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)|Q[1-4]\s+20\d{2})/i;
    const COMMITMENT = /(plans?\s+to|aims?\s+to|intends?\s+to|expects?\s+to|targets?\s|goal\s+is|on\s+the\s+roadmap|roadmap| slated|poised|set\s+to|计划|预计|拟于|定于|有望|目标|路线图|将要|将会|will\s+(?:match|reach|hit|achieve|arrive|be\s+at)|they'?ll\s+(?:match|reach|hit|be)|would\s+(?:match|reach|hit|be)|must\s+(?:do|comply|implement|ensure|provide|register|report|obtain|conduct)|shall\s+(?:do|comply|implement|ensure|provide|be)|(?:is|are|be)\s+required\s+to|required\s+to\s+(?:comply|implement|ensure|provide|register)|obligation\s+to|义务|必须|须于|应于|应当)/i;
    const NOT_A_PREDICTION = /(at\s+(?:an?\s+)?(?:introductory\s+)?price|priced\s+at|is\s+confined\s+to|will\s+be\s+able\s+to|is\s+designed\s+to|this\s+ensures|with\s+this\s+new|定价|价格为|售价|must\s+register\s+by|registration\s+(?:deadline|closes|due)|register\s+by\s+\d|wishing\s+to\s+attend|virtual\s+meeting|webinar|会议注册|报名截止| wishing to attend)/i;
    const claims = [];
    for (const it of this.signals.items) {
      const text = `${it.title || ''} ${it.body || ''} ${it.description || ''}`;
      // [v2.13] 归一化弯引号/弯撇号。
      //
      // 实测踩坑：Anthropic 正文里 `they'll` 实际是 `they’ll`（U+2019 弯撇号），
      // 而 COMMITMENT 正则写的是直引号 `'`，导致这条质量最高的可结算预测
      // （"they'll match this capability level by the end of this year"）
      // 被漏掉。网页正文普遍用弯引号，这是抽取层的通用缺陷——
      // 所有含撇号的英文缩写（they'll / won't / it's / don't）都会踩。
      // 归一化后正则只需写直引号一种形态。
      const norm = text.replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
        .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"');
      const sents = norm.split(/(?<=[.!?。！？])\s+/);
      // 找第一个同时满足「有前瞻结构」且「不是定价/设计说明」的句子
      const hitIdx = sents.findIndex(s => {
        if (s.length < 20 || s.length > 400) return false;
        if (NOT_A_PREDICTION.test(s)) return false;
        return (COMMITMENT.test(s) && TIME_POINT.test(s))   // A: 承诺+时间
          || (COMMITMENT.test(s) && /(将|计划|预计|有望|目标|plans?|aims?|expects?|targets?|roadmap)/i.test(s)); // B: 明确承诺
      });
      if (hitIdx < 0) continue;
      // [v2.13] 把命中句连同**后 2 句**一起送进辨别器。
      //
      // 实测踩坑：Anthropic 的预测句是
      //   "If small models improve at their historical rate, they'll match this
      //    capability level by the end of this year."
      // 而机制与先行指标写在**后面的句子**里：
      //   "The solid line is the least-squares fit ... with a gain of 13.7 ECI
      //    per year (R 2 of 0.95)."
      // 只送单句时推理有效性 0/3——机制明明存在却判不出来。
      // 送上下文后辨别器能读到机制，推理分才反映真实质量。
      const context = sents.slice(hitIdx, hitIdx + 3).join(' ').trim();
      claims.push({
        text: context.slice(0, 600),
        // 保留命中句本身，供报告引用时聚焦
        claimSentence: sents[hitIdx].trim(),
        source: it.source,
        date: it.pubDate,
        url: it.link,
      });
      if (claims.length >= 20) break;
    }
    if (claims.length === 0) {
      return {
        available: false,
        reason: `本期 ${this.signals.items.length} 条 live 信号中未抽到含前瞻承诺的可辨别预测`,
        note: '只辨别含明确承诺结构（plans to / aims to / 计划 / 预计 / roadmap）的条目；'
          + '纯事实陈述与技术描述句不是预测，不参与辨别。',
      };
    }
    let ledger = [];
    try {
      ledger = predictionLedger.load().predictions || [];
    } catch (_) { ledger = []; }
    const res = discriminateForecasts(claims, { ledger });

    // ── 把可结算预测真的登记进台账 ──────────────────────────────
    // [v2.13] 实测踩坑：v2.13 首轮 agent 在报告里写「这条应登记进台账，
    // 2026 年底结算」，但台账里只有旧的「方向保持活跃」伪预测——
    // 没人真登记。note 里写「应登记」是句空话。
    // 不登记就无法到期结算、无法建立校准曲线，「辨别」只停留在报告里。
    //
    // 登记规则：
    //   1. 只登记 settleable=true 的（有时间点且可证伪）
    //   2. id 用「来源 + 日期 + 序号」保证幂等——同一轮重复跑不会重复登记
    //   3. probability 用基准概率（不是宣称置信度）——校准曲线比的就是这个
    //   4. dueOn 从辨别结果的结算点换算成具体日期（Q4 → 12-31）
    //   5. 登记失败不能中断报告（台账写不进去不该让整轮失败）
    const registered = [];
    const skipped = [];
    for (const r of (res.results || [])) {
      if (!r.settleable) continue;
      // [v2.13] id 只用**稳定字段**：来源 + 结算点（+ URL 兜底）。
      //
      // 实测踩坑（三次，每次原因不同）：
      //   1. id 含 claimSentence 前 40 字符 → claimSentence 会变（标题是否拼进
      //      正文开头取决于命中句位置），同一条预测产生两个 id。
      //   2. id 含 r.date（pubDate）→ **sitemap 源的 lastmod 是「页面最后修改
      //      时间」不是发布时间**，页面一修订 lastmod 就变。实测同一条
      //      Anthropic 预测：10-13 那轮 lastmod=10-13，今天 lastmod=10-21，
      //      于是产生 fc-anthropic-...-13202600-2026-q4 与
      //      fc-anthropic-...-21202617-2026-q4 两条重复条目。
      //      （fetchSitemap 的注释里早就写明 lastmod 不是发布时间，
      //       但 id 还是用了它——知道不等于做到。）
      //
      // 规律：id 绝不能含会变的字段。最终方案：
      //   来源 + URL 末段 + 结算点。
      // URL 是文章的永久地址，最稳定；结算点区分同一来源的不同预测。
      //
      // [v2.13] 取末段前必须**剥掉查询串与 hash**。
      // 实测踩坑：EU AI Act 的 feed 给的文章链接带 UTM 跟踪参数
      //   https://artificialintelligenceact.eu/the-scientific-panel/?utm_source=rss&utm_medium=rss...
      // 直接 split('/').pop() 拿到的是 "?utm_source=rss&utm_medium=rss&utm_campaign=rss"
      // 而不是文章名 the-scientific-panel。后果：同源所有文章的 URL 末段
      // 完全相同（UTM 是 feed 统一加的），id 只剩「来源+结算点」两个维度——
      // 实测两篇不同文章产生同一个 id，第二篇被误判「已登记」而永久跳过。
      // 这是比重复登记更糟的错：**漏登记**。
      const urlTail = (r.url || '')
        .replace(/[?#].*$/, '')        // 剥查询串与 hash
        .replace(/\/$/, '')
        .split('/').pop() || '';
      const id = `fc-${(r.source || 'unknown').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
        + `-${urlTail.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40) || 'nourl'}`
        + `-${(r.dueOn || 'nodue').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
      const dueDate = r.dueOn && /^\d{4}-Q([1-4])$/.test(r.dueOn)
        ? `${r.dueOn.slice(0, 4)}-${['03-31', '06-30', '09-30', '12-31'][Number(r.dueOn.slice(-1)) - 1]}`
        : (r.dueOn || null);
      // [v2.13] 登记前校验：结算点不得早于发布日。
      //
      // 实测踩坑：修「裸年份前置月份检测」之前，EU AI Act 的
      // "must do by August 2026" 被解析成 2026-Q4（dueDate 2026-12-31）；
      // 修好之后解析成 2026-Q3（dueDate 2026-09-30）。因为 id 里含 dueOn，
      // 两次产生了不同 id，台账里同一条预测留下两条矛盾条目
      // （既有 2026-12-31 又有 2026-09-30）。
      //
      // 防护：结算点早于发布日的预测不登记——那一定是解析错了
      // （预测的兑现时点不可能在它被做出之前）。这条规则与具体 bug 无关，
      // 是通用的合理性校验。
      const pubTime = r.date ? Date.parse(r.date) : NaN;
      const dueTime = dueDate ? Date.parse(dueDate) : NaN;
      if (!isNaN(pubTime) && !isNaN(dueTime) && dueTime < pubTime) {
        skipped.push({ id, reason: `结算点 ${dueDate} 早于发布日，解析可疑，不登记` });
        continue;
      }
      try {
        const rec = predictionLedger.record({
          id,
          claim: (r.claimSentence || r.text || '').slice(0, 300),
          probability: r.baseRate ? r.baseRate.rate : 0.35,
          domain: r.category || 'general',
          rationale: `他人主张，引擎辨别 settleable；推理 ${r.reasoning.score}/3；`
            + `基准概率 sample=${r.baseRate ? r.baseRate.sample : 0}`
            + `${r.baseRate && r.baseRate.source === 'default-prior' ? '（通用先验，非统计结论）' : ''}；`
            + `来源 ${r.source}；原文 ${r.url || '(无链接)'}`,
          dueOn: dueDate,
        });
        registered.push({ id: rec.id, dueOn: dueDate, probability: rec.probability });
      } catch (e) {
        // id 已存在 = 上轮已登记过，这是正常的幂等跳过，不算错误
        skipped.push({ id, reason: e.message });
      }
    }

    return {
      ...res,
      // 登记结果回填进报告，让 agent 与读者都能看到「这条真的进台账了」
      ledgerRegistration: {
        registered,
        skipped,
        note: registered.length > 0
          ? `已登记 ${registered.length} 条可结算预测进台账，到期结算 Brier 分数。`
          : '本期无可结算预测需要登记（或已在此前轮次登记过）。',
      },
      note: '本段只辨别预测的表述与结构质量（可证伪性含文本性质判别/基准概率/推理有效性/证伪条件），'
        + '不判断其内容真假。可结算的预测（settleable=true）已自动登记进台账，'
        + '到期结算 Brier 分数以建立校准曲线。指南/参考页文本（reference-text）没有主张主体，'
        + '不可结算、不登记——与「意图声明」是两类对象。',
    };
  }

  // ───────────────────────────────────────────────────────────────
  // v3.0.0 商业主张辨别：心虫商业未来推演的核心能力
  //
  // 与 buildForecastDiscrimination 的分工：
  //   前者辨别「关于未来的预测」——判据是时点与可结算性
  //   本方法辨别「关于市场的陈述」——判据是量化与证据等级
  //
  // 为什么必须分开：商业推演面对的绝大多数主张不是预测而是陈述。
  // "Enterprises are adopting AI agents" 没有时点，用 forecast 判据会全判
  // 「不可证伪：无时间点」——但这句话真正的问题不是没时点，是**没量化、
  // 没出处**。用错判据会把有价值的商业信号当噪音滤掉。
  //
  // 纪律（心虫铁律）：只辨别主张的表述与证据质量，不生成商业建议。
  // 「这对心虫意味着什么」由报告 agent 判断并标注归属，引擎不代劳。
  // ───────────────────────────────────────────────────────────────
  buildCommercialDiscrimination() {
    // [v3.0.0] 优先 business 域，economy 只作补充。
    //
    // 实测踩坑（第一版）：business 与 economy 混在一起按 signals.items 顺序取，
    // 结果 24 个候选里 14 个来自 Fed/ECB/NBER——全是公告标题与论文标题
    // （"Minutes of the Federal Open Market Committee"），它们**不是商业主张**，
    // 是事实公告。而真正的商业主张（TechCrunch 的融资、ProductHunt 的发布）
    // 反而排不进来。
    //
    // 修法：先取 business 全部候选，再用 economy 补足到上限。
    const PICK_BUSINESS_FIRST = ['business', 'economy'];
    const byBucket = { business: [], economy: [] };
    for (const it of this.signals.items) {
      if (!PICK_BUSINESS_FIRST.includes(it.bucket)) continue;
      // 送命中句 + 后 2 句上下文（与 forecast 一致）：证据词常在后续句里
      const norm = `${it.title || ''} ${it.body || ''} ${it.description || ''}`
        .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
        .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"');
      const sents = norm.split(/(?<=[.!?。！？])\s+/);
      // 找第一句含商业主张线索的（金额/百分比/市场词/融资词）
      const idx = sents.findIndex(s => {
        if (s.length < 25 || s.length > 400) return false;
        return /(\$\s*[\d.]+|\d+\s*%|market|enterprises?|customers?|funding|raises?|valuation|adoption|deploy|regulator|compliance|survey|competitor|rival|open[\s-]?(source|weight))/i.test(s);
      });
      if (idx < 0) continue;
      byBucket[it.bucket].push({
        text: sents.slice(idx, idx + 3).join(' ').trim().slice(0, 600),
        claimSentence: sents[idx].trim(),
        source: it.source,
        date: it.pubDate,
        url: it.link,
        category: (it.domains || [])[0] || 'market_claims',
      });
    }
    // business 优先取满，economy 补足
    const candidates = [...byBucket.business.slice(0, 16), ...byBucket.economy.slice(0, 8)];
    if (candidates.length === 0) {
      return {
        available: false,
        reason: `本期 ${this.signals.items.length} 条 live 信号中（商业域 business/economy）未抽到含商业主张的条目`,
        note: '只辨别含市场陈述结构（采用/需求/替代/规模/融资/估值/竞品/合规/信任）的条目。',
      };
    }
    const results = candidates.map(c => discriminateCommercial(c));

    // 按 verdict 汇总
    const byVerdict = {};
    for (const r of results) byVerdict[r.verdict] = (byVerdict[r.verdict] || 0) + 1;
    const byEvidence = {};
    for (const r of results) byEvidence[r.evidence.label] = (byEvidence[r.evidence.label] || 0) + 1;
    const byKind = {};
    for (const r of results) if (r.kind !== 'unclassified') byKind[r.kind] = (byKind[r.kind] || 0) + 1;

    // 决策相关 = 证据等级 >=3 或推理 >=2，且非不可证伪
    const decisionRelevant = results.filter(r => r.decisionRelevant);

    return {
      available: true,
      audited: results.length,
      summary: {
        audited: results.length,
        byVerdict,
        byEvidence,
        byKind,
        decisionRelevantCount: decisionRelevant.length,
        factualCount: byVerdict.factual || 0,
        unfalsifiableCount: byVerdict.unfalsifiable || 0,
        wellFormedCount: byVerdict['well-formed'] || 0,
      },
      results: results.slice(0, 16),
      note: '本段只辨别商业主张的表述与证据质量（可证伪性/证据等级/推理有效性/证伪条件），'
        + '不判断主张内容真假，也不生成「心虫应该怎么做」的商业建议。'
        + '证据等级：独立验证(4) > 第三方调查/公开财报(3) > 厂商自述/媒体报道(2) > 无出处(1)。',
    };
  }

  // ───────────────────────────────────────────────────────────────
  // 机会：从非风险类域推导，同样要求信号量
  // ───────────────────────────────────────────────────────────────
  identifyOpportunities() {
    const riskDomainIds = ['ai_safety', 'info_security', 'governance', 'space'];
    const out = [];
    for (const d of this.signals.domains) {
      if (riskDomainIds.includes(d.id)) continue;
      if (d.count < 2) continue;
      out.push({
        opportunity: d.name,
        description: `${d.count} 条 live 信号指向${d.name}方向的活跃（近 30 天 ${d.recent} 条）。`,
        impact: d.count >= 5 ? '高' : d.count >= 3 ? '中' : '低',
        timeline: this.timelineFor(d),
        stakeholders: [...new Set(d.items.map(i => i.source))].slice(0, 3),
        evidence: d.items.slice(0, 3).map(i => ({ title: i.title.slice(0, 100), source: i.source, link: i.link })),
      });
    }
    return out;
  }

  timelineFor(d) {
    if (d.heat >= 0.6) return '0-12 个月（近期活跃）';
    if (d.heat >= 0.3) return '12-24 个月';
    return '24 个月以上（信号稀疏，需持续观察）';
  }

  // ───────────────────────────────────────────────────────────────
  // 建议：从实际命中的风险与机会生成，不输出固定清单
  // ───────────────────────────────────────────────────────────────
  generateRecommendations() {
    const risks = this.assessRisks();
    const opps = this.identifyOpportunities();
    const out = [];

    for (const r of risks.filter(x => x.severity === '高').slice(0, 3)) {
      out.push({
        priority: '高',
        recommendation: `就「${r.risk}」方向的 live 信号做事实核查与影响评估`,
        rationale: `该域本期信号密度高（severity ${r.severity}，likelihood ${r.likelihood}），且已列入风险观察`,
        evidence: r.evidence,
        stakeholders: r.evidence.map(e => e.source),
      });
    }
    for (const opp of opps.filter(x => x.impact === '高').slice(0, 3)) {
      out.push({
        priority: '中',
        recommendation: `跟踪「${opp.opportunity}」方向的进展窗口（${opp.timeline}）`,
        rationale: `${opp.impact}影响 + ${opp.description}`,
        evidence: opp.evidence,
        stakeholders: opp.stakeholders,
      });
    }

    if (out.length === 0) {
      out.push({
        priority: '低',
        recommendation: '扩大采集范围或提高采集频率',
        rationale: `本期仅 ${this.signals.totalItems} 条 live 信号，且集中在 ${this.signals.domains.length} 个域，不足以形成行动建议`,
        evidence: [],
        stakeholders: [],
      });
    }
    return out;
  }

  // ───────────────────────────────────────────────────────────────
  // 置信度：v1 只有 3 个变量。v2 加入信号量、域覆盖、时间新鲜度
  // ───────────────────────────────────────────────────────────────
  calculateConfidence() {
    const r = this.analysis.results || {};
    const baseScore = (r.discrimination || {}).overallScore || 0;
    const logicQuality = (r.logic || {}).reasoningQuality || 'poor';
    const confidenceIssues = (r.confidence || {}).issues?.length || 0;

    const sg = this.signals;
    const signalScore = Math.min(1, sg.totalItems / 30);          // 30 条满分
    const coverageScore = Math.min(1, sg.domains.length / 6);     // 6 个域满分
    const undomainedPenalty = sg.totalItems ? (sg.undomained / sg.totalItems) * 0.15 : 0.15;

    let confidence = baseScore * 0.25                       // 心虫判定只占 1/4
      + signalScore * 0.35
      + coverageScore * 0.25
      - undomainedPenalty;

    if (logicQuality === 'good') confidence += 0.05;
    else if (logicQuality === 'poor') confidence -= 0.1;
    confidence -= confidenceIssues * 0.03;

    confidence = Math.max(0, Math.min(1, confidence));

    return {
      score: Math.round(confidence * 100) / 100,
      level: confidence > 0.75 ? '高' : confidence > 0.5 ? '中' : '低',
      factors: {
        baseScore, logicQuality, confidenceIssues,
        signalScore: Math.round(signalScore * 100) / 100,
        coverageScore: Math.round(coverageScore * 100) / 100,
        undomainedRatio: sg.totalItems ? Math.round((sg.undomained / sg.totalItems) * 100) / 100 : null,
        adjustment: Math.round((confidence - baseScore) * 100) / 100,
      },
      note: '置信度由信号量与域覆盖决定。心虫判定只占 25%——心虫判的是措辞形态，不是事实密度',
    };
  }
}

/**
 * 格式化报告为 Markdown
 */
function formatReport(report) {
  const lines = [];

  lines.push('# 🔮 人类未来三年发展推演');
  lines.push('');
  lines.push(`> **生成时间**: ${report.meta.timestamp}`);
  lines.push(`> **心虫版本**: v${report.meta.heartflowVersion}`);
  lines.push(`> **模块数**: ${report.meta.modulesLoaded}`);
  lines.push(`> **推演引擎**: v${report.meta.version}`);
  lines.push(`> **信号基础**: ${report.meta.signalCount} 条 live 新闻 / ${report.meta.domainsMatched} 个主题域`);
  lines.push('');

  if (report.degraded) {
    lines.push('## ⚠ 推演降级');
    lines.push('');
    lines.push(report.degradedReason);
    lines.push('');
    lines.push('本引擎不做无证据推演。请检查采集阶段是否成功（FETCH=1）。');
    return lines.join('\n');
  }

  lines.push('## 总体摘要');
  lines.push('');
  lines.push(`- **心虫判定**: ${report.summary.verdict}（评分 ${(report.summary.score * 100).toFixed(0)}%）`);
  lines.push(`- **逻辑质量**: ${report.summary.logicQuality}`);
  lines.push(`- **关键信息**: ${report.summary.keyMessage}`);
  lines.push(`- **信号时间范围**: ${report.summary.dateRange ? report.summary.dateRange.from + ' ~ ' + report.summary.dateRange.to : '(无日期)'}`);
  lines.push(`- **最活跃方向**: ${report.summary.topDomains.join('、') || '(无)'}`);
  lines.push('');

  // [v2.13] 标题改为如实描述：这是按本期信号热度的域分组，不是推演。
  // 真正的推演能力由「预测辨别」段提供（辨别他人的预测）。
  lines.push('## 信号热度分组（按本期活跃度排序，非推演）');
  lines.push('');
  for (const s of report.stages) {
    lines.push(`### ${s.period} — ${s.domains.join('、')}`);
    lines.push('');
    lines.push(s.description);
    lines.push('');
    lines.push(`- **风险等级**: ${s.riskLevel}`);
    lines.push(`- **置信度**: ${s.confidence}`);
    if (s.sufficient === false && s.insufficientReason) {
      lines.push(`- **⚠ 证据不足**: ${s.insufficientReason}`);
    }
    lines.push(`- **关键事件**: ${s.keyEvents.join('；')}`);
    lines.push(`- **结论**: ${s.conclusion}`);
    if (s.evidence.length) {
      lines.push('');
      lines.push('**证据条目**:');
      for (const e of s.evidence) {
        lines.push(`- [${e.domain}] ${e.title} — ${e.source}（${e.date}）${e.link ? ' ' + e.link : ''}`);
      }
    }
    lines.push('');
  }

  lines.push('## 关键转折点（本期观察到的信号，非未来预测）');
  lines.push('');
  if (report.turningPoints.length === 0) lines.push('（无 30 天内的高热度信号）');
  for (const t of report.turningPoints) {
    lines.push(`- **${t.year}** [${t.type}] ${t.event}`);
    lines.push(`  - 影响: ${t.impact} | 推导概率: ${t.probability} | 来源: ${t.evidence.source}`);
  }
  lines.push('');

  lines.push('## 专项大模型趋势与最新进展');
  lines.push('');
  const fm = report.frontierModelSection;
  if (!fm || !fm.available) {
    lines.push(`（${(fm && fm.reason) || '未运行'}）`);
    lines.push('');
    lines.push(`> ${(fm && fm.note) || ''}`);
  } else {
    lines.push(`本期专项大模型域共 ${fm.total} 条 live 信号，来自 ${fm.distinctSources} 个独立来源。`);
    lines.push(`时间跨度：${fm.dateRange.from} ~ ${fm.dateRange.to}；其中 ${fm.recent30d} 条在近 30 天内。`);
    lines.push('');
    lines.push('**厂商/来源分布**:');
    for (const s of fm.sourceBreakdown) {
      lines.push(`- ${s.source}: ${s.count} 条${s.latest ? `（最新 ${s.latest}）` : ''}`);
    }
    lines.push('');
    lines.push('**最新进展（按发布时间倒序，前 12 条）**:');
    for (const it of fm.latestItems) {
      lines.push(`- ${it.date} | ${it.title}`);
      lines.push(`  来源: ${it.source} | ${it.link}`);
    }
    lines.push('');
    if (fm.series.length) {
      lines.push('**周度发布节奏**:');
      lines.push('');
      lines.push('| 周 | 条目数 |');
      lines.push('|---|---|');
      for (const w of fm.series) lines.push(`| ${w.week} | ${w.count} |`);
      lines.push('');
      lines.push(`> ${fm.note}`);
    }
  }
  lines.push('');

  lines.push('## 风险评估');
  lines.push('');
  if (report.risks.length === 0) lines.push('（信号量不足，未形成风险判断）');
  for (const r of report.risks) {
    lines.push(`### ${r.risk} — severity ${r.severity}`);
    lines.push('');
    lines.push(r.description);
    lines.push(`- **likelihood**: ${r.likelihood}`);
    lines.push(`- **缓解**: ${r.mitigation}`);
    if (r.evidence && r.evidence.length) {
      lines.push('- **证据**:');
      for (const e of r.evidence) lines.push(`  - ${e.title} — ${e.source}`);
    }
    lines.push('');
  }

  lines.push('## 机会识别');
  lines.push('');
  if (report.opportunities.length === 0) lines.push('（信号量不足，未形成机会判断）');
  for (const o of report.opportunities) {
    lines.push(`### ${o.opportunity} — impact ${o.impact}`);
    lines.push('');
    lines.push(o.description);
    lines.push(`- **时间窗**: ${o.timeline}`);
    lines.push(`- **相关方**: ${o.stakeholders.join('、')}`);
    lines.push('');
  }

  lines.push('## 行动建议');
  lines.push('');
  for (const r of report.recommendations) {
    lines.push(`- **[${r.priority}]** ${r.recommendation}`);
    lines.push(`  - 依据: ${r.rationale}`);
  }
  lines.push('');

  lines.push('## 推演置信度');
  lines.push('');
  lines.push(`**${report.confidence.score}（${report.confidence.level}）**`);
  lines.push('');
  lines.push('| 因子 | 值 |');
  lines.push('|---|---|');
  const f = report.confidence.factors;
  lines.push(`| 心虫判定分 | ${f.baseScore} |`);
  lines.push(`| 逻辑质量 | ${f.logicQuality} |`);
  lines.push(`| 信号量得分 | ${f.signalScore} |`);
  lines.push(`| 域覆盖得分 | ${f.coverageScore} |`);
  lines.push(`| 未归类占比 | ${f.undomainedRatio} |`);
  lines.push(`| 净调整 | ${f.adjustment} |`);
  lines.push('');
  lines.push(`> ${report.confidence.note}`);
  lines.push('');

  // ══════════════════════════════════════════════════════════════
  // v3：真正的推演输出——因果链 / 跨域传导 / 趋势 / 时间轴 / 来源 / 公式
  // ══════════════════════════════════════════════════════════════

  const cc = report.causalChains;
  lines.push('## 因果链与干预点');
  lines.push('');
  if (!cc || !cc.available) {
    lines.push(`（${(cc && cc.reason) || '未运行'}）`);
  } else {
    if (cc.edgeSource === 'cooccurrence') {
      lines.push('⚠ 本图边来自主题域共现，不是实证因果规则（本期 AI 相关域独占活跃域，');
      lines.push('   跨域实证规则无适用对象）。共现只说明这些域被同一批事件牵连。');
      lines.push('');
    }
    lines.push(`**根因（入度为 0）**: ${cc.roots.join('、') || '(无)'}`);
    lines.push(`**终局（出度为 0）**: ${cc.outcomes.join('、') || '(无)'}`);
    lines.push('');
    lines.push('**因果链**:');
    for (const c of cc.chains) lines.push(`- ${c}`);
    lines.push('');
    lines.push('**干预点排序**（删掉它断开最多路径）:');
    for (const lp of cc.leveragePoints) {
      lines.push(`- ${lp.node} — 断开 ${lp.pathsBroken} 条路径（${Math.round(lp.ratio * 100)}%）`);
    }
    lines.push('');
    lines.push(`> ${cc.note}`);
  }
  lines.push('');

  const cd = report.crossDomainConduction;
  lines.push('## 跨域传导');
  lines.push('');
  if (!cd || !cd.available) {
    lines.push(`（${(cd && cd.reason) || '未运行'}）`);
  } else {
    lines.push('```');
    lines.push(cd.matrix);
    lines.push('```');
    lines.push('');
    lines.push('**主要传导目标**:');
    for (const t of cd.topTargets) {
      lines.push(`- → ${t.domain} 强度 ${t.strength} / 时延 ${t.lagMonths} 月 — ${t.why}`);
    }
    lines.push('');
    lines.push(`> ${cd.note}`);
  }
  lines.push('');

  const tc = report.trendClassification;
  lines.push('## 趋势判定（一次性事件 vs 持续趋势）');
  lines.push('');
  if (!tc || !tc.available) {
    lines.push('（无可聚合的日期序列）');
  } else {
    lines.push('| 域 | 周期数 | 归一化总量 | 倍增/半衰期(周) | 形态 | 方向 | 判定 | 归一化前判定 | 源数 |');
    lines.push('|---|---|---|---|---|---|---|---|---|');
    const SHAPE_CN = { steady: '平稳序列', spike: '尖峰', 'leading-outlier': '首端异常' };
    const DIR_CN = { rising: '上升', decaying: '衰减', flat: '持平' };
    for (const c of tc.classifications) {
      // [v2.11] 计数已做源归一化（每源折算为篇/周后取域内中位数）。
      // 不归一化时，"RSS 只返回最近一周"的源会被读成该域爆发，
      // "RSS 返回 10 周历史"的源会被读成该域衰退——那是采集窗口差异，
      // 不是真实信号变化。
      const hlRaw = c.halfLifePeriods;
      const hl = hlRaw === null ? '—' : (hlRaw === Infinity ? '∞' : hlRaw);
      const shape = SHAPE_CN[c.shape] || c.shape || '—';
      const dir = DIR_CN[c.direction] || c.direction || '—';
      // verdictChanged=true 必须显式标出：该域的"趋势"主要是采集假象
      const rawCol = c.verdictChanged
        ? `${c.rawVerdict}（不同→假象）`
        : (c.rawVerdict || '—');
      // 源数 <3 时归一化基本失效（中位数退化为均值），必须标出
      const srcCol = (c.normalizedFromSources || 0) < 3
        ? `${c.normalizedFromSources}（过少，归一化弱）`
        : String(c.normalizedFromSources || '—');
      lines.push(`| ${c.domain} | ${c.periods} | ${c.total} | ${hl} | ${shape} | ${dir} | ${c.verdict} | ${rawCol} | ${srcCol} |`);
    }
    lines.push('');
    lines.push('> 计数为源归一化后的折算值（每源折算为篇/周，域内取中位数），不是原始条目数。');
    lines.push('> 倍增/半衰期列语义随方向变化：上升时是倍增周期（越小增长越快），');
    lines.push('> 衰减时是半衰期（越小消亡越快）；∞ 表示序列平稳或首尾对称。');
    lines.push('> 「归一化前判定」列标注不同时，说明该域趋势主要由采集窗口差异造成，不是真实信号变化。');
    lines.push(`> ${tc.note}`);
  }
  lines.push('');

  const tl = report.timelineConflicts;
  lines.push('## 时间轴冲突检测');
  lines.push('');
  if (!tl || !tl.available) {
    lines.push(`（${(tl && tl.reason) || '未运行'}）`);
  } else {
    lines.push('**信号中声称的时间点**:');
    for (const o of tl.ordered) lines.push(`- ${o}`);
    lines.push('');
    if (tl.conflicts.length === 0) {
      lines.push('未检测到依赖违反或互斥冲突。');
    } else {
      lines.push('**冲突**:');
      for (const c of tl.conflicts) lines.push(`- [${c.type}] ${c.detail}`);
    }
    lines.push('');
    lines.push(`> ${tl.note}`);
  }
  lines.push('');

  const sa = report.sourceAdjudication;
  lines.push('## 来源可信度分级');
  lines.push('');
  if (!sa || !sa.available) {
    lines.push('（无来源信息）');
  } else {
    const t = sa.tierDistribution;
    lines.push(`不同来源数: ${sa.distinctSources}`);
    lines.push(`- T1 官方披露: ${t.T1 || 0}`);
    lines.push(`- T2 主流媒体/同行评议: ${t.T2 || 0}`);
    lines.push(`- T3 有方法论的分析: ${t.T3 || 0}`);
    lines.push(`- T4 自媒体/论坛: ${t.T4 || 0}`);
    lines.push('');
    lines.push(`> ${sa.note}`);
  }
  lines.push('');

  // [v2.13] 预测辨别段：本引擎不再自己生成未来，改为辨别他人的预测。
  const fd = report.forecastDiscrimination;
  lines.push('## 预测辨别（他人关于未来的主张，哪些站得住脚）');
  lines.push('');
  if (!fd || !fd.available) {
    lines.push(`（${(fd && fd.reason) || '未运行'}）`);
    lines.push('');
    lines.push(`> ${(fd && fd.note) || ''}`);
  } else {
    const s = fd.summary;
    lines.push(`本期抽到 ${fd.audited} 条含前瞻声明的预测，逐条辨别结果：`);
    lines.push(`  可结算 ${s.settleableCount} 条 | 结构完整 ${s.wellFormedCount} 条`
      + ` | 不可证伪 ${s.notForecastCount} 条 | 非预测文本 ${s.referenceTextCount || 0} 条`
      + ` | 校准警告 ${s.calibrationWarnings} 条`);
    lines.push('');
    const VERDICT_CN = {
      'not-a-forecast': '不可证伪', 'bare-assertion': '裸断言',
      'weakly-supported': '支撑不足', 'well-formed': '结构完整',
      // [v2.15] 指南/参考页文本：没有主张主体，与「意图声明」分开展示
      'reference-text': '非预测文本',
    };
    for (const r of fd.results.slice(0, 12)) {
      lines.push(`[${VERDICT_CN[r.verdict] || r.verdict}] ${r.text.slice(0, 110)}`);
      lines.push(`  来源: ${r.source} | 类别: ${r.category} | 结算点: ${r.dueOn || '(无)'}`
        + ` | 可结算: ${r.settleable ? '是' : '否'}`);
      lines.push(`  推理完整性: ${r.reasoning.score}/3`
        + `（${r.reasoning.checks.filter(c => c.present).map(c => c.label.split('（')[0]).join('、') || '无'}）`);
      lines.push(`  基准概率: ${Math.round(r.baseRate.rate * 100)}%`
        + `（sample=${r.baseRate.sample}${r.baseRate.source === 'default-prior' ? '，通用先验' : '，本地台账'}）`);
      // [v2.16] 本地台账同类历史：基准概率维度断链修复后，即使去重后样本
      // 不足 3、基准概率仍取通用先验，也如实展示本地已结算条数——
      // 「有 1 条历史」和「一条都没有」在报告里不能再是同一行字。
      if (r.localLedger && r.localLedger.settledDistinct > 0) {
        lines.push(`  本地台账同类历史: 已结算 ${r.localLedger.settledDistinct} 条`
          + `（同义务去重后，原始登记 ${r.localLedger.settledRaw} 条），兑现 ${r.localLedger.hits} 条`
          + (r.baseRate.source === 'local-ledger'
            ? '——已作为本条基准概率'
            : '——样本 <3 不具统计性，基准概率仍取通用先验'));
      }
      if (r.falsifiability.problems.length) {
        lines.push(`  不可证伪原因: ${r.falsifiability.problems.map(p => `${p.label}——${p.guidance}`).join('；')}`);
      }
      // [v2.15] 文本性质单列：参考/指南页文本连「意图声明」都不是，
      // 不能进台账（没有任何主体能对它负责）。
      if (r.textNature && r.textNature.isReferenceProse) {
        lines.push(`  文本性质: ${r.textNature.markers.map(m => `${m.label}——${m.guidance}`).join('；')}`);
      }
      if (r.calibrationWarning) lines.push(`  ⚠ ${r.calibrationWarning.message}`);
    }
    lines.push('');
    lines.push(`> ${fd.note}`);
  }
  lines.push('');

  // [v3.0.0] 商业主张辨别段：心虫商业未来推演的核心产出。
  // 与上面的「预测辨别」分工：那条辨别关于未来的预测（要时点），
  // 这条辨别关于市场的陈述（要量化与证据等级）。
  const cdsc = report.commercialDiscrimination;
  lines.push('## 商业主张辨别（市场陈述哪些站得住脚）');
  lines.push('');
  if (!cdsc || !cdsc.available) {
    lines.push(`（${(cdsc && cdsc.reason) || '未运行'}）`);
    lines.push('');
    lines.push(`> ${(cdsc && cdsc.note) || ''}`);
  } else {
    const s = cdsc.summary;
    lines.push(`本期从商业域（融资/竞品/宏观）抽到 ${cdsc.audited} 条含市场陈述的条目，逐条辨别：`);
    lines.push(`  决策相关 ${s.decisionRelevantCount} 条 | 有出处事实 ${s.factualCount} 条`
      + ` | 结构完整 ${s.wellFormedCount} 条 | 不可证伪 ${s.unfalsifiableCount} 条`);
    const ev = Object.entries(s.byEvidence).map(([k, v]) => `${k} ${v}`).join(' | ');
    lines.push(`  证据等级分布: ${ev}`);
    lines.push('');
    const VERDICT_CN = {
      'unfalsifiable': '不可证伪', 'weak-evidence': '证据不足',
      'thin-reasoning': '推理单薄', 'well-formed': '结构完整',
      'factual': '有出处事实',
    };
    const KIND_CN = {
      'adoption': '采用主张', 'demand': '需求主张', 'replacement': '替代主张',
      'market-size': '市场规模', 'funding': '融资陈述', 'valuation': '估值陈述',
      'capital-signal': '资本信号解读', 'competitive': '竞品能力', 'oss-threat': '开源威胁',
      'compliance': '合规需求', 'trust': '信任需求', 'unclassified': '未归类',
    };
    for (const r of cdsc.results.slice(0, 12)) {
      const rel = r.decisionRelevant ? '★决策相关' : '  ';
      lines.push(`${rel} [${VERDICT_CN[r.verdict] || r.verdict}] ${(r.claimSentence || r.text).slice(0, 105)}`);
      lines.push(`    类型: ${KIND_CN[r.kind] || r.kind} | 来源: ${r.source}`
        + ` | 证据: ${r.evidence.label}(${r.evidence.weight})`
        + ` | 推理: ${r.reasoning.score}/3`);
      if (r.reasoning.missing.length) {
        lines.push(`    推理缺: ${r.reasoning.missing.map(m => m.label).join('、')}`);
      }
      if (r.falsifiability.problems.length) {
        lines.push(`    不可证伪: ${r.falsifiability.problems.map(p => p.label).join('；')}`);
      }
      lines.push(`    证伪条件: ${r.falsification}`);
    }
    lines.push('');
    lines.push(`> ${cdsc.note}`);
  }
  lines.push('');

  const cm = report.claimMismatches;
  lines.push('## 口径错位检测');
  lines.push('');
  if (!cm || !cm.available || cm.count === 0) {
    lines.push('未检测到「产能 vs 订单」「检测 vs 纠正」类口径错位表述。');
    lines.push('');
    lines.push('> 注意：本项检测依赖条目里的数字与完成态措辞。若本期 RSS 摘要普遍不含数字，');
    lines.push('  0 命中更可能是「没数据可检」而非「没问题」——开启 FETCH_BODY=1 抓正文后复验。');
  } else {
    lines.push(`命中 ${cm.count} 条:`);
    for (const h of cm.hits) {
      lines.push(`- ${h.title} — ${h.source}${h.hasBody ? '' : '（仅 RSS 摘要，证据强度较低）'}`);
      for (const m of h.mismatches) {
        lines.push(`  - ${m.label || m.id}（${m.severity || '未标级'}）: ${m.guidance || m.detail || ''}`);
      }
    }
  }
  lines.push('');

  const fa = report.formulaAssessment;
  lines.push('## 认知公式评估');
  lines.push('');
  if (!fa || !fa.available || !fa.formulas || Object.keys(fa.formulas).length === 0) {
    lines.push('（无可评估输入）');
  } else {
    if (fa.formulas.bayes) {
      const b = fa.formulas.bayes;
      lines.push(`- **贝叶斯更新**: 先验 ${b.prior} → 后验 ${b.posterior}（Δ ${b.delta > 0 ? '+' : ''}${b.delta}）`);
    }
    if (fa.formulas.discount) {
      const d = fa.formulas.discount;
      lines.push(`- **指数折现**: ${d.years} 年后的影响权重 ${d.weight}（年折现率 ${d.annualRate}）`);
    }
    if (fa.formulas.risk) {
      const r = fa.formulas.risk;
      lines.push(`- **风险期望值**: ${r.expectedValue}（最坏情况贡献 ${r.worstCaseContribution}）`);
    }
    if (fa.formulas.brier) {
      const b = fa.formulas.brier;
      lines.push(`- **Brier 分数**: ${b.score}（样本 ${b.sample}，越小越好）`);
    }
    lines.push('');
    lines.push(`> ${fa.note}`);
  }
  lines.push('');

  const lg = report.lowConfidenceGate;
  lines.push('## 低置信度守门');
  lines.push('');
  if (lg) {
    lines.push(`- **总体**: 置信度 ${lg.overall.confidence} → ${lg.overall.allowed ? '✅ 通过' : '⚠ 需显式标注'}`);
    if (lg.overall.disclosure) lines.push(`  - ${lg.overall.disclosure}`);
    const blocked = (lg.stages || []).filter(s => !s.allowed);
    if (blocked.length) {
      lines.push(`- **被拦阶段**: ${blocked.map(b => b.stage).join('、')}`);
      lines.push('  - 这些阶段的结论不得作为判断引用，只能作为观察方向记录');
    }
  }
  lines.push('');

  const ls = report.ledgerStatus;
  lines.push('## 预测台账（推演质量度量）');
  lines.push('');
  if (ls && ls.sample > 0) {
    lines.push(`- **Brier 分数**: ${ls.brier}（已结算 ${ls.sample} 条）`);
    lines.push(`- **命中率**: ${Math.round((ls.hitRate || 0) * 100)}%`);
    lines.push(`- **到期未结算**: ${ls.overdueCount} 条`);
    lines.push('');
    lines.push('| 置信度桶 | 样本数 | 实际命中率 | 期望 |');
    lines.push('|---|---|---|---|');
    for (const b of ls.calibration) {
      const obs = b.observed === null ? '—' : `${Math.round(b.observed * 100)}%`;
      lines.push(`| ${b.range} | ${b.count} | ${obs} | ${Math.round(b.expected * 100)}% |`);
    }
  } else {
    const pend = report.ledgerStatus && typeof report.ledgerStatus.pending === 'number'
      ? report.ledgerStatus.pending : null;
    if (pend > 0) {
      lines.push(`台账已有 ${pend} 条待结算预测，暂无已结算项，故 Brier 分数暂不可算。`);
      // [v2.13] 不再写死「到期日在 2027 年起」——清理伪预测后台账里最早的
      // 到期日是 2026-09-30，已有条目过期未结算。按实际状态说。
      const pendNow = (report.ledgerStatus && report.ledgerStatus.pending) || 0;
      const settledNow = (report.ledgerStatus && report.ledgerStatus.settled) || 0;
      lines.push(pendNow > 0
        ? `（待结算 ${pendNow} 条 ≠ 未登记：到期后需人工/agent 取证调用 settle() 才出 Brier。`
        + `引擎不自动判定兑现与否——那需要证据，不是规则能替的。）`
        : `（已结算 ${settledNow} 条，Brier 分数基于实际结算结果。）`);
    } else {
      lines.push('台账暂无任何预测——推演质量目前不可度量。');
      lines.push('');
      lines.push('要让它可度量，需要把本次推演中的概率预测登记进台账');
      lines.push('（`prediction-ledger.record()`），到期后 `settle()` 结算出 Brier 分数。');
    }
  }
  const rec = report.predictionRecording;
  if (rec && (rec.count > 0 || (rec.skipped && rec.skipped.length > 0))) {
    lines.push('');
    if (rec.count > 0) {
      lines.push(`**本次新登记 ${rec.count} 条预测**（仅证据充足的阶段，到期自动结算）：`);
      for (const id of rec.recorded) lines.push(`- \`${id}\``);
    }
    if (rec.skipped && rec.skipped.length > 0) {
      lines.push(`**本次幂等跳过 ${rec.skipped.length} 条**（同一编号今天已登记过，不重复写入）：`);
      for (const id of rec.skipped) lines.push(`- \`${id}\``);
    }
  }
  lines.push('');

  return lines.join('\n');
}

async function main() {
  try {
    const analysisPath = process.argv[2]
      || path.join(__dirname, '..', 'data', 'analysis-result.json');

    if (!fs.existsSync(analysisPath)) {
      console.error('❌ 分析结果不存在，请先运行 heartflow-analyze.js');
      process.exit(1);
    }

    const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
    console.log('📊 加载心虫分析结果\n');

    const engine = new ProjectionEngine(analysis);
    const report = engine.generate();

    const markdown = formatReport(report);
    console.log(markdown);

    const reportDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportPath = path.join(reportDir, `projection-${Date.now()}.md`);
    fs.writeFileSync(reportPath, markdown);
    console.log(`\n💾 推演报告已保存到: ${reportPath}`);

    const jsonPath = reportPath.replace(/\.md$/, '.json');
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    console.log(`📄 结构化结果已保存到: ${jsonPath}`);

    return report;
  } catch (e) {
    console.error('❌ 推演失败:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { ProjectionEngine, formatReport, DOMAINS };
