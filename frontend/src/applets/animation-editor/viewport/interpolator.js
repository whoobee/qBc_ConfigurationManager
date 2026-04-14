/**
 * Keyframe interpolator — JS port of qBc_Animation/animation.py's sampling
 * logic. Kept deliberately close to the Python so behavior matches when
 * the same .ani file plays on robot.
 *
 * Differences from the Python side:
 *   - The editor stores absolute `time` on each keyframe (seconds from
 *     start), not the Python "relative duration". Convert on import/export
 *     (see ani-io.js in step 7). Absolute times make scrubbing and drag
 *     editing trivial.
 *   - The editor does NOT resolve random(min, max) values — those are
 *     stored as strings in the document and only resolved at playback
 *     time on the robot. The editor scrubber treats unresolved random
 *     strings as the midpoint for preview.
 *   - `active: "random"` keyframes are shown but always included during
 *     editor scrubbing (the editor shows the authored file, not one
 *     playback sample).
 *
 * Transitions: 'linear', 'quadratic', 'exponential'.
 */

export const TRANSITIONS = ['linear', 'quadratic', 'exponential']

/** Ease a 0..1 progress value by the given transition curve. */
export function easeProgress(t, transition) {
  const c = Math.max(0, Math.min(1, t))
  if (transition === 'quadratic') return c * c
  if (transition === 'exponential') return Math.pow(2, c) - 1
  return c // linear
}

/** Interpolate between a and b at progress t using transition curve. */
export function interpolate(a, b, t, transition) {
  const e = easeProgress(t, transition)
  return a + (b - a) * e
}

/**
 * Resolve a value that might be a literal number or a 'random(min,max)'
 * string. In the editor we don't actually randomize — we return the
 * midpoint so a preview looks reasonable, and mark it as `isRandom` so
 * the UI can show a hint. Use resolveForPlayback() on the robot to get
 * a real sample.
 */
const RANDOM_RE = /^\s*random\(\s*([^,]+)\s*,\s*([^)]+)\s*\)\s*$/
export function resolveEditorValue(val) {
  if (typeof val === 'number') return val
  if (typeof val === 'string') {
    const m = RANDOM_RE.exec(val)
    if (m) {
      const lo = Number(m[1])
      const hi = Number(m[2])
      if (Number.isFinite(lo) && Number.isFinite(hi)) return (lo + hi) / 2
    }
  }
  return 0
}

/**
 * Find the pair of keyframes bracketing time `t` in a sorted list.
 * Returns `{ prev, next, progress }` where progress ∈ [0, 1] is the
 * normalized distance from prev.time to next.time.
 *
 * Edge cases:
 *   - t before the first keyframe → prev = next = keyframes[0], progress 0
 *   - t after the last keyframe  → prev = next = last, progress 1
 *   - empty list                 → null
 */
export function bracket(keyframes, t) {
  if (!keyframes.length) return null
  if (t <= keyframes[0].time) {
    return { prev: keyframes[0], next: keyframes[0], progress: 0 }
  }
  const last = keyframes[keyframes.length - 1]
  if (t >= last.time) {
    return { prev: last, next: last, progress: 1 }
  }
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i]
    const b = keyframes[i + 1]
    if (t >= a.time && t <= b.time) {
      const span = b.time - a.time
      const progress = span > 0 ? (t - a.time) / span : 1
      return { prev: a, next: b, progress }
    }
  }
  return { prev: last, next: last, progress: 1 }
}

/**
 * Sample the joint pose (name → degrees) at the given time.
 *
 * `keyframes[i].joints` is an object { jointName: { position } } matching
 * the .ani format. Carry-forward semantics match the Python runtime
 * (animation.py → get_pending_joint_commands): when a keyframe does NOT
 * define a joint, that joint simply holds its previous value across the
 * segment — no servo command is fired at the boundary, so the hardware
 * sits still. In the editor we mimic this by using the prev-defined
 * value for BOTH endpoints of the segment, which collapses the
 * interpolation to a hold. The joint only starts moving again on the
 * next keyframe that explicitly redefines it.
 */
export function sampleJoints(keyframes, t, jointNames) {
  const out = {}
  for (const name of jointNames) out[name] = 0
  if (!keyframes.length) return out

  const br = bracket(keyframes, t)
  if (!br) return out
  const { prev, next, progress } = br
  const transition = next.transition || 'linear'

  for (const name of jointNames) {
    // Walk backwards to find the most-recent keyframe at or before
    // `prev` that defines this joint — that's the "from" value.
    const fromVal = lastDefinedJoint(keyframes, prev, name)
    // `toVal` is whatever `next` explicitly defines — if `next` is
    // silent on this joint, fall back to fromVal so the segment holds.
    const toVal = definedAtJoint(next, name, fromVal)
    out[name] = interpolate(fromVal, toVal, progress, transition)
  }
  return out
}

function lastDefinedJoint(keyframes, startKf, name) {
  const startIdx = keyframes.indexOf(startKf)
  for (let i = startIdx; i >= 0; i--) {
    const j = keyframes[i].joints?.[name]
    if (j && j.position !== undefined) return resolveEditorValue(j.position)
  }
  return 0
}

function definedAtJoint(kf, name, fallback) {
  const j = kf.joints?.[name]
  if (j && j.position !== undefined) return resolveEditorValue(j.position)
  return fallback
}

/**
 * Sample eye state at the given time. Eye state in the editor is a
 * subset of the Python format: { expression, pupilX, pupilY, openness }
 * where expression is a non-interpolated string (carried forward) and
 * the rest interpolate numerically.
 *
 * Each keyframe's `eyes` object is { expression?, pupilX?, pupilY?,
 * openness? }. Missing fields carry forward from the previous defining
 * keyframe.
 */
const EYE_NUMERIC_KEYS = ['pupilX', 'pupilY', 'openness']
export function sampleEyes(keyframes, t) {
  const out = { expression: 'neutral', pupilX: 0, pupilY: 0, openness: 1 }
  if (!keyframes.length) return out
  const br = bracket(keyframes, t)
  if (!br) return out
  const { prev, next, progress } = br
  const transition = next.transition || 'linear'

  for (const key of EYE_NUMERIC_KEYS) {
    const a = lastDefinedEye(keyframes, prev, key, key === 'openness' ? 1 : 0)
    // Same hold-semantics as joints: if `next` doesn't explicitly set
    // this eye field, reuse the prev value so the segment holds steady.
    // This matches the Python runtime, which fills missing eye fields
    // from prev_left/prev_right during keyframe resolution.
    const b = definedAtEye(next, key, a)
    out[key] = interpolate(a, b, progress, transition)
  }
  // Expression: same rule as Python — use `next`'s value if it sets one,
  // otherwise carry forward from the most recent prior-defining keyframe.
  // We deliberately do NOT look past `next`; a future keyframe's
  // expression must not bleed into the current segment.
  out.expression =
    next.eyes?.expression ||
    lastDefinedEyeRaw(keyframes, prev, 'expression') ||
    'neutral'
  return out
}

function lastDefinedEye(keyframes, startKf, key, fallback) {
  const startIdx = keyframes.indexOf(startKf)
  for (let i = startIdx; i >= 0; i--) {
    const v = keyframes[i].eyes?.[key]
    if (v !== undefined) return resolveEditorValue(v)
  }
  return fallback
}
function definedAtEye(kf, key, fallback) {
  const v = kf.eyes?.[key]
  if (v !== undefined) return resolveEditorValue(v)
  return fallback
}
function lastDefinedEyeRaw(keyframes, startKf, key) {
  const startIdx = keyframes.indexOf(startKf)
  for (let i = startIdx; i >= 0; i--) {
    const v = keyframes[i].eyes?.[key]
    if (v !== undefined) return v
  }
  return null
}

/** Total duration of the animation (last keyframe time or 0). */
export function totalDuration(keyframes) {
  if (!keyframes.length) return 0
  return keyframes[keyframes.length - 1].time
}
