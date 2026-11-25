/* Chat de suporte (botão flutuante). Qualquer pessoa escreve; só o administrador responde, pelo painel.
   - A conversa é identificada por um token aleatório guardado neste navegador: ninguém vê a conversa de outra pessoa.
   - Tudo que aparece é inserido como TEXTO (textContent), nunca como HTML.
   - Carregue no fim do <body>: <script src="js/suporte.js"></script> */
(function () {
  if (window.__suporte) return; window.__suporte = true;
  var KEY = 'animae.support', MAX = 1000, POLL_OPEN = 6000, POLL_IDLE = 45000;
  var st = { token: '', name: '', read: 0, msgs: [], open: false, closed: false, busy: false, timer: null };
  var el = {};

  function load() { try { var j = JSON.parse(localStorage.getItem(KEY)); if (j && /^[0-9a-f]{48}$/.test(j.t || '')) { st.token = j.t; st.name = String(j.n || '').slice(0, 40); st.read = j.r | 0; } } catch (e) {} }
  function save() { try { if (st.token) localStorage.setItem(KEY, JSON.stringify({ t: st.token, n: st.name, r: st.read })); } catch (e) {} }
  var last = function () { return st.msgs.length ? st.msgs[st.msgs.length - 1].i : 0; };
  var unread = function () { var n = 0; st.msgs.forEach(function (m) { if (m.f === 'a' && m.i > st.read) n++; }); return n; };

  function css() {
    var s = document.createElement('style');
    s.textContent = [
      '.sup-fab{position:fixed;right:18px;bottom:18px;z-index:2147483000;width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;display:grid;place-items:center;color:#fff;background:var(--grad,linear-gradient(115deg,#7c5cff,#ff4f9a));box-shadow:var(--glow,0 8px 28px -8px rgba(124,92,255,.55));transition:transform .15s}',
      '.sup-fab:hover{transform:translateY(-2px)}.sup-fab:focus-visible{outline:3px solid var(--accent,#7c5cff);outline-offset:3px}',
      '.sup-fab svg{width:26px;height:26px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
      '.sup-badge{position:absolute;top:-3px;right:-3px;min-width:20px;height:20px;padding:0 5px;border-radius:99px;background:var(--bad,#c62839);color:#fff;font:700 12px/20px var(--font,system-ui,sans-serif);text-align:center;border:2px solid var(--bg,#fff)}',
      '.sup-badge[hidden]{display:none}',
      '.sup-panel{position:fixed;right:18px;bottom:86px;z-index:2147483000;width:360px;max-width:calc(100vw - 24px);height:480px;max-height:calc(100vh - 110px);display:flex;flex-direction:column;background:var(--panel,#fff);color:var(--text,#15131f);border:1px solid var(--line,#e4e2ef);border-radius:var(--r,16px);box-shadow:var(--shadow,0 12px 32px -16px rgba(30,20,80,.3));overflow:hidden;font:14px/1.45 var(--font,system-ui,sans-serif)}',
      '.sup-panel[hidden]{display:none}',
      '.sup-head{display:flex;align-items:center;gap:10px;padding:13px 14px;background:var(--grad,linear-gradient(115deg,#7c5cff,#ff4f9a));color:#fff}',
      '.sup-head b{display:block;font-size:15px}.sup-head span{display:block;font-size:12px;opacity:.9}',
      '.sup-head button{margin-left:auto;background:rgba(255,255,255,.2);border:0;color:#fff;width:30px;height:30px;border-radius:9px;cursor:pointer;font-size:18px;line-height:1}',
      '.sup-head button:hover{background:rgba(255,255,255,.32)}',
      '.sup-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;background:var(--bg,#f6f5fb)}',
      '.sup-empty{margin:auto;text-align:center;color:var(--muted,#6b6880);font-size:13px;padding:0 10px}',
      '.sup-m{max-width:84%;padding:8px 11px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}',
      '.sup-m small{display:block;margin-top:3px;font-size:10.5px;opacity:.65}',
      '.sup-m.u{align-self:flex-end;background:var(--accent,#7c5cff);color:var(--accent-ink,#fff);border-bottom-right-radius:4px}',
      '.sup-m.a{align-self:flex-start;background:var(--panel,#fff);border:1px solid var(--line,#e4e2ef);border-bottom-left-radius:4px}',
      '.sup-m.a b{display:block;font-size:11px;color:var(--accent,#7c5cff);margin-bottom:2px}',
      '.sup-note{align-self:center;font-size:12px;color:var(--muted,#6b6880);background:var(--panel2,#f1f0f8);border-radius:99px;padding:3px 11px;text-align:center}',
      '.sup-form{border-top:1px solid var(--line,#e4e2ef);padding:10px;display:grid;gap:7px;background:var(--panel,#fff)}',
      '.sup-form input[type=text],.sup-form textarea{width:100%;box-sizing:border-box;border:1px solid var(--line2,#cfcce1);border-radius:11px;padding:8px 10px;background:var(--panel2,#f1f0f8);color:inherit;font:inherit;resize:none}',
      '.sup-form textarea{min-height:44px;max-height:110px}',
      '.sup-form input:focus,.sup-form textarea:focus{outline:2px solid var(--accent,#7c5cff);outline-offset:0}',
      '.sup-row{display:flex;gap:8px;align-items:center;justify-content:space-between}',
      '.sup-cnt{font-size:11.5px;color:var(--muted,#6b6880)}',
      '.sup-send{border:0;border-radius:11px;padding:8px 16px;font:700 13px var(--font,system-ui,sans-serif);cursor:pointer;color:#fff;background:var(--grad,linear-gradient(115deg,#7c5cff,#ff4f9a))}',
      '.sup-send:disabled{opacity:.55;cursor:default}',
      '.sup-err{color:var(--bad,#c62839);font-size:12.5px}.sup-err:empty{display:none}',
      '.sup-hp{position:absolute!important;left:-9999px!important;width:1px;height:1px;opacity:0}',
      '@media(max-width:480px){.sup-panel{right:8px;left:8px;bottom:80px;width:auto;max-width:none;height:calc(100vh - 100px)}.sup-fab{right:12px;bottom:12px}}',
      '@media(prefers-reduced-motion:reduce){.sup-fab{transition:none}}'
    ].join('\n');
    document.head.appendChild(s);
  }
  function mk(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  function build() {
    el.fab = mk('button', 'sup-fab'); el.fab.type = 'button'; el.fab.setAttribute('aria-label', 'Abrir o chat de suporte'); el.fab.setAttribute('aria-expanded', 'false');
    el.fab.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.5-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h7M8.5 14h4"/></svg>';
    el.badge = mk('span', 'sup-badge'); el.badge.hidden = true; el.badge.setAttribute('aria-hidden', 'true'); el.fab.appendChild(el.badge);

    el.panel = mk('section', 'sup-panel'); el.panel.hidden = true; el.panel.setAttribute('role', 'dialog'); el.panel.setAttribute('aria-label', 'Chat de suporte');
    var head = mk('div', 'sup-head'), t = mk('div'); t.appendChild(mk('b', '', 'Suporte')); t.appendChild(mk('span', '', 'Escreva sua dúvida. Responderemos aqui mesmo.'));
    el.x = mk('button', '', '×'); el.x.type = 'button'; el.x.setAttribute('aria-label', 'Fechar o chat');
    head.appendChild(t); head.appendChild(el.x);
    el.log = mk('div', 'sup-log'); el.log.setAttribute('role', 'log'); el.log.setAttribute('aria-live', 'polite');

    el.form = mk('form', 'sup-form'); el.form.noValidate = true;
    el.name = mk('input'); el.name.type = 'text'; el.name.maxLength = 40; el.name.placeholder = 'Seu nome (opcional)'; el.name.autocomplete = 'name'; el.name.setAttribute('aria-label', 'Seu nome (opcional)');
    el.hp = mk('input', 'sup-hp'); el.hp.type = 'text'; el.hp.name = 'website'; el.hp.tabIndex = -1; el.hp.autocomplete = 'off'; el.hp.setAttribute('aria-hidden', 'true');
    el.txt = mk('textarea'); el.txt.maxLength = MAX; el.txt.rows = 2; el.txt.placeholder = 'Escreva sua mensagem…'; el.txt.setAttribute('aria-label', 'Mensagem');
    el.err = mk('div', 'sup-err'); el.err.setAttribute('role', 'alert');
    var row = mk('div', 'sup-row'); el.cnt = mk('span', 'sup-cnt', '0/' + MAX); el.send = mk('button', 'sup-send', 'Enviar'); el.send.type = 'submit';
    row.appendChild(el.cnt); row.appendChild(el.send);
    el.form.appendChild(el.name); el.form.appendChild(el.hp); el.form.appendChild(el.txt); el.form.appendChild(el.err); el.form.appendChild(row);
    el.panel.appendChild(head); el.panel.appendChild(el.log); el.panel.appendChild(el.form);
    document.body.appendChild(el.panel); document.body.appendChild(el.fab);

    el.fab.onclick = function () { st.open ? close() : open(); };
    el.x.onclick = close;
    el.txt.oninput = function () { el.cnt.textContent = el.txt.value.length + '/' + MAX; };
    el.txt.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); el.form.requestSubmit ? el.form.requestSubmit() : submit(); } };
    el.form.onsubmit = function (e) { e.preventDefault(); submit(); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && st.open) { close(); el.fab.focus(); } });
  }

  var fmt = function (ms) { var d = new Date(ms), now = new Date(), h = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); return d.toDateString() === now.toDateString() ? h : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + h; };
  function render() {
    var atEnd = el.log.scrollHeight - el.log.scrollTop - el.log.clientHeight < 60;
    el.log.textContent = '';
    if (!st.msgs.length) el.log.appendChild(mk('div', 'sup-empty', 'Olá! Como podemos ajudar? Mande sua mensagem e volte depois para ver a resposta: ela fica salva neste navegador.'));
    st.msgs.forEach(function (m) {
      var b = mk('div', 'sup-m ' + m.f);
      if (m.f === 'a') b.appendChild(mk('b', '', 'Suporte'));
      b.appendChild(document.createTextNode(m.t)); b.appendChild(mk('small', '', fmt(m.at)));
      el.log.appendChild(b);
    });
    if (st.closed && st.msgs.length) el.log.appendChild(mk('div', 'sup-note', 'Conversa encerrada. Se precisar, é só escrever de novo.'));
    el.name.hidden = !!(st.token || st.msgs.length); if (st.name && !el.name.value) el.name.value = st.name;
    if (atEnd || st.open) el.log.scrollTop = el.log.scrollHeight;
    badge();
  }
  function badge() { var n = st.open ? 0 : unread(); el.badge.hidden = !n; el.badge.textContent = n > 9 ? '9+' : String(n); el.fab.setAttribute('aria-label', n ? 'Abrir o chat de suporte (' + n + ' resposta' + (n > 1 ? 's' : '') + ' nova' + (n > 1 ? 's' : '') + ')' : 'Abrir o chat de suporte'); }

  function fetchNew() {
    if (!st.token) return Promise.resolve();
    return fetch('/api/support/thread?after=' + last(), { headers: { 'X-Support-Token': st.token }, cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d) return;
      if (d.exists === false) { st.token = ''; st.msgs = []; st.read = 0; try { localStorage.removeItem(KEY); } catch (e) {} render(); return; } // a conversa foi apagada pelo suporte
      st.closed = !!d.closed;
      var fresh = (d.msgs || []).filter(function (m) { return m.i > last(); });
      if (fresh.length) { st.msgs = st.msgs.concat(fresh); }
      if (st.open) { st.read = last(); save(); }
      if (fresh.length || st.closed) render(); else badge();
    }).catch(function () {});
  }
  function schedule() {
    clearTimeout(st.timer);
    if (!st.token) return;
    st.timer = setTimeout(function () { (document.hidden ? Promise.resolve() : fetchNew()).then(schedule); }, st.open ? POLL_OPEN : POLL_IDLE);
  }

  function open() {
    st.open = true; el.panel.hidden = false; el.fab.setAttribute('aria-expanded', 'true');
    st.read = last(); save(); render(); el.txt.focus();
    fetchNew().then(schedule);
  }
  function close() { st.open = false; el.panel.hidden = true; el.fab.setAttribute('aria-expanded', 'false'); badge(); schedule(); }

  function submit() {
    if (st.busy) return;
    var text = el.txt.value.trim(); el.err.textContent = '';
    if (!text) { el.err.textContent = 'Escreva uma mensagem.'; el.txt.focus(); return; }
    st.busy = true; el.send.disabled = true;
    var body = { text: text, token: st.token || undefined, name: (el.name.value || st.name || '').trim() || undefined, website: el.hp.value };
    fetch('/api/support/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) { el.err.textContent = x.j.error || 'Não consegui enviar. Tente de novo.'; return; }
        if (x.j.token) { st.token = x.j.token; }
        if (body.name) st.name = body.name;
        if (x.j.msg) { st.msgs.push(x.j.msg); st.read = last(); }
        st.closed = false; save(); el.txt.value = ''; el.cnt.textContent = '0/' + MAX; render(); schedule();
      })
      .catch(function () { el.err.textContent = 'Sem conexão. Confira a internet e tente de novo.'; })
      .then(function () { st.busy = false; el.send.disabled = false; el.txt.focus(); });
  }

  function init() {
    if (document.querySelector('.sup-fab')) return;
    load(); css(); build(); render();
    if (st.token) { fetchNew().then(schedule); }
    document.addEventListener('visibilitychange', function () { if (!document.hidden && st.token) fetchNew(); });
    window.Suporte = { open: open, close: close };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
