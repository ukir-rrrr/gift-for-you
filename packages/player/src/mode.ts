import type { RuntimeCourse, WalkFrameCount } from '@gfy/catalog'
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

export interface ModeRenderer {
  draw(snapshot: Snapshot, course: RuntimeCourse, alpha: number): void
}

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
  openPressed: false,
}

export class PlatformerMode implements GameMode {
  private state: SimState | null = null
  private course: RuntimeCourse | null = null
  private acc = 0
  private input: InputState = { ...IDLE_INPUT }

  constructor(private readonly renderer: ModeRenderer | null = null) {}

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
    this.state.walkFrames = frameCount
    this.state.walkFrame = 0
    this.state.walkAcc = 0
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

  update(dt: number) {
    if (!this.state || !this.course) return
    this.acc += Math.min(Math.max(dt, 0), 0.05)
    let first = true
    let guard = 0
    while (this.acc >= PHYSICS.step && guard < 5) {
      const stepInput = first ? this.input : { ...this.input, jumpPressed: false, openPressed: false }
      first = false
      stepSim(this.state, stepInput, this.course, PHYSICS.step)
      this.acc -= PHYSICS.step
      guard += 1
    }
  }

  render() {
    if (!this.state || !this.course || !this.renderer) return
    this.renderer.draw(snapshot(this.state, this.course), this.course, this.acc / PHYSICS.step)
  }

  onGoal(): GoalEvent | undefined {
    if (!this.state || !this.course) return undefined
    if (this.state.goalBeat === 'none') return undefined
    return { templateId: this.course.templateId }
  }
}
