// Servidor mínimo, sem dependências. Uso: node server.js  ->  http://localhost:3000
// Serve os arquivos estáticos e uma pequena API para o painel Admin (dados em dados.json).
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const SCHEMA = require('./schema.js');

const dir = __dirname;
const PORT = +process.env.PORT || 3000;
const DATA_FILE = path.join(dir, 'dados.json');
const BUILD = 7;
const STARTED = Date.now();

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript', '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
// Arquivos que nunca são servidos pela web.
const PRIVATE = new Set(['dados.json', 'dados.json.tmp', 'server.js']);

/* ---------- dados ---------- */
const DEFAULTS = () => ({
  version: 1,
  settings: {
    look: 'cartoon', res: '720', fps: '30', historyLimit: 200,
    caption: { size: 110, color: '#ffffff', alt: '#ffd93b', y: 0.69, stroke: '#000000', upper: false },
  },
  auth: null,
  stories: [],
  history: [],
});
let db = DEFAULTS();
function load() {
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')), base = DEFAULTS();
    db = { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}), caption: { ...base.settings.caption, ...((d.settings || {}).caption || {}) } } };
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

function status() {
  const expected = ['index.html', 'ajuda.html', 'admin.html', 'audio.js', 'schema.js', 'ui.css', 'server.js', 'package.json', 'README.md', 'PROMPT-MOVIMENTOS.md', 'historia-teste.json'];
  const files = expected.map(f => { try { const s = fs.statSync(path.join(dir, f)); return { name: f, ok: true, bytes: s.size, mtime: s.mtimeMs }; } catch { return { name: f, ok: false }; } });
  let dataBytes = 0; try { dataBytes = fs.statSync(DATA_FILE).size; } catch {}
  const byLook = {}; let secs = 0;
  db.history.forEach(h => { byLook[h.look] = (byLook[h.look] || 0) + 1; secs += h.duration || 0; });
  return {
    build: BUILD, node: process.version, platform: process.platform, port: PORT, uptime: Math.round((Date.now() - STARTED) / 1000),
    passwordFromEnv: !!process.env.ADMIN_PASSWORD, dataBytes, files,
    counts: { stories: db.stories.length, videos: db.history.length, seconds: Math.round(secs) }, byLook,
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

    if (r[0] === 'stories') {
      if (m === 'GET' && !id) return send(res, 200, db.stories.map(s => ({ id: s.id, name: s.name, createdAt: s.createdAt, updatedAt: s.updatedAt, summary: s.summary, issues: s.issues })));
      if (m === 'GET' && id) { const s = db.stories.find(x => x.id === id); return s ? send(res, 200, s) : send(res, 404, { error: 'História não encontrada.' }); }
      if (m === 'POST' && !id) {
        const b = await body(req, 3e6), st = b.story;
        if (!st || typeof st !== 'object') return send(res, 400, { error: 'Envie { name, story }.' });
        const issues = SCHEMA.validateStory(st), errs = issues.filter(i => i.level === 'erro');
        if (errs.length) return send(res, 422, { error: 'História com erros estruturais.', issues });
        if (db.stories.length >= 500) return send(res, 409, { error: 'Biblioteca cheia (500 histórias).' });
        const now = new Date().toISOString();
        const s = { id: crypto.randomBytes(6).toString('hex'), name: str(b.name, 80) || 'História sem nome', createdAt: now, updatedAt: now, summary: SCHEMA.summarize(st), issues: issues.length, story: st };
        db.stories.unshift(s); save();
        return send(res, 201, { id: s.id, issues });
      }
      if (m === 'PUT' && id) {
        const s = db.stories.find(x => x.id === id); if (!s) return send(res, 404, { error: 'História não encontrada.' });
        const b = await body(req, 3e6);
        if (b.name !== undefined) s.name = str(b.name, 80) || s.name;
        if (b.story) {
          const issues = SCHEMA.validateStory(b.story);
          if (issues.some(i => i.level === 'erro')) return send(res, 422, { error: 'História com erros estruturais.', issues });
          s.story = b.story; s.summary = SCHEMA.summarize(b.story); s.issues = issues.length;
        }
        s.updatedAt = new Date().toISOString(); save(); return send(res, 200, { ok: true });
      }
      if (m === 'DELETE' && id) { db.stories = db.stories.filter(x => x.id !== id); save(); return send(res, 200, { ok: true }); }
    }

    if (r[0] === 'validate' && m === 'POST') { const b = await body(req, 3e6); return send(res, 200, { issues: SCHEMA.validateStory(b.story) }); }

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
  if (p === '/admin') p = '/admin.html';
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
  console.log('  Admin:   http://localhost:' + PORT + '/admin');
  if (firstRunPassword) console.log('\n  >>> Senha inicial do admin: ' + firstRunPassword + '\n  >>> (aparece só desta vez; troque em Admin > Segurança)\n');
  else if (process.env.ADMIN_PASSWORD) console.log('  Senha do admin vem de ADMIN_PASSWORD.');
});
