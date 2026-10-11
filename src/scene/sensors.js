// 物联网传感网络：节点建模、LoRa 网关、数据链路（流光管线）、脉冲波纹
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { SENSORS, GATEWAYS, SENSOR_TYPES, HUB } from '../layout.js';
import { mergeColored, tx } from '../util.js';

const vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.4 });

function nodeModel(type) {
  const c = SENSOR_TYPES[type].color;
  const parts = [];
  if (type === 'soil') {
    parts.push([tx(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), { y: 1.2 }), '#cfd6dc']);
    parts.push([tx(new THREE.BoxGeometry(0.45, 0.55, 0.3), { y: 1.7 }), '#e9eef2']);
    parts.push([tx(new THREE.BoxGeometry(0.7, 0.04, 0.5), { y: 2.45, rx: -0.4 }), '#1d3a78']);
  } else if (type === 'air') {
    parts.push([tx(new THREE.CylinderGeometry(0.04, 0.04, 2.0, 6), { y: 1.0 }), '#cfd6dc']);
    parts.push([tx(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8), { y: 2.1 }), '#f2f4f6']);
  } else if (type === 'cam') {
    parts.push([tx(new THREE.CylinderGeometry(0.08, 0.12, 6, 6), { y: 3 }), '#9aa4ad']);
    parts.push([tx(new THREE.BoxGeometry(0.7, 0.35, 0.35), { y: 6.1, x: 0.2 }), '#f2f4f6']);
    parts.push([tx(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 10), { y: 6.1, x: 0.58, rz: Math.PI / 2 }), '#111']);
  } else if (type === 'weather') {
    parts.push([tx(new THREE.CylinderGeometry(0.08, 0.1, 7, 8), { y: 3.5 }), '#cfd6dc']);
    parts.push([tx(new THREE.BoxGeometry(2.4, 0.08, 0.08), { y: 6.6 }), '#cfd6dc']);
    parts.push([tx(new THREE.BoxGeometry(0.8, 0.9, 0.8), { y: 2.2, x: 0.5 }), '#f8f8f6']);
    parts.push([tx(new THREE.BoxGeometry(1.1, 0.05, 0.7), { y: 4.6, rx: -0.5 }), '#1d3a78']);
  } else if (type === 'water') {
    parts.push([tx(new THREE.CylinderGeometry(0.5, 0.6, 0.6, 12), { y: 0.3 }), '#ff8a3d']);
    parts.push([tx(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6), { y: 1.2 }), '#cfd6dc']);
  } else if (type === 'tag') {
    parts.push([tx(new THREE.CylinderGeometry(0.08, 0.1, 5, 6), { y: 2.5 }), '#9aa4ad']);
    parts.push([tx(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 6), { y: 5.6 }), '#f2f4f6']);
    parts.push([tx(new THREE.BoxGeometry(0.5, 0.6, 0.25), { y: 3.5 }), '#e9eef2']);
  } else if (type === 'power') {
    parts.push([tx(new THREE.BoxGeometry(1.4, 2.0, 0.8), { y: 1.0 }), '#dfe4e8']);
  }
  const g = new THREE.Group();
  const m = new THREE.Mesh(mergeColored(parts), vc);
  m.castShadow = true;
  g.add(m);
  const topY = { soil: 2.7, air: 2.5, cam: 6.6, weather: 7.3, water: 2.0, tag: 6.5, power: 2.3 }[type];
  const led = new THREE.Mesh(new THREE.SphereGeometry(type === 'cam' || type === 'weather' || type === 'tag' ? 0.22 : 0.14, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(3) }));
  led.position.y = topY;
  g.add(led);
  let spinner = null;
  if (type === 'weather') {
    spinner = new THREE.Group(); spinner.position.set(-1.0, 6.9, 0);
    for (let i = 0; i < 3; i++) {
      const arm = new THREE.Mesh(mergeColored([
        [tx(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4), { rz: Math.PI / 2, x: 0.25 }), '#cfd6dc'],
        [tx(new THREE.SphereGeometry(0.1, 8, 6, 0, Math.PI), { x: 0.5, ry: Math.PI / 2 }), '#f2f4f6'],
      ]), vc);
      arm.rotation.y = i * Math.PI * 2 / 3; spinner.add(arm);
    }
    g.add(spinner);
  }
  if (type === 'cam') { spinner = g.children[0]; }
  return { g, led, topY, spinner };
}

function gatewayTower() {
  const g = new THREE.Group();
  const parts = [];
  const H = 16;
  for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]) parts.push([tx(new THREE.CylinderGeometry(0.06, 0.08, H, 4), { x: x * 0.6, z: z * 0.6, y: H / 2 }), '#c4ccd3']);
  for (let y = 1; y < H; y += 2) for (const r of [0, Math.PI / 2]) parts.push([tx(new THREE.BoxGeometry(1.0, 0.05, 0.05), { y, ry: r }), '#c4ccd3']);
  parts.push([tx(new THREE.CylinderGeometry(0.05, 0.05, 3.5, 6), { y: H + 1.7 }), '#f2f4f6']);
  parts.push([tx(new THREE.BoxGeometry(0.5, 1.2, 0.3), { y: H - 2, x: 0.5 }), '#f2f4f6']);
  const m = new THREE.Mesh(mergeColored(parts), vc); m.castShadow = true;
  g.add(m);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.4, 0.3) }));
  beacon.position.y = H + 3.6;
  g.add(beacon);
  return { g, beacon, topY: H + 2 };
}

const linkMat = (color) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0.35 }, uLen: { value: 50 }, uSpeed: { value: 1 }, uOffset: { value: Math.random() } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform float uTime, uOpacity, uLen, uSpeed, uOffset; uniform vec3 uColor; varying vec2 vUv;
    void main(){
      float k = vUv.x * uLen / 14.0 - uTime * uSpeed * 1.4 + uOffset;
      float f = fract(k);
      float pulse = smoothstep(0.0, 0.08, f) * (1.0 - smoothstep(0.08, 0.32, f));
      float end = smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.96, vUv.x);
      vec3 c = uColor * (0.35 + pulse * 3.5);
      gl_FragColor = vec4(c * uOpacity * end, 1.0);
    }`,
});

function arc(a, b, lift) {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mid.y += lift;
  return new THREE.QuadraticBezierCurve3(a, mid, b);
}

export function createSensors(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const nodes = [], links = [], pickables = [];
  const ringGeo = new THREE.RingGeometry(0.9, 1.0, 48).rotateX(-Math.PI / 2);

  const gws = GATEWAYS.map((gw) => {
    const t = gatewayTower();
    t.g.position.set(gw.x, 0, gw.z);
    group.add(t.g);
    t.g.userData.pick = { type: 'gateway', id: gw.id };
    pickables.push(t.g);
    const el = document.createElement('div');
    el.className = 'tag tag-sensor tag-gw';
    el.innerHTML = `<b>${gw.id}</b><span class="v">LoRaWAN</span>`;
    const label = new CSS2DObject(el); label.position.y = t.topY + 3; label.visible = false; t.g.add(label);
    return { ...gw, ...t, label, pos: new THREE.Vector3(gw.x, t.topY, gw.z) };
  });

  const hubPos = new THREE.Vector3(HUB.x - 2, 30, HUB.z);
  // 网关 -> 数据中心（主干链路）
  for (const gw of gws) {
    const c = arc(gw.pos, hubPos, 40);
    const len = c.getLength();
    const mat = linkMat(0x4ff0ff);
    mat.uniforms.uLen.value = len; mat.uniforms.uSpeed.value = 1.6;
    const tube = new THREE.Mesh(new THREE.TubeGeometry(c, 64, 0.35, 6), mat);
    tube.renderOrder = 5;
    group.add(tube);
    links.push({ mesh: tube, mat, trunk: true });
  }

  for (const s of SENSORS) {
    const n = nodeModel(s.type);
    n.g.position.set(s.x, 0, s.z);
    group.add(n.g);
    n.g.userData.pick = { type: 'sensor', id: s.id };
    pickables.push(n.g);
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(SENSOR_TYPES[s.type].color).multiplyScalar(1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.15;
    n.g.add(ring);
    const el = document.createElement('div');
    el.className = 'tag tag-sensor';
    el.style.setProperty('--c', SENSOR_TYPES[s.type].color);
    el.innerHTML = `<b>${s.id}</b><span class="v">--</span>`;
    const label = new CSS2DObject(el); label.position.y = n.topY + 1.2; label.visible = false; n.g.add(label);
    // 最近网关
    let best = gws[0], bd = 1e9;
    for (const gw of gws) { const d = Math.hypot(gw.x - s.x, gw.z - s.z); if (d < bd) { bd = d; best = gw; } }
    const from = new THREE.Vector3(s.x, n.topY, s.z);
    const c = arc(from, best.pos, Math.min(30, bd * 0.25 + 6));
    const len = c.getLength();
    const mat = linkMat(SENSOR_TYPES[s.type].color);
    mat.uniforms.uLen.value = len;
    const tube = new THREE.Mesh(new THREE.TubeGeometry(c, Math.max(16, Math.floor(len / 3)), 0.14, 5), mat);
    tube.renderOrder = 5;
    group.add(tube);
    links.push({ mesh: tube, mat, trunk: false });
    nodes.push({ ...s, ...n, ring, ringMat, label, el, phase: Math.random(), gateway: best.id, status: s.id === 'S-014' ? 'lowbat' : 'online', battery: s.id === 'S-014' ? 14 : 62 + Math.floor(Math.random() * 37), rssi: -60 - Math.floor(bd / 6) - Math.floor(Math.random() * 8) });
  }

  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  let emphasis = 0, emphasisTarget = 0;

  return {
    group, nodes, gateways: gws, byId, pickables, links,
    setEmphasis(v) { emphasisTarget = v; },
    update(t, dt) {
      emphasis += (emphasisTarget - emphasis) * Math.min(1, dt * 3);
      for (const l of links) {
        l.mat.uniforms.uTime.value = t;
        l.mat.uniforms.uOpacity.value = (l.trunk ? 0.28 : 0.12) + emphasis * (l.trunk ? 0.75 : 0.85);
      }
      for (const n of nodes) {
        const ph = (t * 0.6 + n.phase) % 1;
        n.ring.scale.setScalar(1 + ph * (6 + emphasis * 8));
        n.ringMat.opacity = (1 - ph) * (0.25 + emphasis * 0.75);
        const blink = n.status === 'lowbat' ? (Math.sin(t * 6) > 0 ? 1 : 0.1) : 0.75 + Math.sin(t * 3 + n.phase * 6) * 0.25;
        n.led.material.color.set(n.status === 'lowbat' ? 0xffa020 : SENSOR_TYPES[n.type].color).multiplyScalar(3 * blink);
        if (n.spinner && n.type === 'weather') n.spinner.rotation.y += dt * 6;
        if (n.spinner && n.type === 'cam') n.spinner.rotation.y = Math.sin(t * 0.3 + n.phase * 5) * 0.8;
      }
      for (const gw of gws) gw.beacon.material.color.setRGB(Math.sin(t * 3) > 0.6 ? 5 : 0.4, 0.3, 0.2);
    },
  };
}
