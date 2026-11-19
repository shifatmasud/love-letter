// Ink button: compiled as-is from shifatmasud/shade-verse src/title/portfolio/inkButton.ts (+ house.ts),
// the engine behind the Shade Verse title screen Play button (TitleButton.tsx). Ink flood from the pointer,
// label/arrow roll, magnet, spring squash on press and a small ripple on tap. Do not edit here; edit the source.
// house.ts
var HOUSE = {
  IN: [0.19, 1, 0.22, 1],
  INOUT: [0.65, 0, 0.35, 1],
  CSS_IN: "cubic-bezier(0.19, 1, 0.22, 1)",
  CSS_INOUT: "cubic-bezier(0.65, 0, 0.35, 1)",
  DUR_IN: 1,
  DUR_OUT: 0.6,
  DUR_UI: 0.6,
  DUR_FADE: 0.24
};
function cssBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-6) return sy(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 24; i++) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (x > v) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}
var houseIn = cssBezier(...HOUSE.IN);
var houseInOut = cssBezier(...HOUSE.INOUT);

// inkButton.ts
var reducedMQ = typeof matchMedia !== "undefined" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
var browser = { get reducedMotion() {
  return !!reducedMQ?.matches;
} };
var EIN = cssBezier(...HOUSE.IN);
var EINOUT = cssBezier(...HOUSE.INOUT);
var INK = {
  FLOOD: 0.85,
  DRAIN: 0.65,
  TAP_HOLD: 0.32,
  MAG_MAX: { cta: 8, sound: 4 },
  MAG_PAD: 0.2,
  MAG_PAD_MIN: 24,
  PARALLAX: 1.5,
  MAG_F: 2.6,
  MAG_Z: 0.55,
  SQ_X: 1.04,
  SQ_Y: 0.92,
  SQ_F: 7,
  SQ_Z: 0.8,
  REL_F: 2.4,
  REL_Z: 0.45,
  ROLL: HOUSE.DUR_UI,
  RIP_DUR: 0.76,
  RIP_PEAK: { cta: 20, sound: 10 }
};
var btns = [];
var raf = 0;
var last = 0;
var ringURL = "";
var svgRoot = null;
var magnetOn = false;
var now = () => performance.now() / 1e3;
var spr = (x, f, z) => ({ x, v: 0, t: x, f, z });
function stepSpr(s, dt) {
  const w = 2 * Math.PI * s.f, n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += (-w * w * (s.x - s.t) - 2 * s.z * w * s.v) * h;
    s.x += s.v * h;
  }
  if (Math.abs(s.x - s.t) < 1e-4 && Math.abs(s.v) < 1e-3) {
    s.x = s.t;
    s.v = 0;
    return false;
  }
  return true;
}
function ringMap() {
  if (ringURL) return ringURL;
  const N = 512, c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d"), img = g.createImageData(N, N), d = img.data;
  const sm = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const T = 1024, prof = new Float32Array(T + 1);
  for (let k = 0; k <= T; k++) {
    const r = k / T;
    const env = (1 - sm(0.9, 1, r)) * Math.exp(-2.6 * Math.max(0, 0.9 - r)) * sm(0.04, 0.3, r);
    prof[k] = r < 1 && r > 1e-4 ? Math.sin((1 - r) * Math.PI * 2 * 1.75) * env / r : 0;
  }
  for (let j = 0; j < N; j++) {
    const v = (j + 0.5) / N * 2 - 1;
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N * 2 - 1, r2 = u * u + v * v;
      const k = (j * N + i) * 4;
      let fx = 0, fy = 0;
      if (r2 < 1) {
        const f = prof[Math.round(Math.sqrt(r2) * T)];
        fx = u * f;
        fy = v * f;
      }
      d[k] = Math.round(128 + 127 * fx);
      d[k + 1] = Math.round(128 + 127 * fy);
      d[k + 2] = 128;
      d[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  ringURL = c.toDataURL("image/png");
  return ringURL;
}
var NS = "http://www.w3.org/2000/svg";
var mapSetters = [];
function armMaps() {
  for (const s of mapSetters) s();
}
function makeFilter(id) {
  if (!svgRoot) {
    svgRoot = document.createElementNS(NS, "svg");
    svgRoot.setAttribute("aria-hidden", "true");
    svgRoot.setAttribute("width", "0");
    svgRoot.setAttribute("height", "0");
    svgRoot.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
    document.body.appendChild(svgRoot);
  }
  const f = document.createElementNS(NS, "filter");
  f.id = id;
  for (const [k, v] of [["filterUnits", "userSpaceOnUse"], ["primitiveUnits", "userSpaceOnUse"], ["color-interpolation-filters", "sRGB"]]) f.setAttribute(k, v);
  const flood2 = document.createElementNS(NS, "feFlood");
  flood2.setAttribute("flood-color", "rgb(128,128,128)");
  flood2.setAttribute("result", "n");
  const im = document.createElementNS(NS, "feImage");
  const setMap = () => {
    if (im.getAttribute("href")) return;
    im.setAttribute("href", ringMap());
    im.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", ringMap());
  };
  mapSetters.push(setMap);
  if (ringURL) setMap();
  im.setAttribute("preserveAspectRatio", "none");
  im.setAttribute("result", "r");
  const mg = document.createElementNS(NS, "feMerge");
  mg.setAttribute("result", "m");
  for (const s of ["n", "r"]) {
    const mn = document.createElementNS(NS, "feMergeNode");
    mn.setAttribute("in", s);
    mg.appendChild(mn);
  }
  const dm = document.createElementNS(NS, "feDisplacementMap");
  dm.setAttribute("in", "SourceGraphic");
  dm.setAttribute("in2", "m");
  dm.setAttribute("scale", "0");
  dm.setAttribute("xChannelSelector", "R");
  dm.setAttribute("yChannelSelector", "G");
  f.append(flood2, im, mg, dm);
  svgRoot.appendChild(f);
  return { f, im, dm };
}
function measure(b) {
  b.w = b.el.offsetWidth;
  b.h = b.el.offsetHeight;
  b.rr = Math.min(parseFloat(getComputedStyle(b.el).borderTopLeftRadius) || 0, b.w / 2, b.h / 2);
}
function screenScale(b, r) {
  return Math.max(1e-3, r.width / ((b.el.offsetWidth || 1) * (b.sx.x || 1)));
}
var farR = (b, x, y) => Math.hypot(Math.max(x, b.w - x), Math.max(y, b.h - y)) + 1;
// smallest circle at (x, y) that covers the button's visible shape (the pill, round ends included)
var cover = (b, x, y) => {
  const r = b.rr || 0, xs = [r, b.w - r], ys = [r, b.h - r];
  let m = 0;
  for (const cx of xs) for (const cy of ys) m = Math.max(m, Math.hypot(x - cx, y - cy));
  return m + r + 1;
};
function local(b, cx, cy) {
  const r = b.el.getBoundingClientRect(), mx = (r.left + r.right) / 2, my = (r.top + r.bottom) / 2, k = screenScale(b, r);
  return { x: Math.min(b.w, Math.max(0, (cx - mx) / k / (b.sx.x || 1) + b.w / 2)), y: Math.min(b.h, Math.max(0, (cy - my) / k / (b.sy.x || 1) + b.h / 2)) };
}
function flood(b, p) {
  measure(b);
  b.on = true;
  b.drainAt = 0;
  const to = { x: p.x, y: p.y, r: farR(b, p.x, p.y) };
  if (browser.reducedMotion) {
    b.fl = to;
    b.flA = null;
    kick();
    return;
  }
  const from = b.fl.r > 0.5 ? { ...b.fl } : { x: p.x, y: p.y, r: 0 };
  b.flA = { a: from, b: to, t0: now(), d: INK.FLOOD, e: EIN };
  kick();
}
function drain(b, p) {
  b.on = false;
  b.drainAt = 0;
  measure(b);
  if (browser.reducedMotion) {
    b.fl = { x: p.x, y: p.y, r: 0 };
    b.flA = null;
    kick();
    return;
  }
  // drain out through the exit point: when the ink fills the button, move its center to p and size it
  // to still cover the button (no visible jump), then shrink it to zero at p
  let from = { ...b.fl };
  if (from.r > 0.25 && from.r >= cover(b, from.x, from.y) - 1) from = { x: p.x, y: p.y, r: cover(b, p.x, p.y) };
  b.flA = { a: from, b: { x: p.x, y: p.y, r: 0 }, t0: now(), d: INK.DRAIN, e: EINOUT };
  kick();
}
function roll(b) {
  if (browser.reducedMotion || b.el.hasAttribute("data-no-roll")) return; // label and arrow stay put
  if (b.roll < b.rollB1 - 0.02) return;
  b.rollA0 = b.roll;
  b.rollB1 = Math.floor(b.roll + 0.02) + 1;
  b.rollT0 = now();
  kick();
}
function pressRoll(b) {
  if (b.kind !== "sound") roll(b);
}
function press(b, p) {
  if (browser.reducedMotion) return;
  b.sx.f = b.sy.f = INK.SQ_F;
  b.sx.z = b.sy.z = INK.SQ_Z;
  b.sx.t = INK.SQ_X;
  b.sy.t = INK.SQ_Y;
  b.rip = { x: p.x, y: p.y, t0: now() };
  kick();
}
function release(b) {
  b.sx.f = b.sy.f = INK.REL_F;
  b.sx.z = b.sy.z = INK.REL_Z;
  b.sx.t = 1;
  b.sy.t = 1;
  kick();
}
function frame() {
  raf = 0;
  const t = now(), dt = Math.min(1 / 20, Math.max(0, t - last));
  last = t;
  let live = false;
  for (const b of btns) {
    if (b.drainAt && t >= b.drainAt && b.drainPt) {
      const p = b.drainPt;
      b.drainPt = null;
      drain(b, p);
    }
    if (b.drainAt) live = true;
    if (b.flA) {
      const k = Math.min(1, (t - b.flA.t0) / b.flA.d), e = b.flA.e(k), A = b.flA.a, B = b.flA.b;
      b.fl = { x: A.x + (B.x - A.x) * e, y: A.y + (B.y - A.y) * e, r: A.r + (B.r - A.r) * e };
      if (k >= 1) b.flA = null;
      else live = true;
    }
    if (b.fl.r <= 0.25) {
      b.ink.style.visibility = "hidden";
      b.ink.style.clipPath = "circle(0px at 0px 0px)";
    } else {
      b.ink.style.visibility = "visible";
      b.ink.style.clipPath = `circle(${b.fl.r.toFixed(2)}px at ${b.fl.x.toFixed(2)}px ${b.fl.y.toFixed(2)}px)`;
    }
    for (const s of [b.mx, b.my, b.sx, b.sy]) if (stepSpr(s, dt)) live = true;
    b.el.style.translate = b.mx.x || b.my.x ? `${b.mx.x.toFixed(2)}px ${b.my.x.toFixed(2)}px` : "";
    b.el.style.scale = b.sx.x !== 1 || b.sy.x !== 1 ? `${b.sx.x.toFixed(4)} ${b.sy.x.toFixed(4)}` : "";
    const px = b.mx.x * (INK.PARALLAX - 1), py = b.my.x * (INK.PARALLAX - 1);
    for (const e of b.par) e.style.translate = px || py ? `${px.toFixed(2)}px ${py.toFixed(2)}px` : "";
    if (b.roll !== b.rollB1) {
      const k = Math.min(1, (t - b.rollT0) / INK.ROLL);
      b.roll = k >= 1 ? b.rollB1 : b.rollA0 + (b.rollB1 - b.rollA0) * EIN(k);
      if (k < 1) live = true;
    }
    const fr = b.roll - Math.floor(b.roll);
    for (const e of b.rollA) e.style.transform = fr ? `translate3d(0,${(-fr * 100).toFixed(3)}%,0)` : "";
    for (const e of b.rollB) e.style.transform = `translate3d(0,${((1 - fr) * 100).toFixed(3)}%,0)`;
    for (const e of b.arrA) e.style.transform = fr ? `translate3d(${(fr * 130).toFixed(3)}%,${(-fr * 130).toFixed(3)}%,0)` : "";
    for (const e of b.arrB) e.style.transform = `translate3d(${((fr - 1) * 130).toFixed(3)}%,${((1 - fr) * 130).toFixed(3)}%,0)`;
    if (b.rip) {
      const k = (t - b.rip.t0) / INK.RIP_DUR;
      if (k >= 1) {
        b.rip = null;
      } else {
        live = true;
        const pad = b.kind === "cta" ? 44 : 24;
        if (!b.filtOn) {
          measure(b);
          b.filt.setAttribute("x", String(-pad));
          b.filt.setAttribute("y", String(-pad));
          b.filt.setAttribute("width", String(b.w + 2 * pad));
          b.filt.setAttribute("height", String(b.h + 2 * pad));
          b.el.style.filter = `url(#${b.filt.id})`;
          b.filtOn = true;
        }
        const front = 4 + farR(b, b.rip.x, b.rip.y) * 1.15 * EIN(k), half = front / 0.9;
        const grow = Math.min(1, front / (0.75 * farR(b, b.rip.x, b.rip.y)));
        const amp = INK.RIP_PEAK[b.kind] * grow * grow * Math.pow(1 - k, 1.6);
        b.fimg.setAttribute("x", (b.rip.x - half).toFixed(2));
        b.fimg.setAttribute("y", (b.rip.y - half).toFixed(2));
        b.fimg.setAttribute("width", (2 * half).toFixed(2));
        b.fimg.setAttribute("height", (2 * half).toFixed(2));
        b.disp.setAttribute("scale", amp.toFixed(3));
      }
    }
    if (!b.rip && b.filtOn) {
      b.el.style.filter = "";
      b.disp.setAttribute("scale", "0");
      b.filtOn = false;
    }
  }
  if (live) raf = requestAnimationFrame(frame);
}
function kick() {
  if (!raf) {
    last = now();
    raf = requestAnimationFrame(frame);
  }
}
function onMove(e) {
  if (e.pointerType !== "mouse") return;
  for (const b of btns) {
    const r = b.el.getBoundingClientRect(), k = screenScale(b, r);
    const cx = (r.left + r.right) / 2 - b.mx.x * k, cy = (r.top + r.bottom) / 2 - b.my.x * k;
    const w = b.el.offsetWidth, h = b.el.offsetHeight, pad = Math.max(INK.MAG_PAD * w, INK.MAG_PAD_MIN / k);
    const dx = (e.clientX - cx) / k, dy = (e.clientY - cy) / k;
    const ox = Math.max(0, Math.abs(dx) - w / 2), oy = Math.max(0, Math.abs(dy) - h / 2), out = Math.hypot(ox, oy) / pad;
    let tx = 0, ty = 0;
    if (out < 1) {
      const s = 1 - out * out * (3 - 2 * out), M = INK.MAG_MAX[b.kind];
      tx = Math.max(-1, Math.min(1, dx / (w / 2 + pad))) * M * s;
      ty = Math.max(-1, Math.min(1, dy / (h / 2 + pad))) * M * s;
    }
    if (tx !== b.mx.t || ty !== b.my.t) {
      b.mx.t = tx;
      b.my.t = ty;
      kick();
    }
  }
}
function inkKeyDown(el) {
  const b = btns.find((x) => x.el === el);
  if (!b) return;
  armMaps();
  measure(b);
  const c = { x: b.w / 2, y: b.h / 2 };
  flood(b, c);
  b.downPt = c;
  press(b, c);
}
function inkKeyUp(el) {
  const b = btns.find((x) => x.el === el);
  if (!b || !b.downPt) return;
  b.downPt = null;
  release(b);
  pressRoll(b);
  drain(b, { x: b.w / 2, y: b.h / 2 });
}
function bindInk(el, kind) {
  if (!el || btns.some((b2) => b2.el === el)) return () => {
  };
  const ink = el.querySelector(":scope > .ink");
  const q = (s) => Array.from(el.querySelectorAll(s));
  const { f, im, dm } = makeFilter("ink-rip-" + kind);
  const b = {
    el,
    kind,
    ink,
    par: q(".ink-par"),
    rollA: q(".ir-a"),
    rollB: q(".ir-b"),
    arrA: q(".ia-a"),
    arrB: q(".ia-b"),
    w: 0,
    h: 0,
    fl: { x: 0, y: 0, r: 0 },
    flA: null,
    on: false,
    pressT0: 0,
    downPt: null,
    drainAt: 0,
    drainPt: null,
    mx: spr(0, INK.MAG_F, INK.MAG_Z),
    my: spr(0, INK.MAG_F, INK.MAG_Z),
    sx: spr(1, INK.SQ_F, INK.SQ_Z),
    sy: spr(1, INK.SQ_F, INK.SQ_Z),
    roll: 0,
    rollA0: 0,
    rollB1: 0,
    rollT0: 0,
    rip: null,
    filt: f,
    fimg: im,
    disp: dm,
    filtOn: false
  };
  btns.push(b);
  measure(b);
  kick();
  const P = (e) => local(b, e.clientX, e.clientY);
  // touch / pen: follow the finger after pointerdown. A pointercancel (the browser takes the touch to
  // scroll) reports clientX/Y as 0,0, so the drain uses the last real touch point instead.
  b.pid = -1;
  b.tp = null;
  b.finger = false;
  b.waitLift = false;
  const inside = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  const exitDrain = (x, y) => {
    const r = b.el.getBoundingClientRect(), q = b.tp;
    let ex = x, ey = y;
    if (q && inside(r, q.x, q.y)) {
      let lo = 0, hi = 1;
      for (let i = 0; i < 14; i++) {
        const t = (lo + hi) / 2;
        if (inside(r, q.x + (x - q.x) * t, q.y + (y - q.y) * t)) lo = t;
        else hi = t;
      }
      ex = q.x + (x - q.x) * hi;
      ey = q.y + (y - q.y) * hi;
    }
    b.drainAt = 0;
    b.drainPt = null;
    b.waitLift = false;
    drain(b, local(b, ex, ey));
  };
  const trackPt = (x, y) => {
    if (b.pid < 0) return;
    if (b.on && !inside(b.el.getBoundingClientRect(), x, y)) exitDrain(x, y);
    b.tp = { x, y };
  };
  const tmove = (e) => {
    if (e.pointerId === b.pid && e.pointerType !== "mouse") trackPt(e.clientX, e.clientY);
  };
  const touchMove = (e) => {
    if (b.finger && e.touches.length) trackPt(e.touches[0].clientX, e.touches[0].clientY);
  };
  const touchEnd = (e) => {
    if (!b.finger || e.touches.length) return;
    b.finger = false;
    if (b.waitLift) {
      b.waitLift = false;
      b.pid = -1;
      if (b.on && b.tp) drain(b, local(b, b.tp.x, b.tp.y));
    }
  };
  const enter = (e) => {
    if (e.pointerType === "mouse") {
      armMaps();
      flood(b, P(e));
      roll(b);
    } else setTimeout(armMaps, 0);
  };
  const leave = (e) => {
    if (e.pointerType === "mouse") {
      drain(b, P(e));
      release(b);
    }
  };
  const down = (e) => {
    if (e.button !== 0) return;
    if (e.pointerType === "mouse") armMaps();
    else setTimeout(armMaps, 0);
    const p = P(e);
    b.pressT0 = now();
    b.downPt = p;
    if (e.pointerType !== "mouse") {
      b.pid = e.pointerId;
      b.tp = { x: e.clientX, y: e.clientY };
      b.finger = e.pointerType === "touch";
      b.waitLift = false;
      flood(b, p);
    }
    press(b, p);
  };
  const up = (e) => {
    if (!b.downPt) return;
    b.downPt = null;
    release(b);
    pressRoll(b);
    if (e.pointerType !== "mouse") {
      const cancel = e.type === "pointercancel";
      if (cancel && b.finger && "ontouchstart" in window) {
        b.waitLift = true; // keep following the finger; drain where it leaves the button or lifts
        return;
      }
      b.pid = -1;
      if (!b.on) return; // already drained where the finger left the button
      const p = cancel ? b.tp ? local(b, b.tp.x, b.tp.y) : { x: b.w / 2, y: b.h / 2 } : P(e), at = b.pressT0 + INK.TAP_HOLD;
      if (cancel || now() >= at) drain(b, p);
      else {
        b.drainAt = at;
        b.drainPt = p;
        kick();
      }
    }
  };
  const focus = () => {
    if (el.matches(":focus-visible")) {
      armMaps();
      measure(b);
      flood(b, { x: b.w / 2, y: b.h / 2 });
    }
  };
  const blur = () => {
    if (b.on) {
      measure(b);
      drain(b, { x: b.w / 2, y: b.h / 2 });
    }
  };
  const kd = (e) => {
    if (!e.repeat && (e.key === "Enter" || e.key === " ")) {
      measure(b);
      b.downPt = { x: b.w / 2, y: b.h / 2 };
      press(b, b.downPt);
    }
  };
  const ku = (e) => {
    if ((e.key === "Enter" || e.key === " ") && b.downPt) {
      b.downPt = null;
      release(b);
      pressRoll(b);
    }
  };
  el.addEventListener("pointerenter", enter);
  el.addEventListener("pointerleave", leave);
  el.addEventListener("pointerdown", down);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
  window.addEventListener("pointermove", tmove, { passive: true });
  window.addEventListener("touchmove", touchMove, { passive: true });
  window.addEventListener("touchend", touchEnd, { passive: true });
  window.addEventListener("touchcancel", touchEnd, { passive: true });
  el.addEventListener("focus", focus);
  el.addEventListener("blur", blur);
  el.addEventListener("keydown", kd);
  el.addEventListener("keyup", ku);
  if (!magnetOn && !browser.reducedMotion && matchMedia("(hover: hover) and (pointer: fine)").matches) {
    magnetOn = true;
    window.addEventListener("pointermove", onMove, { passive: true });
  }
  return () => {
    el.removeEventListener("pointerenter", enter);
    el.removeEventListener("pointerleave", leave);
    el.removeEventListener("pointerdown", down);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    window.removeEventListener("pointermove", tmove);
    window.removeEventListener("touchmove", touchMove);
    window.removeEventListener("touchend", touchEnd);
    window.removeEventListener("touchcancel", touchEnd);
    el.removeEventListener("focus", focus);
    el.removeEventListener("blur", blur);
    el.removeEventListener("keydown", kd);
    el.removeEventListener("keyup", ku);
    const i = btns.indexOf(b);
    if (i >= 0) btns.splice(i, 1);
    f.remove();
    if (magnetOn && !btns.length) {
      magnetOn = false;
      window.removeEventListener("pointermove", onMove);
    }
  };
}
export {
  INK,
  bindInk,
  inkKeyDown,
  inkKeyUp
};
