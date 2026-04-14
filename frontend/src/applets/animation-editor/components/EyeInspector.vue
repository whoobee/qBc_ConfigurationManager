<template>
  <div class="eye-inspector mono text-xs">
    <div class="ei-section">
      <div class="ei-title-row">
        <div class="ei-title">EYES</div>
        <button class="bp-btn text-xs" @click="reset">RESET</button>
      </div>

      <div class="ei-row">
        <span class="ei-label">expression</span>
        <select
          class="ei-input"
          :value="state.expression"
          @change="set('expression', $event.target.value)"
        >
          <option v-for="p in presets" :key="p" :value="p">{{ p }}</option>
        </select>
      </div>

      <div class="ei-row">
        <span class="ei-label">pupil X</span>
        <input
          class="ei-slider"
          type="range"
          min="-1"
          max="1"
          step="0.05"
          :value="state.pupilX"
          @input="set('pupilX', Number($event.target.value))"
        />
        <span class="ei-val">{{ state.pupilX.toFixed(2) }}</span>
      </div>

      <div class="ei-row">
        <span class="ei-label">pupil Y</span>
        <input
          class="ei-slider"
          type="range"
          min="-1"
          max="1"
          step="0.05"
          :value="state.pupilY"
          @input="set('pupilY', Number($event.target.value))"
        />
        <span class="ei-val">{{ state.pupilY.toFixed(2) }}</span>
      </div>

      <div class="ei-row">
        <span class="ei-label">openness</span>
        <input
          class="ei-slider"
          type="range"
          min="0"
          max="1"
          step="0.02"
          :value="state.openness"
          @input="set('openness', Number($event.target.value))"
        />
        <span class="ei-val">{{ state.openness.toFixed(2) }}</span>
      </div>

      <div class="ei-row">
        <span class="ei-label">blink</span>
        <button class="bp-btn text-xs" @click="triggerBlink">BLINK</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import {
  getEyeState,
  setEyeField,
  resetEyeState,
  subscribe as subscribeEye,
  EXPRESSION_PRESETS,
} from '../viewport/eye-store.js'

const state = ref(getEyeState())
const presets = EXPRESSION_PRESETS

let unsubscribe = null
onMounted(() => {
  state.value = getEyeState()
  unsubscribe = subscribeEye((s) => { state.value = s })
})
onBeforeUnmount(() => { unsubscribe?.() })

function set(key, value) {
  setEyeField(key, value)
}
function reset() {
  resetEyeState()
}
// Blink is a momentary pulse: toggle true then back to false next frame.
// Timeline (step 6) will convert these pulses into discrete keyframes.
function triggerBlink() {
  setEyeField('blink', true)
  requestAnimationFrame(() => setEyeField('blink', false))
}
</script>

<style scoped>
.eye-inspector {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.ei-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border, #1e2328);
}
.ei-section:last-child { border-bottom: none; }
.ei-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ei-title {
  color: var(--accent, #4dd0ff);
  letter-spacing: 0.08em;
}
.ei-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ei-label {
  color: var(--fg-dim, #8891a0);
  min-width: 64px;
}
.ei-slider {
  flex: 1 1 auto;
  min-width: 0;
  accent-color: var(--accent, #4dd0ff);
}
.ei-val {
  width: 38px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.ei-input {
  flex: 1 1 auto;
  background: var(--bg-0, #0b0d10);
  border: 1px solid var(--border, #1e2328);
  color: var(--fg-0, #d8dee8);
  font: inherit;
  padding: 2px 6px;
}
</style>
