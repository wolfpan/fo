/* 般若藏 · AI说禅 —— 前端：点灯问禅（曹溪影）
 * 灯钮 → 面板 → SSE 流式对话；经证卡片深链阅读页 #cN */
(() => {
  if (window.__foZen) return; window.__foZen = true;

  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  const sessionId = localStorage.getItem('fo-zen-id') || (localStorage.setItem('fo-zen-id', uuid()), localStorage.getItem('fo-zen-id'));

  /* ---------- DOM ---------- */
  const lamp = document.createElement('button');
  lamp.id = 'zenLamp'; lamp.title = '点灯问禅'; lamp.setAttribute('aria-label', '点灯问禅');
  lamp.innerHTML = '<span class="zen-lamp-char">禅</span><span class="zen-lamp-ring"></span>';

  const panel = document.createElement('aside');
  panel.id = 'zenPanel';
  panel.innerHTML = `
    <header class="zen-head">
      <div>
        <span class="zen-name">曹溪影</span>
        <span class="zen-sub">点灯问禅</span>
      </div>
      <button class="zen-close" aria-label="收起">×</button>
    </header>
    <div class="zen-verse">此非六祖，乃依《坛经》所塑之影。以指见月，勿认指为月。</div>
    <div class="zen-body" id="zenBody">
      <div class="zen-msg master first">
        <span class="zen-who">曹溪影</span>
        <div class="zen-text">善知识，灯已点。有何事，直说。</div>
      </div>
    </div>
    <div class="zen-inputrow">
      <input id="zenInput" type="text" maxlength="500" placeholder="写下你的问题……" autocomplete="off">
      <button id="zenSend" aria-label="发送">问</button>
    </div>`;

  document.body.append(lamp, panel);
  const body = panel.querySelector('#zenBody'), input = panel.querySelector('#zenInput'),
        sendBtn = panel.querySelector('#zenSend'), closeBtn = panel.querySelector('.zen-close');

  const history = []; // 最近 6 轮
  let busy = false, statusChecked = false;

  /* ---------- 开合 ---------- */
  const open = () => { panel.classList.add('open'); lamp.classList.add('hide'); setTimeout(() => input.focus(), 350); checkStatus(); };
  const close = () => { panel.classList.remove('open'); lamp.classList.remove('hide'); };
  lamp.onclick = open; closeBtn.onclick = close;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && panel.classList.contains('open')) close(); });

  async function checkStatus() {
    if (statusChecked) return; statusChecked = true;
    try {
      const r = await fetch('/api/zen/status');
      const j = await r.json();
      if (!j.ok) hint(`灯芯未续：${j.message || '服务未就绪'}`);
    } catch { hint('灯未点亮：问禅服务不可用'); }
  }
  function hint(text) {
    const el = document.createElement('div');
    el.className = 'zen-hint'; el.textContent = text;
    body.append(el);
  }

  async function ask(text) {
    busy = true; sendBtn.disabled = true;
    addUser(text);
    const box = addMaster();
    let masterText = '';
    try {
      const res = await fetch('/api/zen/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text, history: history.slice(-6) }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n'); buf = parts.pop();
        for (const part of parts) {
          let ev = 'message', data = '';
          for (const line of part.split('\n')) {
            if (line.startsWith('event: ')) ev = line.slice(7).trim();
            else if (line.startsWith('data: ')) data += line.slice(6);
          }
          if (!data) continue;
          let j; try { j = JSON.parse(data); } catch { continue; }
          if (ev === 'cited' && j.citations) addCitations(box, j.citations);
          else if (ev === 'token' && j.delta) {
            masterText += j.delta;
            box.textContent = masterText;
            box.classList.add('zen-streaming');
            scroll();
          }
          else if (ev === 'error') { masterText += `\n（灯焰晃了一下：${j.message}）`; box.textContent = masterText; }
        }
      }
      history.push({ role: 'user', content: text }, { role: 'assistant', content: masterText });
    } catch (e) {
      box.textContent = masterText || `（灯灭了：${e.message}）`;
    } finally {
      box.classList.remove('zen-streaming');
      busy = false; sendBtn.disabled = false; input.focus();
    }
  }

  sendBtn.onclick = () => { const t = input.value.trim(); if (t && !busy) { input.value = ''; ask(t); } };
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) sendBtn.click(); });
})();
