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
      <div class="zen-head-tools">
        <button class="zen-tool" id="zenRemember" title="参学簿：记下话头与要点，下次来访承接；可随时焚去">记</button>
        <button class="zen-tool" id="zenBook" title="参学簿 · 查看与焚簿">簿</button>
        <button class="zen-close" aria-label="收起">×</button>
      </div>
    </header>
    <div class="zen-verse">此非六祖，乃依《坛经》所塑之影。以指见月，勿认指为月。</div>
    <div class="zen-body" id="zenBody">
      <div class="zen-msg master first">
        <span class="zen-who">曹溪影</span>
        <div class="zen-text">善知识，灯已点。有何事，直说。</div>
      </div>
    </div>
    <div class="zen-book" id="zenBookPanel" hidden>
      <div class="zen-book-head">
        <span>参学簿 <span class="zen-book-count" id="zenBookCount"></span></span>
        <button class="zen-book-close" id="zenBookClose" aria-label="回到问禅">← 问禅</button>
      </div>
      <div class="zen-book-list" id="zenBookList"></div>
      <button class="zen-burn" id="zenBurn">焚 簿</button>
      <p class="zen-book-note">缘起性空，来时无痕。焚去后不可找回。</p>
    </div>
    <div class="zen-inputrow">
      <input id="zenInput" type="text" maxlength="500" placeholder="写下你的问题……" autocomplete="off">
      <button id="zenSend" aria-label="发送">问</button>
    </div>`;

  document.body.append(lamp, panel);
  const body = panel.querySelector('#zenBody'), input = panel.querySelector('#zenInput'),
        sendBtn = panel.querySelector('#zenSend'), closeBtn = panel.querySelector('.zen-close'),
        rememberBtn = panel.querySelector('#zenRemember'), bookBtn = panel.querySelector('#zenBook'),
        bookPanel = panel.querySelector('#zenBookPanel'), bookList = panel.querySelector('#zenBookList'),
        bookCount = panel.querySelector('#zenBookCount'), burnBtn = panel.querySelector('#zenBurn');

  const history = []; // 最近 6 轮
  let busy = false, statusChecked = false;
  let remember = localStorage.getItem('fo-zen-remember') === '1'; // 记忆默认关闭

  /* ---------- 开合 ---------- */
  const open = () => { panel.classList.add('open'); lamp.classList.add('hide'); setTimeout(() => input.focus(), 350); checkStatus(); syncRemember(); };
  const close = () => { panel.classList.remove('open'); lamp.classList.remove('hide'); bookPanel.hidden = true; };
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

  /* ---------- 参学簿 ---------- */
  const syncRemember = () => {
    rememberBtn.classList.toggle('on', remember);
    rememberBtn.title = remember ? '参学簿已开：话头与要点将记下，下次承接' : '参学簿未开：不记一言，关灯即忘';
  };
  rememberBtn.onclick = () => {
    remember = !remember;
    localStorage.setItem('fo-zen-remember', remember ? '1' : '0');
    syncRemember();
  };
  bookBtn.onclick = async () => {
    bookPanel.hidden = !bookPanel.hidden;
    if (!bookPanel.hidden) await renderBook();
  };
  panel.querySelector('#zenBookClose').onclick = () => { bookPanel.hidden = true; };
  async function renderBook() {
    bookList.innerHTML = '<p class="zen-book-empty">翻簿中……</p>';
    try {
      const r = await fetch('/api/zen/memory/' + sessionId);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || '不可读');
      const rows = j.rows || [];
      bookCount.textContent = rows.length ? `· ${rows.length} 笔` : '';
      bookList.innerHTML = rows.length
        ? rows.map(x => `<div class="zen-book-row"><span class="zen-book-kind">${x.label}</span><span class="zen-book-text"></span></div>`).join('')
        : '<p class="zen-book-empty">簿上无字。</p>';
      rows.forEach((x, i) => { bookList.children[i].querySelector('.zen-book-text').textContent = x.text; });
    } catch (e) {
      bookList.innerHTML = `<p class="zen-book-empty">簿不可读：${e.message}</p>`;
    }
    burnBtn.disabled = false; burnBtn.textContent = '焚 簿';
  }
  // 焚簿两段确认：再点一次方焚
  let burnArmed = null;
  burnBtn.onclick = async () => {
    if (!burnArmed) {
      burnBtn.textContent = '再点一次 · 灰飞烟灭';
      burnArmed = setTimeout(() => { burnArmed = null; burnBtn.textContent = '焚 簿'; }, 3200);
      return;
    }
    clearTimeout(burnArmed); burnArmed = null;
    burnBtn.disabled = true; burnBtn.textContent = '焚罢。';
    try { await fetch('/api/zen/memory/' + sessionId, { method: 'DELETE' }); } catch { /* 网络异常也按已焚处理，下次拉取即知 */ }
    await renderBook();
    bookList.insertAdjacentHTML('afterbegin', '<p class="zen-book-burned">已焚。来时无痕。</p>');
  };

  /* ---------- 消息渲染 ---------- */
  function addUser(text) {
    const el = document.createElement('div');
    el.className = 'zen-msg me';
    el.innerHTML = `<div class="zen-text"></div>`;
    el.querySelector('.zen-text').textContent = text;
    body.append(el); scroll();
  }
  function addMaster() {
    const el = document.createElement('div');
    el.className = 'zen-msg master';
    el.innerHTML = '<span class="zen-who">曹溪影</span><div class="zen-text zen-streaming"><span class="zen-caret"></span></div>';
    body.append(el); scroll();
    return el.querySelector('.zen-text');
  }
  function addCitations(box, citations) {
    const wrap = document.createElement('div');
    wrap.className = 'zen-cites';
    for (const c of citations) {
      const card = document.createElement('a');
      card.className = 'zen-cite';
      card.href = c.link;
      card.innerHTML = `<span class="zen-cite-src">《${c.sutra_title} · ${c.chapter}》</span><span class="zen-cite-text"></span><span class="zen-cite-go">入内观览 →</span>`;
      card.querySelector('.zen-cite-text').textContent = c.text;
      wrap.append(card);
    }
    box.parentElement.insertBefore(wrap, box);
    scroll();
  }
  const scroll = () => body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });

  /* ---------- SSE 对话 ---------- */
  async function ask(text) {
    busy = true; sendBtn.disabled = true;
    addUser(text);
    const box = addMaster();
    let masterText = '';
    try {
      const res = await fetch('/api/zen/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text, history: history.slice(-6), remember }),
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
          else if (ev === 'huatou' && j.huatou) {
            const h = document.createElement('div');
            h.className = 'zen-huatou'; h.textContent = `〔话头 · 已记〕${j.huatou}`;
            box.parentElement.insertBefore(h, box.nextSibling);
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
