<template>
  <div class="motor-controls" :class="{ disabled: !armed }">
    <div class="motor-row">
      <label class="mname">Left</label>
      <input
        type="range"
        class="slider"
        :min="-MAX_RPM"
        :max="MAX_RPM"
        step="1"
        v-model.number="left"
        :disabled="!armed"
        @input="onInput"
        @change="onChange"
        @mouseup="onRelease"
        @touchend="onRelease"
      />
      <span class="val mono" :class="rpmClass(left)">{{ left }} rpm</span>
    </div>

    <div class="motor-row">
      <label class="mname">Right</label>
      <input
        type="range"
        class="slider"
        :min="-MAX_RPM"
        :max="MAX_RPM"
        step="1"
        v-model.number="right"
        :disabled="!armed"
        @input="onInput"
        @change="onChange"
        @mouseup="onRelease"
        @touchend="onRelease"
      />
      <span class="val mono" :class="rpmClass(right)">{{ right }} rpm</span>
    </div>

    <div class="motor-actions">
      <button class="stop-btn" @click="stop">STOP</button>
      <label class="linked">
        <input type="checkbox" v-model="linked" />
        <span>Link L / R</span>
      </label>
      <label class="release-auto">
        <input type="checkbox" v-model="releaseToZero" />
        <span>Auto-zero on release</span>
      </label>
      <div class="range-hint mono">range: &plusmn;{{ MAX_RPM }} rpm</div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

defineProps({ armed: { type: Boolean, default: false } })
const emit = defineEmits(['send'])

// DDSM210 drive wheels — chosen range keeps manual control safe for bench driving.
const MAX_RPM = 150

const left = ref(0)
const right = ref(0)
const linked = ref(false)
const releaseToZero = ref(true)

// Linked mode — mirror one slider to the other.
let linking = false
watch(left, (v) => {
  if (!linked.value || linking) return
  linking = true
  right.value = v
  linking = false
})
watch(right, (v) => {
  if (!linked.value || linking) return
  linking = true
  left.value = v
  linking = false
})

// Throttle `input` events to ~20 Hz to avoid spamming the bridge.
let throttleTimer = null
let pendingSend = false
function onInput() {
  if (throttleTimer) { pendingSend = true; return }
  send()
  throttleTimer = setTimeout(() => {
    throttleTimer = null
    if (pendingSend) { pendingSend = false; send() }
  }, 50)
}

function onChange() { send() }

function onRelease() {
  if (releaseToZero.value) {
    left.value = 0
    right.value = 0
    send()
  }
}

function send() {
  emit('send', { left_vel: left.value, right_vel: right.value })
}

function stop() {
  left.value = 0
  right.value = 0
  emit('send', { left_vel: 0, right_vel: 0 })
}

function rpmClass(v) {
  if (!v) return ''
  return v > 0 ? 'forward' : 'reverse'
}
</script>

<style scoped>
.motor-controls.disabled {
  opacity: 0.55;
}

.motor-row {
  display: grid;
  grid-template-columns: 80px 1fr 110px;
  gap: 12px;
  align-items: center;
  margin-bottom: 10px;
}

.mname {
  font-size: 0.8rem;
  color: var(--text-primary);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.slider {
  width: 100%;
  accent-color: var(--glow-primary, #00b0ff);
}

.slider:disabled { cursor: not-allowed; }

.val {
  text-align: right;
  font-size: 0.85rem;
  color: var(--text-primary);
}
.val.forward { color: #00e676; }
.val.reverse { color: #ff3366; }

.motor-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  flex-wrap: wrap;
}

.stop-btn {
  padding: 10px 26px;
  background: #ff3366;
  color: #fff;
  border: 1px solid rgba(255, 51, 102, 0.7);
  border-radius: 4px;
  font-family: var(--text-mono);
  font-size: 0.85rem;
  font-weight: bold;
  letter-spacing: 3px;
  cursor: pointer;
  box-shadow: 0 0 10px rgba(255, 51, 102, 0.35);
}
.stop-btn:hover { background: #ff5584; }

.linked,
.release-auto {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--text-dim);
  cursor: pointer;
}

.linked input,
.release-auto input {
  accent-color: var(--glow-primary, #00b0ff);
}

.range-hint {
  margin-left: auto;
  font-size: 0.7rem;
  color: var(--text-dim);
}

.mono { font-family: var(--text-mono); }
</style>
