/**
 * Rig Mode — visual editor for rig.yaml.
 *
 * When enabled, attaches a TransformControls gizmo to the viewport and
 * lets the user click on meshes or pivot markers and drag them into
 * place. On save, serializes the in-memory rig config back to rig.yaml
 * via the /api/rig endpoint. On cancel, restores the original config.
 *
 * Coordinate model
 * ────────────────
 *   The rig is wrapped in `rigRoot` which applies `scale=0.001` and
 *   `rotation.x=-π/2`. Everything INSIDE that root is therefore in CAD
 *   millimeters, Z-up — identical to what rig.yaml stores. So:
 *
 *     - A mesh group's local `.position` IS in CAD mm, relative to its
 *       parent pivot group. For a joint mesh, its parent is the joint's
 *       pivot group (whose local origin is at `pivot` in CAD world). So:
 *           translate_CAD  =  meshGroup.position  +  joint.pivot_CAD
 *       For the body, its parent is rigRoot (origin at CAD 0,0,0), so:
 *           translate_CAD  =  bodyMeshGroup.position
 *
 *     - A joint pivot group's local `.position` equals
 *       `joint.pivot - parentJoint.pivot`. So to turn a drag on the pivot
 *       into a new CAD-world pivot, we read the world position of the
 *       pivot group, convert it to its parent's local frame (CAD mm),
 *       and add parent.pivot_CAD.
 *
 *   Mesh rotation gizmo rotates the meshGroup around its own origin —
 *   which is at CAD `translate`, matching the user's requested behavior:
 *   "rotation around the gizmo dedicated to the mesh."
 *
 * Interaction model
 * ─────────────────
 *   • Click a pivot marker → select that joint's pivot.
 *   • Click a rig mesh     → select that mesh entry (body or joint mesh).
 *   • Click empty space    → deselect.
 *   • Keys (only when pointer is inside the viewport):
 *       M          → gizmo mode = translate
 *       R          → gizmo mode = rotate (mesh only; ignored on pivots)
 *       Esc        → deselect; also cancels rig mode if no selection
 *       Ctrl+S     → save (bubbled up via onSave callback)
 *
 *   Joint rotation gizmos from joint-controls are disabled while rig mode
 *   is active so a misclick doesn't rotate a servo instead of moving the
 *   pivot.
 */

import * as THREE from 'three'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'

const PIVOT_MARKER_RADIUS = 4 // mm
const PIVOT_COLOR = 0x8ab4f8
const PIVOT_COLOR_SELECTED = 0xffe14d
const MESH_OUTLINE_EMISSIVE = 0x224466

/** Deep clone a plain object (safe for rig config — no functions, no refs). */
function clone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

/**
 * Extract euler degrees from an Object3D rotation, or return null if
 * every component is effectively zero (so the YAML stays tidy).
 */
function rotationToDegOrNull(obj) {
  const r = obj.rotation
  const rx = (r.x * 180) / Math.PI
  const ry = (r.y * 180) / Math.PI
  const rz = (r.z * 180) / Math.PI
  if (Math.abs(rx) < 1e-6 && Math.abs(ry) < 1e-6 && Math.abs(rz) < 1e-6) {
    return null
  }
  return [rx, ry, rz]
}

/**
 * Push live three.js state for a single joint back into the mutable rig
 * config. Call this when the user commits a drag (TransformControls
 * 'dragging-changed' -> false), so the in-memory config always matches
 * what's rendered.
 *
 * Scene layout:
 *   pivotGroup.world ≈ pivot (CAD)
 *     restRotGroup   pos (0,0,0), rot = rest rotation
 *       meshGroup    pos lives in restRotGroup-local = R_rest⁻¹ frame
 *
 * So the CAD-world translate is recovered by rotating meshGroup.position
 * through R_rest and adding the pivot.
 */
function syncJointMeshToConfig(cfg, name, joint) {
  const entry = cfg.joints[name]
  const pivot = entry.pivot
  const p = joint.meshGroup.position
    .clone()
    .applyQuaternion(joint.restRotGroup.quaternion)
  entry.model.translate = [p.x + pivot[0], p.y + pivot[1], p.z + pivot[2]]

  const deg = rotationToDegOrNull(joint.restRotGroup)
  if (deg) entry.model.rotate = deg
  else delete entry.model.rotate
}

function syncBodyMeshToConfig(cfg, body) {
  // Body pivot is implicitly (0,0,0) — it lives at the rigRoot origin.
  const p = body.meshGroup.position
    .clone()
    .applyQuaternion(body.restRotGroup.quaternion)
  cfg.body.model.translate = [p.x, p.y, p.z]

  const deg = rotationToDegOrNull(body.restRotGroup)
  if (deg) cfg.body.model.rotate = deg
  else delete cfg.body.model.rotate
}

function syncDisplayToConfig(cfg, displayMesh) {
  if (!cfg.display || !displayMesh) return
  const p = displayMesh.position
  cfg.display.offset = [p.x, p.y, p.z]
  const deg = rotationToDegOrNull(displayMesh)
  if (deg) cfg.display.rotate = deg
  else cfg.display.rotate = [0, 0, 0]
}

/**
 * Update the three.js state of a joint so it reflects the given pivot
 * value in the config. Also compensates this joint's mesh (keeps
 * `translate` in world place) and any direct child joints' pivot groups
 * (so their CAD-world pivots stay invariant).
 */
function applyPivotChange(cfg, name, newPivotCAD, joints) {
  const def = cfg.joints[name]
  def.pivot = [newPivotCAD[0], newPivotCAD[1], newPivotCAD[2]]

  const joint = joints.get(name)
  const parentCAD = def.parent ? cfg.joints[def.parent].pivot : [0, 0, 0]

  // This pivot group's local position in its parent frame.
  joint.pivot.position.set(
    newPivotCAD[0] - parentCAD[0],
    newPivotCAD[1] - parentCAD[1],
    newPivotCAD[2] - parentCAD[2],
  )

  // Mesh keeps its CAD `translate` invariant. meshGroup.position lives
  // in restRotGroup-local (rotated) frame, so we need the inverse of
  // R_rest: meshGroup.pos = R_rest⁻¹ * (translate - pivot).
  const tx = def.model.translate || [0, 0, 0]
  const off = new THREE.Vector3(
    tx[0] - newPivotCAD[0],
    tx[1] - newPivotCAD[1],
    tx[2] - newPivotCAD[2],
  )
  off.applyQuaternion(joint.restRotGroup.quaternion.clone().invert())
  joint.meshGroup.position.copy(off)

  // Direct-child joints: their local position is `childPivot - thisPivot`.
  for (const [cname, cdef] of Object.entries(cfg.joints)) {
    if (cdef.parent !== name) continue
    const cjoint = joints.get(cname)
    cjoint.pivot.position.set(
      cdef.pivot[0] - newPivotCAD[0],
      cdef.pivot[1] - newPivotCAD[1],
      cdef.pivot[2] - newPivotCAD[2],
    )
  }
}

/**
 * Rebuild three.js positions for every joint and for body from a config
 * snapshot. Used to roll back to the initial state on cancel.
 */
function applyConfigToScene(cfg, rig) {
  // ── Body ──
  // restRotGroup.rotation ← rotate (degrees → radians)
  // meshGroup.position   ← R_rest⁻¹ * translate  (so world lands on translate)
  {
    const br = cfg.body.model.rotate || [0, 0, 0]
    rig.body.restRotGroup.rotation.set(
      (br[0] * Math.PI) / 180,
      (br[1] * Math.PI) / 180,
      (br[2] * Math.PI) / 180,
      'XYZ',
    )
    const bt = cfg.body.model.translate || [0, 0, 0]
    const off = new THREE.Vector3(bt[0], bt[1], bt[2])
    off.applyQuaternion(rig.body.restRotGroup.quaternion.clone().invert())
    rig.body.meshGroup.position.copy(off)
    rig.body.meshGroup.rotation.set(0, 0, 0)
  }

  // ── Joints ──
  for (const [name, def] of Object.entries(cfg.joints)) {
    const joint = rig.joints.get(name)
    if (!joint) continue
    const parentCAD = def.parent ? cfg.joints[def.parent].pivot : [0, 0, 0]
    joint.pivot.position.set(
      def.pivot[0] - parentCAD[0],
      def.pivot[1] - parentCAD[1],
      def.pivot[2] - parentCAD[2],
    )
    const rot = def.model.rotate || [0, 0, 0]
    joint.restRotGroup.rotation.set(
      (rot[0] * Math.PI) / 180,
      (rot[1] * Math.PI) / 180,
      (rot[2] * Math.PI) / 180,
      'XYZ',
    )
    const tx = def.model.translate || [0, 0, 0]
    const off = new THREE.Vector3(
      tx[0] - def.pivot[0],
      tx[1] - def.pivot[1],
      tx[2] - def.pivot[2],
    )
    off.applyQuaternion(joint.restRotGroup.quaternion.clone().invert())
    joint.meshGroup.position.copy(off)
    joint.meshGroup.rotation.set(0, 0, 0)
  }

  // ── Display ──
  if (cfg.display && rig.display?.mesh) {
    const doff = cfg.display.offset || [0, 0, 0]
    const drot = cfg.display.rotate || [0, 0, 0]
    rig.display.mesh.position.set(doff[0], doff[1], doff[2])
    rig.display.mesh.rotation.set(
      (drot[0] * Math.PI) / 180,
      (drot[1] * Math.PI) / 180,
      (drot[2] * Math.PI) / 180,
      'XYZ',
    )
  }
}

/**
 * Attach rig editing to a viewport. The controller is inert until
 * `enable()` is called; `disable()` tears down gizmos and reattaches the
 * normal joint rotation controls.
 *
 * @param {object} viewport    handle returned by createViewport()
 * @param {object} opts
 * @param {function} opts.onSelect  called with the currently-selected entry
 *                                  descriptor (or null) — used by the
 *                                  Axis/Limits inspector panel
 * @param {function} opts.onSave    called when the user presses Ctrl+S
 */
export function createRigEditMode(viewport, { onSelect, onSave } = {}) {
  const { scene, renderer, controls: orbit, rig, jointControls } = viewport
  let camera = viewport.camera  // reassigned by setCamera() when the
                                // viewport toggles persp ↔ ortho
  const domEl = renderer.domElement

  // ── State ──
  let enabled = false
  let liveConfig = null      // mutable clone edited by the user
  let snapshotConfig = null  // restored on cancel
  let selected = null        // { kind: 'body'|'jointMesh'|'jointPivot', name, object }
  let gizmoMode = 'translate'
  let pointerInside = false

  // Pivot proxy Objects — one per joint. A TransformControls gizmo can't
  // attach directly to the pivot group without confusing its own
  // meaning-of-position, so we use a proxy in world space that tracks
  // the pivot. When the user drags it, we read its world position, walk
  // it back through the parent's world matrix to get the new CAD pivot,
  // and call applyPivotChange().
  const pivotMarkers = new Map()  // jointName -> Mesh (child of pivot group)
  const pivotProxies = new Map()  // jointName -> Object3D (child of scene)

  // ── TransformControls ──
  // In three.js r169+ TransformControls no longer extends Object3D. The
  // visible gizmo lives on a separate helper Object3D that you retrieve
  // via tc.getHelper() and add to the scene yourself. Adding `tc` itself
  // to the scene is a silent no-op, which is why the gizmo was invisible.
  const tc = new TransformControls(camera, domEl)
  const tcHelper = tc.getHelper()
  tc.setSpace('local')
  tc.setSize(0.8)
  // Disable orbit while dragging the gizmo.
  tc.addEventListener('dragging-changed', (e) => {
    orbit.enabled = !e.value
    if (!e.value) commitSelection()
  })
  tc.addEventListener('objectChange', onGizmoChange)

  // ── Selection visuals ──
  function setMeshOutline(meshGroup, on) {
    if (!meshGroup) return
    meshGroup.traverse((child) => {
      if (!child.isMesh) return
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      for (const mat of mats) {
        if (!mat?.emissive) continue
        if (on) {
          if (mat.userData._rigOrigEmissive === undefined) {
            mat.userData._rigOrigEmissive = mat.emissive.getHex()
            mat.emissive.setHex(MESH_OUTLINE_EMISSIVE)
          }
        } else if (mat.userData._rigOrigEmissive !== undefined) {
          mat.emissive.setHex(mat.userData._rigOrigEmissive)
          delete mat.userData._rigOrigEmissive
        }
      }
    })
  }

  /**
   * Return the node TransformControls should attach to for the current
   * selection + gizmo mode:
   *   • jointPivot → pivot proxy (translate only)
   *   • body/jointMesh + translate → meshGroup
   *   • body/jointMesh + rotate    → restRotGroup  (origin at the joint
   *                                  pivot, so rotations sweep the mesh
   *                                  around that pivot — which is what
   *                                  the user wants)
   */
  function tcTargetForSelection() {
    if (!selected) return null
    if (selected.kind === 'jointPivot') {
      return pivotProxies.get(selected.name)
    }
    if (selected.kind === 'display') {
      return selected.object // translate and rotate both on the mesh itself
    }
    return gizmoMode === 'rotate' ? selected.restRotGroup : selected.meshGroup
  }

  function setSelected(next) {
    // Clear previous visuals
    if (selected) {
      if (selected.kind === 'jointPivot') {
        pivotMarkers.get(selected.name)?.material.color.setHex(PIVOT_COLOR)
      } else if (selected.kind === 'display') {
        // nothing to clear — no emissive outline on BasicMaterial
      } else {
        setMeshOutline(selected.meshGroup, false)
      }
    }
    tc.detach()

    selected = next
    if (!next) {
      onSelect?.(null)
      return
    }

    if (next.kind === 'jointPivot') {
      pivotMarkers.get(next.name)?.material.color.setHex(PIVOT_COLOR_SELECTED)
      // Position proxy at pivot's current world position, attach gizmo.
      const joint = rig.joints.get(next.name)
      const proxy = pivotProxies.get(next.name)
      joint.pivot.getWorldPosition(proxy.position)
      proxy.quaternion.identity()
      tc.attach(proxy)
      tc.setMode('translate') // rotate on pivot is meaningless
    } else if (next.kind === 'display') {
      tc.attach(next.object)
      tc.setMode(gizmoMode)
    } else {
      setMeshOutline(next.meshGroup, true)
      tc.attach(tcTargetForSelection())
      tc.setMode(gizmoMode)
    }
    onSelect?.(describeSelection())
  }

  function describeSelection() {
    if (!selected) return null
    if (selected.kind === 'body') {
      return { kind: 'body', entry: liveConfig.body }
    }
    if (selected.kind === 'display') {
      return { kind: 'display', entry: liveConfig.display }
    }
    if (selected.kind === 'jointMesh') {
      return {
        kind: 'jointMesh',
        name: selected.name,
        entry: liveConfig.joints[selected.name],
      }
    }
    return {
      kind: 'jointPivot',
      name: selected.name,
      entry: liveConfig.joints[selected.name],
    }
  }

  // ── Gizmo change handlers ──
  function onGizmoChange() {
    if (!selected || !enabled) return
    if (selected.kind === 'jointPivot') {
      // Convert proxy's world position → parent-local CAD mm → CAD world.
      const joint = rig.joints.get(selected.name)
      const parent = joint.pivot.parent
      const proxy = pivotProxies.get(selected.name)
      const local = parent.worldToLocal(proxy.position.clone())
      const def = liveConfig.joints[selected.name]
      const parentCAD = def.parent ? liveConfig.joints[def.parent].pivot : [0, 0, 0]
      const newPivot = [
        local.x + parentCAD[0],
        local.y + parentCAD[1],
        local.z + parentCAD[2],
      ]
      applyPivotChange(liveConfig, selected.name, newPivot, rig.joints)
      // Keep the proxy at the pivot's new world position for the next frame.
      joint.pivot.getWorldPosition(proxy.position)
    }
    // Mesh moves/rotations mutate meshGroup directly — the config sync
    // happens on drag-end in commitSelection().
  }

  function commitSelection() {
    if (!selected) return
    if (selected.kind === 'body') {
      syncBodyMeshToConfig(liveConfig, rig.body)
    } else if (selected.kind === 'display') {
      syncDisplayToConfig(liveConfig, rig.display?.mesh)
    } else if (selected.kind === 'jointMesh') {
      syncJointMeshToConfig(liveConfig, selected.name, rig.joints.get(selected.name))
    }
    onSelect?.(describeSelection())
  }

  /**
   * Sync EVERY mesh (body + all joints) from its current three.js state
   * into `liveConfig`. Called on save so the exported config always
   * reflects what's visible in the viewport, regardless of whether a
   * TransformControls drag-end has fired for each edited target. Without
   * this, a rotation made just before clicking Save could be lost if the
   * drag-end → commitSelection path didn't run for any reason (e.g. the
   * gizmo was still hovered, or the mode was switched mid-drag).
   */
  function syncAllToConfig() {
    if (!liveConfig) return
    syncBodyMeshToConfig(liveConfig, rig.body)
    for (const [name, joint] of rig.joints) {
      syncJointMeshToConfig(liveConfig, name, joint)
    }
    syncDisplayToConfig(liveConfig, rig.display?.mesh)
  }

  // ── Picking ──
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()

  function updatePointer(ev) {
    const rect = domEl.getBoundingClientRect()
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
  }

  function onPointerDown(ev) {
    if (!enabled) return
    if (ev.button !== 0) return
    // If the gizmo itself captured this click, skip picking.
    // TransformControls sets `axis` to the highlighted handle on hover
    // and keeps it during drag — so a non-null axis means the pointer is
    // on the gizmo and TC will handle it.
    if (tc.axis) return
    if (tc.dragging) return
    updatePointer(ev)
    raycaster.setFromCamera(pointer, camera)

    // 1. Pivot markers (draw on top, highest priority — they're small).
    const markers = [...pivotMarkers.values()]
    const mHits = raycaster.intersectObjects(markers, false)
    if (mHits.length > 0) {
      const name = mHits[0].object.userData.pivotMarker
      setSelected({ kind: 'jointPivot', name })
      return
    }

    // 2. Rig meshes.
    const rigMeshes = []
    rig.rigRoot.traverse((obj) => {
      if (obj.isMesh) rigMeshes.push(obj)
    })
    const hits = raycaster.intersectObjects(rigMeshes, false)
    if (hits.length > 0) {
      // Walk up to the tagged rigEntry Group.
      let node = hits[0].object
      while (node && !node.userData?.rigEntry) node = node.parent
      if (node?.userData?.rigEntry) {
        const e = node.userData.rigEntry
        if (e.kind === 'body') {
          setSelected({
            kind: 'body',
            meshGroup: rig.body.meshGroup,
            restRotGroup: rig.body.restRotGroup,
          })
        } else if (e.kind === 'display') {
          setSelected({
            kind: 'display',
            object: rig.display.mesh,
          })
        } else if (e.kind === 'jointMesh') {
          const j = rig.joints.get(e.jointName)
          setSelected({
            kind: 'jointMesh',
            name: e.jointName,
            meshGroup: j.meshGroup,
            restRotGroup: j.restRotGroup,
          })
        }
        return
      }
    }

    setSelected(null)
  }

  /**
   * Switch the gizmo mode and, if a mesh selection is active, re-attach
   * TransformControls to the correct node for the new mode (meshGroup
   * for translate, restRotGroup for rotate).
   */
  function applyGizmoMode(m) {
    gizmoMode = m
    if (!selected || selected.kind === 'jointPivot') return
    tc.detach()
    tc.attach(tcTargetForSelection())
    tc.setMode(m)
  }

  // ── Keyboard shortcuts ──
  function onKeyDown(ev) {
    if (!enabled || !pointerInside) return
    if (ev.key === 'm' || ev.key === 'M') {
      applyGizmoMode('translate')
    } else if (ev.key === 'r' || ev.key === 'R') {
      applyGizmoMode('rotate')
    } else if (ev.key === 'Escape') {
      if (selected) {
        setSelected(null)
      }
      // Esc with no selection could cancel rig mode — but cancel is
      // destructive, so we require the explicit CANCEL button for that.
    } else if ((ev.ctrlKey || ev.metaKey) && (ev.key === 's' || ev.key === 'S')) {
      ev.preventDefault()
      onSave?.()
    }
  }

  function onPointerEnter() { pointerInside = true }
  function onPointerLeave() { pointerInside = false }

  // ── Enable / disable ──
  function enable() {
    if (enabled) return
    enabled = true

    // Snapshot and live config
    liveConfig = clone(rig.config)
    snapshotConfig = clone(rig.config)

    // Suspend normal joint-rotation controls — we're about to reuse the
    // same click area for a different purpose.
    jointControls?.setEnabled?.(false)
    jointControls?.setSelected?.(null)

    // Build pivot markers (small spheres parented to each pivot group so
    // they inherit the joint's animated rotation — matching the
    // joint-controls markers so the UX stays consistent).
    for (const [name, joint] of rig.joints) {
      const geo = new THREE.SphereGeometry(PIVOT_MARKER_RADIUS, 12, 12)
      const mat = new THREE.MeshBasicMaterial({
        color: PIVOT_COLOR,
        depthTest: false,
        transparent: true,
        opacity: 0.9,
      })
      const marker = new THREE.Mesh(geo, mat)
      marker.renderOrder = 998
      marker.userData.pivotMarker = name
      joint.pivot.add(marker)
      pivotMarkers.set(name, marker)

      const proxy = new THREE.Object3D()
      proxy.name = `rig-edit-proxy:${name}`
      scene.add(proxy)
      pivotProxies.set(name, proxy)
    }

    // Gizmo helper mesh goes into the scene.
    scene.add(tcHelper)

    // Listeners
    domEl.addEventListener('pointerdown', onPointerDown)
    domEl.addEventListener('pointerenter', onPointerEnter)
    domEl.addEventListener('pointerleave', onPointerLeave)
    window.addEventListener('keydown', onKeyDown)
  }

  function disable() {
    if (!enabled) return
    setSelected(null)
    enabled = false

    // Clean up markers and proxies
    for (const [name, marker] of pivotMarkers) {
      marker.parent?.remove(marker)
      marker.geometry.dispose()
      marker.material.dispose()
    }
    pivotMarkers.clear()
    for (const [, proxy] of pivotProxies) {
      proxy.parent?.remove(proxy)
    }
    pivotProxies.clear()

    scene.remove(tcHelper)
    domEl.removeEventListener('pointerdown', onPointerDown)
    domEl.removeEventListener('pointerenter', onPointerEnter)
    domEl.removeEventListener('pointerleave', onPointerLeave)
    window.removeEventListener('keydown', onKeyDown)

    // Restore normal joint-rotation controls.
    jointControls?.setEnabled?.(true)
  }

  function cancel() {
    if (!enabled) return
    // Roll back every edited value to the pre-enable snapshot.
    applyConfigToScene(snapshotConfig, rig)
    // Replace the loader's in-memory config as well so a subsequent save
    // (without further edits) would write the original.
    Object.assign(rig.config, snapshotConfig)
    disable()
  }

  /** Return a plain-object deep copy of the current live config for PUT. */
  function getLiveConfig() {
    if (!liveConfig) return null
    // Belt-and-braces: even if every drag committed correctly, sweeping
    // the whole rig guarantees the config matches the visible scene.
    syncAllToConfig()
    return clone(liveConfig)
  }

  /** Update joint axis or limits in the live config (called by the panel). */
  function updateJointMeta(name, patch) {
    if (!liveConfig?.joints?.[name]) return
    const j = liveConfig.joints[name]
    if (patch.axis) j.axis = patch.axis
    if (patch.limits) j.limits = [patch.limits[0], patch.limits[1]]
    // Push axis change into the live joint so servo rotation previews work.
    const joint = rig.joints.get(name)
    if (joint && patch.axis) {
      joint.axis = patch.axis
      if (patch.axis === 'x') joint.axisVec.set(1, 0, 0)
      if (patch.axis === 'y') joint.axisVec.set(0, 1, 0)
      if (patch.axis === 'z') joint.axisVec.set(0, 0, 1)
    }
    if (joint && patch.limits) {
      joint.limits = [patch.limits[0], patch.limits[1]]
    }
  }

  return {
    enable,
    disable,
    cancel,
    isEnabled: () => enabled,
    getLiveConfig,
    updateJointMeta,
    getSelection: describeSelection,
    setMode: applyGizmoMode,
    setCamera(cam) {
      camera = cam
      tc.camera = cam
    },
    dispose() {
      disable()
      tc.dispose()
    },
  }
}
