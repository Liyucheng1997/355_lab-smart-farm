// 无人机云台画面（画中画渲染）+ AI 目标检测叠加（可见光 / 多光谱 / 热成像）
import * as THREE from 'three';
import { THERMAL_LAYER } from '../scene/animals.js';
import { cropUniforms } from '../scene/crops.js';

const IRON = `vec3 iron(float t){ t = clamp(t,0.0,1.0);
  vec3 c0 = vec3(0.0,0.0,0.05), c1 = vec3(0.25,0.0,0.45), c2 = vec3(0.75,0.05,0.35), c3 = vec3(0.98,0.45,0.05), c4 = vec3(1.0,0.9,0.3), c5 = vec3(1.0,1.0,0.95);
  if (t < 0.2) return mix(c0,c1,t/0.2); if (t < 0.45) return mix(c1,c2,(t-0.2)/0.25); if (t < 0.7) return mix(c2,c3,(t-0.45)/0.25); if (t < 0.88) return mix(c3,c4,(t-0.7)/0.18); return mix(c4,c5,(t-0.88)/0.12); }`;
const VS = `varying vec3 vN; varying vec3 vW; varying vec3 vV;
  void main(){ vec4 p = vec4(position,1.0);
    #ifdef USE_INSTANCING
      p = instanceMatrix * p;
    #endif
    vec4 w = modelMatrix * p; vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
    vec4 mv = viewMatrix * w; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;

function thermalMaterials() {
  const cold = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: 1 } },
    vertexShader: VS,
    fragmentShader: `uniform float uSun; varying vec3 vN; varying vec3 vW; varying vec3 vV; ${IRON}
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){ float n = vn(vW.xz * 0.05) * 0.6 + vn(vW.xz * 0.3) * 0.3 + h(floor(vW.xz * 2.0)) * 0.1;
        float t = 0.13 + max(vN.y,0.0) * (0.06 + 0.1 * uSun) + n * 0.09 - (1.0 - abs(vN.y)) * 0.05 + clamp(vW.y, 0.0, 12.0) * 0.006 * uSun;
        if (vW.y > 300.0) t = 0.04;
        gl_FragColor = vec4(iron(t), 1.0); }`,
  });
  const hot = new THREE.ShaderMaterial({
    vertexShader: VS,
    fragmentShader: `varying vec3 vN; varying vec3 vW; varying vec3 vV; ${IRON}
      void main(){ float f = abs(dot(normalize(vN), normalize(vV))); float t = 0.62 + f * 0.36; gl_FragColor = vec4(iron(t), 1.0); }`,
  });
  return { cold, hot };
}

const CLS = {
  cow: { name: 'cow', zh: '奶牛', color: '#3dffa0' },
  sheep: { name: 'sheep', zh: '绵羊', color: '#7cd6ff' },
  chicken: { name: 'chicken', zh: '蛋鸡', color: '#ffe066' },
  disease: { name: 'disease', zh: '病斑', color: '#ff4a5a' },
  vehicle: { name: 'harvester', zh: '农机', color: '#ffb020' },
};

export function createVision({ renderer, scene, cam, feedEl, canvas, statsEl, targets, getDrone }) {
  const ctx = canvas.getContext('2d');
  const th = thermalMaterials();
  let mode = 'rgb';
  const v3 = new THREE.Vector3(), corners = Array.from({ length: 8 }, () => new THREE.Vector3());
  let lastStats = 0, infer = 16;
  const dpr = Math.min(window.devicePixelRatio, 2);

  function setMode(m) { mode = m; }

  function render(sunFactor) {
    const rect = feedEl.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return null;
    const W = window.innerWidth, H = window.innerHeight;
    cam.aspect = rect.width / rect.height;
    cam.updateProjectionMatrix();
    renderer.setRenderTarget(null);
    renderer.autoClear = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.setScissorTest(true);
    const x = rect.left, y = H - rect.bottom;
    renderer.setScissor(x, y, rect.width, rect.height);
    renderer.setViewport(x, y, rect.width, rect.height);
    renderer.clear();
    const ndvi = cropUniforms.uNdvi.value;
    const fog = scene.fog;
    if (mode === 'thermal') {
      scene.fog = null;
      th.cold.uniforms.uSun.value = sunFactor;
      scene.overrideMaterial = th.cold;
      cam.layers.set(0);
      renderer.render(scene, cam);
      scene.overrideMaterial = th.hot;
      cam.layers.set(THERMAL_LAYER);
      renderer.render(scene, cam);
      cam.layers.set(0);
      scene.overrideMaterial = null;
      scene.fog = fog;
    } else {
      cropUniforms.uNdvi.value = mode === 'ndvi' ? 1 : 0;
      renderer.render(scene, cam);
      cropUniforms.uNdvi.value = ndvi;
    }
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
    renderer.autoClear = true;
    renderer.shadowMap.autoUpdate = true;
    return rect;
  }

  function project(p, w, h) {
    v3.copy(p).project(cam);
    return { x: (v3.x * 0.5 + 0.5) * w, y: (-v3.y * 0.5 + 0.5) * h, z: v3.z };
  }

  function draw(rect, t) {
    const w = Math.round(rect.width), h = Math.round(rect.height);
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const counts = {};
    const camPos = cam.position;
    const dets = [];
    for (const tg of targets) {
      let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, behind = false;
      let dist;
      if (tg.kind === 'disease') {
        dist = camPos.distanceTo(v3.set(tg.x, 0, tg.z));
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * Math.PI * 2;
          const s = project(v3.set(tg.x + Math.cos(a) * tg.r, 0.8, tg.z + Math.sin(a) * tg.r), w, h);
          if (s.z > 1) behind = true;
          minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
        }
      } else {
        const o = tg.obj;
        dist = camPos.distanceTo(o.position);
        if (dist > 150) continue;
        const [L, Hh, Wd] = tg.size;
        let k = 0;
        for (const sx of [-0.5, 0.5]) for (const sy of [0, 1]) for (const sz of [-0.5, 0.5]) corners[k++].set(sx * L, sy * Hh, sz * Wd).applyMatrix4(o.matrixWorld);
        for (const c of corners) {
          const s = project(c, w, h);
          if (s.z > 1) behind = true;
          minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
        }
      }
      if (behind || maxX < 0 || maxY < 0 || minX > w || minY > h) continue;
      if (maxX - minX < 5 || maxY - minY < 5 || maxX - minX > w * 0.9) continue;
      dets.push({ tg, minX, minY, maxX, maxY, dist });
      counts[tg.kind] = (counts[tg.kind] || 0) + 1;
    }

    for (const d of dets) {
      const c = CLS[d.tg.kind];
      const alarm = d.tg.status && d.tg.status() !== 'normal';
      const col = alarm ? (d.tg.status() === 'alert' ? '#ff4a5a' : '#ffc94a') : c.color;
      const j = Math.sin(t * 9 + d.minX) * 0.6;
      const x0 = d.minX - 2 + j, y0 = d.minY - 2, x1 = d.maxX + 2 - j, y1 = d.maxY + 2;
      const bw = x1 - x0, bh = y1 - y0, k = Math.min(10, bw * 0.3, bh * 0.3);
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.shadowColor = col; ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + k); ctx.lineTo(x0, y0); ctx.lineTo(x0 + k, y0);
      ctx.moveTo(x1 - k, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + k);
      ctx.moveTo(x1, y1 - k); ctx.lineTo(x1, y1); ctx.lineTo(x1 - k, y1);
      ctx.moveTo(x0 + k, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - k);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.12; ctx.fillStyle = col; ctx.fillRect(x0, y0, bw, bh); ctx.globalAlpha = 1;
      const conf = Math.min(0.995, d.tg.conf + Math.sin(t * 2.3 + d.minY) * 0.012);
      let text;
      if (mode === 'thermal' && d.tg.temp) text = `${c.name} ${d.tg.temp().toFixed(1)}℃`;
      else if (d.tg.kind === 'disease') text = `${d.tg.label} ${conf.toFixed(2)}`;
      else text = `${c.name} ${conf.toFixed(2)}${d.tg.id ? ' #' + d.tg.id : ''}`;
      if (alarm && d.tg.diag) text += ` ⚠${d.tg.diag()}`;
      ctx.font = '600 10px Bahnschrift, Consolas, monospace';
      const tw = ctx.measureText(text).width + 8;
      const ly = y0 - 14 < 0 ? y1 + 1 : y0 - 14;
      ctx.fillStyle = col; ctx.fillRect(x0, ly, tw, 13);
      ctx.fillStyle = '#02121c'; ctx.fillText(text, x0 + 4, ly + 10);
    }

    // HUD
    ctx.strokeStyle = 'rgba(200,250,255,.7)'; ctx.lineWidth = 1; ctx.font = '11px Bahnschrift, Consolas, monospace';
    const cx = w / 2, cy = h / 2;
    ctx.beginPath(); ctx.moveTo(cx - 14, cy); ctx.lineTo(cx - 5, cy); ctx.moveTo(cx + 5, cy); ctx.lineTo(cx + 14, cy); ctx.moveTo(cx, cy - 14); ctx.lineTo(cx, cy - 5); ctx.moveTo(cx, cy + 5); ctx.lineTo(cx, cy + 14); ctx.stroke();
    ctx.strokeRect(cx - 40, cy - 28, 80, 56);
    const B = 16;
    ctx.strokeStyle = 'rgba(54,230,255,.9)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(6, 6 + B); ctx.lineTo(6, 6); ctx.lineTo(6 + B, 6); ctx.moveTo(w - 6 - B, 6); ctx.lineTo(w - 6, 6); ctx.lineTo(w - 6, 6 + B);
    ctx.moveTo(w - 6, h - 6 - B); ctx.lineTo(w - 6, h - 6); ctx.lineTo(w - 6 - B, h - 6); ctx.moveTo(6 + B, h - 6); ctx.lineTo(6, h - 6); ctx.lineTo(6, h - 6 - B);
    ctx.stroke();
    const dr = getDrone();
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(10, 10, 168, 30); ctx.fillRect(w - 150, 10, 140, 30);
    ctx.fillStyle = Math.sin(t * 5) > 0 ? '#ff4a5a' : 'rgba(255,74,90,.3)';
    ctx.beginPath(); ctx.arc(19, 19, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e6fbff';
    ctx.fillText(`REC  UAV-01  ${mode === 'thermal' ? 'IR 640×512' : mode === 'ndvi' ? 'MS 5-BAND' : 'RGB 4K'}`, 28, 23);
    const lat = 31.2304 - dr.pos.z * 0.000009, lon = 121.4737 + dr.pos.x * 0.0000105;
    ctx.fillText(`${lat.toFixed(6)}N ${lon.toFixed(6)}E`, 14, 36);
    ctx.fillText(`ALT ${dr.pos.y.toFixed(1)}m  SPD ${dr.speed.toFixed(1)}m/s`, w - 144, 23);
    ctx.fillText(`GIMBAL -52°  BAT ${dr.battery.toFixed(0)}%`, w - 144, 36);
    if (mode === 'thermal') {
      const g = ctx.createLinearGradient(0, h - 60, 0, h - 160);
      ['#00000d', '#400073', '#bf0d59', '#fa730d', '#ffe64d', '#fffff2'].forEach((c, i) => g.addColorStop(i / 5, c));
      ctx.fillStyle = g; ctx.fillRect(w - 18, h - 160, 8, 100);
      ctx.fillStyle = '#e6fbff'; ctx.fillText('42℃', w - 46, h - 152); ctx.fillText('8℃', w - 40, h - 60);
    }
    if (mode === 'ndvi') {
      const g = ctx.createLinearGradient(0, h - 60, 0, h - 160);
      ['#f2140a', '#ffd114', '#0df252'].forEach((c, i) => g.addColorStop(i / 2, c));
      ctx.fillStyle = g; ctx.fillRect(w - 18, h - 160, 8, 100);
      ctx.fillStyle = '#e6fbff'; ctx.fillText('0.9', w - 40, h - 152); ctx.fillText('0.2', w - 40, h - 60);
    }

    if (t - lastStats > 0.5) {
      lastStats = t;
      infer = 13 + Math.random() * 7;
      const chip = (k) => counts[k] ? `<span class="chip" style="color:${CLS[k].color};border-color:${CLS[k].color}">${CLS[k].zh} ${counts[k]}</span>` : '';
      const total = dets.length;
      statsEl.innerHTML = `<span>目标 <b>${total}</b></span>${['cow', 'sheep', 'chicken', 'disease', 'vehicle'].map(chip).join('')}<span style="margin-left:auto">推理 <b>${infer.toFixed(1)}</b>ms · mAP<b>.947</b></span>`;
    }
    return { dets, counts };
  }

  return { setMode, render, draw, get mode() { return mode; } };
}
