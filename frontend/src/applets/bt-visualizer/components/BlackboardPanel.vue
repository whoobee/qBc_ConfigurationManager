<template>
  <div class="bb-panel" :class="{ 'drawer-open': open }">
    <div class="bb-header">
      <span class="text-accent text-xs mono">BLACKBOARD</span>
    </div>
    <div class="bb-entries">
      <div v-if="!entries.length" class="text-dim text-xs p-2">No data yet</div>
      <div v-for="entry in entries" :key="entry.key" class="bb-entry">
        <span class="bb-key mono text-xs">{{ entry.key }}</span>
        <span class="bb-val mono text-xs">{{ entry.display }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({ blackboard: Object, open: { type: Boolean, default: false } })

const entries = computed(() => {
  if (!props.blackboard) return []
  return flattenObj(props.blackboard).sort((a, b) => a.key.localeCompare(b.key))
})

function flattenObj(obj, prefix = '') {
  const result = []
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      // Show nested objects inline if small enough
      const str = JSON.stringify(v)
      if (str.length < 60) {
        result.push({ key, display: str })
      } else {
        result.push(...flattenObj(v, key))
      }
    } else {
      result.push({ key, display: typeof v === 'string' ? v : JSON.stringify(v) })
    }
  }
  return result
}
</script>

<style scoped>
.bb-panel {
  width: 420px;
  min-width: 320px;
  flex-shrink: 0;
  border-left: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  transition: width var(--transition-med);
}

@media (max-width: 1280px) {
  .bb-panel { width: 320px; min-width: 260px; }
}

@media (max-width: 1100px) {
  .bb-panel {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    z-index: 15;
    box-shadow: -2px 0 12px rgba(0, 0, 0, 0.4);
    transform: translateX(100%);
    transition: transform var(--transition-med);
  }
  .bb-panel.drawer-open {
    transform: translateX(0);
  }
}

.bb-header {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle);
  letter-spacing: 2px;
}

.bb-entries {
  flex: 1;
  overflow: auto;
  padding: 4px 0;
}

.bb-entry {
  display: flex;
  gap: 12px;
  padding: 4px 12px;
  border-bottom: 1px solid var(--border-subtle);
  min-width: max-content;
}
.bb-entry:hover {
  background: var(--bg-hover);
}

.bb-key {
  color: var(--text-dim);
  flex-shrink: 0;
  white-space: nowrap;
}
.bb-val {
  color: var(--text-primary);
  white-space: nowrap;
}
</style>
