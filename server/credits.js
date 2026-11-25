// Créditos: cada pessoa ganha uma cota por dia e cada uso de IA/voz gasta créditos.
// Tudo acontece AQUI, no servidor: o navegador só mostra o saldo, nunca decide nada.
//  - O saldo é descontado ANTES de chamar a IA (síncrono, sem await no meio: dois pedidos
//    simultâneos não conseguem gastar o mesmo crédito) e devolvido se o pedido falhar.
//  - A cota NÃO acumula e renova de um destes dois jeitos (cfg.resetHours, escolhido no painel):
//      0  = à meia-noite, todo dia (fuso CREDITS_TZ, padrão Brasília);
//      N  = N horas depois do primeiro uso da pessoa (janela própria de cada um, de 1 a 720 h).
//    Créditos de presente (dados pelo admin) não expiram e só são gastos depois da cota do período.
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
  resetHours: 0,  // 0 = renova à meia-noite; N = renova N horas depois do primeiro uso
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

// Vantagens temporárias (vindas de cupons): { e: expira (ms), x: créditos extras por período, d: desconto em %, u: 1 = ilimitado }.
function cleanPerks(p) {
  if (!Array.isArray(p)) return [];
  return p.slice(0, 10).map(x => x && typeof x === 'object' ? { e: int(x.e, 0, 9e15, 0), x: int(x.x, 0, 100000, 0), d: int(x.d, 0, 100, 0), u: x.u ? 1 : 0 } : null).filter(x => x && x.e > 0 && (x.x || x.d || x.u));
}
// Cupons já usados pela pessoa: { CODIGO: vezes }. Fica no registro dela para o limite "por pessoa" sobreviver a reinícios.
function cleanUsedCoupons(c) {
  const o = {};
  if (c && typeof c === 'object' && !Array.isArray(c)) for (const [k, v] of Object.entries(c).slice(0, 40)) if (/^[A-Z0-9]{3,32}$/.test(k)) o[k] = int(v, 1, 1000, 1);
  return o;
}
const perkInfo = (e, now) => {
  let extra = 0, disc = 0, unl = false, until = 0;
  for (const x of (e && e.p) || []) if (x.e > now) { extra += x.x; disc = Math.max(disc, x.d); if (x.u) unl = true; until = Math.max(until, x.e); }
  return { extra: Math.min(extra, 1e6), disc, unl, until };
};

function cleanCfg(s, cur) {
  s = s && typeof s === 'object' ? s : {};
  const base = { ...DEFAULT_CFG(), ...(cur || {}), costs: { ...DEFAULT_CFG().costs, ...((cur || {}).costs || {}) } };
  const costs = {};
  for (const op of OPS) costs[op] = int((s.costs || {})[op], 0, 1000, base.costs[op]);
  return {
    enabled: s.enabled === undefined ? !!base.enabled : !!s.enabled,
    daily: int(s.daily, 0, 100000, base.daily),
    anonDaily: int(s.anonDaily, 0, 100000, base.anonDaily),
    resetHours: int(s.resetHours, 0, 720, base.resetHours || 0),
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
      users[k] = { d: String(v.d || ''), u: int(v.u, 0, 1e9, 0), b: int(v.b, 0, 1e9, 0), w: String(v.w || '').slice(0, 120), t: int(v.t, 0, 9e15, 0), s: int(v.s, 0, 9e15, 0) };
      const pk = cleanPerks(v.p), cp = cleanUsedCoupons(v.c);
      if (pk.length) users[k].p = pk;
      if (Object.keys(cp).length) users[k].c = cp;
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

  const baseDaily = key => (key.startsWith('u:') ? cfg().daily : cfg().anonDaily);
  const dailyFor = (key, now = Date.now()) => baseDaily(key) + perkInfo(entry(key), now).extra; // cota do período, já com os extras de cupons
  const entry = key => st().users[key];

  // O registro ainda vale no período atual? (meia-noite: mesmo dia; por horas: a janela da pessoa ainda não acabou)
  const hours = () => Math.max(0, +cfg().resetHours || 0);
  const isCur = (e, now = Date.now()) => !!e && (hours() ? e.s > 0 && now - e.s < hours() * 3600e3 : e.d === today(now));
  const resetIn = (e, now) => hours() ? (isCur(e, now) ? Math.max(1, Math.ceil((e.s + hours() * 3600e3 - now) / 1000)) : hours() * 3600) : secsToReset(now);

  // Saldo "virtual": quem não tem registro no período atual tem a cota cheia.
  function view(key) {
    const c = cfg(), e = entry(key), now = Date.now(), pk = perkInfo(e, now), daily = baseDaily(key) + pk.extra;
    const used = isCur(e, now) ? e.u : 0, bonus = e ? e.b : 0, dailyLeft = Math.max(0, daily - used);
    const costs = {}; // o custo já vem com o desconto de cupom (arredondado para cima); ilimitado = tudo grátis
    for (const op of OPS) costs[op] = pk.unl ? 0 : Math.ceil((c.costs[op] || 0) * (100 - pk.disc) / 100);
    return { enabled: !!c.enabled, daily, used: Math.min(used, daily), bonus, left: c.enabled ? dailyLeft + bonus : 0, resetIn: resetIn(e, now), every: hours(), costs,
      perks: { extra: pk.extra, disc: pk.disc, unlimited: pk.unl, until: pk.until } };
  }

  // Tenta gastar o custo da operação. Tudo síncrono. Devolve { ok, cost, left, ..., refund() }.
  function charge(key, who, op) {
    const c = cfg(), v = view(key), cost = c.enabled ? (v.costs[op] || 0) : 0;
    if (!c.enabled || cost <= 0) return { ok: true, cost: 0, ...v, refund() {} };
    if (v.left < cost) return { ok: false, cost, ...v, refund() {} };
    const now = Date.now(), t = today(now);
    let e = entry(key);
    if (!e) {
      if (Object.keys(st().users).length >= MAX_USERS) prune(true);
      e = st().users[key] = { d: t, u: 0, b: 0, w: '', t: now, s: now };
    }
    if (!isCur(e, now)) { e.d = t; e.u = 0; e.s = now; } // acabou o período: a cota recomeça (e a nova janela começa agora)
    const d0 = e.d, s0 = e.s;
    const fromDaily = Math.min(cost, Math.max(0, dailyFor(key, now) - e.u)), fromBonus = cost - fromDaily;
    e.u += fromDaily; e.b = Math.max(0, e.b - fromBonus); e.t = now;
    if (who) e.w = String(who).slice(0, 120);
    changed();
    let done = false;
    return {
      ok: true, cost, ...view(key),
      refund() { // devolve se o pedido falhou; só uma vez
        if (done) return; done = true;
        const cur = entry(key); if (!cur) return;
        if (cur.d === d0 && cur.s === s0) cur.u = Math.max(0, cur.u - fromDaily); // se o período já acabou, a cota nova já está cheia
        cur.b += fromBonus; changed();
      },
    };
  }

  // Presente do admin (não expira). amount negativo tira presente.
  function grant(key, amount, who) {
    const t = today();
    let e = entry(key);
    if (!e) e = st().users[key] = { d: t, u: 0, b: 0, w: '', t: Date.now(), s: 0 };
    e.b = Math.max(0, e.b + int(amount, -1e6, 1e6, 0)); if (who) e.w = String(who).slice(0, 120); e.t = Date.now();
    changed(); return view(key);
  }
  // Vantagem temporária de cupom (cota extra, desconto, ilimitado). Várias podem valer ao mesmo tempo (no máximo 10).
  function perk(key, p, who) {
    const now = Date.now();
    let e = entry(key);
    if (!e) e = st().users[key] = { d: today(now), u: 0, b: 0, w: '', t: now, s: 0 };
    e.p = cleanPerks(e.p).filter(x => x.e > now);
    if (e.p.length >= 10) e.p.shift();
    e.p.push({ e: int(p.until, 1, 9e15, now + 3600e3), x: int(p.extra, 0, 100000, 0), d: int(p.disc, 0, 100, 0), u: p.unl ? 1 : 0 });
    if (who) e.w = String(who).slice(0, 120); e.t = now;
    changed(); return view(key);
  }
  const couponUses = (key, code) => { const e = entry(key); return (e && e.c && e.c[code]) || 0; };
  function markCoupon(key, code, who) {
    let e = entry(key);
    if (!e) e = st().users[key] = { d: today(), u: 0, b: 0, w: '', t: Date.now(), s: 0 };
    e.c = e.c || {};
    if (!e.c[code] && Object.keys(e.c).length >= 40) delete e.c[Object.keys(e.c)[0]];
    e.c[code] = (e.c[code] || 0) + 1;
    if (who) e.w = String(who).slice(0, 120); e.t = Date.now(); changed();
  }
  // "Restaurar cota": devolve a cota cheia do período (zera o GASTO). Os créditos de presente não mudam.
  function resetUsage(key) { const e = entry(key); if (e) { e.u = 0; e.t = Date.now(); changed(); } return view(key); }
  // "Zerar créditos": a pessoa fica com 0 até a próxima renovação (gasta toda a cota do período e perde o presente).
  function zero(key, who) {
    const now = Date.now(); let e = entry(key);
    if (!e) e = st().users[key] = { d: today(now), u: 0, b: 0, w: '', t: now, s: now };
    if (!isCur(e, now)) { e.d = today(now); e.u = 0; e.s = now; }
    delete e.p; // sem vantagens de cupom (senão o "ilimitado" continuaria gastando de graça)
    e.u = dailyFor(key, now); e.b = 0; e.t = now; if (who) e.w = String(who).slice(0, 120);
    changed(); return view(key);
  }
  // Em lote, para quem aparece na lista do painel (usou neste período ou tem presente). Devolve quantas pessoas mudaram.
  function bulk(action) {
    let n = 0;
    for (const [k, e] of Object.entries(st().users)) {
      const cur = isCur(e), used = cur ? e.u : 0;
      if (!used && !e.b) continue;
      if (action === 'zero') { zero(k); n++; } else if (action === 'restore' && used) { e.u = 0; e.t = Date.now(); n++; }
    }
    if (n) changed(); return n;
  }

  // Tira do disco quem não tem mais nada a guardar (dia antigo e sem presente).
  function prune(force) {
    const t = today(), us = st().users; let n = 0;
    const now = Date.now();
    for (const [k, e] of Object.entries(us)) if (!isCur(e) && !e.b && !e.c && !perkInfo(e, now).until) { delete us[k]; n++; } // quem usou cupom fica (o limite por pessoa depende disso)
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
      const used = isCur(e) ? e.u : 0, v = view(k); if (!used && !e.b && !v.perks.until) continue;
      out.push({ key: k, who: k.startsWith('u:') ? (e.w || k) : 'Visitante ' + k.slice(3, 9), anon: !k.startsWith('u:'), used, bonus: e.b, left: v.left, daily: v.daily, at: e.t, perks: v.perks.until ? v.perks : null });
    }
    return out.sort((a, b) => b.used - a.used || b.at - a.at).slice(0, 200);
  }
  const findByEmail = email => { email = String(email).toLowerCase(); for (const [k, e] of Object.entries(st().users)) if (k.startsWith('u:') && String(e.w).toLowerCase() === email) return k; return null; };
  const totals = () => { const t = today(); let people = 0, spent = 0; for (const e of Object.values(st().users)) if (isCur(e) && e.u) { people++; spent += e.u; } return { people, spent }; };

  return { anonKey, userKey, view, charge, grant, perk, couponUses, markCoupon, resetUsage, zero, bulk, isCur, prune, list, findByEmail, totals, cleanCfg };
}

module.exports = { create, normalize, cleanCfg, cleanPerks, cleanUsedCoupons, perkInfo, DEFAULT_CFG, OPS, OP_NAMES, today, secsToReset, TZ };
