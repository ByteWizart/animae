// Servidor mínimo, sem dependências. Uso: node server.js  ->  http://localhost:3000
// Serve os arquivos estáticos e uma pequena API para o painel Admin (dados em dados.json).
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const SCHEMA = require('./schema.js');
const AI = require('./ai.js');
const PROV = require('./providers.js');
const TTS = require('./tts.js');

const dir = __dirname;
const PORT = +process.env.PORT || 3000;
const DATA_FILE = path.join(dir, 'dados.json');
const BUILD = 10;
const STARTED = Date.now();

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript', '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
// Arquivos que nunca são servidos pela web.
const PRIVATE = new Set(['dados.json', 'dados.json.tmp', 'server.js', 'ai.js', 'providers.js', 'tts.js', 'admin.html']);

/* ---------- dados ---------- */
const DEFAULTS = () => ({
  version: 1,
  settings: {
    look: 'cartoon', res: '720', fps: '30', historyLimit: 200,
    caption: { size: 110, color: '#ffffff', alt: '#ffd93b', y: 0.69, stroke: '#000000', upper: false },
  },
  auth: null,
  adminPath: null,
  ai: { enabled: true, provider: 'groq', fallback: [], providers: {}, perHour: 20, maxTokens: 12000, extra: '' },
  tts: { enabled: true, perHour: 60, voice: 'pt-BR-FranciscaNeural' },
  history: [],
});
let db = DEFAULTS();
function load() {
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')), base = DEFAULTS();
    db = { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}), caption: { ...base.settings.caption, ...((d.settings || {}).caption || {}) } }, ai: { ...base.ai, ...(d.ai || {}) }, tts: { ...base.tts, ...(d.tts || {}) } };
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
    if (!PROV.isId(a.provider)) a.provider = 'groq';
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
const validPath = v => /^[a-z0-9][a-z0-9_-]{3,39}$/i.test(v) && !['api', 'ajuda', 'index', 'admin'].includes(v.toLowerCase());
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

/* ---------- provedores de IA ---------- */
const aiCfg = id => db.ai.providers[id] || {};
const provKey = id => { for (const e of PROV.PROVIDERS[id].env) if (process.env[e]) return process.env[e]; return aiCfg(id).key || ''; }; // variável de ambiente tem prioridade
const provFromEnv = id => PROV.PROVIDERS[id].env.some(e => process.env[e]);
const provUrl = id => { const P = PROV.PROVIDERS[id]; return (P.editableUrl && PROV.validUrl(aiCfg(id).url || '')) || P.url; };
const provModel = id => aiCfg(id).model || PROV.PROVIDERS[id].model;
const provTpm = id => aiCfg(id).tpm || PROV.PROVIDERS[id].tpm;
const provReady = id => { const P = PROV.PROVIDERS[id]; return !!(provUrl(id) && provModel(id) && (P.keyless || P.keyOptional || provKey(id))); };
const chainEntry = id => { const P = PROV.PROVIDERS[id]; return { id, label: P.label, url: provUrl(id), key: provKey(id), model: provModel(id), tpm: provTpm(id), headers: P.headers, tune: P.tune }; };
// Ordem de tentativa: o provedor principal e, depois, os de reserva (só os que estão prontos para usar).
const aiChain = () => {
  let ids = [db.ai.provider, ...db.ai.fallback].filter((id, i, a) => PROV.isId(id) && a.indexOf(id) === i && provReady(id));
  if (!ids.length) ids = PROV.IDS.filter(id => provKey(id) && provReady(id)); // o principal não está pronto: usa qualquer provedor que já tenha chave
  return ids.map(chainEntry);
};
const aiInfo = () => {
  const chain = aiChain(), top = chain[0];
  return {
    enabled: !!db.ai.enabled, perHour: db.ai.perHour, extra: db.ai.extra || '', provider: db.ai.provider, fallback: db.ai.fallback,
    hasKey: chain.length > 0, active: chain.map(p => p.label), model: top ? top.model : '', tpm: top ? top.tpm : 0,
    providers: PROV.IDS.map(id => {
      const P = PROV.PROVIDERS[id], k = provKey(id);
      return { id, label: P.label, model: aiCfg(id).model || '', defaultModel: P.model, models: P.models, tpm: aiCfg(id).tpm || 0, defaultTpm: P.tpm, url: P.editableUrl ? (aiCfg(id).url || '') : '', defaultUrl: P.url,
        editableUrl: !!P.editableUrl, keyless: !!P.keyless, keyOptional: !!P.keyOptional, hasKey: !!k, keyHint: k ? '…' + k.slice(-4) : '', keyFromEnv: provFromEnv(id), env: P.env, signup: P.signup || '', free: P.free, ready: provReady(id) };
    }),
  };
};
const aiHits = new Map(); // ip -> [timestamps]
const ttsHits = new Map(); // ip -> [timestamps]
let ttsBusy = 0; const TTS_MAX_PARALLEL = 3;
const ttsInfo = () => ({ installed: TTS.available(), enabled: !!db.tts.enabled, perHour: db.tts.perHour, voice: db.tts.voice, maxChars: TTS.MAX_CHARS });

function status() {
  const expected = ['index.html', 'ajuda.html', 'admin.html', 'audio.js', 'schema.js', 'ai.js', 'providers.js', 'tts.js', 'ui.css', 'server.js', 'package.json', 'README.md', 'PROMPT-MOVIMENTOS.md', 'historia-teste.json', 'historia-demo-v9.json'];
  const files = expected.map(f => { try { const s = fs.statSync(path.join(dir, f)); return { name: f, ok: true, bytes: s.size, mtime: s.mtimeMs }; } catch { return { name: f, ok: false }; } });
  let dataBytes = 0; try { dataBytes = fs.statSync(DATA_FILE).size; } catch {}
  const byLook = {}; let secs = 0;
  db.history.forEach(h => { byLook[h.look] = (byLook[h.look] || 0) + 1; secs += h.duration || 0; });
  return {
    build: BUILD, node: process.version, platform: process.platform, port: PORT, uptime: Math.round((Date.now() - STARTED) / 1000),
    passwordFromEnv: !!process.env.ADMIN_PASSWORD, dataBytes, files,
    tts: ttsInfo(), counts: { videos: db.history.length, seconds: Math.round(secs), ideas: db.aiCount || 0 }, byLook,
    ai: aiInfo(), adminPath: adminPath(), adminPathFromEnv: !!process.env.ADMIN_PATH,
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
const iconFetch = async u => { const r = await fetch(u, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'shorts-animados' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return r; };
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

    // IA: as chaves dos provedores ficam só no servidor. Limite por IP para ninguém gastar a cota.
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
      const t = ttsInfo();
      if (!t.enabled) return send(res, 503, { error: 'A voz com IA está desativada neste site.' });
      if (!t.installed) return send(res, 503, { error: 'A voz com IA não está instalada no servidor (rode "npm install" e reinicie).' });
      const ip = ipOf(req), now = Date.now(), hits = (ttsHits.get(ip) || []).filter(x => now - x < 3600e3);
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
      const i = aiInfo();
      if (!i.enabled || !i.hasKey) return send(res, 503, { error: 'A criação com IA não está configurada neste site.' });
      const ip = ipOf(req), now = Date.now(), hits = (aiHits.get(ip) || []).filter(t => now - t < 3600e3);
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
      try {
        const out = await job();
        if (out && typeof out === 'object') out.provider = llm.lastUsed || ''; // qual IA respondeu (útil quando há reserva)
        db.aiCount = (db.aiCount || 0) + 1; save();
        return send(res, 200, out);
      } catch (e) { hits.pop(); throw e; }
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

    if (r[0] === 'ai' && m === 'GET') return send(res, 200, aiInfo());
    if (r[0] === 'ai' && r[1] === 'test' && m === 'POST') { // testa um provedor com um pedido minúsculo
      const b = await body(req, 1e3), id = str(b.provider, 30);
      if (!PROV.isId(id) || !provReady(id)) return send(res, 400, { error: 'Esse provedor ainda não está configurado (falta a chave, o modelo ou o endereço).' });
      const t0 = Date.now(), llm = { chain: [chainEntry(id)] };
      const sample = await AI.ping({ llm });
      return send(res, 200, { ok: true, ms: Date.now() - t0, model: llm.chain[0].model, sample: String(sample).slice(0, 120) });
    }
    if (r[0] === 'ai' && m === 'PUT') {
      const b = await body(req, 3e4), a = db.ai;
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
          if (typeof v.model === 'string') { const mm = v.model.trim(); if (!mm) delete c.model; else if (/^[\w.\/:@+-]{1,120}$/.test(mm)) c.model = mm; }
          if (v.tpm !== undefined) { const t = +v.tpm; if (!t) delete c.tpm; else c.tpm = Math.round(clampN(t, 3000, 2000000, P.tpm)); }
          if (P.editableUrl && typeof v.url === 'string') {
            const u = v.url.trim();
            if (!u) delete c.url;
            else { const ok = PROV.validUrl(u); if (!ok) return send(res, 400, { error: 'Endereço inválido para ' + P.label + ': use https:// (http:// só para localhost ou rede local).' }); c.url = ok; }
          }
        }
      }
      save(); return send(res, 200, aiInfo());
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
  { const c = aiChain(); console.log('  IA: ' + (c.length ? c.map(p => p.label + ' (' + p.model + ')').join(' → ') : 'nenhum provedor configurado (use uma variável como GROQ_API_KEY / ZAI_API_KEY ou o Admin > IA)')); }
  if (firstRunPassword) console.log('\n  >>> Senha inicial do admin: ' + firstRunPassword + '\n  >>> (aparece só desta vez; troque em Admin > Segurança)\n');
  else if (process.env.ADMIN_PASSWORD) console.log('  Senha do admin vem de ADMIN_PASSWORD.');
});
