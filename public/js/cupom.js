/* Janela "Tenho um cupom". O servidor confere e aplica tudo (créditos, cota extra, desconto, uso ilimitado);
   aqui só mandamos o código e mostramos a resposta. Abre também por link: /gerar?cupom=CODIGO (só preenche, não resgata sozinho).
   Depende do botão #cupbtn da página do gerador. */
(function () {
  if (window.__cupom) return; window.__cupom = true;
  var btn, box, input, msg, go, last;

  function css() {
    var s = document.createElement('style');
    s.textContent = [
      '.cup-back{position:fixed;inset:0;z-index:2147483100;background:rgba(10,8,25,.55);display:grid;place-items:center;padding:16px}',
      '.cup-back[hidden]{display:none}',
      '.cup-box{width:min(420px,100%);background:var(--panel,#fff);color:var(--text,#15131f);border:1px solid var(--line,#e4e2ef);border-radius:var(--r,16px);box-shadow:var(--shadow,0 12px 40px -12px rgba(30,20,80,.45));padding:20px;font:14px/1.5 var(--font,system-ui,sans-serif)}',
      '.cup-box h2{margin:0 0 4px;font-size:18px}.cup-box p{margin:0 0 14px;color:var(--muted,#6b6880);font-size:13px}',
      '.cup-row{display:flex;gap:8px}',
      '.cup-row input{flex:1;min-width:0;box-sizing:border-box;border:1px solid var(--line2,#cfcce1);border-radius:11px;padding:10px 12px;background:var(--panel2,#f1f0f8);color:inherit;font:600 15px var(--mono,ui-monospace,monospace);letter-spacing:.06em;text-transform:uppercase}',
      '.cup-row input:focus{outline:2px solid var(--accent,#7c5cff)}',
      '.cup-go{border:0;border-radius:11px;padding:10px 16px;font:700 14px var(--font,system-ui,sans-serif);cursor:pointer;color:#fff;background:var(--grad,linear-gradient(115deg,#7c5cff,#ff4f9a))}',
      '.cup-go:disabled{opacity:.55;cursor:default}',
      '.cup-msg{margin-top:12px;border-radius:11px;padding:9px 12px;font-size:13.5px}.cup-msg:empty{display:none}',
      '.cup-msg.ok{background:var(--ok-bg,#e8f8ef);color:var(--ok,#0f8a4f)}.cup-msg.bad{background:var(--bad-bg,#fdebee);color:var(--bad,#c62839)}',
      '.cup-close{margin-top:14px;background:none;border:0;color:var(--muted,#6b6880);cursor:pointer;font:600 13px var(--font,system-ui,sans-serif);padding:4px 0}',
      '.cup-close:hover{color:var(--text,#15131f)}'
    ].join('\n');
    document.head.appendChild(s);
  }
  function mk(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  function build() {
    box = mk('div', 'cup-back'); box.hidden = true;
    var d = mk('div', 'cup-box'); d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'cup-t');
    var h = mk('h2', '', 'Resgatar cupom'); h.id = 'cup-t';
    d.appendChild(h); d.appendChild(mk('p', '', 'Digite o código que você recebeu. Pode ser crédito de presente, mais créditos por dia, desconto ou uso ilimitado por um tempo.'));
    var row = mk('div', 'cup-row');
    input = mk('input'); input.type = 'text'; input.maxLength = 40; input.autocomplete = 'off'; input.spellcheck = false; input.autocapitalize = 'characters'; input.placeholder = 'CÓDIGO'; input.setAttribute('aria-label', 'Código do cupom');
    go = mk('button', 'cup-go', 'Resgatar'); go.type = 'button';
    row.appendChild(input); row.appendChild(go); d.appendChild(row);
    msg = mk('div', 'cup-msg'); msg.setAttribute('role', 'status'); d.appendChild(msg);
    var x = mk('button', 'cup-close', 'Fechar'); x.type = 'button'; d.appendChild(x);
    box.appendChild(d); document.body.appendChild(box);

    x.onclick = close;
    box.onclick = function (e) { if (e.target === box) close(); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !box.hidden) close(); });
    go.onclick = redeem;
    input.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); redeem(); } };
  }
  function open(code) {
    last = document.activeElement; box.hidden = false; msg.textContent = ''; msg.className = 'cup-msg';
    if (code) input.value = code; input.focus(); input.select();
  }
  function close() { box.hidden = true; if (last && last.focus) try { last.focus(); } catch (e) {} }
  function show(t, ok) { msg.textContent = t; msg.className = 'cup-msg ' + (ok ? 'ok' : 'bad'); }

  function redeem() {
    var code = input.value.trim();
    if (!code) { show('Digite o código do cupom.', false); input.focus(); return; }
    go.disabled = true; msg.textContent = ''; msg.className = 'cup-msg';
    fetch('/api/coupons/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
      .then(function (x) {
        if (x.ok) {
          show(x.j.message || 'Cupom aplicado!', true); input.value = '';
          if (x.j.credits) window.dispatchEvent(new CustomEvent('animae:credits', { detail: x.j.credits }));
        } else if (x.j.login) { close(); } // o auth.js abre a janela de entrar sozinho
        else show(x.j.error || 'Não consegui usar esse cupom (erro ' + x.status + ').', false);
      })
      .catch(function () { show('Sem conexão. Confira a internet e tente de novo.', false); })
      .then(function () { go.disabled = false; });
  }

  function init() {
    btn = document.getElementById('cupbtn'); if (!btn) return;
    css(); build();
    btn.addEventListener('click', function () { open(); });
    try { var c = new URLSearchParams(location.search).get('cupom'); if (c) open(c.replace(/[^A-Za-z0-9-]/g, '').slice(0, 40)); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
