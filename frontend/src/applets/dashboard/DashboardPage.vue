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

const aliveCount = computed(() =>
  Object.values(systemStore.services).filter(s => s.alive).length
)

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
