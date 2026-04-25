<template>
  <button class="arm-btn" :class="armed ? 'armed' : 'disarmed'" @click="$emit('toggle')">
    <span class="dot"></span>
    <span class="label">{{ armed ? 'ARMED' : 'ARM' }}</span>
    <span class="hint">{{ armed ? 'click to disarm' : 'click to enable publish' }}</span>
  </button>
</template>

<script setup>
defineProps({ armed: { type: Boolean, default: false } })
defineEmits(['toggle'])
</script>

<style scoped>
.arm-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  border-radius: 6px;
  border: 1px solid var(--border);
  font-family: var(--text-mono);
  font-size: 0.8rem;
  letter-spacing: 2px;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  background: rgba(255, 255, 255, 0.02);
  color: var(--text-dim);
}

.arm-btn:hover {
  background: rgba(255, 255, 255, 0.05);
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ff9100;
  box-shadow: 0 0 8px #ff9100;
}

.label {
  font-weight: bold;
  color: var(--text-primary);
}

.hint {
  font-size: 0.65rem;
  color: var(--text-dim);
  letter-spacing: 1px;
  text-transform: none;
}

.arm-btn.armed {
  background: rgba(0, 230, 118, 0.08);
  border-color: rgba(0, 230, 118, 0.5);
}

.arm-btn.armed .dot {
  background: #00e676;
  box-shadow: 0 0 10px #00e676;
  animation: pulse 1.4s ease-in-out infinite;
}

.arm-btn.armed .label {
  color: #00e676;
}

.arm-btn.disarmed .dot {
  background: #ff3366;
  box-shadow: 0 0 10px #ff3366;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
