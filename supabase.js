// Ponte com o Supabase (login + banco de dados), usando só a API HTTP: não precisa de nenhuma biblioteca.
//  - Login: o navegador conversa com o Auth do Supabase (chave pública "anon") e recebe um token (JWT).
//    O token vai no cabeçalho Authorization das chamadas ao nosso servidor, que o confere aqui (verify).
//  - Banco: as tabelas (veja supabase-schema.sql) usam RLS: cada pessoa só enxerga e altera as próprias linhas.
// A chave "service_role" é opcional, só existe no servidor e serve para o painel (listar usuários, gravar vídeos de qualquer um).

const cache = new Map(); // token -> { user, exp }  (evita perguntar ao Supabase a cada pedido)
const TTL = 60e3;

// Aceita os dois formatos de chave do Supabase:
//  - antigas (anon / service_role): são JWT ("eyJ...") e vão em apikey + Authorization: Bearer;
//  - novas (sb_publishable_... / sb_secret_...): NÃO são JWT, vão só no cabeçalho apikey (o Supabase recusa como Bearer).
// Um token de usuário (login) é sempre JWT e continua indo em Authorization.
const isJwt = k => /^eyJ/.test(k || '');
const hdr = (c, token, extra) => {
  const k = token || c.serviceKey || c.anonKey, h = { 'Content-Type': 'application/json', ...(extra || {}) };
  if (isJwt(k)) { h.apikey = c.anonKey; h.Authorization = 'Bearer ' + k; } else h.apikey = k;
  return h;
};

async function call(c, method, path, { token, body, extra, timeout = 10e3 } = {}) {
  const r = await fetch(c.url.replace(/\/+$/, '') + path, {
    method, headers: hdr(c, token, extra), body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeout),
  });
  const txt = await r.text();
  let j = null; try { j = txt ? JSON.parse(txt) : null; } catch {}
  return { ok: r.ok, status: r.status, json: j, headers: r.headers };
}

// Confere o token com o Supabase. Devolve { id, email, name } ou null.
async function verify(c, token) {
  if (!token || token.length > 4000) return null;
  const hit = cache.get(token);
  if (hit && hit.exp > Date.now()) return hit.user;
  try {
    const r = await call(c, 'GET', '/auth/v1/user', { token });
    if (!r.ok || !r.json || !r.json.id) { cache.delete(token); return null; }
    const user = { id: r.json.id, email: r.json.email || '', name: (r.json.user_metadata && (r.json.user_metadata.name || r.json.user_metadata.full_name)) || '' };
    cache.set(token, { user, exp: Date.now() + TTL });
    if (cache.size > 500) for (const [k, v] of cache) { if (v.exp < Date.now()) cache.delete(k); }
    return user;
  } catch { return null; }
}

// Grava uma linha numa tabela (PostgREST). Com token do usuário o RLS decide; sem token usa a service_role.
async function insert(c, table, row, token) {
  const r = await call(c, 'POST', '/rest/v1/' + table, { token, body: row, extra: { Prefer: 'return=minimal' } });
  return r.ok;
}

// Lista usuários (precisa da service_role).
async function listUsers(c, page = 1, perPage = 50) {
  if (!c.serviceKey) return { users: [], total: 0, needsKey: true };
  const r = await call(c, 'GET', `/auth/v1/admin/users?page=${page}&per_page=${perPage}`);
  if (!r.ok) throw new Error((r.json && (r.json.msg || r.json.message || r.json.error_description)) || 'Erro ' + r.status);
  const list = Array.isArray(r.json) ? r.json : (r.json && r.json.users) || [];
  const total = +(r.json && r.json.total) || +r.headers.get('x-total-count') || list.length;
  return { users: list.map(u => ({ id: u.id, email: u.email || '', provider: (u.app_metadata && u.app_metadata.provider) || '', createdAt: u.created_at, lastSignIn: u.last_sign_in_at, confirmed: !!(u.email_confirmed_at || u.confirmed_at) })), total };
}

// Testa a conexão: Auth no ar, provedores de login e se as tabelas do supabase-schema.sql (videos, stories, ai_config) existem.
async function health(c) {
  const out = { ok: false, auth: false, google: false, signup: true, autoconfirm: false, tables: {}, error: '' };
  try {
    const s = await call(c, 'GET', '/auth/v1/settings', { token: c.anonKey });
    if (!s.ok) { out.error = s.status === 401 || s.status === 403 ? 'A chave anon foi recusada pelo Supabase.' : 'O Auth respondeu com erro ' + s.status + '.'; return out; }
    out.auth = true;
    const j = s.json || {};
    out.google = !!(j.external && j.external.google); out.signup = !j.disable_signup; out.autoconfirm = !!j.mailer_autoconfirm;
    for (const t of ['videos', 'stories', 'ai_config']) {
      const r = await call(c, 'GET', `/rest/v1/${t}?select=id&limit=1`, { token: c.serviceKey || c.anonKey });
      out.tables[t] = r.ok ? true : (r.status === 401 || r.status === 403) ? 'rls' : false; // 'rls' = existe, mas as regras escondem as linhas (normal com a chave anon)
    }
    // Teste de verdade da chave secreta: lê a tabela ai_config, que SÓ a service_role / secret enxerga.
    // (Sem isso, "tabela encontrada" também aparece quando a chave foi recusada.)
    if (c.serviceKey) {
      const k = c.serviceKey, fmt = isJwt(k) ? 'antiga (eyJ...)' : /^sb_secret_/.test(k) ? 'nova (sb_secret_...)' : /^sb_publishable_/.test(k) ? 'PUBLISHABLE (errada: precisa ser a secret)' : /^eyJ/.test(c.anonKey) || !k ? 'desconhecida' : 'formato desconhecido';
      const r = await call(c, 'GET', '/rest/v1/ai_config?select=id&limit=1');
      out.serviceTest = { ok: r.ok, status: r.status, format: fmt, msg: (r.json && (r.json.message || r.json.hint || r.json.msg || r.json.error_description)) || '' };
    }
    out.ok = true;
  } catch (e) { out.error = e.name === 'TimeoutError' ? 'O Supabase demorou para responder.' : 'Não consegui falar com o Supabase (' + (e.cause && e.cause.code || e.message) + ').'; }
  return out;
}

module.exports = { verify, insert, listUsers, health, call };
