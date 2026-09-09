const fs = require('fs');

const jingang = JSON.parse(fs.readFileSync('data/raw/jingang_parsed.json', 'utf8'));
const xinjing = JSON.parse(fs.readFileSync('data/raw/xinjing_parsed.json', 'utf8'));
const tanjing = JSON.parse(fs.readFileSync('data/raw/tanjing_parsed.json', 'utf8'));
const lengqie = JSON.parse(fs.readFileSync('data/raw/lengqie_parsed.json', 'utf8'));

const sutras = [
  {
    id: 'xinjing',
    title: '般若波罗蜜多心经',
    shortTitle: '心经',
    sanskrit: 'Prajñāpāramitā Hṛdaya',
    dynasty: '唐',
    translator: '玄奘 奉诏译',
    era: '公元 649 年',
    desc: '六百卷《大般若经》之精髓髓，二百六十字涵摄五蕴皆空之理，是流传最广的佛经短章。',
    quote: '色不异空，空不异色；色即是空，空即是色。',
    chapters: [{ title: '全一卷', note: '', paras: xinjing }],
    image: '/assets/raw/img_1.jpg',
    accent: '#b3925f',
  },
  {
    id: 'jingang',
    title: '金刚般若波罗蜜经',
    shortTitle: '金刚经',
    sanskrit: 'Vajracchedikā Prajñāpāramitā Sūtra',
    dynasty: '姚秦',
    translator: '鸠摩罗什 译',
    era: '公元 401 年前后',
    desc: '般若部之要典，三十二分层层破执，如金刚断一切妄，昭示「应无所住而生其心」之旨。',
    quote: '凡所有相，皆是虚妄。若见诸相非相，即见如来。',
    chapters: jingang,
    image: '/assets/raw/img_6.jpg',
    accent: '#8f9a7a',
  },
  {
    id: 'tanjing',
    title: '六祖大师法宝坛经',
    shortTitle: '坛经',
    sanskrit: 'Liùzǔ Tánjīng',
    dynasty: '唐',
    translator: '六祖惠能 说 · 法海 记',
    era: '约公元 713 年',
    desc: '唯一被称为「经」的中国僧人著述，十品记曹溪法门，直指人心，见性成佛。',
    quote: '菩提自性，本来清净，但用此心，直了成佛。',
    chapters: tanjing,
    image: '/assets/raw/img_3.jpg',
    accent: '#9a7f6b',
  },
  {
    id: 'lengqie',
    title: '楞伽阿跋多罗宝经',
    shortTitle: '楞伽经',
    sanskrit: 'Laṅkāvatāra Sūtra',
    dynasty: '刘宋',
    translator: '求那跋陀罗 译',
    era: '公元 443 年',
    desc: '禅门开山之典。达磨西来，以此经四卷印心；四卷记佛在楞伽山答大慧菩萨百八问，唱「诸法唯是自心所现」，说五法三自性、八识二无我。',
    quote: '世间离生灭，犹如虚空华；智不得有无，而兴大悲心。',
    chapters: lengqie,
    image: '/assets/raw/img_24.jpg',
    accent: '#7e8a96',
  },
];

fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/sutras.json', JSON.stringify(sutras, null, 1));
const total = sutras.reduce((a, s) => a + s.chapters.reduce((b, c) => b + c.paras.join('').length, 0), 0);
console.log('OK 四部经典装配完成，总字数', total);
