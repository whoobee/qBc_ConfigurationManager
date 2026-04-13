<template>
  <div class="service-card bp-card" :class="{ alive, dead: !alive }">
    <div class="card-header">
      <span class="status-dot" :class="alive ? 'alive' : 'dead'"></span>
      <span class="service-name">{{ displayName }}</span>
      <span class="service-age mono text-xs text-dim" v-if="age !== null">
        {{ alive ? `${age}s` : `${age}s ago` }}
      </span>
      <button
        class="restart-btn"
        :class="{ 'restart-btn--busy': restarting }"
        :disabled="restarting"
        @click.stop="$emit('restart', name)"
        :title="`Restart ${displayName}`"
      >
        <svg
          class="restart-icon"
          :class="{ spinning: restarting }"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"/>
        </svg>
      </button>
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
  restarting: { type: Boolean, default: false },
})

defineEmits(['restart'])

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

/* ── Restart button ── */
.restart-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border: 1px solid rgba(255, 152, 0, 0.25);
  border-radius: 5px;
  background: rgba(255, 152, 0, 0.06);
  color: #ff9800;
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 0;
}
.restart-btn:hover:not(:disabled) {
  background: rgba(255, 152, 0, 0.18);
  box-shadow: 0 0 8px rgba(255, 152, 0, 0.25);
  border-color: rgba(255, 152, 0, 0.5);
}
.restart-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.restart-btn--busy {
  color: var(--glow-primary);
  border-color: rgba(0, 212, 255, 0.3);
  background: rgba(0, 212, 255, 0.08);
}

.restart-icon {
  width: 14px;
  height: 14px;
}
.restart-icon.spinning {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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
