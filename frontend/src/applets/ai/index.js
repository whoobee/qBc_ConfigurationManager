export default {
  id: 'ai',
  name: 'AI',
  icon: 'ai',
  route: '/ai',
  component: () => import('./AiPage.vue'),
  order: 25,
  category: 'tools',
  description: 'AI transcript viewer',
}
