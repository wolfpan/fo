/* 般若藏 · AI说禅 —— 混合检索层（稠密 + 字面，RRF 融合）
 * 延迟设计：变体一次批量嵌入、三路查询全并行；
 * 聊天链路 retrieveChat 让词典/引号变体先行开跑，LLM 改写并行限时合流。 */
'use strict';
const { pool, q, vec } = require('./db.cjs');
const { embedOne } = require('./embed.cjs');
const { getConfig } = require('./db.cjs');
const { dictTerms, extractQuotes, llmVariants } = require('./providers.cjs');

const K = 60; // RRF 常数
const REWRITE_TIMEOUT_MS = 2500; // LLM 改写超过此限时即弃用其变体（词典/引号已兜底）

function rrfFuse(resultLists, take, maxPerGroup = 0) {
  // resultLists: [{ rows, weight? }]；按文本前缀去重后加权 RRF 计分。
  // 字面精确命中（weight=3）必须压过多变体稠密噪声——引经场景宁可精确，不可语义近似。
  const score = new Map();
  for (const { rows, weight = 1 } of resultLists) {
    rows.forEach((r, rank) => {
      const id = `${r.sutra_id}|${r.chapter_idx}|${(r.text || '').slice(0, 24)}`;
      const cur = score.get(id) || { row: r, s: 0 };
      cur.s += weight / (K + rank + 1);
      score.set(id, cur);
    });
  }
  const sorted = [...score.values()].sort((a, b) => b.s - a.s);
  if (!maxPerGroup) return sorted.slice(0, take).map(x => ({ ...x.row, rrf: x.s }));
  const cnt = new Map(), out = [];
  for (const x of sorted) {
    const g = x.row.sutra_id || '_';
    if (x.row.lex) { out.push({ ...x.row, rrf: x.s }); continue; } // 字面精确命中不占经名额、不设限
    if ((cnt.get(g) || 0) >= maxPerGroup) continue;
    cnt.set(g, (cnt.get(g) || 0) + 1);
    out.push({ ...x.row, rrf: x.s });
    if (out.length >= take) break;
  }
  return out;
}

async function denseSutras(qvec, k, minScore) {
  const r = await q(
    `SELECT id, sutra_id, chapter, chapter_idx, text, 1 - (embedding <=> $1) AS score
     FROM sutra_chunks WHERE 1 - (embedding <=> $1) > $3
     ORDER BY embedding <=> $1 LIMIT $2`, [vec(qvec), k, minScore]);
  return r.rows;
}

async function lexicalSutras(query, k) {
  // 去标点后匹配：经文含「应无所住，而生其心」类句内标点，全串 ILIKE 会被打断；
  // 故同时匹配原文与去标点文本（库仅 256 块，正则全扫无压力）
  const clean = query.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, '');
  if (clean.length < 3) return [];
  const r = await q(
    `SELECT id, sutra_id, chapter, chapter_idx, text, 0.5 AS score, 1 AS lex
     FROM sutra_chunks
     WHERE text ILIKE '%' || $1 || '%'
        OR regexp_replace(text, '[^一-龥A-Za-z0-9]', '', 'g') LIKE '%' || $1 || '%'
     ORDER BY id LIMIT $2`, [clean, k]); // ORDER BY id：入库序即 xinjing→jingang→tanjing→lengqie，短经优先入选
  return r.rows;
}

async function densePersona(qvec, k) {
  const r = await q(
    `SELECT id, kind, topic, text, source, 1 - (embedding <=> $1) AS score
     FROM persona_kb ORDER BY embedding <=> $1 LIMIT $2`, [vec(qvec), k]);
  return r.rows;
}

/** 收集：稠密只嵌 denseVariants（并行单条——OpenRouter 批量嵌入劣化，禁用批量）；
 *  lexicalVariants 走字面通道不嵌入（词典/引号本就是语料原短语，精确匹配优于语义）。 */
async function collect(denseVariants, lexicalVariants) {
  const cfg = getConfig().retrieval || {};
  const personaK = (cfg.persona_top_k || 2) * 3;
  const denseK = (cfg.sutra_top_k || 2) * 4;
  const minScore = cfg.min_score ?? 0.25;
  const doLex = cfg.lexical !== false;

  // 稠密段：嵌入失败（限流/网络）→ 降级空列表，由字面通道兜底，不废整轮对话
  const densePart = (async () => {
    try {
      const vecs = await Promise.all(denseVariants.map(v => embedOne(v)));
      const [denseRows, personaRows] = await Promise.all([
        Promise.all(vecs.map(qv => denseSutras(qv, denseK, minScore))),
        Promise.all(vecs.map(qv => densePersona(qv, personaK))),
      ]);
      return { vecs, denseLists: denseRows.map(rows => ({ rows })), personaLists: personaRows.map(rows => ({ rows })) };
    } catch {
      return { vecs: [], denseLists: [], personaLists: [] };
    }
  })();

  const lexP = doLex && lexicalVariants.length
    ? Promise.all(lexicalVariants.map(v => lexicalSutras(v, 4).catch(() => [])))
    : Promise.resolve([]);

  const [dense, lexResults] = await Promise.all([densePart, lexP]);
  return {
    ...dense,
    lexiLists: lexResults.filter(rows => rows.length).map(rows => ({ rows, weight: 3 })),
  };
}

/** 融合（与收集分离，供两阶段结果合并后统一融合） */
function fuse({ denseLists, lexiLists = [], personaLists = [] }, opts = {}) {
  const cfg = getConfig().retrieval || {};
  return {
    sutras: rrfFuse(denseLists.concat(lexiLists), opts.sutra_take || cfg.sutra_top_k || 2, 2), // 每经最多 2 块，防楞伽垄断
    persona: rrfFuse(personaLists, opts.persona_take || cfg.persona_top_k || 2, 0),
  };
}

/** 标准检索（改写已完成的全量变体；recall 测试与 /search 用，稠密+字面全开） */
async function retrieve(variants, opts = {}) {
  return fuse(await collect(variants, variants), opts);
}

/**
 * 聊天链路检索（首字延迟优先）：
 * - 稠密只嵌原句（1 次嵌入），词典/引号变体只走字面通道（零嵌入）；
 * - LLM 改写并行限时合流，其变体也只并入字面通道——OpenRouter 嵌入单次 ~2.5s，
 *   为 LLM 变体追加语义检索要多花一倍嵌入时间，实测增益不值（golden 24/24 仍满分）；
 * - 返回 qvec（原句向量）供记忆召回复用。
 */
async function retrieveChat(message, opts = {}) {
  const lexVars = [...new Set([message, ...extractQuotes(message), ...dictTerms(message)])];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const baseP = collect([message], lexVars); // 与 LLM 改写同时开跑
  const llm = await Promise.race([llmVariants(message), sleep(REWRITE_TIMEOUT_MS).then(() => [])]);
  let lists = await baseP;

  const extraLex = [...new Set(llm)].filter(v => !lexVars.includes(v)).slice(0, 2);
  if (extraLex.length) {
    const rows = await Promise.all(extraLex.map(v => lexicalSutras(v, 4)));
    lists = {
      ...lists,
      lexiLists: lists.lexiLists.concat(rows.filter(r => r.length).map(r => ({ rows: r, weight: 3 }))),
    };
  }
  return { ...fuse(lists, opts), qvec: lists.vecs[0] };
}

/** 经证块 → prompt 注入文本 + 前端卡片（含阅读页深链） */
function toCitations(chunks) {
  const names = { xinjing: '般若波罗蜜多心经', jingang: '金刚般若波罗蜜经', tanjing: '六祖大师法宝坛经', lengqie: '楞伽阿跋多罗宝经' };
  return chunks.map(c => ({
    sutra_id: c.sutra_id,
    sutra_title: names[c.sutra_id] || c.sutra_id,
    chapter: c.chapter,
    chapter_idx: c.chapter_idx,
    text: (c.text || '').replace(/^[。！？；：、」』）)\s　]+/, '').slice(0, 160) || c.text,
    link: `/read/${c.sutra_id}#c${c.chapter_idx}`,
  }));
}

function citationsForPrompt(cards) {
  if (!cards.length) return '';
  return cards.map(c => `《${c.sutra_title}·${c.chapter}》：\n「${c.text}」`).join('\n');
}

module.exports = { retrieve, retrieveChat, toCitations, citationsForPrompt };
