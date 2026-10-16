import { remapWalkFrame, type RuntimeCourse, type WalkFrameCount } from '@gfy/catalog'
import { PHYSICS } from './sim/physics'
import {
  chooseAssist,
  createState,
  dismissPopup,
  snapshot,
  stepSim,
  type AssistMode,
  type InputState,
  type SimState,
  type Snapshot,
} from './sim/platformer'

export type GoalEvent = { templateId: string }

export interface GameMode {
  load(courseSpec: RuntimeCourse): void
  update(dt: number): void
  render(): void
  onGoal(): GoalEvent | undefined
}

const IDLE_INPUT: InputState = {
  left: false,
  right: false,
  jump: false,
  jumpPressed: false,
}

export class PlatformerMode implements GameMode {
  private state: SimState | null = null
  private course: RuntimeCourse | null = null
  private acc = 0
  private input: InputState = { ...IDLE_INPUT }

  load(courseSpec: RuntimeCourse, options?: { easy?: boolean; walkFrames?: WalkFrameCount; assistAfter?: number }) {
    this.course = courseSpec
    this.state = createState(courseSpec, options)
    this.acc = 0
  }

  setInput(input: InputState) {
    this.input = input
  }

  setEasy(easy: boolean) {
    if (this.state) this.state.easy = easy
  }

  setWalkFrames(frameCount: WalkFrameCount) {
    if (!this.state) return
    const from = this.state.walkFrames
    this.state.walkFrame = remapWalkFrame(this.state.walkFrame, from, frameCount)
    this.state.walkFrames = frameCount
  }

  chooseAssist(choice: 'invincible' | 'float' | 'skip') {
    if (!this.state || !this.course) return
    chooseAssist(this.state, this.course, choice)
  }

  dismissPopup() {
    if (this.state) dismissPopup(this.state)
  }

  assist(): AssistMode {
    return this.state?.assist ?? 'none'
  }

  read(): Snapshot | null {
    if (!this.state || !this.course) return null
    return snapshot(this.state, this.course)
  }

  alpha(): number {
    return this.acc / PHYSICS.step
  }

  update(dt: number) {
    if (!this.state || !this.course) return
    this.acc += Math.min(Math.max(dt, 0), 0.05)
    let first = true
    let guard = 0
    while (this.acc >= PHYSICS.step && guard < 5) {
      const stepInput = first ? this.input : { ...this.input, jumpPressed: false }
      first = false
      stepSim(this.state, stepInput, this.course, PHYSICS.step)
      this.acc -= PHYSICS.step
      guard += 1
    }
  }

  render() {
    return
  }

  onGoal(): GoalEvent | undefined {
    if (!this.state?.atGoal || !this.course) return undefined
    return { templateId: this.course.templateId }
  }
}
