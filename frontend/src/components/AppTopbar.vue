<template>
  <header class="topbar">
    <div class="topbar-left">
      <h2 class="page-title">{{ pageTitle }}</h2>
    </div>
    <div class="topbar-right">
      <div class="stat-pill mono text-xs" :class="rpiTempClass" :title="rpiTempTitle">
        <span class="stat-label">PI</span>
        <span class="stat-value">{{ rpiTempStr }}</span>
      </div>
      <div
        class="stat-pill mono text-xs"
        :class="axclTempClass"
        :title="axclTempTitle"
      >
        <span class="stat-label">AXCL</span>
        <span class="stat-value">{{ axclTempStr }}</span>
      </div>
      <div class="stat-pill mono text-xs">
        <span class="stat-label">MSG/S</span>
        <span class="stat-value text-accent">{{ messageRate }}</span>
      </div>
      <div class="stat-pill mono text-xs">
        <span class="stat-label">WS</span>
        <span class="stat-value" :class="connected ? 'text-accent' : ''">
          {{ connected ? 'LINKED' : 'OFFLINE' }}
        </span>
      </div>
      <div class="topbar-time mono text-xs text-dim">{{ currentTime }}</div>
    </div>
  </header>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useMqttStore } from '../stores/mqtt.js'

const route = useRoute()
const mqtt = useMqttStore()

const connected = computed(() => mqtt.connected)
const messageRate = computed(() => mqtt.messageRate)
const pageTitle = computed(() => route.meta?.title || 'qB Companion')

const currentTime = ref('')
const rpiTempC = ref(null)
const axclTempC = ref(null)
const axclAvailable = ref(false)
let timer = null
let metricsTimer = null

const rpiTempStr = computed(() =>
  rpiTempC.value != null ? `${Math.round(rpiTempC.value)}\u00B0C` : '--'
)
const axclTempStr = computed(() => {
  if (!axclAvailable.value) return 'n/a'
  return axclTempC.value != null ? `${Math.round(axclTempC.value)}\u00B0C` : '--'
})

function tempClass(t, warn, danger) {
  if (t == null) return ''
  if (t >= danger) return 'pill--danger'
  if (t >= warn) return 'pill--warn'
  return 'pill--ok'
}

const rpiTempClass = computed(() => tempClass(rpiTempC.value, 65, 80))
const axclTempClass = computed(() =>
  axclAvailable.value ? tempClass(axclTempC.value, 75, 90) : ''
)
const rpiTempTitle = computed(() =>
  rpiTempC.value != null ? `Raspberry Pi CPU: ${rpiTempC.value}\u00B0C` : 'Raspberry Pi CPU temperature'
)
const axclTempTitle = computed(() => {
  if (!axclAvailable.value) return 'AXCL accelerator not detected'
  return axclTempC.value != null ? `AXCL accelerator: ${axclTempC.value}\u00B0C` : 'AXCL accelerator temperature'
})

async function fetchMetrics() {
  try {
    const resp = await fetch('/api/system/metrics')
    if (!resp.ok) return
    const data = await resp.json()
    rpiTempC.value = data?.rpi?.cpu_temp_c ?? null
    axclAvailable.value = !!data?.axcl?.available
    axclTempC.value = data?.axcl?.temp_c ?? null
  } catch (e) {
    // silently retry
  }
}

onMounted(() => {
  timer = setInterval(() => {
    currentTime.value = new Date().toLocaleTimeString('en-GB', { hour12: false })
  }, 1000)
  fetchMetrics()
  metricsTimer = setInterval(fetchMetrics, 3000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  if (metricsTimer) clearInterval(metricsTimer)
})
</script>

<style scoped>
.topbar {
  height: var(--topbar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title {
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--text-bright);
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  transition: border-color 0.2s, box-shadow 0.2s;
}
.stat-label {
  color: var(--text-dim);
}
.stat-value {
  font-weight: bold;
}

.pill--ok {
  border-color: rgba(0, 230, 118, 0.35);
}
.pill--ok .stat-value {
  color: #00e676;
}

.pill--warn {
  border-color: rgba(255, 214, 0, 0.45);
  box-shadow: 0 0 6px rgba(255, 214, 0, 0.15);
}
.pill--warn .stat-value {
  color: #ffd600;
}

.pill--danger {
  border-color: rgba(255, 51, 102, 0.55);
  box-shadow: 0 0 8px rgba(255, 51, 102, 0.3);
  animation: pill-pulse 1.6s ease-in-out infinite;
}
.pill--danger .stat-value {
  color: #ff3366;
}

@keyframes pill-pulse {
  0%, 100% { box-shadow: 0 0 6px rgba(255, 51, 102, 0.25); }
  50%      { box-shadow: 0 0 12px rgba(255, 51, 102, 0.55); }
}
</style>
