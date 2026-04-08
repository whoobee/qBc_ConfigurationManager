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

    <!-- Service cards grid -->
    <h3 class="section-title">
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
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useMqttStore } from '../../stores/mqtt.js'
import { useSystemStore } from '../../stores/system.js'
import ServiceCard from './components/ServiceCard.vue'

const mqttStore = useMqttStore()
const systemStore = useSystemStore()

const mqttConnected = computed(() => mqttStore.connected)
const messageRate = computed(() => mqttStore.messageRate)
const services = computed(() => systemStore.services)

const aliveCount = computed(() =>
  Object.values(systemStore.services).filter(s => s.alive).length
)

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
})
onUnmounted(() => { if (uptimeTimer) clearInterval(uptimeTimer) })
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
