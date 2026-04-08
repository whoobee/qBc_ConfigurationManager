<template>
  <div class="app-shell">
    <AppSidebar />
    <div class="app-main">
      <AppTopbar />
      <main class="app-content">
        <router-view v-slot="{ Component }">
          <transition name="page-fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
    <!-- Scanline overlay for cinematic feel -->
    <div class="scanline-overlay"></div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import AppSidebar from './components/AppSidebar.vue'
import AppTopbar from './components/AppTopbar.vue'
import { useMqttStore } from './stores/mqtt.js'
import { useSystemStore } from './stores/system.js'

const mqtt = useMqttStore()
const system = useSystemStore()

onMounted(() => {
  mqtt.connect()
  system.init()
})

onUnmounted(() => {
  system.destroy()
  mqtt.disconnect()
})
</script>

<style scoped>
.app-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.app-content {
  flex: 1;
  overflow: auto;
  padding: 20px;
}

/* Page transition */
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.page-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.page-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
