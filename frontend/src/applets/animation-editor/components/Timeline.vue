<template>
  <div class="timeline mono text-xs">
    <!-- Transport row: play controls + clock + meta -->
    <div class="tl-transport">
      <button class="bp-btn text-xs" @click="rewind" title="Rewind to 0">⏮</button>
      <button class="bp-btn text-xs" @click="toggle">
        {{ state.playing ? '❚❚' : '▶' }}
      </button>
      <button class="bp-btn text-xs" @click="stop">■</button>
      <span class="tl-clock">
        {{ fmtTime(state.playhead) }} / {{ fmtTime(state.doc.duration) }}
      </span>

      <span class="tl-sep"></span>

      <label class="tl-check" title="Timeline length in seconds (1–60)">
        dur
        <input
          class="tl-num tl-num-dur"
          type="number"
          :min="MIN_DURATION"
          :max="MAX_DURATION"
          step="1"
          :value="state.doc.duration"
          @change="onDurationChange($event.target.value)"
        />
        s
      </label>

      <span class="tl-sep"></span>

      <label class="tl-check">
        <input type="checkbox" :checked="state.doc.loop" @change="setLoop($event.target.checked)" />
        loop
      </label>

      <span class="tl-sep"></span>

      <button class="bp-btn text-xs" @click="addKf" title="Add keyframe at playhead capturing current pose">
        + KEY
      </button>
      <button
        class="bp-btn text-xs"
        @click="deleteSelected"
        :disabled="!selectedId"
        title="Delete selected keyframe"
      >
        − KEY
      </button>
      <button
        class="bp-btn text-xs"
        @click="recordSelected"
        :disabled="!selectedId"
        title="Record current pose + eye state into selected keyframe"
      >
        REC
      </button>

      <span class="tl-spacer"></span>

      <span class="tl-name text-dim">{{ state.doc.name }}</span>
    </div>

    <!-- Track area: ruler + keyframe markers + scrubber -->
    <div class="tl-track-wrap">
      <div
        ref="trackRef"
        class="tl-track"
        @pointerdown="onTrackDown"
      >
        <!-- Ruler ticks every second -->
        <div
          v-for="tick in rulerTicks"
          :key="'t' + tick.t"
          class="tl-tick"
          :class="{ 'tl-tick-major': tick.major }"
          :style="{ left: tick.pct + '%' }"
        >
          <span v-if="tick.major" class="tl-tick-label">{{ tick.t }}s</span>
        </div>

        <!-- Keyframe markers -->
        <div
          v-for="kf in state.doc.keyframes"
          :key="kf.id"
          class="tl-kf"
          :class="{ 'tl-kf-selected': kf.id === selectedId }"
          :style="{ left: toPct(kf.time) + '%' }"
          :title="`t=${kf.time.toFixed(2)}s · ${kf.transition}${kf.sound ? ' · ' + kf.sound : ''}`"
          @pointerdown.stop="onKfDown($event, kf)"
        >
          <div class="tl-kf-shape" :class="'tl-kf-' + kf.transition"></div>
          <div v-if="kf.sound" class="tl-kf-sound-dot"></div>
        </div>

        <!-- Playhead -->
        <div class="tl-playhead" :style="{ left: toPct(state.playhead) + '%' }"></div>
      </div>
    </div>

    <!-- Selected-keyframe inspector row -->
    <div v-if="selectedKf" class="tl-kf-inspector">
      <span class="tl-label">kf</span>
      <input
        class="tl-num"
        type="number"
        step="0.05"
        min="0"
        :value="selectedKf.time.toFixed(2)"
        @change="updateTime($event.target.value)"
      />
      <span class="tl-label">s</span>
      <span class="tl-sep-sm"></span>
      <span class="tl-label">curve</span>
      <select
        class="tl-select"
        :value="selectedKf.transition"
        @change="updateTransition($event.target.value)"
      >
        <option v-for="c in transitions" :key="c" :value="c">{{ c }}</option>
      </select>
      <span class="tl-sep-sm"></span>
      <span class="tl-label">active</span>
      <select
        class="tl-select"
        :value="String(selectedKf.active)"
        @change="updateActive($event.target.value)"
      >
        <option value="true">true</option>
        <option value="false">false</option>
        <option value="random">random</option>
      </select>
      <span class="tl-sep-sm"></span>
      <span class="tl-label">sound</span>
      <input
        class="tl-input-sound"
        type="text"
        list="sound-options"
        placeholder="none"
        :value="selectedKf.sound || ''"
        @change="updateSound($event.target.value)"
      />
      <datalist id="sound-options">
        <option v-for="s in soundFiles" :key="s" :value="s">{{ s }}</option>
      </datalist>
      <button
        v-if="selectedKf.sound"
        class="bp-btn text-xs"
        @click="updateSound('')"
        title="Clear sound"
      >✕</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import {
  subscribe,
  getState,
  setPlayhead,
  play,
  pause,
  stop as stopPlayback,
  addKeyframe,
  removeKeyframe,
  updateKeyframe,
  setKeyframeJoints,
  setKeyframeEyes,
  setDocMeta,
  setDocDuration,
  MIN_DURATION,
  MAX_DURATION,
} from '../viewport/animation-store.js'
import { getPose } from '../viewport/pose-store.js'
import { getEyeState } from '../viewport/eye-store.js'
import { TRANSITIONS } from '../viewport/interpolator.js'

const state = ref(getState())
let unsubscribe = null
const trackRef = ref(null)
const soundFiles = ref([])

const selectedId = ref(null)
const selectedKf = computed(() =>
  state.value.doc.keyframes.find((k) => k.id === selectedId.value) || null,
)

const transitions = TRANSITIONS

onMounted(async () => {
  state.value = getState()
  unsubscribe = subscribe((s) => { state.value = s })
  try {
    const res = await fetch('/api/animations/sounds')
    if (res.ok) soundFiles.value = await res.json()
  } catch { /* non-critical */ }
})
onBeforeUnmount(() => {
  unsubscribe?.()
  window.removeEventListener('pointermove', onPointerMoveScrub)
  window.removeEventListener('pointerup', onPointerUpScrub)
  window.removeEventListener('pointermove', onPointerMoveKf)
  window.removeEventListener('pointerup', onPointerUpKf)
})

// ── Time ↔ pixel mapping ──
// The ruler always spans the authored doc.duration (clamped 1..60 in the
// store). This is independent of keyframe content — an empty doc still
// gets a full ruler, and users can extend the clip before placing keys.
const displayDuration = computed(() => state.value.doc.duration)

function toPct(t) {
  return (t / displayDuration.value) * 100
}
function pctToTime(pct) {
  return (pct / 100) * displayDuration.value
}

const rulerTicks = computed(() => {
  const out = []
  const dur = displayDuration.value
  // Minor tick every 0.25s; major every 1s. For long clips scale up so
  // we don't draw hundreds of ticks.
  const minorStep = dur <= 5 ? 0.25 : dur <= 20 ? 1 : 5
  const majorStep = dur <= 5 ? 1 : dur <= 20 ? 5 : 10
  for (let t = 0; t <= dur + 1e-6; t += minorStep) {
    const major = Math.abs((t / majorStep) - Math.round(t / majorStep)) < 1e-6
    out.push({ t: Number(t.toFixed(3)), pct: (t / dur) * 100, major })
  }
  return out
})

// ── Transport ──
function toggle() {
  if (state.value.playing) pause()
  else play()
}
function rewind() {
  setPlayhead(0)
}
function stop() { stopPlayback() }
function setLoop(v) { setDocMeta({ loop: !!v }) }
function onDurationChange(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return
  setDocDuration(n)
}
function fmtTime(sec) {
  return Number(sec).toFixed(2).padStart(5, '0')
}

// ── Scrubbing ──
// Click anywhere in the track to jump; drag to scrub. Uses window-level
// pointermove/up so the drag survives crossing the track boundary.
function onTrackDown(ev) {
  scrubTo(ev)
  window.addEventListener('pointermove', onPointerMoveScrub)
  window.addEventListener('pointerup', onPointerUpScrub)
}
function onPointerMoveScrub(ev) { scrubTo(ev) }
function onPointerUpScrub() {
  window.removeEventListener('pointermove', onPointerMoveScrub)
  window.removeEventListener('pointerup', onPointerUpScrub)
}
function scrubTo(ev) {
  const el = trackRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const pct = Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100))
  setPlayhead(pctToTime(pct))
}

// ── Keyframe selection + drag ──
let kfDragId = null
function onKfDown(ev, kf) {
  selectedId.value = kf.id
  kfDragId = kf.id
  window.addEventListener('pointermove', onPointerMoveKf)
  window.addEventListener('pointerup', onPointerUpKf)
}
function onPointerMoveKf(ev) {
  if (kfDragId == null) return
  const el = trackRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const pct = Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100))
  const t = Math.max(0, pctToTime(pct))
  updateKeyframe(kfDragId, { time: t })
}
function onPointerUpKf() {
  kfDragId = null
  window.removeEventListener('pointermove', onPointerMoveKf)
  window.removeEventListener('pointerup', onPointerUpKf)
}

// ── Add / delete / record ──
function addKf() {
  // Capture current pose + eye state at the playhead. This is the common
  // "I tweaked the rig, now freeze it into a keyframe" flow.
  const pose = getPose()
  const eye = getEyeState()
  const joints = {}
  for (const [name, deg] of Object.entries(pose)) joints[name] = { position: deg }
  const eyes = {
    expression: eye.expression,
    pupilX: eye.pupilX,
    pupilY: eye.pupilY,
    openness: eye.openness,
  }
  const id = addKeyframe({
    time: state.value.playhead,
    transition: 'linear',
    joints,
    eyes,
  })
  selectedId.value = id
}

function deleteSelected() {
  if (!selectedId.value) return
  removeKeyframe(selectedId.value)
  selectedId.value = null
}

function recordSelected() {
  if (!selectedId.value) return
  setKeyframeJoints(selectedId.value, getPose())
  setKeyframeEyes(selectedId.value, getEyeState())
}

function updateTime(v) {
  const t = Number(v)
  if (!Number.isFinite(t) || !selectedId.value) return
  updateKeyframe(selectedId.value, { time: Math.max(0, t) })
}
function updateTransition(v) {
  if (!selectedId.value) return
  updateKeyframe(selectedId.value, { transition: v })
}
function updateActive(v) {
  if (!selectedId.value) return
  const val = v === 'true' ? true : v === 'false' ? false : 'random'
  updateKeyframe(selectedId.value, { active: val })
}
function updateSound(v) {
  if (!selectedId.value) return
  updateKeyframe(selectedId.value, { sound: v || null })
}
</script>

<style scoped>
.timeline {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 6px 10px 8px;
  gap: 6px;
}
.tl-transport {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.tl-clock {
  font-variant-numeric: tabular-nums;
  color: var(--accent, #4dd0ff);
  margin-left: 6px;
}
.tl-sep {
  width: 1px;
  align-self: stretch;
  background: var(--border, #1e2328);
  margin: 0 4px;
}
.tl-sep-sm {
  width: 12px;
}
.tl-check {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--fg-dim, #8891a0);
}
.tl-spacer { flex: 1 1 auto; }
.tl-name { font-style: italic; }

.tl-track-wrap {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: stretch;
}
.tl-track {
  position: relative;
  flex: 1 1 auto;
  height: 56px;
  background: var(--bg-0, #0b0d10);
  border: 1px solid var(--border, #1e2328);
  cursor: crosshair;
  overflow: hidden;
  user-select: none;
}
.tl-tick {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(136, 145, 160, 0.18);
}
.tl-tick-major {
  background: rgba(136, 145, 160, 0.45);
}
.tl-tick-label {
  position: absolute;
  top: 2px;
  left: 3px;
  font-size: 9px;
  color: var(--fg-dim, #8891a0);
}
.tl-kf {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  cursor: grab;
  padding: 4px;
}
.tl-kf:active { cursor: grabbing; }
/* Shared base sizing for all keyframe markers. Each transition type
   draws a distinct shape so the curve applied between keys is legible
   at a glance: linear=diamond, quadratic=circle, exponential=triangle. */
.tl-kf-shape {
  width: 12px;
  height: 12px;
  box-sizing: border-box;
}
/* Linear — diamond (rotated square) */
.tl-kf-linear {
  background: var(--accent, #4dd0ff);
  transform: rotate(45deg);
  border: 1px solid #0b0d10;
}
/* Quadratic — circle */
.tl-kf-quadratic {
  background: var(--accent, #4dd0ff);
  border: 1px solid #0b0d10;
  border-radius: 50%;
}
/* Exponential — upward triangle via CSS borders */
.tl-kf-exponential {
  width: 0;
  height: 0;
  background: transparent;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-bottom: 12px solid var(--accent, #4dd0ff);
  filter: drop-shadow(0 0 0 #0b0d10);
}
.tl-kf-selected .tl-kf-linear,
.tl-kf-selected .tl-kf-quadratic {
  background: #ffd166;
  box-shadow: 0 0 0 2px rgba(255, 209, 102, 0.35);
}
.tl-kf-selected .tl-kf-exponential {
  border-bottom-color: #ffd166;
  filter: drop-shadow(0 0 2px rgba(255, 209, 102, 0.7));
}
.tl-num-dur {
  width: 42px;
  margin: 0 2px;
}
.tl-playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #ff6b6b;
  pointer-events: none;
}
.tl-kf-inspector {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  color: var(--fg-dim, #8891a0);
}
.tl-label { color: var(--fg-dim, #8891a0); }
.tl-num {
  width: 64px;
  background: var(--bg-0, #0b0d10);
  border: 1px solid var(--border, #1e2328);
  color: var(--fg-0, #d8dee8);
  font: inherit;
  padding: 1px 4px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.tl-select {
  background: var(--bg-0, #0b0d10);
  border: 1px solid var(--border, #1e2328);
  color: var(--fg-0, #d8dee8);
  font: inherit;
  padding: 1px 4px;
}
.tl-kf-sound-dot {
  position: absolute;
  bottom: -2px;
  left: 50%;
  transform: translateX(-50%);
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #ff9f43;
}
.tl-input-sound {
  width: 140px;
  background: var(--bg-0, #0b0d10);
  border: 1px solid var(--border, #1e2328);
  color: var(--fg-0, #d8dee8);
  font: inherit;
  padding: 1px 4px;
}
.text-dim { color: var(--fg-dim, #8891a0); }
</style>
