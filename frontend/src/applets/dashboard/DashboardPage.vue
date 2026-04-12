<template>
  <div class="dashboard">
    <!-- Hero system status -->
    <div class="hero-section bp-card bp-corners">
      <div class="hero-grid">
        <div class="hero-stat">
          <span class="hero-value text-glow mono">{{ aliveCount }}</span>
          <span class="hero-label">SERVICES ONLINE</span>
        </div>
        <div class="hero-stat">
          <span class="hero-value mono" :class="mqttConnected ? 'text-glow' : 'text-danger'">
            {{ mqttConnected ? 'LINKED' : 'DISCONNECTED' }}
          </span>
          <span class="hero-label">MQTT BROKER</span>
        </div>
        <div class="hero-stat">
          <span class="hero-value text-glow mono">{{ messageRate }}</span>
          <span class="hero-label">MESSAGES / SEC</span>
        </div>
        <div class="hero-stat">
          <span class="hero-value mono">{{ uptimeStr }}</span>
          <span class="hero-label">SESSION UPTIME</span>
        </div>
      </div>

      <div class="hero-divider"></div>

      <!-- Control buttons -->
      <div class="control-row">
        <button
          class="ctrl-btn ctrl-btn--start"
          :disabled="launching"
          @click="startServices"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="ctrl-icon"><polygon points="5,3 17,10 5,17"/></svg>
          {{ launching ? 'STARTING...' : 'START SERVICES' }}
        </button>
        <button
          class="ctrl-btn ctrl-btn--stop"
          @click="stopServices"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="ctrl-icon"><rect x="4" y="4" width="12" height="12" rx="1.5"/></svg>
          STOP SERVICES
        </button>
        <div class="ctrl-spacer"></div>
        <button class="ctrl-btn ctrl-btn--reboot" @click="confirmReboot">
          <svg viewBox="0 0 20 20" fill="currentColor" class="ctrl-icon"><path d="M10 2v6m0 0a6 6 0 110 12 6 6 0 010-12z"/></svg>
          REBOOT
        </button>
        <button class="ctrl-btn ctrl-btn--shutdown" @click="confirmShutdown">
          <svg viewBox="0 0 20 20" fill="currentColor" class="ctrl-icon"><circle cx="10" cy="12" r="6"/><rect x="9" y="2" width="2" height="8"/></svg>
          SHUTDOWN
        </button>
      </div>
    </div>

    <!-- Raspberry Pi hardware stats -->
    <h3 class="section-title">
      <svg class="section-icon" viewBox="0 0 20 20" fill="currentColor">
        <path d="M13 7H7v6h6V7z"/>
        <path fill-rule="evenodd" d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h1a2 2 0 012 2v1h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v1a2 2 0 01-2 2h-1v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H6a2 2 0 01-2-2v-1H3a1 1 0 110-2h1V8H3a1 1 0 010-2h1V5a2 2 0 012-2h1V2z"/>
      </svg>
      Raspberry Pi 5
    </h3>
    <HardwareStats :rpi="metrics.rpi" />

    <!-- AXCL Accelerator stats -->
    <h3 class="section-title" style="margin-top: 24px;">
      <svg class="section-icon" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10 1l-7 4v6l7 4 7-4V5l-7-4zM5 7.5L10 5l5 2.5L10 10 5 7.5z"/>
      </svg>
      AXCL Accelerator
    </h3>
    <AcceleratorStats :axcl="metrics.axcl" />

    <!-- Service cards grid -->
    <h3 class="section-title" style="margin-top: 24px;">
      <svg class="section-icon" viewBox="0 0 20 20" fill="currentColor">
        <rect x="2" y="2" width="7" height="7" rx="1.5"/>
        <rect x="11" y="2" width="7" height="7" rx="1.5"/>
        <rect x="2" y="11" width="7" height="7" rx="1.5"/>
        <rect x="11" y="11" width="7" height="7" rx="1.5"/>
      </svg>
      Service Status
    </h3>
    <div class="service-grid">
      <ServiceCard
        v-for="(svc, name) in services"
        :key="name"
        :name="name"
        :alive="svc.alive"
        :age="svc.age"
        :state="svc.state"
        :currentState="svc.currentState"
        :errorInfo="svc.errorInfo"
        :loadingPercent="loadingProgress[name]?.percent ?? null"
        :loadingMessage="loadingProgress[name]?.message ?? ''"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, reactive, onMounted, onUnmounted } from 'vue'
import { useMqttStore } from '../../stores/mqtt.js'
import { useSystemStore } from '../../stores/system.js'
import ServiceCard from './components/ServiceCard.vue'
import HardwareStats from './components/HardwareStats.vue'
import AcceleratorStats from './components/AcceleratorStats.vue'

const mqttStore = useMqttStore()
const systemStore = useSystemStore()

const mqttConnected = computed(() => mqttStore.connected)
const messageRate = computed(() => mqttStore.messageRate)
const services = computed(() => systemStore.services)
const loadingProgress = computed(() => systemStore.loadingProgress)

const aliveCount = computed(() =>
  Object.values(systemStore.services).filter(s => s.alive).length
)

const launching = ref(false)

async function startServices() {
  launching.value = true
  try {
    await fetch('/api/system/services/start', { method: 'POST' })
  } catch (e) { /* ignore */ }
  // Poll until launching is done
  const poll = setInterval(async () => {
    try {
      const resp = await fetch('/api/system/services/launcher')
      if (resp.ok) {
        const data = await resp.json()
        if (!data.launching) {
          launching.value = false
          clearInterval(poll)
        }
      }
    } catch (e) { /* ignore */ }
  }, 2000)
  // Safety timeout
  setTimeout(() => { launching.value = false; clearInterval(poll) }, 60000)
}

async function stopServices() {
  try {
    await fetch('/api/system/services/stop', { method: 'POST' })
  } catch (e) { /* ignore */ }
}

function confirmShutdown() {
  if (confirm('Shutdown the Raspberry Pi? The web interface will become unavailable.')) {
    fetch('/api/system/shutdown', { method: 'POST' })
  }
}

function confirmReboot() {
  if (confirm('Reboot the Raspberry Pi? Services will restart automatically.')) {
    fetch('/api/system/reboot', { method: 'POST' })
  }
}

// Hardware metrics (polled every 3 seconds)
const metrics = reactive({
  rpi: {},
  axcl: { available: false },
})

let metricsTimer = null

async function fetchMetrics() {
  try {
    const resp = await fetch('/api/system/metrics')
    if (resp.ok) {
      const data = await resp.json()
      metrics.rpi = data.rpi || {}
      metrics.axcl = data.axcl || { available: false }
    }
  } catch (e) {
    // Silently retry next cycle
  }
}

// Uptime
const uptimeStr = ref('00:00:00')
const startTime = Date.now()
let uptimeTimer = null

onMounted(() => {
  uptimeTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000)
    const h = String(Math.floor(elapsed / 3600)).padStart(2, '0')
    const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')
    const s = String(elapsed % 60).padStart(2, '0')
    uptimeStr.value = `${h}:${m}:${s}`
  }, 1000)

  // Fetch metrics immediately and then every 3 seconds
  fetchMetrics()
  metricsTimer = setInterval(fetchMetrics, 3000)
})

onUnmounted(() => {
  if (uptimeTimer) clearInterval(uptimeTimer)
  if (metricsTimer) clearInterval(metricsTimer)
})
</script>

<style scoped>
.dashboard {
  max-width: 1200px;
}

.hero-section {
  padding: 24px;
  margin-bottom: 24px;
  background: linear-gradient(135deg, var(--bg-card), var(--bg-elevated));
}

.hero-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border-default), transparent);
  margin: 20px 0 16px;
}

.control-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.ctrl-spacer {
  flex: 1;
  min-width: 20px;
}

.ctrl-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 6px;
  font-family: var(--text-mono);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid;
}
.ctrl-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ctrl-icon {
  width: 14px;
  height: 14px;
}

.ctrl-btn--start {
  color: #00e676;
  border-color: rgba(0, 230, 118, 0.3);
  background: rgba(0, 230, 118, 0.08);
}
.ctrl-btn--start:hover:not(:disabled) {
  background: rgba(0, 230, 118, 0.18);
  box-shadow: 0 0 12px rgba(0, 230, 118, 0.2);
}

.ctrl-btn--stop {
  color: #ff9800;
  border-color: rgba(255, 152, 0, 0.3);
  background: rgba(255, 152, 0, 0.08);
}
.ctrl-btn--stop:hover {
  background: rgba(255, 152, 0, 0.18);
  box-shadow: 0 0 12px rgba(255, 152, 0, 0.2);
}

.ctrl-btn--reboot {
  color: #ffd600;
  border-color: rgba(255, 214, 0, 0.3);
  background: rgba(255, 214, 0, 0.06);
}
.ctrl-btn--reboot:hover {
  background: rgba(255, 214, 0, 0.15);
}

.ctrl-btn--shutdown {
  color: #ff3366;
  border-color: rgba(255, 51, 102, 0.3);
  background: rgba(255, 51, 102, 0.06);
}
.ctrl-btn--shutdown:hover {
  background: rgba(255, 51, 102, 0.15);
  box-shadow: 0 0 12px rgba(255, 51, 102, 0.2);
}

.hero-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 24px;
}

.hero-stat {
  text-align: center;
}
.hero-value {
  display: block;
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--glow-primary);
  margin-bottom: 4px;
}
.hero-value.text-danger {
  color: var(--glow-danger);
  text-shadow: 0 0 10px rgba(255, 51, 102, 0.5);
}
.hero-label {
  font-family: var(--text-mono);
  font-size: 0.7rem;
  color: var(--text-dim);
  letter-spacing: 2px;
  text-transform: uppercase;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  font-size: 0.9rem;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 2px;
}
.section-icon {
  width: 16px;
  height: 16px;
  color: var(--glow-primary);
  opacity: 0.6;
}

.service-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}
</style>
