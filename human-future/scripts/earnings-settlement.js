#!/usr/bin/env node
'use strict';

/**
 * 财报指引自动结算 — human-future v3.5 新能力
 *
 * ── 这个模块为什么存在 ───────────────────────────────────────────
 * v3.4 把 33 条 SEC EDGAR 财报指引登记进了台账（有主体/事件/结算期，全引擎
 * 最硬的可结算预测），并承诺「到期结算 Brier，建立校准曲线」。但 v3.5 审计
 * 实测：台账 33 条 earnings_guidance，15 条已到期（dueOn <= now），**0 条
 * 结算**——v2.13 方向转变的核心承诺对最硬的一类预测从未兑现。结算逻辑整个
 * 缺失：指引登记了，没有任何机制拿「下一期财报的实际值」去对账。
 *
 * 业绩发布的 EX-99 同时含「上一财季实际值」（过去时）与「下一财季指引」
 * （期望时态）。本模块把实际值与台账里的指引配对，按容差/区间算命中，
 * 调 ledger.settle() 落账——让校准曲线第一次有真实数据可画。
 *
 * ── 结算语义（必须明确，否则 Brier 不可解释）────────────────────
 * outcome=true 当且仅当 **实际值落在指引容差带内** [guided ± tolerance]
 * （或指引为区间时落在区间内）。这是「公司自报的数值区间是否包含实际值」
 * 的字面、可证伪判据。方向（超出带上沿=beat / 低于下沿=missed）单独记进
 * evidence，不混入布尔结果——NVDA 实测两条 revenue 指引都被 actual 超出
 * 带上沿（保守指引），按字面判据是 out-of-band，但方向是 beat，二者必须
 * 分开陈述，否则「miss」会被误读成「公司没做到」。
 *
 * ── 保守性约束（不可违反，防假结算）────────────────────────────
 * 1. 只结算**有容差或区间**的指引——无容差的点值指引（"$13 billion"）
 *    无法定义命中带，留给人工，不猜。
 * 2. (ticker, 财年, 财季, 指标) 对应**唯一**实际值才结算；出现多个
 *    （典型：GAAP 与非 GAAP 毛利率不同）→ 判「歧义」跳过，不设法规避。
 *    这一条同时消解了 GAAP/非 GAAP 口径错位——它们不同值时自然产生两条
 *    实际值，被本规则挡在结算之外；同值时（NVDA 实测）只余一条，照常结算。
 * 3. 容差解释按单位走：$ 值 + % 容差 = 相对（guided 的百分比）；$ 值 +
 *    $ 容差 = 绝对；% 值 + bps = 百分点；% 值 + % = 百分点（毛利率口径）。
 *    解释错一个符号，整条结算就是假的——每种组合都有测试钉住。
 * 4. 数值单位归一：billion/million/trillion 折成绝对值，% 保持原值，
 *    比较前两边必须同单位，否则跳过。
 */

// [v3.25] 单位组补单字母 B/M（QCOM live 实证：「Revenues $9.7B - $10.5B」
// 表格行用 B 缩写）。billion/million 全拼在前（交替按顺序匹配，全拼优先）。
const NUM_UNIT_RE = /\$?\s?([\d.,]+)\s*(billion|million|bn|tn|trillion|%|basis points|bps|B|M)?/i;
const SCALE = { billion: 1e9, bn: 1e9, million: 1e6, tn: 1e12, trillion: 1e12, b: 1e9, m: 1e6 };

/**
 * 解析一个带单位的数值串 → {n, unit}。
 * unit ∈ 'usd' | 'pct' | 'bps'；解析不出返回 null。
 * @param {string} str 如 "$96.2 billion" / "75.0%" / "50 basis points" / "$1.5 billion"
 */
function parseMetricValue(str) {
  if (str == null) return null;
  const m = String(str).match(NUM_UNIT_RE);
  if (!m || m[1] == null) return null;
  let n = Number(m[1].replace(/,/g, ''));
  if (!isFinite(n)) return null;
  const u = (m[2] || '').toLowerCase();
  if (u === '%') return { n, unit: 'pct' };
  if (u === 'basis points' || u === 'bps') return { n, unit: 'bps' };
  if (SCALE[u]) return { n: n * SCALE[u], unit: 'usd' };
  // 无单位：带 $ 前缀按美元计，否则无法判定单位
  return /^\s*\$/.test(String(str)) ? { n, unit: 'usd' } : null;
}

/**
 * 解析区间指引值 → {lo, hi, unit}。
 * 支持 "between $197.0 billion and $202.0 billion" / "52.1% to 53.1%" /
 * [v3.14] "in the range of $73-76 billion"（连字符区间，两端同单位）/
 * "between 15-17%"（单百分号区间）——META CFO 评论式指引 live 实证。
 * [v3.16] 分隔符泛化为连字符或 to（GOOGL FY2026 capex live 实证："in the
 * range of $175 to $185 billion"——X-to-Y 形态旧正则整个不命中，value 退化
 * 成点值 $175、无容差不可结算）；首侧补可选单位（"$175 million to $1
 * billion" 两端不同单位各折各的，缺省按尾侧单位）。
 * [v3.19] between + en-dash 美元区间（PLTR live 实证：「to between
 * $8.150 – $8.158 billion」——between-and / in the range of / 单百分号
 * 三种旧语法全部不命中）。与 edgar-collector rangeM 同构（v3.16 教训：
 * 抽取侧与结算侧必须同轮改，只改一侧会越界崩溃或断言空转）。
 */
function parseRange(str) {
  const s = String(str || '');
  const mDollar = s.match(/between\s+\$?\s?([\d.,]+)\s*(billion|million|%)?\s+and\s+\$?\s?([\d.,]+)\s*(billion|million|%)?/i);
  if (mDollar) {
    // [v3.14] 百分比区间（NVDA 全年税率 live 实证：「between 16.0% and
    // 18.0%」）：任一侧带 % 按百分点判，数值不缩放——旧正则单位组
    // 只有 billion/million，"16.0%" 的 % 让整段不命中、区间退化成
    // 点值指引（无容差不可结算）。
    if ((mDollar[2] || '').includes('%') || (mDollar[4] || '').includes('%')) {
      return { lo: Number(mDollar[1].replace(/,/g, '')), hi: Number(mDollar[3].replace(/,/g, '')), unit: 'pct' };
    }
    // [v3.25] between-and 两端都无单位（ANET EPS live 实证：「between
    // $1.06 and $1.08」是每股美元值）：默认 billion 会错 9 个数量级
    // （$1.06 → $10.6 亿）——不猜，返回 null 由调用方跳过（错配成 miss
    // 比不结更坏）。既有 live 数据（AMZN/NVDA 税率/PLTR/META）都带单位
    // 或 %，行为不变。
    if (!mDollar[2] && !mDollar[4]) return null;
    const scale = (u) => (u && SCALE[u.toLowerCase()]) || 1e9; // 营收区间默认 billion
    return { lo: Number(mDollar[1].replace(/,/g, '')) * scale(mDollar[2]),
      hi: Number(mDollar[3].replace(/,/g, '')) * scale(mDollar[4]), unit: 'usd' };
  }
  // [v3.14] 连字符美元区间：「in the range of $73-76 billion」两端同单位
  // （billion 只写一次——不吃进来两端都按 billion 折，$135-145 就是 1350 亿）
  // [v3.16] 分隔符泛化（连字符或 to）+ 首侧可选单位：与 edgar-collector
  // rangeM 第四形态同构（抽取侧存 m[0]、本函数解析，两边正则必须一致）
  const mDashUsd = s.match(/in\s+the\s+range\s+of\s+\$?\s?([\d.,]+)\s*(million|billion)?\s*(?:[-–]|\bto\b)\s*\$?\s?([\d.,]+)\s*(billion|million)/i);
  if (mDashUsd) {
    // 首侧无单位时按尾侧单位折（"$175 to $185 billion" 两端都按 billion）
    const scLo = SCALE[(mDashUsd[2] || mDashUsd[4]).toLowerCase()];
    const scHi = SCALE[mDashUsd[4].toLowerCase()];
    return { lo: Number(mDashUsd[1].replace(/,/g, '')) * scLo,
      hi: Number(mDashUsd[3].replace(/,/g, '')) * scHi, unit: 'usd' };
  }
  const mPct = s.match(/([\d.]+)\s*%\s*(?:to|and|-|–)\s*([\d.]+)\s*%/i);
  if (mPct) return { lo: Number(mPct[1]), hi: Number(mPct[2]), unit: 'pct' };
  // [v3.14] 单百分号区间：「between 15-17%」（旧正则要求两端都有 %）
  const mDashPct = s.match(/between\s+([\d.]+)\s*[-–]\s*([\d.]+)\s*%/i);
  if (mDashPct) return { lo: Number(mDashPct[1]), hi: Number(mDashPct[2]), unit: 'pct' };
  // [v3.19] between + en-dash 美元区间（PLTR live 实证：「to between
  // $8.150 – $8.158 billion」）。首侧无单位按尾侧单位折（与 mDashUsd
  // 同规则）；单位组只认 million/billion（千分位报表防错标度，v3.17
  // 表格式 capex 同款纪律）。
  const mBetweenDash = s.match(/between\s+\$?\s?([\d.,]+)\s*(million|billion)?\s*[–-]\s*\$?\s?([\d.,]+)\s*(billion|million)/i);
  if (mBetweenDash) {
    const scLo = SCALE[(mBetweenDash[2] || mBetweenDash[4]).toLowerCase()];
    const scHi = SCALE[mBetweenDash[4].toLowerCase()];
    return { lo: Number(mBetweenDash[1].replace(/,/g, '')) * scLo,
      hi: Number(mBetweenDash[3].replace(/,/g, '')) * scHi, unit: 'usd' };
  }
  // [v3.25] 无 between / 无 in the range of 的裸美元区间（QCOM/CSCO/NOW/
  // UBER live 实证：「$9.7B - $10.5B」「$18.0 billion to $18.2 billion」
  // 「of $0.84 to $0.88」）。与抽取侧 rangeM 新增形态同轮同构（v3.16 教训）。
  // 尾侧单位**必需**——NOW「$4,245 - $4,255」单位在表头跨句不进 value 串，
  // 默认 billion 差 1000 倍；尾侧无单位即不匹配、落到底部 return null，
  // 实现「无单位一律不猜」（本地分叉轮同款纪律：错配成 miss 比不结更坏）。
  const mBareUsd = s.match(/\$\s?([\d.,]+)\s*(million|billion|bn|B|M)?\s*(?:[-–]|\bto\b)\s*\$?\s?([\d.,]+)\s*(million|billion|bn|B|M)/i);
  if (mBareUsd) {
    const scLo = SCALE[(mBareUsd[2] || mBareUsd[4]).toLowerCase()];
    const scHi = SCALE[mBareUsd[4].toLowerCase()];
    return { lo: Number(mBareUsd[1].replace(/,/g, '')) * scLo,
      hi: Number(mBareUsd[3].replace(/,/g, '')) * scHi, unit: 'usd' };
  }
  // [v3.25] between approximately + 连字符 %（ANET live 实证：「Non-GAAP
  // gross margin between approximately 62-63%」）
  const mBetweenApprox = s.match(/between\s+approximately\s+([\d.]+)\s*[-–]\s*([\d.]+)\s*%/i);
  if (mBetweenApprox) return { lo: Number(mBetweenApprox[1]), hi: Number(mBetweenApprox[2]), unit: 'pct' };
  // [v3.25] 尾 % 区间（首值无 %、无 between）——ANET「48 - 49%」/ CSCO
  // 「65% - 66%」live 实证。与抽取侧 rangeM 新增分支同轮同构（v3.16 教训）。
  const mTailPct = s.match(/([\d.]+)%?\s*[-–]\s*([\d.]+)\s*%/i);
  if (mTailPct) return { lo: Number(mTailPct[1]), hi: Number(mTailPct[2]), unit: 'pct' };
  return null;
}

/**
 * 由指引的数值/容差/区间算出命中带 → {lo, hi, unit, guidedN, tolAbs, basis}。
 * 无法定义命中带（无容差无区间 / 单位不兼容 / 解释不了）返回 null——
 * 调用方据此跳过，绝不猜一个带出来。
 */
function guidanceBand(guidedValue, tolerance, isRange) {
  if (isRange) {
    const r = parseRange(guidedValue);
    return r ? { lo: r.lo, hi: r.hi, unit: r.unit, guidedN: (r.lo + r.hi) / 2, tolAbs: (r.hi - r.lo) / 2, basis: 'range' } : null;
  }
  if (!tolerance) return null; // 无容差的点值指引：不自动结算
  const gv = parseMetricValue(guidedValue);
  const tv = parseMetricValue(tolerance);
  if (!gv || !tv) return null;
  let tolAbs;
  if (gv.unit === 'usd') {
    if (tv.unit === 'pct') tolAbs = gv.n * (tv.n / 100);       // $ 值 + % 容差 = 相对
    else if (tv.unit === 'usd') tolAbs = tv.n;                 // $ 值 + $ 容差 = 绝对
    else return null;
  } else if (gv.unit === 'pct') {
    if (tv.unit === 'bps') tolAbs = tv.n / 100;                // % 值 + bps = 百分点
    else if (tv.unit === 'pct') tolAbs = tv.n;                 // % 值 + % = 百分点（毛利率口径）
    else return null;
  } else {
    return null;
  }
  if (!isFinite(tolAbs) || tolAbs < 0) return null;
  return { lo: gv.n - tolAbs, hi: gv.n + tolAbs, unit: gv.unit, guidedN: gv.n, tolAbs, basis: 'tolerance' };
}

/**
 * 判定一条指引对上一个实际值是否命中。
 * @param {object} g 指引元数据 {value, tolerance, isRange}
 * @param {string} actualValue 实际值串，如 "$96.2 billion" / "75.0%"
 * @returns {{settleable:boolean, reason?:string, hit?:boolean, band?:object, actualN?:number, direction?:string}}
 *   settleable=false 时 reason 说明为何不自动结算（无带/单位不兼容）。
 */
function settleGuidance(g, actualValue) {
  const band = guidanceBand(g.value, g.tolerance, g.isRange);
  if (!band) {
    return { settleable: false, reason: g.isRange ? '区间解析失败' : (g.tolerance ? '容差单位无法解释' : '无容差/区间的点值指引，不自动结算') };
  }
  const av = parseMetricValue(actualValue);
  if (!av || av.unit !== band.unit) {
    return { settleable: false, reason: `实际值单位(${av ? av.unit : '?'})与指引带单位(${band.unit})不兼容` };
  }
  const hit = av.n >= band.lo && av.n <= band.hi;
  const direction = av.n > band.hi ? 'beat(超出带上沿)' : (av.n < band.lo ? 'below(低于带下沿)' : 'in-band(带内)');
  return { settleable: true, hit, band, actualN: av.n, direction };
}

/**
 * 指标名归一：指引侧与 actuals 侧从不同句子抽指标，单复数/净总额写法不一
 * （"gross margins" vs "gross margin"、"net revenue" vs "revenue"、"net sales"）。
 * 结算配对前两边都过一遍本函数，避免同指标因写法差异配不上。
 * [v3.13] 指标族从两个扩到六个：营收/毛利率（v3.5）+ 每股收益/营业利润/
 * 营业支出/税率（v3.13 live 实证——18 条到期未结算指引里 MRVL EPS、
 * AMZN 营业利润有容差/区间可结算，opex/税率或无容差或无实际值来源，
 * 见 SKILL.md「仍在库外」）。每股写法（diluted net income per share /
 * diluted earnings per share / EPS）都归 diluted eps——旧实现只归两名，
 * MRVL EPS 指引的指标名是 income，与实际值侧配不上。
 * [v3.14] total expenses 归一族（META 全年费用指引 "full year 2026
 * total expenses"，live 实证）——指引侧 settleMetric 与实际值侧同族
 * 才能配对；全年实际值抽取（Q4 备案「季度+全年」双值句取全年值）是
 * 已知边界，见 SKILL.md。其余原样返回（配不上就不结算，不硬凑）。
 */
function normalizeMetric(m) {
  const s = String(m || '').toLowerCase().trim();
  if (/gross\s+margin/.test(s)) return 'gross margin';
  if (/(net\s+|total\s+)?(revenue|revenues|sales)/.test(s)) return 'revenue';
  if (/diluted\s+(?:net\s+)?income\s+per\s+share|diluted\s+earnings\s+per\s+share|earnings\s+per\s+(?:diluted\s+)?share|\beps\b/.test(s)) return 'diluted eps';
  if (/operating\s+income/.test(s)) return 'operating income';
  if (/operating\s+expenses/.test(s)) return 'operating expenses';
  // [v3.16] capex 族归一（GOOGL live 实证：指引句指标名词是 "CapEx"、
  // 全年实际值族是 "capital expenditures"——两边不归一时期间/区间修好了
  // 也永远配不上，与 v3.13 EPS 族归一同型）
  if (/capital\s+expenditures?|\bcapex\b/.test(s)) return 'capital expenditures';
  if (/total\s+(?:costs\s+and\s+)?expenses/.test(s)) return 'total expenses';
  if (/tax\s+rates?/.test(s)) return 'tax rate';
  return s;
}

module.exports = { parseMetricValue, parseRange, guidanceBand, settleGuidance, normalizeMetric, NUM_UNIT_RE };

if (require.main === module) {
  // 自测（纯函数，无副作用）：覆盖五种单位组合 + 区间 + 反向（不可结算）
  const cases = [
    ['$91.0 billion', '2%', false, '$96.2 billion', false, 'beat'],       // NVDA Q2 revenue: 相对容差, actual 超带上沿
    ['$78.0 billion', '2%', false, '$81.6 billion', false, 'beat'],       // NVDA Q1 revenue
    ['74.9%', '50 basis points', false, '75.0%', true, 'in-band'],        // NVDA Q2 margin: bps → 百分点
    ['74.9%', '50 basis points', false, '74.9%', true, 'in-band'],        // NVDA Q1 margin
    ['52.1%', null, false, '52.1%', null, null],                          // 无容差点值 → 不可结算
    ['between $197.0 billion and $202.0 billion', null, true, '$200.0 billion', true, 'in-band'], // Amazon range
    ['$3.150 billion', '5%', false, '$2.9 billion', false, 'below'],       // MRVL net revenue 相对容差, actual 低于带下沿
    // [v3.14] META CFO 评论式区间（live 实证）：连字符美元区间两端同单位
    ['in the range of $58-61 billion', null, true, '$60.80 billion', true, 'in-band'],   // META Q2-26 revenue
    ['in the range of $61-64 billion', null, true, '$64.60 billion', false, 'beat'],     // META Q3-26 revenue: 实际超带上沿
    // [v3.14] 单百分号区间（税率）
    ['between 15-17%', null, true, '16.2%', true, 'in-band'],             // META Q4-26 tax rate
    // [v3.14] 双百分号 between-and 区间（NVDA 全年税率 live：between 16.0% and 18.0%）
    ['between 16.0% and 18.0%', null, true, '17.1%', true, 'in-band'],
    // [v3.14] 单位不混：美元区间 vs 百分点实际值不可结算
    ['in the range of $58-61 billion', null, true, '16.2%', null, null],
    // [v3.16] X-to-Y 美元区间（GOOGL FY2026 capex live 实证）
    ['in the range of $175 to $185 billion', null, true, '$180 billion', true, 'in-band'],
    ['in the range of $175 to $185 billion', null, true, '$190 billion', false, 'beat'],
    // [v3.16] 两端不同单位（首侧 million 尾侧 billion，各折各的）
    ['in the range of $175 million to $1 billion', null, true, '$500 million', true, 'in-band'],
    // [v3.19] between + en-dash 美元区间（PLTR live 实证）
    ['between $8.150 – $8.158 billion', null, true, '$8.155 billion', true, 'in-band'],
    ['between $8.150 – $8.158 billion', null, true, '$8.200 billion', false, 'beat'],
    ['between $4.889 – $4.897 billion', null, true, '$4.5 billion', false, 'below'],
    // [v3.19] DELL between-and 区间（旧形态，回归不破）
    ['between $44.0 billion and $45.0 billion', null, true, '$47.0 billion', false, 'beat'],
  ];
  let pass = 0, fail = 0;
  for (const [gv, tol, isRange, av, expHit, expDir] of cases) {
    const r = settleGuidance({ value: gv, tolerance: tol, isRange }, av);
    const ok = (expHit === null) ? (!r.settleable) : (r.settleable && r.hit === expHit && r.direction.startsWith(expDir));
    if (ok) { pass++; console.log(`✓ ${gv} ±${tol || '-'} vs ${av} → ${r.settleable ? (r.hit ? 'HIT' : 'MISS') + ' ' + r.direction : 'skip(' + r.reason + ')'}`); }
    else { fail++; console.log(`✗ ${gv} ±${tol || '-'} vs ${av} → got ${JSON.stringify({ settleable: r.settleable, hit: r.hit, direction: r.direction, reason: r.reason })}, expected hit=${expHit} dir=${expDir}`); }
  }
  console.log(`earnings-settlement 自测: ${pass} 通过, ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}
