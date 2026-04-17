<template>
  <div class="motor-table">
    <table>
      <thead>
        <tr>
          <th>Motor</th>
          <th class="num">Vel (RPM)</th>
          <th class="num">Pos (ticks)</th>
          <th class="num">Current (A)</th>
          <th class="num">Temp (&deg;C)</th>
          <th>Fault</th>
          <th>State</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="name in MOTOR_ORDER" :key="name" :class="{ 'row-stale': !motors[name] }">
          <td class="name mono">{{ name }}</td>
          <td class="num mono" :class="rpmClass(motors[name]?.velocity_rpm)">
            {{ fmt(motors[name]?.velocity_rpm, 1) }}
          </td>
          <td class="num mono">{{ fmt(motors[name]?.position, 0) }}</td>
          <td class="num mono">{{ fmt(motors[name]?.current_a, 2) }}</td>
          <td class="num mono" :class="tempClass(motors[name]?.temperature)">
            {{ fmt(motors[name]?.temperature, 0) }}
          </td>
          <td>
            <span :class="faultClass(motors[name]?.fault_code)">
              {{ faultLabel(motors[name]?.fault_code) }}
            </span>
          </td>
          <td>
            <span class="pill" :class="pillClass(motors[name])">{{ pillLabel(motors[name]) }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
defineProps({
  motors: { type: Object, default: () => ({}) },
})

const MOTOR_ORDER = ['left', 'right']

function fmt(v, d = 1) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—'
  return Number(v).toFixed(d)
}

function rpmClass(v) {
  if (v === undefined || v === null) return ''
  if (Math.abs(v) < 0.5) return ''
  return v > 0 ? 'text-forward' : 'text-reverse'
}

function tempClass(t) {
  if (t === undefined || t === null) return ''
  if (t >= 70) return 'text-danger'
  if (t >= 55) return 'text-warn'
  return ''
}

function faultClass(code) {
  if (code === undefined || code === null) return 'fault fault-none'
  return code === 0 ? 'fault fault-ok' : 'fault fault-err'
}

function faultLabel(code) {
  if (code === undefined || code === null) return '—'
  return code === 0 ? 'OK' : `0x${Number(code).toString(16).toUpperCase()}`
}

function pillClass(m) {
  if (!m) return 'pill-idle'
  if (Math.abs(m.velocity_rpm || 0) > 0.5) return 'pill-move'
  return 'pill-hold'
}
function pillLabel(m) {
  if (!m) return 'no data'
  if (Math.abs(m.velocity_rpm || 0) > 0.5) return 'running'
  return 'stopped'
}
</script>

<style scoped>
.motor-table { overflow-x: auto; }

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

td.name { color: var(--text-primary); text-transform: uppercase; }

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

.fault {
  font-family: var(--text-mono);
  font-size: 0.75rem;
}
.fault-ok { color: #00e676; }
.fault-err { color: #ff3366; }
.fault-none { color: var(--text-dim); }

.text-forward { color: #00e676; }
.text-reverse { color: #ff3366; }
.text-danger { color: #ff3366; }
.text-warn { color: #ff9100; }

.mono { font-family: var(--text-mono); }
</style>
