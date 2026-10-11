// 农场数字孪生数据引擎：气象过程 + 土壤/作物/温室/牲畜状态演化 + 智能决策事件
import { PLOTS, SENSORS, HOTSPOTS, CROP_INFO } from '../layout.js';
import { clamp, gauss, mulberry32, lerp } from '../util.js';
import { et0Hourly, dewPoint, CROP_MODEL, DISEASE, infectionRisk, stageOf, robustZ, diagnoseAnimal } from './models.js';

const r = mulberry32(4242);
const FC = 32, WP = 12;

export class FarmSim {
  constructor(start = new Date(2026, 9, 11, 6, 40)) {
    this.t = start.getTime();
    this.speed = 240; // 1 秒 = 4 分钟
    this.paused = false;
    this.ou = { temp: 0, cloud: 0.25, wind: 0, rh: 0 };
    this.w = {};
    this.history = { t: [], temp: [], rh: [], soil: [], lux: [], et0: [], co2: [] };
    this.events = [];
    this.listeners = [];
    this.cool = {};
    this.dataPoints = 1_284_532;
    this.msgRate = 0;
    this.lastSample = 0;
    this.plots = {};
    this.plotHist = {};
    for (const p of PLOTS) {
      this.plotHist[p.id] = { theta: [], risk: [] };
      const P = CROP_MODEL[p.crop];
      this.plots[p.id] = {
        id: p.id, crop: p.crop, name: p.name,
        theta: p.id === 'P1' ? 22.6 : p.greenhouse ? 27 + r() * 3 : 24 + r() * 5,
        irrigating: false, gdd: P.gdd0 + (r() - 0.5) * 30, lwd: p.greenhouse ? 3 : 7 + r() * 3,
        risk: 0, health: 0.85, ndvi: 0.75, ec: 0.6 + r() * 0.8, ph: 6.2 + r() * 1.1, n: 80 + r() * 60, p: 18 + r() * 20, k: 110 + r() * 60,
        stressHours: 0, waterUsed: 0,
        inoculum: HOTSPOTS.filter((h) => h.plot === p.id).reduce((a, h) => a + h.severity * 0.35, 0),
      };
      if (p.greenhouse) Object.assign(this.plots[p.id], { gh: { temp: 22, rh: 70, co2: 520, vent: 0.2, fan: false, growLight: false, heater: false, co2Dosing: false, lux: 0 } });
    }
    this.livestock = { herd: {}, alerts: [] };
    this.weather(0);
    // 预跑 24 小时生成历史曲线
    const t0 = this.t;
    this.t -= 24 * 3600e3;
    for (let i = 0; i < 24 * 12; i++) this.step(5 / 60, true);
    this.t = t0;
    this.events = [];
    this.seedEvents();
  }

  get date() { return new Date(this.t); }
  get hour() { const d = this.date; return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; }

  on(fn) { this.listeners.push(fn); }
  emit(level, cat, text, key, cooldownH = 6) {
    if (key) {
      if (this.cool[key] && this.t - this.cool[key] < cooldownH * 3600e3) return;
      this.cool[key] = this.t;
    }
    const e = { t: this.t, level, cat, text };
    this.events.unshift(e);
    if (this.events.length > 60) this.events.pop();
    for (const f of this.listeners) f(e);
  }

  seedEvents() {
    const back = (h) => this.t - h * 3600e3;
    const add = (h, level, cat, text) => this.events.push({ t: back(h), level, cat, text });
    add(0.4, 'info', '收割', 'HV-01 无人收割机 A2 田作业中，北斗 RTK 定位精度 ±2.1cm');
    add(1.2, 'warn', '病害', 'UAV-01 多光谱巡检：A2 田西北角 NDVI 异常斑块 2 处，疑似稻瘟病');
    add(2.5, 'info', '植保', 'UAV-02 接收处方图，B1 田变量喷施作业 36%');
    add(3.8, 'ok', '灌溉', 'B2 玉米田灌溉完成，土壤含水率回升至 29.6%');
    add(5.0, 'info', '系统', '作物生长模型完成同化更新（Sentinel-2 + 无人机多光谱）');
  }

  weather(dtH) {
    const h = this.hour;
    const doy = 284;
    const o = this.ou;
    const ouStep = (x, mu, theta, sigma) => x + theta * (mu - x) * dtH + sigma * Math.sqrt(Math.max(dtH, 0)) * gauss(r);
    o.temp = ouStep(o.temp, 0, 0.15, 0.9);
    o.cloud = clamp(ouStep(o.cloud, 0.3, 0.08, 0.18), 0, 1);
    o.wind = ouStep(o.wind, 0, 0.3, 0.9);
    o.rh = ouStep(o.rh, 0, 0.2, 3);
    const Tmean = 17.5, amp = 6.2 * (1 - o.cloud * 0.4);
    const temp = Tmean + amp * Math.sin((h - 9) / 24 * Math.PI * 2) + o.temp;
    const sinE = Math.max(0, Math.sin((h - 6.05) / 11.9 * Math.PI)) * Math.sin(48 * Math.PI / 180);
    const solar = sinE > 0 ? 1361 * 0.72 * sinE * (1 - 0.68 * Math.pow(o.cloud, 1.5)) : 0;
    const Tmin = Tmean - amp, Tmax = Tmean + amp;
    const rh = clamp(92 - 42 * (temp - Tmin) / (Tmax - Tmin) + o.rh + o.cloud * 8, 28, 99);
    const wind = Math.max(0.3, 2.4 + 1.3 * Math.sin((h - 11) / 24 * Math.PI * 2) + o.wind);
    const co2 = 418 + (solar < 20 ? 28 : -6) + gauss(r) * 2;
    this.w = {
      temp, rh, wind, solar, cloud: o.cloud, lux: solar * 118, co2, dew: dewPoint(temp, rh),
      et0: et0Hourly(temp, rh, wind, solar), pressure: 1013 + Math.sin(h / 24 * 6.28) * 1.4, doy,
    };
  }

  step(dtH, silent = false) {
    if (dtH <= 0) return;
    this.t += dtH * 3600e3;
    this.weather(dtH);
    const w = this.w;
    const h = this.hour;
    const wet = w.rh >= 90 || w.temp - w.dew < 1.5;

    for (const p of PLOTS) {
      const s = this.plots[p.id];
      const P = CROP_MODEL[p.crop];
      let T = w.temp, RH = w.rh, wetNow = wet;
      if (s.gh) { this.greenhouseStep(p, s, dtH, silent); T = s.gh.temp; RH = s.gh.rh; wetNow = RH > 88; }
      // 积温
      s.gdd += Math.max(0, T - P.tbase) * dtH / 24;
      if (p.crop === 'alfalfa' && s.gdd > P.gddMat) s.gdd = 60; // 刈割后再生
      // 叶面湿润时长（24h 滑动）
      s.lwd = s.lwd * Math.exp(-dtH / 24) + (wetNow ? dtH : 0);
      s.tMean24 = s.tMean24 == null ? T : lerp(s.tMean24, T, Math.min(1, dtH / 12));
      s.risk = infectionRisk(s.lwd, s.tMean24, s.inoculum * (1.15 - s.health * 0.5), DISEASE[p.crop]);
      // 土壤水量平衡（0-20cm 传感层，200mm）
      const etc = w.et0 * P.kc * (s.gh ? 0.75 : 1);
      s.theta -= etc * dtH / 200 * 100 * (s.gh ? 1 : 1);
      const thr = WP + (FC - WP) * 0.52;
      if (!s.irrigating && s.theta < thr) {
        s.irrigating = true;
        if (!silent) this.emit('warn', '灌溉', `${p.name} 土壤含水率 ${s.theta.toFixed(1)}% 低于阈值 ${thr.toFixed(1)}%，${p.id === 'P1' ? '中心支轴喷灌机' : s.gh ? '水肥一体化滴灌' : '智能喷灌阀组'}已自动启动`, 'irr-' + p.id, 2);
      }
      if (s.irrigating) {
        const rate = p.id === 'P1' ? 1.6 : 2.4;
        s.theta += rate * dtH;
        s.waterUsed += rate * dtH * 2;
        if (s.theta >= FC - 2.5) {
          s.irrigating = false;
          if (!silent) this.emit('ok', '灌溉', `${p.name} 灌溉完成，含水率 ${s.theta.toFixed(1)}%，本次用水 ${(s.waterUsed).toFixed(1)} m³/亩`, 'irrdone-' + p.id, 2);
          s.waterUsed = 0;
        }
      }
      if (s.theta < thr) s.stressHours += dtH;
      s.theta = clamp(s.theta, WP, FC + 2);
      // 风险预警
      if (!silent && s.risk > 62) this.emit('alert', '病害', `${p.name} ${DISEASE[p.crop].name}侵染风险 ${s.risk.toFixed(0)}（叶面湿润 ${s.lwd.toFixed(1)}h），已生成植保处方图`, 'risk-' + p.id, 10);
    }

    // 数据量
    const nodes = SENSORS.length + 66 + 3;
    this.dataPoints += Math.round(nodes * 12 * dtH * 60);
    // 历史采样（15 分钟）
    if (this.t - this.lastSample >= 15 * 60e3) {
      this.lastSample = this.t;
      const H = this.history;
      H.t.push(this.t); H.temp.push(w.temp); H.rh.push(w.rh); H.lux.push(w.lux / 1000); H.et0.push(w.et0);
      const soil = ['A1', 'A2', 'A3', 'B1', 'B2', 'P1'].reduce((a, id) => a + this.plots[id].theta, 0) / 6;
      H.soil.push(soil); H.co2.push(w.co2);
      for (const k of Object.keys(H)) if (H[k].length > 97) H[k].shift();
      for (const id of Object.keys(this.plotHist)) {
        const ph = this.plotHist[id];
        ph.theta.push(this.plots[id].theta); ph.risk.push(this.plots[id].risk);
        if (ph.theta.length > 97) { ph.theta.shift(); ph.risk.shift(); }
      }
    }
  }

  greenhouseStep(p, s, dtH, silent) {
    const g = s.gh, w = this.w, h = this.hour;
    const day = w.solar > 30;
    // 控制策略
    const ventT = clamp((g.temp - 25) / 5, 0, 1);
    const ventH = g.rh > 85 ? 0.35 : 0;
    const newVent = Math.max(ventT, ventH) * (w.wind > 9 ? 0.4 : 1);
    if (!silent && newVent > 0.3 && g.vent <= 0.3) this.emit('info', '温室', `${p.name} 室温 ${g.temp.toFixed(1)}℃，天窗自动开启 ${(newVent * 100).toFixed(0)}%`, 'vent-' + p.id, 8);
    g.vent = newVent;
    g.fan = g.temp > 28 || g.rh > 88;
    const heater = g.temp < 13;
    if (!silent && heater && !g.heater) this.emit('info', '温室', `${p.name} 夜温 ${g.temp.toFixed(1)}℃ 低于 13℃，热泵加温启动`, 'heat-' + p.id, 10);
    g.heater = heater;
    const grow = (w.solar < 120 && ((h > 5 && h < 8.5) || (h > 16.5 && h < 22)));
    if (!silent && grow && !g.growLight && p.id === 'G1') this.emit('info', '温室', '光照不足，G1-G5 LED 补光系统开启（光周期延长至 16h）', 'grow', 10);
    g.growLight = grow;
    // 热平衡（一阶）
    const Teq = w.temp + w.solar * 0.024 * (1 - 0.7 * g.vent) + (heater ? 7 : 0) + 2;
    g.temp += (Teq - g.temp) * Math.min(1, dtH * 1.8);
    const RHeq = clamp(w.rh + 16 - g.vent * 22 - (g.temp - w.temp) * 1.1 - (g.fan ? 8 : 0), 40, 98);
    g.rh += (RHeq - g.rh) * Math.min(1, dtH * 2);
    const dosing = day && g.co2 < 420 && g.vent < 0.3;
    if (!silent && dosing && !g.co2Dosing && p.id === 'G1') this.emit('info', '温室', 'G1 番茄温室 CO₂ 降至 420ppm 以下，气肥增施至 800ppm', 'co2', 12);
    g.co2Dosing = dosing;
    const co2eq = day ? (dosing ? 780 : 390 - 120 * (1 - g.vent)) : 520 + 260 * (1 - g.vent);
    g.co2 += (co2eq - g.co2) * Math.min(1, dtH * 1.5);
    g.lux = w.lux * 0.72 + (grow ? 12000 : 0);
  }

  // 由 3D 场景中的真实运动计算牲畜体征，并做群体异常检测
  updateLivestock(animals, dtReal) {
    const h = this.hour;
    for (const a of animals) {
      const m = a.metrics;
      const inst = a.moving ? a.speed * 1.25 : 0;
      a.speedEMA = a.speedEMA == null ? 0.2 : lerp(a.speedEMA, inst, Math.min(1, dtReal * 0.015));
      let act = 60 + a.speedEMA * 1500;
      let temp = a.baseTemp + 0.25 * Math.sin((h - 15) / 24 * Math.PI * 2) + a.speedEMA * 0.2 + gauss(r) * 0.03;
      let rum = a.kind === 'cow' ? 32 : a.kind === 'sheep' ? 28 : 0;
      if (a.condition === 'fever') { temp += 1.55; rum *= 0.45; act *= 0.7; }
      if (a.condition === 'estrus') { act *= 2.2; rum *= 0.7; temp += 0.25; }
      if (a.condition === 'lame') { act *= 0.35; }
      rum += gauss(r) * 1.2;
      m.temp = lerp(m.temp, temp, 0.2);
      m.activity = lerp(m.activity || act, act, 0.2);
      m.rumination = lerp(m.rumination, rum, 0.2);
    }
    for (const kind of ['cow', 'sheep', 'chicken']) {
      const herd = animals.filter((a) => a.kind === kind);
      const T = robustZ(herd.map((a) => a.metrics.temp), 0.15);
      const A = robustZ(herd.map((a) => a.metrics.activity), 80, 0.3);
      const R = robustZ(herd.map((a) => a.metrics.rumination), 2.5);
      this.livestock.herd[kind] = { tMed: T.med, aMed: A.med, rMed: R.med, n: herd.length };
      for (const a of herd) {
        const k = a.zT == null ? 1 : 0.06;
        a.zT = lerp(a.zT ?? 0, clamp(T.z(a.metrics.temp) * 0.55, -6, 8), k);
        a.zA = lerp(a.zA ?? 0, clamp(A.z(a.metrics.activity), -6, 8), k);
        a.zR = kind === 'chicken' ? 0 : lerp(a.zR ?? 0, clamp(R.z(a.metrics.rumination) * 0.5, -6, 8), k);
        const zT = a.zT, zA = a.zA, zR = a.zR;
        const d = diagnoseAnimal(zT, zA, zR);
        Object.assign(a.metrics, d, { zT, zA, zR });
        if (d.status !== 'normal' && this.ready) {
          const lvl = d.status === 'alert' ? 'alert' : 'warn';
          const advice = { '疑似发热': '建议隔离并兽医检查', '疑似发情': '建议 12h 内安排配种', '活动减少/跛行': '建议检查蹄部', '反刍减少': '建议调整日粮' }[d.diag];
          this.emit(lvl, '牲畜', `${a.zh} ${a.id} ${d.diag}（体温 ${a.metrics.temp.toFixed(1)}℃，活动量 ${a.metrics.activity.toFixed(0)} 步/h），${advice}`, 'ani-' + a.id + d.diag, 24);
        }
      }
    }
  }
}
