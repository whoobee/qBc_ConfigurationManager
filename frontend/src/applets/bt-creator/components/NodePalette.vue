<template>
  <div class="palette">
    <div class="palette-header">
      <span class="text-accent text-xs mono">NODE PALETTE</span>
    </div>
    <div class="palette-body">
      <div v-for="(nodes, category) in categories" :key="category" class="palette-group">
        <div class="group-label" :style="{ color: categoryColors[category] }">
          {{ category }}
        </div>
        <div
          v-for="nodeName in nodes"
          :key="nodeName"
          class="palette-item"
          :style="{ borderLeftColor: categoryColors[category] }"
          draggable="true"
          @dragstart="onDrag($event, category, nodeName)"
          @click="$emit('add-node', `${category}/${nodeName}`)"
        >
          <span class="item-name text-xs">{{ nodeName }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const emit = defineEmits(['add-node'])

const categories = ref({
  Composites: ['Sequence', 'Selector', 'Parallel', 'RandomSelector'],
  Decorators: ['Inverter', 'Timeout', 'RunningIsSuccess', 'FailureIsSuccess', 'SuccessIsFailure', 'CooldownGuard'],
  Conditions: ['BlackboardCondition', 'EventCheck', 'HeartbeatCheck'],
  Actions: ['PlayAnimation', 'PlayAudio', 'MoveJoint', 'SendCommand', 'WaitForEvent', 'TimerBehavior'],
})

const categoryColors = {
  Composites: '#4a90d9',
  Decorators: '#9b59b6',
  Conditions: '#f1c40f',
  Actions: '#2ecc71',
}

// Try to load from API
onMounted(async () => {
  try {
    const resp = await fetch('/api/trees/schema')
    const schema = await resp.json()
    if (schema.categories) categories.value = schema.categories
  } catch (e) { /* use defaults */ }
})

function onDrag(event, category, nodeName) {
  event.dataTransfer.setData('text/plain', `${category}/${nodeName}`)
}
</script>

<style scoped>
.palette {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
}

.palette-header {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle);
  letter-spacing: 2px;
}

.palette-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.palette-group {
  margin-bottom: 8px;
}

.group-label {
  padding: 6px 12px 4px;
  font-family: var(--text-mono);
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 2px;
  opacity: 0.8;
}

.palette-item {
  padding: 6px 12px 6px 14px;
  margin: 1px 6px;
  border-left: 3px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  color: var(--text-primary);
}
.palette-item:hover {
  background: var(--bg-hover);
  color: var(--text-bright);
}

.item-name {
  font-weight: 500;
}
</style>
