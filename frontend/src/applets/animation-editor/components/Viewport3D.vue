<template>
  <div ref="containerRef" class="viewport3d">
    <div v-if="error" class="viewport-error mono text-xs">
      ERROR: {{ error }}
    </div>
    <div v-else-if="loading" class="viewport-loading mono text-xs text-dim">
      LOADING RIG…
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, defineExpose, defineEmits } from 'vue'
import { createViewport } from '../viewport/viewport.js'

const emit = defineEmits(['rig-select', 'rig-save', 'rig-ready'])

const containerRef = ref(null)
const loading = ref(true)
const error = ref(null)

let viewport = null

onMounted(async () => {
  try {
    viewport = await createViewport(containerRef.value, {
      onRigSelect: (sel) => emit('rig-select', sel),
      onRigSave: () => emit('rig-save'),
    })
    loading.value = false
    // Publish joint metadata so the inspectors can render sliders bound
    // to axis + limits. Emitted once after the rig has finished loading.
    const meta = []
    for (const [name, j] of viewport.joints) {
      meta.push({ name, axis: j.axis, limits: [...j.limits] })
    }
    emit('rig-ready', meta)
  } catch (e) {
    console.error('[animation-editor] viewport init failed', e)
    error.value = e?.message || String(e)
    loading.value = false
  }
})

onBeforeUnmount(() => {
  viewport?.dispose()
  viewport = null
})

// ── Rig Mode surface ──
// Thin passthrough so the page (which owns toolbar state) can drive the
// edit controller without reaching into the viewport internals.
defineExpose({
  enableRigMode() { viewport?.rigEdit?.enable() },
  disableRigMode() { viewport?.rigEdit?.disable() },
  cancelRigMode() { viewport?.rigEdit?.cancel() },
  getRigLiveConfig() { return viewport?.rigEdit?.getLiveConfig() },
  updateJointMeta(name, patch) { viewport?.rigEdit?.updateJointMeta(name, patch) },
  setCameraMode(mode) { viewport?.setCameraMode?.(mode) },
  getCameraMode() { return viewport?.getCameraMode?.() || 'persp' },
  getJointMeta() {
    if (!viewport) return []
    const out = []
    for (const [name, j] of viewport.joints) {
      out.push({ name, axis: j.axis, limits: [...j.limits] })
    }
    return out
  },
})
</script>

<style scoped>
.viewport3d {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}
.viewport-loading,
.viewport-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.viewport-error { color: #ff6b6b; }
</style>
