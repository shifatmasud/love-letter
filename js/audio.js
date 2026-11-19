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
const TAPS = new Set(['creak', 'crackle', 'cloth', 'paper', 'rustle', 'gust']);
const SHOTS = ['creak', 'crackle', 'cloth', 'paper', 'rustle', 'gust'];
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

export const Sound = { mix, play, boot, preload, count: Object.keys(BEDS).length + SHOTS.length, get on() { return !!ctx && !muted; } };
