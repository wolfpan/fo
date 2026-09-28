/* 般若藏 · AI说禅 —— prompt 组装（缓存稳定顺序：kernel → 半静态 → 动态） */
'use strict';
const fs = require('fs');
const path = require('path');
const { citationsForPrompt } = require('./retrieve.cjs');

let _kernel = null;
function kernel() {
  if (_kernel) return _kernel;
  _kernel = fs.readFileSync(path.join(__dirname, 'compile', 'kernel.md'), 'utf8');
  return _kernel;
}

/**
 * 组装完整 messages。
 * 顺序（前缀缓存友好）：
 *   [kernel 静态] + [首轮指令/参学簿 半静态] + [经证/机缘/近几轮 动态] + 本轮问
 * @param {object} p
 * @param {boolean} p.first       是否首轮（开场语由服务端显式控制，M0 发现的修正项）
 * @param {object} [p.citations]  toCitations() 产物
 * @param {Array}  [p.persona]    persona_kb 命中行（模型卡/机缘问答）
 * @param {Array}  [p.history]    [{role:'user'|'assistant', content}] 近几轮
 * @param {object} [p.memory]     M2 预留：{ huatou, profile, recalls }
 * @param {string}  p.question    本轮问
 */
function buildMessages({ first, citations, persona, history, memory, question }) {
  let system = kernel();

  // —— 半静态段（同一用户会话内稳定，放前）——
  if (first) system += '\n\n（本轮是与这位善知识的第一轮对话：先按规则说一次开场语，此后不再说。）';
  const mem = memory || {};
  if (mem.huatou || mem.profile || (mem.recalls && mem.recalls.length)) {
    system += '\n\n【参学簿】';
    if (mem.profile) system += `\n${mem.profile}`;
    if (mem.huatou) system += `\n未参完的话头：${mem.huatou}`;
    if (mem.recalls && mem.recalls.length) system += `\n过往问答要点：\n${mem.recalls.map(t => `- ${t}`).join('\n')}`;
    system += '\n（自然承接即可，不复述明细。）';
  }

  // —— 动态段（放尾，不打碎缓存前缀）——
  const jz = citationsForPrompt(citations || []);
  if (jz) system += `\n\n【经证】（本轮检索所得，引经只用此段）\n${jz}`;
  if (persona && persona.length) {
    const refs = persona.map(p => `· ${p.kind === 'model-card' ? '【应机思路】' : p.kind === 'fewshot' ? '【古问答】' : '【事迹】'}${(p.text || '').slice(0, 400)}`).join('\n');
    system += `\n\n【机缘】（供参考的应机思路与旧事，勿照抄原句）\n${refs}`;
  }

  const messages = [{ role: 'system', content: system }];
  for (const h of (history || []).slice(-6)) {
    if (h && h.role && h.content) messages.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content).slice(0, 1000) });
  }
  messages.push({ role: 'user', content: question });
  return messages;
}

module.exports = { kernel, buildMessages };
