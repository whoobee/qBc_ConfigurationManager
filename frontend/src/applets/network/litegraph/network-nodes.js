/**
 * MQTT network topology nodes for LiteGraph.
 *
 * Defines the system service topology, registers custom node types,
 * builds the network graph, and supports live status + traffic visualization.
 */
import { LiteGraph } from 'litegraph.js'

const BG = '#111d35'
const LINK_DEFAULT = '#0088ff'
const LINK_ACTIVE = '#00d4ff'

const STATUS_COLORS = {
  alive: '#00ff88',
  dead: '#ff3366',
  unknown: '#555555',
}

// ── Service topology definition ──
// Each service lists its MQTT outputs (topics it publishes) and inputs (topics it subscribes to).
// Heartbeat topics are omitted for clarity — status is tracked via the system store.
const SERVICES = [
  {
    id: 'audio',
    name: 'Audio',
    heartbeat: 'audio',
    color: '#2ecc71',
    pos: [40, 120],
    outputs: [
      { name: 'state', topics: ['robot/audio/state'] },
      { name: 'events', topics: ['robot/audio/wake_word', 'robot/audio/recording_ready'] },
    ],
    inputs: [
      { name: 'play', topics: ['robot/audio/play'] },
      { name: 'cmd', topics: ['robot/audio/cmd'] },
    ],
  },
  {
    id: 'vision',
    name: 'Vision',
    heartbeat: 'vision',
    color: '#e67e22',
    pos: [40, 340],
    outputs: [
      { name: 'state', topics: ['robot/vision/state'] },
      { name: 'events', topics: ['robot/vision/frame_ready', 'robot/vision/video_ready'] },
    ],
    inputs: [
      { name: 'cmd', topics: ['robot/vision/cmd'] },
    ],
  },
  {
    id: 'ai',
    name: 'AI',
    heartbeat: 'ai',
    color: '#f39c12',
    pos: [40, 540],
    outputs: [
      { name: 'state', topics: ['robot/ai/state', 'robot/ai/voice/state', 'robot/ai/explore/state'] },
      { name: 'results', topics: ['robot/ai/explore/result'] },
    ],
    inputs: [
      { name: 'cmd', topics: ['robot/ai/explore/cmd'] },
    ],
  },
  {
    id: 'behavior',
    name: 'Behavior',
    heartbeat: 'behavior',
    color: '#4a90d9',
    pos: [380, 180],
    outputs: [
      { name: 'state', topics: ['robot/behavior/state'] },
      { name: 'tree_state', topics: ['robot/behavior/tree_state'] },
      { name: 'anim cmds', topics: ['robot/animation/play'] },
      { name: 'audio cmds', topics: ['robot/audio/play', 'robot/audio/cmd'] },
      { name: 'servo cmds', topics: ['robot/joints/cmd'] },
      { name: 'vision cmds', topics: ['robot/vision/cmd'] },
      { name: 'ai cmds', topics: ['robot/ai/explore/cmd'] },
    ],
    inputs: [
      { name: 'cmd', topics: ['robot/behavior/cmd'] },
      { name: 'audio state', topics: ['robot/audio/state'] },
      { name: 'audio events', topics: ['robot/audio/wake_word', 'robot/audio/recording_ready'] },
      { name: 'vision state', topics: ['robot/vision/state'] },
      { name: 'vision events', topics: ['robot/vision/frame_ready', 'robot/vision/video_ready'] },
      { name: 'anim state', topics: ['robot/animation/state'] },
      { name: 'servo status', topics: ['robot/joints/status'] },
      { name: 'ai state', topics: ['robot/ai/state', 'robot/ai/voice/state', 'robot/ai/explore/state'] },
      { name: 'ai results', topics: ['robot/ai/explore/result'] },
    ],
  },
  {
    id: 'config_manager',
    name: 'Config Manager',
    heartbeat: 'config_manager',
    color: '#00d4ff',
    pos: [780, 20],
    outputs: [
      { name: 'deploy', topics: ['robot/behavior/cmd'] },
      { name: 'nav stream', topics: ['robot/navigation/stream/request'] },
    ],
    inputs: [
      { name: 'beh state', topics: ['robot/behavior/state'] },
      { name: 'tree state', topics: ['robot/behavior/tree_state'] },
    ],
  },
  {
    id: 'servos',
    name: 'Servos',
    heartbeat: 'servos',
    color: '#e74c3c',
    pos: [780, 220],
    outputs: [
      { name: 'status', topics: ['robot/joints/status'] },
    ],
    inputs: [
      { name: 'cmd', topics: ['robot/joints/cmd'] },
    ],
  },
  {
    id: 'animation',
    name: 'Animation',
    heartbeat: 'animation',
    color: '#9b59b6',
    pos: [780, 400],
    outputs: [
      { name: 'state', topics: ['robot/animation/state'] },
    ],
    inputs: [
      { name: 'play', topics: ['robot/animation/play'] },
    ],
  },
  {
    id: 'navigation',
    name: 'Navigation',
    heartbeat: 'navigation',
    color: '#1abc9c',
    pos: [780, 560],
    outputs: [
      { name: 'state', topics: ['robot/navigation/state'] },
    ],
    inputs: [
      { name: 'stream req', topics: ['robot/navigation/stream/request'] },
    ],
  },
]

// ── Internal state for traffic visualization ──
let _topicToLinks = new Map()   // topic string → [link IDs]
let _topicToNodes = new Map()   // topic string → Set<service ID>
const _linkTimers = new Map()   // link ID → timeout handle

/**
 * Register network node types with LiteGraph.
 * Re-registers on every call (no idempotent guard) to handle
 * type clearing by other applets (e.g. BT Creator).
 */
export function registerNetworkNodeTypes() {
  for (const svc of SERVICES) {
    const cfg = svc

    function ServiceNode() {
      for (const inp of cfg.inputs) {
        this.addInput(inp.name, 'mqtt')
      }
      for (const out of cfg.outputs) {
        this.addOutput(out.name, 'mqtt')
      }

      this.title = cfg.name
      this.color = cfg.color
      this.bgcolor = BG
      this.boxcolor = cfg.color
      this.shape = LiteGraph.BOX_SHAPE
      this._serviceId = cfg.id
      this._heartbeatKey = cfg.heartbeat
      this._status = 'unknown'
      this._lastMsgTime = 0

      const slotCount = Math.max(cfg.inputs.length, cfg.outputs.length, 1)
      this.size = [220, slotCount * 26 + 40]
    }

    ServiceNode.title = cfg.name
    ServiceNode.desc = `Service: ${cfg.name}`

    ServiceNode.prototype.onDrawForeground = function (ctx) {
      ctx.save()
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0

      // ── Status dot (top-right of title bar) ──
      const sc = STATUS_COLORS[this._status] || STATUS_COLORS.unknown
      const dx = this.size[0] - 14
      const dy = -10

      ctx.shadowColor = sc
      ctx.shadowBlur = 8
      ctx.fillStyle = sc
      ctx.beginPath()
      ctx.arc(dx, dy, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.shadowColor = 'transparent'

      // ── Status label ──
      ctx.fillStyle = sc
      ctx.font = '9px Share Tech Mono'
      ctx.textAlign = 'right'
      ctx.fillText(this._status.toUpperCase(), dx - 12, dy + 3)
      ctx.textAlign = 'left'

      // ── Service badge ──
      ctx.fillStyle = 'rgba(200, 214, 229, 0.3)'
      ctx.font = '9px Share Tech Mono'
      ctx.fillText('SERVICE', 8, this.size[1] - 6)

      // ── Activity glow border (fades over 600ms) ──
      if (this._lastMsgTime) {
        const elapsed = Date.now() - this._lastMsgTime
        if (elapsed < 600) {
          const alpha = (1 - elapsed / 600) * 0.6
          ctx.strokeStyle = `rgba(0, 212, 255, ${alpha})`
          ctx.lineWidth = 2
          const th = LiteGraph.NODE_TITLE_HEIGHT || 30
          ctx.strokeRect(-1, -th - 1, this.size[0] + 2, this.size[1] + th + 2)
        }
      }

      ctx.restore()
    }

    LiteGraph.registerNodeType(`Network/${cfg.id}`, ServiceNode)
  }
}

/**
 * Build the full network topology graph.
 * Creates service nodes and links them based on matching pub/sub topics.
 *
 * @param {LGraph} graph
 * @returns {Map<string, LGraphNode>} service id → node
 */
export function buildNetworkGraph(graph) {
  graph.clear()
  _topicToLinks.clear()
  _topicToNodes.clear()
  _linkTimers.clear()

  const nodeMap = new Map()

  // Create service nodes
  for (const svc of SERVICES) {
    const node = LiteGraph.createNode(`Network/${svc.id}`)
    if (!node) continue
    node.pos = [...svc.pos]
    graph.add(node)
    nodeMap.set(svc.id, node)
  }

  // Build subscriber index: topic → [{serviceId, inputIdx}]
  const subIndex = new Map()
  for (const svc of SERVICES) {
    for (let i = 0; i < svc.inputs.length; i++) {
      for (const topic of svc.inputs[i].topics) {
        if (!subIndex.has(topic)) subIndex.set(topic, [])
        subIndex.get(topic).push({ serviceId: svc.id, inputIdx: i })
      }
    }
  }

  // Create links by matching published topics to subscribed topics
  const linked = new Set()
  for (const svc of SERVICES) {
    const pubNode = nodeMap.get(svc.id)
    if (!pubNode) continue

    for (let outIdx = 0; outIdx < svc.outputs.length; outIdx++) {
      for (const topic of svc.outputs[outIdx].topics) {
        // Track topic → publisher node for activity flash
        if (!_topicToNodes.has(topic)) _topicToNodes.set(topic, new Set())
        _topicToNodes.get(topic).add(svc.id)

        // Find subscribers
        const subs = subIndex.get(topic) || []
        for (const sub of subs) {
          if (sub.serviceId === svc.id) continue
          const key = `${svc.id}:${outIdx}->${sub.serviceId}:${sub.inputIdx}`
          if (linked.has(key)) continue
          linked.add(key)

          const subNode = nodeMap.get(sub.serviceId)
          if (subNode) {
            pubNode.connect(outIdx, subNode, sub.inputIdx)
          }
        }
      }
    }
  }

  // Style all links with default color
  if (graph.links) {
    for (const id in graph.links) {
      if (graph.links[id]) graph.links[id].color = LINK_DEFAULT
    }
  }

  // Build topic → link IDs mapping for traffic visualization
  for (const svc of SERVICES) {
    const pubNode = nodeMap.get(svc.id)
    if (!pubNode) continue
    for (let outIdx = 0; outIdx < svc.outputs.length; outIdx++) {
      const linkIds = pubNode.outputs?.[outIdx]?.links || []
      for (const topic of svc.outputs[outIdx].topics) {
        if (!_topicToLinks.has(topic)) _topicToLinks.set(topic, [])
        _topicToLinks.get(topic).push(...linkIds)
      }
    }
  }

  graph.setDirtyCanvas(true, true)
  return nodeMap
}

/**
 * Update node alive/dead status from the system store heartbeat data.
 */
export function updateServiceStatuses(graph, services) {
  if (!graph?._nodes) return
  for (const node of graph._nodes) {
    if (!node._heartbeatKey) continue
    const svc = services[node._heartbeatKey]
    node._status = svc ? (svc.alive ? 'alive' : 'dead') : 'unknown'
  }
  graph.setDirtyCanvas(true, true)
}

/**
 * Flash links and publisher nodes when a message arrives on a topic.
 * Links stay highlighted while messages keep flowing, then fade after 500ms of silence.
 */
export function flashTopic(graph, topic) {
  if (!graph) return

  // Flash links that carry this topic
  const linkIds = _topicToLinks.get(topic) || []
  for (const lid of linkIds) {
    const link = graph.links?.[lid]
    if (!link) continue
    link.color = LINK_ACTIVE

    // Debounced reset — keeps link lit while traffic flows
    const existing = _linkTimers.get(lid)
    if (existing) clearTimeout(existing)
    _linkTimers.set(lid, setTimeout(() => {
      if (graph.links?.[lid]) graph.links[lid].color = LINK_DEFAULT
      _linkTimers.delete(lid)
    }, 500))
  }

  // Flash publisher nodes
  const nodeIds = _topicToNodes.get(topic)
  if (nodeIds && graph._nodes) {
    for (const node of graph._nodes) {
      if (nodeIds.has(node._serviceId)) {
        node._lastMsgTime = Date.now()
      }
    }
  }

  graph.setDirtyCanvas(true, true)
}

/**
 * Fit the canvas view to show all nodes with padding.
 */
export function fitToContent(canvas, graph) {
  if (!canvas || !graph?._nodes?.length) return

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of graph._nodes) {
    const th = LiteGraph.NODE_TITLE_HEIGHT || 30
    minX = Math.min(minX, n.pos[0])
    minY = Math.min(minY, n.pos[1] - th)
    maxX = Math.max(maxX, n.pos[0] + n.size[0])
    maxY = Math.max(maxY, n.pos[1] + n.size[1])
  }

  const pad = 50
  minX -= pad; minY -= pad; maxX += pad; maxY += pad

  const gw = maxX - minX
  const gh = maxY - minY
  const cw = canvas.canvas.width
  const ch = canvas.canvas.height

  const scale = Math.min(cw / gw, ch / gh, 1.2)
  canvas.ds.scale = scale
  canvas.ds.offset[0] = -minX * scale + (cw - gw * scale) / 2
  canvas.ds.offset[1] = -minY * scale + (ch - gh * scale) / 2
  canvas.setDirty(true, true)
}

/**
 * Clean up all pending timers.
 */
export function cleanupTimers() {
  for (const timer of _linkTimers.values()) clearTimeout(timer)
  _linkTimers.clear()
}

export { SERVICES, STATUS_COLORS }
