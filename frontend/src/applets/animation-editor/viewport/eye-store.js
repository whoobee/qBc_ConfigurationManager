/**
 * Eye store — current state of the eye-display channel for the animation
 * editor. Mirrors the shape used by `.ani` eye keyframes so the timeline
 * (step 6) can snapshot / restore a full eye state in one object.
 *
 * Schema is intentionally minimal for now; extend alongside the .ani
 * format when the eye renderer grows new parameters. All numeric ranges
 * are soft — the inspector clamps, but readers should tolerate anything.
 *
 *   expression : string   — named expression preset ('neutral', 'happy',
 *                           'sad', 'angry', 'surprised', 'sleepy')
 *   pupilX     : number   — -1..+1, horizontal gaze offset
 *   pupilY     : number   — -1..+1, vertical gaze offset
 *   openness   : number   —  0..1,  eyelid open amount (0 = closed)
 *   blink      : boolean  — momentary blink trigger flag
 *
 * Used by:
 *   - components/EyeInspector.vue  — reads/writes from UI
 *   - components/Timeline.vue      — captures into / restores from keyframes
 */

const DEFAULT_STATE = {
  expression: 'neutral',
  pupilX: 0,
  pupilY: 0,
  openness: 1,
  blink: false,
}

let _state = { ...DEFAULT_STATE }
const _subscribers = new Set()

export const EXPRESSION_PRESETS = [
  'neutral',
  'happy',
  'sad',
  'angry',
  'surprised',
  'sleepy',
]

export function getEyeState() {
  return { ..._state }
}

export function setEyeField(key, value) {
  if (!(key in _state)) return
  if (_state[key] === value) return
  _state = { ..._state, [key]: value }
  _notify()
}

export function setEyeState(next) {
  _state = { ...DEFAULT_STATE, ...next }
  _notify()
}

export function resetEyeState() {
  _state = { ...DEFAULT_STATE }
  _notify()
}

export function subscribe(fn) {
  _subscribers.add(fn)
  return () => _subscribers.delete(fn)
}

function _notify() {
  for (const fn of _subscribers) {
    try { fn(getEyeState()) } catch (e) { console.error('[eye-store] subscriber error', e) }
  }
}
