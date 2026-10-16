import {
  ANIM_INDEX,
  GIFT_ITEMS,
  HERO_PARTS,
  heroPart,
  movingPlatformX,
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

const EMPTY: InputState = { left: false, right: false, jump: false, jumpPressed: false, openPressed: false }

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
  private world: Phaser.GameObjects.GameObject[] = []
  private coins = new Map<string, Phaser.GameObjects.Image>()
  private platforms = new Map<string, Phaser.GameObjects.TileSprite>()

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
    this.load.image('sky', '/assets/parallax/sky.png')
    this.load.image('hills', '/assets/parallax/hills.png')
    this.load.image('grass', '/assets/parallax/grass.png')
  }

  create() {
    this.cameras.main.setBackgroundColor('#8fadc0')
    this.cameras.main.roundPixels = true
    this.sky = this.add.tileSprite(0, 0, 180, 320, 'sky').setOrigin(0, 0).setScrollFactor(0).setDepth(-3)
    this.hills = this.add.tileSprite(0, 168, 180, 64, 'hills').setOrigin(0, 0).setScrollFactor(0).setDepth(-2)
    this.grass = this.add.tileSprite(0, 248, 180, 32, 'grass').setOrigin(0, 0).setScrollFactor(0).setDepth(-1)
    this.box = this.add.image(0, 0, 'gift-box').setOrigin(0.5, 1).setDepth(5)
    this.item = this.add.image(0, 0, 'item-scarf').setOrigin(0.5, 1).setDepth(9).setVisible(false)
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
    const sheet = this.textures.addCanvas(key, canvas)
    if (!sheet) return part.id
    this.textures.addSpriteSheet('', sheet, { frameWidth: 16, frameHeight: 24 })
    return key
  }

  private applyLook() {
    const skin = this.partKey(this.look.skinId, this.look.colors?.skin)
    const outfit = this.partKey(this.look.outfitId, this.look.colors?.outfit)
    const hair = this.partKey(this.look.hairId, this.look.colors?.hair)
    const make = (key: string, depth: number) => {
      const sprite = this.add.sprite(40, 272, key, 0).setOrigin(0.5, 1).setDepth(depth)
      return sprite
    }
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
    for (const platform of course.moving) {
      const tile = this.add.tileSprite(platform.originX, platform.y, platform.w, platform.h, 'platform').setOrigin(0, 0).setDepth(2)
      this.platforms.set(platform.id, tile)
      this.world.push(tile)
    }
    for (const coin of course.coins) {
      const sprite = this.add.image(coin.x, coin.y, 'token').setOrigin(0, 0).setDepth(3)
      this.coins.set(coin.id, sprite)
      this.world.push(sprite)
    }
    const pedestal = this.add.image(course.goal.x, course.goal.y, 'pedestal').setOrigin(0.5, 1).setDepth(1)
    this.world.push(pedestal)
    this.box.setPosition(course.goal.x, course.goal.y - 18)
  }

  update(_time: number, delta: number) {
    if (!this.playing || !this.mode) return
    const dt = delta / 1000
    this.mode.setInput(this.readInput())
    this.mode.update(dt)
    this.mode.render()
    this.onTick?.(dt)
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
    this.grass.tilePositionX = camX * 0.5
    for (const [id, sprite] of this.coins) sprite.setVisible(!snap.collected.includes(id))
    for (const platform of course.moving) {
      const tile = this.platforms.get(platform.id)
      if (!tile) continue
      tile.x = movingPlatformX(platform, snap.time)
    }
    const open = snap.goalBeat === 'open'
    this.box.setVisible(!open)
    this.box.setAlpha(glowAlpha(snap.time, this.reduceFlash))
    this.item.setVisible(open)
    if (open) this.item.setPosition(x, y - 26)
  }
}
