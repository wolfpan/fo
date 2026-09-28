#!/usr/bin/env node
/* 离线校验：golden set 的每个关键字确实存在于对应经文的分块中（无需 API / 数据库）
 * 用法：node zen/test/grounding.cjs   —— 全部通过 exit 0，否则 exit 1 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chunkSutras } = require('../chunker.cjs');

const ROOT = path.join(__dirname, '..', '..');
const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden.json'), 'utf8'));
const sutras = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'sutras.json'), 'utf8'));
const chunks = chunkSutras(sutras);

let fail = 0;
console.log('── golden set 离线 grounding 校验 ──\n');
for (const it of golden.items) {
  const e = it.expect;
  const inSutra = chunks.filter(c => c.sutra_id === e.sutra);
  const hitChunk = inSutra.find(c => e.keywords.some(k => c.text.includes(k)));
  const ok = !!hitChunk;
  if (!ok) fail++;
  console.log(`${ok ? ' ✓' : '✗'} [${e.sutra}] ${it.q}`);
  if (ok) console.log(`    → 《${hitChunk.chapter}》含「${e.keywords.find(k => hitChunk.text.includes(k))}」`);
  else console.log(`    → 在 ${e.sutra} 全部分块中未找到 ${JSON.stringify(e.keywords)}`);
}
console.log(`\n${golden.items.length - fail}/${golden.items.length} 通过`);
process.exit(fail ? 1 : 0);
