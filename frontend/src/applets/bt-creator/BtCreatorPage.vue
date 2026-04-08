<template>
  <div class="bt-creator h-full flex flex-col">
    <!-- Toolbar -->
    <div class="editor-toolbar flex items-center justify-between">
      <div class="flex items-center gap-3">
        <select class="bp-select mono text-xs" v-model="selectedFile" @change="loadSelected">
          <option value="">-- Select Tree --</option>
          <option v-for="t in treeList" :key="t.filename" :value="t.filename">
            {{ t.name }} ({{ t.filename }})
          </option>
        </select>
        <button class="bp-btn text-xs" @click="loadSelected" :disabled="!selectedFile">LOAD</button>
        <button class="bp-btn bp-btn-primary text-xs" @click="saveTree">SAVE</button>
        <button class="bp-btn text-xs" @click="saveTreeAs">SAVE AS</button>
        <button class="bp-btn bp-btn-success text-xs" @click="validateTree">VALIDATE</button>
        <button class="bp-btn text-xs" @click="deployTree" :disabled="!selectedFile">DEPLOY</button>
      </div>
      <div class="flex items-center gap-2">
        <span class="mono text-xs text-dim" v-if="statusMsg" :class="statusClass">{{ statusMsg }}</span>
        <button class="bp-btn text-xs" @click="newTree">NEW</button>
      </div>
    </div>

    <!-- Main editor area -->
    <div class="editor-body flex flex-1 overflow-hidden">
      <!-- Node palette -->
      <NodePalette @add-node="addNodeToGraph" />

      <!-- LiteGraph canvas -->
      <div class="editor-canvas flex-1" ref="canvasContainer"></div>

      <!-- Validation errors overlay -->
      <div v-if="validationErrors.length" class="validation-panel">
        <div class="validation-header">
          <span class="mono text-xs text-accent">VALIDATION ERRORS</span>
          <button class="bp-btn text-xs" @click="validationErrors = []">CLOSE</button>
        </div>
        <ul class="validation-list">
          <li v-for="(err, i) in validationErrors" :key="i" class="mono text-xs">{{ err }}</li>
        </ul>
      </div>

      <!-- Property editor -->
      <PropertyEditor
        :node="selectedNode"
        @update="onPropertyUpdate"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { LiteGraph } from 'litegraph.js'
import { useLiteGraph } from '../../composables/useLiteGraph.js'
import { registerBTNodeTypes, buildGraphFromDescriptor, exportGraphToDescriptor, recomputeExecOrder } from './litegraph/bt-nodes.js'
import NodePalette from './components/NodePalette.vue'
import PropertyEditor from './components/PropertyEditor.vue'

const canvasContainer = ref(null)
const selectedFile = ref('')
const treeList = ref([])
const selectedNode = ref(null)
const statusMsg = ref('')
const statusClass = ref('')
const loadedDescriptor = ref(null)  // preserve metadata/blackboard on round-trip
const validationErrors = ref([])

// Register BT nodes
registerBTNodeTypes()

const { graph, canvas } = useLiteGraph(canvasContainer, {
  onReady: (g, c) => {
    // Track node selection
    c.onNodeSelected = (node) => {
      selectedNode.value = node ? {
        id: node.id,
        title: node.title,
        btType: node.btType,
        btCategory: node.btCategory,
        properties: { ...node.properties },
      } : null
    }
    c.onNodeDeselected = () => {
      selectedNode.value = null
    }

    // Recompute execution order when structure changes
    g.onConnectionChange = () => recomputeExecOrder(g)
    c.onNodeMoved = () => recomputeExecOrder(g)
  },
})

async function refreshTreeList() {
  try {
    const resp = await fetch('/api/trees/')
    treeList.value = await resp.json()
  } catch (e) {
    setStatus('Failed to load tree list', 'error')
  }
}

onMounted(refreshTreeList)

async function loadSelected() {
  if (!selectedFile.value) return
  try {
    const resp = await fetch(`/api/trees/${selectedFile.value}`)
    const descriptor = await resp.json()
    importTreeDescriptor(descriptor)
    setStatus(`Loaded: ${selectedFile.value}`, 'ok')
  } catch (e) {
    setStatus('Load failed: ' + e.message, 'error')
  }
}

async function saveTree() {
  if (!graph.value) return
  let filename = selectedFile.value
  if (!filename) {
    filename = prompt('Enter tree filename (e.g. my_tree.yaml):')
    if (!filename) return
    if (!filename.endsWith('.yaml')) filename += '.yaml'
  }
  try {
    const descriptor = exportTreeDescriptor()
    const resp = await fetch(`/api/trees/${filename}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(descriptor),
    })
    if (!resp.ok) throw new Error(await resp.text())
    selectedFile.value = filename
    await refreshTreeList()
    setStatus(`Saved: ${filename}`, 'ok')
  } catch (e) {
    setStatus('Save failed: ' + e.message, 'error')
  }
}

async function saveTreeAs() {
  if (!graph.value) return
  let filename = prompt('Save as filename (e.g. my_tree.yaml):', selectedFile.value || '')
  if (!filename) return
  if (!filename.endsWith('.yaml')) filename += '.yaml'
  try {
    const descriptor = exportTreeDescriptor()
    const resp = await fetch(`/api/trees/${filename}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(descriptor),
    })
    if (!resp.ok) throw new Error(await resp.text())
    selectedFile.value = filename
    await refreshTreeList()
    setStatus(`Saved as: ${filename}`, 'ok')
  } catch (e) {
    setStatus('Save failed: ' + e.message, 'error')
  }
}

async function validateTree() {
  if (!graph.value) return
  validationErrors.value = []
  try {
    const descriptor = exportTreeDescriptor()
    const resp = await fetch('/api/trees/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(descriptor),
    })
    if (!resp.ok) throw new Error(await resp.text())
    const result = await resp.json()
    if (result.valid) {
      setStatus('Valid! No errors.', 'ok')
    } else {
      validationErrors.value = result.errors
      setStatus(`${result.errors.length} error(s) found`, 'error')
    }
  } catch (e) {
    setStatus('Validation failed: ' + e.message, 'error')
  }
}

async function deployTree() {
  try {
    const resp = await fetch('/api/trees/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: selectedFile.value }),
    })
    setStatus('Deploy command sent', 'ok')
  } catch (e) {
    setStatus('Deploy failed', 'error')
  }
}

function newTree() {
  if (graph.value) graph.value.clear()
  selectedFile.value = ''
  selectedNode.value = null
  setStatus('New tree created', 'ok')
}

function addNodeToGraph(typePath) {
  if (!graph.value) return
  const node = LiteGraph.createNode(typePath)
  if (node) {
    node.pos = [200 + Math.random() * 200, 100 + Math.random() * 200]
    graph.value.add(node)
  }
}

function onPropertyUpdate({ key, value }) {
  if (!selectedNode.value || !graph.value) return
  const lgNode = graph.value.getNodeById(selectedNode.value.id)
  if (lgNode) {
    lgNode.properties[key] = value
    lgNode.setDirtyCanvas(true)
  }
}

function importTreeDescriptor(descriptor) {
  if (!graph.value) return
  loadedDescriptor.value = descriptor
  buildGraphFromDescriptor(graph.value, descriptor)
  recomputeExecOrder(graph.value)
}

function exportTreeDescriptor() {
  if (!graph.value) return null
  const rootDesc = exportGraphToDescriptor(graph.value)
  const meta = loadedDescriptor.value || {}
  return {
    tree: {
      name: meta.tree?.name || selectedFile.value?.replace('.yaml', '') || 'untitled',
      ...(meta.tree?.description && { description: meta.tree.description }),
      tick_rate_hz: meta.tree?.tick_rate_hz || 30,
    },
    blackboard: meta.blackboard || { subscriptions: [], events: [], heartbeats: [] },
    root: rootDesc || { type: 'Selector', name: 'root', children: [] },
  }
}

function setStatus(msg, type = '') {
  statusMsg.value = msg
  statusClass.value = type === 'ok' ? 'status-ok' : type === 'error' ? 'status-err' : ''
  setTimeout(() => { statusMsg.value = '' }, 4000)
}
</script>

<style scoped>
.bt-creator { gap: 0; }

.editor-toolbar {
  padding: 10px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  flex-shrink: 0;
}

.editor-body {
  position: relative;
  border: 1px solid var(--border-default);
  border-top: none;
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  background: var(--bg-primary);
}

.editor-canvas {
  min-height: 0;
  position: relative;
}

.bp-select {
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  font-family: var(--text-mono);
  outline: none;
}
.bp-select:focus { border-color: var(--glow-primary); }

.status-ok { color: var(--glow-success) !important; }
.status-err { color: var(--glow-danger) !important; }

.validation-panel {
  position: absolute;
  bottom: 12px;
  left: 220px;
  right: 220px;
  background: var(--bg-card);
  border: 1px solid var(--glow-danger);
  border-radius: var(--radius-md);
  padding: 10px 14px;
  z-index: 20;
  max-height: 200px;
  overflow-y: auto;
}
.validation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.validation-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.validation-list li {
  padding: 3px 0;
  color: var(--glow-danger);
  border-bottom: 1px solid var(--border-subtle);
}
.validation-list li:last-child { border-bottom: none; }
</style>
