// Cupons: códigos que o admin cria e as pessoas resgatam no gerador. Tudo acontece AQUI, no servidor.
// Um cupom pode dar, de uma vez só:
//   credits        créditos de presente (não expiram, são gastos depois da cota do período)
//   extra + days   créditos EXTRAS por período, durante N dias
//   disc  + days   desconto (%) no custo de todas as ações, durante N dias (arredonda para cima)
//   unlimitedHours uso ilimitado de IA e voz por N horas
// e tem regras: limite total de usos, limite por pessoa, validade, ligado/desligado e "só com conta".
//
// Anti-abuso: o resgate é síncrono (nada de await entre conferir e aplicar, então dois pedidos simultâneos não furam
// o limite); a contagem "por pessoa" fica no registro de créditos da pessoa (sobrevive a reinícios e ao Supabase);
// o servidor limita tentativas por IP; e o código nunca aparece em nenhuma rota pública.
const crypto = require('crypto');

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O e 1/I, para ninguém errar ao digitar
const MAX_COUPONS = 500;
const int = (v, a, b, d) => { v = Math.round(+v); return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };

// O código vale sem diferenciar maiúsculas, espaços e hífens: "bem-vindo 25" = BEMVINDO25.
const canon = v => String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32);
const validCode = c => /^[A-Z0-9]{3,32}$/.test(c);

function randomCode(prefix) {
  const b = crypto.randomBytes(8); let s = '';
  for (let i = 0; i < 8; i++) s += ALPHA[b[i] % ALPHA.length];
  return canon((prefix ? canon(prefix).slice(0, 12) : '') + s);
}
// Para mostrar: XXXX-XXXX (só enfeite; o resgate ignora o hífen).
const pretty = c => (c.length > 8 ? c.slice(0, c.length - 8) + '-' : '') + c.slice(-8).replace(/(.{4})(.{4})/, '$1-$2');

function cleanOne(x, cur) {
  x = x && typeof x === 'object' ? x : {};
  cur = cur || {};
  const code = canon(x.code || cur.code);
  if (!validCode(code)) return null;
  const pick = (k, a, b, d) => int(x[k] !== undefined ? x[k] : cur[k], a, b, d);
  const out = {
    code,
    note: String(x.note !== undefined ? x.note : cur.note || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 120).trim(),
    active: x.active === undefined ? cur.active !== false : !!x.active,
    credits: pick('credits', 0, 100000, 0),
    extra: pick('extra', 0, 100000, 0),
    disc: pick('disc', 0, 100, 0),
    days: pick('days', 1, 365, 7),
    unlimitedHours: pick('unlimitedHours', 0, 720, 0),
    maxUses: pick('maxUses', 0, 1e9, 0),        // 0 = sem limite total
    perPerson: pick('perPerson', 1, 100, 1),
    loginOnly: x.loginOnly === undefined ? cur.loginOnly !== false : !!x.loginOnly,
    expires: pick('expires', 0, 9e15, 0),       // 0 = não vence (ms desde 1970)
    uses: int(cur.uses, 0, 1e9, 0),
    created: int(cur.created, 0, 9e15, Date.now()),
    last: int(cur.last, 0, 9e15, 0),
  };
  // Sem extra e sem desconto, a duração em dias não significa nada: guarda o padrão.
  return out;
}
const hasBenefit = c => c.credits > 0 || c.extra > 0 || c.disc > 0 || c.unlimitedHours > 0;

// Forma certa do que veio do disco ou do Supabase.
function normalize(d) {
  const out = { list: {} };
  const src = d && typeof d === 'object' && d.list && typeof d.list === 'object' ? d.list : {};
  for (const [k, v] of Object.entries(src).slice(0, MAX_COUPONS)) {
    const c = cleanOne({ ...v, code: v && v.code ? v.code : k }, v);
    if (c) out.list[c.code] = c;
  }
  return out;
}

function create(getStore, CR, onChange) {
  const st = () => getStore().list;
  const changed = () => { try { onChange && onChange(); } catch {} };
  const status = (c, now = Date.now()) => !c.active ? 'off' : c.expires && c.expires <= now ? 'expired' : c.maxUses && c.uses >= c.maxUses ? 'full' : 'ok';

  const list = () => Object.values(st()).sort((a, b) => b.created - a.created).map(c => ({ ...c, pretty: pretty(c.code), status: status(c) }));

  // Cria ou atualiza. Devolve { coupon } ou { error }.
  function upsert(x, isNew) {
    const code = canon(x && x.code);
    if (!validCode(code)) return { error: 'O código precisa ter de 3 a 32 letras ou números (hífen e espaço são ignorados).' };
    const cur = st()[code];
    if (isNew && cur) return { error: 'Já existe um cupom com esse código.' };
    if (!isNew && !cur) return { error: 'Cupom não encontrado.' };
    if (isNew && Object.keys(st()).length >= MAX_COUPONS) return { error: 'Limite de ' + MAX_COUPONS + ' cupons atingido. Apague os antigos.' };
    const c = cleanOne(x, cur);
    if (!c) return { error: 'Cupom inválido.' };
    if (!hasBenefit(c)) return { error: 'Escolha pelo menos uma vantagem (créditos, cota extra, desconto ou uso ilimitado).' };
    if ((c.extra || c.disc) && !c.days) c.days = 7;
    st()[code] = c; changed();
    return { coupon: { ...c, pretty: pretty(c.code), status: status(c) } };
  }
  // Vários códigos únicos de uma vez (cada um de 1 uso por padrão): bom para entregar um código para cada pessoa.
  function batch(x, count) {
    count = int(count, 1, 200, 1);
    const made = [];
    if (Object.keys(st()).length + count > MAX_COUPONS) return { error: 'Isso passaria do limite de ' + MAX_COUPONS + ' cupons.' };
    for (let i = 0; i < count; i++) {
      let code, tries = 0;
      do { code = randomCode(x.prefix); } while (st()[code] && ++tries < 20);
      const r = upsert({ ...x, code, maxUses: x.maxUses === undefined ? 1 : x.maxUses }, true);
      if (r.error) return { error: r.error, made };
      made.push(r.coupon);
    }
    return { made };
  }
  function remove(code) { code = canon(code); if (!st()[code]) return false; delete st()[code]; changed(); return true; }

  // Resgate. who = { key, name, hasAccount }. Devolve { ok, ... } ou { error, code? }.
  function redeem(rawCode, who, loginRequired) {
    const code = canon(rawCode), now = Date.now(), c = validCode(code) ? st()[code] : null;
    // UMA mensagem só para "não existe", "desligado", "vencido", "esgotado" e "exige conta": quem chuta códigos não descobre quais existem.
    // (Quem não tem conta recebe a dica de entrar, igual para qualquer código, para não revelar quais cupons exigem conta.)
    const anon = !!loginRequired && !who.hasAccount;
    const NOPE = { error: 'Cupom inválido, vencido ou indisponível.' + (anon ? ' Alguns cupons só funcionam para quem tem conta: entre e tente de novo.' : '') };
    if (!c || !c.active) return NOPE;
    if (c.expires && c.expires <= now) return NOPE;
    if (c.maxUses && c.uses >= c.maxUses) return NOPE;
    if (c.loginOnly && anon) return NOPE;
    if (CR.couponUses(who.key, code) >= c.perPerson) return { error: c.perPerson === 1 ? 'Você já usou este cupom.' : 'Você já usou este cupom o máximo de vezes.' };
    // --- a partir daqui tudo é síncrono ---
    const gave = {};
    if (c.credits > 0) { CR.grant(who.key, c.credits, who.name); gave.credits = c.credits; }
    if (c.extra > 0 || c.disc > 0 || c.unlimitedHours > 0) {
      const perks = [];
      if (c.extra > 0 || c.disc > 0) { perks.push({ until: now + c.days * 86400e3, extra: c.extra, disc: c.disc }); if (c.extra > 0) gave.extra = c.extra; if (c.disc > 0) gave.disc = c.disc; gave.days = c.days; }
      if (c.unlimitedHours > 0) { perks.push({ until: now + c.unlimitedHours * 3600e3, unl: true }); gave.unlimitedHours = c.unlimitedHours; }
      for (const p of perks) CR.perk(who.key, p, who.name);
    }
    CR.markCoupon(who.key, code, who.name);
    c.uses++; c.last = now; changed();
    return { ok: true, gave, message: describe(gave) };
  }

  return { list, upsert, batch, remove, redeem, status, get: code => st()[canon(code)] || null };
}

// Frase para mostrar à pessoa: "Você ganhou 50 créditos + 10 créditos extras por período durante 7 dias."
function describe(g) {
  const p = [];
  if (g.credits) p.push(g.credits + (g.credits === 1 ? ' crédito' : ' créditos'));
  if (g.extra) p.push('+' + g.extra + ' créditos por período durante ' + g.days + (g.days === 1 ? ' dia' : ' dias'));
  if (g.disc) p.push(g.disc + '% de desconto nas ações' + (g.extra ? '' : ' durante ' + g.days + (g.days === 1 ? ' dia' : ' dias')));
  if (g.unlimitedHours) p.push('uso ilimitado por ' + g.unlimitedHours + (g.unlimitedHours === 1 ? ' hora' : ' horas'));
  return 'Cupom aplicado! Você ganhou ' + (p.join(', ') || 'uma vantagem') + '.';
}

module.exports = { create, normalize, canon, validCode, randomCode, pretty, describe, MAX_COUPONS };
