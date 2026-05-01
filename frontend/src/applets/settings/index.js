export default {
  id: 'settings',
  name: 'Settings',
  icon: 'settings',
  route: '/settings',
  component: () => import('./SettingsPage.vue'),
  order: 90,
  category: 'system',
  description: 'Audio volume and system settings',
}
