<template>
  <div class="ai-page h-full flex flex-col">
    <!-- Toolbar -->
    <div class="ai-toolbar flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <h3 class="text-sm" style="margin:0">
          <span class="text-dim">AI</span>
          <span class="text-accent mono"> TRANSCRIPTS</span>
        </h3>
        <span class="mono text-xs text-dim">{{ transcripts.length }} ENTRIES</span>
        <span class="mono text-xs" :class="connClass">{{ connLabel }}</span>
      </div>
      <div class="flex items-center gap-2">
        <label class="bp-toggle text-xs">
          <input type="checkbox" v-model="autoScroll" />
          AUTO-SCROLL
        </label>
        <button class="bp-btn text-xs" @click="clearTranscripts">CLEAR</button>
      </div>
    </div>

    <!-- Transcript list -->
    <div class="ai-content flex-1 overflow-hidden">
      <div class="transcript-list" ref="listRef">
        <div v-if="transcripts.length === 0" class="empty-state">
          <span class="text-dim mono text-sm">WAITING FOR AI INTERACTIONS...</span>
        </div>

        <div
          v-for="(t, i) in transcripts"
          :key="i"
          class="transcript-card"
          :class="'card--' + t.type"
        >
          <!-- Header -->
          <div class="card-header">
            <span class="type-badge" :class="'badge--' + t.type">
              {{ t.type === 'voice' ? 'VOICE' : 'EXPLORE' }}
            </span>
            <span class="card-time mono">{{ formatTime(t.timestamp) }}</span>
            <span v-if="t.duration_ms" class="card-duration mono">
              {{ (t.duration_ms / 1000).toFixed(1) }}s
            </span>
          </div>

          <!-- Prompt (user) -->
          <div class="msg msg--user">
            <span class="msg-label">PROMPT</span>
            <p class="msg-text">{{ t.prompt }}</p>
          </div>

          <!-- Response (AI) -->
          <div class="msg msg--ai">
            <span class="msg-label">RESPONSE</span>
            <p class="msg-text">{{ t.response }}</p>
          </div>

          <!-- Metadata -->
          <div class="card-meta" v-if="t.tools?.length || t.waypoints?.length">
            <span v-if="t.tools?.length" class="meta-item">
              <span class="meta-label">TOOLS:</span>
              <span v-for="tool in t.tools" :key="tool" class="tool-tag">{{ tool }}</span>
            </span>
            <span v-if="t.waypoints?.length" class="meta-item">
              <span class="meta-label">WAYPOINTS:</span>
              <span class="tool-tag">{{ t.waypoints.length }} points</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useMqttStore } from '../../stores/mqtt.js'

const transcripts = ref([])
const autoScroll = ref(true)
const listRef = ref(null)
const connLabel = ref('CONNECTING...')
const connClass = ref('text-dim')

let unsubTranscript = null

onMounted(async () => {
  // Hydrate from REST API (buffered transcripts from before page load)
  try {
    const resp = await fetch('/api/ai/transcripts')
    if (resp.ok) {
      const data = await resp.json()
      transcripts.value = data
      scrollToBottom()
    }
  } catch (e) {
    // Non-fatal
  }

  // Subscribe to live transcript events
  const mqtt = useMqttStore()
  unsubTranscript = mqtt.subscribe('robot/ai/transcript', (topic, payload) => {
    if (!payload) return
    transcripts.value.push(payload)
    connLabel.value = 'LIVE'
    connClass.value = 'status-ok'
    if (autoScroll.value) {
      nextTick(scrollToBottom)
    }
  })

  // Set initial connection status
  if (mqtt.connected) {
    connLabel.value = 'LIVE'
    connClass.value = 'status-ok'
  }
})

onBeforeUnmount(() => {
  if (unsubTranscript) unsubTranscript()
})

function scrollToBottom() {
  nextTick(() => {
    if (listRef.value) {
      listRef.value.scrollTop = listRef.value.scrollHeight
    }
  })
}

function formatTime(ts) {
  if (!ts) return '--:--:--'
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString('en-GB', { hour12: false })
}

async function clearTranscripts() {
  transcripts.value = []
  try {
    await fetch('/api/ai/transcripts', { method: 'DELETE' })
  } catch (e) {
    // Non-fatal
  }
}
</script>

<style scoped>
.ai-page {
  gap: 0;
}

.ai-toolbar {
  padding: 10px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  flex-shrink: 0;
}

.ai-content {
  border: 1px solid var(--border-default);
  border-top: none;
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  background: var(--bg-primary);
}

.transcript-list {
  height: 100%;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  opacity: 0.5;
}

/* ── Transcript Card ── */
.transcript-card {
  background: var(--bg-card, rgba(10, 20, 40, 0.6));
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  border-left: 3px solid var(--border-default);
  transition: border-color 0.2s;
}
.card--voice {
  border-left-color: #2ecc71;
}
.card--exploration {
  border-left-color: #f39c12;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.type-badge {
  font-family: var(--text-mono);
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 3px;
  letter-spacing: 1px;
}
.badge--voice {
  background: rgba(46, 204, 113, 0.15);
  color: #2ecc71;
  border: 1px solid rgba(46, 204, 113, 0.3);
}
.badge--exploration {
  background: rgba(243, 156, 18, 0.15);
  color: #f39c12;
  border: 1px solid rgba(243, 156, 18, 0.3);
}

.card-time {
  font-size: 0.75rem;
  color: var(--text-dim);
}

.card-duration {
  font-size: 0.7rem;
  color: var(--text-dim);
  opacity: 0.7;
  margin-left: auto;
}

/* ── Message Bubbles ── */
.msg {
  margin-bottom: 8px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
}
.msg--user {
  background: rgba(0, 136, 255, 0.06);
  border: 1px solid rgba(0, 136, 255, 0.12);
}
.msg--ai {
  background: rgba(0, 212, 255, 0.04);
  border: 1px solid rgba(0, 212, 255, 0.10);
}

.msg-label {
  display: block;
  font-family: var(--text-mono);
  font-size: 0.6rem;
  color: var(--text-dim);
  letter-spacing: 1.5px;
  margin-bottom: 4px;
}

.msg-text {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.5;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

/* ── Metadata ── */
.card-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.meta-label {
  font-family: var(--text-mono);
  font-size: 0.6rem;
  color: var(--text-dim);
  letter-spacing: 1px;
}

.tool-tag {
  font-family: var(--text-mono);
  font-size: 0.65rem;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(0, 212, 255, 0.1);
  color: var(--glow-primary);
  border: 1px solid rgba(0, 212, 255, 0.15);
}

/* ── Toggle ── */
.bp-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--text-mono);
  color: var(--text-dim);
  cursor: pointer;
  user-select: none;
}
.bp-toggle input {
  accent-color: var(--glow-primary);
}

.status-ok { color: var(--glow-success) !important; }
</style>
