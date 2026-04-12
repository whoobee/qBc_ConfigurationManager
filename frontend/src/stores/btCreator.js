/**
 * BT Creator state store.
 *
 * Persists the editor state (selected file, graph snapshot, descriptor metadata)
 * across page switches so work is not lost when navigating away and back.
 * Changes are only written to the server when the user presses SAVE.
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useBtCreatorStore = defineStore('btCreator', () => {
  // Which file is selected in the dropdown
  const selectedFile = ref('default.yaml')

  // The full LiteGraph serialized state (graph.serialize())
  const graphSnapshot = ref(null)

  // The loaded descriptor metadata (tree name, description, tick_rate, blackboard)
  const descriptorMeta = ref(null)

  // Whether the graph has unsaved changes
  const dirty = ref(false)

  // The tree name (editable by the user, separate from filename)
  const treeName = ref('')

  function saveSnapshot(graph, descriptor) {
    if (graph) {
      graphSnapshot.value = graph.serialize()
    }
    if (descriptor) {
      descriptorMeta.value = descriptor
      treeName.value = descriptor.tree?.name || ''
    }
    dirty.value = true
  }

  function markClean() {
    dirty.value = false
  }

  function clear() {
    graphSnapshot.value = null
    descriptorMeta.value = null
    treeName.value = ''
    dirty.value = false
  }

  return {
    selectedFile,
    graphSnapshot,
    descriptorMeta,
    dirty,
    treeName,
    saveSnapshot,
    markClean,
    clear,
  }
})
