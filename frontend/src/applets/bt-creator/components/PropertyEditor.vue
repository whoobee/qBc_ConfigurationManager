<template>
  <div class="props-panel">
    <div class="props-header">
      <span class="text-accent text-xs mono">PROPERTIES</span>
    </div>
    <div class="props-body" v-if="node">
      <div class="prop-section">
        <div class="prop-label mono text-xs text-dim">Node Name</div>
        <div class="prop-value mono text-xs text-bright">{{ node.title }}</div>
      </div>
      <div class="prop-section">
        <div class="prop-label mono text-xs text-dim">Type</div>
        <div class="prop-value mono text-xs" :style="{ color: typeColor }">{{ node.btType }}</div>
      </div>
      <div class="prop-section">
        <div class="prop-label mono text-xs text-dim">Category</div>
        <div class="prop-value mono text-xs">{{ node.btCategory }}</div>
      </div>

      <div class="props-divider"></div>

      <div v-for="(val, key) in editableProps" :key="key" class="prop-section">
        <label class="prop-label mono text-xs text-dim">{{ key }}</label>
        <input
          v-if="typeof val === 'string' || typeof val === 'number'"
          class="prop-input mono text-xs"
          :value="val"
          @change="onUpdate(key, $event.target.value)"
        />
        <label v-else-if="typeof val === 'boolean'" class="prop-toggle">
          <input type="checkbox" :checked="val" @change="onUpdate(key, $event.target.checked)" />
          <span class="toggle-label mono text-xs">{{ val ? 'true' : 'false' }}</span>
        </label>
        <textarea
          v-else
          class="prop-input prop-textarea mono text-xs"
          :value="JSON.stringify(val, null, 2)"
          @change="onUpdateJson(key, $event.target.value)"
        ></textarea>
      </div>
    </div>
    <div class="props-empty text-dim text-xs" v-else>
      Select a node to edit its properties
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({ node: Object })
const emit = defineEmits(['update'])

const typeColor = computed(() => {
  const colors = { Composites: '#4a90d9', Decorators: '#9b59b6', Conditions: '#f1c40f', Actions: '#2ecc71' }
  return colors[props.node?.btCategory] || '#888'
})

const editableProps = computed(() => {
  if (!props.node?.properties) return {}
  const skip = new Set(['_btId', '_message'])
  const result = {}
  for (const [k, v] of Object.entries(props.node.properties)) {
    if (!skip.has(k)) result[k] = v
  }
  return result
})

function onUpdate(key, value) {
  // Auto-detect type
  if (!isNaN(value) && value !== '' && value !== true && value !== false) {
    value = Number(value)
  }
  emit('update', { key, value })
}

function onUpdateJson(key, value) {
  try {
    emit('update', { key, value: JSON.parse(value) })
  } catch (e) {
    // Invalid JSON, ignore
  }
}
</script>

<style scoped>
.props-panel {
  width: 260px;
  flex-shrink: 0;
  border-left: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
}

.props-header {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle);
  letter-spacing: 2px;
}

.props-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
}

.props-empty {
  padding: 20px 12px;
  text-align: center;
}

.prop-section {
  margin-bottom: 10px;
}
.prop-label {
  display: block;
  margin-bottom: 3px;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.prop-value {
  padding: 4px 0;
}

.prop-input {
  width: 100%;
  padding: 6px 8px;
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-family: var(--text-mono);
  outline: none;
  transition: border-color var(--transition-fast);
}
.prop-input:focus {
  border-color: var(--glow-primary);
}

.prop-textarea {
  min-height: 60px;
  resize: vertical;
}

.prop-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.prop-toggle input {
  accent-color: var(--glow-primary);
}

.props-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border-default), transparent);
  margin: 12px 0;
}
</style>
