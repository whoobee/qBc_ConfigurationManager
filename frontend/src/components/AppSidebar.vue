<template>
  <aside class="sidebar" :class="{ collapsed }">
    <!-- Logo area -->
    <div class="sidebar-logo">
      <button class="hamburger-btn" @click="toggle" :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <line x1="3" y1="5" x2="17" y2="5"/>
          <line x1="3" y1="10" x2="17" y2="10"/>
          <line x1="3" y1="15" x2="17" y2="15"/>
        </svg>
      </button>
      <transition name="fade-text">
        <div v-if="!collapsed" class="logo-text">
          <span class="logo-title text-glow">qB</span>
          <span class="logo-sub">CONFIG</span>
        </div>
      </transition>
    </div>

    <div class="sidebar-divider"></div>

    <!-- Nav groups -->
    <nav class="sidebar-nav">
      <template v-for="(apps, category) in groupedApplets" :key="category">
        <div v-if="!collapsed" class="nav-group-label">{{ category }}</div>
        <router-link
          v-for="app in apps"
          :key="app.id"
          :to="app.route"
          class="nav-item"
          :class="{ active: $route.meta.appletId === app.id }"
          :title="collapsed ? app.name : ''"
        >
          <span class="nav-icon" v-html="getIcon(app.icon)"></span>
          <transition name="fade-text">
            <span v-if="!collapsed" class="nav-label">{{ app.name }}</span>
          </transition>
          <span v-if="$route.meta.appletId === app.id" class="nav-indicator"></span>
        </router-link>
      </template>
    </nav>

    <!-- Bottom status -->
    <div class="sidebar-footer">
      <div class="sidebar-divider"></div>
      <div class="mqtt-status" :class="{ connected: mqttConnected }">
        <span class="status-dot" :class="mqttConnected ? 'alive' : 'dead'"></span>
        <transition name="fade-text">
          <span v-if="!collapsed" class="mono text-xs">{{ mqttConnected ? 'MQTT ONLINE' : 'MQTT OFFLINE' }}</span>
        </transition>
      </div>
    </div>

  </aside>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useMqttStore } from '../stores/mqtt.js'
import { getAppletsByCategory } from '../applets/registry.js'

const mqttStore = useMqttStore()
const mqttConnected = computed(() => mqttStore.connected)
const groupedApplets = getAppletsByCategory()

const collapsed = ref(localStorage.getItem('sidebar-collapsed') === 'true')

function toggle() {
  collapsed.value = !collapsed.value
  localStorage.setItem('sidebar-collapsed', collapsed.value)
}

const icons = {
  grid: '<svg viewBox="0 0 20 20" fill="currentColor"><rect x="2" y="2" width="7" height="7" rx="1.5"/><rect x="11" y="2" width="7" height="7" rx="1.5"/><rect x="2" y="11" width="7" height="7" rx="1.5"/><rect x="11" y="11" width="7" height="7" rx="1.5"/></svg>',
  edit: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13.5 3.5l3 3L7 16H4v-3L13.5 3.5z"/><path d="M11 6l3 3"/></svg>',
  activity: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="2 10 5 10 7 4 10 16 13 8 15 10 18 10"/></svg>',
  network: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="4" r="2.5" fill="currentColor" opacity="0.3"/><circle cx="4" cy="16" r="2.5" fill="currentColor" opacity="0.3"/><circle cx="16" cy="16" r="2.5" fill="currentColor" opacity="0.3"/><line x1="10" y1="6.5" x2="5.5" y2="13.5"/><line x1="10" y1="6.5" x2="14.5" y2="13.5"/><line x1="6.5" y1="16" x2="13.5" y2="16"/></svg>',
  ai: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="3" width="12" height="10" rx="2"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="12" cy="8" r="1.5" fill="currentColor"/><path d="M4 13v1a2 2 0 002 2h8a2 2 0 002-2v-1"/><line x1="10" y1="16" x2="10" y2="18"/><line x1="7" y1="18" x2="13" y2="18"/></svg>',
  logs: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="14" height="14" rx="2"/><line x1="6" y1="7" x2="14" y2="7"/><line x1="6" y1="10" x2="14" y2="10"/><line x1="6" y1="13" x2="11" y2="13"/></svg>',
  settings: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M10 1.5 L11.2 1.7 L11.5 3.7 Q12.4 4 13.2 4.5 L14.9 3.4 L16.6 5.1 L15.5 6.8 Q16 7.6 16.3 8.5 L18.3 8.8 L18.5 10 L18.3 11.2 L16.3 11.5 Q16 12.4 15.5 13.2 L16.6 14.9 L14.9 16.6 L13.2 15.5 Q12.4 16 11.5 16.3 L11.2 18.3 L10 18.5 L8.8 18.3 L8.5 16.3 Q7.6 16 6.8 15.5 L5.1 16.6 L3.4 14.9 L4.5 13.2 Q4 12.4 3.7 11.5 L1.7 11.2 L1.5 10 L1.7 8.8 L3.7 8.5 Q4 7.6 4.5 6.8 L3.4 5.1 L5.1 3.4 L6.8 4.5 Q7.6 4 8.5 3.7 L8.8 1.7 Z"/><circle cx="10" cy="10" r="2.6"/></svg>',
  compass: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="8"/><polygon points="7,13 9,9 13,7 11,11" fill="currentColor" opacity="0.5"/></svg>',
  animation: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2.5" y="5" width="15" height="10" rx="1.5"/><line x1="2.5" y1="8" x2="17.5" y2="8"/><line x1="2.5" y1="12" x2="17.5" y2="12"/><circle cx="6" cy="6.5" r="0.6" fill="currentColor"/><circle cx="10" cy="6.5" r="0.6" fill="currentColor"/><circle cx="14" cy="6.5" r="0.6" fill="currentColor"/><circle cx="6" cy="13.5" r="0.6" fill="currentColor"/><circle cx="10" cy="13.5" r="0.6" fill="currentColor"/><circle cx="14" cy="13.5" r="0.6" fill="currentColor"/></svg>',
  controls: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="5" y1="3" x2="5" y2="17"/><line x1="10" y1="3" x2="10" y2="17"/><line x1="15" y1="3" x2="15" y2="17"/><circle cx="5" cy="7" r="1.8" fill="currentColor"/><circle cx="10" cy="13" r="1.8" fill="currentColor"/><circle cx="15" cy="9" r="1.8" fill="currentColor"/></svg>',
  navigation: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 16 C 5 11, 8 14, 12 9" stroke-dasharray="2 2"/><circle cx="3" cy="16" r="1.3" fill="currentColor"/><path d="M14 3 C 12 3, 11 4.5, 11 6 C 11 8.5, 14 12, 14 12 C 14 12, 17 8.5, 17 6 C 17 4.5, 15.5 3, 14 3 z" fill="currentColor" opacity="0.25"/><circle cx="14" cy="6" r="1.2" fill="currentColor"/></svg>',
  sensors: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="10" cy="10" r="8"/><circle cx="10" cy="10" r="5"/><circle cx="10" cy="10" r="1.6" fill="currentColor"/><line x1="10" y1="10" x2="16" y2="4"/><circle cx="13.2" cy="6.8" r="1" fill="currentColor"/></svg>',
  telemetry: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4.5" width="15" height="10" rx="1.5"/><circle cx="10" cy="9.5" r="2.6"/><circle cx="10" cy="9.5" r="0.7" fill="currentColor"/><line x1="7" y1="17" x2="13" y2="17"/><line x1="10" y1="14.5" x2="10" y2="17"/></svg>',
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
  transition: width var(--transition-med);
  position: relative;
}
.sidebar.collapsed {
  width: var(--sidebar-collapsed-width);
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  height: var(--topbar-height);
  overflow: hidden;
}
.collapsed .sidebar-logo {
  justify-content: center;
  padding: 16px 0;
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
.logo-text {
  white-space: nowrap;
}

.sidebar-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border-default), transparent);
  margin: 0 12px;
}
.collapsed .sidebar-divider {
  margin: 0 6px;
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
  white-space: nowrap;
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
  overflow: hidden;
  white-space: nowrap;
}
.collapsed .nav-item {
  padding: 10px 0;
  justify-content: center;
  margin: 2px 4px;
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
.nav-label {
  white-space: nowrap;
}
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
.collapsed .sidebar-footer {
  padding: 12px 8px;
}
.mqtt-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
}
.collapsed .mqtt-status {
  justify-content: center;
}
.mqtt-status.connected { color: var(--glow-success); }

/* Hamburger toggle button */
.hamburger-btn {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}
.hamburger-btn:hover {
  color: var(--glow-primary);
  background: var(--bg-hover);
}
.hamburger-btn svg {
  width: 20px;
  height: 20px;
}

/* Text fade transition */
.fade-text-enter-active,
.fade-text-leave-active {
  transition: opacity 0.15s ease;
}
.fade-text-enter-from,
.fade-text-leave-to {
  opacity: 0;
}
</style>
