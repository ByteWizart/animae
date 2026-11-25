// Créditos: cada pessoa ganha uma cota por dia e cada uso de IA/voz gasta créditos.
// Tudo acontece AQUI, no servidor: o navegador só mostra o saldo, nunca decide nada.
//  - O saldo é descontado ANTES de chamar a IA (síncrono, sem await no meio: dois pedidos
//    simultâneos não conseguem gastar o mesmo crédito) e devolvido se o pedido falhar.
//  - A cota diária NÃO acumula: o "usado hoje" zera na virada do dia (fuso CREDITS_TZ, padrão Brasília).
//    Créditos de presente (dados pelo admin) não expiram e só são gastos depois da cota do dia.
//  - Pessoa logada = chave u:<id do Supabase> (token conferido pelo servidor).
//    Visitante sem login = chave ip:<hash do IP>; o IP em si nunca é gravado no disco.
//  - Só guardamos quem já gastou algo hoje (ou tem presente). Quem não usou tem sempre a cota cheia.

const crypto = require('crypto');

const TZ = process.env.CREDITS_TZ || 'America/Sao_Paulo';
const OPS = ['generate', 'ideas', 'refine', 'review', 'translate', 'tts'];
const OP_NAMES = { generate: 'Gerar roteiro', ideas: 'Sugerir ideias', refine: 'Editar com a IA', review: 'Avaliar a direção', translate: 'Traduzir', tts: 'Gerar voz' };
const MAX_USERS = 100000; // teto de pessoas guardadas (contra quem troca de IP sem parar)

const DEFAULT_CFG = () => ({
  enabled: true,
  daily: 25,      // créditos por dia para quem está logado
  anonDaily: 25,  // créditos por dia para visitantes sem login (por IP)
  costs: { generate: 5, ideas: 1, refine: 2, review: 1, translate: 2, tts: 3 },
});

let dayFmt, hmsFmt;
try {
  dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  hmsFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
} catch { // fuso inválido em CREDITS_TZ: volta ao horário de Brasília
  dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  hmsFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
}
const today = (now = Date.now()) => dayFmt.format(now);
const secsToReset = (now = Date.now()) => { const [h, m, s] = hmsFmt.format(now).split(':').map(Number); return Math.max(1, 86400 - (h * 3600 + m * 60 + s)); };

const int = (v, a, b, d) => { v = Math.round(+v); return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };

function cleanCfg(s, cur) {
  s = s && typeof s === 'object' ? s : {};
  const base = { ...DEFAULT_CFG(), ...(cur || {}), costs: { ...DEFAULT_CFG().costs, ...((cur || {}).costs || {}) } };
  const costs = {};
  for (const op of OPS) costs[op] = int((s.costs || {})[op], 0, 1000, base.costs[op]);
  return {
    enabled: s.enabled === undefined ? !!base.enabled : !!s.enabled,
    daily: int(s.daily, 0, 100000, base.daily),
    anonDaily: int(s.anonDaily, 0, 100000, base.anonDaily),
    costs,
  };
}

// Garante a forma certa do que veio do disco (ou cria o padrão).
function normalize(c) {
  c = c && typeof c === 'object' ? c : {};
  const users = {};
  if (c.users && typeof c.users === 'object') {
    for (const [k, v] of Object.entries(c.users)) {
      if (!/^(u:[\w-]{1,64}|ip:[0-9a-f]{8,64})$/.test(k) || !v || typeof v !== 'object') continue;
      users[k] = { d: String(v.d || ''), u: int(v.u, 0, 1e9, 0), b: int(v.b, 0, 1e9, 0), w: String(v.w || '').slice(0, 120), t: int(v.t, 0, 9e15, 0) };
    }
  }
  return { cfg: cleanCfg(c.cfg, null), users, salt: typeof c.salt === 'string' && c.salt.length >= 16 ? c.salt : crypto.randomBytes(16).toString('hex') };
}

function create(getStore, onChange) {
  const st = () => getStore();
  const cfg = () => st().cfg;
  const changed = () => { try { onChange && onChange(); } catch {} };

  // Visitante sem login: hash do IP (IPv6 agrupado pelos 64 bits de rede, que é o que uma casa/rede recebe).
  function anonKey(ip) {
    ip = String(ip || 'x');
    if (ip.includes(':') && !/^::ffff:/i.test(ip)) ip = ip.split(':').slice(0, 4).join(':');
    return 'ip:' + crypto.createHash('sha256').update(st().salt + '|' + ip).digest('hex').slice(0, 16);
  }
  const userKey = id => 'u:' + String(id).replace(/[^\w-]/g, '').slice(0, 64);

  const dailyFor = key => (key.startsWith('u:') ? cfg().daily : cfg().anonDaily);
  const entry = key => st().users[key];

  // Saldo "virtual": quem não tem registro de hoje tem a cota cheia.
  function view(key) {
    const c = cfg(), e = entry(key), now = Date.now(), t = today(now), daily = dailyFor(key);
    const used = e && e.d === t ? e.u : 0, bonus = e ? e.b : 0, dailyLeft = Math.max(0, daily - used);
    return { enabled: !!c.enabled, daily, used: Math.min(used, daily), bonus, left: c.enabled ? dailyLeft + bonus : 0, resetIn: secsToReset(now), costs: { ...c.costs } };
  }

  // Tenta gastar o custo da operação. Tudo síncrono. Devolve { ok, cost, left, ..., refund() }.
  function charge(key, who, op) {
    const c = cfg(), cost = c.enabled ? (c.costs[op] || 0) : 0, v = view(key);
    if (!c.enabled || cost <= 0) return { ok: true, cost: 0, ...v, refund() {} };
    if (v.left < cost) return { ok: false, cost, ...v, refund() {} };
    const now = Date.now(), t = today(now);
    let e = entry(key);
    if (!e) {
      if (Object.keys(st().users).length >= MAX_USERS) prune(true);
      e = st().users[key] = { d: t, u: 0, b: 0, w: '', t: now };
    }
    if (e.d !== t) { e.d = t; e.u = 0; } // virou o dia: a cota recomeça
    const fromDaily = Math.min(cost, Math.max(0, dailyFor(key) - e.u)), fromBonus = cost - fromDaily;
    e.u += fromDaily; e.b = Math.max(0, e.b - fromBonus); e.t = now;
    if (who) e.w = String(who).slice(0, 120);
    changed();
    let done = false;
    return {
      ok: true, cost, ...view(key),
      refund() { // devolve se o pedido falhou; só uma vez
        if (done) return; done = true;
        const cur = entry(key); if (!cur) return;
        if (cur.d === t) cur.u = Math.max(0, cur.u - fromDaily); // se já virou o dia, a cota nova já está cheia
        cur.b += fromBonus; changed();
      },
    };
  }

  // Presente do admin (não expira). amount negativo tira presente.
  function grant(key, amount, who) {
    const t = today();
    let e = entry(key);
    if (!e) e = st().users[key] = { d: t, u: 0, b: 0, w: '', t: Date.now() };
    e.b = Math.max(0, e.b + int(amount, -1e6, 1e6, 0)); if (who) e.w = String(who).slice(0, 120); e.t = Date.now();
    changed(); return view(key);
  }
  function resetUsage(key) { const e = entry(key); if (e) { e.u = 0; changed(); } return view(key); }

  // Tira do disco quem não tem mais nada a guardar (dia antigo e sem presente).
  function prune(force) {
    const t = today(), us = st().users; let n = 0;
    for (const [k, e] of Object.entries(us)) if (e.d !== t && !e.b) { delete us[k]; n++; }
    if (force && Object.keys(us).length >= MAX_USERS) { // ainda cheio: descarta os mais antigos
      const old = Object.entries(us).sort((a, b) => a[1].t - b[1].t).slice(0, Math.ceil(MAX_USERS / 10));
      for (const [k] of old) delete us[k];
    }
    if (n) changed(); return n;
  }

  // Lista para o painel: quem gastou hoje ou tem presente.
  function list() {
    const t = today(), out = [];
    for (const [k, e] of Object.entries(st().users)) {
      const used = e.d === t ? e.u : 0; if (!used && !e.b) continue;
      const v = view(k);
      out.push({ key: k, who: k.startsWith('u:') ? (e.w || k) : 'Visitante ' + k.slice(3, 9), anon: !k.startsWith('u:'), used, bonus: e.b, left: v.left, daily: v.daily, at: e.t });
    }
    return out.sort((a, b) => b.used - a.used || b.at - a.at).slice(0, 200);
  }
  const findByEmail = email => { email = String(email).toLowerCase(); for (const [k, e] of Object.entries(st().users)) if (k.startsWith('u:') && String(e.w).toLowerCase() === email) return k; return null; };
  const totals = () => { const t = today(); let people = 0, spent = 0; for (const e of Object.values(st().users)) if (e.d === t && e.u) { people++; spent += e.u; } return { people, spent }; };

  return { anonKey, userKey, view, charge, grant, resetUsage, prune, list, findByEmail, totals, cleanCfg };
}

module.exports = { create, normalize, cleanCfg, DEFAULT_CFG, OPS, OP_NAMES, today, secsToReset, TZ };
