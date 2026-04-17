<template>
  <div class="imu-panel">
    <!-- Top-down heading dial -->
    <div class="imu-dial">
      <canvas ref="canvas" width="160" height="160"></canvas>
    </div>

    <!-- Stats column -->
    <div class="imu-stats">
      <div class="group">
        <div class="group-label">Orientation</div>
        <div class="row"><span class="k">Roll</span>  <span class="v mono">{{ fmt(imu.roll) }}&deg;</span></div>
        <div class="row"><span class="k">Pitch</span> <span class="v mono">{{ fmt(imu.pitch) }}&deg;</span></div>
        <div class="row"><span class="k">Yaw</span>   <span class="v mono">{{ fmt(imu.yaw) }}&deg;</span></div>
      </div>

      <div class="group">
        <div class="group-label">Quaternion</div>
        <div class="quat-grid mono">
          <span class="k">w</span><span>{{ fmt(imu.qw, 3) }}</span>
          <span class="k">x</span><span>{{ fmt(imu.qx, 3) }}</span>
          <span class="k">y</span><span>{{ fmt(imu.qy, 3) }}</span>
          <span class="k">z</span><span>{{ fmt(imu.qz, 3) }}</span>
        </div>
      </div>

      <div class="group">
        <div class="group-label">Lin. Acceleration (m/s&sup2;)</div>
        <div class="accel">
          <AccelAxis label="X" :value="imu.ax" />
          <AccelAxis label="Y" :value="imu.ay" />
          <AccelAxis label="Z" :value="imu.az" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, h } from 'vue'

const props = defineProps({
  imu: { type: Object, default: () => ({}) },
})

const canvas = ref(null)

function fmt(v, digits = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return Number(v).toFixed(digits)
}

// Small inline component for accel bars
const AccelAxis = {
  props: ['label', 'value'],
  setup(p) {
    const MAX = 12  // ±12 m/s²
    return () => {
      const v = Number(p.value) || 0
      const pct = Math.max(-100, Math.min(100, (v / MAX) * 100))
      const sign = v >= 0 ? 'pos' : 'neg'
      return h('div', { class: 'accel-row' }, [
        h('span', { class: 'k' }, p.label),
        h('div', { class: 'accel-track' }, [
          h('div', { class: `accel-fill accel-fill--${sign}`, style: { width: Math.abs(pct) + '%' } }),
        ]),
        h('span', { class: 'v mono' }, fmt(v, 2)),
      ])
    }
  },
}

function drawDial() {
  const cvs = canvas.value
  if (!cvs) return
  const ctx = cvs.getContext('2d')
  const w = cvs.width
  const h = cvs.height
  const cx = w / 2, cy = h / 2
  const r = Math.min(cx, cy) - 8

  ctx.clearRect(0, 0, w, h)

  // Outer ring
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(0, 176, 255, 0.25)'
  ctx.lineWidth = 2
  ctx.stroke()

  // Ticks every 30°
  ctx.strokeStyle = 'rgba(144, 164, 174, 0.35)'
  ctx.lineWidth = 1
  for (let i = 0; i < 12; i++) {
    const a = (i * 30 - 90) * Math.PI / 180
    const r1 = r - (i % 3 === 0 ? 10 : 5)
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
    ctx.stroke()
  }

  // Cardinal labels
  ctx.fillStyle = 'rgba(144, 164, 174, 0.6)'
  ctx.font = '9px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('N', cx, cy - r + 6)
  ctx.fillText('E', cx + r - 6, cy)
  ctx.fillText('S', cx, cy + r - 6)
  ctx.fillText('W', cx - r + 6, cy)

  // Heading arrow (yaw)
  const yaw = Number(props.imu.yaw) || 0
  const ang = (-yaw - 90) * Math.PI / 180  // yaw positive CCW, 0 = north
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(ang) * (r - 14), cy + Math.sin(ang) * (r - 14))
  ctx.strokeStyle = '#00e676'
  ctx.lineWidth = 3
  ctx.stroke()

  // Arrow head
  const hx = cx + Math.cos(ang) * (r - 14)
  const hy = cy + Math.sin(ang) * (r - 14)
  const headLen = 9
  ctx.beginPath()
  ctx.moveTo(hx, hy)
  ctx.lineTo(hx - headLen * Math.cos(ang - 0.4), hy - headLen * Math.sin(ang - 0.4))
  ctx.moveTo(hx, hy)
  ctx.lineTo(hx - headLen * Math.cos(ang + 0.4), hy - headLen * Math.sin(ang + 0.4))
  ctx.strokeStyle = '#00e676'
  ctx.lineWidth = 2
  ctx.stroke()

  // Center hub
  ctx.beginPath()
  ctx.arc(cx, cy, 3, 0, Math.PI * 2)
  ctx.fillStyle = '#00e676'
  ctx.fill()

  // Roll/pitch dot (tilt indicator) — offset from center based on roll/pitch
  const roll = Number(props.imu.roll) || 0
  const pitch = Number(props.imu.pitch) || 0
  const tiltR = r * 0.55
  const dx = Math.max(-tiltR, Math.min(tiltR, (roll / 90) * tiltR))
  const dy = Math.max(-tiltR, Math.min(tiltR, (pitch / 90) * tiltR))
  ctx.beginPath()
  ctx.arc(cx + dx, cy + dy, 4, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 214, 0, 0.85)'
  ctx.fill()
}

watch(() => props.imu, drawDial, { deep: true })
onMounted(drawDial)
</script>

<style scoped>
.imu-panel {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.imu-dial canvas {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-elevated);
  flex-shrink: 0;
}

.imu-stats {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.group-label {
  font-size: 0.65rem;
  color: var(--text-dim);
  letter-spacing: 1.2px;
  text-transform: uppercase;
  margin-bottom: 2px;
}

.row {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
}

.k {
  color: var(--text-dim);
  font-size: 0.7rem;
  letter-spacing: 1px;
}

.v { color: var(--text-primary); }

.quat-grid {
  display: grid;
  grid-template-columns: auto 1fr auto 1fr;
  gap: 4px 8px;
  font-size: 0.8rem;
  color: var(--text-primary);
}

.accel {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.accel :deep(.accel-row) {
  display: grid;
  grid-template-columns: 24px 1fr 54px;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
}
.accel :deep(.accel-track) {
  height: 6px;
  background: rgba(255,255,255,0.05);
  border-radius: 3px;
  overflow: hidden;
  position: relative;
}
.accel :deep(.accel-fill) {
  height: 100%;
}
.accel :deep(.accel-fill--pos) { background: #00e676; }
.accel :deep(.accel-fill--neg) { background: #ff3366; }

.mono { font-family: var(--text-mono); }
</style>
