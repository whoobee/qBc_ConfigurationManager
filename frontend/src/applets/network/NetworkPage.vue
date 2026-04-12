<template>
  <div class="network-view h-full flex flex-col">
    <!-- Toolbar -->
    <div class="net-toolbar flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <h3 class="text-sm" style="margin:0">
          <span class="text-dim">MQTT</span>
          <span class="text-accent mono"> NETWORK TOPOLOGY</span>
        </h3>
        <span class="mono text-xs text-dim">{{ aliveCount }}/{{ totalCount }} ONLINE</span>
      </div>
      <div class="flex items-center gap-2">
        <button class="bp-btn text-xs" :class="{ active: trafficOn }" @click="toggleTraffic">
          {{ trafficOn ? 'TRAFFIC ON' : 'TRAFFIC OFF' }}
        </button>
        <button class="bp-btn text-xs" @click="fitView">FIT VIEW</button>
      </div>
    </div>

    <!-- LiteGraph canvas -->
    <div class="net-content flex-1 overflow-hidden">
      <div class="net-canvas" ref="canvasContainer"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { useMqttStore } from '../../stores/mqtt.js'
import { useSystemStore } from '../../stores/system.js'
import { useLiteGraph } from '../../composables/useLiteGraph.js'
import {
  registerNetworkNodeTypes,
  buildNetworkGraph,
  updateServiceStatuses,
  flashTopic,
  fitToContent,
  cleanupTimers,
  SERVICES,
} from './litegraph/network-nodes.js'

const canvasContainer = ref(null)
const trafficOn = ref(false)
const totalCount = SERVICES.length
const aliveCount = ref(0)

let unsubTraffic = null
let statusTimer = null

// Register node types (safe to call multiple times)
registerNetworkNodeTypes()

const { graph, canvas } = useLiteGraph(canvasContainer, {
  onReady: (g, c) => {
    // Disable node creation via search
    c.allow_searchbox = false

    // Build the topology graph
    buildNetworkGraph(g)

    // Auto-fit after a short delay (let ResizeObserver set canvas dimensions first)
    setTimeout(() => fitToContent(c, g), 100)

    // Periodic heartbeat status update
    const system = useSystemStore()
    statusTimer = setInterval(() => {
      updateServiceStatuses(g, system.services)
      let count = 0
      for (const svc of SERVICES) {
        if (system.services[svc.heartbeat]?.alive) count++
      }
      aliveCount.value = count
    }, 1000)
  },
})

function fitView() {
  if (canvas.value && graph.value) {
    fitToContent(canvas.value, graph.value)
  }
}

function toggleTraffic() {
  trafficOn.value = !trafficOn.value
  if (trafficOn.value) {
    const mqtt = useMqttStore()
    unsubTraffic = mqtt.subscribe('robot/#', (topic) => {
      if (graph.value) flashTopic(graph.value, topic)
    })
  } else {
    if (unsubTraffic) {
      unsubTraffic()
      unsubTraffic = null
    }
  }
}

onBeforeUnmount(() => {
  if (unsubTraffic) unsubTraffic()
  if (statusTimer) clearInterval(statusTimer)
  cleanupTimers()
})
</script>

<style scoped>
.network-view {
  gap: 0;
}

.net-toolbar {
  padding: 10px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  flex-shrink: 0;
}

.net-content {
  border: 1px solid var(--border-default);
  border-top: none;
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  background: var(--bg-primary);
}

.net-canvas {
  min-height: 0;
  position: relative;
  width: 100%;
  height: 100%;
}

.bp-btn.active {
  background: rgba(0, 212, 255, 0.15);
  border-color: var(--glow-primary);
  color: var(--glow-primary);
}
</style>
