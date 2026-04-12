<template>
  <div class="accel-stats" v-if="axcl.available">
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-icon npu">N</span>
          <span class="stat-title">{{ axcl.name || 'NPU' }} TEMP</span>
        </div>
        <span class="stat-value mono" :class="tempClass">
          {{ axcl.temp_c != null ? axcl.temp_c + '°C' : '--' }}
        </span>
        <div class="stat-bar">
          <div class="bar-fill" :class="tempClass" :style="{ width: tempPct + '%' }"></div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-icon npu">C</span>
          <span class="stat-title">CPU / NPU</span>
        </div>
        <div class="dual-value">
          <div class="dual-item">
            <span class="dual-label mono">CPU</span>
            <span class="stat-value mono small">{{ axcl.cpu_pct != null ? axcl.cpu_pct + '%' : '--' }}</span>
          </div>
          <div class="dual-item">
            <span class="dual-label mono">NPU</span>
            <span class="stat-value mono small">{{ axcl.npu_pct != null ? axcl.npu_pct + '%' : '--' }}</span>
          </div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-icon npu">M</span>
          <span class="stat-title">BOARD MEM</span>
        </div>
        <span class="stat-value mono" :class="memClass">
          {{ axcl.mem_pct != null ? axcl.mem_pct + '%' : '--' }}
        </span>
        <span class="stat-sub mono">
          {{ axcl.mem_used_mb != null ? `${axcl.mem_used_mb} / ${axcl.mem_total_mb} MB` : '' }}
        </span>
        <div class="stat-bar">
          <div class="bar-fill" :class="memClass" :style="{ width: (axcl.mem_pct || 0) + '%' }"></div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-icon npu">C</span>
          <span class="stat-title">CMM MEM</span>
        </div>
        <span class="stat-value mono" :class="cmmClass">
          {{ axcl.cmm_pct != null ? axcl.cmm_pct + '%' : '--' }}
        </span>
        <span class="stat-sub mono">
          {{ axcl.cmm_used_mb != null ? `${axcl.cmm_used_mb} / ${axcl.cmm_total_mb} MB` : '' }}
        </span>
        <div class="stat-bar">
          <div class="bar-fill" :class="cmmClass" :style="{ width: (axcl.cmm_pct || 0) + '%' }"></div>
        </div>
      </div>
    </div>

    <!-- Processes -->
    <div v-if="axcl.processes && axcl.processes.length" class="proc-section">
      <span class="proc-title mono">PROCESSES</span>
      <div class="proc-list">
        <div v-for="p in axcl.processes" :key="p.pid" class="proc-row mono">
          <span class="proc-name">{{ p.name }}</span>
          <span class="proc-mem">{{ formatMem(p.mem_kib) }}</span>
          <span class="proc-pid text-dim">PID {{ p.pid }}</span>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="accel-offline">
    <span class="text-dim text-xs mono">AXCL accelerator not detected</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  axcl: { type: Object, default: () => ({ available: false }) },
})

const tempPct = computed(() => {
  const t = props.axcl.temp_c
  if (t == null) return 0
  return Math.min(100, (t / 105) * 100)
})

const tempClass = computed(() => {
  const t = props.axcl.temp_c
  if (t == null) return ''
  if (t >= 90) return 'val-danger'
  if (t >= 75) return 'val-warn'
  return 'val-ok'
})

function usageClass(pct) {
  if (pct == null) return ''
  if (pct >= 90) return 'val-danger'
  if (pct >= 75) return 'val-warn'
  return 'val-ok'
}

const memClass = computed(() => usageClass(props.axcl.mem_pct))
const cmmClass = computed(() => usageClass(props.axcl.cmm_pct))

function formatMem(kib) {
  if (kib == null) return '--'
  if (kib >= 1024 * 1024) return (kib / (1024 * 1024)).toFixed(1) + ' GB'
  if (kib >= 1024) return Math.round(kib / 1024) + ' MB'
  return kib + ' KB'
}
</script>

<style scoped>
.stat-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.stat-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.stat-icon {
  font-family: var(--text-mono);
  font-size: 0.65rem;
  font-weight: 700;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  background: rgba(0, 176, 255, 0.12);
  color: #00b0ff;
}
.stat-icon.npu {
  background: rgba(156, 39, 176, 0.15);
  color: #ce93d8;
}

.stat-title {
  font-family: var(--text-mono);
  font-size: 0.6rem;
  color: var(--text-dim);
  letter-spacing: 1.5px;
  text-transform: uppercase;
}

.stat-value {
  font-size: 1.3rem;
  font-weight: 700;
}
.stat-value.small {
  font-size: 1rem;
}

.stat-sub {
  font-size: 0.65rem;
  color: var(--text-dim);
}

.dual-value {
  display: flex;
  gap: 16px;
}
.dual-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dual-label {
  font-size: 0.55rem;
  color: var(--text-dim);
  letter-spacing: 1px;
}

.stat-bar {
  height: 4px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 4px;
}
.bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.5s ease;
}

.val-ok { color: #00e676; }
.val-ok.bar-fill { background: #00e676; }
.val-warn { color: #ffd600; }
.val-warn.bar-fill { background: #ffd600; }
.val-danger { color: #ff3366; }
.val-danger.bar-fill { background: #ff3366; }

.proc-section {
  margin-top: 12px;
}
.proc-title {
  font-size: 0.6rem;
  color: var(--text-dim);
  letter-spacing: 1.5px;
  text-transform: uppercase;
}
.proc-list {
  margin-top: 6px;
}
.proc-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 3px 0;
  font-size: 0.75rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.proc-name { color: var(--text-primary); flex: 1; }
.proc-mem { color: #ce93d8; }
.proc-pid { font-size: 0.65rem; }

.accel-offline {
  padding: 16px;
  text-align: center;
}
</style>
