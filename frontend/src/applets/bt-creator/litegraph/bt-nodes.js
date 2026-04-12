/**
 * Custom LiteGraph node types for Behavior Tree editing and visualization.
 *
 * Maps all qBc_Behavior node types (from schema.py) to LiteGraph nodes.
 * Colors match gui/theme.py for visual consistency.
 */
import { LiteGraph } from 'litegraph.js'

// ── Color constants (from theme.py) ──
const COLORS = {
  composite:  '#4a90d9',
  decorator:  '#9b59b6',
  condition:  '#d4a017',
  action:     '#2ecc71',
  timer:      '#27ae60',
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

      ctx.restore()
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
  makeBTNode('Actions', 'WaitForEvent', COLORS.timer, {
    required: { key: 'str' },
    optional: { timeout_sec: 'float' },
  })
  makeBTNode('Actions', 'TimerBehavior', COLORS.timer, {
    required: { duration_sec: 'float' },
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

  // Apply status to nodes
  for (const update of updates) {
    const lgNode = graph._nodes?.find(n =>
      n.properties?._btId === update.id || n.title === update.id
    )
    if (lgNode) {
      lgNode.btStatus = update.status || null
      if (update.message) lgNode.properties._message = update.message
    }
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
    WaitForEvent: 'Actions', TimerBehavior: 'Actions',
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
export function buildGraphFromDescriptor(graph, descriptor) {
  graph.clear()

  const root = descriptor?.root
  if (!root) return

  const SPACING_X = 280
  const SPACING_Y = 100

  function createNode(desc, x, y) {
    const category = getCategoryForType(desc.type)
    const typePath = `${getCategoryForType(desc.type)}/${desc.type}`
    const lgNode = LiteGraph.createNode(typePath)
    if (!lgNode) {
      console.warn('Unknown BT node type:', desc.type, '- skipping')
      return { node: null, bottomY: y }
    }

    lgNode.title = desc.name || desc.type
    lgNode.properties._btId = desc.name || desc.type

    // Set properties from the params block
    if (desc.params) {
      for (const [k, v] of Object.entries(desc.params)) {
        lgNode.properties[k] = v
      }
    }
    // Also pick up top-level keys that map to registered properties (e.g. memory)
    const reserved = new Set(['type', 'name', 'children', 'child', 'params'])
    for (const [k, v] of Object.entries(desc)) {
      if (!reserved.has(k) && k in lgNode.properties) {
        lgNode.properties[k] = v
      }
    }

    lgNode.pos = [x, y]
    graph.add(lgNode)

    // Collect child descriptors
    const isComposite = COMPOSITE_SET.has(desc.type)
    const isDecorator = DECORATOR_SET.has(desc.type)
    let childDescs = []
    if (isComposite && Array.isArray(desc.children)) {
      childDescs = desc.children
    } else if (isDecorator && desc.child) {
      childDescs = [desc.child]
    }

    // Recursively create children
    let childY = y
    const childNodes = []
    for (const childDesc of childDescs) {
      const result = createNode(childDesc, x + SPACING_X, childY)
      if (result.node) {
        childNodes.push(result.node)
        childY = result.bottomY + SPACING_Y
      }
    }

    // Connect parent → children
    const outName = isComposite ? 'children' : 'child'
    for (const childLg of childNodes) {
      const outSlot = lgNode.findOutputSlot(outName)
      const inSlot = childLg.findInputSlot('parent')
      if (outSlot !== -1 && inSlot !== -1) {
        lgNode.connect(outSlot, childLg, inSlot)
      }
    }

    // Center parent vertically among its children
    if (childNodes.length > 0) {
      lgNode.pos[1] = (childNodes[0].pos[1] + childNodes[childNodes.length - 1].pos[1]) / 2
    }

    return { node: lgNode, bottomY: childNodes.length > 0 ? childY - SPACING_Y : y }
  }

  createNode(root, 50, 50)

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

export { STATUS_COLORS, COLORS, getCategoryForType }
