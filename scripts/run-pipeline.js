#!/usr/bin/env node
'use strict';

/**
 * 人类未来推演主控脚本
 * 整合数据采集、心虫分析、推演引擎
 */

const { collectAll } = require('./collect-news.js');
const { analyze, formatResults } = require('./heartflow-analyze.js');
const { ProjectionEngine, formatReport } = require('./project-future.js');
// [v2.17] 外部预测基准采集器（Good Judgment Open）。位置纪律：必须放在
// collectAll() 全部落地之后——v2.14 git stash 对照实验的教训，新网络负载
// 塞进现有源的 Promise.all 会挤掉慢源（ECB/NBER 8 秒超时窗口）。
const { collectBenchmark } = require('../human-future/scripts/prediction-benchmark-collector.js');
// [v3.23] EDGAR S-1/IPO 备案核查器（新数据源）：v3.21 给 ipo-claim 立库时
// 写下的证伪路径「EDGAR 查无/撤回/定价时间表不符/挂牌后披露矛盾」四条里，
// 只有「EDGAR 查无/在案」这一条本轮接上真数据——引擎从此能对 ipo 主张
// 做备案存在性核查（MIT TR「Anthropic has filed its IPO prospectus」经
// Anthropic, PBC 的 S-1 备案记录验证，live 实证 2026-10-29）。
const { verifyIpoClaims } = require('../human-future/scripts/edgar-ipo-collector.js');
const fs = require('fs');
const path = require('path');

/**
 * 主函数
 */
async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('🚀 人类未来 · 文明推演引擎 v3.29.0');
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

    // 阶段 2c：外部预测基准采集（v2.17，Good Judgment Open）
    // 放在所有 RSS/正文抓取与心虫分析都落地之后：不占任何现有源的
    // 超时窗口；缓存 TTL 6h，cron 两小时一轮也多数轮次零网络。
    console.log('\n━━━ 阶段 2c：外部预测基准采集（Good Judgment Open）━━\n');
    let benchmark = null;
    try {
      benchmark = await collectBenchmark({ live: process.env.FETCH === '1' });
      if (benchmark.available) {
        console.log(`  [benchmark] ${benchmark.questions.length} 个未截止开放问题`
          + `（${benchmark.queriesRun.length} 个查询，${benchmark.fromCache ? (benchmark.stale ? '过期缓存' : '缓存命中') : '本轮采集'}）`);
      } else {
        console.log(`  [benchmark] 不可用: ${benchmark.reason || '(未说明原因)'}`);
      }
    } catch (e) {
      // 采集器本身抛错不该让整轮 pipeline 失败——基准段如实降级
      console.log(`  [benchmark] 采集抛错，基准段降级: ${e.message}`);
      benchmark = { available: false, reason: `采集抛错: ${e.message}` };
    }

    // 阶段 3：三年推演
    console.log('\n\n━━━ 阶段 3：三年推演引擎 ━━━\n');

    // 把采集数据挂到 analysis 上，推演引擎才能从真实新闻推导，
    // 而不是输出写死的常量。旧版只传 analysis（含心虫结果），引擎里
    // 5 个核心方法全是硬编码 2026-09 的内容，与输入无关。
    analysis.newsData = newsData;
    const engine = new ProjectionEngine(analysis, { benchmark });
    const projection = engine.generate();

    // [v3.23] ipo 主张的 EDGAR 备案核查（阶段 3.5）。放在 generate() 之后、
    // formatReport 之前：ipo 主张要先被辨别出来才知道要查哪些公司，
    // 而核查结果（证据档抬升）必须进最终报告与 cron 注入——「引擎产出
    // 了但 agent 看不到」的同型断链（v3.0.0c 起第七次）不能在这里再犯。
    // 位置纪律同 v3.2.2：核查是限定性元数据，先于被限定者到达报告。
    try {
      projection.commercialDiscrimination = await verifyIpoClaims(
        projection.commercialDiscrimination, { live: process.env.FETCH === '1' });
      const iv = projection.commercialDiscrimination.ipoVerification;
      if (iv && iv.available) {
        console.log(`  [ipo-edgar] 核查 ${iv.checkedClaims} 条 ipo 主张：验证 ${iv.verified}`
          + ` / 上下文 ${iv.contextOnly} / 未匹配 ${iv.unmatched}（${iv.queries} 次 SEC 查询）`
          // [v3.24] 流程事件计数（RW 撤回/424B4 定价，submissions 登记记录）
          + (iv.eventsQueries > 0 ? `；流程事件：撤回 ${iv.withdrawn} / 定价 ${iv.priced}` : ''));
      } else {
        console.log(`  [ipo-edgar] 不可用: ${(iv && iv.reason) || '(未说明原因)'}`
          + '（ipo 主张按原证据档判定）');
      }
    } catch (e) {
      // 核查抛错不该让整轮 pipeline 失败——ipo 段如实降级
      console.log(`  [ipo-edgar] 核查抛错，ipo 主张按原证据档判定: ${e.message}`);
    }

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
        version: '3.29.0',
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
