<template>
  <div class="path-viewer">
    <div class="image-container">
      <img
        ref="streamImg"
        :src="streamUrl"
        alt="Camera feed"
        class="path-image"
        @error="onStreamError"
        @load="onStreamLoad"
      />
      <div v-if="!streamOk" class="stream-overlay">
        <svg class="placeholder-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="4" y="8" width="40" height="32" rx="4" />
          <circle cx="16" cy="20" r="4" />
          <path d="M4 32l12-8 8 6 10-10 10 8" />
        </svg>
        <span class="placeholder-text">{{ streamError ? 'Stream unavailable' : 'Connecting to camera...' }}</span>
        <span class="placeholder-hint">Waiting for navigation service to provide frames</span>
      </div>
    </div>
    <div class="stream-status">
      <span class="status-dot" :class="streamOk ? 'dot--live' : 'dot--off'"></span>
      <span class="status-text mono">{{ streamOk ? 'LIVE' : 'OFFLINE' }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onBeforeUnmount } from 'vue'

const STREAM_PATH = '/api/navigation/stream'

const streamOk = ref(false)
const streamError = ref(false)
const streamImg = ref(null)
const streamUrl = ref(STREAM_PATH)

// Force-disconnect the MJPEG stream when the component unmounts
// (navigating away from the page). Setting src to '' closes the HTTP connection.
onBeforeUnmount(() => {
  if (streamImg.value) {
    streamImg.value.src = ''
  }
  streamUrl.value = ''
})

function onStreamLoad() {
  streamOk.value = true
  streamError.value = false
}

function onStreamError() {
  streamOk.value = false
  streamError.value = true
  // Retry after a delay by resetting the src
  setTimeout(() => {
    streamError.value = false
  }, 3000)
}
</script>

<style scoped>
.path-viewer {
  width: 100%;
  min-height: 300px;
}

.image-container {
  width: 100%;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--border);
  position: relative;
  background: var(--bg-elevated);
  min-height: 280px;
}

.path-image {
  width: 100%;
  height: auto;
  display: block;
}

.stream-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: var(--bg-elevated);
  color: var(--text-dim);
}

.placeholder-icon {
  width: 64px;
  height: 64px;
  opacity: 0.3;
}

.placeholder-text {
  font-size: 0.9rem;
}

.placeholder-hint {
  font-size: 0.75rem;
  opacity: 0.5;
}

.stream-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot--live {
  background: #00e676;
  box-shadow: 0 0 6px rgba(0, 230, 118, 0.5);
}

.dot--off {
  background: var(--text-dim);
  opacity: 0.4;
}

.status-text {
  font-size: 0.65rem;
  letter-spacing: 2px;
  color: var(--text-dim);
}
</style>
