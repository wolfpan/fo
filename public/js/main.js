/* 般若藏 · 首页逻辑 */
const NUM = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ'];

/* 陈列图库：仅收深色底、古代石雕单体造像（头像/半身/全身，与整体墨色融合），每次刷新随机轮换；展签按条目注明朝代与材质 */
const GALLERY = [
  { id: 'img_1',  cn: '犍陀罗 · 片岩佛首',     en: 'Gandhāra Schist' },      // 黑底犍陀罗佛首 · 背光（头像）
  { id: 'img_3',  cn: '犍陀罗 · 片岩菩萨立像', en: 'Gandhāra Schist' },      // 深灰底菩萨立像（全身）
  { id: 'img_6',  cn: '犍陀罗 · 片岩佛首',     en: 'Gandhāra Schist' },      // 黑底犍陀罗佛首（头像）
  { id: 'img_14', cn: '犍陀罗 · 片岩宝冠佛首', en: 'Gandhāra Schist' },      // 黑底宝冠佛首（半身）
  { id: 'img_15', cn: '犍陀罗 · 片岩佛坐像',   en: 'Gandhāra Schist' },      // 深灰底片岩佛坐像（全身）
  { id: 'img_23', cn: '犍陀罗 · 片岩菩萨胸像', en: 'Gandhāra Schist' },      // 深底片岩菩萨胸像（半身）
  { id: 'img_24', cn: '北魏 · 石灰岩佛首',     en: 'Northern Wei Limestone' }, // 灰底石灰岩佛首（头像）
  { id: 'img_25', cn: '北魏 · 砂岩立佛',       en: 'Northern Wei Sandstone' }, // 灰底燃灯佛立像 · 火焰背光（全身）
  { id: 'img_26', cn: '北齐 · 石灰岩宝冠菩萨首', en: 'Northern Qi Limestone' }, // 暗灰底宝冠菩萨首（头像）
  { id: 'img_27', cn: '北齐 · 石灰岩佛首',     en: 'Northern Qi Limestone' }, // 暗灰底佛首（头像）
  { id: 'img_28', cn: '北齐 · 石灰岩菩萨首',   en: 'Northern Qi Limestone' }, // 灰绿底胁侍菩萨首（头像）
  { id: 'img_29', cn: '北齐 · 汉白玉佛坐像',   en: 'Northern Qi Marble' },    // 暗底汉白玉佛坐像（全身）
].map(g => ({ ...g, src: `/assets/raw/${g.id}.jpg` }));

function pickThree() {
  const pool = [...GALLERY];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}

async function boot() {
  const res = await fetch('/api/sutras');
  const sutras = await res.json();
  const picks = pickThree();
  sutras.forEach((s, i) => { s.img = picks[i]; });

  const box = document.getElementById('exhibits');
  const frag = document.createDocumentFragment();

  sutras.forEach((s, i) => {
    const el = document.createElement('article');
    el.className = 'exhibit reveal' + (i % 2 ? ' flip' : '');
    el.innerHTML = `
      <figure class="exhibit-media">
        <span class="exhibit-no">No. ${NUM[i]} · ${s.sanskrit.split(' ')[0]}</span>
        <img src="${s.img.src}" alt="${s.title} 造像" loading="lazy">
        <figcaption class="exhibit-caption">${s.img.cn}<br>${s.img.en}</figcaption>
        <span class="exhibit-plinth"></span>
      </figure>
      <div class="exhibit-body">
        <p class="exhibit-dynasty">${s.dynasty} · ${s.era}</p>
        <h3 class="exhibit-title">${s.title}</h3>
        <p class="exhibit-sanskrit">${s.sanskrit}</p>
        <div class="exhibit-meta">
          <span>译者 <b>${s.translator}</b></span>
          <span>章节 <b>${s.chapterCount} ${s.id === 'xinjing' ? '卷' : '品/分'}</b></span>
          <span>字数 <b>${s.charCount.toLocaleString()}</b></span>
        </div>
        <p class="exhibit-desc">${s.desc}</p>
        <blockquote class="exhibit-quote">${s.quote}</blockquote>
        <a class="exhibit-cta" href="/read/${s.id}">入 内 观 览 <span class="arr">→</span></a>
      </div>`;
    frag.appendChild(el);
  });
  box.appendChild(frag);

  // 咒语文字墙（竖排低透明度）
  const wall = document.getElementById('mantraBg');
  const mantra = '揭谛揭谛波罗揭谛波罗僧揭谛菩提萨婆诃';
  let wallText = '';
  for (let c = 0; c < 9; c++) wallText += mantra + ' ';
  wall.textContent = wallText;

  // 滚动淡入
  const io = new IntersectionObserver(es => {
    es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  // 顶栏落定
  const bar = document.getElementById('topbar');
  const onScroll = () => bar.classList.toggle('solid', window.scrollY > 60);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

boot();
