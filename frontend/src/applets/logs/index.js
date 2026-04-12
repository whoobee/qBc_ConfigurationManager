export default {
  id: 'logs',
  name: 'Logs',
  icon: 'logs',
  route: '/logs',
  component: () => import('./LogsPage.vue'),
  order: 30,
  category: 'tools',
  description: 'Live service log viewer',
}
