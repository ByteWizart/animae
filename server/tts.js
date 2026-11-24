// Voz com IA (build 10): vozes neurais da Microsoft Edge ("Read Aloud"), sem chave de API e sem contagem de tokens.
// Depende do pacote opcional "msedge-tts" (npm install). Sem ele, o resto do site continua funcionando.
let Lib = null, loadError = '';
try { Lib = require('msedge-tts'); } catch (e) { loadError = e.message; }

// Vozes de reserva (a lista ao vivo, quando disponível, substitui esta).
const VOICES = [
  { id: 'pt-BR-FranciscaNeural', label: 'Francisca (feminina)', lang: 'pt-BR' },
  { id: 'pt-BR-AntonioNeural', label: 'Antônio (masculina)', lang: 'pt-BR' },
  { id: 'pt-BR-ThalitaMultilingualNeural', label: 'Thalita (feminina, multilíngue)', lang: 'pt-BR' },
  { id: 'pt-PT-RaquelNeural', label: 'Raquel (feminina)', lang: 'pt-PT' },
  { id: 'pt-PT-DuarteNeural', label: 'Duarte (masculina)', lang: 'pt-PT' },
  { id: 'en-US-AriaNeural', label: 'Aria (feminina)', lang: 'en-US' },
  { id: 'en-US-GuyNeural', label: 'Guy (masculina)', lang: 'en-US' },
  { id: 'es-MX-DaliaNeural', label: 'Dalia (feminina)', lang: 'es-MX' },
  { id: 'es-ES-AlvaroNeural', label: 'Álvaro (masculina)', lang: 'es-ES' },
];
const VOICE_RE = /^[a-z]{2,3}-[A-Z]{2}-[A-Za-z]{2,40}Neural$/;
const MAX_CHARS = 6000, CHUNK = 800;

const available = () => !!Lib;
const reason = () => loadError;

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// Limpa o texto: tira marcação, caracteres de controle e espaços repetidos.
function clean(t) {
  const TC = '(?:\\d{1,2}:)?\\d{1,2}:\\d{2}(?:[.,]\\d{1,3})?';
  // minutagem do roteiro ("0:05 – 0:12", "[0:05]") não deve ser narrada
  t = String(t == null ? '' : t)
    .replace(new RegExp('[\\[(]?\\s*' + TC + '\\s*[\\])]?\\s*(?:[-–—]+>?|->|até|a)\\s*[\\[(]?\\s*' + TC + '\\s*[\\])]?\\s*[:|]?', 'g'), ' ')
    .replace(new RegExp('^[ \\t]*[\\[(]?\\s*' + TC + '\\s*[\\])]?(?![\\d:])\\s*[:|–—-]?', 'gm'), ' ');
  return String(t)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
    .replace(/[*_#`>~|]+/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// Divide em pedaços de até CHUNK caracteres, cortando em fim de frase quando possível.
function split(text) {
  const out = []; let cur = '';
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  for (const sent of text.match(/[^.!?…\n]+[.!?…]*\s*|\n+/g) || [text]) {
    if (sent.length > CHUNK) { // frase gigante: corta em vírgulas/espaços
      push();
      let rest = sent;
      while (rest.length > CHUNK) {
        let k = Math.max(rest.lastIndexOf(',', CHUNK), rest.lastIndexOf(' ', CHUNK)); if (k < CHUNK / 2) k = CHUNK;
        out.push(rest.slice(0, k).trim()); rest = rest.slice(k);
      }
      cur = rest; continue;
    }
    if ((cur + sent).length > CHUNK) push();
    cur += sent;
  }
  push();
  return out.filter(Boolean);
}

// Velocidade e tom viram texto validado (vai direto para o SSML, então nada de entrada livre).
const pct = (v, lim) => { v = Math.round(Math.max(-lim, Math.min(lim, +v || 0))); return (v >= 0 ? '+' : '') + v + '%'; };
const hz = v => { v = Math.round(Math.max(-50, Math.min(50, +v || 0))); return (v >= 0 ? '+' : '') + v + 'Hz'; };

function one(tts, text, opts) {
  return new Promise((ok, no) => {
    let s; try { s = tts.toStream(esc(text), opts).audioStream; } catch (e) { return no(e); }
    const ch = []; let done = false;
    const end = (err, b) => { if (!done) { done = true; err ? no(err) : ok(b); } };
    s.on('data', d => ch.push(d));
    s.on('error', e => end(e));
    s.on('close', () => { const b = Buffer.concat(ch); b.length > 200 ? end(null, b) : end(new Error('A voz voltou vazia.')); });
  });
}

// Gera MP3 (Buffer) para o texto. Lança { code, msg } em erro conhecido.
async function synth({ text, voice, rate, pitch }) {
  if (!Lib) throw { code: 503, msg: 'A voz com IA não está instalada. Rode "npm install" na pasta do projeto e reinicie o servidor.' };
  text = clean(text);
  if (text.length < 2) throw { code: 400, msg: 'Escreva o texto que deve ser narrado.' };
  if (text.length > MAX_CHARS) throw { code: 413, msg: `Texto longo demais (máximo ${MAX_CHARS} caracteres por vez).` };
  voice = VOICE_RE.test(voice || '') ? voice : VOICES[0].id;
  const opts = { rate: pct(rate, 50), pitch: hz(pitch), volume: '+0%' };
  const parts = split(text);
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) { // 1 nova tentativa com conexão nova
    const tts = new Lib.MsEdgeTTS({ connectionTimeoutMs: 10000, synthesisTimeoutMs: 45000 });
    try {
      await tts.setMetadata(voice, Lib.OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      const bufs = [];
      for (const p of parts) bufs.push(await one(tts, p, opts));
      return Buffer.concat(bufs);
    } catch (e) { lastErr = e; } finally { try { tts.close(); } catch {} }
  }
  console.warn('TTS falhou:', lastErr && lastErr.message);
  throw { code: 502, msg: 'Não consegui gerar a voz agora (serviço de voz indisponível ou sem acesso à internet). Tente de novo em instantes.' };
}

// Lista de vozes: tenta a lista ao vivo (pt, en, es), com cache de 6 h; senão usa a de reserva.
let liveCache = null, liveAt = 0;
async function voices() {
  if (liveCache && Date.now() - liveAt < 6 * 3600e3) return liveCache;
  if (Lib) {
    const tts = new Lib.MsEdgeTTS({ connectionTimeoutMs: 8000 });
    try {
      const all = await tts.getVoices();
      const l = all.filter(v => /^(pt|en-US|en-GB|es)-/.test(v.ShortName) && VOICE_RE.test(v.ShortName))
        .map(v => ({ id: v.ShortName, label: v.ShortName.split('-').slice(2).join('-').replace(/Neural$/, '').replace(/Multilingual/, ' (multilíngue)') + ' (' + (v.Gender === 'Male' ? 'masculina' : 'feminina') + ')', lang: v.Locale }))
        .sort((a, b) => (a.lang === 'pt-BR' ? 0 : 1) - (b.lang === 'pt-BR' ? 0 : 1) || a.lang.localeCompare(b.lang) || a.label.localeCompare(b.label));
      if (l.length) { liveCache = l; liveAt = Date.now(); return l; }
    } catch {}
  }
  return VOICES;
}

module.exports = { available, reason, synth, voices, VOICES, MAX_CHARS, clean, split };
