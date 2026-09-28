/* 般若藏 · AI说禅 —— 分块器（经文与人格源料共用，供建库脚本与离线测试复用） */
'use strict';

const WINDOW = 420;   // 目标窗口字数
const MIN_KEEP = 200; // 不足此数则并入下一块

/* 主题词表：轻量关键词打标，辅助稠密检索（M1 不参与 SQL 过滤，仅入 payload） */
const TAG_DICT = [
  ['烦恼', ['烦恼', '尘劳', '迷惑']],
  ['般若', ['般若', '摩诃', '智慧']],
  ['空', ['虚空', '虚妄', '梦幻', '泡影']],
  ['无念', ['无念', '于念', '念起']],
  ['坐禅', ['坐禅', '禅定', '看净', '净心']],
  ['定慧', ['定慧']],
  ['自性', ['自性', '本性', '本心', '佛性', '本来面目']],
  ['顿渐', ['顿', '渐修', '利钝', '顿悟']],
  ['净土', ['西方', '净土', '念佛', '往生']],
  ['功德', ['功德', '福田']],
  ['忏悔', ['忏悔', '无罪', '忏悔品']],
  ['读经', ['诵经', '法华', '转经', '文字', '诸佛妙理']],
  ['如幻', ['如幻', '幻', '如梦', '影']],
  ['妄想', ['妄想', '妄念', '分别', '计著']],
  ['心现', ['自心现', '心现', '唯心']],
];

function autoTags(text) {
  const tags = [];
  for (const [tag, kws] of TAG_DICT) {
    if (kws.some(k => text.includes(k))) tags.push(tag);
    if (tags.length >= 4) break;
  }
  return tags;
}

/* 把一段长文按句切成 <=WINDOW 的窗口，相邻窗口重叠一句 */
function splitLongPara(para) {
  const sentences = para.split(/(?=[。！？；])/);
  const out = [];
  let acc = '';
  for (const s of sentences) {
    if (acc && acc.length + s.length > WINDOW) {
      out.push(acc);
      const last = acc.split(/(?=[。！？；])/).pop();
      acc = last.length < 80 ? last : '';
    }
    acc += s;
  }
  if (acc) out.push(acc);
  return out;
}

/* 经文分块：章内段落聚合，窗口化 + 一句重叠 */
function chunkSutras(sutras) {
  const chunks = [];
  for (const s of sutras) {
    s.chapters.forEach((c, ci) => {
      let acc = '', paraIdx = 0;
      const flush = () => {
        if (!acc.trim()) return;
        chunks.push({
          sutra_id: s.id, chapter: c.title, chapter_idx: ci, para_idx: paraIdx,
          text: acc.trim(), tags: autoTags(acc),
        });
        const last = acc.split(/(?=[。！？；])/).pop();
        acc = last.length < 80 ? last : ''; // 重叠一句
      };
      for (const p of c.paras) {
        const pieces = p.length > WINDOW ? splitLongPara(p) : [p];
        for (const piece of pieces) {
          if (acc && acc.length + piece.length > WINDOW && acc.length >= MIN_KEEP) flush();
          if (!acc) paraIdx = c.paras.indexOf(p);
          acc += piece;
          while (acc.length > WINDOW * 1.6) flush(); // 超长保护
        }
      }
      if (acc.trim() && acc.length > 20) {
        chunks.push({ sutra_id: s.id, chapter: c.title, chapter_idx: ci, para_idx: paraIdx, text: acc.trim(), tags: autoTags(acc) });
      }
    });
  }
  return chunks;
}

/* 人格源料分块：按标题/空行切段，窗口化 */
function chunkResearch(md, source) {
  const blocks = md.split(/\n(?=#{1,3} )/);
  const chunks = [];
  for (const b of blocks) {
    const heading = (b.match(/^#{1,3} (.+)$/m) || [, ''])[1].trim();
    const body = b.replace(/^#{1,3} .+$/m, '').replace(/\s+/g, ' ').trim();
    if (!body || body.length < 50) continue;
    for (const piece of splitLongPara(body)) {
      chunks.push({ kind: 'research', topic: autoTags(piece), text: `【${heading}】${piece}`, source });
    }
  }
  return chunks;
}

module.exports = { chunkSutras, chunkResearch, autoTags, WINDOW };
