// 无人机：巡检 / 植保 / 测绘，含扫描光锥、云台相机
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeColored, tx } from '../util.js';
import { Particles } from './effects.js';

const vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.5 });
const propMat = new THREE.MeshBasicMaterial({ color: 0xcfd8e0, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false });

function droneModel(accent = '#36e6ff', sprayer = false) {
  const g = new THREE.Group();
  const parts = [
    [tx(new THREE.BoxGeometry(0.9, 0.28, 0.6), {}), '#e9edf1'],
    [tx(new THREE.BoxGeometry(0.6, 0.12, 0.42), { y: 0.18 }), '#2a3138'],
    [tx(new THREE.BoxGeometry(0.92, 0.04, 0.08), { y: -0.05, z: 0.31 }), accent],
    [tx(new THREE.SphereGeometry(0.13, 10, 8), { y: -0.25, x: 0.3 }), '#1a1d21'],
  ];
  const motors = [];
  for (const [x, z] of [[0.75, 0.75], [0.75, -0.75], [-0.75, 0.75], [-0.75, -0.75]]) {
    const len = Math.hypot(x, z);
    parts.push([tx(new THREE.BoxGeometry(len, 0.07, 0.09), { x: x / 2, z: z / 2, ry: -Math.atan2(z, x) }), '#3a4148']);
    parts.push([tx(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 10), { x, z, y: 0.06 }), '#1f2328']);
    parts.push([tx(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 4), { x: x * 0.5, z: z * 0.5, y: -0.3 }), '#3a4148']);
    motors.push([x, z]);
  }
  if (sprayer) {
    parts.push([tx(new THREE.CylinderGeometry(0.3, 0.3, 0.4, 12), { y: -0.35 }), '#f2f4f6']);
    parts.push([tx(new THREE.BoxGeometry(2.0, 0.04, 0.04), { y: -0.55 }), '#3a4148']);
  }
  const body = new THREE.Mesh(mergeColored(parts), vc);
  body.castShadow = true;
  g.add(body);
  const props = motors.map(([x, z]) => {
    const p = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20).rotateX(-Math.PI / 2), propMat);
    p.position.set(x, 0.16, z); g.add(p);
    return p;
  });
  const leds = [];
  for (const [x, z, c] of [[0.75, 0.75, [0.3, 3, 0.3]], [0.75, -0.75, [0.3, 3, 0.3]], [-0.75, 0.75, [3, 0.2, 0.2]], [-0.75, -0.75, [3, 0.2, 0.2]]]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(...c) }));
    l.position.set(x, -0.04, z); g.add(l); leds.push(l);
  }
  g.scale.setScalar(2.2);
  return { g, props, leds };
}

function scanCone(color = 0x36e6ff) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0.6 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime, uOpacity; uniform vec3 uColor; varying vec2 vUv;
      void main(){ float a = pow(vUv.y, 1.5) * 0.18 + smoothstep(0.9, 1.0, fract(vUv.y * 5.0 + uTime * 1.5)) * 0.25 * vUv.y;
        gl_FragColor = vec4(uColor * a * uOpacity, 1.0); }`,
  });
  // 顶点在上（无人机），底面在地面
  const geo = new THREE.ConeGeometry(1, 1, 40, 1, true).translate(0, -0.5, 0);
  const cone = new THREE.Mesh(geo, mat);
  const footMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const foot = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64).rotateX(-Math.PI / 2), footMat);
  return { cone, mat, foot, footMat };
}

export function createDrones(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const pickables = [];
  const defs = [
    {
      id: 'UAV-01', name: '巡检无人机 UAV-01', role: '多光谱 + 可见光 + 热成像巡检', alt: 28, speed: 8, accent: '#36e6ff', vision: true,
      pts: [[45, 165], [105, 150], [165, 140], [200, 105], [160, 80], [100, 95], [55, 115], [25, 40], [-30, -60], [-90, -175], [-118, -150], [-60, -110], [-40, -150], [20, -175], [55, -140], [95, -115], [110, -60], [70, 40], [20, 120], [80, 195], [175, 200], [120, 175]],
    },
    {
      id: 'UAV-02', name: '植保无人机 UAV-02', role: '变量喷施 · 玉米大斑病防治', alt: 6, speed: 6, accent: '#7cff9b', sprayer: true,
      pts: (() => { const p = []; for (let i = 0; i < 8; i++) { const z = -170 + i * 7; p.push(i % 2 ? [68, z] : [14, z]); p.push(i % 2 ? [14, z] : [68, z]); } return p; })(),
      linear: true,
    },
    {
      id: 'UAV-03', name: '测绘无人机 UAV-03', role: '高空正射影像 / 三维建模', alt: 80, speed: 14, accent: '#ffd166',
      pts: Array.from({ length: 12 }, (_, i) => [Math.cos(i / 12 * Math.PI * 2) * 190, Math.sin(i / 12 * Math.PI * 2) * 170 - 10]),
    },
  ];
  const spray = new Particles(scene, { count: 1400, size: 0.35, color: 0xe6fff0, opacity: 0.45, gravity: -4, drag: 1.2 });

  const drones = defs.map((d) => {
    const m = droneModel(d.accent, d.sprayer);
    group.add(m.g);
    const curve = new THREE.CatmullRomCurve3(d.pts.map(([x, z]) => new THREE.Vector3(x, d.alt, z)), !d.linear, d.linear ? 'chordal' : 'centripetal', 0.5);
    const len = curve.getLength();
    const sc = scanCone(new THREE.Color(d.accent).getHex());
    group.add(sc.cone, sc.foot);
    // 规划航线
    const linePts = curve.getSpacedPoints(Math.floor(len / 2));
    const pathGeo = new THREE.BufferGeometry().setFromPoints(linePts);
    const path = new THREE.Line(pathGeo, new THREE.LineDashedMaterial({ color: new THREE.Color(d.accent).multiplyScalar(1.6), dashSize: 3, gapSize: 2, transparent: true, opacity: 0.0 }));
    path.computeLineDistances();
    group.add(path);
    const el = document.createElement('div');
    el.className = 'tag tag-drone';
    el.style.setProperty('--c', d.accent);
    el.innerHTML = `<b>${d.id}</b><span class="v">${d.role.split(' ')[0]}</span>`;
    const label = new CSS2DObject(el); label.position.y = 2; label.visible = false; m.g.add(label);
    m.g.userData.pick = { type: 'drone', id: d.id };
    pickables.push(m.g);
    return { ...d, ...m, curve, len, u: Math.random(), dir: 1, sc, path, label, el, battery: 60 + Math.random() * 35, pos: new THREE.Vector3(), fwd: new THREE.Vector3(1, 0, 0), bank: 0 };
  });

  // 巡检无人机云台相机
  const vision = drones.find((d) => d.vision);
  const visionCam = new THREE.PerspectiveCamera(48, 16 / 10, 0.5, 1600);
  const lookTarget = new THREE.Vector3();
  let emphasis = 0, emphasisTarget = 0;

  const tmp = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function update(dt, t) {
    emphasis += (emphasisTarget - emphasis) * Math.min(1, dt * 3);
    for (const d of drones) {
      if (d.linear) {
        d.u += d.dir * dt * d.speed / d.len;
        if (d.u > 1) { d.u = 1; d.dir = -1; } else if (d.u < 0) { d.u = 0; d.dir = 1; }
      } else d.u = (d.u + dt * d.speed / d.len) % 1;
      d.curve.getPointAt(d.u, d.pos);
      d.curve.getTangentAt(d.u, tmp).multiplyScalar(d.dir);
      d.pos.y += Math.sin(t * 1.3 + d.alt) * 0.4;
      // 平滑朝向 + 倾斜
      const prevYaw = Math.atan2(-d.fwd.z, d.fwd.x);
      d.fwd.lerp(tmp.setY(0).normalize(), Math.min(1, dt * 2)).normalize();
      const yaw = Math.atan2(-d.fwd.z, d.fwd.x);
      let dy = yaw - prevYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      d.bank += ((-dy / Math.max(dt, 1e-3)) * 0.25 - d.bank) * Math.min(1, dt * 3);
      d.g.position.copy(d.pos);
      d.g.rotation.set(d.bank * 0.4, yaw, -0.18, 'YXZ');
      for (const p of d.props) p.rotation.y += dt * 60;
      d.leds.forEach((l, i) => l.visible = Math.sin(t * 8 + i) > -0.3);
      // 光锥
      const h = d.pos.y;
      const r = d.vision ? h * 0.55 : d.sprayer ? 3.5 : h * 0.35;
      d.sc.cone.position.copy(d.pos); d.sc.cone.position.y -= 0.6;
      d.sc.cone.scale.set(r, h - 0.6, r);
      d.sc.foot.position.set(d.pos.x, 0.25, d.pos.z);
      d.sc.foot.scale.setScalar(r * (0.95 + Math.sin(t * 4) * 0.05));
      d.sc.mat.uniforms.uTime.value = t;
      d.sc.mat.uniforms.uOpacity.value = d.sprayer ? 0.0 : 0.45 + emphasis * 0.6;
      d.sc.footMat.opacity = d.sprayer ? 0 : 0.25 + emphasis * 0.7;
      d.path.material.opacity = emphasis * 0.8;
      if (d.sprayer) {
        for (let k = 0; k < 14; k++) {
          const s = (Math.random() - 0.5) * 4.2;
          spray.emit(d.pos.x - d.fwd.z * s, d.pos.y - 1.3, d.pos.z + d.fwd.x * s, (Math.random() - 0.5) * 0.6, -3 - Math.random() * 2, (Math.random() - 0.5) * 0.6, 1.6);
        }
      }
    }
    spray.update(dt);
    // 云台相机：前下方 52°
    visionCam.position.copy(vision.pos).add(tmp.set(0, -1.2, 0));
    lookTarget.copy(vision.pos).addScaledVector(vision.fwd, 26);
    lookTarget.y = 0;
    visionCam.up.copy(up);
    visionCam.lookAt(lookTarget);
  }

  return { group, drones, vision, visionCam, pickables, update, setEmphasis(v) { emphasisTarget = v; } };
}
