/* 般若藏 · AI说禅 —— /api/zen 路由
 * POST /api/zen/chat   SSE：cited（经证卡片先推）→ token（正文增量）→ done
 * GET  /api/zen/status 健康检查（配置齐备性 + 库内计数）
 * GET  /api/zen/search 调试检索（?q=白话问题，走完整改写+混合检索）
 */
'use strict';
const express = require('express');
const { getConfig, ensureSchema, counts } = require('./db.cjs');
const { retrieve, toCitations } = require('./retrieve.cjs');
const { rewriteQuery, chatStream } = require('./providers.cjs');
const { buildMessages } = require('./persona.cjs');
const { UUID_RE, readMemory, recallSummaries, extractAndWrite, getBook, burn } = require('./memory.cjs');

const router = express.Router();
let _schemaReady = null;
const schemaOnce = () => (_schemaReady ||= ensureSchema().catch(e => { _schemaReady = null; throw e; }));

router.get('/status', async (req, res) => {
  try {
    const cfg = getConfig();
    await schemaOnce();
    const c = await counts();
    res.json({ ok: true, model: cfg.llm.model, embedding: cfg.embedding.model, counts: c });
  } catch (e) {
    res.status(503).json({ ok: false, message: e.message });
  }
});

router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'missing q' });
    const variants = await rewriteQuery(q);
    const t0 = Date.now();
    const r = await retrieve(variants);
    res.json({ q, variants, ms: Date.now() - t0, sutras: toCitations(r.sutras), persona: r.persona });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/chat', async (req, res) => {
  const sessionId = String(req.body.sessionId || '').slice(0, 64);
  const message = String(req.body.message || '').trim().slice(0, 500);
  const history = Array.isArray(req.body.history) ? req.body.history : [];
  const first = !history.length;
  // 记忆默认关闭：仅显式 remember 且无记名帖合法时读写参学簿
  const remember = req.body.remember === true && UUID_RE.test(sessionId);
  if (!message) return res.status(400).json({ error: 'missing message' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    await schemaOnce();

    // ① 检索（改写 → 嵌入 → 混合检索）
    const variants = await rewriteQuery(message);
    const r = await retrieve(variants);
    const citations = toCitations(r.sutras);
    if (citations.length) send('cited', { citations }); // 卡片先推，前端先渲染

    // ①′ 参学簿（remember 开启时）：画像+话头必带，历史摘要语义召回
    let memory = null;
    if (remember) {
      try {
        const base = await readMemory(sessionId);
        const recalls = await recallSummaries(sessionId, message).catch(() => []);
        memory = { ...base, recalls };
      } catch (e) { /* 记忆读取失败不阻断对话 */ }
    }

    // ② 组装 prompt（缓存稳定顺序）并流式作答
    const messages = buildMessages({ first, citations, persona: r.persona, history, memory, question: message });
    let answer = '';
    await chatStream({
      messages,
      onDelta: delta => { answer += delta; send('token', { delta }); },
    });
    send('done', {});

    // ③ 落簿（异步提取，成功则推送话头回显；失败静默）
    if (remember) {
      try {
        const row = await extractAndWrite({ userId: sessionId, question: message, answer });
        if (row && row.huatou) send('huatou', { huatou: row.huatou });
      } catch { /* 下轮再记 */ }
    }
  } catch (e) {
    send('error', { message: e.message });
  } finally {
    res.end();
  }
});

/* 参学簿：透明查看 */
router.get('/memory/:id', async (req, res) => {
  const id = String(req.params.id || '');
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'invalid id' });
  try { res.json({ ok: true, rows: await getBook(id) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* 焚簿：全删无残留 */
router.delete('/memory/:id', async (req, res) => {
  const id = String(req.params.id || '');
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'invalid id' });
  try { const deleted = await burn(id); res.json({ ok: true, deleted }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
