export default {
  id: 'telemetry',
  name: 'Telemetry',
  icon: 'telemetry',
  route: '/telemetry',
  component: () => import('./TelemetryPage.vue'),
  order: 9,
  category: 'tools',
  description: 'Live camera stream with manual joystick drive',
}
