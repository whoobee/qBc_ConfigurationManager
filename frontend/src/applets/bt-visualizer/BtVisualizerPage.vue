<template>
  <div class="bt-visualizer h-full flex flex-col">
    <!-- Toolbar -->
    <div class="viz-toolbar flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <h3 class="text-sm" style="margin:0">
          <span class="text-dim">TREE:</span>
          <span class="text-accent mono">{{ treeName || 'waiting...' }}</span>
        </h3>
        <span class="mono text-xs text-dim" v-if="tickNum">TICK #{{ tickNum }}</span>
        <span class="mono text-xs" :class="connClass">{{ connLabel }}</span>
      </div>
      <div class="flex items-center gap-2">
        <StatusLegend />
        <button class="bp-btn text-xs" @click="fitToView">FIT VIEW</button>
      </div>
    </div>

    <!-- LiteGraph canvas + Blackboard panel -->
    <div class="viz-content flex flex-1 overflow-hidden">
      <div class="viz-canvas flex-1" ref="canvasContainer"></div>
      <BlackboardPanel :blackboard="blackboard" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useMqttStore } from '../../stores/mqtt.js'
import { useLiteGraph } from '../../composables/useLiteGraph.js'
import {
  registerBTNodeTypes,
  buildGraphFromDescriptor,
  updateNodeStatuses,
  recomputeExecOrder,
} from '../bt-creator/litegraph/bt-nodes.js'
import BlackboardPanel from './components/BlackboardPanel.vue'
import StatusLegend from './components/StatusLegend.vue'

const canvasContainer = ref(null)
const treeName = ref('')
const tickNum = ref(0)
const blackboard = ref({})
const connLabel = ref('CONNECTING...')
const connClass = ref('text-dim')

let unsubState = null
let unsubTree = null
let loadedTreeFile = ''   // filename of the tree currently rendered on the canvas

// Register BT nodes before LiteGraph init
registerBTNodeTypes()

const { graph, canvas } = useLiteGraph(canvasContainer, {
  readonly: true,
  onReady: (g, c) => {
    const mqtt = useMqttStore()

    // 1) Subscribe to behavior service state (retained) to know which tree is deployed
    unsubState = mqtt.subscribe('robot/behavior/state', async (topic, payload) => {
      if (!payload) return

      const file = payload.tree_file || ''
      treeName.value = payload.tree_name || ''
      connLabel.value = 'LIVE'
      connClass.value = 'status-ok'

      // Extract just the filename from the full path
      const filename = file.split('/').pop()
      if (!filename || filename === loadedTreeFile) return

      // Tree changed — load the YAML and rebuild the graph once
      try {
        const resp = await fetch(`/api/trees/${filename}`)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const descriptor = await resp.json()
        buildGraphFromDescriptor(g, descriptor)
        recomputeExecOrder(g)
        loadedTreeFile = filename
      } catch (e) {
        console.error('Failed to load tree YAML for visualizer:', e)
      }
    })

    // 2) Subscribe to live tick data — only update node statuses & link colors
    unsubTree = mqtt.subscribe('robot/behavior/tree_state', (topic, payload) => {
      if (!payload || !graph.value) return

      tickNum.value = payload.tick || 0
      if (payload.blackboard) blackboard.value = payload.blackboard

      // Map both full and diff payloads into a common updates array
      let updates = null
      if (payload.snapshot === 'full' && payload.nodes) {
        updates = payload.nodes.map(n => ({
          id: n.id,
          status: n.status,
          message: n.message || '',
        }))
      } else if (payload.snapshot === 'diff' && payload.changed) {
        updates = payload.changed
      }

      if (updates) {
        updateNodeStatuses(graph.value, updates)
      }
    })
  },
})

function fitToView() {
  if (canvas.value && graph.value) {
    canvas.value.ds.reset()
    canvas.value.setDirty(true, true)
  }
}

onBeforeUnmount(() => {
  if (unsubState) unsubState()
  if (unsubTree) unsubTree()
  loadedTreeFile = ''
})
</script>

<style scoped>
.bt-visualizer {
  gap: 0;
}

.viz-toolbar {
  padding: 10px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  flex-shrink: 0;
}

.viz-content {
  border: 1px solid var(--border-default);
  border-top: none;
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  background: var(--bg-primary);
}

.viz-canvas {
  min-height: 0;
  position: relative;
}

.status-ok { color: var(--glow-success) !important; }
</style>
