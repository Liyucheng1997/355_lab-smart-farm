// 农业机理模型集合
// - FAO-56 Penman-Monteith 小时参考蒸散 ET0
// - 根区土壤水量平衡 + 亏缺灌溉决策
// - 积温(GDD) 驱动的 Logistic 产量形成模型 + 蒙特卡洛集合预测
// - 叶面湿润时长(LWD) × 温度响应 的病害侵染风险模型
// - 牲畜多指标稳健 Z 分数异常检测
import { clamp, gauss, mulberry32 } from '../util.js';

export function satVP(T) { return 0.6108 * Math.exp(17.27 * T / (T + 237.3)); }
export function dewPoint(T, RH) {
  const a = 17.27, b = 237.3;
  const g = Math.log(Math.max(RH, 1) / 100) + a * T / (b + T);
  return b * g / (a - g);
}

/** FAO-56 小时 ET0 (mm/h)。T: ℃, RH: %, u2: m/s, Rs: W/m² */
export function et0Hourly(T, RH, u2, Rs) {
  const es = satVP(T), ea = es * RH / 100;
  const delta = 4098 * es / Math.pow(T + 237.3, 2);
  const gamma = 0.0674;
  const RsMJ = Rs * 0.0036;
  const Rns = 0.77 * RsMJ;
  const Rnl = RsMJ > 0.05 ? 0.045 : 0.03;
  const Rn = Rns - Rnl;
  const G = Rn > 0 ? 0.1 * Rn : 0.5 * Rn;
  const cd = Rn > 0 ? 0.24 : 0.96;
  const et = (0.408 * delta * (Rn - G) + gamma * (37 / (T + 273)) * u2 * (es - ea)) / (delta + gamma * (1 + cd * u2));
  return Math.max(0, et);
}

export const CROP_MODEL = {
  rice: { tbase: 10, gddMat: 2150, gdd0: 2068, ypot: 720, kc: 0.95, season: 150, unit: 'kg/亩', area: 5.4 },
  corn: { tbase: 10, gddMat: 2800, gdd0: 2735, ypot: 830, kc: 0.6, season: 128, unit: 'kg/亩', area: 5.4 },
  alfalfa: { tbase: 5, gddMat: 520, gdd0: 365, ypot: 410, kc: 1.05, season: 38, unit: 'kg/亩(干草/茬)', area: 14.2 },
  apple: { tbase: 6, gddMat: 3650, gdd0: 3560, ypot: 3600, kc: 0.85, season: 175, unit: 'kg/亩', area: 5.0 },
  tomato: { tbase: 10, gddMat: 1900, gdd0: 1320, ypot: 9800, kc: 1.1, season: 140, unit: 'kg/亩', area: 2.3 },
  strawberry: { tbase: 5, gddMat: 1500, gdd0: 760, ypot: 2600, kc: 0.9, season: 160, unit: 'kg/亩', area: 2.3 },
  lettuce: { tbase: 4, gddMat: 820, gdd0: 520, ypot: 2400, kc: 1.0, season: 55, unit: 'kg/亩', area: 2.3 },
  cucumber: { tbase: 10, gddMat: 1400, gdd0: 980, ypot: 8800, kc: 1.05, season: 100, unit: 'kg/亩', area: 2.3 },
};
export const STAGES = {
  rice: [['分蘖期', 0.3], ['拔节孕穗', 0.55], ['抽穗扬花', 0.7], ['灌浆期', 0.88], ['黄熟期', 1]],
  corn: [['拔节期', 0.35], ['大喇叭口', 0.55], ['吐丝期', 0.7], ['乳熟期', 0.88], ['完熟期', 1]],
  alfalfa: [['返青期', 0.3], ['分枝期', 0.6], ['现蕾期', 0.85], ['初花期', 1]],
  apple: [['坐果期', 0.3], ['膨大期', 0.7], ['着色期', 0.9], ['采收期', 1]],
  tomato: [['苗期', 0.2], ['开花期', 0.4], ['结果初期', 0.6], ['结果盛期', 0.9], ['拉秧期', 1]],
  strawberry: [['定植期', 0.25], ['现蕾期', 0.4], ['开花坐果期', 0.65], ['采收期', 1]],
  lettuce: [['幼苗期', 0.3], ['莲座期', 0.7], ['结球期', 1]],
  cucumber: [['伸蔓期', 0.3], ['初花期', 0.5], ['结瓜期', 0.9], ['末瓜期', 1]],
};
export function stageOf(crop, frac) {
  for (const [n, f] of STAGES[crop]) if (frac <= f) return n;
  return STAGES[crop].at(-1)[0];
}

// 病害温度响应（Beta 函数）
export const DISEASE = {
  rice: { name: '稻瘟病', tmin: 10, topt: 26, tmax: 35, wetNeed: 6 },
  corn: { name: '玉米大斑病', tmin: 8, topt: 23, tmax: 32, wetNeed: 6 },
  alfalfa: { name: '褐斑病', tmin: 6, topt: 20, tmax: 30, wetNeed: 8 },
  apple: { name: '腐烂病', tmin: 5, topt: 24, tmax: 34, wetNeed: 8 },
  tomato: { name: '灰霉病', tmin: 4, topt: 21, tmax: 30, wetNeed: 4 },
  strawberry: { name: '白粉病', tmin: 8, topt: 22, tmax: 30, wetNeed: 3 },
  lettuce: { name: '霜霉病', tmin: 4, topt: 16, tmax: 26, wetNeed: 4 },
  cucumber: { name: '霜霉病', tmin: 6, topt: 20, tmax: 28, wetNeed: 4 },
};
export function tempResponse(T, d) {
  if (T <= d.tmin || T >= d.tmax) return 0;
  const a = (T - d.tmin) / (d.topt - d.tmin), b = (d.tmax - T) / (d.tmax - d.topt);
  return Math.pow(a, 1.2) * Math.pow(b, 1.2 * (d.tmax - d.topt) / (d.topt - d.tmin));
}
/** 侵染风险(0-100)：近 24h 叶面湿润时长 × 平均温度响应 × 田间已有病斑强度 */
export function infectionRisk(lwd, Tmean, inoculum, d) {
  const f = tempResponse(Tmean, d);
  const wet = 1 - Math.exp(-Math.max(0, lwd) / d.wetNeed);
  const r = 1 - Math.exp(-(wet * f * 2.2 + inoculum * 1.4));
  return clamp(r * 100, 0, 100);
}

/** 蒙特卡洛产量集合预测，返回终产量分位数与逐日轨迹带 */
export function yieldEnsemble({ crop, gdd, health, waterStress, risk, tMean = 17, n = 400, seed = 1 }) {
  const P = CROP_MODEL[crop];
  const r = mulberry32(seed);
  const k = 9 / P.gddMat, mid = P.gddMat * 0.55;
  const logistic = (g) => 1 / (1 + Math.exp(-k * (g - mid)));
  const L1 = logistic(P.gddMat);
  const fH = Math.pow(clamp((health - 0.25) / 0.65, 0.05, 1), 0.55);
  const fW = 1 - 0.35 * waterStress;
  const remainGdd = Math.max(0, P.gddMat - gdd);
  const daily = Math.max(2, tMean - P.tbase);
  const days = Math.min(60, Math.max(3, Math.ceil(remainGdd / daily) + 6));
  const traj = Array.from({ length: days + 1 }, () => []);
  const finals = [];
  for (let s = 0; s < n; s++) {
    let g = gdd, loss = 0, anom = 0;
    const ypot = P.ypot * (1 + gauss(r) * 0.04);
    for (let d = 0; d <= days; d++) {
      anom = anom * 0.7 + gauss(r) * 1.8;
      const T = tMean + anom;
      if (d > 0) g += Math.max(0, T - P.tbase);
      if (d > 0 && g < P.gddMat * 1.02) {
        loss += (risk / 100) * 0.0035 * r() * (T > 18 ? 1.3 : 0.8);
        if (r() < 0.006) loss += 0.02 + r() * 0.05; // 倒伏/极端天气
      }
      const form = Math.min(1, logistic(Math.min(g, P.gddMat)) / L1);
      traj[d].push(ypot * fH * fW * (1 - loss) * form);
    }
    finals.push(traj[days][traj[days].length - 1]);
  }
  const q = (arr, p) => { const a = [...arr].sort((x, y) => x - y); return a[Math.floor(p * (a.length - 1))]; };
  const band = traj.map((arr) => ({ p10: q(arr, 0.1), p25: q(arr, 0.25), p50: q(arr, 0.5), p75: q(arr, 0.75), p90: q(arr, 0.9) }));
  const mean = finals.reduce((a, b) => a + b, 0) / finals.length;
  // 历史形成曲线（按当前长势回推）
  const hist = [];
  const histDays = Math.min(P.season, 60);
  for (let d = -histDays; d <= 0; d++) {
    const gPast = gdd + d * daily * 1.15;
    const form = Math.min(1, logistic(Math.max(0, gPast)) / L1);
    hist.push(P.ypot * fH * fW * form);
  }
  const daysToHarvest = Math.max(0, Math.ceil(remainGdd / daily));
  return { mean, p10: q(finals, 0.1), p90: q(finals, 0.9), p50: q(finals, 0.5), band, hist, days, daysToHarvest, n, fH, fW };
}

/** 牲畜稳健 Z 分数异常检测（中位数 + MAD） */
export function robustZ(values, floor = 1e-6, relFloor = 0) {
  const sorted = [...values].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  const dev = values.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
  const mad = Math.max(dev[Math.floor(dev.length / 2)] * 1.4826, floor, Math.abs(med) * relFloor);
  return { med, mad, z: (v) => (v - med) / mad };
}
export function diagnoseAnimal(zT, zA, zR) {
  const score = Math.sqrt((zT * zT + zA * zA + zR * zR) / 3);
  if (zT > 3.2) return { status: 'alert', diag: '疑似发热', score };
  if (zA > 3.0 && zT < 2.5) return { status: 'watch', diag: '疑似发情', score };
  if (zA < -2.2) return { status: 'watch', diag: '活动减少/跛行', score };
  if (zR < -2.6) return { status: 'watch', diag: '反刍减少', score };
  return { status: 'normal', diag: '正常', score };
}
