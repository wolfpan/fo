/* 般若藏 · AI说禅 —— BGE-M3 嵌入客户端（阿里百炼 OpenAI 兼容端点） */
'use strict';
const { getConfig } = require('./db.cjs');

const sleep = ms => new Promise(r => setTimeout(r, ms));
/* 兼容两种填法：API base（…/v1）或完整端点（…/v1/embeddings） */
const normEmbedUrl = u => u.replace(/\/+$/, '').replace(/\/embeddings$/, '');

async function callEmbeddings(texts, retry = 3) {
  const cfg = getConfig();
  const url = normEmbedUrl(cfg.embedding.base_url) + '/embeddings';
  for (let i = 0; i < retry; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.embedding.api_key}` },
        body: JSON.stringify({ model: cfg.embedding.model, input: texts }),
        signal: AbortSignal.timeout(60_000),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`嵌入失败 HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      if (!Array.isArray(data.data) || data.data.length !== texts.length) throw new Error('嵌入返回条数不符');
      // 按 index 排序，防乱序
      return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
    } catch (e) {
      if (i === retry - 1) throw e;
      await sleep(1500 * (i + 1));
    }
  }
}

/* 批量嵌入（自动分批） */
async function embedAll(texts) {
  const cfg = getConfig();
  const size = cfg.embedding.batch_size || 10;
  const out = [];
  for (let i = 0; i < texts.length; i += size) {
    out.push(...await callEmbeddings(texts.slice(i, i + size)));
    if (texts.length > size && (i / size) % 5 === 4) process.stderr.write(`  嵌入进度 ${Math.min(i + size, texts.length)}/${texts.length}\n`);
  }
  return out;
}

const embedOne = async text => (await callEmbeddings([text]))[0];

module.exports = { embedAll, embedOne };
