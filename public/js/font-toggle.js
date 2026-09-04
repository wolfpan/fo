/* 般若藏 · 全局字体切换（行书 ↔ 正楷） */
(function () {
  'use strict';
  const KEY = 'fo-font';

  function current() { return localStorage.getItem(KEY) === 'kai' ? 'kai' : 'xing'; }
  function apply() { document.documentElement.classList.toggle('font-kai', current() === 'kai'); }
  function toggle() {
    localStorage.setItem(KEY, current() === 'kai' ? 'xing' : 'kai');
    apply();
    render();
  }

  function makeBtn(cls) {
    const b = document.createElement('button');
    b.className = cls;
    b.id = 'fontToggle';
    b.title = '切换 行书 / 正楷';
    b.addEventListener('click', toggle);
    return b;
  }

  function render() {
    document.querySelectorAll('#fontToggle').forEach(b => {
      b.textContent = current() === 'kai' ? '楷' : '行';
      b.classList.toggle('on', current() === 'kai');
    });
  }

  function boot() {
    apply();
    // 首页顶栏
    const nav = document.querySelector('.topnav');
    if (nav) nav.appendChild(makeBtn('font-pill'));
    // 阅读页工具栏（置于最右）
    const tools = document.querySelector('.reader-tools');
    if (tools) tools.appendChild(makeBtn('tool-btn'));
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
