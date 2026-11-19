// UI sounds for the header and the footer, copied as they are from Cost of Design (sound.js): the same engine, the same
// synth sounds and the same bindings. Only the parts that the header and the footer use came over: the logo tick,
// scrub grain and spin whoosh, link ticks, the footer name's zip, the footer curtain's swell, and the sound button's
// on and off notes. The scene sounds (audio.js) are separate; this shares their mute (the sound button).
const KEY = 'pines-muted';
let muted = false;
try { muted = localStorage.getItem(KEY) === '1'; } catch (_) {}

// ---------- engine ----------
const AC = window.AudioContext || window.webkitAudioContext;
let ctx = null, out = null, noiseBuf = null, voices = 0, gesture = false, gestureT = 0;
const MASTER = 0.5, MAX_VOICES = 8;

function build() {
  if (ctx || !AC) return;
  try { ctx = new AC({ latencyHint: 'interactive', sampleRate: 24000 }); } catch (_) { try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { try { ctx = new AC(); } catch (e2) { ctx = null; return; } } }
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -18; lim.knee.value = 12; lim.ratio.value = 6; lim.attack.value = 0.003; lim.release.value = 0.15;
  const warm = ctx.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 6500; warm.Q.value = 0.4;
  out = ctx.createGain(); out.gain.value = muted ? 0 : MASTER;
  out.connect(warm); warm.connect(lim); lim.connect(ctx.destination);
  const n = Math.floor(ctx.sampleRate * 0.6); noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
}
function unlock() {
  gesture = true; gestureT = performance.now();
  setTimeout(() => { gesture = false; }, 0);
  if (document.hidden) return;
  build();
  if (ctx && ctx.state !== 'running') { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); }
}
['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach((t) => document.addEventListener(t, unlock, { capture: true, passive: true }));
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {});
});

const ready = () => !muted && ctx && !document.hidden && (ctx.state === 'running' || gesture || performance.now() - gestureT < 60);
const last = {};
const gate = (k, ms) => { const t = performance.now(); if (last[k] && t - last[k] < ms) return false; last[k] = t; return true; };
const vary = (f, amt = 0.04) => f * (1 + (Math.random() * 2 - 1) * amt);
const take = (dur) => { if (voices >= MAX_VOICES) return false; voices++; setTimeout(() => { voices--; }, (dur + 0.05) * 1000); return true; };

function tone({ f = 600, f2 = 0, type = 'sine', g = 0.2, a = 0.004, dur = 0.08, at = 0, glide = 0 } = {}) {
  const t = ctx.currentTime + at, o = ctx.createOscillator(), v = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + (glide || dur));
  v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(g, t + a); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(v); v.connect(out); o.start(t); o.stop(t + dur + 0.02);
  return o;
}
function air({ f = 1200, f2 = 0, q = 1, type = 'bandpass', g = 0.1, a = 0.01, dur = 0.1, at = 0, peak = 0.5 } = {}) {
  const t = ctx.currentTime + at, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), v = ctx.createGain();
  s.buffer = noiseBuf; s.playbackRate.value = vary(1, 0.1);
  fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t);
  if (f2) { fl.frequency.exponentialRampToValueAtTime(f2, t + dur * peak); fl.frequency.exponentialRampToValueAtTime(Math.max(80, f * 0.8), t + dur); }
  v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(g, t + Math.max(a, 0.002)); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(v); v.connect(out); s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.02);
}

export const S = {
  // hover: a tiny warm tick
  tick(level = 1) { if (!ready() || !gate('tick', 45) || !take(0.05)) return; tone({ f: vary(1900, 0.06), f2: 1500, g: 0.05 * level, dur: 0.035 }); air({ f: vary(3200), q: 2, g: 0.02 * level, dur: 0.02 }); },
  // sound on: a gentle rising two-note; off: the same falling, quieter
  on() { if (!ctx || !take(0.35)) return; tone({ f: 660, g: 0.09, dur: 0.14 }); tone({ f: 990, g: 0.08, dur: 0.22, at: 0.085 }); },
  off() { if (!ctx || !take(0.3)) return; tone({ f: 740, g: 0.06, dur: 0.12 }); tone({ f: 494, g: 0.05, dur: 0.18, at: 0.08 }); },
  // soft airy whoosh (logo spin)
  whoosh(level = 1, dur = 0.55) { if (!ready() || !gate('whoosh', 250) || !take(dur)) return; air({ f: vary(380), f2: vary(1700), q: 0.9, g: 0.09 * level, a: dur * 0.35, dur }); },
  // a scrub grain: faint, its loudness follows the speed
  grain(speed) { if (!ready() || !gate('grain', 40) || !take(0.03)) return; const k = Math.min(1, speed / 25); air({ f: vary(2400 + 1600 * k, 0.15), q: 3, g: 0.012 + 0.03 * k, dur: 0.022 }); },
  // the footer curtain: a low soft swell
  swell() { if (!ready() || !gate('swell', 2000) || !take(1.5)) return; tone({ f: 98, f2: 110, g: 0.07, a: 0.5, dur: 1.4, glide: 1.2 }); tone({ f: 147, f2: 165, g: 0.03, a: 0.6, dur: 1.3, glide: 1.2 }); air({ f: 300, f2: 700, type: 'lowpass', q: 0.5, g: 0.03, a: 0.5, dur: 1.2 }); },
  // the underline drawing in: a soft airy zip, rising
  zip() { if (!ready() || !gate('zip', 200) || !take(0.3)) return; air({ f: vary(900), f2: 3200, q: 2, g: 0.03, a: 0.08, dur: 0.28, peak: 0.85 }); },
};
// the sound button sets the mute for these too (Cost of Design: off plays before the mute, on after the unmute)
export function setMuted(m) {
  muted = m;
  if (ctx && out) { const t = ctx.currentTime; out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(m ? 0 : MASTER, t + (m ? 0.32 : 0.02)); }
}

// ---------- interactions (header and footer) ----------
const mouse = (e) => e.pointerType === 'mouse';
const hover = (el, fn) => el.addEventListener('pointerenter', (e) => { if (mouse(e)) fn(e); }, { passive: true });
const P = { passive: true };

const btn = document.getElementById('sound');
if (btn) {
  btn.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') S.tick(0.8); });
  btn.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') S.tick(0.8); }, P);
}

// the logo marks: a tick on hover tilt, faint grain while scrubbing, whoosh on the click spin
document.querySelectorAll('.mark, .foot-mark').forEach((a) => {
  let down = null, moved = false, lx = 0, lt = 0, spinT = 0;
  hover(a, () => S.tick(0.8));
  a.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' && e.button !== 0) return; if (!mouse(e)) S.tick(0.8); down = [e.clientX, e.clientY]; moved = false; lx = e.clientX; lt = performance.now(); }, { passive: true });
  a.addEventListener('pointermove', (e) => {
    if (!down) return;
    if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8) moved = true;
    let cap = false; try { cap = a.hasPointerCapture(e.pointerId); } catch (_) {}
    if (cap) { const t = performance.now(), v = Math.abs(e.clientX - lx) / Math.max(1, t - lt) * 16; lx = e.clientX; lt = t; S.grain(v); }
  }, { passive: true });
  const up = () => { setTimeout(() => { down = null; }, 0); };
  a.addEventListener('pointerup', up, { passive: true }); a.addEventListener('pointercancel', up, { passive: true });
  a.addEventListener('click', (e) => {
    if (moved && e.detail) return; // a drag or a scrub, never a click
    // the logo module (loaded after this file here, before it on Cost of Design) cancels the click to spin: read it once every handler has run
    setTimeout(() => {
      if (e.defaultPrevented) { const t = performance.now(); if (t - spinT > 1500) { spinT = t; S.whoosh(1, 0.7); } }
      else S.tick();
    }, 0);
  });
});

// links in the header and the footer: a tick on hover; the footer name draws its underline with a soft zip
document.querySelectorAll('header a, footer a').forEach((a) => {
  if (a.matches('.mark, .foot-mark, .pill--ink')) return;
  if (a.classList.contains('foot-name')) {
    hover(a, () => S.zip());
    a.addEventListener('pointerdown', (e) => { if (!mouse(e)) S.zip(); }, { passive: true });
  } else { hover(a, () => S.tick()); a.addEventListener('pointerdown', (e) => { if (!mouse(e)) S.tick(0.8); }, P); }
});
// keyboard focus in the header and the footer: a quiet tick
document.addEventListener('focusin', (e) => { const t = e.target; if (t && t.matches && t.matches(':focus-visible') && t.closest('header, footer')) S.tick(0.7); });

// dark footer curtain: a low soft swell as it opens; again after it has closed
if (window.IntersectionObserver && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const fs = document.querySelector('.foot-space');
  if (fs) { let open = false; new IntersectionObserver((es) => es.forEach((e) => { if (e.intersectionRatio >= 0.35 && !open) { open = true; S.swell(); } else if (!e.isIntersecting) open = false; }), { threshold: [0, 0.35] }).observe(fs); }
}
