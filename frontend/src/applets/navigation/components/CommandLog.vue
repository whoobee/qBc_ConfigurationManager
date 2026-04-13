<template>
  <div class="command-log" ref="logContainer">
    <div v-if="entries.length === 0" class="log-empty">
      No navigation commands yet
    </div>
    <table v-else class="log-table">
      <thead>
        <tr>
          <th class="col-time">Time</th>
          <th class="col-action">Action</th>
          <th class="col-details">Details</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(entry, i) in entries"
          :key="i"
          :class="'row--' + actionColor(entry.action)"
        >
          <td class="col-time mono">{{ formatTime(entry.timestamp) }}</td>
          <td class="col-action">
            <span class="action-badge" :class="'badge--' + actionColor(entry.action)">
              {{ entry.action }}
            </span>
          </td>
          <td class="col-details mono">{{ entry.details }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { watch, ref, nextTick } from 'vue'

const props = defineProps({
  entries: { type: Array, default: () => [] },
})

const logContainer = ref(null)

function formatTime(ts) {
  if (!ts) return '--:--:--'
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString('en-GB', { hour12: false })
}

function actionColor(action) {
  if (!action) return 'dim'
  if (action.includes('reached') || action.includes('complete')) return 'green'
  if (action.includes('safety') || action.includes('failed') || action.includes('lost')) return 'red'
  if (action.includes('recovery') || action.includes('warning')) return 'yellow'
  if (action.startsWith('ai_') || action === 'explore_result') return 'purple'
  if (action === 'audio_play') return 'green'
  return 'blue'
}

// Auto-scroll to bottom on new entries
watch(() => props.entries.length, async () => {
  await nextTick()
  if (logContainer.value) {
    logContainer.value.scrollTop = logContainer.value.scrollHeight
  }
})
</script>

<style scoped>
.command-log {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-elevated);
}

.log-empty {
  padding: 24px;
  text-align: center;
  color: var(--text-dim);
  font-size: 0.8rem;
}

.log-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}

.log-table th {
  position: sticky;
  top: 0;
  background: var(--bg-card);
  padding: 6px 10px;
  text-align: left;
  font-size: 0.65rem;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 1px;
  border-bottom: 1px solid var(--border);
}

.log-table td {
  padding: 4px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  vertical-align: top;
}

.col-time {
  width: 80px;
  white-space: nowrap;
  color: var(--text-dim);
}

.col-action {
  width: 120px;
  white-space: nowrap;
}

.col-details {
  color: var(--text-secondary);
  word-break: break-word;
}

.action-badge {
  font-family: var(--text-mono);
  font-size: 0.68rem;
  padding: 1px 6px;
  border-radius: 3px;
  letter-spacing: 0.5px;
}

.badge--green {
  background: rgba(0, 230, 118, 0.12);
  color: #00e676;
}
.badge--red {
  background: rgba(255, 51, 102, 0.12);
  color: #ff3366;
}
.badge--yellow {
  background: rgba(255, 214, 0, 0.12);
  color: #ffd600;
}
.badge--blue {
  background: rgba(0, 176, 255, 0.12);
  color: #00b0ff;
}
.badge--purple {
  background: rgba(180, 100, 255, 0.12);
  color: #b464ff;
}
.badge--dim {
  background: rgba(144, 164, 174, 0.08);
  color: var(--text-dim);
}

.row--red td { background: rgba(255, 51, 102, 0.03); }
.row--green td { background: rgba(0, 230, 118, 0.03); }
.row--purple td { background: rgba(180, 100, 255, 0.03); }
</style>
