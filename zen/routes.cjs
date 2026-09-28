/* 般若藏 · AI说禅 —— /api/zen 路由
 * POST /api/zen/chat   SSE：cited（经证卡片先推）→ token（正文增量）→ done
 * GET  /api/zen/status 健康检查（配置齐备性 + 库内计数）
 * GET  /api/zen/search 调试检索（?q=白话问题，走完整改写+混合检索）
 */
'use strict';
const express = require('express');
const { getConfig, ensureSchema, counts, warm, q } = require('./db.cjs');
const { retrieve, retrieveChat, toCitations } = require('./retrieve.cjs');
const { rewriteQuery, chatStream, chatOnce } = require('./providers.cjs');
const { buildMessages, kernel } = require('./persona.cjs');
const { UUID_RE, readMemory, recallSummariesVec, extractAndWrite, getBook, burn } = require('./memory.cjs');

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
  // 记忆由端上「记」钮决定（默认开，访客可关）：仅显式 remember 且无记名帖合法时读写参学簿
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

    // ① 检索与记忆并行：池预热即发射；词典/引号变体先开跑，LLM 改写限时合流（retrieveChat）
    send('stage', { stage: 'seek', text: '翻检经卷' }); // 真实进度：检索阶段开始
    warm();
    const memBaseP = remember ? readMemory(sessionId).catch(() => null) : Promise.resolve(null);
    const r = await retrieveChat(message);
    const citations = toCitations(r.sutras);
    if (citations.length) send('cited', { citations }); // 卡片先推，前端先渲染

    // ①′ 参学簿：画像+话头已在检索期间并行读好；摘要召回复用检索算好的原句向量
    let memory = null;
    if (remember) {
      const base = await memBaseP;
      if (base && (base.huatou || base.profile)) {
        const recalls = r.qvec ? await recallSummariesVec(sessionId, r.qvec).catch(() => []) : []; // 嵌入降级时无向量，跳过
        memory = { ...base, recalls };
      }
    }

    // ② 组装 prompt（缓存稳定顺序）并流式作答
    send('stage', { stage: 'compose', text: '落墨' }); // 检索完毕，模型开始作答
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

/* ---------- M3 · 当机 / 埋点 / 报表 ---------- */

/* 当机：回访者点亮灯，影先开口（承接旧话头）。无记忆则交由前端用默认问候。 */
router.post('/open', async (req, res) => {
  const sessionId = String(req.body.sessionId || '');
  if (!UUID_RE.test(sessionId)) return res.status(400).json({ error: 'invalid sessionId' });
  try {
    await schemaOnce();
    const base = await readMemory(sessionId);
    if (!base.huatou && !base.profile) return res.json({ text: null });
    let system = kernel();
    system += `\n\n【参学簿】\n${base.profile || ''}\n${base.huatou ? '未参完的话头：' + base.huatou : ''}`;
    system += '\n\n（系统：善知识点亮了灯，坐到你对面。灯下重逢，你先开口——只说一句，12~40字，'
      + '自然承接旧话头或旧事（如「上回你问X，可曾参得」或依其所困相唤），仍是你的口吻。'
      + '不说开场声明，不问安，不堆客套。）';
    const text = (await chatOnce({
      system, user: '（善知识点亮了灯，静静望着你。）', maxTokens: 120, temperature: 0.9,
    })).trim();
    res.json({ text: text || null, huatou: base.huatou || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* 埋点：聊→读转化与站点指标（白名单类型；meta 仅存章节级信息，无对话内容） */
const EVENT_TYPES = new Set(['chat_ask', 'cited', 'cited_click', 'dangji_open']);
router.post('/event', async (req, res) => {
  const sessionId = String(req.body.sessionId || '');
  const type = String(req.body.type || '');
  if (!type || !EVENT_TYPES.has(type)) return res.status(400).json({ error: 'bad type' });
  const meta = req.body.meta && typeof req.body.meta === 'object' ? req.body.meta : {};
  try {
    await schemaOnce();
    await q('INSERT INTO zen_events (user_id, type, meta) VALUES ($1,$2,$3)',
      [UUID_RE.test(sessionId) ? sessionId : null, type, JSON.stringify(meta)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* 报表：聊→读转化与热点章节（站点聚合，无个人内容） */
router.get('/stats', async (req, res) => {
  try {
    await schemaOnce();
    const agg = (await q(`
      SELECT count(*) FILTER (WHERE type='chat_ask')   AS asks,
             count(*) FILTER (WHERE type='cited')      AS cited_asks,
             count(*) FILTER (WHERE type='cited_click') AS clicks,
             count(*) FILTER (WHERE type='dangji_open') AS dangji,
             count(DISTINCT user_id) FILTER (WHERE type='chat_ask') AS users
      FROM zen_events`)).rows[0];
    const top = (await q(`
      SELECT meta->>'sutra' AS sutra, meta->>'chapter' AS chapter, count(*) AS n
      FROM zen_events WHERE type='cited_click'
      GROUP BY 1,2 ORDER BY n DESC LIMIT 5`)).rows;
    const toInt = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +v]));
    const a = toInt(agg);
    res.json({
      ok: true,
      asks: a.asks, users: a.users, dangji: a.dangji,
      cited_rate: a.asks ? +(a.cited_asks / a.asks).toFixed(3) : 0,          // 引出经证的比例
      read_rate: a.cited_asks ? +(a.clicks / a.cited_asks).toFixed(3) : 0,   // 聊→读转化（核心指标）
      top_chapters: top,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;