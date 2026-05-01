<template>
  <div class="ts-chart">
    <canvas
      ref="canvas"
      class="ts-canvas"
      @mousemove="onHover"
      @mouseleave="hover = null"
    ></canvas>
    <div class="ts-legend">
      <span
        v-for="s in series"
        :key="s.name"
        class="ts-leg-item"
        :style="{ '--c': s.color }"
      >
        <span class="ts-dot"></span>
        <span class="ts-name">{{ s.name }}</span>
        <span class="ts-val mono">
          {{ formatLatest(s) }}<span v-if="unit" class="ts-unit">{{ unit }}</span>
        </span>
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps({
  series: { type: Array, default: () => [] },   // [{ name, color, data:[{t,v}] }]
  windowMs: { type: Number, default: 30000 },
  unit: { type: String, default: '' },
  decimals: { type: Number, default: 1 },
  yMin: { type: Number, default: null },
  yMax: { type: Number, default: null },
  height: { type: Number, default: 140 },
})

const canvas = ref(null)
const hover = ref(null)
let raf = null
let ro = null

function formatLatest(s) {
  if (!s.data || !s.data.length) return '—'
  const v = s.data[s.data.length - 1].v
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return Number(v).toFixed(props.decimals)
}

function fitDpr() {
  const cvs = canvas.value
  if (!cvs) return
  const rect = cvs.getBoundingClientRect()
  const dpr = Math.max(1, window.devicePixelRatio || 1)
  cvs.width = Math.round(rect.width * dpr)
  cvs.height = Math.round(props.height * dpr)
  cvs.style.height = props.height + 'px'
  const ctx = cvs.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { ctx, w: rect.width, h: props.height }
}

function computeYRange() {
  if (props.yMin !== null && props.yMax !== null) {
    return { yMin: props.yMin, yMax: props.yMax }
  }
  let lo = Infinity, hi = -Infinity
  for (const s of props.series) {
    for (const p of s.data) {
      if (p.v < lo) lo = p.v
      if (p.v > hi) hi = p.v
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    return { yMin: 0, yMax: 1 }
  }
  if (lo === hi) { lo -= 1; hi += 1 }
  const pad = (hi - lo) * 0.15
  return {
    yMin: props.yMin !== null ? props.yMin : lo - pad,
    yMax: props.yMax !== null ? props.yMax : hi + pad,
  }
}

function draw() {
  const fit = fitDpr()
  if (!fit) return
  const { ctx, w, h } = fit
  ctx.clearRect(0, 0, w, h)

  const padL = 38, padR = 6, padT = 6, padB = 16
  const innerW = Math.max(1, w - padL - padR)
  const innerH = Math.max(1, h - padT - padB)
  const tNow = Date.now()
  const tStart = tNow - props.windowMs
  const { yMin, yMax } = computeYRange()
  const yRange = (yMax - yMin) || 1

  ctx.strokeStyle = 'rgba(144,164,174,0.12)'
  ctx.lineWidth = 1
  ctx.font = '9px monospace'
  ctx.fillStyle = 'rgba(144,164,174,0.6)'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let i = 0; i <= 4; i++) {
    const y = padT + (innerH * i) / 4
    ctx.beginPath()
    ctx.moveTo(padL, y)
    ctx.lineTo(padL + innerW, y)
    ctx.stroke()
    const val = yMax - (yRange * i) / 4
    ctx.fillText(val.toFixed(props.decimals), padL - 4, y)
  }

  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (let i = 0; i <= 4; i++) {
    const x = padL + (innerW * i) / 4
    ctx.fillStyle = 'rgba(144,164,174,0.5)'
    const sec = -((4 - i) * props.windowMs) / 4 / 1000
    ctx.fillText(sec === 0 ? 'now' : `${sec.toFixed(0)}s`, x, padT + innerH + 2)
  }

  for (const s of props.series) {
    if (!s.data || s.data.length < 2) continue
    ctx.strokeStyle = s.color
    ctx.lineWidth = 1.5
    ctx.beginPath()
    let first = true
    for (const p of s.data) {
      if (p.t < tStart) continue
      const x = padL + ((p.t - tStart) / props.windowMs) * innerW
      const yNorm = (p.v - yMin) / yRange
      const y = padT + innerH - yNorm * innerH
      if (first) { ctx.moveTo(x, y); first = false }
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  if (hover.value) {
    const x = hover.value.x
    if (x >= padL && x <= padL + innerW) {
      ctx.strokeStyle = 'rgba(0,176,255,0.4)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, padT)
      ctx.lineTo(x, padT + innerH)
      ctx.stroke()
    }
  }
}

function onHover(e) {
  const rect = canvas.value.getBoundingClientRect()
  hover.value = { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function loop() {
  draw()
  raf = requestAnimationFrame(loop)
}

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => draw())
    ro.observe(canvas.value)
  }
  loop()
})

onUnmounted(() => {
  if (raf) cancelAnimationFrame(raf)
  if (ro) ro.disconnect()
})

watch(() => props.height, () => draw())
</script>

<style scoped>
.ts-chart {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ts-canvas {
  width: 100%;
  display: block;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-elevated);
}

.ts-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 18px;
  font-size: 0.7rem;
  color: var(--text-dim);
  letter-spacing: 0.5px;
}

.ts-leg-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.ts-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--c);
  box-shadow: 0 0 4px var(--c);
}

.ts-name {
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-dim);
}

.ts-val {
  color: var(--text-primary);
  font-family: var(--text-mono);
  margin-left: 2px;
}

.ts-unit {
  color: var(--text-dim);
  margin-left: 2px;
}

.mono { font-family: var(--text-mono); }
</style>
