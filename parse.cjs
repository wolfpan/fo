const fs = require('fs');
const OpenCC = require('opencc-js');
const conv = OpenCC.Converter({ from: 'tw', to: 'cn' });
const T = s => conv(s.replace(/\[编辑\]/g, '').replace(/\[編輯\]/g, '')).trim();
const read = f => fs.readFileSync('data/raw/' + f, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
const BAD = [/^收錄於/, /^更多/, /^姊妹/, /^參閱/, /^閲文言/, /^收聽/, /^此錄音/, /^Public domain/, /本作品在全世界/, /^有聲維基/, /^更多有聲/, /^敦煌唐本/, /卷首图/, /^南無本師/, /^南無般若會/, /^開經偈$/, /^無上甚深/, /^我今見聞/, /^民國江味農/, /^姚秦三藏/];

// ---------- 金刚经 ----------
let jlines = read('jingang_01.txt');
let start = jlines.findIndex(l => l.replace(/\[编辑\]|\[編輯\]/g, '') === '正文');
jlines = jlines.slice(start + 1);
const jingang = [];
let cur = null;
for (const raw of jlines) {
  const l = raw.replace(/\[编辑\]|\[編輯\]/g, '').trim();
  if (/^外部[鏈链连]?接/.test(l)) break;
  if (BAD.some(r => r.test(l)) && !/分第/.test(l)) continue;
  const m = l.match(/^(.+?分)(第[一二三四五六七八九十]+)(『(.+?)』)?$/);
  if (m && m[1].length <= 8) {
    cur = { title: T(m[1] + m[2]), note: m[4] ? T(m[4]) : '', paras: [] };
    jingang.push(cur); continue;
  }
  if (!cur) continue;
  cur.paras.push(T(l));
}
console.log('金刚经分章:', jingang.length, '总字数:', jingang.reduce((a, c) => a + c.paras.join('').length, 0));
fs.writeFileSync('data/raw/jingang_parsed.json', JSON.stringify(jingang, null, 1));

// ---------- 心经 ----------
const xlines = read('xinjing_01.txt');
const xi = xlines.findIndex(l => l === '唐三藏法師玄奘譯');
let xend = xi;
for (let i = xi; i < xlines.length; i++) if (/菩提薩婆訶/.test(xlines[i])) { xend = i; break; }
const xinjingParas = xlines.slice(xi + 1, xend + 1).map(T);
console.log('心经段落数:', xinjingParas.length, '总字数:', xinjingParas.join('').length);
fs.writeFileSync('data/raw/xinjing_parsed.json', JSON.stringify(xinjingParas, null, 1));

// ---------- 坛经 ----------
const tanTitles = ['行由品第一','般若品第二','疑問品第三','定慧品第四','坐禪品第五','懺悔品第六','機緣品第七','頓漸品第八','護法品第九','付囑品第十'];
const tanFiles = ['01','02','03','04','05','06','08','09','10','11'];
const tanjing = [];
for (let i = 0; i < 10; i++) {
  const lines = read(`tan_${tanFiles[i]}.txt`);
  let k = lines[0] && lines[0].includes(tanTitles[i].slice(0, 2)) ? 1 : 0;
  const paras = lines.slice(k).filter(l => !BAD.some(r => r.test(l))).map(T);
  tanjing.push({ title: T(tanTitles[i]), note: '', paras });
  console.log(T(tanTitles[i]), paras.length, '段', paras.join('').length, '字');
}
fs.writeFileSync('data/raw/tanjing_parsed.json', JSON.stringify(tanjing, null, 1));
console.log('坛经总字数:', tanjing.reduce((a, c) => a + c.paras.join('').length, 0));

// ---------- 楞伽经 ----------
// 每卷以「楞伽阿跋多羅寶經卷第N」起（卷一文件前附蒋之奇/苏轼两篇序，从卷题行截入），
// 卷尾复现卷题一行，卷内另有译者行与品题行。
const lqTitles = { '01': '卷第一', '02': '卷第二', '03': '卷第三', '04': '卷第四' };
const lengqie = [];
for (const f of Object.keys(lqTitles)) {
  const lines = read(`lengqie_${f}.txt`);
  const s = lines.findIndex(l => /^楞伽阿跋多羅寶經卷第[一二三四]$/.test(l));
  const paras = lines.slice(s + 1)
    .filter(l => !/^楞伽阿跋多羅寶經卷第/.test(l))
    .filter(l => l !== '宋天竺三藏求那跋陀羅譯')
    .filter(l => !/^一切佛語心品/.test(l))
    .filter(l => !BAD.some(r => r.test(l)))
    .map(T);
  const pin = lines.find(l => /^一切佛語心品/.test(l));
  lengqie.push({ title: T(pin), note: lqTitles[f], paras });
  console.log('楞伽经', lqTitles[f], T(pin), paras.length, '段', paras.join('').length, '字');
}
fs.writeFileSync('data/raw/lengqie_parsed.json', JSON.stringify(lengqie, null, 1));
console.log('楞伽经总字数:', lengqie.reduce((a, c) => a + c.paras.join('').length, 0));
