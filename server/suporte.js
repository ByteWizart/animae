// Chat de suporte: QUALQUER pessoa pode mandar mensagem; só o ADMIN responde (pelo painel).
//  - Cada visitante ganha uma conversa própria, identificada por um "token" aleatório guardado no navegador dele.
//    O servidor só guarda o hash do token: quem lê o arquivo não consegue abrir a conversa de ninguém.
//  - Visitante só enxerga a PRÓPRIA conversa. Não existe rota pública que liste conversas dos outros.
//  - Responder, encerrar, apagar e listar são rotas /api/admin/support/* (cookie de sessão do admin, igual ao resto do painel).
//  - Proteções contra spam: limite por IP e por conversa (no server.js), no máximo 8 mensagens seguidas sem resposta,
//    tamanho máximo, teto de conversas e de mensagens, e limpeza automática de conversas paradas há muito tempo.
//  - As conversas ficam num arquivo próprio (.dados/suporte.json), separado das configurações.
const crypto = require('crypto'), fs = require('fs');

const MAX_TEXT = 1000;
const MAX_THREADS = 1500;
const MAX_MSGS = 150;          // mensagens por conversa (as mais antigas saem)
const MAX_TOTAL_MSGS = 30000;  // em todas as conversas
const MAX_UNANSWERED = 8;      // mensagens seguidas do visitante sem o admin responder
const IDLE_DAYS = 90;          // conversa parada há tanto tempo é apagada

const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');
const validToken = t => typeof t === 'string' && /^[0-9a-f]{48}$/.test(t);
// Mantém quebras de linha (no máximo duas seguidas), tira caracteres de controle e corta no limite.
const cleanText = (v, max = MAX_TEXT) => String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim().slice(0, max);
const cleanLine = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

function create(file) {
  let data = { v: 1, threads: {} };
  const byHash = new Map(); // hash do token -> id da conversa
  let timer = null;

  function load() {
    try {
      const d = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (d && typeof d === 'object' && d.threads && typeof d.threads === 'object') {
        for (const [id, t] of Object.entries(d.threads)) {
          if (!/^[0-9a-f]{16}$/.test(id) || !t || typeof t !== 'object' || !/^[0-9a-f]{64}$/.test(t.h || '') || !Array.isArray(t.msgs)) continue;
          const msgs = t.msgs.filter(m => m && (m.f === 'u' || m.f === 'a')).slice(-MAX_MSGS).map(m => ({ i: Math.max(1, m.i | 0), f: m.f, t: cleanText(m.t), at: +m.at || 0 }));
          data.threads[id] = { id, h: t.h, name: cleanLine(t.name, 40), email: cleanLine(t.email, 120), created: +t.created || 0, updated: +t.updated || 0, closed: !!t.closed,
            next: Math.max(+t.next || 0, (msgs[msgs.length - 1] || { i: 0 }).i + 1), ua: Math.max(0, t.ua | 0), uu: Math.max(0, t.uu | 0), msgs };
          byHash.set(t.h, id);
        }
      }
    } catch (e) { if (e.code !== 'ENOENT') console.warn('Aviso: suporte.json ilegível, começando vazio (' + e.message + ')'); }
  }
  function flush() {
    clearTimeout(timer); timer = null;
    try { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 }); fs.renameSync(tmp, file); }
    catch (e) { console.warn('Aviso: não consegui gravar o suporte (' + e.message + ')'); }
  }
  const soon = () => { if (timer) return; timer = setTimeout(flush, 1500); timer.unref && timer.unref(); };
  load();

  const count = () => Object.keys(data.threads).length;
  const totalMsgs = () => { let n = 0; for (const t of Object.values(data.threads)) n += t.msgs.length; return n; };
  const drop = id => { const t = data.threads[id]; if (!t) return false; byHash.delete(t.h); delete data.threads[id]; return true; };

  // Abre espaço: apaga as conversas paradas há muito tempo e, se ainda estiver cheio, as mais antigas.
  function prune() {
    const now = Date.now(); let n = 0;
    for (const t of Object.values(data.threads)) if (now - (t.updated || t.created) > IDLE_DAYS * 86400e3) { drop(t.id); n++; }
    if (count() > MAX_THREADS || totalMsgs() > MAX_TOTAL_MSGS) {
      const old = Object.values(data.threads).sort((a, b) => (a.closed === b.closed ? a.updated - b.updated : a.closed ? -1 : 1)); // encerradas primeiro, depois as mais velhas
      while (old.length && (count() > MAX_THREADS - 50 || totalMsgs() > MAX_TOTAL_MSGS - 1000)) { drop(old.shift().id); n++; }
    }
    if (n) soon(); return n;
  }

  const push = (t, f, text) => {
    const m = { i: t.next++, f, t: text, at: Date.now() };
    t.msgs.push(m); if (t.msgs.length > MAX_MSGS) t.msgs.splice(0, t.msgs.length - MAX_MSGS);
    t.updated = m.at; return m;
  };
  const pub = m => ({ i: m.i, f: m.f, t: m.t, at: m.at });

  /* ---------- visitante ---------- */
  // Manda uma mensagem. Sem token válido, abre uma conversa nova. Devolve { ok, token?, msg, closed } ou { error, code }.
  function send(token, text, who) {
    text = cleanText(text);
    if (!text) return { error: 'Escreva uma mensagem.', code: 400 };
    let t = validToken(token) ? data.threads[byHash.get(sha(token))] : null, created = '';
    if (t) {
      const last = t.msgs.slice(-MAX_UNANSWERED);
      if (last.length >= MAX_UNANSWERED && last.every(m => m.f === 'u')) return { error: 'Você já mandou várias mensagens. Aguarde a resposta do suporte.', code: 429 };
      const lastU = t.msgs.filter(m => m.f === 'u').pop();
      if (lastU && Date.now() - lastU.at < 1500) return { error: 'Calma, você está enviando rápido demais.', code: 429 };
    } else {
      if (count() >= MAX_THREADS) prune();
      if (count() >= MAX_THREADS) return { error: 'O suporte está cheio no momento. Tente de novo mais tarde.', code: 503 };
      created = crypto.randomBytes(24).toString('hex');
      const id = crypto.randomBytes(8).toString('hex'), now = Date.now();
      t = data.threads[id] = { id, h: sha(created), name: '', email: '', created: now, updated: now, closed: false, next: 1, ua: 0, uu: 0, msgs: [] };
      byHash.set(t.h, id);
    }
    if (who) { if (who.name) t.name = cleanLine(who.name, 40) || t.name; if (who.email) t.email = cleanLine(who.email, 120) || t.email; }
    const m = push(t, 'u', text); t.ua++; t.closed = false; // mensagem nova reabre a conversa
    soon();
    return { ok: true, token: created || undefined, msg: pub(m), closed: false };
  }
  // O visitante busca as mensagens novas da própria conversa (after = última que ele já tem).
  function poll(token, after) {
    const t = validToken(token) ? data.threads[byHash.get(sha(token))] : null;
    if (!t) return null;
    after = Math.max(0, after | 0);
    const msgs = t.msgs.filter(m => m.i > after).map(pub);
    return { msgs, closed: t.closed, name: t.name };
  }
  // O visitante abriu o chat: ele leu o que já tinha.
  function markReadByUser(token) { const t = validToken(token) ? data.threads[byHash.get(sha(token))] : null; if (t && t.uu) { t.uu = 0; soon(); } return !!t; }
  const unreadForUser = token => { const t = validToken(token) ? data.threads[byHash.get(sha(token))] : null; return t ? t.uu : 0; };

  /* ---------- admin ---------- */
  const unread = () => { let n = 0; for (const t of Object.values(data.threads)) if (t.ua > 0) n++; return n; };
  const summary = t => { const last = t.msgs[t.msgs.length - 1] || null; return { id: t.id, name: t.name, email: t.email, closed: t.closed, unread: t.ua, updated: t.updated, created: t.created, count: t.msgs.length, last: last ? { f: last.f, t: last.t.slice(0, 140), at: last.at } : null }; };
  const list = () => Object.values(data.threads).sort((a, b) => (b.ua > 0) - (a.ua > 0) || b.updated - a.updated).map(summary);
  function get(id, markRead) {
    const t = data.threads[id]; if (!t) return null;
    if (markRead && t.ua) { t.ua = 0; soon(); }
    return { ...summary(t), msgs: t.msgs.map(pub) };
  }
  function reply(id, text) {
    const t = data.threads[id]; if (!t) return { error: 'Conversa não encontrada.', code: 404 };
    text = cleanText(text); if (!text) return { error: 'Escreva a resposta.', code: 400 };
    const m = push(t, 'a', text); t.ua = 0; t.uu++; soon();
    return { ok: true, msg: pub(m) };
  }
  function setClosed(id, closed) { const t = data.threads[id]; if (!t) return false; t.closed = !!closed; soon(); return true; }
  function remove(id) { const ok = drop(id); if (ok) soon(); return ok; }
  function purgeClosed() { let n = 0; for (const t of Object.values(data.threads)) if (t.closed) { drop(t.id); n++; } if (n) soon(); return n; }

  return { send, poll, markReadByUser, unreadForUser, unread, list, get, reply, setClosed, remove, purgeClosed, prune, flush, count, MAX_TEXT };
}

module.exports = { create, cleanText, cleanLine, validToken, MAX_TEXT };
