/**
 * Applet auto-discovery and registration.
 *
 * Uses Vite's import.meta.glob to discover all applet manifests (index.js)
 * at build time. No manual registration needed - drop a folder, it shows up.
 */

const appletModules = import.meta.glob('./*/index.js', { eager: true })

export const applets = Object.values(appletModules)
  .map(mod => mod.default)
  .filter(Boolean)
  .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))

export function getAppletRoutes() {
  return applets.map(applet => ({
    path: applet.route,
    name: applet.id,
    component: applet.component,
    meta: {
      appletId: applet.id,
      title: applet.name,
      icon: applet.icon,
    },
  }))
}

export function getAppletsByCategory() {
  const groups = {}
  for (const applet of applets) {
    const cat = applet.category || 'other'
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(applet)
  }
  return groups
}
