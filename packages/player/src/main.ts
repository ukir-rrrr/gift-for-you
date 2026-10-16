import {
  buildCourse01,
  buildCourseE2E,
  compileCourse,
  presetForDifficulty,
  type RuntimeCoin,
  type RuntimeCourse,
} from '@gfy/catalog'
import { checkEgiftUrl, sanitizeDisplay, type Difficulty } from '@gfy/schema'
import Phaser from 'phaser'
import { Music } from './audio'
import { copy, UNAVAILABLE } from './copy'
import { cuesBetween, loadSettings, saveSettings, type CueView } from './cues'
import { flushQueue, postEvent, type Reveal } from './net'
import { PlatformerMode } from './mode'
import { readFlags, recipientName, giftIdFromLocation } from './route'
import { isPreviewPath, previewSource, resolveGift, waitForPreview, type GiftSource } from './source'
import { integerScale } from './scale'
import { fold, revealBeat, screenOf, showingGift, typedLetter, type SessionPhase } from './phase'
import { VirtualPad, type PadKey } from './pad'
import { PlayScene } from './scene'
import type { AssistChoice, InputState } from './sim/platformer'

// Keyboard and pad keep separate held sets so releasing one never cancels the other.
const keys = { left: false, right: false, jump: false }
const pad = { left: false, right: false, jump: false }
const edge = { jump: false, open: false }

function must<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`missing #${id}`)
  return node as T
}

const POPUP_SECONDS = 2
const REC_OPEN_AFTER = 1.2

function localStore(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function showError() {
  document.body.dataset.screen = screenOf({ kind: 'error' })
  must('title').hidden = true
  const error = must('error')
  error.hidden = false
  must<HTMLParagraphElement>('error-text').textContent = UNAVAILABLE
}

function boot(source: GiftSource) {
  const { share, id, preview } = source
  const beacon = (type: 'opened' | 'goal_reached') => {
    if (!preview) void postEvent(id, type)
  }
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
  const settings = loadSettings(
    { muted: false, reduceFlash: window.matchMedia('(prefers-reduced-motion: reduce)').matches },
    localStore(),
  )
  const music = new Music(settings.muted)
  let walkFrames: 6 | 8 = flags.walk ?? 6
  // Recording mode: no pad or debug chrome, a watermark, no e-gift, and the hero walks on its own.
  const rec = flags.rec || share.options?.recordingModeDefault === true
  let easy = flags.easy || flags.e2e || rec || share.course.assist.easyModeDefault
  let reduceFlash = settings.reduceFlash
  let lastCue: CueView | null = null
  let typedCount = 0
  let session: SessionPhase = { kind: 'title' }
  let goalSent = false
  let beatFor = 0
  let promptFor = 0
  let popupId = ''
  let popupLeft = 0
  let reveal: Reveal | null = null
  let letterFull = ''
  let letterTime = 0
  let letterDone = false
  let egiftReady = false
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
  document.title = title.textContent
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
    document.body.dataset.beat = revealBeat(session) ?? 'none'
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
    const mark = must('watermark')
    mark.hidden = !rec && !preview
    mark.textContent = preview ? copy.previewMark : copy.watermark
    document.body.dataset.preview = preview ? '1' : '0'
    easyButton.textContent = easy ? copy.easyOn : copy.easyOff
    diffButton.textContent = copy.difficulty[difficulty]
    walkButton.textContent = copy.walk(walkFrames)
    muteButton.textContent = music.isMuted ? copy.soundOff : copy.soundOn
    muteButton.setAttribute('aria-pressed', String(music.isMuted))
    flashButton.textContent = reduceFlash ? copy.flashOff : copy.flashOn
    flashButton.setAttribute('aria-pressed', String(reduceFlash))
    document.body.dataset.flash = reduceFlash ? 'reduced' : 'on'
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
    // Restart the pop animation for back-to-back coins.
    memory.classList.remove('pop')
    void memory.offsetWidth
    memory.classList.add('pop')
    message.textContent = sanitizeDisplay(coin.message)
    photo.alt = ''
    photo.dataset.fallback = '0'
    photo.src = source.photoUrl(coin.photoRef)
  }

  photo.addEventListener('error', () => {
    if (photo.dataset.fallback === '1') return
    photo.dataset.fallback = '1'
    photo.src = '/assets/photos/placeholder.png'
  })

  const unlockForm = must<HTMLFormElement>('unlock')
  const unlockInput = must<HTMLInputElement>('unlock-input')
  const unlockError = must<HTMLParagraphElement>('unlock-error')

  function showEgift() {
    const gift = reveal?.egift
    const locked = Boolean(gift?.locked)
    const url = locked ? undefined : gift?.url
    const code = !locked && gift?.kind === 'code' ? gift.code : undefined
    const claim = must<HTMLButtonElement>('btn-egift')
    const codeBox = must<HTMLParagraphElement>('egift-code')
    claim.hidden = rec || !url
    unlockForm.hidden = rec || !locked
    if (!rec && code) {
      codeBox.hidden = false
      codeBox.textContent = `${copy.code} ${sanitizeDisplay(code)}`
    } else {
      codeBox.hidden = true
      codeBox.textContent = ''
    }
  }

  unlockForm.addEventListener('submit', (event) => {
    event.preventDefault()
    const attempt = unlockInput.value.trim()
    if (!attempt || !reveal) return
    unlockError.textContent = ''
    void source.unlock(attempt).then((result) => {
      if (!reveal) return
      if (result.ok) {
        reveal = { ...reveal, egift: result.egift }
        unlockInput.value = ''
        showEgift()
        return
      }
      unlockError.textContent = copy.unlockError[result.reason]
    })
  })

  async function openLetter() {
    if (session.kind !== 'letter') return
    letter.hidden = false
    must('title').hidden = true
    try {
      reveal = await source.reveal()
      letterFull = reveal.letter.body
      letterTime = 0
      letterDone = false
      delete letter.dataset.typed
      letterBody.textContent = ''
      retry.hidden = true
      showEgift()
      // The e-gift waits until the letter has finished typing.
      egiftReady = !rec && Boolean(reveal.egift && (reveal.egift.locked || reveal.egift.url || reveal.egift.code))
      egift.hidden = true
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
    const cueView: CueView = { ...snap, collected: [...snap.collected], stomped: [...snap.stomped] }
    for (const cue of cuesBetween(lastCue, cueView)) music.play(cue)
    lastCue = cueView
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
      popupLeft = POPUP_SECONDS
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
    const beatBefore = revealBeat(prev)
    if (beatBefore && beatBefore !== 'prompt') beatFor += dt
    // In recording mode nobody needs to tap; the gift opens after a short beat at the pedestal.
    const opened = edge.open || (rec && beatBefore === 'prompt' && (promptFor += dt) > REC_OPEN_AFTER)
    edge.open = false
    if (beatBefore !== 'prompt') promptFor = 0
    session = fold(prev, { atGoal: snap.atGoal, assist: snap.assist }, opened, beatFor)
    if (revealBeat(session) !== beatBefore) {
      beatFor = 0
      if (revealBeat(session) === 'burst') music.play('open')
    }
    scene.revealBeat = revealBeat(session)
    scene.beatTime = beatFor
    paint()
    if (session.kind === 'letter' && prev.kind !== 'letter') {
      music.setBgm(false)
      typedCount = 0
      void openLetter()
    }
    if (snap.atGoal && !goalSent) {
      goalSent = true
      beacon('goal_reached')
    }
    if (session.kind === 'letter' && letterFull && !letterDone) {
      letterTime += dt
      const typed = typedLetter(letterFull, letterTime)
      letterBody.textContent = typed.text
      const count = [...typed.text].length
      if (Math.floor(count / 3) > Math.floor(typedCount / 3)) music.play('type')
      typedCount = count
      if (typed.done) {
        letterDone = true
        letter.dataset.typed = '1'
        egift.hidden = !egiftReady
      }
    }
    fit()
  }

  start.addEventListener('click', () => {
    if (session.kind !== 'title' || start.disabled) return
    session = { kind: 'play' }
    applyScreen()
    music.unlock()
    beacon('opened')
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
  function pickAssist(choice: AssistChoice) {
    if (mode.assist() !== 'offered') return
    mode.chooseAssist(choice)
    if (choice === 'easy') easy = true
    applyChrome()
  }
  must('btn-invincible').addEventListener('click', () => pickAssist('invincible'))
  must('btn-float').addEventListener('click', () => pickAssist('float'))
  must('btn-assist-easy').addEventListener('click', () => pickAssist('easy'))
  must('btn-skip').addEventListener('click', () => pickAssist('skip'))
  must('btn-decline').addEventListener('click', () => pickAssist('decline'))
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
    beatFor = 0
    lastCue = null
    music.setBgm(true)
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
  const persist = () => saveSettings({ muted: music.isMuted, reduceFlash }, localStore())
  muteButton.addEventListener('click', () => {
    music.toggle()
    persist()
    applyChrome()
  })
  flashButton.addEventListener('click', () => {
    reduceFlash = !reduceFlash
    persist()
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
    // The creator's preview shows the same confirm screen, but the link goes nowhere.
    if (preview) {
      go.removeAttribute('href')
      go.dataset.preview = '1'
      go.textContent = copy.previewLink
    } else if (check.status !== 'block') {
      go.href = url
      go.textContent = check.status === 'warn' ? copy.openAnyway : copy.openLink
    }
    confirm.hidden = false
  })
  must('confirm-go').addEventListener('click', (event) => {
    if (preview) event.preventDefault()
    confirm.hidden = true
  })
  must('confirm-cancel').addEventListener('click', () => {
    confirm.hidden = true
  })
  // Tapping the letter finishes the typewriter at once.
  letterBody.addEventListener('click', () => {
    if (letterFull) letterTime = Number.MAX_SAFE_INTEGER
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
  // iOS Safari ignores user-scalable=no; block pinch and double-tap zoom while playing only, so the letter can be zoomed.
  const blockZoom = (event: Event) => {
    if (document.body.dataset.screen === 'play') event.preventDefault()
  }
  document.addEventListener('gesturestart', blockZoom)
  document.addEventListener('dblclick', blockZoom)

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return
    const key = event.key.toLowerCase()
    // Space on a focused button (はじめる, タップして開ける, the letter and confirm screens) activates it.
    // The dock toggles keep focus after a click, so there Space still jumps.
    const target = event.target instanceof Element ? event.target : null
    if (key === ' ' && target?.closest('button, a') && !target.closest('#tools')) return
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

  // Only phones and tablets are asked to turn; a wide desktop window just letterboxes the 9:16 frame.
  const coarse = window.matchMedia('(pointer: coarse)')
  const rotate = () => {
    const sideways = coarse.matches && window.innerWidth > window.innerHeight
    must('rotate').hidden = !sideways
    document.body.dataset.rotate = sideways ? '1' : '0'
    scene.paused = sideways
    fit()
  }
  window.addEventListener('resize', rotate)
  window.addEventListener('orientationchange', rotate)
  applyChrome()
  document.body.dataset.screen = 'title'
  rotate()
  if (!preview) void flushQueue()
}

async function start() {
  if (isPreviewPath(window.location.pathname)) {
    const source = previewSource(await waitForPreview())
    if (source) boot(source)
    else showError()
    return
  }
  const giftId = giftIdFromLocation(window.location)
  const source = giftId ? await resolveGift(giftId) : null
  if (source) boot(source)
  else showError()
}

void start()
