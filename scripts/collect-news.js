#!/usr/bin/env node
'use strict';

/**
 * 多维度数据采集脚本
 * 使用知识库数据，无需实时网络请求
 */

const fs = require('fs');
const path = require('path');

/**
 * 从知识库加载数据
 */
function loadFromKnowledgeBase() {
  const kbPath = path.join(__dirname, '..', 'data', 'knowledge-base.md');

  if (!fs.existsSync(kbPath)) {
    throw new Error('知识库文件不存在: ' + kbPath);
  }

  const kbContent = fs.readFileSync(kbPath, 'utf-8');

  return {
    tech: {
      domain: 'tech',
      name: '科技',
      news: [{ source: 'knowledge-base', content: kbContent }]
    },
    humanities: {
      domain: 'humanities',
      name: '人文',
      news: [{ source: 'knowledge-base', content: kbContent }]
    },
    psychology: {
      domain: 'psychology',
      name: '心理',
      news: [{ source: 'knowledge-base', content: kbContent }]
    },
    philosophy: {
      domain: 'philosophy',
      name: '哲学',
      news: [{ source: 'knowledge-base', content: kbContent }]
    }
  };
}

/**
 * 采集所有维度的数据
 */
async function collectAll() {
  console.log('🚀 从知识库加载多维度数据...\n');

  const results = loadFromKnowledgeBase();

  console.log('✅ 数据加载完成\n');
  console.log('📊 数据统计:');
  for (const [domain, data] of Object.entries(results)) {
    console.log(`  ${data.name}: ${data.news.length} 条数据`);
  }

  return results;
}

/**
 * 主函数
 */
async function main() {
  try {
    const results = await collectAll();
    console.log('\n📈 数据采集完成');
    return results;
  } catch (e) {
    console.error('❌ 采集失败:', e.message);
    process.exit(1);
  }
}

// 如果直接运行
if (require.main === module) {
  main();
}

module.exports = { collectAll, loadFromKnowledgeBase };
