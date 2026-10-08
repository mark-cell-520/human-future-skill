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
        if (n.origin !== 'live') continue; // 只认真采集条目
        items.push({
          title: String(n.title || ''),
          text: `${n.title || ''} ${n.description || ''}`,
          source: n.source || '(未标注)',
          link: n.link || '',
          pubDate: n.pubDate || '',
          bucket,
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
    return {
      meta: {
        version: '2.0.0',
        heartflowVersion: this.analysis.engineVersion,
        timestamp: this.timestamp,
        modulesLoaded: this.analysis.modulesLoaded,
        signalCount: this.signals.totalItems,
        domainsMatched: this.signals.domains.length,
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
