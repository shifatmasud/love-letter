import { asset } from './assets.js';
// Ambient sound for Love Letter.
// Real CC0 recordings (see SOUNDS.md). Nothing plays before the first tap or click.
// Every scene sound is a real field recording (no synth): wind in the pines, leaves and a quiet fire at the house,
// soft high wind with the balloon, far crickets at night. Beds crossfade slowly by scroll. UI sounds are separate.
import { bindInk } from './ink-button.js';
import * as UI from './ui-sound.js';

const KEY = 'pines-muted';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let muted = false;
try { muted = localStorage.getItem(KEY) === '1'; } catch (_) {}

// beds: every file is low-passed at 2.4 kHz (6-pole) and levelled to -23 LUFS, then played low: about -36 to -41 LUFS out
const BEDS = { pines: 0.22, leaves: 0.08, fire: 0.06, air: 0.22, night: 0.16 };
// scene taps (house, balloon, letter, plants, sky): levelled to a -1.3 dBFS peak with short fades; they play loud, on their own bus
// nature (grass, monstera, pines, clouds) has one sound only: a soft recorded air push. The letter's paper is procedural (paper()).
const TAPS = new Set(['creak', 'crackle', 'cloth', 'airpush']);
const SHOTS = ['creak', 'crackle', 'cloth', 'airpush'];
const MASTER = 0.8;
let ctx = null, out = null, bedBus = null, tapBus = null, started = false, ext = 'webm';
const buf = {}, bed = {};
let lastP = 0;
const lastShot = {};

function pickExt() {
  const a = document.createElement('audio');
  return a.canPlayType('audio/webm; codecs="opus"') ? 'webm' : 'mp3';
}
// the preloader fetches every sound file's bytes up front; boot (on the first tap) only decodes them
const bytes = {};
function preload(pre) {
  const e = pickExt(), names = [...Object.keys(BEDS), ...SHOTS];
  return Promise.all(names.map((n) => fetch(asset(`/snd/${n}.${e}`)).then((r) => r.arrayBuffer()).then((ab) => { bytes[n] = [e, ab]; }).catch(() => {}).finally(() => pre?.tick())));
}
async function load(name) {
  if (bytes[name] && bytes[name][0] === ext) { try { return await ctx.decodeAudioData(bytes[name][1].slice(0)); } catch (_) {} }
  for (const e of [ext, 'mp3']) {
    try {
      const r = await fetch(asset(`/snd/${name}.${e}`));
      const ab = await r.arrayBuffer();
      return await ctx.decodeAudioData(ab);
    } catch (_) { /* try the mp3 copy */ }
  }
  return null;
}
function startBed(name) {
  if (!buf[name] || bed[name]) return;
  const g = ctx.createGain(); g.gain.value = 0; g.connect(bedBus);
  const s = ctx.createBufferSource(); s.buffer = buf[name]; s.loop = true;
  // start each loop at a random point so the beds never line up the same way
  s.connect(g); s.start(0, Math.random() * buf[name].duration);
  bed[name] = g;
  mix(lastP, 2.5);
}
async function boot() {
  if (started) return; started = true;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC(); ext = pickExt();
  out = ctx.createGain(); out.gain.value = muted ? 0 : MASTER;
  // gentle glue so delight sounds never jump over the beds on phone speakers
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 2.5; comp.attack.value = 0.02; comp.release.value = 0.3;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000;
  out.connect(lp); lp.connect(comp); comp.connect(ctx.destination);
  // ambience: one more steep low-pass (no hiss, no sharp crickets) into the master
  bedBus = ctx.createBiquadFilter(); bedBus.type = 'lowpass'; bedBus.frequency.value = 2500; bedBus.Q.value = 0.5;
  const bedLp2 = ctx.createBiquadFilter(); bedLp2.type = 'lowpass'; bedLp2.frequency.value = 2500; bedLp2.Q.value = 0.5;
  bedBus.connect(bedLp2); bedLp2.connect(out);
  // scene taps: loud and clear, past the master glue, with a brick-wall limiter at -1 dBFS so overlaps never clip
  tapBus = ctx.createGain(); tapBus.gain.value = muted ? 0 : 1;
  const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -1.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
  tapBus.connect(lim); lim.connect(ctx.destination);
  if (ctx.state === 'suspended') ctx.resume();
  const near = lastP < 0.8 ? ['pines', 'leaves', 'fire'] : lastP < 1.6 ? ['air'] : ['night'];
  const order = [...near, ...Object.keys(BEDS).filter((b) => !near.includes(b))];
  for (const n of order) { buf[n] = await load(n); startBed(n); }
  for (const n of SHOTS) buf[n] = await load(n);
}
function tri(x) { return Math.max(0, 1 - Math.abs(x)); }
function mix(p, tc = 1.1) { // slow time constant: smooth crossfades, no jumps
  lastP = p;
  if (!ctx) return;
  const t = ctx.currentTime;
  const lv = {
    pines: Math.max(0, 1 - p * 0.95),
    leaves: Math.max(0, 1 - p * 1.4),
    fire: Math.max(0, 1 - p * 2.2), // only close to the house
    air: tri(p - 1) ** 0.8,
    night: Math.min(1, Math.max(0, (p - 1.2) / 0.8)),
  };
  for (const n in bed) bed[n].gain.setTargetAtTime(lv[n] * BEDS[n], t, tc);
}
function play(name, vol = 0.6, { rate = 1, pan = 0, minGap = 0.12 } = {}) {
  if (!ctx || muted || !buf[name]) return;
  const now = ctx.currentTime;
  if (lastShot[name] && now - lastShot[name] < minGap) return;
  lastShot[name] = now;
  const s = ctx.createBufferSource(); s.buffer = buf[name];
  s.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
  const g = ctx.createGain(); g.gain.value = vol;
  let node = g;
  if (ctx.createStereoPanner) { const pn = ctx.createStereoPanner(); pn.pan.value = Math.max(-0.8, Math.min(0.8, pan)); g.connect(pn); node = pn; }
  s.connect(g); node.connect(TAPS.has(name) ? tapBus : out); s.start();
}

// soft air push for nature: a little pitch and volume spread so repeats aren't robotic, at most one every 0.45 s so quick moves don't stack
function air(pan = 0) {
  play('airpush', 0.78 + Math.random() * 0.22, { rate: 0.9 + Math.random() * 0.16, pan, minGap: 0.45 });
}

// ---------- procedural paper (the letter only) ----------
// Built the way procedural foley builds crumple and rustle (Farnell, Designing Sound): a bed of band-passed noise for the sheet's
// rustle plus sparse, randomly timed micro-crackles (tiny noise grains with fast decays, each through its own resonant band) for the
// small buckling events. Speed sets loudness, crackle count and brightness; direction sets the filter sweep and the pan.
// A low-pass at 5.5 kHz keeps it soft; every grain has a 1.5 ms or longer attack, so nothing clicks.
let noise = null, paperLast = -1;
function noiseBuf() {
  if (noise) return noise;
  const n = Math.floor(ctx.sampleRate * 1.5); noise = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noise.getChannelData(0); let b = 0;
  for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b = 0.6 * b + 0.4 * w; d[i] = w * 0.55 + b * 0.45; } // slightly softened white
  return noise;
}
function paper(speed = 600, dx = 0, dy = 0, { tap = false } = {}) {
  if (!ctx || muted) return;
  const now = ctx.currentTime;
  if (now - paperLast < (tap ? 0.08 : 0.07)) return;
  paperLast = now;
  const k = Math.min(1, Math.max(0, (speed - 60) / 1400)); // 0 slow .. 1 fast
  const amp = tap ? 1.3 : 0.75 + 0.85 * k; // slow strokes still sit clearly above the beds; the -1 dBFS limiter catches the fastest
  const dir = Math.atan2(-dy, dx); const up = Math.sin(dir), side = Math.cos(dir);
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (pan) pan.pan.value = Math.max(-0.6, Math.min(0.6, side * 0.45));
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5500; lp.Q.value = 0.5;
  if (pan) { lp.connect(pan); pan.connect(tapBus); } else lp.connect(tapBus);
  const nb = noiseBuf();
  // 1) rustle bed: band-passed noise; the band sweeps up when you move up or right, down when you move down or left
  const dur = tap ? 0.32 : 0.14 + 0.16 * k;
  const src = ctx.createBufferSource(); src.buffer = nb; src.playbackRate.value = 0.9 + Math.random() * 0.2;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8 + Math.random() * 0.4;
  const f0 = 1400 + 1300 * k + Math.random() * 300, f1 = f0 * (1 + 0.45 * (up * 0.7 + side * 0.3));
  bp.frequency.setValueAtTime(f0, now); bp.frequency.exponentialRampToValueAtTime(Math.max(500, f1), now + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(amp * 0.55, now + 0.018 + Math.random() * 0.012);
  g.gain.setTargetAtTime(0, now + dur * 0.45, dur * 0.28);
  src.connect(bp); bp.connect(g); g.connect(lp);
  src.start(now, Math.random() * 1.2); src.stop(now + dur + 0.4);
  // 2) micro-crackles: Poisson-timed noise grains, more and brighter when faster
  const count = tap ? 9 + Math.floor(Math.random() * 6) : Math.round(2 + 9 * k * (0.7 + Math.random() * 0.6));
  let t = now + 0.004;
  for (let i = 0; i < count; i++) {
    t += -Math.log(1 - Math.random()) * (dur / Math.max(1, count)) * 0.9;
    const len = 0.004 + Math.random() * 0.012;
    const c = ctx.createBufferSource(); c.buffer = nb;
    const cb = ctx.createBiquadFilter(); cb.type = 'bandpass'; cb.frequency.value = 1800 + Math.random() * (1800 + 1600 * k); cb.Q.value = 1.6 + Math.random() * 2.4;
    const cg = ctx.createGain(); const a = amp * (0.25 + Math.random() * 0.45) * (Math.random() < 0.15 ? 1.4 : 1);
    cg.gain.setValueAtTime(0, t); cg.gain.linearRampToValueAtTime(a, t + 0.0015 + Math.random() * 0.001);
    cg.gain.setTargetAtTime(0, t + 0.002, len * 0.45);
    c.connect(cb); cb.connect(cg); cg.connect(lp);
    c.start(t, Math.random() * 1.4); c.stop(t + len * 4 + 0.02);
  }
}

// first gesture anywhere starts the sound
const first = () => { boot(); removeEventListener('pointerdown', first, true); removeEventListener('keydown', first, true); };
addEventListener('pointerdown', first, true);
addEventListener('keydown', first, true);
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend(); else if (!muted) ctx.resume();
});

// ---------- the sound button (Cost of Design wave toggle) ----------
const btn = document.getElementById('sound');
if (btn) {
  const MORPH_MS = 280;
  const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const W = 22, H = 14, dpr = Math.min(devicePixelRatio || 1, 2);
  const waves = [...btn.querySelectorAll('.snd-wave')].map((c) => {
    c.width = W * dpr; c.height = H * dpr; const g = c.getContext('2d'); g.scale(dpr, dpr);
    return { c, g, inv: c.hasAttribute('data-inv') };
  });
  let raf = 0, amp = muted ? 0 : 1, phase = 0, lastT = performance.now(), from = amp, to = amp, t0 = 0;
  const draw = (now) => {
    const dt = Math.min(0.05, Math.max(0, now - lastT) / 1000); lastT = now;
    const target = muted ? 0 : 1;
    if (target !== to) { from = amp; to = target; t0 = now; }
    const k = reduce ? 1 : Math.min(1, Math.max(0, now - t0) / MORPH_MS);
    amp = from + (to - from) * easeInOut(k);
    if (!reduce) phase += dt * 3.2;
    for (const w of waves) {
      const g = w.g; g.clearRect(0, 0, W, H); g.lineWidth = 1.4; g.lineCap = 'round'; g.lineJoin = 'round';
      const dark = btn.parentElement && btn.parentElement.classList.contains('on-dark'); // white wave over the dark scene
      g.strokeStyle = (w.inv !== dark) ? '#fafafa' : '#121315';
      g.beginPath();
      for (let x = 1; x <= W - 1; x += 0.5) { const env = Math.sin((Math.PI * (x - 1)) / (W - 2)); const y = H / 2 + Math.sin(x * 0.62 - phase) * 3 * amp * env; x === 1 ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.stroke();
    }
    if (reduce || (target === 0 && k >= 1) || document.hidden) { raf = 0; return; }
    raf = requestAnimationFrame(draw);
  };
  const kick = () => { if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(draw); } };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  addEventListener('navtone', () => { lastT = performance.now(); draw(lastT); });
  kick();
  bindInk(btn, 'sound');
  const set = (m) => {
    muted = m;
    try { m ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch (_) {}
    btn.setAttribute('aria-pressed', String(!m)); btn.setAttribute('aria-label', m ? 'Sound off' : 'Sound on');
    if (ctx && out) { const t = ctx.currentTime; out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(m ? 0 : MASTER, t + (m ? 0.32 : 0.05)); tapBus.gain.cancelScheduledValues(t); tapBus.gain.setValueAtTime(tapBus.gain.value, t); tapBus.gain.linearRampToValueAtTime(m ? 0 : 1, t + (m ? 0.32 : 0.05)); if (!m && ctx.state === 'suspended') ctx.resume(); }
    kick();
  };
  btn.setAttribute('aria-pressed', String(!muted)); btn.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on');
  // Cost of Design's toggle sounds: off plays, then the mute; on plays after the unmute
  btn.addEventListener('click', () => { boot(); if (muted) { set(false); UI.setMuted(false); UI.S.on(); } else { UI.S.off(); set(true); UI.setMuted(true); } });
}

export const Sound = { mix, play, air, paper, boot, preload, count: Object.keys(BEDS).length + SHOTS.length, get on() { return !!ctx && !muted; } };
