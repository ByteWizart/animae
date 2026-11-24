/* Graveto: o boneco-guia do gerador.
   Ele é desenhado pelo mesmo motor dos vídeos (função figure() do index.html), num canvas próprio,
   então tem o mesmo traço, os mesmos olhos e a mesma boca que falam nos shorts.
   Carregue DEPOIS do script principal do index.html: usa c, K, CUR, figure, safe, POSEX e busy.
   - Abre sozinho na primeira visita (localStorage "sa-guia"); o link "Tutorial" da barra abre de novo.
   - Para mudar os passos, edite a lista STEPS abaixo. */
(function () {
  'use strict';
  var KEY = 'sa-guia', CPS = 55;
  var RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  var STEPS = [
    { t: 'Oi! Eu sou o Graveto.', x: 'Vou mostrar como fazer um short animado. São poucos passos e leva menos de um minuto.', pose: 'wave', mood: 'grin' },
    { t: 'Comece pela ideia', x: 'Escreva o assunto em uma ou duas frases e clique em Gerar roteiro. A IA escreve o texto e monta as cenas.', target: '#s1', mark: 'idea' },
    { t: 'Confira o roteiro', x: 'Este é o texto que a voz vai ler. Você pode editar, ou pedir mudanças à IA em Melhorar com a IA.', target: '#script' },
    { t: 'Escolha uma voz', x: 'Selecione a voz e clique em Gerar voz. O roteiro vira narração na hora.', target: '#voz', mood: 'grin' },
    { t: 'Veja a prévia', x: 'Clique em Ajustar ao áudio e depois em Prévia. O vídeo toca aqui, na prévia.', target: '#stage' },
    { t: 'Grave o vídeo', x: 'Gostou? Clique em Gerar vídeo. Ele é gravado em tempo real, então deixe esta aba aberta até o arquivo baixar.', target: '#s3' },
    { t: 'Avançado', x: 'Quer usar a sua própria gravação ou editar o JSON da história? Fica tudo em Avançado, aqui embaixo.', target: '#advanced', open: true, pose: 'think', mood: 'deadpan' },
    { t: 'Pronto!', x: 'É isso. Para rever o tutorial, toque em Tutorial no topo da página. Bom vídeo!', pose: 'cheer', mood: 'laugh', mark: 'heart', top: true }
  ];

  var css = [
    ':root{--gink:#181622}:root[data-theme=dark]{--gink:#f5f3ff}',
    '.guia{position:fixed;right:18px;bottom:14px;z-index:70;display:flex;align-items:flex-end;max-width:min(480px,calc(100vw - 20px));pointer-events:none;transition:transform .35s cubic-bezier(.2,1,.3,1),opacity .25s}',
    '.guia[hidden]{display:none}.guia>*{pointer-events:auto}',
    '.guia.away{opacity:0;transform:translateY(30px);pointer-events:none}',
    '.guia.in{animation:gin .45s cubic-bezier(.2,1.3,.4,1)}@keyframes gin{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:none}}',
    '.gbub{position:relative;flex:1;min-width:0;background:var(--panel);color:var(--text);border:2.5px solid var(--gink);border-radius:18px;padding:14px 16px 12px;margin:0 8px 50px 0;box-shadow:5px 5px 0 var(--gink);font-family:var(--font)}',
    '.gbub::after{content:"";position:absolute;right:-11.5px;bottom:24px;width:18px;height:18px;background:var(--panel);border-right:2.5px solid var(--gink);border-top:2.5px solid var(--gink);transform:rotate(45deg)}',
    '.gdots{display:flex;gap:5px;margin-bottom:9px}.gdots i{width:7px;height:7px;border-radius:99px;background:var(--line2);transition:width .2s,background .2s}.gdots i.on{width:18px;background:var(--accent)}',
    '.gtt{margin:0 0 5px;font-size:16px;letter-spacing:-.01em;line-height:1.25}',
    '.gx{margin:0;font-size:14px;line-height:1.5;cursor:default}.gx .b{visibility:hidden}',
    '.gbtns{display:flex;align-items:center;gap:8px;margin-top:12px}.gsp{flex:1}',
    '.page .guia .gskip{background:none;box-shadow:none;color:var(--muted);padding:6px 8px;font-weight:600}.page .guia .gskip:hover{color:var(--text);background:none;filter:none;transform:none}',
    '.page .gcv{width:150px;height:200px;flex:none;display:block;background:none;border-radius:0;aspect-ratio:auto}',
    'body.page.guia-on{padding-bottom:300px}',
    '.guia-hl{outline:3px solid var(--accent)!important;outline-offset:6px;border-radius:20px;animation:ghl 1.2s ease-out 1}#stage.guia-hl{border-radius:46px}',
    '@keyframes ghl{0%{outline-color:transparent;outline-offset:20px}45%{outline-color:var(--accent)}100%{outline-offset:6px}}',
    '@media(max-width:640px){.guia{left:8px;right:8px;bottom:8px;max-width:none}.page .gcv{width:96px;height:128px}.gbub{margin-bottom:24px;padding:12px 14px 10px}.gx{font-size:13.5px}.gbub::after{bottom:16px}body.page.guia-on{padding-bottom:260px}}',
    '@media(prefers-reduced-motion:reduce){.guia.in,.guia-hl{animation:none}.guia{transition:none}}'
  ].join('\n');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var box = document.createElement('div');
  box.className = 'guia'; box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Tutorial do Animaê');
  box.innerHTML = '<div class="gbub"><div class="gdots" aria-hidden="true"></div><h3 class="gtt"></h3><p class="gx" aria-live="polite"><span class="a"></span><span class="b"></span></p>' +
    '<div class="gbtns"><button type="button" class="gskip">Pular</button><span class="gsp"></span><button type="button" class="sec sm gback">Voltar</button><button type="button" class="sm gnext">Próximo</button></div></div>' +
    '<canvas class="gcv" width="300" height="400" aria-hidden="true"></canvas>';
  document.body.appendChild(box);

  var q = function (s) { return box.querySelector(s); };
  var G = q('.gcv').getContext('2d'), elT = q('.gtt'), elA = q('.gx .a'), elB = q('.gx .b'), dots = q('.gdots'), bNext = q('.gnext'), bBack = q('.gback');
  dots.innerHTML = STEPS.map(function () { return '<i></i>'; }).join('');

  var isOpen = false, cur = 0, actor = null, T0 = 0, sT0 = 0, shown = -1, hl = null, openedAdv = false, raf = 0;

  function seen() { try { localStorage.setItem(KEY, 'ok'); } catch (e) {} }
  function now() { return (performance.now() - T0) / 1000; }

  function actorFor(s, t) {
    var len = s.x.length;
    return {
      x: 150, y: 376, h: 230, floor: false, flip: true, color: '#7c5cff', outfit: 'hoodie', hair: 'swept', at: .05, anim: 'idle',
      seq: [{ t: t, anim: s.pose || 'guiaup', mood: s.mood || 'smile' }],
      talk: RM ? null : [t, t + len / CPS + .15],
      bubbles: s.mark ? [{ t: t + .35, end: t + 3.4, mark: s.mark }] : []
    };
  }

  /* o engine desenha no canvas global; aqui trocamos o contexto só durante o desenho do boneco */
  function draw(t) {
    var sc = c, sk = K, su = CUR;
    try {
      c = G; K = '#181622'; CUR = { hy: 900 };
      G.setTransform(1, 0, 0, 1, 0, 0); G.clearRect(0, 0, 300, 400);
      var g = G.createRadialGradient(150, 250, 20, 150, 250, 150); g.addColorStop(0, '#f6f2ff'); g.addColorStop(1, '#ddd2ff');
      G.fillStyle = g; G.beginPath(); G.arc(150, 250, 138, 0, 7); G.fill();
      safe(function () { figure(actor, t); });
    } finally { c = sc; K = sk; CUR = su; }
  }

  function clearHl() { if (hl) { hl.classList.remove('guia-hl'); hl = null; } }
  function closeAdv() { if (openedAdv) { var d = document.getElementById('advanced'); if (d) d.open = false; openedAdv = false; } }

  function go(i) {
    cur = Math.max(0, Math.min(STEPS.length - 1, i));
    var s = STEPS[cur];
    clearHl(); closeAdv();
    elT.textContent = s.t; shown = -1; sT0 = now();
    elA.textContent = RM ? s.x : ''; elB.textContent = RM ? '' : s.x;
    Array.prototype.forEach.call(dots.children, function (d, n) { d.className = n === cur ? 'on' : ''; });
    bBack.style.visibility = cur === 0 ? 'hidden' : 'visible';
    bNext.textContent = cur === 0 ? 'Começar' : cur === STEPS.length - 1 ? 'Fechar' : 'Próximo';
    q('.gskip').style.display = cur === STEPS.length - 1 ? 'none' : '';
    actor = actorFor(s, sT0);
    if (RM) draw(sT0 + 1.2);
    var el = s.target ? document.querySelector(s.target) : null;
    if (s.open) { var d = document.getElementById('advanced'); if (d && !d.open) { d.open = true; openedAdv = true; } }
    if (el) {
      hl = el; void el.offsetWidth; el.classList.add('guia-hl');
      var top = el.getBoundingClientRect().top + window.scrollY - 96;
      window.scrollTo({ top: Math.max(0, top), behavior: RM ? 'auto' : 'smooth' });
    } else if (s.top) { /* passo final: fica onde está */ } else { window.scrollTo({ top: 0, behavior: RM ? 'auto' : 'smooth' }); }
  }

  function skipTyping() { sT0 = now() - 60; }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (!isOpen) return;
    if (typeof busy !== 'undefined' && busy) { box.classList.add('away'); return; }
    box.classList.remove('away');
    var t = now();
    if (!RM) {
      var n = Math.min(STEPS[cur].x.length, Math.floor((t - sT0) * CPS));
      if (n !== shown) { shown = n; var x = STEPS[cur].x; elA.textContent = x.slice(0, n); elB.textContent = x.slice(n); }
      draw(t);
    }
  }

  function open(i) {
    if (isOpen) return;
    isOpen = true; T0 = performance.now(); box.hidden = false; box.classList.remove('in'); void box.offsetWidth; box.classList.add('in');
    document.body.classList.add('guia-on');
    go(i || 0);
    if (!raf) raf = requestAnimationFrame(loop);
    try { bNext.focus({ preventScroll: true }); } catch (e) {}
  }
  function close() {
    if (!isOpen) return;
    isOpen = false; box.hidden = true; clearHl(); closeAdv(); seen();
    document.body.classList.remove('guia-on');
    if (location.hash === '#tutorial') { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
    cancelAnimationFrame(raf); raf = 0;
  }

  bNext.onclick = function () { cur >= STEPS.length - 1 ? close() : go(cur + 1); };
  bBack.onclick = function () { go(cur - 1); };
  q('.gskip').onclick = close;
  q('.gx').onclick = skipTyping;
  document.addEventListener('keydown', function (e) {
    if (!isOpen) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight' && box.contains(document.activeElement)) bNext.click();
    else if (e.key === 'ArrowLeft' && box.contains(document.activeElement)) bBack.click();
  });
  var link = document.getElementById('tourlink');
  if (link) link.addEventListener('click', function (e) { e.preventDefault(); if (isOpen) go(0); else open(0); });

  /* pose própria do Graveto: braço erguido apontando para o alvo na página */
  if (typeof POSEX !== 'undefined' && !POSEX.guiaup) POSEX.guiaup = function (t, u) { return { AL: .3, AR: 2.2 + Math.sin(t * 3) * .07, bob: Math.abs(Math.sin(t * 2.2)) * u * .05 }; };

  function auto() {
    var first = true; try { first = localStorage.getItem(KEY) !== 'ok'; } catch (e) {}
    if (first || location.hash === '#tutorial') setTimeout(function () { if (!(typeof busy !== 'undefined' && busy)) open(0); }, 700);
  }
  if (document.readyState === 'complete') auto(); else window.addEventListener('load', auto);
  window.GuiaGraveto = { open: open, close: close };
})();
