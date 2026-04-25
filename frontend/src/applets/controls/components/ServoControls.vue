<template>
  <div class="servo-controls" :class="{ disabled: !armed }">
    <div class="top-row">
      <div class="speed-group">
        <label class="speed-label">Speed</label>
        <input type="range" min="5" max="180" step="5" v-model.number="speed" />
        <span class="speed-val mono">{{ speed }}&deg;/s</span>
      </div>
      <div class="movement-group">
        <label class="speed-label">Profile</label>
        <select v-model="movementType" class="profile-select">
          <option value="linear">linear</option>
          <option value="quadratic">quadratic</option>
          <option value="exponential">exponential</option>
        </select>
      </div>
      <button class="action-btn" :disabled="!armed" @click="centerAll">Center All</button>
    </div>

    <div class="servo-grid">
      <div v-for="j in JOINTS" :key="j.name" class="servo-row">
        <div class="jname mono">{{ j.name.replace(/_/g, ' ') }}</div>
        <input
          type="range"
          class="slider"
          :min="j.min"
          :max="j.max"
          step="0.5"
          v-model.number="positions[j.name]"
          :disabled="!armed"
          @change="send(j.name)"
        />
        <input
          type="number"
          class="num-input mono"
          :min="j.min"
          :max="j.max"
          step="0.5"
          v-model.number="positions[j.name]"
          :disabled="!armed"
          @change="send(j.name)"
        />
        <span class="unit mono">&deg;</span>
        <span class="range-hint mono">[{{ j.min }}, {{ j.max }}]</span>
        <button class="zero-btn" :disabled="!armed" @click="centerOne(j.name)">0&deg;</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'

defineProps({ armed: { type: Boolean, default: false } })
const emit = defineEmits(['send'])

// Joint limits mirror qBc_Servos/servo_calibration.json — update here if the
// calibration file changes (no runtime endpoint exposes the raw limits).
const JOINTS = [
  { name: 'neck',            min: -90, max: 90 },
  { name: 'left_ear',        min: -90, max: 90 },
  { name: 'right_ear',       min: -90, max: 90 },
  { name: 'left_front_leg',  min: -45, max: 45 },
  { name: 'right_front_leg', min: -45, max: 45 },
  { name: 'left_back_leg',   min: -45, max: 45 },
  { name: 'right_back_leg',  min: -45, max: 45 },
]

const positions = reactive(Object.fromEntries(JOINTS.map(j => [j.name, 0])))
const speed = ref(60)
const movementType = ref('linear')

function send(name) {
  emit('send', {
    type: 'joint_move_request',
    joint_name: name,
    target_position: positions[name],
    speed: speed.value,
    movement_type: movementType.value,
  })
}

function centerOne(name) {
  positions[name] = 0
  send(name)
}

function centerAll() {
  for (const j of JOINTS) {
    positions[j.name] = 0
    send(j.name)
  }
}
</script>

<style scoped>
.servo-controls.disabled {
  opacity: 0.55;
}

.top-row {
  display: flex;
  align-items: center;
  gap: 18px;
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.speed-group,
.movement-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.speed-label {
  font-size: 0.7rem;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.speed-val {
  min-width: 56px;
  font-size: 0.8rem;
  color: var(--text-primary);
}

.profile-select {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-family: var(--text-mono);
}

.action-btn {
  padding: 6px 14px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
  border-radius: 4px;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 1px;
  cursor: pointer;
}
.action-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.08); }
.action-btn:disabled { cursor: not-allowed; opacity: 0.5; }

.servo-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.servo-row {
  display: grid;
  grid-template-columns: 140px 1fr 76px 14px 86px 52px;
  gap: 10px;
  align-items: center;
}

.jname {
  color: var(--text-primary);
  text-transform: capitalize;
  font-size: 0.8rem;
}

.slider {
  width: 100%;
  accent-color: var(--glow-primary, #00b0ff);
}

.num-input {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 0.8rem;
  text-align: right;
  width: 76px;
}

.num-input:disabled,
.slider:disabled {
  cursor: not-allowed;
}

.unit {
  color: var(--text-dim);
  font-size: 0.8rem;
}

.range-hint {
  font-size: 0.65rem;
  color: var(--text-dim);
  text-align: right;
}

.zero-btn {
  padding: 4px 8px;
  background: rgba(0, 176, 255, 0.08);
  border: 1px solid rgba(0, 176, 255, 0.3);
  color: #00b0ff;
  border-radius: 4px;
  font-family: var(--text-mono);
  font-size: 0.7rem;
  cursor: pointer;
}
.zero-btn:hover:not(:disabled) { background: rgba(0, 176, 255, 0.18); }
.zero-btn:disabled { cursor: not-allowed; opacity: 0.5; }

.mono { font-family: var(--text-mono); }

@media (max-width: 720px) {
  .servo-row {
    grid-template-columns: 1fr;
    gap: 4px;
  }
  .range-hint { text-align: left; }
}
</style>
