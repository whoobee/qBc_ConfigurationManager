<template>
  <div class="motor-vector">
    <div class="tof-row">
      <div class="tof-cell">
        <span class="tof-arrow">&#9650;</span>
        <span class="tof-label mono">FRONT TOF</span>
        <span class="tof-value mono" :class="tofClass(tof.front_mm)">
          {{ formatTof(tof.front_mm) }}
        </span>
      </div>
      <div class="tof-cell">
        <span class="tof-arrow">&#9660;</span>
        <span class="tof-label mono">BACK TOF</span>
        <span class="tof-value mono" :class="tofClass(tof.back_mm)">
          {{ formatTof(tof.back_mm) }}
        </span>
      </div>
    </div>

    <canvas ref="canvas" width="240" height="240" class="vector-canvas"></canvas>
    <div class="motor-stats">
      <div class="stat-row">
        <span class="stat-label">L</span>
        <span class="stat-value mono" :class="rpmClass(motor.left_vel)">
          {{ motor.left_vel?.toFixed(1) || '0.0' }} RPM
        </span>
      </div>
      <div class="stat-row">
        <span class="stat-label">R</span>
        <span class="stat-value mono" :class="rpmClass(motor.right_vel)">
          {{ motor.right_vel?.toFixed(1) || '0.0' }} RPM
        </span>
      </div>
      <div class="stat-row">
        <span class="stat-label">SPD</span>
        <span class="stat-value mono">
          {{ motor.speed_magnitude?.toFixed(1) || '0.0' }} RPM
        </span>
      </div>
      <div class="stat-row">
        <span class="stat-label">DIR</span>
        <span class="stat-value mono">
          {{ motor.direction_deg?.toFixed(1) || '0.0' }}&deg;
        </span>
      </div>
      <div class="stat-row">
        <span class="stat-label">NECK</span>
        <span class="stat-value mono">
          {{ motor.neck_deg?.toFixed(1) || '0.0' }}&deg;
        </span>
      </div>
      <div class="stat-row stat-row--desc">
        <span class="stat-desc mono">{{ motor.description || 'stopped' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'

const props = defineProps({
  motor: { type: Object, default: () => ({}) },
  tof: { type: Object, default: () => ({}) },
})

function formatTof(mm) {
  if (mm == null || mm <= 0) return '-- mm'
  return `${Math.round(mm)} mm`
}

function tofClass(mm) {
  if (mm == null || mm <= 0) return 'tof--idle'
  if (mm < 200) return 'tof--danger'
  if (mm < 400) return 'tof--warn'
  return 'tof--ok'
}

const canvas = ref(null)

function rpmClass(val) {
  if (!val || Math.abs(val) < 0.5) return ''
  return val > 0 ? 'text-forward' : 'text-reverse'
}

function drawVector() {
  const cvs = canvas.value
  if (!cvs) return
  const ctx = cvs.getContext('2d')
  const w = cvs.width
  const h = cvs.height
  const cx = w / 2
  const cy = h / 2
  const radius = 80

  ctx.clearRect(0, 0, w, h)

  // Background circle (robot body, top-down view)
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(0, 176, 255, 0.2)'
  ctx.lineWidth = 2
  ctx.stroke()

  // Cross-hair at center
  ctx.beginPath()
  ctx.moveTo(cx - 8, cy)
  ctx.lineTo(cx + 8, cy)
  ctx.moveTo(cx, cy - 8)
  ctx.lineTo(cx, cy + 8)
  ctx.strokeStyle = 'rgba(144, 164, 174, 0.3)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Direction labels
  ctx.fillStyle = 'rgba(144, 164, 174, 0.4)'
  ctx.font = '10px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('FWD', cx, cy - radius - 8)
  ctx.fillText('BWD', cx, cy + radius + 14)

  // Velocity arrow
  const speed = props.motor.speed_magnitude || 0
  const dirDeg = props.motor.direction_deg || 0
  if (speed > 0.5) {
    const dirRad = (-dirDeg + 90) * Math.PI / 180  // Convert: 0=forward=up
    const arrowLen = Math.min(speed / 30 * radius, radius)  // Scale to MAX_RPM=30
    const ax = cx + Math.cos(dirRad) * arrowLen
    const ay = cy - Math.sin(dirRad) * arrowLen

    // Arrow shaft
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(ax, ay)
    ctx.strokeStyle = '#00e676'
    ctx.lineWidth = 3
    ctx.stroke()

    // Arrow head
    const headLen = 10
    const angle = Math.atan2(cy - ay, ax - cx)
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(
      ax - headLen * Math.cos(angle - 0.4),
      ay + headLen * Math.sin(angle - 0.4),
    )
    ctx.moveTo(ax, ay)
    ctx.lineTo(
      ax - headLen * Math.cos(angle + 0.4),
      ay + headLen * Math.sin(angle + 0.4),
    )
    ctx.strokeStyle = '#00e676'
    ctx.lineWidth = 2
    ctx.stroke()
  }

  // Neck angle indicator
  const neckDeg = props.motor.neck_deg || 0
  if (Math.abs(neckDeg) > 0.5) {
    const neckRad = (-neckDeg) * Math.PI / 180  // Positive = right, but draw as deviation from forward
    const neckLen = radius * 0.6
    const nx = cx + Math.sin(neckRad) * neckLen  // sin because neck pans left/right
    const ny = cy - Math.cos(neckRad) * neckLen  // cos for forward axis

    // Neck line (camera look direction)
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(nx, ny)
    ctx.strokeStyle = 'rgba(255, 214, 0, 0.7)'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 4])
    ctx.stroke()
    ctx.setLineDash([])

    // Camera icon at end
    ctx.beginPath()
    ctx.arc(nx, ny, 5, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 214, 0, 0.8)'
    ctx.fill()
  }

  // Wheel indicators (left and right)
  const wheelWidth = 8
  const wheelHeight = 24
  const leftRpm = props.motor.left_vel || 0
  const rightRpm = props.motor.right_vel || 0

  // Left wheel
  drawWheel(ctx, cx - radius - 12, cy, wheelWidth, wheelHeight, leftRpm)
  // Right wheel
  drawWheel(ctx, cx + radius + 4, cy, wheelWidth, wheelHeight, rightRpm)
}

function drawWheel(ctx, x, y, w, h, rpm) {
  // Wheel body
  ctx.fillStyle = Math.abs(rpm) > 0.5
    ? (rpm > 0 ? 'rgba(0, 230, 118, 0.6)' : 'rgba(255, 51, 102, 0.6)')
    : 'rgba(144, 164, 174, 0.3)'
  ctx.fillRect(x, y - h / 2, w, h)

  // Speed indicator arrow on wheel
  if (Math.abs(rpm) > 0.5) {
    const arrowDir = rpm > 0 ? -1 : 1  // Negative y = forward
    const arrowLen = Math.min(Math.abs(rpm) / 30 * (h / 2), h / 2)
    ctx.beginPath()
    ctx.moveTo(x + w / 2, y)
    ctx.lineTo(x + w / 2, y + arrowDir * arrowLen)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()
  }
}

watch(() => props.motor, drawVector, { deep: true })
onMounted(drawVector)
</script>

<style scoped>
.motor-vector {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto 1fr;
  column-gap: 16px;
  row-gap: 10px;
  align-items: center;
}

.tof-row {
  grid-column: 1 / -1;
  display: flex;
  gap: 12px;
  width: 100%;
}

.tof-cell {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
}

.tof-arrow {
  font-size: 0.7rem;
  color: var(--text-dim);
}

.tof-label {
  font-size: 0.6rem;
  color: var(--text-dim);
  letter-spacing: 1px;
}

.tof-value {
  margin-left: auto;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-primary);
}
.tof-value.tof--ok { color: #00e676; }
.tof-value.tof--warn { color: #ffd600; }
.tof-value.tof--danger { color: #ff3366; text-shadow: 0 0 6px rgba(255, 51, 102, 0.4); }
.tof-value.tof--idle { color: var(--text-dim); }

.vector-canvas {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-elevated);
  flex-shrink: 0;
}

.motor-stats {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.stat-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-row--desc {
  margin-top: 4px;
}

.stat-label {
  font-family: var(--text-mono);
  font-size: 0.65rem;
  color: var(--text-dim);
  letter-spacing: 1px;
  width: 36px;
  text-align: right;
}

.stat-value {
  font-size: 0.85rem;
  color: var(--text-primary);
}

.stat-desc {
  font-size: 0.75rem;
  color: var(--glow-primary);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.text-forward { color: #00e676; }
.text-reverse { color: #ff3366; }
</style>
