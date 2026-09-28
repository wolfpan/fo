#!/usr/bin/env node
/* M2 验收：写入 → 透明查看 → 二次来访承接 → 焚簿无残留
 * 前置：服务已启动（默认 http://localhost:3000）
 * 用法：node zen/test/m2-flow.cjs [baseUrl] */
'use strict';
const BASE = process.argv[2] || 'http://localhost:3000';
const crypto = require('crypto');
const userId = crypto.randomUUID();

async function chat(message, history = []) {
  const res = await fetch(BASE + '/api/zen/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: userId, message, history, remember: true }),
  });
  if (!res.ok) throw new Error(`chat HTTP ${res.status}`);
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '', out = { text: '', huatou: null, cited: [] };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n\n'); buf = parts.pop();
    for (const part of parts) {
      let ev = '', data = '';
      for (const line of part.split('\n')) {
        if (line.startsWith('event: ')) ev = line.slice(7).trim();
        else if (line.startsWith('data: ')) data += line.slice(6);
      }
      if (!data) continue;
      try {
        const j = JSON.parse(data);
        if (ev === 'token') out.text += j.delta;
        if (ev === 'huatou') out.huatou = j.huatou;
        if (ev === 'cited') out.cited = j.citations;
      } catch { }
    }
  }
  return out;
}
const getBook = async () => (await (await fetch(`${BASE}/api/zen/memory/${userId}`)).json());
const burn = async () => (await (await fetch(`${BASE}/api/zen/memory/${userId}`, { method: 'DELETE' })).json());

(async () => {
  let pass = 0, fail = 0;
  const ok = (cond, name, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? ' ✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); };

  // ① 首番问（记忆开）
  console.log('── ① 首番问 ──');
  const r1 = await chat('打坐的时候杂念特别多，越压越多，怎么办？');
  console.log('答（节选）:', r1.text.slice(0, 60).replace(/\n/g, ' '), '…');
  ok(r1.text.length > 20, '首轮作答');
  ok(!!r1.huatou, 'SSE 推送话头', `「${r1.huatou}」`);

  // ② 落簿与透明
  console.log('── ② 参学簿落笔 ──');
  const book1 = await getBook();
  const kinds = new Set(book1.rows.map(r => r.kind));
  ok(kinds.has('huatou'), '话头入簿');
  ok(kinds.has('profile'), '画像入簿');
  ok(kinds.has('qa-summary'), '问答摘要入簿');
  book1.rows.forEach(r => console.log(`   [${r.label}] ${r.text}`));

  // ③ 二次来访（新会话、无 history、同人）——看是否承接
  console.log('── ③ 二次来访（同无记名帖、新会话）──');
  const r2 = await chat('道理我懂了，可心里还是乱。');
  console.log('答全文:', r2.text.replace(/\n/g, ' ⏎ '));
  const book2 = await getBook();
  ok(book2.rows.length >= book1.rows.length, '簿持续更新', `（${book1.rows.length} → ${book2.rows.length} 笔）`);

  // ④ 焚簿
  console.log('── ④ 焚簿 ──');
  const b = await burn();
  ok(b.ok && b.deleted >= 3, '焚簿删除', `删 ${b.deleted} 笔`);
  const book3 = await getBook();
  ok(book3.rows.length === 0, '焚后无残留');

  console.log(`\nM2 验收：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('M2 流程失败：', e.message); process.exit(2); });
