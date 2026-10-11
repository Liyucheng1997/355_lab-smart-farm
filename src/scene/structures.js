// 农场设施：牛舍、筒仓、智能温室、数据中心、光伏、风机、中心支轴喷灌、围栏、路灯 ...
import * as THREE from 'three';
import { PLOTS, PASTURE, CHICKEN_YARD, HUB, plotById } from '../layout.js';
import { tx, mergeColored, canvasTexture, mulberry32, glowSprite } from '../util.js';
import { terrainHeight } from './terrain.js';

const M = {
  red: new THREE.MeshStandardMaterial({ color: 0x9b2d24, roughness: 0.8 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf0ede4, roughness: 0.7 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x3d4248, roughness: 0.5, metalness: 0.6 }),
  metal: new THREE.MeshStandardMaterial({ color: 0xb8c0c8, roughness: 0.35, metalness: 0.75 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.3, metalness: 0.6 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0xa9a59c, roughness: 0.95 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x23272c, roughness: 0.6, metalness: 0.3 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.95 }),
  hubGlass: new THREE.MeshStandardMaterial({ color: 0x0c2233, roughness: 0.12, metalness: 0.9, envMapIntensity: 1.5 }),
  glass: new THREE.MeshStandardMaterial({ color: 0xd6f0ff, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 2 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd49a, emissiveIntensity: 0 }),
  window: new THREE.MeshStandardMaterial({ color: 0x2a3440, emissive: 0xffc070, emissiveIntensity: 0, roughness: 0.3 }),
  grow: new THREE.MeshStandardMaterial({ color: 0x331133, emissive: 0xff3ad0, emissiveIntensity: 0 }),
  cyan: new THREE.MeshStandardMaterial({ color: 0x062a33, emissive: 0x36e6ff, emissiveIntensity: 2.2 }),
  beacon: new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2a2a, emissiveIntensity: 3 }),
  straw: new THREE.MeshStandardMaterial({ color: 0xd9b45a, roughness: 1 }),
  water: new THREE.MeshStandardMaterial({ color: 0x1b5a6a, roughness: 0.1, metalness: 0.3 }),
};
const cyanLine = new THREE.LineBasicMaterial({ color: new THREE.Color(0.35, 2.4, 3.0), transparent: true, opacity: 0.95 });

function mesh(geo, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, cast = true, recv = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = cast; m.receiveShadow = recv;
  return m;
}
function edges(m, mat = cyanLine) {
  const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), mat);
  l.position.copy(m.position); l.rotation.copy(m.rotation); l.scale.copy(m.scale);
  return l;
}
function pickSlab(w, h, d, data) {
  const s = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial());
  s.position.y = h / 2; s.visible = false; s.userData.pick = data;
  return s;
}

// ------------------------------------------------------------
function barn() {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-12, 0); shape.lineTo(12, 0); shape.lineTo(12, 8); shape.lineTo(0, 14); shape.lineTo(-12, 8); shape.lineTo(-12, 0);
  const body = mesh(new THREE.ExtrudeGeometry(shape, { depth: 30, bevelEnabled: false }).translate(0, 0, -15), M.red);
  g.add(body);
  const slope = Math.atan2(6, 12), len = Math.hypot(12, 6) + 1;
  g.add(mesh(new THREE.BoxGeometry(len, 0.35, 31.5), M.roof, { x: -6, y: 11.25, rz: slope }));
  g.add(mesh(new THREE.BoxGeometry(len, 0.35, 31.5), M.roof, { x: 6, y: 11.25, rz: -slope }));
  // 北侧大门
  for (const zf of [-15.05, 15.05]) {
    const s = zf < 0 ? -1 : 1;
    g.add(mesh(new THREE.BoxGeometry(9, 7.5, 0.3), M.red, { y: 3.75, z: zf + s * 0.1 }));
    g.add(mesh(new THREE.BoxGeometry(9.6, 0.4, 0.4), M.white, { y: 7.5, z: zf + s * 0.2 }));
    g.add(mesh(new THREE.BoxGeometry(0.4, 7.5, 0.4), M.white, { x: -4.6, y: 3.75, z: zf + s * 0.2 }));
    g.add(mesh(new THREE.BoxGeometry(0.4, 7.5, 0.4), M.white, { x: 4.6, y: 3.75, z: zf + s * 0.2 }));
    const diag = Math.atan2(7.5, 9);
    g.add(mesh(new THREE.BoxGeometry(11.6, 0.3, 0.3), M.white, { y: 3.75, z: zf + s * 0.25, rz: diag }));
    g.add(mesh(new THREE.BoxGeometry(11.6, 0.3, 0.3), M.white, { y: 3.75, z: zf + s * 0.25, rz: -diag }));
    g.add(mesh(new THREE.BoxGeometry(3, 2, 0.2), M.window, { y: 10.2, z: zf + s * 0.15 }));
  }
  for (let i = -2; i <= 2; i++) for (const x of [-12.1, 12.1]) {
    g.add(mesh(new THREE.BoxGeometry(0.2, 1.6, 2.2), M.window, { x, y: 5, z: i * 5.5 }));
    g.add(mesh(new THREE.BoxGeometry(0.3, 2.0, 2.6), M.white, { x: x * 1.002, y: 5, z: i * 5.5, cast: false }));
  }
  // 屋顶通风塔
  g.add(mesh(new THREE.BoxGeometry(3, 2.5, 3), M.white, { y: 15 }));
  g.add(mesh(new THREE.ConeGeometry(2.6, 2, 4).rotateY(Math.PI / 4), M.roof, { y: 17.2 }));
  // 屋顶光伏
  const pv = new THREE.MeshStandardMaterial({ color: 0x1a2e5a, metalness: 0.6, roughness: 0.2 });
  g.add(mesh(new THREE.BoxGeometry(10, 0.12, 22), pv, { x: 6.2, y: 11.55, rz: -slope }));
  return g;
}

function silo() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(4, 4, 22, 28), M.steel, { y: 11 }));
  g.add(mesh(new THREE.SphereGeometry(4.05, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.steel, { y: 22 }));
  for (let y = 2; y < 22; y += 3) g.add(mesh(new THREE.TorusGeometry(4.05, 0.08, 4, 32), M.metal, { y, rx: Math.PI / 2, cast: false }));
  g.add(mesh(new THREE.BoxGeometry(0.6, 22, 0.3), M.metal, { x: 4.2, y: 11 }));
  return g;
}

function greenhouse(p) {
  const g = new THREE.Group();
  g.position.set(p.x, 0, p.z);
  const W = p.w, L = p.d, R = W / 2, H = 2.8;
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 32, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), M.glass);
  arch.position.y = H; arch.renderOrder = 3;
  g.add(arch);
  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(L, H).rotateY(Math.PI / 2), M.glass);
    wall.position.set(s * R, H / 2, 0); wall.renderOrder = 3; g.add(wall);
  }
  const end = new THREE.Shape();
  end.moveTo(-R, 0); end.lineTo(R, 0); end.lineTo(R, H); end.absarc(0, H, R, 0, Math.PI, false); end.lineTo(-R, 0);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.ShapeGeometry(end, 24), M.glass);
    e.position.z = s * L / 2; e.renderOrder = 3; g.add(e);
  }
  // 框架
  const ribs = [];
  for (let z = -L / 2; z <= L / 2 + 0.01; z += 5) {
    ribs.push([tx(new THREE.TorusGeometry(R, 0.09, 4, 24, Math.PI), { y: H, z }), '#e8eef2']);
    ribs.push([tx(new THREE.BoxGeometry(0.16, H, 0.16), { x: -R, y: H / 2, z }), '#e8eef2']);
    ribs.push([tx(new THREE.BoxGeometry(0.16, H, 0.16), { x: R, y: H / 2, z }), '#e8eef2']);
  }
  ribs.push([tx(new THREE.BoxGeometry(0.2, 0.2, L), { y: H + R }), '#e8eef2']);
  for (const s of [-1, 1]) ribs.push([tx(new THREE.BoxGeometry(0.16, 0.16, L), { x: s * R, y: H }), '#e8eef2']);
  ribs.push([tx(new THREE.BoxGeometry(W, 0.4, L), { y: 0.2 }), '#6c6c66']);
  const frame = new THREE.Mesh(mergeColored(ribs), new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.4 }));
  frame.castShadow = true; frame.receiveShadow = true;
  g.add(frame);
  // 补光灯
  for (const rx of [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5]) g.add(mesh(new THREE.BoxGeometry(0.22, 0.08, L - 6), M.grow, { x: rx, y: H + 2.4, cast: false }));
  // 天窗（可开合）
  const vents = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0, H + R, 0);
    const pane = mesh(new THREE.BoxGeometry(2.6, 0.06, L - 8), M.steel, { x: s * 1.3, cast: false });
    pivot.add(pane);
    pivot.userData.side = s;
    vents.push(pivot); g.add(pivot);
  }
  // 端墙风机
  g.add(mesh(new THREE.BoxGeometry(3, 2.4, 0.6), M.dark, { x: 4, y: 1.4, z: L / 2 + 0.3 }));
  const fan = mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.1, 6), M.metal, { x: 4, y: 1.4, z: L / 2 + 0.65, rx: Math.PI / 2, cast: false });
  g.add(fan);
  g.add(pickSlab(W, H + R, L, { type: 'plot', id: p.id }));
  return { g, vents, fan };
}

function windTurbine() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.9, 1.9, 48, 16), M.white, { y: 24 }));
  const head = new THREE.Group(); head.position.y = 48; g.add(head);
  head.add(mesh(new THREE.BoxGeometry(2.4, 2.4, 6.5), M.white, { z: -1 }));
  const rotor = new THREE.Group(); rotor.position.z = 2.6; head.add(rotor);
  rotor.add(mesh(new THREE.SphereGeometry(1.3, 16, 12).scale(1, 1, 1.6), M.white));
  const blade = new THREE.Shape();
  blade.moveTo(-0.5, 0); blade.quadraticCurveTo(-1.6, 6, -0.35, 24); blade.lineTo(0.2, 24); blade.quadraticCurveTo(0.9, 6, 0.5, 0);
  const bg = new THREE.ExtrudeGeometry(blade, { depth: 0.18, bevelEnabled: false });
  for (let i = 0; i < 3; i++) rotor.add(mesh(bg, M.white, { rz: i * Math.PI * 2 / 3, z: 0.4 }));
  const tip = mesh(new THREE.SphereGeometry(0.4, 8, 6), M.beacon, { y: 1.5, z: -3, cast: false });
  head.add(tip);
  return { g, rotor, head, tip };
}

function solarArray() {
  const panelTex = canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#0d1e44'; ctx.fillRect(0, 0, w, h);
    const gr = ctx.createLinearGradient(0, 0, w, h); gr.addColorStop(0, 'rgba(80,120,220,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(190,210,255,0.45)'; ctx.lineWidth = 2;
    for (let x = 0; x <= w; x += w / 10) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += h / 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  });
  const mat = new THREE.MeshStandardMaterial({ map: panelTex, metalness: 0.55, roughness: 0.22, envMapIntensity: 1.4 });
  const xs = [];
  for (let x = -160; x <= 160; x += 11) xs.push(x);
  const zs = [-202, -212, -222, -232];
  const n = xs.length * zs.length;
  const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(10, 0.12, 4.2), mat, n);
  const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 1, 0.2), M.metal, n * 2);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.42, 0, 0));
  let i = 0;
  for (const z of zs) for (const x of xs) {
    m4.compose(new THREE.Vector3(x, 1.9, z), q, new THREE.Vector3(1, 1, 1)); panels.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(x - 3.5, 0.9, z), new THREE.Quaternion(), new THREE.Vector3(1, 1.8, 1)); legs.setMatrixAt(i * 2, m4);
    m4.compose(new THREE.Vector3(x + 3.5, 0.9, z), new THREE.Quaternion(), new THREE.Vector3(1, 1.8, 1)); legs.setMatrixAt(i * 2 + 1, m4);
    i++;
  }
  panels.castShadow = legs.castShadow = true; panels.receiveShadow = true;
  const g = new THREE.Group(); g.add(panels, legs);
  const slab = pickSlab(340, 4, 40, { type: 'facility', id: 'solar' }); slab.position.set(0, 2, -217); g.add(slab);
  return g;
}

function pivotIrrigation(p) {
  const g = new THREE.Group();
  g.position.set(p.x, 0, p.z);
  const arm = new THREE.Group(); g.add(arm);
  const R = p.r, Y = 4.2;
  const parts = [];
  parts.push([tx(new THREE.CylinderGeometry(0.16, 0.16, R, 8), { rz: Math.PI / 2, x: R / 2, y: Y }), '#c9d2d9']);
  const towers = [];
  for (let r = 11; r <= R + 0.1; r += 11) towers.push(r);
  let prev = 0;
  for (const r of towers) {
    // 桁架下弦
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(prev, Y, 0), new THREE.Vector3((prev + r) / 2, Y - 2.2, 0), new THREE.Vector3(r, Y, 0));
    parts.push([new THREE.TubeGeometry(curve, 10, 0.06, 4), '#aab4bb']);
    for (let k = 1; k < 6; k++) {
      const x = prev + (r - prev) * k / 6;
      const yb = curve.getPoint(k / 6).y;
      parts.push([tx(new THREE.CylinderGeometry(0.04, 0.04, Y - yb, 4), { x, y: (Y + yb) / 2 }), '#aab4bb']);
      parts.push([tx(new THREE.CylinderGeometry(0.025, 0.025, Y - 1.2, 3), { x: x + 0.9, y: (Y + 1.2) / 2 }), '#5d6a72']);
      parts.push([tx(new THREE.ConeGeometry(0.12, 0.2, 6), { x: x + 0.9, y: 1.15, rx: Math.PI }), '#2f8fd8']);
    }
    // A 型塔架 + 轮子
    parts.push([tx(new THREE.BoxGeometry(0.15, Y, 0.15), { x: r, y: Y / 2, z: 1.4, rx: 0.32 }), '#c9d2d9']);
    parts.push([tx(new THREE.BoxGeometry(0.15, Y, 0.15), { x: r, y: Y / 2, z: -1.4, rx: -0.32 }), '#c9d2d9']);
    parts.push([tx(new THREE.BoxGeometry(0.2, 0.2, 5.4), { x: r, y: 0.75 }), '#c9d2d9']);
    for (const z of [-2.7, 2.7]) parts.push([tx(new THREE.CylinderGeometry(0.75, 0.75, 0.45, 12), { rx: Math.PI / 2, x: r, y: 0.75, z }), '#2a2a2a']);
    prev = r;
  }
  parts.push([tx(new THREE.ConeGeometry(0.25, 1.2, 6), { x: R + 0.6, y: Y, rz: -Math.PI / 2 }), '#8a949b']);
  const armMesh = new THREE.Mesh(mergeColored(parts), new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.35 }));
  armMesh.castShadow = true;
  arm.add(armMesh);
  // 中心塔
  g.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, Y + 1.5, 8), M.metal, { y: (Y + 1.5) / 2 }));
  g.add(mesh(new THREE.ConeGeometry(2.2, Y, 4), new THREE.MeshStandardMaterial({ color: 0xa8b0b8, wireframe: true }), { y: Y / 2 }));
  g.add(mesh(new THREE.BoxGeometry(1.2, 1.6, 0.8), M.dark, { y: 1.6, z: 1.2 }));
  const led = mesh(new THREE.SphereGeometry(0.25, 8, 6), M.cyan.clone(), { y: Y + 1.7, cast: false });
  g.add(led);
  // 轮辙
  for (const r of towers) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.45, r + 0.45, 96).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5a4a32, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
    ring.position.y = 0.05; ring.receiveShadow = true; g.add(ring);
  }
  const slab = pickSlab(8, Y + 2, 8, { type: 'plot', id: p.id }); g.add(slab);
  return { g, arm, led };
}

function hubBuilding() {
  const g = new THREE.Group();
  g.position.set(HUB.x, 0, HUB.z);
  g.add(mesh(new THREE.BoxGeometry(34, 0.8, 26), M.concrete, { y: 0.4 }));
  const b1 = mesh(new THREE.BoxGeometry(26, 9, 17), M.hubGlass, { y: 5.3 });
  const b2 = mesh(new THREE.BoxGeometry(17, 6, 11), M.hubGlass, { y: 12.8, x: -2 });
  g.add(b1, b2, edges(b1), edges(b2));
  for (let y = 2.4; y < 9.5; y += 2.2) {
    g.add(mesh(new THREE.BoxGeometry(26.1, 0.12, 17.1), M.cyan, { y, cast: false }));
  }
  for (let y = 11.2; y < 15.5; y += 2.0) g.add(mesh(new THREE.BoxGeometry(17.1, 0.1, 11.1), M.cyan, { y, x: -2, cast: false }));
  // 天线塔
  g.add(mesh(new THREE.CylinderGeometry(0.25, 0.5, 20, 8), M.metal, { y: 25.8, x: 7 }));
  const beacon = mesh(new THREE.SphereGeometry(0.5, 10, 8), M.beacon, { y: 36, x: 7, cast: false });
  g.add(beacon);
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const r = mesh(new THREE.TorusGeometry(1.6 - i * 0.35, 0.07, 6, 32), M.cyan, { y: 20 + i * 4, x: 7, rx: Math.PI / 2, cast: false });
    rings.push(r); g.add(r);
  }
  // 卫星天线
  const dish = mesh(new THREE.SphereGeometry(3, 20, 10, 0, Math.PI * 2, 0, Math.PI / 3.2), M.steel, { x: -7, y: 17.5, z: 1, rx: -0.9, ry: 0.6 });
  g.add(dish);
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.3, 2, 8), M.metal, { x: -7, y: 16.3, z: 1 }));
  // 全息数据核心
  const holo = new THREE.Group(); holo.position.set(-2, 30, 0); g.add(holo);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(3.2, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.2, 2.8), wireframe: true, transparent: true, opacity: 0.85 }));
  const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 3.5, 4) }));
  holo.add(core, inner);
  const orbit = [];
  for (let i = 0; i < 3; i++) {
    const o = new THREE.Mesh(new THREE.TorusGeometry(5 + i * 1.3, 0.05, 4, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.8, 2.4), transparent: true, opacity: 0.8 }));
    o.rotation.set(Math.PI / 2 + i * 0.5, i * 0.8, 0);
    orbit.push(o); holo.add(o);
  }
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv; void main(){ float a = (1.0 - vUv.y) * 0.25 + 0.15 * smoothstep(0.0,0.1, fract(vUv.y*6.0 - uTime*0.8)) * (1.0 - fract(vUv.y*6.0 - uTime*0.8)); gl_FragColor = vec4(vec3(0.2,0.9,1.0) * a, 1.0); }`,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 6, 14, 32, 1, true), beamMat);
  beam.position.set(-2, 23, 0);
  g.add(beam);
  g.add(pickSlab(30, 18, 22, { type: 'facility', id: 'hub' }));
  return { g, core, inner, orbit, beamMat, beacon, rings };
}

function house() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(16, 6.5, 11), M.white, { y: 3.25 }));
  const tri = new THREE.Shape(); tri.moveTo(-8.8, 0); tri.lineTo(8.8, 0); tri.lineTo(0, 4.5); tri.lineTo(-8.8, 0);
  g.add(mesh(new THREE.ExtrudeGeometry(tri, { depth: 12.4, bevelEnabled: false }).translate(0, 0, -6.2), new THREE.MeshStandardMaterial({ color: 0x5b3328, roughness: 0.8 }), { y: 6.5 }));
  for (let i = -2; i <= 2; i++) for (const y of [2, 4.6]) {
    if (i === 0 && y === 2) continue;
    g.add(mesh(new THREE.BoxGeometry(1.6, 1.4, 0.2), M.window, { x: i * 3, y, z: 5.55, cast: false }));
  }
  g.add(mesh(new THREE.BoxGeometry(2, 3, 0.2), M.wood, { y: 1.5, z: 5.55 }));
  g.add(mesh(new THREE.BoxGeometry(5, 0.3, 3), M.wood, { y: 3.4, z: 7 }));
  return g;
}

function shed() {
  const g = new THREE.Group();
  const roof = mesh(new THREE.CylinderGeometry(10, 10, 16, 24, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2),new THREE.MeshStandardMaterial({ color: 0x9aa3a9, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }), { y: 0 });
  roof.scale.set(1, 0.6, 1);
  roof.position.y = 3;
  g.add(roof);
  g.add(mesh(new THREE.BoxGeometry(20, 3, 0.3), M.metal, { y: 1.5, z: -8 }));
  g.add(mesh(new THREE.BoxGeometry(0.3, 3, 16), M.metal, { y: 1.5, x: -10 }));
  g.add(mesh(new THREE.BoxGeometry(0.3, 3, 16), M.metal, { y: 1.5, x: 10 }));
  return g;
}

function coop() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(12, 4, 7), new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9 }), { y: 2.8 }));
  for (const x of [-5.5, 5.5]) for (const z of [-3, 3]) g.add(mesh(new THREE.BoxGeometry(0.3, 0.8, 0.3), M.wood, { x, z, y: 0.4 }));
  const tri = new THREE.Shape(); tri.moveTo(-6.6, 0); tri.lineTo(6.6, 0); tri.lineTo(0, 2.6); tri.lineTo(-6.6, 0);
  g.add(mesh(new THREE.ExtrudeGeometry(tri, { depth: 8, bevelEnabled: false }).translate(0, 0, -4), M.red, { y: 4.8 }));
  g.add(mesh(new THREE.BoxGeometry(1.2, 0.1, 3), M.wood, { y: 0.45, z: 4.8, rx: 0.3 }));
  for (let i = -1; i <= 1; i++) g.add(mesh(new THREE.BoxGeometry(1.2, 0.8, 0.1), M.window, { x: i * 3.5, y: 3.2, z: 3.52, cast: false }));
  return g;
}

function streetLamp() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.15, 7, 6), M.dark, { y: 3.5 }));
  g.add(mesh(new THREE.BoxGeometry(1.6, 0.12, 0.12), M.dark, { y: 7, x: 0.7 }));
  g.add(mesh(new THREE.BoxGeometry(0.8, 0.2, 0.4), M.lamp, { y: 6.88, x: 1.4, cast: false }));
  return g;
}

function fenceRect(b, postGap = 4, h = 1.4) {
  const g = new THREE.Group();
  const posts = [];
  const sides = [
    [b.xmin, b.zmin, b.xmax, b.zmin], [b.xmax, b.zmin, b.xmax, b.zmax], [b.xmax, b.zmax, b.xmin, b.zmax], [b.xmin, b.zmax, b.xmin, b.zmin],
  ];
  const rails = [];
  for (const [x0, z0, x1, z1] of sides) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.ceil(len / postGap);
    for (let i = 0; i < n; i++) posts.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n]);
    const ang = Math.atan2(z1 - z0, x1 - x0);
    for (const y of [h * 0.45, h * 0.9]) rails.push([tx(new THREE.BoxGeometry(len, 0.1, 0.06), { ry: -ang, x: (x0 + x1) / 2, y, z: (z0 + z1) / 2 }), '#d8cfc0']);
  }
  const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.1, h + 0.2, 5).translate(0, (h + 0.2) / 2, 0), M.wood, posts.length);
  const m4 = new THREE.Matrix4();
  posts.forEach(([x, z], i) => { m4.makeTranslation(x, 0, z); pm.setMatrixAt(i, m4); });
  pm.castShadow = true;
  g.add(pm);
  const rm = new THREE.Mesh(mergeColored(rails), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  rm.castShadow = true;
  g.add(rm);
  return g;
}

// 电子围栏（全息墙）
function virtualFence(b, color = 0x37f0ff) {
  const pts = [[b.xmin, b.zmin], [b.xmax, b.zmin], [b.xmax, b.zmax], [b.xmin, b.zmax], [b.xmin, b.zmin]];
  const pos = [], uv = [];
  let acc = 0;
  for (let i = 0; i < 4; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const l = Math.hypot(x1 - x0, z1 - z0);
    const H = 5;
    pos.push(x0, 0, z0, x1, 0, z1, x1, H, z1, x0, 0, z0, x1, H, z1, x0, H, z0);
    uv.push(acc, 0, acc + l, 0, acc + l, 1, acc, 0, acc + l, 1, acc, 1);
    acc += l;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime, uOpacity; uniform vec3 uColor; varying vec2 vUv;
      void main(){ float a = pow(1.0 - vUv.y, 2.2) * 0.8; float stripe = smoothstep(0.85, 1.0, fract(vUv.y * 6.0 - uTime * 0.6)) * (1.0 - vUv.y) * 0.6;
        float v = smoothstep(0.92,1.0, fract(vUv.x * 0.25)) * 0.3 * (1.0 - vUv.y);
        gl_FragColor = vec4(uColor * (a + stripe + v) * uOpacity, 1.0); }`,
  });
  return new THREE.Mesh(geo, mat);
}

export function createStructures(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const pickables = [];
  const tag = (obj, data) => { obj.userData.pick = data; pickables.push(obj); return obj; };

  const b = barn(); b.position.set(75, 0, 186); group.add(tag(b, { type: 'facility', id: 'barn' }));
  for (const [x, z] of [[44, 193], [44, 178]]) { const s = silo(); s.position.set(x, 0, z); group.add(tag(s, { type: 'facility', id: 'barn' })); }
  // 干草卷
  const hayG = new THREE.CylinderGeometry(0.9, 0.9, 1.3, 14).rotateZ(Math.PI / 2);
  for (let i = 0; i < 9; i++) { const h = mesh(hayG, M.straw, { x: 95 + (i % 3) * 1.5, y: 0.9 + Math.floor(i / 3) * 0 + (i >= 6 ? 1.6 : 0), z: 176 + Math.floor(i / 3) * 2.2 * (i >= 6 ? 0 : 1) }); group.add(h); }
  // 饮水槽
  group.add(mesh(new THREE.BoxGeometry(6, 0.8, 1.4), M.metal, { x: 122, y: 0.4, z: 150 }));
  group.add(mesh(new THREE.PlaneGeometry(5.6, 1.1).rotateX(-Math.PI / 2), M.water, { x: 122, y: 0.75, z: 150, cast: false }));

  // 温室
  const greenhouses = [];
  for (const p of PLOTS.filter((p) => p.greenhouse)) {
    const gh = greenhouse(p);
    group.add(gh.g);
    pickables.push(gh.g.children[gh.g.children.length - 1]);
    greenhouses.push({ id: p.id, ...gh, vent: 0 });
  }

  // 数据中心
  const hub = hubBuilding();
  group.add(hub.g);
  pickables.push(hub.g.children[hub.g.children.length - 1]);

  const hs = house(); hs.position.set(-55, 0, -55); group.add(tag(hs, { type: 'facility', id: 'house' }));
  const sh = shed(); sh.position.set(-50, 0, 15); group.add(sh);
  const cp = coop(); cp.position.set(190, 0, 196); group.add(tag(cp, { type: 'facility', id: 'coop' }));

  // 光伏
  group.add(solarArray());
  pickables.push(group.children[group.children.length - 1].children[2]);

  // 风机
  const turbines = [];
  for (const [x, z] of [[-280, -330], [-150, -360], [-10, -380], [140, -360], [280, -320], [360, -200], [-370, -190]]) {
    const t = windTurbine();
    t.g.position.set(x, terrainHeight(x, z) - 1, z);
    t.g.rotation.y = Math.atan2(-x * 0.1, 1) + 0.3;
    t.g.scale.setScalar(1.1);
    t.rotor.rotation.z = Math.random() * 6;
    group.add(t.g);
    turbines.push(t);
  }

  // 中心支轴喷灌
  const pivot = pivotIrrigation(plotById.P1);
  group.add(pivot.g);
  pickables.push(pivot.g.children[pivot.g.children.length - 1]);

  // 围栏
  group.add(fenceRect(PASTURE));
  group.add(fenceRect(CHICKEN_YARD, 3, 1.1));
  const vf = virtualFence(PASTURE);
  group.add(vf);

  // 路灯
  const lamps = [];
  for (let z = -90; z <= 40; z += 26) for (const s of [-1, 1]) { const l = streetLamp(); l.position.set(s * 6, 0, z + (s > 0 ? 13 : 0)); l.rotation.y = s > 0 ? Math.PI : 0; group.add(l); lamps.push(l); }
  for (let x = -200; x <= 200; x += 40) { if (Math.abs(x) < 10) continue; const l = streetLamp(); l.position.set(x, 0, 55); l.rotation.y = Math.PI / 2; group.add(l); }

  return {
    group, pickables, greenhouses, hub, pivot, turbines, virtualFence: vf,
    update(t, dt, ctx) {
      const night = ctx.night;
      M.lamp.emissiveIntensity = night * 5;
      M.window.emissiveIntensity = 0.1 + night * 2.2;
      M.grow.emissiveIntensity = ctx.growLight ? 2.2 : 0.15;
      M.beacon.emissiveIntensity = (Math.sin(t * 4) > 0.2 ? 4 : 0.3);
      for (const tb of turbines) tb.rotor.rotation.z -= dt * (0.4 + ctx.wind * 0.18);
      // 温室天窗 / 风机
      for (const gh of greenhouses) {
        const target = ctx.greenhouse[gh.id]?.vent ?? 0;
        gh.vent += (target - gh.vent) * Math.min(1, dt * 1.5);
        for (const v of gh.vents) v.rotation.z = v.userData.side * gh.vent * 0.65;
        gh.fan.rotation.y += dt * (ctx.greenhouse[gh.id]?.fan ? 18 : 0);
      }
      // 喷灌
      if (ctx.pivotOn) pivot.arm.rotation.y -= dt * 0.06;
      pivot.led.material.emissive.set(ctx.pivotOn ? 0x36ff8a : 0x36e6ff);
      // 数据中心
      hub.core.rotation.y += dt * 0.5; hub.core.rotation.x += dt * 0.2;
      hub.inner.scale.setScalar(1 + Math.sin(t * 3) * 0.12);
      hub.orbit.forEach((o, i) => { o.rotation.z += dt * (0.6 + i * 0.3) * (i % 2 ? -1 : 1); });
      hub.rings.forEach((r, i) => { r.scale.setScalar(1 + ((t * 0.8 + i * 0.33) % 1) * 0.6); });
      hub.beamMat.uniforms.uTime.value = t;
      vf.material.uniforms.uTime.value = t;
    },
  };
}
