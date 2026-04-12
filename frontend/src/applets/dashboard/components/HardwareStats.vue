<template>
  <div class="hw-stats">
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-icon">T</span>
          <span class="stat-title">CPU TEMP</span>
        </div>
        <span class="stat-value mono" :class="tempClass">
          {{ rpi.cpu_temp_c != null ? rpi.cpu_temp_c + '°C' : '--' }}
        </span>
        <div class="stat-bar">
          <div class="bar-fill" :class="tempClass" :style="{ width: tempPct + '%' }"></div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-icon">C</span>
          <span class="stat-title">CPU LOAD</span>
        </div>
        <span class="stat-value mono">
          {{ rpi.load_1m != null ? rpi.load_1m.toFixed(2) : '--' }}
        </span>
        <span class="stat-sub mono">
          {{ rpi.load_5m != null ? `${rpi.load_5m.toFixed(2)} / ${rpi.load_15m.toFixed(2)}` : '' }}
        </span>
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-icon">R</span>
          <span class="stat-title">RAM</span>
        </div>
        <span class="stat-value mono" :class="ramClass">
          {{ rpi.ram_pct != null ? rpi.ram_pct + '%' : '--' }}
        </span>
        <span class="stat-sub mono">
          {{ rpi.ram_used_mb != null ? `${rpi.ram_used_mb} / ${rpi.ram_total_mb} MB` : '' }}
        </span>
        <div class="stat-bar">
          <div class="bar-fill" :class="ramClass" :style="{ width: (rpi.ram_pct || 0) + '%' }"></div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-icon">D</span>
          <span class="stat-title">DISK</span>
        </div>
        <span class="stat-value mono" :class="diskClass">
          {{ rpi.disk_pct != null ? rpi.disk_pct + '%' : '--' }}
        </span>
        <span class="stat-sub mono">
          {{ rpi.disk_used_gb != null ? `${rpi.disk_used_gb} / ${rpi.disk_total_gb} GB` : '' }}
        </span>
        <div class="stat-bar">
          <div class="bar-fill" :class="diskClass" :style="{ width: (rpi.disk_pct || 0) + '%' }"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  rpi: { type: Object, default: () => ({}) },
})

const tempPct = computed(() => {
  const t = props.rpi.cpu_temp_c
  if (t == null) return 0
  return Math.min(100, Math.max(0, (t / 100) * 100))
})

const tempClass = computed(() => {
  const t = props.rpi.cpu_temp_c
  if (t == null) return ''
  if (t >= 80) return 'val-danger'
  if (t >= 65) return 'val-warn'
  return 'val-ok'
})

const ramClass = computed(() => {
  const p = props.rpi.ram_pct
  if (p == null) return ''
  if (p >= 90) return 'val-danger'
  if (p >= 75) return 'val-warn'
  return 'val-ok'
})

const diskClass = computed(() => {
  const p = props.rpi.disk_pct
  if (p == null) return ''
  if (p >= 90) return 'val-danger'
  if (p >= 75) return 'val-warn'
  return 'val-ok'
})
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

.stat-sub {
  font-size: 0.65rem;
  color: var(--text-dim);
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
</style>
