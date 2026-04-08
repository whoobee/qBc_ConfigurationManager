export default {
  id: 'bt-visualizer',
  name: 'BT Visualizer',
  icon: 'activity',
  route: '/bt-visualizer',
  component: () => import('./BtVisualizerPage.vue'),
  order: 11,
  category: 'behavior',
  description: 'Live behavior tree state viewer',
}
