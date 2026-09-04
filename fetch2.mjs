import { writeFileSync } from 'fs';
const API = 'https://zh.wikisource.org/w/api.php';
const pages = [['六祖壇經/機緣品','tan_08'],['六祖壇經/頓漸品','tan_09'],['六祖壇經/護法品','tan_10'],['六祖壇經/付囑品','tan_11']];
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
  h = h.replace(/<(p|div|h[1-6]|li|br)[^>]*>/gi, '\n');
  h = h.replace(/<[^>]+>/g, '');
  h = h.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  h = h.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  return h;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const [p, out] of pages) {
  let done = false;
  for (let attempt = 0; attempt < 3 && !done; attempt++) {
    await sleep(20000);
    try {
      const url = API + '?action=parse&page=' + encodeURIComponent(p) + '&prop=text&formatversion=2&format=json&utf8=';
      const res = await fetch(url, { headers: { 'User-Agent': 'SutraSite/1.0 (research)' } });
      const text = await res.text();
      if (!text.startsWith('{')) { console.log('LIMIT', p); continue; }
      const j = JSON.parse(text);
      if (j.error) { console.log('ERR', p, j.error.code); continue; }
      const lines = stripHtml(j.parse.text);
      writeFileSync(`data/raw/${out}.txt`, lines.join('\n'));
      console.log('OK', p, '->', out, lines.join('').length, 'chars');
      done = true;
    } catch (e) { console.log('RETRY', p, e.message.slice(0,80)); }
  }
}
