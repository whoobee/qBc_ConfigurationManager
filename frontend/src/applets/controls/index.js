export default {
  id: 'controls',
  name: 'Controls',
  icon: 'controls',
  route: '/controls',
  component: () => import('./ControlsPage.vue'),
  order: 12,
  category: 'tools',
  description: 'Manual MQTT control of servos and wheel motors (armed gate)',
}
