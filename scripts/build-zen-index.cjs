#!/usr/bin/env node
/* 般若藏 · AI说禅 —— M1 建库脚本
 * 用法：
 *   node scripts/build-zen-index.cjs --dry   离线试跑：只分块、打印统计，不调 API / 不连库
 *   node scripts/build-zen-index.cjs         正式建库：切块 → BGE-M3 批量嵌入 → 灌 Neon（幂等，全量重建静态表）
 * 前置：zen/config.json 已填写（见 zen/config.example.json）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chunkSutras, chunkResearch } = require('../zen/chunker.cjs');

const DRY = process.argv.includes('--dry');
const ROOT = path.join(__dirname, '..');

/* ---------- 1. 收集待嵌入语料 ---------- */
function collect() {
  // ① 经文块
  const sutras = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'sutras.json'), 'utf8'));
  const sutraChunks = chunkSutras(sutras);

  // ② 人格知识：模型卡 + fewshot + research 源料
  const personaRows = [];
  const cardDir = path.join(ROOT, 'zen', 'compile', 'model-cards');
  for (const f of fs.readdirSync(cardDir).filter(f => f.endsWith('.md')).sort()) {
    const raw = fs.readFileSync(path.join(cardDir, f), 'utf8');
    const fm = raw.match(/^---\n([\s\S]*?)\n---\n/);
    let topic = [];
    if (fm) { const t = fm[1].match(/tags:\s*\[(.*)\]/); if (t) topic = t[1].split(',').map(x => x.trim()).filter(Boolean); }
    personaRows.push({
      kind: 'model-card', topic,
      text: raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim(),
      source: `zen/compile/model-cards/${f}`,
      embed_text: raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim(),
    });
  }
  const fs2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'zen', 'compile', 'fewshot.json'), 'utf8'));
  for (const p of fs2.pairs) {
    personaRows.push({
      kind: 'fewshot', topic: p.scene,
      text: `问：${p.q_modern}\n答：${p.a}`,
      source: `${p.source}（${p.id}）`,
      embed_text: p.q_modern, // 只嵌问题侧：运行时按用户问题匹配相似问答
    });
  }
  const rdir = path.join(ROOT, 'zen', 'sources', 'research');
  let researchCount = 0;
  if (fs.existsSync(rdir)) {
    for (const f of fs.readdirSync(rdir).filter(f => f.endsWith('.md')).sort()) {
      const rows = chunkResearch(fs.readFileSync(path.join(rdir, f), 'utf8'), `zen/sources/research/${f}`);
      researchCount += rows.length;
      for (const r of rows) personaRows.push({ ...r, embed_text: r.text });
    }
  }
  return { sutraChunks, personaRows, researchCount };
}

/* ---------- 2. 主流程 ---------- */
(async () => {
  const { sutraChunks, personaRows, researchCount } = collect();
  const chars = sutraChunks.reduce((a, c) => a + c.text.length, 0);
  console.log('── 分块统计 ──');
  console.log(`经文块: ${sutraChunks.length} 块 / ${chars} 字`);
  const bySutra = {};
  sutraChunks.forEach(c => bySutra[c.sutra_id] = (bySutra[c.sutra_id] || 0) + 1);
  console.log('  ' + Object.entries(bySutra).map(([k, v]) => `${k}:${v}`).join('  '));
  console.log(`人格知识: ${personaRows.length} 行（模型卡 + fewshot + research ${researchCount} 块）`);
  const lens = sutraChunks.map(c => c.text.length);
  console.log(`  经文块长度 min/avg/max: ${Math.min(...lens)}/${Math.round(lens.reduce((a, b) => a + b, 0) / lens.length)}/${Math.max(...lens)}`);

  if (DRY) { console.log('\n--dry 结束：未调用任何 API，未连接数据库。'); return; }

  const { getConfig, ensureSchema, pool, vec } = require('../zen/db.cjs');
  const { embedAll } = require('../zen/embed.cjs');
  getConfig(); // 尽早失败：配置不全直接报
  await ensureSchema();

  // 嵌入（幂等：静态表全量重建）
  console.log('\n── 嵌入经文块 ──');
  const sVecs = await embedAll(sutraChunks.map(c => c.text));
  console.log('── 嵌入人格知识 ──');
  const pVecs = await embedAll(personaRows.map(r => r.embed_text));

  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM sutra_chunks'); await client.query('DELETE FROM persona_kb');
    for (let i = 0; i < sutraChunks.length; i++) {
      const c = sutraChunks[i];
      await client.query(
        `INSERT INTO sutra_chunks (sutra_id, chapter, chapter_idx, para_idx, text, tags, embedding)
         VALUES ($1,$2,$3,$4,$5,$6,$7::vector)`,
        [c.sutra_id, c.chapter, c.chapter_idx, c.para_idx, c.text, c.tags, vec(sVecs[i])]);
    }
    for (let i = 0; i < personaRows.length; i++) {
      const r = personaRows[i];
      await client.query(
        `INSERT INTO persona_kb (kind, topic, text, source, embedding)
         VALUES ($1,$2,$3,$4,$5::vector)`,
        [r.kind, r.topic, r.text, r.source, vec(pVecs[i])]);
    }
    await client.query('COMMIT');
    console.log(`\n✓ 建库完成：sutra_chunks=${sutraChunks.length}，persona_kb=${personaRows.length}`);
  } catch (e) {
    await client.query('ROLLBACK'); throw e;
  } finally { client.release(); await pool().end(); }
})().catch(e => { console.error('\n✗ 建库失败：', e.message); process.exit(1); });
