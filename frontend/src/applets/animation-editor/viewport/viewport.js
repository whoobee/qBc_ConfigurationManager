/**
 * Three.js viewport bootstrap for the animation editor.
 *
 * createViewport(container) sets up scene / camera / renderer / lights /
 * orbit controls, starts the render loop, handles resize, and returns a
 * handle with a dispose() method. The rig is loaded in a separate module
 * (see ./rig-loader.js, added in step 3) and attached to the scene.
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { ViewHelper } from 'three/examples/jsm/helpers/ViewHelper.js'

import { loadRig } from './rig-loader.js'
import { attachJointControls } from './joint-controls.js'
import { createRigEditMode } from './rig-edit-mode.js'
import { initPose, subscribe as subscribePose, setPose } from './pose-store.js'
import { setEyeState, subscribe as subscribeEye } from './eye-store.js'
import { createEyeRenderer } from './eye-renderer.js'
import {
  subscribe as subscribeAnim,
  getState as getAnimState,
  tick as animTick,
  samplePose,
  sampleEyeState,
} from './animation-store.js'

export async function createViewport(container, { onRigSelect, onRigSave } = {}) {
  // ── Scene ──
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a0c10)

  // Ground grid — helps spatial orientation while editing poses.
  const grid = new THREE.GridHelper(2, 20, 0x2a3040, 0x1a1f28)
  grid.position.y = -0.001
  scene.add(grid)

  // Axis helper at origin (tiny, for debugging pivot alignment).
  const axes = new THREE.AxesHelper(0.15)
  scene.add(axes)

  // ── Lights ──
  // Soft ambient + two directional lights gives decent shading on flat-
  // shaded OBJ meshes without looking too stylized.
  scene.add(new THREE.AmbientLight(0xffffff, 0.55))
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.9)
  keyLight.position.set(1.5, 2.0, 1.2)
  scene.add(keyLight)
  const fillLight = new THREE.DirectionalLight(0xa8c8ff, 0.35)
  fillLight.position.set(-1.2, 0.8, -1.0)
  scene.add(fillLight)

  // ── Cameras ──
  // Two cameras share the same position / target so the toggle is a
  // drop-in swap. The perspective camera is the default; the ortho is
  // only surfaced while in Rig Mode, where a parallel projection makes
  // it easier to align pivots without foreshortening.
  const PERSP_FOV_DEG = 40
  const camera = new THREE.PerspectiveCamera(PERSP_FOV_DEG, 1, 0.01, 100)
  camera.position.set(0.55, 0.42, 0.70)
  camera.lookAt(0, 0.12, 0)

  const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100)
  orthoCamera.position.copy(camera.position)
  orthoCamera.lookAt(0, 0.12, 0)

  let activeCamera = camera

  // ── Renderer ──
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  container.appendChild(renderer.domElement)

  // ── Orbit controls ──
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 0.12, 0)
  controls.enableDamping = true
  controls.dampingFactor = 0.12
  controls.minDistance = 0.2
  controls.maxDistance = 3.0
  controls.update()

  // ── Resize handling ──
  // Both cameras get their aspect/frustum refreshed on every resize so
  // toggling between perspective and ortho is instant.
  let currentAspect = 1
  function updateOrthoFrustum() {
    // Match the visible height of the perspective camera at the current
    // orbit distance, so switching cameras feels like "same zoom". This
    // also lets OrbitControls' dolly-zoom-in-ortho (which shrinks the
    // frustum) behave naturally.
    const dist = orthoCamera.position.distanceTo(controls.target)
    const h = 2 * dist * Math.tan((PERSP_FOV_DEG * Math.PI) / 360)
    const w = h * currentAspect
    orthoCamera.left = -w / 2
    orthoCamera.right = w / 2
    orthoCamera.top = h / 2
    orthoCamera.bottom = -h / 2
    orthoCamera.updateProjectionMatrix()
  }

  function applySize(w, h) {
    if (w === 0 || h === 0) return
    currentAspect = w / h
    camera.aspect = currentAspect
    camera.updateProjectionMatrix()
    updateOrthoFrustum()
    renderer.setSize(w, h)
  }

  const resizeObserver = new ResizeObserver(() => {
    applySize(container.clientWidth, container.clientHeight)
  })
  resizeObserver.observe(container)

  // Initial sizing (ResizeObserver fires async, but first frame needs a size)
  applySize(container.clientWidth || 1, container.clientHeight || 1)

  // ── Rig ──
  // Load the robot rig (OBJ + MTL) and attach to the scene. Failure here
  // is non-fatal — viewport still renders an empty grid so the user can
  // see what went wrong.
  let rig = null
  try {
    rig = await loadRig()
    scene.add(rig.rigRoot)
  } catch (e) {
    console.error('[animation-editor] failed to load rig', e)
    throw e  // Vue wrapper catches this and shows an error overlay
  }

  // ── Pose store → three.js sync ──
  // Initialize the shared pose (all joints at 0°) and subscribe so any
  // change (drag, slider, timeline scrub) applies the rotation to the
  // corresponding pivot group. This is the one-way flow
  //   input → pose-store → rig.joints.setAngle().
  initPose([...rig.joints.keys()])
  const unsubscribePose = subscribePose((pose) => {
    for (const [name, deg] of Object.entries(pose)) {
      rig.joints.get(name)?.setAngle(deg)
    }
  })

  // ── Animation store → pose/eye sync ──
  // When the playhead moves (scrub, play, keyframe edit) the timeline
  // store emits a fresh snapshot. We sample the pose + eye state at the
  // new time and push the result through pose-store / eye-store, so the
  // rig visibly updates and the inspectors stay in sync.
  //
  // Guard: we only write back to the stores when the doc has at least
  // one keyframe. An empty doc would otherwise overwrite the user's
  // hand-tweaked pose with zeros every time they touched the transport.
  const jointNameList = [...rig.joints.keys()]
  const unsubscribeAnim = subscribeAnim((snap) => {
    if (!snap.doc.keyframes.length) return
    setPose(samplePose(jointNameList))
    setEyeState(sampleEyeState())
  })

  // ── Eye display renderer ──
  // If the rig defines a display (see rig.yaml `display:`), create an
  // offscreen Canvas2D eye renderer, bind its canvas as a CanvasTexture,
  // and subscribe to eye-store so the viewport eyes update in real time.
  let eyeRenderer = null
  let eyeTexture = null
  let unsubscribeEyes = null
  if (rig?.display) {
    eyeRenderer = createEyeRenderer()
    eyeTexture = new THREE.CanvasTexture(eyeRenderer.canvas)
    eyeTexture.colorSpace = THREE.SRGBColorSpace
    rig.display.setTexture(eyeTexture)
    unsubscribeEyes = subscribeEye((state) => {
      eyeRenderer.render(state)
      eyeTexture.needsUpdate = true
    })
  }

  // ── Joint controls (click-to-select + drag-to-rotate) ──
  const jointControls = attachJointControls({
    scene,
    camera,
    renderer,
    controls,
    joints: rig.joints,
  })

  // ── Rig Mode (inert until enableRigMode() is called) ──
  // Built here so the caller can pass onSelect/onSave hooks that route
  // into Vue state (the AnimationEditorPage toolbar + inspector panel).
  const rigEdit = createRigEditMode(
    { scene, camera, renderer, controls, rig, jointControls },
    { onSelect: onRigSelect, onSave: onRigSave },
  )

  // ── View alignment gizmo ──
  // Small axis helper rendered in the top-right corner of the viewport.
  // Click an axis label (X/Y/Z, positive or negative) and the camera
  // animates to look at the scene from that direction. Useful for
  // snapping to Top / Bottom / Left / Right / Front / Back views while
  // tuning the rig or scrubbing animations.
  //
  // Mapping (Z-up CAD world → three.js Y-up via rigRoot rotation):
  //   +Y in three.js  =  Top  (CAD +Z)
  //   -Y in three.js  =  Bottom
  //   +X in three.js  =  Right (CAD +X)
  //   -X in three.js  =  Left
  //   +Z in three.js  =  Front (CAD -Y, camera looks along -Z)
  //   -Z in three.js  =  Back
  const viewHelperOverlay = document.createElement('div')
  viewHelperOverlay.className = 'viewport-view-helper'
  Object.assign(viewHelperOverlay.style, {
    position: 'absolute',
    top: '8px',
    right: '8px',
    width: '128px',
    height: '128px',
    pointerEvents: 'auto',
    zIndex: '5',
  })
  container.style.position = container.style.position || 'relative'
  container.appendChild(viewHelperOverlay)

  // Default helper location is bottom-right; move it to top-right so it
  // sits under the overlay DIV we use for click capture. handleClick()
  // computes the hit rect from this same `location`, so both the drawn
  // axis and the click area stay in sync.
  const HELPER_LOCATION = { top: 0, right: 0, bottom: null, left: null }

  let viewHelper = new ViewHelper(activeCamera, renderer.domElement)
  viewHelper.location = HELPER_LOCATION
  viewHelper.setLabels('X', 'Y', 'Z')
  viewHelper.center.copy(controls.target)

  viewHelperOverlay.addEventListener('pointerup', (ev) => {
    // handleClick uses canvas client rect to determine corner hit — but
    // since our overlay sits exactly over that corner, any click on it
    // lands within the helper area and returns true.
    const consumed = viewHelper.handleClick(ev)
    if (consumed) ev.stopPropagation()
  })
  // Keep OrbitControls from starting a drag when the pointer goes down
  // inside the helper overlay.
  viewHelperOverlay.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation()
  })

  const viewHelperClock = new THREE.Clock()

  // ── Camera mode toggle ──
  // Rig Mode uses this to swap between perspective and ortho projections
  // while leaving everything else in place. The swap updates three things
  // that hold a camera reference: the active render camera, OrbitControls
  // (so orbit/pan/zoom targets the right camera), and rigEdit's
  // TransformControls (which raycasts through its own camera ref).
  let cameraMode = 'persp'
  function setCameraMode(mode) {
    if (mode === cameraMode) return
    // Keep the new camera perfectly aligned with the old one before swap.
    const src = activeCamera
    const dst = mode === 'ortho' ? orthoCamera : camera
    dst.position.copy(src.position)
    dst.quaternion.copy(src.quaternion)
    activeCamera = dst
    cameraMode = mode
    controls.object = dst
    controls.update()
    rigEdit.setCamera?.(dst)
    if (mode === 'ortho') updateOrthoFrustum()

    // ViewHelper binds to its camera in the constructor — recreate it so
    // clicks rotate the now-active camera.
    viewHelper.dispose()
    viewHelper = new ViewHelper(dst, renderer.domElement)
    viewHelper.location = HELPER_LOCATION
    viewHelper.setLabels('X', 'Y', 'Z')
    viewHelper.center.copy(controls.target)
  }

  // ── Render loop ──
  let running = true
  const tick = () => {
    if (!running) return
    const delta = viewHelperClock.getDelta()
    // Advance animation playback. When the store is playing it emits
    // a notification from within tick(); our subscription above samples
    // and writes into pose-store, which the rig-sync subscription above
    // then applies to the pivot groups. All on the same frame.
    if (getAnimState().playing) animTick(delta)
    // Advance the view-alignment animation if one is in progress. While
    // animating, the helper writes directly into the camera's position
    // and quaternion each frame.
    if (viewHelper.animating) viewHelper.update(delta)
    controls.update()
    // Track the orbit target so clicking an axis always frames whatever
    // the user is currently looking at, not the world origin.
    viewHelper.center.copy(controls.target)
    // Keep ortho frustum in sync with orbit zoom (distance to target).
    if (activeCamera === orthoCamera) updateOrthoFrustum()
    renderer.render(scene, activeCamera)
    // ViewHelper clears depth and draws its own 128×128 viewport corner.
    // It calls renderer.render() internally, which — with autoClear=true —
    // would wipe the main scene's color buffer before drawing the helper.
    // Disable autoClear around the helper draw; clearDepth inside the
    // helper itself is enough to keep its own faces front-visible.
    const prevAutoClear = renderer.autoClear
    renderer.autoClear = false
    viewHelper.render(renderer)
    renderer.autoClear = prevAutoClear
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  // ── Handle ──
  return {
    scene,
    camera,
    renderer,
    controls,
    rig,
    joints: rig?.joints ?? new Map(),
    jointControls,
    rigEdit,
    setCameraMode,
    getCameraMode: () => cameraMode,
    dispose() {
      running = false
      resizeObserver.disconnect()
      viewHelper.dispose()
      if (viewHelperOverlay.parentNode === container) {
        container.removeChild(viewHelperOverlay)
      }
      rigEdit.dispose()
      jointControls.dispose()
      unsubscribeEyes?.()
      eyeRenderer?.dispose()
      eyeTexture?.dispose()
      unsubscribePose()
      unsubscribeAnim()
      controls.dispose()
      renderer.dispose()
      rig?.dispose()
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose?.()
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          mats.forEach((m) => m.dispose?.())
        }
      })
    },
  }
}
