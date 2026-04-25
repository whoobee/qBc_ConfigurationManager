<template>
  <div class="controls-page">
    <div class="page-header">
      <h2 class="page-title">Actuator Controls</h2>
      <ArmBar :armed="armed" @toggle="toggleArm" />
    </div>

    <div v-if="!armed" class="disarmed-banner">
      <span class="banner-icon">!</span>
      Controls disabled — press <b>ARM</b> to start publishing to MQTT.
    </div>

    <div class="controls-grid">
      <section class="panel">
        <h3 class="section-title">
          <svg class="section-icon" viewBox="0 0 20 20" fill="currentColor">
            <rect x="3" y="6" width="14" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <circle cx="10" cy="10" r="1.5"/>
          </svg>
          Servos
        </h3>
        <ServoControls :armed="armed" @send="publishServo" />
      </section>

      <section class="panel">
        <h3 class="section-title">
          <svg class="section-icon" viewBox="0 0 20 20" fill="currentColor">
            <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <circle cx="10" cy="10" r="3"/>
          </svg>
          Wheel Motors
        </h3>
        <MotorControls :armed="armed" @send="publishWheels" />
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import { useMqttStore } from '../../stores/mqtt.js'
import ArmBar from './components/ArmBar.vue'
import ServoControls from './components/ServoControls.vue'
import MotorControls from './components/MotorControls.vue'

const mqttStore = useMqttStore()
const armed = ref(false)

function toggleArm() {
  if (armed.value) {
    // Disarming — always force wheels to zero first (bypasses the gate).
    mqttStore.publish('robot/wheels/cmd', { left_vel: 0, right_vel: 0 }, 1)
    armed.value = false
  } else {
    armed.value = true
  }
}

function publishServo(cmd) {
  if (!armed.value) return
  mqttStore.publish('robot/joints/cmd', cmd, 1)
}

function publishWheels(cmd) {
  if (!armed.value) return
  mqttStore.publish('robot/wheels/cmd', cmd, 1)
}

onUnmounted(() => {
  // Leaving the page while armed — send a wheel stop as a safety fallback.
  if (armed.value) {
    mqttStore.publish('robot/wheels/cmd', { left_vel: 0, right_vel: 0 }, 1)
  }
})
</script>

<style scoped>
.controls-page {
  max-width: 1400px;
  padding-bottom: 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  gap: 16px;
}

.page-title {
  margin: 0;
  font-size: 1.4rem;
  color: var(--text-primary);
  letter-spacing: 1px;
}

.disarmed-banner {
  background: rgba(255, 145, 0, 0.08);
  border: 1px solid rgba(255, 145, 0, 0.35);
  color: #ffb74d;
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 0.8rem;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.banner-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #ff9100;
  color: #000;
  font-weight: bold;
  font-size: 0.75rem;
}

.controls-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

.panel {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  min-width: 0;
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
</style>
