import {
  buildCourse01,
  buildCourseE2E,
  compileCourse,
  presetForDifficulty,
  type RuntimeCoin,
  type RuntimeCourse,
} from '@gfy/catalog'
import { checkEgiftUrl, sanitizeDisplay, type ShareJson } from '@gfy/schema'
import Phaser from 'phaser'
import { Music } from './audio'
import { copy, UNAVAILABLE } from './copy'
import { fetchReveal, postEvent, type Reveal } from './net'
import { PlatformerMode } from './mode'
import { loadGift, readFlags, recipientName, giftIdFromLocation } from './route'
import { integerScale } from './scale'
import { PlayScene, type HeroLook } from './scene'
import type { InputState } from './sim/platformer'

const held = { left: false, right: false, jump: false }
const edge = { jump: false, open: false }

function must<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`missing #${id}`)
  return node as T
}

function showError() {
  document.body.dataset.screen = 'error'
  must('title').hidden = true
  const error = must('error')
  error.hidden = false
  must<HTMLParagraphElement>('error-text').textContent = UNAVAILABLE
}

function bindHold(id: string, set: (down: boolean) => void) {
  const node = must<HTMLButtonElement>(id)
  const down = (event: PointerEvent) => {
    event.preventDefault()
    node.setPointerCapture(event.pointerId)
    set(true)
  }
  node.addEventListener('pointerdown', down)
  node.addEventListener('pointerup', () => set(false))
  node.addEventListener('pointercancel', () => set(false))
  node.addEventListener('pointerleave', () => set(false))
}

function boot(share: ShareJson, id: string) {
  const flags = readFlags(location.search)
  const difficulty = flags.difficulty ?? share.course.difficulty
  const coins = share.memoryCoins.map((coin) => ({
    order: coin.order,
    photoRef: coin.photoRef,
    message: sanitizeDisplay(coin.message),
  }))
  const course = compileCourse(flags.e2e ? buildCourseE2E() : buildCourse01(), presetForDifficulty(difficulty), coins)
  const look: HeroLook = {
    hairId: share.hero?.hairId ?? 'hair-bob',
    skinId: share.hero?.skinId ?? 'skin-light',
    outfitId: share.hero?.outfitId ?? 'outfit-shirt',
    colors: share.hero?.colors,
  }
  const scene = new PlayScene()
  const mode = new PlatformerMode({
    draw: (snap, world, alpha) => scene.draw(snap, world, alpha),
  })
  const music = new Music()
  let walkFrames: 6 | 8 = flags.walk ?? 6
  let easy = flags.easy || flags.e2e || share.course.assist.easyModeDefault
  let reduceFlash = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const rec = flags.rec || share.options?.recordingModeDefault === true
  let started = false
  let goalSent = false
  let openFor = 0
  let letterOn = false
  let popupId = ''
  let popupLeft = 0
  let reveal: Reveal | null = null
  let letterFull = ''
  let letterShown = 0

  mode.load(course, { easy, walkFrames, assistAfter: share.course.assist.autoAssistAfterFails })
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    width: 180,
    height: 320,
    parent: 'frame',
    backgroundColor: '#8fadc0',
    pixelArt: true,
    roundPixels: true,
    banner: false,
    audio: { noAudio: true },
    scale: { mode: Phaser.Scale.NONE },
    scene: [scene],
  })

  const title = must<HTMLHeadingElement>('title-text')
  title.textContent = copy.title(recipientName(share))
  const start = must<HTMLButtonElement>('btn-start')
  game.events.once('gfy-ready', () => {
    scene.mount(mode, course, look, share.goal.giftItem.itemId)
    scene.reduceFlash = reduceFlash
    start.disabled = false
    start.textContent = copy.start
    fit()
  })

  scene.readInput = (): InputState => {
    const input = {
      left: held.left,
      right: held.right,
      jump: held.jump,
      jumpPressed: edge.jump,
      openPressed: edge.open,
    }
    edge.jump = false
    edge.open = false
    return input
  }

  const section = must<HTMLParagraphElement>('section')
  const memory = must<HTMLDivElement>('memory')
  const photo = must<HTMLImageElement>('memory-photo')
  const message = must<HTMLParagraphElement>('memory-text')
  const prompt = must<HTMLButtonElement>('prompt')
  const assist = must<HTMLDivElement>('assist')
  const heldBox = must<HTMLDivElement>('held')
  const heldIcon = must<HTMLImageElement>('held-icon')
  const heldLabel = must<HTMLParagraphElement>('held-label')
  const letter = must<HTMLDivElement>('letter')
  const letterBody = must<HTMLDivElement>('letter-body')
  const retry = must<HTMLButtonElement>('btn-retry')
  const egift = must<HTMLDivElement>('egift')
  const confirm = must<HTMLDivElement>('confirm')
  const walkButton = must<HTMLButtonElement>('btn-walk')
  const easyButton = must<HTMLButtonElement>('btn-easy')
  const muteButton = must<HTMLButtonElement>('btn-mute')
  const flashButton = must<HTMLButtonElement>('btn-flash')

  function applyChrome() {
    document.body.dataset.rec = rec ? '1' : '0'
    must('watermark').hidden = !rec
    easyButton.textContent = easy ? copy.easyOn : copy.easyOff
    walkButton.textContent = copy.walk(walkFrames)
    muteButton.textContent = music.isMuted ? copy.soundOff : copy.soundOn
    flashButton.textContent = reduceFlash ? copy.flashOff : copy.flashOn
    scene.reduceFlash = reduceFlash
  }

  function fit() {
    const canvas = game.canvas
    if (!canvas) return
    const dock = must('dock')
    const dockHidden = getComputedStyle(dock).display === 'none'
    const scale = integerScale(window.innerWidth, window.innerHeight, dockHidden ? 0 : dock.offsetHeight)
    const frame = must('frame')
    frame.style.width = `${180 * scale}px`
    frame.style.height = `${320 * scale}px`
    canvas.style.width = frame.style.width
    canvas.style.height = frame.style.height
  }

  function coinById(world: RuntimeCourse, coinId: string): RuntimeCoin | undefined {
    return world.coins.find((coin) => coin.id === coinId)
  }

  function showMemory(coin: RuntimeCoin) {
    memory.hidden = false
    message.textContent = sanitizeDisplay(coin.message)
    photo.alt = ''
    photo.dataset.fallback = '0'
    photo.src = `/assets/photos/${coin.photoRef}.png`
  }

  photo.addEventListener('error', () => {
    if (photo.dataset.fallback === '1') return
    photo.dataset.fallback = '1'
    photo.src = '/assets/photos/placeholder.png'
  })

  async function openLetter() {
    if (letterOn) return
    letterOn = true
    document.body.dataset.screen = 'letter'
    letter.hidden = false
    must('title').hidden = true
    try {
      reveal = await fetchReveal(id)
      letterFull = reveal.letter.body
      letterShown = 0
      letterBody.textContent = ''
      retry.hidden = true
      const url = reveal.egift?.url
      egift.hidden = rec || !url
    } catch {
      retry.hidden = false
      egift.hidden = true
    }
    fit()
  }

  scene.onTick = (dt) => {
    music.update(dt)
    const snap = mode.read()
    if (!snap) return
    section.replaceChildren()
    const chip = document.createElement('span')
    chip.textContent = snap.sectionName
    section.append(chip)
    const current = snap.popup[0]
    if (!current) {
      memory.hidden = true
      popupId = ''
    } else if (current !== popupId) {
      popupId = current
      popupLeft = 1.5
      const coin = coinById(course, current)
      if (coin) showMemory(coin)
    } else {
      popupLeft -= dt
      if (popupLeft <= 0) {
        mode.dismissPopup()
        popupId = ''
      }
    }
    assist.hidden = snap.assist !== 'offered'
    prompt.hidden = snap.goalBeat !== 'hold'
    const opened = snap.goalBeat === 'open'
    heldBox.hidden = !opened || letterOn
    if (opened) {
      heldIcon.src = `/assets/items/${share.goal.giftItem.itemId}.png`
      heldLabel.textContent = sanitizeDisplay(share.goal.giftItem.label)
      openFor += dt
      if (openFor > 1.3) void openLetter()
    }
    if (snap.goalBeat !== 'none' && !goalSent) {
      goalSent = true
      void postEvent(id, 'goal_reached')
    }
    if (letterOn && letterFull) {
      letterShown += dt * 28
      letterBody.textContent = [...letterFull].slice(0, Math.floor(letterShown)).join('')
    }
    fit()
  }

  start.addEventListener('click', () => {
    if (started || start.disabled) return
    started = true
    music.unlock()
    void postEvent(id, 'opened')
    document.body.dataset.screen = 'play'
    must('title').hidden = true
    scene.playing = true
    applyChrome()
    fit()
  })

  prompt.addEventListener('click', () => {
    edge.open = true
  })
  memory.addEventListener('pointerdown', () => {
    mode.dismissPopup()
    popupId = ''
    memory.hidden = true
  })
  must('btn-invincible').addEventListener('click', () => mode.chooseAssist('invincible'))
  must('btn-float').addEventListener('click', () => mode.chooseAssist('float'))
  must('btn-skip').addEventListener('click', () => mode.chooseAssist('skip'))
  easyButton.addEventListener('click', () => {
    easy = !easy
    mode.setEasy(easy)
    applyChrome()
  })
  walkButton.addEventListener('click', () => {
    walkFrames = walkFrames === 6 ? 8 : 6
    mode.setWalkFrames(walkFrames)
    applyChrome()
  })
  muteButton.addEventListener('click', () => {
    music.toggle()
    applyChrome()
  })
  flashButton.addEventListener('click', () => {
    reduceFlash = !reduceFlash
    applyChrome()
  })
  must('btn-egift').addEventListener('click', () => {
    const url = reveal?.egift?.url
    if (!url || rec) return
    const check = checkEgiftUrl(url)
    const domain = must<HTMLParagraphElement>('confirm-domain')
    const warn = must<HTMLParagraphElement>('confirm-warn')
    const block = must<HTMLParagraphElement>('confirm-block')
    const go = must<HTMLAnchorElement>('confirm-go')
    domain.textContent = check.domain || url
    warn.hidden = check.status !== 'warn'
    block.hidden = check.status !== 'block'
    warn.textContent = copy.warn
    block.textContent = copy.blocked
    go.hidden = check.status === 'block'
    go.rel = 'noopener noreferrer'
    go.target = '_blank'
    if (check.status !== 'block') {
      go.href = url
      go.textContent = check.status === 'warn' ? copy.openAnyway : copy.openLink
    }
    confirm.hidden = false
  })
  must('confirm-cancel').addEventListener('click', () => {
    confirm.hidden = true
  })
  retry.addEventListener('click', () => {
    letterOn = false
    void openLetter()
  })

  bindHold('btn-left', (down) => {
    held.left = down
  })
  bindHold('btn-right', (down) => {
    held.right = down
  })
  bindHold('btn-jump', (down) => {
    if (down && mode.read()?.goalBeat === 'hold') edge.open = true
    else {
      held.jump = down
      if (down) edge.jump = true
    }
  })

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return
    const key = event.key.toLowerCase()
    if (key === 'arrowleft' || key === 'a') held.left = true
    if (key === 'arrowright' || key === 'd') held.right = true
    if (key === 'arrowup' || key === 'w' || key === ' ') {
      event.preventDefault()
      if (mode.read()?.goalBeat === 'hold') edge.open = true
      else {
        held.jump = true
        edge.jump = true
      }
    }
    if (key === 'c') {
      walkFrames = walkFrames === 6 ? 8 : 6
      mode.setWalkFrames(walkFrames)
      applyChrome()
    }
  })
  window.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase()
    if (key === 'arrowleft' || key === 'a') held.left = false
    if (key === 'arrowright' || key === 'd') held.right = false
    if (key === 'arrowup' || key === 'w' || key === ' ') held.jump = false
  })

  const rotate = () => {
    must('rotate').hidden = window.innerWidth <= window.innerHeight
    fit()
  }
  window.addEventListener('resize', rotate)
  window.addEventListener('orientationchange', rotate)
  applyChrome()
  document.body.dataset.screen = 'title'
  rotate()
}

const giftId = giftIdFromLocation(window.location)
if (!giftId) showError()
else {
  const gift = loadGift(giftId)
  if (!gift.ok) showError()
  else boot(gift.share, gift.id)
}
