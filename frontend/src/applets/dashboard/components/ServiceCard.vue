<template>
  <div class="service-card bp-card" :class="{ alive, dead: !alive }">
    <div class="card-header">
      <span class="status-dot" :class="alive ? 'alive' : 'dead'"></span>
      <span class="service-name">{{ displayName }}</span>
      <span class="service-age mono text-xs text-dim" v-if="age !== null">
        {{ alive ? `${age}s` : `${age}s ago` }}
      </span>
    </div>
    <div class="card-status-bar" v-if="currentState || errorInfo">
      <div class="status-item" v-if="currentState">
        <span class="status-label mono text-xs">STATE</span>
        <span class="status-value mono text-xs text-glow">{{ currentState }}</span>
      </div>
      <div class="status-item" v-if="errorInfo">
        <span class="status-label mono text-xs">ERROR</span>
        <span class="status-value mono text-xs" :class="errorInfo === 'E_OK' ? 'val-ok' : 'val-err'">{{ errorInfo }}</span>
      </div>
    </div>
    <div class="card-body" v-if="state && Object.keys(state).length">
      <div class="state-row" v-for="(val, key) in state" :key="key">
        <span class="state-key mono text-xs">{{ key }}</span>
        <span class="state-val mono text-xs" :class="stateClass(key, val)">{{ formatVal(val) }}</span>
      </div>
    </div>
    <div class="card-body text-xs text-dim" v-else-if="!currentState && !errorInfo">
      No state data
    </div>
    <!-- Loading progress bar -->
    <div class="card-loading" v-if="loadingPercent !== null && loadingPercent < 100 && !alive">
      <div class="loading-bar">
        <div class="loading-fill" :style="{ width: loadingPercent + '%' }"></div>
      </div>
      <span class="loading-label mono text-xs">{{ loadingMessage || `${loadingPercent}%` }}</span>
    </div>
    <!-- Animated border accent -->
    <div class="card-accent" :style="{ background: alive ? 'var(--glow-success)' : 'var(--glow-danger)' }"></div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: String,
  alive: Boolean,
  age: Number,
  state: Object,
  currentState: String,
  errorInfo: String,
  loadingPercent: { type: Number, default: null },
  loadingMessage: { type: String, default: '' },
})

const displayName = computed(() => {
  return props.name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
})

function formatVal(val) {
  if (typeof val === 'boolean') return val ? 'YES' : 'NO'
  if (typeof val === 'number') return String(val)
  return String(val)
}

function stateClass(key, val) {
  if (key === 'status') return val === 'online' ? 'val-ok' : 'val-err'
  if (typeof val === 'boolean') return val ? 'val-on' : ''
  return ''
}
</script>

<style scoped>
.service-card {
  position: relative;
  overflow: hidden;
  transition: all var(--transition-fast);
}
.service-card.dead {
  opacity: 0.6;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-subtle);
}
.service-name {
  flex: 1;
  font-weight: 600;
  font-size: 0.88rem;
  color: var(--text-bright);
}
.service-age {
  flex-shrink: 0;
}

.card-status-bar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 14px;
  background: rgba(0, 255, 200, 0.03);
  border-bottom: 1px solid var(--border-subtle);
}
.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.status-label {
  color: var(--text-dim);
  letter-spacing: 1px;
}
.status-value {
  color: var(--text-primary);
}

.card-body {
  padding: 10px 14px;
}

.state-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
}
.state-key {
  color: var(--text-dim);
}
.state-val {
  color: var(--text-primary);
}
.state-val.val-ok { color: var(--glow-success); }
.state-val.val-err { color: var(--glow-danger); }
.state-val.val-on { color: var(--glow-primary); }

/* Loading progress */
.card-loading {
  padding: 6px 14px 10px;
  border-top: 1px solid var(--border-subtle);
}
.loading-bar {
  height: 4px;
  background: var(--bg-hover);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 4px;
}
.loading-fill {
  height: 100%;
  background: var(--glow-primary);
  border-radius: 2px;
  transition: width 0.3s ease;
  box-shadow: 0 0 6px rgba(0, 212, 255, 0.4);
}
.loading-label {
  color: var(--glow-primary);
  opacity: 0.8;
}

.card-accent {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  opacity: 0.6;
  box-shadow: 0 0 8px currentColor;
}
</style>
