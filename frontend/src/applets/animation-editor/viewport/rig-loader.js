/**
 * Rig loader: fetches rig.yaml at runtime and turns it into a three.js
 * scene hierarchy.
 *
 * Returns { rigRoot, joints } where:
 *   - rigRoot is the top-level Group (already scaled/rotated for three.js
 *     Y-up meters)
 *   - joints is a Map<name, { pivot: Object3D, axis, limits, setAngle() }>
 *
 * Rig config lives at /resources/rig.yaml, served by the FastAPI backend
 * from qBc_ConfigurationManager/frontend/resources/rig.yaml. Editing that
 * file and refreshing the browser updates the rig — no rebuild needed.
 *
 * All pivot positions and translates are specified in CAD mm, Z-up, in
 * the YAML. The loader does no coordinate conversion at the joint level —
 * that happens once at rigRoot via scale + rotation.
 */

import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import yaml from 'js-yaml'

const RIG_YAML_URL = '/resources/rig.yaml'
const MODELS_BASE_URL = '/resources/3dmodels/'

// Cache loaded OBJ groups so mirrored variants can clone from one fetch.
// Keyed by model name within a single rig. A fresh loadRig() clears the
// cache so you can edit rig.yaml and refresh without stale meshes.
let _modelCache = new Map()

function loadModel(name, modelsConfig) {
  if (_modelCache.has(name)) return _modelCache.get(name)

  const def = modelsConfig[name]
  if (!def) {
    return Promise.reject(new Error(`Unknown model '${name}' in rig.yaml`))
  }

  const p = new Promise((resolve, reject) => {
    const mtlLoader = new MTLLoader()
    mtlLoader.setPath(MODELS_BASE_URL)
    mtlLoader.load(
      def.mtl,
      (materials) => {
        materials.preload()
        const objLoader = new OBJLoader()
        objLoader.setMaterials(materials)
        objLoader.setPath(MODELS_BASE_URL)
        objLoader.load(def.obj, resolve, undefined, reject)
      },
      undefined,
      reject,
    )
  })
  _modelCache.set(name, p)
  return p
}

/**
 * Clone a loaded OBJ group and optionally mirror its geometry across Y=0.
 * Mirroring reverses triangle winding so normals remain correct.
 */
function instantiateModel(sourceGroup, mirror) {
  const clone = sourceGroup.clone(true)
  clone.traverse((child) => {
    if (child.isMesh) {
      // Clone geometry+material so edits don't affect siblings
      child.geometry = child.geometry.clone()
      if (Array.isArray(child.material)) {
        child.material = child.material.map((m) => m.clone())
      } else if (child.material) {
        child.material = child.material.clone()
      }
      if (mirror === 'y') {
        const mat = new THREE.Matrix4().makeScale(1, -1, 1)
        child.geometry.applyMatrix4(mat)
        // Flip winding: for indexed geometry swap every other pair; for
        // non-indexed, reverse each triangle's vertex order in-place.
        const idx = child.geometry.index
        if (idx) {
          const arr = idx.array
          for (let i = 0; i < arr.length; i += 3) {
            const t = arr[i + 1]
            arr[i + 1] = arr[i + 2]
            arr[i + 2] = t
          }
          idx.needsUpdate = true
        } else {
          const pos = child.geometry.attributes.position
          const a = pos.array
          for (let i = 0; i < a.length; i += 9) {
            for (let k = 0; k < 3; k++) {
              const t = a[i + 3 + k]
              a[i + 3 + k] = a[i + 6 + k]
              a[i + 6 + k] = t
            }
          }
          pos.needsUpdate = true
        }
        child.geometry.computeVertexNormals()
      }
    }
  })
  return clone
}

/**
 * Apply an optional [rx, ry, rz] (degrees, CAD frame, XYZ order) rotation
 * to an Object3D's local rotation. Used for mesh entries in the rig so
 * that static orientation (set in Rig Mode) can be persisted without
 * touching the dynamic joint rotation.
 */
function applyRotateDeg(obj, rotateDeg) {
  if (!rotateDeg) return
  const [rx = 0, ry = 0, rz = 0] = rotateDeg
  obj.rotation.set(
    (rx * Math.PI) / 180,
    (ry * Math.PI) / 180,
    (rz * Math.PI) / 180,
    'XYZ',
  )
}

/** Build a three.js Vector3 axis from an 'x'|'y'|'z' string (in CAD frame). */
function axisVector(axis) {
  if (axis === 'x') return new THREE.Vector3(1, 0, 0)
  if (axis === 'y') return new THREE.Vector3(0, 1, 0)
  if (axis === 'z') return new THREE.Vector3(0, 0, 1)
  throw new Error(`Invalid joint axis: ${axis}`)
}

/** Fetch and parse rig.yaml. Cache-busts with a timestamp so a browser
 * refresh always gets the latest version even if the server sent cache
 * headers. */
async function fetchRigConfig() {
  const url = `${RIG_YAML_URL}?t=${Date.now()}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch rig.yaml: HTTP ${res.status}`)
  }
  const text = await res.text()
  const cfg = yaml.load(text)
  // Minimal validation — a bad YAML field should fail early with a clear
  // message rather than as a cryptic three.js error later.
  if (!cfg || typeof cfg !== 'object') {
    throw new Error('rig.yaml is empty or not a mapping')
  }
  if (!cfg.models || typeof cfg.models !== 'object') {
    throw new Error('rig.yaml: missing or invalid `models` section')
  }
  if (!cfg.body?.model?.name) {
    throw new Error('rig.yaml: missing `body.model.name`')
  }
  if (!cfg.joints || typeof cfg.joints !== 'object') {
    throw new Error('rig.yaml: missing or invalid `joints` section')
  }
  return cfg
}

/**
 * Build the rig. Returns { rigRoot, joints, dispose }.
 */
export async function loadRig() {
  // Fetch config fresh every call so the UI can offer a "reload rig"
  // button later without needing a page refresh.
  _modelCache = new Map()
  const RIG = await fetchRigConfig()

  // Preload every unique model referenced by body/joints.
  const modelNames = new Set()
  modelNames.add(RIG.body.model.name)
  for (const j of Object.values(RIG.joints)) {
    modelNames.add(j.model.name)
  }
  const sources = new Map()
  await Promise.all(
    [...modelNames].map(async (n) => {
      sources.set(n, await loadModel(n, RIG.models))
    }),
  )

  // ── Root ──
  // Scale mm → meters and rotate so CAD Z-up becomes three.js Y-up.
  const rigRoot = new THREE.Group()
  rigRoot.name = 'qBc_Rig'
  rigRoot.scale.setScalar(RIG.unitScale ?? 0.001)
  if (RIG.zUpToYUp !== false) {
    rigRoot.rotation.x = -Math.PI / 2
  }

  // ── Body ──
  // Two-layer structure so Rig Mode rotations pivot around the CAD
  // origin (the body's logical rotation center) instead of the OBJ's
  // own local origin. Layout:
  //
  //   rigRoot
  //     bodyRestRotGroup   — pos (0,0,0), rot = rest rotation
  //       bodyMeshGroup    — pos = R_rest⁻¹ * translate, rot = identity
  //         objInstance    — raw OBJ meshes
  //
  // Final world pos = rigRoot * R_rest * meshGroup.position
  //                 = translate (in CAD), as intended.
  const bodyObjInstance = instantiateModel(sources.get(RIG.body.model.name), null)
  const bodyMeshGroup = new THREE.Group()
  bodyMeshGroup.add(bodyObjInstance)
  bodyMeshGroup.name = 'body'
  bodyMeshGroup.userData.rigEntry = { kind: 'body' }

  const bodyRestRotGroup = new THREE.Group()
  bodyRestRotGroup.name = 'body:rest'
  applyRotateDeg(bodyRestRotGroup, RIG.body.model.rotate)
  bodyRestRotGroup.add(bodyMeshGroup)

  // meshGroup.position in restRotGroup-local frame = R_rest⁻¹ * translate
  // so that after the group's rotation the mesh origin lands at `translate`.
  {
    const bodyTx = RIG.body.model.translate || [0, 0, 0]
    const off = new THREE.Vector3(bodyTx[0], bodyTx[1], bodyTx[2])
    off.applyQuaternion(bodyRestRotGroup.quaternion.clone().invert())
    bodyMeshGroup.position.copy(off)
  }
  rigRoot.add(bodyRestRotGroup)

  // ── Joints ──
  // For each joint we create a pivot Group whose local position is
  // (this.pivot - parent.pivot). The model mesh is attached as a child with
  // local position (-this.pivot + translate), so that when the pivot group
  // has zero rotation the mesh appears at its original CAD world position
  // (plus the optional translate offset).
  //
  // Joint-with-parent pivot groups nest inside the parent's pivot group so
  // child joints inherit the parent's rotation automatically.
  const joints = new Map()

  // Two-pass: first instantiate the pivot groups so parents exist when we
  // wire up children. Joints can reference parents in any order.
  const pivotGroups = new Map()
  for (const [name, def] of Object.entries(RIG.joints)) {
    const g = new THREE.Group()
    g.name = `joint:${name}`
    pivotGroups.set(name, g)
  }

  for (const [name, def] of Object.entries(RIG.joints)) {
    const pivotGroup = pivotGroups.get(name)
    const parentPivot = def.parent ? RIG.joints[def.parent].pivot : [0, 0, 0]

    // Local position of this pivot group inside its parent frame.
    pivotGroup.position.set(
      def.pivot[0] - parentPivot[0],
      def.pivot[1] - parentPivot[1],
      def.pivot[2] - parentPivot[2],
    )

    // Attach to parent (or root if parentless).
    if (def.parent) {
      pivotGroups.get(def.parent).add(pivotGroup)
    } else {
      rigRoot.add(pivotGroup)
    }

    // Mesh subtree — see the body comment above for the layout. Layout:
    //   pivotGroup
    //     restRotGroup  — pos (0,0,0) = at pivot, rot = rest rotation
    //       meshGroup   — pos = R_rest⁻¹ * (translate - pivot)
    //         objInstance
    //
    // The rest-rotation group exists so Rig Mode can attach a rotation
    // TransformControls to it and sweep the mesh around the joint pivot
    // (not around the mesh's own origin). The meshGroup handles
    // translation (and the raycaster picks its descendants).
    const src = sources.get(def.model.name)
    const objInstance = instantiateModel(src, def.model.mirror || null)
    const meshGroup = new THREE.Group()
    meshGroup.add(objInstance)
    meshGroup.name = `mesh:${name}`
    meshGroup.userData.rigEntry = { kind: 'jointMesh', jointName: name }
    // Tag every descendant so the raycaster can resolve a hit → joint name.
    meshGroup.traverse((child) => {
      if (child.isMesh) child.userData.jointName = name
    })

    const restRotGroup = new THREE.Group()
    restRotGroup.name = `rest:${name}`
    applyRotateDeg(restRotGroup, def.model.rotate)
    restRotGroup.add(meshGroup)

    {
      const tx = def.model.translate || [0, 0, 0]
      const off = new THREE.Vector3(
        tx[0] - def.pivot[0],
        tx[1] - def.pivot[1],
        tx[2] - def.pivot[2],
      )
      off.applyQuaternion(restRotGroup.quaternion.clone().invert())
      meshGroup.position.copy(off)
    }

    pivotGroup.add(restRotGroup)

    // Record joint handle with a setAngle() helper that clamps to limits.
    //
    // Mirror compensation: symmetric joint pairs (left/right legs, ears)
    // share a single OBJ file with the "right" side rendered by flipping
    // the mesh geometry on Y (see instantiateModel → makeScale(1,-1,1)).
    // The hardware servos are physically mirror-mounted, so on the robot
    // commanding +20° on one side of a pair and −20° on the other
    // produces in-phase (mirror-symmetric) world motion. The authored
    // .ani files encode that convention directly (see look_up, look_down,
    // ear_wiggle). In the editor, however, both legs' pivotGroups rotate
    // about world +Y, and rotating a mesh and its Y-mirrored twin by the
    // *same* angle about Y gives mirror-symmetric visuals — the opposite
    // sign convention. Without compensation the editor would play
    // authored animations with the wrong chirality on the mirrored side.
    // Negating the angle for mirrored meshes reconciles the two. We
    // still record `currentAngle` as the *authored* value so the pose
    // store, joint inspector, and .ani export all stay in hardware units.
    const axisVec = axisVector(def.axis)
    const [minDeg, maxDeg] = def.limits
    const mirrored = def.model?.mirror === 'y'
    const joint = {
      name,
      pivot: pivotGroup,
      restRotGroup,
      meshGroup,
      axis: def.axis,
      axisVec,
      limits: [minDeg, maxDeg],
      mirrored,
      currentAngle: 0,
      setAngle(deg) {
        const clamped = Math.max(minDeg, Math.min(maxDeg, deg))
        const renderDeg = mirrored ? -clamped : clamped
        pivotGroup.quaternion.setFromAxisAngle(
          axisVec,
          (renderDeg * Math.PI) / 180,
        )
        joint.currentAngle = clamped
      },
    }
    joints.set(name, joint)
  }

  // Expose the body subtree on a simple handle so Rig Mode can target
  // the mesh group (translate) or the rest-rotation group (rotate).
  const body = {
    name: 'body',
    meshGroup: bodyMeshGroup,
    restRotGroup: bodyRestRotGroup,
  }

  // ── Eye display plane ──
  // If rig.yaml defines a `display` section, create a textured plane
  // parented to the designated joint's mesh group. This means the plane
  // inherits both the joint rotation (e.g. neck turning) and the mesh's
  // rest rotation / position — it tracks the head exactly.
  //
  // `offset` and `rotate` in the YAML are relative to the mesh group
  // origin, so you can position the screen on the head without knowing
  // the pivot coordinates. Adjust them in rig.yaml and refresh.
  let display = null
  if (RIG.display) {
    const d = RIG.display
    const [pw, ph] = d.size || [96, 58]
    const off = d.offset || [0, 0, 0]
    const rot = d.rotate || [0, 0, 0]

    // Find the parent mesh group from the named joint.
    const jointEntry = d.joint ? joints.get(d.joint) : null
    const parentGroup = jointEntry ? jointEntry.meshGroup : rigRoot

    const geo = new THREE.PlaneGeometry(pw, ph)
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.FrontSide,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.name = 'eye-display'
    mesh.userData.rigEntry = { kind: 'display' }

    // Apply offset (CAD mm, relative to head mesh origin).
    mesh.position.set(off[0], off[1], off[2])

    // Apply rotation (degrees, relative to head mesh).
    mesh.rotation.set(
      (rot[0] * Math.PI) / 180,
      (rot[1] * Math.PI) / 180,
      (rot[2] * Math.PI) / 180,
      'XYZ',
    )

    parentGroup.add(mesh)

    display = {
      mesh,
      material: mat,
      setTexture(texture) {
        mat.map = texture
        mat.color.set(0xffffff)
        mat.needsUpdate = true
      },
    }
  }

  return {
    rigRoot,
    joints,
    body,
    display,
    config: RIG,
    dispose() {
      rigRoot.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose?.()
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          mats.forEach((m) => m.dispose?.())
        }
      })
    },
  }
}
