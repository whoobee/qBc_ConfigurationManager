<template>
  <div class="props-panel" :class="{ 'drawer-open': open }">
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
        <label class="prop-label mono text-xs text-dim">
          {{ key }}
          <span v-if="fieldHint(key)" class="prop-hint">{{ fieldHint(key) }}</span>
        </label>

        <!-- Searchable select for fields with known options -->
        <SearchableSelect
          v-if="getOptions(key)"
          :modelValue="String(val)"
          :options="getOptions(key)"
          :placeholder="'Select ' + key + '...'"
          @update:modelValue="onUpdate(key, $event)"
        />

        <!-- Boolean toggle -->
        <label v-else-if="typeof val === 'boolean'" class="prop-toggle">
          <input type="checkbox" :checked="val" @change="onUpdate(key, $event.target.checked)" />
          <span class="toggle-label mono text-xs">{{ val ? 'true' : 'false' }}</span>
        </label>

        <!-- JSON object/array textarea -->
        <textarea
          v-else-if="val !== null && typeof val === 'object'"
          class="prop-input prop-textarea mono text-xs"
          :value="JSON.stringify(val, null, 2)"
          @change="onUpdateJson(key, $event.target.value)"
        ></textarea>

        <!-- Default text/number input -->
        <input
          v-else
          class="prop-input mono text-xs"
          :value="val"
          @change="onUpdate(key, $event.target.value)"
        />
      </div>
    </div>
    <div class="props-empty text-dim text-xs" v-else>
      Select a node to edit its properties
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import SearchableSelect from '../../../components/SearchableSelect.vue'

const props = defineProps({ node: Object, open: { type: Boolean, default: false } })
const emit = defineEmits(['update'])

// Loaded options from backend
const opts = ref({
  animations: [],
  sounds: [],
  joint_names: [],
  joints: [],
  operators: [],
  movement_types: [],
  colors: [],
  input_topics: [],
  output_topics: [],
  all_topics: [],
  blackboard_keys: [],
  trees: [],
})

onMounted(async () => {
  try {
    const res = await fetch('/api/bt-options/')
    if (res.ok) opts.value = await res.json()
  } catch (e) {
    console.warn('[PropertyEditor] Failed to load BT options:', e)
  }
})

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

/**
 * Return dropdown options for a given property key, considering the node type.
 * Returns null if the field should use a plain input instead.
 */
function getOptions(key) {
  const nodeType = props.node?.btType
  if (!nodeType) return null

  // -- BlackboardCondition --
  if (nodeType === 'BlackboardCondition') {
    if (key === 'operator') return opts.value.operators
    if (key === 'key') return opts.value.blackboard_keys
  }

  // -- EventCheck, WaitForEvent, HeartbeatCheck --
  if ((nodeType === 'EventCheck' || nodeType === 'WaitForEvent') && key === 'key') {
    return opts.value.blackboard_keys.filter(k => k.startsWith('events.'))
  }
  if (nodeType === 'HeartbeatCheck' && key === 'key') {
    return opts.value.blackboard_keys.filter(k => k.startsWith('heartbeat.'))
  }

  // -- PlayAnimation --
  if (nodeType === 'PlayAnimation') {
    if (key === 'expression') return opts.value.animations
    if (key === 'color') return opts.value.colors
  }

  // -- PlayAudio --
  if (nodeType === 'PlayAudio' && key === 'file') {
    return opts.value.sounds
  }

  // -- MoveJoint --
  if (nodeType === 'MoveJoint') {
    if (key === 'joint_name') return opts.value.joint_names
    if (key === 'movement_type') return opts.value.movement_types
  }

  // -- SendCommand --
  if (nodeType === 'SendCommand' && key === 'topic') {
    return opts.value.all_topics
  }

  // -- CallSubtree --
  if (nodeType === 'CallSubtree' && key === 'tree_path') {
    return opts.value.trees
  }

  return null
}

/**
 * Return a hint string for known fields (e.g., range info for joints).
 */
function fieldHint(key) {
  const nodeType = props.node?.btType
  if (nodeType === 'MoveJoint' && key === 'target_position') {
    const jName = props.node?.properties?.joint_name
    const joint = opts.value.joints?.find(j => j.name === jName)
    if (joint) return `${joint.min_deg} to ${joint.max_deg} deg`
  }
  return null
}

function onUpdate(key, value) {
  // Auto-detect type
  if (value !== '' && value !== true && value !== false && !isNaN(value)) {
    value = Number(value)
  }
  if (value === 'true') value = true
  if (value === 'false') value = false
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
  width: var(--bt-props-width, 280px);
  flex-shrink: 0;
  border-left: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  transition: width var(--transition-med);
}

@media (max-width: 1100px) {
  .props-panel {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    z-index: 15;
    box-shadow: -2px 0 12px rgba(0, 0, 0, 0.4);
    transform: translateX(100%);
    transition: transform var(--transition-med);
  }
  .props-panel.drawer-open {
    transform: translateX(0);
  }
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
.prop-hint {
  text-transform: none;
  letter-spacing: 0;
  color: var(--glow-primary);
  opacity: 0.7;
  margin-left: 4px;
  font-size: 0.65rem;
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
