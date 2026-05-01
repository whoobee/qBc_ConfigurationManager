/**
 * Custom LiteGraph node types for Behavior Tree editing and visualization.
 *
 * Maps all qBc_Behavior node types (from schema.py) to LiteGraph nodes.
 * Colors match gui/theme.py for visual consistency.
 */
import { LiteGraph } from 'litegraph.js'

// ── Color constants (from theme.py) ──
const COLORS = {
  composite:   '#4a90d9',
  decorator:   '#9b59b6',
  condition:   '#d4a017',
  action:      '#2ecc71',
  timer:       '#27ae60',
  exploration: '#e67e22',
  subtree:     '#16a085',
}

const STATUS_COLORS = {
  SUCCESS: '#00ff88',
  FAILURE: '#ff3366',
  RUNNING: '#00d4ff',
  INVALID: '#666666',
}

const BG = '#111d35'
const BG_SELECTED = '#1a2d4d'

let registered = false

/**
 * Register all BT node types with LiteGraph.
 * Safe to call multiple times (idempotent).
 */
export function registerBTNodeTypes() {
  if (registered) return
  registered = true

  // Clear any LiteGraph built-in node types so only BT nodes appear
  LiteGraph.clearRegisteredTypes()

  // ── Helper: create a BT node class ──
  function makeBTNode(category, typeName, color, params = {}) {
    const required = params.required || {}
    const optional = params.optional || {}

    function BTNode() {
      // Parent input (connects to parent composite/decorator)
      this.addInput('parent', 'bt_link')

      // If composite, add children output
      if (category === 'Composites') {
        this.addOutput('children', 'bt_link')
      }
      // If decorator, add single child output
      if (category === 'Decorators') {
        this.addOutput('child', 'bt_link')
      }

      // Properties from schema
      for (const [key, type] of Object.entries(required)) {
        this.addProperty(key, getDefault(type))
      }
      for (const [key, type] of Object.entries(optional)) {
        this.addProperty(key, getDefault(type))
      }

      // BT metadata
      this.btType = typeName
      this.btCategory = category
      this.btStatus = null  // for visualizer

      this.title = typeName
      this.color = color
      this.bgcolor = BG
      this.boxcolor = color
      this.shape = LiteGraph.ROUND_SHAPE
      this.size = [200, 60]
    }

    BTNode.title = typeName
    BTNode.desc = `${category}: ${typeName}`

    BTNode.prototype.onDrawForeground = function (ctx) {
      // Isolate from LiteGraph shadow/transform state
      ctx.save()
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0

      // Draw status indicator (only for active statuses, not INVALID)
      const activeStatus = this.btStatus && STATUS_COLORS[this.btStatus] && this.btStatus !== 'INVALID'
      if (activeStatus) {
        const statusColor = STATUS_COLORS[this.btStatus]
        // Colored left-edge bar instead of a dot
        ctx.fillStyle = statusColor
        ctx.fillRect(-4, 0, 4, this.size[1])
      }

      // Draw execution order badge if this node is a child of a composite/decorator
      if (this._execOrder != null) {
        const bx = -10, by = 10, br = 9
        ctx.fillStyle = '#4a90d9'
        ctx.beginPath()
        ctx.arc(bx, by, br, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 11px Share Tech Mono'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(this._execOrder), bx, by)
        ctx.textAlign = 'left'
        ctx.textBaseline = 'alphabetic'
      }

      // Draw type label: CATEGORY — TYPE
      ctx.fillStyle = 'rgba(200, 214, 229, 0.4)'
      ctx.font = '9px Share Tech Mono'
      ctx.fillText(`${category.toUpperCase()} \u2014 ${typeName.toUpperCase()}`, 8, this.size[1] - 6)

      // Subtree bubble: draw an expand/collapse chevron in the top-right
      if (this._isSubtreeBubble) {
        ctx.fillStyle = '#16a085'
        ctx.font = 'bold 14px Share Tech Mono'
        ctx.textAlign = 'right'
        ctx.fillText(this._subtreeExpanded ? '\u25BC' : '\u25B6',
          this.size[0] - 8, 18)
        ctx.textAlign = 'left'
      }

      ctx.restore()
    }

    // Double-click toggles expansion when this is a subtree bubble.
    BTNode.prototype.onDblClick = function () {
      if (!this._isSubtreeBubble || !this.graph) return false
      if (this._subtreeExpanded) collapseSubtree(this.graph, this)
      else expandSubtree(this.graph, this)
      return true
    }

    BTNode.prototype.onSelected = function () {
      this.bgcolor = BG_SELECTED
    }

    BTNode.prototype.onDeselected = function () {
      this.bgcolor = BG
    }

    // Register with LiteGraph — flat category so right-click shows BT nodes directly
    LiteGraph.registerNodeType(`${category}/${typeName}`, BTNode)
  }

  function getDefault(type) {
    if (type === 'float' || type === 'int' || type === 'number') return 0
    if (type === 'bool' || type === 'boolean') return false
    if (type === 'str' || type === 'string') return ''
    if (type === 'dict' || type === 'object') return {}
    return null
  }

  // ── Register Composites ──
  makeBTNode('Composites', 'Sequence', COLORS.composite, { optional: { memory: 'bool' } })
  makeBTNode('Composites', 'Selector', COLORS.composite, { optional: { memory: 'bool' } })
  makeBTNode('Composites', 'Parallel', COLORS.composite, { optional: { policy: 'str' } })
  makeBTNode('Composites', 'RandomSelector', COLORS.composite, { optional: { memory: 'bool' } })

  // ── Register Decorators ──
  makeBTNode('Decorators', 'Inverter', COLORS.decorator)
  makeBTNode('Decorators', 'Timeout', COLORS.decorator, { required: { duration_sec: 'float' } })
  makeBTNode('Decorators', 'RunningIsSuccess', COLORS.decorator)
  makeBTNode('Decorators', 'FailureIsSuccess', COLORS.decorator)
  makeBTNode('Decorators', 'SuccessIsFailure', COLORS.decorator)
  makeBTNode('Decorators', 'CooldownGuard', COLORS.decorator, { required: { cooldown_sec: 'float' } })

  // ── Register Conditions ──
  makeBTNode('Conditions', 'BlackboardCondition', COLORS.condition, {
    required: { key: 'str', operator: 'str' },
    optional: { value: 'str', default: 'str' },
  })
  makeBTNode('Conditions', 'EventCheck', COLORS.condition, {
    required: { key: 'str' },
    optional: { max_age_sec: 'float', consume: 'bool' },
  })
  makeBTNode('Conditions', 'HeartbeatCheck', COLORS.condition, {
    required: { key: 'str' },
    optional: { max_age_sec: 'float' },
  })

  // ── Register Actions ──
  makeBTNode('Actions', 'PlayAnimation', COLORS.action, {
    optional: { expression: 'str', duration: 'float', color: 'str', joints: 'dict' },
  })
  makeBTNode('Actions', 'PlayAudio', COLORS.action, {
    required: { file: 'str' },
    optional: { volume: 'int' },
  })
  makeBTNode('Actions', 'MoveJoint', COLORS.action, {
    required: { joint_name: 'str', target_position: 'float' },
    optional: { duration: 'float', movement_type: 'str' },
  })
  makeBTNode('Actions', 'SendCommand', COLORS.action, {
    required: { topic: 'str', payload: 'dict' },
    optional: { qos: 'int' },
  })
  makeBTNode('Actions', 'DriveWheels', COLORS.action, {
    optional: { left_vel: 'float', right_vel: 'float' },
  })
  makeBTNode('Actions', 'DriveDistance', COLORS.action, {
    required: { distance_mm: 'float' },
    optional: { speed_rpm: 'float', curvature: 'float', timeout_safety_factor: 'float' },
  })
  makeBTNode('Actions', 'WaitForEvent', COLORS.timer, {
    required: { key: 'str' },
    optional: { timeout_sec: 'float' },
  })
  makeBTNode('Actions', 'TimerBehavior', COLORS.timer, {
    required: { duration_sec: 'float' },
  })

  // ── Register Exploration ──
  makeBTNode('Exploration', 'PickFreeDirection', COLORS.exploration, {
    optional: { source_key: 'str', output_key: 'str', min_clearance_mm: 'float' },
  })

  // ── Register Subtrees ──
  makeBTNode('Subtrees', 'CallSubtree', COLORS.subtree, {
    required: { tree_path: 'str' },
  })
}

/**
 * Build a LiteGraph graph from a BT tree state snapshot (for the visualizer).
 *
 * @param {LGraph} graph - LiteGraph instance
 * @param {Array} nodes - Array of node objects from tree_state snapshot
 */
export function buildGraphFromSnapshot(graph, nodes) {
  graph.clear()

  if (!nodes || nodes.length === 0) return

  const nodeMap = new Map()  // id -> LGraphNode
  const SPACING_X = 250
  const SPACING_Y = 90

  // First pass: create all nodes
  for (const n of nodes) {
    const liteType = `${getCategoryForType(n.type)}/${n.type}`
    const lgNode = LiteGraph.createNode(liteType)
    if (!lgNode) continue

    lgNode.title = n.name || n.type
    lgNode.btStatus = n.status || null
    lgNode.properties._btId = n.id
    if (n.message) lgNode.properties._message = n.message
    graph.add(lgNode)
    nodeMap.set(n.id, lgNode)
  }

  // Second pass: layout tree with simple depth-first positioning
  const positioned = new Set()
  function layout(nodeId, x, y) {
    const lgNode = nodeMap.get(nodeId)
    if (!lgNode || positioned.has(nodeId)) return y
    positioned.add(nodeId)

    lgNode.pos = [x, y]

    const btNode = nodes.find(n => n.id === nodeId)
    if (btNode && btNode.children) {
      let childY = y
      for (const childId of btNode.children) {
        const childLg = nodeMap.get(childId)
        if (childLg) {
          // Connect parent -> child
          const parentOut = lgNode.findOutputSlot('children') !== -1 ? 'children' : 'child'
          const outSlot = lgNode.findOutputSlot(parentOut)
          const inSlot = childLg.findInputSlot('parent')
          if (outSlot !== -1 && inSlot !== -1) {
            lgNode.connect(outSlot, childLg, inSlot)
          }
          childY = layout(childId, x + SPACING_X, childY)
          childY += SPACING_Y
        }
      }
      // Center parent vertically over children
      if (btNode.children.length > 0) {
        const firstChild = nodeMap.get(btNode.children[0])
        const lastChild = nodeMap.get(btNode.children[btNode.children.length - 1])
        if (firstChild && lastChild) {
          lgNode.pos[1] = (firstChild.pos[1] + lastChild.pos[1]) / 2
        }
      }
      return Math.max(y, childY - SPACING_Y)
    }
    return y
  }

  // Find root (node with no parent)
  const rootNode = nodes.find(n => n.parent === null || n.parent === undefined)
  if (rootNode) {
    layout(rootNode.id, 50, 50)
  }

  graph.setDirtyCanvas(true, true)
}

/**
 * Update node statuses and link colors from tick data (for the visualizer).
 *
 * Accepts either a full node list or a diff change list.
 * Colors links between parent→child based on child status:
 *   RUNNING = cyan, SUCCESS = green, FAILURE = red, else dim grey.
 */
const LINK_STATUS_COLORS = {
  SUCCESS: '#00ff88',
  FAILURE: '#ff3366',
  RUNNING: '#00d4ff',
}
const LINK_INACTIVE = '#333333'

export function updateNodeStatuses(graph, updates) {
  if (!updates || !graph) return

  // Pre-collect subtree bubbles for prefix-based aggregation
  const bubbles = (graph._nodes || []).filter(n => n._isSubtreeBubble)

  // Apply status to nodes
  for (const update of updates) {
    let matched = false
    const lgNode = graph._nodes?.find(n =>
      n.properties?._btId === update.id || n.title === update.id
    )
    if (lgNode) {
      lgNode.btStatus = update.status || null
      if (update.message) lgNode.properties._message = update.message
      matched = true
    }

    // Track member statuses for any subtree bubble whose prefix matches.
    // Members live under "<bubblePrefix>...". When the bubble is collapsed
    // the inner LGraphNodes don't exist, so this is the only way to surface
    // subtree activity on the bubble itself.
    for (const bubble of bubbles) {
      if (update.id && update.id.startsWith(bubble._subtreePrefix)) {
        bubble._subtreeMemberStatuses[update.id] = update.status || null
        matched = true
      }
    }
    void matched
  }

  // Aggregate each bubble's status from its tracked member statuses.
  // Priority: RUNNING > FAILURE > SUCCESS > null.
  for (const bubble of bubbles) {
    const statuses = Object.values(bubble._subtreeMemberStatuses)
    if (statuses.length === 0) continue
    let agg = null
    if (statuses.includes('RUNNING')) agg = 'RUNNING'
    else if (statuses.includes('FAILURE')) agg = 'FAILURE'
    else if (statuses.every(s => s === 'SUCCESS')) agg = 'SUCCESS'
    bubble.btStatus = agg
  }

  // Color all links based on the target (child) node's status
  if (graph.links) {
    for (const linkId in graph.links) {
      const link = graph.links[linkId]
      if (!link) continue
      const targetNode = graph.getNodeById(link.target_id)
      if (targetNode && targetNode.btStatus) {
        link.color = LINK_STATUS_COLORS[targetNode.btStatus] || LINK_INACTIVE
      } else {
        link.color = LINK_INACTIVE
      }
    }
  }

  graph.setDirtyCanvas(true, true)
}

function getCategoryForType(type) {
  const categories = {
    Sequence: 'Composites', Selector: 'Composites', Parallel: 'Composites', RandomSelector: 'Composites',
    Inverter: 'Decorators', Timeout: 'Decorators', RunningIsSuccess: 'Decorators',
    FailureIsSuccess: 'Decorators', SuccessIsFailure: 'Decorators', CooldownGuard: 'Decorators',
    BlackboardCondition: 'Conditions', EventCheck: 'Conditions', HeartbeatCheck: 'Conditions',
    PlayAnimation: 'Actions', PlayAudio: 'Actions', MoveJoint: 'Actions', SendCommand: 'Actions',
    DriveWheels: 'Actions', DriveDistance: 'Actions',
    WaitForEvent: 'Actions', TimerBehavior: 'Actions',
    PickFreeDirection: 'Exploration',
    CallSubtree: 'Subtrees',
  }
  return categories[type] || 'Actions'
}

// ── Sets for category lookup ──
const COMPOSITE_SET = new Set(['Sequence', 'Selector', 'Parallel', 'RandomSelector'])
const DECORATOR_SET = new Set(['Inverter', 'Timeout', 'RunningIsSuccess', 'FailureIsSuccess', 'SuccessIsFailure', 'CooldownGuard'])

/**
 * Build a LiteGraph graph from a YAML tree descriptor (for the BT Creator).
 *
 * @param {LGraph} graph - LiteGraph instance
 * @param {Object} descriptor - Full tree descriptor ({tree, blackboard, root})
 */
const SUBTREE_GROUP_COLOR = '#16a085'
const SPACING_X = 280
const SPACING_Y = 100

/**
 * Recursively create a LiteGraph subtree from a descriptor.
 *
 * @param {LGraph} graph
 * @param {Object} desc - descriptor node
 * @param {number} x, y - position
 * @param {Object} opts - { prefix, collected }
 *   prefix: string prepended to each node's _btId so it matches the
 *           runtime-published name (which inlines subtrees with prefixes).
 *   collected: optional array; if provided, every spawned LGraphNode is
 *           pushed to it (used by expandSubtree to track members).
 */
function _createDescriptorNode(graph, desc, x, y, opts = {}) {
  const prefix = opts.prefix || ''
  const collected = opts.collected || null

  const category = getCategoryForType(desc.type)
  const typePath = `${category}/${desc.type}`
  const lgNode = LiteGraph.createNode(typePath)
  if (!lgNode) {
    console.warn('Unknown BT node type:', desc.type, '- skipping')
    return { node: null, bottomY: y }
  }

  const localName = desc.name || desc.type
  lgNode.title = localName
  lgNode.properties._btId = prefix + localName

  if (desc.params) {
    for (const [k, v] of Object.entries(desc.params)) {
      lgNode.properties[k] = v
    }
  }
  const reserved = new Set(['type', 'name', 'children', 'child', 'params'])
  for (const [k, v] of Object.entries(desc)) {
    if (!reserved.has(k) && k in lgNode.properties) {
      lgNode.properties[k] = v
    }
  }

  lgNode.pos = [x, y]
  graph.add(lgNode)
  if (collected) collected.push(lgNode)

  // Subtree bubble: tag for expand/collapse, do NOT recurse into the YAML's
  // children (the YAML has none anyway — this is just safe metadata).
  if (desc.type === 'CallSubtree') {
    const treePath = (desc.params?.tree_path || '').replace(/\.yaml$/, '')
    lgNode._isSubtreeBubble = true
    lgNode._subtreeTreePath = treePath
    lgNode._subtreePrefix = prefix + localName + '/'
    lgNode._subtreeExpanded = false
    lgNode._subtreeMemberIds = []
    lgNode._subtreeGroupRef = null
    lgNode._subtreeMemberStatuses = {}
    return { node: lgNode, bottomY: y }
  }

  const isComposite = COMPOSITE_SET.has(desc.type)
  const isDecorator = DECORATOR_SET.has(desc.type)
  let childDescs = []
  if (isComposite && Array.isArray(desc.children)) childDescs = desc.children
  else if (isDecorator && desc.child) childDescs = [desc.child]

  let childY = y
  const childNodes = []
  for (const childDesc of childDescs) {
    const result = _createDescriptorNode(graph, childDesc, x + SPACING_X, childY, opts)
    if (result.node) {
      childNodes.push(result.node)
      childY = result.bottomY + SPACING_Y
    }
  }

  const outName = isComposite ? 'children' : 'child'
  for (const childLg of childNodes) {
    const outSlot = lgNode.findOutputSlot(outName)
    const inSlot = childLg.findInputSlot('parent')
    if (outSlot !== -1 && inSlot !== -1) {
      lgNode.connect(outSlot, childLg, inSlot)
    }
  }

  if (childNodes.length > 0) {
    lgNode.pos[1] = (childNodes[0].pos[1] + childNodes[childNodes.length - 1].pos[1]) / 2
  }

  return { node: lgNode, bottomY: childNodes.length > 0 ? childY - SPACING_Y : y }
}

export function buildGraphFromDescriptor(graph, descriptor) {
  graph.clear()
  const root = descriptor?.root
  if (!root) return
  _createDescriptorNode(graph, root, 50, 50)

  // Restore groups if saved in the descriptor
  if (Array.isArray(descriptor._groups)) {
    for (const gd of descriptor._groups) {
      const group = new LiteGraph.LGraphGroup()
      group.title = gd.title || 'Group'
      group.color = gd.color || '#335'
      group._bounding = gd.bounding || [0, 0, 400, 300]
      group.font_size = gd.font_size || 24
      graph.add(group)
    }
  }

  graph.setDirtyCanvas(true, true)
}

/**
 * Export a LiteGraph graph back to a YAML-compatible tree descriptor (for the BT Creator).
 *
 * @param {LGraph} graph - LiteGraph instance
 * @returns {Object|null} root node descriptor, or null if graph is empty
 */
export function exportGraphToDescriptor(graph) {
  const nodes = graph._nodes || []
  if (nodes.length === 0) return null

  // Find root: node whose parent input slot has no link
  let rootNode = null
  for (const node of nodes) {
    const parentSlot = node.findInputSlot('parent')
    if (parentSlot === -1 || !node.inputs?.[parentSlot]?.link) {
      rootNode = node
      break
    }
  }
  if (!rootNode) return null

  function getChildren(lgNode, outputName) {
    const outSlot = lgNode.findOutputSlot(outputName)
    if (outSlot === -1) return []
    const linkIds = lgNode.outputs?.[outSlot]?.links || []
    const children = []
    for (const linkId of linkIds) {
      const link = graph.links[linkId]
      if (link) {
        const child = graph.getNodeById(link.target_id)
        if (child) children.push(child)
      }
    }
    // Sort by Y position — top-to-bottom determines execution order
    children.sort((a, b) => a.pos[1] - b.pos[1])
    return children
  }

  function exportNode(lgNode) {
    const desc = {
      type: lgNode.btType,
      name: lgNode.title || lgNode.btType,
    }

    // Export properties → params
    const params = {}
    const skip = new Set(['_btId', '_message'])
    for (const [k, v] of Object.entries(lgNode.properties || {})) {
      if (skip.has(k)) continue
      if (v === null || v === undefined) continue
      // Skip empty strings and empty objects (default values from registration)
      if (v === '' || (typeof v === 'object' && Object.keys(v).length === 0)) continue

      // For composites, 'memory' goes at descriptor top level
      if (COMPOSITE_SET.has(lgNode.btType) && k === 'memory') {
        desc.memory = v
      } else {
        params[k] = v
      }
    }
    if (Object.keys(params).length > 0) {
      desc.params = params
    }

    // Export children
    if (COMPOSITE_SET.has(lgNode.btType)) {
      desc.children = getChildren(lgNode, 'children').map(exportNode)
    } else if (DECORATOR_SET.has(lgNode.btType)) {
      const kids = getChildren(lgNode, 'child')
      if (kids.length > 0) {
        desc.child = exportNode(kids[0])
      }
    }

    return desc
  }

  return exportNode(rootNode)
}

/**
 * Recompute execution order badges for all nodes in the graph.
 * Call this after any structural change (add/remove/move nodes or links).
 */
export function recomputeExecOrder(graph) {
  const nodes = graph._nodes || []

  // Clear all
  for (const n of nodes) {
    n._execOrder = null
  }

  // For each composite/decorator, sort its children by Y and assign order badge
  for (const n of nodes) {
    const outName = COMPOSITE_SET.has(n.btType) ? 'children' : DECORATOR_SET.has(n.btType) ? 'child' : null
    if (!outName) continue
    const outSlot = n.findOutputSlot(outName)
    if (outSlot === -1) continue
    const linkIds = n.outputs?.[outSlot]?.links || []
    const children = []
    for (const linkId of linkIds) {
      const link = graph.links[linkId]
      if (link) {
        const child = graph.getNodeById(link.target_id)
        if (child) children.push(child)
      }
    }
    children.sort((a, b) => a.pos[1] - b.pos[1])
    const badge = n.btType === 'Parallel' ? 'P' : n.btType === 'RandomSelector' ? 'R' : null
    children.forEach((child, i) => { child._execOrder = badge || i + 1 })
  }

  graph.setDirtyCanvas(true, true)
}

/**
 * Export LiteGraph groups as a serializable array.
 * Groups are visual containers (not BT nodes) used for organizing the canvas.
 */
export function exportGroups(graph) {
  const groups = graph._groups || []
  return groups.map(g => ({
    title: g.title,
    color: g.color,
    bounding: g._bounding ? [...g._bounding] : [0, 0, 400, 300],
    font_size: g.font_size || 24,
  }))
}

/**
 * Expand a CallSubtree bubble: fetch the referenced YAML and inline its
 * nodes to the right of the bubble, wrapped in a tinted LGraphGroup.
 *
 * Spawned nodes' _btId is prefixed with `${bubbleName}/` so live tick
 * updates from the runtime (which inlines subtrees with that same prefix)
 * resolve correctly.
 */
export async function expandSubtree(graph, bubble) {
  if (!bubble || !bubble._isSubtreeBubble || bubble._subtreeExpanded) return
  const treePath = bubble._subtreeTreePath
  if (!treePath) return

  let descriptor
  try {
    const resp = await fetch(`/api/trees/${encodeURIComponent(treePath)}.yaml`)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    descriptor = await resp.json()
  } catch (e) {
    console.warn(`[CallSubtree] failed to load '${treePath}.yaml':`, e)
    return
  }

  const subRoot = descriptor?.root
  if (!subRoot) return

  const startX = bubble.pos[0] + SPACING_X
  const startY = bubble.pos[1]
  const collected = []
  _createDescriptorNode(graph, subRoot, startX, startY, {
    prefix: bubble._subtreePrefix,
    collected,
  })

  // Wrap in a group titled with the subtree path for visual containment.
  if (collected.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of collected) {
      const [nx, ny] = n.pos
      const [nw, nh] = n.size
      if (nx < minX) minX = nx
      if (ny < minY) minY = ny
      if (nx + nw > maxX) maxX = nx + nw
      if (ny + nh > maxY) maxY = ny + nh
    }
    const pad = 20
    const group = new LiteGraph.LGraphGroup()
    group.title = `subtree: ${treePath}`
    group.color = SUBTREE_GROUP_COLOR
    group._bounding = [
      minX - pad, minY - pad - 24,
      (maxX - minX) + 2 * pad, (maxY - minY) + 2 * pad + 24,
    ]
    group.font_size = 18
    graph.add(group)
    bubble._subtreeGroupRef = group
  }

  bubble._subtreeMemberIds = collected.map(n => n.id)
  bubble._subtreeExpanded = true

  // Re-apply tracked member statuses so spawned nodes light up immediately
  // without waiting for the next diff tick.
  for (const n of collected) {
    const s = bubble._subtreeMemberStatuses[n.properties._btId]
    if (s) n.btStatus = s
  }

  graph.setDirtyCanvas(true, true)
}

/**
 * Collapse a CallSubtree bubble: remove all nodes spawned by expandSubtree
 * and the wrapping group. Tracked member statuses are kept so the bubble
 * continues to display an aggregated status.
 */
export function collapseSubtree(graph, bubble) {
  if (!bubble || !bubble._isSubtreeBubble || !bubble._subtreeExpanded) return

  for (const id of bubble._subtreeMemberIds || []) {
    const node = graph.getNodeById(id)
    if (node) graph.remove(node)
  }
  bubble._subtreeMemberIds = []

  if (bubble._subtreeGroupRef) {
    // LiteGraph stores groups in graph._groups
    const groups = graph._groups || []
    const idx = groups.indexOf(bubble._subtreeGroupRef)
    if (idx !== -1) groups.splice(idx, 1)
    bubble._subtreeGroupRef = null
  }

  bubble._subtreeExpanded = false
  graph.setDirtyCanvas(true, true)
}

export { STATUS_COLORS, COLORS, getCategoryForType }
