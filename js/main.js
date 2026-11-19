// Love Letter: one continuous painted scene told in 3 beats.
// Hybrid: real 3D subjects (house, balloon, letter, hero leaves) with painted maps and thin ink,
// over painted 2D layers placed in depth (sky, far pines, clouds).
// One requestAnimationFrame drives Lenis, the scene and the render.
import * as THREE from 'three';
import Lenis from 'lenis';
import { animate } from 'motion';
import * as S from './shaders.js';
import { Sound } from './audio.js';

const $ = (s, r = document) => r.querySelector(s);
const qs = new URLSearchParams(location.search);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduce) document.documentElement.classList.add('reduce');
const coarse = matchMedia('(pointer: coarse)').matches;
const DEBUG = qs.has('debug');

// ---------- quality tier ----------
function gpuName() {
  try {
    const c = document.createElement('canvas');
    const g = c.getContext('webgl');
    const e = g && g.getExtension('WEBGL_debug_renderer_info');
    const n = e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '';
    g && g.getExtension('WEBGL_lose_context')?.loseContext();
    return n || '';
  } catch (_) { return ''; }
}
const GPU = gpuName();
const weakGPU = /Adreno \(TM\) ?[2-5]\d\d|Mali-[4T]|Mali-G[357]\d|PowerVR|Intel.*(HD|UHD) Graphics( [5-6]\d\d)?\b|SwiftShader|llvmpipe/i.test(GPU);
const mem = navigator.deviceMemory || 4;
let LOW = qs.get('q') === 'low' || (qs.get('q') !== 'high' && (weakGPU || mem <= 2 || (coarse && mem <= 4)));
if (LOW) document.documentElement.classList.add('low');
const DPR = LOW ? 1 : Math.min(devicePixelRatio || 1, 1.5);

// ---------- renderer ----------
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, alpha: false, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(DPR);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // paintings are already graded in sRGB
renderer.setClearColor(0xa9c6e4, 1);
renderer.sortObjects = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
camera.position.set(0, 0, 10);
const root = new THREE.Group(); // everything that scrolls
scene.add(root);

// ---------- palette per beat (warm light, cool shadow, haze) ----------
const C = (h) => new THREE.Color(h);
const PAL = [
  // morning (reference: blue sky, white mist, fresh greens) -> late gold above the trees -> blue night
  { haze: C(0xd6e3ea), warm: C(0xfff0d2), cool: C(0x7890ad), ink: C(0x1f2c2a), clear: C(0xa9c6e4) },
  { haze: C(0xe6e1ea), warm: C(0xffe2c0), cool: C(0x8790bd), ink: C(0x2a2a3e), clear: C(0x9db4dc) },
  { haze: C(0x2a3360), warm: C(0xf6dcb8), cool: C(0x56609a), ink: C(0x1c1e34), clear: C(0x141a38) },
];
const U = {
  time: { value: 0 }, sun: { value: new THREE.Vector3(0.62, 0.5, 0.42).normalize() },
  warm: { value: PAL[0].warm.clone() }, cool: { value: PAL[0].cool.clone() },
  ink: { value: PAL[0].ink.clone() }, haze: { value: PAL[0].haze.clone() },
  ptr: { value: new THREE.Vector2(9, 9) }, aspect: { value: 1 },
};

// ---------- textures ----------
const TEX_SCALE = LOW ? 0.5 : 1;
const loaded = {};
async function tex(name, { scale = TEX_SCALE, repeat = false, file = `/tex/${name}.webp` } = {}) {
  if (loaded[name]) return loaded[name];
  let t;
  try {
    const blob = await (await fetch(file)).blob();
    const probe = await createImageBitmap(blob);
    const opts = { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' };
    let bmp = probe;
    if (scale < 1 && probe.width > 512) {
      bmp = await createImageBitmap(blob, { ...opts, resizeWidth: Math.round(probe.width * scale), resizeHeight: Math.round(probe.height * scale), resizeQuality: 'high' });
      probe.close?.();
    } else {
      bmp = await createImageBitmap(blob, opts); probe.close?.();
    }
    t = new THREE.Texture(bmp); t.flipY = false;
  } catch (_) {
    t = await new THREE.TextureLoader().loadAsync(file);
  }
  t.needsUpdate = true;
  t.anisotropy = LOW ? 1 : 4;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.userData.aspect = (t.image.height || 1) / (t.image.width || 1);
  loaded[name] = t;
  return t;
}
const blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); blank.needsUpdate = true;

// ---------- materials ----------
function cardMat(map, o = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map }, uTint: { value: new THREE.Color(o.tint ?? 0xffffff) }, uHaze: U.haze,
      uHazeAmt: { value: o.haze ?? 0 }, uOpacity: { value: o.opacity ?? 1 }, uCut: { value: o.cut ?? 0 },
      uBright: { value: o.bright ?? 1 }, uFadeTop: { value: o.fadeTop ?? 0 }, uFadeBot: { value: o.fadeBot ?? 0 },
      uTime: U.time, uSway: { value: reduce ? 0 : (o.sway ?? 0) }, uRustle: { value: o.rustle ?? 0 },
      uHang: { value: o.hang ?? 0 }, uPtr: U.ptr, uAspect: U.aspect, uBend: { value: o.bend ?? 0 },
    },
    vertexShader: S.cardVert, fragmentShader: S.cardFrag,
    transparent: !o.cut, depthWrite: !!o.cut, side: THREE.DoubleSide,
  });
  return m;
}
function toonMat(map, o = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map }, uSun: U.sun, uWarm: U.warm, uCool: U.cool, uInk: U.ink, uHaze: U.haze,
      uTint: { value: new THREE.Color(o.tint ?? 0xffffff) }, uHazeAmt: { value: o.haze ?? 0 },
      uHatch: { value: o.hatch ?? 0.5 }, uRim: { value: o.rim ?? 0.22 }, uGlow: { value: o.glow ?? 0 },
      uLenRep: { value: o.lenRep ?? 0 }, uUvT: { value: new THREE.Vector4(...(o.uvT ?? [1, 1, 0, 0])) }, uSwap: { value: o.swap ? 1 : 0 },
    },
    vertexShader: S.toonVert, fragmentShader: S.toonFrag, side: o.side ?? THREE.FrontSide,
  });
}
const lineMats = [];
function lineMat(scale = 1) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uWidth: { value: 0.016 * scale }, uInk: U.ink },
    vertexShader: S.lineVert, fragmentShader: S.lineFrag, side: THREE.BackSide,
    transparent: true, // drawn in the late pass, after glow sprites, so the line always wins
  });
  m.userData.base = 0.016 * scale; lineMats.push(m);
  return m;
}
function withInk(mesh, scale = 1) {
  const geo = mesh.geometry;
  const ink = mesh.isInstancedMesh ? new THREE.InstancedMesh(geo, lineMat(scale), mesh.count) : new THREE.Mesh(geo, lineMat(scale));
  if (mesh.isInstancedMesh) ink.instanceMatrix = mesh.instanceMatrix;
  ink.renderOrder = 10; ink.frustumCulled = mesh.frustumCulled;
  ink.raycast = () => {};
  mesh.add(ink);
  return mesh;
}

// ---------- helpers ----------
const V = new THREE.Vector3(), Q = new THREE.Quaternion(), E = new THREE.Euler(), M4 = new THREE.Matrix4(), SC = new THREE.Vector3();
function mat(x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
  return M4.compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), SC.set(sx, sy, sz)).clone();
}
function vh(dist) { return 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); }
const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const mulberry = (seed) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
const beatGroups = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
beatGroups.forEach((g) => root.add(g));
// far ridges sit on root with weak parallax, so their tops drifted into the night sky of beat 3: fade them out on the way up
const dayLayers = [];
// beat-2 cloud cards are unlit paintings: without this they stayed day-white/beige in the night beat
const nightCards = []; const MOON = new THREE.Color(0x6f7cb0);
const BEAT = 16; // world units between beats

// ========== SKY ==========
const skyMat = new THREE.ShaderMaterial({
  uniforms: { uMap: { value: blank }, uP: { value: 0 }, uAspect: U.aspect, uTexAspect: { value: 0.5625 }, uTime: U.time, uStars: { value: 0 }, uPtr: U.ptr, uSpark: { value: new THREE.Vector2(0, 0) }, uSparkT: { value: -1 } },
  vertexShader: S.skyVert, fragmentShader: S.skyFrag, depthWrite: false, depthTest: false,
});
const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), skyMat);
sky.frustumCulled = false; sky.renderOrder = -100;
scene.add(sky);

// ========== layout state that depends on the viewport ==========
const layoutFns = [];
const onLayout = (f) => layoutFns.push(f);

async function build() {
  const [tSky, tFar, tMid, tPine, tGround, tWood, tRoof, tEnd, tStone, tWin, tDoor, tMon, tPalm, tFern, tGrass, tBough] = await Promise.all([
    tex('sky', { scale: 1 }), tex('farpines'), tex('midpines'), tex('tallpine', { scale: 1 }), tex('ground'), tex('logwood', { repeat: true }), tex('roof', { repeat: true }),
    tex('logend', { scale: 1 }), tex('stone', { repeat: true, scale: 1 }), tex('window', { scale: 1 }), tex('door', { scale: 1 }),
    tex('monstera'), tex('fanpalm'), tex('fern'), tex('grass', { scale: 1 }), tex('bough'),
  ]);
  skyMat.uniforms.uMap.value = tSky; skyMat.uniforms.uTexAspect.value = 1 / tSky.userData.aspect;
  const glowT = await new THREE.TextureLoader().loadAsync('/tex/glow.png');
  const puffT = await new THREE.TextureLoader().loadAsync('/tex/puff.png');
  const shaftT = await new THREE.TextureLoader().loadAsync('/tex/shaft.png');
  const B0 = beatGroups[0];

  // ----- far painted layers (2D cards in depth) -----
  const card = (t, w, o) => { const g = new THREE.PlaneGeometry(w, w * t.userData.aspect); g.translate(0, (w * t.userData.aspect) / 2, 0); return new THREE.Mesh(g, cardMat(t, o)); };
  const far = card(tFar, 190, { haze: 0.28, fadeBot: 0.0 }); far.position.set(0, -5, -95); far.renderOrder = -20; root.add(far);
  const mist1 = new THREE.Mesh(new THREE.PlaneGeometry(240, 22), new THREE.ShaderMaterial({ uniforms: { uHaze: U.haze, uOpacity: { value: 0.75 }, uTime: U.time }, vertexShader: S.plainVert, fragmentShader: S.mistFrag, transparent: true, depthWrite: false }));
  mist1.position.set(0, 0, -80); mist1.renderOrder = -19; root.add(mist1);
  const mid = card(tMid, 120, { haze: 0.14 }); mid.position.set(6, -4.5, -55); mid.renderOrder = -18; root.add(mid);
  const mid2 = card(tMid, 110, { haze: 0.32 }); mid2.scale.x = -1; mid2.position.set(-14, -6, -68); mid2.renderOrder = -18.5; root.add(mid2);
  dayLayers.push(far, mid, mid2);
  const mist2 = mist1.clone(); mist2.material = mist1.material.clone(); mist2.material.uniforms.uHaze = U.haze; mist2.material.uniforms.uTime = U.time; mist2.material.uniforms.uOpacity.value = 0.5;
  mist2.scale.set(0.6, 0.55, 1); mist2.position.set(0, -2.5, -40); mist2.renderOrder = -17; root.add(mist2);

  // ground: a painted moss floor fading into the haze
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 120), new THREE.ShaderMaterial({ uniforms: { uHaze: U.haze, uA: { value: C(0x37562b) }, uB: { value: C(0x7b9a47) } }, vertexShader: S.groundVert, fragmentShader: S.groundFrag, depthWrite: false }));
  ground.renderOrder = -16; // drawn like a painted backdrop: never hides the foreground plants that stand below ground level at the frame edge
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.62, -50 + 5); B0.add(ground); // near edge reaches the camera plane, so no sky shows under it

  // tall pines: one instanced painted card, bigger than the house, some in front for depth
  const pineGeo = new THREE.PlaneGeometry(1, tPine.userData.aspect); pineGeo.translate(0, tPine.userData.aspect / 2, 0);
  const pines = [ // x, z, height, tint — row 1 hugs the house, rows 2-3 thicken into the haze
    [-1.6, -14, 17, 0.95], [3.4, -12, 15, 1.0], [-6.5, -11, 16, 0.92], [8.5, -16, 19, 0.9], [-11, -20, 20, 0.85], [12, -22, 21, 0.85], [0.8, -24, 20, 0.82], [-4.2, -27, 22, 0.8], [6.2, -30, 23, 0.8], [-16, -28, 22, 0.8], [17, -26, 22, 0.8],
    [-3.8, -9.5, 13, 1.0], [5.6, -9, 12.5, 1.0], [-8.8, -13, 17, 0.92], [10.5, -12.5, 16, 0.92], [1.4, -17.5, 18, 0.9], [-2.8, -19, 19, 0.88], [4.8, -20, 19, 0.88],
    [-13.5, -15, 18, 0.9], [14.5, -17, 19, 0.88], [-7.5, -22, 21, 0.85], [9.6, -25, 22, 0.84], [-19, -22, 21, 0.84], [20, -21, 21, 0.84],
    [-1.2, -31, 23, 0.8], [2.8, -34, 24, 0.78], [-9.5, -33, 24, 0.78], [12.5, -33, 24, 0.78], [-22, -32, 24, 0.78], [23, -30, 24, 0.78], [-5.5, -36, 25, 0.76], [7.8, -37, 25, 0.76],
  ].slice(0, LOW ? 24 : 32);
  const pineMesh = new THREE.InstancedMesh(pineGeo, cardMat(tPine, { cut: 0.5, sway: 0.08, haze: 0.0 }), pines.length);
  pines.forEach(([x, z, h0, k], i) => {
    // tops stay just under the balloon's eye line (y 15.5): taller pines poked up beside the balloon in beat 2
    // cap by distance: at beat 2 (scene 16 lower) every top must sit under the cloud line (screen y < -0.2), never beside the basket
    const h = Math.min(h0, 15.4 - 0.2 * (10 - z) - (i % 3) * 0.5); const s = h / tPine.userData.aspect;
    pineMesh.setMatrixAt(i, mat(x, -0.9, z, s, s, 1));
    const hz = THREE.MathUtils.clamp((-z - 9) / 24, 0, 1);
    pineMesh.setColorAt(i, new THREE.Color().setRGB(k, k, k).lerp(PAL[0].haze, 0.12 + hz * 0.72)); // aerial perspective: back rows melt into the morning haze
  });
  pineMesh.frustumCulled = false; B0.add(pineMesh);
  Object.entries({ far, mist1, mid, mid2, mist2, ground, pineMesh }).forEach(([k, m]) => (m.name = k));

  // light shafts behind the house (painted-style, warm, low, under the ink)
  const shaftMat = new THREE.MeshBasicMaterial({ map: shaftT, color: 0xffd8a0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const shafts = new THREE.Group();
  // 13 tall, centred at y 5: the old 26-tall shafts reached y 22 and showed as pink bars beside the balloon
  [[2.5, 2.2], [5.5, 3.2], [-0.5, 1.6], [8, 2.6]].forEach(([x, w], i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 13), shaftMat); m.position.set(x, 5, -10 - i); m.rotation.z = 0.42; m.renderOrder = 4; shafts.add(m); });
  B0.add(shafts);

  // ----- the log house: smooth logs with notched corners, painted bark, log ends, moss roof -----
  const house = new THREE.Group(); house.position.set(0.35, -0.62, -4); house.rotation.y = -0.52; B0.add(house);
  const R = 0.15, W = 3.8, D = 2.9, NL = 9;
  const logGeo = new THREE.CylinderGeometry(R, R, 1, 24, 1, true); logGeo.rotateZ(Math.PI / 2);
  const logs = []; const ends = [];
  for (let i = 0; i < NL; i++) {
    const y = R + i * R * 1.85;
    logs.push(mat(0, y, D / 2, W + 0.5, 1, 1), mat(0, y, -D / 2, W + 0.5, 1, 1));
    const y2 = y + R * 0.92;
    if (i < NL - 1 || true) logs.push(mat(-W / 2, y2, 0, D + 0.5, 1, 1, 0, Math.PI / 2, 0), mat(W / 2, y2, 0, D + 0.5, 1, 1, 0, Math.PI / 2, 0));
    for (const sx of [-1, 1]) ends.push(mat(sx * (W / 2 + 0.25), y, D / 2, R, R, 1, 0, Math.PI / 2 * sx, 0), mat(sx * (W / 2 + 0.25), y, -D / 2, R, R, 1, 0, Math.PI / 2 * sx, 0));
    for (const sz of [-1, 1]) ends.push(mat(-W / 2, y2, sz * (D / 2 + 0.25), R, R, 1, 0, sz > 0 ? 0 : Math.PI, 0), mat(W / 2, y2, sz * (D / 2 + 0.25), R, R, 1, 0, sz > 0 ? 0 : Math.PI, 0));
  }
  const wallTop = R + (NL - 1) * R * 1.85 + R * 0.92;
  // gables on the left and right: shorter logs stacked up to the ridge
  const ridgeH = 1.55;
  for (let i = 1; i <= 7; i++) {
    const y = wallTop + i * R * 1.85 - R * 0.9; const f = 1 - (y - wallTop) / ridgeH; if (f <= 0.05) break;
    const len = D * f;
    logs.push(mat(-W / 2, y, 0, len, 1, 1, 0, Math.PI / 2, 0), mat(W / 2, y, 0, len, 1, 1, 0, Math.PI / 2, 0));
  }
  const logMesh = new THREE.InstancedMesh(logGeo, toonMat(tWood, { swap: true, lenRep: 0.32, uvT: [1, 0.5, 0, 0], hatch: 0.5 }), logs.length);
  logs.forEach((m, i) => logMesh.setMatrixAt(i, m));
  withInk(logMesh, 0.8); house.add(logMesh);
  const endGeo = new THREE.CircleGeometry(1, 28);
  const endMesh = new THREE.InstancedMesh(endGeo, toonMat(tEnd, { hatch: 0.25, rim: 0.1 }), ends.length);
  ends.forEach((m, i) => endMesh.setMatrixAt(i, m)); house.add(endMesh);
  // the walls behind the logs (fills the gaps between round logs)
  const fill = new THREE.Mesh(new THREE.BoxGeometry(W, wallTop, D), toonMat(tWood, { tint: 0x6a5240, hatch: 0 }));
  fill.position.y = wallTop / 2; fill.scale.set(0.97, 1, 0.94); house.add(fill);
  const gableShape = new THREE.Shape(); gableShape.moveTo(-D / 2, 0); gableShape.lineTo(D / 2, 0); gableShape.lineTo(0, ridgeH); gableShape.closePath();
  const gGeo = new THREE.ExtrudeGeometry(gableShape, { depth: W * 0.96, bevelEnabled: false }); gGeo.translate(0, 0, -W * 0.48); gGeo.rotateY(Math.PI / 2);
  const gable = new THREE.Mesh(gGeo, toonMat(tWood, { tint: 0x6a5240, hatch: 0 })); gable.position.y = wallTop; house.add(gable);
  // roof: two thick shingle slabs with moss (painted), soft rounded edge via bevel
  const pitch = Math.atan2(ridgeH, D / 2); const slab = Math.hypot(D / 2, ridgeH) + 0.55;
  const roofGeo = new THREE.BoxGeometry(W + 1.0, 0.16, slab, 1, 1, 1);
  const roofMat = toonMat(tRoof, { uvT: [2.2, 1.5, 0, 0], hatch: 0.75, rim: 0.25, tint: 0xa89a86 }); // weathered shingles, not bright tan
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(roofGeo, roofMat);
    r.position.set(0, wallTop + ridgeH / 2 + 0.02, s * (D / 4 + 0.05));
    r.rotation.x = s * pitch; r.position.y += 0.02; r.translateZ(s * 0.18 * 0 ); withInk(r, 1.1); house.add(r);
  }
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, W + 1.0, 20).rotateZ(Math.PI / 2), toonMat(tWood, { swap: true, hatch: 0.3 }));
  ridge.position.y = wallTop + ridgeH + 0.1; withInk(ridge, 0.8); house.add(ridge);
  // stone chimney with smoke
  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.62, 2.3, 0.62), toonMat(tStone, { uvT: [1, 3, 0, 0], hatch: 0.5 }));
  chim.position.set(W / 2 - 0.85, wallTop + 1.1, -0.45); withInk(chim, 0.9); house.add(chim);
  const chimTop = new THREE.Vector3(W / 2 - 0.85, wallTop + 2.3, -0.45);
  // windows + door (painted, warm light painted in)
  const winMat = cardMat(tWin, { cut: 0.5, bright: 1.0 }); winMat.side = THREE.FrontSide;
  const winGeo = new THREE.PlaneGeometry(0.72, 0.9);
  const wins = new THREE.InstancedMesh(winGeo, winMat, 3);
  wins.setMatrixAt(0, mat(-1.05, 1.25, D / 2 + R + 0.01, 1, 1, 1));
  wins.setMatrixAt(1, mat(1.1, 1.25, D / 2 + R + 0.01, 1, 1, 1));
  wins.setMatrixAt(2, mat(W / 2 + R + 0.01, 1.2, 0.2, 0.9, 0.9, 1, 0, Math.PI / 2, 0));
  house.add(wins);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 1.4), cardMat(tDoor, { cut: 0.5 })); door.material.side = THREE.FrontSide;
  door.position.set(0.05, 0.86, D / 2 + R + 0.012); house.add(door);
  // porch deck, two posts and a small lantern
  const deck = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 0.14, 0.9), toonMat(tWood, { uvT: [3, 0.6, 0, 0], tint: 0xcdb6a0, hatch: 0.4 }));
  deck.position.set(0, 0.07, D / 2 + 0.55); withInk(deck, 0.8); house.add(deck);
  const postGeo = new THREE.CylinderGeometry(0.07, 0.08, 2.1, 16);
  const posts = new THREE.InstancedMesh(postGeo, toonMat(tWood, { swap: true, hatch: 0.4 }), 2);
  posts.setMatrixAt(0, mat(-W / 2 + 0.25, 1.1, D / 2 + 0.95, 1, 1, 1)); posts.setMatrixAt(1, mat(W / 2 - 0.25, 1.1, D / 2 + 0.95, 1, 1, 1));
  withInk(posts, 0.7); house.add(posts);
  const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 0.1, 1.15), roofMat); porchRoof.position.set(0, 2.15, D / 2 + 0.62); porchRoof.rotation.x = 0.28; withInk(porchRoof, 0.9); house.add(porchRoof);
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.2, 14), toonMat(blank, { tint: 0xffc070, glow: 0.9, hatch: 0 }));
  lantern.position.set(0.62, 1.55, D / 2 + 0.95); withInk(lantern, 0.6); house.add(lantern);

  // warm glows (under ink): windows, lantern
  const glowMat = (color, op) => new THREE.SpriteMaterial({ map: glowT, color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });
  const glows = [];
  for (const [x, y, z, s, op] of [[-1.05, 1.25, D / 2 + 0.3, 1.5, 0.32], [1.1, 1.25, D / 2 + 0.3, 1.5, 0.32], [0.62, 1.55, D / 2 + 1.05, 0.9, 0.55]]) {
    const sp = new THREE.Sprite(glowMat(0xffb060, op)); sp.position.set(x, y, z); sp.scale.setScalar(s); sp.renderOrder = 5; sp.userData.op = op; house.add(sp); glows.push(sp);
  }

  // smoke: one Points draw, puffs rise, grow and fade
  const NS = LOW ? 12 : 18;
  const smokeGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array(NS * 3), sSize = new Float32Array(NS), sA = new Float32Array(NS); const sLife = new Float32Array(NS).map((_, i) => i / NS);
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3)); smokeGeo.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1)); smokeGeo.setAttribute('aAlpha', new THREE.BufferAttribute(sA, 1));
  const smokeMat = new THREE.ShaderMaterial({ uniforms: { uMap: { value: puffT }, uColor: { value: C(0xc9bfbd) }, uPx: { value: 400 } }, vertexShader: S.ptsVert, fragmentShader: S.smokeFrag, transparent: true, depthWrite: false });
  const smoke = new THREE.Points(smokeGeo, smokeMat); smoke.frustumCulled = false; smoke.renderOrder = 6; house.add(smoke);
  let smokeBoost = 0;

  // fireflies + dust motes (glow sprites, under the ink)
  const NF = LOW ? 26 : 44;
  const ffGeo = new THREE.BufferGeometry(); const fP = new Float32Array(NF * 3), fS = new Float32Array(NF), fA = new Float32Array(NF);
  const fHome = [], fVel = [];
  for (let i = 0; i < NF; i++) { fHome.push(new THREE.Vector3(-5 + rnd() * 10, -0.4 + rnd() * 2.6, -6 + rnd() * 7)); fVel.push(new THREE.Vector3()); fS[i] = 0.25 + rnd() * 0.3; }
  ffGeo.setAttribute('position', new THREE.BufferAttribute(fP, 3)); ffGeo.setAttribute('aSize', new THREE.BufferAttribute(fS, 1)); ffGeo.setAttribute('aAlpha', new THREE.BufferAttribute(fA, 1));
  const ffMat = new THREE.ShaderMaterial({ uniforms: { uMap: { value: glowT }, uColor: { value: C(0xffd890) }, uOpacity: { value: 1 }, uPx: { value: 400 } }, vertexShader: S.ptsVert, fragmentShader: S.ptsFrag, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor });
  const ff = new THREE.Points(ffGeo, ffMat); ff.frustumCulled = false; ff.renderOrder = 5; B0.add(ff);
  const fPos = fHome.map((h) => h.clone());

  // birds: tiny inked V shapes crossing the sky
  const NB = 5; const bGeo = new THREE.BufferGeometry(); const bP = new Float32Array(NB * 4 * 3);
  bGeo.setAttribute('position', new THREE.BufferAttribute(bP, 3));
  const birds = new THREE.LineSegments(bGeo, new THREE.LineBasicMaterial({ color: 0x3b3236, transparent: true, opacity: 0.8 })); birds.frustumCulled = false; root.add(birds);
  const bSeed = [...Array(NB)].map((_, i) => ({ x: -30 + i * 3.5 + rnd() * 2, y: 9 + rnd() * 5 + (i % 2) * 1.2, z: -34 - rnd() * 6, sp: 1.2 + rnd() * 0.5, ph: rnd() * 6 }));

  // ----- foreground framing (beat 0): real-geometry hero leaves + alpha-tested painted cards -----
  const fgGroup = new THREE.Group(); B0.add(fgGroup);
  const leafGeo = new THREE.PlaneGeometry(1, 1, 10, 10); leafGeo.translate(0, 0.5, 0);
  const mk = (t, n, o) => { const g = leafGeo.clone(); g.scale(1, t.userData.aspect, 1); const m = new THREE.InstancedMesh(g, cardMat(t, { cut: 0.5, ...o }), n); m.frustumCulled = false; fgGroup.add(m); return m; };
  const mon = mk(tMon, 4, { sway: 0.05, rustle: 0.07, bend: 0.35 });
  const palm = mk(tPalm, 3, { sway: 0.06, rustle: 0.08, bend: 0.15 });
  const fern = mk(tFern, LOW ? 7 : 9, { sway: 0.05, rustle: 0.06 });
  const grass = mk(tGrass, LOW ? 44 : 64, { sway: 0.05, rustle: 0.05 });
  const bough = mk(tBough, 2, { sway: 0.07, rustle: 0.06, hang: 1 });
  const bigPine = mk(tPine, 2, { sway: 0.015 }); // was tint 0x6f7468 x 0.8 = 35% light: read as a flat black blob
  const floor = card(tGround, 1, { cut: 0.5, tint: 0xb9b2a0 }); floor.geometry = leafGeo.clone(); floor.geometry.scale(1, tGround.userData.aspect, 1);
  const floorMesh = new THREE.InstancedMesh(floor.geometry, floor.material, 3); floorMesh.frustumCulled = false; // dirt cards had hard painted edges; grass + moss ground replace them
  // plane values (see notes/composition.md): near frame ~0.55, foreground plants ~0.7, subject plane full light
  const PLANE = { mon: 0.74, palm: 0.7, fern: 0.76, bough: 0.62, bigPine: 1 };
  const tint = (m, i, k, h = 0) => { const v = k * (PLANE[m.name] ?? 1); m.setColorAt(i, new THREE.Color().setRGB(v, v * 1.0, v * 0.98).lerp(PAL[0].haze, h)); };
  Object.entries({ mon, palm, fern, grass, bough, bigPine, floorMesh }).forEach(([k, m]) => (m.name = k));
  onLayout(() => {
    // positions are relative to what the camera sees at each depth, so phones keep the frame
    const at = (z) => { const d = 10 - z; const H = vh(d); return { H, Wd: H * camera.aspect, d }; };
    let a = at(5.2); const bot = -a.H / 2;
    const narrow = camera.aspect < 0.8;
    const sx = (f) => f * a.Wd / 2;
    mon.setMatrixAt(0, mat(sx(-0.92), bot - 0.25, 5.2, 1.5, 1.5, 1, -0.1, 0.4, 0.35)); tint(mon, 0, 0.82);
    mon.setMatrixAt(1, mat(sx(-0.55), bot - 0.45, 5.4, 1.2, 1.2, 1, -0.2, -0.3, -0.12)); tint(mon, 1, 0.92);
    mon.setMatrixAt(2, mat(sx(0.95), bot - 0.3, 5.0, 1.3, 1.3, 1, -0.1, -0.5, -0.45)); tint(mon, 2, 0.78);
    mon.setMatrixAt(3, mat(sx(-0.2), bot - 0.75, 5.8, 0.9, 0.9, 1, -0.3, 0.2, 0.1)); tint(mon, 3, 0.7);
    palm.setMatrixAt(0, mat(sx(0.62), bot - 0.25, 4.6, 1.9, 1.9, 1, 0, -0.2, -0.1)); tint(palm, 0, 0.86);
    palm.setMatrixAt(1, mat(sx(-0.98), bot + 0.0, 3.2, 2.2, 2.2, 1, 0, 0.3, 0.2)); tint(palm, 1, 0.92, 0.08);
    palm.setMatrixAt(2, mat(sx(1.05), bot + 0.1, 2.6, 2.4, 2.4, 1, 0, -0.3, -0.15)); tint(palm, 2, 0.95, 0.12);
    for (let i = 0; i < fern.count; i++) { const f = -1 + (2 * i) / (fern.count - 1); const z = 3.4 - (i % 3) * 0.7; const b = at(z); fern.setMatrixAt(i, mat(f * b.Wd * 0.48, -b.H / 2 - 0.15 + (i % 2) * 0.1, z, 1.5 + (i % 3) * 0.3, 1.4, 1, 0, 0, f * -0.15)); tint(fern, i, 0.95 - (i % 3) * 0.06, 0.05 * (i % 3)); }
    // grass: half frames the bottom edge, half grows around the house and the path (fixed world spots, same on every screen)
    const gr = mulberry(77); const nFront = Math.round(grass.count * 0.34), nMead = Math.round(grass.count * 0.36);
    for (let i = 0; i < grass.count; i++) {
      if (i < nFront) { const f = -1 + (2 * i) / (nFront - 1) + (gr() - 0.5) * 0.1; const z = 4.4 - (i % 4) * 0.9; const b = at(z); grass.setMatrixAt(i, mat(f * b.Wd * 0.52, -b.H / 2 - 0.08, z, 1.0 + gr() * 0.35, 0.95 + gr() * 0.35, 1, 0, 0, 0)); tint(grass, i, 0.7 + (i % 4) * 0.06, 0.03 * (i % 4)); }
      else if (i < nFront + nMead) { // meadow: tufts spread over the open lawn, spread to the visible width at each depth
        // the camera sits low (y 0, ground -0.62), so the open lawn on screen is the ground between z 1 and 6.5
        const c = (i - nFront) % 7; const cz = 1.2 + ((c * 0.618) % 1) * 5.0; const cxf = ((c * 0.381 + 0.13) % 1) * 2 - 1;
        const z = cz + (gr() - 0.5) * 0.9; const b = at(z); const x = cxf * b.Wd * 0.5 + (gr() - 0.5) * b.Wd * 0.16; const sc = 0.22 + gr() * 0.36;
        grass.setMatrixAt(i, mat(x, -0.66, z, sc * 1.25, sc, 1, 0, 0, 0)); tint(grass, i, 0.97, 0.04 + (6.5 - z) * 0.02); }
      else { const k = i - nFront - nMead, n = grass.count - nFront - nMead; const front = k % 3 === 0; const x = front ? -1.6 + gr() * 4.2 : -7 + (14 * k) / (n - 1) + (gr() - 0.5) * 1.2; const z = front ? -2.1 - gr() * 0.9 : -1.5 - gr() * 6.5; const sc = 0.75 + gr() * 0.45; grass.setMatrixAt(i, mat(x, -0.66, z, sc * 1.25, sc, 1, 0, 0, 0)); tint(grass, i, 0.94, 0.1 + (-z / 8) * 0.18); }
    }
    a = at(6.5);
    // hanging boughs only tuck into the top corners (they were covering the house)
    // boughs scale with screen width so on a phone they stay in the corners and never cover the house
    const bk = THREE.MathUtils.clamp(camera.aspect / 1.6, 0.42, 1);
    bough.setMatrixAt(0, mat(-a.Wd * 0.52, a.H / 2 + 0.02, 6.5, 0.8 * bk, -0.8 * bk, 1, 0, 0, 0.35)); tint(bough, 0, 0.9);
    bough.setMatrixAt(1, mat(a.Wd * 0.56, a.H / 2 + 0.05, 6.4, -0.62 * bk, -0.62 * bk, 1, 0, 0, -0.3)); tint(bough, 1, 0.86);
    // framing trunks: on a narrow screen they shrink a little and step further out, so only trunk and outer
    // branches frame the edges (their low limbs were hanging across the house on phone)
    const p = at(3.5); const nk = THREE.MathUtils.clamp((camera.aspect - 0.45) / 1.15, 0, 1); const ps = (18 / tPine.userData.aspect) * (0.72 + 0.28 * nk);
    bigPine.setMatrixAt(0, mat(-p.Wd / 2 - (0.7 + 1.3 * (1 - nk)), -p.H / 2 - 1, 3.5, ps, ps, 1)); tint(bigPine, 0, 0.66);
    bigPine.setMatrixAt(1, mat(p.Wd / 2 + (1.35 + 1.0 * (1 - nk)), -p.H / 2 - 1.2, 3.0, ps * 1.05, ps * 1.05, 1)); tint(bigPine, 1, 0.62);
    const g1 = at(-1.2), g2 = at(1.6);
    floorMesh.setMatrixAt(0, mat(-2.2, -0.9, -1.2, 9, 3, 1)); floorMesh.setMatrixAt(1, mat(3.8, -1.0, -1.6, 8, 2.6, 1)); floorMesh.setMatrixAt(2, mat(0, -g2.H / 2 + 0.25, 1.6, Math.max(10, g2.Wd * 1.3), 4, 1));
    tint(floorMesh, 0, 0.9, 0.1); tint(floorMesh, 1, 0.9, 0.12); tint(floorMesh, 2, 0.78);
    for (const m of [mon, palm, fern, grass, bough, bigPine, floorMesh]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  });

  // ----- hit proxies -----
  const houseHit = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, wallTop + ridgeH + 1.2, D + 1.8), new THREE.MeshBasicMaterial()); houseHit.visible = false; houseHit.position.y = (wallTop + ridgeH) / 2; house.add(houseHit);

  // ===== BEAT 0 per-frame =====
  const ffColor = ffMat.uniforms.uColor.value;
  let winGlow = 0;
  const scat = new THREE.Vector3(); let scatT = -9;
  B0.userData.update = (t, dt) => {
    // smoke
    const rate = 0.12 + smokeBoost * 0.6; smokeBoost = Math.max(0, smokeBoost - dt * 0.6);
    for (let i = 0; i < NS; i++) {
      sLife[i] += dt * rate; if (sLife[i] > 1) sLife[i] -= 1;
      const l = sLife[i];
      sPos[i * 3] = chimTop.x + l * 1.6 + Math.sin(t * 0.7 + i) * 0.15 * l;
      sPos[i * 3 + 1] = chimTop.y + 0.1 + l * 3.4;
      sPos[i * 3 + 2] = chimTop.z - l * 0.6;
      sSize[i] = 0.5 + l * 2.6;
      sA[i] = Math.sin(Math.PI * Math.min(1, l * 1.15)) * 0.42;
    }
    smokeGeo.attributes.position.needsUpdate = true; smokeGeo.attributes.aSize.needsUpdate = true; smokeGeo.attributes.aAlpha.needsUpdate = true;
    // fireflies wander; a tap scatters them, the pointer nudges them
    const sAge = t - scatT;
    for (let i = 0; i < NF; i++) {
      const h = fHome[i], p = fPos[i], v = fVel[i];
      const tx = h.x + Math.sin(t * 0.3 + i * 1.7) * 0.6, ty = h.y + Math.sin(t * 0.5 + i) * 0.35, tz = h.z + Math.cos(t * 0.27 + i) * 0.5;
      v.x += (tx - p.x) * dt * 0.8; v.y += (ty - p.y) * dt * 0.8; v.z += (tz - p.z) * dt * 0.8;
      if (sAge < 0.25) { V.copy(p).sub(scat); const d = Math.max(0.4, V.length()); if (d < 4) v.addScaledVector(V.normalize(), dt * 30 / d); }
      v.multiplyScalar(1 - Math.min(1, dt * 1.6));
      p.addScaledVector(v, dt);
      fP[i * 3] = p.x; fP[i * 3 + 1] = p.y; fP[i * 3 + 2] = p.z;
      fA[i] = Math.max(0, Math.sin(t * (0.8 + (i % 5) * 0.23) + i * 2.1)) ** 2 * (0.95 + Math.min(1, Math.max(0, 1 - sAge)) * 0.6);
    }
    ffGeo.attributes.position.needsUpdate = true; ffGeo.attributes.aAlpha.needsUpdate = true;
    // windows breathe, and glow warmer when touched
    winGlow = Math.max(0, winGlow - dt * 0.35);
    const flick = 0.96 + 0.04 * Math.sin(t * 7.3) * Math.sin(t * 3.1);
    winMat.uniforms.uBright.value = (1 + winGlow * 0.45) * flick;
    glows.forEach((g, i) => { g.material.opacity = g.userData.op * flick * (1 + winGlow * 1.3); g.scale.setScalar((i === 2 ? 0.9 : 1.5) * (1 + winGlow * 0.3)); });
    // birds
    for (let i = 0; i < NB; i++) {
      const b = bSeed[i]; const x = ((b.x + t * b.sp + 40) % 80) - 40; const y = b.y + Math.sin(t * 0.4 + b.ph) * 0.6;
      const flap = Math.sin(t * 7 + b.ph) * 0.18; const s = 0.42;
      const o = i * 12;
      bP.set([x - s, y + flap, b.z, x, y, b.z, x, y, b.z, x + s, y + flap, b.z], o);
    }
    bGeo.attributes.position.needsUpdate = true;
  };
  B0.userData.hits = [
    { obj: houseHit, hover: () => { winGlow = Math.max(winGlow, 0.5); }, tap: () => { winGlow = 1.4; smokeBoost = 2.2; Sound.play('crackle', 0.55); setTimeout(() => Sound.play('creak', 0.32), 260); } },
  ];
  B0.userData.tapMiss = (pt) => { // tap on the forest: fireflies scatter, leaves rustle
    scat.copy(pt ?? V.set(0, 0.6, -2)); scatT = U.time.value; rustleKick = 1; Sound.play('sparkle', 0.32); if (pt && pt.z > 1) Sound.play('wings', 0.28);
  };
  B0.userData.fireflyPt = (p) => { scat.copy(p); scatT = U.time.value - 0.15; };
  B0.userData.mats = { fg: [mon, palm, fern, grass, bough].map((m) => m.material) };
  return { glowT, puffT };
}

let rustleKick = 0;

// ========== BEAT 1: the red balloon ==========
async function buildBalloon(glowT) {
  const [tBal, tWick, tCl, tSea] = await Promise.all([tex('balloon'), tex('wicker', { repeat: true, scale: 1 }), tex('clouds1'), tex('cloudsea')]);
  const B1 = beatGroups[1];
  const card = (t, w, o) => { const g = new THREE.PlaneGeometry(w, w * t.userData.aspect); g.translate(0, (w * t.userData.aspect) / 2, 0); return new THREE.Mesh(g, cardMat(t, o)); };
  // clouds behind (painted, hazed by depth)
  const back1 = card(tCl, 120, { haze: 0.25, tint: 0xfff6ee }); back1.position.set(-14, BEAT - 22, -70); back1.renderOrder = -16; root.add(back1);
  const back2 = card(tCl, 90, { haze: 0.12, tint: 0xfff4ee }); back2.position.set(22, BEAT - 13, -48); back2.rotation.y = 0; back2.scale.x = -1; back2.renderOrder = -15; root.add(back2);
  const sea = card(tSea, 150, { haze: 0.1 }); sea.position.set(0, BEAT * 2 - 40, -60); sea.renderOrder = -14; root.add(sea);
  const sea2 = card(tCl, 80, { haze: 0.2, tint: 0xd6d9ee }); sea2.position.set(-20, BEAT * 2 - 27, -38); sea2.renderOrder = -13; root.add(sea2);
  for (const m of [back1, back2, sea, sea2]) nightCards.push([m, m.material.uniforms.uTint.value.clone(), 0.75]);

  // balloon: smooth lathe envelope with 12 gores, burner, ropes, wicker basket
  const bal = new THREE.Group(); bal.position.set(0.2, BEAT + 0.3, -4); B1.add(bal);
  let balY = BEAT + 0.3; onLayout(() => { const n = camera.aspect < 0.8; balY = BEAT + (n ? 0.75 : 0.45); bal.position.x = n ? 0.15 : 1.1; });
  const prof = [];
  const N = 56;
  for (let i = 0; i <= N; i++) {
    const t = i / N; // 0 = mouth (bottom), 1 = crown
    const y = -1.55 + t * 4.0;
    // teardrop: narrow mouth, full shoulder, round crown
    let r;
    if (t < 0.55) { const k = t / 0.55; r = 0.36 + (1.62 - 0.36) * Math.sin(k * Math.PI / 2) ** 1.25; }
    else { const k = (t - 0.55) / 0.45; r = 1.62 * Math.sqrt(Math.max(0, 1 - k * k)); }
    prof.push(new THREE.Vector2(Math.max(r, 0.0001), y));
  }
  const envGeo = new THREE.LatheGeometry(prof, 96);
  // pillow each gore a little between the load tapes, then smooth the normals
  const p = envGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i); const a = Math.atan2(z, x); const k = 0.972 + 0.028 * Math.abs(Math.sin(a * 6)) ** 0.6;
    p.setX(i, x * k); p.setZ(i, z * k);
  }
  envGeo.computeVertexNormals();
  const env = new THREE.Mesh(envGeo, toonMat(tBal, { hatch: 0.55, rim: 0.3, side: THREE.DoubleSide })); withInk(env, 1.2); bal.add(env);
  // basket
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.52, 28, 1, false), toonMat(tWick, { uvT: [5, 1.2, 0, 0], hatch: 0.5 }));
  basket.position.y = -2.85; withInk(basket, 0.9); bal.add(basket);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.04, 10, 40).rotateX(Math.PI / 2), toonMat(tWick, { tint: 0x9a6a44, hatch: 0.3 })); rim.position.y = -2.58; withInk(rim, 0.6); bal.add(rim);
  // burner frame + ropes (fine ink lines)
  const pts = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; pts.push(Math.cos(a) * 0.36, -1.55, Math.sin(a) * 0.36, Math.cos(a) * 0.4, -2.58, Math.sin(a) * 0.4); }
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; pts.push(Math.cos(a) * 0.4, -2.58, Math.sin(a) * 0.4, 0, -2.0, 0); }
  const ropeGeo = new THREE.BufferGeometry(); ropeGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const ropes = new THREE.LineSegments(ropeGeo, new THREE.LineBasicMaterial({ color: 0x3a2a26 })); ropes.renderOrder = 10; bal.add(ropes);
  const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.16, 16), toonMat(blank, { tint: 0x8a8a90, hatch: 0.3 })); burner.position.y = -2.0; withInk(burner, 0.6); bal.add(burner);
  // flame: two glow sprites (under the ink)
  const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, color: 0xffa040, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  fl.position.y = -1.78; fl.scale.set(0.35, 0.6, 1); fl.renderOrder = 5; bal.add(fl);
  const flHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, color: 0xff8a40, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
  flHalo.position.y = -1.6; flHalo.scale.setScalar(1.6); flHalo.renderOrder = 5; bal.add(flHalo);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(3.4, 5.2, 3.4), new THREE.MeshBasicMaterial()); hit.visible = false; hit.position.y = 0.2; bal.add(hit);

  // clouds in front (framing). Late pass, after the ink, so lines never show through.
  const fg = [];
  const fgDefs = [[-4.2, BEAT - 3.2, 3.2, 11, 0xfff1ea], [4.6, BEAT - 3.6, 3.6, 12, 0xf6e6ec], [-5.6, BEAT * 1.5, 3.4, 7, 0xffffff], [-5, BEAT + 4.6, 1.2, 9, 0xf4e8ee], [5.8, BEAT * 1.55 - 1, 3.6, 7, 0xf8f0f2]];
  for (const [x, y, z, w, tnt] of fgDefs) { const m = card(tCl, w, { tint: tnt, opacity: 0.95 }); m.position.set(x, y, z); m.renderOrder = 20; m.userData.x = x; root.add(m); fg.push(m); nightCards.push([m, m.material.uniforms.uTint.value.clone(), 0.7]); }

  let lift = 0, liftV = 0, flare = 0;
  B1.userData.update = (t, dt) => {
    // bob, slow sway, lift spring
    liftV += (-lift * 6 - liftV * 2.6) * dt; lift += liftV * dt;
    bal.position.y = balY + Math.sin(t * 0.6) * 0.12 + lift;
    bal.rotation.z = Math.sin(t * 0.45) * 0.025; bal.rotation.y = t * 0.05;
    flare = Math.max(0, flare - dt * 1.4);
    const fk = 0.85 + 0.15 * Math.sin(t * 23) * Math.sin(t * 9.0);
    fl.material.opacity = (0.55 + flare * 0.45) * fk; fl.scale.set(0.3 + flare * 0.25, (0.5 + flare * 0.9) * fk, 1); fl.position.y = -1.8 + flare * 0.18;
    flHalo.material.opacity = 0.18 + flare * 0.32; flHalo.scale.setScalar(1.3 + flare * 1.6);
    env.material.uniforms.uGlow.value = flare * 0.12;
    fg.forEach((m, i) => { m.position.x = m.userData.x + Math.sin(t * 0.05 + i * 2) * 0.6; });
  };
  B1.userData.hits = [{ obj: hit, hover: () => { flare = Math.max(flare, 0.25); }, tap: () => { flare = 1.2; liftV += 1.6; Sound.play('burner', 0.5); } }];
}

// ========== BEAT 2: the letter above the clouds ==========
async function buildLetter() {
  const t = await tex(LOW ? 'letter-low' : 'letter', { scale: 1 });
  const B2 = beatGroups[2];
  const geo = new THREE.PlaneGeometry(2.4, 2.4 * t.userData.aspect, LOW ? 28 : 44, LOW ? 36 : 56);
  const m = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: t }, uTime: U.time, uFlut: { value: reduce ? 0 : 1 }, uSun: { value: new THREE.Vector3(-0.35, 0.55, 0.75).normalize() }, uWarm: U.warm, uCool: U.cool, uHaze: U.haze, uInk: U.ink, uHazeAmt: { value: 0 } },
    vertexShader: S.letterVert, fragmentShader: S.letterFrag, side: THREE.DoubleSide,
  });
  const letter = new THREE.Mesh(geo, m);
  const holder = new THREE.Group(); holder.position.set(0, BEAT * 2 + 1.25, -2); holder.add(letter); B2.add(holder);
  let letY = BEAT * 2 + 1.25; onLayout(() => { const n = camera.aspect < 0.8; letY = BEAT * 2 + (n ? 1.55 : 1.3); });
  letter.rotation.set(-0.12, 0.18, 0.06);
  const hit = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.4), new THREE.MeshBasicMaterial()); hit.visible = false; holder.add(hit);
  const tilt = new THREE.Vector2(), tiltV = new THREE.Vector2(), tiltT = new THREE.Vector2(); let flut = 0, hov = 0;
  B2.userData.update = (tt, dt) => {
    hov = Math.max(0, hov - dt * 2);
    tiltV.x += ((tiltT.x * hov) - tilt.x) * dt * 9 - tiltV.x * dt * 4; tiltV.y += ((tiltT.y * hov) - tilt.y) * dt * 9 - tiltV.y * dt * 4;
    tilt.addScaledVector(tiltV, dt);
    flut = Math.max(0, flut - dt * 0.5);
    m.uniforms.uFlut.value = reduce ? 0 : 1 + flut * 3;
    holder.position.y = letY + Math.sin(tt * 0.5) * 0.1;
    letter.rotation.set(-0.12 - tilt.y * 0.35 + Math.sin(tt * 0.4) * 0.03, 0.18 + tilt.x * 0.4 + Math.sin(tt * 0.33) * 0.05, 0.06 + Math.sin(tt * 0.3) * 0.02 + flut * 0.04 * Math.sin(tt * 6));
  };
  B2.userData.hits = [{ obj: hit, hover: (pt) => { hov = 1; const l = holder.worldToLocal(pt.clone()); tiltT.set(l.x / 1.2, l.y / 1.6); }, tap: () => { flut = 1; tiltV.y += 1.5; Sound.play('paper', 0.55); } }];
  B2.userData.tapMiss = (pt, ndc) => { skyMat.uniforms.uSpark.value.copy(ndc); skyMat.uniforms.uSparkT.value = 0; Sound.play('star', 0.35); };
}

// ========== resize ==========
function resize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h;
  // keep a wide-lens feel on desktop, open the view up on tall phones so the subjects fit
  camera.fov = camera.aspect < 0.62 ? 56 : camera.aspect < 1 ? 48 : 40;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  U.aspect.value = camera.aspect;
  const pxPerUnitAt14 = (h * DPR) / vh(14);
  // ink width: about 1.4 device px on the subjects, whatever the screen
  for (const m of lineMats) m.uniforms.uWidth.value = m.userData.base * Math.max(0.7, Math.min(1.6, 90 / pxPerUnitAt14));
  const px = (h * DPR) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  scene.traverse((o) => { if (o.material?.uniforms?.uPx) o.material.uniforms.uPx.value = px; });
  layoutFns.forEach((f) => f());
  splitLines();
}

// ========== text (Motion): eyebrow, title words, body lines ==========
const beats = [...document.querySelectorAll('.beat')];
function splitWords(el) {
  const words = el.textContent.trim().split(/\s+/);
  el.innerHTML = words.map((w) => `<span class="slot__line" style="display:inline-block"><span class="slot__in">${w}</span></span>`).join(' ');
}
function splitLines() {
  for (const el of document.querySelectorAll('[data-lines]')) {
    const text = el.dataset.text || (el.dataset.text = el.textContent.trim());
    el.innerHTML = text.split(/\s+/).map((w) => `<span class="w">${w}</span>`).join(' ');
    const lines = []; let top = null;
    for (const s of el.querySelectorAll('.w')) { const t = s.offsetTop; if (t !== top) { lines.push([]); top = t; } lines[lines.length - 1].push(s.textContent); }
    const shown = el.closest('.beat').classList.contains('in');
    el.innerHTML = lines.map((l) => `<span class="slot__line"><span class="slot__in"${shown ? ' style="transform:none"' : ''}>${l.join(' ')}</span></span>`).join('');
  }
}
document.querySelectorAll('[data-split]').forEach(splitWords);
const EASE = [0.22, 1, 0.36, 1];
function showBeat(b) {
  if (b.classList.contains('in')) return; b.classList.add('in');
  const eb = b.querySelectorAll('.slot__eyebrow .slot__in'), tw = b.querySelectorAll('.slot__title .slot__in'), bl = b.querySelectorAll('.slot__body .slot__in');
  if (reduce) { [...eb, ...tw, ...bl].forEach((e) => (e.style.transform = 'none')); return; }
  animate(eb, { y: ['110%', '0%'] }, { duration: 0.9, ease: EASE });
  tw.forEach((w, i) => animate(w, { y: ['110%', '0%'] }, { duration: 1.1, delay: 0.12 + i * 0.08, ease: EASE }));
  bl.forEach((l, i) => animate(l, { y: ['110%', '0%'] }, { duration: 1.0, delay: 0.42 + i * 0.09, ease: EASE }));
}
function hideBeat(b) {
  if (!b.classList.contains('in')) return; b.classList.remove('in');
  if (reduce) return;
  // explicit from-keyframe: re-split lines carry inline transform:none, and Motion could not read a start from it,
  // so the first beat's body stayed on screen under the next beat's text
  b.querySelectorAll('.slot__in').forEach((e) => animate(e, { y: ['0%', '110%'] }, { duration: 0.45, ease: [0.4, 0, 1, 1] }));
}

// ========== Lenis: one RAF for scroll + scene ==========
const lenis = new Lenis({ autoRaf: false, lerp: reduce ? 1 : 0.09, smoothWheel: !reduce, syncTouch: false, anchors: false });

// ========== pointer: camera parallax, hover, taps ==========
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2(9, 9);
const ptrS = new THREE.Vector2(), ptrT = new THREE.Vector2();
let dragging = false, lastHover = 0;
canvas.style.touchAction = 'pan-y';
function setNdc(e) { ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); }
addEventListener('pointermove', (e) => {
  setNdc(e); U.ptr.value.copy(ndc);
  if (e.pointerType === 'mouse' || dragging) ptrT.set(ndc.x, ndc.y);
}, { passive: true });
addEventListener('pointerdown', (e) => { if (e.target.closest('a,button')) return; setNdc(e); U.ptr.value.copy(ndc); dragging = true; ptrT.set(ndc.x, ndc.y); tap(); }, { passive: true });
addEventListener('pointerup', () => { dragging = false; if (coarse) ptrT.set(0, 0); }, { passive: true });
addEventListener('pointercancel', () => { dragging = false; if (coarse) ptrT.set(0, 0); }, { passive: true });
document.addEventListener('pointerleave', () => { ptrT.set(0, 0); U.ptr.value.set(9, 9); });
function activeBeat() { return Math.round(THREE.MathUtils.clamp(P, 0, 2)); }
function hitTest() {
  ray.setFromCamera(ndc, camera);
  const g = beatGroups[activeBeat()]; const hits = g.userData.hits || [];
  for (const h of hits) { const r = ray.intersectObject(h.obj, false); if (r.length) return { h, pt: r[0].point }; }
  return null;
}
function tap() {
  if (inFooter()) return;
  const r = hitTest(); const g = beatGroups[activeBeat()];
  if (r) r.h.tap(r.pt);
  else if (g.userData.tapMiss) {
    ray.setFromCamera(ndc, camera);
    const pt = ray.ray.at(10 - (-2), new THREE.Vector3());
    g.userData.tapMiss(beatGroups[0].worldToLocal(pt), ndc.clone());
  }
}
function inFooter() { return scrollY > document.querySelector('.sheet').offsetHeight - innerHeight * 0.6; }

// ========== loop ==========
let P = 0, Psm = 0, last = performance.now(), running = true, frames = 0, slowFrames = 0, built = false;
const stage = $('#stage');
const col = new THREE.Color();
function lerpPal(key, p) {
  const i = Math.min(1, Math.floor(p)); const f = THREE.MathUtils.smoothstep(p - i, 0, 1);
  return col.copy(PAL[i][key]).lerp(PAL[i + 1][key], f);
}
function frame(now) {
  requestAnimationFrame(frame);
  lenis.raf(now);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!built || !running || document.hidden) return;
  const H = innerHeight;
  const y = lenis.animatedScroll ?? scrollY;
  P = THREE.MathUtils.clamp(y / H, 0, 2.25);
  Psm = P; // Lenis already eases the value; a second smoothing here would make scene and page drift
  const p = Math.min(2, Psm);
  if (!reduce) U.time.value += dt;
  // the scene moves, the camera stays: scroll lifts everything by one beat per screen
  root.position.y = -p * BEAT - (Psm - p) * 4;
  // gentle camera parallax from mouse or touch drag, sprung
  ptrS.lerp(reduce ? ptrS.set(0, 0) : ptrT, Math.min(1, dt * 2.4));
  camera.position.set(ptrS.x * 0.55, ptrS.y * 0.32, 10);
  camera.lookAt(ptrS.x * 0.1, ptrS.y * 0.06, -30);
  // palette, sky, stars
  U.haze.value.copy(lerpPal('haze', p)); U.warm.value.copy(lerpPal('warm', p)); U.cool.value.copy(lerpPal('cool', p)); U.ink.value.copy(lerpPal('ink', p));
  renderer.setClearColor(lerpPal('clear', p));
  const kN = THREE.MathUtils.smoothstep(p, 1.15, 1.9);
  for (const [m, base, amt] of nightCards) m.material.uniforms.uTint.value.copy(base).lerp(MOON, kN * amt);
  const kD = 1 - THREE.MathUtils.smoothstep(p, 1.0, 1.5);
  for (const m of dayLayers) { m.material.uniforms.uOpacity.value = kD; m.visible = kD > 0.01; }
  skyMat.uniforms.uP.value = p; skyMat.uniforms.uStars.value = THREE.MathUtils.smoothstep(p, 1.2, 1.9);
  if (skyMat.uniforms.uSparkT.value >= 0) skyMat.uniforms.uSparkT.value += dt;
  // only the beats near the view do work
  beatGroups[0].visible = p < 1.2; beatGroups[1].visible = p > 0.2 && p < 2.2; beatGroups[2].visible = p > 1.05;
  for (const g of beatGroups) if (g.visible && g.userData.update) g.userData.update(U.time.value, reduce ? 0 : dt);
  // pointer rustle on the hero leaves
  rustleKick = Math.max(0, rustleKick - dt * 0.8);
  const fgm = beatGroups[0].userData.mats?.fg; if (fgm) fgm.forEach((m, i) => (m.uniforms.uRustle.value = reduce ? 0 : 0.05 + rustleKick * 0.12));
  // hover (mouse only), throttled
  if (!coarse && now - lastHover > 80 && U.ptr.value.x < 5) {
    lastHover = now; const r = hitTest(); canvas.style.cursor = r ? 'pointer' : '';
    if (r) r.h.hover(r.pt);
    else if (activeBeat() === 0 && beatGroups[0].userData.fireflyPt) { ray.setFromCamera(ndc, camera); const pt = ray.ray.at(11, new THREE.Vector3()); const l = beatGroups[0].worldToLocal(pt); if (l.z > -6 && l.z < 2) beatGroups[0].userData.fireflyPt(l); }
  }
  // text in/out by beat
  beats.forEach((b, i) => { const d = Math.abs(P - i); if (d < 0.42) showBeat(b); else if (d > 0.62) hideBeat(b); });
  Sound.mix(p);
  renderer.render(scene, camera);
  // adaptive: if frames stay slow on a weak device, render fewer pixels
  frames++; if (dt > 0.042) slowFrames++;
  if (frames === 150) { if (slowFrames > 90 && renderer.getPixelRatio() > 0.75) { renderer.setPixelRatio(renderer.getPixelRatio() * 0.8); resize(); } frames = 0; slowFrames = 0; }
  if (DEBUG) dbg(dt);
}
let dbgEl, dbgAcc = 0, dbgN = 0;
function dbg(dt) {
  if (!dbgEl) { dbgEl = document.createElement('div'); dbgEl.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;font:12px monospace;color:#fff;background:rgba(0,0,0,.6);padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre'; document.body.appendChild(dbgEl); }
  dbgAcc += dt; dbgN++;
  if (dbgAcc > 0.5) { const i = renderer.info.render; dbgEl.textContent = `${(dbgN / dbgAcc).toFixed(0)} fps  ${LOW ? 'low' : 'high'}  dpr ${renderer.getPixelRatio().toFixed(2)}\ncalls ${i.calls}  tris ${i.triangles}\nP ${P.toFixed(2)}  ${GPU.slice(0, 40)}`; dbgAcc = 0; dbgN = 0; }
}
// pause the GPU when the dark footer covers the scene
new IntersectionObserver(([e]) => { running = e.isIntersecting; }, { threshold: 0 }).observe(stage);
addEventListener('resize', () => { clearTimeout(resize.t); resize.t = setTimeout(resize, 120); });

// ========== theme-color: dark at the footer (as on The Cost of Design) ==========
const meta = document.querySelector('meta[name="theme-color"]');
function theme() {
  const sheet = document.querySelector('.sheet');
  const dark = sheet.getBoundingClientRect().bottom < innerHeight * 0.55;
  const p = Math.min(2, P);
  meta.setAttribute('content', dark ? '#121315' : '#' + lerpPal('clear', p).getHexString());
}
lenis.on('scroll', theme);

// ========== boot ==========
// the one loop starts now, so Lenis scrolls even while the paintings load
requestAnimationFrame(frame);
(async function boot() {
  resize();
  const { glowT } = await build();
  resize();
  // warm the shaders before the first visible frame
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  stage.classList.add('ready');
  built = true;
  document.documentElement.classList.add('gl-ready');
  // the other two beats load right after the first is on screen
  await buildBalloon(glowT);
  await buildLetter();
  resize();
  renderer.compile(scene, camera);
  window.__pines = { ready: true, renderer, scene, camera, lenis, LOW, GPU };
})().catch((e) => { console.error(e); stage.classList.add('ready'); built = true; });
