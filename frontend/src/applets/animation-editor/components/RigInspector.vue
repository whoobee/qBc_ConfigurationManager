<template>
  <div class="rig-inspector mono text-xs">
    <div class="ri-section">
      <div class="ri-title">RIG INSPECTOR</div>
      <div v-if="!selection" class="ri-empty text-dim">
        Click a pivot marker or a mesh to edit.
      </div>
      <template v-else>
        <div class="ri-row">
          <span class="ri-label">kind</span>
          <span class="ri-value text-accent">{{ selection.kind }}</span>
        </div>
        <div v-if="selection.name" class="ri-row">
          <span class="ri-label">name</span>
          <span class="ri-value">{{ selection.name }}</span>
        </div>

        <!-- Mesh-entry fields: translate + rotate (read-only, updated by gizmo) -->
        <template v-if="selection.kind !== 'jointPivot'">
          <div class="ri-row">
            <span class="ri-label">translate</span>
            <span class="ri-value">{{ fmtVec(translate) }}</span>
          </div>
          <div v-if="rotate" class="ri-row">
            <span class="ri-label">rotate°</span>
            <span class="ri-value">{{ fmtVec(rotate) }}</span>
          </div>
        </template>

        <!-- Pivot fields: pivot value (read-only) -->
        <template v-else>
          <div class="ri-row">
            <span class="ri-label">pivot</span>
            <span class="ri-value">{{ fmtVec(pivot) }}</span>
          </div>
        </template>
      </template>
    </div>

    <!-- Joint axis/limits editor — only for joint entries -->
    <div v-if="isJoint" class="ri-section">
      <div class="ri-title">JOINT AXIS &amp; LIMITS</div>
      <div class="ri-row">
        <span class="ri-label">axis</span>
        <select class="ri-input" :value="axis" @change="onAxisChange($event.target.value)">
          <option value="x">x</option>
          <option value="y">y</option>
          <option value="z">z</option>
        </select>
      </div>
      <div class="ri-row">
        <span class="ri-label">min°</span>
        <input
          class="ri-input"
          type="number"
          step="1"
          :value="limits[0]"
          @change="onLimitChange(0, $event.target.value)"
        />
      </div>
      <div class="ri-row">
        <span class="ri-label">max°</span>
        <input
          class="ri-input"
          type="number"
          step="1"
          :value="limits[1]"
          @change="onLimitChange(1, $event.target.value)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, defineProps, defineEmits } from 'vue'

const props = defineProps({
  selection: { type: Object, default: null },
})
const emit = defineEmits(['update-joint-meta'])

const isJoint = computed(
  () => props.selection && props.selection.kind !== 'body',
)

const translate = computed(() => {
  const e = props.selection?.entry
  if (!e) return [0, 0, 0]
  return e.model?.translate || [0, 0, 0]
})

const rotate = computed(() => props.selection?.entry?.model?.rotate || null)

const pivot = computed(() => props.selection?.entry?.pivot || [0, 0, 0])

const axis = computed(() => props.selection?.entry?.axis || 'x')
const limits = computed(() => props.selection?.entry?.limits || [-90, 90])

function fmtVec(v) {
  if (!v) return '—'
  return `[${v.map((n) => Number(n).toFixed(2)).join(', ')}]`
}

function onAxisChange(newAxis) {
  if (!props.selection?.name) return
  emit('update-joint-meta', props.selection.name, { axis: newAxis })
}

function onLimitChange(idx, val) {
  if (!props.selection?.name) return
  const next = [...limits.value]
  next[idx] = Number(val)
  emit('update-joint-meta', props.selection.name, { limits: next })
}
</script>

<style scoped>
.rig-inspector {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.ri-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border, #1e2328);
}
.ri-section:last-child { border-bottom: none; }
.ri-title {
  color: var(--accent, #4dd0ff);
  letter-spacing: 0.08em;
  margin-bottom: 4px;
}
.ri-empty {
  padding: 8px 0;
  line-height: 1.5;
}
.ri-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.ri-label {
  color: var(--fg-dim, #8891a0);
  min-width: 60px;
}
.ri-value {
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.ri-input {
  background: var(--bg-0, #0b0d10);
  border: 1px solid var(--border, #1e2328);
  color: var(--fg-0, #d8dee8);
  padding: 2px 6px;
  font-family: inherit;
  font-size: inherit;
  width: 90px;
  text-align: right;
}
.text-accent { color: var(--accent, #4dd0ff); }
.text-dim { color: var(--fg-dim, #8891a0); }
</style>
