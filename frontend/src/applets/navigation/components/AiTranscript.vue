<template>
  <div class="ai-transcript" ref="container">
    <div v-if="!request && !response" class="empty">
      No AI exploration request yet
    </div>

    <div v-if="request" class="block block--request">
      <div class="block-header">
        <span class="phase-badge phase-badge--request">REQUEST</span>
        <span v-if="request.model" class="model mono">{{ request.model }}</span>
        <span class="time mono">{{ formatTime(request.timestamp) }}</span>
      </div>
      <details class="prompt-section" open>
        <summary>System prompt</summary>
        <pre class="prompt mono">{{ request.system_prompt }}</pre>
      </details>
      <details class="prompt-section" open>
        <summary>User prompt</summary>
        <pre class="prompt mono">{{ request.user_prompt }}</pre>
      </details>
    </div>

    <div v-if="response" class="block block--response">
      <div class="block-header">
        <span class="phase-badge phase-badge--response">RESPONSE</span>
        <span v-if="duration != null" class="duration mono">{{ duration }} ms</span>
        <span class="time mono">{{ formatTime(response.timestamp) }}</span>
      </div>
      <pre class="prompt mono">{{ response.clean || response.raw }}</pre>
    </div>

    <div v-if="result" class="block block--parsed">
      <div class="block-header">
        <span class="phase-badge phase-badge--parsed">PARSED</span>
        <span class="model mono">{{ result.waypoints?.length ?? 0 }} waypoints</span>
      </div>
      <div class="parsed-narration">{{ result.analysis }}</div>
      <div v-if="result.waypoints?.length" class="waypoints mono">
        <span
          v-for="(wp, i) in result.waypoints"
          :key="i"
          class="wp"
        >
          [{{ i + 1 }}] x={{ wp.x.toFixed(2) }}, y={{ wp.y.toFixed(2) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue'

const props = defineProps({
  request: { type: Object, default: null },
  response: { type: Object, default: null },
  result: { type: Object, default: null },
})

const container = ref(null)

const duration = computed(() => {
  if (!props.request?.timestamp || !props.response?.timestamp) return null
  return Math.round((props.response.timestamp - props.request.timestamp) * 1000)
})

function formatTime(ts) {
  if (!ts) return '--:--:--'
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString('en-GB', { hour12: false })
}

watch(() => [props.request, props.response, props.result], async () => {
  await nextTick()
  if (container.value) container.value.scrollTop = container.value.scrollHeight
}, { deep: true })
</script>

<style scoped>
.ai-transcript {
  height: 100%;
  overflow-y: auto;
  font-size: 0.78rem;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.empty {
  color: var(--text-dim);
  text-align: center;
  padding: 24px 0;
  font-family: var(--text-mono);
  font-size: 0.72rem;
  letter-spacing: 1px;
}

.block {
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: var(--bg-elevated);
  padding: 8px 10px;
}
.block--request { border-left: 2px solid #00b0ff; }
.block--response { border-left: 2px solid #b46cff; }
.block--parsed { border-left: 2px solid #00e676; }

.block-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.phase-badge {
  font-family: var(--text-mono);
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 1px;
  padding: 2px 6px;
  border-radius: 3px;
}
.phase-badge--request {
  background: rgba(0, 176, 255, 0.15);
  color: #00b0ff;
}
.phase-badge--response {
  background: rgba(180, 108, 255, 0.15);
  color: #b46cff;
}
.phase-badge--parsed {
  background: rgba(0, 230, 118, 0.15);
  color: #00e676;
}

.model, .duration, .time {
  font-size: 0.65rem;
  color: var(--text-dim);
  letter-spacing: 0.5px;
}
.duration { color: var(--glow-primary); }

.prompt-section {
  margin-top: 4px;
}
.prompt-section summary {
  cursor: pointer;
  font-family: var(--text-mono);
  font-size: 0.65rem;
  color: var(--text-dim);
  letter-spacing: 1px;
  padding: 2px 0;
  user-select: none;
}
.prompt-section summary:hover {
  color: var(--text-primary);
}

.prompt {
  margin: 4px 0 0 0;
  padding: 6px 8px;
  background: var(--bg-card);
  border-radius: 4px;
  font-size: 0.72rem;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-primary);
  max-height: 200px;
  overflow-y: auto;
}

.parsed-narration {
  font-style: italic;
  color: var(--text-bright);
  padding: 4px 0;
}

.waypoints {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}
.wp {
  font-size: 0.65rem;
  padding: 2px 6px;
  background: rgba(0, 230, 118, 0.08);
  border: 1px solid rgba(0, 230, 118, 0.2);
  border-radius: 3px;
  color: #00e676;
}
</style>
