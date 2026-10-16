export const PHYSICS = {
  step: 1 / 60,
  maxSpeed: 60,
  accel: 180,
  decel: 320,
  airAccel: 120,
  gravity: 780,
  floatGravity: 320,
  jumpVelocity: -280,
  jumpCut: -140,
  holdAccel: -380,
  maxJumpHold: 0.14,
  coyote: 0.09,
  jumpBuffer: 0.09,
  landDuration: 0.12,
  skidSpeed: 28,
  apex: 40,
  width: 10,
  height: 20,
  killY: 360,
  stepUp: 4,
  goalSlack: 48,
} as const

export const VIEW_W = 180
export const VIEW_H = 320
