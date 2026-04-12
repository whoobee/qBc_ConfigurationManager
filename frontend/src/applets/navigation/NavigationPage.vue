<template>
  <div class="navigation-page">
    <!-- Status bar -->
    <NavStatus :state="navState" @explore="triggerExplore" />

    <!-- Main content: two-column layout -->
    <div class="nav-grid">
      <!-- Left: Path image viewer -->
      <div class="nav-panel nav-panel--wide">
        <h3 class="section-title">
          <svg class="section-icon" viewBox="0 0 20 20" fill="currentColor">
            <path d="M4 4l6 3 6-3v12l-6-3-6 3V4z"/>
          </svg>
          Path View
        </h3>
        <PathViewer />
      </div>

      <!-- Right: Motor vector + Command log -->
      <div class="nav-panel-stack">
        <div class="nav-panel">
          <h3 class="section-title">
            <svg class="section-icon" viewBox="0 0 20 20" fill="currentColor">
              <polygon points="10,2 18,18 10,14 2,18"/>
            </svg>
            Motor Control
          </h3>
          <MotorVector :motor="motorData" />
        </div>
        <div class="nav-panel nav-panel--grow">
          <h3 class="section-title">
            <svg class="section-icon" viewBox="0 0 20 20" fill="currentColor">
              <rect x="2" y="3" width="16" height="2" rx="1"/>
              <rect x="2" y="8" width="16" height="2" rx="1"/>
              <rect x="2" y="13" width="12" height="2" rx="1"/>
            </svg>
            Command Log
          </h3>
          <CommandLog :entries="logEntries" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useMqttStore } from '../../stores/mqtt.js'
import NavStatus from './components/NavStatus.vue'
import PathViewer from './components/PathViewer.vue'
import MotorVector from './components/MotorVector.vue'
import CommandLog from './components/CommandLog.vue'

const mqttStore = useMqttStore()

const navState = ref({
  status: 'offline',
  nav_state: 'idle',
  current_waypoint: 0,
  total_waypoints: 0,
  tracking_features: 0,
  neck_deg: 0,
})

const motorData = ref({
  left_vel: 0, right_vel: 0,
  linear: 0, angular: 0,
  direction_deg: 0, speed_magnitude: 0,
  neck_deg: 0, description: 'stopped',
})
const logEntries = ref([])

const MAX_LOG_ENTRIES = 100
let unsubs = []

function triggerExplore() {
  mqttStore.publish('robot/ai/explore/cmd', { command: 'explore' }, 1)
}

let viewerInterval = null

onMounted(() => {
  unsubs.push(mqttStore.subscribe('robot/navigation/state', (topic, payload) => {
    navState.value = payload
  }))

  unsubs.push(mqttStore.subscribe('robot/navigation/debug/motor', (topic, payload) => {
    motorData.value = payload
  }))

  unsubs.push(mqttStore.subscribe('robot/navigation/debug/log', (topic, payload) => {
    logEntries.value.push(payload)
    if (logEntries.value.length > MAX_LOG_ENTRIES) {
      logEntries.value.shift()
    }
  }))

  // Publish viewer heartbeat so the navigation service knows to capture frames.
  // Stops immediately when we leave this page (interval cleared in onUnmounted).
  mqttStore.publish('robot/navigation/stream/viewer', { active: true }, 0)
  viewerInterval = setInterval(() => {
    mqttStore.publish('robot/navigation/stream/viewer', { active: true }, 0)
  }, 1000)
})

onUnmounted(() => {
  // Stop viewer heartbeat — navigation service will stop capturing
  if (viewerInterval) {
    clearInterval(viewerInterval)
    viewerInterval = null
  }
  mqttStore.publish('robot/navigation/stream/viewer', { active: false }, 0)
  unsubs.forEach(fn => fn())
})
</script>

<style scoped>
.navigation-page {
  max-width: 1400px;
}

.nav-grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 16px;
  margin-top: 16px;
}

.nav-panel {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
}

.nav-panel--wide {
  min-height: 400px;
}

.nav-panel-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.nav-panel--grow {
  flex: 1;
  min-height: 0;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px 0;
  font-size: 0.8rem;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 2px;
}

.section-icon {
  width: 14px;
  height: 14px;
  color: var(--glow-primary);
  opacity: 0.6;
}

@media (max-width: 900px) {
  .nav-grid {
    grid-template-columns: 1fr;
  }
}
</style>
