// 简易 CPU 粒子系统（喷灌水雾 / 植保喷洒 / 收割扬尘 / 萤火虫）
import * as THREE from 'three';
import { glowSprite } from '../util.js';

const sprite = glowSprite('rgba(255,255,255,1)');

export class Particles {
  constructor(scene, { count = 1000, size = 0.4, color = 0xffffff, opacity = 0.7, additive = false, gravity = -9.8, drag = 0.4 } = {}) {
    this.count = count;
    this.gravity = gravity; this.drag = drag;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.max = new Float32Array(count);
    for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = -999;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.PointsMaterial({ size, map: sprite, color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.cursor = 0;
  }
  emit(x, y, z, vx, vy, vz, life) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.count;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.max[i] = life;
  }
  update(dt) {
    const p = this.pos, v = this.vel, g = this.gravity, k = Math.max(0, 1 - this.drag * dt);
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0 || p[i * 3 + 1] < 0) { p[i * 3 + 1] = -999; this.life[i] = 0; continue; }
      v[i * 3] *= k; v[i * 3 + 2] *= k; v[i * 3 + 1] = v[i * 3 + 1] * k + g * dt;
      p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

export function createFireflies(scene, count = 260) {
  const geo = new THREE.BufferGeometry();
  const base = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const side = Math.floor(Math.random() * 4);
    const t = Math.random() * 460 - 230;
    const off = 240 + Math.random() * 15;
    base[i * 3] = side < 2 ? t : (side === 2 ? -off : off);
    base[i * 3 + 2] = side < 2 ? (side === 0 ? -off : off - 15) : t;
    base[i * 3 + 1] = 1 + Math.random() * 4;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3));
  const mat = new THREE.PointsMaterial({ size: 1.1, map: sprite, color: new THREE.Color(2.2, 3, 0.8), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  return {
    update(t, night) {
      mat.opacity = night * (0.6 + Math.sin(t * 2) * 0.2);
      if (night < 0.05) return;
      const p = geo.attributes.position.array;
      for (let i = 0; i < count; i++) {
        p[i * 3] = base[i * 3] + Math.sin(t * 0.5 + i) * 3;
        p[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.9 + i * 1.7) * 1.2;
        p[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.4 + i * 0.7) * 3;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
