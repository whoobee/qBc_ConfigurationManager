<template>
  <div class="settings-page">
    <h3 class="section-title">
      <svg class="section-icon" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10 3a1 1 0 01.894.553l1.17 2.348 2.592.376a1 1 0 01.554 1.706l-1.876 1.83.443 2.58a1 1 0 01-1.451 1.054L10 12.347l-2.326 1.1a1 1 0 01-1.451-1.054l.443-2.58-1.876-1.83a1 1 0 01.554-1.706l2.592-.376 1.17-2.348A1 1 0 0110 3z"/>
      </svg>
      Audio Volume
    </h3>

    <div class="volume-card bp-card bp-corners">
      <!-- Global Volume -->
      <div class="volume-row">
        <div class="volume-header">
          <span class="volume-label">Global Volume</span>
          <span class="volume-hint">Scales all other volumes proportionally</span>
        </div>
        <div class="slider-group">
          <input
            type="range" min="0" max="100" step="1"
            :value="globalVolume"
            @input="onGlobalInput"
            class="bp-slider bp-slider--primary"
          />
          <span class="volume-value mono">{{ globalVolume }}%</span>
        </div>
      </div>

      <div class="volume-divider"></div>

      <!-- Animation Volume -->
      <div class="volume-row">
        <div class="volume-header">
          <span class="volume-label">Animation Sounds</span>
          <span class="volume-hint">Sound effects triggered by face animations</span>
        </div>
        <div class="slider-group">
          <input
            type="range" min="0" max="100" step="1"
            :value="animationVolume"
            @input="onAnimationInput"
            class="bp-slider"
          />
          <span class="volume-value mono">{{ animationVolume }}%</span>
        </div>
        <div class="effective-volume mono">
          Effective: {{ effectiveAnimation }}%
        </div>
      </div>

      <div class="volume-divider"></div>

      <!-- AI Reply Volume -->
      <div class="volume-row">
        <div class="volume-header">
          <span class="volume-label">Robot AI Reply</span>
          <span class="volume-hint">Text-to-speech voice responses from AI</span>
        </div>
        <div class="slider-group">
          <input
            type="range" min="0" max="100" step="1"
            :value="aiReplyVolume"
            @input="onAiReplyInput"
            class="bp-slider"
          />
          <span class="volume-value mono">{{ aiReplyVolume }}%</span>
        </div>
        <div class="effective-volume mono">
          Effective: {{ effectiveAiReply }}%
        </div>
      </div>
    </div>

    <!-- Eye Color -->
    <h3 class="section-title section-gap">
      <svg class="section-icon" viewBox="0 0 20 20" fill="currentColor">
        <circle cx="10" cy="10" r="7"/>
      </svg>
      Eye Color
    </h3>

    <div class="volume-card bp-card bp-corners">
      <div class="color-grid">
        <button
          v-for="c in eyeColors"
          :key="c.name"
          class="color-swatch"
          :class="{ active: selectedColor === c.name }"
          :style="{ '--swatch-r': c.rgb[0], '--swatch-g': c.rgb[1], '--swatch-b': c.rgb[2] }"
          :title="c.name"
          @click="onColorSelect(c.name)"
        >
          <span class="swatch-dot"></span>
          <span class="swatch-label mono">{{ c.name }}</span>
        </button>
      </div>
    </div>

    <!-- Status indicator -->
    <div class="save-status mono" :class="{ visible: showSaved }">
      Settings saved
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useMqttStore } from '../../stores/mqtt.js'

const mqttStore = useMqttStore()

const globalVolume = ref(100)
const animationVolume = ref(50)
const aiReplyVolume = ref(50)
const selectedColor = ref('orange')
const showSaved = ref(false)

const eyeColors = [
  { name: 'orange',  rgb: [255, 100, 0] },
  { name: 'amber',   rgb: [255, 191, 0] },
  { name: 'purple',  rgb: [180, 100, 255] },
  { name: 'ice',     rgb: [200, 230, 255] },
  { name: 'cyan',    rgb: [0,   255, 255] },
  { name: 'green',   rgb: [80,  255, 120] },
  { name: 'red',     rgb: [255, 60,  60] },
  { name: 'pink',    rgb: [255, 105, 180] },
  { name: 'white',   rgb: [255, 255, 255] },
]

let saveTimeout = null
let unsubscribe = null
let unsubscribeDisplay = null

const effectiveAnimation = computed(() =>
  Math.round(animationVolume.value * globalVolume.value / 100)
)
const effectiveAiReply = computed(() =>
  Math.round(aiReplyVolume.value * globalVolume.value / 100)
)

async function loadSettings() {
  try {
    const resp = await fetch('/api/settings/audio')
    if (resp.ok) {
      const data = await resp.json()
      globalVolume.value = data.global_volume ?? 100
      animationVolume.value = data.animation_volume ?? 50
      aiReplyVolume.value = data.ai_reply_volume ?? 50
    }
  } catch (e) {
    console.warn('[settings] Failed to load:', e)
  }
}

function saveSettings() {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(async () => {
    try {
      const resp = await fetch('/api/settings/audio', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          global_volume: globalVolume.value,
          animation_volume: animationVolume.value,
          ai_reply_volume: aiReplyVolume.value,
        }),
      })
      if (resp.ok) {
        showSaved.value = true
        setTimeout(() => { showSaved.value = false }, 1500)
      }
    } catch (e) {
      console.warn('[settings] Failed to save:', e)
    }
  }, 300)
}

function onGlobalInput(e) {
  globalVolume.value = Number(e.target.value)
  saveSettings()
}
function onAnimationInput(e) {
  animationVolume.value = Number(e.target.value)
  saveSettings()
}
function onAiReplyInput(e) {
  aiReplyVolume.value = Number(e.target.value)
  saveSettings()
}

async function loadDisplaySettings() {
  try {
    const resp = await fetch('/api/settings/display')
    if (resp.ok) {
      const data = await resp.json()
      selectedColor.value = data.eye_color ?? 'orange'
    }
  } catch (e) {
    console.warn('[settings] Failed to load display:', e)
  }
}

async function onColorSelect(name) {
  selectedColor.value = name
  try {
    const resp = await fetch('/api/settings/display', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eye_color: name }),
    })
    if (resp.ok) {
      showSaved.value = true
      setTimeout(() => { showSaved.value = false }, 1500)
    }
  } catch (e) {
    console.warn('[settings] Failed to save display:', e)
  }
}

onMounted(() => {
  loadSettings()
  loadDisplaySettings()
  // Listen for external changes via MQTT
  unsubscribe = mqttStore.subscribe('robot/settings/audio', (_topic, payload) => {
    try {
      const data = typeof payload === 'string' ? JSON.parse(payload) : payload
      globalVolume.value = data.global_volume ?? globalVolume.value
      animationVolume.value = data.animation_volume ?? animationVolume.value
      aiReplyVolume.value = data.ai_reply_volume ?? aiReplyVolume.value
    } catch (e) { /* ignore */ }
  })
  unsubscribeDisplay = mqttStore.subscribe('robot/settings/display', (_topic, payload) => {
    try {
      const data = typeof payload === 'string' ? JSON.parse(payload) : payload
      if (data.eye_color) selectedColor.value = data.eye_color
    } catch (e) { /* ignore */ }
  })
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
  if (unsubscribeDisplay) unsubscribeDisplay()
  if (saveTimeout) clearTimeout(saveTimeout)
})
</script>

<style scoped>
.settings-page {
  max-width: 700px;
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

.volume-card {
  padding: 24px;
  background: linear-gradient(135deg, var(--bg-card), var(--bg-elevated));
}

.volume-row {
  padding: 12px 0;
}

.volume-header {
  margin-bottom: 10px;
}
.volume-label {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-bright);
}
.volume-hint {
  display: block;
  margin-top: 2px;
  font-size: 0.75rem;
  color: var(--text-dim);
}

.slider-group {
  display: flex;
  align-items: center;
  gap: 16px;
}

.volume-value {
  min-width: 48px;
  text-align: right;
  font-size: 1rem;
  color: var(--glow-primary);
  text-shadow: 0 0 8px rgba(0, 212, 255, 0.3);
}

.effective-volume {
  margin-top: 4px;
  font-size: 0.7rem;
  color: var(--text-dim);
  letter-spacing: 1px;
}

.volume-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 4px 0;
}

/* ── Range slider styling ── */
.bp-slider {
  -webkit-appearance: none;
  appearance: none;
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--bg-hover);
  outline: none;
  cursor: pointer;
}
.bp-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--glow-secondary);
  border: 2px solid var(--glow-primary);
  box-shadow: 0 0 8px rgba(0, 212, 255, 0.4);
  cursor: pointer;
  transition: box-shadow var(--transition-fast);
}
.bp-slider::-webkit-slider-thumb:hover {
  box-shadow: 0 0 16px rgba(0, 212, 255, 0.6);
}
.bp-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--glow-secondary);
  border: 2px solid var(--glow-primary);
  box-shadow: 0 0 8px rgba(0, 212, 255, 0.4);
  cursor: pointer;
}

/* Primary slider (global) gets a brighter track */
.bp-slider--primary {
  height: 6px;
  background: linear-gradient(90deg, var(--bg-hover), rgba(0, 212, 255, 0.15));
}
.bp-slider--primary::-webkit-slider-thumb {
  width: 22px;
  height: 22px;
  background: var(--glow-primary);
  box-shadow: 0 0 12px rgba(0, 212, 255, 0.5);
}

/* ── Section gap ── */
.section-gap {
  margin-top: 28px;
}

/* ── Color picker grid ── */
.color-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 10px;
}

.color-swatch {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}
.color-swatch:hover {
  border-color: var(--border-bright);
}
.color-swatch.active {
  border-color: rgb(var(--swatch-r), var(--swatch-g), var(--swatch-b));
  box-shadow: 0 0 12px rgba(var(--swatch-r), var(--swatch-g), var(--swatch-b), 0.4);
}

.swatch-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgb(var(--swatch-r), var(--swatch-g), var(--swatch-b));
  box-shadow: 0 0 8px rgba(var(--swatch-r), var(--swatch-g), var(--swatch-b), 0.5);
}
.color-swatch.active .swatch-dot {
  box-shadow: 0 0 16px rgba(var(--swatch-r), var(--swatch-g), var(--swatch-b), 0.7);
}

.swatch-label {
  font-size: 0.65rem;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 1px;
}
.color-swatch.active .swatch-label {
  color: var(--text-bright);
}

/* Save status */
.save-status {
  margin-top: 12px;
  font-size: 0.75rem;
  color: var(--glow-success);
  letter-spacing: 1px;
  opacity: 0;
  transition: opacity 0.3s ease;
}
.save-status.visible {
  opacity: 1;
}
</style>
