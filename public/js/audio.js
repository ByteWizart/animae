// Música e efeitos gerados por código (sem arquivos, sem API). build 9
const SR = 44100;
const SCALES = { maj: [0, 2, 4, 5, 7, 9, 11], min: [0, 2, 3, 5, 7, 8, 10] };
// Estilos de trilha: style.music = "happy" (ou {type, vol, bpm}). "none" = sem música.
const MUSIC = {
  calm:    { bpm: 76,  root: 220,   scale: 'maj', prog: [0, 5, 3, 4], pad: 'tri',  arp: 'slow',   drums: 0,       bass: 1 },
  happy:   { bpm: 112, root: 261.6, scale: 'maj', prog: [0, 4, 5, 3], pad: 'tri',  arp: 'up',     drums: 'pop',   bass: 1 },
  tense:   { bpm: 92,  root: 110,   scale: 'min', prog: [0, 0, 5, 4], pad: 'saw',  arp: 'pulse',  drums: 'heart', bass: 1 },
  epic:    { bpm: 100, root: 146.8, scale: 'min', prog: [0, 5, 2, 6], pad: 'saw',  arp: 'up',     drums: 'epic',  bass: 1 },
  mystery: { bpm: 68,  root: 196,   scale: 'min', prog: [0, 3, 0, 4], pad: 'sine', arp: 'sparse', drums: 0,       bass: 0 },
  sad:     { bpm: 62,  root: 196,   scale: 'min', prog: [0, 5, 3, 4], pad: 'tri',  arp: 'slow',   drums: 0,       bass: 1 },
  chill:   { bpm: 84,  root: 233.1, scale: 'maj', prog: [1, 4, 0, 5], pad: 'sine', arp: 'sparse', drums: 'lofi',  bass: 1 },
  retro:   { bpm: 128, root: 261.6, scale: 'maj', prog: [0, 5, 3, 4], pad: 'sq',   arp: 'up',     drums: 'pop',   bass: 1 },
};
const MUSIC_IDS = Object.keys(MUSIC);

function synthBed(story) {
  const DUR = story.total, n = Math.floor(SR * DUR), rng = mulberry32(7);
  const gauss = () => Math.sqrt(-2 * Math.log(rng() + 1e-12)) * Math.cos(2 * Math.PI * rng());
  const bed = new Float32Array(n), sfx = new Float32Array(n);
  const box = (w, k) => { const out = new Float32Array(w.length), ps = new Float64Array(w.length + 1);
    for (let i = 0; i < w.length; i++) ps[i + 1] = ps[i] + w[i];
    for (let i = 0; i < w.length; i++) { const a = Math.max(0, i - (k >> 1)), b = Math.min(w.length, i + (k >> 1)); out[i] = (ps[b] - ps[a]) / Math.max(1, b - a); } return out; };

  /* ---------- trilha ---------- */
  const mst = story.style && story.style.music;
  const mcfg0 = typeof mst === 'string' ? { type: mst } : (mst && typeof mst === 'object' ? mst : {});
  const mtype = mcfg0.type === 'none' ? 'none' : (MUSIC[mcfg0.type] ? mcfg0.type : 'calm');
  const mvol = isFinite(mcfg0.vol) ? Math.max(0, Math.min(2, mcfg0.vol)) : 1;
  const tone = (buf, f, t0, dur, o) => {
    const s0 = Math.floor(t0 * SR), L = Math.floor(dur * SR), a = o.a == null ? .01 : o.a, r = o.r == null ? .1 : o.r, amp = o.amp == null ? 1 : o.amp, w = o.w || 'sine';
    for (let i = 0; i < L && s0 + i < buf.length; i++) {
      const x = i / SR; let env = Math.min(1, x / a); const rem = dur - x; if (rem < r) env *= Math.max(0, rem / r); if (o.decay) env *= Math.exp(-x * o.decay);
      const ph = 2 * Math.PI * f * x, ps = (f * x) % 1; let v;
      if (w === 'sine') v = Math.sin(ph); else if (w === 'tri') v = 4 * Math.abs(ps - .5) - 1; else if (w === 'saw') v = (ps * 2 - 1) * .6 + Math.sin(ph) * .4; else v = Math.sign(Math.sin(ph)) * .5 + Math.sin(ph) * .3;
      buf[s0 + i] += v * env * amp;
    }
  };
  const drum = {
    kick: (t, a) => { const s0 = Math.floor(t * SR), L = Math.floor(.25 * SR); for (let i = 0; i < L && s0 + i < n; i++) { const x = i / SR; bed[s0 + i] += Math.sin(2 * Math.PI * (45 + 90 * Math.exp(-x * 30)) * x) * Math.exp(-x * 12) * a; } },
    snare: (t, a) => { const s0 = Math.floor(t * SR), L = Math.floor(.18 * SR); for (let i = 0; i < L && s0 + i < n; i++) { const x = i / SR; bed[s0 + i] += (gauss() * .5 + Math.sin(2 * Math.PI * 190 * x) * .4) * Math.exp(-x * 22) * a; } },
    hat: (t, a) => { const s0 = Math.floor(t * SR), L = Math.floor(.05 * SR); let prev = 0; for (let i = 0; i < L && s0 + i < n; i++) { const x = i / SR, g = gauss(); bed[s0 + i] += (g - prev) * Math.exp(-x * 90) * a * .5; prev = g; } },
  };
  if (mtype !== 'none') {
    const M = MUSIC[mtype], bpm = mcfg0.bpm > 40 && mcfg0.bpm < 220 ? mcfg0.bpm : M.bpm, beat = 60 / bpm, bar = beat * 4, sc = SCALES[M.scale];
    const freq = deg => { const o = Math.floor(deg / 7), d = ((deg % 7) + 7) % 7; return M.root * Math.pow(2, (sc[d] + 12 * o) / 12); };
    const bars = Math.ceil(DUR / bar) + 1;
    for (let b = 0; b < bars; b++) {
      const t0 = b * bar, ch = M.prog[b % M.prog.length], tri = [freq(ch), freq(ch + 2), freq(ch + 4)];
      for (const f of tri) tone(bed, f, t0, bar + .15, { a: .35, r: .5, w: M.pad, amp: .22 });
      if (M.bass) for (let q = 0; q < 4; q++) { const f = freq(ch) / 2; tone(bed, f, t0 + q * beat, beat * .9, { a: .01, r: .08, w: 'tri', amp: q % 2 ? .35 : .5 }); }
      for (let q = 0; q < 8; q++) {
        const tt = t0 + q * beat / 2; let f = null, am = .3;
        if (M.arp === 'up') f = tri[[0, 1, 2, 1][q % 4]] * 2;
        else if (M.arp === 'pulse') { f = tri[0]; am = .18; }
        else if (M.arp === 'slow') { if (q % 2 === 0) f = tri[(q / 2) % 3] * 2; }
        else if (M.arp === 'sparse') { if (rng() < .3) f = tri[Math.floor(rng() * 3)] * 2; }
        if (f) tone(bed, f, tt, beat * 1.4, { a: .005, r: .2, w: mtype === 'retro' ? 'sq' : 'sine', amp: am, decay: 5 });
      }
      const dr = M.drums;
      if (dr) for (let q = 0; q < 4; q++) {
        const tt = t0 + q * beat;
        if (dr === 'pop' || dr === 'epic') { if (q % 2 === 0 || dr === 'epic') drum.kick(tt, q === 0 ? 1.1 : .8); if (q % 2 === 1) drum.snare(tt, .6); drum.hat(tt, .5); drum.hat(tt + beat / 2, .35); }
        else if (dr === 'heart') { if (q === 0) { drum.kick(tt, 1); drum.kick(tt + beat * .35, .7); } }
        else if (dr === 'lofi') { if (q === 0) drum.kick(tt, .9); if (q === 2) drum.kick(tt + beat * .5, .7); if (q % 2 === 1) drum.snare(tt, .35); drum.hat(tt + beat * .08, .3); drum.hat(tt + beat * .58, .22); }
      }
    }
  }
  let mx = 1e-9; for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(bed[i]));
  for (let i = 0; i < n; i++) bed[i] = bed[i] / mx * .5 * mvol;

  /* ---------- efeitos sonoros ---------- */
  const mk = (len, fn) => { const m = Math.max(1, Math.floor(len * SR)), o = new Float32Array(m); for (let i = 0; i < m; i++) o[i] = fn(i / SR, i, m); return o; };
  const tn = (f, x) => Math.sin(2 * Math.PI * f * x);
  const seq = (notes, total, decay, w) => mk(total, x => { let v = 0; for (const q of notes) { const f = q[0], s = q[1], d = q[2], a = q[3] == null ? 1 : q[3]; if (x >= s && x < s + d) { const t = x - s; v += (w === 'sq' ? Math.sign(tn(f, t)) * .35 + tn(f, t) * .3 : tn(f, t)) * Math.exp(-t * decay) * a * .6; } } return v; });
  const noise = (len, lp, fn) => { const m = Math.floor(len * SR), w = new Float32Array(m); for (let i = 0; i < m; i++) w[i] = gauss(); const s = lp > 1 ? box(w, lp) : w; return mk(len, (x, i) => s[i] * fn(x)); };
  const gen = {
    whoosh(c) { const m = Math.floor((c.len || .5) * SR), w = new Float32Array(m); for (let i = 0; i < m; i++) w[i] = gauss();
      const s = box(w, 40), o = new Float32Array(m);
      for (let i = 0; i < m; i++) { let k = i / m; if (c.down) k = 1 - k; o[i] = s[i] * Math.pow(Math.sin(Math.PI * k), 1.5) * 0.5; } return o; },
    thud(c) { const m = Math.floor((c.len || .6) * SR), f = c.f || 70, o = new Float32Array(m);
      for (let i = 0; i < m; i++) { const x = i / SR; o[i] = Math.sin(2 * Math.PI * (f + 60 * Math.exp(-x * 25)) * x) * Math.exp(-x * 7) * 1.4; } return o; },
    ping(c) { const m = Math.floor((c.len || .25) * SR), o = new Float32Array(m);
      for (let i = 0; i < m; i++) { const x = i / SR; o[i] = Math.sin(2 * Math.PI * (c.f || 880) * x) * Math.exp(-x * 14) * 0.6; } return o; },
    rumble(c) { const m = Math.floor((c.len || 1.5) * SR), w = new Float32Array(m); for (let i = 0; i < m; i++) w[i] = gauss();
      const lp = box(w, 400), o = new Float32Array(m), A = Math.floor(.4 * SR), R = Math.floor(.5 * SR);
      for (let i = 0; i < m; i++) { let e = 1; if (i < A) e = i / A; if (m - i < R) e = Math.min(e, (m - i) / R);
        o[i] = lp[i] * 12 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 9 * i / SR)) * e; } return o; },
    slide() { const m = Math.floor(1.2 * SR), o = new Float32Array(m);
      for (let i = 0; i < m; i++) { const x = i / SR; o[i] = Math.sin(2 * Math.PI * (330 - 120 * x) * x) * Math.exp(-x * 1.8) * 0.5; } return o; },
    pop() { return mk(.14, x => tn(260 + 900 * Math.exp(-x * 45), x) * Math.exp(-x * 28) * .9); },
    click() { return mk(.05, x => ((rng() - .5) * Math.exp(-x * 140) + tn(1800, x) * Math.exp(-x * 160) * .4) * 1.2); },
    tick() { return seq([[2200, 0, .04]], .06, 90); },
    coin() { return mk(.45, x => (x < .08 ? tn(988, x) * Math.exp(-x * 20) : tn(1319, x - .08) * Math.exp(-(x - .08) * 7)) * .6); },
    ding() { return seq([[1568, 0, .7], [3136, 0, .5, .3]], .8, 6); },
    bell(c) { return seq([[c.f || 880, 0, 1.4], [(c.f || 880) * 2, 0, 1, .4], [(c.f || 880) * 3, 0, .7, .2]], 1.5, 3.5); },
    success() { return seq([[523, 0, .25], [659, .12, .25], [784, .24, .5]], .8, 5); },
    tada() { return seq([[523, 0, .16], [659, .16, .16], [784, .32, .7], [1047, .32, .7, .8]], 1.1, 3.5); },
    fail() { return seq([[262, 0, .35], [247, .35, .35], [233, .7, .35], [196, 1.05, .9]], 2, 2.2, 'sq'); },
    error() { return mk(.5, x => Math.sign(tn(120, x)) * ((x % .24) < .17 ? 1 : 0) * Math.exp(-x * 2) * .5); },
    alarm(c) { const L = c.len || 1.2; return mk(L, x => Math.sign(tn((Math.floor(x / .2) % 2) ? 880 : 660, x)) * .3); },
    cash() { return mk(.8, x => ((x < .03 ? (rng() - .5) : 0) + (x > .05 ? (tn(2093, x - .05) + tn(3136, x - .05) * .5) * Math.exp(-(x - .05) * 6) * .5 : 0))); },
    boing() { return mk(.8, x => tn(220 + 140 * Math.sin(x * 26) * Math.exp(-x * 4), x) * Math.exp(-x * 3.5) * .8); },
    sparkle() { return seq([[2093, 0, .3], [2637, .06, .3], [3136, .12, .3], [4186, .18, .4]], .7, 9, null); },
    laser() { return mk(.35, x => Math.sin(2 * Math.PI * 2000 / 7 * (1 - Math.exp(-7 * x))) * Math.exp(-x * 7) * .6); },
    riser(c) { const L = c.len || 2; return mk(L, (x, i) => { const k = x / L; return (tn(200 * Math.pow(10, k), x) * .35 + (rng() - .5) * .6) * Math.pow(k, 2); }); },
    boom() { return mk(1.4, x => (tn(55 - 25 * x, x) * Math.exp(-x * 3) + (rng() - .5) * Math.exp(-x * 12) * .6) * 1.1); },
    explosion() { return noise(1.6, 60, x => Math.exp(-x * 3) * 14); },
    splash() { return noise(.8, 18, x => Math.exp(-x * 5) * 5); },
    shatter() { return mk(.8, x => ((rng() - .5) * Math.exp(-x * 30) + tn(2500 + 3500 * ((x * 997) % 1), x) * Math.exp(-x * 9) * .12)); },
    heartbeat() { return mk(.9, x => (tn(62, x) * Math.exp(-x * 14) + tn(58, x - .22) * (x > .22 ? Math.exp(-(x - .22) * 14) : 0) * .8) * 1.2); },
    typing(c) { const L = c.len || 1.5, ev = []; for (let t = .02; t < L; t += .06 + rng() * .1) ev.push(t); return mk(L, x => { let v = 0; for (const t of ev) { const d = x - t; if (d >= 0 && d < .03) v += (rng() - .5) * Math.exp(-d * 200); } return v * .9; }); },
    camera() { return mk(.4, x => ((x < .03 ? (rng() - .5) * Math.exp(-x * 120) : 0) + (x > .08 && x < .12 ? (rng() - .5) * Math.exp(-(x - .08) * 120) : 0)) * 1.3 + tn(5000, x) * Math.exp(-x * 60) * .1); },
    horn() { return mk(.7, x => (Math.sign(tn(440, x)) * .3 + Math.sign(tn(554, x)) * .25) * Math.exp(-x * 2)); },
    drumroll(c) { const L = c.len || 1.5; return mk(L, x => ((x % .03) < .012 ? (rng() - .5) : 0) * (.2 + .8 * x / L)); },
    scratch() { return mk(.5, x => (rng() - .5) * Math.sin(x * 38) * Math.exp(-x * 3) * 1.2); },
    wind(c) { const L = c.len || 2; return noise(L, 150, x => Math.sin(Math.PI * Math.min(1, x / L)) * 14); },
    steps(c) { const L = c.len || 2; return mk(L, x => { const d = x % .38; return (tn(95, d) * Math.exp(-d * 28) + (rng() - .5) * Math.exp(-d * 60) * .3) * 1.1; }); },
  };
  const SFX_IDS = Object.keys(gen);
  for (const c of story.sfx || []) {
    const fn = gen[c.type]; if (!fn) continue;
    if (!isFinite(c.t)) continue;
    const x = fn(c), s = Math.floor(c.t * SR), a = isFinite(c.amp) && c.amp != null ? c.amp : 1;
    for (let i = 0; i < x.length && s + i < n; i++) sfx[s + i] += x[i] * a;
  }
  for (let i = 0; i < n; i++) if (!isFinite(sfx[i])) sfx[i] = 0;
  mx = 1e-9; for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(sfx[i]));
  for (let i = 0; i < n; i++) sfx[i] = sfx[i] / mx * 0.6;
  const mix = new Float32Array(n); mx = 1e-9;
  for (let i = 0; i < n; i++) { const t = i / SR; mix[i] = (bed[i] * 0.55 + sfx[i]) * Math.min(1, t / 0.3, (DUR - t) / 0.8); mx = Math.max(mx, Math.abs(mix[i])); }
  for (let i = 0; i < n; i++) mix[i] = mix[i] / mx * 0.9;
  return mix;
}
const rms = (a, n) => { let s = 0; n = Math.min(n, a.length); for (let i = 0; i < n; i++) s += a[i] * a[i]; return Math.sqrt(s / Math.max(1, n)); };

// Análise da voz (build 14): acha onde a pessoa realmente fala e onde faz pausa.
// O limiar é ADAPTATIVO (relativo ao volume da própria gravação), então funciona com voz baixa, alta,
// com ruído de fundo ou vinda do TTS. Devolve:
//   speech: trechos de fala [[ini, fim], ...] em segundos
//   env:    volume suavizado e normalizado (0 a 1), 100 valores por segundo (usado na boca)
//   dur:    duração do áudio
function analyzeVoice(buf) {
  const sr = buf.sampleRate, n = buf.length, chs = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chs.push(buf.getChannelData(c));
  const hop = Math.max(1, Math.round(sr / 100)), m = Math.floor(n / hop), raw = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    let s = 0; const a = i * hop;
    for (const d of chs) for (let j = 0; j < hop; j++) { const v = d[a + j]; s += v * v; }
    raw[i] = Math.sqrt(s / (hop * chs.length));
  }
  const env = new Float32Array(m);
  for (let i = 0; i < m; i++) env[i] = (raw[Math.max(0, i - 1)] + 2 * raw[i] + raw[Math.min(m - 1, i + 1)]) / 4;
  const dur = n / sr;
  if (!m) return { speech: [], env, dur, rate: 100 };
  const sorted = Float32Array.from(env).sort(), q = p => sorted[Math.min(m - 1, Math.floor(p * (m - 1)))];
  const lo = q(0.10), hi = q(0.95);
  if (hi < 1e-4) return { speech: [], env: new Float32Array(m), dur, rate: 100 };
  const on = lo + (hi - lo) * 0.10, off = lo + (hi - lo) * 0.06; // histerese: liga em "on", desliga abaixo de "off"
  const segs = []; let st = -1;
  for (let i = 0; i < m; i++) {
    if (st < 0) { if (env[i] > on) st = i; }
    else if (env[i] < off) { segs.push([st / 100, i / 100]); st = -1; }
  }
  if (st >= 0) segs.push([st / 100, m / 100]);
  const merged = []; // junta buracos curtos (consoantes fracas) e descarta estalos
  for (const sg of segs) {
    const last = merged[merged.length - 1];
    if (last && sg[0] - last[1] < 0.12) last[1] = sg[1]; else merged.push([sg[0], sg[1]]);
  }
  const speech = merged.filter(sg => sg[1] - sg[0] >= 0.07).map(sg => [+sg[0].toFixed(3), +sg[1].toFixed(3)]);
  const norm = new Float32Array(m); for (let i = 0; i < m; i++) norm[i] = Math.min(1, Math.max(0, (env[i] - lo) / Math.max(1e-6, hi - lo)));
  return { speech, env: norm, dur, rate: 100 };
}

// Lista pausas da fala (para ajudar a marcar o tempo das cenas). Inclui silêncio no início e no fim.
function detectPauses(buf, thr, minDur = 0.2) {
  const A = analyzeVoice(buf), out = []; let prev = 0;
  for (const sg of A.speech) { if (sg[0] - prev >= minDur) out.push([+prev.toFixed(2), +sg[0].toFixed(2)]); prev = sg[1]; }
  if (A.dur - prev >= minDur) out.push([+prev.toFixed(2), +A.dur.toFixed(2)]);
  return out;
}
