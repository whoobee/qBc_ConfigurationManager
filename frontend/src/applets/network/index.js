export default {
  id: 'network',
  name: 'Network',
  icon: 'network',
  route: '/network',
  component: () => import('./NetworkPage.vue'),
  order: 15,
  category: 'system',
  description: 'MQTT network topology viewer',
}
