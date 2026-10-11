// 牲畜：程序化建模 + 行为状态机 + 群体避让 + 轨迹 + 健康光环
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { PASTURE, CHICKEN_YARD } from '../layout.js';
import { mergeColored, tx, canvasTexture, mulberry32, clamp, gauss } from '../util.js';

export const THERMAL_LAYER = 2;
const rnd = mulberry32(777);

const spotTex = canvasTexture(256, 128, (ctx, w, h) => {
  ctx.fillStyle = '#f3f1ec'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1b1b1d';
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    const x = rnd() * w, y = rnd() * h, r = 12 + rnd() * 22;
    for (let k = 0; k <= 12; k++) { const a = k / 12 * Math.PI * 2, rr = r * (0.7 + rnd() * 0.5); k ? ctx.lineTo(x + Math.cos(a) * rr * 1.4, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr * 1.4, y + Math.sin(a) * rr); }
    ctx.fill();
  }
});
const vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
const cowBodyMat = new THREE.MeshStandardMaterial({ map: spotTex, roughness: 0.8 });
const jerseyMat = new THREE.MeshStandardMaterial({ color: 0x9a6334, roughness: 0.8 });

function limb(len, r, color, hoof = '#2a2522') {
  return mergeColored([
    [tx(new THREE.CylinderGeometry(r, r * 0.8, len, 6), { y: -len / 2 }), color],
    [tx(new THREE.CylinderGeometry(r * 0.85, r * 0.95, 0.12, 6), { y: -len + 0.04 }), hoof],
  ]);
}

function buildCow(jersey) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.25, 4, 12).rotateZ(Math.PI / 2), jersey ? jerseyMat : cowBodyMat);
  body.position.y = 1.3; body.scale.set(1, 1, 0.92);
  const base = jersey ? '#9a6334' : '#f1efe9';
  const extra = new THREE.Mesh(mergeColored([
    [tx(new THREE.SphereGeometry(0.24, 8, 6), { x: -0.55, y: 0.78 }), '#f2b8b0'],
    [tx(new THREE.CylinderGeometry(0.03, 0.04, 0.9, 4), { x: -1.2, y: 1.1, rz: -0.25 }), base],
    [tx(new THREE.SphereGeometry(0.08, 6, 4), { x: -1.32, y: 0.66 }), '#1b1b1d'],
  ]), vc);
  const head = new THREE.Group(); head.position.set(1.05, 1.55, 0);
  head.add(new THREE.Mesh(mergeColored([
    [tx(new THREE.BoxGeometry(0.62, 0.48, 0.42), { x: 0.3 }), base],
    [tx(new THREE.BoxGeometry(0.28, 0.3, 0.38), { x: 0.68, y: -0.08 }), '#e8b8a8'],
    [tx(new THREE.ConeGeometry(0.05, 0.25, 5), { x: 0.2, y: 0.3, z: 0.18, rx: -0.6 }), '#efe6cf'],
    [tx(new THREE.ConeGeometry(0.05, 0.25, 5), { x: 0.2, y: 0.3, z: -0.18, rx: 0.6 }), '#efe6cf'],
    [tx(new THREE.BoxGeometry(0.1, 0.12, 0.28), { x: 0.15, y: 0.12, z: 0.32, rx: 0.4 }), jersey ? '#7a4a26' : '#1b1b1d'],
    [tx(new THREE.BoxGeometry(0.1, 0.12, 0.28), { x: 0.15, y: 0.12, z: -0.32, rx: -0.4 }), jersey ? '#7a4a26' : '#1b1b1d'],
    [tx(new THREE.BoxGeometry(0.04, 0.1, 0.08), { x: 0.2, y: 0.12, z: 0.42 }), '#ffcc00'],
  ]), vc));
  g.add(body, extra, head);
  const legs = [];
  for (const [x, z] of [[0.62, 0.28], [0.62, -0.28], [-0.62, 0.28], [-0.62, -0.28]]) {
    const leg = new THREE.Mesh(limb(0.95, 0.1, base), vc);
    leg.position.set(x, 1.0, z); legs.push(leg); g.add(leg);
  }
  return { g, head, legs, body, size: [2.6, 1.9, 1.0] };
}

function buildSheep() {
  const g = new THREE.Group();
  const parts = [];
  const r = mulberry32(3);
  for (let i = 0; i < 9; i++) parts.push([tx(new THREE.IcosahedronGeometry(0.32 + r() * 0.08, 1), { x: -0.45 + (i % 3) * 0.42 + r() * 0.06, y: 0.82 + (r() - 0.5) * 0.16, z: (Math.floor(i / 3) - 1) * 0.22 }), r() < 0.5 ? '#f0ebe0' : '#e4ddcc']);
  const body = new THREE.Mesh(mergeColored(parts), vc);
  const head = new THREE.Group(); head.position.set(0.55, 1.0, 0);
  head.add(new THREE.Mesh(mergeColored([
    [tx(new THREE.BoxGeometry(0.34, 0.26, 0.24), { x: 0.16, y: -0.05 }), '#2b2724'],
    [tx(new THREE.BoxGeometry(0.06, 0.08, 0.2), { x: 0.05, y: 0.06, z: 0.18, rx: 0.5 }), '#2b2724'],
    [tx(new THREE.BoxGeometry(0.06, 0.08, 0.2), { x: 0.05, y: 0.06, z: -0.18, rx: -0.5 }), '#2b2724'],
    [tx(new THREE.IcosahedronGeometry(0.15, 0), { x: 0.0, y: 0.1 }), '#f0ebe0'],
  ]), vc));
  g.add(body, head);
  const legs = [];
  for (const [x, z] of [[0.32, 0.15], [0.32, -0.15], [-0.32, 0.15], [-0.32, -0.15]]) {
    const leg = new THREE.Mesh(limb(0.6, 0.05, '#2b2724'), vc);
    leg.position.set(x, 0.62, z); legs.push(leg); g.add(leg);
  }
  return { g, head, legs, body, size: [1.4, 1.3, 0.8] };
}

let chickenGeo = null;
function buildChicken() {
  chickenGeo ||= mergeColored([
    [tx(new THREE.SphereGeometry(0.2, 8, 6), { y: 0.38, sx: 1.25, sz: 0.9 }), '#f7f3ea'],
    [tx(new THREE.SphereGeometry(0.11, 8, 6), { x: 0.2, y: 0.6 }), '#f7f3ea'],
    [tx(new THREE.BoxGeometry(0.05, 0.08, 0.12), { x: 0.2, y: 0.73 }), '#e0262a'],
    [tx(new THREE.ConeGeometry(0.035, 0.09, 4), { x: 0.32, y: 0.58, rz: -Math.PI / 2 }), '#f5a623'],
    [tx(new THREE.BoxGeometry(0.12, 0.18, 0.04), { x: -0.25, y: 0.48, rz: 0.5 }), '#e9e2d4'],
    [tx(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 3), { y: 0.1, z: 0.06 }), '#f5a623'],
    [tx(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 3), { y: 0.1, z: -0.06 }), '#f5a623'],
  ]);
  const g = new THREE.Group();
  const m = new THREE.Mesh(chickenGeo, vc);
  g.add(m);
  return { g, head: null, legs: [], body: m, size: [0.6, 0.8, 0.4] };
}

const RING_GEO = new THREE.RingGeometry(0.85, 1.0, 40).rotateX(-Math.PI / 2);
const STATUS_COLOR = { normal: 0x3dffa0, watch: 0xffc94a, alert: 0xff4a4a };

export function createAnimals(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const animals = [];
  const pickables = [];

  const conditions = { 'C-017': 'fever', 'C-008': 'lame', 'C-012': 'estrus', 'S-105': 'fever' };

  function spawn(kind, i, bounds) {
    let built, id, info;
    if (kind === 'cow') {
      const jersey = i % 5 === 3;
      built = buildCow(jersey);
      id = `C-${String(i + 1).padStart(3, '0')}`;
      info = { kind, zh: '奶牛', breed: jersey ? '娟姗牛' : '荷斯坦奶牛', baseTemp: 38.6, weight: 560 + rnd() * 120, age: 24 + Math.floor(rnd() * 48), milk: 26 + rnd() * 10, speed: 1.0 };
    } else if (kind === 'sheep') {
      built = buildSheep();
      id = `S-${String(101 + i)}`;
      info = { kind, zh: '绵羊', breed: '湖羊', baseTemp: 39.2, weight: 52 + rnd() * 18, age: 10 + Math.floor(rnd() * 30), speed: 1.1 };
    } else {
      built = buildChicken();
      id = `H-${String(201 + i)}`;
      info = { kind, zh: '蛋鸡', breed: '海兰褐', baseTemp: 41.5, weight: 1.8 + rnd() * 0.4, age: 6 + Math.floor(rnd() * 14), speed: 0.9 };
    }
    const { g } = built;
    const x = bounds.xmin + 6 + rnd() * (bounds.xmax - bounds.xmin - 12);
    const z = bounds.zmin + 6 + rnd() * (bounds.zmax - bounds.zmin - 12);
    g.position.set(x, 0, z);
    g.rotation.y = rnd() * Math.PI * 2;
    if (kind === 'chicken') g.scale.setScalar(1.3);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.layers.enable(THERMAL_LAYER); } });
    group.add(g);

    const ringMat = new THREE.MeshBasicMaterial({ color: STATUS_COLOR.normal, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(RING_GEO, ringMat);
    const rs = kind === 'cow' ? 1.6 : kind === 'sheep' ? 1.0 : 0.5;
    ring.scale.setScalar(rs);
    ring.position.y = 0.12;
    ring.visible = false;
    g.add(ring);

    const el = document.createElement('div');
    el.className = 'tag tag-animal';
    el.innerHTML = `<b>${id}</b><span class="v">--</span>`;
    const label = new CSS2DObject(el);
    label.position.set(0, built.size[1] + 0.9, 0);
    label.visible = false;
    g.add(label);

    const a = {
      id, ...info, built, g, ring, ringMat, label, el, bounds,
      condition: conditions[id] || 'healthy',
      heading: g.rotation.y, state: 'graze', timer: rnd() * 6, target: new THREE.Vector2(x, z), phase: rnd() * 10,
      dist: 0, lie: 0, headDown: 0,
      trail: [], trailLine: null,
      metrics: { temp: info.baseTemp, activity: 0, rumination: 30, status: 'normal', score: 0, diag: '正常' },
      history: { temp: [], activity: [] },
    };
    if (a.condition === 'lame') a.speed *= 0.45;
    if (a.condition === 'estrus') a.speed *= 1.5;
    g.userData.pick = { type: 'animal', id };
    pickables.push(g);
    animals.push(a);
    return a;
  }

  for (let i = 0; i < 22; i++) spawn('cow', i, PASTURE);
  const sheepPen = { xmin: 130, xmax: 212, zmin: 66, zmax: 160 };
  for (let i = 0; i < 16; i++) spawn('sheep', i, sheepPen);
  for (let i = 0; i < 28; i++) spawn('chicken', i, CHICKEN_YARD);

  // 奶牛轨迹线
  const trailMat = new THREE.LineBasicMaterial({ color: new THREE.Color(0.3, 1.8, 2.2), transparent: true, opacity: 0.7 });
  const TRAIL_N = 80;
  for (const a of animals) {
    if (a.kind === 'chicken') continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3));
    geo.setDrawRange(0, 0);
    const line = new THREE.Line(geo, trailMat);
    line.frustumCulled = false;
    line.visible = false;
    group.add(line);
    a.trailLine = line;
  }

  const tmp = new THREE.Vector2();
  let trailClock = 0;
  const byId = Object.fromEntries(animals.map((a) => [a.id, a]));

  function chooseTarget(a, night) {
    const b = a.bounds;
    if (night && a.kind === 'cow') {
      // 夜间回到靠近牛舍一侧休息
      a.target.set(b.xmin + 15 + rnd() * 60, b.zmax - 4 - rnd() * 18);
    } else {
      const R = a.condition === 'estrus' ? 70 : 22;
      const p = a.g.position;
      a.target.set(clamp(p.x + (rnd() - 0.5) * 2 * R, b.xmin + 3, b.xmax - 3), clamp(p.z + (rnd() - 0.5) * 2 * R, b.zmin + 3, b.zmax - 3));
      if (a.kind === 'cow' && rnd() < 0.18) a.target.set(122 + (rnd() - 0.5) * 6, 147 - rnd() * 2); // 饮水
    }
  }

  function update(dt, t, hour) {
    const night = hour < 5.5 || hour > 19;
    trailClock += dt;
    const sampleTrail = trailClock > 0.6;
    if (sampleTrail) trailClock = 0;

    for (const a of animals) {
      a.timer -= dt;
      const p = a.g.position;
      if (a.timer <= 0) {
        const restBias = night ? 0.65 : (a.condition === 'fever' ? 0.55 : 0.12);
        const r = rnd();
        if (a.kind === 'chicken') {
          a.state = r < 0.55 ? 'walk' : 'graze';
          if (a.state === 'walk') { a.target.set(clamp(p.x + (rnd() - 0.5) * 14, a.bounds.xmin + 2, a.bounds.xmax - 2), clamp(p.z + (rnd() - 0.5) * 14, a.bounds.zmin + 2, a.bounds.zmax - 2)); }
          a.timer = 1 + rnd() * 3;
        } else if (r < restBias) { a.state = 'rest'; a.timer = 12 + rnd() * 20; }
        else if (r < restBias + (a.condition === 'estrus' ? 0.6 : 0.35)) { a.state = 'walk'; chooseTarget(a, night); a.timer = 30; }
        else { a.state = 'graze'; a.timer = 6 + rnd() * 10; }
      }

      let moving = false;
      if (a.state === 'walk') {
        tmp.set(a.target.x - p.x, a.target.y - p.z);
        const d = tmp.length();
        if (d < 1.2) { a.state = 'graze'; a.timer = 4 + rnd() * 8; }
        else {
          const desired = Math.atan2(-tmp.y, tmp.x);
          let dh = desired - a.heading;
          dh = Math.atan2(Math.sin(dh), Math.cos(dh));
          a.heading += clamp(dh, -dt * 1.6, dt * 1.6);
          const sp = a.speed * (a.kind === 'chicken' ? 1.4 : 1.25) * (Math.abs(dh) > 1 ? 0.3 : 1);
          p.x += Math.cos(a.heading) * sp * dt;
          p.z -= Math.sin(a.heading) * sp * dt;
          a.dist += sp * dt;
          moving = true;
        }
      } else if (a.state === 'graze' && a.kind !== 'chicken' && rnd() < dt * 0.15) {
        a.heading += (rnd() - 0.5) * 0.8;
      }
      // 群体避让
      for (const o of animals) {
        if (o === a || (o.kind === 'chicken') !== (a.kind === 'chicken')) continue;
        const dx = p.x - o.g.position.x, dz = p.z - o.g.position.z;
        const min = a.kind === 'chicken' ? 0.7 : (a.kind === 'cow' || o.kind === 'cow') ? 2.6 : 1.5;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-4) { const d = Math.sqrt(d2); const push = (min - d) * 0.5; p.x += dx / d * push; p.z += dz / d * push; }
      }
      p.x = clamp(p.x, a.bounds.xmin + 1.5, a.bounds.xmax - 1.5);
      p.z = clamp(p.z, a.bounds.zmin + 1.5, a.bounds.zmax - 1.5);
      a.g.rotation.y = a.heading;

      // 姿态动画
      const lieT = a.state === 'rest' && a.kind !== 'chicken' ? 1 : 0;
      a.lie += (lieT - a.lie) * Math.min(1, dt * 1.5);
      const headT = a.state === 'graze' ? 1 : 0;
      a.headDown += (headT - a.headDown) * Math.min(1, dt * 2);
      const B = a.built;
      if (a.kind === 'chicken') {
        B.body.position.y = moving ? Math.abs(Math.sin(t * 16 + a.phase)) * 0.06 : 0;
        B.body.rotation.z = a.state === 'graze' ? -Math.max(0, Math.sin(t * 6 + a.phase)) * 0.7 : 0;
      } else {
        const sw = moving ? Math.sin(t * (a.condition === 'lame' ? 4 : 7) * a.speed + a.phase) * 0.5 : 0;
        B.legs.forEach((l, i) => { l.rotation.z = (i === 0 || i === 3 ? sw : -sw) * (1 - a.lie); l.scale.y = 1 - a.lie * 0.55; });
        const drop = a.kind === 'cow' ? 0.62 : 0.3;
        for (const part of a.g.children) if (part !== a.ring && part !== a.label) part.position.y = (part.userData.baseY ??= part.position.y) - a.lie * drop;
        if (B.head) B.head.rotation.z = -a.headDown * 0.85 + (a.state === 'graze' ? Math.sin(t * 2 + a.phase) * 0.05 : 0);
        if (a.condition === 'lame' && moving) a.g.rotation.x = Math.sin(t * 4 + a.phase) * 0.06;
      }
      a.moving = moving;

      // 轨迹
      if (sampleTrail && a.trailLine) {
        a.trail.push(p.x, 0.25, p.z);
        if (a.trail.length > TRAIL_N * 3) a.trail.splice(0, 3);
        const arr = a.trailLine.geometry.attributes.position.array;
        arr.set(a.trail);
        a.trailLine.geometry.attributes.position.needsUpdate = true;
        a.trailLine.geometry.setDrawRange(0, a.trail.length / 3);
      }
      // 光环脉冲
      if (a.ring.visible) {
        const s = a.metrics.status;
        const k = s === 'normal' ? 0 : 1;
        const base = a.kind === 'cow' ? 1.6 : a.kind === 'sheep' ? 1.0 : 0.5;
        a.ring.scale.setScalar(base * (1 + k * ((t * 1.2 + a.phase) % 1) * 0.6));
        a.ringMat.opacity = k ? 1 - ((t * 1.2 + a.phase) % 1) * 0.7 : 0.75;
      }
    }
  }

  function setStatusVisual(a) {
    a.ringMat.color.setHex(STATUS_COLOR[a.metrics.status]);
    a.el.className = `tag tag-animal st-${a.metrics.status}`;
    const m = a.metrics;
    a.el.innerHTML = `<b>${a.id}</b><span class="v">${m.temp.toFixed(1)}℃</span>${m.status !== 'normal' ? `<i>${m.diag}</i>` : ''}`;
  }

  return { group, animals, byId, pickables, update, setStatusVisual };
}
