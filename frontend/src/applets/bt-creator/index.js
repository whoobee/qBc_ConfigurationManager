export default {
  id: 'bt-creator',
  name: 'BT Creator',
  icon: 'edit',
  route: '/bt-creator',
  component: () => import('./BtCreatorPage.vue'),
  order: 10,
  category: 'behavior',
  description: 'Visual behavior tree editor with LiteGraph.js',
}
