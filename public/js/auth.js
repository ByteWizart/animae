/* Login com Supabase (e-mail e senha, Google opcional). Carregue no fim do <body> das páginas do gerador.
   - Lê a configuração em /api/config (a chave "anon" é pública por definição do Supabase).
   - Guarda a sessão no navegador, renova o token sozinho e envia "Authorization: Bearer" em todas as chamadas a /api/*
     (menos /api/admin, que tem senha própria). Se o servidor responder 401 com {login:true}, abre a janela de login.
   - Expõe window.Auth: { ready, user, required, open(), logout(), onChange(fn), rest(método, caminho, corpo, cabeçalhos) }. */
(function () {
  var KEY = 'animae.session', CFG = { enabled: false, required: false }, S = null, subs = [], origFetch = window.fetch.bind(window), refreshing = null;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  function load() { try { var j = JSON.parse(localStorage.getItem(KEY)); return j && j.access_token ? j : null; } catch (e) { return null; } }
  function store(s) { S = s; try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch (e) {} }
  function userOf(s) { var u = s && s.user; return u ? { id: u.id, email: u.email || '', name: (u.user_metadata && (u.user_metadata.name || u.user_metadata.full_name)) || '' } : null; }
  function notify() { var u = userOf(S); render(); subs.forEach(function (f) { try { f(u); } catch (e) { console.error(e); } }); }

  var MSG = [
    [/invalid login credentials|invalid_credentials/i, 'E-mail ou senha incorretos.'],
    [/email not confirmed/i, 'Confirme seu e-mail antes de entrar (veja a caixa de entrada e o spam).'],
    [/already registered|already been registered|user_already_exists/i, 'Esse e-mail já tem conta. Use "Entrar".'],
    [/password.*(short|least|weak)|weak_password/i, 'Senha fraca: use pelo menos 6 caracteres.'],
    [/rate limit|too many|over_email_send_rate_limit|429/i, 'Muitas tentativas. Espere um pouco e tente de novo.'],
    [/signups? not allowed|signup_disabled|disabled/i, 'Novos cadastros estão desativados neste site.'],
    [/invalid email|unable to validate email/i, 'E-mail inválido.'],
    [/failed to fetch|networkerror|load failed/i, 'Não consegui falar com o servidor de login. Confira a internet e tente de novo.'],
    [/same.*password|different from the old/i, 'A nova senha precisa ser diferente da atual.'],
  ];
  function nice(j, st) { var raw = (j && (j.error_description || j.msg || j.message || j.error || j.error_code)) || ('Erro ' + st); for (var i = 0; i < MSG.length; i++) if (MSG[i][0].test(raw + ' ' + (j && j.error_code || ''))) return MSG[i][1]; return String(raw); }
  function api(method, path, body, token) {
    return origFetch(CFG.url + path, { method: method, headers: Object.assign({ apikey: CFG.anonKey, 'Content-Type': 'application/json' }, (token || /^eyJ/.test(CFG.anonKey)) ? { Authorization: 'Bearer ' + (token || CFG.anonKey) } : {}), body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.text().then(function (t) { var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {} if (!r.ok) { var e = new Error(nice(j, r.status)); e.status = r.status; throw e; } return j || {}; }); });
  }
  function fromToken(j) { return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at ? j.expires_at * 1000 : Date.now() + (j.expires_in || 3600) * 1000, user: j.user }; }

  /* ---------- PKCE: o retorno do Google / e-mail só vale no navegador que iniciou o pedido ---------- */
  // Sem isso, um link forjado com o token do atacante no #hash poderia logar a vítima na conta dele (login CSRF).
  var PK = 'animae.pkce';
  function b64u(buf) { var s = ''; new Uint8Array(buf).forEach(function (b) { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function pkceStart(type) {
    if (!(window.crypto && crypto.subtle)) return Promise.reject(new Error('Este navegador não permite login seguro nesta página (use HTTPS).'));
    var v = b64u(crypto.getRandomValues(new Uint8Array(48)).buffer);
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)).then(function (h) {
      try { localStorage.setItem(PK, JSON.stringify({ v: v, type: type || '', t: Date.now() })); } catch (e) {}
      return b64u(h);
    });
  }
  function pkceTake() { try { var j = JSON.parse(localStorage.getItem(PK)); localStorage.removeItem(PK); return j && j.v && Date.now() - j.t < 3600e3 ? j : null; } catch (e) { return null; } }

  function ensureFresh() {
    if (!S) return Promise.resolve();
    if (S.expires_at - Date.now() > 60e3) return Promise.resolve();
    if (!refreshing) refreshing = api('POST', '/auth/v1/token?grant_type=refresh_token', { refresh_token: S.refresh_token })
      .then(function (j) { store(fromToken(j)); }).catch(function (e) { if (e.status >= 400 && e.status < 500) { store(null); notify(); } }).then(function () { refreshing = null; });
    return refreshing;
  }

  /* ---------- fetch com o token ---------- */
  var mine = function (u) { return typeof u === 'string' && u.indexOf('/api/') === 0 && u.indexOf('/api/admin') !== 0 && u.indexOf('/api/login') !== 0 && u.indexOf('/api/config') !== 0; };
  window.fetch = function (u, o) {
    var url = typeof u === 'string' ? u : (u && u.url) || '';
    if (!CFG.enabled || !mine(url)) return origFetch(u, o);
    return ensureFresh().then(function () {
      o = o || {}; if (S) { var h = {}; var src = o.headers || {}; if (src.forEach && typeof src.forEach === 'function' && !Array.isArray(src)) src.forEach(function (v, k) { h[k] = v; }); else for (var k in src) h[k] = src[k]; h.Authorization = 'Bearer ' + S.access_token; o = Object.assign({}, o, { headers: h }); }
      return origFetch(u, o);
    }).then(function (r) {
      if (r.status === 401) r.clone().json().then(function (j) { if (j && j.login) { if (S) { store(null); notify(); } open('login', 'Sua sessão terminou. Entre de novo para continuar.'); } }).catch(function () {});
      return r;
    });
  };

  /* ---------- interface ---------- */
  var modal, menuOpen = false;
  function render() {
    var nav = $('.topnav'); if (!nav || !CFG.enabled) return;
    var box = $('.acct', nav); if (!box) { box = document.createElement('div'); box.className = 'acct'; var tb = $('.themebtn', nav); nav.insertBefore(box, tb || null); }
    var u = userOf(S);
    if (!u) { box.innerHTML = '<button type="button" class="btn sm" data-a="login">Entrar</button>'; }
    else { var ini = esc((u.name || u.email || '?').trim().charAt(0).toUpperCase()); box.innerHTML = '<button type="button" class="avatar" data-a="menu" aria-haspopup="true" aria-expanded="' + menuOpen + '" title="' + esc(u.email) + '">' + ini + '</button>' + (menuOpen ? '<div class="amenu" role="menu"><div class="who"><b>' + esc(u.name || 'Minha conta') + '</b><span>' + esc(u.email) + '</span></div><button type="button" role="menuitem" data-a="logout">Sair da conta</button></div>' : ''); }
    var gate = $('#gate'); if (gate) gate.remove();
    if (CFG.required && !u) { var col = $('.col'); if (col) { var g = document.createElement('section'); g.id = 'gate'; g.className = 'gate'; g.innerHTML = '<div><b>Entre para gerar vídeos</b><span>Crie uma conta grátis para usar a IA, a voz e baixar seus vídeos. Suas histórias ficam salvas na sua conta.</span></div><button type="button" class="btn" data-a="signup">Criar conta grátis</button><button type="button" class="btn sec" data-a="login">Já tenho conta</button>'; col.insertBefore(g, $('.hero', col) ? $('.hero', col).nextSibling : col.firstChild); } }
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-a]');
    if (!b) { if (menuOpen && !e.target.closest('.acct')) { menuOpen = false; render(); } return; }
    var a = b.getAttribute('data-a');
    if (a === 'login' || a === 'signup') open(a); else if (a === 'menu') { menuOpen = !menuOpen; render(); } else if (a === 'logout') logout();
  });

  function open(mode, note) {
    if (!CFG.enabled) return; if (S && mode !== 'newpass') return;
    close(); modal = document.createElement('div'); modal.className = 'amodal'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', 'Entrar no Animaê');
    var m = mode || 'login';
    var title = { login: 'Entrar', signup: 'Criar conta', reset: 'Recuperar senha', newpass: 'Nova senha' }[m];
    modal.innerHTML = '<div class="abox"><button type="button" class="x" aria-label="Fechar">×</button><div class="logo"></div><h2>' + title + '</h2>' +
      (note ? '<p class="muted">' + esc(note) + '</p>' : '<p class="muted">' + ({ login: 'Entre para usar a IA, a voz e gerar seus vídeos.', signup: 'É grátis. Leva menos de um minuto.', reset: 'Enviamos um link para criar uma nova senha.', newpass: 'Escolha uma nova senha para a sua conta.' }[m]) + '</p>') +
      '<div class="amsg" role="alert" hidden></div><form novalidate>' +
      (m === 'signup' ? '<label class="f">Nome (opcional)<input name="name" autocomplete="name" maxlength="60"></label>' : '') +
      (m !== 'newpass' ? '<label class="f">E-mail<input name="email" type="email" autocomplete="email" required></label>' : '') +
      (m !== 'reset' ? '<label class="f">' + (m === 'newpass' ? 'Nova senha' : 'Senha') + '<input name="password" type="password" autocomplete="' + (m === 'login' ? 'current-password' : 'new-password') + '" minlength="6" required></label>' : '') +
      '<button type="submit" class="btn" style="width:100%">' + ({ login: 'Entrar', signup: 'Criar conta', reset: 'Enviar link', newpass: 'Salvar senha' }[m]) + '</button></form>' +
      (m === 'login' || m === 'signup' ? (CFG.google ? '<div class="or"><span>ou</span></div><button type="button" class="btn sec" data-g style="width:100%"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.1z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.8 2.3-8.3 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>Continuar com o Google</button>' : '') : '') +
      '<div class="alinks">' + (m === 'login' ? '<a href="#" data-m="reset">Esqueci a senha</a><a href="#" data-m="signup">Criar conta</a>' : m === 'signup' ? '<a href="#" data-m="login">Já tenho conta</a>' : m === 'reset' ? '<a href="#" data-m="login">Voltar</a>' : '') + '</div></div>';
    document.body.appendChild(modal); document.body.style.overflow = 'hidden';
    var form = $('form', modal), msg = $('.amsg', modal);
    function say(t, ok) { msg.hidden = !t; msg.textContent = t || ''; msg.className = 'amsg' + (ok ? ' ok' : ''); }
    modal.addEventListener('click', function (e) { if (e.target === modal || e.target.classList.contains('x')) { if (m !== 'newpass') close(); } var l = e.target.closest('[data-m]'); if (l) { e.preventDefault(); open(l.getAttribute('data-m')); } if (e.target.closest('[data-g]')) { pkceStart('oauth').then(function (ch) { location.href = CFG.url + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(location.origin + location.pathname) + '&code_challenge=' + ch + '&code_challenge_method=s256'; }).catch(function (er) { say(er.message); }); } });
    modal.addEventListener('keydown', function (e) { if (e.key === 'Escape' && m !== 'newpass') close(); });
    var first = $('input', modal); if (first) first.focus();
    form.addEventListener('submit', function (e) {
      e.preventDefault(); say('');
      var f = new FormData(form), email = String(f.get('email') || '').trim(), pw = String(f.get('password') || ''), name = String(f.get('name') || '').trim();
      if (m !== 'newpass' && !/^\S+@\S+\.\S+$/.test(email)) return say('Digite um e-mail válido.');
      if (m !== 'reset' && pw.length < 6) return say('A senha precisa ter pelo menos 6 caracteres.');
      var btn = $('button[type=submit]', form); btn.disabled = true;
      var p;
      if (m === 'login') p = api('POST', '/auth/v1/token?grant_type=password', { email: email, password: pw }).then(function (j) { store(fromToken(j)); done(); });
      else if (m === 'signup') p = pkceStart('signup').then(function (ch) { return api('POST', '/auth/v1/signup', { email: email, password: pw, data: name ? { name: name } : {}, code_challenge: ch, code_challenge_method: 's256' }); }).then(function (j) { if (j.access_token) { store(fromToken(j)); done(); } else say('Conta criada! Enviamos um e-mail de confirmação: clique no link e depois entre.', true); });
      else if (m === 'reset') p = pkceStart('recovery').then(function (ch) { return api('POST', '/auth/v1/recover?redirect_to=' + encodeURIComponent(location.origin + location.pathname), { email: email, code_challenge: ch, code_challenge_method: 's256' }); }).then(function () { say('Se esse e-mail tiver conta, o link já está a caminho.', true); });
      else p = api('PUT', '/auth/v1/user', { password: pw }, S && S.access_token).then(function () { say('Senha alterada!', true); setTimeout(close, 900); });
      p.catch(function (er) { say(er.message); }).then(function () { btn.disabled = false; });
    });
    function done() { close(); notify(); }
  }
  function close() { if (modal) { modal.remove(); modal = null; document.body.style.overflow = ''; } }
  function logout() {
    var t = S && S.access_token; menuOpen = false; store(null); notify();
    if (t) api('POST', '/auth/v1/logout', null, t).catch(function () {});
  }

  /* ---------- retorno de OAuth / link de e-mail (?code= do PKCE) ---------- */
  function fromUrl() {
    var q = new URLSearchParams(location.search), hq = new URLSearchParams(location.hash.slice(1));
    var err = q.get('error_description') || hq.get('error_description'), code = q.get('code'), legacy = location.hash.indexOf('access_token=') >= 0;
    if (!err && !code && !legacy) return null;
    ['code', 'error', 'error_code', 'error_description'].forEach(function (k) { q.delete(k); });
    try { history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q.toString() : '')); } catch (e) {} // tira código e tokens do endereço
    if (err) return { error: err.replace(/\+/g, ' ') };
    if (legacy) return { error: 'Esse tipo de link de acesso não é mais aceito. Entre com o seu e-mail e senha.' };
    return { code: code };
  }

  window.Auth = {
    ready: null,
    get user() { return userOf(S); }, get required() { return !!(CFG.enabled && CFG.required); }, get enabled() { return !!CFG.enabled; },
    open: open, logout: logout, onChange: function (f) { subs.push(f); },
    // Chamada ao banco do Supabase (PostgREST) com o token da pessoa logada; as regras RLS garantem que só vê o que é dela.
    rest: function (method, path, body, extra) {
      return ensureFresh().then(function () {
        if (!CFG.enabled || !S) throw new Error('Entre na sua conta.');
        return origFetch(CFG.url + '/rest/v1' + path, { method: method, headers: Object.assign({ apikey: CFG.anonKey, Authorization: 'Bearer ' + S.access_token, 'Content-Type': 'application/json' }, extra || {}), body: body === undefined ? undefined : JSON.stringify(body) });
      }).then(function (r) { return r.text().then(function (t) { var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {} if (!r.ok) throw new Error((j && (j.message || j.hint)) || 'Erro ' + r.status); return j; }); });
    },
  };

  window.Auth.ready = origFetch('/api/config').then(function (r) { return r.json(); }).then(function (c) {
    CFG = Object.assign({ enabled: false, required: false }, c.auth || {});
    if (!CFG.enabled) return;
    var h = fromUrl(); S = load();
    var chain = Promise.resolve();
    if (h && h.error) chain = chain.then(function () { open('login', h.error); });
    else if (h && h.code && !S) {
      var pk = pkceTake();
      chain = pk
        ? api('POST', '/auth/v1/token?grant_type=pkce', { auth_code: h.code, code_verifier: pk.v }).then(function (j) { store(fromToken(j)); if (pk.type === 'recovery') setTimeout(function () { open('newpass'); }, 50); }).catch(function (er) { open('login', er.message || 'Link inválido ou expirado. Tente de novo.'); })
        : chain.then(function () { open('login', 'Esse link só funciona no mesmo navegador em que você pediu o acesso. Peça de novo.'); });
    }
    return chain.then(function () { return ensureFresh(); }).then(function () { notify(); });
  }).catch(function () {});
  document.addEventListener('DOMContentLoaded', function () { render(); });
})();
