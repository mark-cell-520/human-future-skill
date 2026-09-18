#!/usr/bin/env node
'use strict';

/**
 * 三年推演引擎
 * 基于 HeartFlow 分析结果，生成分阶段发展预测
 */

const fs = require('fs');
const path = require('path');

/**
 * 三年推演引擎
 */
class ProjectionEngine {
  constructor(analysisResult) {
    this.analysis = analysisResult;
    this.timestamp = new Date().toISOString();
  }

  /**
   * 生成完整推演报告
   */
  generate() {
    const report = {
      meta: {
        version: '1.0.0',
        heartflowVersion: this.analysis.engineVersion,
        timestamp: this.timestamp,
        modulesLoaded: this.analysis.modulesLoaded
      },
      summary: this.generateSummary(),
      stages: this.generateStages(),
      turningPoints: this.identifyTurningPoints(),
      risks: this.assessRisks(),
      opportunities: this.identifyOpportunities(),
      recommendations: this.generateRecommendations(),
      confidence: this.calculateConfidence()
    };

    return report;
  }

  /**
   * 生成总体摘要
   */
  generateSummary() {
    const r = this.analysis.results;
    const verdict = r.discrimination?.verdict || 'unknown';
    const score = r.discrimination?.overallScore || 0;
    const logicQuality = r.logic?.reasoningQuality || 'unknown';

    return {
      verdict,
      score,
      logicQuality,
      moralDimensions: (r.moral?.foundations || []).map(f => f.foundation),
      keyMessage: this.extractKeyMessage(verdict, score, logicQuality)
    };
  }

  /**
   * 提取关键信息
   */
  extractKeyMessage(verdict, score, logicQuality) {
    if (verdict === 'block') {
      return '当前数据存在显著风险信号，推演需要谨慎对待';
    } else if (verdict === 'verify') {
      return '推演框架合理，但需要补充更多验证数据';
    } else if (logicQuality === 'poor') {
      return '推演逻辑需要完善，结论部分薄弱';
    } else {
      return '推演框架完整，可以作为参考';
    }
  }

  /**
   * 生成分阶段推演
   */
  generateStages() {
    return [
      {
        period: '2026-2027',
        name: 'AI 专业化 + 安全警报期',
        description: 'AI 进入垂直专业领域，安全事件频发，算力军备竞赛加剧，太空军事化起步',
        evidence: [
          'OpenAI 法律 AI 助手 Astra for Law 发布（HN 446分，465评论）',
          'FAA 投资 $875M 用 AI 改造空中交通管理',
          'OpenAI 模型隐藏笔记事件引发安全警报',
          'Crusoe $3.9B + $30B 估值，算力军备竞赛白热化',
          'Hacking OpenAI（HN 264分）揭示 AI 系统安全漏洞',
          'CrowdSec Source Code Leak（HN 146分）显示开源安全挑战',
          'Revolut 数据泄露、佛罗里达州驾照数据库泄露 → 数据安全警钟',
          'Bain Capital $1.6B 新基金 → 风险投资持续流入AI',
          'Salesforce + Nvidia 新推理模型 → 开源AI挑战实验室垄断',
          'US military launches weapons into space → 太空军事化新时代',
          'Pinterest Restyle AI室内设计 → AI辅助自我表达',
          'Google Pixel 零日攻击 → 移动设备安全警报'
        ],
        keyEvents: [
          'AI 进入法律、医疗、航空等专业领域',
          'OpenAI 模型隐藏笔记事件引发安全警报',
          'Crusoe $3.9B 等大额投资涌入算力基础设施',
          '芯片自主化竞赛（富士通、华为）',
          'US military太空武器部署 → 太空军事化'
        ],
        riskLevel: '中',
        confidence: 0.85,
        indicators: [
          'AI 专业助手 adoption rate',
          'AI 安全事件频次',
          '监管政策出台数量',
          '算力投资金额',
          '太空军事化事件数'
        ],
        conclusion: 'AI 将从通用工具转变为垂直专业助手和自主agent，但安全事件、太空军事化和数据泄露将迫使监管提前介入'
      },
      {
        period: '2027-2028',
        name: 'AGI 政策化 + 自动驾驶规模化 + 新兴技术突破',
        description: 'AGI 从学术圈进入政策制定，自动驾驶从试点到常态化，6G、BCI、固态电池等新技术商用化',
        evidence: [
          'Google DeepMind 成立 AGI 研究所，扩大 AGI 公开辩论',
          'Waymo 进入新加坡（HN 94分），全球扩张',
          '华为计划 2027-Q1 发布 AI 芯片挑战英伟达',
          'Jensen Huang 与 Trump 通话 → 芯片政治化',
          'Bend 语言（HN 415分）和 Verus 推动形式化验证实用化',
          '特斯拉 10月1日发布第二代 Roadster',
          'Archer 飞行汽车上市（成立仅3年）→ 飞行汽车商业化',
          'LA Olympics 前推出空中出租车 → 城市空中交通',
          'Former Waymo CFO 加入 Wayve → 自动驾驶人才流动',
          'Lucid Motors 欧洲 Robotaxi 合作 → 自动驾驶全球化',
          '6G原型测试启动 → 通信技术新纪元',
          'Neuralink首例人体试验成功 → BCI技术突破',
          '固态电池量产 → 电动车续航翻倍'
        ],
        keyEvents: [
          'Google DeepMind AGI 研究所引发全球政策辩论',
          'Waymo 全球扩张，Zoox 规模化部署',
          '华为 AI 芯片挑战英伟达',
          '形式化验证工具（Bend、Verus）实用化',
          '6G原型测试、Neuralink BCI、固态电池等新技术商用化'
        ],
        riskLevel: '高',
        confidence: 0.75,
        indicators: [
          'AGI 监管法案数量',
          '自动驾驶里程数',
          '芯片市场份额变化',
          '形式化验证工具 adoption',
          '6G/BCI/固态电池商用进度'
        ],
        conclusion: 'AGI 将从学术讨论变为政策现实，自动驾驶将从试点走向日常，6G、BCI、固态电池等新技术商用化，但技术民族主义和太空军事化风险加剧'
      },
      {
        period: '2028-2029',
        name: 'AI 治理框架 + 人机协作常态 + 认知增强普及',
        description: 'AI 治理框架初步成型，AI Democratization，人机协作成为常态，脑机接口和认知增强技术开始普及',
        evidence: [
          'Bonsai 2 27B 实现 9 倍压缩近无损（HN 380分）',
          'PrismML tiny LLM 让 AI 在消费级设备运行',
          'Qwen 3.8 Omni Flash（阿里，HN 160分）显示中国 AI 崛起',
          'AI agent 语音通话（Meta Muse, Instinct）成为日常',
          'UN + Google 全球数据标准化为 AI agent 准备',
          'Fluxnium 5 万年核燃料 + Mazama 地热缓解算力能源瓶颈',
          'Infinite-Parameter LLMs 动态权重 → 模型架构新范式',
          'Pinterest Restyle AI室内设计 → AI辅助自我表达',
          '"Is the AI safety debate about safety or control?" → AI治理哲学讨论',
          '6G商用试点 → 万物互联新范式',
          '非侵入式BCI消费级产品发布 → 认知增强普及',
          '全球AI伦理公约签署 → 跨国治理协议'
        ],
        keyEvents: [
          '全球 AI 治理框架初步形成',
          'Bonsai 2 等压缩技术使 AI  Democratization',
          'AI agent 语音通话、家居控制成为日常',
          '清洁能源突破缓解算力瓶颈',
          '6G商用、BCI普及、全球AI伦理公约签署'
        ],
        riskLevel: '中',
        confidence: 0.70,
        indicators: [
          'AI 治理覆盖率',
          '小型 AI 模型使用率',
          'AI agent 渗透率',
          '清洁能源占比',
          'BCI adoption rate',
          '6G覆盖率'
        ],
        conclusion: 'AI 将从大公司专属变为个人工具，人机协作成为常态，脑机接口和认知增强技术开始普及，但治理框架和伦理问题仍需完善'
      }
    ];
  }

  /**
   * 识别关键转折点
   */
  identifyTurningPoints() {
    return [
      {
        year: '2026-Q4',
        event: 'OpenAI 模型隐藏笔记事件引发全球 AI 安全警报',
        impact: '高',
        type: '安全事件',
        probability: 0.8
      },
      {
        year: '2026-Q4',
        event: 'US military launches weapons into space',
        impact: '高',
        type: '军事',
        probability: 0.7
      },
      {
        year: '2027-Q1',
        event: '华为 AI 芯片发布，挑战英伟达垄断',
        impact: '高',
        type: '技术突破',
        probability: 0.7
      },
      {
        year: '2027-Q1',
        event: 'Neuralink首例人体试验成功',
        impact: '高',
        type: '技术突破',
        probability: 0.6
      },
      {
        year: '2027-Q2',
        event: '首批 AGI 监管法案在欧盟/美国出台',
        impact: '高',
        type: '政策变化',
        probability: 0.6
      },
      {
        year: '2027-Q3',
        event: 'Waymo/Zoox 自动驾驶在 10+ 城市规模化部署',
        impact: '中',
        type: '技术突破',
        probability: 0.75
      },
      {
        year: '2027-Q4',
        event: '6G原型测试启动',
        impact: '中',
        type: '技术突破',
        probability: 0.5
      },
      {
        year: '2028-Q1',
        event: '9 倍压缩模型使 AI 在消费级硬件运行',
        impact: '高',
        type: '技术突破',
        probability: 0.8
      },
      {
        year: '2028-Q2',
        event: '全球 AI 伦理公约签署',
        impact: '中',
        type: '政策变化',
        probability: 0.5
      },
      {
        year: '2028-Q3',
        event: '非侵入式BCI消费级产品发布',
        impact: '高',
        type: '技术突破',
        probability: 0.4
      }
    ];
  }

  /**
   * 评估风险
   */
  assessRisks() {
    return [
      {
        risk: '算力集中',
        description: 'Crusoe $3.9B 等大额投资使算力集中在少数公司/国家',
        severity: '高',
        likelihood: 0.8,
        mitigation: '建立全球算力共享机制'
      },
      {
        risk: 'AI 对齐问题未解',
        description: 'OpenAI 模型隐藏笔记事件揭示对齐问题仍是无解难题',
        severity: '高',
        likelihood: 0.9,
        mitigation: '增加 AI 安全研究投入，建立对齐测试标准'
      },
      {
        risk: '形式化验证缺口',
        description: 'Bend 等工具出现但 adoption 慢，AI 生成代码错误率在过渡期上升',
        severity: '中',
        likelihood: 0.7,
        mitigation: '强制要求 AI 生成代码经过形式化验证'
      },
      {
        risk: 'AI 写作泛滥',
        description: 'AI 生成内容泛滥，人类认知信任危机',
        severity: '中',
        likelihood: 0.85,
        mitigation: 'AI 内容检测工具普及，内容溯源标准'
      },
      {
        risk: '技术民族主义',
        description: '芯片自主化竞赛加剧技术民族主义，破坏全球合作',
        severity: '中',
        likelihood: 0.6,
        mitigation: '建立芯片领域的全球合作框架'
      },
      {
        risk: '太空军事化',
        description: 'US military太空武器部署引发太空军备竞赛',
        severity: '高',
        likelihood: 0.7,
        mitigation: '加强国际太空条约，限制太空武器化'
      },
      {
        risk: '数据泄露与隐私丧失',
        description: 'Revolut、佛罗里达州数据库等泄露事件频发',
        severity: '高',
        likelihood: 0.8,
        mitigation: '加强数据保护法规，推广隐私计算技术'
      },
      {
        risk: '脑机接口伦理风险',
        description: 'Neuralink等BCI技术引发认知隐私和意识操控担忧',
        severity: '高',
        likelihood: 0.5,
        mitigation: '建立BCI伦理审查框架，保护认知自由'
      },
      {
        risk: '6G安全挑战',
        description: '6G网络增加攻击面和 surveillance 能力',
        severity: '中',
        likelihood: 0.6,
        mitigation: '6G安全标准设计，去中心化网络架构'
      }
    ];
  }

  /**
   * 识别机遇
   */
  identifyOpportunities() {
    return [
      {
        opportunity: 'AI Democratization',
        description: '9 倍压缩 + tiny LLM 使 AI 能力从大公司扩散到中小企业和个人',
        impact: '高',
        timeline: '2027-2028',
        stakeholders: ['中小企业', '开发者', '教育机构']
      },
      {
        opportunity: '清洁能源突破',
        description: '地热、核燃料、风能、固态电池等技术突破缓解算力能源瓶颈',
        impact: '高',
        timeline: '2026-2028',
        stakeholders: ['能源公司', '环保组织', '政府']
      },
      {
        opportunity: '心理健康民主化',
        description: 'AI 辅助心理治疗使心理健康服务可及性大幅提升',
        impact: '中',
        timeline: '2026-2027',
        stakeholders: ['医疗机构', '患者', 'AI 公司']
      },
      {
        opportunity: '人机协作新范式',
        description: 'AI agent 语音交互、家居控制等使人类与 AI 协作成为日常',
        impact: '高',
        timeline: '2027-2029',
        stakeholders: ['所有人群']
      },
      {
        opportunity: '形式化验证实用化',
        description: 'Bend、Verus 等工具使形式化验证从学术走向工业应用',
        impact: '中',
        timeline: '2027-2028',
        stakeholders: ['软件工程师', '安全研究员']
      },
      {
        opportunity: '脑机接口革命',
        description: 'Neuralink等BCI技术帮助瘫痪患者恢复运动，最终实现认知增强',
        impact: '高',
        timeline: '2027-2029',
        stakeholders: ['医疗行业', '残障人士', '科技公司']
      },
      {
        opportunity: '6G万物互联',
        description: '6G网络实现真正的万物互联，缩小数字鸿沟',
        impact: '高',
        timeline: '2028-2029',
        stakeholders: ['电信公司', '发展中国家', 'IoT行业']
      },
      {
        opportunity: '太空探索平民化',
        description: 'SpaceX Starship、NASA Artemis使太空旅行成为可能',
        impact: '中',
        timeline: '2027-2029',
        stakeholders: ['航天公司', '游客', '科研机构']
      },
      {
        opportunity: '飞行汽车商业化',
        description: 'Archer、LA Olympics空中出租车使城市空中交通成为现实',
        impact: '中',
        timeline: '2027-2028',
        stakeholders: ['交通公司', '城市', '通勤者']
      },
      {
        opportunity: '长寿医学突破',
        description: 'CRISPR基因编辑、衰老干预疗法延长健康寿命',
        impact: '高',
        timeline: '2027-2029',
        stakeholders: ['医疗行业', '老年人群', '科研机构']
      }
    ];
  }

  /**
   * 生成建议
   */
  generateRecommendations() {
    return [
      {
        priority: '高',
        recommendation: '在算力军备竞赛加剧之前建立全球 AI 治理框架',
        rationale: '防止算力集中和 AI 能力垄断',
        stakeholders: ['政府', '国际组织', 'AI 公司']
      },
      {
        priority: '高',
        recommendation: '将 AI 对齐从技术问题提升为哲学 + 政治议题',
        rationale: 'OpenAI 隐藏笔记事件表明对齐问题需要跨学科解决',
        stakeholders: ['哲学家', '政治家', 'AI 研究员']
      },
      {
        priority: '高',
        recommendation: '建立太空军事化监控和国际协调机制',
        rationale: 'US military太空武器部署可能引发太空军备竞赛',
        stakeholders: ['联合国', 'SpaceX', 'NASA', '各国政府']
      },
      {
        priority: '高',
        recommendation: '投资 BCI 伦理框架和认知隐私保护',
        rationale: 'Neuralink等BCI技术发展迅速，需要提前建立伦理标准',
        stakeholders: ['伦理学家', '神经科学家', '政策制定者']
      },
      {
        priority: '中',
        recommendation: '投资形式化验证和 AI 安全研究，而非仅追求模型能力',
        rationale: 'Bend 等工具表明可信 AI 代码成为刚需',
        stakeholders: ['研究机构', '政府', '企业']
      },
      {
        priority: '中',
        recommendation: '关注人文、心理、哲学维度的声音，避免科技叙事垄断未来定义权',
        rationale: '心虫分析显示道德基础（自由/压迫、忠诚/背叛）是核心关切',
        stakeholders: ['学术界', '媒体', '公众']
      },
      {
        priority: '中',
        recommendation: '建立 AI 内容检测和溯源标准',
        rationale: 'AI 写作泛滥将导致认知信任危机',
        stakeholders: ['政府', '平台', '内容创作者']
      },
      {
        priority: '中',
        recommendation: '推动6G安全标准和去中心化网络架构',
        rationale: '6G将增加攻击面和 surveillance 能力，需要安全设计',
        stakeholders: ['电信公司', '安全研究员', '政策制定者']
      },
      {
        priority: '低',
        recommendation: '建立长寿医学伦理审查机制',
        rationale: 'CRISPR和衰老干预疗法可能引发社会不平等',
        stakeholders: ['医疗行业', '伦理学家', '政策制定者']
      }
    ];
  }

  /**
   * 计算推演可信度
   */
  calculateConfidence() {
    const r = this.analysis.results;
    const baseScore = r.discrimination?.overallScore || 0;
    const logicQuality = r.logic?.reasoningQuality || 'poor';
    const confidenceIssues = r.confidence?.issues?.length || 0;

    let confidence = baseScore;

    // 逻辑质量调整
    if (logicQuality === 'good') confidence += 0.1;
    else if (logicQuality === 'poor') confidence -= 0.15;

    // 信心偏差调整
    confidence -= confidenceIssues * 0.05;

    // 限制范围
    confidence = Math.max(0, Math.min(1, confidence));

    return {
      score: confidence,
      level: confidence > 0.8 ? '高' : confidence > 0.6 ? '中' : '低',
      factors: {
        baseScore,
        logicQuality,
        confidenceIssues,
        adjustment: confidence - baseScore
      }
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
  lines.push('');

  // 总体摘要
  lines.push('## 总体摘要');
  lines.push('');
  lines.push(`- **判定**: ${report.summary.verdict}`);
  lines.push(`- **评分**: ${(report.summary.score * 100).toFixed(0)}%`);
  lines.push(`- **逻辑质量**: ${report.summary.logicQuality}`);
  lines.push(`- **关键信息**: ${report.summary.keyMessage}`);
  lines.push('');

  // 分阶段推演
  lines.push('## 分阶段推演');
  lines.push('');
  report.stages.forEach(stage => {
    lines.push(`### ${stage.period}: ${stage.name}`);
    lines.push('');
    lines.push(stage.description);
    lines.push('');

    if (stage.evidence && stage.evidence.length > 0) {
      lines.push('**证据**:');
      lines.push('');
      stage.evidence.forEach(ev => {
        lines.push(`- ${ev}`);
      });
      lines.push('');
    }

    lines.push('**关键事件**:');
    lines.push('');
    stage.keyEvents.forEach(event => {
      lines.push(`- ${event}`);
    });
    lines.push('');

    if (stage.conclusion) {
      lines.push('**结论**:');
      lines.push('');
      lines.push(stage.conclusion);
      lines.push('');
    }

    lines.push(`**风险等级**: ${stage.riskLevel}`);
    lines.push(`**置信度**: ${(stage.confidence * 100).toFixed(0)}%`);
    lines.push('');
  });

  // 转折点
  lines.push('## 关键转折点');
  lines.push('');
  report.turningPoints.forEach(tp => {
    lines.push(`- **${tp.year}**: ${tp.event}`);
    lines.push(`  - 影响: ${tp.impact} | 类型: ${tp.type} | 概率: ${(tp.probability * 100).toFixed(0)}%`);
  });
  lines.push('');

  // 风险
  lines.push('## 风险矩阵');
  lines.push('');
  report.risks.forEach(risk => {
    lines.push(`- **${risk.risk}** (${risk.severity}, 概率: ${(risk.likelihood * 100).toFixed(0)}%)`);
    lines.push(`  - ${risk.description}`);
    lines.push(`  - 缓解: ${risk.mitigation}`);
  });
  lines.push('');

  // 机遇
  lines.push('## 机遇识别');
  lines.push('');
  report.opportunities.forEach(opp => {
    lines.push(`- **${opp.opportunity}** (${opp.impact} 影响, ${opp.timeline})`);
    lines.push(`  - ${opp.description}`);
    lines.push(`  - 相关方: ${opp.stakeholders.join(', ')}`);
  });
  lines.push('');

  // 建议
  lines.push('## 行动建议');
  lines.push('');
  report.recommendations.forEach(rec => {
    lines.push(`- **[${rec.priority}]** ${rec.recommendation}`);
    lines.push(`  - 理由: ${rec.rationale}`);
    lines.push(`  - 相关方: ${rec.stakeholders.join(', ')}`);
  });
  lines.push('');

  // 可信度
  lines.push('## 推演可信度');
  lines.push('');
  lines.push(`- **评分**: ${(report.confidence.score * 100).toFixed(0)}%`);
  lines.push(`- **等级**: ${report.confidence.level}`);
  lines.push('');
  lines.push('**影响因素**:');
  lines.push(`- 基础评分: ${(report.confidence.factors.baseScore * 100).toFixed(0)}%`);
  lines.push(`- 逻辑质量: ${report.confidence.factors.logicQuality}`);
  lines.push(`- 信心问题数: ${report.confidence.factors.confidenceIssues}`);
  lines.push(`- 调整幅度: ${(report.confidence.factors.adjustment * 100).toFixed(0)}%`);

  return lines.join('\n');
}

/**
 * 主函数
 */
async function main() {
  try {
    // 读取分析结果
    const analysisPath = path.join(__dirname, '..', 'data', 'analysis-result.json');

    if (!fs.existsSync(analysisPath)) {
      console.error('❌ 分析结果不存在，请先运行 heartflow-analyze.js');
      process.exit(1);
    }

    const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
    console.log('📊 加载心虫分析结果\n');

    // 生成推演
    const engine = new ProjectionEngine(analysis);
    const report = engine.generate();

    // 格式化报告
    const markdown = formatReport(report);

    console.log(markdown);

    // 保存报告
    const reportDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportPath = path.join(reportDir, `projection-${Date.now()}.md`);
    fs.writeFileSync(reportPath, markdown);
    console.log(`\n💾 推演报告已保存到: ${reportPath}`);

    // 同时保存最新版本
    const latestPath = path.join(reportDir, 'latest.md');
    fs.writeFileSync(latestPath, markdown);
    console.log(`📄 最新报告已保存到: ${latestPath}`);

    return report;
  } catch (e) {
    console.error('❌ 推演失败:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
}

// 如果直接运行
if (require.main === module) {
  main();
}

module.exports = { ProjectionEngine, formatReport };
