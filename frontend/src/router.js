import { createRouter, createWebHistory } from 'vue-router'
import { getAppletRoutes } from './applets/registry.js'

const routes = [
  {
    path: '/',
    redirect: '/dashboard',
  },
  ...getAppletRoutes(),
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
