export default {
  id: 'sensors',
  name: 'Sensors',
  icon: 'sensors',
  route: '/sensors',
  component: () => import('./SensorsPage.vue'),
  order: 11,
  category: 'tools',
  description: 'Live Teensy sensor & actuator telemetry',
}
