#!/usr/bin/env node
/* 在线验收：golden set recall@K（需 zen/config.json 已填写、库已建好）
 * 用法：node zen/test/recall.cjs [K] [--raw]
 *   默认走运行时链路（查询改写 + 混合检索 + RRF），与线上 chat 完全一致 —— 验收口径
 *   --raw 只用原句嵌入，考察无改写的检索底子（诊断用）
 * 命中判据：top-K 内存在 sutra 匹配 且（chapter_idx 相同 或 文本含任一关键字） */
'use strict';
const fs = require('fs');
const path = require('path');
const { retrieve } = require('../retrieve.cjs');
const { rewriteQuery } = require('../providers.cjs');

const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden.json'), 'utf8'));
const argv = process.argv.slice(2);
const K = +(argv.find(a => /^\d+$/.test(a)) || 5);
const RAW = argv.includes('--raw');

(async () => {
  let hit = 0;
  for (const it of golden.items) {
    const variants = RAW ? [it.q] : await rewriteQuery(it.q);
    const r = await retrieve(variants, { sutra_take: K + 3 }); // 候选略宽于评估窗口
    const top = r.sutras.slice(0, K);
    const expectSutras = [].concat(it.expect.sutra); // 支持单经或数组（多经等价开示）
    const okRow = top.find(c => expectSutras.includes(c.sutra_id) &&
      (c.chapter_idx === it.expect.chapter_idx || it.expect.keywords.some(k => c.text.includes(k))));
    if (okRow) hit++;
    else console.log(`✗ ${it.q}\n    检索到: ${top.map(c => `${c.sutra_id}/${c.chapter}`).join(' | ') || '（空）'}`);
  }
  const rate = (hit / golden.items.length * 100).toFixed(1);
  console.log(`\n[${RAW ? 'raw 原句' : 'runtime 改写链路'}] recall@${K}: ${hit}/${golden.items.length} = ${rate}%  （验收线 ≥ 80%）`);
  process.exit(rate >= 80 ? 0 : 1);
})().catch(e => { console.error('recall 测试失败：', e.message); process.exit(2); });
