// Servidor mínimo, sem dependências. Uso: node server.js  ->  http://localhost:3000
// Serve os arquivos estáticos e uma pequena API para o painel Admin (dados em dados.json).
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const SCHEMA = require('./schema.js');
const AI = require('./ai.js');
const PROV = require('./providers.js');
const SB = require('./supabase.js');
const TTS = require('./tts.js');

const dir = __dirname;
const PORT = +process.env.PORT || 3000;
const DATA_FILE = path.join(dir, 'dados.json');
const BUILD = 12;
const STARTED = Date.now();

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript', '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.sql': 'text/plain; charset=utf-8' };
// Arquivos que nunca são servidos pela web.
const PRIVATE = new Set(['dados.json', 'dados.json.tmp', 'server.js', 'ai.js', 'providers.js', 'tts.js', 'supabase.js', 'admin.html']);

/* ---------- dados ---------- */
const DEFAULTS = () => ({
  version: 1,
  settings: {
    look: 'cartoon', res: '720', fps: '30', historyLimit: 200,
    caption: { size: 110, color: '#ffffff', alt: '#ffd93b', y: 0.69, stroke: '#000000', upper: false },
  },
  auth: null,
  adminPath: null,
  ai: { enabled: true, provider: 'gemini', fallback: [], providers: {}, perHour: 20, maxTokens: 12000, extra: '' },
  tts: { enabled: true, perHour: 60, voice: 'pt-BR-FranciscaNeural' },
  supabase: { url: '', anonKey: '', serviceKey: '', required: true, google: false },
  history: [], aiLog: [], aiStats: { total: 0, ok: 0, fail: 0, ms: 0 },
});
let db = DEFAULTS();
function load() {
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')), base = DEFAULTS();
    db = { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}), caption: { ...base.settings.caption, ...((d.settings || {}).caption || {}) } }, ai: { ...base.ai, ...(d.ai || {}) }, tts: { ...base.tts, ...(d.tts || {}) }, supabase: { ...base.supabase, ...(d.supabase || {}) } };
    delete db.stories; // a biblioteca agora fica no navegador de cada usuário
    // migração: o formato antigo (uma única chave, da Groq) vira o provedor "groq" do novo formato
    const a = db.ai;
    a.providers = a.providers && typeof a.providers === 'object' ? a.providers : {};
    if (a.key || a.model || a.tpm) {
      const g = a.providers.groq = a.providers.groq || {};
      if (a.key && !g.key) g.key = a.key;
      if (a.model && a.model !== 'llama-3.3-70b-versatile' && !g.model) g.model = a.model;
      if (a.tpm && !g.tpm) g.tpm = a.tpm;
    }
    delete a.key; delete a.model; delete a.tpm;
    for (const k of Object.keys(a.providers)) if (!PROV.isId(k)) delete a.providers[k]; // provedores que saíram do catálogo (ex.: Cerebras, SambaNova, Hugging Face, GitHub Models)
    if (!PROV.isId(a.provider)) a.provider = PROV.IDS.find(id => PROV.PROVIDERS[id].env.some(e => process.env[e]) || (a.providers[id] && a.providers[id].key)) || 'gemini';
    a.fallback = Array.isArray(a.fallback) ? a.fallback.filter((id, i, arr) => PROV.isId(id) && id !== a.provider && arr.indexOf(id) === i) : [];
    if (a.maxTokens < 12000) a.maxTokens = 12000;
  } catch (e) { if (e.code !== 'ENOENT') console.warn('Aviso: dados.json ilegível, começando vazio (' + e.message + ')'); }
}
function save() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DATA_FILE);
}
load();

/* ---------- senha e sessões ---------- */
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString('hex');
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function setPassword(pw) { const salt = crypto.randomBytes(16).toString('hex'); db.auth = { salt, hash: hashPw(pw, salt) }; save(); }
function checkPassword(pw) {
  if (process.env.ADMIN_PASSWORD) return safeEq(pw, process.env.ADMIN_PASSWORD);
  return !!db.auth && safeEq(hashPw(pw, db.auth.salt), db.auth.hash);
}
let firstRunPassword = null;
if (!process.env.ADMIN_PASSWORD && !db.auth) {
  firstRunPassword = crypto.randomBytes(6).toString('base64url');
  setPassword(firstRunPassword);
}
const validPath = v => /^[a-z0-9][a-z0-9_-]{3,39}$/i.test(v) && !['api', 'ajuda', 'docs', 'index', 'admin'].includes(v.toLowerCase());
if (!db.adminPath) { db.adminPath = 'painel-' + crypto.randomBytes(5).toString('hex'); save(); }
const adminPath = () => (process.env.ADMIN_PATH && validPath(process.env.ADMIN_PATH) ? process.env.ADMIN_PATH : db.adminPath);
const sessions = new Map(); // token -> expira
const SESSION_MS = 8 * 3600e3;
const newSession = () => { const t = crypto.randomBytes(24).toString('hex'); sessions.set(t, Date.now() + SESSION_MS); return t; };
const cookieOf = req => Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')).filter(a => a[0]).map(a => [a[0], a.slice(1).join('=')]));
function isAdmin(req) {
  const t = cookieOf(req).sid, exp = t && sessions.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(t); return false; }
  return true;
}
const fails = new Map(); // ip -> {n, until}
const ipOf = req => req.socket.remoteAddress || '?';

/* ---------- utilidades HTTP ---------- */
const send = (res, code, obj, headers) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(headers || {}) }); res.end(JSON.stringify(obj)); };
function body(req, limit = 2e6) {
  return new Promise((ok, no) => {
    if (!/application\/json/i.test(req.headers['content-type'] || '')) return no({ code: 415, msg: 'Envie JSON (Content-Type: application/json).' });
    let n = 0; const ch = [];
    req.on('data', c => { n += c.length; if (n > limit) { no({ code: 413, msg: 'Corpo grande demais.' }); req.destroy(); } else ch.push(c); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(ch).toString('utf8') || '{}')); } catch { no({ code: 400, msg: 'JSON inválido.' }); } });
    req.on('error', () => no({ code: 400, msg: 'Falha ao ler.' }));
  });
}
const clampN = (v, a, b, d) => (typeof v === 'number' && isFinite(v) ? Math.max(a, Math.min(b, v)) : d);
const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').slice(0, max).trim();
const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(v) ? v : d);

function cleanSettings(s, cur) {
  const c = s.caption || {}, cc = cur.caption;
  return {
    look: SCHEMA.SET.look.has(s.look) ? s.look : cur.look,
    res: ['720', '1080'].includes(String(s.res)) ? String(s.res) : cur.res,
    fps: ['30', '60'].includes(String(s.fps)) ? String(s.fps) : cur.fps,
    historyLimit: Math.round(clampN(+s.historyLimit, 10, 2000, cur.historyLimit)),
    caption: {
      size: Math.round(clampN(+c.size, 50, 200, cc.size)), color: hex(c.color, cc.color), alt: hex(c.alt, cc.alt),
      y: clampN(+c.y, 0.05, 0.95, cc.y), stroke: hex(c.stroke, cc.stroke), upper: !!c.upper,
    },
  };
}
const publicSettings = () => db.settings;

/* ---------- Supabase: login e banco de dados ---------- */
// Variáveis de ambiente têm prioridade sobre o que foi salvo no painel.
function sbCfg() {
  const c = db.supabase, e = process.env;
  const url = (e.SUPABASE_URL || c.url || '').trim().replace(/\/+$/, '');
  const anonKey = (e.SUPABASE_ANON_KEY || e.SUPABASE_KEY || c.anonKey || '').trim();
  const serviceKey = (e.SUPABASE_SERVICE_KEY || e.SUPABASE_SERVICE_ROLE_KEY || c.serviceKey || '').trim();
  const required = e.REQUIRE_LOGIN !== undefined ? !/^(0|false|no|nao|não)$/i.test(e.REQUIRE_LOGIN) : c.required !== false;
  return { url, anonKey, serviceKey, required, google: !!c.google, enabled: !!(PROV_URL_OK(url) && anonKey) };
}
const PROV_URL_OK = u => !!PROV.validUrl(u);
const tokenOf = req => { const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || ''); return m ? m[1] : ''; };
// Usuário logado (ou null). Sem Supabase configurado, ninguém é "usuário" e o site funciona aberto, como antes.
const authUser = async req => { const c = sbCfg(); return c.enabled ? SB.verify(c, tokenOf(req)) : null; };
// Barra quem não entrou: devolve o usuário, ou responde 401 e devolve false. { user:null } quando o login não é exigido.
async function needLogin(req, res) {
  const c = sbCfg();
  if (!c.enabled || !c.required) return { user: await authUser(req) };
  const user = await authUser(req);
  if (!user) { send(res, 401, { error: 'Entre na sua conta para gerar vídeos.', login: true }); return false; }
  return { user };
}

/* ---------- provedores de IA ---------- */
const aiCfg = id => db.ai.providers[id] || {};
const provKey = id => { for (const e of PROV.PROVIDERS[id].env) if (process.env[e]) return process.env[e]; return aiCfg(id).key || ''; }; // variável de ambiente tem prioridade
const provFromEnv = id => PROV.PROVIDERS[id].env.some(e => process.env[e]);
const provAccount = id => { const P = PROV.PROVIDERS[id]; for (const e of (P.accountEnv || [])) if (process.env[e]) return process.env[e]; return aiCfg(id).account || ''; };
const provUrl = id => {
  const P = PROV.PROVIDERS[id];
  let u = (P.editableUrl && PROV.validUrl(aiCfg(id).url || '')) || P.url;
  if (P.account) u = provAccount(id) ? u.replace('{account}', encodeURIComponent(provAccount(id))) : '';
  return u;
};
const provModel = id => aiCfg(id).model || PROV.PROVIDERS[id].model;
const provExtra = id => (Array.isArray(aiCfg(id).extraModels) ? aiCfg(id).extraModels : []).filter(m => PROV.validModel(m) && m !== provModel(id));
const provTpm = id => aiCfg(id).tpm || PROV.PROVIDERS[id].tpm;
const provReady = id => { const P = PROV.PROVIDERS[id]; return !!(provUrl(id) && provModel(id) && (P.keyless || P.keyOptional || provKey(id))); };
// Um provedor vira uma ou mais entradas na cadeia: o modelo principal e, depois, os modelos de reserva do mesmo provedor.
const chainEntry = id => {
  const P = PROV.PROVIDERS[id], base = { pid: id, label: P.label, url: provUrl(id), key: provKey(id), tpm: provTpm(id), headers: P.headers, tune: P.tune };
  return [provModel(id), ...provExtra(id)].map((model, i) => ({ ...base, id: i ? id + '#' + model : id, model }));
};
// Ordem de tentativa: o provedor principal e, depois, os de reserva (só os que estão prontos para usar).
const aiChain = () => {
  let ids = [db.ai.provider, ...db.ai.fallback].filter((id, i, a) => PROV.isId(id) && a.indexOf(id) === i && provReady(id));
  if (!ids.length) ids = PROV.IDS.filter(id => provKey(id) && provReady(id)); // o principal não está pronto: usa qualquer provedor que já tenha chave
  return ids.flatMap(chainEntry);
};
const aiInfo = () => {
  const chain = aiChain(), top = chain[0];
  return {
    enabled: !!db.ai.enabled, perHour: db.ai.perHour, extra: db.ai.extra || '', provider: db.ai.provider, fallback: db.ai.fallback,
    store: { enabled: aiDbReady(), ok: aiDb.ok, error: aiDb.error },
    hasKey: chain.length > 0, active: [...new Set(chain.map(p => p.label))], model: top ? top.model : '', tpm: top ? top.tpm : 0,
    providers: PROV.IDS.map(id => {
      const P = PROV.PROVIDERS[id], k = provKey(id);
      return { id, label: P.label, families: P.families || [], onlyFree: !!P.onlyFree, needsAccount: !!P.account, account: P.account ? (aiCfg(id).account || '') : '', accountFromEnv: (P.accountEnv || []).some(e => process.env[e]), accountEnv: P.accountEnv || [], accountHelp: P.accountHelp || '', extraModels: Array.isArray(aiCfg(id).extraModels) ? aiCfg(id).extraModels : [],
        model: aiCfg(id).model || '', defaultModel: P.model, models: P.models, tpm: aiCfg(id).tpm || 0, defaultTpm: P.tpm, url: P.editableUrl ? (aiCfg(id).url || '') : '', defaultUrl: P.url,
        editableUrl: !!P.editableUrl, keyless: !!P.keyless, keyOptional: !!P.keyOptional, hasKey: !!k, keyHint: k ? '…' + k.slice(-4) : '', keyFromEnv: provFromEnv(id), env: P.env, signup: P.signup || '', free: P.free, ready: provReady(id) };
    }),
  };
};

// Pergunta ao próprio provedor quais modelos existem agora (GET /models). Se falhar, devolve a lista sugerida do catálogo.
const NOT_CHAT = /embed|whisper|tts|speech|transcri|rerank|moderation|guard|safety|dall-e|diffusion|image-gen|imagen|veo|lyria|audio|vision-preview|ocr|pixtral-large-embed/i;
async function listModels(id, onlyFree) {
  const P = PROV.PROVIDERS[id], fallback = (src, note) => ({ source: src, note, models: P.models.map(m => ({ id: m })) });
  const url = PROV.modelsUrl(P, provUrl(id));
  if (!url || !/^https?:/.test(url)) return fallback('static', 'Configure o endereço' + (P.account ? ' e o ID da conta' : '') + ' para carregar a lista do provedor.');
  const headers = { Accept: 'application/json', ...(P.headers || {}) }, k = provKey(id);
  if (k) headers.Authorization = 'Bearer ' + k;
  if (!k && !P.keyless && !P.keyOptional) return fallback('static', 'Cole a chave para carregar a lista completa de modelos do provedor.');
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15e3);
  try {
    const r = await fetch(url, { headers, signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return fallback('static', 'O provedor não deixou listar os modelos (' + r.status + '). Mostrando as sugestões; você pode digitar qualquer nome.');
    const raw = Array.isArray(j.data) ? j.data : Array.isArray(j.models) ? j.models : Array.isArray(j) ? j : [];
    let out = raw.map(m => {
      const mid = String(typeof m === 'string' ? m : (m.id || m.name || '')).replace(/^models\//, '');
      const pr = m && m.pricing, free = pr ? (+pr.prompt === 0 && +pr.completion === 0) || /:free$/.test(mid) : undefined;
      return { id: mid, free, ctx: m && (m.context_length || m.context_window || m.inputTokenLimit || 0) || 0 };
    }).filter(m => m.id && m.id.length <= 160 && !NOT_CHAT.test(m.id));
    if (P.onlyFree && onlyFree !== false) out = out.filter(m => m.free !== false && (m.free === true || m.id === 'openrouter/free'));
    if (P.onlyFree && !out.some(m => m.id === 'openrouter/free')) out.unshift({ id: 'openrouter/free', free: true, ctx: 0 });
    out = [...new Map(out.map(m => [m.id, m])).values()].sort((a, b) => a.id.localeCompare(b.id)).slice(0, 600);
    if (!out.length) return fallback('static', 'A lista veio vazia. Mostrando as sugestões.');
    return { source: 'live', note: out.length + ' modelos' + (P.onlyFree && onlyFree !== false ? ' gratuitos' : '') + ' disponíveis agora.', models: out };
  } catch (e) {
    return fallback('static', e.name === 'AbortError' ? 'O provedor demorou para responder a lista de modelos.' : 'Não consegui carregar a lista (sem internet?). Mostrando as sugestões.');
  } finally { clearTimeout(timer); }
}
// Aplica uma configuração de IA (vinda do painel ou de uma importação). Devolve o texto do erro, ou '' se deu certo.
function applyAi(b) {
  const a = db.ai;
  if (b.enabled !== undefined) a.enabled = !!b.enabled;
  if (typeof b.extra === 'string') a.extra = str(b.extra, 2000);
  if (b.perHour !== undefined) a.perHour = Math.round(clampN(+b.perHour, 1, 1000, a.perHour));
  if (typeof b.provider === 'string' && PROV.isId(b.provider)) a.provider = b.provider;
  if (Array.isArray(b.fallback)) a.fallback = b.fallback;
  a.fallback = a.fallback.filter((id, i, arr) => PROV.isId(id) && id !== a.provider && arr.indexOf(id) === i);
  if (b.providers && typeof b.providers === 'object') {
    for (const [id, v] of Object.entries(b.providers)) {
  if (!PROV.isId(id) || !v || typeof v !== 'object') continue;
  const P = PROV.PROVIDERS[id], c = a.providers[id] = a.providers[id] || {};
  if (typeof v.key === 'string' && v.key.trim()) c.key = v.key.trim().slice(0, 300);
  if (v.clearKey) delete c.key;
  if (typeof v.model === 'string') { const mm = v.model.trim(); if (!mm) delete c.model; else if (PROV.validModel(mm)) c.model = mm; else return 'Nome de modelo inválido em ' + P.label + ' (sem espaços ou aspas).'; }
  if (v.extraModels !== undefined) {
    const list = (Array.isArray(v.extraModels) ? v.extraModels : String(v.extraModels).split(/[\n,;]+/)).map(x => String(x).trim()).filter((x, i, arr) => x && PROV.validModel(x) && arr.indexOf(x) === i).slice(0, 6);
    if (list.length) c.extraModels = list; else delete c.extraModels;
  }
  if (P.account && typeof v.account === 'string') { const ac = v.account.trim(); if (!ac) delete c.account; else if (/^[A-Za-z0-9_-]{6,80}$/.test(ac)) c.account = ac; else return 'ID da conta inválido em ' + P.label + '.'; }
  if (v.tpm !== undefined) { const t = +v.tpm; if (!t) delete c.tpm; else c.tpm = Math.round(clampN(t, 3000, 2000000, P.tpm)); }
  if (P.editableUrl && typeof v.url === 'string') {
    const u = v.url.trim();
    if (!u) delete c.url;
    else { const ok = PROV.validUrl(u); if (!ok) return 'Endereço inválido para ' + P.label + ': use https:// (http:// só para localhost ou rede local).'; c.url = ok; }
  }
    }
  }
  return '';
}

/* ---------- configuração da IA no Supabase (tabela ai_config, veja supabase-schema.sql) ---------- */
// O banco guarda o provedor padrão, as reservas e, por provedor, o modelo, os modelos de reserva, o TPM e o endereço do "Outro".
// As chaves de API NÃO vão para o banco. Precisa da chave service_role; sem ela (ou sem Supabase) tudo fica só em dados.json, como antes.
const AI_ROW = '/rest/v1/ai_config';
const aiDb = { ok: null, error: '', at: 0, loading: null }; // ok: null = não usa o banco, true = sincronizado, false = deu erro
const aiDbReady = () => { const c = sbCfg(); return c.enabled && !!c.serviceKey; };
const aiDbErr = r => (r.status === 404 || (r.json && /PGRST205|42P01/.test(String(r.json.code || '')))) ? 'A tabela ai_config não existe: rode o supabase-schema.sql no SQL Editor do Supabase.'
  : r.status === 401 || r.status === 403 ? 'O Supabase recusou a chave service_role.' : (r.json && (r.json.message || r.json.hint)) || 'Erro ' + r.status + ' no Supabase.';
const aiDbCatch = e => e.name === 'TimeoutError' ? 'O Supabase demorou para responder.' : 'Não consegui falar com o Supabase (' + ((e.cause && e.cause.code) || e.message) + ').';
// O que vai para o banco: só o que não é segredo.
function aiPublic() {
  const out = {};
  for (const id of PROV.IDS) {
    const c = aiCfg(id), o = {};
    if (c.model) o.model = c.model;
    if (Array.isArray(c.extraModels) && c.extraModels.length) o.extraModels = c.extraModels;
    if (c.tpm) o.tpm = c.tpm;
    if (PROV.PROVIDERS[id].editableUrl && c.url) o.url = c.url;
    out[id] = o;
  }
  return out;
}
async function aiDbSave() {
  if (!aiDbReady()) { aiDb.ok = null; aiDb.error = ''; return false; }
  try {
    const r = await SB.call(sbCfg(), 'POST', AI_ROW + '?on_conflict=id', {
      body: { id: 1, provider: db.ai.provider, fallback: db.ai.fallback, providers: aiPublic(), updated_at: new Date().toISOString() },
      extra: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
    aiDb.ok = r.ok; aiDb.error = r.ok ? '' : aiDbErr(r); if (r.ok) aiDb.at = Date.now();
    return r.ok;
  } catch (e) { aiDb.ok = false; aiDb.error = aiDbCatch(e); return false; }
}
// Lê a configuração do banco e aplica por cima da local. Sem linha ainda (primeira vez), envia a configuração atual para o banco.
// Com force = false só consulta de novo depois de 30 s (vários servidores ou reinícios enxergam a mesma configuração).
function aiDbLoad(force) {
  if (!aiDbReady()) { aiDb.ok = null; aiDb.error = ''; return Promise.resolve(false); }
  if (!force && Date.now() - aiDb.at < 30e3) return Promise.resolve(aiDb.ok === true);
  if (aiDb.loading) return aiDb.loading;
  aiDb.loading = (async () => {
    try {
      const r = await SB.call(sbCfg(), 'GET', AI_ROW + '?id=eq.1&select=provider,fallback,providers');
      if (!r.ok) { aiDb.ok = false; aiDb.error = aiDbErr(r); return false; }
      const row = Array.isArray(r.json) ? r.json[0] : null;
      if (!row) return await aiDbSave();
      const a = db.ai, pv = row.providers && typeof row.providers === 'object' ? row.providers : {};
      if (PROV.isId(row.provider)) a.provider = row.provider;
      a.fallback = (Array.isArray(row.fallback) ? row.fallback : []).filter((id, i, arr) => PROV.isId(id) && id !== a.provider && arr.indexOf(id) === i);
      for (const id of PROV.IDS) {
        const v = pv[id] && typeof pv[id] === 'object' ? pv[id] : {}, P = PROV.PROVIDERS[id], c = a.providers[id] = a.providers[id] || {};
        if (typeof v.model === 'string' && PROV.validModel(v.model.trim())) c.model = v.model.trim(); else delete c.model;
        const xs = (Array.isArray(v.extraModels) ? v.extraModels : []).map(x => String(x).trim()).filter((x, i, arr) => x && PROV.validModel(x) && arr.indexOf(x) === i).slice(0, 6);
        if (xs.length) c.extraModels = xs; else delete c.extraModels;
        if (+v.tpm) c.tpm = Math.round(clampN(+v.tpm, 3000, 2000000, P.tpm)); else delete c.tpm;
        if (P.editableUrl) { const u = PROV.validUrl(v.url || ''); if (u) c.url = u; else delete c.url; }
      }
      save(); aiDb.ok = true; aiDb.error = ''; aiDb.at = Date.now();
      return true;
    } catch (e) { aiDb.ok = false; aiDb.error = aiDbCatch(e); return false; }
    finally { aiDb.loading = null; }
  })();
  return aiDb.loading;
}

// Registro de atividade da IA (últimos 200 usos) e totais, mostrados no painel.
function logAi(op, who, ok, ms, err) {
  db.aiLog = db.aiLog || []; db.aiStats = db.aiStats || { total: 0, ok: 0, fail: 0, ms: 0 };
  db.aiLog.unshift({ at: Date.now(), op, who: who || '', ok, ms, err: ok ? '' : String(err || '').slice(0, 300) }); db.aiLog.length = Math.min(db.aiLog.length, 200);
  const t = db.aiStats; t.total++; if (ok) { t.ok++; t.ms += ms; } else t.fail++;
}
const aiHits = new Map(); // ip -> [timestamps]
const ttsHits = new Map(); // ip -> [timestamps]
let ttsBusy = 0; const TTS_MAX_PARALLEL = 3;
const ttsInfo = () => ({ installed: TTS.available(), enabled: !!db.tts.enabled, perHour: db.tts.perHour, voice: db.tts.voice, maxChars: TTS.MAX_CHARS });

function status() {
  const expected = ['index.html', 'docs.html', 'admin.html', 'audio.js', 'schema.js', 'ai.js', 'providers.js', 'tts.js', 'ui.css', 'theme.js', 'favicon.svg', 'supabase.js', 'supabase-schema.sql', 'server.js', 'package.json', 'README.md', 'PROMPT-MOVIMENTOS.md', 'historia-teste.json', 'historia-demo-v9.json'];
  const files = expected.map(f => { try { const s = fs.statSync(path.join(dir, f)); return { name: f, ok: true, bytes: s.size, mtime: s.mtimeMs }; } catch { return { name: f, ok: false }; } });
  let dataBytes = 0; try { dataBytes = fs.statSync(DATA_FILE).size; } catch {}
  const byLook = {}; let secs = 0;
  db.history.forEach(h => { byLook[h.look] = (byLook[h.look] || 0) + 1; secs += h.duration || 0; });
  const byDay = []; // vídeos e segundos nos últimos 14 dias
  for (let d = 13; d >= 0; d--) { const t = new Date(); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() - d); byDay.push({ day: t.getTime(), n: 0 }); }
  db.history.forEach(h => { const t = new Date(h.at); t.setHours(0, 0, 0, 0); const e = byDay.find(x => x.day === t.getTime()); if (e) e.n++; });
  return {
    build: BUILD, node: process.version, platform: process.platform, port: PORT, uptime: Math.round((Date.now() - STARTED) / 1000),
    passwordFromEnv: !!process.env.ADMIN_PASSWORD, dataBytes, files,
    tts: ttsInfo(), counts: { videos: db.history.length, seconds: Math.round(secs), ideas: db.aiCount || 0 }, byLook,
    supabase: { enabled: sbCfg().enabled, required: sbCfg().required }, byDay, aiStats: db.aiStats || { total: 0, ok: 0, fail: 0, ms: 0 }, ai: aiInfo(), adminPath: adminPath(), adminPathFromEnv: !!process.env.ADMIN_PATH,
  };
}


/* ---------- ícones online (Iconify, API pública, sem chave) ---------- */
// Um proxy com cache em disco: o navegador pede /api/icon?q=rocket (ou ?id=noto:rocket) no mesmo endereço do site,
// então o desenho no canvas não "contamina" a gravação do vídeo, e cada ícone só é baixado uma vez.
const ICON_DIR = path.join(dir, '.cache-icones');
const ICON_API = 'https://api.iconify.design';
const ICON_SETS = ['noto', 'fluent-emoji-flat', 'twemoji', 'openmoji', 'flat-color-icons']; // 1º conjunto = estilo principal
const iconMiss = new Map(); // chave -> expira (cache negativo curto)
const iconHits = new Map(); // ip -> [timestamps] (só pedidos que vão à internet)
const iconFetch = async u => { const r = await fetch(u, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'animae' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return r; };
async function iconResolve(q) {
  for (const prefixes of [ICON_SETS[0], ICON_SETS.slice(1).join(',')]) {
    const j = await (await iconFetch(`${ICON_API}/search?query=${encodeURIComponent(q)}&prefixes=${prefixes}&limit=12`)).json();
    const ids = (j.icons || []).filter(i => /^[a-z0-9-]+:[a-z0-9-]+$/.test(i));
    if (ids.length) { // respeita a ordem de preferência dos conjuntos
      ids.sort((a, b) => ICON_SETS.indexOf(a.split(':')[0]) - ICON_SETS.indexOf(b.split(':')[0]));
      return ids[0];
    }
  }
  return null;
}
async function iconGet(q, id) {
  const key = id || 'q:' + q, file = path.join(ICON_DIR, crypto.createHash('sha1').update(key).digest('hex') + '.svg');
  try { return fs.readFileSync(file); } catch {}
  if ((iconMiss.get(key) || 0) > Date.now()) throw { code: 404, msg: 'Ícone não encontrado.' };
  try {
    const rid = id || await iconResolve(q);
    if (!rid) throw { code: 404, msg: 'Ícone não encontrado.' };
    const [pre, name] = rid.split(':');
    const svg = Buffer.from(await (await iconFetch(`${ICON_API}/${pre}/${name}.svg?height=256`)).arrayBuffer());
    if (!/<svg/i.test(svg.slice(0, 400).toString()) || svg.length > 300e3) throw new Error('SVG inválido');
    fs.mkdirSync(ICON_DIR, { recursive: true }); fs.writeFileSync(file, svg);
    return svg;
  } catch (e) {
    if (e && e.code) { iconMiss.set(key, Date.now() + 600e3); throw e; }
    console.warn('Ícone falhou:', key, e.message);
    throw { code: 502, msg: 'Não consegui buscar o ícone (sem internet ou serviço fora do ar).' };
  }
}

/* ---------- rotas da API ---------- */
async function api(req, res, p) {
  const m = req.method;
  try {
    if (p === '/api/settings' && m === 'GET') return send(res, 200, publicSettings());
    if (p === '/api/session' && m === 'GET') return send(res, 200, { admin: isAdmin(req), build: BUILD });

    if (p === '/api/login' && m === 'POST') {
      const ip = ipOf(req), f = fails.get(ip);
      if (f && f.until > Date.now()) return send(res, 429, { error: `Muitas tentativas. Aguarde ${Math.ceil((f.until - Date.now()) / 1000)} s.` });
      const b = await body(req, 1e4);
      if (!checkPassword(b.password || '')) {
        const n = (f ? f.n : 0) + 1; fails.set(ip, n >= 5 ? { n: 0, until: Date.now() + 60e3 } : { n, until: 0 });
        return send(res, 401, { error: 'Senha incorreta.' });
      }
      fails.delete(ip);
      return send(res, 200, { ok: true }, { 'Set-Cookie': `sid=${newSession()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}` });
    }
    if (p === '/api/logout' && m === 'POST') { sessions.delete(cookieOf(req).sid); return send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' }); }

    // Histórico: o gerador registra cada vídeo pronto (sem login; só guarda metadados).
    if (p === '/api/history' && m === 'POST') {
      const lg = await needLogin(req, res); if (!lg) return;
      const b = await body(req, 1e4);
      const h = {
        id: crypto.randomBytes(5).toString('hex'), at: new Date().toISOString(), name: str(b.name, 80) || 'Sem título',
        duration: clampN(+b.duration, 0, 3600, 0), look: SCHEMA.SET.look.has(b.look) ? b.look : 'cartoon',
        res: ['720', '1080'].includes(String(b.res)) ? String(b.res) : '720', fps: [30, 60].includes(+b.fps) ? +b.fps : 30,
        format: b.format === 'mp4' ? 'mp4' : 'webm', bytes: Math.round(clampN(+b.bytes, 0, 5e9, 0)), scenes: Math.round(clampN(+b.scenes, 0, 999, 0)),
        ...(lg.user ? { user: lg.user.email || lg.user.id } : {}),
      };
      if (lg.user) { // também grava no banco do Supabase, na conta de quem gerou (best effort)
        const c = sbCfg(), row = { name: h.name, duration: h.duration, look: h.look, res: h.res, fps: h.fps, format: h.format, bytes: h.bytes, scenes: h.scenes };
        (c.serviceKey ? SB.insert(c, 'videos', { ...row, user_id: lg.user.id }) : SB.insert(c, 'videos', row, tokenOf(req))).then(ok => { if (!ok) console.warn('Supabase: não consegui gravar o vídeo (rodou o supabase-schema.sql?).'); }).catch(() => {});
      }
      db.history.unshift(h); db.history.length = Math.min(db.history.length, db.settings.historyLimit); save();
      return send(res, 201, { ok: true, id: h.id });
    }

    // IA: as chaves dos provedores ficam só no servidor. Limite por IP para ninguém gastar a cota.
    if (p === '/api/config' && m === 'GET') { const c = sbCfg(); return send(res, 200, { auth: { enabled: c.enabled, required: c.enabled && c.required, url: c.enabled ? c.url : '', anonKey: c.enabled ? c.anonKey : '', google: c.enabled && c.google } }, { 'Cache-Control': 'no-store' }); }
    if (p === '/api/ai/status' && m === 'GET') { const i = aiInfo(); return send(res, 200, { available: i.enabled && i.hasKey, perHour: i.perHour }); }
    // Prompt pronto para copiar e usar em outra IA (ChatGPT, Claude...): as mesmas regras que o site usa.
    if (p === '/api/ai/prompt' && m === 'GET') {
      const q = new URL(req.url, 'http://x').searchParams, seconds = [20, 30, 45, 60].includes(+q.get('seconds')) ? +q.get('seconds') : 30;
      return send(res, 200, { prompt: AI.systemPrompt({ seconds, look: SCHEMA.SET.look.has(q.get('look')) ? q.get('look') : '', format: q.get('format') || 'auto', tone: q.get('tone') || 'auto', lang: q.get('lang') || '', music: q.get('music') || '', cast: +q.get('cast') || 0, extra: db.ai.extra || '' }) });
    }


    // Ícone da biblioteca online (SVG). Só pedidos que vão à internet contam no limite por IP.
    if (p === '/api/icon' && m === 'GET') {
      const qs = new URL(req.url, 'http://x').searchParams;
      const id = /^[a-z0-9-]{2,40}:[a-z0-9-]{1,80}$/.test(qs.get('id') || '') ? qs.get('id') : '';
      const q = str(qs.get('q'), 40).toLowerCase().replace(/[^a-z0-9 -]/g, '').trim();
      if (!id && q.length < 2) return send(res, 400, { error: 'Informe q (palavra em inglês) ou id (ex.: noto:rocket).' });
      const key = id || 'q:' + q, cached = fs.existsSync(path.join(ICON_DIR, crypto.createHash('sha1').update(key).digest('hex') + '.svg'));
      if (!cached) {
        const ip = ipOf(req), now = Date.now(), h = (iconHits.get(ip) || []).filter(x => now - x < 3600e3);
        if (h.length >= 400) return send(res, 429, { error: 'Muitos ícones novos por hora. Tente mais tarde.' });
        h.push(now); iconHits.set(ip, h);
      }
      const svg = await iconGet(q, id);
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
      return res.end(svg);
    }

    // Voz com IA (TTS): texto -> MP3. Sem chave de API; limite por IP e poucas gerações ao mesmo tempo.
    if (p === '/api/tts/status' && m === 'GET') { const t = ttsInfo(); return send(res, 200, { available: t.installed && t.enabled, installed: t.installed, maxChars: t.maxChars, voice: t.voice, perHour: t.perHour }); }
    if (p === '/api/tts/voices' && m === 'GET') return send(res, 200, { voices: await TTS.voices(), default: db.tts.voice });
    if (p === '/api/tts' && m === 'POST') {
      const lg = await needLogin(req, res); if (!lg) return;
      const t = ttsInfo();
      if (!t.enabled) return send(res, 503, { error: 'A voz com IA está desativada neste site.' });
      if (!t.installed) return send(res, 503, { error: 'A voz com IA não está instalada no servidor (rode "npm install" e reinicie).' });
      const ip = lg.user ? 'u:' + lg.user.id : ipOf(req), now = Date.now(), hits = (ttsHits.get(ip) || []).filter(x => now - x < 3600e3);
      if (hits.length >= db.tts.perHour) return send(res, 429, { error: `Limite de ${db.tts.perHour} vozes por hora atingido. Tente mais tarde.` });
      if (ttsBusy >= TTS_MAX_PARALLEL) return send(res, 429, { error: 'O servidor de voz está ocupado. Tente de novo em alguns segundos.' });
      const b = await body(req, 3e4);
      hits.push(now); ttsHits.set(ip, hits); ttsBusy++;
      try {
        const mp3 = await TTS.synth({ text: b.text, voice: str(b.voice, 60) || db.tts.voice, rate: +b.rate, pitch: +b.pitch });
        res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': mp3.length, 'Cache-Control': 'no-store' });
        return res.end(mp3);
      } catch (e) { hits.pop(); throw e; } finally { ttsBusy--; }
    }
    const aiOp = p.startsWith('/api/ai/') ? p.slice(8) : '';
    if (m === 'POST' && { generate: 1, refine: 1, ideas: 1, review: 1, translate: 1 }[aiOp]) {
      const lg = await needLogin(req, res); if (!lg) return;
      await aiDbLoad();
      const i = aiInfo();
      if (!i.enabled || !i.hasKey) return send(res, 503, { error: 'A criação com IA não está configurada neste site.' });
      const ip = lg.user ? 'u:' + lg.user.id : ipOf(req), now = Date.now(), hits = (aiHits.get(ip) || []).filter(t => now - t < 3600e3);
      if (hits.length >= db.ai.perHour) return send(res, 429, { error: `Limite de ${db.ai.perHour} usos da IA por hora atingido. Tente mais tarde.` });
      const b = await body(req, aiOp === 'generate' || aiOp === 'ideas' ? 2e4 : 5e5);
      const llm = { chain: aiChain() }, common = { llm, maxTokens: db.ai.maxTokens, extra: db.ai.extra || '', tpm: llm.chain[0].tpm };
      const opt = { seconds: +b.seconds, look: SCHEMA.SET.look.has(b.look) ? b.look : '', format: str(b.format, 20), tone: str(b.tone, 20), lang: str(b.lang, 8), music: str(b.music, 20), cast: +b.cast };
      const storyOk = v => v && typeof v === 'object' && Array.isArray(v.scenes) && v.scenes.length > 0 && v.scenes.length <= 40;
      let job;
      if (aiOp === 'generate') {
        const idea = str(b.idea, 6000);
        if (idea.length < 8) return send(res, 400, { error: 'Descreva melhor a ideia do vídeo (pelo menos uma frase).' });
        job = () => AI.generate({ ...common, ...opt, idea });
      } else if (aiOp === 'ideas') {
        job = () => AI.ideas({ llm, topic: str(b.topic, 300), count: +b.count, format: opt.format, tone: opt.tone, seconds: opt.seconds });
      } else {
        if (!storyOk(b.story)) return send(res, 400, { error: 'Não há uma história válida para enviar à IA.' });
        const script = str(b.script, 6000);
        if (aiOp === 'refine') {
          const instruction = str(b.instruction, 1200);
          if (instruction.length < 5) return send(res, 400, { error: 'Diga o que você quer mudar.' });
          job = () => AI.refine({ ...common, ...opt, story: b.story, script, instruction });
        } else if (aiOp === 'review') job = () => AI.review({ llm, story: b.story, script, tpm: common.tpm });
        else job = () => AI.translate({ ...common, story: b.story, script, lang: str(b.lang, 8) });
      }
      hits.push(now); aiHits.set(ip, hits);
      const t0 = Date.now();
      try {
        const out = await job();
        if (out && typeof out === 'object') out.provider = llm.lastUsed || ''; // qual IA respondeu (útil quando há reserva)
        db.aiCount = (db.aiCount || 0) + 1; logAi(aiOp, llm.lastUsed, true, Date.now() - t0); save();
        return send(res, 200, out);
      } catch (e) { hits.pop(); logAi(aiOp, llm.lastUsed, false, Date.now() - t0, e && (e.msg || e.message)); save(); throw e; }
    }

    // ---- daqui para baixo exige login ----
    if (!p.startsWith('/api/admin/')) return send(res, 404, { error: 'Rota não encontrada.' });
    if (!isAdmin(req)) return send(res, 401, { error: 'Faça login.' });
    const r = p.slice('/api/admin/'.length).split('/'), id = r[1];

    if (r[0] === 'status' && m === 'GET') return send(res, 200, status());
    if (r[0] === 'settings' && m === 'GET') return send(res, 200, db.settings);
    if (r[0] === 'settings' && m === 'PUT') { db.settings = cleanSettings(await body(req, 1e4), db.settings); save(); return send(res, 200, db.settings); }

    if (r[0] === 'history' && m === 'GET') return send(res, 200, db.history);
    if (r[0] === 'history' && m === 'DELETE') {
      if (id) db.history = db.history.filter(h => h.id !== id); else db.history = [];
      save(); return send(res, 200, { ok: true });
    }

    if (r[0] === 'ai' && r[1] === 'models' && m === 'GET') { // lista os modelos que o provedor oferece agora
      const qs = new URL(req.url, 'http://x').searchParams, pid = qs.get('provider') || '';
      if (!PROV.isId(pid)) return send(res, 400, { error: 'Provedor desconhecido.' });
      return send(res, 200, await listModels(pid, qs.get('free') !== '0'));
    }
    if (r[0] === 'ai' && m === 'GET') { await aiDbLoad(true); return send(res, 200, aiInfo()); }
    if (r[0] === 'ai' && r[1] === 'test' && m === 'POST') { // testa um provedor com um pedido minúsculo
      const b = await body(req, 1e3), id = str(b.provider, 30);
      if (!PROV.isId(id) || !provReady(id)) return send(res, 400, { error: 'Esse provedor ainda não está configurado (falta a chave, o modelo ou o endereço).' });
      const t0 = Date.now(), llm = { chain: [chainEntry(id)[0]] };
      const sample = await AI.ping({ llm });
      return send(res, 200, { ok: true, ms: Date.now() - t0, model: llm.chain[0].model, sample: String(sample).slice(0, 120) });
    }
    if (r[0] === 'ai' && m === 'PUT') {
      const err = applyAi(await body(req, 3e4));
      if (err) return send(res, 400, { error: err });
      save(); await aiDbSave(); return send(res, 200, aiInfo());
    }
    if (r[0] === 'supabase') {
      const e = process.env, c = db.supabase, eff = sbCfg();
      const info = () => { const eff = sbCfg(); return {  url: c.url, anonKey: c.anonKey ? '…' + c.anonKey.slice(-6) : '', hasAnon: !!eff.anonKey, hasService: !!eff.serviceKey, serviceHint: eff.serviceKey ? '…' + eff.serviceKey.slice(-4) : '', required: eff.required, google: !!c.google, enabled: eff.enabled, effectiveUrl: eff.url,
        env: { url: !!e.SUPABASE_URL, anon: !!(e.SUPABASE_ANON_KEY || e.SUPABASE_KEY), service: !!(e.SUPABASE_SERVICE_KEY || e.SUPABASE_SERVICE_ROLE_KEY), required: e.REQUIRE_LOGIN !== undefined } }; };
      if (id === 'test' && m === 'POST') {
        if (!eff.enabled) return send(res, 400, { error: 'Informe o endereço (https://…supabase.co) e a chave anon.' });
        const h = await SB.health(eff); let users = null; if (h.ok && eff.serviceKey) { try { users = (await SB.listUsers(eff, 1, 1)).total; } catch (x) { h.serviceError = x.message; } }
        return send(res, 200, { ...h, users });
      }
      if (id === 'users' && m === 'GET') { if (!eff.enabled) return send(res, 200, { users: [], total: 0 }); try { return send(res, 200, await SB.listUsers(eff, 1, 100)); } catch (x) { return send(res, 502, { error: 'Não consegui listar os usuários: ' + x.message }); } }
      if (!id && m === 'GET') return send(res, 200, info());
      if (!id && m === 'PUT') {
        const b = await body(req, 1e4);
        if (typeof b.url === 'string') { const u = b.url.trim(); if (!u) c.url = ''; else { const ok = PROV.validUrl(u); if (!ok) return send(res, 400, { error: 'Endereço inválido: use https://SEU-PROJETO.supabase.co' }); c.url = ok.replace(/\/+$/, ''); } }
        if (typeof b.anonKey === 'string' && b.anonKey.trim()) c.anonKey = b.anonKey.trim().slice(0, 2000);
        if (typeof b.serviceKey === 'string' && b.serviceKey.trim()) c.serviceKey = b.serviceKey.trim().slice(0, 2000);
        if (b.clearAnon) c.anonKey = ''; if (b.clearService) c.serviceKey = '';
        if (b.required !== undefined) c.required = !!b.required;
        if (b.google !== undefined) c.google = !!b.google;
        save(); await aiDbLoad(true); return send(res, 200, info());
      }
    }
    if (r[0] === 'ailog' && m === 'GET') return send(res, 200, db.aiLog);
    if (r[0] === 'ailog' && m === 'DELETE') { db.aiLog = []; db.aiStats = { total: 0, ok: 0, fail: 0, ms: 0 }; save(); return send(res, 200, { ok: true }); }
    if (r[0] === 'export' && m === 'GET') { // backup das configurações (sem as chaves, a menos que se peça ?keys=1)
      const withKeys = new URL(req.url, 'http://x').searchParams.get('keys') === '1';
      const provs = JSON.parse(JSON.stringify(db.ai.providers)); if (!withKeys) for (const v of Object.values(provs)) delete v.key;
      return send(res, 200, { app: 'shorts-animados', version: 1, exportedAt: new Date().toISOString(), settings: db.settings, ai: { enabled: db.ai.enabled, provider: db.ai.provider, fallback: db.ai.fallback, perHour: db.ai.perHour, extra: db.ai.extra, providers: provs } });
    }
    if (r[0] === 'import' && m === 'POST') {
      const b = await body(req, 2e5);
      if (!b || b.app !== 'shorts-animados') return send(res, 400, { error: 'Esse arquivo não é um backup do painel.' });
      if (b.settings) db.settings = cleanSettings(b.settings, db.settings);
      if (b.ai && typeof b.ai === 'object') { const err = applyAi(b.ai); if (err) return send(res, 400, { error: err }); }
      save(); await aiDbSave(); return send(res, 200, { ok: true });
    }

    if (r[0] === 'tts' && m === 'GET') return send(res, 200, ttsInfo());
    if (r[0] === 'tts' && m === 'PUT') {
      const b = await body(req, 1e4), a = db.tts;
      if (b.enabled !== undefined) a.enabled = !!b.enabled;
      if (b.perHour !== undefined) a.perHour = Math.round(clampN(+b.perHour, 1, 5000, a.perHour));
      if (typeof b.voice === 'string' && /^[a-z]{2,3}-[A-Z]{2}-[A-Za-z]{2,40}Neural$/.test(b.voice)) a.voice = b.voice;
      save(); return send(res, 200, ttsInfo());
    }
    if (r[0] === 'adminpath' && m === 'POST') {
      if (process.env.ADMIN_PATH) return send(res, 409, { error: 'O caminho vem da variável ADMIN_PATH. Altere-a no ambiente.' });
      const b = await body(req, 1e4), v = String(b.path || '').replace(/^\/+/, '');
      if (!validPath(v)) return send(res, 400, { error: 'Use 4 a 40 caracteres (letras, números, - ou _), sem usar "admin", "api", "docs" ou "index".' });
      db.adminPath = v; save(); return send(res, 200, { path: v });
    }

    if (r[0] === 'password' && m === 'POST') {
      if (process.env.ADMIN_PASSWORD) return send(res, 409, { error: 'A senha vem da variável ADMIN_PASSWORD. Altere-a no ambiente.' });
      const b = await body(req, 1e4);
      if (!checkPassword(b.current || '')) return send(res, 403, { error: 'Senha atual incorreta.' });
      if (String(b.next || '').length < 8) return send(res, 400, { error: 'A nova senha precisa ter pelo menos 8 caracteres.' });
      setPassword(b.next); const keep = cookieOf(req).sid; for (const t of sessions.keys()) if (t !== keep) sessions.delete(t);
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'Rota não encontrada.' });
  } catch (e) {
    if (e && e.code) return send(res, e.code, { error: e.msg });
    console.error(e); return send(res, 500, { error: 'Erro interno.' });
  }
}

/* ---------- estáticos ---------- */
http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); return res.end(); }
  if (p.startsWith('/api/')) return api(req, res, p);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  if (p === '/') p = '/home.html';           // página inicial (explica o site)
  if (p === '/gerar') p = '/index.html';     // o gerador
  if (p === '/ajuda' || p === '/ajuda.html') { res.writeHead(301, { Location: '/docs' }); return res.end(); } // endereço antigo
  if (p === '/docs') p = '/docs.html';
  if (p === '/' + adminPath()) { res.writeHead(200, { 'Content-Type': types['.html'], 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' }); return res.end(fs.readFileSync(path.join(dir, 'admin.html'))); }
  const f = path.normalize(path.join(dir, p)), rel = path.relative(dir, f);
  if (rel.startsWith('..') || path.isAbsolute(rel) || rel.split(path.sep).some(s => s.startsWith('.')) || PRIVATE.has(rel)) { res.writeHead(403); return res.end('acesso negado'); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('não encontrado'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : d);
  });
}).listen(PORT, async () => {
  console.log('Animaê · build ' + BUILD);
  if (aiDbReady()) { await aiDbLoad(true); console.log('  Config da IA: ' + (aiDb.ok ? 'sincronizada com o Supabase (tabela ai_config)' : 'Supabase com erro: ' + aiDb.error)); }
  { const c = sbCfg(); console.log('  Login: ' + (c.enabled ? 'Supabase ' + c.url + (c.required ? ' (obrigatório para gerar vídeos)' : ' (opcional)') : 'desligado (configure o Supabase em Admin > Conta e banco ou com SUPABASE_URL e SUPABASE_ANON_KEY)')); }
  console.log('  Início:  http://localhost:' + PORT);
  console.log('  Gerador: http://localhost:' + PORT + '/gerar');
  console.log('  Docs:    http://localhost:' + PORT + '/docs');
  console.log('  Admin (secreto, sem link no site): http://localhost:' + PORT + '/' + adminPath());
  { const c = aiChain(); console.log('  IA: ' + (c.length ? c.map(p => p.label + ' (' + p.model + ')').join(' → ') : 'nenhum provedor configurado (use uma variável como GEMINI_API_KEY / GROQ_API_KEY ou o Admin > IA)')); }
  if (firstRunPassword) console.log('\n  >>> Senha inicial do admin: ' + firstRunPassword + '\n  >>> (aparece só desta vez; troque em Admin > Segurança)\n');
  else if (process.env.ADMIN_PASSWORD) console.log('  Senha do admin vem de ADMIN_PASSWORD.');
});
