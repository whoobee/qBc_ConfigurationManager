/**
 * Animation document store — holds the currently-open .ani document in
 * absolute-time form, plus playhead state.
 *
 * Document shape (in-memory, editor-native):
 * {
 *   name: string,
 *   loop: boolean,
 *   sound: string | null,
 *   keyframes: [
 *     {
 *       id: number,            // stable key for list rendering
 *       time: number,          // absolute seconds from start
 *       transition: 'linear' | 'quadratic' | 'exponential',
 *       active: true | false | 'random',
 *       joints: { [name]: { position: number | string } },
 *       eyes:   { expression?, pupilX?, pupilY?, openness? },
 *     },
 *     ...
 *   ]
 * }
 *
 * Keyframes are always kept sorted by `time`. `id` is an editor-only
 * handle used by Vue list rendering; it's stripped on export.
 *
 * Conversion to/from the .ani on-disk format (relative times, per-joint
 * movement_type overrides, random strings) happens in ani-io.js — this
 * module stays pure and side-effect free.
 *
 * Used by:
 *   - components/Timeline.vue   — read + edit keyframes, drive playhead
 *   - components/JointInspector — "record pose at playhead" (step 7)
 *   - viewport.js (subscription) — samples at current playhead and writes
 *     into pose-store + eye-store each frame
 */

import { sampleJoints, sampleEyes, totalDuration } from './interpolator.js'

let _nextId = 1

// Editor display-duration bounds — the timeline ruler spans this many
// seconds regardless of whether keyframes fill it. Kept as a top-level
// constant so the UI input can share the same limits.
export const MIN_DURATION = 1
export const MAX_DURATION = 60
export const DEFAULT_DURATION = 2

function _emptyDoc() {
  return {
    name: 'untitled',
    loop: false,
    sound: null,
    // Authored display length in seconds. Does NOT constrain playback —
    // the interpolator still uses the last keyframe's time — but the
    // timeline ruler always spans [0, duration] so users can pre-size
    // their clip and drop keyframes to specific time targets.
    duration: DEFAULT_DURATION,
    keyframes: [],
  }
}

function _clampDuration(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return DEFAULT_DURATION
  return Math.max(MIN_DURATION, Math.min(MAX_DURATION, n))
}

let _doc = _emptyDoc()
let _playhead = 0       // seconds
let _playing = false
const _subscribers = new Set()

/** Full snapshot (returned to subscribers). */
function _snapshot() {
  return {
    doc: _doc,
    playhead: _playhead,
    playing: _playing,
    // `keyframeDuration` is derived from the last keyframe — the actual
    // time the animation "ends" from the interpolator's point of view.
    // `doc.duration` is the authored ruler length, which may be longer
    // than the last keyframe while the user is still laying things out.
    keyframeDuration: totalDuration(_doc.keyframes),
  }
}

function _notify() {
  const snap = _snapshot()
  for (const fn of _subscribers) {
    try { fn(snap) } catch (e) { console.error('[animation-store] subscriber error', e) }
  }
}

export function subscribe(fn) {
  _subscribers.add(fn)
  return () => _subscribers.delete(fn)
}

export function getState() {
  return _snapshot()
}

// ── Document mutations ──

export function newDoc() {
  _doc = _emptyDoc()
  _playhead = 0
  _playing = false
  _notify()
}

export function loadDoc(doc) {
  // Accepts an editor-native doc (absolute times). Assign fresh ids.
  const keyframes = (doc.keyframes || [])
    .map((kf) => ({
      id: _nextId++,
      time: Number(kf.time) || 0,
      transition: kf.transition || 'linear',
      active: kf.active ?? true,
      joints: deepClone(kf.joints || {}),
      eyes: deepClone(kf.eyes || {}),
    }))
    .sort((a, b) => a.time - b.time)
  // If the imported doc carries its own duration, honor it; otherwise
  // derive from the last keyframe (rounded up to the next whole second
  // so the ruler doesn't feel cramped), clamped to the editor limits.
  const autoDuration = keyframes.length
    ? Math.ceil(keyframes[keyframes.length - 1].time)
    : DEFAULT_DURATION
  _doc = {
    name: doc.name || 'untitled',
    loop: !!doc.loop,
    sound: doc.sound ?? null,
    duration: _clampDuration(doc.duration ?? autoDuration),
    keyframes,
  }
  _playhead = 0
  _playing = false
  _notify()
}

export function setDocMeta(patch) {
  const next = { ..._doc, ...patch }
  if (patch.duration !== undefined) {
    next.duration = _clampDuration(patch.duration)
  }
  _doc = next
  _notify()
}

/** Convenience helper used by the timeline duration input. */
export function setDocDuration(seconds) {
  setDocMeta({ duration: _clampDuration(seconds) })
}

/**
 * Insert a keyframe at the given time. If `snapshot` is provided, it
 * captures the current pose/eye state; otherwise the keyframe is empty
 * and inherits from neighbors via the interpolator's carry-forward.
 */
export function addKeyframe({ time, transition = 'linear', joints = {}, eyes = {} } = {}) {
  const kf = {
    id: _nextId++,
    time: Number(time) || 0,
    transition,
    active: true,
    joints: deepClone(joints),
    eyes: deepClone(eyes),
  }
  _doc.keyframes = [..._doc.keyframes, kf].sort((a, b) => a.time - b.time)
  _notify()
  return kf.id
}

export function removeKeyframe(id) {
  _doc.keyframes = _doc.keyframes.filter((k) => k.id !== id)
  _notify()
}

export function updateKeyframe(id, patch) {
  _doc.keyframes = _doc.keyframes
    .map((k) => (k.id === id ? { ...k, ...patch } : k))
    .sort((a, b) => a.time - b.time)
  _notify()
}

/** Replace a keyframe's joint pose snapshot (used by "record pose" UI). */
export function setKeyframeJoints(id, jointPose) {
  const joints = {}
  for (const [name, deg] of Object.entries(jointPose)) {
    joints[name] = { position: deg }
  }
  _doc.keyframes = _doc.keyframes.map((k) => (k.id === id ? { ...k, joints } : k))
  _notify()
}

/** Replace a keyframe's eye state snapshot. */
export function setKeyframeEyes(id, eyeState) {
  const eyes = {
    expression: eyeState.expression,
    pupilX: eyeState.pupilX,
    pupilY: eyeState.pupilY,
    openness: eyeState.openness,
  }
  _doc.keyframes = _doc.keyframes.map((k) => (k.id === id ? { ...k, eyes } : k))
  _notify()
}

// ── Playhead control ──

export function setPlayhead(t) {
  const dur = totalDuration(_doc.keyframes)
  _playhead = Math.max(0, Math.min(dur, t))
  _notify()
}

export function getPlayhead() {
  return _playhead
}

export function play() {
  if (_playing) return
  if (!_doc.keyframes.length) return
  _playing = true
  _notify()
}

export function pause() {
  if (!_playing) return
  _playing = false
  _notify()
}

export function stop() {
  _playing = false
  _playhead = 0
  _notify()
}

/** Advance the playhead by dt seconds while playing. Called by the
 *  viewport render loop. Respects loop flag; pauses at end if not looped. */
export function tick(dt) {
  if (!_playing) return
  const dur = totalDuration(_doc.keyframes)
  if (dur <= 0) {
    _playing = false
    return
  }
  _playhead += dt
  if (_playhead >= dur) {
    if (_doc.loop) {
      _playhead = _playhead % dur
    } else {
      _playhead = dur
      _playing = false
    }
  }
  _notify()
}

// ── Sampling helpers (convenience wrappers) ──

export function samplePose(jointNames) {
  return sampleJoints(_doc.keyframes, _playhead, jointNames)
}

export function sampleEyeState() {
  return sampleEyes(_doc.keyframes, _playhead)
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj))
}
