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

const NUM_UNIT_RE = /\$?\s?([\d.,]+)\s*(billion|million|bn|tn|trillion|%|basis points|bps)?/i;
const SCALE = { billion: 1e9, bn: 1e9, million: 1e6, tn: 1e12, trillion: 1e12 };

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
 * 支持 "between $197.0 billion and $202.0 billion" 与 "52.1% to 53.1%"。
 */
function parseRange(str) {
  const s = String(str || '');
  const mDollar = s.match(/between\s+\$?\s?([\d.,]+)\s*(billion|million)?\s+and\s+\$?\s?([\d.,]+)\s*(billion|million)?/i);
  if (mDollar) {
    const scale = (u) => (u && SCALE[u.toLowerCase()]) || 1e9; // 营收区间默认 billion
    return { lo: Number(mDollar[1].replace(/,/g, '')) * scale(mDollar[2]),
      hi: Number(mDollar[3].replace(/,/g, '')) * scale(mDollar[4]), unit: 'usd' };
  }
  const mPct = s.match(/([\d.]+)\s*%\s*(?:to|and|-|–)\s*([\d.]+)\s*%/i);
  if (mPct) return { lo: Number(mPct[1]), hi: Number(mPct[2]), unit: 'pct' };
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
 * 只归一本引擎实际会结算的两个指标族；其余原样返回（配不上就不结算，不硬凑）。
 */
function normalizeMetric(m) {
  const s = String(m || '').toLowerCase().trim();
  if (/gross\s+margin/.test(s)) return 'gross margin';
  if (/(net\s+|total\s+)?(revenue|revenues|sales)/.test(s)) return 'revenue';
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
