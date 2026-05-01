<template>
  <div class="telemetry-page" ref="pageEl" :class="{ 'is-stacked': stacked }">
    <section class="cam-pane">
      <CameraStream />
    </section>
    <section class="joy-pane">
      <div class="joy-fit" :style="joyFitStyle">
        <Joystick :initial-max-rpm="25" :max-rpm-cap="200" @drive="onManualDrive" />
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useMqttStore } from '../../stores/mqtt.js'
import CameraStream from './components/CameraStream.vue'
import Joystick from '../navigation/components/Joystick.vue'

const mqttStore = useMqttStore()

const pageEl = ref(null)
const pageW = ref(0)
const pageH = ref(0)

// Intrinsic size of the joystick block (matches Joystick.vue layout):
// arm-btn (~30) + gap + 180 (joystick) + speed-row (~28) + readout (~22)
// + help (~26) + 4*10 gaps ≈ 326
const JOY_NAT_W = 240
const JOY_NAT_H = 340

// Switch to vertical stack when the room available width is too narrow to
// host the joystick beside the camera feed (or when shape is portrait-ish).
const stacked = computed(() => {
  if (!pageW.value || !pageH.value) return false
  const aspectIsPortrait = pageW.value / pageH.value < 1.1
  const tooNarrow = pageW.value < JOY_NAT_W + 320 // 320 = sane min camera width
  return aspectIsPortrait || tooNarrow
})

// Compute a uniform scale so the joystick always fits its pane,
// shrinking on small viewports without ever overflowing.
const joyFitStyle = computed(() => {
  if (!pageW.value || !pageH.value) return {}
  let availW, availH
  if (stacked.value) {
    // Stacked layout: joystick pane is below the camera; allow it ~38% of height.
    availH = Math.max(160, pageH.value * 0.38 - 8)
    availW = pageW.value
  } else {
    // Side-by-side: joystick pane gets a fixed slice of width.
    availW = Math.min(JOY_NAT_W + 24, pageW.value * 0.32)
    availH = pageH.value
  }
  const sx = availW / JOY_NAT_W
  const sy = availH / JOY_NAT_H
  const scale = Math.max(0.45, Math.min(1, Math.min(sx, sy)))
  return {
    transform: `scale(${scale})`,
    width: `${JOY_NAT_W}px`,
    height: `${JOY_NAT_H}px`,
  }
})

let resizeObserver = null

function measure() {
  if (!pageEl.value) return
  const rect = pageEl.value.getBoundingClientRect()
  pageW.value = rect.width
  pageH.value = rect.height
}

function onManualDrive(cmd) {
  mqttStore.publish('robot/wheels/cmd', cmd, 0)
}

let viewerInterval = null

onMounted(async () => {
  await nextTick()
  measure()
  resizeObserver = new ResizeObserver(measure)
  resizeObserver.observe(pageEl.value)
  window.addEventListener('resize', measure)

  // Heartbeat to navigation service so it captures frames while we view.
  mqttStore.publish('robot/navigation/stream/viewer', { active: true }, 0)
  viewerInterval = setInterval(() => {
    mqttStore.publish('robot/navigation/stream/viewer', { active: true }, 0)
  }, 1000)
})

onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect()
  window.removeEventListener('resize', measure)
  if (viewerInterval) {
    clearInterval(viewerInterval)
    viewerInterval = null
  }
  mqttStore.publish('robot/navigation/stream/viewer', { active: false }, 0)
})
</script>

<style scoped>
.telemetry-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row;
  gap: 16px;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
}

.telemetry-page.is-stacked {
  flex-direction: column;
}

.cam-pane {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
}

.joy-pane {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  overflow: hidden;
}

.telemetry-page:not(.is-stacked) .joy-pane {
  width: 32%;
  max-width: 280px;
  min-width: 200px;
  height: 100%;
}

.telemetry-page.is-stacked .joy-pane {
  width: 100%;
  height: 38%;
  min-height: 160px;
}

.joy-fit {
  transform-origin: center center;
  flex-shrink: 0;
}
</style>
