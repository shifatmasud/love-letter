// Love Letter: one continuous painted scene told in 3 beats.
// Hybrid: real 3D subjects (house, balloon, letter, hero leaves) with painted maps and thin ink,
// over painted 2D layers placed in depth (sky, far pines, clouds).
// One requestAnimationFrame drives Lenis, the scene and the render.
import * as THREE from 'three';
import Lenis from 'lenis';
import { animate } from 'motion';
import * as S from './shaders.js';
import { Sound } from './audio.js';
import { asset } from './assets.js';

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
// near 2.5 / far 130: the nearest card (the hanging boughs) is 3.4 units away and the farthest painting 105. The old
// near plane of 0.1 (far 400) put almost all depth precision in front of the lens, so on phones with a 16-bit depth
// buffer the house logs, roof and ink shells fought. Precision at the house is now about 40 times finer.
const camera = new THREE.PerspectiveCamera(40, 1, 0.8, 130); // near 0.8: 2.5 clipped the ground and grass at the frame bottom (the 'gap'); 0.8 still keeps 8x the depth detail of 0.1 at the house
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
  file = asset(file); // versioned URL: tex/ is cached for a year, so a changed painting needs a new URL
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
      uInkFade: { value: o.inkFade ?? 0 }, uTexel: { value: new THREE.Vector2(1 / (map.image?.width || 1024), 1 / (map.image?.height || 1024)) },
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
// ===== one physical camera (notes/composition.md) =====
// Nothing has its own scroll speed. Every card and model stands still in the world and the camera cranes up
// and tilts up a little. Screen speed then falls with distance by itself: the farther, the slower, always.
const CAM_Y = [0, 46, 80], CAM_TH = [0, 0.2, 0.2];
const ease = (f) => 0.35 * f + 0.65 * f * f * (3 - 2 * f); // calm at each beat, never a full stop between them
function camY(p) { const i = Math.min(1, Math.floor(p)), f = THREE.MathUtils.clamp(p - i, 0, 1); return THREE.MathUtils.lerp(CAM_Y[i], CAM_Y[i + 1], ease(f)); }
function camTh(p) { const i = Math.min(1, Math.floor(p)), f = THREE.MathUtils.clamp(p - i, 0, 1); return THREE.MathUtils.lerp(CAM_TH[i], CAM_TH[i + 1], ease(f)); }
// the frame centre at distance d from the camera, in world height, when the camera rests at beat a
// phones: the text band takes the lower third, so the subject gets smaller, never moved
const subjK = () => (camera.aspect < 0.62 ? 0.8 : 1);
const viewY = (a, d) => camY(a) + Math.tan(camTh(a)) * d;
// cards placed in screen terms at their anchor beat: fx, fy in -1..1 of the half frame, sh = height as a share of the frame
const placed = [];
function place(m, z, fx, fy, sh, a) { m.position.z = z; m.userData.place = { fx, fy, sh, a, flip: m.userData.flip ?? 1 }; placed.push(m); return m; }
onLayout(() => {
  for (const m of placed) {
    const { fx, fy, sh, a, flip } = m.userData.place; const d = 10 - m.position.z, H = vh(d), Wd = H * camera.aspect;
    m.scale.set(sh * H * flip, sh * H, 1); m.position.x = fx * Wd / 2; m.userData.x = m.position.x; m.position.y = viewY(a, d) + fy * H / 2;
  }
});
// subjects: each one's own centre sits on the frame centre at its beat
const subjects = [];
const BOX = new THREE.Box3(), CEN = new THREE.Vector3();
function centre(obj, a, apply) { subjects.push({ obj, a, apply }); }
function layoutSubjects() {
  for (const { obj, a, apply } of subjects) {
    obj.updateWorldMatrix(true, true); BOX.makeEmpty();
    obj.traverse((o) => { if (o.isMesh && o.visible && o.geometry) { o.geometry.computeBoundingBox(); BOX.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
    BOX.getCenter(CEN); CEN.y -= root.position.y; // centre in root space
    apply(-CEN.x, viewY(a, 10 - CEN.z) - CEN.y);
  }
}

async function build() {
  const [tSky, tFar, tMid, tPine, tGround, tWood, tRoof, tEnd, tStone, tWin, tDoor, tMass1, tMass2, tLong, tBough, tLong2] = await Promise.all([
    tex('sky', { scale: 1 }), tex('farpines'), tex('midpines'), tex('tallpine', { scale: 1 }), tex('ground'), tex('logwood', { repeat: true }), tex('roof', { repeat: true }),
    tex('logend', { scale: 1 }), tex('stone', { repeat: true, scale: 1 }), tex('window', { scale: 1 }), tex('door', { scale: 1 }),
    tex('monstera-a', { scale: 1 }), tex('monstera-b', { scale: 1 }), tex('curlgrass', { scale: 1 }), tex('bough'), tex('curlgrass2', { scale: 1 }),
  ]);
  skyMat.uniforms.uMap.value = tSky; skyMat.uniforms.uTexAspect.value = 1 / tSky.userData.aspect;
  const glowT = await new THREE.TextureLoader().loadAsync(asset('/tex/glow.png'));
  const puffT = await new THREE.TextureLoader().loadAsync(asset('/tex/puff.png'));
  const shaftT = await new THREE.TextureLoader().loadAsync(asset('/tex/shaft.png'));
  const B0 = beatGroups[0];

  // ----- far painted layers (2D cards in depth) -----
  const card = (t, w, o) => { const g = new THREE.PlaneGeometry(w, w * t.userData.aspect); g.translate(0, (w * t.userData.aspect) / 2, 0); return new THREE.Mesh(g, cardMat(t, o)); };
  // painted ridges at a believable size: mirrored tiles side by side, so wide screens are covered without blowing the cards up
  const tiles = (t, w, n, o, x0, y, z, ro, flip0 = 1) => { const out = []; for (let i = 0; i < n; i++) { const m = card(t, w, o); const k = i - (n - 1) / 2; m.scale.x = (i % 2 ? -1 : 1) * flip0; m.position.set(x0 + k * w, y, z); m.renderOrder = ro; B0.add(m); out.push(m); } return out; };
  // every pine in the scene is the same painted pine as the ones beside the house (Shifat): the far "ridges" are rows of
  // that one card, and only scale, value and haze change with distance (aerial perspective, notes/composition.md)
  const pineRow = (z, span, n, hTop, haze, val, ro, seed, name) => {
    const pr = mulberry(seed), a = tPine.userData.aspect, g = new THREE.PlaneGeometry(1, a); g.translate(0, a / 2, 0);
    const m = new THREE.InstancedMesh(g, cardMat(tPine, { cut: 0.5, sway: 0.03, haze }), n);
    for (let i = 0; i < n; i++) {
      const x = -span / 2 + (i + 0.15 + pr() * 0.7) * (span / n), zz = z - pr() * 6;
      const h = hTop * (0.72 + pr() * 0.4), sc = h / a; const v = val * (0.9 + pr() * 0.12);
      m.setMatrixAt(i, mat(x, -3, zz, sc * (pr() < 0.5 ? -1 : 1), sc, 1)); m.setColorAt(i, new THREE.Color().setRGB(v, v, v));
    }
    m.renderOrder = ro; m.frustumCulled = false; m.name = name; B0.add(m); return m;
  };
  const far = pineRow(-95, 300, LOW ? 34 : 48, 36, 0.62, 0.86, -20, 11, 'L1 back ridge');
  const mist1 = new THREE.Mesh(new THREE.PlaneGeometry(260, 16), new THREE.ShaderMaterial({ uniforms: { uHaze: U.haze, uOpacity: { value: 0.7 }, uTime: U.time }, vertexShader: S.plainVert, fragmentShader: S.mistFrag, transparent: true, depthWrite: false }));
  mist1.position.set(0, 1, -80); mist1.renderOrder = -19; B0.add(mist1);
  const mid2 = pineRow(-68, 230, LOW ? 30 : 42, 32, 0.5, 0.88, -18.5, 12, 'L2 far pines');
  const mid = pineRow(-55, 200, LOW ? 28 : 38, 29, 0.36, 0.9, -18, 13, 'L3 mid pines');
  pineRow(-44, 170, LOW ? 24 : 34, 25, 0.24, 0.92, -17.5, 14, 'L3b near ridge'); // a third, nearer row: the forest reads dense all the way back
  const mist2 = mist1.clone(); mist2.material = mist1.material.clone(); mist2.material.uniforms.uHaze = U.haze; mist2.material.uniforms.uTime = U.time; mist2.material.uniforms.uOpacity.value = 0.5;
  mist2.scale.set(0.6, 0.55, 1); mist2.position.set(0, -1.5, -40); mist2.renderOrder = -17; B0.add(mist2);

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
  { // denser forest (Shifat): extra pines around the house and in the back, kept off the house's sight line
    const pr = mulberry(57); const extra = LOW ? 18 : 30;
    for (let i = 0; i < extra; i++) {
      const back = i % 3 !== 0; const z = back ? -26 - pr() * 18 : -8.5 - pr() * 9;
      let x = (pr() * 2 - 1) * (back ? 30 : 16); if (!back && Math.abs(x) < 4.2) x = Math.sign(x || 1) * (4.2 + pr() * 2);
      pines.push([x, z, (back ? 21 : 14) + pr() * 4, back ? 0.78 : 0.95]);
    }
  }
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
  const house = new THREE.Group(); house.position.set(0.35, -0.62, -4); house.rotation.y = -0.52; B0.add(house); house.name = 'L4 house';
  onLayout(() => { house.scale.setScalar(THREE.MathUtils.clamp(camera.aspect * 1.2, 0.55, 1)); B0.position.set(0, 0, 0); }); // phones: the house shrinks to fit the width, it never moves
  centre(house, 0, (dx, dy) => { B0.position.x += dx; B0.position.y += dy; const fg = B0.userData.fg; if (fg) fg.position.set(-B0.position.x, -B0.position.y, 0);
    house.updateWorldMatrix(true, true); const hb = new THREE.Box3().setFromObject(house); hb.min.sub(B0.position); hb.max.sub(B0.position); hb.min.y -= root.position.y; hb.max.y -= root.position.y; B0.userData.layoutGrass?.(hb); });
  const R = 0.15, W = 3.8, D = 2.9, NL = 9;
  const logGeo = new THREE.CylinderGeometry(R, R, 1, 24, 1, true); logGeo.rotateZ(Math.PI / 2);
  const logs = []; const ends = [];
  for (let i = 0; i < NL; i++) {
    const y = R + i * R * 1.85;
    logs.push(mat(0, y, D / 2, W + 0.5, 1, 1), mat(0, y, -D / 2, W + 0.5, 1, 1));
    const y2 = y + R * 0.92;
    // the top side logs sat half above the wall, so their ends stuck out as two knobs at the roof edge (Shifat: remove)
    if (i < NL - 1) logs.push(mat(-W / 2, y2, 0, D + 0.5, 1, 1, 0, Math.PI / 2, 0), mat(W / 2, y2, 0, D + 0.5, 1, 1, 0, Math.PI / 2, 0));
    for (const sx of [-1, 1]) ends.push(mat(sx * (W / 2 + 0.25), y, D / 2, R, R, 1, 0, Math.PI / 2 * sx, 0), mat(sx * (W / 2 + 0.25), y, -D / 2, R, R, 1, 0, Math.PI / 2 * sx, 0));
    if (i < NL - 1) for (const sz of [-1, 1]) ends.push(mat(-W / 2, y2, sz * (D / 2 + 0.25), R, R, 1, 0, sz > 0 ? 0 : Math.PI, 0), mat(W / 2, y2, sz * (D / 2 + 0.25), R, R, 1, 0, sz > 0 ? 0 : Math.PI, 0));
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
  { const m5 = new THREE.Object3D(); m5.name = 'L5 near plants'; m5.position.set(0, -1, 2.4); const m6 = new THREE.Object3D(); m6.name = 'L6 frame'; m6.position.set(0, -1, 5.2); fgGroup.add(m5, m6); }
  const leafGeo = new THREE.PlaneGeometry(1, 1, 10, 10); leafGeo.translate(0, 0.5, 0);
  const mk = (t, n, o) => { const g = leafGeo.clone(); g.scale(1, t.userData.aspect, 1); const m = new THREE.InstancedMesh(g, cardMat(t, { cut: 0.5, ...o }), n); m.frustumCulled = false; fgGroup.add(m); return m; };
  // plant masses: few, big and simple (notes/style.md), framing the lower corners like the bracken under real pines
  const masses = [mk(tMass1, 3, { sway: 0.012, rustle: 0.0 }), mk(tMass2, 3, { sway: 0.012, rustle: 0.0 })];
  const bough = mk(tBough, 2, { sway: 0.07, rustle: 0.06, hang: 1 }); bough.visible = false; // the hanging corner boughs are gone (Shifat: rm these)
  const bigPine = mk(tPine, 2, { sway: 0.015 }); bigPine.visible = false; // the dark framing trunks read as a different pine and crowded the top corners (Shifat)
  // long grass: one instanced draw of alpha-tested painted clumps that live in the world, not in the frame
  // only long curvy blades (Shifat): two clean painted clumps, 3 flat values, no tufts, no seed heads
  const NG = LOW ? 150 : 210; // per card, so 2 x NG clumps
  const lgs = [tLong, tLong2].map((t, k) => { const g = new THREE.PlaneGeometry(1, 1, 1, 4); g.translate(0, 0.5, 0); g.scale(1, t.userData.aspect, 1);
    const m = new THREE.InstancedMesh(g, cardMat(t, { cut: 0.5, sway: 0.08, rustle: 0.03, bend: 0.6 }), NG); m.frustumCulled = false; m.name = k ? 'longgrass2' : 'longgrass'; B0.add(m); return m; });
  const lg = lgs[0];
  const floor = card(tGround, 1, { cut: 0.5, tint: 0xb9b2a0 }); floor.geometry = leafGeo.clone(); floor.geometry.scale(1, tGround.userData.aspect, 1);
  const floorMesh = new THREE.InstancedMesh(floor.geometry, floor.material, 3); floorMesh.frustumCulled = false;
  const PLANE = { mass: 1.25, bough: 0.62, bigPine: 1 };
  const tint = (m, i, k, h = 0) => { const v = k * (PLANE[m.name] ?? 1); m.setColorAt(i, new THREE.Color().setRGB(v, v * 1.0, v * 0.98).lerp(PAL[0].haze, h)); };
  masses.forEach((m) => (m.name = 'mass')); bough.name = 'bough'; bigPine.name = 'bigPine'; floorMesh.name = 'floorMesh';
  const GROUND = -0.66;
  onLayout(() => {
    // frame pieces are placed in camera terms; fgGroup cancels the centring shift of B0 so they stay on the edges
    const at = (z) => { const d = 10 - z; const H = vh(d); return { H, Wd: H * camera.aspect, d }; };
    let a = at(5.2); const bot = -a.H / 2;
    const sx = (f) => f * a.Wd / 2; const mk2 = THREE.MathUtils.clamp(camera.aspect / 1.6, 0.55, 1);
    const ms = (t) => 2.0 * mk2; // mass width in world units at z 5.2
    // Monstera are placed in screen terms (NDC of the resting frame), blended from a phone framing to a desktop framing.
    // Root cause of "monstera barely show on phone": they were sized and placed by the frame WIDTH, so on a narrow
    // screen they shrank and slid past the edges, and the near grass rows (closer to the camera) covered the rest.
    // Now each clump keeps its share of the frame HEIGHT, anchored to the edge, so phone and desktop show the same picture.
    const [m1, m2] = masses; const fk = THREE.MathUtils.clamp((camera.aspect - 0.46) / (1.6 - 0.46), 0, 1);
    // [mesh, i, z, phone (cx, bottom, h), desk (cx, bottom, h), flip, tone, haze]  cx/bottom in NDC, h = NDC height
    const MON = [
      [m1, 0, 5.2, [-1.2, -1.14, 0.95], [-0.9, -1.18, 1.36], 1, 0.62, 0],
      [m2, 0, 5.0, [1.18, -1.12, 0.85], [0.885, -1.12, 0.98], -1, 0.66, 0],
      [m1, 1, 5.6, [0.62, -1.3, 0.44], [0.6, -1.43, 0.99], -1, 0.56, 0],
      [m2, 1, 2.4, [-0.98, -1.02, 0.4], [-0.94, -1.04, 0.6], 1, 0.82, 0.05],
      [m2, 2, 2.2, [1.0, -1.0, 0.34], [0.975, -0.99, 0.51], -1, 0.85, 0.06],
      [m1, 2, 2.6, [-0.32, -1.34, 0.32], [-0.245, -1.36, 0.47], 1, 0.8, 0.05],
    ];
    const rects = [];
    for (const [m, i, z, ph, dk, flip, tone, hz] of MON) {
      const [cx, by, h] = ph.map((v, k) => THREE.MathUtils.lerp(v, dk[k], fk));
      const q = at(z), ta = (m === m1 ? tMass1 : tMass2).userData.aspect;
      const hw = h * q.H / 2, w = hw / ta; // world height and width
      m.setMatrixAt(i, mat(cx * q.Wd / 2, by * q.H / 2, z, w * flip, w, 1)); tint(m, i, tone, hz);
      const wN = w / (q.Wd / 2); rects.push({ x0: cx - wN / 2, x1: cx + wN / 2, y0: by, y1: by + h, z });
    }
    B0.userData.frameRects = rects;
    a = at(6.5);
    const bk = THREE.MathUtils.clamp(camera.aspect / 1.6, 0.7, 1); // the boughs sit behind the nav, so white marks read on dark needles
    bough.setMatrixAt(0, mat(-a.Wd * 0.52, a.H / 2 + 0.02, 6.5, 0.8 * bk, -0.8 * bk, 1, 0, 0, 0.35)); tint(bough, 0, 0.9);
    bough.setMatrixAt(1, mat(a.Wd * 0.56, a.H / 2 + 0.05, 6.4, -0.62 * bk, -0.62 * bk, 1, 0, 0, -0.3)); tint(bough, 1, 0.86);
    const p = at(3.5); const nk = THREE.MathUtils.clamp((camera.aspect - 0.45) / 1.15, 0, 1); const ps = (18 / tPine.userData.aspect) * (0.72 + 0.28 * nk);
    bigPine.setMatrixAt(0, mat(-p.Wd / 2 - (0.7 + 1.3 * (1 - nk)), -p.H / 2 - 1, 3.5, ps, ps, 1)); tint(bigPine, 0, 0.66);
    bigPine.setMatrixAt(1, mat(p.Wd / 2 + (1.35 + 1.0 * (1 - nk)), -p.H / 2 - 1.2, 3.0, ps * 1.05, ps * 1.05, 1)); tint(bigPine, 1, 0.62);
    const g2 = at(1.6);
    floorMesh.setMatrixAt(0, mat(-2.2, -0.9, -1.2, 9, 3, 1)); floorMesh.setMatrixAt(1, mat(3.8, -1.0, -1.6, 8, 2.6, 1)); floorMesh.setMatrixAt(2, mat(0, -g2.H / 2 + 0.25, 1.6, Math.max(10, g2.Wd * 1.3), 4, 1));
    tint(floorMesh, 0, 0.9, 0.1); tint(floorMesh, 1, 0.9, 0.12); tint(floorMesh, 2, 0.78);
    for (const m of [...masses, bough, bigPine, floorMesh]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  });
  // grass is laid after centring (it needs the house's place on screen): tall everywhere, but never over the house.
  // A clump at camera distance d may rise only to the sight line from the camera to the house's foot, so it can never cover it.
  // Gap fix: clumps used to be spread by world depth, so most landed near the horizon or off screen and the lower
  // frame (between the frame plants and the lawn) showed bare floor. Now each clump is placed by its screen row:
  // a ray from the camera through an even spread of screen points hits the ground, so every row of ground is full.
  B0.userData.layoutGrass = (hb) => {
    const gr = mulberry(91); const camY = -B0.position.y;
    const ray = new THREE.Raycaster(); const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); const hit = new THREE.Vector3(); const nd = new THREE.Vector2();
    camera.updateMatrixWorld(); B0.updateMatrixWorld();
    const gW = new THREE.Vector3(0, GROUND, 0).applyMatrix4(B0.matrixWorld); pl.constant = -gW.y;
    const farP = new THREE.Vector3(0, GROUND, -10).applyMatrix4(B0.matrixWorld).project(camera); const yTop = Math.min(farP.y, 0.2);
    const N = NG * 2;
    for (let i = 0; i < N; i++) {
      const m = lgs[i % 2]; const j = i >> 1; const t = m === lg ? tLong : tLong2;
      // rows: even in screen y from below the frame to the far lawn, jittered; x spread wider than the screen for the tilt
      const r = (i + gr()) / N; nd.set((gr() * 2 - 1) * 1.3, THREE.MathUtils.lerp(-1.18, yTop, Math.pow(r, 1.15)));
      ray.setFromCamera(nd, camera); if (!ray.ray.intersectPlane(pl, hit)) { m.setMatrixAt(j, mat(0, -50, 0, 0.001, 0.001, 1)); continue; }
      B0.worldToLocal(hit); const x = hit.x, z = hit.z; const d = 10 - z;
      let h = THREE.MathUtils.lerp(0.7, 1.3, gr()) * THREE.MathUtils.clamp(d / 9, 0.5, 1.25);
      // a clump nearer than a frame monstera, inside its inner box, would hide it (the phone bug): leave that spot to the leaf
      if ((B0.userData.frameRects || []).some((r) => z > r.z - 0.2 && nd.x > r.x0 - 0.05 && nd.x < r.x1 + 0.05 && nd.y < r.y1)) { m.setMatrixAt(j, mat(0, -50, 0, 0.001, 0.001, 1)); continue; }
      const inX = x > hb.min.x - 0.5 && x < hb.max.x + 0.5;
      if (inX && z > hb.min.z - 0.3 && z < hb.max.z + 0.3) { h *= 0.18; }
      else if (inX && z >= hb.max.z) { const dh = 10 - hb.max.z; const lim = (camY - GROUND) * (1 - d / dh) - 0.05; h = Math.min(h, Math.max(0.12, lim)); }
      const w = h / t.userData.aspect * (1.25 + gr() * 0.4) * (gr() < 0.5 ? -1 : 1);
      const far = THREE.MathUtils.clamp((-z) / 9, 0, 1);
      m.setMatrixAt(j, mat(x, GROUND - 0.04, z, w, h / t.userData.aspect, 1, 0, (gr() - 0.5) * 0.5, (gr() - 0.5) * 0.1));
      const v = THREE.MathUtils.lerp(1.0, 0.9, gr()) * (z > 3 ? 0.9 : 1); // nearest rows a touch darker for depth, never near-black m.setColorAt(j, new THREE.Color().setRGB(v, v, v * 0.97).lerp(PAL[0].haze, 0.04 + far * 0.3));
    }
    for (const m of lgs) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  };

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
    { obj: houseHit, hover: () => { winGlow = Math.max(winGlow, 0.5); }, tap: () => { winGlow = 1.4; smokeBoost = 2.2; Sound.play('creak', 0.3); setTimeout(() => Sound.play('crackle', 0.22), 220); } },
  ];
  B0.userData.tapMiss = (pt) => { // tap on the forest: fireflies scatter, leaves rustle
    scat.copy(pt ?? V.set(0, 0.6, -2)); scatT = U.time.value; rustleKick = 1; Sound.play('rustle', 0.3, { pan: pt ? pt.x / 8 : 0 });
  };
  B0.userData.fireflyPt = (p) => { scat.copy(p); scatT = U.time.value - 0.15; };
  B0.userData.mats = { fg: [...masses.map((m) => m.material), bough.material, ...lgs.map((m) => m.material)] }; B0.userData.fg = fgGroup;
  return { glowT, puffT };
}

let rustleKick = 0;

// ========== BEAT 1: the red balloon ==========
async function buildBalloon(glowT) {
  const [tBal, tWick, tCl, tSea] = await Promise.all([tex('balloon'), tex('wicker', { repeat: true, scale: 1 }), tex('clouds1'), tex('cloudsea')]);
  const B1 = beatGroups[1];
  const card = (t, w, o) => { const g = new THREE.PlaneGeometry(w, w * t.userData.aspect); g.translate(0, (w * t.userData.aspect) / 2, 0); return new THREE.Mesh(g, cardMat(t, o)); };
  // clouds behind (painted, hazed by depth)
  const [tBig, tS0, tS1, tS2, tS3] = await Promise.all(['cl-big', 'cl-s0', 'cl-s1', 'cl-s2', 'cl-s3'].map((n) => tex(n)));
  // whole clouds, centred cards of unit height; place() sizes them per screen
  const cc = (t, o, flip = 1) => { const g = new THREE.PlaneGeometry(1 / t.userData.aspect, 1); const m = new THREE.Mesh(g, cardMat(t, o)); m.userData.flip = flip; root.add(m); return m; };
  const CL = { big: tBig, s0: tS0, s1: tS1, s2: tS2, s3: tS3, tri: tCl, sea: tSea };
  // [tex, z, fx, fy, height share, anchor beat, plane, renderOrder, haze, flip, night]
  const defs = [
    // beat 1: in the clouds. back bank under the balloon, far puffs on the thirds, two near clouds in opposite corners
    ['big', -42, -0.62, -0.5, 0.36, 1, 1.0, -15.8, 0.2, -1, 0.75],
    ['s1', -40, 0.78, -0.3, 0.2, 1, 1.0, -15.6, 0.22, 1, 0.75],
    ['s2', -38, -0.8, 0.5, 0.13, 1, 1.05, -15.4, 0.24, 1, 0.75],
    ['s0', -36, 0.78, 0.62, 0.12, 1, 1.05, -15.2, 0.26, -1, 0.75],
    ['s3', -22, 0.62, -0.78, 0.2, 1, 1.15, -14, 0.1, 1, 0.72],
    ['big', 2.5, -1.08, -1.02, 0.5, 1, 'near', 20, 0, 1, 0.7],
    ['s1', 3.0, 0.98, 0.9, 0.24, 1, 'frame', 20.5, 0, -1, 0.7],
    // a rich cloudscape (Shifat): many more whole clouds. back: small and hazy, all around
    ['s0', -46, -0.25, 0.78, 0.09, 1, 0.95, -16.2, 0.32, 1, 0.78],
    ['s3', -46, 0.3, -0.72, 0.1, 1, 0.95, -16.2, 0.32, -1, 0.78],
    ['s2', -45, 0.45, 0.35, 0.08, 1, 0.95, -16.1, 0.32, -1, 0.78],
    ['s1', -45, -0.42, 0.12, 0.08, 1, 0.95, -16.1, 0.32, 1, 0.78],
    ['s0', -44, 0.05, -0.95, 0.12, 1, 0.95, -16, 0.3, 1, 0.78],
    // middle: medium clouds on the sides, clear of the balloon
    ['s2', -30, -0.95, -0.05, 0.17, 1, 1.1, -14.9, 0.16, -1, 0.72],
    ['s0', -28, 0.95, 0.12, 0.15, 1, 1.1, -14.85, 0.16, 1, 0.72],
    ['s3', -27, -0.55, 0.88, 0.13, 1, 1.1, -14.8, 0.15, 1, 0.72],
    ['s1', -26, 0.5, -0.98, 0.16, 1, 1.1, -14.75, 0.15, -1, 0.72],
    // front: two more near clouds, only in the corners
    ['s0', 2.2, 1.1, -0.95, 0.3, 1, 'near', 20.2, 0, -1, 0.7],
    ['s3', 2.0, -1.08, 0.95, 0.22, 1, 'frame', 20.3, 0, 1, 0.7],
    // between beats: one thin cloud passes through the empty middle on the way up (never over a subject)
    ['s2', 1.0, 0.0, 0.0, 0.16, 1.5, 'near', 19, 0, 1, 0.7],
    // behind the balloon on the way up: two big mid clouds so the climb feels full on wide screens too
    ['big', -30, -0.5, 0.15, 0.42, 1.5, 1.1, -14.8, 0.12, 1, 0.65],
    ['s3', -26, 0.55, 0.4, 0.3, 1.5, 1.1, -14.7, 0.12, -1, 0.65],
    // beat 2: above the clouds at night. a sea of cloud below the letter, small clouds low at the sides
    ['sea', -30, 0.0, -0.62, 0.5, 2, 1.3, -16.5, 0.08, -1, 0.6],
    ['s1', -26, 0.05, -0.92, 0.3, 2, 1.35, -14.5, 0.05, 1, 0.6],
    ['s2', -22, -0.8, -0.3, 0.14, 2, 1.35, -14.2, 0.06, -1, 0.6],
    ['s0', -21, 0.82, -0.4, 0.13, 2, 1.35, -14.1, 0.06, 1, 0.6],
    ['s3', 2.8, 1.06, -1.04, 0.36, 2, 'near', 20, 0, -1, 0.7],
  ];
  const fg = [];
  for (const [k, z, fx, fy, sh, a, kind, ro, haze, flip, night] of defs) {
    const m = cc(CL[k], { haze, tint: 0xffffff, opacity: 1, inkFade: z < 0 ? Math.min(0.85, Math.max(0, (-z - 15) / 30)) : 0, fadeBot: z < 0 && k !== 'sea' ? 0.32 : 0 }, flip); m.renderOrder = ro; place(m, z, fx, fy, sh, a, kind);
    nightCards.push([m, m.material.uniforms.uTint.value.clone(), night]); if (z > 0) fg.push(m);
  }

  const bal = new THREE.Group(); bal.name = 'balloon'; bal.position.set(0, BEAT + 0.3, -4); B1.add(bal); // x 0: dead centre at rest
  let balY = BEAT + 0.3; onLayout(() => { bal.scale.setScalar(subjK()); bal.position.set(0, BEAT, -4); });
  centre(bal, 1, (dx, dy) => { bal.position.x += dx; balY = bal.position.y + dy; bal.position.y = balY; });
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
    fg.forEach((m, i) => { m.position.x = m.userData.x + Math.sin(t * 0.07 + i * 2) * 0.15; }); // drift stays tiny so corner clouds never reach the subject
  };
  B1.userData.hits = [{ obj: hit, hover: () => { flare = Math.max(flare, 0.25); }, tap: () => { flare = 1.2; liftV += 1.6; Sound.play('cloth', 0.32); } }];
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
  const holder = new THREE.Group(); holder.name = 'letter'; holder.position.set(0, BEAT * 2, -4); holder.add(letter); B2.add(holder);
  let letY = BEAT * 2; onLayout(() => { holder.scale.setScalar(1.35 * subjK()); holder.position.set(0, BEAT * 2, -4); });
  centre(holder, 2, (dx, dy) => { holder.position.x += dx; letY = holder.position.y + dy; holder.position.y = letY; });
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
  B2.userData.hits = [{ obj: hit, hover: (pt) => { hov = 1; const l = holder.worldToLocal(pt.clone()); tiltT.set(l.x / 1.2, l.y / 1.6); }, tap: () => { flut = 1; tiltV.y += 1.5; Sound.play('paper', 0.34); } }];
  B2.userData.tapMiss = (pt, ndc) => { skyMat.uniforms.uSpark.value.copy(ndc); skyMat.uniforms.uSparkT.value = 0; Sound.play('gust', 0.26); };
}

// ========== resize ==========
// Jitter root cause (probe/jit.py): the stage and the beats are 100lvh tall, but P and the canvas used innerHeight,
// which changes when the phone's URL bar slides. The scene jumped (0.42 units with no scroll) and the canvas stretched
// for a few frames. Both now read the stage's own size, which the URL bar never changes.
let stageW = 0, stageH = 0;
function resize() {
  const w = stage.clientWidth || innerWidth, h = stage.clientHeight || innerHeight;
  stageW = w; stageH = h;
  camera.aspect = w / h;
  // keep a wide-lens feel on desktop, open the view up on tall phones so the subjects fit
  camera.fov = camera.aspect < 0.62 ? 56 : camera.aspect < 1 ? 48 : 40;
  camera.updateProjectionMatrix();
  // the crane scales with the view, so the forest clears and the cloud sea stays hidden on every screen shape
  { const k = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.tan(THREE.MathUtils.degToRad(20)); CAM_Y[1] = 46 * k; CAM_Y[2] = 80 * k; }
  renderer.setSize(w, h, false);
  U.aspect.value = camera.aspect;
  const pxPerUnitAt14 = (h * DPR) / vh(14);
  // ink width: about 1.4 device px on the subjects, whatever the screen
  for (const m of lineMats) m.uniforms.uWidth.value = m.userData.base * Math.max(0.7, Math.min(1.6, 90 / pxPerUnitAt14));
  const px = (h * DPR) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  scene.traverse((o) => { if (o.material?.uniforms?.uPx) o.material.uniforms.uPx.value = px; });
  layoutFns.forEach((f) => f()); layoutSubjects();
  splitLines();
}

// ========== text: Surface Tension's slot reveal, ported line for line (src/dom/ui/TextLayer.tsx + ufx.ts) ==========
// IN: each line rises from under its hard mask on cubic-bezier(0.19, 1, 0.22, 1) over 1.0 s, 75 ms apart, with a 2.5°
// tilt that settles to 0. OUT: up and out through the top of the mask, 0.45 s ease-in-out (0.65, 0, 0.35, 1), same stagger.
// One beat on screen at a time: the incoming beat waits until every leaving line has cleared its mask.
const beats = [...document.querySelectorAll('.beat')];
const OUT_DUR = 0.45, IN_DUR = 1.0, STAGGER = 0.075;
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t, dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => { if (x <= 0) return 0; if (x >= 1) return 1; let t = x; for (let i = 0; i < 6; i++) { const d = dX(t); if (Math.abs(d) < 1e-6) break; t -= (X(t) - x) / d; } t = Math.min(1, Math.max(0, t)); return Y(t); };
}
const easeOut = bezier(0.19, 1, 0.22, 1), easeIn = bezier(0.65, 0, 0.35, 1);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const tNow = () => window.__tnow ?? performance.now() / 1000; // __tnow: test hook, frames of the text timeline
const st = beats.map(() => ({ on: false, dir: 0, t0: 0, ot0: -1, v: [], from: [], dom: [] }));
function splitLines() {
  for (const el of document.querySelectorAll('[data-lines]')) {
    const text = el.dataset.text || (el.dataset.text = el.textContent.trim());
    el.innerHTML = text.split(/\s+/).map((w) => `<span class="w">${w}</span>`).join(' ');
    const lines = []; let top = null;
    for (const s of el.querySelectorAll('.w')) { const t = s.offsetTop; if (t !== top) { lines.push([]); top = t; } lines[lines.length - 1].push(s.textContent); }
    el.innerHTML = lines.map((l) => `<span class="slot__line"><span class="slot__in">${l.join(' ')}</span></span>`).join('');
  }
  beats.forEach((b, k) => { st[k].dom = [...b.querySelectorAll('.slot__in')]; paintBeat(k, true); });
}
// v: 0 under the mask, 1 in place, 2 gone through the top. The DOM copy of the shader: shift by (1 - v) * 102% of the line
// box, plus the tilt (tl = 1 - v): a skew of atan(0.044) and a squash of 1 / (1 + 0.035 |tl|)
function paintLine(d, v, o) {
  const tl = Math.max(-1, Math.min(1, 1 - v));
  d.style.transform = `translate3d(0, ${((1 - v) * 102).toFixed(2)}%, 0) skewX(${(2.52 * tl).toFixed(3)}deg) scaleY(${(1 / (1 + 0.035 * Math.abs(tl))).toFixed(4)})`;
  d.style.opacity = o;
}
let active = -1;
function setActive(i) {
  if (i === active) return;
  const now = tNow();
  if (active >= 0) { const s = st[active]; if (s.on) { s.from = s.dom.map((_, k) => s.v[k] ?? 0); s.ot0 = now; s.dir = -1; } }
  let clearAt = now;
  for (const s of st) if (s.on && s.dir < 0 && s.ot0 >= 0) clearAt = Math.max(clearAt, s.ot0 + (reduce ? 0 : OUT_DUR + STAGGER * (s.dom.length - 1)));
  if (i >= 0) {
    const s = st[i];
    if (!s.on) { s.ot0 = -1; s.v = []; s.from = []; }
    s.dir = 1; s.t0 = active >= 0 ? Math.max(now + 0.06, clearAt + 0.04) : now; s.on = true;
  }
  beats.forEach((b, k) => b.classList.toggle('in', k === i));
  active = i;
}
// the letter's exit is tied to scroll: over the last stretch before the footer curtain opens, its lines roll up and out
// (same curve and stagger, as a progress), so the text is always gone before the footer shows, and rolls back on the way up
let letterOut = 0;
function paintBeat(b, force) {
  const s = st[b], now = tNow(), n = s.dom.length;
  if (!s.on) { if (force) s.dom.forEach((d) => paintLine(d, 0, 0)); return; }
  let done = true;
  for (let i = 0; i < n; i++) {
    let v = 0, o = 1;
    const xin = s.dir > 0 ? (now - s.t0 - i * STAGGER) / IN_DUR : -1;
    if (s.dir > 0 && xin >= 0) { v = reduce ? 1 : easeOut(clamp01(xin)); if (xin < 1 && !reduce) done = false; }
    else if (s.ot0 >= 0) {
      const f = s.from[i] ?? 0, xo = reduce ? 1 : clamp01((now - s.ot0 - i * STAGGER) / OUT_DUR);
      v = f < 0.03 ? 0 : f >= 2 ? 2 : f + (2 - f) * easeIn(xo);
      if (xo < 1) done = false; if (reduce && xo >= 1) o = 0;
    } else { v = 0; if (s.dir > 0) done = false; }
    s.v[i] = v;
    let shown = v;
    if (b === beats.length - 1 && s.dir > 0 && letterOut > 0) {
      // scroll-driven roll out: line i starts STAGGER/OUT_DUR of the way later than line i-1
      const k = STAGGER / OUT_DUR, x = clamp01(letterOut * (1 + k * (n - 1)) - i * k);
      shown = v < 0.03 ? 0 : v + (2 - v) * easeIn(x);
      if (reduce) o = x >= 1 ? 0 : 1;
    }
    paintLine(s.dom[i], shown, shown >= 2 ? 0 : o);
  }
  if (s.dir > 0 && done) s.ot0 = -1;
  if (s.dir < 0 && done) { s.on = false; s.ot0 = -1; s.dom.forEach((d) => (d.style.opacity = '0')); }
}
function tickText(P) {
  // which beat owns the slot: the nearest one, with a gap between beats where none does (ST's current())
  let i = -1; for (let k = 0; k < beats.length; k++) if (Math.abs(P - k) < (active === k ? 0.5 : 0.38)) i = k;
  // the letter: tied to scroll from 0.55 screens before the footer starts to open, done 0.08 screens before it
  const y = lenis.animatedScroll ?? scrollY, f0 = sheetH() - innerHeight;
  letterOut = clamp01((y - (f0 - innerHeight * 0.55)) / (innerHeight * 0.47));
  setActive(i);
  for (let b = 0; b < st.length; b++) paintBeat(b);
}

// ========== Lenis: one RAF for scroll + scene ==========
const lenis = new Lenis({ autoRaf: false, lerp: reduce ? 1 : 0.09, smoothWheel: !reduce, syncTouch: false, anchors: false });

// ========== pointer: camera parallax, hover, taps ==========
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2(9, 9);
const ptrS = new THREE.Vector2(), ptrT = new THREE.Vector2();
let dragging = false, dragX = 0, lastHover = 0;
canvas.style.touchAction = 'pan-y';
function setNdc(e) { ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); }
addEventListener('pointermove', (e) => {
  setNdc(e); U.ptr.value.copy(ndc);
  if (e.pointerType === 'mouse') ptrT.set(ndc.x, ndc.y);
  // touch: only a sideways drag tilts. Jitter root cause #2 (probe): pointerdown aimed the camera at the finger, so every
  // vertical swipe began with a camera lurch toward the touch point and an ease back.
  else if (dragging) ptrT.set(THREE.MathUtils.clamp((e.clientX - dragX) / (innerWidth * 0.45), -1, 1), 0);
}, { passive: true });
addEventListener('pointerdown', (e) => { if (e.target.closest('a,button')) return; setNdc(e); U.ptr.value.copy(ndc); dragging = true; dragX = e.clientX; if (e.pointerType === 'mouse') ptrT.set(ndc.x, ndc.y); tap(); }, { passive: true });
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
const sheetEl = document.querySelector('.sheet'); let sheetHc = 0, sheetT = 0;
function sheetH() { const t = performance.now(); if (t - sheetT > 500) { sheetHc = sheetEl.offsetHeight; sheetT = t; } return sheetHc; }
function inFooter() { return scrollY > sheetH() - innerHeight * 0.6; }

// ========== loop ==========
let forced = null; // test hook: hold the pointer at the tilt limit
const navEl = document.querySelector('header'); let navDark = true;
const PTR_X = 0.32, PTR_Y = 0.16; const ptrV = new THREE.Vector2();
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
  const dt = window.__freeze ? 0 : Math.min(0.05, (now - last) / 1000); last = now; // __freeze: test hook for still frames
  if (!built || !running || document.hidden) return;
  const H = stageH || innerHeight;
  const y = lenis.animatedScroll ?? scrollY;
  // the scene holds on the letter through its extra stretch (2 screens to the footer start), then lifts with the curtain
  const f0 = sheetH() - innerHeight, yS = Math.min(y, 2 * H) + Math.max(0, y - Math.max(2 * H, f0));
  P = THREE.MathUtils.clamp(yS / H, 0, 2.25);
  Psm = P; // Lenis already eases the value; a second smoothing here would make scene and page drift
  const p = Math.min(2, Psm);
  if (!reduce) U.time.value += dt;
  // the scene moves, the camera stays: scroll lifts everything by one beat per screen
  root.position.y = -camY(p) - (Psm - p) * 4;
  // nav tone follows the painted value behind it: dark forest and night take white, the light day sky takes ink
  { const dark = p < 0.45 || p > 1.55; if (dark !== navDark) { navDark = dark; navEl?.classList.toggle('on-dark', dark); dispatchEvent(new Event('navtone')); } }
  // gentle camera parallax from mouse or touch drag, sprung
  if (forced) ptrT.set(forced[0], forced[1]);
  // one critically damped spring: no overshoot, eases back to centre on release, nothing else pulls on it
  if (reduce) { ptrS.set(0, 0); ptrV.set(0, 0); } else { const w = 4.2; ptrV.x += (w * w * (ptrT.x - ptrS.x) - 2 * w * ptrV.x) * dt; ptrV.y += (w * w * (ptrT.y - ptrS.y) - 2 * w * ptrV.y) * dt; ptrS.addScaledVector(ptrV, dt); }
  // the camera swings around the hero plane (z -4): the subject stays put, near planes move a little one way and far planes
  // a little the other. Travel is small so the framing plants and corner clouds can never reach the subject.
  camera.position.set(ptrS.x * PTR_X, ptrS.y * PTR_Y, 10);
  camera.lookAt(camera.position.x, camera.position.y + Math.tan(camTh(p)) * 14, -4);
  // palette, sky, stars
  U.haze.value.copy(lerpPal('haze', p)); U.warm.value.copy(lerpPal('warm', p)); U.cool.value.copy(lerpPal('cool', p)); U.ink.value.copy(lerpPal('ink', p));
  renderer.setClearColor(lerpPal('clear', p));
  const kN = THREE.MathUtils.smoothstep(p, 1.15, 1.9);
  for (const [m, base, amt] of nightCards) m.material.uniforms.uTint.value.copy(base).lerp(MOON, kN * amt);
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
  tickText(P);
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
  window.__pines = { ready: true, THREE, renderer, scene, camera, lenis, LOW, GPU, forcePtr: (x, y) => { forced = x === null ? null : [x, y]; } };
})().catch((e) => { console.error(e); stage.classList.add('ready'); built = true; });
