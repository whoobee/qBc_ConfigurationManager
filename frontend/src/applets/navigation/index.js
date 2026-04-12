export default {
  id: 'navigation',
  name: 'Navigation',
  icon: 'navigation',
  route: '/navigation',
  component: () => import('./NavigationPage.vue'),
  order: 10,
  category: 'tools',
  description: 'Visual navigation debug & monitoring',
}
