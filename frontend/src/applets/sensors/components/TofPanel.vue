<template>
  <div class="tof-panel">
    <div v-for="s in sensors" :key="s.key" class="tof-card" :class="{ 'tof-card--warn': s.warn, 'tof-card--danger': s.danger }">
      <div class="tof-label">{{ s.label }}</div>
      <div class="tof-value mono">
        {{ s.value }} <span class="tof-unit">mm</span>
      </div>
      <div class="tof-bar">
        <div class="tof-fill" :style="{ width: s.pct + '%' }"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  tof: { type: Object, default: () => ({}) },
})

// TOF range assumption: 30..1500 mm (VL53L0X typical short mode)
const TOF_MAX_MM = 1500
const WARN_MM = 400
const DANGER_MM = 150

function mkCard(label, key, raw) {
  const value = Number.isFinite(raw) ? Math.round(raw) : 0
  const pct = Math.max(0, Math.min(100, (value / TOF_MAX_MM) * 100))
  return {
    key,
    label,
    value,
    pct,
    warn: value > 0 && value < WARN_MM,
    danger: value > 0 && value < DANGER_MM,
  }
}

const sensors = computed(() => [
  mkCard('Front', 'front', props.tof.front_mm),
  mkCard('Left',  'left',  props.tof.left_mm),
  mkCard('Right', 'right', props.tof.right_mm),
  mkCard('Back',  'back',  props.tof.back_mm),
])
</script>

<style scoped>
.tof-panel {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.tof-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px 12px;
  transition: border-color 0.2s;
}

.tof-card--warn { border-color: #ff9100; }
.tof-card--danger { border-color: #ff3366; box-shadow: 0 0 6px rgba(255,51,102,0.3); }

.tof-label {
  font-size: 0.7rem;
  color: var(--text-dim);
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.tof-value {
  font-family: var(--text-mono);
  font-size: 1.3rem;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.tof-unit {
  font-size: 0.7rem;
  color: var(--text-dim);
  margin-left: 4px;
}

.tof-bar {
  width: 100%;
  height: 4px;
  background: rgba(255,255,255,0.05);
  border-radius: 2px;
  overflow: hidden;
}

.tof-fill {
  height: 100%;
  background: linear-gradient(to right, #00e676, #00b0ff);
  transition: width 0.25s;
}

.tof-card--warn .tof-fill {
  background: linear-gradient(to right, #ff9100, #ffd600);
}

.tof-card--danger .tof-fill {
  background: #ff3366;
}

.mono { font-family: var(--text-mono); }
</style>
