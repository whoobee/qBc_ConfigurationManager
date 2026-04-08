<template>
  <header class="topbar">
    <div class="topbar-left">
      <h2 class="page-title">{{ pageTitle }}</h2>
    </div>
    <div class="topbar-right">
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
let timer = null

onMounted(() => {
  timer = setInterval(() => {
    currentTime.value = new Date().toLocaleTimeString('en-GB', { hour12: false })
  }, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
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
}
.stat-label {
  color: var(--text-dim);
}
.stat-value {
  font-weight: bold;
}
</style>
