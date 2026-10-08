#!/usr/bin/env node
'use strict';

/**
 * 人类未来推演主控脚本
 * 整合数据采集、心虫分析、推演引擎
 */

const { collectAll } = require('./collect-news.js');
const { analyze, formatResults } = require('./heartflow-analyze.js');
const { ProjectionEngine, formatReport } = require('./project-future.js');
const fs = require('fs');
const path = require('path');

/**
 * 主函数
 */
async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('🚀 人类未来 · 文明推演引擎 v1.0.0');
  console.log('❤️  心虫 v6.7.69 驱动');
  console.log('═══════════════════════════════════════════\n');

  try {
    // 阶段 1：数据采集
    console.log('━━━ 阶段 1：多维度数据采集 ━━━\n');
    const newsData = await collectAll();

    // 阶段 2：心虫认知分析
    console.log('\n━━━ 阶段 2：心虫认知分析 ━━━\n');
    const analysis = await analyze(newsData);

    // 输出分析结果
    const analysisReport = formatResults(analysis);
    console.log('\n' + analysisReport);

    // [心虫 6.8.0 接入] 逐条新闻宣称辨伪——把"哪条新闻措辞可疑"定位到具体条目。
    // 只检表述形态，不检事实真假，故标题必须写清，避免被读成"该新闻为假"。
    if (analysis.newsClaimAudit && analysis.newsClaimAudit.available) {
      const a = analysis.newsClaimAudit;
      console.log('\n━━━ 阶段 2b：live 新闻宣称辨伪（心虫 6.8.0 新维度）━━');
      console.log(`  生效维度: ${a.dimensions.length} 个 | 已核查: ${a.audited} 条 | 触发: ${a.flagCount} 条`);
      console.log('  ⚠ 仅判定表述形态（措辞可疑），不代表该新闻内容为假');
      for (const fl of (a.flagged || []).slice(0, 10)) {
        console.log(`  [${fl.hits.map(h => h.dimension).join(', ')}] ${fl.title}`);
      }
    }

    // 阶段 3：三年推演
    console.log('\n\n━━━ 阶段 3：三年推演引擎 ━━━\n');

    // 把采集数据挂到 analysis 上，推演引擎才能从真实新闻推导，
    // 而不是输出写死的常量。旧版只传 analysis（含心虫结果），引擎里
    // 5 个核心方法全是硬编码 2026-09 的内容，与输入无关。
    analysis.newsData = newsData;
    const engine = new ProjectionEngine(analysis);
    const projection = engine.generate();

    // 格式化并输出推演报告
    const projectionReport = formatReport(projection);
    console.log(projectionReport);

    // 保存完整报告
    const reportDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const fullReport = {
      meta: {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        heartflowVersion: analysis.engineVersion,
        modulesLoaded: analysis.modulesLoaded
      },
      newsData,
      analysis,
      projection
    };

    const reportPath = path.join(reportDir, `full-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(fullReport, null, 2));
    console.log(`\n💾 完整报告已保存到: ${reportPath}`);

    // 保存 Markdown 报告
    const mdPath = path.join(reportDir, `full-report-${Date.now()}.md`);
    fs.writeFileSync(mdPath, projectionReport);
    console.log(`📄 Markdown 报告已保存到: ${mdPath}`);

    // 保存最新报告引用
    const latestPath = path.join(reportDir, 'latest.json');
    fs.writeFileSync(latestPath, JSON.stringify({
      timestamp: fullReport.meta.timestamp,
      heartflowVersion: analysis.engineVersion,
      verdict: analysis.results.discrimination?.verdict,
      score: analysis.results.discrimination?.overallScore,
      reportPath: mdPath
    }, null, 2));
    console.log(`📋 最新报告索引已保存到: ${latestPath}`);

    console.log('\n✅ 人类未来推演完成！');

    return fullReport;
  } catch (e) {
    console.error('\n❌ 推演失败:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
}

// 如果直接运行
if (require.main === module) {
  main();
}

module.exports = { main };
