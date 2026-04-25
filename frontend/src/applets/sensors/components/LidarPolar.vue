<template>
  <div class="lidar-wrap">
    <canvas ref="canvas" class="lidar-canvas" width="420" height="420"></canvas>
    <div class="lidar-info">
      <div class="row"><span class="k">Bins</span><span class="v mono">{{ bins.length }}</span></div>
      <div class="row"><span class="k">Resolution</span><span class="v mono">{{ scan.bin_deg || 10 }}&deg;</span></div>
      <div class="row"><span class="k">Nearest</span><span class="v mono">{{ nearestText }}</span></div>
      <div class="row"><span class="k">Farthest</span><span class="v mono">{{ farthestText }}</span></div>
      <div class="row"><span class="k">Range</span>
        <select v-model.number="maxRangeMm" class="range-sel mono">
          <option :value="400">0.4 m</option>
          <option :value="1000">1 m</option>
          <option :value="2000">2 m</option>
          <option :value="5000">5 m</option>
          <option :value="10000">10 m</option>
        </select>
      </div>

      <div class="legend">
        <div class="legend-item"><span class="sw sw-near"></span> near</div>
        <div class="legend-item"><span class="sw sw-mid"></span> mid</div>
        <div class="legend-item"><span class="sw sw-far"></span> far</div>
        <div class="legend-item"><span class="sw sw-none"></span> no return</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'

const props = defineProps({
  scan: { type: Object, default: () => ({ bins_mm: [], bin_deg: 10 }) },
})

const maxRangeMm = ref(400)
const canvas = ref(null)

const bins = computed(() => {
  const b = props.scan?.bins_mm
  return Array.isArray(b) ? b : []
})

const validBins = computed(() => bins.value.filter(x => x > 0))
const nearestText = computed(() => validBins.value.length ? `${Math.min(...validBins.value)} mm` : '—')
const farthestText = computed(() => validBins.value.length ? `${Math.max(...validBins.value)} mm` : '—')

function colorForDist(d) {
  if (d <= 0) return 'rgba(96, 125, 139, 0.25)'   // no return
  const t = Math.min(1, d / maxRangeMm.value)
  // green (near) -> yellow (mid) -> cyan (far)
  if (t < 0.5) {
    // 0..0.5: #ff3366 (danger) to #ffd600 (warn)
    const k = t / 0.5
    const r = Math.round(255)
    const g = Math.round(51 + (214 - 51) * k)
    const b = Math.round(102 * (1 - k))
    return `rgb(${r},${g},${b})`
  } else {
    // 0.5..1: #ffd600 (warn) to #00b0ff (far)
    const k = (t - 0.5) / 0.5
    const r = Math.round(255 * (1 - k))
    const g = Math.round(214 + (176 - 214) * k)
    const b = Math.round(0 + 255 * k)
    return `rgb(${r},${g},${b})`
  }
}

function draw() {
  const cvs = canvas.value
  if (!cvs) return
  const ctx = cvs.getContext('2d')
  const w = cvs.width, h = cvs.height
  const cx = w / 2, cy = h / 2
  const r = Math.min(cx, cy) - 12

  ctx.clearRect(0, 0, w, h)

  // Concentric range rings at 25/50/75/100% of max range
  ctx.strokeStyle = 'rgba(144, 164, 174, 0.2)'
  ctx.lineWidth = 1
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath()
    ctx.arc(cx, cy, (r * i) / 4, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Axis cross
  ctx.beginPath()
  ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy)
  ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r)
  ctx.strokeStyle = 'rgba(144, 164, 174, 0.15)'
  ctx.stroke()

  // Range labels (top axis = front)
  ctx.fillStyle = 'rgba(144, 164, 174, 0.5)'
  ctx.font = '9px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  for (let i = 1; i <= 4; i++) {
    const mm = (maxRangeMm.value * i) / 4
    const label = mm >= 1000 ? `${(mm / 1000).toFixed(1)}m` : `${Math.round(mm)}mm`
    ctx.fillText(label, cx + 2, cy - (r * i) / 4)
  }

  // Cardinal labels (lidar frame: 0° = front = up)
  ctx.fillStyle = 'rgba(144, 164, 174, 0.8)'
  ctx.font = '11px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('FRONT', cx, cy - r - 4)
  ctx.fillText('BACK',  cx, cy + r + 6)
  ctx.textAlign = 'left'
  ctx.fillText('L', cx - r - 8, cy)
  ctx.textAlign = 'right'
  ctx.fillText('R', cx + r + 8, cy)

  // Draw bins as pie wedges.
  // Convention: bin i covers [i*10, (i+1)*10) degrees CCW from FRONT.
  // Canvas angle 0 = +x (right); front is "up" = -π/2.
  const bd = (props.scan?.bin_deg || 10) * Math.PI / 180
  for (let i = 0; i < bins.value.length; i++) {
    const dist = bins.value[i]
    const t = dist > 0 ? Math.min(1, dist / maxRangeMm.value) : 0
    const wedgeR = dist > 0 ? r * t : r * 0.04  // empty bins show a thin nub at center
    const a0 = -Math.PI / 2 - i * bd - bd   // CCW: subtract
    const a1 = a0 + bd
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, wedgeR, a0, a1)
    ctx.closePath()
    ctx.fillStyle = colorForDist(dist)
    ctx.fill()
    // Thin outline for separation
    ctx.strokeStyle = 'rgba(10, 14, 20, 0.6)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // Center dot (robot)
  ctx.beginPath()
  ctx.arc(cx, cy, 4, 0, Math.PI * 2)
  ctx.fillStyle = '#00e676'
  ctx.fill()
}

watch(() => props.scan, draw, { deep: true })
watch(maxRangeMm, draw)
onMounted(draw)
</script>

<style scoped>
.lidar-wrap {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.lidar-canvas {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-elevated);
  flex-shrink: 0;
}

.lidar-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 140px;
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
}

.k {
  color: var(--text-dim);
  font-size: 0.7rem;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.v { color: var(--text-primary); }

.range-sel {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.75rem;
}

.legend {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.7rem;
  color: var(--text-dim);
}

.legend-item { display: flex; align-items: center; gap: 6px; }

.sw {
  display: inline-block;
  width: 14px;
  height: 8px;
  border-radius: 2px;
}
.sw-near { background: #ff3366; }
.sw-mid  { background: #ffd600; }
.sw-far  { background: #00b0ff; }
.sw-none { background: rgba(96, 125, 139, 0.4); }

.mono { font-family: var(--text-mono); }
</style>
