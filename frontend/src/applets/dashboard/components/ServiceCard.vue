<template>
  <div class="service-card bp-card" :class="{ alive, dead: !alive }">
    <div class="card-header">
      <span class="status-dot" :class="alive ? 'alive' : 'dead'"></span>
      <span class="service-name">{{ displayName }}</span>
      <span class="service-age mono text-xs text-dim" v-if="age !== null">
        {{ alive ? `${age}s` : `${age}s ago` }}
      </span>
    </div>
    <div class="card-body" v-if="state && Object.keys(state).length">
      <div class="state-row" v-for="(val, key) in state" :key="key">
        <span class="state-key mono text-xs">{{ key }}</span>
        <span class="state-val mono text-xs" :class="stateClass(key, val)">{{ formatVal(val) }}</span>
      </div>
    </div>
    <div class="card-body text-xs text-dim" v-else>
      No state data
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
