/**
 * LiteGraph.js Vue composable.
 *
 * Wraps LiteGraph canvas lifecycle in a Vue-friendly pattern.
 * Handles canvas creation, resizing, and cleanup.
 */
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { LGraph, LGraphCanvas, LiteGraph } from 'litegraph.js'
import 'litegraph.js/css/litegraph.css'

/**
 * Blueprint theme configuration for LiteGraph canvas.
 */
const BLUEPRINT_CONFIG = {
  background_color: '#060a14',
  clear_background_color: '#060a14',
  default_link_color: '#0088ff',
  connecting_link_color: '#00d4ff',
  node_title_color: '#ffffff',
  default_shadow_color: 'rgba(0,0,0,0.4)',
  render_shadows: true,
  render_canvas_border: false,
  render_connection_arrows: true,
  render_curved_connections: true,
  connections_width: 2,
  links_render_mode: LiteGraph.SPLINE_LINK,
}

export function useLiteGraph(containerRef, options = {}) {
  const graph = ref(null)
  const canvas = ref(null)
  let resizeObserver = null

  function init() {
    if (!containerRef.value) return

    const canvasEl = document.createElement('canvas')
    canvasEl.style.width = '100%'
    canvasEl.style.height = '100%'
    containerRef.value.appendChild(canvasEl)

    const g = new LGraph()
    const c = new LGraphCanvas(canvasEl, g)

    // Apply blueprint theme
    LiteGraph.NODE_TEXT_COLOR = '#ffffff'
    LiteGraph.NODE_TITLE_COLOR = '#ffffff'
    Object.assign(c, BLUEPRINT_CONFIG)

    // Draw blueprint grid
    c.render_canvas_border = false
    c.background_color = '#060a14'
    c.clear_background_color = '#060a14'

    // Custom grid rendering
    const origDrawBack = c.drawBackCanvas.bind(c)
    c.drawBackCanvas = function () {
      origDrawBack()
      // Draw subtle grid on top
      const ctx = this.bgcanvas.getContext('2d')
      if (!ctx) return
      const s = this.ds.scale
      const startX = -this.ds.offset[0] % (40 * s)
      const startY = -this.ds.offset[1] % (40 * s)
      ctx.strokeStyle = 'rgba(0, 136, 255, 0.05)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = startX; x < this.bgcanvas.width; x += 40 * s) {
        ctx.moveTo(x, 0)
        ctx.lineTo(x, this.bgcanvas.height)
      }
      for (let y = startY; y < this.bgcanvas.height; y += 40 * s) {
        ctx.moveTo(0, y)
        ctx.lineTo(this.bgcanvas.width, y)
      }
      ctx.stroke()
    }

    if (options.readonly) {
      c.allow_interaction = true
      c.allow_dragnodes = false
      c.allow_searchbox = false
    }

    graph.value = g
    canvas.value = c

    // Handle resizing
    function resize() {
      if (!containerRef.value || !canvasEl) return
      const rect = containerRef.value.getBoundingClientRect()
      canvasEl.width = rect.width
      canvasEl.height = rect.height
      c.resize(rect.width, rect.height)
    }

    resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(containerRef.value)
    resize()

    // Start rendering
    g.start()

    if (options.onReady) {
      options.onReady(g, c)
    }
  }

  function destroy() {
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
    if (graph.value) {
      graph.value.stop()
      graph.value.clear()
    }
    if (containerRef.value) {
      containerRef.value.innerHTML = ''
    }
    graph.value = null
    canvas.value = null
  }

  onMounted(init)
  onBeforeUnmount(destroy)

  return { graph, canvas, destroy, init }
}
