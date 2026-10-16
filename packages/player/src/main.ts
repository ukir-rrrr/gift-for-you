import {
  buildCourse01,
  buildCourseE2E,
  compileCourse,
  presetForDifficulty,
  type RuntimeCoin,
  type RuntimeCourse,
} from '@gfy/catalog'
import { checkEgiftUrl, sanitizeDisplay, type Difficulty, type ShareJson } from '@gfy/schema'
import Phaser from 'phaser'
import { Music } from './audio'
import { copy, UNAVAILABLE } from './copy'
import { fetchReveal, flushQueue, postEvent, type Reveal } from './net'
import { PlatformerMode } from './mode'
import { loadGift, readFlags, recipientName, giftIdFromLocation } from './route'
import { integerScale } from './scale'
import { fold, screenOf, showingGift, type SessionPhase } from './phase'
import { VirtualPad, type PadKey } from './pad'
import { PlayScene } from './scene'
import type { InputState } from './sim/platformer'

// Keyboard and pad keep separate held sets so releasing one never cancels the other.
const keys = { left: false, right: false, jump: false }
const pad = { left: false, right: false, jump: false }
const edge = { jump: false, open: false }

function must<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`missing #${id}`)
  return node as T
}

function showError() {
  document.body.dataset.screen = screenOf({ kind: 'error' })
  must('title').hidden = true
  const error = must('error')
  error.hidden = false
  must<HTMLParagraphElement>('error-text').textContent = UNAVAILABLE
}

function boot(share: ShareJson, id: string) {
  const flags = readFlags(location.search)
  const diffs: Difficulty[] = ['easy', 'normal', 'hard']
  let difficulty: Difficulty = flags.difficulty ?? share.course.difficulty
  const coins = share.memoryCoins.map((coin) => ({
    order: coin.order,
    photoRef: coin.photoRef,
    message: sanitizeDisplay(coin.message),
  }))
  const template = flags.e2e ? buildCourseE2E() : buildCourse01()
  let course = compileCourse(template, presetForDifficulty(difficulty), coins)
  const scene = new PlayScene()
  const mode = new PlatformerMode()
  const music = new Music()
  let walkFrames: 6 | 8 = flags.walk ?? 6
  let easy = flags.easy || flags.e2e || share.course.assist.easyModeDefault
  let reduceFlash = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const rec = flags.rec || share.options?.recordingModeDefault === true
  let session: SessionPhase = { kind: 'title' }
  let goalSent = false
  let openFor = 0
  let popupId = ''
  let popupLeft = 0
  let reveal: Reveal | null = null
  let letterFull = ''
  let letterShown = 0
  const assistAfter = share.course.assist.autoAssistAfterFails

  mode.load(course, { easy, walkFrames, assistAfter })
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    width: 180,
    height: 320,
    parent: 'frame',
    backgroundColor: '#70a8e0',
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
    scene.mount(mode, course, share.goal.giftItem.itemId)
    scene.reduceFlash = reduceFlash
    start.disabled = false
    start.textContent = copy.start
    fit()
  })

  scene.readInput = (): InputState => {
    const input = {
      left: keys.left || pad.left,
      right: keys.right || pad.right,
      jump: keys.jump || pad.jump,
      jumpPressed: edge.jump,
    }
    edge.jump = false
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
  const diffButton = must<HTMLButtonElement>('btn-diff')
  const easyButton = must<HTMLButtonElement>('btn-easy')
  const muteButton = must<HTMLButtonElement>('btn-mute')
  const flashButton = must<HTMLButtonElement>('btn-flash')

  function applyScreen() {
    document.body.dataset.screen = screenOf(session)
    must('title').hidden = session.kind !== 'title'
    must('letter').hidden = session.kind !== 'letter'
    must('error').hidden = session.kind !== 'error'
  }

  function paint() {
    applyScreen()
    assist.hidden = session.kind !== 'assist'
    prompt.hidden = !(session.kind === 'reveal' && session.beat === 'prompt')
    const gift = showingGift(session)
    heldBox.hidden = !gift
    scene.giftOpen = gift
    if (gift) {
      heldIcon.src = `/assets/items/${share.goal.giftItem.itemId}.png`
      heldLabel.textContent = sanitizeDisplay(share.goal.giftItem.label)
    }
  }

  function applyChrome() {
    document.body.dataset.rec = rec ? '1' : '0'
    must('watermark').hidden = !rec
    easyButton.textContent = easy ? copy.easyOn : copy.easyOff
    diffButton.textContent = copy.difficulty[difficulty]
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
    if (session.kind !== 'letter') return
    letter.hidden = false
    must('title').hidden = true
    try {
      reveal = await fetchReveal(id)
      letterFull = reveal.letter.body
      letterShown = 0
      letterBody.textContent = ''
      retry.hidden = true
      const url = reveal.egift?.url
      const code = reveal.egift?.kind === 'code' ? reveal.egift.code : undefined
      const claim = must<HTMLButtonElement>('btn-egift')
      const codeBox = must<HTMLParagraphElement>('egift-code')
      claim.hidden = rec || !url
      if (!rec && code) {
        codeBox.hidden = false
        codeBox.textContent = `${copy.code} ${sanitizeDisplay(code)}`
      } else {
        codeBox.hidden = true
        codeBox.textContent = ''
      }
      egift.hidden = rec || (!url && !code)
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
    const prev = session
    if (prev.kind === 'reveal' && prev.beat === 'show') openFor += dt
    else openFor = 0
    const opened = edge.open
    edge.open = false
    session = fold(prev, { atGoal: snap.atGoal, assist: snap.assist }, opened, openFor)
    paint()
    if (session.kind === 'letter' && prev.kind !== 'letter') void openLetter()
    if (snap.atGoal && !goalSent) {
      goalSent = true
      void postEvent(id, 'goal_reached')
    }
    if (session.kind === 'letter' && letterFull) {
      letterShown += dt * 28
      letterBody.textContent = [...letterFull].slice(0, Math.floor(letterShown)).join('')
    }
    fit()
  }

  start.addEventListener('click', () => {
    if (session.kind !== 'title' || start.disabled) return
    session = { kind: 'play' }
    applyScreen()
    music.unlock()
    void postEvent(id, 'opened')
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
  function pickAssist(choice: 'invincible' | 'float' | 'skip') {
    mode.chooseAssist(choice)
  }
  must('btn-invincible').addEventListener('click', () => pickAssist('invincible'))
  must('btn-float').addEventListener('click', () => pickAssist('float'))
  must('btn-skip').addEventListener('click', () => pickAssist('skip'))
  easyButton.addEventListener('click', () => {
    easy = !easy
    mode.setEasy(easy)
    applyChrome()
  })
  function reloadCourse(next: Difficulty) {
    difficulty = next
    course = compileCourse(template, presetForDifficulty(difficulty), coins)
    mode.load(course, { easy, walkFrames, assistAfter })
    scene.mount(mode, course, share.goal.giftItem.itemId)
    goalSent = false
    openFor = 0
    popupId = ''
    popupLeft = 0
    memory.hidden = true
    if (session.kind !== 'title' && session.kind !== 'error') session = { kind: 'play' }
    scene.playing = session.kind === 'play'
    paint()
    applyChrome()
  }

  diffButton.addEventListener('click', () => {
    reloadCourse(diffs[(diffs.indexOf(difficulty) + 1) % diffs.length])
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
    void openLetter()
  })

  function press(source: Record<PadKey, boolean>, key: PadKey, down: boolean) {
    if (key === 'jump' && down && mode.read()?.atGoal) {
      edge.open = true
      return
    }
    const rising = down && !keys[key] && !pad[key]
    source[key] = down
    if (key === 'jump' && rising) edge.jump = true
  }

  document.body.dataset.pad = 'idle'
  new VirtualPad(must('pad'), (key, down) => {
    press(pad, key, down)
    const active = (['left', 'right', 'jump'] as const).filter((name) => pad[name])
    document.body.dataset.pad = active.length ? active.join(' ') : 'idle'
  })
  // iOS Safari ignores user-scalable=no; block pinch and double-tap zoom while playing.
  document.addEventListener('gesturestart', (event) => event.preventDefault())
  document.addEventListener('dblclick', (event) => event.preventDefault())

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return
    const key = event.key.toLowerCase()
    if (key === 'arrowleft' || key === 'a') press(keys, 'left', true)
    if (key === 'arrowright' || key === 'd') press(keys, 'right', true)
    if (key === 'arrowup' || key === 'w' || key === ' ') {
      event.preventDefault()
      press(keys, 'jump', true)
    }
    if (key === 'c') {
      walkFrames = walkFrames === 6 ? 8 : 6
      mode.setWalkFrames(walkFrames)
      applyChrome()
    }
  })
  window.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase()
    if (key === 'arrowleft' || key === 'a') press(keys, 'left', false)
    if (key === 'arrowright' || key === 'd') press(keys, 'right', false)
    if (key === 'arrowup' || key === 'w' || key === ' ') press(keys, 'jump', false)
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
  void flushQueue()
}

const giftId = giftIdFromLocation(window.location)
if (!giftId) showError()
else {
  const gift = loadGift(giftId)
  if (!gift.ok) showError()
  else boot(gift.share, gift.id)
}
