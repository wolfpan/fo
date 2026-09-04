/* postinstall：从 npm 字体包部署分片字体到 public/fonts */
const fs = require('fs');
const path = require('path');

const jobs = [
  ['@fontsource/ma-shan-zheng', 'ma-shan-zheng', ['index.css', '400.css']],
  ['@fontsource/zhi-mang-xing', 'zhi-mang-xing', ['index.css', '400.css']],
  ['@fontsource/noto-serif-sc', 'noto-serif-sc', ['index.css', '400.css', '600.css']],
  ['@fontsource/zcool-xiaowei', 'zcool-xiaowei', ['index.css']],
];
const root = __dirname + '/..';

for (const [pkg, name, cssFiles] of jobs) {
  const src = path.join(root, 'node_modules', pkg);
  const dest = path.join(root, 'public', 'fonts', name);
  if (!fs.existsSync(src)) { console.log('跳过（未安装）:', pkg); continue; }
  fs.mkdirSync(dest, { recursive: true });
  cssFiles.forEach(f => fs.copyFileSync(path.join(src, f), path.join(dest, f)));
  fs.cpSync(path.join(src, 'files'), path.join(dest, 'files'), { recursive: true });
  // 仅保留 woff2（体积减半，现代浏览器均支持）
  fs.readdirSync(path.join(dest, 'files'))
    .filter(f => f.endsWith('.woff'))
    .forEach(f => fs.unlinkSync(path.join(dest, 'files', f)));
  console.log('字体已部署:', name);
}

// 霞鹜文楷（分片版，正楷模式用）
const kaiSrc = path.join(root, 'node_modules', 'lxgw-wenkai-screen-web', 'lxgwwenkaiscreen');
const kaiDest = path.join(root, 'public', 'fonts', 'lxgw-wenkai');
if (fs.existsSync(kaiSrc)) {
  fs.mkdirSync(kaiDest, { recursive: true });
  fs.copyFileSync(path.join(kaiSrc, 'result.css'), path.join(kaiDest, 'kai.css'));
  fs.readdirSync(kaiSrc).filter(f => f.endsWith('.woff2')).forEach(f =>
    fs.copyFileSync(path.join(kaiSrc, f), path.join(kaiDest, f)));
  console.log('字体已部署: lxgw-wenkai');
}
console.log('完成');
