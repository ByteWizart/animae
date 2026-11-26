// Servidor mínimo, sem dependências. Uso: node server.js  ->  http://localhost:3000
// Serve os arquivos estáticos e uma pequena API para o painel Admin (dados em dados.json).
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const SCHEMA = require('./public/js/schema.js');
const AI = require('./server/ai.js');
const PROV = require('./server/providers.js');
const SB = require('./server/supabase.js');
const TTS = require('./server/tts.js');
const CRED = require('./server/credits.js');
const CUPON = require('./server/cupons.js');
const SUPORTE = require('./server/suporte.js');

const dir = __dirname;
const PORT = +process.env.PORT || 3000;
// Os dados (chaves de IA, hash da senha, histórico) ficam numa pasta escondida, fora da lista de arquivos públicos.
// Para mudar o lugar (ex.: um disco persistente na hospedagem), defina DATA_DIR.
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(dir, '.dados');
const DATA_FILE = path.join(DATA_DIR, 'dados.json');
try {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  const OLD = path.join(dir, 'dados.json'); // migração: versões antigas guardavam o arquivo na raiz do site
  if (!fs.existsSync(DATA_FILE) && fs.existsSync(OLD)) { fs.copyFileSync(OLD, DATA_FILE); try { fs.chmodSync(DATA_FILE, 0o600); } catch {} }
  for (const f of ['dados.json', 'dados.json.tmp']) try { fs.unlinkSync(path.join(dir, f)); } catch {}
} catch (e) { console.warn('Aviso: não consegui preparar a pasta de dados (' + e.message + ')'); }
const BUILD = 16;
const STARTED = Date.now();

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript', '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.sql': 'text/plain; charset=utf-8' };
// Só estes arquivos são servidos pela web (lista permitida, sem diferenciar maiúsculas de minúsculas).
// Tudo o mais (server.js, ai.js, dados, .dados/...) nunca sai daqui, mesmo em Windows e macOS.
const PUBLIC_NAMES = ['home.html', 'index.html', 'docs.html', 'favicon.svg', 'css/ui.css', 'js/audio.js', 'js/auth.js', 'js/suporte.js', 'js/cupom.js', 'js/schema.js', 'js/guia.js', 'js/motor-extra.js', 'js/motor-extra2.js', 'js/theme.js', 'exemplos/historia-teste.json', 'exemplos/historia-demo-v9.json', 'exemplos/historia-demo-16x9.json'];
const PUB = path.join(dir, 'public'); // tudo o que é servido pela web fica em public/
const PUBLIC_MAP = new Map(); // nome em minúsculas -> caminho real
for (const n of PUBLIC_NAMES) PUBLIC_MAP.set(n, path.join(PUB, n));
PUBLIC_MAP.set('supabase-schema.sql', path.join(dir, 'database', 'supabase-schema.sql')); // o painel Admin copia este SQL
try { for (const n of fs.readdirSync(path.join(PUB, 'looks'))) if (/^[a-z0-9-]+\.jpg$/i.test(n)) PUBLIC_MAP.set('looks/' + n.toLowerCase(), path.join(PUB, 'looks', n)); } catch {}

/* ---------- dados ---------- */
const DEFAULTS = () => ({
  version: 1,
  settings: {
    look: 'cartoon', res: '720', fps: '30', historyLimit: 200,
    aspects: ['9:16', '16:9'], aspectDefault: '9:16', // formatos de tela liberados no gerador (o admin escolhe) e o formato que abre selecionado
    caption: { size: 110, color: '#ffffff', alt: '#ffd93b', y: 0.69, stroke: '#000000', upper: false },
  },
  auth: null,
  adminPath: null,
  ai: { enabled: true, provider: 'gemini', fallback: [], providers: {}, perHour: 20, maxTokens: 12000, extra: '' },
  tts: { enabled: true, perHour: 60, voice: 'pt-BR-FranciscaNeural' },
  credits: CRED.normalize(null), // créditos diários por pessoa (config + saldos); veja server/credits.js
  coupons: CUPON.normalize(null), // cupons (códigos que dão créditos e vantagens); veja server/cupons.js
  supabase: { url: '', anonKey: '', serviceKey: '', required: true, google: false },
  history: [], aiLog: [], aiStats: { total: 0, ok: 0, fail: 0, ms: 0 },
});
/* ---------- chaves criptografadas em disco (opcional: defina DATA_KEY) ---------- */
// Com DATA_KEY no ambiente, as chaves de IA, a service_role e o segredo do 2FA são gravadas cifradas (AES-256-GCM) no dados.json.
// Sem ela, continuam em texto puro (permissão 0600). Errar a DATA_KEY encerra o servidor, para nunca apagar as chaves por engano.
const DATA_KEY = process.env.DATA_KEY ? crypto.scryptSync(process.env.DATA_KEY, 'animae-data-v1', 32) : null;
const encS = v => {
  if (!DATA_KEY || typeof v !== 'string' || !v || v.startsWith('enc:v1:')) return v;
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', DATA_KEY, iv), ct = Buffer.concat([c.update(v, 'utf8'), c.final()]);
  return 'enc:v1:' + [iv, c.getAuthTag(), ct].map(x => x.toString('base64')).join(':');
};
const decS = v => {
  if (typeof v !== 'string' || !v.startsWith('enc:v1:')) return v;
  try {
    if (!DATA_KEY) throw 0;
    const [iv, tag, ct] = v.slice(7).split(':').map(x => Buffer.from(x, 'base64')), d = crypto.createDecipheriv('aes-256-gcm', DATA_KEY, iv);
    d.setAuthTag(tag); return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
  } catch { console.error('ERRO: o dados.json tem chaves cifradas, mas DATA_KEY está ausente ou incorreta. Defina a DATA_KEY original e reinicie.'); process.exit(1); }
};
function mapSecrets(d, f) {
  if (!d || typeof d !== 'object') return d;
  const pv = d.ai && d.ai.providers; if (pv && typeof pv === 'object') for (const v of Object.values(pv)) if (v && typeof v === 'object' && v.key) v.key = f(v.key);
  if (d.supabase && d.supabase.serviceKey) d.supabase.serviceKey = f(d.supabase.serviceKey);
  if (d.auth && d.auth.totp && d.auth.totp.secret) d.auth.totp.secret = f(d.auth.totp.secret);
  return d;
}
let db = DEFAULTS();
function load() {
  try {
    const d = mapSecrets(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')), decS), base = DEFAULTS();
    db = { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}), caption: { ...base.settings.caption, ...((d.settings || {}).caption || {}) } }, ai: { ...base.ai, ...(d.ai || {}) }, tts: { ...base.tts, ...(d.tts || {}) }, supabase: { ...base.supabase, ...(d.supabase || {}) } };
    delete db.stories; // a biblioteca agora fica no navegador de cada usuário
    db.credits = CRED.normalize(db.credits);
    db.coupons = CUPON.normalize(db.coupons);
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
const cfgHook = { fn: null }; // preenchido mais abaixo (sincronização das configurações com o Supabase)
function save() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(DATA_KEY ? mapSecrets(JSON.parse(JSON.stringify(db)), encS) : db, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, DATA_FILE);
  if (cfgHook.fn) try { cfgHook.fn(); } catch {}
}
load();
// Os saldos mudam a cada uso: gravamos com um pequeno atraso (juntando vários usos numa só gravação) e ao encerrar.
let saveTimer = null;
const saveSoon = () => { if (saveTimer) return; saveTimer = setTimeout(() => { saveTimer = null; try { save(); } catch (e) { console.warn('Aviso: não consegui gravar os créditos (' + e.message + ')'); } }, 1500); saveTimer.unref && saveTimer.unref(); };
const balHook = { fn: null }; // saldos de créditos no Supabase (definido mais abaixo)
const CR = CRED.create(() => db.credits, () => { saveSoon(); if (balHook.fn) balHook.fn(); });
const CP = CUPON.create(() => db.coupons, CR, () => saveSoon()); // cupons (usa o CR para dar créditos e vantagens)
const SP = SUPORTE.create(path.join(DATA_DIR, 'suporte.json')); // chat de suporte: qualquer um escreve, só o admin responde
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => { try { save(); SP.flush(); await Promise.race([Promise.all([cfgDbSave(), balFlush()]), new Promise(r => setTimeout(r, 2500))]); } catch {} process.exit(0); });

/* ---------- senha e sessões ---------- */
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString('hex');
const hashPwAsync = (pw, salt) => new Promise((ok, no) => crypto.scrypt(String(pw).slice(0, 1024), salt, 32, (e, k) => e ? no(e) : ok(k.toString('hex'))));
// Compara os SHA-256 dos dois textos: tempo constante e sem revelar o tamanho da senha.
const safeEq = (a, b) => { const h = v => crypto.createHash('sha256').update(String(v)).digest(); return crypto.timingSafeEqual(h(a), h(b)); };
function setPassword(pw) { pw = String(pw).slice(0, 1024); const salt = crypto.randomBytes(16).toString('hex'); db.auth = { ...(db.auth || {}), salt, hash: hashPw(pw, salt) }; save(); }
async function checkPassword(pw) {
  pw = String(pw == null ? '' : pw).slice(0, 1024);
  if (process.env.ADMIN_PASSWORD) return safeEq(pw, process.env.ADMIN_PASSWORD);
  return !!(db.auth && db.auth.salt) && safeEq(await hashPwAsync(pw, db.auth.salt), db.auth.hash);
}
/* ---------- 2FA (TOTP, RFC 6238: Google Authenticator, Authy, 1Password...) ---------- */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32enc = buf => { let bits = '', out = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return out; };
const b32dec = t => { let bits = ''; for (const c of t) bits += Math.max(0, B32.indexOf(c)).toString(2).padStart(5, '0'); const o = []; for (let i = 0; i + 8 <= bits.length; i += 8) o.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(o); };
const hotp = (secret, ctr) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(ctr)); const h = crypto.createHmac('sha1', b32dec(secret)).update(b).digest(), o = h[19] & 15; return String((((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
// Devolve o passo de tempo aceito (> 0) ou 0. Aceita ±30 s de diferença de relógio e recusa reutilizar um código já usado (last).
function totpCheck(secret, code, last) {
  code = String(code == null ? '' : code).replace(/\s/g, ''); if (!/^\d{6}$/.test(code) || !secret) return 0;
  const now = Math.floor(Date.now() / 30000); let hit = 0;
  for (let d = -1; d <= 1; d++) { const st = now + d; if (safeEq(hotp(secret, st), code) && st > (last || 0)) hit = st; }
  return hit;
}
const totpOn = () => !!(db.auth && db.auth.totp && db.auth.totp.enabled);
let firstRunPassword = null;
const validPath = v => /^[a-z0-9][a-z0-9_-]{3,39}$/i.test(v) && !['api', 'ajuda', 'docs', 'index', 'admin'].includes(v.toLowerCase());
// Cria a senha inicial e o endereço secreto do painel se ainda não existirem. Com Supabase, só roda DEPOIS de ler a
// configuração de lá (senão um servidor novo inventaria uma senha e apagaria a que já está guardada no banco).
function ensureAdminDefaults() {
  if (!process.env.ADMIN_PASSWORD && !(db.auth && db.auth.hash)) {
    firstRunPassword = crypto.randomBytes(6).toString('base64url');
    setPassword(firstRunPassword);
  }
  if (!db.adminPath) { db.adminPath = 'painel-' + crypto.randomBytes(5).toString('hex'); save(); }
}
const adminPath = () => (process.env.ADMIN_PATH && validPath(process.env.ADMIN_PATH) ? process.env.ADMIN_PATH : db.adminPath) || '';
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
const loginFails = []; let loginBusy = 0; // falhas de login de todos os IPs (últimos 10 min) e conferências em andamento
// Atrás de um proxy/hospedagem (Render, Railway, Nginx...), defina TRUST_PROXY=1 (quantos proxies confiáveis existem na frente).
// Sem isso, todos os visitantes pareceriam ter o mesmo IP. Com isso ligado, o IP vem do X-Forwarded-For.
const TRUST_PROXY = /^(true|yes|sim)$/i.test(process.env.TRUST_PROXY || '') ? 1 : Math.max(0, parseInt(process.env.TRUST_PROXY, 10) || 0);
let warnedProxy = false;
const ipOf = req => {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean);
  if (TRUST_PROXY && xff.length) return xff[Math.max(0, xff.length - TRUST_PROXY)];
  if (!TRUST_PROXY && xff.length && !warnedProxy) { warnedProxy = true; console.warn('AVISO: chegou X-Forwarded-For, mas TRUST_PROXY não está definido. Se o site roda atrás de proxy, defina TRUST_PROXY=1 para os limites por IP funcionarem.'); }
  return req.socket.remoteAddress || '?';
};
const isHttps = req => !!req.socket.encrypted || (TRUST_PROXY > 0 && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
function sameOrigin(req) { // pedidos que mudam algo só valem se vierem do próprio site
  const o = req.headers.origin; if (!o) return true;
  if (ALLOWED_ORIGINS.includes(o)) return true;
  try { const h = new URL(o).host; return h === req.headers.host || (TRUST_PROXY > 0 && h === String(req.headers['x-forwarded-host'] || '').split(',')[0].trim()); } catch { return false; }
}
// Scripts inline só rodam com o nonce de cada resposta (sem 'unsafe-inline'): um XSS não consegue executar código.
function csp(nonce) {
  let sb = ''; try { const u = sbCfg().url; if (u) sb = ' ' + new URL(u).origin; } catch {}
  return ["default-src 'self'", "script-src 'self'" + (nonce ? " 'nonce-" + nonce + "'" : ''), "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "media-src 'self' blob: data:", "font-src 'self' data:",
    "connect-src 'self' blob: data:" + sb, "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'"].join('; ');
}
function secHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'); res.setHeader('Cross-Origin-Opener-Policy', 'same-origin'); res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
}
// Limite global (todos os visitantes sem conta somados): protege a cota das suas chaves mesmo com muitos IPs.
const globalHits = { ai: [], tts: [] };
const GLOBAL_MAX = { ai: +process.env.AI_ANON_PER_HOUR || 150, tts: +process.env.TTS_ANON_PER_HOUR || 400 };
function gTake(k) { const now = Date.now(), a = globalHits[k] = globalHits[k].filter(t => now - t < 3600e3); if (a.length >= GLOBAL_MAX[k]) return false; a.push(now); return true; }
const gRefund = k => globalHits[k].pop();
// Reserva uma vaga no limite por hora ANTES de qualquer await: sem isso, pedidos simultâneos passariam todos pela checagem.
// Devolve uma função que cancela a reserva (para pedidos inválidos ou que falharam), ou null se o limite estourou.
function take(map, key, limit) {
  const now = Date.now(), a = (map.get(key) || []).filter(t => now - t < 3600e3);
  if (a.length >= limit) { map.set(key, a); return null; }
  a.push(now); map.set(key, a);
  return () => { const b = map.get(key), i = b ? b.lastIndexOf(now) : -1; if (i >= 0) b.splice(i, 1); };
}

/* ---------- utilidades HTTP ---------- */
const send = (res, code, obj, headers) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(headers || {}) }); res.end(JSON.stringify(obj)); };
function body(req, limit = 2e6) {
  return new Promise((ok, no) => {
    if (!/application\/json/i.test(req.headers['content-type'] || '')) return no({ code: 415, msg: 'Envie JSON (Content-Type: application/json).' });
    let n = 0; const ch = [];
    req.on('data', c => { n += c.length; if (n > limit) { no({ code: 413, msg: 'Corpo grande demais.' }); req.destroy(); } else ch.push(c); });
    req.on('end', () => { let j; try { j = JSON.parse(Buffer.concat(ch).toString('utf8') || '{}'); } catch { return no({ code: 400, msg: 'JSON inválido.' }); }
      if (!j || typeof j !== 'object' || Array.isArray(j)) return no({ code: 400, msg: 'Envie um objeto JSON.' });
      ok(j); });
    req.on('error', () => no({ code: 400, msg: 'Falha ao ler.' }));
  });
}
const clampN = (v, a, b, d) => (typeof v === 'number' && isFinite(v) ? Math.max(a, Math.min(b, v)) : d);
const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').slice(0, max).trim();
const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(v) ? v : d);

const ASPECTS = ['9:16', '16:9'];
function cleanAspects(s, cur) {
  // pelo menos um formato precisa ficar liberado; o inicial tem de estar entre os liberados
  const base = Array.isArray(cur.aspects) && cur.aspects.length ? cur.aspects : ASPECTS;
  let list = Array.isArray(s.aspects) ? ASPECTS.filter(a => s.aspects.includes(a)) : base;
  if (!list.length) list = base;
  const want = ASPECTS.includes(s.aspectDefault) ? s.aspectDefault : cur.aspectDefault;
  return { aspects: list, aspectDefault: list.includes(want) ? want : list[0] };
}
// formato permitido mais próximo do pedido (usado ao falar com a IA)
const aspectFor = a => { const al = db.settings.aspects || ASPECTS; return al.includes(a) ? a : (al.includes(db.settings.aspectDefault) ? db.settings.aspectDefault : al[0]); };
const forceStoryAspect = st => { // a história enviada pelo navegador não pode usar um formato desativado
  if (!st || typeof st !== 'object') return st;
  const cur = st.style && st.style.aspect === '16:9' ? '16:9' : '9:16', ok = aspectFor(cur);
  if (ok !== cur) { st.style = st.style || {}; if (ok === '16:9') st.style.aspect = '16:9'; else delete st.style.aspect; }
  return st;
};
function cleanSettings(s, cur) {
  const c = s.caption || {}, cc = cur.caption;
  return {
    ...cleanAspects(s, cur),
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
// Só as conferências que de fato vão ao Supabase (token novo, fora do cache) contam no limite por IP: quem manda tokens falsos
// em massa é barrado aqui e não esgota a cota do Supabase Auth (que derrubaria o login de todo mundo).
const verifyHits = new Map(); // ip -> [timestamps] (janela de 1 minuto)
const verifyGate = ip => { const now = Date.now(), a = (verifyHits.get(ip) || []).filter(t => now - t < 60e3); if (a.length >= 120) { verifyHits.set(ip, a); return false; } a.push(now); verifyHits.set(ip, a); return true; };
const authUser = async req => { const c = sbCfg(); if (!c.enabled) return null; const ip = ipOf(req); return SB.verify(c, tokenOf(req), () => verifyGate(ip)); };
// Barra quem não entrou: devolve o usuário, ou responde 401 e devolve false. { user:null } quando o login não é exigido.
async function needLogin(req, res) {
  const c = sbCfg();
  if (!c.enabled || !c.required) return { user: await authUser(req) };
  const user = await authUser(req);
  if (!user) { send(res, 401, { error: 'Entre na sua conta para gerar vídeos.', login: true }); return false; }
  return { user };
}

/* ---------- créditos ---------- */
// Quem é "a pessoa" para efeito de crédito: conta (token conferido) ou, sem login, o IP.
const credWho = (req, lg) => lg && lg.user ? { key: CR.userKey(lg.user.id), name: lg.user.email || lg.user.name || '' } : { key: CR.anonKey(ipOf(req)), name: '' };
const credHeaders = v => ({ 'X-Credits-Left': String(v.left), 'X-Credits-Daily': String(v.daily), 'X-Credits-Reset': String(v.resetIn) });
const fmtWait = s => { const t = Math.max(1, Math.ceil(s / 60)), h = Math.floor(t / 60), m = t % 60; return h ? h + ' h' + (m ? ' ' + m + ' min' : '') : m + ' min'; };
const noCredit = (res, c) => send(res, 402, { error: `Seus créditos acabaram (esta ação custa ${c.cost}, você tem ${c.left}). Eles renovam em ${fmtWait(c.resetIn)}.`, credits: true }, credHeaders(c));

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
    store: { enabled: cfgDbReady(), ok: cfgDb.ok, error: cfgDb.error },
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

/* ---------- configurações do painel no Supabase (tabela admin_config, veja supabase-schema.sql) ---------- */
// TODAS as configurações do Admin ficam numa única linha (id = 1) da tabela admin_config: formato da tela e legendas,
// IA (liga/desliga, provedor, reservas, modelos, TPM, limite por hora, instruções da casa e as chaves de API),
// voz, créditos (cota e custos), senha do painel (só o hash), 2FA, endereço secreto do painel e as opções de login.
// Fica fora: o endereço e as chaves de ACESSO ao próprio Supabase (precisam existir antes de conectar: variáveis de ambiente
// ou Admin > Conta e banco), o histórico de vídeos, o registro da IA e os saldos diários de créditos de cada pessoa.
// Com DATA_KEY definida, as chaves de API e o segredo do 2FA vão cifrados (AES-256-GCM) também para o banco.
// Funciona sozinho: o save() do servidor avisa (cfgHook) e qualquer mudança no painel é enviada em até ~1 s.
// Precisa da chave service_role; sem ela (ou sem Supabase) tudo fica só em dados.json, como antes.
const CFG_ROW = '/rest/v1/admin_config';
const cfgDb = { ok: null, error: '', at: 0, loading: null, loaded: false, dirty: false, last: '', timer: null }; // ok: null = não usa o banco, true = sincronizado, false = deu erro
const cfgDbReady = () => { const c = sbCfg(); return c.enabled && !!c.serviceKey; };
const cfgDbErr = r => (r.status === 404 || (r.json && /PGRST205|42P01/.test(String(r.json.code || '')))) ? 'A tabela admin_config não existe: rode o supabase-schema.sql no SQL Editor do Supabase.'
  : r.status === 401 || r.status === 403 ? 'O Supabase recusou a chave service_role.' : (r.json && (r.json.message || r.json.hint)) || 'Erro ' + r.status + ' no Supabase.';
const cfgDbCatch = e => e.name === 'TimeoutError' ? 'O Supabase demorou para responder.' : 'Não consegui falar com o Supabase (' + ((e.cause && e.cause.code) || e.message) + ').';
// A foto das configurações (sem cifrar: serve também para saber se algo mudou desde o último envio).
function cfgPlain() {
  const a = db.ai;
  return JSON.parse(JSON.stringify({
    v: 1, settings: db.settings,
    ai: { enabled: a.enabled, provider: a.provider, fallback: a.fallback, providers: a.providers, perHour: a.perHour, maxTokens: a.maxTokens, extra: a.extra },
    tts: db.tts, credits: db.credits.cfg, coupons: db.coupons, creditsSalt: db.credits.salt, auth: db.auth, adminPath: db.adminPath,
    supabase: { required: db.supabase.required, google: db.supabase.google },
  }));
}
// Aplica o que veio do banco (validando tudo, como numa importação).
function cfgApply(d) {
  d = mapSecrets(JSON.parse(JSON.stringify(d)), decS);
  if (d.settings && typeof d.settings === 'object') db.settings = cleanSettings(d.settings, db.settings);
  if (d.ai && typeof d.ai === 'object') {
    const a = db.ai, x = d.ai; a.providers = {};
    const err = applyAi({ enabled: x.enabled, extra: x.extra, perHour: x.perHour, provider: x.provider, fallback: x.fallback, providers: x.providers });
    if (err) console.warn('Aviso: a configuração da IA guardada no Supabase tem um valor inválido (' + err + ').');
    if (Number.isFinite(+x.maxTokens)) a.maxTokens = Math.round(clampN(+x.maxTokens, 12000, 100000, a.maxTokens));
  }
  if (d.tts && typeof d.tts === 'object') {
    const t = d.tts, a = db.tts;
    if (t.enabled !== undefined) a.enabled = !!t.enabled;
    if (+t.perHour) a.perHour = Math.round(clampN(+t.perHour, 1, 5000, a.perHour));
    if (typeof t.voice === 'string' && /^[a-z]{2,3}-[A-Z]{2}-[A-Za-z]{2,40}Neural$/.test(t.voice)) a.voice = t.voice;
  }
  if (d.credits && typeof d.credits === 'object') db.credits.cfg = CR.cleanCfg(d.credits, db.credits.cfg);
  if (d.coupons && typeof d.coupons === 'object') db.coupons = CUPON.normalize(d.coupons);
  // O sal do código dos visitantes (hash do IP) precisa ser sempre o mesmo, senão o mesmo visitante vira "outra pessoa" a cada reinício.
  if (typeof d.creditsSalt === 'string' && /^[0-9a-f]{16,64}$/.test(d.creditsSalt)) db.credits.salt = d.creditsSalt;
  if (d.auth && typeof d.auth === 'object' && /^[0-9a-f]{32}$/.test(d.auth.salt || '') && /^[0-9a-f]{64}$/.test(d.auth.hash || '')) {
    const n = { salt: d.auth.salt, hash: d.auth.hash }, t = d.auth.totp;
    if (t && typeof t === 'object' && /^[A-Z2-7]{16,64}$/.test(t.secret || '')) n.totp = { secret: t.secret, enabled: !!t.enabled, last: Math.max(0, Math.round(+t.last) || 0) };
    db.auth = n;
  }
  if (typeof d.adminPath === 'string' && validPath(d.adminPath)) db.adminPath = d.adminPath;
  if (d.supabase && typeof d.supabase === 'object') { if (typeof d.supabase.required === 'boolean') db.supabase.required = d.supabase.required; if (typeof d.supabase.google === 'boolean') db.supabase.google = d.supabase.google; }
}
// Envia as configurações atuais para o banco (nunca antes de ler o que já existe lá: ver cfgDb.loaded).
async function cfgDbSave() {
  if (!cfgDbReady()) { cfgDb.ok = null; cfgDb.error = ''; return false; }
  if (!cfgDb.loaded) return false;
  clearTimeout(cfgDb.timer);
  const key = JSON.stringify(cfgPlain());
  if (cfgDb.ok === true && key === cfgDb.last) return true; // nada mudou desde o último envio
  try {
    const r = await SB.call(sbCfg(), 'POST', CFG_ROW + '?on_conflict=id', {
      body: { id: 1, data: DATA_KEY ? mapSecrets(JSON.parse(key), encS) : JSON.parse(key), updated_at: new Date().toISOString() },
      extra: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
    cfgDb.ok = r.ok; cfgDb.error = r.ok ? '' : cfgDbErr(r);
    if (r.ok) { cfgDb.last = key; cfgDb.dirty = cfgDb.last !== JSON.stringify(cfgPlain()); cfgDb.at = Date.now(); }
    else { cfgDb.timer = setTimeout(cfgDbSave, 30e3); cfgDb.timer.unref && cfgDb.timer.unref(); } // tenta de novo daqui a pouco
    return r.ok;
  } catch (e) { cfgDb.ok = false; cfgDb.error = cfgDbCatch(e); cfgDb.timer = setTimeout(cfgDbSave, 30e3); cfgDb.timer.unref && cfgDb.timer.unref(); return false; }
}
// Chamado a cada save(): se algo das configurações mudou, agenda o envio (juntando várias mudanças seguidas).
cfgHook.fn = () => {
  if (!cfgDb.loaded || !cfgDbReady()) return;
  if (JSON.stringify(cfgPlain()) === cfgDb.last) return;
  cfgDb.dirty = true; clearTimeout(cfgDb.timer);
  cfgDb.timer = setTimeout(cfgDbSave, 800); cfgDb.timer.unref && cfgDb.timer.unref();
};
// Migração: quem já usava a tabela ai_config (provedor padrão e modelos) não perde nada na primeira vez.
async function cfgLegacyAi() {
  try {
    const r = await SB.call(sbCfg(), 'GET', '/rest/v1/ai_config?id=eq.1&select=provider,fallback,providers');
    const row = r.ok && Array.isArray(r.json) ? r.json[0] : null; if (!row) return;
    const err = applyAi({ provider: row.provider, fallback: row.fallback, providers: row.providers && typeof row.providers === 'object' ? row.providers : {} });
    if (err) console.warn('Aviso: ai_config antigo com valor inválido (' + err + ').');
  } catch {}
}
// Lê as configurações do banco e aplica por cima das locais. Sem linha ainda (primeira vez), envia as que estão valendo.
// Com force = false só consulta de novo depois de 30 s (vários servidores ou reinícios enxergam a mesma configuração).
function cfgDbLoad(force) {
  if (!cfgDbReady()) { cfgDb.ok = null; cfgDb.error = ''; return Promise.resolve(false); }
  if (!force && cfgDb.loaded && Date.now() - cfgDb.at < 30e3) return Promise.resolve(cfgDb.ok === true);
  if (cfgDb.loading) return cfgDb.loading;
  cfgDb.loading = (async () => {
    try {
      if (cfgDb.loaded && cfgDb.dirty) return await cfgDbSave(); // mudança local ainda não enviada vale mais que o banco
      const r = await SB.call(sbCfg(), 'GET', CFG_ROW + '?id=eq.1&select=data');
      if (!r.ok) { cfgDb.ok = false; cfgDb.error = cfgDbErr(r); return false; }
      const row = Array.isArray(r.json) ? r.json[0] : null, has = row && row.data && typeof row.data === 'object' && Object.keys(row.data).length;
      if (!has) { cfgDb.loaded = true; await cfgLegacyAi(); ensureAdminDefaults(); save(); return await cfgDbSave(); }
      cfgApply(row.data); cfgDb.loaded = true; // só libera o envio depois de aplicar o que já existe no banco
      cfgDb.last = JSON.stringify(cfgPlain()); cfgDb.dirty = false;
      ensureAdminDefaults(); // se o banco não tinha senha ou endereço, cria e envia (o save() agenda o envio)
      save(); cfgDb.ok = true; cfgDb.error = ''; cfgDb.at = Date.now();
      return true;
    } catch (e) { cfgDb.ok = false; cfgDb.error = cfgDbCatch(e); return false; }
    finally { cfgDb.loading = null; }
  })();
  return cfgDb.loading;
}
if (!cfgDbReady()) ensureAdminDefaults(); // sem Supabase, tudo como antes (com Supabase, isso roda depois de ler o banco, ao iniciar)

/* ---------- saldos de créditos no Supabase (tabela credit_balances, veja supabase-schema.sql) ---------- */
// Sem isso, hospedagem que apaga os arquivos ao reiniciar devolvia a cota cheia a todo mundo. Aqui ficam só os saldos de
// quem usou hoje ou tem créditos de presente (o mesmo que o dados.json guarda). Ao iniciar, o servidor lê o banco ANTES de abrir
// a porta; depois, cada uso é enviado em ~1,5 s (só as linhas que mudaram). Uma linha por pessoa (chave u:<id> ou ip:<hash>).
// Pensado para UM servidor ativo por vez (o saldo é contado na memória do servidor).
const BAL = '/rest/v1/credit_balances';
const bal = { ok: null, error: '', note: '', noX: false, loaded: false, loading: null, tried: 0, synced: new Map(), timer: null, busy: null };
const balRow = (k, e) => { const r = { key: k, d: String(e.d || ''), u: e.u | 0, b: e.b | 0, w: String(e.w || '').slice(0, 120), t: Math.round(e.t || 0), s: Math.round(e.s || 0) }; if (!bal.noX) r.x = balX(e) || {}; return r; }; // x vai sempre (num lote misto, o que falta viraria null); só some em banco antigo, sem a coluna
const balX = e => (e.p && e.p.length) || (e.c && Object.keys(e.c).length) ? { p: e.p || [], c: e.c || {} } : null; // vantagens de cupom + cupons já usados
const balSig = e => [e.d, e.u | 0, e.b | 0, e.w || '', e.s | 0, JSON.stringify(balX(e))].join('|');
const balOldDb = () => { bal.noX = true; bal.note = 'O Supabase ainda não tem a coluna x em credit_balances: cupons de vantagem e limites por pessoa só valem até reiniciar o servidor. Rode o supabase-schema.sql de novo no SQL Editor.'; };
const balMissingX = r => !!(r && !r.ok && r.json && /42703|PGRST204/.test(String(r.json.code || '')) && /\bx\b/.test(JSON.stringify(r.json))); // a coluna x ainda não existe (SQL antigo)
const balErr = r => balMissingX(r) ? 'Falta a coluna x em credit_balances (cupons): rode o supabase-schema.sql de novo no SQL Editor do Supabase.' : (r.status === 404 || (r.json && /PGRST205|42P01/.test(String(r.json.code || '')))) ? 'A tabela credit_balances não existe: rode o supabase-schema.sql no SQL Editor do Supabase.' : cfgDbErr(r);
// Lê tudo do banco e junta com o que já existe na memória: vale a linha mais recente (campo t) de cada pessoa.
function balLoad() {
  if (!cfgDbReady()) { bal.ok = null; bal.error = ''; return Promise.resolve(false); }
  if (bal.loading) return bal.loading;
  bal.tried = Date.now();
  bal.loading = (async () => {
    try {
      const us = db.credits.users, remote = new Map(); bal.noX = false; bal.note = '';
      for (let from = 0; from < 200000; from += 1000) { // PostgREST entrega até 1000 linhas por vez
        let r = await SB.call(sbCfg(), 'GET', BAL + '?select=key,d,u,b,w,t,s,x&order=key.asc&limit=1000&offset=' + from);
        if (balMissingX(r)) { balOldDb(); r = await SB.call(sbCfg(), 'GET', BAL + '?select=key,d,u,b,w,t,s&order=key.asc&limit=1000&offset=' + from); } // banco antigo, sem a coluna x
        if (!r.ok) { bal.ok = false; bal.error = balErr(r); return false; }
        const rows = Array.isArray(r.json) ? r.json : []; for (const x of rows) remote.set(x.key, x);
        if (rows.length < 1000) break;
      }
      const stale = [];
      for (const [k, x] of remote) {
        if (!/^(u:[\w-]{1,64}|ip:[0-9a-f]{8,64})$/.test(k)) continue;
        const e = { d: String(x.d || ''), u: Math.max(0, x.u | 0), b: Math.max(0, x.b | 0), w: String(x.w || '').slice(0, 120), t: +x.t || 0, s: +x.s || 0 }, cur = us[k];
        if (x.x && typeof x.x === 'object') { const pk = CRED.cleanPerks(x.x.p), cp = CRED.cleanUsedCoupons(x.x.c); if (pk.length) e.p = pk; if (Object.keys(cp).length) e.c = cp; }
        if (!CR.isCur(e) && !(e.b > 0) && !e.c && !CRED.perkInfo(e, Date.now()).until) { stale.push(k); continue; } // período antigo e sem presente: não precisa mais
        if (!cur || (+cur.t || 0) <= e.t) us[k] = e;
        bal.synced.set(k, balSig(e));
      }
      if (stale.length) await balDelete(stale);
      bal.loaded = true; bal.ok = true; bal.error = '';
      balSoon(); // o que só existia na memória (ou no dados.json) vai para o banco
      return true;
    } catch (e) { bal.ok = false; bal.error = cfgDbCatch(e); return false; }
    finally { bal.loading = null; }
  })();
  return bal.loading;
}
async function balDelete(keys) {
  for (let i = 0; i < keys.length; i += 50) {
    const list = keys.slice(i, i + 50).map(k => '"' + k + '"').join(',');
    const r = await SB.call(sbCfg(), 'DELETE', BAL + '?key=in.(' + encodeURIComponent(list) + ')');
    if (!r.ok) throw Object.assign(new Error('delete'), { resp: r });
    keys.slice(i, i + 50).forEach(k => bal.synced.delete(k));
  }
}
// Envia ao banco só o que mudou desde o último envio (linhas novas ou alteradas e as que saíram da memória).
function balFlush() {
  if (!cfgDbReady() || !bal.loaded) return Promise.resolve(false);
  if (bal.busy) return bal.busy;
  bal.busy = (async () => {
    try {
      const us = db.credits.users, up = [], gone = [];
      for (const [k, e] of Object.entries(us)) if (bal.synced.get(k) !== balSig(e)) up.push([k, e]);
      for (const k of bal.synced.keys()) if (!us[k]) gone.push(k);
      for (let i = 0; i < up.length; i += 500) {
        const chunk = up.slice(i, i + 500), send1 = () => SB.call(sbCfg(), 'POST', BAL + '?on_conflict=key', { body: chunk.map(([k, e]) => balRow(k, e)), extra: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
        let r = await send1();
        if (balMissingX(r)) { balOldDb(); r = await send1(); } // banco antigo: reenvia sem a coluna x
        if (!r.ok) { bal.ok = false; bal.error = balErr(r); return false; }
        chunk.forEach(([k, e]) => bal.synced.set(k, balSig(e)));
      }
      if (gone.length) await balDelete(gone);
      bal.ok = true; bal.error = ''; return true;
    } catch (e) { bal.ok = false; bal.error = e.resp ? balErr(e.resp) : cfgDbCatch(e); return false; }
  })().finally(() => { bal.busy = null; }); // (fora do try: sem nada a enviar a função termina antes de bal.busy receber a promessa)
  return bal.busy;
}
function balSoon() {
  if (!cfgDbReady() || bal.timer) return;
  bal.timer = setTimeout(() => { bal.timer = null; balFlush(); }, 1500); bal.timer.unref && bal.timer.unref();
}
balHook.fn = balSoon;
// Rede de segurança: se o banco estava fora do ar, tenta ler de novo a cada 30 s; se o envio falhou, tenta enviar de novo.
setInterval(() => { if (!cfgDbReady()) return; if (!cfgDb.loaded && Date.now() - (cfgDb.tried || 0) > 30e3) { cfgDb.tried = Date.now(); cfgDbLoad(true); } if (!bal.loaded) { if (Date.now() - bal.tried > 30e3) balLoad(); } else if (bal.ok === false) balFlush(); }, 10e3).unref();

// Registro de atividade da IA (últimos 200 usos) e totais, mostrados no painel.
function logAi(op, who, ok, ms, err) {
  db.aiLog = db.aiLog || []; db.aiStats = db.aiStats || { total: 0, ok: 0, fail: 0, ms: 0 };
  db.aiLog.unshift({ at: Date.now(), op, who: who || '', ok, ms, err: ok ? '' : String(err || '').slice(0, 300) }); db.aiLog.length = Math.min(db.aiLog.length, 200);
  const t = db.aiStats; t.total++; if (ok) { t.ok++; t.ms += ms; } else t.fail++;
}
const aiHits = new Map(); // ip -> [timestamps]
const histHits = new Map();
const creditHits = new Map();
// Ajuste fino da duração: quem PAGA uma voz ganha, por 20 minutos, até 3 regerações da voz e 3 reescritas do roteiro sem custo extra
// (para o roteiro caber na duração escolhida sem esticar o áudio). A ficha é amarrada à mesma conta/IP e se esgota sozinha.
const fitTokens = new Map(); // ficha -> { key, tts, ai, exp }
const fitIssue = key => { const t = crypto.randomBytes(12).toString('hex'); fitTokens.set(t, { key, tts: 3, ai: 3, exp: Date.now() + 20 * 60e3 }); return t; };
const fitGet = (req, key) => { const t = String(req.headers['x-fit-token'] || ''), e = fitTokens.get(t); return e && e.exp > Date.now() && e.key === key ? { t, e } : null; };
const couponHits = new Map(); // ip -> tentativas de cupom por hora
const couponUserHits = new Map(); // conta -> tentativas de cupom por hora (quem troca de IP não escapa do limite)
const couponOk = new Map(); // ip -> cupons resgatados COM SUCESSO na última hora (contra criar várias contas para o mesmo cupom)
const supportHits = new Map(); // ip -> mensagens de suporte por hora
const supportNew = new Map(); // ip -> conversas novas por hora
const supportPoll = new Map(); // token/ip -> consultas por hora
const ttsHits = new Map(); // ip -> [timestamps]
let ttsBusy = 0; const TTS_MAX_PARALLEL = 3;
const ttsInfo = () => ({ installed: TTS.available(), enabled: !!db.tts.enabled, perHour: db.tts.perHour, voice: db.tts.voice, maxChars: TTS.MAX_CHARS });

function status() {
  const expected = ['server.js', 'package.json', 'README.md', 'admin/admin.html', 'database/supabase-schema.sql', 'server/ai.js', 'server/credits.js', 'server/cupons.js', 'server/suporte.js', 'server/providers.js', 'server/supabase.js', 'server/tts.js', 'public/index.html', 'public/home.html', 'public/docs.html', 'public/favicon.svg', 'public/css/ui.css', 'public/js/audio.js', 'public/js/auth.js', 'public/js/suporte.js', 'public/js/cupom.js', 'public/js/schema.js', 'public/js/guia.js', 'public/js/theme.js', 'public/js/motor-extra.js', 'public/js/motor-extra2.js', 'public/exemplos/historia-teste.json', 'public/exemplos/historia-demo-v9.json', 'public/exemplos/historia-demo-16x9.json'];
  const files = expected.map(f => { try { const s = fs.statSync(path.join(dir, f)); return { name: f, ok: true, bytes: s.size, mtime: s.mtimeMs }; } catch { return { name: f, ok: false }; } });
  let dataBytes = 0; try { dataBytes = fs.statSync(DATA_FILE).size; } catch {}
  const byLook = {}; let secs = 0;
  db.history.forEach(h => { byLook[h.look] = (byLook[h.look] || 0) + 1; secs += h.duration || 0; });
  const byDay = []; // vídeos e segundos nos últimos 14 dias
  for (let d = 13; d >= 0; d--) { const t = new Date(); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() - d); byDay.push({ day: t.getTime(), n: 0 }); }
  db.history.forEach(h => { const t = new Date(h.at); t.setHours(0, 0, 0, 0); const e = byDay.find(x => x.day === t.getTime()); if (e) e.n++; });
  return {
    build: BUILD, node: process.version, platform: process.platform, port: PORT, uptime: Math.round((Date.now() - STARTED) / 1000),
    passwordFromEnv: !!process.env.ADMIN_PASSWORD, totp: totpOn(), encrypted: !!DATA_KEY, dataBytes, files,
    tts: ttsInfo(), counts: { videos: db.history.length, seconds: Math.round(secs), ideas: db.aiCount || 0 }, byLook,
    supabase: { enabled: sbCfg().enabled, required: sbCfg().required }, byDay, aiStats: db.aiStats || { total: 0, ok: 0, fail: 0, ms: 0 }, ai: aiInfo(), adminPath: adminPath(), adminPathFromEnv: !!process.env.ADMIN_PATH,
  };
}


/* ---------- ícones online (Iconify, API pública, sem chave) ---------- */
// Um proxy com cache em disco: o navegador pede /api/icon?q=rocket (ou ?id=noto:rocket) no mesmo endereço do site,
// então o desenho no canvas não "contamina" a gravação do vídeo, e cada ícone só é baixado uma vez.
const ICON_DIR = path.join(dir, '.cache-icones');
const ICON_API = 'https://api.iconify.design';
const ICON_MAX = 3000; // máximo de ícones guardados em disco
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
    if (/<script|<foreignObject|<iframe|<object|<embed|\son[a-z]+\s*=|javascript:/i.test(svg.toString())) throw new Error('SVG com conteúdo ativo'); // defesa extra: o SVG vem de terceiros
    fs.mkdirSync(ICON_DIR, { recursive: true });
    let nFiles = ICON_MAX; try { nFiles = fs.readdirSync(ICON_DIR).length; } catch {}
    if (nFiles < ICON_MAX) fs.writeFileSync(file, svg); // teto de arquivos no cache: ninguém enche o disco pedindo ícones sem fim
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
    if (m !== 'GET' && m !== 'HEAD' && !sameOrigin(req)) return send(res, 403, { error: 'Origem não permitida.' });
    if (p === '/api/settings' && m === 'GET') return send(res, 200, publicSettings());
    if (p === '/api/session' && m === 'GET') return send(res, 200, { admin: isAdmin(req), build: BUILD, totp: totpOn() });

    if (p === '/api/login' && m === 'POST') {
      const ip = ipOf(req), f = fails.get(ip);
      if (f && f.until > Date.now()) return send(res, 429, { error: `Muitas tentativas. Aguarde ${Math.ceil((f.until - Date.now()) / 1000)} s.` });
      // A tentativa é contada ANTES de conferir a senha: chutes simultâneos não furam o limite.
      { const n = (f ? f.n : 0) + 1, lvl = f ? f.lvl || 0 : 0; fails.set(ip, n >= 5 ? { n: 0, lvl: lvl + 1, until: Date.now() + Math.min(900e3, 60e3 * 2 ** lvl), at: Date.now() } : { n, lvl, until: 0, at: Date.now() }); }
      const b = await body(req, 1e4);
      // Ataque distribuído (muitos IPs): no máximo 3 conferências ao mesmo tempo e, se houver muitas falhas no total, cada tentativa espera mais.
      if (loginBusy >= 3) return send(res, 429, { error: 'Muitas tentativas ao mesmo tempo. Aguarde alguns segundos.' });
      loginBusy++;
      let okLogin = false;
      try {
        const now = Date.now(); while (loginFails.length && now - loginFails[0] > 600e3) loginFails.shift();
        if (loginFails.length > 30) await new Promise(r => setTimeout(r, Math.min(5000, 500 + (loginFails.length - 30) * 100)));
        const tot = totpOn() ? db.auth.totp : null;
        const okPw = await checkPassword(b.password), step = tot ? totpCheck(tot.secret, b.code, tot.last) : 1; // confere os dois sempre (sem revelar qual errou)
        okLogin = okPw && !!step;
        if (okLogin && tot) { tot.last = step; save(); }
      } finally { loginBusy--; }
      if (!okLogin) { loginFails.push(Date.now()); return send(res, 401, { error: totpOn() ? 'Senha ou código incorretos.' : 'Senha incorreta.' }); }
      fails.delete(ip);
      return send(res, 200, { ok: true }, { 'Set-Cookie': `sid=${newSession()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${isHttps(req) ? '; Secure' : ''}` });
    }
    if (p === '/api/logout' && m === 'POST') { sessions.delete(cookieOf(req).sid); return send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' + (isHttps(req) ? '; Secure' : '') }); }

    // Histórico: o gerador registra cada vídeo pronto (sem login; só guarda metadados).
    if (p === '/api/history' && m === 'POST') {
      const lg = await needLogin(req, res); if (!lg) return;
      if (!take(histHits, lg.user ? 'u:' + lg.user.id : ipOf(req), 40)) return send(res, 429, { error: 'Muitos registros por hora.' });
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
    // Saldo de créditos de quem está perguntando (só leitura; quem decide é sempre o servidor).
    if (p === '/api/credits' && m === 'GET') {
      const c = sbCfg(), user = await authUser(req);
      if (c.enabled && c.required && !user) return send(res, 200, { enabled: false }, { 'Cache-Control': 'no-store' });
      const w = credWho(req, { user });
      if (!take(creditHits, w.key, 240)) return send(res, 429, { error: 'Muitas consultas.' });
      const v = CR.view(w.key);
      return send(res, 200, { enabled: v.enabled, daily: v.daily, used: v.used, bonus: v.bonus, left: v.left, resetIn: v.resetIn, every: v.every, costs: v.costs, perks: v.perks, anon: !user }, { 'Cache-Control': 'no-store', ...credHeaders(v) });
    }

    /* ---------- cupons ---------- */
    // Resgatar um cupom. Tudo é conferido aqui: o navegador só manda o código e mostra a resposta.
    if (p === '/api/coupons/redeem' && m === 'POST') {
      const lg = await needLogin(req, res); if (!lg) return;
      const ip = ipOf(req);
      const giveIp = take(couponHits, ip, 15); // tentativas por IP: quem chuta códigos é barrado rápido
      if (!giveIp) return send(res, 429, { error: 'Muitas tentativas de cupom. Aguarde um pouco e tente de novo.' });
      const giveUser = lg.user ? take(couponUserHits, lg.user.id, 20) : null; // e também por conta: trocar de IP não zera a contagem
      if (lg.user && !giveUser) { giveIp(); return send(res, 429, { error: 'Muitas tentativas de cupom. Aguarde um pouco e tente de novo.' }); }
      const undo = () => { giveIp(); if (giveUser) giveUser(); };
      const b = await body(req, 1e3);
      if (!db.credits.cfg.enabled) { undo(); return send(res, 409, { error: 'O sistema de créditos está desligado no momento.' }); }
      // Resgates com SUCESSO por rede: sem isso, uma pessoa criaria várias contas e usaria o mesmo cupom em todas.
      const nowOk = Date.now(), okList = (couponOk.get(ip) || []).filter(t => nowOk - t < 3600e3); couponOk.set(ip, okList);
      if (okList.length >= 10) return send(res, 429, { error: 'Muitos cupons resgatados desta rede na última hora. Tente de novo mais tarde.' });
      const cw = credWho(req, lg), r = CP.redeem(b.code, { key: cw.key, name: cw.name, hasAccount: !!lg.user }, sbCfg().enabled);
      if (r.error) return send(res, r.login ? 401 : 400, { error: r.error, ...(r.login ? { login: true } : {}) });
      undo(); okList.push(nowOk); // deu certo: não conta como tentativa errada (mas conta no limite de resgates por rede)
      save(); const v = CR.view(cw.key);
      return send(res, 200, { ok: true, message: r.message, gave: r.gave, credits: { enabled: v.enabled, daily: v.daily, used: v.used, bonus: v.bonus, left: v.left, resetIn: v.resetIn, every: v.every, costs: v.costs, perks: v.perks, anon: !lg.user } }, credHeaders(v));
    }

    /* ---------- chat de suporte (qualquer pessoa escreve; só o admin responde) ---------- */
    // O visitante guarda um token no navegador; ele só abre a PRÓPRIA conversa.
    const supTok = () => String(req.headers['x-support-token'] || '');
    if (p === '/api/support/send' && m === 'POST') {
      const ip = ipOf(req);
      const undoMsg = take(supportHits, ip, 20); if (!undoMsg) return send(res, 429, { error: 'Muitas mensagens por hora. Tente de novo mais tarde.' });
      const b = await body(req, 4e3);
      if (b.website) { undoMsg(); return send(res, 200, { ok: true }); } // campo-isca: robôs preenchem, pessoas não (não responde erro de propósito)
      const tok = SUPORTE.validToken(b.token) ? b.token : (SUPORTE.validToken(supTok()) ? supTok() : '');
      let undoNew = null;
      // Quase cheio: só quem tem conta abre conversa nova (spam com IPs trocados não consegue lotar e travar o suporte).
      if (!tok && SP.nearFull() && sbCfg().enabled) { const u0 = await authUser(req).catch(() => null); if (!u0) { undoMsg(); return send(res, 401, { error: 'O suporte está com muitas conversas abertas. Entre na sua conta para abrir uma nova.', login: true }); } }
      if (!tok) { undoNew = take(supportNew, ip, 4); if (!undoNew) { undoMsg(); return send(res, 429, { error: 'Muitas conversas novas por hora. Tente de novo mais tarde.' }); } }
      const user = await authUser(req).catch(() => null); // se a pessoa estiver logada, o admin vê o e-mail da conta
      const r = SP.send(tok, b.text, { name: b.name, email: user ? user.email : '' });
      if (r.error) { undoMsg(); if (undoNew) undoNew(); return send(res, r.code || 400, { error: r.error }); }
      return send(res, 201, { ok: true, token: r.token, msg: r.msg, closed: r.closed });
    }
    if (p === '/api/support/thread' && m === 'GET') {
      const tok = supTok(), q = new URL(req.url, 'http://x').searchParams;
      if (!SUPORTE.validToken(tok)) return send(res, 200, { exists: false });
      if (!take(supportPoll, tok.slice(0, 16), 1500)) return send(res, 429, { error: 'Muitas consultas.' });
      const r = SP.poll(tok, +q.get('after') || 0);
      if (!r) return send(res, 200, { exists: false });
      if (q.get('read') === '1') SP.markReadByUser(tok);
      return send(res, 200, { exists: true, ...r });
    }

    if (p === '/api/ai/status' && m === 'GET') { const i = aiInfo(); return send(res, 200, { available: i.enabled && i.hasKey, perHour: i.perHour }); }
    // Prompt pronto para copiar e usar em outra IA (ChatGPT, Claude...): as mesmas regras que o site usa.
    if (p === '/api/ai/prompt' && m === 'GET') {
      const q = new URL(req.url, 'http://x').searchParams, seconds = [20, 30, 45, 60].includes(+q.get('seconds')) ? +q.get('seconds') : 30;
      return send(res, 200, { prompt: AI.systemPrompt({ aspect: aspectFor(q.get('aspect') === '16:9' ? '16:9' : '9:16'), seconds, look: SCHEMA.SET.look.has(q.get('look')) ? q.get('look') : '', format: q.get('format') || 'auto', tone: q.get('tone') || 'auto', lang: q.get('lang') || '', music: q.get('music') || '', cast: +q.get('cast') || 0, extra: '' }) }); // as instruções da casa (db.ai.extra) são privadas: não saem neste endpoint público
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
      const fitTk = fitGet(req, credWho(req, lg).key), useFit = !!(fitTk && fitTk.e.tts > 0); // regeração do ajuste fino: sem custo e fora do limite por hora
      const refund = useFit ? () => {} : take(ttsHits, lg.user ? 'u:' + lg.user.id : ipOf(req), db.tts.perHour);
      if (!refund) return send(res, 429, { error: `Limite de ${db.tts.perHour} vozes por hora atingido. Tente mais tarde.` });
      let done = false, gt = false, busy = false, cr = null;
      try {
        const b = await body(req, 3e4);
        gt = !lg.user; if (gt && !gTake('tts')) { gt = false; return send(res, 429, { error: 'O site atingiu o limite de vozes desta hora. Tente mais tarde ou entre na sua conta.' }); }
        if (ttsBusy >= TTS_MAX_PARALLEL) { if (gt) gRefund('tts'); return send(res, 429, { error: 'O servidor de voz está ocupado. Tente de novo em alguns segundos.' }); }
        if (!useFit) { const cw = credWho(req, lg); cr = CR.charge(cw.key, cw.name, 'tts'); if (!cr.ok) { const c = cr; cr = null; if (gt) gRefund('tts'); return noCredit(res, c); } }
        ttsBusy++; busy = true; // checagem e incremento juntos, sem await no meio
        const mp3 = await TTS.synth({ text: b.text, voice: str(b.voice, 60) || db.tts.voice, rate: +b.rate, pitch: +b.pitch });
        done = true;
        const tkn = useFit ? (fitTk.e.tts--, fitTk.t) : fitIssue(credWho(req, lg).key);
        res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': mp3.length, 'Cache-Control': 'no-store', 'X-Fit-Token': tkn, ...credHeaders(CR.view(credWho(req, lg).key)) });
        return res.end(mp3);
      } catch (e) { if (gt) gRefund('tts'); throw e; } finally { if (busy) ttsBusy--; if (!done) { refund(); if (cr) cr.refund(); } }
    }
    const aiOp = p.startsWith('/api/ai/') ? p.slice(8) : '';
    if (m === 'POST' && ['generate', 'refine', 'ideas', 'review', 'translate', 'fit'].includes(aiOp)) {
      const lg = await needLogin(req, res); if (!lg) return;
      await cfgDbLoad();
      const i = aiInfo();
      if (!i.enabled || !i.hasKey) return send(res, 503, { error: 'A criação com IA não está configurada neste site.' });
      const fitTk = aiOp === 'fit' ? fitGet(req, credWho(req, lg).key) : null; // o ajuste do roteiro só existe junto com uma voz paga
      if (aiOp === 'fit' && !(fitTk && fitTk.e.ai > 0)) return send(res, 403, { error: 'O ajuste automático do roteiro vem junto com a voz: gere a voz primeiro (ou os ajustes dessa voz já acabaram).' });
      const refund = aiOp === 'fit' ? () => {} : take(aiHits, lg.user ? 'u:' + lg.user.id : ipOf(req), db.ai.perHour);
      if (!refund) return send(res, 429, { error: `Limite de ${db.ai.perHour} usos da IA por hora atingido. Tente mais tarde.` });
      let counted = false;
      try {
      const b = await body(req, aiOp === 'generate' || aiOp === 'ideas' ? 2e4 : 5e5);
      const llm = { chain: aiChain() }, common = { llm, maxTokens: db.ai.maxTokens, extra: db.ai.extra || '', tpm: llm.chain[0].tpm };
      const opt = { aspect: aspectFor(b.aspect === '16:9' ? '16:9' : '9:16'), seconds: +b.seconds, look: SCHEMA.SET.look.has(b.look) ? b.look : '', format: str(b.format, 20), tone: str(b.tone, 20), lang: str(b.lang, 8), music: str(b.music, 20), cast: +b.cast, wps: +b.wps };
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
        forceStoryAspect(b.story);
        const script = str(b.script, 6000);
        if (aiOp === 'refine') {
          const instruction = str(b.instruction, 1200);
          if (instruction.length < 5) return send(res, 400, { error: 'Diga o que você quer mudar.' });
          job = () => AI.refine({ ...common, ...opt, story: b.story, script, instruction });
        } else if (aiOp === 'review') job = () => AI.review({ llm, story: b.story, script, tpm: common.tpm });
        else if (aiOp === 'fit') job = () => AI.fit({ ...common, story: b.story, script, want: +b.want, seconds: +b.seconds });
        else job = () => AI.translate({ ...common, story: b.story, script, lang: str(b.lang, 8) });
      }
      const cw = credWho(req, lg), cr = aiOp === 'fit' ? { ok: true, refund() {} } : CR.charge(cw.key, cw.name, aiOp); // gasta o crédito ANTES de chamar a IA (o ajuste fino não cobra)
      if (!cr.ok) return noCredit(res, cr);
      const ga = !lg.user && aiOp !== 'fit'; if (ga && !gTake('ai')) { cr.refund(); return send(res, 429, { error: 'O site atingiu o limite de usos da IA desta hora. Tente mais tarde ou entre na sua conta.' }); }
      counted = true;
      const t0 = Date.now();
      try {
        const out = await job();
        if (out && typeof out === 'object') out.provider = llm.lastUsed || ''; // qual IA respondeu (útil quando há reserva)
        if (fitTk) fitTk.e.ai--;
        db.aiCount = (db.aiCount || 0) + 1; logAi(aiOp, llm.lastUsed, true, Date.now() - t0); save();
        return send(res, 200, out, credHeaders(CR.view(cw.key)));
      } catch (e) { counted = false; cr.refund(); if (ga) gRefund('ai'); logAi(aiOp, llm.lastUsed, false, Date.now() - t0, e && (e.msg || e.message)); save(); throw e; }
      } finally { if (!counted) refund(); }
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
    if (r[0] === 'ai' && m === 'GET') { await cfgDbLoad(true); return send(res, 200, aiInfo()); }
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
      save(); await cfgDbSave(); return send(res, 200, aiInfo());
    }
    if (r[0] === 'supabase') {
      const e = process.env, c = db.supabase, eff = sbCfg();
      const info = () => { const eff = sbCfg(); return {  url: c.url, anonKey: c.anonKey ? '…' + c.anonKey.slice(-6) : '', hasAnon: !!eff.anonKey, hasService: !!eff.serviceKey, serviceHint: eff.serviceKey ? '…' + eff.serviceKey.slice(-4) : '', required: eff.required, google: !!c.google, enabled: eff.enabled, effectiveUrl: eff.url,
        env: { url: !!e.SUPABASE_URL, anon: !!(e.SUPABASE_ANON_KEY || e.SUPABASE_KEY), service: !!(e.SUPABASE_SERVICE_KEY || e.SUPABASE_SERVICE_ROLE_KEY), required: e.REQUIRE_LOGIN !== undefined } }; };
      if (id === 'test' && m === 'POST') {
        if (!eff.enabled) return send(res, 400, { error: 'Informe o endereço (https://…supabase.co) e a chave anon.' });
        const h = await SB.health(eff); let users = null; const st = h.serviceTest; if (st && !st.ok) h.serviceError = 'HTTP ' + st.status + ', chave ' + st.format + (st.msg ? ', Supabase diz: ' + st.msg : ''); if (h.ok && eff.serviceKey && !h.serviceError) { try { users = (await SB.listUsers(eff, 1, 1)).total; } catch (x) { h.serviceError = x.message; } }
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
        cfgDb.loaded = false; cfgDb.last = ''; save(); await cfgDbLoad(true); return send(res, 200, info());
      }
    }
    if (r[0] === 'ailog' && m === 'GET') return send(res, 200, db.aiLog);
    if (r[0] === 'ailog' && m === 'DELETE') { db.aiLog = []; db.aiStats = { total: 0, ok: 0, fail: 0, ms: 0 }; save(); return send(res, 200, { ok: true }); }
    if (r[0] === 'export' && m === 'GET') { // backup das configurações (sem as chaves, a menos que se peça ?keys=1)
      const withKeys = new URL(req.url, 'http://x').searchParams.get('keys') === '1';
      const provs = JSON.parse(JSON.stringify(db.ai.providers)); if (!withKeys) for (const v of Object.values(provs)) delete v.key;
      return send(res, 200, { app: 'shorts-animados', version: 1, exportedAt: new Date().toISOString(), settings: db.settings, credits: db.credits.cfg, coupons: db.coupons, ai: { enabled: db.ai.enabled, provider: db.ai.provider, fallback: db.ai.fallback, perHour: db.ai.perHour, extra: db.ai.extra, providers: provs } });
    }
    if (r[0] === 'import' && m === 'POST') {
      const b = await body(req, 2e5);
      if (!b || b.app !== 'shorts-animados') return send(res, 400, { error: 'Esse arquivo não é um backup do painel.' });
      if (b.settings) db.settings = cleanSettings(b.settings, db.settings);
      if (b.credits && typeof b.credits === 'object') db.credits.cfg = CR.cleanCfg(b.credits, db.credits.cfg);
      if (b.coupons && typeof b.coupons === 'object') db.coupons = CUPON.normalize(b.coupons);
      if (b.ai && typeof b.ai === 'object') { const err = applyAi(b.ai); if (err) return send(res, 400, { error: err }); }
      save(); await cfgDbSave(); return send(res, 200, { ok: true });
    }

    if (r[0] === 'credits') {
      if (!id && m === 'GET') return send(res, 200, { cfg: db.credits.cfg, users: CR.list(), totals: CR.totals(), tz: CRED.TZ, ops: CRED.OP_NAMES, store: { enabled: cfgDbReady(), ok: bal.ok, error: bal.error, note: bal.note } });
      if (!id && m === 'PUT') { db.credits.cfg = CR.cleanCfg(await body(req, 5e3), db.credits.cfg); save(); return send(res, 200, { cfg: db.credits.cfg }); }
      if (id === 'all' && m === 'POST') { // em lote, para quem aparece na lista: restaurar a cota ou zerar os créditos
        const b = await body(req, 1e3), act = b.action === 'zero' ? 'zero' : b.action === 'restore' ? 'restore' : '';
        if (!act) return send(res, 400, { error: 'Ação inválida.' });
        const n = CR.bulk(act); save(); return send(res, 200, { ok: true, count: n });
      }
      if (id === 'grant' && m === 'POST') { // dar (ou tirar) créditos de presente, ou zerar o uso de hoje
        const b = await body(req, 2e3), who = str(b.who, 120);
        if (!who) return send(res, 400, { error: 'Informe o e-mail da pessoa (ou o código do visitante).' });
        let key = /^(u:[\w-]{1,64}|ip:[0-9a-f]{8,64})$/.test(who) ? who : null, label = '';
        if (!key && who.includes('@')) {
          key = CR.findByEmail(who); label = who;
          if (!key) { // quem ainda não usou nada: procura no Supabase
            const c = sbCfg();
            if (c.enabled && c.serviceKey) { try { const u = (await SB.listUsers(c, 1, 1000)).users.find(x => String(x.email).toLowerCase() === who.toLowerCase()); if (u) key = CR.userKey(u.id); } catch {} }
          }
        }
        if (!key) return send(res, 404, { error: 'Não encontrei essa pessoa. Use o e-mail da conta (o Supabase precisa estar ligado com a service_role) ou o código "ip:…" da lista.' });
        if (b.reset) return send(res, 200, { ok: true, credits: CR.resetUsage(key) }); // restaurar a cota (zera o gasto)
        if (b.zero) { const v = CR.zero(key, label); save(); return send(res, 200, { ok: true, credits: v }); } // zerar os créditos da pessoa
        const n = Math.round(+b.amount);
        if (!Number.isFinite(n) || n === 0 || Math.abs(n) > 100000) return send(res, 400, { error: 'Informe uma quantidade de créditos (ex.: 50, ou -10 para tirar).' });
        const v = CR.grant(key, n, label); save(); return send(res, 200, { ok: true, credits: v });
      }
    }
    if (r[0] === 'coupons') {
      if (!id && m === 'GET') return send(res, 200, { coupons: CP.list(), enabled: !!db.credits.cfg.enabled, store: { enabled: cfgDbReady(), note: bal.note }, loginOn: sbCfg().enabled });
      if (!id && m === 'POST') { // criar um cupom (ou vários códigos únicos de uma vez, com count)
        const b = await body(req, 4e3), count = Math.round(+b.count) || 1;
        if (count > 1) { const x = CP.batch(b, count); if (x.error) return send(res, 400, { error: x.error }); save(); return send(res, 201, { coupons: x.made }); }
        const x = CP.upsert({ ...b, code: b.code ? b.code : CUPON.randomCode(b.prefix) }, true);
        if (x.error) return send(res, 400, { error: x.error }); save(); return send(res, 201, { coupon: x.coupon });
      }
      if (id && m === 'PUT') { const x = CP.upsert({ ...(await body(req, 4e3)), code: id }, false); if (x.error) return send(res, 400, { error: x.error }); save(); return send(res, 200, { coupon: x.coupon }); }
      if (id && m === 'DELETE') { if (!CP.remove(id)) return send(res, 404, { error: 'Cupom não encontrado.' }); save(); return send(res, 200, { ok: true }); }
    }
    if (r[0] === 'support') {
      if (!id && m === 'GET') return send(res, 200, { threads: SP.list(), unread: SP.unread() });
      if (id === 'unread' && m === 'GET') return send(res, 200, { unread: SP.unread() });
      if (id === 'purge' && m === 'POST') { const n = SP.purgeClosed(); return send(res, 200, { ok: true, count: n }); }
      if (id && !r[2] && m === 'GET') { const t = SP.get(id, true); return t ? send(res, 200, t) : send(res, 404, { error: 'Conversa não encontrada.' }); }
      if (id && r[2] === 'reply' && m === 'POST') { const x = SP.reply(id, (await body(req, 4e3)).text); return x.error ? send(res, x.code || 400, { error: x.error }) : send(res, 201, x); }
      if (id && r[2] === 'close' && m === 'POST') { const b = await body(req, 1e3); return SP.setClosed(id, b.closed !== false) ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Conversa não encontrada.' }); }
      if (id && !r[2] && m === 'DELETE') return SP.remove(id) ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Conversa não encontrada.' });
    }
    if (r[0] === 'tts' && m === 'GET') return send(res, 200, ttsInfo());
    if (r[0] === 'tts' && m === 'PUT') {
      const b = await body(req, 1e4), a = db.tts;
      if (b.enabled !== undefined) a.enabled = !!b.enabled;
      if (b.perHour !== undefined) a.perHour = Math.round(clampN(+b.perHour, 1, 5000, a.perHour));
      if (typeof b.voice === 'string' && /^[a-z]{2,3}-[A-Z]{2}-[A-Za-z]{2,40}Neural$/.test(b.voice)) a.voice = b.voice;
      save(); return send(res, 200, ttsInfo());
    }
    if (r[0] === 'totp' && m === 'POST') {
      const b = await body(req, 1e3);
      if (id === 'setup') {
        if (totpOn()) return send(res, 409, { error: 'O 2FA já está ativo. Desative antes de gerar outro segredo.' });
        const secret = b32enc(crypto.randomBytes(20)); db.auth = db.auth || {}; db.auth.totp = { secret, enabled: false, last: 0 }; save();
        return send(res, 200, { secret, uri: 'otpauth://totp/Anima%20Admin?issuer=Anima&secret=' + secret });
      }
      if (id === 'enable') {
        const t = db.auth && db.auth.totp; if (!t || t.enabled) return send(res, 400, { error: 'Gere o segredo primeiro.' });
        const st = totpCheck(t.secret, b.code, 0); if (!st) return send(res, 400, { error: 'Código incorreto. Confira a hora do celular e tente de novo.' });
        t.enabled = true; t.last = st; save(); return send(res, 200, { ok: true });
      }
      if (id === 'disable') {
        const t = db.auth && db.auth.totp; if (!t) return send(res, 200, { ok: true });
        const okPw = await checkPassword(b.password), st = t.enabled ? totpCheck(t.secret, b.code, t.last) : 1;
        if (!okPw || !st) return send(res, 403, { error: 'Senha ou código incorretos.' });
        delete db.auth.totp; save(); return send(res, 200, { ok: true });
      }
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
      if (!(await checkPassword(b.current))) return send(res, 403, { error: 'Senha atual incorreta.' });
      if (String(b.next || '').length < 10) return send(res, 400, { error: 'A nova senha precisa ter pelo menos 10 caracteres.' });
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
// Coloca o nonce do CSP em cada <script> da página (as páginas não usam handlers inline como onclick=).
const withNonce = (html, n) => html.replace(/<script(?![^>]*\bnonce=)/gi, '<script nonce="' + n + '"');
const server = http.createServer((req, res) => {
  secHeaders(req, res);
  let p;
  try { p = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); return res.end(); }
  if (p.startsWith('/api/')) return api(req, res, p);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  if (p === '/') p = '/home.html';           // página inicial (explica o site)
  if (p === '/gerar') p = '/index.html';     // o gerador
  if (p === '/ajuda' || p === '/ajuda.html') { res.writeHead(301, { Location: '/docs' }); return res.end(); } // endereço antigo
  if (p === '/docs') p = '/docs.html';
  if (adminPath() && p === '/' + adminPath()) {
    let d; try { d = fs.readFileSync(path.join(dir, 'admin', 'admin.html'), 'utf8'); } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('não encontrado'); }
    const n = crypto.randomBytes(16).toString('base64');
    res.writeHead(200, { 'Content-Type': types['.html'], 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store', 'Content-Security-Policy': csp(n) });
    return res.end(req.method === 'HEAD' ? undefined : withNonce(d, n));
  }
  const key = p.slice(1).toLowerCase();
  const f = !/[\\:\u0000]/.test(key) && !key.split('/').some(x => !x || x.startsWith('.') || /[. ]$/.test(x)) ? PUBLIC_MAP.get(key) : null;
  if (!f) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('não encontrado'); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('não encontrado'); }
    const ext = path.extname(f).toLowerCase(), h = { 'Content-Type': types[ext] || 'application/octet-stream' };
    if (ext === '.html') { const n = crypto.randomBytes(16).toString('base64'); h['Content-Security-Policy'] = csp(n); h['Cache-Control'] = 'no-store'; d = withNonce(d.toString('utf8'), n); }
    res.writeHead(200, h);
    res.end(req.method === 'HEAD' ? undefined : d);
  });
});
server.headersTimeout = 20e3; server.requestTimeout = 60e3; server.keepAliveTimeout = 5e3; server.maxHeadersCount = 60; // contra conexões lentas (slowloris)
process.on('unhandledRejection', e => console.error('Erro não tratado:', e));
// Com Supabase, lê as configurações e os saldos de créditos ANTES de abrir a porta (senão os primeiros visitantes veriam a cota cheia).
(async () => { if (cfgDbReady()) { await cfgDbLoad(true); await balLoad(); } })().catch(() => {}).then(() => server.listen(PORT, async () => {
  console.log('Animaê · build ' + BUILD);
  console.log('  Créditos: ' + (!cfgDbReady() ? 'saldos só neste servidor (dados.json)' : bal.ok ? 'saldos guardados no Supabase (tabela credit_balances)' : 'Supabase com erro nos saldos: ' + bal.error));
  if (cfgDbReady()) { console.log('  Configurações do painel: ' + (cfgDb.ok ? 'sincronizadas com o Supabase (tabela admin_config)' : 'Supabase com erro: ' + cfgDb.error)); }
  ensureAdminDefaults(); // com Supabase, só agora (já lemos a senha e o endereço guardados lá)
  { const c = sbCfg(); console.log('  Login: ' + (c.enabled ? 'Supabase ' + c.url + (c.required ? ' (obrigatório para gerar vídeos)' : ' (opcional)') : 'desligado (configure o Supabase em Admin > Conta e banco ou com SUPABASE_URL e SUPABASE_ANON_KEY)')); }
  console.log('  Início:  http://localhost:' + PORT);
  console.log('  Gerador: http://localhost:' + PORT + '/gerar');
  console.log('  Docs:    http://localhost:' + PORT + '/docs');
  console.log('  Admin (secreto, sem link no site): http://localhost:' + PORT + '/' + adminPath());
  { const c = aiChain(); console.log('  IA: ' + (c.length ? c.map(p => p.label + ' (' + p.model + ')').join(' → ') : 'nenhum provedor configurado (use uma variável como GEMINI_API_KEY / GROQ_API_KEY ou o Admin > IA)')); }
  if (firstRunPassword) {
    if (process.stdout.isTTY) console.log('\n  >>> Senha inicial do admin: ' + firstRunPassword + '\n  >>> (aparece só desta vez; troque em Admin > Segurança)\n');
    else { // logs de hospedagem são guardados: a senha vai para um arquivo protegido, não para o log
      const f = path.join(DATA_DIR, 'senha-inicial.txt');
      try { fs.writeFileSync(f, firstRunPassword + '\n', { mode: 0o600 }); console.log('\n  >>> Senha inicial do admin salva em ' + f + ' (leia, troque em Admin > Segurança e apague o arquivo).\n'); }
      catch { console.log('\n  >>> Defina ADMIN_PASSWORD no ambiente: não consegui gravar a senha inicial.\n'); }
    }
  }
  else if (process.env.ADMIN_PASSWORD) console.log('  Senha do admin vem de ADMIN_PASSWORD.');
  if (!DATA_KEY) console.log('  DICA: defina DATA_KEY no ambiente para gravar as chaves de API cifradas no dados.json.');
  if (!totpOn()) console.log('  DICA: ative a verificação em duas etapas em Admin > Segurança.');
  if (!sbCfg().enabled) console.log('  AVISO: sem login, qualquer visitante usa a IA e a voz (limite global: ' + GLOBAL_MAX.ai + ' IA e ' + GLOBAL_MAX.tts + ' vozes por hora, ajustável por AI_ANON_PER_HOUR e TTS_ANON_PER_HOUR). Para abrir ao público, configure o login com Supabase.');
}));

/* ---------- limpeza periódica da memória ---------- */
setInterval(() => {
  const now = Date.now(), old = a => a.filter(t => now - t < 3600e3);
  for (const [k, v] of fitTokens) if (v.exp < Date.now()) fitTokens.delete(k);
  for (const m of [aiHits, ttsHits, iconHits, histHits, creditHits, couponHits, couponUserHits, couponOk, verifyHits, supportHits, supportNew, supportPoll]) { for (const [k, v] of m) { const n = old(v); if (n.length) m.set(k, n); else m.delete(k); } if (m.size > 20000) m.clear(); }
  for (const [k, v] of fails) if (v.until < now && now - (v.at || 0) > 3600e3) fails.delete(k);
  for (const [k, v] of iconMiss) if (v < now) iconMiss.delete(k);
  CR.prune(); SP.prune();
  for (const [k, v] of sessions) if (v < now) sessions.delete(k);
  if (fails.size > 20000) fails.clear(); if (iconMiss.size > 20000) iconMiss.clear();
}, 600e3).unref();
