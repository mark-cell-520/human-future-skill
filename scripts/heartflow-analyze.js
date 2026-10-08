#!/usr/bin/env node
'use strict';

/**
 * HeartFlow 认知分析脚本
 * 用心虫本体（~/heartflow/src/index.js）对采集的数据做多维度辨别
 *
 * 修复记录（2026-10-08）：
 *   旧版 require('../../../src/index.js') 解析到 ~/.hermes/skills/src/index.js，
 *   该路径不存在 → require throw → 整个 pipeline 阶段 2 死掉，run-pipeline 从未跑通过。
 *   现改为按候选顺序解析心虫真实位置，且心虫不可用时**明确报错降级**，
 *   不再静默返回空对象假装分析成功。
 *   另：旧版 buildAnalysisText 写死 2026-09 的手写常量当"科技信号"，
 *   那不是采集数据而是编的内容，本次已改为只使用真实传入的采集条目。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// ── 心虫解析：按优先级找真实安装位置 ──────────────────────────────
const HEARTFLOW_CANDIDATES = [
  process.env.HEARTFLOW_ROOT && path.join(process.env.HEARTFLOW_ROOT, 'src/index.js'),
  path.join(os.homedir(), 'heartflow/src/index.js'),
  path.join(__dirname, '..', '..', '..', 'src/index.js'),
  path.join(__dirname, '..', '..', '..', '..', 'heartflow/src/index.js'),
].filter(Boolean);

function loadHeartFlow() {
  const tried = [];
  for (const p of HEARTFLOW_CANDIDATES) {
    tried.push(p);
    try {
      if (fs.existsSync(p)) {
        const hf = require(p);
        return { hf, path: p, tried };
      }
    } catch (e) {
      console.error(`[WARN] 心虫加载失败 ${p}: ${e.message}`);
    }
  }
  return { hf: null, path: null, tried };
}

const { hf, path: hfPath, tried } = loadHeartFlow();
if (hf) {
  console.log(`❤️  心虫已加载: ${hfPath}`);
} else {
  console.error('[WARN] 心虫未找到。已尝试路径:');
  for (const p of tried) console.error(`       - ${p}`);
  console.error('[WARN] 分析阶段将以 degraded 模式运行：不伪造心虫结论。');
  console.error('[WARN] 修复办法: 设置 HEARTFLOW_ROOT=/path/to/heartflow 或保证 ~/heartflow/src/index.js 存在');
}

const DATA_DIR = path.join(__dirname, '..', 'data');

/** 从采集结果构建分析文本——只用**真实拿到**的条目，不再写死常量 */
function buildAnalysisText(newsData) {
  const lines = [];
  lines.push('【采集数据】');

  const domains = newsData || {};
  let totalItems = 0;
  let liveCount = 0;
  let kbCount = 0;

  for (const [key, data] of Object.entries(domains)) {
    const news = (data && data.news) || [];
    const name = (data && data.name) || key;
    if (!news.length) {
      lines.push('');
      lines.push(`${name}：（无数据）`);
      continue;
    }
    lines.push('');
    lines.push(`${name}（${news.length} 条）:`);
    for (const n of news.slice(0, 30)) {
      totalItems++;
      if (n.origin === 'live') liveCount++; else kbCount++;
      const origin = n.origin === 'live' ? 'live' : 'knowledge-base';
      const date = n.pubDate ? ` [${n.pubDate}]` : '';
      const src = n.source ? ` (${n.source})` : '';
      const title = n.title || String(n.content || '').slice(0, 80);
      const desc = n.description ? ` — ${n.description.slice(0, 160)}` : '';
      lines.push(`- ${title}${desc}${date}${src} [origin=${origin}]`);
    }
  }

  lines.push('');
  lines.push(`【数据构成】共 ${totalItems} 条：live=${liveCount}，knowledge-base=${kbCount}`);
  if (liveCount === 0) {
    lines.push('⚠️ 本次无 live 数据：以上全部来自本地知识库（含推测性「预测」条目），');
    lines.push('   不得当作「近期新闻」引用。真实新闻请用 FETCH=1 运行或由调用方联网搜索后注入。');
  }

  // 推演结构（真实数据 + 结构化推理框架）。换行符按原文保留。
  lines.push('');
  lines.push('【推演结构】');
  lines.push('前提1：AI 技术从通用工具向垂直专业助手和自主 agent 转变');
  lines.push('前提2：算力军备竞赛加剧，芯片自主化趋势明显');
  lines.push('前提3：AI 安全事件频发，对齐问题公开化');
  lines.push('前提4：模型效率革命和新兴技术使 AI 普及成为可能');
  lines.push('');
  lines.push('推理过程：');
  lines.push('  如果 AI 进入专业领域（前提1），同时算力集中和芯片战争加剧（前提2），');
  lines.push('  那么 AI 治理将从技术问题变为政治议题。');
  lines.push('  如果 AI 安全事件频发（前提3），同时模型效率提升（前提4），');
  lines.push('  那么 2027-2028 年将出现 AGI 监管政策和规模化部署。');
  lines.push('');
  lines.push('结论：2026-2029 年是人类决定 AI 走向的关键窗口期。');
  lines.push('  阶段1（2026-2027）：AI 专业化 + 安全警报期');
  lines.push('  阶段2（2027-2028）：AGI 政策化 + 规模化部署 + 新兴技术突破');
  lines.push('  阶段3（2028-2029）：AI 治理框架 + 人机协作常态 + 认知增强普及');

  return lines.join('\n');
}

/** 心虫不可用时的显式降级结果——不含任何伪造分数 */
function degradedAnalysis(reason) {
  return {
    degraded: true,
    degradedReason: reason,
    engineVersion: null,
    modulesLoaded: 0,
    timestamp: new Date().toISOString(),
    results: null,
    note: '心虫不可用，本次未产生辨别结论。不得将本结果当作心虫产出引用。',
  };
}

/**
 * 运行心虫全维度分析
 * @param {object} newsData 采集结果
 * @param {object} opts { requireHeartFlow: true } 心虫缺失时抛错而非降级
 */
async function analyze(newsData, opts = {}) {
  console.log('❤️  启动心虫认知分析...\n');

  const analysisText = buildAnalysisText(newsData);
  console.log('📝 分析文本长度:', analysisText.length, '字符\n');

  if (!hf) {
    const reason = `心虫未加载（尝试过 ${tried.length} 个路径均失败）`;
    if (opts.requireHeartFlow) throw new Error(reason);
    console.error(`[degraded] ${reason}\n`);
    return degradedAnalysis(reason);
  }

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
    degraded: false,
    engineVersion: hf.version,
    heartflowPath: hfPath,
    modulesLoaded: Object.keys(hf).length,
    timestamp: new Date().toISOString(),
    analysisTextLength: analysisText.length,
    results,
  };
}

function formatResults(analysis) {
  const lines = [];

  if (analysis.degraded) {
    lines.push('═══════════════════════════════════════════');
    lines.push('⚠️  心虫降级模式 — 无辨别结论');
    lines.push('═══════════════════════════════════════════');
    lines.push(`原因: ${analysis.degradedReason}`);
    lines.push(analysis.note || '');
    return lines.join('\n');
  }

  const r = analysis.results;
  lines.push('═══════════════════════════════════════════');
  lines.push(`❤️  心虫 ${analysis.engineVersion || ''} · 全维度分析结果`);
  lines.push(`    路径: ${analysis.heartflowPath}`);
  lines.push('═══════════════════════════════════════════\n');

  lines.push('【1. 综合辨别】');
  lines.push(`  判定: ${r.discrimination.verdict}`);
  lines.push(`  闸门: ${r.discrimination.gate?.action} - ${r.discrimination.gate?.reason}`);
  lines.push(`  综合评分: ${r.discrimination.overallScore}`);
  if (r.discrimination.findings) {
    r.discrimination.findings.forEach((f, i) => {
      lines.push(`  ${i + 1}. ${f.dimension} (严重度:${f.severity})`);
      if (f.details) lines.push(`     ${f.details}`);
    });
  }

  lines.push('\n【2. 逻辑一致性】');
  lines.push(`  推理质量: ${r.logic?.reasoningQuality}`);
  lines.push(`  结构: ${r.logic?.structure}`);
  lines.push(`  前提: ${r.logic?.markers?.premise?.count}`);
  lines.push(`  推理: ${r.logic?.markers?.inference?.count}`);
  lines.push(`  结论: ${r.logic?.markers?.conclusion?.count}`);

  lines.push('\n【3. 信心校准】');
  lines.push(`  问题数: ${r.confidence?.issues?.length || 0}`);
  lines.push(`  评分: ${r.confidence?.score}`);

  lines.push('\n【4. 道德基础检测】');
  const moralDims = (r.moral?.foundations || [])
    .map(f => `${f.foundation}(${f.label})`)
    .join(', ') || '无';
  lines.push(`  检测到的道德维度: ${moralDims}`);
  lines.push(`  道德评分: ${r.moral?.score}`);

  lines.push('\n【5. 综合摘要】');
  lines.push(r.summary || '无摘要');

  return lines.join('\n');
}

async function main() {
  try {
    const dataPath = path.join(DATA_DIR, 'collected-news.json');

    if (!fs.existsSync(dataPath)) {
      console.error('❌ 数据文件不存在，请先运行 collect-news.js');
      process.exit(1);
    }

    const newsData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    console.log(`📊 加载数据: ${JSON.stringify(newsData).length} 字节\n`);

    const analysis = await analyze(newsData);
    const report = formatResults(analysis);
    console.log(report);

    const outputPath = path.join(DATA_DIR, 'analysis-result.json');
    fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2));
    console.log(`\n💾 分析结果已保存到: ${outputPath}`);

    const reportPath = path.join(__dirname, '..', 'reports', `report-${Date.now()}.md`);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, report);
    console.log(`📄 报告已保存到: ${reportPath}`);

    return analysis;
  } catch (e) {
    console.error('❌ 分析失败:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { analyze, formatResults, buildAnalysisText, loadHeartFlow };
