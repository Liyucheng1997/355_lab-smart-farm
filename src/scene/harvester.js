// 无人驾驶联合收割机：弓字形路径规划 + 实时收割（实例化作物被割断）
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { plotById } from '../layout.js';
import { mergeColored, tx } from '../util.js';
import { THERMAL_LAYER } from './animals.js';
import { Particles } from './effects.js';

function harvesterModel() {
  const g = new THREE.Group();
  const vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 });
  const Y = '#e3a21a', D = '#2a2d31', W = '#e9ecef';
  const body = new THREE.Mesh(mergeColored([
    [tx(new THREE.BoxGeometry(5.2, 2.6, 3.0), { y: 2.4 }), Y],
    [tx(new THREE.BoxGeometry(3.6, 1.4, 2.8), { y: 4.4, x: -0.6 }), Y],
    [tx(new THREE.BoxGeometry(1.0, 0.3, 3.1), { y: 3.75, x: 2.1 }), D],
    [tx(new THREE.BoxGeometry(2.2, 0.15, 2.2), { y: 6.0, x: 1.6 }), W],
    [tx(new THREE.CylinderGeometry(0.25, 0.25, 6, 8), { rz: Math.PI / 2 - 0.2, x: -2.2, y: 5.6, z: 1.9, ry: 0.5 }), Y],
    [tx(new THREE.BoxGeometry(1.4, 1.0, 3.3), { x: 3.4, y: 1.6 }), D],
    [tx(new THREE.CylinderGeometry(0.3, 0.3, 1.2, 8), { y: 6.2, x: -2.2, z: -0.9 }), D],
  ]), vc);
  body.castShadow = true;
  g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.8, 2.0), new THREE.MeshStandardMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.4 }));
  cab.position.set(1.6, 5.0, 0); g.add(cab);
  // 割台 + 拨禾轮
  const header = new THREE.Mesh(mergeColored([
    [tx(new THREE.BoxGeometry(1.6, 0.8, 5.8), { x: 4.6, y: 0.8 }), Y],
    [tx(new THREE.BoxGeometry(1.8, 0.08, 5.8), { x: 5.0, y: 0.4 }), '#9aa1a8'],
  ]), vc);
  header.castShadow = true;
  g.add(header);
  const reel = new THREE.Group(); reel.position.set(5.3, 1.6, 0); g.add(reel);
  for (let i = 0; i < 5; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 5.6), new THREE.MeshStandardMaterial({ color: 0xc23b22 }));
    const a = i / 5 * Math.PI * 2; bar.position.set(Math.cos(a) * 0.7, Math.sin(a) * 0.7, 0); reel.add(bar);
  }
  const wheels = [];
  for (const [x, z, r] of [[2.2, 1.7, 1.15], [2.2, -1.7, 1.15], [-1.9, 1.5, 0.75], [-1.9, -1.5, 0.75]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.7, 16).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.9 }));
    w.position.set(x, r, z); w.castShadow = true; g.add(w); wheels.push(w);
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.2, 0.2) }));
  beacon.position.set(1.6, 6.3, 0); g.add(beacon);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 1.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 2.6) }));
  lamp.position.set(2.65, 5.5, 0); g.add(lamp);
  const head = new THREE.SpotLight(0xfff1d0, 0, 60, 0.6, 0.5, 1.2);
  head.position.set(3, 5.5, 0); head.target.position.set(14, 0, 0);
  g.add(head, head.target);
  g.traverse((o) => { if (o.isMesh) o.layers.enable(THERMAL_LAYER); });
  return { g, reel, wheels, beacon, head };
}

export function createHarvester(scene, cropSys) {
  const plot = plotById.A2;
  const data = cropSys.plotData.A2;
  const m = harvesterModel();
  scene.add(m.g);
  m.g.userData.pick = { type: 'vehicle', id: 'HV-01' };

  // 弓字形覆盖路径（割幅 4.4m）
  const swath = 4.4;
  const x0 = plot.x - plot.w / 2 - 4, x1 = plot.x + plot.w / 2 + 4;
  const zs = [];
  for (let z = plot.z - plot.d / 2 + swath / 2; z < plot.z + plot.d / 2; z += swath) zs.push(z);
  const segs = [];
  zs.forEach((z, i) => {
    const a = i % 2 === 0 ? [x0, z] : [x1, z], b = i % 2 === 0 ? [x1, z] : [x0, z];
    segs.push({ type: 'line', a, b });
    if (i < zs.length - 1) segs.push({ type: 'turn', c: [b[0], z + swath / 2], r: swath / 2, dir: i % 2 === 0 ? 1 : -1 });
  });
  for (const s of segs) s.len = s.type === 'line' ? Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) : Math.PI * s.r;
  const total = segs.reduce((a, s) => a + s.len, 0);
  const pathPts = [];
  const sample = (dist) => {
    let d = dist;
    for (const s of segs) {
      if (d <= s.len) {
        if (s.type === 'line') { const k = d / s.len; return { x: s.a[0] + (s.b[0] - s.a[0]) * k, z: s.a[1] + (s.b[1] - s.a[1]) * k, hx: Math.sign(s.b[0] - s.a[0]), hz: 0, cutting: true }; }
        const k = d / s.len; const ang = -Math.PI / 2 + Math.PI * k;
        const x = s.c[0] + Math.cos(ang) * s.r * s.dir, z = s.c[1] + Math.sin(ang) * s.r;
        return { x, z, hx: -Math.sin(ang) * s.dir, hz: Math.cos(ang), cutting: false };
      }
      d -= s.len;
    }
    return { x: segs.at(-1).b[0], z: segs.at(-1).b[1], hx: 1, hz: 0, cutting: false };
  };
  for (let d = 0; d < total; d += 2) { const p = sample(d); pathPts.push(new THREE.Vector3(p.x, 0.35, p.z)); }
  const pathLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pathPts), new THREE.LineDashedMaterial({ color: new THREE.Color(2.5, 1.6, 0.3), dashSize: 1.5, gapSize: 1.2, transparent: true, opacity: 0.0 }));
  pathLine.computeLineDistances();
  scene.add(pathLine);

  const el = document.createElement('div');
  el.className = 'tag tag-vehicle';
  el.innerHTML = '<b>HV-01 无人收割机</b><span class="v">--</span>';
  const label = new CSS2DObject(el); label.position.y = 8.5; label.visible = false; m.g.add(label);

  const dust = new Particles(scene, { count: 900, size: 0.9, color: 0xd9c08a, opacity: 0.35, gravity: 0.6, drag: 0.8 });
  const state = { dist: 0, speed: 2.6, progress: 0, pause: 0, rows: zs.length, yieldKg: 0, emphasis: 0 };
  const pts = data.pts, cut = data.cut;
  const fwd = new THREE.Vector3();
  let heading = 0;

  function reset() {
    cut.fill(0); data.cAttr.needsUpdate = true;
    state.dist = 0; state.yieldKg = 0;
  }
  // 初始已收割约 35%
  state.dist = total * 0.35;
  for (let d = 0; d < state.dist; d += 0.8) {
    const p = sample(d);
    if (!p.cutting) continue;
    for (let i = 0; i < pts.length; i++) if (Math.abs(pts[i][1] - p.z) < swath / 2 + 0.1 && Math.abs(pts[i][0] - p.x) < 0.8) cut[i] = 1;
  }
  data.cAttr.needsUpdate = true;

  function update(dt, t, night) {
    if (state.pause > 0) { state.pause -= dt; if (state.pause <= 0) reset(); }
    else {
      state.dist += state.speed * dt;
      if (state.dist >= total) { state.dist = total; state.pause = 6; }
    }
    const p = sample(state.dist);
    heading = Math.atan2(-p.hz, p.hx);
    m.g.position.set(p.x, 0, p.z);
    m.g.rotation.y = heading;
    fwd.set(p.hx, 0, p.hz).normalize();
    m.reel.rotation.z -= dt * 3;
    for (const w of m.wheels) w.rotation.z -= dt * state.speed / 1.0;
    m.beacon.visible = Math.sin(t * 7) > 0;
    m.head.intensity = night * 300;
    // 割台位置
    const hx = p.x + fwd.x * 5, hz = p.z + fwd.z * 5;
    if (p.cutting && state.pause <= 0) {
      let changed = 0;
      for (let i = 0; i < pts.length; i++) {
        if (cut[i]) continue;
        const dx = pts[i][0] - hx, dz = pts[i][1] - hz;
        const along = dx * fwd.x + dz * fwd.z, perp = -dx * fwd.z + dz * fwd.x;
        if (Math.abs(along) < 1.0 && Math.abs(perp) < swath / 2 + 0.2) { cut[i] = 1; changed++; }
      }
      if (changed) { data.cAttr.needsUpdate = true; state.yieldKg += changed * 0.42; }
      for (let k = 0; k < 4; k++) dust.emit(p.x - fwd.x * 3 + (Math.random() - 0.5) * 2, 2 + Math.random(), p.z - fwd.z * 3 + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2 - fwd.x, 0.6 + Math.random(), (Math.random() - 0.5) * 2 - fwd.z, 2.5);
    }
    dust.update(dt);
    let done = 0; for (let i = 0; i < cut.length; i++) done += cut[i];
    state.progress = done / cut.length;
    pathLine.material.opacity = state.emphasis * 0.9;
  }

  return { group: m.g, update, state, label, el, pathLine, pickables: [m.g] };
}
