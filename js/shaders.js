// GLSL for Above the Pines. All colour math is done in sRGB on purpose: the paintings are
// already graded, so the shaders only tint, shade in 3 steps and add depth haze.

export const INST = /* glsl */ `
#ifdef USE_INSTANCING
  #define IM instanceMatrix
#else
  #define IM mat4(1.0)
#endif
`;

// ---------- painted cards: far layers (alpha blend) and foliage (alpha test, instanced) ----------
export const cardVert = /* glsl */ `
${INST}
uniform float uTime, uSway, uRustle, uHang, uAspect;
uniform vec2 uPtr;
uniform float uBend;
varying vec2 vUv;
varying vec3 vTint;
void main(){
  vUv = uv;
  vec3 p = position;
  // gentle cup for real-geometry leaves (smooth, not faceted)
  p.z += uBend * (-(p.x * p.x) * 0.9 + (p.y + 0.5) * (p.y + 0.5) * -0.35);
  vec4 wp = modelMatrix * (IM * vec4(p, 1.0));
  float w = mix(uv.y, 1.0 - uv.y, uHang); w *= w;
  float ph = wp.x * 0.7 + wp.z * 0.45 + IM[3].x * 1.3;
  wp.x += (sin(uTime * 1.05 + ph) + 0.35 * sin(uTime * 2.3 + ph * 1.7)) * uSway * w;
  wp.y += cos(uTime * 0.9 + ph) * uSway * 0.25 * w;
  if (uRustle > 0.0) {
    vec4 cp = projectionMatrix * viewMatrix * wp;
    vec2 d = (cp.xy / cp.w - uPtr) * vec2(uAspect, 1.0);
    float r = exp(-dot(d, d) * 9.0);
    wp.x += sin(uTime * 13.0 + ph * 3.0) * uRustle * r * w;
    wp.y += cos(uTime * 10.0 + ph * 2.0) * uRustle * r * w * 0.35;
  }
  #ifdef USE_INSTANCING_COLOR
    vTint = instanceColor;
  #else
    vTint = vec3(1.0);
  #endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const cardFrag = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uTint, uHaze;
uniform float uHazeAmt, uOpacity, uCut, uBright, uFadeTop, uFadeBot;
varying vec2 vUv;
varying vec3 vTint;
void main(){
  vec4 c = texture2D(uMap, vUv);
  float a = c.a;
  if (uFadeBot > 0.0) a *= smoothstep(0.0, uFadeBot, vUv.y);
  if (uFadeTop > 0.0) a *= smoothstep(1.0, 1.0 - uFadeTop, vUv.y);
  if (uCut > 0.0) { if (a < uCut) discard; a = 1.0; }
  vec3 col = c.rgb * uTint * vTint * uBright;
  col = mix(col, uHaze, uHazeAmt);
  gl_FragColor = vec4(col, a * uOpacity);
}`;

// ---------- toon: 3D subjects with painted maps, 3 soft steps, warm light / cool shadow, hatching ----------
export const toonVert = /* glsl */ `
${INST}
uniform float uLenRep;
uniform vec4 uUvT; // scale.xy, offset.xy
uniform float uSwap;
varying vec3 vN, vWp;
varying vec2 vUv;
void main(){
  vec2 t = uSwap > 0.5 ? uv.yx : uv;
  if (uLenRep > 0.0) t.x *= length(IM[0].xyz) * uLenRep;
  vUv = t * uUvT.xy + uUvT.zw;
  mat4 m = modelMatrix * IM;
  vec4 wp = m * vec4(position, 1.0);
  vWp = wp.xyz;
  vN = normalize(mat3(m) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const toonFrag = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uSun, uWarm, uCool, uInk, uHaze, uTint;
uniform float uHazeAmt, uHatch, uRim, uGlow;
varying vec3 vN, vWp;
varying vec2 vUv;
float hatch(vec2 g, float k){ float h = abs(fract(k) - 0.5); return 1.0 - smoothstep(0.10, 0.22, h); }
void main(){
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float l = dot(n, uSun) * 0.5 + 0.5;
  float band = smoothstep(0.40, 0.45, l) * 0.55 + smoothstep(0.66, 0.71, l) * 0.45;
  vec3 tex = texture2D(uMap, vUv).rgb * uTint;
  vec3 col = tex * mix(uCool, uWarm, band);
  vec3 v = normalize(cameraPosition - vWp);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * smoothstep(0.35, 0.7, l);
  col += uWarm * rim * uRim;
  col += tex * uGlow;
  // comic hatching, screen space, only in the shadow bands; the ink stays crisp
  if (uHatch > 0.0) {
    vec2 g = gl_FragCoord.xy;
    float s1 = 1.0 - smoothstep(0.30, 0.43, l);
    float s2 = 1.0 - smoothstep(0.16, 0.28, l);
    float h1 = hatch(g, (g.x + g.y) / 4.5) * s1;
    float h2 = hatch(g, (g.x - g.y) / 4.5) * s2;
    col = mix(col, uInk, max(h1, h2) * uHatch);
  }
  col = mix(col, uHaze, uHazeAmt);
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------- ink outline: inverted hull, thin, warm-tinted, never washed by glow ----------
export const lineVert = /* glsl */ `
${INST}
uniform float uWidth;
void main(){
  mat4 m = modelMatrix * IM;
  vec4 wp = m * vec4(position, 1.0);
  vec3 n = normalize(mat3(m) * normal);
  wp.xyz += n * uWidth;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
export const lineFrag = /* glsl */ `
uniform vec3 uInk;
void main(){ gl_FragColor = vec4(uInk, 1.0); }`;

// ---------- sky: painted gradient + procedural twinkling stars + tap sparkle ----------
export const skyVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`;
export const skyFrag = /* glsl */ `
uniform sampler2D uMap;
uniform float uP, uAspect, uTexAspect, uTime, uStars, uSparkT;
uniform vec2 uPtr, uSpark;
varying vec2 vUv;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main(){
  // cover-fit horizontally; show a window of the tall painting that climbs with scroll
  float span = clamp(uTexAspect / uAspect, 0.32, 0.62);
  float v0 = mix(0.0, 1.0 - span, clamp(uP / 2.0, 0.0, 1.0));
  float sx = min(1.0, span * uAspect / uTexAspect);
  vec2 uv = vec2(0.5 + (vUv.x - 0.5) * sx, v0 + vUv.y * span);
  vec3 col = texture2D(uMap, uv).rgb;
  if (uStars > 0.001) {
    vec2 g = vec2(vUv.x * uAspect, vUv.y) * 34.0;
    vec2 id = floor(g); vec2 f = fract(g) - 0.5;
    float r = h21(id);
    vec2 o = vec2(h21(id + 7.1), h21(id + 3.7)) - 0.5;
    float d = length(f - o * 0.7);
    float tw = 0.55 + 0.45 * sin(uTime * (0.6 + r * 2.4) + r * 40.0);
    vec2 pp = (vUv * 2.0 - 1.0 - uSpark) * vec2(uAspect, 1.0);
    float sp = exp(-dot(pp, pp) * 6.0) * exp(-uSparkT * 1.6) * step(0.0, uSparkT);
    vec2 hp = (vUv * 2.0 - 1.0 - uPtr) * vec2(uAspect, 1.0);
    float hov = exp(-dot(hp, hp) * 10.0) * 0.6;
    float on = step(0.62, r);
    float core = smoothstep(0.06 + 0.03 * sp, 0.0, d) * on;
    float halo = smoothstep(0.22 + 0.18 * sp, 0.0, d) * on * 0.25;
    float s = (core + halo) * tw * (1.0 + sp * 2.5 + hov) * smoothstep(0.25, 0.75, vUv.y + uP * 0.12);
    col += vec3(1.0, 0.92, 0.78) * s * uStars * (0.4 + r * 0.6);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------- mist bands between depth layers ----------
export const mistFrag = /* glsl */ `
uniform vec3 uHaze; uniform float uOpacity, uTime;
varying vec2 vUv;
void main(){
  float y = vUv.y;
  float a = smoothstep(0.0, 0.45, y) * smoothstep(1.0, 0.5, y);
  a *= 0.75 + 0.25 * sin(vUv.x * 9.0 + uTime * 0.08) * sin(vUv.x * 3.7 - uTime * 0.05);
  gl_FragColor = vec4(uHaze, a * uOpacity);
}`;
export const plainVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// ---------- ground: painted moss floor that fades into haze ----------
export const groundVert = /* glsl */ `
varying vec3 vWp;
void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWp = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
export const groundFrag = /* glsl */ `
uniform vec3 uHaze, uA, uB;
varying vec3 vWp;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main(){
  float n = n2(vWp.xz * 0.6) * 0.6 + n2(vWp.xz * 2.3) * 0.4;
  vec3 col = mix(uA, uB, n);
  float d = clamp((-vWp.z - 2.0) / 60.0, 0.0, 1.0);
  col = mix(col, uHaze, pow(d, 0.7) * 0.9);
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------- points: fireflies, dust, smoke, flame (glow sprites sit under the ink) ----------
export const ptsVert = /* glsl */ `
attribute float aSize; attribute float aAlpha;
uniform float uPx;
varying float vA;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vA = aAlpha;
  gl_PointSize = aSize * uPx / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
export const ptsFrag = /* glsl */ `
uniform sampler2D uMap; uniform vec3 uColor; uniform float uOpacity;
varying float vA;
void main(){
  float a = texture2D(uMap, gl_PointCoord).r * vA * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * a, a);
}`;
export const smokeFrag = /* glsl */ `
uniform sampler2D uMap; uniform vec3 uColor;
varying float vA;
void main(){
  float a = texture2D(uMap, gl_PointCoord).r * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
}`;

// ---------- the letter: curled torn paper with flutter, normals from the curl ----------
export const letterVert = /* glsl */ `
uniform float uTime, uFlut;
varying vec3 vN, vWp;
varying vec2 vUv;
float zf(vec2 p, vec2 uv){
  float z = 0.18 * sin(p.x * 1.1 + 0.4);
  float c = clamp((uv.x + (1.0 - uv.y)) * 0.5 - 0.62, 0.0, 1.0);
  z += c * c * 4.2;
  float c2 = clamp(uv.y - 0.86, 0.0, 1.0);
  z += c2 * c2 * 6.0;
  z += uFlut * (sin(uTime * 2.1 + p.x * 2.2 + p.y * 1.3) * 0.06 + sin(uTime * 3.3 + p.y * 2.7) * 0.03) * (0.3 + uv.x);
  return z;
}
void main(){
  vUv = uv;
  vec3 p = position;
  float e = 0.02;
  float z0 = zf(p.xy, uv);
  float zx = zf(p.xy + vec2(e, 0.0), uv + vec2(e / 2.4, 0.0));
  float zy = zf(p.xy + vec2(0.0, e), uv + vec2(0.0, e / 3.15));
  p.z += z0;
  vec3 n = normalize(vec3(-(zx - z0) / e, -(zy - z0) / e, 1.0));
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWp = wp.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
export const letterFrag = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uSun, uWarm, uCool, uHaze, uInk;
uniform float uHazeAmt;
varying vec3 vN, vWp;
varying vec2 vUv;
void main(){
  vec4 c = texture2D(uMap, vUv);
  if (c.a < 0.5) discard;
  vec3 n = normalize(vN);
  vec3 base = c.rgb;
  if (!gl_FrontFacing) { n = -n; base = mix(c.rgb, vec3(0.86, 0.78, 0.64), 0.75); }
  float l = dot(n, uSun) * 0.5 + 0.5;
  float band = smoothstep(0.38, 0.44, l) * 0.6 + smoothstep(0.64, 0.7, l) * 0.4;
  vec3 col = base * mix(uCool, uWarm, band);
  // soft hatching in the curl's shadow
  vec2 g = gl_FragCoord.xy;
  float h = 1.0 - smoothstep(0.1, 0.22, abs(fract((g.x + g.y) / 4.5) - 0.5));
  col = mix(col, uInk, h * (1.0 - smoothstep(0.26, 0.4, l)) * 0.4);
  col = mix(col, uHaze, uHazeAmt);
  gl_FragColor = vec4(col, 1.0);
}`;
