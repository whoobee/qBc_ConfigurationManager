/**
 * Pose store — shared current-pose state across the viewport, inspectors,
 * and timeline.
 *
 * A "pose" is a Map<jointName, angleDegrees>. Components subscribe to
 * changes and react. Keeping this as a plain JS module avoids coupling the
 * three.js viewport layer to Vue reactivity.
 *
 * Used by:
 *   - viewport/joint-controls.js — writes angles from drag gestures
 *   - components/JointInspector.vue — reads/writes from sliders
 *   - components/Timeline.vue       — loads a keyframe's pose, or captures
 *                                     the current pose into a new keyframe
 */

const _jointAngles = new Map()
const _subscribers = new Set()

/** Initialize angle state for all joints in the rig to 0°. */
export function initPose(jointNames) {
  _jointAngles.clear()
  for (const name of jointNames) _jointAngles.set(name, 0)
  _notify()
}

/** Get a shallow copy of the current pose as an object. */
export function getPose() {
  const out = {}
  for (const [k, v] of _jointAngles) out[k] = v
  return out
}

/** Get a single joint angle (degrees). */
export function getJointAngle(name) {
  return _jointAngles.get(name) ?? 0
}

/** Set a single joint angle (degrees). Notifies subscribers. */
export function setJointAngle(name, deg) {
  if (!_jointAngles.has(name)) return
  if (_jointAngles.get(name) === deg) return
  _jointAngles.set(name, deg)
  _notify()
}

/** Overwrite the entire pose from an object. */
export function setPose(pose) {
  let changed = false
  for (const [k, v] of Object.entries(pose)) {
    if (_jointAngles.has(k) && _jointAngles.get(k) !== v) {
      _jointAngles.set(k, v)
      changed = true
    }
  }
  if (changed) _notify()
}

/** Subscribe to pose changes. Returns an unsubscribe function. */
export function subscribe(fn) {
  _subscribers.add(fn)
  return () => _subscribers.delete(fn)
}

function _notify() {
  for (const fn of _subscribers) {
    try { fn(getPose()) } catch (e) { console.error('[pose-store] subscriber error', e) }
  }
}
