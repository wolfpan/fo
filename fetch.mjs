import { writeFileSync } from 'fs';
const API = 'https://zh.wikisource.org/w/api.php';
const jobs = {
  'jingang': ['金剛般若波羅蜜經 (鳩摩羅什)'],
  'xinjing': ['般若波羅蜜多心經 (玄奘)'],
  'tan': ['六祖壇經/行由品','六祖壇經/般若品','六祖壇經/疑問品','六祖壇經/定慧品','六祖壇經/坐禪品','六祖壇經/懺悔品','六祖壇經/機緣品','六祖壇經/頓漸品','六祖壇經/護法品','六祖壇經/付囑品'],
};
function stripHtml(html) {
  let h = html;
  h = h.replace(/<!--[\s\S]*?-->/g, '');
  const m = h.match(/<div class="mw-parser-output">([\s\S]*)/);
  if (m) h = m[1];
  h = h.replace(/<(style|script|table|sup)[\s\S]*?<\/\1>/gi, '');
  h = h.replace(/<div class="(?:mw-editsection|noprint|licenseContainer|header_notes|marge)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  h = h.replace(/<div class="ws-noexport[\s\S]*?<\/div>/gi, '');
  h = h.replace(/<span class="pagenum[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '');
  h = h.replace(/<span class="mw-ref[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '');
  h = h.replace(/<div class="[\w-]*headertemplate[\s\S]*?<\/div>/gi, '');
  h = h.replace(/<(p|div|h[1-6]|li|br)[^>]*>/gi, '\n');
  h = h.replace(/<[^>]+>/g, '');
  h = h.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  h = h.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  return h;
}
for (const [group, pages] of Object.entries(jobs)) {
  let idx = 0;
  for (const p of pages) {
    const url = API + '?action=parse&page=' + encodeURIComponent(p) + '&prop=text&formatversion=2&format=json&utf8=';
    const res = await fetch(url, { headers: { 'User-Agent': 'SutraSite/1.0 (research)' } });
    const j = await res.json();
    if (j.error) { console.log('ERR', p, j.error.code); continue; }
    const lines = stripHtml(j.parse.text);
    idx++;
    writeFileSync(`data/raw/${group}_${String(idx).padStart(2,'0')}.txt`, lines.join('\n'));
    console.log('OK', p, '->', group + '_' + String(idx).padStart(2,'0'), lines.join('').length, 'chars,', lines.length, 'lines');
  }
}
