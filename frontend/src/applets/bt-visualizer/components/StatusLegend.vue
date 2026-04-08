<template>
  <div class="legend">
    <span class="legend-item" v-for="(color, status) in statuses" :key="status">
      <span class="legend-dot" :style="{ background: color, boxShadow: `0 0 6px ${color}` }"></span>
      <span class="mono text-xs">{{ status }}</span>
    </span>
  </div>
</template>

<script setup>
const statuses = {
  SUCCESS: '#00ff88',
  FAILURE: '#ff3366',
  RUNNING: '#00d4ff',
  INVALID: '#666666',
}
</script>

<style scoped>
.legend {
  display: flex;
  gap: 12px;
  align-items: center;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-dim);
}
.legend-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
</style>
