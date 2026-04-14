<template>
  <div class="joint-inspector mono text-xs">
    <div class="ji-section">
      <div class="ji-title-row">
        <div class="ji-title">JOINTS</div>
        <button class="bp-btn text-xs" @click="resetAll" :disabled="!joints.length">
          RESET
        </button>
      </div>
      <div v-if="!joints.length" class="ji-empty text-dim">
        No joints — rig not loaded.
      </div>
      <div v-for="j in joints" :key="j.name" class="ji-joint">
        <div class="ji-joint-head">
          <span class="ji-name">{{ j.name }}</span>
          <span class="ji-meta text-dim">
            {{ j.axis }} · [{{ j.limits[0] }}, {{ j.limits[1] }}]
          </span>
        </div>
        <div class="ji-joint-ctrl">
          <input
            class="ji-slider"
            type="range"
            :min="j.limits[0]"
            :max="j.limits[1]"
            step="0.5"
            :value="angles[j.name] ?? 0"
            @input="onSlider(j.name, $event.target.value)"
          />
          <input
            class="ji-num"
            type="number"
            step="0.5"
            :min="j.limits[0]"
            :max="j.limits[1]"
            :value="fmt(angles[j.name] ?? 0)"
            @change="onNumber(j.name, $event.target.value)"
          />
          <span class="ji-deg text-dim">°</span>
          <button class="ji-zero" title="zero" @click="zero(j.name)">0</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, defineProps } from 'vue'
import {
  getPose,
  setJointAngle,
  subscribe as subscribePose,
} from '../viewport/pose-store.js'

const props = defineProps({
  // Array of { name, axis, limits: [min, max] }
  joints: { type: Array, default: () => [] },
})

// Reactive mirror of the pose store so sliders update when the pose
// changes from elsewhere (drag-to-rotate in the viewport, timeline scrub).
const angles = ref(getPose())

let unsubscribe = null
onMounted(() => {
  angles.value = getPose()
  unsubscribe = subscribePose((p) => {
    angles.value = p
  })
})
onBeforeUnmount(() => {
  unsubscribe?.()
})

function onSlider(name, v) {
  setJointAngle(name, Number(v))
}
function onNumber(name, v) {
  const n = Number(v)
  if (Number.isFinite(n)) setJointAngle(name, n)
}
function zero(name) {
  setJointAngle(name, 0)
}
function resetAll() {
  for (const j of props.joints) setJointAngle(j.name, 0)
}
function fmt(v) {
  return Number(v).toFixed(1)
}
</script>

<style scoped>
.joint-inspector {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.ji-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border, #1e2328);
}
.ji-section:last-child { border-bottom: none; }
.ji-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ji-title {
  color: var(--accent, #4dd0ff);
  letter-spacing: 0.08em;
}
.ji-empty { padding: 8px 0; }
.ji-joint {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 4px 0;
}
.ji-joint + .ji-joint {
  border-top: 1px dashed var(--border, #1e2328);
  padding-top: 6px;
}
.ji-joint-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.ji-name { color: var(--fg-0, #d8dee8); }
.ji-meta { font-size: 10px; }
.ji-joint-ctrl {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ji-slider {
  flex: 1 1 auto;
  min-width: 0;
  accent-color: var(--accent, #4dd0ff);
}
.ji-num {
  width: 56px;
  background: var(--bg-0, #0b0d10);
  border: 1px solid var(--border, #1e2328);
  color: var(--fg-0, #d8dee8);
  font: inherit;
  padding: 1px 4px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.ji-deg { font-size: 10px; }
.ji-zero {
  background: transparent;
  border: 1px solid var(--border, #1e2328);
  color: var(--fg-dim, #8891a0);
  font: inherit;
  padding: 0 6px;
  cursor: pointer;
}
.ji-zero:hover {
  color: var(--accent, #4dd0ff);
  border-color: var(--accent, #4dd0ff);
}
.text-dim { color: var(--fg-dim, #8891a0); }
</style>
