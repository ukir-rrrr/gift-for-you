import {
  GIFT_ITEMS,
  moversOf,
  oscillatorFacing,
  oscillatorX,
  remapWalkFrame,
  type RuntimeCourse,
} from '@gfy/catalog'
import Phaser from 'phaser'
import { glowAlpha } from './fx'
import { BEAT_SECONDS, type RevealBeat } from './phase'
import type { PlatformerMode } from './mode'
import { interpolatedFeet, type InputState, type Snapshot } from './sim/platformer'

const EMPTY: InputState = { left: false, right: false, jump: false, jumpPressed: false }

const ART = '/assets/gfy'
const HERO_FRAME = { frameWidth: 24, frameHeight: 32 }
const TILE = 16
const GRASS_FRAMES = [0, 1, 2]
const DIRT_FRAME = 3
const PEDESTAL_H = 20
// The hero stops on goal.x, so the pedestal stands just ahead of them instead of behind.
const PEDESTAL_DX = 18
const GIFT_H = 14
const HURT_SECONDS = 0.4

type HeroPose = { key: 'hero_walk' | 'hero_idle' | 'hero_jump' | 'hero_hurt'; frame: number }

function poseOf(snap: Snapshot, hurt: boolean): HeroPose {
  if (hurt) return { key: 'hero_hurt', frame: Math.floor(snap.time * 8) % 2 }
  if (snap.phase === 'walk') {
    const frame = snap.walkFrames === 8 ? snap.walkFrame : remapWalkFrame(snap.walkFrame, snap.walkFrames, 8)
    return { key: 'hero_walk', frame }
  }
  if (snap.phase === 'jump-up') return { key: 'hero_jump', frame: 0 }
  if (snap.phase === 'jump-apex' || snap.phase === 'jump-fall') return { key: 'hero_jump', frame: 1 }
  if (snap.phase === 'land' || snap.phase === 'skid') return { key: 'hero_idle', frame: 0 }
  const blink = Math.floor(snap.time * 1.5) % 4 === 0 ? 1 : 0
  return { key: 'hero_idle', frame: blink }
}

function platformFrame(w: number): string {
  if (w === 48) return 'plat1_48'
  if (w === 32) return 'plat1_32'
  return 'plat1_16'
}

// Deterministic per-column pick so grass variants do not reshuffle on reload.
function grassFrame(x: number): number {
  const n = Math.imul(Math.floor(x / TILE) + 7, 2654435761) >>> 0
  return GRASS_FRAMES[(n >>> 13) % GRASS_FRAMES.length]
}

export class PlayScene extends Phaser.Scene {
  mode: PlatformerMode | null = null
  course: RuntimeCourse | null = null
  playing = false
  /** Held while the phone is sideways; the sim and timers stop. */
  paused = false
  reduceFlash = false
  giftOpen = false
  revealBeat: RevealBeat | null = null
  beatTime = 0
  giftItemId = 'scarf'
  readInput: () => InputState = () => EMPTY
  onTick: ((dt: number) => void) | null = null

  private hero!: Phaser.GameObjects.Sprite
  private gift!: Phaser.GameObjects.Image
  private glow!: Phaser.GameObjects.Image
  private item!: Phaser.GameObjects.Image
  private sky!: Phaser.GameObjects.TileSprite
  private mountains!: Phaser.GameObjects.TileSprite
  private forest!: Phaser.GameObjects.TileSprite
  private rays: Phaser.GameObjects.Image[] = []
  private sparks: Phaser.GameObjects.Image[] = []
  private flash!: Phaser.GameObjects.Image
  private world: Phaser.GameObjects.GameObject[] = []
  private coins = new Map<string, Phaser.GameObjects.Image>()
  private platforms = new Map<string, Phaser.GameObjects.Image>()
  private walkers = new Map<string, Phaser.GameObjects.Image>()
  private flags: Phaser.GameObjects.Image[] = []
  private seenFails = 0
  private hurtUntil = -1

  constructor() {
    super('play')
  }

  preload() {
    for (const item of GIFT_ITEMS) this.load.image(`item-${item.id}`, `/assets/items/${item.id}.png`)
    for (const key of ['hero_walk', 'hero_idle', 'hero_jump', 'hero_hurt']) {
      this.load.spritesheet(key, `${ART}/${key}.png`, HERO_FRAME)
    }
    this.load.spritesheet('tiles', `${ART}/tiles.png`, { frameWidth: TILE, frameHeight: TILE })
    this.load.image('enemy', `${ART}/enemy.png`)
    this.load.atlas('props', `${ART}/props.png`, `${ART}/props_atlas.json`)
    this.load.atlas('pedestal_gift', `${ART}/pedestal_gift.png`, `${ART}/pedestal_gift_atlas.json`)
    this.load.image('bg_sky', `${ART}/bg_sky.png`)
    this.load.image('bg_mountains', `${ART}/bg_mountains.png`)
    this.load.image('bg_forest', `${ART}/bg_forest.png`)
    this.load.image('token', '/assets/fx/token.png')
    this.load.image('spark', '/assets/fx/spark.png')
    this.load.image('ray', '/assets/fx/ray.png')
  }

  create() {
    this.cameras.main.setBackgroundColor('#70a8e0')
    this.cameras.main.roundPixels = true
    this.sky = this.add.tileSprite(0, 0, 180, 320, 'bg_sky').setOrigin(0, 0).setScrollFactor(0).setDepth(-3)
    this.mountains = this.add.tileSprite(0, 144, 180, 90, 'bg_mountains').setOrigin(0, 0).setScrollFactor(0).setDepth(-2)
    this.forest = this.add.tileSprite(0, 172, 180, 100, 'bg_forest').setOrigin(0, 0).setScrollFactor(0).setDepth(-1)
    // Under the forest line the sky is pale; fill it so gaps read as pits.
    if (!this.textures.exists('pit')) {
      const pit = this.textures.createCanvas('pit', 1, 1)
      if (pit) {
        pit.context.fillStyle = '#1f140b'
        pit.context.fillRect(0, 0, 1, 1)
        pit.refresh()
      }
    }
    this.add.image(0, 272, 'pit').setOrigin(0, 0).setDisplaySize(180, 48).setScrollFactor(0).setDepth(-1)
    this.rays = [0, 1, 2].map((i) => this.add.image(0, 0, 'ray').setOrigin(0.5, 1).setDepth(4).setAngle(-20 + i * 20))
    this.glow = this.add.image(0, 0, 'pedestal_gift', 'gift_glow').setDepth(5)
    this.gift = this.add.image(0, 0, 'pedestal_gift', 'gift').setOrigin(0.5, 1).setDepth(5)
    this.hero = this.add.sprite(40, 272, 'hero_idle', 0).setOrigin(0.5, 1).setDepth(6)
    this.item = this.add.image(0, 0, 'item-scarf').setOrigin(0.5, 1).setDepth(9).setVisible(false)
    this.sparks = [0, 1, 2, 3, 4, 5].map(() => this.add.image(0, 0, 'spark').setDepth(10))
    if (!this.textures.exists('flash')) {
      const flash = this.textures.createCanvas('flash', 1, 1)
      if (flash) {
        flash.context.fillStyle = '#f4ecd8'
        flash.context.fillRect(0, 0, 1, 1)
        flash.refresh()
      }
    }
    this.flash = this.add.image(0, 0, 'flash').setOrigin(0, 0).setDisplaySize(180, 320).setScrollFactor(0).setDepth(11)
    this.flash.setVisible(false)
    this.game.events.emit('gfy-ready')
  }

  mount(mode: PlatformerMode, course: RuntimeCourse, giftItemId: string) {
    this.mode = mode
    this.course = course
    this.giftItemId = giftItemId
    this.seenFails = 0
    this.hurtUntil = -1
    this.rebuild()
    this.item.setTexture(`item-${giftItemId}`)
  }

  private ground(x: number, y: number, w: number, h: number) {
    const top = this.add.tileSprite(x, y, w, Math.min(TILE, h), 'tiles', GRASS_FRAMES[0]).setOrigin(0, 0).setDepth(0)
    this.world.push(top)
    for (let col = x; col + TILE <= x + w; col += TILE) {
      const frame = grassFrame(col)
      if (frame === GRASS_FRAMES[0]) continue
      this.world.push(this.add.image(col, y, 'tiles', frame).setOrigin(0, 0).setDepth(0))
    }
    if (h > TILE) {
      const dirt = this.add.tileSprite(x, y + TILE, w, h - TILE, 'tiles', DIRT_FRAME).setOrigin(0, 0).setDepth(0)
      this.world.push(dirt)
    }
  }

  private rebuild() {
    for (const object of this.world) object.destroy()
    this.world = []
    this.coins.clear()
    this.platforms.clear()
    this.walkers.clear()
    this.flags = []
    const course = this.course
    if (!course) return
    for (const solid of course.solids) this.ground(solid.x, solid.y, solid.w, solid.h)
    for (const hazard of course.hazards) {
      for (let x = hazard.x; x < hazard.x + hazard.w; x += TILE) {
        // 16x8 spike art drawn at double height so it reads next to the 28px hero.
        const spikes = this.add.image(x, hazard.y + hazard.h, 'props', 'spikes').setOrigin(0, 1).setScale(1, 2).setDepth(2)
        this.world.push(spikes)
      }
    }
    for (const platform of moversOf(course, 'solid')) {
      const frame = platformFrame(platform.w)
      const tile = this.add
        .image(platform.originX, platform.y, 'props', frame)
        .setOrigin(0, 0)
        .setDisplaySize(platform.w, platform.h)
        .setDepth(2)
      this.platforms.set(platform.id, tile)
      this.world.push(tile)
    }
    for (const walker of moversOf(course, 'stompable')) {
      const sprite = this.add.image(walker.originX, walker.y + walker.h, 'enemy').setOrigin(0.5, 1).setDepth(3)
      this.walkers.set(walker.id, sprite)
      this.world.push(sprite)
    }
    for (const coin of course.coins) {
      const sprite = this.add.image(coin.x, coin.y, 'token').setOrigin(0, 0).setDepth(3)
      this.coins.set(coin.id, sprite)
      this.world.push(sprite)
    }
    for (const checkpoint of course.checkpoints) {
      const flag = this.add.image(checkpoint.x, checkpoint.y, 'props', 'flag1').setOrigin(0.5, 1).setDepth(1)
      this.flags.push(flag)
      this.world.push(flag)
    }
    const pedestalX = course.goal.x + PEDESTAL_DX
    const pedestal = this.add.image(pedestalX, course.goal.y, 'pedestal_gift', 'pedestal').setOrigin(0.5, 1).setDepth(1)
    this.world.push(pedestal)
    const giftBottom = course.goal.y - PEDESTAL_H
    this.gift.setPosition(pedestalX, giftBottom)
    this.glow.setPosition(pedestalX, giftBottom - GIFT_H / 2)
  }

  update(_time: number, delta: number) {
    if (!this.playing || this.paused || !this.mode || !this.course) return
    const dt = delta / 1000
    this.mode.setInput(this.readInput())
    this.mode.update(dt)
    this.onTick?.(dt)
    const snap = this.mode.read()
    if (snap) this.draw(snap, this.course, this.mode.alpha())
  }

  draw(snap: Snapshot, course: RuntimeCourse, alpha: number) {
    if (!this.hero) return
    if (snap.fails > this.seenFails) this.hurtUntil = snap.time + HURT_SECONDS
    this.seenFails = snap.fails
    const feet = interpolatedFeet(snap, alpha)
    const x = Math.round(feet.x)
    const y = Math.round(feet.y)
    const pose = poseOf(snap, snap.time < this.hurtUntil)
    this.hero.setTexture(pose.key, pose.frame)
    this.hero.setPosition(x, y)
    this.hero.setFlipX(snap.facing < 0)
    const camX = Math.round(Math.min(Math.max(0, x - 90), Math.max(0, course.width - 180)))
    this.cameras.main.setScroll(camX, 0)
    this.sky.tilePositionX = Math.round(camX * 0.12)
    this.mountains.tilePositionX = Math.round(camX * 0.28)
    this.forest.tilePositionX = Math.round(camX * 0.55)
    for (const [id, sprite] of this.coins) sprite.setVisible(!snap.collected.includes(id))
    const wave = Math.floor(snap.time * 2) % 2 === 0 ? 'flag1' : 'flag2'
    for (const flag of this.flags) flag.setFrame(wave)
    for (const platform of moversOf(course, 'solid')) {
      const tile = this.platforms.get(platform.id)
      if (!tile) continue
      tile.x = oscillatorX(platform, snap.time)
    }
    for (const walker of moversOf(course, 'stompable')) {
      const sprite = this.walkers.get(walker.id)
      if (!sprite) continue
      const stomped = snap.stomped.includes(walker.id)
      sprite.setVisible(!stomped)
      if (stomped) continue
      const wx = oscillatorX(walker, snap.time)
      const hop = Math.floor(snap.time * 6) % 2
      sprite.setPosition(Math.round(wx + walker.w / 2), walker.y + walker.h - hop)
      sprite.setFlipX(oscillatorFacing(walker, snap.time) < 0)
    }
    const glow = glowAlpha(snap.time, this.reduceFlash)
    const atPedestal = snap.x > course.goal.x - 40
    const beat = this.revealBeat
    const t = this.beatTime
    const giftX = course.goal.x + PEDESTAL_DX
    const giftY = course.goal.y - PEDESTAL_H - GIFT_H / 2
    const boxed = beat === null || beat === 'prompt' || beat === 'shake'
    // Beat 1: the box wobbles harder as it is about to open.
    const wobble = beat === 'shake' ? Math.round(Math.sin(t * 38) * (1 + (2 * t) / BEAT_SECONDS.shake)) : 0
    this.gift.setVisible(boxed)
    this.gift.setX(giftX + wobble)
    this.glow.setVisible(boxed)
    this.glow.setAlpha(glow)
    this.item.setVisible(this.giftOpen)
    if (this.giftOpen) this.item.setPosition(x, y - 30)
    // Beat 2: one soft flash, or with flashing reduced only sparks drifting out.
    const burst = beat === 'burst' ? Math.min(1, t / BEAT_SECONDS.burst) : -1
    this.flash.setVisible(burst >= 0 && !this.reduceFlash)
    if (burst >= 0) this.flash.setAlpha(0.7 * (1 - burst))
    for (const [i, ray] of this.rays.entries()) {
      const show = !this.reduceFlash && (atPedestal || burst >= 0)
      ray.setVisible(show)
      ray.setPosition(giftX, giftY)
      ray.setAlpha(show ? (burst >= 0 ? 0.8 * (1 - burst) : glow * 0.55) : 0)
      ray.setScale(burst >= 0 ? 1 + burst : 1)
      ray.setAngle(-24 + i * 24 + Math.sin(snap.time * 1.1 + i) * 6)
    }
    for (const [i, spark] of this.sparks.entries()) {
      if (burst >= 0) {
        const angle = (i / this.sparks.length) * Math.PI * 2
        const r = 6 + burst * 40
        spark.setVisible(true)
        spark.setPosition(Math.round(giftX + Math.cos(angle) * r), Math.round(giftY + Math.sin(angle) * r))
        spark.setAlpha(1 - burst * 0.8)
        continue
      }
      const show = !this.reduceFlash && atPedestal && i < 4
      const st = snap.time * 1.4 + i * 1.7
      spark.setVisible(show)
      spark.setPosition(giftX + Math.cos(st) * 14, giftY + Math.sin(st * 1.3) * 10)
      spark.setAlpha(show ? 0.4 + 0.4 * glow : 0)
    }
  }
}
