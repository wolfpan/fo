/* 般若藏 · AI说禅 —— LLM 供应商抽象（OpenAI 兼容；SSE 流式 + 查询改写） */
'use strict';
const { getConfig } = require('./db.cjs');
/* 兼容两种填法：API base（…/v1）或完整端点（…/v1/chat/completions） */
const normChatUrl = u => u.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
/* OpenRouter 的推理模型（如 deepseek-v4.1-flash）默认输出 reasoning，会把 max_tokens 吃光、
 * content 返回 null。走 OpenRouter 时统一关闭 reasoning；其他供应商不传此参数。 */
const orReasoningOff = base => (/openrouter\.ai/.test(base) ? { reasoning: { enabled: false } } : {});

/* 流式对话：onDelta(增量文本)，返回完整文本 */
async function chatStream({ messages, onDelta }) {
  const cfg = getConfig();
  const res = await fetch(normChatUrl(cfg.llm.base_url) + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.llm.api_key}` },
    body: JSON.stringify({
      model: cfg.llm.model, messages, stream: true,
      max_tokens: (getConfig().chat || {}).max_tokens || 600,
      temperature: (getConfig().chat || {}).temperature ?? 0.8,
      ...orReasoningOff(cfg.llm.base_url),
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '', full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith('data:')) continue;
      const payload = s.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const j = JSON.parse(payload);
        const delta = j.choices?.[0]?.delta?.content || '';
        if (delta) { full += delta; onDelta && onDelta(delta, full); }
      } catch { /* 忽略半行 */ }
    }
  }
  return full;
}

/* 非流式单次调用（内部用途：查询改写） */
async function chatOnce({ system, user, maxTokens = 200, temperature = 0.3 }) {
  const cfg = getConfig();
  const res = await fetch(normChatUrl(cfg.llm.base_url) + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.llm.api_key}` },
    body: JSON.stringify({ model: cfg.llm.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: maxTokens, temperature, ...orReasoningOff(cfg.llm.base_url) }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const j = await res.json();
  return j.choices?.[0]?.message?.content || '';
}

/* 白话→古文 术语词典：确定性兜底，LLM 改写失败或漏译时仍能拉回古文语域。
 * 术语取语料中的完整短语（≥3字），配合检索端的去标点字面匹配可精确命中。 */
const ZH_TERM_MAP = [
  [/放不下|抓住|执着|执念/, ['应无所住', '住着']],
  [/静不下|心乱|杂念|走神|胡思乱想|妄念/, ['摄心', '妄念']],
  [/烦恼|焦虑|压力|烦躁/, ['尘劳', '烦恼即菩提']],
  [/辞掉|躲|逃离|远离|归隐|出世|红尘/, ['佛法在世间', '离世觅菩提']],
  [/学历|出身|看不起自己|低人一等|自卑/, ['下下人有上上智', '佛性本无南北']],
  [/不死|永恒|长生/, ['不生不灭']],
  [/梦|幻觉|虚假|幻/, ['如幻', '梦幻泡影']],
  [/都会过去|无常|短暂|意义|虚空/, ['一切有为法', '梦幻泡影']],
  [/描述|像什么|说不清|定义/, ['说似一物即不中']],
  [/老师|师父|靠谁|靠自/, ['自性自度']],
  [/读书|道理|懂很多|知识/, ['口诵心行', '心迷法华转']],
  [/念佛|净土|西方|往生/, ['西方', '净土']],
  [/打坐|冥想|坐禅|压住|断掉/, ['坐禅', '看心看净']],
  [/被带|被影响|环境|吵|外界/, ['不是风动', '外离相为禅']],
  [/迷|悟|一念/, ['前念迷即凡夫', '后念悟即佛']],
  [/毛病|清理|忏悔|罪业/, ['自性中真忏悔']],
  [/佛性|本来就有|具足|自性/, ['何期自性', '本自具足']],
  [/生死|死亡|无常/, ['生死事大']],
  [/海浪|波浪|浪/, ['譬如巨海浪', '识浪']],
  [/开悟|见性|明心/, ['见性', '顿悟']],
];
function dictTerms(question) {
  const out = [];
  for (const [re, terms] of ZH_TERM_MAP) {
    if (re.test(question)) out.push(...terms);
    if (out.length >= 2) break;
  }
  return out;
}

/**
 * 查询改写：白话原句 → 检索变体（LLM 改写 + 词典兜底），缓解白话↔古文跨语域。
 * LLM 失败时词典仍能提供变体。
 */
async function rewriteQuery(question) {
  const system = `你是佛教经典检索的查询改写器。把用户的现代白话问题改写为 2 个用于检索古文经文的变体：
1. 一个古文/半文言倾向的转述（用禅宗常用语汇，如：烦恼→尘劳/心迷；静不下心→心乱/摄心/妄念；放不下→执取/住着）；
2. 一个抽取核心概念词的短语（3-8字，如「无住生心」「自性清净」）。
只输出一个 JSON 数组，含且仅含这 2 个字符串，不要解释。`;
  let llmVariants = [];
  try {
    const raw = await chatOnce({ system, user: question, maxTokens: 150 });
    const m = raw.match(/\[[\s\S]*\]/);
    llmVariants = (JSON.parse(m[0])).filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()).slice(0, 2);
  } catch { /* 词典兜底 */ }
  // 用户引用原句时（如「应无所住而生其心」是什么意思），引号内文是最强检索变体
  const quotes = [...question.matchAll(/[「『“"]([^」』”"]{3,40})[」』”"]/g)].map(m => m[1]);
  // 词典词精度最高（语料原短语），排在 LLM 变体之前，防止被上限截断
  const all = [question, ...quotes, ...dictTerms(question), ...llmVariants];
  return [...new Set(all)].slice(0, 5);
}

module.exports = { chatStream, chatOnce, rewriteQuery };
