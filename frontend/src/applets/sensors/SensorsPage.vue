<template>
  <div class="sensors-page">
    <div class="page-header">
      <h2 class="page-title">Sensor Telemetry</h2>
      <div class="freshness" :class="{ 'freshness--stale': stale }">
        <span class="dot"></span>
        {{ stale ? 'stale' : 'live' }}
        <span class="mono age">{{ ageText }}</span>
      </div>
    </div>

    <div class="sensors-grid">
      <!-- Row 1: TOF | IMU -->
      <section class="panel panel--tof">
        <h3 class="section-title">
          <svg class="section-icon" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 10 L7 10 M10 2 L10 7 M13 10 L18 10 M10 13 L10 18" stroke="currentColor" stroke-width="2" fill="none"/>
            <circle cx="10" cy="10" r="2.5"/>
          </svg>
          TOF Sensors
        </h3>
        <TofPanel :tof="tof" />
      </section>

      <section class="panel panel--imu">
        <h3 class="section-title">
          <svg class="section-icon" viewBox="0 0 20 20" fill="currentColor">
            <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <circle cx="10" cy="10" r="2"/>
            <line x1="10" y1="3" x2="10" y2="7" stroke="currentColor" stroke-width="1.5"/>
          </svg>
          IMU
        </h3>
        <ImuPanel :imu="imu" />
      </section>

      <!-- Row 2: Lidar full width -->
      <section class="panel panel--lidar">
        <h3 class="section-title">
          <svg class="section-icon" viewBox="0 0 20 20" fill="currentColor">
            <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2,2"/>
            <circle cx="10" cy="10" r="1.5"/>
          </svg>
          Lidar 360&deg;
        </h3>
        <LidarPolar :scan="lidar" />
      </section>

      <!-- Row 3: Servos full width -->
      <section class="panel panel--servos">
        <h3 class="section-title">
          <svg class="section-icon" viewBox="0 0 20 20" fill="currentColor">
            <rect x="3" y="6" width="14" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <circle cx="10" cy="10" r="1.5"/>
          </svg>
          Servos
        </h3>
        <ServoTable :servos="servos" />
      </section>

      <!-- Row 4: Motors full width -->
      <section class="panel panel--motors">
        <h3 class="section-title">
          <svg class="section-icon" viewBox="0 0 20 20" fill="currentColor">
            <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <circle cx="10" cy="10" r="3"/>
          </svg>
          Wheel Motors
        </h3>
        <MotorTable :motors="motors" />
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useMqttStore } from '../../stores/mqtt.js'
import TofPanel from './components/TofPanel.vue'
import ImuPanel from './components/ImuPanel.vue'
import LidarPolar from './components/LidarPolar.vue'
import ServoTable from './components/ServoTable.vue'
import MotorTable from './components/MotorTable.vue'

const mqttStore = useMqttStore()

const tof = ref({ left_mm: 0, right_mm: 0, back_mm: 0 })
const imu = ref({ roll: 0, pitch: 0, yaw: 0, qw: 1, qx: 0, qy: 0, qz: 0, ax: 0, ay: 0, az: 0 })
const lidar = ref({ bins_mm: new Array(36).fill(0), bin_deg: 10 })
const servos = ref({})   // keyed by joint_name
const motors = ref({})   // keyed by motor name ("left" | "right")

const lastUpdateMs = ref(0)
const nowMs = ref(Date.now())
let tickTimer = null

const ageText = computed(() => {
  if (!lastUpdateMs.value) return '—'
  const ageS = (nowMs.value - lastUpdateMs.value) / 1000
  if (ageS < 1) return `${(ageS * 1000).toFixed(0)}ms`
  if (ageS < 60) return `${ageS.toFixed(1)}s`
  return `${Math.floor(ageS / 60)}m`
})

const stale = computed(() => {
  if (!lastUpdateMs.value) return true
  return (nowMs.value - lastUpdateMs.value) > 3000
})

function markFresh() { lastUpdateMs.value = Date.now() }

let unsubs = []

onMounted(() => {
  unsubs.push(mqttStore.subscribe('robot/sensors/tof', (_t, payload) => {
    tof.value = payload || {}
    markFresh()
  }))

  unsubs.push(mqttStore.subscribe('robot/imu/orientation', (_t, payload) => {
    imu.value = payload || {}
    markFresh()
  }))

  unsubs.push(mqttStore.subscribe('robot/sensors/lidar', (_t, payload) => {
    if (payload && Array.isArray(payload.bins_mm)) {
      lidar.value = payload
      markFresh()
    }
  }))

  unsubs.push(mqttStore.subscribe('robot/joints/telemetry', (_t, payload) => {
    if (payload && payload.joint_name) {
      servos.value = { ...servos.value, [payload.joint_name]: payload }
      markFresh()
    }
  }))

  unsubs.push(mqttStore.subscribe('robot/status/motors', (_t, payload) => {
    if (payload && payload.motor) {
      motors.value = { ...motors.value, [payload.motor]: payload }
      markFresh()
    }
  }))

  tickTimer = setInterval(() => { nowMs.value = Date.now() }, 250)
})

onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer)
  unsubs.forEach(fn => fn())
})
</script>

<style scoped>
.sensors-page {
  max-width: 1400px;
  padding-bottom: 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 16px;
  gap: 16px;
}

.page-title {
  margin: 0;
  font-size: 1.4rem;
  color: var(--text-primary);
  letter-spacing: 1px;
}

.freshness {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--text-dim);
  letter-spacing: 1px;
  text-transform: uppercase;
}

.freshness .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #00e676;
  box-shadow: 0 0 8px #00e676;
}

.freshness--stale .dot {
  background: #ff9100;
  box-shadow: 0 0 8px #ff9100;
}

.age {
  font-family: var(--text-mono);
  color: var(--text-primary);
  margin-left: 4px;
}

.sensors-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.panel {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  min-width: 0;
}

.panel--lidar,
.panel--servos,
.panel--motors {
  grid-column: span 2;
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
  opacity: 0.7;
}

@media (max-width: 900px) {
  .sensors-grid {
    grid-template-columns: 1fr;
  }
  .panel--lidar,
  .panel--servos,
  .panel--motors {
    grid-column: span 1;
  }
}

.mono {
  font-family: var(--text-mono);
}
</style>
