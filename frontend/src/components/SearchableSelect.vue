<template>
  <div class="ss-wrapper" ref="wrapper">
    <input
      ref="input"
      class="ss-input mono text-xs"
      :value="modelValue"
      :placeholder="placeholder"
      @input="onInput"
      @focus="open = true"
      @keydown.down.prevent="moveHighlight(1)"
      @keydown.up.prevent="moveHighlight(-1)"
      @keydown.enter.prevent="selectHighlighted"
      @keydown.escape="open = false"
    />
    <div v-if="open && filtered.length > 0" class="ss-dropdown">
      <div
        v-for="(item, idx) in filtered"
        :key="item"
        class="ss-option mono text-xs"
        :class="{ 'ss-option--hl': idx === highlight }"
        @mousedown.prevent="select(item)"
        @mouseenter="highlight = idx"
      >
        {{ item }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const highlight = ref(0)
const wrapper = ref(null)
const input = ref(null)

const filtered = computed(() => {
  const q = String(props.modelValue).toLowerCase()
  if (!q) return props.options
  return props.options.filter(o => String(o).toLowerCase().includes(q))
})

watch(filtered, () => {
  highlight.value = 0
})

function onInput(e) {
  emit('update:modelValue', e.target.value)
  open.value = true
}

function select(item) {
  emit('update:modelValue', item)
  open.value = false
}

function moveHighlight(dir) {
  if (!open.value) { open.value = true; return }
  highlight.value = Math.max(0, Math.min(filtered.value.length - 1, highlight.value + dir))
}

function selectHighlighted() {
  if (open.value && filtered.value.length > 0) {
    select(filtered.value[highlight.value])
  }
}

function onClickOutside(e) {
  if (wrapper.value && !wrapper.value.contains(e.target)) {
    open.value = false
  }
}

onMounted(() => document.addEventListener('mousedown', onClickOutside))
onUnmounted(() => document.removeEventListener('mousedown', onClickOutside))
</script>

<style scoped>
.ss-wrapper {
  position: relative;
  width: 100%;
}

.ss-input {
  width: 100%;
  padding: 6px 8px;
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-family: var(--text-mono);
  outline: none;
  transition: border-color var(--transition-fast);
}
.ss-input:focus {
  border-color: var(--glow-primary);
}

.ss-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  max-height: 180px;
  overflow-y: auto;
  background: var(--bg-card);
  border: 1px solid var(--glow-primary);
  border-top: none;
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.ss-option {
  padding: 5px 8px;
  cursor: pointer;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ss-option:hover,
.ss-option--hl {
  background: rgba(0, 176, 255, 0.12);
  color: var(--text-primary);
}
</style>
