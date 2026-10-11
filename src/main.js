// 智慧农场数字孪生平台 —— 入口：场景装配、数据驱动、交互与渲染循环
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createWorld } from './scene/world.js';
import { createTerrain } from './scene/terrain.js';
import { createCrops, cropUniforms } from './scene/crops.js';
import { createStructures } from './scene/structures.js';
import { createAnimals } from './scene/animals.js';
import { createSensors } from './scene/sensors.js';
import { createDrones } from './scene/drones.js';
import { createHarvester } from './scene/harvester.js';
import { Particles, createFireflies } from './scene/effects.js';
import { FarmSim } from './data/simulator.js';
import { yieldEnsemble, CROP_MODEL, stageOf, DISEASE } from './data/models.js';
import { createCharts } from './ui/charts.js';
import { createVision } from './ui/vision.js';
import { createHud, detailContent, sensorReading } from './ui/hud.js';
import { PLOTS, HOTSPOTS, FACILITIES, CROP_INFO, SENSORS, plotById } from './layout.js';
import { clamp, easeInOutCubic, lerp, fmt } from './util.js';

const $ = (id) => document.getElementById(id);
const nextFrame = () => new Promise((r) => setTimeout(r, 40));

async function boot(msg, pct) {
  const d = document.createElement('div');
  d.innerHTML = `<b>[ OK ]</b>${msg}`;
  $('ld-log').appendChild(d);
  $('ld-bar').style.width = pct + '%';
  await nextFrame();
}

async function main() {
  await boot('初始化 WebGL2 渲染管线 · HDR 色调映射 · 辉光后处理', 4);
  const world = createWorld($('scene'), $('labels'));
  const { scene, camera, controls, renderer, composer, outline } = world;

  await boot('加载地形高程模型 DEM · 防护林带 / 山林植被实例化', 14);
  const terrain = createTerrain(scene);

  await boot('程序化建模作物群体：水稻 · 玉米 · 苜蓿 · 苹果 · 设施蔬菜（GPU 实例化）', 30);
  const crops = createCrops(scene);

  await boot('构建设施孪生体：智能温室 / 牛舍 / 数据中心 / 光伏 / 风电 / 中心支轴喷灌', 44);
  const structures = createStructures(scene);

  await boot('接入牲畜 RFID 耳标 66 个 · 行为状态机就绪', 56);
  const animals = createAnimals(scene);

  await boot(`物联网组网：${SENSORS.length} 个传感节点 · 4 座 LoRaWAN 网关 · 5G 回传`, 64);
  const sensors = createSensors(scene);

  await boot('无人机编队上线：UAV-01 巡检 / UAV-02 植保 / UAV-03 测绘', 72);
  const drones = createDrones(scene);
  const harvester = createHarvester(scene, crops);
  const fireflies = createFireflies(scene);
  const pivotSpray = new Particles(scene, { count: 2600, size: 0.55, color: 0xd8f4ff, opacity: 0.5, gravity: -7, drag: 0.6 });

  await boot('启动机理模型：FAO-56 Penman-Monteith · 土壤水量平衡 · 积温产量模型 · 病害侵染模型', 82);
  const sim = new FarmSim();
  const yieldCache = {};
  const computeYield = (id) => {
    const p = plotById[id], s = sim.plots[id];
    yieldCache[id] = yieldEnsemble({ crop: p.crop, gdd: s.gdd, health: crops.plotData[id].meanHealth, waterStress: clamp(s.stressHours / 240, 0, 1), risk: s.risk, tMean: p.greenhouse ? 22 : 16, seed: id.charCodeAt(0) * 31 + id.charCodeAt(1) });
    return yieldCache[id];
  };
  for (const p of PLOTS) computeYield(p.id);

  await boot('蒙特卡洛集合预测 n=400 × 12 地块 · 视觉检测模型加载完成', 92);
  const charts = createCharts();
  const hud = createHud(sim);
  hud.setStatic({ animals: animals.animals.length, nodes: SENSORS.length + 4 + 66, online: `${SENSORS.length + 3}/${SENSORS.length + 4}` });

  // ---------------- 3D 标签 ----------------
  const mkLabel = (cls, html, pos, parent = scene) => {
    const el = document.createElement('div');
    el.className = 'tag ' + cls;
    el.innerHTML = html;
    const o = new CSS2DObject(el);
    o.position.copy(pos);
    parent.add(o);
    return { o, el };
  };
  const facLabels = FACILITIES.map((f) => mkLabel('tag-fac', `${f.name}<small>${f.id.toUpperCase()}</small>`, new THREE.Vector3(f.x, f.h, f.z)));
  const plotLabels = PLOTS.map((p) => ({ p, ...mkLabel('tag-plot', '', new THREE.Vector3(p.x, p.greenhouse ? 16 : p.crop === 'apple' ? 9 : 6, p.z)) }));

  // 病害热点标记
  const hotspotFx = HOTSPOTS.map((h) => {
    const g = new THREE.Group();
    g.position.set(h.x, 0, h.z);
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.3, 0.35), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(h.r * 0.92, h.r, 64).rotateX(-Math.PI / 2), ringMat);
    ring.position.y = 1.6;
    const beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uTime; varying vec2 vUv; void main(){ float a = pow(1.0 - vUv.y, 2.0) * (0.55 + 0.25 * sin(uTime * 4.0)); gl_FragColor = vec4(vec3(1.0,0.18,0.22) * a, 1.0); }',
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(h.r * 0.98, h.r * 0.98, 14, 48, 1, true), beamMat);
    beam.position.y = 7;
    g.add(ring, beam);
    g.visible = false;
    scene.add(g);
    const conf = 0.88 + (h.severity - 0.4) * 0.2;
    const lbl = mkLabel('tag-hot', `<b>⚠ ${h.disease}</b><span class="v">AI 置信度 ${(conf * 100).toFixed(1)}%</span>`, new THREE.Vector3(0, 16, 0), g);
    return { h, g, ring, ringMat, beamMat, lbl, conf };
  });

  // 地块拾取体
  const plotSlabs = [];
  for (const p of PLOTS) {
    if (p.greenhouse) continue;
    const geo = p.circle ? new THREE.CylinderGeometry(p.r, p.r, 1, 32) : new THREE.BoxGeometry(p.w, 1, p.d);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    m.position.set(p.x, 0.5, p.z);
    m.visible = false;
    m.userData.pick = { type: 'plot', id: p.id };
    scene.add(m);
    plotSlabs.push(m);
  }

  // ---------------- 无人机画面 / 视觉识别 ----------------
  const targets = [];
  for (const a of animals.animals) {
    targets.push({ kind: a.kind, id: a.id, obj: a.g, size: a.built.size.map((v) => v * (a.kind === 'chicken' ? 1.3 : 1)), conf: a.kind === 'cow' ? 0.96 : a.kind === 'sheep' ? 0.93 : 0.88,
      status: () => a.metrics.status, diag: () => a.metrics.diag, temp: () => a.metrics.temp });
  }
  for (const h of HOTSPOTS) targets.push({ kind: 'disease', x: h.x, z: h.z, r: h.r, label: h.disease, conf: 0.88 + (h.severity - 0.4) * 0.2 });
  targets.push({ kind: 'vehicle', id: 'HV-01', obj: harvester.group, size: [11, 6.5, 6], conf: 0.98, temp: () => 68.2 });
  const vision = createVision({ renderer, scene, cam: drones.visionCam, feedEl: $('feed'), canvas: $('feed-overlay'), statsEl: $('feed-stats'), targets, getDrone: () => drones.vision });
  drones.visionCam.far = 3000;
  document.querySelectorAll('[data-feed]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('[data-feed]').forEach((x) => x.classList.toggle('on', x === b));
    vision.setMode(b.dataset.feed);
  }));

  // 牲畜历史（24h 体温）
  for (const a of animals.animals) {
    for (let i = 0; i < 24; i++) {
      const h = (sim.hour - 23 + i + 24) % 24;
      a.history.temp.push(a.baseTemp + 0.25 * Math.sin((h - 15) / 24 * Math.PI * 2) + (a.condition === 'fever' ? 1.55 * Math.min(1, (i + 6) / 18) : 0) + (Math.random() - 0.5) * 0.08);
    }
  }

  // ---------------- 模式 / 相机 ----------------
  const SHOTS = {
    overview: { pos: [30, 250, 360], target: [0, 0, -15] },
    crop: { pos: [-20, 95, -40], target: [-75, 0, -150] },
    livestock: { pos: [70, 62, 52], target: [128, 0, 118] },
    iot: { pos: [-10, 380, 250], target: [0, 0, -25] },
    drone: { pos: [0, 120, 100], target: [0, 0, 0] },
  };
  let mode = 'overview', visMode = 'overview';
  let anim = null, follow = null, chase = null;
  let ndviTarget = 0;
  let tour = null;
  const tmpV = new THREE.Vector3();

  function flyTo(pos, target, dur = 2.2) {
    anim = { p0: camera.position.clone(), p1: new THREE.Vector3(...pos), t0: controls.target.clone(), t1: new THREE.Vector3(...target), k: 0, dur };
  }
  function applyVisuals(m) {
    visMode = m;
    ndviTarget = m === 'crop' ? 1 : 0;
    facLabels.forEach((l) => (l.o.visible = m === 'overview'));
    plotLabels.forEach((l) => (l.o.visible = m === 'crop'));
    hotspotFx.forEach((h) => (h.g.visible = m === 'crop'));
    harvester.label.visible = m === 'crop' || m === 'overview';
    harvester.state.emphasis = m === 'crop' ? 1 : 0;
    for (const a of animals.animals) {
      const show = m === 'livestock';
      a.label.visible = show && (a.kind !== 'chicken' || a.metrics.status !== 'normal');
      a.ring.visible = show || a.metrics.status !== 'normal' && m === 'overview';
      if (a.trailLine) a.trailLine.visible = show && a.kind === 'cow';
    }
    structures.virtualFence.material.uniforms.uOpacity.value = m === 'livestock' ? 1 : 0;
    sensors.setEmphasis(m === 'iot' ? 1 : 0);
    sensors.nodes.forEach((n) => (n.label.visible = m === 'iot'));
    sensors.gateways.forEach((g) => (g.label.visible = m === 'iot'));
    drones.setEmphasis(m === 'drone' ? 1 : 0);
    drones.drones.forEach((d) => (d.label.visible = m === 'drone' || m === 'overview'));
    terrain.holoUniforms.uGrid.value = m === 'iot' ? 1 : 0;
  }
  function setMode(m, { fly = true } = {}) {
    if (m === 'tour') { startTour(); return; }
    tour = null; controls.autoRotate = false;
    mode = m;
    document.querySelectorAll('#modebar button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    follow = null; chase = m === 'drone' ? drones.vision : null;
    applyVisuals(m);
    if (fly && m !== 'drone') flyTo(SHOTS[m].pos, SHOTS[m].target);
    if (m === 'drone') anim = null;
  }
  const TOUR = [
    { m: 'overview', pos: [-260, 140, 260], target: [0, 0, -20], dur: 9 },
    { m: 'crop', pos: [-150, 46, -60], target: [-100, 0, -150], dur: 9 },
    { m: 'crop', pos: [70, 40, -60], target: [45, 0, -150], dur: 8 },
    { m: 'livestock', pos: [100, 40, 60], target: [130, 0, 120], dur: 9 },
    { m: 'overview', pos: [-170, 30, 60], target: [-140, 6, 125], dur: 8 },
    { m: 'iot', pos: [180, 260, 240], target: [0, 0, -20], dur: 9 },
    { m: 'drone', dur: 10 },
    { m: 'overview', pos: [-120, 70, 70], target: [-150, 0, -25], dur: 8 },
  ];
  function startTour() {
    mode = 'tour';
    document.querySelectorAll('#modebar button').forEach((b) => b.classList.toggle('on', b.dataset.mode === 'tour'));
    tour = { i: -1, t: 0 };
    nextShot();
  }
  function nextShot() {
    tour.i = (tour.i + 1) % TOUR.length;
    tour.t = 0;
    const s = TOUR[tour.i];
    applyVisuals(s.m);
    follow = null;
    chase = s.m === 'drone' ? drones.vision : null;
    controls.autoRotate = s.m !== 'drone';
    controls.autoRotateSpeed = 0.5;
    if (s.pos) flyTo(s.pos, s.target, 3.2);
  }
  document.querySelectorAll('#modebar button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

  // ---------------- 拾取 / 详情 ----------------
  const pickables = [...structures.pickables, ...animals.pickables, ...sensors.pickables, ...drones.pickables, ...harvester.pickables, ...plotSlabs];
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let downAt = null, selected = null, selectedObj = null;
  renderer.domElement.addEventListener('pointerdown', (e) => {
    downAt = [e.clientX, e.clientY];
    if (tour) { tour = null; controls.autoRotate = false; mode = 'free'; document.querySelectorAll('#modebar button').forEach((b) => b.classList.remove('on')); }
    if (chase && mode === 'drone') { /* 无人机模式下允许点击 */ }
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickables, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.pick) o = o.parent;
      if (o) { select(o.userData.pick, o); return; }
    }
    closeDetail();
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (e.buttons) return;
    ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(pickables, true)[0];
    renderer.domElement.style.cursor = hit ? 'pointer' : 'default';
  });
  controls.addEventListener('start', () => { anim = null; if (mode !== 'drone') { chase = null; } });

  function outlineTargets(obj) {
    if (!obj) return [];
    if (obj.visible === false) {
      const pid = obj.userData.pick?.id;
      const p = plotById[pid];
      if (p) return [crops.plotData[pid].mesh];
      return [obj.parent];
    }
    return [obj];
  }
  function select(pick, obj) {
    selected = pick; selectedObj = obj;
    outline.selectedObjects = outlineTargets(obj);
    renderDetail(true);
    $('detail').classList.remove('hidden');
    // 镜头
    const wp = new THREE.Vector3();
    if (pick.type === 'plot') { const p = plotById[pick.id]; wp.set(p.x, 0, p.z); }
    else obj.getWorldPosition(wp);
    const dir = camera.position.clone().sub(controls.target).setY(0).normalize();
    const dist = { animal: 22, sensor: 26, drone: 40, vehicle: 40, plot: 90, facility: 75, gateway: 45 }[pick.type] || 60;
    const hgt = { animal: 12, sensor: 14, drone: 22, vehicle: 20, plot: 60, facility: 45, gateway: 25 }[pick.type] || 40;
    if (tour) { tour = null; controls.autoRotate = false; }
    chase = null;
    flyTo([wp.x + dir.x * dist, hgt + wp.y, wp.z + dir.z * dist], [wp.x, wp.y + (pick.type === 'drone' ? 0 : 1), wp.z], 1.6);
    follow = pick.type === 'animal' || pick.type === 'drone' || pick.type === 'vehicle' ? obj : null;
  }
  function closeDetail() {
    selected = null; selectedObj = null; follow = null;
    outline.selectedObjects = [];
    $('detail').classList.add('hidden');
  }
  $('detail-close').onclick = closeDetail;
  const ctxAll = { sim, crops, animals, sensors, drones, harvester, yieldCache };
  function renderDetail(full) {
    if (!selected) return;
    const c = detailContent(selected, ctxAll);
    if (!c) return;
    $('d-type').textContent = c.type;
    $('d-title').textContent = c.title;
    $('d-grid').innerHTML = c.grid;
    $('d-ai').innerHTML = c.ai;
    $('chart-detail').style.display = c.chart ? '' : 'none';
    charts.updateDetail(c.chart, c.unit);
    if (full) {
      $('d-actions').innerHTML = '';
      for (const [label, act] of c.actions) {
        const b = document.createElement('button');
        b.textContent = label;
        b.onclick = () => doAction(act);
        $('d-actions').appendChild(b);
      }
    }
  }
  function doAction(act) {
    if (!selected) return;
    if (act === 'follow') { follow = selectedObj; }
    if (act === 'vet') sim.emit('info', '牲畜', `已通知驻场兽医前往 ${selected.id}，预计 12 分钟到达`);
    if (act === 'irrigate') {
      const s = sim.plots[selected.id];
      s.irrigating = true;
      sim.emit('ok', '灌溉', `${plotById[selected.id].name} 人工指令：远程启动灌溉`);
    }
    if (act === 'spray') sim.emit('info', '植保', `已向 UAV-02 下发 ${plotById[selected.id].name} 变量喷施处方图（${DISEASE[plotById[selected.id].crop].name}）`);
  }

  // ---------------- 时间控制 ----------------
  document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x === b));
    sim.speed = +b.dataset.speed;
  }));
  const playBtn = $('btn-play');
  const togglePlay = () => { sim.paused = !sim.paused; playBtn.textContent = sim.paused ? '▶' : '❚❚'; };
  playBtn.onclick = togglePlay;
  const slider = $('time-slider');
  let sliding = false;
  slider.addEventListener('input', () => {
    sliding = true;
    const d = sim.date; d.setHours(0, 0, 0, 0);
    sim.t = d.getTime() + (+slider.value) * 3600e3;
  });
  slider.addEventListener('change', () => (sliding = false));
  const toggleHud = () => {
    const h = $('hud').classList.toggle('hidden');
    $('btn-show').classList.toggle('hidden', !h);
  };
  $('btn-hide').onclick = toggleHud;
  $('btn-show').onclick = toggleHud;
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'h' || e.key === 'H') toggleHud();
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    const modes = ['overview', 'crop', 'livestock', 'iot', 'drone', 'tour'];
    if (/^[1-6]$/.test(e.key)) setMode(modes[+e.key - 1]);
    if (e.key === 'Escape') closeDetail();
  });

  // 产量 tab
  let yieldPlot = 'A2';
  const refreshYield = () => {
    const res = computeYield(yieldPlot);
    charts.updateYield(res, yieldPlot);
    hud.setYieldHead(res, yieldPlot);
  };
  document.querySelectorAll('#yield-tabs button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('#yield-tabs button').forEach((x) => x.classList.toggle('on', x === b));
    yieldPlot = b.dataset.plot;
    refreshYield();
  }));

  // 事件 -> 场景联动
  sim.on((e) => {
    if (e.cat === '牲畜' && e.level === 'alert') animals.animals.forEach((a) => { if (a.metrics.status !== 'normal' && visMode === 'overview') a.ring.visible = true; });
  });

  await boot('预编译 GPU 着色器程序', 97);
  try { await renderer.compileAsync(scene, camera); } catch (e) { console.warn(e); }
  await boot('数字孪生体同步完成，欢迎进入智慧农场', 100);
  await new Promise((r) => setTimeout(r, 450));
  $('loader').classList.add('done');
  setTimeout(() => $('loader').remove(), 1400);
  applyVisuals('overview');
  flyTo(SHOTS.overview.pos, SHOTS.overview.target, 5);
  setTimeout(() => (sim.ready = true), 2500);

  // ---------------- 主循环 ----------------
  const clock = new THREE.Clock();
  let t = 0;
  const timers = { hud: 0, env: 0, plots: 0, live: 0, labels: 0, detail: 0, yield: 0, ani: 0, aniHist: 0 };
  let lastAniHour = Math.floor(sim.t / 3600e3);
  let waterSaved = 1863;
  refreshYield();
  charts.updateEnv(sim.history);

  function updateLabels() {
    for (const l of plotLabels) {
      const p = l.p, s = sim.plots[p.id], info = CROP_INFO[p.crop];
      const frac = Math.min(1, s.gdd / CROP_MODEL[p.crop].gddMat);
      const nd = crops.ndviOf(p.id);
      const rc = s.risk > 60 ? 'hi' : s.risk > 35 ? 'mid' : 'lo';
      l.el.innerHTML = `<span class="t">${p.name}</span><span class="r">${info.name} · ${stageOf(p.crop, frac)}<b>NDVI ${nd.toFixed(2)}</b></span><span class="r">含水 <b class="${s.theta < 22 ? 'mid' : 'lo'}">${s.theta.toFixed(1)}%</b> 风险 <b class="${rc}">${s.risk.toFixed(0)}</b></span>`;
    }
    for (const n of sensors.nodes) {
      const r = sensorReading(n, sim);
      n.el.querySelector('.v').textContent = r.short;
      n.el.classList.toggle('lowbat', n.status === 'lowbat');
    }
    const st = harvester.state;
    harvester.el.querySelector('.v').textContent = st.pause > 0 ? '作业完成 · 复位' : `收割 ${(st.progress * 100).toFixed(1)}%`;
    for (const a of animals.animals) animals.setStatusVisual(a);
  }

  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    adaptQuality(dt);
    frame(dt);
  }
  // 自适应画质：持续低帧率时降低渲染分辨率
  const perf = { acc: 0, n: 0, level: 0 };
  function adaptQuality(dt) {
    if (document.visibilityState !== 'visible' || dt >= 0.049) return;
    perf.acc += dt; perf.n++;
    if (perf.acc < 3) return;
    const fps = perf.n / perf.acc;
    perf.acc = 0; perf.n = 0;
    if (fps < 34 && perf.level < 2) {
      perf.level++;
      const pr = perf.level === 1 ? 1 : 0.8;
      renderer.setPixelRatio(pr);
      composer.setPixelRatio(pr);
      renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
      console.info(`[quality] fps ${fps.toFixed(0)} → pixelRatio ${pr}`);
    }
  }
  function frame(dt) {
    t += dt;
    if (!sim.paused) sim.step(dt * sim.speed / 3600);
    const hour = sim.hour;
    world.setTimeOfDay(hour);
    const night = world.state.night;

    // 场景更新
    terrain.update(t, dt);
    cropUniforms.uWind.value = 0.55 + sim.w.wind * 0.22;
    cropUniforms.uNdvi.value = lerp(cropUniforms.uNdvi.value, ndviTarget, Math.min(1, dt * 2.5));
    crops.update(t);
    const pivotOn = sim.plots.P1.irrigating;
    const ghCtx = {};
    let grow = false;
    for (const p of PLOTS) if (p.greenhouse) { const g = sim.plots[p.id].gh; ghCtx[p.id] = g; grow ||= g.growLight; }
    structures.update(t, dt, { night, wind: sim.w.wind, growLight: grow, greenhouse: ghCtx, pivotOn });
    animals.update(dt, t, hour);
    sensors.update(t, dt);
    drones.update(dt, t);
    harvester.update(dt, t, night);
    fireflies.update(t, night);
    world.starMat.uniforms.uTime.value = t;
    hotspotFx.forEach((h, i) => {
      if (!h.g.visible) return;
      const ph = (t * 0.8 + i * 0.2) % 1;
      h.ring.scale.setScalar(0.6 + ph * 0.8);
      h.ringMat.opacity = 1 - ph;
      h.beamMat.uniforms.uTime.value = t;
    });
    // 喷灌水雾
    if (pivotOn) {
      const th = structures.pivot.arm.rotation.y, p = plotById.P1;
      const dx = Math.cos(th), dz = -Math.sin(th);
      for (let k = 0; k < 45; k++) {
        const r = Math.random() * p.r;
        pivotSpray.emit(p.x + dx * r + 0.9 * dx, 1.2, p.z + dz * r, (Math.random() - 0.5) * 2.2 - dz * 1.2, -0.5 - Math.random(), (Math.random() - 0.5) * 2.2 + dx * 1.2, 0.7);
      }
      for (let k = 0; k < 6; k++) pivotSpray.emit(p.x + dx * (p.r + 1), 4.2, p.z + dz * (p.r + 1), dx * (5 + Math.random() * 3), 3 + Math.random(), dz * (5 + Math.random() * 3), 1.6);
    }
    pivotSpray.update(dt);

    // 牲畜指标
    timers.ani += dt;
    if (timers.ani > 0.5) { sim.updateLivestock(animals.animals, timers.ani); timers.ani = 0; }
    const hourIdx = Math.floor(sim.t / 3600e3);
    if (hourIdx !== lastAniHour) {
      lastAniHour = hourIdx;
      for (const a of animals.animals) { a.history.temp.push(a.metrics.temp); if (a.history.temp.length > 24) a.history.temp.shift(); }
    }

    // 相机
    if (anim) {
      anim.k = Math.min(1, anim.k + dt / anim.dur);
      const e = easeInOutCubic(anim.k);
      camera.position.lerpVectors(anim.p0, anim.p1, e);
      camera.position.y += Math.sin(e * Math.PI) * anim.p0.distanceTo(anim.p1) * 0.12;
      controls.target.lerpVectors(anim.t0, anim.t1, e);
      if (anim.k >= 1) anim = null;
    } else if (chase) {
      const d = chase;
      tmpV.copy(d.pos).addScaledVector(d.fwd, -38); tmpV.y = d.pos.y + 16;
      camera.position.lerp(tmpV, Math.min(1, dt * 1.6));
      tmpV.copy(d.pos).addScaledVector(d.fwd, 30); tmpV.y = 2;
      controls.target.lerp(tmpV, Math.min(1, dt * 2));
    } else if (follow) {
      follow.getWorldPosition(tmpV);
      const delta = tmpV.sub(controls.target).multiplyScalar(Math.min(1, dt * 3));
      controls.target.add(delta);
      camera.position.add(delta);
    }
    if (tour) {
      tour.t += dt;
      if (tour.t > TOUR[tour.i].dur) nextShot();
    }
    controls.update();

    // 渲染
    composer.render();
    if (!$('hud').classList.contains('hidden')) {
      const v = drones.vision;
      v.g.visible = false; v.sc.cone.visible = false; v.sc.foot.visible = false;
      const rect = vision.render(world.state.daylight);
      v.g.visible = true; v.sc.cone.visible = true; v.sc.foot.visible = true;
      if (rect) vision.draw(rect, t);
    }
    world.labelRenderer.render(scene, camera);

    // UI
    timers.hud += dt; timers.env += dt; timers.plots += dt; timers.live += dt; timers.labels += dt; timers.detail += dt; timers.yield += dt;
    if (timers.hud > 0.2) {
      timers.hud = 0;
      hud.tick({ msgRate: 1120 + Math.round(Math.sin(t * 1.3) * 60 + Math.random() * 40) });
      if (!sliding) slider.value = hour.toFixed(2);
      const kw = sim.w.solar / 1000 * 1200 * 0.82;
      if (sim.plots.P1.irrigating) waterSaved += dt * sim.speed / 3600 * 3.2;
      hud.setPV(kw, waterSaved);
    }
    if (timers.env > 2) { timers.env = 0; charts.updateEnv(sim.history); }
    if (timers.plots > 3) {
      timers.plots = 0;
      charts.updatePlots(PLOTS.map((p) => ({ id: p.id, ndvi: crops.ndviOf(p.id), risk: sim.plots[p.id].risk })));
    }
    if (timers.live > 1.5) {
      timers.live = 0;
      charts.updateLivestock(animals.animals);
      const ab = animals.animals.filter((a) => a.metrics.status !== 'normal').sort((a, b) => (b.metrics.status === 'alert') - (a.metrics.status === 'alert') || b.metrics.score - a.metrics.score);
      hud.setAnimalList(ab, (a) => { if (mode !== 'livestock') setMode('livestock', { fly: false }); select({ type: 'animal', id: a.id }, a.g); });
    }
    if (timers.labels > 1) { timers.labels = 0; updateLabels(); }
    if (timers.detail > 1) { timers.detail = 0; renderDetail(false); }
    if (timers.yield > 20) { timers.yield = 0; refreshYield(); }
  }
  updateLabels();
  charts.updatePlots(PLOTS.map((p) => ({ id: p.id, ndvi: crops.ndviOf(p.id), risk: sim.plots[p.id].risk })));
  loop();
  window.__farm = { world, sim, animals, crops, drones, harvester, setMode, select, frame: (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) frame(dt); } };
}

main().catch((e) => {
  console.error(e);
  $('ld-log').innerHTML += `<div style="color:#ff6a6a">[FAIL] ${e.message}</div>`;
});
