/**
 * Canvas2D eye renderer for the animation editor viewport.
 *
 * Draws a pair of rounded-rectangle eyes matching the robot's face
 * (see qBc_Animation/eye.py + main.py) onto an offscreen canvas.
 * The canvas is used as a Three.js CanvasTexture on a display plane
 * attached to the head in the 3D viewport.
 *
 * Supported eye-store state:
 *   pupilX   : -1..+1  horizontal gaze offset
 *   pupilY   : -1..+1  vertical gaze offset
 *   openness :  0..1   eyelid open fraction (0 = fully closed)
 */

// Canvas dimensions — 5:3 ratio matching a typical small DSI display.
const CW = 240
const CH = 144

// Eye layout ratios — match main.py constants for visual consistency.
const EYE_W_RATIO = 0.20
const EYE_H_RATIO = 0.28
const EYE_GAP_RATIO = 0.22
const CORNER_R_RATIO = 0.30

// Derived sizes at canvas resolution.
const EYE_W = CW * EYE_W_RATIO
const EYE_H = CH * EYE_H_RATIO
const EYE_GAP = CW * EYE_GAP_RATIO
const CORNER_R = EYE_W * CORNER_R_RATIO

const CX = CW / 2
const CY = CH / 2

// Default eye color (orange, matching eye.py default).
const EYE_R = 255
const EYE_G = 100
const EYE_B = 0

// Maximum gaze offset in canvas pixels (pupilX/Y ∈ -1..+1).
const MAX_GAZE = 14

// Glow config — simplified from eye.py's 10-layer glow for performance.
const GLOW_STEPS = 6
const GLOW_SPREAD = 0.30 // fraction of eye size

/**
 * Create an eye renderer.
 * Returns { canvas, render(eyeState), dispose() }.
 */
export function createEyeRenderer() {
  const canvas = document.createElement('canvas')
  canvas.width = CW
  canvas.height = CH
  const ctx = canvas.getContext('2d')

  function render(state) {
    const { pupilX = 0, pupilY = 0, openness = 1 } = state

    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, CW, CH)

    const gx = pupilX * MAX_GAZE
    const gy = pupilY * MAX_GAZE

    // Left eye
    _drawEye(ctx, CX - EYE_GAP / 2 - EYE_W / 2 + gx, CY + gy, openness)
    // Right eye
    _drawEye(ctx, CX + EYE_GAP / 2 + EYE_W / 2 + gx, CY + gy, openness)
  }

  // Draw initial neutral state.
  render({})

  return { canvas, render, dispose() {} }
}

function _drawEye(ctx, cx, cy, openness) {
  const topH = (EYE_H / 2) * openness
  const botH = (EYE_H / 2) * openness
  const totalH = topH + botH
  if (totalH < 1) return

  const x = cx - EYE_W / 2
  const y = cy - topH
  const cr = Math.min(CORNER_R, EYE_W / 2, totalH / 2)

  // Glow layers
  const maxExpand = Math.max(EYE_W, totalH) * GLOW_SPREAD
  for (let i = GLOW_STEPS; i > 0; i--) {
    const frac = i / GLOW_STEPS
    const expand = maxExpand * frac
    const alpha = 0.07 * (1 - frac + 0.2)
    const gr = Math.min(
      cr + expand * 0.5,
      (EYE_W + expand * 2) / 2,
      (totalH + expand * 2) / 2,
    )
    ctx.fillStyle = `rgba(${EYE_R},${EYE_G},${EYE_B},${alpha})`
    ctx.beginPath()
    ctx.roundRect(x - expand, y - expand, EYE_W + expand * 2, totalH + expand * 2, gr)
    ctx.fill()
  }

  // Solid eye
  ctx.fillStyle = `rgb(${EYE_R},${EYE_G},${EYE_B})`
  ctx.beginPath()
  ctx.roundRect(x, y, EYE_W, totalH, cr)
  ctx.fill()
}
