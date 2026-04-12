<template>
  <div class="nav-status bp-card bp-corners">
    <div class="status-grid">
      <!-- Explore / Cancel button -->
      <div class="status-item">
        <button
          v-if="!isNavigating"
          class="explore-btn"
          :class="{ 'explore-btn--ready': allReady }"
          :disabled="!allReady"
          @click="$emit('explore')"
        >
          <svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582a1 1 0 01.589.753l.457 3.2a1 1 0 01-.265.876L13 13.469V17a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3.531L4.265 10.734a1 1 0 01-.265-.876l.457-3.2a1 1 0 01.589-.753L9 4.323V3a1 1 0 011-1z"/>
          </svg>
          EXPLORE
        </button>
        <button
          v-else
          class="explore-btn explore-btn--cancel"
          @click="$emit('cancel')"
        >
          <svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"/>
          </svg>
          CANCEL NAV
        </button>
        <!-- Service readiness dots -->
        <div class="readiness-dots">
          <span class="dot" :class="svcReady('ai')" title="AI Service">AI</span>
          <span class="dot" :class="svcReady('vision')" title="Vision">VIS</span>
          <span class="dot" :class="svcReady('teensy')" title="Teensy">HW</span>
          <span class="dot" :class="svcReady('navigation')" title="Navigation">NAV</span>
        </div>
        <!-- AI loading progress -->
        <div class="svc-loading" v-if="aiLoading">
          <div class="svc-loading-bar">
            <div class="svc-loading-fill" :style="{ width: aiLoadingPct + '%' }"></div>
          </div>
          <span class="svc-loading-label mono">{{ aiLoadingMsg }}</span>
        </div>
      </div>

      <div class="status-item">
        <span class="status-label">STATUS</span>
        <span class="status-badge" :class="'badge--' + badgeColor">
          {{ state.nav_state?.toUpperCase() || 'OFFLINE' }}
        </span>
      </div>
      <div class="status-item">
        <span class="status-label">WAYPOINT</span>
        <span class="status-value mono text-glow">
          {{ state.total_waypoints > 0
              ? `${state.current_waypoint + 1} / ${state.total_waypoints}`
              : '-- / --' }}
        </span>
      </div>
      <div class="status-item">
        <span class="status-label">PROGRESS</span>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progressPct + '%' }"></div>
        </div>
      </div>
      <div class="status-item">
        <span class="status-label">TRACKING</span>
        <span class="status-value mono" :class="featureClass">
          {{ state.tracking_features || 0 }}
          <span class="mode-tag" v-if="state.tracking_mode">{{ state.tracking_mode }}</span>
        </span>
      </div>
      <div class="status-item">
        <span class="status-label">NECK</span>
        <span class="status-value mono">{{ (state.neck_deg || 0).toFixed(1) }}&deg;</span>
      </div>
      <div class="status-item">
        <span class="status-label">FPS</span>
        <span class="status-value mono" :class="fpsClass">{{ (state.fps || 0).toFixed(1) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useSystemStore } from '../../../stores/system.js'

const props = defineProps({
  state: { type: Object, default: () => ({}) },
})

defineEmits(['explore', 'cancel'])

const systemStore = useSystemStore()

// AI loading progress
const aiLoadingData = computed(() => systemStore.loadingProgress['ai'])
const aiLoading = computed(() => {
  const d = aiLoadingData.value
  return d && d.percent < 100 && !isAiReady()
})
const aiLoadingPct = computed(() => aiLoadingData.value?.percent ?? 0)
const aiLoadingMsg = computed(() => aiLoadingData.value?.message ?? '')

// Service readiness checks
function isAlive(name) {
  const svc = systemStore.services[name]
  return svc && svc.alive
}

function isAiReady() {
  const svc = systemStore.services['ai']
  return svc && svc.alive && svc.currentState === 'ready'
}

function svcReady(name) {
  if (name === 'ai') return isAiReady() ? 'dot--ok' : 'dot--off'
  return isAlive(name) ? 'dot--ok' : 'dot--off'
}

const allReady = computed(() =>
  isAiReady() && isAlive('vision') && isAlive('teensy') && isAlive('navigation')
)

const isNavigating = computed(() => {
  const s = props.state.nav_state
  return s === 'acquiring' || s === 'servoing' || s === 'recovery'
})

const badgeColor = computed(() => {
  const s = props.state.nav_state
  if (s === 'servoing') return 'green'
  if (s === 'acquiring') return 'blue'
  if (s === 'recovery') return 'yellow'
  if (s === 'idle' && props.state.status === 'online') return 'dim'
  return 'red'
})

const progressPct = computed(() => {
  const total = props.state.total_waypoints || 0
  if (total === 0) return 0
  return Math.round((props.state.current_waypoint / total) * 100)
})

const fpsClass = computed(() => {
  const fps = props.state.fps || 0
  if (fps >= 8) return 'text-glow'
  if (fps >= 4) return 'text-warning'
  return 'text-danger'
})

const featureClass = computed(() => {
  const f = props.state.tracking_features || 0
  if (f >= 10) return 'text-glow'
  if (f >= 5) return 'text-warning'
  return 'text-danger'
})
</script>

<style scoped>
.nav-status {
  padding: 16px 24px;
  background: linear-gradient(135deg, var(--bg-card), var(--bg-elevated));
}

.status-grid {
  display: flex;
  align-items: center;
  gap: 32px;
  flex-wrap: wrap;
}

.status-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.status-label {
  font-family: var(--text-mono);
  font-size: 0.65rem;
  color: var(--text-dim);
  letter-spacing: 2px;
  text-transform: uppercase;
}

.status-value {
  font-size: 1.2rem;
  font-weight: 600;
}

.status-badge {
  font-family: var(--text-mono);
  font-size: 0.75rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 4px;
  letter-spacing: 1px;
}

.badge--green {
  background: rgba(0, 230, 118, 0.15);
  color: #00e676;
  border: 1px solid rgba(0, 230, 118, 0.3);
}
.badge--blue {
  background: rgba(0, 176, 255, 0.15);
  color: #00b0ff;
  border: 1px solid rgba(0, 176, 255, 0.3);
}
.badge--yellow {
  background: rgba(255, 214, 0, 0.15);
  color: #ffd600;
  border: 1px solid rgba(255, 214, 0, 0.3);
}
.badge--red {
  background: rgba(255, 51, 102, 0.15);
  color: #ff3366;
  border: 1px solid rgba(255, 51, 102, 0.3);
}
.badge--dim {
  background: rgba(144, 164, 174, 0.1);
  color: var(--text-dim);
  border: 1px solid rgba(144, 164, 174, 0.2);
}

/* Explore button */
.explore-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border: 1px solid rgba(0, 176, 255, 0.3);
  border-radius: 6px;
  background: rgba(0, 176, 255, 0.08);
  color: var(--text-dim);
  font-family: var(--text-mono);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 1px;
  cursor: not-allowed;
  transition: all 0.2s ease;
}
.explore-btn--ready {
  cursor: pointer;
  color: #00b0ff;
  border-color: rgba(0, 176, 255, 0.5);
  background: rgba(0, 176, 255, 0.12);
}
.explore-btn--ready:hover {
  background: rgba(0, 176, 255, 0.22);
  box-shadow: 0 0 12px rgba(0, 176, 255, 0.2);
}
.explore-btn--ready:active {
  transform: scale(0.97);
}
.explore-btn--cancel {
  cursor: pointer;
  color: #ff3366;
  border-color: rgba(255, 51, 102, 0.5);
  background: rgba(255, 51, 102, 0.12);
}
.explore-btn--cancel:hover {
  background: rgba(255, 51, 102, 0.22);
  box-shadow: 0 0 12px rgba(255, 51, 102, 0.2);
}
.explore-btn--cancel:active {
  transform: scale(0.97);
}
.explore-btn:disabled:not(.explore-btn--busy) {
  opacity: 0.5;
}
.btn-icon {
  width: 14px;
  height: 14px;
}

/* Readiness dots */
.readiness-dots {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}
.dot {
  font-family: var(--text-mono);
  font-size: 0.55rem;
  letter-spacing: 0.5px;
  padding: 1px 4px;
  border-radius: 3px;
}
.dot--ok {
  color: #00e676;
  background: rgba(0, 230, 118, 0.1);
}
.dot--off {
  color: var(--text-dim);
  background: rgba(144, 164, 174, 0.08);
  opacity: 0.5;
}

.mode-tag {
  font-size: 0.55rem;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(0, 176, 255, 0.12);
  color: #00b0ff;
  margin-left: 4px;
  vertical-align: middle;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

/* Service loading progress */
.svc-loading {
  margin-top: 6px;
  width: 100%;
}
.svc-loading-bar {
  height: 3px;
  background: var(--bg-hover);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 2px;
}
.svc-loading-fill {
  height: 100%;
  background: var(--glow-primary);
  border-radius: 2px;
  transition: width 0.3s ease;
  box-shadow: 0 0 4px rgba(0, 212, 255, 0.4);
}
.svc-loading-label {
  font-size: 0.5rem;
  color: var(--glow-primary);
  opacity: 0.7;
}

.text-warning { color: #ffd600; }
.text-danger { color: #ff3366; }

.progress-bar {
  width: 100px;
  height: 8px;
  background: var(--bg-elevated);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--glow-primary);
  border-radius: 4px;
  transition: width 0.3s ease;
}
</style>
