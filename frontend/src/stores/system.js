/**
 * System status store.
 *
 * Tracks service heartbeats and state in real-time via MQTT.
 */
import { defineStore } from 'pinia'
import { ref, reactive, onUnmounted } from 'vue'
import { useMqttStore } from './mqtt.js'

export const useSystemStore = defineStore('system', () => {
  const services = reactive({})
  const mqttConnected = ref(false)
  let unsubs = []
  let ageTimer = null

  function init() {
    const mqtt = useMqttStore()

    unsubs.push(mqtt.subscribe('robot/system/heartbeat/#', (topic, payload) => {
      const name = topic.split('/').pop()
      if (!services[name]) {
        services[name] = { alive: true, lastSeen: Date.now(), age: 0, state: {}, currentState: null, errorInfo: null }
      }
      services[name].lastSeen = Date.now()
      services[name].alive = true
      services[name].age = 0
    }))

    unsubs.push(mqtt.subscribe('robot/+/state', (topic, payload) => {
      const parts = topic.split('/')
      const name = parts[1]
      if (!services[name]) {
        services[name] = { alive: false, lastSeen: null, age: null, state: {}, currentState: null, errorInfo: null }
      }
      services[name].state = payload
    }))

    unsubs.push(mqtt.subscribe('robot/+/current_state', (topic, payload) => {
      const parts = topic.split('/')
      const name = parts[1]
      if (!services[name]) {
        services[name] = { alive: false, lastSeen: null, age: null, state: {}, currentState: null, errorInfo: null }
      }
      services[name].currentState = typeof payload === 'string' ? payload : String(payload)
    }))

    unsubs.push(mqtt.subscribe('robot/+/error_info', (topic, payload) => {
      const parts = topic.split('/')
      const name = parts[1]
      if (!services[name]) {
        services[name] = { alive: false, lastSeen: null, age: null, state: {}, currentState: null, errorInfo: null }
      }
      services[name].errorInfo = typeof payload === 'string' ? payload : String(payload)
    }))

    // Age tracker - mark services dead if no heartbeat for 5s
    ageTimer = setInterval(() => {
      const now = Date.now()
      for (const [name, svc] of Object.entries(services)) {
        if (svc.lastSeen) {
          svc.age = Math.round((now - svc.lastSeen) / 1000 * 10) / 10
          svc.alive = svc.age < 5
        }
      }
    }, 1000)
  }

  function destroy() {
    unsubs.forEach(fn => fn())
    unsubs = []
    if (ageTimer) clearInterval(ageTimer)
  }

  return { services, mqttConnected, init, destroy }
})
