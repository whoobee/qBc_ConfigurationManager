<template>
  <div class="bb-panel">
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

const props = defineProps({ blackboard: Object })

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
  width: 280px;
  flex-shrink: 0;
  border-left: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
}

.bb-header {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle);
  letter-spacing: 2px;
}

.bb-entries {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.bb-entry {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 12px;
  border-bottom: 1px solid var(--border-subtle);
}
.bb-entry:hover {
  background: var(--bg-hover);
}

.bb-key {
  color: var(--text-dim);
  flex-shrink: 0;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bb-val {
  color: var(--text-primary);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
