<template>
  <div class="anim-page h-full flex flex-col">
    <!-- Toolbar -->
    <div class="anim-toolbar flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <h3 class="text-sm" style="margin:0">
          <span class="text-dim">ANIMATION</span>
          <span class="text-accent mono"> EDITOR</span>
        </h3>
        <span class="mono text-xs text-dim">{{ statusLabel }}</span>
      </div>
      <div class="flex items-center gap-2">
        <template v-if="!rigMode">
          <button class="bp-btn text-xs" @click="onNew">NEW</button>
          <div class="anim-open-wrap">
            <button class="bp-btn text-xs" @click="toggleOpenMenu">OPEN ▾</button>
            <ul v-if="openMenuVisible" class="anim-open-menu mono text-xs">
              <li v-if="!animList.length" class="anim-open-empty text-dim">
                (no animations)
              </li>
              <li
                v-for="a in animList"
                :key="a.filename"
                class="anim-open-item"
                @click="onOpen(a.name)"
              >
                <span>{{ a.name }}</span>
                <span class="text-dim">{{ a.keyframe_count }}kf</span>
              </li>
            </ul>
          </div>
          <button class="bp-btn text-xs" @click="onSave" :disabled="savingAnim">
            {{ savingAnim ? 'SAVING…' : 'SAVE' }}
          </button>
          <button class="bp-btn text-xs" @click="onDownload">DOWNLOAD</button>
          <button
            class="bp-btn text-xs"
            :class="{ 'text-accent': armed }"
            @click="onPlayOnRobot"
            :disabled="!armed || playingOnRobot"
            :title="armed ? 'Play on robot' : 'Arm first to enable'"
          >
            {{ playingOnRobot ? 'SENDING…' : 'PLAY ON ROBOT' }}
          </button>
          <label class="anim-arm mono text-xs">
            <input type="checkbox" :checked="armed" @change="armed = $event.target.checked" />
            ARM
          </label>
          <button class="bp-btn text-xs text-accent" @click="enterRigMode">RIG MODE</button>
        </template>
        <template v-else>
          <span class="mono text-xs text-accent">RIG MODE — M:move  R:rotate  Esc:deselect  Ctrl+S:save</span>
          <button class="bp-btn text-xs" @click="toggleCameraMode">
            {{ cameraMode === 'ortho' ? 'ORTHO' : 'PERSP' }}
          </button>
          <button class="bp-btn text-xs" @click="cancelRigMode">CANCEL</button>
          <button class="bp-btn text-xs text-accent" @click="saveRigMode" :disabled="saving">
            {{ saving ? 'SAVING…' : 'SAVE &amp; EXIT' }}
          </button>
        </template>
      </div>
    </div>

    <!-- Main: viewport + inspector -->
    <div class="anim-main flex-1 flex overflow-hidden">
      <div class="viewport-region flex-1">
        <Viewport3D
          ref="viewportRef"
          @rig-select="onRigSelect"
          @rig-save="saveRigMode"
          @rig-ready="onRigReady"
        />
      </div>
      <button
        class="inspector-toggle bp-btn text-xs"
        :class="{ active: inspectorOpen }"
        @click="inspectorOpen = !inspectorOpen"
        title="Toggle inspector"
      >⚙</button>
      <div class="inspector-region" :class="{ 'drawer-open': inspectorOpen }">
        <RigInspector
          v-if="rigMode"
          :selection="rigSelection"
          @update-joint-meta="onUpdateJointMeta"
        />
        <template v-else>
          <JointInspector :joints="jointMeta" />
          <EyeInspector />
        </template>
      </div>
    </div>

    <!-- Timeline -->
    <div class="anim-timeline">
      <Timeline />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import Viewport3D from './components/Viewport3D.vue'
import RigInspector from './components/RigInspector.vue'
import JointInspector from './components/JointInspector.vue'
import EyeInspector from './components/EyeInspector.vue'
import Timeline from './components/Timeline.vue'
import {
  newDoc as animNewDoc,
  loadDoc as animLoadDoc,
  getState as getAnimState,
  setDocMeta as animSetDocMeta,
} from './viewport/animation-store.js'
import { editorDocToAni, aniToEditorDoc } from './viewport/ani-io.js'

const statusLabel = ref('UNSAVED')
const viewportRef = ref(null)

const rigMode = ref(false)
const rigSelection = ref(null)
const saving = ref(false)
const cameraMode = ref('persp')
// Joint metadata (name, axis, limits) — published by the viewport once
// the rig finishes loading, consumed by JointInspector to build sliders.
const jointMeta = ref([])
const inspectorOpen = ref(false)

function onRigReady(meta) {
  jointMeta.value = meta
}

// ── Animation file operations ──
// NEW resets the in-memory document to an empty state. OPEN lists .ani
// files from /api/animations/ and loads the selected one via GET. SAVE
// PUTs the current doc back to /api/animations/{name} (round-tripping
// through ani-io.js to convert absolute→relative times). DOWNLOAD
// serializes the same payload and triggers a browser download so users
// can check in files to git locally.
const animList = ref([])
const openMenuVisible = ref(false)
const savingAnim = ref(false)
const armed = ref(false)
const playingOnRobot = ref(false)

async function refreshAnimList() {
  try {
    const res = await fetch('/api/animations/')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    animList.value = await res.json()
  } catch (e) {
    console.warn('[animation-editor] failed to list animations', e)
    animList.value = []
  }
}

async function toggleOpenMenu() {
  if (!openMenuVisible.value) await refreshAnimList()
  openMenuVisible.value = !openMenuVisible.value
}

function onNew() {
  if (hasUnsavedWork() && !confirm('Discard current animation?')) return
  animNewDoc()
  const newName = prompt('Animation name (lowercase, digits, underscore):', 'untitled')
  if (newName && /^[a-z0-9_]+$/.test(newName)) {
    animSetDocMeta({ name: newName })
  }
  statusLabel.value = 'NEW'
}

async function onOpen(name) {
  openMenuVisible.value = false
  if (hasUnsavedWork() && !confirm('Discard current animation?')) return
  try {
    const res = await fetch(`/api/animations/${encodeURIComponent(name)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    const ani = await res.json()
    animLoadDoc(aniToEditorDoc(ani))
    statusLabel.value = `LOADED ${name.toUpperCase()}`
  } catch (e) {
    console.error('[animation-editor] open failed', e)
    alert(`Failed to open ${name}: ${e.message || e}`)
  }
}

async function onSave() {
  const snap = getAnimState()
  if (!snap.doc.keyframes.length) {
    alert('Cannot save: animation has no keyframes.')
    return
  }
  const name = snap.doc.name
  if (!/^[a-z0-9_]+$/.test(name)) {
    alert(`Invalid name "${name}" — use lowercase letters, digits, underscores only.`)
    return
  }
  savingAnim.value = true
  try {
    const payload = editorDocToAni(snap.doc)
    const res = await fetch(`/api/animations/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    statusLabel.value = `SAVED ${name.toUpperCase()}`
    await refreshAnimList()
  } catch (e) {
    console.error('[animation-editor] save failed', e)
    alert(`Failed to save: ${e.message || e}`)
  } finally {
    savingAnim.value = false
  }
}

function onDownload() {
  const snap = getAnimState()
  if (!snap.doc.keyframes.length) {
    alert('Cannot download: animation has no keyframes.')
    return
  }
  const payload = editorDocToAni(snap.doc)
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${snap.doc.name}.ani`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function onPlayOnRobot() {
  if (!armed.value) return
  const snap = getAnimState()
  const name = snap.doc.name
  playingOnRobot.value = true
  try {
    // Save first so the robot plays what's on screen, not an older copy.
    await onSave()
    const res = await fetch(`/api/animations/${encodeURIComponent(name)}/play`, {
      method: 'POST',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    statusLabel.value = `▶ ${name.toUpperCase()} ON ROBOT`
  } catch (e) {
    console.error('[animation-editor] play failed', e)
    alert(`Failed to play on robot: ${e.message || e}`)
  } finally {
    playingOnRobot.value = false
  }
}

function hasUnsavedWork() {
  // Rough heuristic — the store doesn't yet track a dirty flag, so we
  // treat any keyframes at all as "unsaved". A proper dirty tracker can
  // come later once we persist the last-saved snapshot.
  return getAnimState().doc.keyframes.length > 0
}

function toggleCameraMode() {
  cameraMode.value = cameraMode.value === 'persp' ? 'ortho' : 'persp'
  viewportRef.value?.setCameraMode(cameraMode.value)
}

function enterRigMode() {
  viewportRef.value?.enableRigMode()
  rigMode.value = true
  rigSelection.value = null
  statusLabel.value = 'RIG MODE'
}

function cancelRigMode() {
  viewportRef.value?.cancelRigMode()
  viewportRef.value?.setCameraMode('persp')
  cameraMode.value = 'persp'
  rigMode.value = false
  rigSelection.value = null
  statusLabel.value = 'UNSAVED'
}

async function saveRigMode() {
  if (!rigMode.value || saving.value) return
  const cfg = viewportRef.value?.getRigLiveConfig()
  if (!cfg) return
  saving.value = true
  try {
    const res = await fetch('/api/rig/', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`HTTP ${res.status}: ${text}`)
    }
    viewportRef.value?.disableRigMode()
    viewportRef.value?.setCameraMode('persp')
    cameraMode.value = 'persp'
    rigMode.value = false
    rigSelection.value = null
    statusLabel.value = 'RIG SAVED'
  } catch (e) {
    console.error('[animation-editor] rig save failed', e)
    alert(`Failed to save rig: ${e.message || e}`)
  } finally {
    saving.value = false
  }
}

function onRigSelect(sel) {
  rigSelection.value = sel
}

function onUpdateJointMeta(name, patch) {
  viewportRef.value?.updateJointMeta(name, patch)
}
</script>

<style scoped>
.anim-page {
  background: var(--bg-0, #0b0d10);
  color: var(--fg-0, #d8dee8);
}
.anim-toolbar {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border, #1e2328);
  background: var(--bg-1, #10131a);
  flex-shrink: 0;
  flex-wrap: wrap;
  row-gap: 6px;
}
.anim-open-wrap {
  position: relative;
}
.anim-open-menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  list-style: none;
  padding: 4px 0;
  min-width: 180px;
  max-width: calc(100vw - 32px);
  max-height: 320px;
  overflow-y: auto;
  background: var(--bg-0, #0b0d10);
  border: 1px solid var(--border, #1e2328);
  z-index: 30;
}
.anim-open-item {
  padding: 4px 10px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  white-space: nowrap;
}
.anim-open-item:hover {
  background: var(--bg-1, #10131a);
  color: var(--accent, #4dd0ff);
}
.anim-open-empty {
  padding: 6px 10px;
}
.anim-arm {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--fg-dim, #8891a0);
}
.anim-main {
  min-height: 0;
}
.viewport-region {
  min-width: 0;
  background: #0a0c10;
  position: relative;
}
.inspector-region {
  width: var(--anim-inspector-width, 340px);
  flex-shrink: 0;
  border-left: 1px solid var(--border, #1e2328);
  background: var(--bg-1, #10131a);
  overflow-y: auto;
  transition: width var(--transition-med);
}
.inspector-toggle {
  display: none;
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 20;
  width: 30px;
  height: 30px;
  padding: 0;
  font-size: 14px;
  line-height: 1;
}
.inspector-toggle.active { border-color: var(--glow-primary); color: var(--glow-primary); }
@media (max-width: 1100px) {
  .inspector-region {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    z-index: 15;
    box-shadow: -2px 0 12px rgba(0, 0, 0, 0.4);
    transform: translateX(100%);
    transition: transform var(--transition-med);
  }
  .inspector-region.drawer-open {
    transform: translateX(0);
  }
  .inspector-toggle { display: inline-flex; align-items: center; justify-content: center; }
  .anim-main { position: relative; }
}
.inspector-region :deep(.joint-inspector),
.inspector-region :deep(.eye-inspector) {
  border-bottom: 1px solid var(--border, #1e2328);
}
.inspector-placeholder,
.timeline-placeholder {
  padding: 16px;
  text-align: center;
  line-height: 1.6;
}
.anim-timeline {
  height: 180px;
  flex-shrink: 0;
  border-top: 1px solid var(--border, #1e2328);
  background: var(--bg-1, #10131a);
}
</style>
