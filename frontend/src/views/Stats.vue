<template>
  <div class="page">
    <div class="hero">
      <div class="hero-name">学习数据看板</div>
      <div class="hero-sub">看得见的进步，才更有动力</div>
      <div class="hero-stats">
        <div class="hero-stat"><b>{{ ov.studyDays ?? 0 }}</b><span>学习天数</span></div>
        <div class="hero-stat"><b>{{ ov.totalQuestions ?? 0 }}</b><span>累计答题</span></div>
        <div class="hero-stat"><b>{{ ov.accuracy ?? 0 }}%</b><span>正确率</span></div>
      </div>
    </div>

    <!-- 关键指标 -->
    <div class="stat-grid4">
      <div class="mini-stat">
        <div class="mini-val">{{ ov.passedLessons ?? 0 }}</div>
        <div class="mini-label">通关关卡</div>
      </div>
      <div class="mini-stat">
        <div class="mini-val">{{ ov.totalPoints ?? 0 }}</div>
        <div class="mini-label">累计积分</div>
      </div>
      <div class="mini-stat">
        <div class="mini-val">{{ ov.streakDays ?? 0 }}</div>
        <div class="mini-label">连续天数</div>
      </div>
      <div class="mini-stat">
        <div class="mini-val">{{ ov.rankNo ?? '-' }}</div>
        <div class="mini-label">班级排名</div>
      </div>
    </div>

    <!-- 学习热力图 -->
    <div class="card">
      <div class="card-title">学习热力图（近 84 天）</div>
      <div ref="heatmapRef" class="chart chart-heat"></div>
    </div>

    <div class="chart-grid">
      <!-- 正确率趋势 -->
      <div class="card">
        <div class="card-title">正确率趋势（近 14 天）</div>
        <div ref="trendRef" class="chart"></div>
      </div>

      <!-- 知识点雷达 -->
      <div class="card">
        <div class="card-title">知识点掌握雷达</div>
        <div ref="radarRef" class="chart"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import * as echarts from 'echarts'
import { statsApi } from '@/api'
import { useThemeStore } from '@/store/theme'

const themeStore = useThemeStore()

const ov = ref({})
const heatmapRef = ref()
const trendRef = ref()
const radarRef = ref()
const charts = []

/*
 * 取到的数据缓存下来，渲染函数只负责画。
 * 这样切换主题时可以直接重画，不必为了换个颜色再打三个接口。
 */
const heatData = ref([])
const trendData = ref([])
const radarData = ref([])

function initChart(el, option) {
  if (!el) return
  const c = echarts.init(el)
  // 必须先把 CSS 变量解析成真实色值再交给 ECharts（canvas 不认 var()）
  c.setOption(resolveCssVars(option))
  charts.push(c)
  return c
}

/**
 * ECharts 画的是 canvas，**不能解析 CSS 变量**。
 * 直接把 'var(--eq-primary)' 写进配置，ECharts 拿到的是这串字面量字符串，
 * 解析颜色失败后会 fallback 成黑色 —— 热力图整片变黑就是这么来的。
 * 这里在运行期把变量读出来换成真实色值，保持 token 仍是唯一色源。
 */
let cssVarCache = null
let cssVarCacheTheme = ''

/**
 * 读 CSS 变量。
 * 缓存**按主题分桶**：theme 一变就自动重建，共用一个 Map 的话
 * 切到深色主题后图表会继续用浅色的旧色值，而且不会有任何报错。
 */
function cssVar(name) {
  const theme = document.documentElement.dataset.theme || ''
  if (!cssVarCache || cssVarCacheTheme !== theme) {
    cssVarCache = new Map()
    cssVarCacheTheme = theme
  }
  if (cssVarCache.has(name)) return cssVarCache.get(name)
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  cssVarCache.set(name, v)
  return v
}

/**
 * 把配置对象里所有的 'var(--x)' 递归替换成真实色值。
 * 遍历整个 option 而不是逐个手填色值，避免以后新增图表又踩同一个坑。
 */
function resolveCssVars(node) {
  if (typeof node === 'string') {
    const m = node.match(/^var\((--[\w-]+)\)$/)
    return m ? cssVar(m[1]) : node
  }
  if (Array.isArray(node)) return node.map(resolveCssVars)
  if (node && typeof node === 'object') {
    const out = {}
    for (const k of Object.keys(node)) out[k] = resolveCssVars(node[k])
    return out
  }
  return node
}

async function renderHeatmap() {
  const data = heatData.value
  // 转成 [日期, 数量] 供 calendar 使用
  const values = data.map((d) => [d.date, d.count])
  const max = Math.max(1, ...data.map((d) => d.count))
  const dates = data.map((d) => d.date)
  if (!dates.length) return

  initChart(heatmapRef.value, {
    tooltip: {
      formatter: (p) => `${p.value[0]}<br/>答题 ${p.value[1]} 道`
    },
    visualMap: {
      min: 0,
      max,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemHeight: 110,
      text: ['多', '少'],
      /*
       * 热力图色带：同一色相（强调色 #4f46e5）的等比亮度阶梯 + 一个中性的"空档"。
       *
       * 为什么不用「浅灰 → 强调色暗档 #4338ca」：
       *   1. #4338ca 已接近黑紫，配白底卡片显得脏，也就是"黑紫看不清"；
       *   2. 原来四档的亮度比是 1.22 / 1.64 / 1.73 / 2.97，
       *      最后一档跳变陡到 2.97x，前两档却几乎分不开。
       *
       * 现在六档，相邻档位相对亮度比稳定在 1.25-1.66 倍，
       * 最浅档对白底 1.28:1（看得出是"有活动"），
       * 最深档就是强调色本体 6.29:1（完全可读），不再落到近黑紫。
       *
       * 色值定义在 global.css 的 --eq-heat-0…5：canvas 不认 CSS 变量，
       * 但上面的 resolveCssVars() 会先把 var(--x) 读成真实色值再交给 ECharts，
       * 所以这里可以放心写 var()，浅色/深色两套色带自动生效。
       * 改色前先跑 scripts/theme_contrast.py 体检亮度阶梯。
       */
      inRange: {
        color: [
          'var(--eq-heat-0)', // 空档：几乎无活动（中性，与"完全没有"区分开）
          'var(--eq-heat-1)',
          'var(--eq-heat-2)',
          'var(--eq-heat-3)',
          'var(--eq-heat-4)',
          'var(--eq-heat-5)' // 最活跃
        ]
      }
    },
    calendar: {
      top: 34,
      left: 40,
      right: 16,
      cellSize: ['auto', 15],
      range: [dates[0], dates[dates.length - 1]],
      // 空档格子色 = 色带最浅档的"同族更暗色"，两个"无活动"的语义才一致；
      // 网格线用卡片底色，深色下才不会出现一圈圈白框
      itemStyle: {
        borderWidth: 2,
        borderColor: 'var(--eq-surface)',
        color: 'var(--eq-heat-empty)'
      },
      splitLine: { show: false },
      yearLabel: { show: false },
      monthLabel: { nameMap: 'cn', fontSize: 11, color: 'var(--eq-text-mute)' },
      dayLabel: { nameMap: ['日', '一', '二', '三', '四', '五', '六'], fontSize: 11, color: 'var(--eq-text-mute)' }
    },
    series: [
      {
        type: 'heatmap',
        coordinateSystem: 'calendar',
        data: values
      }
    ]
  })
}

async function renderTrend() {
  const data = trendData.value
  initChart(trendRef.value, {
    grid: { top: 40, left: 46, right: 20, bottom: 30 },
    tooltip: { trigger: 'axis' },
    legend: {
      data: ['正确率', '答题量'],
      right: 0,
      top: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { fontSize: 11 }
    },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.date.slice(5)),
      axisLine: { lineStyle: { color: 'var(--eq-border-soft)' } },
      axisLabel: { fontSize: 11, color: 'var(--eq-text-mute)' }
    },
    yAxis: [
      {
        type: 'value',
        max: 100,
        name: '%',
        nameTextStyle: { fontSize: 10 },
        splitLine: { lineStyle: { color: 'var(--eq-surface-sunken)' } },
        axisLabel: { fontSize: 11, color: 'var(--eq-text-mute)' }
      },
      {
        type: 'value',
        name: '题',
        nameTextStyle: { fontSize: 10 },
        splitLine: { show: false },
        axisLabel: { fontSize: 11, color: 'var(--eq-text-mute)' }
      }
    ],
    series: [
      {
        name: '正确率',
        type: 'line',
        smooth: true,
        data: data.map((d) => d.accuracy),
        itemStyle: { color: 'var(--eq-primary)' },
        areaStyle: {
          // 面积渐变也必须跟着主题走：深色底上 0.26 不透明度的深靛蓝会糊成一片。
          // 这两个是**专用 token**，浅色主题下与改造前的 rgba(79,70,229,.26/.02)
          // 完全相同，避免顺手改色把已经定稿的浅色观感动了。
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'var(--eq-area-from)' },
            { offset: 1, color: 'var(--eq-area-to)' }
          ])
        }
      },
      {
        name: '答题量',
        type: 'bar',
        yAxisIndex: 1,
        barWidth: 11,
        data: data.map((d) => d.total),
        // 用实心强调色，不要用 --eq-primary-line（那是半透明边框色），
        // 后者当柱体填充会整片发灰、看不出量级
        itemStyle: { color: 'var(--eq-primary)', borderRadius: [4, 4, 0, 0] }
      }
    ]
  })
}

async function renderRadar() {
  const data = radarData.value
  if (!data.length) return
  initChart(radarRef.value, {
    tooltip: {},
    radar: {
      indicator: data.map((d) => ({ name: d.name, max: 100 })),
      radius: '62%',
      center: ['50%', '54%'],
      axisName: { fontSize: 11, color: 'var(--eq-text-mute)' },
      splitLine: { lineStyle: { color: 'var(--eq-border-soft)' } },
      splitArea: {
        areaStyle: { color: ['var(--eq-surface)', 'var(--eq-surface-sunken)'] }
      },
      axisLine: { lineStyle: { color: 'var(--eq-border-soft)' } }
    },
    series: [
      {
        type: 'radar',
        data: [
          {
            value: data.map((d) => d.value),
            name: '掌握度',
            // 与强调色同色相（原来是 #7c3aed 紫罗兰，与 #4f46e5 靛蓝不同色相，属漏改）。
            // --eq-primary-line 在浅色主题下正好等于原来的 rgba(79,70,229,0.22)。
            areaStyle: { color: 'var(--eq-primary-line)' },
            lineStyle: { color: 'var(--eq-primary-bright)', width: 2 },
            itemStyle: { color: 'var(--eq-primary-bright)' }
          }
        ]
      }
    ]
  })
}

function handleResize() {
  charts.forEach((c) => c.resize())
}

/**
 * 重画全部图表。
 * ECharts 是 canvas，色值在 setOption 那一刻就被烤进画布了，
 * CSS 变量一变它自己不会跟着重绘 —— 所以切换主题后必须整个重建，
 * 否则页面变成深色、图表还留着浅色主题的底色。
 */
async function renderAll() {
  await nextTick()
  charts.forEach((c) => c.dispose())
  charts.length = 0
  renderHeatmap()
  renderTrend()
  renderRadar()
}

async function loadAll() {
  const [o, h, t, r] = await Promise.allSettled([
    statsApi.overview(),
    statsApi.heatmap(84),
    statsApi.trend(14),
    statsApi.radar()
  ])
  if (o.status === 'fulfilled') ov.value = o.value || {}
  if (h.status === 'fulfilled') heatData.value = h.value || []
  if (t.status === 'fulfilled') trendData.value = t.value || []
  if (r.status === 'fulfilled') radarData.value = r.value || []
  await renderAll()
}

onMounted(async () => {
  await loadAll()
  window.addEventListener('resize', handleResize)
})

// 主题变化 → 用同一份数据重画，不再打接口
watch(
  () => themeStore.resolved,
  () => {
    renderAll()
  }
)

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  charts.forEach((c) => c.dispose())
})
</script>

<style scoped>
.stat-grid4 {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin: 20px 0 16px;
}

.mini-stat {
  background: var(--eq-surface);
  border: 1px solid var(--eq-border);
  border-radius: var(--eq-radius);
  padding: 16px 10px;
  text-align: center;
  box-shadow: var(--eq-shadow);
}

.mini-val {
  font-size: 22px;
  font-weight: 800;
  color: var(--eq-accent);
  font-variant-numeric: tabular-nums;
}

.mini-label {
  font-size: 12px;
  color: var(--eq-text-sub);
  margin-top: 4px;
}

.chart-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.chart {
  width: 100%;
  height: 280px;
}

.chart-heat {
  height: 240px;
}

@media (max-width: 1024px) {
  .chart-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .stat-grid4 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
