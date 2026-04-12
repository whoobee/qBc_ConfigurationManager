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

    <!-- Language -->
    <h3 class="section-title section-gap">
      <svg class="section-icon" viewBox="0 0 20 20" fill="currentColor">
        <path d="M7 2a1 1 0 011 1v1h4V3a1 1 0 112 0v1h1a2 2 0 012 2v2H3V6a2 2 0 012-2h1V3a1 1 0 011-1zM3 10h14v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5zm4 2a1 1 0 100 2h6a1 1 0 100-2H7z"/>
      </svg>
      AI Language
    </h3>

    <div class="volume-card bp-card bp-corners">
      <div class="volume-row">
        <div class="volume-header">
          <span class="volume-label">Robot Language</span>
          <span class="volume-hint">Controls STT, LLM response language, and TTS voice</span>
        </div>
        <div class="lang-grid">
          <button
            v-for="lang in languages"
            :key="lang.code"
            class="lang-btn"
            :class="{ active: selectedLanguage === lang.code }"
            @click="onLanguageSelect(lang.code)"
          >
            <span class="lang-flag">{{ lang.flag }}</span>
            <span class="lang-name">{{ lang.name }}</span>
            <span class="lang-code mono">{{ lang.code.toUpperCase() }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Navigation -->
    <h3 class="section-title section-gap">
      <svg class="section-icon" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10 2L3 17h14L10 2zm0 4l4.5 9h-9L10 6z"/>
      </svg>
      Navigation
    </h3>

    <div class="volume-card bp-card bp-corners">
      <div class="volume-row">
        <div class="volume-header">
          <span class="volume-label">Head Tracking Dead-zone</span>
          <span class="volume-hint">Minimum horizontal error before neck servo moves — reduces jitter for ORB tracking</span>
        </div>
        <div class="slider-group">
          <input
            type="range" min="0" max="0.72" step="0.01"
            :value="neckDeadzone"
            @input="onDeadzoneInput"
            class="bp-slider"
          />
          <span class="volume-value mono">{{ neckDeadzoneDisplay }}</span>
        </div>
        <div class="effective-volume mono">
          ~{{ neckDeadzonePixels }}px horizontal tolerance
        </div>
      </div>

      <div class="volume-divider"></div>

      <div class="volume-row">
        <div class="volume-header">
          <span class="volume-label">Invert Head Tracking</span>
          <span class="volume-hint">Enable if camera is mounted mirrored — flips horizontal tracking direction</span>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" v-model="neckInvert" @change="saveNavSettings" />
          <span class="toggle-track">
            <span class="toggle-thumb"></span>
          </span>
          <span class="toggle-label mono">{{ neckInvert ? 'INVERTED' : 'NORMAL' }}</span>
        </label>
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
const selectedLanguage = ref('en')
const neckDeadzone = ref(0.03)
const neckInvert = ref(false)
const showSaved = ref(false)

const languages = [
  { code: 'en', name: 'English', flag: '\uD83C\uDDEC\uD83C\uDDE7' },
  { code: 'ro', name: 'Romanian', flag: '\uD83C\uDDF7\uD83C\uDDF4' },
  { code: 'de', name: 'German', flag: '\uD83C\uDDE9\uD83C\uDDEA' },
]

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
let navSaveTimeout = null
let unsubscribe = null
let unsubscribeDisplay = null
let unsubscribeAi = null
let unsubscribeNav = null

const neckDeadzoneDisplay = computed(() => neckDeadzone.value.toFixed(3))
const neckDeadzonePixels = computed(() => Math.round(neckDeadzone.value * 1330))

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

async function loadAiSettings() {
  try {
    const resp = await fetch('/api/settings/ai')
    if (resp.ok) {
      const data = await resp.json()
      selectedLanguage.value = data.language ?? 'en'
    }
  } catch (e) {
    console.warn('[settings] Failed to load AI:', e)
  }
}

async function onLanguageSelect(code) {
  selectedLanguage.value = code
  try {
    const resp = await fetch('/api/settings/ai', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: code }),
    })
    if (resp.ok) {
      showSaved.value = true
      setTimeout(() => { showSaved.value = false }, 1500)
    }
  } catch (e) {
    console.warn('[settings] Failed to save AI:', e)
  }
}

async function loadNavSettings() {
  try {
    const resp = await fetch('/api/settings/navigation')
    if (resp.ok) {
      const data = await resp.json()
      neckDeadzone.value = data.neck_deadzone ?? 0.03
      neckInvert.value = data.neck_invert ?? false
    }
  } catch (e) {
    console.warn('[settings] Failed to load navigation:', e)
  }
}

async function saveNavSettings() {
  try {
    const resp = await fetch('/api/settings/navigation', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        neck_deadzone: neckDeadzone.value,
        neck_invert: neckInvert.value,
      }),
    })
    if (resp.ok) {
      showSaved.value = true
      setTimeout(() => { showSaved.value = false }, 1500)
    }
  } catch (e) {
    console.warn('[settings] Failed to save navigation:', e)
  }
}

function onDeadzoneInput(e) {
  neckDeadzone.value = Number(e.target.value)
  if (navSaveTimeout) clearTimeout(navSaveTimeout)
  navSaveTimeout = setTimeout(async () => {
    try {
      const resp = await fetch('/api/settings/navigation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ neck_deadzone: neckDeadzone.value }),
      })
      if (resp.ok) {
        showSaved.value = true
        setTimeout(() => { showSaved.value = false }, 1500)
      }
    } catch (e) {
      console.warn('[settings] Failed to save navigation:', e)
    }
  }, 300)
}

onMounted(() => {
  loadSettings()
  loadDisplaySettings()
  loadAiSettings()
  loadNavSettings()
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
  unsubscribeAi = mqttStore.subscribe('robot/settings/ai', (_topic, payload) => {
    try {
      const data = typeof payload === 'string' ? JSON.parse(payload) : payload
      if (data.language) selectedLanguage.value = data.language
    } catch (e) { /* ignore */ }
  })
  unsubscribeNav = mqttStore.subscribe('robot/settings/navigation', (_topic, payload) => {
    try {
      const data = typeof payload === 'string' ? JSON.parse(payload) : payload
      if (data.neck_deadzone != null) neckDeadzone.value = data.neck_deadzone
      if (data.neck_invert != null) neckInvert.value = data.neck_invert
    } catch (e) { /* ignore */ }
  })
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
  if (unsubscribeDisplay) unsubscribeDisplay()
  if (unsubscribeAi) unsubscribeAi()
  if (unsubscribeNav) unsubscribeNav()
  if (saveTimeout) clearTimeout(saveTimeout)
  if (navSaveTimeout) clearTimeout(navSaveTimeout)
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

/* ── Language selector ── */
.lang-grid {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.lang-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast);
  flex: 1;
  min-width: 140px;
}
.lang-btn:hover {
  border-color: var(--border-bright);
  background: var(--bg-hover);
}
.lang-btn.active {
  border-color: var(--glow-primary);
  background: rgba(0, 212, 255, 0.08);
  box-shadow: 0 0 12px rgba(0, 212, 255, 0.15);
}

.lang-flag {
  font-size: 1.5rem;
  line-height: 1;
}

.lang-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}
.lang-btn.active .lang-name {
  color: var(--text-bright);
}

.lang-code {
  font-size: 0.65rem;
  color: var(--text-dim);
  margin-left: auto;
  letter-spacing: 1px;
}
.lang-btn.active .lang-code {
  color: var(--glow-primary);
}

/* ── Toggle switch ── */
.toggle-switch {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}
.toggle-switch input {
  display: none;
}
.toggle-track {
  position: relative;
  width: 40px;
  height: 22px;
  background: var(--bg-hover);
  border-radius: 11px;
  border: 1px solid var(--border-subtle);
  transition: background 0.2s, border-color 0.2s;
}
.toggle-switch input:checked + .toggle-track {
  background: rgba(0, 212, 255, 0.2);
  border-color: var(--glow-primary);
}
.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--text-dim);
  transition: transform 0.2s, background 0.2s;
}
.toggle-switch input:checked + .toggle-track .toggle-thumb {
  transform: translateX(18px);
  background: var(--glow-primary);
  box-shadow: 0 0 6px rgba(0, 212, 255, 0.5);
}
.toggle-label {
  font-size: 0.72rem;
  color: var(--text-dim);
  letter-spacing: 1px;
}
.toggle-switch input:checked ~ .toggle-label {
  color: var(--glow-primary);
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
