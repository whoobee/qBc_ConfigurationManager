/**
 * .ani ↔ editor document conversion.
 *
 * The editor stores keyframes with *absolute* times for ease of scrubbing
 * and drag-editing. The on-disk .ani format uses *relative* durations
 * (each keyframe's `time` is the duration of the segment leading up to
 * it). This module converts between the two representations.
 *
 * It also carries the rest of the .ani format faithfully: `active`,
 * `transition`, per-keyframe `left_eye`/`right_eye` and `joints` dicts,
 * top-level `name`/`loop`/`sound`. Random strings (`"random(-10, 10)"`)
 * are preserved verbatim on the round trip so an authored file that uses
 * randomization isn't flattened to numeric midpoints.
 *
 * Eye state mapping — the editor's eye-store is intentionally a trimmed
 * subset of the Python eye schema (just `expression`, `pupilX`, `pupilY`,
 * `openness`). Unknown Python eye params (morph_shape, w_mult, scale_top,
 * color_r, etc.) are read into a `_extra` blob on import and written back
 * unchanged on export, so hand-authored files survive a round-trip even
 * if the editor GUI can't edit all the fields yet.
 */

// ── export: editor doc → .ani JSON ──

export function editorDocToAni(doc) {
  const out = {
    name: doc.name || 'untitled',
    loop: !!doc.loop,
  }
  // Authored ruler length — the editor uses it to size the timeline, the
  // runtime doesn't need it but preserving it round-trips the user's
  // intended clip length even when no keyframe sits at the end.
  if (typeof doc.duration === 'number') out.duration = doc.duration
  if (doc.sound) out.sound = doc.sound
  const kfs = [...doc.keyframes].sort((a, b) => a.time - b.time)
  const aniKfs = []
  let prevT = 0
  kfs.forEach((kf, i) => {
    const rel = i === 0 ? 0 : Math.max(0, kf.time - prevT)
    prevT = kf.time
    const aniKf = {
      time: round3(rel),
      transition: kf.transition || 'linear',
    }
    if (kf.active !== undefined && kf.active !== true) aniKf.active = kf.active
    // Joints: editor stores { name: { position } }; .ani expects the same,
    // so pass through. Numbers and random-strings both serialize cleanly.
    if (kf.joints && Object.keys(kf.joints).length > 0) {
      aniKf.joints = {}
      for (const [name, j] of Object.entries(kf.joints)) {
        aniKf.joints[name] = { position: j.position }
        if (j.movement_type) aniKf.joints[name].movement_type = j.movement_type
        if (j.torque !== undefined) aniKf.joints[name].torque = j.torque
      }
    }
    // Eyes: the editor speaks { expression, pupilX, pupilY, openness }.
    // Map to the .ani schema as a pair of identical left/right eye dicts
    // unless the keyframe preserves a raw `_extraLeft`/`_extraRight` blob
    // from import, in which case we merge our overrides onto it.
    const { left, right } = eyesToAni(kf.eyes || {}, kf._extraLeft, kf._extraRight)
    if (left) aniKf.left_eye = left
    if (right) aniKf.right_eye = right
    aniKfs.push(aniKf)
  })
  out.keyframes = aniKfs
  return out
}

// Map editor eye keys → .ani eye keys.
//   pupilX   → offset_x  (pixels; editor is normalized -1..1 so we scale)
//   pupilY   → offset_y
//   openness → scale_top = scale_bottom (symmetric lids)
//   expression is not written into eye params — it's an editor-only tag
//   that drives the expression preset before the first keyframe plays.
const PUPIL_OFFSET_PX = 20  // rough half-width of an eye in px; tunable
function eyesToAni(eyes, extraLeft, extraRight) {
  const hasNumeric =
    eyes.pupilX !== undefined ||
    eyes.pupilY !== undefined ||
    eyes.openness !== undefined
  if (!hasNumeric && !extraLeft && !extraRight) return { left: null, right: null }

  const numeric = {}
  if (eyes.pupilX !== undefined) numeric.offset_x = Number(eyes.pupilX) * PUPIL_OFFSET_PX
  if (eyes.pupilY !== undefined) numeric.offset_y = Number(eyes.pupilY) * PUPIL_OFFSET_PX
  if (eyes.openness !== undefined) {
    numeric.scale_top = Number(eyes.openness)
    numeric.scale_bottom = Number(eyes.openness)
  }
  return {
    left: { ...(extraLeft || {}), ...numeric },
    right: { ...(extraRight || {}), ...numeric },
  }
}

// ── import: .ani JSON → editor doc ──

export function aniToEditorDoc(ani) {
  const doc = {
    name: ani.name || 'untitled',
    loop: !!ani.loop,
    sound: ani.sound ?? null,
    // Pass through if present; animation-store.loadDoc will clamp and
    // auto-derive from last keyframe if missing.
    duration: typeof ani.duration === 'number' ? ani.duration : undefined,
    keyframes: [],
  }
  let absT = 0
  const kfs = Array.isArray(ani.keyframes) ? ani.keyframes : []
  kfs.forEach((kf, i) => {
    const rel = i === 0 ? 0 : Number(kf.time) || 0
    absT += rel
    doc.keyframes.push({
      // id gets assigned by animation-store.loadDoc
      time: absT,
      transition: kf.transition || 'linear',
      active: kf.active ?? true,
      joints: kf.joints ? cloneJoints(kf.joints) : {},
      eyes: eyesFromAni(kf.left_eye, kf.right_eye),
      // Preserve unknown eye fields so export is a faithful round-trip.
      _extraLeft: stripKnownEyeKeys(kf.left_eye),
      _extraRight: stripKnownEyeKeys(kf.right_eye),
    })
  })
  return doc
}

function cloneJoints(j) {
  const out = {}
  for (const [name, p] of Object.entries(j)) {
    if (typeof p !== 'object' || p === null) continue
    out[name] = { position: p.position ?? 0 }
    if (p.movement_type) out[name].movement_type = p.movement_type
    if (p.torque !== undefined) out[name].torque = p.torque
  }
  return out
}

const KNOWN_EYE_KEYS = new Set(['offset_x', 'offset_y', 'scale_top', 'scale_bottom'])
function stripKnownEyeKeys(raw) {
  if (!raw || typeof raw !== 'object') return null
  const out = {}
  let any = false
  for (const [k, v] of Object.entries(raw)) {
    if (KNOWN_EYE_KEYS.has(k)) continue
    out[k] = v
    any = true
  }
  return any ? out : null
}

function eyesFromAni(left, right) {
  // Prefer left eye for the editor's "single shared eye state" — if the
  // file diverges left/right we average them for display. (Users who need
  // asymmetric eyes should edit the raw .ani for now.)
  const out = {}
  const offsetX = avgNum(left?.offset_x, right?.offset_x)
  const offsetY = avgNum(left?.offset_y, right?.offset_y)
  const openness = avgNum(
    avgNum(left?.scale_top, left?.scale_bottom),
    avgNum(right?.scale_top, right?.scale_bottom),
  )
  if (offsetX !== null) out.pupilX = offsetX / 20
  if (offsetY !== null) out.pupilY = offsetY / 20
  if (openness !== null) out.openness = openness
  return out
}

function avgNum(a, b) {
  const an = typeof a === 'number' ? a : null
  const bn = typeof b === 'number' ? b : null
  if (an === null && bn === null) return null
  if (an === null) return bn
  if (bn === null) return an
  return (an + bn) / 2
}

function round3(n) {
  return Math.round(n * 1000) / 1000
}
