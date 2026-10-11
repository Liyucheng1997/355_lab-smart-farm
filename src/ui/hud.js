// HUD：数据面板、事件中心、详情卡片
import { CROP_INFO, PLOTS, SENSOR_TYPES, plotById, SENSORS } from '../layout.js';
import { CROP_MODEL, DISEASE, stageOf } from '../data/models.js';
import { fmt } from '../util.js';

const $ = (id) => document.getElementById(id);
const WEEK = '日一二三四五六';
const pad = (n) => String(n).padStart(2, '0');
export const hhmm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function tween(el, to, d = 0) {
  const from = +el.dataset.v || 0;
  el.dataset.v = to;
  const t0 = performance.now();
  const run = (now) => {
    const k = Math.min(1, (now - t0) / 900);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(from + (to - from) * e, d);
    if (k < 1) requestAnimationFrame(run);
  };
  requestAnimationFrame(run);
}

export function createHud(sim) {
  const evList = $('events');
  const toasts = $('toasts');
  const renderEvent = (e, fresh) => {
    const li = document.createElement('li');
    li.className = e.level;
    li.innerHTML = `<time>${hhmm(e.t)}</time><em>${e.cat}</em><span>${e.text}</span>`;
    if (!fresh) li.style.animation = 'none';
    return li;
  };
  for (const e of sim.events) evList.appendChild(renderEvent(e, false));
  sim.on((e) => {
    evList.prepend(renderEvent(e, true));
    while (evList.children.length > 24) evList.lastChild.remove();
    if (e.level === 'alert' || (e.level === 'warn' && e.cat !== '灌溉')) {
      const t = document.createElement('div');
      t.className = 'toast ' + (e.level === 'warn' ? 'warn' : '');
      t.textContent = `⚠ ${e.text}`;
      toasts.appendChild(t);
      setTimeout(() => t.remove(), 5000);
      while (toasts.children.length > 3) toasts.firstChild.remove();
    }
  });

  document.querySelectorAll('[data-count]').forEach((el) => tween(el, +el.dataset.count));

  return {
    tick(state) {
      const d = sim.date, w = sim.w;
      $('sim-date').textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${WEEK[d.getDay()]}`;
      $('sim-time').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      $('wx-temp').textContent = w.temp.toFixed(1);
      $('wx-rh').textContent = w.rh.toFixed(0);
      $('wx-wind').textContent = w.wind.toFixed(1);
      $('wx-solar').textContent = w.solar.toFixed(0);
      $('wx-et0').textContent = w.et0.toFixed(2);
      $('wx-icon').textContent = w.solar > 20 ? (w.cloud > 0.6 ? '⛅' : '☀') : '☾';
      $('kpi-data').textContent = fmt(sim.dataPoints);
      $('sys-rate').textContent = fmt(state.msgRate);
      $('env-lux').textContent = (w.lux / 1000).toFixed(1);
      $('env-co2').textContent = w.co2.toFixed(0);
      $('env-dew').textContent = w.dew.toFixed(1);
      $('env-soil').textContent = sim.history.soil.at(-1)?.toFixed(1) ?? '--';
      $('tod-label').textContent = hhmm(sim.t);
    },
    setStatic({ animals, nodes, online }) {
      tween($('kpi-animals'), animals);
      tween($('kpi-nodes'), nodes);
      $('sys-online').textContent = online;
    },
    setPV(kw, water) {
      $('kpi-pv').textContent = fmt(kw);
      $('kpi-water').textContent = fmt(water);
    },
    setAnimalList(list, onClick) {
      const ul = $('ani-list');
      ul.innerHTML = '';
      for (const a of list.slice(0, 5)) {
        const li = document.createElement('li');
        li.className = 'st-' + a.metrics.status;
        li.innerHTML = `<b>${a.id}</b>${a.metrics.diag}<span>${a.metrics.temp.toFixed(1)}℃ · ${a.metrics.activity.toFixed(0)} 步/h</span>`;
        li.onclick = () => onClick(a);
        ul.appendChild(li);
      }
      if (!list.length) ul.innerHTML = '<li class="st-normal" style="border-color:#3dffa0">全群体征正常<span>持续监测中</span></li>';
    },
    setYieldHead(res, plotId) {
      const crop = plotById[plotId].crop;
      $('y-mean').textContent = fmt(res.p50);
      $('y-unit').textContent = CROP_MODEL[crop].unit;
      $('y-ci').textContent = `${fmt(res.p10)} – ${fmt(res.p90)}`;
      $('y-days').textContent = res.daysToHarvest;
    },
  };
}

// ---------------- 详情卡片 ----------------
const thi = (T, RH) => 0.8 * T + RH / 100 * (T - 14.4) + 46.4;

export function detailContent(sel, ctx) {
  const { sim, crops, animals, sensors, drones, harvester } = ctx;
  const w = sim.w;
  const row = (k, v, cls = '') => `<div><label>${k}</label><b class="${cls}">${v}</b></div>`;
  const histX = sim.history.t.map(hhmm);
  if (sel.type === 'animal') {
    const a = animals.byId[sel.id];
    const m = a.metrics;
    const cls = m.status === 'alert' ? 'alert' : m.status === 'watch' ? 'warn' : 'ok';
    const conf = Math.min(99, 70 + (m.score || 0) * 8);
    return {
      type: `${a.zh} · RFID 耳标`, title: `${a.id} ${a.breed}`,
      grid: [row('体温', m.temp.toFixed(2) + '℃', m.zT > 2 ? 'alert' : ''), row('活动量', m.activity.toFixed(0) + ' 步/h'), row('反刍时间', a.kind === 'chicken' ? '—' : m.rumination.toFixed(1) + ' min/h'), row('健康状态', m.diag, cls),
        row('体重', a.weight.toFixed(a.kind === 'chicken' ? 2 : 0) + ' kg'), row('月龄', a.age + ' 月'), row(a.kind === 'cow' ? '日产奶' : '行为', a.kind === 'cow' ? a.milk.toFixed(1) + ' kg' : a.state === 'rest' ? '卧息' : a.state === 'walk' ? '行走' : '采食'), row('定位', `${a.g.position.x.toFixed(1)}, ${a.g.position.z.toFixed(1)}`)].join(''),
      chart: { x: a.history.temp.map((_, i) => i - a.history.temp.length + 1 + 'h'), lines: [{ name: '体温', data: a.history.temp.map((v) => v.toFixed(2)), color: m.status === 'alert' ? '#ff4a5a' : '#3dffa0', area: m.status === 'alert' ? 'rgba(255,74,90,A)' : 'rgba(61,255,160,A)' }] }, unit: '℃',
      ai: `多指标稳健 Z 分数（群体中位数 / MAD 基线）：体温 <b>z=${(m.zT ?? 0).toFixed(1)}</b>，活动量 <b>z=${(m.zA ?? 0).toFixed(1)}</b>，反刍 <b>z=${(m.zR ?? 0).toFixed(1)}</b>。<br/>判定：<b>${m.diag}</b>（置信度 ${conf.toFixed(0)}%）。${m.status === 'alert' ? '建议立即隔离复测直肠温度并通知兽医。' : m.status === 'watch' ? (m.diag.includes('发情') ? '建议 8–16h 内适时输精。' : '建议人工巡查并持续观察 24h。') : '各项体征处于群体正常区间。'}`,
      actions: [['定位跟踪', 'follow'], ['通知兽医', 'vet']],
    };
  }
  if (sel.type === 'plot') {
    const p = plotById[sel.id];
    const s = sim.plots[p.id];
    const info = CROP_INFO[p.crop];
    const P = CROP_MODEL[p.crop];
    const cd = crops.plotData[p.id];
    const ndvi = crops.ndviOf(p.id);
    const frac = Math.min(1, s.gdd / P.gddMat);
    const riskCls = s.risk > 60 ? 'alert' : s.risk > 35 ? 'warn' : 'ok';
    const g = s.gh;
    const grid = [row('作物 / 品种', `${info.name} · ${info.variety}`), row('生育期', stageOf(p.crop, frac)), row('有效积温', s.gdd.toFixed(0) + ' ℃·d'), row('NDVI', ndvi.toFixed(2), ndvi < 0.65 ? 'warn' : 'ok'),
      row('土壤含水率', s.theta.toFixed(1) + ' %', s.theta < 22 ? 'warn' : ''), row('灌溉状态', s.irrigating ? '灌溉中' : '待机', s.irrigating ? 'ok' : ''), row('EC / pH', `${s.ec.toFixed(2)} / ${s.ph.toFixed(1)}`), row('N-P-K mg/kg', `${s.n.toFixed(0)}-${s.p.toFixed(0)}-${s.k.toFixed(0)}`),
      row(DISEASE[p.crop].name + '风险', s.risk.toFixed(0), riskCls), row('叶面湿润', s.lwd.toFixed(1) + ' h'), row('植株数', fmt(cd.count)), row('产量预测', ctx.yieldCache[p.id] ? fmt(ctx.yieldCache[p.id].p50) + ' ' + P.unit.split('(')[0] : '计算中')];
    if (g) grid.push(row('室温 / 湿度', `${g.temp.toFixed(1)}℃ / ${g.rh.toFixed(0)}%`), row('CO₂', g.co2.toFixed(0) + ' ppm'), row('天窗开度', (g.vent * 100).toFixed(0) + '%'), row('补光灯', g.growLight ? '开启' : '关闭', g.growLight ? 'ok' : ''));
    const ph = sim.plotHist[p.id];
    const sick = cd.health.filter((h) => h < 0.6).length;
    let advice = [];
    if (s.risk > 50) advice.push(`${DISEASE[p.crop].name}侵染风险偏高，建议 24h 内对病斑区域执行变量喷施（处方图已生成，预计节药 38%）`);
    if (s.theta < 23) advice.push('根区含水率接近亏缺阈值，建议启动灌溉 15–20 m³/亩');
    if (frac > 0.95 && ['rice', 'corn', 'apple'].includes(p.crop)) advice.push(`已达生理成熟，籽粒含水率适宜，建议安排收获`);
    if (!advice.length) advice.push('长势良好，维持当前水肥管理策略');
    return {
      type: p.greenhouse ? '智能温室' : '大田地块', title: p.name,
      grid: grid.join(''),
      chart: { x: histX, lines: [{ name: '土壤含水率', data: ph.theta.map((v) => v.toFixed(1)), color: '#36e6ff', area: 'rgba(54,230,255,A)' }, { name: '病害风险/4', data: ph.risk.map((v) => (v / 4).toFixed(1)), color: '#ff5a6a' }] }, unit: '%',
      ai: `多光谱识别：${fmt(cd.count)} 株中 <b>${fmt(sick)}</b> 株 NDVI 异常（${(sick / cd.count * 100).toFixed(1)}%）。<br/>${advice.map((a) => '▸ ' + a).join('<br/>')}`,
      actions: [['立即灌溉', 'irrigate'], ['派遣植保无人机', 'spray']],
    };
  }
  if (sel.type === 'sensor') {
    const n = sensors.byId[sel.id];
    const T = SENSOR_TYPES[n.type];
    const s = n.plot ? sim.plots[n.plot] : null;
    const grid = [row('节点类型', T.name), row('所属区域', n.plot ? plotById[n.plot].name : '公共区域'), row('上联网关', n.gateway), row('电池电量', n.battery + '%', n.battery < 20 ? 'warn' : 'ok'), row('信号 RSSI', n.rssi + ' dBm'), row('采样周期', n.type === 'cam' ? '25 fps' : '60 s')];
    const reading = sensorReading(n, sim);
    for (const [k, v] of reading.rows) grid.push(row(k, v));
    return {
      type: '物联网节点 · ' + T.name, title: n.id,
      grid: grid.join(''),
      chart: s ? { x: histX, lines: [{ name: '含水率', data: sim.plotHist[n.plot].theta.map((v) => v.toFixed(1)), color: T.color, area: 'rgba(54,230,255,A)' }] } : { x: histX, lines: [{ name: '气温', data: sim.history.temp.map((v) => v.toFixed(1)), color: '#ffb547', area: 'rgba(255,181,71,A)' }] }, unit: s ? '%' : '℃',
      ai: n.status === 'lowbat' ? '<b>电量低于 15%</b>，预测剩余续航 2.6 天，已生成运维工单。' : `数据完整率 <b>99.${Math.floor(n.rssi * -1 % 10)}%</b>，卡尔曼滤波 + 3σ 异常剔除后入湖；最近 24h 无漂移告警。`,
      actions: [['历史数据', 'noop'], ['远程校准', 'noop']],
    };
  }
  if (sel.type === 'drone') {
    const d = drones.drones.find((x) => x.id === sel.id);
    return {
      type: '无人机', title: d.name,
      grid: [row('任务', d.role), row('高度', d.pos.y.toFixed(1) + ' m'), row('速度', d.speed.toFixed(1) + ' m/s'), row('电量', d.battery.toFixed(0) + '%', 'ok'), row('航线进度', (d.u * 100).toFixed(0) + '%'), row('定位', 'RTK FIX ±2cm')].join(''),
      chart: null,
      ai: d.vision ? '机载边缘计算单元实时运行目标检测（牲畜计数 / 个体识别 / 病斑分割），结果回传数据中心与作物模型同化。' : d.sprayer ? '依据病斑识别生成的处方图执行<b>变量喷施</b>，病斑区域加量、健康区域减量，预计节药 35% 以上。' : '高空正射影像拼接，用于厘米级三维实景建模与苗情普查。',
      actions: [['跟随视角', 'follow'], ['返航', 'noop']],
    };
  }
  if (sel.type === 'vehicle') {
    const st = harvester.state;
    return {
      type: '无人驾驶农机', title: 'HV-01 联合收割机',
      grid: [row('作业地块', 'A2 水稻田'), row('作业进度', (st.progress * 100).toFixed(1) + '%', 'ok'), row('作业速度', (st.speed * 3.6).toFixed(1) + ' km/h'), row('割幅', '4.4 m'), row('已收获', fmt(st.yieldKg * 6) + ' kg'), row('籽粒含水率', '21.3%'), row('损失率', '0.82%', 'ok'), row('导航', '北斗 RTK ±2.1cm')].join(''),
      chart: null,
      ai: '基于北斗 RTK 的<b>弓字形全覆盖路径规划</b>，地头掉头半径 2.2m，重叠率 < 3%；实时产量监测数据将生成 A2 田产量分布图。',
      actions: [['跟随视角', 'follow'], ['暂停作业', 'noop']],
    };
  }
  if (sel.type === 'gateway') {
    const cnt = sensors.nodes.filter((n) => n.gateway === sel.id).length;
    return { type: 'LoRaWAN 网关', title: sel.id, grid: [row('接入节点', cnt + ' 个'), row('频段', 'CN470'), row('丢包率', '0.3%', 'ok'), row('回传', '5G / 光纤'), row('上行速率', (cnt * 0.8).toFixed(1) + ' kbps'), row('运行时长', '98 天')].join(''), chart: null, ai: '星型拓扑汇聚田间节点，经 5G 回传至农业大数据中心。', actions: [] };
  }
  if (sel.type === 'facility') {
    if (sel.id === 'hub') {
      return {
        type: '数据中心', title: '农业大数据中心',
        grid: [row('数据湖', '186.4 TB'), row('今日入湖', fmt(sim.dataPoints) + ' 条'), row('在线模型', '9 个'), row('GPU 利用率', (55 + Math.sin(sim.t / 4e6) * 12).toFixed(0) + '%'), row('边缘节点', '7'), row('时延 P99', '38 ms')].join(''),
        chart: { x: histX, lines: [{ name: 'ET₀', data: sim.history.et0.map((v) => v.toFixed(3)), color: '#36e6ff', area: 'rgba(54,230,255,A)' }] }, unit: 'ET₀ mm/h',
        ai: '模型服务：<b>FAO-56 蒸散</b> · <b>土壤水量平衡</b> · <b>积温-Logistic 产量形成</b> · <b>蒙特卡洛集合预测 (n=400)</b> · <b>病害侵染风险</b> · <b>牲畜稳健异常检测</b> · <b>目标检测/个体识别</b>。',
        actions: [],
      };
    }
    if (sel.id === 'barn') {
      const T = w.temp + 2.5, RH = Math.min(95, w.rh + 6);
      const v = thi(T, RH);
      return {
        type: '养殖设施', title: '智能牛舍 · 22 头',
        grid: [row('舍内温度', T.toFixed(1) + '℃'), row('相对湿度', RH.toFixed(0) + '%'), row('温湿指数 THI', v.toFixed(1), v > 72 ? 'warn' : 'ok'), row('NH₃', (6 + Math.sin(sim.t / 3e6) * 2).toFixed(1) + ' ppm'), row('今日产奶', fmt(22 * 29.4) + ' kg'), row('饲喂机器人', '运行中', 'ok')].join(''),
        chart: { x: histX, lines: [{ name: 'THI', data: sim.history.temp.map((t, i) => thi(t + 2.5, Math.min(95, sim.history.rh[i] + 6)).toFixed(1)), color: '#ffb547', area: 'rgba(255,181,71,A)' }] }, unit: 'THI',
        ai: `THI = 0.8T + RH(T−14.4) + 46.4，当前 <b>${v.toFixed(1)}</b>（< 72 无热应激）。超过 72 将自动开启喷淋 + 风机联动降温。`,
        actions: [],
      };
    }
    if (sel.id === 'solar') {
      const kw = w.solar / 1000 * 1200 * 0.82;
      return { type: '能源', title: '光伏电站 1.2MW', grid: [row('实时功率', fmt(kw) + ' kW'), row('辐照度', w.solar.toFixed(0) + ' W/m²'), row('组件数', '2,496 块'), row('自给率', '73%', 'ok')].join(''), chart: null, ai: '光伏 + 储能为灌溉泵站、温室补光、数据中心供电，余电上网。', actions: [] };
    }
    if (sel.id === 'coop') {
      return { type: '养殖设施', title: '智能鸡舍 · 28 只', grid: [row('今日产蛋', '24 枚'), row('产蛋率', '85.7%', 'ok'), row('舍温', (w.temp + 4).toFixed(1) + '℃'), row('光照程序', '16L:8D')].join(''), chart: null, ai: '视觉计数 + 声纹识别监测鸡群健康，异常咳嗽/喘鸣自动预警。', actions: [] };
    }
    return { type: '设施', title: '农场管理中心', grid: [row('值班人员', '3 人'), row('今日工单', '7 / 9'), row('机器人', '4 台在线')].join(''), chart: null, ai: '农事任务自动派单，移动端实时推送。', actions: [] };
  }
  return null;
}

export function sensorReading(n, sim) {
  const w = sim.w;
  const s = n.plot ? sim.plots[n.plot] : null;
  const off = (n.phase - 0.5) * 1.6;
  switch (n.type) {
    case 'soil': return { short: `${(s.theta + off).toFixed(1)}%`, rows: [['土壤含水率', (s.theta + off).toFixed(1) + '%'], ['土壤温度', (w.temp - 2.5 + off).toFixed(1) + '℃'], ['EC', s.ec.toFixed(2) + ' mS/cm'], ['pH', s.ph.toFixed(1)]] };
    case 'air': { const g = s.gh; return { short: `${g.temp.toFixed(1)}℃ ${g.rh.toFixed(0)}%`, rows: [['室温', g.temp.toFixed(1) + '℃'], ['湿度', g.rh.toFixed(0) + '%'], ['CO₂', g.co2.toFixed(0) + ' ppm'], ['光照', (g.lux / 1000).toFixed(1) + ' klx']] }; }
    case 'weather': return { short: `${w.temp.toFixed(1)}℃ ${w.wind.toFixed(1)}m/s`, rows: [['气温', w.temp.toFixed(1) + '℃'], ['湿度', w.rh.toFixed(0) + '%'], ['风速', w.wind.toFixed(1) + ' m/s'], ['辐射', w.solar.toFixed(0) + ' W/m²']] };
    case 'water': return { short: 'pH 7.4 DO 8.1', rows: [['pH', '7.4'], ['溶解氧', '8.1 mg/L'], ['浊度', '4.2 NTU'], ['水位', '3.62 m']] };
    case 'cam': return { short: 'AI 识别中', rows: [['分辨率', '4K'], ['模型', '目标检测 v8'], ['推理', '边缘 NPU'], ['帧率', '25 fps']] };
    case 'tag': return { short: '耳标在线 66', rows: [['在线耳标', '66 / 66'], ['协议', 'UHF RFID + LoRa'], ['上报周期', '10 min'], ['定位精度', '±0.5 m']] };
    case 'power': { const kw = w.solar / 1000 * 1200 * 0.82; return { short: `${kw.toFixed(0)} kW`, rows: [['光伏功率', kw.toFixed(0) + ' kW'], ['储能 SOC', '78%'], ['负载', '312 kW'], ['电网', '并网']] }; }
  }
  return { short: '--', rows: [] };
}
