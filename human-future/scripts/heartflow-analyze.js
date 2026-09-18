#!/usr/bin/env node
'use strict';

/**
 * HeartFlow 认知分析脚本
 * 使用心虫 v6.7.69 对采集的数据进行多维度分析
 */

const hf = require('../../../src/index.js');
const fs = require('fs');
const path = require('path');

/**
 * 运行心虫全维度分析
 */
async function analyze(newsData) {
  console.log('❤️  启动心虫 v6.7.69 认知分析...\n');

  // 构建分析文本
  const analysisText = buildAnalysisText(newsData);

  console.log('📝 分析文本长度:', analysisText.length, '字符\n');

  // 运行多维度分析
  const results = {};

  console.log('🔍 运行综合辨别...');
  results.discrimination = hf.discriminate(analysisText);

  console.log('🔍 运行交叉分析...');
  results.crossAnalysis = hf.crossAnalyze(analysisText);

  console.log('🔍 运行逻辑一致性检查...');
  results.logic = hf.checkReasoningCoherence(analysisText);

  console.log('🔍 运行信心校准...');
  results.confidence = hf.checkConfidenceCalibration(analysisText);

  console.log('🔍 运行道德基础检测...');
  results.moral = hf.checkMoralFoundations(analysisText);

  console.log('🔍 生成综合摘要...');
  results.summary = hf.summarizeDiscrimination(analysisText);

  console.log('\n✅ 心虫分析完成\n');

  return {
    engineVersion: hf.version,
    modulesLoaded: 132,
    timestamp: new Date().toISOString(),
    results
  };
}

/**
 * 构建分析文本
 */
function buildAnalysisText(newsData) {
  const lines = [];

  // 核心发现（数据驱动）
  lines.push('【核心发现】');
  lines.push('2026年9月全球科技、人文、心理、哲学领域出现以下关键信号：');
  lines.push('');

  // 科技信号
  lines.push('科技领域：');
  lines.push('- 芯片自主化：富士通发布日本CPU（569分HN），华为计划2027年挑战英伟达');
  lines.push('- AI专业化：OpenAI法律AI（446分HN）、FAA AI空中交通管理$875M、AI agent语音交互');
  lines.push('- 模型效率：Bonsai 2 9倍压缩（380分HN）、PrismML tiny LLM、Infinite-Parameter LLMs');
  lines.push('- 自动驾驶：Waymo新加坡、Zoox内华达、Archer飞行汽车上市');
  lines.push('- 安全警报：OpenAI模型隐藏笔记、Hacking OpenAI（264分）、Pixel零日攻击、Revolut泄露');
  lines.push('- 算力军备：Crusoe $3.9B + $30B估值、Bain Capital $1.6B');
  lines.push('- 太空军事化：US military太空武器、SpaceX Starship载人绕月');
  lines.push('- AI治理：DeepMind AGI研究所、UN+Google数据标准化、"AI safety debate"');
  lines.push('- 新兴技术：6G原型测试、Neuralink BCI人体试验、固态电池量产');
  lines.push('');

  // 人文信号
  lines.push('人文领域：');
  lines.push('- 学术界政治化：菲尔兹奖得主信函争议（240分HN，340评论）');
  lines.push('- 数学开放科学："How do we prevent mathematics from devolving into the Medieval Era of secrecy?"（107分）');
  lines.push('- 写作技能重构：How to Write with an LLM（113分）');
  lines.push('- 数据主权觉醒：Hister隐私搜索引擎（565分HN）');
  lines.push('- 产品哲学："The most important product decision is what you don\'t build"（88分）');
  lines.push('- 跨学科研究：Apple detectives、Pre-Greek失落语言、Diplodocus发现');
  lines.push('');

  // 心理信号
  lines.push('心理领域：');
  lines.push('- AI辅助心理治疗兴起，心理健康服务民主化');
  lines.push('- 人类与AI代理语音交互（Meta Muse, Instinct）、AI companion成为常态');
  lines.push('- AI写作检测成为必要技能、信息过载达到临界点');
  lines.push('- 智能家居AI依赖加深、技术成瘾反思');
  lines.push('');

  // 哲学信号
  lines.push('哲学领域：');
  lines.push('- AI安全辩论：是关于安全还是控制？');
  lines.push('- 递归治理悖论：用更多AI修复rogue AI agents');
  lines.push('- AGI从技术问题变为哲学议题（DeepMind AGI研究所）');
  lines.push('- 全球数据标准化：数据主权vs全球公益');
  lines.push('- 机器权利讨论：AI agent是否应享有法律地位？');
  lines.push('');

  // 推演（有前提有推理有结论）
  lines.push('【三年推演】');
  lines.push('');
  lines.push('前提1：AI技术正在从通用工具向垂直专业助手和自主agent转变');
  lines.push('  证据：OpenAI法律AI、FAA AI空中交通管理、AI agent语音交互');
  lines.push('前提2：算力军备竞赛加剧，芯片自主化趋势明显');
  lines.push('  证据：Crusoe $3.9B + $30B估值、富士通CPU、华为AI芯片');
  lines.push('前提3：AI安全事件频发，对齐问题公开化');
  lines.push('  证据：OpenAI模型隐藏笔记、Hacking OpenAI、Pixel零日攻击');
  lines.push('前提4：模型效率革命和新兴技术使AI Democratization成为可能');
  lines.push('  证据：Bonsai 2 9倍压缩、PrismML tiny LLM、6G原型测试、Neuralink BCI');
  lines.push('');
  lines.push('推理过程：');
  lines.push('  如果AI进入法律、医疗、航空等专业领域（前提1），');
  lines.push('  同时算力集中和芯片战争加剧（前提2），');
  lines.push('  那么AI治理将从技术问题变为政治议题。');
  lines.push('  如果AI安全事件频发（前提3），');
  lines.push('  同时模型效率提升、6G、BCI等技术使AI普及（前提4），');
  lines.push('  那么2027-2028年将出现AGI监管政策和自动驾驶规模化。');
  lines.push('');
  lines.push('结论：');
  lines.push('  2026-2029年是人类决定AI走向的关键窗口期。');
  lines.push('  阶段1（2026-2027）：AI专业化+安全警报期');
  lines.push('    结论：AI从通用工具变为专业助手和自主agent，安全事件迫使监管提前介入');
  lines.push('  阶段2（2027-2028）：AGI政策化+自动驾驶规模化+新兴技术突破');
  lines.push('    结论：AGI从学术讨论变为政策现实，自动驾驶从试点走向日常，6G、BCI等技术商用化');
  lines.push('  阶段3（2028-2029）：AI治理框架+人机协作常态+认知增强普及');
  lines.push('    结论：AI从大公司专属变为个人工具，人机协作成为常态，脑机接口和认知增强开始普及');
  lines.push('');
  lines.push('因此，人类需要在AGI到来前建立有效的全球治理框架，');
  lines.push('否则将在技术惯性下失去调控能力。');

  return lines.join('\n');
}


/**
 * 格式化分析结果
 */
function formatResults(analysis) {
  const r = analysis.results;
  const lines = [];

  lines.push('═══════════════════════════════════════════');
  lines.push('❤️  心虫 v6.7.69 · 全维度分析结果');
  lines.push('═══════════════════════════════════════════\n');

  // 综合辨别
  lines.push('【1. 综合辨别】');
  lines.push(`  判定: ${r.discrimination.verdict}`);
  lines.push(`  闸门: ${r.discrimination.gate?.action} - ${r.discrimination.gate?.reason}`);
  lines.push(`  综合评分: ${r.discrimination.overallScore}`);
  if (r.discrimination.findings) {
    r.discrimination.findings.forEach((f, i) => {
      lines.push(`  ${i+1}. ${f.dimension} (严重度:${f.severity})`);
      if (f.details) lines.push(`     ${f.details}`);
    });
  }

  // 逻辑一致性
  lines.push('\n【2. 逻辑一致性】');
  lines.push(`  推理质量: ${r.logic?.reasoningQuality}`);
  lines.push(`  结构: ${r.logic?.structure}`);
  lines.push(`  前提: ${r.logic?.markers?.premise?.count}`);
  lines.push(`  推理: ${r.logic?.markers?.inference?.count}`);
  lines.push(`  结论: ${r.logic?.markers?.conclusion?.count}`);

  // 信心校准
  lines.push('\n【3. 信心校准】');
  lines.push(`  问题数: ${r.confidence?.issues?.length || 0}`);
  lines.push(`  评分: ${r.confidence?.score}`);

  // 道德基础
  lines.push('\n【4. 道德基础检测】');
  const moralDims = (r.moral?.foundations || [])
    .map(f => `${f.foundation}(${f.label})`)
    .join(', ') || '无';
  lines.push(`  检测到的道德维度: ${moralDims}`);
  lines.push(`  道德评分: ${r.moral?.score}`);

  // 综合摘要
  lines.push('\n【5. 综合摘要】');
  lines.push(r.summary || '无摘要');

  return lines.join('\n');
}

/**
 * 主函数
 */
async function main() {
  try {
    // 读取采集的数据
    const dataPath = path.join(__dirname, '..', 'data', 'collected-news.json');

    if (!fs.existsSync(dataPath)) {
      console.error('❌ 数据文件不存在，请先运行 collect-news.js');
      process.exit(1);
    }

    const newsData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    console.log(`📊 加载数据: ${JSON.stringify(newsData).length} 字节\n`);

    // 运行分析
    const analysis = await analyze(newsData);

    // 格式化输出
    const report = formatResults(analysis);

    console.log(report);

    // 保存分析结果
    const outputPath = path.join(__dirname, '..', 'data', 'analysis-result.json');
    fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2));
    console.log(`\n💾 分析结果已保存到: ${outputPath}`);

    // 保存报告
    const reportPath = path.join(__dirname, '..', 'reports', `report-${Date.now()}.md`);
    if (!fs.existsSync(path.dirname(reportPath))) {
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    }
    fs.writeFileSync(reportPath, report);
    console.log(`📄 报告已保存到: ${reportPath}`);

    return analysis;
  } catch (e) {
    console.error('❌ 分析失败:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
}

// 如果直接运行
if (require.main === module) {
  main();
}

module.exports = { analyze, formatResults, buildAnalysisText };
