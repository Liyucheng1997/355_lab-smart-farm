// 作物：程序化建模 + GPU 实例化 + 风场摆动 + 多光谱(NDVI)着色 + 收割
import * as THREE from 'three';
import { PLOTS, HOTSPOTS } from '../layout.js';
import { mergeColored, tx, mulberry32, fbm } from '../util.js';

export const cropUniforms = { uTime: { value: 0 }, uWind: { value: 1 }, uNdvi: { value: 0 } };

function cropMaterial(sway, heightRef, extra = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide, ...extra });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = cropUniforms.uTime;
    sh.uniforms.uWind = cropUniforms.uWind;
    sh.uniforms.uNdvi = cropUniforms.uNdvi;
    sh.uniforms.uSway = { value: sway };
    sh.uniforms.uHRef = { value: heightRef };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uWind, uSway, uHRef; attribute float aHealth; attribute float aCut; varying float vHealth; varying float vCut;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vHealth = aHealth; vCut = aCut;
        float hN = clamp(position.y / uHRef, 0.0, 1.0);
        transformed.y *= mix(1.0, 0.13, aCut);
        vec2 ip = vec2(0.0);
        #ifdef USE_INSTANCING
          ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
        #endif
        float gust = sin(uTime * 0.9 - (ip.x * 0.8 + ip.y * 0.6) * 0.06) * 0.5 + 0.5;
        float w = sin(uTime * 1.9 + ip.x * 0.31 + ip.y * 0.17) * 0.35 + sin(uTime * 3.7 + ip.x * 0.9) * 0.12;
        float amp = uSway * uWind * hN * hN * (1.0 - aCut);
        transformed.x += (w + gust * 0.9) * amp;
        transformed.z += (w * 0.6 + gust * 0.3) * amp;
        transformed.y -= gust * amp * 0.25;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNdvi; varying float vHealth; varying float vCut;
        vec3 ndviRamp(float h){ vec3 a = vec3(0.95,0.08,0.04), b = vec3(1.0,0.82,0.08), c = vec3(0.05,0.95,0.32);
          return h < 0.55 ? mix(a, b, smoothstep(0.15, 0.55, h)) : mix(b, c, smoothstep(0.55, 0.88, h)); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float sick = clamp(1.0 - vHealth, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.62, 0.48, 0.32) + vec3(0.1, 0.06, 0.0), smoothstep(0.1, 0.6, sick));
        vec3 nd = ndviRamp(vHealth);
        diffuseColor.rgb = mix(diffuseColor.rgb, nd * 0.22, uNdvi * 0.9);
        totalEmissiveRadiance += nd * nd * uNdvi * 0.42 * (1.0 - vCut * 0.7);`);
  };
  return mat;
}

// ---------- 几何体 ----------
function riceTuft() {
  const r = mulberry32(11);
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2, d = r() * 0.28;
    const h = 0.85 + r() * 0.3;
    const lean = (r() - 0.5) * 0.3;
    const ox = Math.cos(a) * d, oz = Math.sin(a) * d;
    parts.push([tx(new THREE.CylinderGeometry(0.012, 0.022, h, 3, 1, true), { y: h / 2, rz: lean, x: ox, z: oz }), '#b8a94e']);
    // 叶片
    parts.push([tx(new THREE.PlaneGeometry(0.05, h * 0.7), { y: h * 0.35, rz: lean * 2 + 0.4, ry: a, x: ox, z: oz }), '#9a9d3e']);
    // 稻穗（弯垂）
    const topX = ox - Math.sin(lean) * h * 0.5, topY = h * 0.5 + Math.cos(lean) * h * 0.5;
    parts.push([tx(new THREE.ConeGeometry(0.05, 0.32, 4, 1, true).translate(0, -0.16, 0), { rz: Math.PI * 0.7, ry: a, x: topX, y: topY, z: oz }), '#e9bb4c']);
  }
  return mergeColored(parts);
}
function cornPlant() {
  const parts = [];
  const H = 2.6;
  parts.push([tx(new THREE.CylinderGeometry(0.035, 0.06, H, 5), { y: H / 2 }), '#b9a35b']);
  for (let i = 0; i < 7; i++) {
    const y = 0.45 + i * 0.3;
    const g = new THREE.PlaneGeometry(1.05 - i * 0.07, 0.11, 6, 1);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const x = p.getX(k) + 0.5; p.setY(k, p.getY(k) - x * x * 0.45 + x * 0.25); }
    g.translate(0.5 * (1.05 - i * 0.07), 0, 0);
    tx(g, { rx: 0.25, ry: i * 2.4, y });
    parts.push([g, i < 3 ? '#a3964a' : '#8b9a42']);
  }
  parts.push([tx(new THREE.CylinderGeometry(0.075, 0.06, 0.38, 6), { y: 1.25, x: 0.1, rz: -0.35 }), '#d9c27a']);
  parts.push([tx(new THREE.ConeGeometry(0.1, 0.4, 5), { y: H + 0.18 }), '#c7a456']);
  return mergeColored(parts);
}
function alfalfaTuft() {
  const r = mulberry32(5);
  const parts = [];
  for (let i = 0; i < 3; i++) parts.push([tx(new THREE.IcosahedronGeometry(0.36, 0), { x: (r() - 0.5) * 0.6, z: (r() - 0.5) * 0.6, y: 0.25 + r() * 0.2, sy: 0.8 }), i % 2 ? '#3f9a3a' : '#4fae45']);
  for (let i = 0; i < 2; i++) parts.push([tx(new THREE.OctahedronGeometry(0.08, 0), { x: (r() - 0.5) * 0.7, z: (r() - 0.5) * 0.7, y: 0.55 + r() * 0.1 }), '#9b6be0']);
  return mergeColored(parts);
}
function appleTree() {
  const r = mulberry32(21);
  const parts = [];
  parts.push([tx(new THREE.CylinderGeometry(0.16, 0.24, 1.8, 6), { y: 0.9 }), '#5b4030']);
  parts.push([tx(new THREE.IcosahedronGeometry(1.6, 1), { y: 2.7, sy: 0.85 }), '#3d7a32']);
  parts.push([tx(new THREE.IcosahedronGeometry(1.1, 1), { y: 3.2, x: 0.6, z: 0.3 }), '#4a8a3a']);
  parts.push([tx(new THREE.IcosahedronGeometry(1.0, 1), { y: 2.9, x: -0.7, z: -0.2 }), '#447f36']);
  for (let i = 0; i < 18; i++) {
    const a = r() * Math.PI * 2, b = (r() - 0.3) * 1.2;
    const R = 1.55;
    parts.push([tx(new THREE.IcosahedronGeometry(0.14, 0), { x: Math.cos(a) * Math.cos(b) * R, y: 2.7 + Math.sin(b) * R * 0.85, z: Math.sin(a) * Math.cos(b) * R }), r() < 0.8 ? '#d42a22' : '#e8b13a']);
  }
  return mergeColored(parts);
}
function tomatoPlant(fruit = '#e8382b', leaf = '#3f8f3a') {
  const r = mulberry32(31);
  const parts = [];
  parts.push([tx(new THREE.CylinderGeometry(0.02, 0.03, 2.2, 4), { y: 1.1 }), '#4a7a32']);
  for (let i = 0; i < 6; i++) parts.push([tx(new THREE.IcosahedronGeometry(0.28, 0), { y: 0.4 + i * 0.32, x: (r() - 0.5) * 0.3, z: (r() - 0.5) * 0.3, sx: 1.3, sy: 0.6 }), leaf]);
  for (let i = 0; i < 9; i++) parts.push([tx(new THREE.IcosahedronGeometry(0.08, 0), { y: 0.5 + r() * 1.4, x: (r() - 0.5) * 0.45, z: (r() - 0.5) * 0.45 }), r() < 0.7 ? fruit : '#f29b3a']);
  return mergeColored(parts);
}
function cucumberPlant() {
  const r = mulberry32(41);
  const parts = [];
  parts.push([tx(new THREE.CylinderGeometry(0.02, 0.03, 2.4, 4), { y: 1.2 }), '#4a8a32']);
  for (let i = 0; i < 7; i++) parts.push([tx(new THREE.CircleGeometry(0.22, 6), { y: 0.4 + i * 0.3, x: (r() - 0.5) * 0.3, rx: -0.6, ry: r() * 6 }), '#3f9a3a']);
  for (let i = 0; i < 5; i++) parts.push([tx(new THREE.CapsuleGeometry(0.035, 0.24, 2, 5), { y: 0.6 + r() * 1.3, x: (r() - 0.5) * 0.35, z: (r() - 0.5) * 0.35 }), '#2f6a25']);
  return mergeColored(parts);
}
function lettuce() {
  return mergeColored([
    [tx(new THREE.IcosahedronGeometry(0.22, 0), { y: 0.12, sy: 0.55 }), '#8fdc5a'],
    [tx(new THREE.IcosahedronGeometry(0.15, 0), { y: 0.2, sy: 0.7 }), '#b8f07a'],
  ]);
}
function strawberry() {
  const r = mulberry32(51);
  const parts = [[tx(new THREE.IcosahedronGeometry(0.2, 0), { y: 0.15, sy: 0.5, sx: 1.3, sz: 1.3 }), '#3b8a36']];
  for (let i = 0; i < 4; i++) parts.push([tx(new THREE.ConeGeometry(0.045, 0.09, 6), { rx: Math.PI, y: 0.12, x: (r() - 0.5) * 0.4, z: (r() - 0.5) * 0.4 }), '#e8213f']);
  parts.push([tx(new THREE.IcosahedronGeometry(0.03, 0), { y: 0.26, x: 0.05 }), '#ffffff']);
  return mergeColored(parts);
}

function grassTuft() {
  const r = mulberry32(61);
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const h = 0.25 + r() * 0.35, a = r() * Math.PI, lean = (r() - 0.5) * 0.6;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.04, 0, 0, 0.04, 0, 0, lean * h, h, 0], 3));
    g.computeVertexNormals();
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
    tx(g, { ry: a, x: (r() - 0.5) * 0.4, z: (r() - 0.5) * 0.4 });
    parts.push([g, r() < 0.5 ? '#4d7a2a' : '#6a8f34']);
  }
  return mergeColored(parts);
}

const BUILDERS = {
  rice: { geo: riceTuft, spacing: 1.05, rows: 1.05, sway: 0.28, h: 1.2, shadow: false },
  corn: { geo: cornPlant, spacing: 1.25, rows: 1.6, sway: 0.18, h: 2.8, shadow: true },
  alfalfa: { geo: alfalfaTuft, spacing: 1.35, rows: 1.35, sway: 0.08, h: 0.7, shadow: false },
  apple: { geo: appleTree, spacing: 4.6, rows: 6.5, sway: 0.05, h: 4.5, shadow: true },
  tomato: { geo: () => tomatoPlant(), spacing: 0.9, rows: 1.8, sway: 0.03, h: 2.3, shadow: false },
  cucumber: { geo: cucumberPlant, spacing: 0.9, rows: 1.8, sway: 0.03, h: 2.4, shadow: false },
  lettuce: { geo: lettuce, spacing: 0.55, rows: 0.9, sway: 0.0, h: 0.3, shadow: false },
  strawberry: { geo: strawberry, spacing: 0.5, rows: 1.2, sway: 0.0, h: 0.3, shadow: false },
};

export function createCrops(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const geoCache = {}, matCache = {};
  const plotData = {};
  const r = mulberry32(2026);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p3 = new THREE.Vector3(), col = new THREE.Color();
  const Y = new THREE.Vector3(0, 1, 0);

  for (const plot of PLOTS) {
    const B = BUILDERS[plot.crop];
    geoCache[plot.crop] ||= B.geo();
    matCache[plot.crop] ||= cropMaterial(B.sway, B.h);
    const pts = [];
    if (plot.circle) {
      for (let x = -plot.r; x <= plot.r; x += B.rows) for (let z = -plot.r; z <= plot.r; z += B.spacing) {
        if (x * x + z * z < (plot.r - 0.6) ** 2) pts.push([plot.x + x + (r() - 0.5) * 0.4, plot.z + z + (r() - 0.5) * 0.4]);
      }
    } else if (plot.greenhouse) {
      const rowsX = [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5];
      for (const rx of rowsX) for (let z = -plot.d / 2 + 3; z <= plot.d / 2 - 3; z += B.spacing) {
        const sub = B.rows < 1.5 ? [-0.35, 0.35] : [0];
        for (const o of sub) pts.push([plot.x + rx + o, plot.z + z + (r() - 0.5) * 0.08]);
      }
    } else {
      for (let x = -plot.w / 2 + 0.8; x <= plot.w / 2 - 0.8; x += B.spacing) for (let z = -plot.d / 2 + 0.8; z <= plot.d / 2 - 0.8; z += B.rows) {
        const j = plot.crop === 'apple' ? 0.2 : 0.25;
        pts.push([plot.x + x + (r() - 0.5) * j, plot.z + z + (r() - 0.5) * j]);
      }
    }
    const n = pts.length;
    const mesh = new THREE.InstancedMesh(geoCache[plot.crop], matCache[plot.crop], n);
    const health = new Float32Array(n), cut = new Float32Array(n);
    pts.forEach(([x, z], i) => {
      const sc = 0.85 + r() * 0.3;
      q.setFromAxisAngle(Y, r() * Math.PI * 2);
      m4.compose(p3.set(x, 0, z), q, s.set(sc, sc * (0.9 + r() * 0.2), sc));
      mesh.setMatrixAt(i, m4);
      const b = 0.88 + r() * 0.2;
      col.setRGB(b, b, b * (0.95 + r() * 0.08));
      mesh.setColorAt(i, col);
      // 健康度场：大尺度长势 + 局部病害热点
      let h = 0.86 + fbm(x * 0.05, z * 0.05, 3) * 0.25 + (r() - 0.5) * 0.04;
      for (const hs of HOTSPOTS) {
        if (hs.plot !== plot.id) continue;
        const d2 = ((x - hs.x) ** 2 + (z - hs.z) ** 2) / (hs.r * hs.r);
        h -= hs.severity * Math.exp(-d2 * 1.2);
      }
      health[i] = Math.min(1, Math.max(0.05, h));
    });
    const hAttr = new THREE.InstancedBufferAttribute(health, 1);
    const cAttr = new THREE.InstancedBufferAttribute(cut, 1);
    cAttr.setUsage(THREE.DynamicDrawUsage);
    mesh.geometry = mesh.geometry.clone();
    mesh.geometry.setAttribute('aHealth', hAttr);
    mesh.geometry.setAttribute('aCut', cAttr);
    mesh.castShadow = B.shadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    const meanHealth = health.reduce((a, b) => a + b, 0) / n;
    plotData[plot.id] = { plot, mesh, pts, health, cut, cAttr, count: n, meanHealth };
  }

  // 草地簇（牧场 / 空地），复用作物风场着色器
  {
    const zones = [{ xmin: 30, xmax: 212, zmin: 66, zmax: 160, n: 9000 }, { xmin: 140, xmax: 212, zmin: 170, zmax: 212, n: 1200 }, { xmin: -225, xmax: 225, zmin: -232, zmax: 215, n: 14000, avoid: true }];
    const inPlot = (x, z) => PLOTS.some((p) => p.circle ? (x - p.x) ** 2 + (z - p.z) ** 2 < (p.r + 3) ** 2 : Math.abs(x - p.x) < p.w / 2 + 3 && Math.abs(z - p.z) < p.d / 2 + 3);
    const blocked = (x, z) => inPlot(x, z) || Math.abs(x) < 6 || Math.abs(z + 100) < 6 || Math.abs(z - 50) < 6 || (x > 25 && x < 215 && z > 60 && z < 215) || ((x - 160) ** 2 / 60 ** 2 + (z + 25) ** 2 / 42 ** 2 < 1) || (z < -190) || (Math.abs(x - 45) < 20 && Math.abs(z + 40) < 16);
    const pts = [];
    for (const zn of zones) for (let i = 0; i < zn.n; i++) {
      const x = zn.xmin + r() * (zn.xmax - zn.xmin), z = zn.zmin + r() * (zn.zmax - zn.zmin);
      if (zn.avoid && blocked(x, z)) continue;
      pts.push([x, z]);
    }
    const mesh = new THREE.InstancedMesh(grassTuft(), cropMaterial(0.12, 0.6), pts.length);
    const health = new Float32Array(pts.length).fill(1), cut = new Float32Array(pts.length);
    pts.forEach(([x, z], i) => {
      const sc = 0.8 + r() * 0.9;
      q.setFromAxisAngle(Y, r() * Math.PI * 2);
      m4.compose(p3.set(x, 0, z), q, s.set(sc, sc, sc));
      mesh.setMatrixAt(i, m4);
      const k = 0.7 + fbm(x * 0.03, z * 0.03, 2) * 0.8;
      col.setRGB(0.55 * k + 0.2, 0.75 * k + 0.2, 0.5 * k);
      mesh.setColorAt(i, col);
    });
    mesh.geometry.setAttribute('aHealth', new THREE.InstancedBufferAttribute(health, 1));
    mesh.geometry.setAttribute('aCut', new THREE.InstancedBufferAttribute(cut, 1));
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return {
    group, plotData,
    // NDVI = 由健康度映射（成熟期整体偏低时仍做相对比较）
    ndviOf(id) { const d = plotData[id]; return 0.35 + d.meanHealth * 0.5; },
    update(t) { cropUniforms.uTime.value = t; },
  };
}
