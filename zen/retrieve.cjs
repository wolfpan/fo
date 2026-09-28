/* 般若藏 · AI说禅 —— 混合检索层（稠密 + 字面，RRF 融合） */
'use strict';
const { pool, q, vec } = require('./db.cjs');
const { embedOne } = require('./embed.cjs');
const { getConfig } = require('./db.cjs');

const K = 60; // RRF 常数

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

/**
 * 混合检索入口。
 * @param variants string[]  查询变体（原句 + 改写）
 * @param opts.sutra_take    经证融合取数上限（默认 config.sutra_top_k，运行时注入用 2）
 * @param opts.persona_take  人格知识取数上限
 * @returns { sutras, persona }  融合后的经证块与人格知识
 */
async function retrieve(variants, opts = {}) {
  const cfg = getConfig().retrieval || {};
  const topK = opts.sutra_take || cfg.sutra_top_k || 2;
  const personaK = opts.persona_take || cfg.persona_top_k || 2;
  const minScore = cfg.min_score ?? 0.25;

  const denseLists = [], lexiLists = [], personaLists = [];
  for (const q of variants) {
    const qvec = await embedOne(q);
    denseLists.push({ rows: await denseSutras(qvec, topK * 4, minScore) });
    if (cfg.lexical !== false) lexiLists.push({ rows: await lexicalSutras(q, 4), weight: 3 });
    personaLists.push({ rows: await densePersona(qvec, personaK * 3) });
  }
  return {
    sutras: rrfFuse(denseLists.concat(lexiLists), topK, 2),      // 每经最多 2 块，防楞伽垄断
    persona: rrfFuse(personaLists, personaK, 0),
  };
}

/** 经证块 → prompt 注入文本 + 前端卡片（含阅读页深链） */
function toCitations(chunks) {
  const names = { xinjing: '般若波罗蜜多心经', jingang: '金刚般若波罗蜜经', tanjing: '六祖大师法宝坛经', lengqie: '楞伽阿跋多罗宝经' };
  return chunks.map(c => ({
    sutra_id: c.sutra_id,
    sutra_title: names[c.sutra_id] || c.sutra_id,
    chapter: c.chapter,
    chapter_idx: c.chapter_idx,
    text: c.text.length > 160 ? c.text.slice(0, 160) + '……' : c.text,
    link: `/read/${c.sutra_id}#c${c.chapter_idx}`,
  }));
}

function citationsForPrompt(cards) {
  if (!cards.length) return '';
  return cards.map(c => `《${c.sutra_title}·${c.chapter}》：\n「${c.text}」`).join('\n');
}

module.exports = { retrieve, toCitations, citationsForPrompt };
