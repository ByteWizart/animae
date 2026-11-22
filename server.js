// Servidor mínimo, sem dependências. Uso: node server.js  ->  http://localhost:3000
// Serve os arquivos estáticos e uma pequena API para o painel Admin (dados em dados.json).
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const SCHEMA = require('./schema.js');
const AI = require('./ai.js');

const dir = __dirname;
const PORT = +process.env.PORT || 3000;
const DATA_FILE = path.join(dir, 'dados.json');
const BUILD = 9;
const STARTED = Date.now();

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript', '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
// Arquivos que nunca são servidos pela web.
const PRIVATE = new Set(['dados.json', 'dados.json.tmp', 'server.js', 'ai.js', 'admin.html']);

/* ---------- dados ---------- */
const DEFAULTS = () => ({
  version: 1,
  settings: {
    look: 'cartoon', res: '720', fps: '30', historyLimit: 200,
    caption: { size: 110, color: '#ffffff', alt: '#ffd93b', y: 0.69, stroke: '#000000', upper: false },
  },
  auth: null,
  adminPath: null,
  ai: {
    enabled: true, perHour: 20, maxTokens: 12000, extra: '',
    primary: 'groq', fallback: true, // provedor principal; se falhar, tenta o outro (quando ativo)
    providers: {
      groq: { enabled: true, model: 'openai/gpt-oss-120b', key: '', baseUrl: '', tpm: 8000 },
      cerebras: { enabled: false, model: 'gpt-oss-120b', key: '', baseUrl: '', tpm: 30000 },
      cloudflare: { enabled: false, model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', key: '', baseUrl: '', accountId: '', tpm: 32000 },
    },
  },
  history: [],
});

// Provedores de IA compatíveis com OpenAI. A chave e o endereço podem vir do ambiente (têm prioridade sobre o dados.json).
const PROVIDERS = {
  groq: { label: 'Groq', keyEnv: 'GROQ_API_KEY', urlEnv: 'GROQ_URL', defaultUrl: 'https://api.groq.com/openai/v1' },
  cerebras: { label: 'Cerebras', keyEnv: 'CEREBRAS_API_KEY', urlEnv: 'CEREBRAS_URL', defaultUrl: 'https://api.cerebras.ai/v1' },
  cloudflare: { label: 'Cloudflare Workers AI', keyEnv: 'CLOUDFLARE_API_TOKEN', urlEnv: 'CLOUDFLARE_URL', defaultUrl: '', accountEnv: 'CLOUDFLARE_ACCOUNT_ID' },
};
const PIDS = Object.keys(PROVIDERS);
let db = DEFAULTS();
// Mescla a config de IA com os padrões e migra o formato antigo (model/key/tpm soltos = Groq).
function mergeAi(base, cur) {
  const a = { ...base, ...cur, providers: {} };
  for (const id of PIDS) a.providers[id] = { ...base.providers[id], ...((cur.providers || {})[id] || {}) };
  if (!cur.providers) for (const k of ['model', 'key', 'tpm']) if (cur[k] !== undefined) a.providers.groq[k] = cur[k];
  for (const k of ['model', 'key', 'tpm']) delete a[k];
  if (!PROVIDERS[a.primary]) a.primary = base.primary;
  return a;
}
function load() {
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')), base = DEFAULTS();
    db = { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}), caption: { ...base.settings.caption, ...((d.settings || {}).caption || {}) } }, ai: mergeAi(base.ai, d.ai || {}) };
    delete db.stories; // a biblioteca agora fica no navegador de cada usuário
    // migração: o antigo padrão (llama) passa para o novo padrão
    if (db.ai.providers.groq.model === 'llama-3.3-70b-versatile') db.ai.providers.groq.model = base.ai.providers.groq.model;
    if (db.ai.maxTokens < 12000) db.ai.maxTokens = 12000;
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
const validPath = v => /^[a-z0-9][a-z0-9_-]{3,39}$/i.test(v) && !['api', 'ajuda', 'index', 'admin'].includes(v.toLowerCase());
if (!db.adminPath) { db.adminPath = 'painel-' + crypto.randomBytes(5).toString('hex'); save(); }
const adminPath = () => (process.env.ADMIN_PATH && validPath(process.env.ADMIN_PATH) ? process.env.ADMIN_PATH : db.adminPath);
const provKey = id => process.env[PROVIDERS[id].keyEnv] || db.ai.providers[id].key || '';
const provAccount = id => PROVIDERS[id].accountEnv ? (process.env[PROVIDERS[id].accountEnv] || db.ai.providers[id].accountId || '') : '';
// Cloudflare: o endereço é montado com o ID da conta (a menos que um endereço seja informado).
const provUrl = id => {
  let u = process.env[PROVIDERS[id].urlEnv] || db.ai.providers[id].baseUrl || PROVIDERS[id].defaultUrl;
  if (!u && PROVIDERS[id].accountEnv && provAccount(id)) u = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(provAccount(id))}/ai/v1`;
  return u.replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, '');
};
const provReady = id => !!provKey(id) && !!provUrl(id);
// Provedores que serão usados, na ordem: principal primeiro; o outro só entra se o fallback estiver ligado.
function activeProviders() {
  const order = [db.ai.primary, ...PIDS.filter(i => i !== db.ai.primary)].filter(i => db.ai.providers[i].enabled && provReady(i));
  return (db.ai.fallback ? order : order.slice(0, 1)).map(llmOf); // sem fallback: só o primeiro da fila
}
const llmOf = id => ({ id, kind: id, label: PROVIDERS[id].label, key: provKey(id), baseUrl: provUrl(id), model: db.ai.providers[id].model, tpm: db.ai.providers[id].tpm });
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
// Endereço-base de provedor: aceita só http/https; vazio = usar o padrão. Devolve null se inválido.
function cleanUrl(v) {
  v = String(v || '').trim().replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, '');
  if (!v) return '';
  try { const u = new URL(v); return /^https?:$/.test(u.protocol) ? u.toString().replace(/\/+$/, '') : null; } catch { return null; }
}

const aiInfo = () => {
  const providers = {};
  for (const id of PIDS) {
    const c = db.ai.providers[id], k = provKey(id);
    providers[id] = { label: PROVIDERS[id].label, enabled: !!c.enabled, model: c.model, tpm: c.tpm, baseUrl: provUrl(id), defaultUrl: PROVIDERS[id].defaultUrl, accountId: provAccount(id), accountFromEnv: !!(PROVIDERS[id].accountEnv && process.env[PROVIDERS[id].accountEnv]), hasAccount: !PROVIDERS[id].accountEnv || !!provAccount(id), hasKey: !!k, keyHint: k ? '…' + k.slice(-4) : '', keyFromEnv: !!process.env[PROVIDERS[id].keyEnv], urlFromEnv: !!process.env[PROVIDERS[id].urlEnv], keyEnv: PROVIDERS[id].keyEnv, ready: !!c.enabled && provReady(id), uses: (db.aiByProv || {})[id] || 0 };
  }
  return { enabled: !!db.ai.enabled, perHour: db.ai.perHour, extra: db.ai.extra || '', primary: db.ai.primary, fallback: !!db.ai.fallback, providers, available: !!db.ai.enabled && activeProviders().length > 0 };
};
const aiHits = new Map(); // ip -> [timestamps]

function status() {
  const expected = ['index.html', 'ajuda.html', 'admin.html', 'audio.js', 'schema.js', 'ai.js', 'ui.css', 'server.js', 'package.json', 'README.md', 'PROMPT-MOVIMENTOS.md', 'historia-teste.json', 'historia-demo-v9.json'];
  const files = expected.map(f => { try { const s = fs.statSync(path.join(dir, f)); return { name: f, ok: true, bytes: s.size, mtime: s.mtimeMs }; } catch { return { name: f, ok: false }; } });
  let dataBytes = 0; try { dataBytes = fs.statSync(DATA_FILE).size; } catch {}
  const byLook = {}; let secs = 0;
  db.history.forEach(h => { byLook[h.look] = (byLook[h.look] || 0) + 1; secs += h.duration || 0; });
  return {
    build: BUILD, node: process.version, platform: process.platform, port: PORT, uptime: Math.round((Date.now() - STARTED) / 1000),
    passwordFromEnv: !!process.env.ADMIN_PASSWORD, dataBytes, files,
    counts: { videos: db.history.length, seconds: Math.round(secs), ideas: db.aiCount || 0 }, byLook,
    ai: aiInfo(), adminPath: adminPath(), adminPathFromEnv: !!process.env.ADMIN_PATH,
  };
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
      const b = await body(req, 1e4);
      const h = {
        id: crypto.randomBytes(5).toString('hex'), at: new Date().toISOString(), name: str(b.name, 80) || 'Sem título',
        duration: clampN(+b.duration, 0, 3600, 0), look: SCHEMA.SET.look.has(b.look) ? b.look : 'cartoon',
        res: ['720', '1080'].includes(String(b.res)) ? String(b.res) : '720', fps: [30, 60].includes(+b.fps) ? +b.fps : 30,
        format: b.format === 'mp4' ? 'mp4' : 'webm', bytes: Math.round(clampN(+b.bytes, 0, 5e9, 0)), scenes: Math.round(clampN(+b.scenes, 0, 999, 0)),
      };
      db.history.unshift(h); db.history.length = Math.min(db.history.length, db.settings.historyLimit); save();
      return send(res, 201, { ok: true, id: h.id });
    }

    // IA: as chaves ficam só no servidor. Limite por IP para ninguém gastar a cota.
    if (p === '/api/ai/status' && m === 'GET') { const i = aiInfo(); return send(res, 200, { available: i.available, perHour: i.perHour }); }
    // Prompt pronto para copiar e usar em outra IA (ChatGPT, Claude...): as mesmas regras que o site usa.
    if (p === '/api/ai/prompt' && m === 'GET') {
      const q = new URL(req.url, 'http://x').searchParams, seconds = [20, 30, 45, 60].includes(+q.get('seconds')) ? +q.get('seconds') : 30;
      return send(res, 200, { prompt: AI.systemPrompt({ seconds, look: SCHEMA.SET.look.has(q.get('look')) ? q.get('look') : '', format: q.get('format') || 'auto', tone: q.get('tone') || 'auto', lang: q.get('lang') || '', music: q.get('music') || '', cast: +q.get('cast') || 0, extra: db.ai.extra || '' }) });
    }
    const aiOp = p.startsWith('/api/ai/') ? p.slice(8) : '';
    if (m === 'POST' && { generate: 1, refine: 1, ideas: 1, review: 1, translate: 1 }[aiOp]) {
      const provs = db.ai.enabled ? activeProviders() : [];
      if (!provs.length) return send(res, 503, { error: 'A criação com IA não está configurada neste site.' });
      const ip = ipOf(req), now = Date.now(), hits = (aiHits.get(ip) || []).filter(t => now - t < 3600e3);
      if (hits.length >= db.ai.perHour) return send(res, 429, { error: `Limite de ${db.ai.perHour} usos da IA por hora atingido. Tente mais tarde.` });
      const b = await body(req, aiOp === 'generate' || aiOp === 'ideas' ? 2e4 : 5e5);
      const opt = { seconds: +b.seconds, look: SCHEMA.SET.look.has(b.look) ? b.look : '', format: str(b.format, 20), tone: str(b.tone, 20), lang: str(b.lang, 8), music: str(b.music, 20), cast: +b.cast };
      const storyOk = v => v && typeof v === 'object' && Array.isArray(v.scenes) && v.scenes.length > 0 && v.scenes.length <= 40;
      const common = (llm) => ({ llm, maxTokens: db.ai.maxTokens, extra: db.ai.extra || '', tpm: llm.tpm || 8000 });
      let job; // job(llm): recebe o provedor da vez (principal primeiro, depois o fallback)
      if (aiOp === 'generate') {
        const idea = str(b.idea, 6000);
        if (idea.length < 8) return send(res, 400, { error: 'Descreva melhor a ideia do vídeo (pelo menos uma frase).' });
        job = llm => AI.generate({ ...common(llm), ...opt, idea });
      } else if (aiOp === 'ideas') {
        job = llm => AI.ideas({ llm, topic: str(b.topic, 300), count: +b.count, format: opt.format, tone: opt.tone, seconds: opt.seconds });
      } else {
        if (!storyOk(b.story)) return send(res, 400, { error: 'Não há uma história válida para enviar à IA.' });
        const script = str(b.script, 6000);
        if (aiOp === 'refine') {
          const instruction = str(b.instruction, 1200);
          if (instruction.length < 5) return send(res, 400, { error: 'Diga o que você quer mudar.' });
          job = llm => AI.refine({ ...common(llm), ...opt, story: b.story, script, instruction });
        } else if (aiOp === 'review') job = llm => AI.review({ llm, story: b.story, script, tpm: llm.tpm || 8000 });
        else job = llm => AI.translate({ ...common(llm), story: b.story, script, lang: str(b.lang, 8) });
      }
      hits.push(now); aiHits.set(ip, hits);
      // Tenta cada provedor ativo; erros de provedor (limite, fora do ar, modelo ruim) passam para o próximo.
      let lastErr = null;
      for (const llm of provs) {
        try {
          const out = await job(llm);
          db.aiCount = (db.aiCount || 0) + 1; (db.aiByProv = db.aiByProv || {})[llm.id] = ((db.aiByProv || {})[llm.id] || 0) + 1; save();
          if (provs.length > 1 && llm.id !== provs[0].id) console.warn(`IA: ${provs[0].label} falhou (${lastErr && lastErr.msg}); atendido por ${llm.label}.`);
          if (out && typeof out === 'object') out.via = { provider: llm.label, model: llm.model };
          return send(res, 200, out);
        } catch (e) {
          lastErr = e;
          if (!(e && [413, 429, 502, 504].includes(e.code))) { hits.pop(); throw e; }
          console.warn(`IA: ${llm.label} falhou: ${e.msg}`);
        }
      }
      hits.pop(); throw lastErr;
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

    if (r[0] === 'ai' && !id && m === 'GET') return send(res, 200, aiInfo());
    if (r[0] === 'ai' && !id && m === 'PUT') {
      const b = await body(req, 2e4), a = db.ai;
      if (b.enabled !== undefined) a.enabled = !!b.enabled;
      if (b.fallback !== undefined) a.fallback = !!b.fallback;
      if (PROVIDERS[b.primary]) a.primary = b.primary;
      if (typeof b.extra === 'string') a.extra = str(b.extra, 2000);
      if (b.perHour !== undefined) a.perHour = Math.round(clampN(+b.perHour, 1, 1000, a.perHour));
      for (const pid of PIDS) {
        const pb = (b.providers || {})[pid]; if (!pb || typeof pb !== 'object') continue;
        const c = a.providers[pid];
        if (pb.enabled !== undefined) c.enabled = !!pb.enabled;
        if (typeof pb.model === 'string' && /^[\w.\/:@+-]{1,100}$/.test(pb.model.trim())) c.model = pb.model.trim();
        if (pb.tpm !== undefined) c.tpm = Math.round(clampN(+pb.tpm, 3000, 2000000, c.tpm || 8000));
        if (typeof pb.baseUrl === 'string') { const u = cleanUrl(pb.baseUrl); if (u === null) return send(res, 400, { error: `Endereço inválido para ${PROVIDERS[pid].label}. Use http:// ou https://.` }); c.baseUrl = u; }
        if (typeof pb.key === 'string' && pb.key.trim()) c.key = pb.key.trim().slice(0, 300);
        if (pb.clearKey) c.key = '';
        if (PROVIDERS[pid].accountEnv && typeof pb.accountId === 'string') c.accountId = pb.accountId.trim().replace(/[^\w-]/g, '').slice(0, 64);
      }
      save(); return send(res, 200, aiInfo());
    }
    // Testar conexão / listar modelos de um provedor, com os valores do formulário (ainda não salvos) por cima dos salvos.
    if (r[0] === 'ai' && (id === 'test' || id === 'models') && m === 'POST') {
      const b = await body(req, 1e4), pid = PROVIDERS[b.provider] ? b.provider : null;
      if (!pid) return send(res, 400, { error: 'Provedor desconhecido.' });
      const llm = llmOf(pid);
      if (typeof b.baseUrl === 'string' && b.baseUrl.trim() && !process.env[PROVIDERS[pid].urlEnv]) { const u = cleanUrl(b.baseUrl); if (!u) return send(res, 400, { error: 'Endereço inválido. Use http:// ou https://.' }); llm.baseUrl = u; }
      if (typeof b.key === 'string' && b.key.trim() && !process.env[PROVIDERS[pid].keyEnv]) llm.key = b.key.trim();
      if (PROVIDERS[pid].accountEnv && typeof b.accountId === 'string' && b.accountId.trim() && !process.env[PROVIDERS[pid].accountEnv] && !(typeof b.baseUrl === 'string' && b.baseUrl.trim())) llm.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(b.accountId.trim().replace(/[^\w-]/g, ''))}/ai/v1`;
      if (!llm.baseUrl) return send(res, 400, { error: `Informe o ID da conta de ${llm.label}.` });
      if (typeof b.model === 'string' && /^[\w.\/:@+-]{1,100}$/.test(b.model.trim())) llm.model = b.model.trim();
      if (!llm.key) return send(res, 400, { error: `Informe a chave de ${llm.label} primeiro.` });
      if (id === 'models') return send(res, 200, { models: await AI.listModels(llm) });
      try { return send(res, 200, { ok: true, model: llm.model, ...(await AI.ping(llm)) }); }
      catch (e) { if (e && e.code) return send(res, 200, { ok: false, error: e.msg }); throw e; }
    }
    if (r[0] === 'adminpath' && m === 'POST') {
      if (process.env.ADMIN_PATH) return send(res, 409, { error: 'O caminho vem da variável ADMIN_PATH. Altere-a no ambiente.' });
      const b = await body(req, 1e4), v = String(b.path || '').replace(/^\/+/, '');
      if (!validPath(v)) return send(res, 400, { error: 'Use 4 a 40 caracteres (letras, números, - ou _), sem usar "admin", "api", "ajuda" ou "index".' });
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
  if (p === '/') p = '/index.html';
  if (p === '/ajuda') p = '/ajuda.html';
  if (p === '/' + adminPath()) { res.writeHead(200, { 'Content-Type': types['.html'], 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' }); return res.end(fs.readFileSync(path.join(dir, 'admin.html'))); }
  const f = path.normalize(path.join(dir, p)), rel = path.relative(dir, f);
  if (rel.startsWith('..') || path.isAbsolute(rel) || rel.split(path.sep).some(s => s.startsWith('.')) || PRIVATE.has(rel)) { res.writeHead(403); return res.end('acesso negado'); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('não encontrado'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : d);
  });
}).listen(PORT, () => {
  console.log('Gerador de Shorts Animados · build ' + BUILD);
  console.log('  Gerador: http://localhost:' + PORT);
  console.log('  Ajuda:   http://localhost:' + PORT + '/ajuda');
  console.log('  Admin (secreto, sem link no site): http://localhost:' + PORT + '/' + adminPath());
  const ap = activeProviders();
  console.log('  IA: ' + (db.ai.enabled && ap.length ? ap.map(l => `${l.label} (${l.model})`).join(' → ') : 'desativada ou sem chave (configure no Admin > IA ou GROQ_API_KEY / CEREBRAS_API_KEY / CLOUDFLARE_API_TOKEN)'));
  if (firstRunPassword) console.log('\n  >>> Senha inicial do admin: ' + firstRunPassword + '\n  >>> (aparece só desta vez; troque em Admin > Segurança)\n');
  else if (process.env.ADMIN_PASSWORD) console.log('  Senha do admin vem de ADMIN_PASSWORD.');
});
