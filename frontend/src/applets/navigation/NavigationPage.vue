<template>
  <div class="navigation-page">
    <!-- Status bar -->
    <NavStatus :state="navState" @explore="triggerExplore" @cancel="cancelNavigation" />

    <!-- Main content: two-column layout -->
    <div class="nav-grid">
      <!-- Left: Path image viewer + AI transcript -->
      <div class="nav-panel-stack">
        <div class="nav-panel nav-panel--wide">
          <h3 class="section-title">
            <svg class="section-icon" viewBox="0 0 20 20" fill="currentColor">
              <path d="M4 4l6 3 6-3v12l-6-3-6 3V4z"/>
            </svg>
            Path View
          </h3>
          <PathViewer />
        </div>
        <div class="nav-panel nav-panel--ai">
          <h3 class="section-title">
            <svg class="section-icon" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 2a4 4 0 014 4v1h1a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2h1V6a4 4 0 014-4zm-2 5h4V6a2 2 0 10-4 0v1zm-1 6a1 1 0 100-2 1 1 0 000 2zm6 0a1 1 0 100-2 1 1 0 000 2z"/>
            </svg>
            AI Transcript
          </h3>
          <AiTranscript :request="aiRequest" :response="aiResponse" :result="aiResult" />
        </div>
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
          <MotorVector :motor="motorData" :tof="tofData" />
        </div>
        <div class="nav-panel">
          <h3 class="section-title">
            <svg class="section-icon" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 4a4 4 0 110 8 4 4 0 010-8z"/>
            </svg>
            Manual Drive
          </h3>
          <Joystick :initial-max-rpm="25" @drive="onManualDrive" />
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
import AiTranscript from './components/AiTranscript.vue'
import Joystick from './components/Joystick.vue'

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
const aiRequest = ref(null)
const aiResponse = ref(null)
const aiResult = ref(null)
const tofData = ref({ front_mm: null, back_mm: null })

const MAX_LOG_ENTRIES = 100
let unsubs = []

function triggerExplore() {
  // Reset transcript so the user sees the new request as it streams in
  aiRequest.value = null
  aiResponse.value = null
  aiResult.value = null
  mqttStore.publish('robot/ai/explore/cmd', { command: 'explore' }, 1)
}

function cancelNavigation() {
  mqttStore.publish('robot/navigation/cmd', { command: 'cancel' }, 1)
}

function onManualDrive(cmd) {
  mqttStore.publish('robot/wheels/cmd', cmd, 0)
}

let viewerInterval = null

onMounted(() => {
  unsubs.push(mqttStore.subscribe('robot/navigation/state', (topic, payload) => {
    navState.value = payload
  }))

  unsubs.push(mqttStore.subscribe('robot/navigation/debug/motor', (topic, payload) => {
    motorData.value = payload
  }))

  unsubs.push(mqttStore.subscribe('robot/sensors/tof', (topic, payload) => {
    if (!payload) return
    tofData.value = {
      front_mm: payload.front_mm ?? null,
      back_mm: payload.back_mm ?? null,
    }
  }))

  unsubs.push(mqttStore.subscribe('robot/navigation/debug/log', (topic, payload) => {
    logEntries.value.push(payload)
    if (logEntries.value.length > MAX_LOG_ENTRIES) {
      logEntries.value.shift()
    }
  }))

  // AI state transitions — shows explore pipeline stages
  unsubs.push(mqttStore.subscribe('robot/ai/current_state', (topic, payload) => {
    const state = typeof payload === 'string' ? payload : String(payload)
    // Only log explore-related states and transitions
    if (state.startsWith('explore:') || state === 'ready') {
      logEntries.value.push({
        timestamp: Date.now() / 1000,
        action: 'ai_state',
        details: state,
      })
      if (logEntries.value.length > MAX_LOG_ENTRIES) logEntries.value.shift()
    }
  }))

  // AI explore result — narration and waypoints from VLM
  unsubs.push(mqttStore.subscribe('robot/ai/explore/result', (topic, payload) => {
    if (!payload) return
    aiResult.value = payload
    const wp = payload.waypoints?.length ?? 0
    const narr = payload.analysis ? payload.analysis.substring(0, 80) : ''
    logEntries.value.push({
      timestamp: payload.timestamp || Date.now() / 1000,
      action: 'explore_result',
      details: `${wp} waypoints — "${narr}${narr.length >= 80 ? '...' : ''}"`,
    })
    if (logEntries.value.length > MAX_LOG_ENTRIES) logEntries.value.shift()
  }))

  // AI explore transcript — request prompt + raw VLM response
  unsubs.push(mqttStore.subscribe('robot/ai/explore/transcript', (topic, payload) => {
    if (!payload) return
    if (payload.phase === 'request') {
      aiRequest.value = payload
      aiResponse.value = null
      aiResult.value = null
    } else if (payload.phase === 'response') {
      aiResponse.value = payload
    }
  }))

  // AI voice/TTS events — playback commands
  unsubs.push(mqttStore.subscribe('robot/audio/play', (topic, payload) => {
    if (!payload) return
    const file = payload.file || ''
    if (file.includes('explore') || file.includes('voice')) {
      logEntries.value.push({
        timestamp: Date.now() / 1000,
        action: 'audio_play',
        details: file.split('/').pop(),
      })
      if (logEntries.value.length > MAX_LOG_ENTRIES) logEntries.value.shift()
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

.nav-panel--ai {
  max-height: 360px;
  display: flex;
  flex-direction: column;
}
.nav-panel--ai > :last-child {
  flex: 1;
  min-height: 0;
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
