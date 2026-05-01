<template>
  <div class="tof-wrap">
    <div class="tof-panel">
      <div v-for="s in sensors" :key="s.key" class="tof-card" :class="{ 'tof-card--warn': s.warn, 'tof-card--danger': s.danger }">
        <div class="tof-label">{{ s.label }}</div>
        <div class="tof-value mono">
          {{ s.value }} <span class="tof-unit">mm</span>
        </div>
        <div class="tof-bar">
          <div class="tof-fill" :style="{ width: s.pct + '%' }"></div>
        </div>
      </div>
    </div>

    <TimeSeriesChart
      :series="chartSeries"
      :window-ms="windowMs"
      unit="mm"
      :decimals="0"
      :y-min="0"
      :height="140"
    />
  </div>
</template>

<script setup>
import { computed, reactive, watch, onMounted, onUnmounted } from 'vue'
import TimeSeriesChart from './TimeSeriesChart.vue'

const props = defineProps({
  tof: { type: Object, default: () => ({}) },
  sampleMs: { type: Number, default: 100 },
  windowMs: { type: Number, default: 30000 },
})

// TOF range assumption: 30..1500 mm (VL53L0X typical short mode)
const TOF_MAX_MM = 1500
const WARN_MM = 400
const DANGER_MM = 150
// Anything at/above this is treated as "no target" (matches firmware sentinel
// TOF_MAX_MM=65535 and rejects multipath spikes well past sensor range).
const TOF_VALID_MAX_MM = 4000

function isValidReading(raw) {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 && n < TOF_VALID_MAX_MM
}

function mkCard(label, key, raw) {
  const valid = isValidReading(raw)
  const value = valid ? Math.round(Number(raw)) : null
  const pct = valid ? Math.max(0, Math.min(100, (value / TOF_MAX_MM) * 100)) : 0
  return {
    key,
    label,
    value: value != null ? value : '—',
    pct,
    warn: valid && value < WARN_MM,
    danger: valid && value < DANGER_MM,
  }
}

const sensors = computed(() => [
  mkCard('Front', 'front', props.tof.front_mm),
  mkCard('Left',  'left',  props.tof.left_mm),
  mkCard('Right', 'right', props.tof.right_mm),
  mkCard('Back',  'back',  props.tof.back_mm),
])

const SERIES_DEFS = [
  { key: 'front', name: 'Front', color: '#00e676' },
  { key: 'left',  name: 'Left',  color: '#00b0ff' },
  { key: 'right', name: 'Right', color: '#ffd600' },
  { key: 'back',  name: 'Back',  color: '#ff6e6e' },
]

const buffers = reactive({ front: [], left: [], right: [], back: [] })
const chartSeries = computed(() => SERIES_DEFS.map(s => ({
  name: s.name,
  color: s.color,
  data: buffers[s.key],
})))

let sampleTimer = null

function tick() {
  const now = Date.now()
  const cutoff = now - props.windowMs - 1000
  for (const def of SERIES_DEFS) {
    const raw = props.tof[`${def.key}_mm`]
    const buf = buffers[def.key]
    if (isValidReading(raw)) {
      buf.push({ t: now, v: Number(raw) })
    }
    // Drop invalid/out-of-range samples (e.g. firmware's 65535 sentinel)
    // so they don't blow up the chart's auto-scaled Y axis.
    while (buf.length && buf[0].t < cutoff) buf.shift()
  }
}

function restart() {
  if (sampleTimer) clearInterval(sampleTimer)
  sampleTimer = setInterval(tick, props.sampleMs)
}

watch(() => props.sampleMs, restart)
onMounted(restart)
onUnmounted(() => { if (sampleTimer) clearInterval(sampleTimer) })
</script>

<style scoped>
.tof-wrap {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.tof-panel {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.tof-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px 12px;
  transition: border-color 0.2s;
}

.tof-card--warn { border-color: #ff9100; }
.tof-card--danger { border-color: #ff3366; box-shadow: 0 0 6px rgba(255,51,102,0.3); }

.tof-label {
  font-size: 0.7rem;
  color: var(--text-dim);
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.tof-value {
  font-family: var(--text-mono);
  font-size: 1.3rem;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.tof-unit {
  font-size: 0.7rem;
  color: var(--text-dim);
  margin-left: 4px;
}

.tof-bar {
  width: 100%;
  height: 4px;
  background: rgba(255,255,255,0.05);
  border-radius: 2px;
  overflow: hidden;
}

.tof-fill {
  height: 100%;
  background: linear-gradient(to right, #00e676, #00b0ff);
  transition: width 0.25s;
}

.tof-card--warn .tof-fill {
  background: linear-gradient(to right, #ff9100, #ffd600);
}

.tof-card--danger .tof-fill {
  background: #ff3366;
}

.mono { font-family: var(--text-mono); }
</style>
