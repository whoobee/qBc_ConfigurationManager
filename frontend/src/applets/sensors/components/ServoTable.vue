<template>
  <div class="servo-table">
    <table>
      <thead>
        <tr>
          <th>Joint</th>
          <th class="num">Pos (&deg;)</th>
          <th class="num">Vel (&deg;/s)</th>
          <th class="num">Load</th>
          <th class="num">Temp (&deg;C)</th>
          <th class="num">Volt (V)</th>
          <th class="num">Curr</th>
          <th>State</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="name in JOINT_ORDER" :key="name" :class="{ 'row-stale': !servos[name] }">
          <td class="name mono">{{ displayName(name) }}</td>
          <td class="num mono">{{ fmt(servos[name]?.position_deg, 1) }}</td>
          <td class="num mono">{{ fmt(servos[name]?.speed_dps, 1) }}</td>
          <td class="num mono">
            <LoadBar :value="servos[name]?.load" />
          </td>
          <td class="num mono" :class="tempClass(servos[name]?.temperature)">
            {{ fmt(servos[name]?.temperature, 0) }}
          </td>
          <td class="num mono">{{ fmt(servos[name]?.voltage, 1) }}</td>
          <td class="num mono">{{ fmt(servos[name]?.current, 0) }}</td>
          <td>
            <span class="pill" :class="pillClass(servos[name])">{{ pillLabel(servos[name]) }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { h } from 'vue'

defineProps({
  servos: { type: Object, default: () => ({}) },
})

const JOINT_ORDER = [
  'neck',
  'left_ear', 'right_ear',
  'left_front_leg', 'right_front_leg',
  'left_back_leg',  'right_back_leg',
]

function displayName(n) { return n.replace(/_/g, ' ') }

function fmt(v, d = 1) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—'
  return Number(v).toFixed(d)
}

function tempClass(t) {
  if (t === undefined || t === null) return ''
  if (t >= 70) return 'text-danger'
  if (t >= 55) return 'text-warn'
  return ''
}

function pillClass(s) {
  if (!s) return 'pill-idle'
  if (Math.abs(s.speed_dps || 0) > 2) return 'pill-move'
  return 'pill-hold'
}
function pillLabel(s) {
  if (!s) return 'no data'
  if (Math.abs(s.speed_dps || 0) > 2) return 'moving'
  return 'holding'
}

// Small inline LoadBar component — load is 0..1000 (SMS_STS) -> 0..100%
const LoadBar = {
  props: ['value'],
  setup(p) {
    return () => {
      const v = Number(p.value) || 0
      const pct = Math.max(0, Math.min(100, Math.abs(v) / 10))
      const cls = pct > 70 ? 'fill-danger' : pct > 40 ? 'fill-warn' : 'fill-ok'
      return h('div', { class: 'load-wrap' }, [
        h('div', { class: 'load-track' }, [
          h('div', { class: `load-fill ${cls}`, style: { width: pct + '%' } }),
        ]),
        h('span', { class: 'load-num mono' }, pct.toFixed(0) + '%'),
      ])
    }
  },
}
</script>

<style scoped>
.servo-table {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

th, td {
  padding: 6px 10px;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

th {
  color: var(--text-dim);
  font-size: 0.65rem;
  letter-spacing: 1px;
  text-transform: uppercase;
  font-weight: normal;
}

.num { text-align: right; }

td.name { color: var(--text-primary); text-transform: capitalize; }

.row-stale { opacity: 0.4; }

.pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.65rem;
  font-family: var(--text-mono);
  letter-spacing: 1px;
  text-transform: uppercase;
}
.pill-idle { background: rgba(144,164,174,0.15); color: var(--text-dim); }
.pill-hold { background: rgba(0,176,255,0.15); color: #00b0ff; }
.pill-move { background: rgba(0,230,118,0.15); color: #00e676; }

.text-danger { color: #ff3366; }
.text-warn { color: #ff9100; }

.mono { font-family: var(--text-mono); }

:deep(.load-wrap) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  justify-content: flex-end;
}
:deep(.load-track) {
  flex: 1;
  height: 6px;
  max-width: 80px;
  background: rgba(255,255,255,0.05);
  border-radius: 3px;
  overflow: hidden;
}
:deep(.load-fill) { height: 100%; }
:deep(.fill-ok) { background: #00e676; }
:deep(.fill-warn) { background: #ff9100; }
:deep(.fill-danger) { background: #ff3366; }
:deep(.load-num) { font-size: 0.7rem; color: var(--text-dim); min-width: 32px; text-align: right; }
</style>
