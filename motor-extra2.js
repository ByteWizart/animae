/* Motor extra 2 (build 13): objetos de texto/etapas e pós-efeitos de cinema.
   Carregado DEPOIS de motor-extra.js. Usa os mesmos globais do motor (c, S, W, H, PN, clamp, lerp, eio, back, rr, dot, ln, txt).
   Tudo aqui é opcional: uma história sem estes campos sai exatamente como antes. */
(function () {
  'use strict';
  const sn = Math.sin, PI = Math.PI;
  window.ANIMAE_BUILD = 13;

  /* =================== OBJETOS NOVOS ===================
     bigtext   : título grande com contorno. {"t":"98","s":220,"color":"#ffd93b","sc":"#181622","sub":"OBJETOS","subColor":"#fff"}
                 "s" = altura da letra (px). Encolhe sozinho se passar de "w" (largura máx., padrão 960).
     highlight : marca-texto animado (faixa que desenha da esquerda p/ direita). {"w":600,"s":90,"color":"#ffd93b","dur":0.6}
     steps     : linha de etapas com bolinhas que acendem. {"steps":["Ideia","Roteiro","Voz","Vídeo"],"dur":4,"w":900}
                 "v" (0 a 1) fixa o progresso; sem "v" ele avança sozinho em "dur" segundos. */
  PN.bigtext = (p, s, k) => {
    const t = String(p.t == null ? '' : p.t), sz = p.s || 160;
    c.save();
    const f = z => `900 ${z}px "Arial Black",Impact,sans-serif`;
    let z = sz; c.font = f(z);
    const maxW = p.w || 960;
    while (c.measureText(t).width > maxW && z > 20) { z -= 4; c.font = f(z); }
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.lineWidth = z * .16; c.strokeStyle = p.sc || K; c.strokeText(t, 0, 0);
    c.fillStyle = p.color || '#ffd93b'; c.fillText(t, 0, 0);
    if (p.sub) {
      const z2 = Math.max(24, z * .34); c.font = f(z2); c.lineWidth = z2 * .16;
      c.strokeStyle = p.sc || K; c.strokeText(String(p.sub), 0, z * .62);
      c.fillStyle = p.subColor || '#ffffff'; c.fillText(String(p.sub), 0, z * .62);
    }
    c.restore();
  };

  PN.highlight = (p, s, k) => {
    const w = p.w || 600, h = p.s || 90, d = p.dur || .6, q = eio(k / d);
    c.save(); c.globalAlpha *= .85; c.fillStyle = p.color || '#ffd93b'; c.lineWidth = 0;
    c.beginPath();
    const x0 = -w / 2, wob = 5;
    c.moveTo(x0, -h / 2 + wob); c.lineTo(x0 + w * q, -h / 2 - wob); c.lineTo(x0 + w * q + 8, h / 2 + wob); c.lineTo(x0 - 6, h / 2 - wob);
    c.closePath(); c.fill(); c.restore();
  };

  PN.steps = (p, s, k) => {
    const L = Array.isArray(p.steps) && p.steps.length ? p.steps.map(String) : ['1', '2', '3'];
    const n = L.length, w = p.w || 900, dur = p.dur || 4;
    const v = p.v != null ? clamp(p.v) : clamp(k / dur), pos = v * (n - 1), r = Math.max(26, Math.min(56, w / n / 3.2));
    const xs = L.map((_, i) => n === 1 ? 0 : -w / 2 + w * i / (n - 1));
    c.save(); c.lineCap = 'round';
    // trilho
    c.lineWidth = r * .32; c.strokeStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.moveTo(xs[0], 0); c.lineTo(xs[n - 1], 0); c.stroke();
    // trilho preenchido
    c.strokeStyle = p.color || '#7a3bff'; c.lineWidth = r * .32; c.beginPath(); c.moveTo(xs[0], 0);
    c.lineTo(lerp(xs[0], xs[n - 1], pos / Math.max(1, n - 1)), 0); c.stroke();
    for (let i = 0; i < n; i++) {
      const on = pos >= i - .001, cur = pos >= i - .001 && pos < i + 1 - .001 && i < n - 1 || (i === n - 1 && pos >= n - 1 - .001);
      const pulse = cur ? 1 + .12 * sn(k * 8) : 1, rr_ = r * pulse;
      c.fillStyle = on ? (p.color || '#7a3bff') : '#e9e6f2'; c.lineWidth = 8; c.strokeStyle = K;
      c.beginPath(); c.arc(xs[i], 0, rr_, 0, 7); c.fill(); c.stroke();
      c.font = `900 ${r * 1.0}px "Arial Black",Impact,sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = on ? '#fff' : '#555'; c.fillText(String(i + 1), xs[i], 2);
      const z = Math.max(22, Math.min(46, w / n / 4.2));
      c.font = `900 ${z}px "Arial Black",Impact,sans-serif`; c.lineJoin = 'round'; c.lineWidth = z * .18; c.strokeStyle = K;
      c.strokeText(L[i], xs[i], r + z * 1.1); c.fillStyle = on ? '#ffffff' : 'rgba(255,255,255,.65)'; c.fillText(L[i], xs[i], r + z * 1.1);
    }
    c.restore();
  };

  /* =================== PÓS-EFEITOS (cinema) ===================
     No "style" (vale pro vídeo todo) ou dentro da cena (vale só nela; a cena ganha do style):
       "vignette":0.5          escurece os cantos (0 a 1)
       "grain":0.3             grão de filme (0 a 1)
       "scanlines":0.25        linhas de monitor (0 a 1)
       "grade":{"sat":1.2,"contrast":1.1,"bright":1,"hue":0}   correção de cor (precisa de navegador com ctx.filter: Chrome/Edge)
     Só no "style":
       "fadeIn":0.6            abre do preto em N segundos
       "fadeOut":0.8           fecha para o preto nos últimos N segundos
       "progress":{"color":"#ff5fa2","h":10,"y":0}   barra de progresso do vídeo (y = 0 topo, 1 base; padrão: topo) ou "progress":true */
  const _draw = drawFrame;
  const pick = (s, st, k) => (s && s[k] != null) ? s[k] : (st && st.style && st.style[k] != null ? st.style[k] : undefined);
  let _grainCv = null;
  const grainTile = () => {
    if (_grainCv) return _grainCv;
    const g = document.createElement('canvas'); g.width = g.height = 128; const x = g.getContext('2d'), im = x.createImageData(128, 128);
    let sd = 1234567; const rnd = () => (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < im.data.length; i += 4) { const v = rnd() * 255 | 0; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    x.putImageData(im, 0, 0); return (_grainCv = g);
  };

  window.drawFrame = drawFrame = function (st, t) {
    _draw(st, t);
    try {
      const sc = st && st.scenes, s = sc && (sc.find(q => t >= q.t0 && t < q.t1) || sc[sc.length - 1]);
      if (!s) return;
      const cvs = c.canvas, cw = cvs.width, ch = cvs.height, total = +st.total || (sc[sc.length - 1] || {}).t1 || 1;
      const sty = st.style || {};
      const gr = pick(s, st, 'grade'), vg = +pick(s, st, 'vignette') || 0, gn = +pick(s, st, 'grain') || 0, sl = +pick(s, st, 'scanlines') || 0;
      const fi = +sty.fadeIn || 0, fo = +sty.fadeOut || 0, pg = sty.progress;
      if (!gr && !vg && !gn && !sl && !fi && !fo && !pg) return;
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
      // correção de cor: redesenha o próprio quadro com filtro
      if (gr && typeof gr === 'object' && 'filter' in c) {
        const f = `saturate(${gr.sat ?? 1}) contrast(${gr.contrast ?? 1}) brightness(${gr.bright ?? 1}) hue-rotate(${gr.hue ?? 0}deg)`;
        const tmp = _tmpCv(cw, ch); tmp.getContext('2d').drawImage(cvs, 0, 0);
        c.filter = f; c.drawImage(tmp, 0, 0); c.filter = 'none';
      }
      if (vg > 0) {
        const g = c.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * .3, cw / 2, ch / 2, Math.hypot(cw, ch) * .58);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${clamp(vg) * .85})`);
        c.fillStyle = g; c.fillRect(0, 0, cw, ch);
      }
      if (sl > 0) {
        c.fillStyle = `rgba(0,0,0,${clamp(sl) * .35})`; const step = Math.max(3, Math.round(cw / 240));
        for (let y = 0; y < ch; y += step * 2) c.fillRect(0, y, cw, step);
      }
      if (gn > 0) {
        const tile = grainTile(), ox = (Math.floor(t * 24) * 37) % 128, oy = (Math.floor(t * 24) * 91) % 128;
        c.globalAlpha = clamp(gn) * .22; c.globalCompositeOperation = 'overlay';
        for (let y = -oy; y < ch; y += 128) for (let x = -ox; x < cw; x += 128) c.drawImage(tile, x, y);
        c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      }
      let fa = 0;
      if (fi > 0 && t < fi) fa = Math.max(fa, 1 - t / fi);
      if (fo > 0 && t > total - fo) fa = Math.max(fa, clamp((t - (total - fo)) / fo));
      if (fa > 0) { c.fillStyle = `rgba(0,0,0,${fa})`; c.fillRect(0, 0, cw, ch); }
      if (pg) {
        const o = typeof pg === 'object' ? pg : {}, hh = Math.max(2, (o.h || 10) * cw / W), y = (o.y || 0) * (ch - hh);
        c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, y, cw, hh);
        c.fillStyle = o.color || '#ff5fa2'; c.fillRect(0, y, cw * clamp(t / total), hh);
      }
      c.restore();
    } catch (e) { console.error('pós-efeitos:', e); }
  };
  let _tmp = null;
  function _tmpCv(w, h) { if (!_tmp) _tmp = document.createElement('canvas'); if (_tmp.width !== w || _tmp.height !== h) { _tmp.width = w; _tmp.height = h; } return _tmp; }
})();
