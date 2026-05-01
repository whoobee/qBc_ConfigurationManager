<template>
  <div class="joystick-wrap">
    <!-- Arming button -->
    <button
      class="arm-btn"
      :class="{ 'arm-btn--armed': armed }"
      @click="toggleArm"
    >
      <span class="arm-dot"></span>
      {{ armed ? 'ARMED' : 'DISARMED — click to arm' }}
    </button>

    <div
      class="joystick"
      :class="{ 'joystick--disarmed': !armed }"
      ref="pad"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @pointerleave="onUp"
    >
      <div class="ring ring--outer"></div>
      <div class="ring ring--inner"></div>
      <div class="axis axis--x"></div>
      <div class="axis axis--y"></div>
      <div
        class="thumb"
        :class="{ 'thumb--active': active, 'thumb--disarmed': !armed }"
        :style="thumbStyle"
      ></div>
    </div>

    <!-- Speed slider -->
    <div class="speed-row">
      <span class="speed-lbl mono">SPEED</span>
      <input
        type="range"
        class="speed-slider"
        :min="MIN_SPEED"
        :max="MAX_SPEED"
        step="1"
        v-model.number="maxSpeed"
      />
      <span class="speed-val mono">{{ maxSpeed }} rpm</span>
    </div>

    <div class="joy-readout mono">
      <div><span class="lbl">L</span><span class="val" :class="rpmClass(left)">{{ left.toFixed(0) }}</span></div>
      <div><span class="lbl">R</span><span class="val" :class="rpmClass(right)">{{ right.toFixed(0) }}</span></div>
    </div>

    <div class="joy-help mono">
      <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> drive
      &nbsp;·&nbsp; <kbd>R</kbd>/<kbd>T</kbd> speed &minus;/+
      &nbsp;·&nbsp; <kbd>Space</kbd> stop
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps({
  initialMaxRpm: { type: Number, default: 25 },
  publishHz: { type: Number, default: 20 },
  maxRpmCap: { type: Number, default: 80 },
})
const emit = defineEmits(['drive'])

const MIN_SPEED = 5
const MAX_SPEED = props.maxRpmCap
const SPEED_STEP = 5

const armed = ref(false)
const maxSpeed = ref(props.initialMaxRpm)

const pad = ref(null)
const active = ref(false)

// Normalised stick position: x ∈ [-1, 1] (right), y ∈ [-1, 1] (up = forward)
const sx = ref(0)
const sy = ref(0)

// Keys held (set of 'w'/'a'/'s'/'d')
const keys = new Set()

const thumbStyle = computed(() => {
  const r = 60 // travel radius in px
  return {
    transform: `translate(-50%, -50%) translate(${sx.value * r}px, ${-sy.value * r}px)`,
  }
})

const left = computed(() => {
  const fwd = sy.value * maxSpeed.value
  const turn = sx.value * maxSpeed.value
  return clamp(fwd + turn, -maxSpeed.value, maxSpeed.value)
})
const right = computed(() => {
  const fwd = sy.value * maxSpeed.value
  const turn = sx.value * maxSpeed.value
  return clamp(fwd - turn, -maxSpeed.value, maxSpeed.value)
})

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

function rpmClass(v) {
  if (Math.abs(v) < 0.5) return ''
  return v > 0 ? 'forward' : 'reverse'
}

function toggleArm() {
  armed.value = !armed.value
  if (!armed.value) {
    // Disarming — zero stick and force a stop on the next publish tick
    keys.clear()
    sx.value = 0
    sy.value = 0
    emit('drive', { left_vel: 0, right_vel: 0 })
    lastSent = { l: 0, r: 0 }
  }
}

// ── Pointer handling ──
let pointerId = null

function setStickFromEvent(ev) {
  const rect = pad.value.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const r = Math.min(rect.width, rect.height) / 2 - 12
  let dx = (ev.clientX - cx) / r
  let dy = (cy - ev.clientY) / r
  // Clamp to unit circle
  const m = Math.sqrt(dx * dx + dy * dy)
  if (m > 1) { dx /= m; dy /= m }
  sx.value = dx
  sy.value = dy
}

function onDown(ev) {
  if (!armed.value) return
  pad.value.setPointerCapture(ev.pointerId)
  pointerId = ev.pointerId
  active.value = true
  setStickFromEvent(ev)
}
function onMove(ev) {
  if (pointerId !== ev.pointerId) return
  setStickFromEvent(ev)
}
function onUp(ev) {
  if (pointerId !== ev.pointerId && pointerId !== null) return
  pointerId = null
  active.value = false
  if (keys.size === 0) {
    sx.value = 0
    sy.value = 0
  } else {
    applyKeys()
  }
}

// ── Keyboard handling ──
function applyKeys() {
  let x = 0
  let y = 0
  if (keys.has('w')) y += 1
  if (keys.has('s')) y -= 1
  if (keys.has('d')) x += 1
  if (keys.has('a')) x -= 1
  // Normalise diagonal
  const m = Math.sqrt(x * x + y * y)
  if (m > 1) { x /= m; y /= m }
  sx.value = x
  sy.value = y
}

function bumpSpeed(delta) {
  const next = clamp(maxSpeed.value + delta, MIN_SPEED, MAX_SPEED)
  maxSpeed.value = Math.round(next)
}

function onKeyDown(ev) {
  // Don't capture if user is typing in a field
  const tag = ev.target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || ev.target?.isContentEditable) return

  const k = ev.key.toLowerCase()

  // Speed bumps work whether armed or not — they're harmless
  if (k === 'r') { bumpSpeed(-SPEED_STEP); ev.preventDefault(); return }
  if (k === 't') { bumpSpeed(+SPEED_STEP); ev.preventDefault(); return }

  if (!armed.value) return

  if (k === ' ') {
    keys.clear()
    sx.value = 0
    sy.value = 0
    ev.preventDefault()
    return
  }
  if (!['w', 'a', 's', 'd'].includes(k)) return
  if (active.value) return // pointer takes precedence
  ev.preventDefault()
  if (keys.has(k)) return
  keys.add(k)
  applyKeys()
}

function onKeyUp(ev) {
  const k = ev.key.toLowerCase()
  if (!['w', 'a', 's', 'd'].includes(k)) return
  keys.delete(k)
  if (active.value) return
  applyKeys()
}

// ── Throttled publish ──
let publishTimer = null
let lastSent = { l: 0, r: 0 }

function tickPublish() {
  if (!armed.value) {
    // While disarmed, make sure we never leak a non-zero command
    if (lastSent.l !== 0 || lastSent.r !== 0) {
      emit('drive', { left_vel: 0, right_vel: 0 })
      lastSent = { l: 0, r: 0 }
    }
    return
  }
  const l = Math.round(left.value)
  const r = Math.round(right.value)
  if (l !== lastSent.l || r !== lastSent.r) {
    emit('drive', { left_vel: l, right_vel: r })
    lastSent = { l, r }
  }
}

// If the user lowers max speed while driving, scale current output down
watch(maxSpeed, () => { /* reactive recompute via computed left/right */ })

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  publishTimer = setInterval(tickPublish, Math.round(1000 / props.publishHz))
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  if (publishTimer) clearInterval(publishTimer)
  if (lastSent.l !== 0 || lastSent.r !== 0) {
    emit('drive', { left_vel: 0, right_vel: 0 })
  }
})
</script>

<style scoped>
.joystick-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  user-select: none;
}

.arm-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: rgba(255, 51, 102, 0.10);
  color: #ff3366;
  border: 1px solid rgba(255, 51, 102, 0.5);
  border-radius: 6px;
  font-family: var(--text-mono);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.arm-btn:hover { background: rgba(255, 51, 102, 0.18); }
.arm-btn--armed {
  background: rgba(0, 230, 118, 0.12);
  color: #00e676;
  border-color: rgba(0, 230, 118, 0.55);
  box-shadow: 0 0 10px rgba(0, 230, 118, 0.25);
}
.arm-btn--armed:hover { background: rgba(0, 230, 118, 0.2); }
.arm-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 6px currentColor;
}

.joystick {
  position: relative;
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: radial-gradient(circle at center, var(--bg-elevated), var(--bg-card));
  border: 1px solid var(--border-subtle);
  cursor: grab;
  touch-action: none;
}
.joystick:active { cursor: grabbing; }
.joystick--disarmed {
  cursor: not-allowed;
  opacity: 0.55;
}

.ring {
  position: absolute;
  border-radius: 50%;
  border: 1px dashed rgba(0, 176, 255, 0.25);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.ring--outer { width: 90%; height: 90%; }
.ring--inner { width: 35%; height: 35%; opacity: 0.5; }

.axis {
  position: absolute;
  background: rgba(0, 176, 255, 0.18);
  pointer-events: none;
}
.axis--x { top: 50%; left: 8%; width: 84%; height: 1px; }
.axis--y { left: 50%; top: 8%; width: 1px; height: 84%; }

.thumb {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #4ad0ff, #00b0ff 60%, #006799);
  border: 2px solid #00d4ff;
  box-shadow: 0 0 12px rgba(0, 212, 255, 0.45);
  transition: transform 0.12s ease-out;
  pointer-events: none;
}
.thumb--active {
  transition: none;
  box-shadow: 0 0 18px rgba(0, 212, 255, 0.7);
}
.thumb--disarmed {
  filter: grayscale(0.6);
  box-shadow: none;
}

.speed-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: 220px;
}
.speed-lbl {
  font-size: 0.62rem;
  color: var(--text-dim);
  letter-spacing: 1px;
}
.speed-slider {
  width: 100%;
  accent-color: var(--glow-primary, #00b0ff);
}
.speed-val {
  font-size: 0.72rem;
  color: var(--glow-primary);
  text-align: right;
  min-width: 56px;
}

.joy-readout {
  display: flex;
  gap: 18px;
  font-size: 0.78rem;
}
.joy-readout .lbl {
  color: var(--text-dim);
  margin-right: 6px;
  letter-spacing: 1px;
}
.joy-readout .val { color: var(--text-bright); }
.joy-readout .val.forward { color: #00e676; }
.joy-readout .val.reverse { color: #ff3366; }

.joy-help {
  font-size: 0.62rem;
  color: var(--text-dim);
  letter-spacing: 0.5px;
  text-align: center;
  line-height: 1.5;
}
.joy-help kbd {
  display: inline-block;
  padding: 1px 5px;
  margin: 0 1px;
  font-size: 0.58rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 3px;
  color: var(--text-primary);
}
</style>
