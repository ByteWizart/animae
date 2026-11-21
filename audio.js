// Música e efeitos gerados por código (sem arquivos, sem API).
const SR = 44100;
function synthBed(story) {
  const DUR = story.total, n = Math.floor(SR * DUR), rng = mulberry32(7);
  const gauss = () => Math.sqrt(-2 * Math.log(rng() + 1e-12)) * Math.cos(2 * Math.PI * rng());
  const bed = new Float32Array(n), sfx = new Float32Array(n);
  for (const [f, a] of [[110, 1], [164.8, .7], [220, .6], [261.6, .4]])
    for (let i = 0; i < n; i++) { const t = i / SR; bed[i] += a * Math.sin(2 * Math.PI * f * t) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 0.25 * t + f)); }
  const notes = [220, 246.9, 261.6, 329.6];
  for (let k = 0; k < Math.floor(DUR / 0.6); k++) {
    const s = Math.floor(k * 0.6 * SR), L = Math.floor(0.35 * SR);
    for (let i = 0; i < L && s + i < n; i++) { const x = i / SR; bed[s + i] += 0.8 * Math.sin(2 * Math.PI * notes[k % 4] * x) * Math.exp(-x * 9); }
  }
  let mx = 1e-9; for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(bed[i]));
  for (let i = 0; i < n; i++) bed[i] = bed[i] / mx * 0.5;
  const box = (w, k) => { const out = new Float32Array(w.length), ps = new Float64Array(w.length + 1);
    for (let i = 0; i < w.length; i++) ps[i + 1] = ps[i] + w[i];
    for (let i = 0; i < w.length; i++) { const a = Math.max(0, i - (k >> 1)), b = Math.min(w.length, i + (k >> 1)); out[i] = (ps[b] - ps[a]) / k; } return out; };
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
      for (let i = 0; i < m; i++) { const x = i / SR; o[i] = Math.sin(2 * Math.PI * (330 - 120 * x) * x) * Math.exp(-x * 1.8) * 0.5; } return o; }
  };
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
  for (let i = 0; i < n; i++) { const t = i / SR; mix[i] = (bed[i] * 0.55 + sfx[i]) * Math.min(1, t / 0.3, (DUR - t) / 0.6); mx = Math.max(mx, Math.abs(mix[i])); }
  for (let i = 0; i < n; i++) mix[i] = mix[i] / mx * 0.9;
  return mix;
}
const rms = (a, n) => { let s = 0; n = Math.min(n, a.length); for (let i = 0; i < n; i++) s += a[i] * a[i]; return Math.sqrt(s / Math.max(1, n)); };

// Lista pausas da fala (para ajudar a marcar o tempo das cenas).
function detectPauses(buf, thr = 0.0126, minDur = 0.28) {
  const d = buf.getChannelData(0), win = Math.floor(buf.sampleRate * 0.02), out = [];
  let start = null;
  for (let i = 0; i + win <= d.length; i += win) {
    let s = 0; for (let j = 0; j < win; j++) s += d[i + j] * d[i + j];
    const quiet = Math.sqrt(s / win) < thr, t = i / buf.sampleRate;
    if (quiet && start === null) start = t;
    if (!quiet && start !== null) { if (t - start >= minDur) out.push([+start.toFixed(2), +t.toFixed(2)]); start = null; }
  }
  return out;
}
