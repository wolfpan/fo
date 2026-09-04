/* 般若藏 · 阅读页逻辑 */
const $ = id => document.getElementById(id);
const closeDrawer = () => { $('drawer').classList.remove('open'); $('drawerMask').classList.remove('open'); };
const state = {
  sutra: null,
  size: +(localStorage.getItem('fo-size') || 22),
  vertical: localStorage.getItem('fo-vert') === '1',
  cur: 0,
};

const NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十', '卅一', '卅二'];

async function boot() {
  const id = location.pathname.split('/').pop();
  const res = await fetch('/api/sutra/' + id);
  if (!res.ok) { location.href = '/'; return; }
  state.sutra = await res.json();
  document.title = state.sutra.title + ' · 般若藏';
  $('rtitle').textContent = state.sutra.title;
  $('drawerTitle').textContent = state.sutra.shortTitle + ' · 目录';
  $('drawerCount').textContent = state.sutra.chapters.length + ' 章';

  buildToc();
  renderChapter(0);
  applyPrefs();

  // 恢复上次阅读位置
  const saved = +(localStorage.getItem('fo-pos-' + id) || 0);
  if (saved > 0) setTimeout(() => jump(saved, false), 300);

  bindUI();
}

function buildToc() {
  const list = $('tocList');
  state.sutra.chapters.forEach((c, i) => {
    const it = document.createElement('div');
    it.className = 'toc-item' + (i === 0 ? ' cur' : '');
    it.innerHTML = `<span class="toc-idx">${NUMS[i] || i + 1}</span>
      <span><span class="toc-name">${c.title}</span>
      ${c.note ? `<div class="toc-note">${c.note}</div>` : ''}</span>`;
    it.onclick = () => { jump(i); closeDrawer(); };    list.appendChild(it);
  });
}

function renderChapter(i) {
  const s = state.sutra;
  const c = s.chapters[i];
  state.cur = i;
  const isLast = i === s.chapters.length - 1;
  const isFirst = i === 0;
  const unitWord = s.id === 'jingang' ? '分' : s.id === 'tanjing' ? '品' : '页';
  // 竖排标点包裹，供 CSS 归位（句号等不再浮在字上方）
  const wrapPunc = t => t.replace(/([。，、；：！？」』])/g, '<span class="vp">$1</span>');
  const paper = $('paper');
  paper.innerHTML = `
    <header class="reader-hero">
      <h1 class="reader-sutra-title">${s.title}</h1>
      <p class="reader-sutra-sub">${s.sanskrit}</p>
      <p class="reader-sutra-meta">${s.dynasty} · ${s.translator}<br>${s.era}</p>
      <div class="reader-open-rule"></div>
    </header>
    <section class="chapter">
      <h2 class="chapter-title">${c.title}</h2>
      ${c.note ? `<p class="chapter-note">${c.note}</p>` : ''}
      ${c.paras.map(p => `<p>${wrapPunc(p)}</p>`).join('')}
    </section>
    ${isLast ? `
    <div class="ending">
      <div class="end-row">
        <span class="end-rule"></span>
        <span class="end-word">止观</span>
        <span class="end-rule"></span>
      </div>
      <p class="end-note">经卷已终 · 摄心内照</p>
    </div>` : `
    <nav class="chapter-nav">
      ${isFirst ? '<span></span>' : `<button class="ch-nav-btn" id="prevBtn">← 上一${unitWord}</button>`}
      <button class="ch-nav-btn" id="nextBtn">下一${unitWord} →</button>
    </nav>`}`;
  if ($('prevBtn')) $('prevBtn').onclick = () => { if (i > 0) { jump(i - 1); savePos(i - 1); } };
  if ($('nextBtn')) $('nextBtn').onclick = () => { if (i < s.chapters.length - 1) { jump(i + 1); savePos(i + 1); } };
  markToc(i);
}

function jump(i, scroll = true) {
  renderChapter(i);
  if (scroll) {
    if (state.vertical) $('paper').scrollTo({ left: 999999, behavior: 'auto' });
    else window.scrollTo({ top: 0, behavior: 'auto' });
  }
}

function markToc(i) {
  document.querySelectorAll('.toc-item').forEach((el, k) => el.classList.toggle('cur', k === i));
}

function savePos(i) {
  localStorage.setItem('fo-pos-' + state.sutra.id, i);
}

/* 偏好：字号 / 竖排 */
function applyPrefs() {
  document.documentElement.style.setProperty('--read-size', state.size + 'px');
  $('szVal').textContent = state.size + 'px';
  $('stage').classList.toggle('vertical', state.vertical);
  $('btnVert').classList.toggle('on', state.vertical);
  // 竖排阅读起点在内容最右（block 流向右→左）
  if (state.vertical) {
    const el = $('paper');
    requestAnimationFrame(() => el.scrollTo({ left: el.scrollWidth, behavior: 'auto' }));
  }
}

function bindUI() {
  // 抽屉
  const openDrawer = () => { $('drawer').classList.add('open'); $('drawerMask').classList.add('open'); };
  $('btnToc').onclick = openDrawer;
  $('drawerClose').onclick = closeDrawer;
  $('drawerMask').onclick = closeDrawer;

  // 竖排
  $('btnVert').onclick = () => {
    state.vertical = !state.vertical;
    localStorage.setItem('fo-vert', state.vertical ? '1' : '0');
    applyPrefs();
    setTimeout(() => {
      if (state.vertical) $('paper').scrollTo({ left: $('paper').scrollWidth, behavior: 'auto' });
      else window.scrollTo(0, 0);
    }, 60);
  };

  // 字号
  const pop = $('sizePop');
  $('btnSize').onclick = e => { e.stopPropagation(); pop.classList.toggle('open'); };
  document.addEventListener('click', e => { if (!pop.contains(e.target)) pop.classList.remove('open'); });
  const setSize = v => {
    state.size = Math.min(32, Math.max(16, v));
    localStorage.setItem('fo-size', state.size);
    applyPrefs();
  };
  $('szUp').onclick = () => setSize(state.size + 1);
  $('szDown').onclick = () => setSize(state.size - 1);

  // 阅读进度条
  const prog = $('rprog');
  const onScroll = () => {
    let p;
    if (state.vertical) {
      const el = $('paper');
      const max = el.scrollWidth - el.clientWidth;
      p = max > 0 ? 1 - el.scrollLeft / max : 1;
    } else {
      const max = document.documentElement.scrollHeight - innerHeight;
      p = max > 0 ? scrollY / max : 1;
    }
    prog.style.width = (p * 100).toFixed(1) + '%';
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  $('paper').addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Esc 关抽屉
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDrawer();
    if (e.key === 'ArrowLeft' && state.cur > 0) { jump(state.cur - 1); savePos(state.cur); }
    if (e.key === 'ArrowRight' && state.cur < state.sutra.chapters.length - 1) { jump(state.cur + 1); savePos(state.cur); }
  });

  // 离开前保存位置
  window.addEventListener('beforeunload', () => savePos(state.cur));
}

boot();
