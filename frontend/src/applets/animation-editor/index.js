export default {
  id: 'animation-editor',
  name: 'Animation Editor',
  icon: 'animation',
  route: '/animation-editor',
  component: () => import('./AnimationEditorPage.vue'),
  order: 30,
  category: 'tools',
  description: '3D animation authoring tool (keyframe editor for .ani files)',
}
