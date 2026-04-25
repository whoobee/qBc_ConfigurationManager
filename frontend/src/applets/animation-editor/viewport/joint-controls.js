/**
 * Joint controls — click-to-select and drag-to-rotate for rig joints.
 *
 * How it works
 * ────────────
 *   Selection:
 *     A raycast on every pointerdown against meshes tagged with
 *     userData.jointName. If a joint is hit, it becomes selected and a
 *     rotation ring gizmo appears at the joint's pivot, oriented so its
 *     normal matches the joint's rotation axis. Clicking empty space
 *     deselects.
 *
 *   Rotation drag:
 *     Pointerdown on the ring starts a drag. We project the cursor onto
 *     the rotation plane (plane through the pivot with normal = axis) and
 *     remember the initial vector from pivot to projected point. On
 *     pointermove we recompute the projected point, measure the signed
 *     angle from the initial vector to the current vector around the
 *     axis, and call joint.setAngle(startAngle + deltaDeg) — clamped to
 *     the joint's [min, max] limits.
 *
 *   OrbitControls are disabled during a drag so the camera doesn't move.
 *
 *   Writes flow through pose-store.setJointAngle(name, deg), which is the
 *   single source of truth for joint angles. The viewport subscribes to
 *   pose-store changes and calls joint.setAngle() on the three.js groups,
 *   so sliders (step 5) and drag gestures are symmetric.
 */

import * as THREE from 'three'

import { setJointAngle, getJointAngle } from './pose-store.js'

// Ring visual parameters. The ring is parented to a joint pivot group,
// which lives INSIDE the rig root (scale 0.001, mm → m). So these values
// are in CAD millimeters — matches rig.js units and renders at a sensible
// real-world size.
const RING_RADIUS = 60        // mm
const RING_TUBE = 2           // mm
const PIVOT_MARKER_RADIUS = 4 // mm
const RING_COLOR_DEFAULT = 0x4dd0ff
const RING_COLOR_HOVER = 0xffe14d
const RING_COLOR_DRAG = 0xff6b4d
const PIVOT_COLOR = 0x8ab4f8
const PIVOT_COLOR_SELECTED = 0xffe14d
const SELECTED_EMISSIVE = 0x224466

function axisVectorFromName(axis) {
  if (axis === 'x') return new THREE.Vector3(1, 0, 0)
  if (axis === 'y') return new THREE.Vector3(0, 1, 0)
  if (axis === 'z') return new THREE.Vector3(0, 0, 1)
  throw new Error(`Invalid axis: ${axis}`)
}

/**
 * Build a rotation ring mesh oriented so its normal matches `axisLocal`
 * (the rotation axis in the joint pivot group's LOCAL frame — i.e. the
 * same axis string from rig.js).
 *
 * TorusGeometry's tube is aligned along Z in local space; we rotate it so
 * its normal matches the axis.
 */
function makeRing(axisLocal) {
  const geo = new THREE.TorusGeometry(RING_RADIUS, RING_TUBE, 12, 64)
  const mat = new THREE.MeshBasicMaterial({
    color: RING_COLOR_DEFAULT,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
  })
  const ring = new THREE.Mesh(geo, mat)
  ring.renderOrder = 999 // draw on top of the rig so it stays visible

  // Torus normal is +Z in local space. Rotate so normal matches axisLocal.
  if (axisLocal === 'x') {
    ring.rotation.y = Math.PI / 2
  } else if (axisLocal === 'y') {
    ring.rotation.x = Math.PI / 2
  }
  // 'z' needs no rotation
  return ring
}

/**
 * Attach joint controls to a viewport.
 *
 * @param {object} viewport  — the handle returned by createViewport()
 * @returns {{ dispose: () => void, setSelected: (name|null) => void }}
 */
export function attachJointControls(viewport) {
  const { scene, camera, renderer, controls: orbit, joints } = viewport
  if (!joints || joints.size === 0) {
    return { dispose: () => {}, setSelected: () => {} }
  }

  const domEl = renderer.domElement

  // ── Picking state ──
  const raycaster = new THREE.Raycaster()
  // Raycasting against lines (ring is a torus, but we also want the ring
  // itself hit-testable for drag). Defaults are fine for meshes.
  const pointer = new THREE.Vector2()

  // Collect all rig meshes for mesh-selection raycasts.
  const rigMeshes = []
  scene.traverse((obj) => {
    if (obj.isMesh && obj.userData.jointName) rigMeshes.push(obj)
  })

  // ── Pivot markers ──
  // Small spheres at each joint's pivot point. Hidden by default — only
  // shown in Rig Mode (which creates its own markers in rig-edit-mode.js).
  // Parented to the joint's pivot group, so they move with parent
  // rotations (matching the pivot).
  const pivotMarkers = new Map() // name -> Mesh
  for (const [name, joint] of joints) {
    const geo = new THREE.SphereGeometry(PIVOT_MARKER_RADIUS, 12, 12)
    const mat = new THREE.MeshBasicMaterial({
      color: PIVOT_COLOR,
      depthTest: false,
      transparent: true,
      opacity: 0.9,
    })
    const marker = new THREE.Mesh(geo, mat)
    marker.renderOrder = 998
    marker.visible = false
    marker.userData.pivotMarker = name
    joint.pivot.add(marker)
    pivotMarkers.set(name, marker)
  }

  // ── Gizmo state ──
  let selectedJointName = null
  let currentRing = null          // THREE.Mesh currently parented to pivot
  let hoveringRing = false

  // ── Drag state ──
  let dragging = false
  let dragPlane = new THREE.Plane()
  let dragStartVec = new THREE.Vector3()
  let dragStartAngle = 0

  /** Compute the current pointer in NDC [-1, 1]. */
  function updatePointer(ev) {
    const rect = domEl.getBoundingClientRect()
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
  }

  /** Raycast helper. */
  function raycast(targets) {
    raycaster.setFromCamera(pointer, camera)
    return raycaster.intersectObjects(targets, false)
  }

  /**
   * Project the current pointer ray onto a world-space plane. Returns a
   * Vector3 (the intersection point) or null if the ray is parallel.
   */
  function projectOntoPlane(plane) {
    raycaster.setFromCamera(pointer, camera)
    const out = new THREE.Vector3()
    const hit = raycaster.ray.intersectPlane(plane, out)
    return hit ? out : null
  }

  /** Remove the current ring gizmo (if any). */
  function clearRing() {
    if (currentRing) {
      currentRing.parent?.remove(currentRing)
      currentRing.geometry.dispose()
      currentRing.material.dispose()
      currentRing = null
    }
  }

  /** Apply/remove emissive highlight on every mesh belonging to a joint. */
  function setMeshHighlight(name, on) {
    if (!name) return
    for (const m of rigMeshes) {
      if (m.userData.jointName !== name) continue
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      for (const mat of mats) {
        if (!mat) continue
        if (on) {
          if (mat.emissive && mat.userData._origEmissive === undefined) {
            mat.userData._origEmissive = mat.emissive.getHex()
            mat.emissive.setHex(SELECTED_EMISSIVE)
          }
        } else {
          if (mat.emissive && mat.userData._origEmissive !== undefined) {
            mat.emissive.setHex(mat.userData._origEmissive)
            delete mat.userData._origEmissive
          }
        }
      }
    }
  }

  /** Make a joint the current selection (or clear if name=null). */
  function setSelected(name) {
    if (name === selectedJointName) return
    // Restore previous selection visuals
    if (selectedJointName) {
      setMeshHighlight(selectedJointName, false)
      pivotMarkers.get(selectedJointName)?.material.color.setHex(PIVOT_COLOR)
    }
    clearRing()

    selectedJointName = name
    if (!name) return
    const joint = joints.get(name)
    if (!joint) return

    // Apply new selection visuals
    setMeshHighlight(name, true)
    pivotMarkers.get(name)?.material.color.setHex(PIVOT_COLOR_SELECTED)

    const ring = makeRing(joint.axis)
    // Parent the ring to the joint's pivot group so it inherits position
    // AND rotation — it'll rotate with the joint during drag, which is
    // exactly what we want (the ring's normal stays on the rotation axis).
    joint.pivot.add(ring)
    currentRing = ring
  }

  // ── Enabled flag ──
  // Rig Mode flips this off so mesh-clicks don't also trigger servo
  // rotation selection. When off, all pointer handlers bail out early
  // and the pivot markers/ring are hidden so Rig Mode's own markers are
  // the only visible picking targets.
  let enabled = true

  function setMarkersVisible(on) {
    for (const m of pivotMarkers.values()) m.visible = on
  }

  function setEnabled(on) {
    if (enabled === on) return
    enabled = on
    if (!on) {
      setSelected(null)
      setMarkersVisible(false)
    }
  }

  // ── Pointer handlers ──

  function onPointerDown(ev) {
    if (!enabled) return
    if (ev.button !== 0) return // left only
    updatePointer(ev)

    // First, test the ring (if any) — it has priority so you can keep
    // dragging a selected joint without re-picking.
    if (currentRing) {
      const hits = raycast([currentRing])
      if (hits.length > 0) {
        beginDrag()
        ev.preventDefault()
        return
      }
    }

    // Test pivot markers first (they draw on top, and they're the most
    // reliable picking target while tuning rig.js — a joint's mesh may
    // currently be offset or obscured).
    const markerHits = raycast([...pivotMarkers.values()])
    if (markerHits.length > 0) {
      setSelected(markerHits[0].object.userData.pivotMarker)
      return
    }

    // Otherwise, test rig meshes for selection.
    const hits = raycast(rigMeshes)
    if (hits.length > 0) {
      const name = hits[0].object.userData.jointName
      setSelected(name)
    } else {
      setSelected(null)
    }
  }

  function beginDrag() {
    if (!selectedJointName) return
    const joint = joints.get(selectedJointName)
    if (!joint) return

    // Build the drag plane in world space: passes through the pivot's
    // world position, normal = the joint's rotation axis expressed in
    // world space (the pivot group's local axis transformed by its world
    // matrix).
    const pivotWorld = new THREE.Vector3()
    joint.pivot.getWorldPosition(pivotWorld)

    const axisWorld = joint.axisVec.clone()
    // Only apply the rotation part of the pivot's parent (the axis vector
    // is a direction). Use the parent's world matrix since the joint's
    // own local rotation is about this axis — it doesn't move it.
    const parentMat = new THREE.Matrix4()
    if (joint.pivot.parent) {
      joint.pivot.parent.updateWorldMatrix(true, false)
      parentMat.copy(joint.pivot.parent.matrixWorld)
    }
    const normalMat = new THREE.Matrix3().setFromMatrix4(parentMat)
    axisWorld.applyMatrix3(normalMat).normalize()

    dragPlane.setFromNormalAndCoplanarPoint(axisWorld, pivotWorld)

    const p = projectOntoPlane(dragPlane)
    if (!p) return

    dragStartVec = p.clone().sub(pivotWorld)
    // Guard against zero-length (click exactly at the pivot).
    if (dragStartVec.lengthSq() < 1e-10) return

    dragStartAngle = getJointAngle(selectedJointName)
    dragging = true
    orbit.enabled = false

    if (currentRing) currentRing.material.color.setHex(RING_COLOR_DRAG)
  }

  function onPointerMove(ev) {
    if (!enabled) return
    updatePointer(ev)

    if (dragging) {
      const joint = joints.get(selectedJointName)
      if (!joint) return
      const pivotWorld = new THREE.Vector3()
      joint.pivot.getWorldPosition(pivotWorld)

      const p = projectOntoPlane(dragPlane)
      if (!p) return
      const cur = p.sub(pivotWorld)
      if (cur.lengthSq() < 1e-10) return

      // Signed angle from dragStartVec to cur around dragPlane.normal.
      // Formula: atan2((a × b) · n, a · b)
      const cross = new THREE.Vector3().crossVectors(dragStartVec, cur)
      const dot = dragStartVec.dot(cur)
      const signed = Math.atan2(cross.dot(dragPlane.normal), dot)
      const deltaDeg = (signed * 180) / Math.PI

      const [minDeg, maxDeg] = joint.limits
      const target = Math.max(minDeg, Math.min(maxDeg, dragStartAngle + deltaDeg))
      setJointAngle(selectedJointName, target)
      return
    }

    // Hover feedback on the ring when not dragging.
    if (currentRing) {
      const hits = raycast([currentRing])
      const wasHover = hoveringRing
      hoveringRing = hits.length > 0
      if (wasHover !== hoveringRing) {
        currentRing.material.color.setHex(
          hoveringRing ? RING_COLOR_HOVER : RING_COLOR_DEFAULT,
        )
        domEl.style.cursor = hoveringRing ? 'grab' : ''
      }
    }
  }

  function onPointerUp() {
    if (!dragging) return
    dragging = false
    orbit.enabled = true
    if (currentRing) {
      currentRing.material.color.setHex(
        hoveringRing ? RING_COLOR_HOVER : RING_COLOR_DEFAULT,
      )
    }
  }

  domEl.addEventListener('pointerdown', onPointerDown)
  domEl.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)

  return {
    setSelected,
    setEnabled,
    getSelected: () => selectedJointName,
    dispose() {
      domEl.removeEventListener('pointerdown', onPointerDown)
      domEl.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      clearRing()
      for (const marker of pivotMarkers.values()) {
        marker.parent?.remove(marker)
        marker.geometry.dispose()
        marker.material.dispose()
      }
      pivotMarkers.clear()
    },
  }
}
