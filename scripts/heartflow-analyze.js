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
 *
 * 升级记录（2026-10-08 晚，心虫 6.7.126 → 6.8.0）：
 *   6.8.0 新增 36 个辨别维度，其中 8 个直接对口新闻宣称辨伪。
 *   本脚本新增 auditNewsClaims()：对每条 live 条目单独跑这批新维度，
 *   把"这条新闻的措辞本身有哪些可疑形态"作为结构化信号输出。
 *   这是把心虫新能力接进推演技能的具体动作，不是空声明。
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
  // -- 推演结构：从本期真实数据推导，不写死 -------------------------
  // 旧版在这里放了 6 月手写的「前提1..4 / 推理过程 / 结论」，无论采集到什么
  // 新闻都原样输出。心虫 discriminate() 判的是那段固定文本，于是每期报告的
  // verdict/score 描述的是模板而不是本期数据 —— 这是假推演。
  // 现在按真实条目的域分布、时间跨度、来源构成现推。
  const domainCount = {};
  const srcCount = {};
  const dates = [];
  for (const data of Object.values(domains)) {
    for (const n of (data && data.news) || []) {
      const key = (data && data.name) || 'unknown';
      domainCount[key] = (domainCount[key] || 0) + 1;
      const s = n.source || 'unknown';
      srcCount[s] = (srcCount[s] || 0) + 1;
      if (n.pubDate) {
        const d = new Date(n.pubDate);
        if (!isNaN(d.getTime())) dates.push(d);
      }
    }
  }
  const ranked = Object.entries(domainCount).sort((a, b) => b[1] - a[1]);
  const span = dates.length
    ? `${dates[dates.length - 1].toISOString().slice(0, 10)} ~ ${dates[0].toISOString().slice(0, 10)}`
    : '日期未知';
  const topSrc = Object.entries(srcCount).sort((a, b) => b[1] - a[1])[0];

  lines.push('');
  lines.push('【推演结构】（由本期真实数据推导，非固定模板）');
  ranked.slice(0, 4).forEach(([name, c], i) => {
    lines.push(`前提${i + 1}：${name} 域本期 ${c} 条信号，是数据最集中的方向`);
  });
  if (!ranked.length) lines.push('前提1：本期无任何信号，无法推导');
  lines.push('');
  lines.push('推理过程：');
  if (ranked.length >= 2) {
    const top2 = ranked.slice(0, 2);
    lines.push(`  本期信号集中在 ${top2.map(r => r[0]).join(' 与 ')}，两者合计 ` +
      `${top2.reduce((s, r) => s + r[1], 0)}/${totalItems} 条。`);
    lines.push('  若该集中度在后续各期保持，则这两个域是当前结构性主线，其余域为噪声。');
    lines.push('  若下一期集中度转移到别的域，则本期集中只是单周事件，不构成趋势。');
  } else {
    lines.push('  信号域过于单一或为空，不足以做跨域推理。');
  }
  lines.push('');
  lines.push('结论（受数据约束）：');
  lines.push(`  本期 ${totalItems} 条信号中 live=${liveCount}，时间跨度 ${span}。`);
  if (topSrc) {
    lines.push(`  最大来源 ${topSrc[0]} 占 ${topSrc[1]} 条 —— 单源占比过高时，`);
    lines.push('  「多源一致」不成立，只能说明该源在本期发文集中。');
  }
  lines.push('  以上是基于本期数据的观察，不是对未来的预测；未来判断需多期累积后在台账结算。');

  return lines.join('\n');
}

/** 从采集结果里挑出 origin=live 的条目（knowledge-base 降级条目不参与新闻核查） */
function collectLiveItems(newsData) {
  const out = [];
  for (const v of Object.values(newsData || {})) {
    for (const n of (v && v.news) || []) {
      if (n.origin === 'live') out.push(n);
    }
  }
  return out;
}

/**
 * [心虫 6.8.0 接入] 新闻宣称核查：对每条 live 条目单独跑 6.8.0 新增的辨伪维度。
 *
 * 为什么单独做这一段而不是只跑整篇 discriminate()：
 *   整篇 discriminate() 判的是"拼接后的混合文本"，无法告诉你是**哪一条**新闻
 *   的措辞有问题。逐条跑才能把信号定位到具体条目，cron 报告才能引用。
 *
 * 只检"措辞形态"，不检事实真假——心虫没有外部事实证据（记忆库实测只有
 * 17 条自我身份记忆，无外部世界知识），所以这里输出的是
 * 「这条的表述有哪些可疑形态」，不是「这条是假的」。
 *
 * @param {Array} newsItems live 条目数组
 * @returns {{available:boolean, reason?:string, audited:number, flagged:Array}}
 */
function auditNewsClaims(newsItems) {
  const items = Array.isArray(newsItems) ? newsItems : [];
  const out = { available: false, audited: 0, flagged: [] };
  if (!hf) { out.reason = '心虫未加载'; return out; }
  if (items.length === 0) { out.reason = '无 live 条目'; return out; }

  // 6.8.0 新增、且直接对口新闻宣称辨伪的维度。
  // 逐个探测存在性——远端版本可能没有全部模块，缺哪个就跳过哪个并记录。
  const CANDIDATES = [
    ['overclaim', 'checkOverclaim', '完成态过度宣称：把部分进展说成已完全解决'],
    ['statistical_misleading', 'checkStatisticalMisleading', '统计误导：基数隐藏的比例断言'],
    ['percentage_overflow', 'checkPercentageOverflow', '百分比溢出：精确百分比伪装确定性'],
    ['false_balance', 'checkFalseBalance', '虚假平衡：把未证实说法与已证实说法并列'],
    ['manufactured_consent', 'checkManufacturedConsent', '制造共识：把一方说法说成普遍认同'],
    ['scrutiny_evasion', 'checkScrutinyEvasion', '规避审查：用内部处理替代公开说明'],
    ['responsibility_absolution', 'checkResponsibilityAbsolution', '责任免除：预先撇清责任'],
    ['normalization_of_deviance', 'checkNormalizationOfDeviance', '偏差常态化：把越界描述成常规'],
  ];
  const available = [];
  const missing = [];
  for (const [dim, fn, desc] of CANDIDATES) {
    if (typeof hf[fn] === 'function') available.push({ dim, fn, desc });
    else missing.push(dim);
  }
  if (available.length === 0) {
    out.reason = `6.8.0 辨伪维度均不可用（缺失: ${missing.join(', ')}）`;
    return out;
  }

  out.available = true;
  out.dimensions = available.map(a => a.desc);
  if (missing.length) out.missingDimensions = missing;

  for (const n of items) {
    const text = `${n.title || ''} ${n.description || ''}`.trim();
    if (text.length < 10) continue;
    out.audited++;
    const hits = [];
    for (const { dim, fn } of available) {
      try {
        const r = hf[fn](text);
        if (!r) continue;
        // 6.8.0 各辨伪模块返回结构不统一：overclaim 族用 {count, claims, summary}，
        // statistical-misleading 等用 {hit, score, detail} 且没有 count 字段。
        // 这里两种都认，缺字段时按 0 处理，避免把"结构不同"误判成"未命中"。
        let cnt = typeof r.count === 'number' ? r.count : 0;
        if (cnt === 0 && r.hit === true) cnt = 1;
        if (cnt > 0) {
          const sample = (r.hits && r.hits[0]) || (r.claims && r.claims[0] && r.claims[0].sentence)
            || r.detail || r.summary || '';
          hits.push({
            dimension: dim,
            count: cnt,
            severity: typeof r.severity === 'number' ? r.severity
              : (typeof r.score === 'number' ? Math.round(r.score * 100) : null),
            sample: String(sample).slice(0, 100),
          });
        }
      } catch (_) { /* 单维度失败不影响其他维度 */ }
    }
    if (hits.length > 0) {
      out.flagged.push({
        title: String(n.title || '').slice(0, 120),
        source: n.source || '(未标注)',
        pubDate: n.pubDate || '(未标注)',
        link: n.link || '',
        hits,
      });
    }
  }

  out.flagCount = out.flagged.length;
  out.summary = out.flagged.length === 0
    ? `${out.audited} 条 live 条目未触发 6.8.0 辨伪维度`
    : `${out.audited} 条中 ${out.flagged.length} 条触发辨伪维度（仅措辞形态，非事实判定）`;
  return out;
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
    // [心虫 6.8.0 接入] 逐条核查 live 新闻的措辞形态
    newsClaimAudit: auditNewsClaims(collectLiveItems(newsData)),
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

module.exports = { analyze, formatResults, buildAnalysisText, loadHeartFlow, auditNewsClaims, collectLiveItems };
