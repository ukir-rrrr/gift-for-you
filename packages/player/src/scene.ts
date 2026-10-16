import {
  ANIM_INDEX,
  GIFT_ITEMS,
  HERO_PARTS,
  WALKER_H,
  WALKER_W,
  heroPart,
  moversOf,
  oscillatorFacing,
  oscillatorX,
  type RuntimeCourse,
} from '@gfy/catalog'
import Phaser from 'phaser'
import { glowAlpha } from './fx'
import type { PlatformerMode } from './mode'
import { interpolatedFeet, type InputState, type Snapshot } from './sim/platformer'

export type HeroLook = {
  hairId: string
  skinId: string
  outfitId: string
  colors?: { hair?: string; skin?: string; outfit?: string }
}

const EMPTY: InputState = { left: false, right: false, jump: false, jumpPressed: false }

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function frameOf(snap: Snapshot): number {
  if (snap.phase === 'walk') {
    const row = snap.walkFrames === 8 ? ANIM_INDEX.walk8 : ANIM_INDEX.walk6
    return row[snap.walkFrame] ?? row[0]
  }
  if (snap.phase === 'jump-up') return ANIM_INDEX['jump-up'][0]
  if (snap.phase === 'jump-apex') return ANIM_INDEX['jump-apex'][0]
  if (snap.phase === 'jump-fall') return ANIM_INDEX['jump-fall'][0]
  if (snap.phase === 'land') return ANIM_INDEX.land[0]
  if (snap.phase === 'skid') return ANIM_INDEX.turn[0]
  const blink = Math.floor(snap.time * 1.5) % 4 === 0 ? 1 : 0
  return ANIM_INDEX.idle[blink]
}

export class PlayScene extends Phaser.Scene {
  mode: PlatformerMode | null = null
  course: RuntimeCourse | null = null
  look: HeroLook = { hairId: 'hair-bob', skinId: 'skin-light', outfitId: 'outfit-shirt' }
  playing = false
  reduceFlash = false
  giftOpen = false
  giftItemId = 'scarf'
  readInput: () => InputState = () => EMPTY
  onTick: ((dt: number) => void) | null = null

  private skin!: Phaser.GameObjects.Sprite
  private outfit!: Phaser.GameObjects.Sprite
  private hair!: Phaser.GameObjects.Sprite
  private box!: Phaser.GameObjects.Image
  private item!: Phaser.GameObjects.Image
  private sky!: Phaser.GameObjects.TileSprite
  private hills!: Phaser.GameObjects.TileSprite
  private grass!: Phaser.GameObjects.TileSprite
  private rays: Phaser.GameObjects.Image[] = []
  private sparks: Phaser.GameObjects.Image[] = []
  private world: Phaser.GameObjects.GameObject[] = []
  private coins = new Map<string, Phaser.GameObjects.Image>()
  private platforms = new Map<string, Phaser.GameObjects.TileSprite>()
  private walkers = new Map<string, Phaser.GameObjects.Sprite>()

  constructor() {
    super('play')
  }

  preload() {
    for (const part of HERO_PARTS) this.load.image(part.id, `/assets/${part.file}`)
    for (const item of GIFT_ITEMS) this.load.image(`item-${item.id}`, `/assets/items/${item.id}.png`)
    this.load.image('ground', '/assets/tiles/ground.png')
    this.load.image('thorn', '/assets/tiles/thorn.png')
    this.load.image('platform', '/assets/tiles/platform.png')
    this.load.image('pedestal', '/assets/tiles/pedestal.png')
    this.load.image('gift-box', '/assets/tiles/gift-box.png')
    this.load.image('token', '/assets/fx/token.png')
    this.load.image('cairn', '/assets/tiles/cairn.png')
    this.load.image('spark', '/assets/fx/spark.png')
    this.load.image('ray', '/assets/fx/ray.png')
    this.load.spritesheet('walker', '/assets/tiles/walker.png', { frameWidth: WALKER_W, frameHeight: WALKER_H })
    this.load.image('sky', '/assets/parallax/sky.png')
    this.load.image('hills', '/assets/parallax/hills.png')
    this.load.image('grass', '/assets/parallax/grass.png')
  }

  create() {
    this.cameras.main.setBackgroundColor('#8fadc0')
    this.cameras.main.roundPixels = true
    this.sky = this.add.tileSprite(0, 0, 180, 320, 'sky').setOrigin(0, 0).setScrollFactor(0).setDepth(-3)
    this.hills = this.add.tileSprite(0, 152, 180, 80, 'hills').setOrigin(0, 0).setScrollFactor(0).setDepth(-2)
    this.grass = this.add.tileSprite(0, 232, 180, 48, 'grass').setOrigin(0, 0).setScrollFactor(0).setDepth(-1)
    this.box = this.add.image(0, 0, 'gift-box').setOrigin(0.5, 1).setDepth(5)
    this.item = this.add.image(0, 0, 'item-scarf').setOrigin(0.5, 1).setDepth(9).setVisible(false)
    this.rays = [0, 1, 2].map((i) => this.add.image(0, 0, 'ray').setOrigin(0.5, 1).setDepth(4).setAngle(-20 + i * 20))
    this.sparks = [0, 1, 2, 3].map(() => this.add.image(0, 0, 'spark').setDepth(10))
    this.game.events.emit('gfy-ready')
  }

  mount(mode: PlatformerMode, course: RuntimeCourse, look: HeroLook, giftItemId: string) {
    this.mode = mode
    this.course = course
    this.look = look
    this.giftItemId = giftItemId
    this.rebuild()
    this.applyLook()
    this.item.setTexture(`item-${giftItemId}`)
  }

  private partKey(id: string, override?: string) {
    const part = heroPart(id)
    const next = override?.toLowerCase()
    const key = `sheet-${part.id}-${next ?? part.fill}`
    if (this.textures.exists(key)) return key
    const source = this.textures.get(part.id).getSourceImage() as HTMLImageElement
    const canvas = document.createElement('canvas')
    canvas.width = source.width
    canvas.height = source.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return part.id
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(source, 0, 0)
    if (next && next !== part.fill) {
      const from = rgb(part.fill)
      const to = rgb(next)
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
      for (let i = 0; i < image.data.length; i += 4) {
        if (image.data[i] === from[0] && image.data[i + 1] === from[1] && image.data[i + 2] === from[2] && image.data[i + 3] > 0) {
          image.data[i] = to[0]
          image.data[i + 1] = to[1]
          image.data[i + 2] = to[2]
        }
      }
      ctx.putImageData(image, 0, 0)
    }
    const texture = this.textures.addCanvas(key, canvas)
    if (!texture) return part.id
    const frames = Math.floor(canvas.width / 16)
    for (let i = 0; i < frames; i++) texture.add(String(i), 0, i * 16, 0, 16, 24)
    return key
  }

  private applyLook() {
    const skin = this.partKey(this.look.skinId, this.look.colors?.skin)
    const outfit = this.partKey(this.look.outfitId, this.look.colors?.outfit)
    const hair = this.partKey(this.look.hairId, this.look.colors?.hair)
    const make = (key: string, depth: number) => this.add.sprite(40, 272, key, 0).setOrigin(0.5, 1).setDepth(depth)
    this.skin?.destroy()
    this.outfit?.destroy()
    this.hair?.destroy()
    this.skin = make(skin, 6)
    this.outfit = make(outfit, 7)
    this.hair = make(hair, 8)
  }

  private rebuild() {
    for (const object of this.world) object.destroy()
    this.world = []
    this.coins.clear()
    this.platforms.clear()
    this.walkers.clear()
    const course = this.course
    if (!course) return
    for (const solid of course.solids) {
      const tile = this.add.tileSprite(solid.x, solid.y, solid.w, solid.h, 'ground').setOrigin(0, 0).setDepth(0)
      this.world.push(tile)
    }
    for (const hazard of course.hazards) {
      for (let x = hazard.x; x < hazard.x + hazard.w; x += 16) {
        const sprite = this.add.image(x, hazard.y + hazard.h, 'thorn').setOrigin(0, 1).setDepth(2)
        this.world.push(sprite)
      }
    }
    for (const platform of moversOf(course, 'solid')) {
      const tile = this.add.tileSprite(platform.originX, platform.y, platform.w, platform.h, 'platform').setOrigin(0, 0).setDepth(2)
      this.platforms.set(platform.id, tile)
      this.world.push(tile)
    }
    for (const walker of moversOf(course, 'stompable')) {
      const sprite = this.add.sprite(walker.originX, walker.y + walker.h, 'walker', 0).setOrigin(0.5, 1).setDepth(3)
      this.walkers.set(walker.id, sprite)
      this.world.push(sprite)
    }
    for (const coin of course.coins) {
      const sprite = this.add.image(coin.x, coin.y, 'token').setOrigin(0, 0).setDepth(3)
      this.coins.set(coin.id, sprite)
      this.world.push(sprite)
    }
    for (const checkpoint of course.checkpoints) {
      const mark = this.add.image(checkpoint.x, checkpoint.y, 'cairn').setOrigin(0.5, 1).setDepth(1)
      this.world.push(mark)
    }
    const pedestal = this.add.image(course.goal.x, course.goal.y, 'pedestal').setOrigin(0.5, 1).setDepth(1)
    this.world.push(pedestal)
    this.box.setPosition(course.goal.x, course.goal.y - 18)
  }

  update(_time: number, delta: number) {
    if (!this.playing || !this.mode || !this.course) return
    const dt = delta / 1000
    this.mode.setInput(this.readInput())
    this.mode.update(dt)
    this.onTick?.(dt)
    const snap = this.mode.read()
    if (snap) this.draw(snap, this.course, this.mode.alpha())
  }

  draw(snap: Snapshot, course: RuntimeCourse, alpha: number) {
    if (!this.skin) return
    const feet = interpolatedFeet(snap, alpha)
    const x = Math.round(feet.x)
    const y = Math.round(feet.y)
    const frame = frameOf(snap)
    for (const sprite of [this.skin, this.outfit, this.hair]) {
      sprite.setPosition(x, y)
      sprite.setFrame(frame)
      sprite.setFlipX(snap.facing < 0)
    }
    const camX = Math.round(Math.min(Math.max(0, x - 90), Math.max(0, course.width - 180)))
    this.cameras.main.setScroll(camX, 0)
    this.sky.tilePositionX = camX * 0.12
    this.hills.tilePositionX = camX * 0.28
    this.grass.tilePositionX = camX * 0.55
    for (const [id, sprite] of this.coins) sprite.setVisible(!snap.collected.includes(id))
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
      sprite.setPosition(Math.round(wx + walker.w / 2), walker.y + walker.h)
      sprite.setFrame(Math.floor(snap.time * 6) % 2)
      sprite.setFlipX(oscillatorFacing(walker, snap.time) < 0)
    }
    const glow = glowAlpha(snap.time, this.reduceFlash)
    const atPedestal = snap.x > course.goal.x - 40
    this.box.setVisible(!this.giftOpen)
    this.box.setAlpha(glow)
    this.item.setVisible(this.giftOpen)
    if (this.giftOpen) this.item.setPosition(x, y - 26)
    for (const [i, ray] of this.rays.entries()) {
      const show = !this.reduceFlash && atPedestal
      ray.setVisible(show)
      ray.setPosition(course.goal.x, course.goal.y - 18)
      ray.setAlpha(show ? glow * 0.55 : 0)
      ray.setAngle(-24 + i * 24 + Math.sin(snap.time * 1.1 + i) * 6)
    }
    for (const [i, spark] of this.sparks.entries()) {
      const show = !this.reduceFlash && atPedestal
      const t = snap.time * 1.4 + i * 1.7
      spark.setVisible(show)
      spark.setPosition(course.goal.x + Math.cos(t) * 14, course.goal.y - 26 + Math.sin(t * 1.3) * 10)
      spark.setAlpha(show ? 0.4 + 0.4 * glow : 0)
    }
  }
}
