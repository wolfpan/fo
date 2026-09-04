/* ============================================================
   般若藏 · 梵音引擎（Web Audio 本地合成）
   五曲：晨钟 / 颂钵 / 空山 / 梵音 / 夜雨
   ============================================================ */
(function () {
  'use strict';

  const TRACKS = [
    { id: 'dawn', name: '晨钟', desc: '古寺大钟 · 远山风息' },
    { id: 'bowl', name: '颂钵', desc: '钵音袅袅 · 泛音相和' },
    { id: 'mount', name: '空山', desc: '山岚虚静 · 偶闻孤磬' },
    { id: 'drone', name: '梵音', desc: '低吟回荡 · 如海潮音' },
    { id: 'rain', name: '夜雨', desc: '檐雨点滴 · 钟声在远' },
  ];
  const TRACK_SECONDS = 150; // 每曲约两分半后自动换下一曲，循环往复

  let ctx = null;          // AudioContext
  let master = null;       // 主增益
  let wetIn = null;        // 混响输入
  let trackGain = null;    // 当前曲目增益（切曲淡出用）
  let playing = false;
  let trackIdx = 0;
  let volume = 0.75;
  let timers = [];         // setTimeout 句柄
  let live = [];           // 需要停止的持续声源
  let startedAt = 0;

  /* ---------- 基础图 ---------- */
  function ensureCtx() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = volume;

    // 合成混响：2.8 秒指数衰减白噪脉冲
    const conv = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.8);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
    }
    conv.buffer = ir;
    wetIn = ctx.createGain(); wetIn.gain.value = 0.9;
    const wetOut = ctx.createGain(); wetOut.gain.value = 0.55;

    master.connect(ctx.destination);
    wetIn.connect(conv); conv.connect(wetOut); wetOut.connect(ctx.destination);
  }

  /* ---------- 音色 ---------- */

  // 一记钟/钵：非谐波泛音 + 指数衰减，strike 感
  function bell(t, f0, dur, peak, muffle) {
    const partials = [[1, 1], [2.0, .48], [2.92, .3], [3.98, .2], [5.4, .1], [6.82, .06]];
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = muffle || 5200;
    lp.connect(trackGain); lp.connect(wetIn);
    partials.forEach(([ratio, amp]) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f0 * ratio * (1 + (Math.random() - .5) * 0.002);
      const g = ctx.createGain();
      const p = peak * amp;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(p, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur * (0.55 + 0.45 * (1 - amp)));
      o.connect(g); g.connect(lp);
      o.start(t); o.stop(t + dur + 0.2);
    });
  }

  // 持续音垫：两三个失谐正弦缓缓呼吸
  function pad(freqs, level, breatheHz) {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(level, ctx.currentTime + 6);
    const lfo = ctx.createOscillator(); lfo.frequency.value = breatheHz || 0.07;
    const lfoG = ctx.createGain(); lfoG.gain.value = level * 0.5;
    lfo.connect(lfoG); lfoG.connect(g.gain); lfo.start();
    g.connect(trackGain); g.connect(wetIn);
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = f * (1 + (i - 1) * 0.0015);
      const og = ctx.createGain(); og.gain.value = i === 0 ? 1 : 0.4;
      o.connect(og); og.connect(g);
      o.start();
      live.push(o);
    });
    live.push(lfo);
    return g;
  }

  // 循环噪声底（风 / 雨）
  function noise(kind) {
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02; // 简单棕化
      d[i] = kind === 'rain' ? w * 0.5 + last * 2.2 : last * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = ctx.createBiquadFilter();
    if (kind === 'rain') { f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.5; }
    else { f.type = 'lowpass'; f.frequency.value = 420; }
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(kind === 'rain' ? 0.05 : 0.045, ctx.currentTime + 5);
    if (kind === 'wind') { // 风的起伏
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
      const lg = ctx.createGain(); lg.gain.value = 260;
      lfo.connect(lg); lg.connect(f.frequency); lfo.start();
      live.push(lfo);
    }
    src.connect(f); f.connect(g); g.connect(trackGain);
    if (kind === 'rain') g.connect(wetIn);
    src.start();
    live.push(src);
  }

  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const now = () => ctx.currentTime;

  /* ---------- 曲目编排 ---------- */
  const SCENES = {
    dawn() { // 晨钟：大钟 98Hz，九至十四秒一响
      pad([49, 98, 147], 0.05, 0.05);
      noise('wind');
      (function strike() {
        bell(now() + 0.05, 98 + Math.random() * 4, 13, 0.5, 3800);
        later(strike, 9000 + Math.random() * 5000);
      })();
    },
    bowl() { // 颂钵：D 系泛音，六至十秒一轮
      pad([73.4, 146.8], 0.045, 0.08);
      const notes = [146.8, 220, 293.7, 146.8];
      let i = 0;
      (function strike() {
        bell(now() + 0.05, notes[i % notes.length], 16, 0.34, 3200);
        if (Math.random() < 0.35) bell(now() + 0.9, notes[(i + 2) % notes.length] * 2, 9, 0.1, 4200);
        i++;
        later(strike, 6000 + Math.random() * 4200);
      })();
    },
    mount() { // 空山：薄雾音垫 + 稀疏孤磬
      pad([110, 165, 220], 0.04, 0.045);
      noise('wind');
      (function strike() {
        bell(now() + 0.05, 660, 8, 0.1, 3000);
        later(strike, 14000 + Math.random() * 12000);
      })();
    },
    drone() { // 梵音：低频和声回荡 + 极疏低钟
      pad([65.4, 98, 130.8, 196], 0.055, 0.03);
      (function strike() {
        bell(now() + 0.05, 65.4, 18, 0.3, 2400);
        later(strike, 20000 + Math.random() * 10000);
      })();
    },
    rain() { // 夜雨：檐雨 + 远钟（闷）
      noise('rain');
      pad([87.3, 130.8], 0.035, 0.06);
      (function strike() {
        bell(now() + 0.05, 110, 12, 0.26, 1600);
        later(strike, 16000 + Math.random() * 9000);
      })();
    },
  };

  /* ---------- 播放控制 ---------- */
  function stopAll() {
    timers.forEach(clearTimeout); timers = [];
    live.forEach(n => { try { n.stop(); } catch (e) {} });
    live = [];
    if (trackGain) {
      const g = trackGain;
      g.gain.linearRampToValueAtTime(0, now() + 1.2);
      setTimeout(() => { try { g.disconnect(); } catch (e) {} }, 1500);
      trackGain = null;
    }
  }

  function playScene() {
    trackGain = ctx.createGain();
    trackGain.gain.value = 0;
    trackGain.gain.linearRampToValueAtTime(1, now() + 2.5);
    trackGain.connect(master);
    SCENES[TRACKS[trackIdx].id]();
    startedAt = Date.now();
    scheduleRotate();
  }

  function scheduleRotate() { // 列表循环：一曲约 150 秒后换下一曲
    later(() => {
      if (!playing) return;
      stopAll();
      trackIdx = (trackIdx + 1) % TRACKS.length;
      playScene();
      render();
    }, TRACK_SECONDS * 1000);
  }

  function start() {
    ensureCtx();
    if (ctx.state === 'suspended') ctx.resume();
    playing = true;
    playScene();
    render();
  }

  function stop() {
    playing = false;
    stopAll();
    render();
  }

  function toggle() { playing ? stop() : start(); }
  function skip(dir) {
    stopAll();
    trackIdx = (trackIdx + dir + TRACKS.length) % TRACKS.length;
    if (playing) playScene();
    render();
  }
  function setVolume(v) {
    volume = v;
    if (master) master.gain.linearRampToValueAtTime(v, now() + 0.3);
  }

  /* ---------- 底部控制条 ---------- */
  function buildDock() {
    if (document.getElementById('audioDock')) return;
    const dock = document.createElement('div');
    dock.id = 'audioDock';
    dock.innerHTML = `
      <button class="ad-ic" id="adToggle" title="开启 / 关闭梵音">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 3c-3.2 1.5-5 4-5 7.3 0 3.4 2 6 5 7.7 3-1.7 5-4.3 5-7.7C17 7 15.2 4.5 12 3z"/>
          <path d="M12 18v3M9 21h6"/>
        </svg>
      </button>
      <div class="ad-info">
        <span class="ad-name" id="adName">梵音</span>
        <span class="ad-desc" id="adDesc">点击钟钮 · 开启禅定之音</span>
      </div>
      <button class="ad-ic" id="adPrev" title="上一曲">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <button class="ad-ic" id="adNext" title="下一曲">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 6l6 6-6 6"/></svg>
      </button>
      <div class="ad-sep"></div>
      <input type="range" id="adVol" min="0" max="100" value="75" title="音量">
      <button class="ad-ic ad-close" id="adClose" title="收起梵音">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>`;
    document.body.appendChild(dock);

    dock.querySelector('#adToggle').addEventListener('click', toggle);
    dock.querySelector('#adPrev').addEventListener('click', () => skip(-1));
    dock.querySelector('#adNext').addEventListener('click', () => skip(1));
    dock.querySelector('#adVol').addEventListener('input', e => setVolume(e.target.value / 100));
    dock.querySelector('#adClose').addEventListener('click', () => { stop(); dock.classList.add('hide'); });
    render();
  }

  function render() {
    const dock = document.getElementById('audioDock');
    if (!dock) return;
    const name = dock.querySelector('#adName');
    const desc = dock.querySelector('#adDesc');
    const tg = dock.querySelector('#adToggle');
    if (playing) {
      const t = TRACKS[trackIdx];
      name.textContent = t.name;
      desc.textContent = t.desc + ' · 循环播放';
      tg.classList.add('on');
      tg.title = '关闭梵音';
    } else {
      name.textContent = '梵音';
      desc.textContent = '点击钟钮 · 开启禅定之音';
      tg.classList.remove('on');
      tg.title = '开启梵音';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildDock);
  } else {
    buildDock();
  }
})();
