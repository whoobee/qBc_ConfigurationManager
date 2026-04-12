<template>
  <div class="logs-page h-full flex flex-col">
    <!-- Toolbar -->
    <div class="logs-toolbar flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <h3 class="text-sm" style="margin:0">
          <span class="text-dim">SERVICE</span>
          <span class="text-accent mono"> LOGS</span>
        </h3>
        <span class="mono text-xs text-dim">{{ serviceNames.length }} NODES</span>
      </div>
      <div class="flex items-center gap-2">
        <label class="bp-toggle text-xs">
          <input type="checkbox" v-model="autoScroll" />
          AUTO-SCROLL
        </label>
        <button class="bp-btn text-xs" @click="clearLogs">CLEAR</button>
      </div>
    </div>

    <!-- Log panels grid -->
    <div class="logs-content flex-1 overflow-hidden">
      <div v-if="serviceNames.length === 0" class="empty-state">
        <span class="text-dim mono text-sm">NO SERVICES LAUNCHED — START SERVICES FROM DASHBOARD</span>
      </div>
      <div v-else class="log-grid">
        <div
          v-for="name in serviceNames"
          :key="name"
          class="log-panel"
        >
          <div class="panel-header">
            <span class="panel-name">{{ name }}</span>
            <span class="panel-status" :class="panelStatusClass(name)">
              {{ panelStatusLabel(name) }}
            </span>
          </div>
          <div class="panel-body" :ref="el => setPanelRef(name, el)">
            <div
              v-for="(line, i) in logLines[name] || []"
              :key="i"
              class="log-line"
              :class="lineClass(line.text)"
            >{{ line.text }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, nextTick } from 'vue'

const serviceNames = ref([])
const logLines = reactive({})
const launcherStatus = reactive({})
const autoScroll = ref(true)

let pollTimer = null
let lastTs = 0
const panelRefs = {}

function setPanelRef(name, el) {
  if (el) panelRefs[name] = el
}

async function fetchLogs() {
  try {
    const resp = await fetch(`/api/system/logs?since=${lastTs}`)
    if (!resp.ok) return
    const data = await resp.json()

    // Update service names (only on first fetch or change)
    if (data.services?.length && data.services.length !== serviceNames.value.length) {
      serviceNames.value = data.services
      for (const name of data.services) {
        if (!logLines[name]) logLines[name] = []
      }
    }

    // Append new lines
    let hasNew = false
    for (const [name, lines] of Object.entries(data.logs || {})) {
      if (!logLines[name]) logLines[name] = []
      for (const line of lines) {
        logLines[name].push(line)
        if (line.ts > lastTs) lastTs = line.ts
        hasNew = true
      }
      // Cap at 500 lines per service
      if (logLines[name].length > 500) {
        logLines[name].splice(0, logLines[name].length - 500)
      }
    }

    if (hasNew && autoScroll.value) {
      nextTick(scrollAllToBottom)
    }
  } catch (e) {
    // Silently retry
  }

  // Also fetch launcher status
  try {
    const resp = await fetch('/api/system/services/launcher')
    if (resp.ok) {
      const data = await resp.json()
      Object.assign(launcherStatus, data.services || {})
    }
  } catch (e) { /* ignore */ }
}

function scrollAllToBottom() {
  for (const el of Object.values(panelRefs)) {
    if (el) el.scrollTop = el.scrollHeight
  }
}

function clearLogs() {
  for (const name of serviceNames.value) {
    logLines[name] = []
  }
}

function panelStatusClass(name) {
  const s = launcherStatus[name]
  if (!s) return 'status--waiting'
  return s.running ? 'status--running' : 'status--stopped'
}

function panelStatusLabel(name) {
  const s = launcherStatus[name]
  if (!s) return 'WAITING'
  if (s.running) return `PID ${s.pid}`
  return `EXIT ${s.returncode}`
}

function lineClass(text) {
  if (!text) return ''
  if (text.startsWith('[')) return 'line--system'
  const lower = text.toLowerCase()
  if (lower.includes('error') || lower.includes('traceback') || lower.includes('exception')) return 'line--error'
  if (lower.includes('warning') || lower.includes('warn')) return 'line--warn'
  return ''
}

onMounted(() => {
  fetchLogs()
  pollTimer = setInterval(fetchLogs, 1000)
})

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<style scoped>
.logs-page {
  gap: 0;
}

.logs-toolbar {
  padding: 10px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  flex-shrink: 0;
}

.logs-content {
  border: 1px solid var(--border-default);
  border-top: none;
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  background: var(--bg-primary);
  overflow: hidden;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  opacity: 0.5;
}

/* ── Grid layout — 2 columns like the TUI ── */
.log-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--border-default);
  height: 100%;
  overflow: hidden;
}

/* ── Individual log panel ── */
.log-panel {
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  min-height: 0;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
}

.panel-name {
  font-family: var(--text-mono);
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-bright);
  letter-spacing: 0.5px;
}

.panel-status {
  font-family: var(--text-mono);
  font-size: 0.6rem;
  letter-spacing: 0.5px;
  padding: 1px 6px;
  border-radius: 3px;
}
.status--running {
  color: #00e676;
  background: rgba(0, 230, 118, 0.1);
}
.status--stopped {
  color: #ff3366;
  background: rgba(255, 51, 102, 0.1);
}
.status--waiting {
  color: var(--text-dim);
  background: rgba(144, 164, 174, 0.08);
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px;
  font-family: var(--text-mono);
  font-size: 0.68rem;
  line-height: 1.5;
  color: var(--text-primary);
}

/* ── Log line styling ── */
.log-line {
  white-space: pre-wrap;
  word-break: break-all;
}

.line--error {
  color: #ff3366;
}

.line--warn {
  color: #ffd600;
}

.line--system {
  color: var(--glow-primary);
  opacity: 0.8;
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
</style>
