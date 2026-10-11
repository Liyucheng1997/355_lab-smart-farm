// ECharts 图表
import * as echarts from 'echarts/core';
import { LineChart, BarChart, ScatterChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, MarkAreaComponent, MarkLineComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { CROP_INFO, PLOTS } from '../layout.js';

echarts.use([LineChart, BarChart, ScatterChart, GridComponent, TooltipComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, CanvasRenderer]);

const AX = '#6f93a6';
const axis = (extra = {}) => ({
  axisLine: { lineStyle: { color: 'rgba(54,230,255,.3)' } }, axisTick: { show: false },
  axisLabel: { color: AX, fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(255,255,255,.06)', type: 'dashed' } }, ...extra,
});
const tooltip = { trigger: 'axis', backgroundColor: 'rgba(4,20,34,.92)', borderColor: 'rgba(54,230,255,.5)', textStyle: { color: '#d6ecf5', fontSize: 12 }, axisPointer: { lineStyle: { color: 'rgba(54,230,255,.5)' } } };
const grad = (c, a1 = 0.45, a2 = 0) => new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: c.replace('A', a1) }, { offset: 1, color: c.replace('A', a2) }]);
const hhmm = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

const charts = {};
function init(id) {
  const c = echarts.init(document.getElementById(id), null, { renderer: 'canvas' });
  charts[id] = c;
  return c;
}
window.addEventListener('resize', () => Object.values(charts).forEach((c) => c.resize()));

export function createCharts() {
  const env = init('chart-env');
  env.setOption({
    animation: false, tooltip,
    legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 4, textStyle: { color: AX, fontSize: 10 }, data: ['气温', '湿度', '土壤墒情'] },
    grid: { left: 30, right: 30, top: 22, bottom: 18 },
    xAxis: { type: 'category', boundaryGap: false, ...axis({ splitLine: { show: false } }), data: [] },
    yAxis: [{ type: 'value', name: '', min: (v) => Math.floor(v.min - 2), ...axis() }, { type: 'value', min: 0, max: 100, ...axis({ splitLine: { show: false } }) }],
    series: [
      { name: '气温', type: 'line', smooth: true, symbol: 'none', lineStyle: { width: 2, color: '#ffb547' }, areaStyle: { color: grad('rgba(255,181,71,A)', 0.35) }, data: [] },
      { name: '湿度', type: 'line', smooth: true, symbol: 'none', yAxisIndex: 1, lineStyle: { width: 1.5, color: '#36e6ff' }, areaStyle: { color: grad('rgba(54,230,255,A)', 0.2) }, data: [] },
      { name: '土壤墒情', type: 'line', smooth: true, symbol: 'none', yAxisIndex: 1, lineStyle: { width: 1.5, color: '#7cff9b', type: 'dashed' }, data: [] },
    ],
  });

  const yieldC = init('chart-yield');
  const plotsC = init('chart-plots');
  const live = init('chart-livestock');
  const detail = init('chart-detail');

  return {
    updateEnv(H) {
      env.setOption({
        xAxis: { data: H.t.map(hhmm) },
        series: [{ data: H.temp.map((v) => v.toFixed(1)) }, { data: H.rh.map((v) => v.toFixed(0)) }, { data: H.soil.map((v) => v.toFixed(1)) }],
      });
    },
    updateYield(res, plotId) {
      const hist = res.hist, band = res.band;
      const n0 = hist.length - 1;
      const x = [];
      for (let i = -n0; i <= res.days; i++) x.push(i === 0 ? '今天' : (i > 0 ? `+${i}` : `${i}`));
      const pad = (arr, before) => [...Array(before).fill('-'), ...arr];
      const lower = band.map((b) => b.p10.toFixed(0));
      const range = band.map((b) => (b.p90 - b.p10).toFixed(0));
      const lower2 = band.map((b) => b.p25.toFixed(0));
      const range2 = band.map((b) => (b.p75 - b.p25).toFixed(0));
      const crop = PLOTS.find((p) => p.id === plotId).crop;
      const color = CROP_INFO[crop].color;
      yieldC.setOption({
        animation: true, animationDuration: 600,
        tooltip: { ...tooltip, formatter: (ps) => { const i = ps[0].dataIndex - n0; const b = band[i]; const h = hist[ps[0].dataIndex];
          return i <= 0 && h != null ? `第 ${i} 天<br/>产量形成 ${(+h).toFixed(0)}` : b ? `第 +${i} 天<br/>P50 ${b.p50.toFixed(0)}<br/>P10–P90 ${b.p10.toFixed(0)} – ${b.p90.toFixed(0)}` : ''; } },
        grid: { left: 40, right: 8, top: 10, bottom: 18 },
        xAxis: { type: 'category', boundaryGap: false, data: x, ...axis({ splitLine: { show: false }, axisLabel: { color: AX, fontSize: 10, interval: Math.ceil(x.length / 6) } }) },
        yAxis: { type: 'value', scale: true, ...axis() },
        series: [
          { type: 'line', name: 'hist', data: hist.map((v) => v.toFixed(0)), symbol: 'none', smooth: true, lineStyle: { color, width: 2 }, areaStyle: { color: grad('rgba(124,255,155,A)', 0.18) },
            markLine: { symbol: 'none', silent: true, data: [{ xAxis: n0 }], lineStyle: { color: 'rgba(255,255,255,.4)', type: 'dashed' }, label: { show: false } } },
          { type: 'line', stack: 'b', data: pad(lower, n0), symbol: 'none', lineStyle: { opacity: 0 } },
          { type: 'line', stack: 'b', data: pad(range, n0), symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { color: 'rgba(54,230,255,.16)' } },
          { type: 'line', stack: 'c', data: pad(lower2, n0), symbol: 'none', lineStyle: { opacity: 0 } },
          { type: 'line', stack: 'c', data: pad(range2, n0), symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { color: 'rgba(54,230,255,.28)' } },
          { type: 'line', data: pad(band.map((b) => b.p50.toFixed(0)), n0), symbol: 'none', smooth: true, lineStyle: { color: '#36e6ff', width: 2, type: 'dashed' } },
        ],
      }, true);
    },
    updatePlots(rows) {
      plotsC.setOption({
        animation: false,
        tooltip: { ...tooltip, trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 6, textStyle: { color: AX, fontSize: 10 }, data: ['NDVI', '病害风险'] },
        grid: { left: 34, right: 30, top: 20, bottom: 18 },
        xAxis: { type: 'category', data: rows.map((r) => r.id), ...axis({ splitLine: { show: false } }) },
        yAxis: [{ type: 'value', min: 0, max: 1, ...axis() }, { type: 'value', min: 0, max: 100, ...axis({ splitLine: { show: false } }) }],
        series: [
          { name: 'NDVI', type: 'bar', barWidth: 9, data: rows.map((r) => ({ value: r.ndvi.toFixed(2), itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: r.ndvi > 0.72 ? '#7cff9b' : r.ndvi > 0.62 ? '#ffd166' : '#ff6a5a' }, { offset: 1, color: 'rgba(54,230,255,.1)' }]) } })) },
          { name: '病害风险', type: 'line', yAxisIndex: 1, data: rows.map((r) => r.risk.toFixed(0)), symbol: 'circle', symbolSize: 6, lineStyle: { color: '#ff5a6a', width: 1.5 }, itemStyle: { color: '#ff5a6a' } },
        ],
      });
    },
    updateLivestock(animals) {
      const pts = (st) => animals.filter((a) => a.kind !== 'chicken' && a.metrics.status === st).map((a) => ({ value: [+a.metrics.activity.toFixed(0), +a.metrics.temp.toFixed(2)], name: a.id }));
      live.setOption({
        animation: false,
        tooltip: { trigger: 'item', backgroundColor: 'rgba(4,20,34,.92)', borderColor: 'rgba(54,230,255,.5)', textStyle: { color: '#d6ecf5', fontSize: 12 }, formatter: (p) => `${p.name}<br/>活动量 ${p.value[0]} 步/h<br/>体温 ${p.value[1]}℃` },
        grid: { left: 36, right: 6, top: 8, bottom: 30 },
        xAxis: { type: 'value', name: '活动量 步/h', nameLocation: 'middle', nameGap: 18, nameTextStyle: { color: AX, fontSize: 10 }, scale: true, ...axis() },
        yAxis: { type: 'value', scale: true, ...axis() },
        series: [
          { type: 'scatter', data: pts('normal'), symbolSize: 7, itemStyle: { color: 'rgba(61,255,160,.75)' },
            markArea: { silent: true, itemStyle: { color: 'rgba(61,255,160,.05)', borderColor: 'rgba(61,255,160,.3)', borderType: 'dashed', borderWidth: 1 }, data: [[{ yAxis: 38.2 }, { yAxis: 39.6 }]] } },
          { type: 'scatter', data: pts('watch'), symbolSize: 11, itemStyle: { color: '#ffc94a', shadowBlur: 10, shadowColor: '#ffc94a' } },
          { type: 'scatter', data: pts('alert'), symbolSize: 13, itemStyle: { color: '#ff4a5a', shadowBlur: 14, shadowColor: '#ff4a5a' } },
        ],
      });
    },
    updateDetail(series, unit = '') {
      if (!series) { detail.clear(); return; }
      detail.setOption({
        animation: false, tooltip,
        grid: { left: 36, right: 8, top: 14, bottom: 18 },
        xAxis: { type: 'category', boundaryGap: false, data: series.x, ...axis({ splitLine: { show: false }, axisLabel: { color: AX, fontSize: 10, interval: Math.ceil(series.x.length / 5) } }) },
        yAxis: { type: 'value', scale: true, name: unit, nameTextStyle: { color: AX, fontSize: 10 }, ...axis() },
        series: series.lines.map((l) => ({ name: l.name, type: 'line', smooth: true, symbol: 'none', data: l.data, lineStyle: { color: l.color, width: 2 }, areaStyle: l.area ? { color: grad(l.area, 0.3) } : undefined })),
      }, true);
    },
    resize() { Object.values(charts).forEach((c) => c.resize()); },
  };
}
