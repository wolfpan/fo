/* 般若藏 · AI说禅 —— M2 参学簿（zen_memory 读写）
 * 形态：huatou / profile 各留一行（最新覆盖），qa-summary 追加（上限蒸馏）；
 * 隐私：默认关闭，仅 remember=true 时读写；焚簿 = 全删，无残留。 */
'use strict';
const { pool, q, vec } = require('./db.cjs');
const { embedOne } = require('./embed.cjs');
const { chatOnce } = require('./providers.cjs');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SUMMARIES = 30;   // 每位善知识的问答摘要上限，超限蒸馏合并最旧两条
const RECALL_K = 2;         // 每轮语义召回的历史摘要条数

const EXTRACT_SYS = `你是参学簿的记录僧。根据「本番问答」与「现有簿记」，只输出严格 JSON（无解释、无代码块）：
{"huatou":"…","profile":"…","summary":"…"}
- huatou：此番留给来客参究的话头，20字内，以问句为佳；本番无新话头则沿用旧值。
- profile：来客一行画像，40字内（第几番来问、所困何事、根器倾向），基于旧画像增删改写，不堆砌。
- summary：本番问答摘要，60字内，只记要点，供日后召回。`;

/** 读画像与话头（必带项） */
async function readMemory(userId) {
  const r = await q(
    `SELECT kind, text FROM zen_memory
     WHERE user_id = $1 AND kind IN ('huatou','profile')
     ORDER BY kind, ts DESC`, [userId]);
  const get = kind => { const row = r.rows.find(x => x.kind === kind); return row ? row.text : null; };
  return { huatou: get('huatou'), profile: get('profile') };
}

/** 按向量召回历史问答摘要（聊天链路复用检索阶段已算好的原句向量，免重复嵌入） */
async function recallSummariesVec(userId, qvec) {
  const r = await q(
    `SELECT text FROM zen_memory
     WHERE user_id = $1 AND kind = 'qa-summary'
     ORDER BY embedding <=> $2 LIMIT $3`, [userId, Array.isArray(qvec) ? vec(qvec) : qvec, RECALL_K]);
  return r.rows.map(x => x.text);
}

/** 按问题文本召回（独立调用方使用；内部自带一次嵌入） */
async function recallSummaries(userId, question) {
  return recallSummariesVec(userId, await embedOne(question));
}

/** 本轮答毕后异步落簿：LLM 提取 {huatou, profile, summary} → upsert + 追加 */
async function extractAndWrite({ userId, question, answer }) {
  const { huatou, profile } = await readMemory(userId);
  const book = [profile && `旧画像：${profile}`, huatou && `旧话头：${huatou}`].filter(Boolean).join('\n') || '（无，首番）';
  const raw = await chatOnce({
    system: EXTRACT_SYS,
    user: `现有簿记：\n${book}\n\n本番问答：\n问：${question}\n答：${answer.slice(0, 500)}`,
    maxTokens: 300, temperature: 0.2,
  });
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  const j = JSON.parse(m[0]);
  const row = {
    huatou: String(j.huatou || huatou || '').slice(0, 40).trim(),
    profile: String(j.profile || profile || '').slice(0, 60).trim(),
    summary: String(j.summary || '').slice(0, 90).trim(),
  };
  if (!row.huatou && !row.profile && !row.summary) return null;

  // huatou / profile：覆盖式（各自只留最新一行）
  for (const kind of ['huatou', 'profile']) {
    if (!row[kind]) continue;
    const emb = vec(await embedOne(row[kind]));
    const client = await pool().connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM zen_memory WHERE user_id=$1 AND kind=$2', [userId, kind]);
      await client.query('INSERT INTO zen_memory (user_id, kind, text, embedding) VALUES ($1,$2,$3,$4::vector)', [userId, kind, row[kind], emb]);
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }
  // qa-summary：追加 + 上限蒸馏
  if (row.summary) {
    const emb = vec(await embedOne(row.summary));
    await q('INSERT INTO zen_memory (user_id, kind, text, embedding) VALUES ($1,$2,$3,$4::vector)', [userId, 'qa-summary', row.summary, emb]);
    await distill(userId);
  }
  return row;
}

/** 蒸馏：qa-summary 超上限时，把最旧两条合并为一条（LLM 合并，失败则删最旧） */
async function distill(userId) {
  const r = await q(
    `SELECT id, text FROM zen_memory WHERE user_id=$1 AND kind='qa-summary' ORDER BY ts ASC`, [userId]);
  if (r.rows.length <= MAX_SUMMARIES) return;
  const [a, b] = r.rows;
  let merged;
  try {
    merged = (await chatOnce({
      system: '把两条参问摘要合并为一条，60字内，只留要点。只输出合并后的文本。',
      user: `一：${a.text}\n二：${b.text}`, maxTokens: 120, temperature: 0.2,
    })).trim().slice(0, 90);
  } catch { merged = b.text; } // 合并失败保新删旧
  const emb = vec(await embedOne(merged));
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM zen_memory WHERE id = ANY($1)', [[a.id, b.id]]);
    await client.query('INSERT INTO zen_memory (user_id, kind, text, embedding) VALUES ($1,$2,$3,$4::vector)', [userId, 'qa-summary', merged, emb]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

/** 参学簿明文（透明化端点用） */
async function getBook(userId) {
  const LABEL = { huatou: '话头', profile: '画像', 'qa-summary': '问答', insight: '要点' };
  const r = await q(
    `SELECT kind, text, ts FROM zen_memory WHERE user_id=$1 ORDER BY ts DESC LIMIT 200`, [userId]);
  return r.rows.map(x => ({ kind: x.kind, label: LABEL[x.kind] || x.kind, text: x.text, ts: x.ts }));
}

/** 焚簿：全删，返回删除条数 */
async function burn(userId) {
  const r = await q('DELETE FROM zen_memory WHERE user_id=$1 RETURNING id', [userId]);
  return r.rows.length;
}

module.exports = { UUID_RE, readMemory, recallSummaries, recallSummariesVec, extractAndWrite, getBook, burn, MAX_SUMMARIES };
