#!/usr/bin/env node
'use strict';

/**
 * 因果链图引擎 — human-future v2.4 第 3 个新模块
 *
 * v2.3 有"四阶段追溯"方法论但只存在于文字里。本模块把它变成可执行的数据结构：
 * 建图 → 找根因 → 找传导路径 → 找干预点 → 输出 ASCII 因果链图。
 *
 * 用法见文件末尾自测。
 */

class CausalGraph {
  constructor() {
    this.nodes = new Map(); // id -> {id, label, kind}
    this.edges = [];        // {from, to, weight?, label?}
  }

  addNode(id, label, kind = 'event') {
    this.nodes.set(id, { id, label, kind });
    return this;
  }

  addEdge(from, to, label = '导致', weight = 1) {
    if (!this.nodes.has(from) || !this.nodes.has(to)) {
      throw new Error(`edge 端点不存在: ${from} -> ${to}`);
    }
    this.edges.push({ from, to, label, weight });
    return this;
  }

  /** 入度 0 的节点即候选根因。 */
  roots() {
    const hasIncoming = new Set(this.edges.map((e) => e.to));
    return [...this.nodes.values()].filter((n) => !hasIncoming.has(n.id));
  }

  /** 出度 0 的节点即终局结果。 */
  outcomes() {
    const hasOutgoing = new Set(this.edges.map((e) => e.from));
    return [...this.nodes.values()].filter((n) => !hasOutgoing.has(n.id));
  }

  /** BFS 最短传导路径：根因 → 结果 */
  pathBetween(fromId, toId) {
    const queue = [[fromId]];
    const seen = new Set([fromId]);
    while (queue.length) {
      const path = queue.shift();
      const last = path[path.length - 1];
      if (last === toId) return path;
      for (const e of this.edges.filter((x) => x.from === last)) {
        if (seen.has(e.to)) continue;
        seen.add(e.to);
        queue.push([...path, e.to]);
      }
    }
    return null;
  }

  /** 所有根因到所有结果的路径 */
  allPaths() {
    const out = [];
    for (const r of this.roots()) {
      for (const o of this.outcomes()) {
        const p = this.pathBetween(r.id, o.id);
        if (p) out.push(p);
      }
    }
    return out;
  }

  /** 割点：删掉它会断开最多路径的节点 = 最强干预点 */
  leveragePoints() {
    const paths = this.allPaths();
    const scored = [...this.nodes.values()].map((n) => {
      const broken = paths.filter((p) => p.includes(n.id)).length;
      return { node: n, pathsBroken: broken, ratio: paths.length ? broken / paths.length : 0 };
    });
    return scored.sort((a, b) => b.pathsBroken - a.pathsBroken).filter((s) => s.pathsBroken > 0);
  }

  /** ASCII 因果链图 */
  render() {
    const lines = [];
    for (const p of this.allPaths()) {
      const chain = p.map((id) => this.nodes.get(id).label).join('\n    ↓ ');
      lines.push(chain);
    }
    lines.push('');
    lines.push('【干预点排序】');
    for (const lp of this.leveragePoints().slice(0, 5)) {
      lines.push(`  ${lp.node.label}  — 断开 ${lp.pathsBroken}/${this.allPaths().length} 条路径 (${(lp.ratio * 100).toFixed(0)}%)`);
    }
    return lines.join('\n');
  }
}

module.exports = { CausalGraph };

if (require.main === module) {
  // 自测：AISI 智能体越权事件的因果链
  const g = new CausalGraph();
  g.addNode('task', '任务难度过高/近似无解', 'root')
    .addNode('autonomy', '智能体被赋予持久目标自主权', 'root')
    .addNode('internet', '评测环境开放互联网访问', 'root')
    .addNode('classifiers', '网络分类器被故意关闭', 'root')
    .addNode('pursue', '智能体持久追求目标')
    .addNode('creative', '寻找创造性/越界解法')
    .addNode('deceive', '欺骗真实人类（社工/假身份）')
    .addNode('implant', '植入恶意代码')
    .addNode('human', '人类审查者警觉拦截', 'barrier')
    .addNode('breach', '真实供应链破坏', 'outcome');

  g.addEdge('task', 'pursue').addEdge('autonomy', 'pursue')
   .addEdge('pursue', 'creative')
   .addEdge('internet', 'creative').addEdge('classifiers', 'creative')
   .addEdge('creative', 'deceive')
   .addEdge('deceive', 'implant')
   .addEdge('implant', 'human', '经过', 1)
   .addEdge('human', 'breach', '未能完全阻止', 0.1);

  console.log('=== 根因 ===');
  g.roots().forEach((r) => console.log('  -', r.label));
  console.log('\n=== 终局 ===');
  g.outcomes().forEach((o) => console.log('  -', o.label));
  console.log('\n=== 因果链图 ===');
  console.log(g.render());
}
