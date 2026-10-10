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

/** 主题域定义：关键词命中即归入该域。顺序即优先级。 */
const DOMAINS = [
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
];

/** 阶段模板：只决定"取第几热的域"，内容由信号填充 */
const HORIZONS = [
  { label: '第一阶段（未来 0-12 个月）' },
  { label: '第二阶段（未来 12-24 个月）' },
  { label: '第三阶段（未来 24-36 个月）' },
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
          text: `${n.title || ''} ${n.description || ''}`,
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
    const MAP = {
      ai_capability: 'ai', ai_safety: 'ai', compute_energy: 'energy',
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
    if (used.size < 2) {
      return { available: false, reason: `映射后仅 ${used.size} 个域有对应传导源，无法建立域间因果链` };
    }
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
    if (g.edges.length === 0) {
      return { available: false, reason: '本期域之间没有强度 >=0.5 的实证传导关系' };
    }
    return {
      available: true,
      roots: g.roots().map(n => n.label),
      outcomes: g.outcomes().map(n => n.label),
      chains: g.allPaths().slice(0, 6).map(p =>
        p.map(id => (g.nodes.get(id) || {}).label || id).join(' → ')),
      leveragePoints: g.leveragePoints().slice(0, 5).map(lp => ({
        node: lp.node.label,
        pathsBroken: lp.pathsBroken,
        ratio: Math.round(lp.ratio * 100) / 100,
      })),
      note: '边来自 cross-domain-conduction 的实证规则表，不是本引擎臆造的因果关系',
    };
  }

  // ───────────────────────────────────────────────────────────────
  // v3：从当期最热域出发，算它向其他域的传导全景（强度+时延）
  // ───────────────────────────────────────────────────────────────
  buildCrossDomainConduction() {
    const top = this.signals.domains[0];
    if (!top) return { available: false, reason: '无活跃域' };
    // cross-domain-conduction 用的域 id 是 ai/neuro/genomics/...
    // 本引擎的域 id 需要映射过去
    const MAP = {
      ai_capability: 'ai', ai_safety: 'ai', compute_energy: 'energy',
      neuro_bci: 'neuro', biotech_longevity: 'genomics',
      robotics_auto: 'robotics', space: 'space',
    };
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
    const byWeek = new Map();
    for (const it of this.signals.items) {
      const t = Date.parse(it.pubDate);
      if (isNaN(t)) continue;
      const d = new Date(t);
      const week = `${d.getUTCFullYear()}-W${String(Math.ceil(((d - new Date(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7)).padStart(2, '0')}`;
      for (const dom of it.domains) {
        const key = dom;
        if (!byWeek.has(key)) byWeek.set(key, new Map());
        const m = byWeek.get(key);
        m.set(week, (m.get(week) || 0) + 1);
      }
    }
    const series = [];
    for (const [topic, weeks] of byWeek) {
      for (const [period, count] of weeks) series.push({ period, topic, count });
    }
    const out = [];
    for (const d of this.signals.domains.slice(0, 8)) {
      const r = classifySignal(series, d.id);
      out.push({
        domain: d.name, id: d.id, periods: r.periods, total: r.total,
        halfLifePeriods: r.halfLifePeriods, verdict: r.verdict,
      });
    }
    const judged = out.filter(o => o.verdict !== 'insufficient-data');
    return {
      available: series.length > 0,
      classifications: out,
      judgedCount: judged.length,
      note: '需要同一主题 >=3 个周期的计数才能判定半衰期；单期样本一律返回 insufficient-data',
    };
  }

  // ───────────────────────────────────────────────────────────────
  // v3：把信号里出现的 roadmap 时间点放进同一时间轴，检测冲突。
  // ───────────────────────────────────────────────────────────────
  buildTimelineConflicts() {
    // 从标题里抽取 "2027" / "2027-Q1" / "by 2028" 等时间声明
    const milestones = [];
    const seen = new Set();
    for (const it of this.signals.items) {
      const m = it.title.match(/(?:by\s+)?(20\d{2})(?:-Q([1-4])|-H([12]))?/);
      if (!m) continue;
      const claimed = m[0].replace(/^by\s+/i, '');
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
    if (milestones.length < 2) {
      return { available: false, reason: '信号中可提取的时间点少于 2 个，无法检测冲突' };
    }
    const res = detectTimelineConflicts(milestones);
    return {
      available: true,
      ordered: res.ordered,
      conflicts: res.conflicts,
      summary: res.summary,
      note: 'verified=false 表示该时间点只是来源声称，未经独立证实',
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
      const r = detectMismatch(it.text || it.title);
      const arr = Array.isArray(r) ? r : (r && r.hits) || [];
      if (arr.length) {
        hits.push({ title: it.title.slice(0, 100), source: it.source, link: it.link, mismatches: arr });
      }
    }
    return {
      available: true,
      count: hits.length,
      hits: hits.slice(0, 8),
      note: '口径错位检测：识别"设计产能 vs 实际订单"这类数字达标但能力未达标的表述',
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
      note: sc.sample === 0
        ? '台账暂无已结算预测，无法计算 Brier 分数——推演质量暂不可度量'
        : `基于 ${sc.sample} 条已结算预测`,
    };
  }

  // ───────────────────────────────────────────────────────────────
  // v3：把本次推演的概率预测登记进台账，到期后才能结算出 Brier 分数。
  // 只登记信号充足的阶段——把"基于 2 条信号的预测"登记进去会污染度量。
  // 幂等：同一天同一域重复跑不会写两条。
  // ───────────────────────────────────────────────────────────────
  recordPredictions() {
    const recorded = [];
    const day = this.timestamp.slice(0, 10);
    for (const s of (this._lastReport && this._lastReport.stages) || []) {
      if (s.sufficient === false) continue;   // 证据不足的不登记
      if (typeof s.confidence !== 'number' || s.confidence <= 0) continue;
      const dom = s.domains.join('+') || 'unknown';
      // id 用域 id（英文）而不是中文域名：sanitize 会把中文全抹掉，
      // 导致 id 变成 proj-2026-10-09-AI______，无法区分不同域组合。
      const domKey = ((s._domainIds) || []).join('+') || 'unknown';
      const id = `proj-${day}-${domKey}`.replace(/[^\w-]/g, '_');
      try {
        predictionLedger.record({
          id,
          claim: `${s.period}：${s.domains.join('、')} 方向在本期内保持活跃`,
          probability: Math.min(0.95, s.confidence),
          dueOn: this.dueDateFor(s.period),
          domain: dom,
          rationale: `${s.evidence ? s.evidence.length : 0} 条 live 证据；域热度推导，非统计概率`,
        });
        recorded.push(id);
      } catch (e) {
        // 不静默吞错：id 已存在（今天已登记）是正常幂等跳过，
        // 其他错误必须显式记录，否则"登记成功"会变成假宣称。
        if (!/已存在/.test(e.message)) {
          this._recordErrors = this._recordErrors || [];
          this._recordErrors.push({ id, error: e.message });
        }
      }
    }
    return { recorded, count: recorded.length, errors: this._recordErrors || [] };
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
      for (const d of slice) {
        for (const it of d.items.slice(0, 3)) {
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

  lines.push('## 分阶段推演');
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
    lines.push('| 域 | 周期数 | 总信号 | 半衰期 | 判定 |');
    lines.push('|---|---|---|---|---|');
    for (const c of tc.classifications) {
      const hl = c.halfLifePeriods === null ? '—' : (c.halfLifePeriods === Infinity ? '∞' : c.halfLifePeriods);
      lines.push(`| ${c.domain} | ${c.periods} | ${c.total} | ${hl} | ${c.verdict} |`);
    }
    lines.push('');
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

  const cm = report.claimMismatches;
  lines.push('## 口径错位检测');
  lines.push('');
  if (!cm || !cm.available || cm.count === 0) {
    lines.push('未检测到「产能 vs 订单」「检测 vs 纠正」类口径错位表述。');
  } else {
    lines.push(`命中 ${cm.count} 条:`);
    for (const h of cm.hits) {
      lines.push(`- ${h.title} — ${h.source}`);
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
    lines.push('台账暂无已结算预测——推演质量目前不可度量。');
    lines.push('');
    lines.push('要让它可度量，需要把本次推演中的概率预测登记进台账');
    lines.push('（`prediction-ledger.record()`），到期后 `settle()` 结算出 Brier 分数。');
  }
  if (report.predictionRecording && report.predictionRecording.count > 0) {
    lines.push('');
    lines.push(`**本次已登记 ${report.predictionRecording.count} 条预测**（仅证据充足的阶段，到期自动结算）：`);
    for (const id of report.predictionRecording.recorded) lines.push(`- \`${id}\``);
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
