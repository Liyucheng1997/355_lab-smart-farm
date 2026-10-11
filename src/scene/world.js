// 渲染器 / 相机 / 天空 / 光照 / 后期处理 / 昼夜循环
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { clamp, lerp, smoothstep } from '../util.js';

// 清除 NaN/Inf 并限制 HDR 峰值，避免辉光扩散异常像素
const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    bool bad(float x){ return (floatBitsToUint(x) & 0x7f800000u) == 0x7f800000u; }
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      if (bad(c.r) || bad(c.g) || bad(c.b)) c = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 40.0), 1.0); }`,
};

const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, uStrength: { value: 0.35 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uStrength; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - 0.5; float v = 1.0 - dot(d,d) * uStrength * 2.2;
      gl_FragColor = vec4(c.rgb * v, c.a); }`,
};

// 天空关键帧：sunElev (度) -> 颜色
const SKY_KEYS = [
  { e: -18, top: 0x02040c, hor: 0x07101f, fog: 0x060c18, sun: 0x3a4a80, sunI: 0.0, hemi: 0.12, amb: 0x1a2a50 },
  { e: -6, top: 0x0a1430, hor: 0x2a2850, fog: 0x1a1f38, sun: 0x6a5aa0, sunI: 0.05, hemi: 0.2, amb: 0x2a3060 },
  { e: 0, top: 0x24407a, hor: 0xf08a4b, fog: 0xc48a6a, sun: 0xff8a3a, sunI: 0.6, hemi: 0.45, amb: 0x806070 },
  { e: 8, top: 0x3a6fb8, hor: 0xf5c18a, fog: 0xd8c0a0, sun: 0xffc27a, sunI: 1.8, hemi: 0.7, amb: 0x9a9aa0 },
  { e: 25, top: 0x3d7fd0, hor: 0xbcd8ee, fog: 0xbfd6e6, sun: 0xfff1d8, sunI: 3.0, hemi: 0.9, amb: 0xb8c8d8 },
  { e: 60, top: 0x2f72cc, hor: 0xb4d4f0, fog: 0xbcd4ea, sun: 0xffffff, sunI: 3.4, hemi: 1.0, amb: 0xc8d8e8 },
];
const _ca = new THREE.Color(), _cb = new THREE.Color();
function skyAt(elev) {
  let i = 0;
  while (i < SKY_KEYS.length - 2 && elev > SKY_KEYS[i + 1].e) i++;
  const a = SKY_KEYS[i], b = SKY_KEYS[i + 1];
  const t = clamp((elev - a.e) / (b.e - a.e), 0, 1);
  const mix = (k) => _ca.set(a[k]).lerp(_cb.set(b[k]), t).clone();
  return { top: mix('top'), hor: mix('hor'), fog: mix('fog'), sun: mix('sun'), amb: mix('amb'), sunI: lerp(a.sunI, b.sunI, t), hemi: lerp(a.hemi, b.hemi, t) };
}

export function createWorld(container, labelContainer) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer({ element: labelContainer });
  labelRenderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xbfd6e6, 0.0007);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.5, 5000);
  camera.position.set(-60, 420, 620);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, -10);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = 12;
  controls.maxDistance = 900;
  controls.zoomSpeed = 1.2;
  controls.update();

  // ---- 天空穹顶 ----
  const skyUniforms = {
    uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uBottom: { value: new THREE.Color(0x0b1a10) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() }, uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uNight: { value: 0 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2600, 48, 24),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uTop, uHor, uBottom, uSunDir, uSunColor, uMoonDir; uniform float uNight; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = h > 0.0 ? mix(uHor, uTop, pow(clamp(h,0.0,1.0), 0.55)) : mix(uHor, uBottom, clamp(-h*6.0,0.0,1.0));
          float s = max(dot(d, normalize(uSunDir)), 0.0);
          col += uSunColor * (pow(s, 900.0) * 30.0 + pow(s, 12.0) * 0.35 + pow(s, 3.0) * 0.12) * (1.0 - uNight*0.9);
          float m = max(dot(d, normalize(uMoonDir)), 0.0);
          col += vec3(0.75,0.85,1.0) * (smoothstep(0.9993, 0.9996, m) * 2.2 + pow(m, 40.0) * 0.18) * uNight;
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  // 星空
  const starGeo = new THREE.BufferGeometry();
  const sp = [], ss = [];
  for (let i = 0; i < 2600; i++) {
    const u = Math.random(), v = Math.random() * 0.95 + 0.05;
    const th = u * Math.PI * 2, ph = Math.acos(1 - v);
    const r = 2400;
    sp.push(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th));
    ss.push(Math.random() * 2.2 + 0.6);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  starGeo.setAttribute('size', new THREE.Float32BufferAttribute(ss, 1));
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } }, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float size; varying float vS; uniform float uTime; void main(){ vS = size; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * (0.8 + 0.3*sin(uTime*2.0 + position.x)); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uOpacity; varying float vS; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d); gl_FragColor = vec4(vec3(0.85,0.9,1.0)*(1.2+vS*0.3), a*uOpacity); }`,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  scene.add(stars);

  // ---- 光照 ----
  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x4a5a30, 0.9);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffffff, 0.15);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -300; sc.right = 300; sc.top = 300; sc.bottom = -300; sc.near = 10; sc.far = 1400;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);

  // ---- 后期处理 ----
  const size = new THREE.Vector2(window.innerWidth, window.innerHeight);
  const rt = new THREE.WebGLRenderTarget(size.x * renderer.getPixelRatio(), size.y * renderer.getPixelRatio(), { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const outline = new OutlinePass(size, scene, camera);
  outline.edgeStrength = 4; outline.edgeGlow = 0.8; outline.edgeThickness = 1.5; outline.pulsePeriod = 2.2;
  outline.visibleEdgeColor.set('#41f3ff'); outline.hiddenEdgeColor.set('#0b6f88');
  composer.addPass(outline);
  composer.addPass(new ShaderPass(SanitizeShader));
  const bloom = new UnrealBloomPass(size, 0.55, 0.55, 0.9);
  composer.addPass(bloom);
  const vignette = new ShaderPass(VignetteShader);
  composer.addPass(vignette);
  composer.addPass(new OutputPass());

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h); composer.setSize(w, h); labelRenderer.setSize(w, h);
  }
  window.addEventListener('resize', resize);

  // ---- 昼夜 ----
  const state = { night: 0, daylight: 1, sunDir: new THREE.Vector3(), elev: 45 };
  function setTimeOfDay(hour) {
    // 日出 6:05 日落 17:55 左右 (10 月)，最大高度角 ~48°
    const dayFrac = (hour - 6) / 12;
    const elevDeg = Math.sin(dayFrac * Math.PI) * 48 - (dayFrac < 0 || dayFrac > 1 ? 4 : 0);
    const az = lerp(110, -110, (hour - 6) / 12) * Math.PI / 180;
    const el = elevDeg * Math.PI / 180;
    // 东方 +x，正午偏南 +z
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.abs(Math.cos(az)) * Math.cos(el) * 0.9 + 0.1).normalize();
    state.sunDir.copy(dir);
    state.elev = elevDeg;
    const k = skyAt(elevDeg);
    const night = 1 - smoothstep(-8, 4, elevDeg);
    state.night = night;
    state.daylight = smoothstep(-4, 20, elevDeg);

    skyUniforms.uTop.value.copy(k.top);
    skyUniforms.uHor.value.copy(k.hor);
    skyUniforms.uSunDir.value.copy(dir);
    skyUniforms.uSunColor.value.copy(k.sun);
    skyUniforms.uNight.value = night;
    const moon = new THREE.Vector3(-dir.x, Math.max(0.35, -dir.y), -dir.z * 0.5 + 0.3).normalize();
    skyUniforms.uMoonDir.value.copy(moon);
    scene.fog.color.copy(k.fog);
    skyUniforms.uBottom.value.copy(k.fog).multiplyScalar(0.6);
    starMat.uniforms.uOpacity.value = night;

    // 太阳 / 月光共用一个方向光
    if (elevDeg > -3) {
      sun.position.copy(dir).multiplyScalar(700);
      sun.color.copy(k.sun);
      sun.intensity = k.sunI;
    } else {
      sun.position.copy(moon).multiplyScalar(700);
      sun.color.set(0x8fa8ff);
      sun.intensity = 0.35 * night;
    }
    sun.target.position.set(0, 0, 0);
    hemi.color.copy(k.top).lerp(new THREE.Color(0xffffff), 0.45);
    hemi.groundColor.set(0x3a4a28).multiplyScalar(0.4 + 0.6 * state.daylight);
    hemi.intensity = k.hemi;
    ambient.color.copy(k.amb);
    ambient.intensity = 0.25 + 0.25 * night;
    scene.environmentIntensity = 0.12 + 0.45 * state.daylight;
    bloom.strength = 0.5 + night * 0.6;
    bloom.threshold = lerp(1.5, 0.6, night);
    renderer.toneMappingExposure = lerp(1.0, 1.25, night);
  }

  return { renderer, labelRenderer, scene, camera, controls, composer, bloom, outline, sun, state, setTimeOfDay, starMat };
}
