import type { InputState } from './platformer'

export type TapeChunk = {
  n: number
  left?: boolean
  right?: boolean
  jump?: boolean
  jumpPressed?: boolean
}

const IDLE: InputState = { left: false, right: false, jump: false, jumpPressed: false }

export function encodeTape(inputs: readonly InputState[]): TapeChunk[] {
  const chunks: TapeChunk[] = []
  for (const input of inputs) {
    const last = chunks[chunks.length - 1]
    const same =
      last &&
      !input.jumpPressed &&
      !last.jumpPressed &&
      !!last.left === input.left &&
      !!last.right === input.right &&
      !!last.jump === input.jump
    if (same && last) {
      last.n += 1
      continue
    }
    const chunk: TapeChunk = { n: 1 }
    if (input.left) chunk.left = true
    if (input.right) chunk.right = true
    if (input.jump) chunk.jump = true
    if (input.jumpPressed) chunk.jumpPressed = true
    chunks.push(chunk)
  }
  return chunks
}

export function tapeInput(tape: readonly TapeChunk[], step: number): InputState {
  let cursor = 0
  for (const chunk of tape) {
    if (step < cursor + chunk.n) {
      return {
        left: !!chunk.left,
        right: !!chunk.right,
        jump: !!chunk.jump,
        jumpPressed: !!chunk.jumpPressed && step === cursor,
      }
    }
    cursor += chunk.n
  }
  return IDLE
}

export function runTape(
  step: (input: InputState) => boolean,
  tape: readonly TapeChunk[],
  maxSteps: number,
) {
  for (let i = 0; i < maxSteps; i++) {
    if (step(tapeInput(tape, i))) return i
  }
  return maxSteps
}
