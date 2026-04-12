<template>
  <aside class="sidebar">
    <!-- Logo area -->
    <div class="sidebar-logo">
      <div class="logo-icon">
        <svg viewBox="0 0 40 40" class="logo-svg">
          <circle cx="14" cy="17" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/>
          <circle cx="26" cy="17" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/>
          <circle cx="14" cy="17" r="2" fill="currentColor" opacity="0.7"/>
          <circle cx="26" cy="17" r="2" fill="currentColor" opacity="0.7"/>
          <path d="M12 28 Q20 34 28 28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </div>
      <div class="logo-text">
        <span class="logo-title text-glow">qB</span>
        <span class="logo-sub">CONFIG</span>
      </div>
    </div>

    <div class="sidebar-divider"></div>

    <!-- Nav groups -->
    <nav class="sidebar-nav">
      <template v-for="(apps, category) in groupedApplets" :key="category">
        <div class="nav-group-label">{{ category }}</div>
        <router-link
          v-for="app in apps"
          :key="app.id"
          :to="app.route"
          class="nav-item"
          :class="{ active: $route.meta.appletId === app.id }"
        >
          <span class="nav-icon" v-html="getIcon(app.icon)"></span>
          <span class="nav-label">{{ app.name }}</span>
          <span v-if="$route.meta.appletId === app.id" class="nav-indicator"></span>
        </router-link>
      </template>
    </nav>

    <!-- Bottom status -->
    <div class="sidebar-footer">
      <div class="sidebar-divider"></div>
      <div class="mqtt-status" :class="{ connected: mqttConnected }">
        <span class="status-dot" :class="mqttConnected ? 'alive' : 'dead'"></span>
        <span class="mono text-xs">{{ mqttConnected ? 'MQTT ONLINE' : 'MQTT OFFLINE' }}</span>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import { useMqttStore } from '../stores/mqtt.js'
import { getAppletsByCategory } from '../applets/registry.js'

const mqttStore = useMqttStore()
const mqttConnected = computed(() => mqttStore.connected)
const groupedApplets = getAppletsByCategory()

const icons = {
  grid: '<svg viewBox="0 0 20 20" fill="currentColor"><rect x="2" y="2" width="7" height="7" rx="1.5"/><rect x="11" y="2" width="7" height="7" rx="1.5"/><rect x="2" y="11" width="7" height="7" rx="1.5"/><rect x="11" y="11" width="7" height="7" rx="1.5"/></svg>',
  edit: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13.5 3.5l3 3L7 16H4v-3L13.5 3.5z"/><path d="M11 6l3 3"/></svg>',
  activity: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="2 10 5 10 7 4 10 16 13 8 15 10 18 10"/></svg>',
  network: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="4" r="2.5" fill="currentColor" opacity="0.3"/><circle cx="4" cy="16" r="2.5" fill="currentColor" opacity="0.3"/><circle cx="16" cy="16" r="2.5" fill="currentColor" opacity="0.3"/><line x1="10" y1="6.5" x2="5.5" y2="13.5"/><line x1="10" y1="6.5" x2="14.5" y2="13.5"/><line x1="6.5" y1="16" x2="13.5" y2="16"/></svg>',
  ai: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="3" width="12" height="10" rx="2"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="12" cy="8" r="1.5" fill="currentColor"/><path d="M4 13v1a2 2 0 002 2h8a2 2 0 002-2v-1"/><line x1="10" y1="16" x2="10" y2="18"/><line x1="7" y1="18" x2="13" y2="18"/></svg>',
}

function getIcon(name) {
  return icons[name] || icons.grid
}
</script>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  height: 100%;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  height: var(--topbar-height);
}
.logo-icon {
  width: 36px;
  height: 36px;
  color: var(--glow-primary);
  filter: drop-shadow(0 0 6px rgba(0, 212, 255, 0.4));
}
.logo-svg { width: 100%; height: 100%; }
.logo-title {
  font-family: var(--text-heading);
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--glow-primary);
}
.logo-sub {
  font-family: var(--text-mono);
  font-size: 0.65rem;
  color: var(--text-dim);
  letter-spacing: 3px;
  display: block;
  margin-top: -4px;
}

.sidebar-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border-default), transparent);
  margin: 0 12px;
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.nav-group-label {
  padding: 16px 16px 6px;
  font-family: var(--text-mono);
  font-size: 0.65rem;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  margin: 2px 8px;
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  text-decoration: none;
  font-size: 0.88rem;
  font-weight: 500;
  transition: all var(--transition-fast);
  position: relative;
}
.nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-bright);
}
.nav-item.active {
  background: rgba(0, 212, 255, 0.08);
  color: var(--glow-primary);
  border: 1px solid var(--border-default);
}
.nav-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  opacity: 0.7;
}
.nav-item.active .nav-icon { opacity: 1; }
.nav-indicator {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 60%;
  background: var(--glow-primary);
  border-radius: 0 2px 2px 0;
  box-shadow: 0 0 8px var(--glow-primary);
}

.sidebar-footer {
  padding: 12px 16px;
}
.mqtt-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  color: var(--text-dim);
}
.mqtt-status.connected { color: var(--glow-success); }
</style>
