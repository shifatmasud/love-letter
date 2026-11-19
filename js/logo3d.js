// Copied as is from shifatmasud/cost-of-design (index.html, <script id="logo-3d">). Love Letter has no __glDriver, so it uses its own fallback loop.
// Logo marks: a real extruded 3D model of the mark, drawn head-on so it looks flat at rest.
// Hover tilts it toward the pointer; press and drag sideways scrubs its turn by hand;
// a click or tap spins it once on Y, slow and soft, then the link opens.
// One tiny shared WebGL canvas draws each logo into its own 2D canvas, only while something moves.
const URL_ = 'https://shifatmasud-framer.vercel.app/';
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const MAX = 18 * Math.PI / 180, SPIN = 1500, TURN = Math.PI * 2;
const SCRUB = 1.5 * Math.PI / 180; // radians of turn per pixel of drag (follows the finger 1:1, no lag)
const K = 30, C = 11;               // soft spring: no overshoot, settles in about 0.7 s
const SMOOTH = 0.09;                // pointer smoothing time (s)
// hit area around each logo box, in px [top, right, bottom, left]; matches the ::after areas in the CSS
const PAD = { mark: [31, 31, 31, 31], 'foot-mark': [40, 29, 10, 29] };
const logos = [...document.querySelectorAll('.mark, .foot-mark')].map((a) => ({
  a, box: a.querySelector('i') || a, svg: a.querySelector('svg'),
  pad: PAD[a.classList.contains('mark') ? 'mark' : 'foot-mark'],
  rx: 0, ry: 0, vx: 0, vy: 0, tx: 0, ty: 0, gx: 0, gy: 0, base: 0,
  spin: -1, t0: 0, down: null, drag: false, touch: false, scrub: false, sx: 0, sr: 0, hist: []
}));
let draw = null, raf = 0, last = 0;
// the logos follow the shared window pointer too, stepped inside the page's one render loop (no loop of their own)
const P = window.__ptr;
let seenN = -1, awake = false;
const kick = () => {
  if (!draw) return;
  if (!awake) { awake = true; last = performance.now(); }
  if (!window.__glDriver && !raf) raf = requestAnimationFrame(tick);   // fallback when the 3D scene loop is missing
};
const regoal = () => { seenN = -1; kick(); };
const clamp1 = (v) => Math.max(-1, Math.min(1, v));
// tilt maps to the whole hit area: its edges give the full 18 degrees
// past the hit area it keeps leaning toward the pointer, a little less the farther away it is
const fall = (d, h) => { const a = Math.abs(d); return Math.sign(d) * (a <= h ? a / h : Math.max(0.45, 1 - 0.55 * Math.min(1, (a - h) / 320))); };
const aim = (L, x, y) => {
  if (L.spin >= 0 || L.scrub) return;
  const k = reduce.matches ? 0.35 : 1;
  const r = L.box.getBoundingClientRect(), [pt, pr, pb, pl] = L.pad;
  const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
  const nx = fall(dx, r.width / 2 + (dx < 0 ? pl : pr));
  const ny = fall(dy, r.height / 2 + (dy < 0 ? pt : pb));
  L.gy = nx * MAX * k; L.gx = ny * MAX * k; kick();
};
// once per frame, only when the shared pointer changed: re-aim the logos that are on screen
const aimAll = () => {
  const on = P.on(performance.now());
  for (const L of logos) {
    if (!L.vis || L.spin >= 0 || L.scrub) continue;
    if (on) aim(L, P.cx, P.cy); else if (L.gx || L.gy) { L.gx = L.gy = 0; kick(); }
  }
};
logos.forEach((L) => { L.vis = true; });
const lio = new IntersectionObserver((es) => es.forEach((e) => { const L = logos.find((o) => o.a === e.target); if (L) { L.vis = e.isIntersecting; if (L.vis) regoal(); } }));
logos.forEach((L) => lio.observe(L.a));
const rest = (L) => { L.gx = L.gy = 0; kick(); };
// cubic-bezier(0.65, 0, 0.35, 1): soft start, glides into the end
const bez = (x1, y1, x2, y2) => {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t, dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => { let t = x; for (let i = 0; i < 8; i++) { const d = dX(t); if (Math.abs(d) < 1e-6) break; t -= (X(t) - x) / d; } return Y(Math.max(0, Math.min(1, t))); };
};
const ease = bez(0.65, 0, 0.35, 1);

const endScrub = (L) => {
  if (!L.scrub) return;
  L.scrub = false;
  // momentum from the last ~80 ms of the drag
  const now = performance.now(), h = L.hist.filter((p) => now - p[0] < 90);
  let v = 0;
  if (h.length > 1) { const a = h[0], b = h[h.length - 1]; if (b[0] - a[0] > 8) v = (b[1] - a[1]) / ((b[0] - a[0]) / 1000); }
  if (now - (L.hist.length ? L.hist[L.hist.length - 1][0] : 0) > 80) v = 0;
  L.vy = Math.max(-14, Math.min(14, v));
  // glide back to the nearest flat face (a whole turn), after the small push
  L.base = Math.round((L.ry + L.vy * 0.25) / TURN) * TURN;
  L.gy = L.ty = 0; L.hist = []; kick();
};

logos.forEach((L) => {
  const a = L.a;
  a.addEventListener('dragstart', (e) => e.preventDefault());
  a.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    L.down = [e.clientX, e.clientY]; L.drag = false; L.pid = e.pointerId;
    if (e.pointerType !== 'mouse') { L.touch = true; aim(L, e.clientX, e.clientY); }
  }, { passive: true });
  a.addEventListener('pointermove', (e) => {
    if (L.down && e.pointerId === L.pid) {
      const dx = e.clientX - L.down[0], dy = e.clientY - L.down[1];
      if (Math.hypot(dx, dy) > 8) L.drag = true;
      // sideways drag starts a scrub (mostly vertical finger moves are left to the page scroll)
      if (!L.scrub && draw && !reduce.matches && L.spin < 0 && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        L.scrub = true; L.drag = true; L.sx = e.clientX; L.sr = L.ry; L.gx = 0; L.hist = [];
        try { a.setPointerCapture(e.pointerId); } catch (_) {}
      }
      if (L.scrub) {
        L.ry = L.sr + (e.clientX - L.sx) * SCRUB; L.vy = 0;
        L.hist.push([performance.now(), L.ry]); if (L.hist.length > 12) L.hist.shift();
        kick(); return;
      }
    }
    if (e.pointerType === 'mouse' || L.touch) aim(L, e.clientX, e.clientY);
  }, { passive: true });
  const up = (e) => {
    const wasScrub = L.scrub; endScrub(L);
    if (e.pointerType !== 'mouse') { L.touch = false; if (!wasScrub && L.spin < 0) regoal(); }
    else if (wasScrub) aim(L, e.clientX, e.clientY);
    setTimeout(() => { L.down = null; }, 0);
  };
  a.addEventListener('pointerup', up, { passive: true });
  a.addEventListener('lostpointercapture', () => endScrub(L), { passive: true });
  a.addEventListener('pointercancel', () => { endScrub(L); L.touch = false; L.down = null; regoal(); }, { passive: true });
  a.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !L.scrub) { if (!(e.buttons & 1)) L.down = null; regoal(); } }, { passive: true });
  a.addEventListener('click', (e) => {
    // a drag or a scrub never opens the link
    if (L.drag && e.detail) { e.preventDefault(); L.drag = false; return; }
    // new tab right away, as the browser does it
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (reduce.matches || !draw) return;
    e.preventDefault();
    if (L.spin >= 0) return;
    L.spin = 0; L.t0 = performance.now(); L.gx = L.gy = 0; kick();
  });
});
// coming back with the Back button: start flat and still
addEventListener('pageshow', (e) => { if (e.persisted) logos.forEach((L) => { L.spin = -1; L.scrub = false; L.rx = L.ry = L.vx = L.vy = L.tx = L.ty = L.gx = L.gy = L.base = 0; if (draw) draw(L); }); });

function tick() {
  raf = 0;
  if (window.__glDriver) return;   // the scene loop steps the logos now
  if (P && P.n !== seenN) { seenN = P.n; aimAll(); }
  if (step(performance.now())) raf = requestAnimationFrame(tick); else awake = false;
}
window.__logoStep = (now) => {
  if (!draw) return;
  if (P && P.n !== seenN) { seenN = P.n; aimAll(); }
  if (awake && !step(now)) awake = false;
};
if (P) P.wake = () => { if (!window.__glDriver && draw) { if (P.n !== seenN) { seenN = P.n; aimAll(); } } };
function step(now) {
  const dt = Math.min(1 / 30, Math.max(1 / 240, (now - last) / 1000)); last = now;
  let busy = false;
  for (const L of logos) {
    let moved = false;
    // smooth the pointer target, then a soft spring follows it
    const f = 1 - Math.exp(-dt / SMOOTH);
    for (const ax of ['x', 'y']) {
      const g = 'g' + ax, t = 't' + ax;
      if (Math.abs(L[g] - L[t]) > 1e-5) { L[t] += (L[g] - L[t]) * f; moved = true; } else L[t] = L[g];
    }
    for (const ax of ['x', 'y']) {
      if (ax === 'y' && L.scrub) { moved = true; continue; } // the drag sets the turn directly
      const p = 'r' + ax, v = 'v' + ax, goal = L['t' + ax] + (ax === 'y' ? L.base : 0);
      if (Math.abs(goal - L[p]) > 1e-4 || Math.abs(L[v]) > 1e-3) {
        L[v] += (K * (goal - L[p]) - C * L[v]) * dt; L[p] += L[v] * dt; moved = true;
      } else if (L[p] !== goal) { L[p] = goal; L[v] = 0; moved = true; }
    }
    // settled after a scrub: fold whole turns away so numbers stay small
    if (!L.scrub && L.base && L.ry === L.ty + L.base && !L.vy) { L.ry -= L.base; L.base = 0; }
    let go = false;
    if (L.spin >= 0) {
      L.spin = Math.min(1, (now - L.t0) / SPIN); moved = true;
      if (L.spin >= 1) { L.spin = -1; L.rx = L.vx = L.vy = 0; L.ry = 0; L.base = 0; go = true; }
    }
    if (moved) { draw(L); busy = true; }
    if (go) { L.a.dispatchEvent(new CustomEvent('logospun')); location.assign(L.a.href || URL_); }
  }
  return busy;
}

try {
  // the 3D logo looks the same as the flat SVG at rest, so it is built after the hero intro has landed, in an idle slot
  await (window.__introDone || Promise.resolve());
  await new Promise((r) => (window.__idle ? window.__idle(r, 2000) : setTimeout(r, 0)));
  const THREE = await import('three');
  const { SVGLoader } = await import('three/addons/loaders/SVGLoader.js');
  const gl = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const cam = new THREE.OrthographicCamera(-102, 102, 102, -102, 1, 1000); cam.position.z = 500;
  const scene = new THREE.Scene(); scene.background = null;
  const geoFor = {};
  const meshFor = (svg) => {
    const path = svg.querySelector('path'), d = path.getAttribute('d'), fill = path.getAttribute('fill');
    if (!geoFor[d]) {
      const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}"/></svg>`);
      const shapes = data.paths.flatMap((p) => p.toShapes(true));
      const g = new THREE.ExtrudeGeometry(shapes, { depth: 40, bevelEnabled: false, curveSegments: 14 });
      // SVG y points down: centre on the viewBox and turn it over (flips y and z, keeps faces outward)
      g.translate(-100, -100, -20); g.rotateX(Math.PI);
      geoFor[d] = g;
    }
    const col = new THREE.Color(fill);
    const lum = col.r * 0.2126 + col.g * 0.7152 + col.b * 0.0722;
    // dark mark: near-black sides, a shade off the front, so it reads as one solid object
    const side = lum < 0.5 ? new THREE.Color('#222326') : col.clone().lerp(new THREE.Color(0x000000), 0.38);
    return new THREE.Mesh(geoFor[d], [new THREE.MeshBasicMaterial({ color: col }), new THREE.MeshBasicMaterial({ color: side })]);
  };
  let dpr = 0;
  logos.forEach((L) => {
    L.mesh = meshFor(L.svg);
    L.cv = document.createElement('canvas'); L.cv.className = 'logo3d'; L.cv.setAttribute('aria-hidden', 'true');
    L.ctx = L.cv.getContext('2d');
  });
  draw = (L) => {
    const w = L.box.clientWidth || 26, px = Math.round(w * dpr);
    if (L.cv.width !== px) { L.cv.width = L.cv.height = px; }
    const S = Math.max(...logos.map((o) => Math.round((o.box.clientWidth || 26) * dpr)));
    if (gl.width !== S) renderer.setSize(S, S, false);
    const m = L.mesh;
    m.rotation.set(L.rx, L.ry + (L.spin >= 0 ? ease(L.spin) * TURN : 0), 0, 'YXZ');
    scene.add(m); renderer.render(scene, cam); scene.remove(m);
    L.ctx.clearRect(0, 0, px, px); L.ctx.drawImage(gl, 0, 0, gl.width, gl.height, 0, 0, px, px);
  };
  const all = () => { dpr = Math.min(devicePixelRatio || 1, 2); logos.forEach(draw); };
  all();
  logos.forEach((L) => { L.box.appendChild(L.cv); L.a.classList.add('is-3d'); });
  addEventListener('resize', () => { if (Math.min(devicePixelRatio || 1, 2) !== dpr) all(); }, { passive: true });
  gl.addEventListener('webglcontextlost', () => { draw = null; logos.forEach((L) => { L.a.classList.remove('is-3d'); L.cv.remove(); }); });
  window.__logo3d = { logos, draw: (i) => draw && draw(logos[i]) };
} catch (err) {
  // no WebGL: the flat SVG logos stay, and the links work as plain links
  draw = null;
}
