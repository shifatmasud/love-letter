// Injected by tools/exp.py: render the scene into a target with a 16-bit depth buffer,
// like Chrome's default canvas on many Android GPUs when antialias and stencil are off.
// Set window.__near before injecting to try another near plane.
return (async () => {
  const THREE = await import('three');
  const { renderer, camera } = __pines;
  if (window.__near) { camera.near = window.__near; camera.updateProjectionMatrix(); }
  const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
  const dt = new THREE.DepthTexture(sz.x, sz.y); dt.type = THREE.UnsignedShortType; dt.format = THREE.DepthFormat;
  const rt = new THREE.WebGLRenderTarget(sz.x, sz.y, { depthTexture: dt, depthBuffer: true, stencilBuffer: false });
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { t: { value: rt.texture } }, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 v; void main(){ v = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: 'uniform sampler2D t; varying vec2 v; void main(){ gl_FragColor = texture2D(t, v); }' }));
  const qs = new THREE.Scene(); qs.add(q); const qc = new THREE.Camera();
  const orig = renderer.render.bind(renderer);
  renderer.render = (s, c) => { if (s === qs) return orig(s, c); const prev = renderer.getRenderTarget(); renderer.setRenderTarget(rt); orig(s, c); renderer.setRenderTarget(prev); orig(qs, qc); };
  return 'depth16 on, near ' + camera.near;
})();
