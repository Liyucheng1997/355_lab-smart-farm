// 农场空间布局（单位：米。x 向东，z 向南，原点为数据中心附近）
export const FARM = { xmin: -232, xmax: 232, zmin: -238, zmax: 222 };

export const ROADS = [
  { x: 0, z: -8, w: 8, d: 460 },          // 南北主干道
  { x: 0, z: -100, w: 450, d: 7 },        // 北部东西道
  { x: 0, z: 50, w: 450, d: 7 },          // 南部东西道
  { x: -142, z: -145, w: 4, d: 62 },      // 田间机耕道
  { x: -72, z: -145, w: 4, d: 62 },
  { x: 75, z: -145, w: 4, d: 62 },
  { x: 148, z: -145, w: 4, d: 62 },
];

export const CROP_INFO = {
  rice: { name: '水稻', variety: '南粳 9108', stage: '黄熟期', color: '#f2c14e', disease: '稻瘟病' },
  corn: { name: '玉米', variety: '郑单 958', stage: '完熟期', color: '#e8d36a', disease: '大斑病' },
  alfalfa: { name: '紫花苜蓿', variety: '中苜 3 号', stage: '现蕾期', color: '#5fd068', disease: '褐斑病' },
  apple: { name: '苹果', variety: '红富士', stage: '采收期', color: '#ff5a4f', disease: '腐烂病' },
  tomato: { name: '番茄', variety: '粉果 1 号', stage: '结果盛期', color: '#ff6b5b', disease: '灰霉病' },
  strawberry: { name: '草莓', variety: '红颜', stage: '开花坐果期', color: '#ff4f7a', disease: '白粉病' },
  lettuce: { name: '生菜', variety: '意大利生菜', stage: '莲座期', color: '#9bf06b', disease: '霜霉病' },
  cucumber: { name: '黄瓜', variety: '津优 35', stage: '结瓜期', color: '#6fd36a', disease: '霜霉病' },
};

export const PLOTS = [
  { id: 'A1', name: 'A1 水稻田', crop: 'rice', x: -177, z: -145, w: 60, d: 60 },
  { id: 'A2', name: 'A2 水稻田', crop: 'rice', x: -107, z: -145, w: 60, d: 60, harvest: true },
  { id: 'A3', name: 'A3 水稻田', crop: 'rice', x: -37, z: -145, w: 60, d: 60 },
  { id: 'B1', name: 'B1 玉米田', crop: 'corn', x: 40, z: -145, w: 60, d: 60 },
  { id: 'B2', name: 'B2 玉米田', crop: 'corn', x: 111, z: -145, w: 60, d: 60 },
  { id: 'O1', name: 'O1 苹果园', crop: 'apple', x: 186, z: -145, w: 56, d: 60 },
  { id: 'P1', name: 'P1 苜蓿喷灌区', crop: 'alfalfa', x: -150, z: -25, r: 55, circle: true },
  { id: 'G1', name: 'G1 番茄温室', crop: 'tomato', x: -195, z: 125, w: 22, d: 70, greenhouse: true },
  { id: 'G2', name: 'G2 草莓温室', crop: 'strawberry', x: -165, z: 125, w: 22, d: 70, greenhouse: true },
  { id: 'G3', name: 'G3 生菜温室', crop: 'lettuce', x: -135, z: 125, w: 22, d: 70, greenhouse: true },
  { id: 'G4', name: 'G4 番茄温室', crop: 'tomato', x: -105, z: 125, w: 22, d: 70, greenhouse: true },
  { id: 'G5', name: 'G5 黄瓜温室', crop: 'cucumber', x: -75, z: 125, w: 22, d: 70, greenhouse: true },
];
export const plotById = Object.fromEntries(PLOTS.map((p) => [p.id, p]));

// 病害热点（由多光谱巡检发现，作物实例健康度在此处下降）
export const HOTSPOTS = [
  { id: 'H1', plot: 'A2', x: -95, z: -160, r: 7, severity: 0.75, disease: '稻瘟病' },
  { id: 'H2', plot: 'A3', x: -48, z: -128, r: 9, severity: 0.65, disease: '稻瘟病' },
  { id: 'H3', plot: 'A1', x: -190, z: -132, r: 5, severity: 0.45, disease: '纹枯病' },
  { id: 'H4', plot: 'B1', x: 52, z: -158, r: 8, severity: 0.7, disease: '玉米大斑病' },
  { id: 'H5', plot: 'B2', x: 98, z: -128, r: 5, severity: 0.4, disease: '玉米螟虫害' },
];

export const PASTURE = { xmin: 30, xmax: 212, zmin: 66, zmax: 160 };
export const CHICKEN_YARD = { xmin: 140, xmax: 212, zmin: 170, zmax: 212 };
export const POND = { x: 160, z: -25, rx: 48, rz: 32 };
export const HUB = { x: 45, z: -40 };

export const FACILITIES = [
  { id: 'hub', name: '农业大数据中心', x: HUB.x, z: HUB.z, h: 30 },
  { id: 'barn', name: '智能牛舍', x: 75, z: 186, h: 20 },
  { id: 'pond', name: '灌溉水库', x: POND.x, z: POND.z, h: 8 },
  { id: 'solar', name: '光伏电站 1.2MW', x: 0, z: -212, h: 12 },
  { id: 'coop', name: '智能鸡舍', x: 190, z: 196, h: 10 },
  { id: 'house', name: '农场管理中心', x: -55, z: -55, h: 14 },
  { id: 'shed', name: '农机库', x: -50, z: 15, h: 12 },
];

// 物联网节点
export const GATEWAYS = [
  { id: 'GW-01', x: -112, z: -108 },
  { id: 'GW-02', x: 76, z: -108 },
  { id: 'GW-03', x: -120, z: 62 },
  { id: 'GW-04', x: 110, z: 62 },
];

const S = [];
let sid = 1;
const add = (type, x, z, plot, extra = {}) => S.push({ id: `S-${String(sid++).padStart(3, '0')}`, type, x, z, plot, ...extra });
for (const p of PLOTS) {
  if (p.greenhouse) { add('air', p.x, p.z - 20, p.id); continue; }
  if (p.circle) { add('soil', p.x + 22, p.z - 14, p.id); add('soil', p.x - 18, p.z + 20, p.id); continue; }
  add('soil', p.x - 14, p.z - 12, p.id);
  add('soil', p.x + 14, p.z + 14, p.id);
}
add('cam', -142, -112, 'A1');
add('cam', 75, -178, 'B1');
add('weather', 18, 8, null);
add('water', POND.x - 30, POND.z + 18, null);
add('cam', PASTURE.xmin + 2, PASTURE.zmin + 2, null);
add('cam', PASTURE.xmax - 2, PASTURE.zmin + 2, null);
add('tag', 120, 140, null);
add('tag', 185, 190, null);
add('power', -60, -196, null);
export const SENSORS = S;

export const SENSOR_TYPES = {
  soil: { name: '土壤墒情', color: '#38e1ff', icon: '◉' },
  air: { name: '温室环境', color: '#7cff9b', icon: '◈' },
  cam: { name: 'AI 摄像头', color: '#ffd166', icon: '◎' },
  weather: { name: '气象站', color: '#9ab6ff', icon: '☼' },
  water: { name: '水质监测', color: '#4fc3ff', icon: '≈' },
  tag: { name: '耳标基站', color: '#ff9f5a', icon: '⌁' },
  power: { name: '能源监测', color: '#f7e463', icon: 'ϟ' },
};
