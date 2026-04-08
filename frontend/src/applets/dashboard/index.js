export default {
  id: 'dashboard',
  name: 'Status Dashboard',
  icon: 'grid',
  route: '/dashboard',
  component: () => import('./DashboardPage.vue'),
  order: 0,
  category: 'system',
  description: 'Service heartbeats, system overview, and connection status',
}
