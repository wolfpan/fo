/* 般若藏 · AI说禅 —— Neon Postgres (pgvector) 连接与建表 */
'use strict';
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

let _cfg = null, _pool = null;

function getConfig() {
  if (_cfg) return _cfg;
  const file = path.join(__dirname, 'config.json');
  if (!fs.existsSync(file)) {
    throw new Error('缺少 zen/config.json —— 请复制 zen/config.example.json 为 zen/config.json 并填写密钥');
  }
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  const need = (obj, key, where) => { if (!obj[key] || /YOUR_/.test(obj[key])) throw new Error(`zen/config.json 的 ${where}.${key} 未填写`); };
  need(cfg.llm, 'api_key', 'llm'); need(cfg.llm, 'base_url', 'llm'); need(cfg.llm, 'model', 'llm');
  need(cfg.neon, 'connection_string', 'neon');
  need(cfg.embedding, 'api_key', 'embedding');
  if (!cfg.embedding.model) throw new Error('zen/config.json 的 embedding.model 未填写');
  _cfg = cfg;
  return _cfg;
}

function pool() {
  const cfg = getConfig();
  if (!_pool) {
    // Neon sslmode=require：附加兼容参数，消除 pg v9 前瞻性告警
    let cs = cfg.neon.connection_string;
    if (/sslmode=require/.test(cs) && !/uselibpqcompat/.test(cs)) {
      cs += (cs.includes('?') ? '&' : '?') + 'uselibpqcompat=true';
    }
    _pool = new Pool({
      connectionString: cs,
      ssl: { rejectUnauthorized: false }, // Neon 需要 SSL；池化端点自带 PgBouncer
      max: 5, idleTimeoutMillis: 30_000,
    });
  }
  return _pool;
}

/* 向量 → pgvector 字面量 */
const vec = arr => '[' + arr.map(x => Number(x).toFixed(6)).join(',') + ']';

async function ensureSchema() {
  const cfg = getConfig();
  const dim = cfg.embedding.dimensions || 1024;
  if (!Number.isInteger(dim) || dim < 64) throw new Error(`embedding.dimensions 非法: ${dim}`);
  const ddl = `
    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE EXTENSION IF NOT EXISTS pg_trgm;

    CREATE TABLE IF NOT EXISTS sutra_chunks (
      id bigserial PRIMARY KEY,
      sutra_id text NOT NULL,
      chapter text NOT NULL,
      chapter_idx int NOT NULL,
      para_idx int,
      text text NOT NULL,
      tags text[] NOT NULL DEFAULT '{}',
      embedding vector(${dim}) NOT NULL
    );
    CREATE TABLE IF NOT EXISTS persona_kb (
      id bigserial PRIMARY KEY,
      kind text NOT NULL,             -- model-card | fewshot | research
      topic text[] NOT NULL DEFAULT '{}',
      text text NOT NULL,
      source text,
      embedding vector(${dim}) NOT NULL
    );
    CREATE TABLE IF NOT EXISTS zen_memory (
      id bigserial PRIMARY KEY,
      user_id uuid NOT NULL,
      ts timestamptz NOT NULL DEFAULT now(),
      kind text NOT NULL,             -- huatou | profile | qa-summary | insight
      text text NOT NULL,
      embedding vector(${dim}) NOT NULL
    );
    CREATE TABLE IF NOT EXISTS zen_events (
      id bigserial PRIMARY KEY,
      user_id uuid, ts timestamptz NOT NULL DEFAULT now(),
      type text NOT NULL, meta jsonb NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_sutra_emb  ON sutra_chunks USING hnsw (embedding vector_cosine_ops);
    CREATE INDEX IF NOT EXISTS idx_persona_emb ON persona_kb   USING hnsw (embedding vector_cosine_ops);
    CREATE INDEX IF NOT EXISTS idx_memory_emb ON zen_memory    USING hnsw (embedding vector_cosine_ops);
    CREATE INDEX IF NOT EXISTS idx_sutra_trgm  ON sutra_chunks USING gin (text gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_memory_user ON zen_memory (user_id, ts);
    CREATE INDEX IF NOT EXISTS idx_sutra_chap  ON sutra_chunks (sutra_id, chapter_idx);
  `;
  await pool().query(ddl);
}

/* 带一次重试的查询：Neon 冷启动与瞬时 TLS reset 不至于让整轮对话失败 */
async function q(text, params, retry = 1) {
  try {
    return await pool().query(text, params);
  } catch (e) {
    if (retry > 0 && /ECONNRESET|socket|connection|terminating|timeout/i.test(e.message)) {
      await new Promise(r => setTimeout(r, 500));
      return q(text, params, retry - 1);
    }
    throw e;
  }
}

async function counts() {
  const r = await q(`
    SELECT (SELECT count(*) FROM sutra_chunks) AS sutra,
           (SELECT count(*) FROM persona_kb)  AS persona,
           (SELECT count(*) FROM zen_memory)  AS memory`);
  return r.rows[0];
}

module.exports = { getConfig, pool, q, vec, ensureSchema, counts };
