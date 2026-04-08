/**
 * Central MQTT/WebSocket store.
 *
 * Manages the WebSocket connection to the backend MQTT bridge and
 * provides reactive subscribe/publish for any component or store.
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useMqttStore = defineStore('mqtt', () => {
  const connected = ref(false)
  const clientCount = ref(0)
  const messageRate = ref(0)

  let ws = null
  let subscribers = new Map()  // topic pattern -> Set<callback>
  let msgCount = 0
  let rateInterval = null
  let reconnectTimer = null

  function _getWsUrl() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    return `${proto}://${location.host}/ws`
  }

  function connect() {
    if (ws && ws.readyState <= 1) return

    const url = _getWsUrl()
    ws = new WebSocket(url)

    ws.onopen = () => {
      connected.value = true
      // Re-subscribe all existing patterns
      const patterns = [...subscribers.keys()]
      if (patterns.length > 0) {
        ws.send(JSON.stringify({ type: 'subscribe', topics: patterns }))
      }
    }

    ws.onclose = () => {
      connected.value = false
      // Auto-reconnect
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null
          connect()
        }, 2000)
      }
    }

    ws.onerror = () => {
      connected.value = false
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'message') {
          msgCount++
          _dispatch(msg.topic, msg.payload, msg.timestamp)
        } else if (msg.type === 'status') {
          clientCount.value = msg.client_count || 0
        }
      } catch (e) {
        console.warn('[mqtt] Parse error:', e)
      }
    }

    // Track message rate
    if (!rateInterval) {
      rateInterval = setInterval(() => {
        messageRate.value = msgCount
        msgCount = 0
      }, 1000)
    }
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (ws) {
      ws.close()
      ws = null
    }
    connected.value = false
  }

  function subscribe(topicPattern, callback) {
    if (!subscribers.has(topicPattern)) {
      subscribers.set(topicPattern, new Set())
      // Tell server to subscribe
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'subscribe', topics: [topicPattern] }))
      }
    }
    subscribers.get(topicPattern).add(callback)

    // Return unsubscribe function
    return () => {
      const set = subscribers.get(topicPattern)
      if (set) {
        set.delete(callback)
        if (set.size === 0) {
          subscribers.delete(topicPattern)
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'unsubscribe', topics: [topicPattern] }))
          }
        }
      }
    }
  }

  function publish(topic, payload, qos = 1) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'publish', topic, payload, qos }))
    }
  }

  function _dispatch(topic, payload, timestamp) {
    for (const [pattern, callbacks] of subscribers) {
      if (_matchTopic(pattern, topic)) {
        for (const cb of callbacks) {
          try { cb(topic, payload, timestamp) } catch (e) { console.error(e) }
        }
      }
    }
  }

  function _matchTopic(pattern, topic) {
    const pp = pattern.split('/')
    const tp = topic.split('/')
    for (let i = 0; i < pp.length; i++) {
      if (pp[i] === '#') return true
      if (pp[i] === '+') continue
      if (i >= tp.length || pp[i] !== tp[i]) return false
    }
    return pp.length === tp.length
  }

  return {
    connected,
    clientCount,
    messageRate,
    connect,
    disconnect,
    subscribe,
    publish,
  }
})
