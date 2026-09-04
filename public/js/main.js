/* 般若藏 · 首页逻辑 */
const NUM = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ'];

/* 陈列图库：每次刷新随机轮换（Fisher-Yates 洗牌取三，不重复） */
const GALLERY = [
  'img_1',   // 黑底犍陀罗佛首 · 背光
  'img_3',   // 深灰底菩萨立像
  'img_5',   // 犍陀罗佛首（大都会）
  'img_6',   // 黑底犍陀罗佛首
  'img_8',   // 深棕石雕坐佛
  'img_9',   // 棕榈叶经·手稿
  'img_10',  // 贝叶经彩页
  'img_11',  // 金色卧佛
  'img_12',  // 黑底片岩佛立像
  'img_13',  // 黑底片岩佛坐像
].map(n => `/assets/raw/${n}.jpg`);

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
  sutras.forEach((s, i) => { s.image = picks[i]; });

  const box = document.getElementById('exhibits');
  const frag = document.createDocumentFragment();

  sutras.forEach((s, i) => {
    const el = document.createElement('article');
    el.className = 'exhibit reveal' + (i % 2 ? ' flip' : '');
    el.innerHTML = `
      <figure class="exhibit-media">
        <span class="exhibit-no">No. ${NUM[i]} · ${s.sanskrit.split(' ')[0]}</span>
        <img src="${s.image}" alt="${s.title} 造像" loading="lazy">
        <figcaption class="exhibit-caption">犍陀罗造像 · 石刻<br>Gandhāra Schist</figcaption>
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
