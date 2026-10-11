// 地形、田块底土、道路、水库、树木、全息地面网格
import * as THREE from 'three';
import { FARM, ROADS, PLOTS, POND, HUB } from '../layout.js';
import { fbm, noise2, smoothstep, canvasTexture, mulberry32, clamp } from '../util.js';

export function farmEdgeDistance(x, z) {
  const dx = Math.max(FARM.xmin - x, 0, x - FARM.xmax);
  const dz = Math.max(FARM.zmin - z, 0, z - FARM.zmax);
  return Math.hypot(dx, dz);
}
export function terrainHeight(x, z) {
  const d = farmEdgeDistance(x, z);
  if (d <= 0) return 0;
  const hills = (fbm(x * 0.0045 + 3.1, z * 0.0045 - 1.7, 5) * 0.5 + 0.5) * 150 + 18;
  const ridge = Math.abs(noise2(x * 0.0021, z * 0.0021)) * 90;
  return smoothstep(10, 260, d) * (hills + ridge) + smoothstep(0, 40, d) * 1.5;
}

function soilTexture(kind) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const base = { rice: '#5d4a2a', corn: '#6a4e30', apple: '#4d5a2a', alfalfa: '#4f5b2a', gh: '#4a3a28' }[kind] || '#5a4630';
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    const r = mulberry32(kind.length * 97);
    for (let i = 0; i < 2200; i++) {
      ctx.fillStyle = `rgba(${r() < 0.5 ? '255,230,180' : '20,10,0'},${r() * 0.08})`;
      ctx.fillRect(r() * w, r() * h, 2 + r() * 3, 2 + r() * 3);
    }
    if (kind !== 'alfalfa') {
      for (let y = 0; y < h; y += 16) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(0, y, w, 5);
        ctx.fillStyle = 'rgba(255,220,160,0.06)'; ctx.fillRect(0, y + 7, w, 3);
      }
    }
    if (kind === 'rice') { ctx.fillStyle = 'rgba(90,120,140,0.18)'; ctx.fillRect(0, 0, w, h); }
  }, { repeat: [4, 4] });
}

function waterNormalMap() {
  const size = 256;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const hgt = (x, y) => {
    const u = x / size * Math.PI * 2, v = y / size * Math.PI * 2;
    return Math.sin(u * 3 + v * 2) * 0.5 + Math.sin(u * 7 - v * 5) * 0.25 + Math.sin(u * 13 + v * 11) * 0.12 + Math.cos(v * 9 - u * 2) * 0.2;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = hgt(x + 1, y) - hgt(x - 1, y), dy = hgt(x, y + 1) - hgt(x, y - 1);
    const n = new THREE.Vector3(-dx * 2.5, -dy * 2.5, 1).normalize();
    const i = (y * size + x) * 4;
    img.data[i] = (n.x * 0.5 + 0.5) * 255; img.data[i + 1] = (n.y * 0.5 + 0.5) * 255; img.data[i + 2] = (n.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  return t;
}

export function createTerrain(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // ---- 地形 ----
  const SIZE = 3600, SEG = 300;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cA = new THREE.Color(), cB = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h - 0.02);
    const n = fbm(x * 0.02, z * 0.02, 3);
    const inFarm = farmEdgeDistance(x, z) <= 0;
    if (inFarm) cA.setRGB(0.075 + n * 0.04, 0.17 + n * 0.06, 0.035);
    else {
      const t = clamp(h / 180, 0, 1);
      cA.setRGB(0.07 + n * 0.03, 0.15 + n * 0.05, 0.035);
      cB.setRGB(0.025, 0.07, 0.025);
      cA.lerp(cB, smoothstep(0.1, 0.6, t));
      cB.setRGB(0.16, 0.15, 0.12);
      cA.lerp(cB, smoothstep(0.75, 1.0, t) * 0.6);
    }
    colors[i * 3] = cA.r; colors[i * 3 + 1] = cA.g; colors[i * 3 + 2] = cA.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const detail = canvasTexture(256, 256, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = 0.82 + (noise2(x * 0.09, y * 0.09) * 0.5 + noise2(x * 0.31 + 7, y * 0.31) * 0.35) * 0.35 + Math.random() * 0.1;
      const i = (y * w + x) * 4; const v = Math.min(255, n * 235);
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v * 0.95; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, { repeat: [700, 700] });
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.96, metalness: 0 }));
  ground.receiveShadow = true;
  group.add(ground);

  // ---- 田块底土 ----
  const texCache = {};
  for (const p of PLOTS) {
    const kind = p.greenhouse ? 'gh' : p.crop;
    texCache[kind] ||= soilTexture(kind);
    let g;
    if (p.circle) g = new THREE.CircleGeometry(p.r + 1, 64);
    else g = new THREE.PlaneGeometry(p.w + 1, p.d + 1);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: texCache[kind], roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    m.position.set(p.x, 0.02, p.z);
    m.receiveShadow = true;
    group.add(m);
  }

  // ---- 道路 ----
  const roadMat = new THREE.MeshStandardMaterial({
    map: canvasTexture(64, 256, (ctx, w, h) => {
      ctx.fillStyle = '#8a7a5e'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 600; i++) { ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '60,50,35' : '200,190,160'},0.15)`; ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      ctx.fillStyle = 'rgba(70,60,40,0.35)'; ctx.fillRect(8, 0, 6, h); ctx.fillRect(w - 14, 0, 6, h);
    }),
    roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  for (const r of ROADS) {
    const vertical = r.d > r.w;
    const g = new THREE.PlaneGeometry(vertical ? r.w : r.d, vertical ? r.d : r.w);
    g.rotateX(-Math.PI / 2);
    if (!vertical) g.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(g, roadMat);
    m.position.set(r.x, 0.04, r.z);
    m.receiveShadow = true;
    group.add(m);
  }

  // ---- 水库 ----
  const pondShape = new THREE.Shape();
  for (let i = 0; i <= 64; i++) {
    const a = i / 64 * Math.PI * 2;
    const k = 1 + 0.08 * Math.sin(a * 3) + 0.05 * Math.cos(a * 5);
    const x = Math.cos(a) * POND.rx * k, y = Math.sin(a) * POND.rz * k;
    i === 0 ? pondShape.moveTo(x, y) : pondShape.lineTo(x, y);
  }
  const bank = new THREE.Mesh(new THREE.ShapeGeometry(pondShape, 64).rotateX(-Math.PI / 2).scale(1.08, 1, 1.12),
    new THREE.MeshStandardMaterial({ color: 0x7a6a4a, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }));
  bank.position.set(POND.x, 0.03, POND.z);
  group.add(bank);
  const normalMap = waterNormalMap();
  const water = new THREE.Mesh(new THREE.ShapeGeometry(pondShape, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x0f4a5c, roughness: 0.06, metalness: 0.35, normalMap, normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 1.6, polygonOffset: true, polygonOffsetFactor: -3 }));
  water.position.set(POND.x, 0.12, POND.z);
  water.receiveShadow = true;
  group.add(water);

  // ---- 树木 ----
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 3, 6).translate(0, 1.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(2.6, 1).translate(0, 5, 0);
  const pineGeo = new THREE.ConeGeometry(2.4, 7.5, 7).translate(0, 6, 0);
  const trees = [];
  const rr = mulberry32(99);
  const tryTree = (x, z) => {
    const h = terrainHeight(x, z);
    if (h > 175) return;
    trees.push({ x, z, y: h, s: 0.8 + rr() * 0.8, pine: h > 30 ? rr() < 0.7 : rr() < 0.25 });
  };
  // 农场边界防护林
  for (let x = FARM.xmin - 8; x <= FARM.xmax + 8; x += 7) { tryTree(x + rr() * 3, FARM.zmin - 9 - rr() * 6); tryTree(x + rr() * 3, FARM.zmax + 9 + rr() * 6); }
  for (let z = FARM.zmin; z <= FARM.zmax; z += 7) { tryTree(FARM.xmin - 9 - rr() * 6, z + rr() * 3); tryTree(FARM.xmax + 9 + rr() * 6, z + rr() * 3); }
  // 道路行道树
  for (let z = -90; z < 45; z += 12) { tryTree(-9, z); tryTree(9, z + 6); }
  // 山林
  for (let i = 0; i < 2600; i++) {
    const a = rr() * Math.PI * 2, r = 300 + Math.pow(rr(), 0.8) * 900;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (farmEdgeDistance(x, z) < 25) continue;
    if (fbm(x * 0.006, z * 0.006, 3) < -0.04) continue;
    tryTree(x, z);
  }
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
  const broad = trees.filter((t) => !t.pine), pines = trees.filter((t) => t.pine);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
  const crowns = new THREE.InstancedMesh(crownGeo, leafMat, broad.length);
  const pineMesh = new THREE.InstancedMesh(pineGeo, leafMat, pines.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p3 = new THREE.Vector3(), col = new THREE.Color();
  trees.forEach((t, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rr() * 6.28);
    m4.compose(p3.set(t.x, t.y - 0.2, t.z), q, s.set(t.s, t.s * (0.9 + rr() * 0.4), t.s));
    trunks.setMatrixAt(i, m4);
  });
  broad.forEach((t, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rr() * 6.28);
    m4.compose(p3.set(t.x, t.y - 0.2, t.z), q, s.set(t.s * (0.9 + rr() * 0.3), t.s * (0.9 + rr() * 0.5), t.s * (0.9 + rr() * 0.3)));
    crowns.setMatrixAt(i, m4);
    const autumn = rr();
    col.setHSL(autumn < 0.18 ? 0.08 + rr() * 0.04 : 0.22 + rr() * 0.08, 0.55, 0.28 + rr() * 0.12);
    crowns.setColorAt(i, col);
  });
  pines.forEach((t, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rr() * 6.28);
    m4.compose(p3.set(t.x, t.y - 0.2, t.z), q, s.set(t.s, t.s * (0.9 + rr() * 0.6), t.s));
    pineMesh.setMatrixAt(i, m4);
    col.setHSL(0.3 + rr() * 0.06, 0.45, 0.18 + rr() * 0.08);
    pineMesh.setColorAt(i, col);
  });
  for (const m of [trunks, crowns, pineMesh]) { m.castShadow = true; m.receiveShadow = true; group.add(m); }

  // ---- 全息地面网格 + 扫描波 ----
  const holoUniforms = {
    uTime: { value: 0 }, uGrid: { value: 0.0 }, uWaveR: { value: 0 }, uWaveA: { value: 1 },
    uCenter: { value: new THREE.Vector2(HUB.x, HUB.z) }, uColor: { value: new THREE.Color(0x35e8ff) },
  };
  const holo = new THREE.Mesh(
    new THREE.PlaneGeometry(520, 520).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: holoUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uTime, uGrid, uWaveR, uWaveA; uniform vec2 uCenter; uniform vec3 uColor; varying vec3 vW;
        float gridLine(vec2 p, float s){ vec2 q = p / s; vec2 g = abs(fract(q - 0.5) - 0.5) / max(fwidth(q), vec2(1e-4)); return 1.0 - min(min(g.x, g.y), 1.0); }
        void main(){
          vec2 p = vW.xz;
          float l1 = gridLine(p, 10.0), l2 = gridLine(p, 50.0);
          float d = length(p - uCenter);
          float wave = exp(-pow((d - uWaveR) / 5.0, 2.0));
          float trail = smoothstep(uWaveR - 70.0, uWaveR, d) * step(d, uWaveR);
          float fade = 1.0 - smoothstep(170.0, 255.0, max(abs(p.x), abs(p.y + 8.0)));
          vec3 c = uColor * ((l1 * 0.18 + l2 * 0.45) * uGrid + wave * 0.9 * uWaveA + trail * 0.07 * uWaveA);
          c += uColor * (l1 + l2) * (wave * 1.6 + trail * 0.25) * uWaveA;
          gl_FragColor = vec4(c * fade, 1.0);
        }`,
    }),
  );
  holo.position.y = 0.09;
  holo.renderOrder = 2;
  group.add(holo);

  return {
    group, water, holoUniforms,
    update(t, dt) {
      normalMap.offset.x = t * 0.012; normalMap.offset.y = t * 0.008;
      holoUniforms.uTime.value = t;
      const period = 7;
      const ph = (t % period) / period;
      holoUniforms.uWaveR.value = ph * 330;
      holoUniforms.uWaveA.value = (1 - ph) * 0.9;
    },
  };
}
