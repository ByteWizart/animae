#!/usr/bin/env node
// Build para a Vercel: public/ -> dist/ (servido pela CDN). Roda com `npm run build` (a Vercel chama sozinha, veja vercel.json).
//  1. Preenche os {{ORIGIN}} / {{CONTACT...}} das páginas (antes o server.js fazia isso a cada pedido).
//  2. Troca home.html por index.html (a raiz "/") e index.html (o gerador) por gerar.html ("/gerar"), para os endereços limpos funcionarem.
//  3. Acrescenta ?v=<hash> nos js/css: o navegador guarda por 1 ano (immutable) e só baixa de novo quando o arquivo muda.
//  4. Coloca o CSP em cada página como <meta>, com o hash de cada <script> inline (a CDN não consegue gerar um nonce por pedido, como o server.js faz).
//  5. Gera sitemap.xml (se o endereço do site é conhecido) e completa o robots.txt.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'public'), OUT = path.join(ROOT, 'dist');
const env = process.env;

const okOrigin = u => /^https?:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i.test(u) ? u : '';
let ORIGIN = okOrigin(String(env.PUBLIC_URL || '').trim().replace(/\/+$/, ''));
if (!ORIGIN) { const host = env.VERCEL_ENV === 'production' ? env.VERCEL_PROJECT_PRODUCTION_URL : env.VERCEL_URL; if (host) ORIGIN = okOrigin('https://' + host); }
const CONTACT_URL = /^https?:\/\/[^\s<>"']+$/i.test(env.CONTACT_URL || '') ? env.CONTACT_URL.trim() : '';
const CONTACT_EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(env.CONTACT_EMAIL || '') ? env.CONTACT_EMAIL.trim() : '';
const escH = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fill = html => html
  .replace(/\{\{ORIGIN\}\}/g, ORIGIN)
  .replace(/\{\{CONTACT\}\}/g, CONTACT_URL ? escH(CONTACT_URL) : CONTACT_EMAIL ? 'mailto:' + escH(CONTACT_EMAIL) : '/privacidade#contato')
  .replace(/\{\{CONTACT_ATTR\}\}/g, CONTACT_URL || CONTACT_EMAIL ? '' : ' data-chat')
  .replace(/\{\{CONTACT_EXTRA\}\}/g, CONTACT_URL ? ' ou em <a href="' + escH(CONTACT_URL) + '">' + escH(CONTACT_URL.replace(/^https?:\/\//, '')) + '</a>' : CONTACT_EMAIL ? ' ou pelo e-mail <a href="mailto:' + escH(CONTACT_EMAIL) + '">' + escH(CONTACT_EMAIL) + '</a>' : '');

// origens que o navegador pode contatar além do próprio site: o Supabase (login). *.supabase.co cobre os projetos padrão;
// com domínio próprio no Supabase, defina SUPABASE_URL também no build.
const connect = ["'self'", 'blob:', 'data:', 'https://*.supabase.co', 'wss://*.supabase.co'];
try { const u = new URL(env.SUPABASE_URL || ''); if (/^https?:$/.test(u.protocol) && !u.host.endsWith('.supabase.co')) connect.push(u.origin, u.origin.replace(/^http/, 'ws')); } catch {}
const csp = hashes => ["default-src 'self'", "script-src 'self' " + hashes.map(h => `'sha256-${h}'`).join(' '), "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "media-src 'self' blob: data:", "font-src 'self' data:",
  'connect-src ' + connect.join(' '), "base-uri 'self'", "form-action 'self'", "object-src 'none'"].join('; ').replace("script-src 'self' ;", "script-src 'self';");

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, { recursive: true });
// a raiz "/" é a página inicial; o gerador fica em /gerar
fs.renameSync(path.join(OUT, 'index.html'), path.join(OUT, 'gerar.html'));
fs.renameSync(path.join(OUT, 'home.html'), path.join(OUT, 'index.html'));

// hash do conteúdo de cada js/css, para a URL mudar quando o arquivo muda
const ver = {};
for (const d of ['js', 'css']) for (const f of fs.readdirSync(path.join(OUT, d))) ver[d + '/' + f] = crypto.createHash('sha256').update(fs.readFileSync(path.join(OUT, d, f))).digest('hex').slice(0, 10);

const pages = fs.readdirSync(OUT).filter(f => f.endsWith('.html'));
let inlineTotal = 0;
for (const f of pages) {
  let h = fill(fs.readFileSync(path.join(OUT, f), 'utf8'));
  h = h.replace(/\b(src|href)="(\/?)((?:js|css)\/[^"?#]+)"/g, (m, a, sl, p) => ver[p] ? `${a}="${sl}${p}?v=${ver[p]}"` : m);
  const hashes = [];
  h.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, body) => {
    if (/\bsrc\s*=/i.test(attrs) || !body.trim()) return m;
    if (/\btype\s*=\s*["']?(?!module|text\/javascript|application\/javascript)/i.test(attrs)) return m; // JSON e afins não executam
    hashes.push(crypto.createHash('sha256').update(body).digest('base64')); return m;
  });
  inlineTotal += hashes.length;
  const meta = `<meta http-equiv="Content-Security-Policy" content="${csp([...new Set(hashes)])}">`;
  if (h.includes('<meta charset="utf-8">')) h = h.replace('<meta charset="utf-8">', '<meta charset="utf-8">' + meta); // o charset precisa ficar nos primeiros 1024 bytes
  else if (/<head>/i.test(h)) h = h.replace(/<head>/i, '<head>' + meta);
  else throw new Error(f + ': sem <head> para colocar o CSP');
  fs.writeFileSync(path.join(OUT, f), h);
}

// sitemap e robots
const pub = [['/', 'weekly', '1.0'], ['/gerar', 'weekly', '0.9'], ['/docs', 'monthly', '0.7'], ['/privacidade', 'yearly', '0.2'], ['/termos', 'yearly', '0.2']];
if (ORIGIN) {
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + pub.map(([u, c, p]) => `  <url><loc>${ORIGIN}${u === '/' ? '/' : u}</loc><changefreq>${c}</changefreq><priority>${p}</priority></url>`).join('\n') + '\n</urlset>\n');
  fs.appendFileSync(path.join(OUT, 'robots.txt'), `\nSitemap: ${ORIGIN}/sitemap.xml\n`);
}

const kb = n => (n / 1024).toFixed(0) + ' kB';
console.log(`build: ${pages.length} páginas, ${inlineTotal} scripts inline com hash no CSP, ${Object.keys(ver).length} js/css versionados, origem do site: ${ORIGIN || '(não definida: defina PUBLIC_URL para og:url/sitemap absolutos)'}`);
console.log('       dist/ = ' + kb(fs.readdirSync(OUT, { recursive: true }).reduce((n, f) => { try { const s = fs.statSync(path.join(OUT, f)); return n + (s.isFile() ? s.size : 0); } catch { return n; } }, 0)));
