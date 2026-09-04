const express = require('express');
const path = require('path');
const fs = require('fs');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;

const sutras = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'sutras.json'), 'utf8'));

app.use(compression());
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  index: false,
  setHeaders(res, p) {
    if (/\.(html|css|js)$/.test(p)) res.setHeader('Cache-Control', 'no-store');
  },
}));

// CSS/JS 按文件修改时间自动版本化，杜绝浏览器旧缓存
const mtime = rel => fs.statSync(path.join(__dirname, 'public', rel)).mtimeMs.toFixed(0);
function sendPage(res, file) {
  const html = fs.readFileSync(path.join(__dirname, 'public', file), 'utf8')
    .replace(/style\.css\?v=\d+/, `style.css?v=${mtime('css/style.css')}`)
    .replace(/\/js\/([a-z-]+)\.js/g, (m, name) => `/js/${name}.js?v=${mtime('js/' + name + '.js')}`);
  res.set('Content-Type', 'text/html; charset=utf-8').send(html);
}

// 三部经典元数据（不含正文，供目录页）
app.get('/api/sutras', (req, res) => {
  res.json(sutras.map(({ id, title, shortTitle, sanskrit, dynasty, translator, era, desc, quote, chapters, image, accent }) => ({
    id, title, shortTitle, sanskrit, dynasty, translator, era, desc, quote, image, accent,
    chapterCount: chapters.length,
    charCount: chapters.reduce((a, c) => a + c.paras.join('').length, 0),
  })));
});

// 单部经典全文
app.get('/api/sutra/:id', (req, res) => {
  const s = sutras.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'not found' });
  res.json(s);
});

// 页面路由
app.get('/', (req, res) => sendPage(res, 'index.html'));
app.get('/read/:id', (req, res) => sendPage(res, 'sutra.html'));

app.listen(PORT, () => {
  console.log(`般若藏 · http://localhost:${PORT}`);
});
