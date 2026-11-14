import { useContext, useEffect, useRef, useState } from 'react'
import Phaser from 'phaser'
import { LocalGraphicsContext } from './local-graphics.ts'
import { isTerrain, terrains } from './data.ts'
import type { Point, Terrain } from './data.ts'
import { facingBetween, key, validCell } from './combat.ts'
import type { BattleEvent, BattleImpact, Facing, Unit } from './combat.ts'
import { roles, troopClasses, troopClassFor } from './unit-classes.ts'

const TILE = 64
const STEP_MS = 200
const IMPACT_MS = 680
const HIT_MS = 320
const FRAME_SIZE = 48
const WALK_FRAMES: Record<Facing, readonly number[]> = {
  down: [0, 1, 6, 1],
  up: [2, 3, 7, 3],
  left: [4, 5, 8, 5],
  right: [4, 5, 8, 5],
}
const ATTACK_START: Record<Facing, number> = { down: 0, up: 4, left: 8, right: 8 }
const eventDuration = (event: BattleEvent) => 'move' in event ? (event.move.path.length - 1) * STEP_MS : 'turn' in event ? 900 : IMPACT_MS
const terrainColors: Record<(typeof terrains)[Terrain]['appearance'], [number, number]> = {
  plain: [0x596342, 0x5f6946], forest: [0x394f37, 0x40583c], rock: [0x575951, 0x60625a],
  water: [0x36545a, 0x3e6064], road: [0x8b7654, 0x917b58], peach: [0x624756, 0x6d4f60],
  earth: [0x6b5141, 0x765b48], sand: [0xa78d5e, 0xb19663], snow: [0xb0baba, 0xc0c9c7],
  ice: [0x789ba7, 0x87a9b3], marsh: [0x435a48, 0x4a6250], building: [0x645d53, 0x726859],
}

type MapProps = {
  map: readonly string[]
  image?: string
  units?: Unit[]
  selected?: string
  moves?: Set<string>
  range?: Set<string>
  affected?: Set<string>
  burning?: readonly Point[]
  path?: Point[]
  targets?: Set<string>
  events?: BattleEvent[]
  onPlaybackEnd?: () => void
  followAction?: boolean
  onTurnBoundary?: (banner: boolean, enemy: boolean) => void
  focusOnTarget?: boolean
  onHover?: (point: Point | null) => void
  onCell?: (point: Point) => void
}

function drawTerrain(g: Phaser.GameObjects.Graphics, terrain: Terrain, x: number, y: number, seed: number) {
  const { appearance } = terrains[terrain]
  const palette = terrainColors[appearance]
  g.fillStyle(palette[seed % 2]).fillRect(x, y, TILE, TILE)
  if (appearance === 'forest' || appearance === 'peach') {
    for (let i = 0; i < 3; i++) {
      const px = x + 10 + i * 16
      const py = y + 11 + (seed + i * 21) % 22
      g.fillStyle(0x24392b).fillRect(px + 5, py + 17, 4, 14)
      g.fillStyle(0x29402e).fillTriangle(px, py + 20, px + 7, py, px + 14, py + 20)
      g.fillStyle(appearance === 'peach' ? 0xd28a9a : 0x66754c).fillTriangle(px, py + 15, px + 7, py, px + 7, py + 18)
    }
  } else if (appearance === 'rock') {
    g.fillStyle(0x383c37).fillTriangle(x + 7, y + 49, x + 34, y + 10, x + 56, y + 50)
    g.fillStyle(0x86877a).fillTriangle(x + 11, y + 47, x + 34, y + 10, x + 31, y + 44)
    g.fillStyle(0x646658).fillTriangle(x + 7, y + 50, x + 24, y + 28, x + 37, y + 50)
  } else if (appearance === 'building') {
    g.fillStyle(0x9d8a70).fillRect(x + 16, y + 28, 32, 24)
    g.fillStyle(0x4b3a33).fillTriangle(x + 10, y + 30, x + 32, y + 12, x + 54, y + 30)
    g.fillRect(x + 28, y + 39, 8, 13)
  } else {
    for (let i = 0; i < 5; i++) {
      const px = x + 5 + (seed + i * 19) % 45
      const py = y + 7 + (seed * 3 + i * 13) % 48
      const color = appearance === 'water' ? 0x659296 : appearance === 'road' ? 0xa39065 : 0x85905f
      g.fillStyle(color, 0.45).fillRect(px, py, appearance === 'water' ? 11 : 4, 2)
      if (appearance === 'plain') g.fillRect(px + 2, py - 3, 2, 3)
    }
  }
  g.lineStyle(1, 0x20271a, 0.5).strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1)
}

function drawUnit(g: Phaser.GameObjects.Graphics, unit: Unit, x: number, y: number, selected: boolean, hasSprite: boolean, facing: Facing, stride: number) {
  const base = unit.side === 'ally' ? 0x98c4cc : 0xe0856d
  const dark = unit.side === 'ally' ? 0x33596b : 0x79382d
  const opacity = unit.done ? 0.58 : 1
  g.fillStyle(0x172018, 0.6).fillEllipse(x + 32, y + 48, 44, 14)
  if (selected) g.lineStyle(2, 0xffd484).strokeEllipse(x + 32, y + 46, 44, 16)
  if (!hasSprite) for (const offset of [0, 16, 32]) {
    g.save().translateCanvas(x + 8 + offset, y + 14).scaleCanvas(0.43, 0.56)
    const faceOffset = facing === 'left' ? -4 : facing === 'right' ? 4 : 0
    g.fillStyle(0x23251e, opacity).fillRect(18, 25, 29, 19)
    g.fillStyle(dark, opacity).fillRect(20, 25, 25, 18)
    g.fillStyle(0x23251e, opacity).fillRect(21, 43 + stride, 8, 6).fillRect(37, 43 - stride, 7, 6)
    g.fillStyle(base, opacity).fillRect(23, 26, 19, 5).fillRect(28, 31, 8, 11)
    g.fillStyle(facing === 'up' ? dark : 0xd9a981, opacity).fillRect(26 + faceOffset, 15, 14, 10)
    g.fillStyle(dark, opacity).fillRect(23, 11, 19, 7)
    g.fillStyle(base, opacity).fillRect(26, 9, 13, 5)
    if (roles[unit.role].sprite === 'guard') {
      g.fillStyle(0x252720, opacity).fillRect(14, 29, 13, 16)
      g.fillStyle(base, opacity).fillRect(16, 30, 9, 11)
    } else if (roles[unit.role].sprite === 'bow') {
      g.lineStyle(2, 0xf2ce8a, opacity).strokeCircle(46, 29, 7)
      g.lineBetween(46, 21, 46, 37)
    } else {
      g.fillStyle(roles[unit.role].sprite === 'sage' ? 0xffd78c : 0xe1d9c5, opacity).fillRect(45, 19, 3, 23)
      g.fillRect(42, 37, 9, 2)
    }
    g.restore()
  }
  if (unit.captain) g.fillStyle(0xffd485).fillTriangle(x + 27, y + 3, x + 37, y + 3, x + 32, y + 8)
  g.fillStyle(0x1b201a).fillRect(x + 3, y + 57, TILE - 6, 5)
  g.fillStyle(base).fillRect(x + 4, y + 58, Math.ceil((TILE - 8) * unit.currentHP / unit.hp), 3)
}

export default function BattleMap(props: MapProps) {
  const width = props.map[0].length
  const height = props.map.length
  const image = props.image
  const isBattle = props.units !== undefined
  const localGraphics = useContext(LocalGraphicsContext)
  const sprites = useRef(localGraphics)
  const host = useRef<HTMLDivElement>(null)
  const current = useRef(props)
  const redraw = useRef<() => void>(() => {})
  const cursor = useRef<Point | null>(null)
  const [boardError, setBoardError] = useState(false)

  useEffect(() => {
    current.current = props
    sprites.current = localGraphics
    if (!props.onCell) cursor.current = null
    redraw.current()
  }, [props, localGraphics])

  useEffect(() => {
    if (props.focusOnTarget) host.current?.focus({ preventScroll: true })
  }, [props.focusOnTarget])

  useEffect(() => {
    if (boardError && current.current.events?.length) current.current.onPlaybackEnd?.()
  }, [boardError, props.events])

  useEffect(() => {
    const parent = host.current!
    const renderScale = isBattle ? 2 : 1
    let game: Phaser.Game | undefined
    let advance = () => {}
    try {
      game = new Phaser.Game({
        type: Phaser.CANVAS,
        parent,
        width: width * TILE * renderScale,
        height: height * TILE * renderScale,
        transparent: !!image,
        antialias: true,
        disableContextMenu: true,
        banner: false,
        audio: { noAudio: true },
        scene: {
          update() { advance() },
          create(this: Phaser.Scene) {
            this.cameras.main.setZoom(renderScale).setOrigin(0, 0)
            const graphics = this.add.graphics()
            const unitImages = new Map<string, Phaser.GameObjects.Image>()
            const labels = new Map<string, { className: Phaser.GameObjects.Text; hp: Phaser.GameObjects.Text }>()
            const resultLabel = this.add.text(0, 0, '', {
              fontFamily: '"Malgun Gothic", sans-serif', fontSize: '16px', fontStyle: 'bold', resolution: renderScale,
              stroke: '#15130e', strokeThickness: 4,
            }).setOrigin(0.5).setDepth(2).setVisible(false)
            let previousEvents: MapProps['events']
            let startedAt = 0
            let elapsed = 0
            let duration = 0
            advance = () => {
              const events = current.current.events
              if (!events?.length) return
              const now = performance.now()
              if (events !== previousEvents) {
                previousEvents = events
                startedAt = now
                duration = events.reduce((total, event) => total + eventDuration(event), 0)
              }
              elapsed = now - startedAt
              redraw.current()
              if (elapsed >= duration) current.current.onPlaybackEnd?.()
            }
            redraw.current = () => {
              const { map, units = [], selected, moves, range, path = [], targets, events, affected, burning } = current.current
              const poses = new Map<string, { point?: Point; facing: Facing; step?: number }>()
              let enemy = false
              let banner = false
              let actingId: string | undefined
              const hp = new Map<string, number>()
              let visibleImpact: { impact: BattleImpact; time: number } | undefined
              let remaining = events === previousEvents ? elapsed : 0
              for (const event of events ?? []) {
                if (remaining < 0) break
                if ('turn' in event) {
                  enemy = true
                  banner = remaining < eventDuration(event)
                  remaining -= eventDuration(event)
                  continue
                }
                if ('impact' in event) {
                  const impact = event.impact
                  const pose = poses.get(impact.attacker)
                  poses.set(impact.attacker, { ...pose, facing: impact.facing, step: 0 })
                  if (remaining >= HIT_MS) hp.set(impact.target, impact.remainingHP)
                  if (remaining < IMPACT_MS) {
                    visibleImpact = { impact, time: remaining }
                    actingId = impact.attacker
                  }
                  remaining -= IMPACT_MS
                  continue
                }
                const movement = event.move
                const last = movement.path.length - 1
                if (remaining < last * STEP_MS) actingId = movement.unit
                const step = Math.min(remaining / STEP_MS, last)
                const segment = Math.min(Math.floor(step), last - 1)
                const from = movement.path[segment]
                const to = movement.path[segment + 1]
                const progress = step - segment
                poses.set(movement.unit, {
                  point: { x: Phaser.Math.Linear(from.x, to.x, progress), y: Phaser.Math.Linear(from.y, to.y, progress) },
                  facing: facingBetween(from, to),
                  step: step < last ? Math.floor(progress * 4) : 0,
                })
                remaining -= last * STEP_MS
              }
              if (events?.length) current.current.onTurnBoundary?.(banner, enemy)
              const viewport = parent.parentElement
              const actor = current.current.followAction && units.find(({ id }) => id === actingId)
              if (viewport && actor) {
                const point = poses.get(actor.id)?.point ?? actor
                viewport.scrollLeft = (point.x + 0.5) * parent.offsetWidth / width - viewport.clientWidth / 2
                viewport.scrollTop = (point.y + 0.5) * parent.offsetHeight / height - viewport.clientHeight / 2
              }
              graphics.clear()
              resultLabel.setVisible(false)
              for (const sprite of unitImages.values()) sprite.setVisible(false)
              for (const label of labels.values()) {
                label.className.setVisible(false)
                label.hp.setVisible(false)
              }
              map.forEach((row, y) => [...row].forEach((cell, x) => {
                if (isTerrain(cell)) drawTerrain(graphics, cell, x * TILE, y * TILE, x * 17 + y * 29)
                if (range?.has(key({ x, y }))) {
                  graphics.fillStyle(0xf18767, 0.24).fillRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2)
                  graphics.lineStyle(1, 0xf79d80, 0.65).strokeRect(x * TILE + 3, y * TILE + 3, TILE - 6, TILE - 6)
                }
                if (moves?.has(key({ x, y }))) {
                  graphics.fillStyle(0x9edce9, 0.27).fillRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2)
                  graphics.lineStyle(1, 0x9edce9, 0.8).strokeRect(x * TILE + 3, y * TILE + 3, TILE - 6, TILE - 6)
                }
              }))
              for (const point of burning ?? []) {
                graphics.fillStyle(0xe85e24, 0.45).fillRect(point.x * TILE, point.y * TILE, TILE, TILE)
              }
              for (const cell of affected ?? []) {
                const [x, y] = cell.split(',').map(Number)
                graphics.fillStyle(0xffd066, 0.55).fillRect(x * TILE, y * TILE, TILE, TILE)
              }
              const origin = units.find((unit) => unit.id === selected)
              if (origin && path.length) {
                graphics.lineStyle(5, 0xdaf9ff, 0.92).beginPath()
                graphics.moveTo((origin.x + 0.5) * TILE, (origin.y + 0.5) * TILE)
                for (const point of path) graphics.lineTo((point.x + 0.5) * TILE, (point.y + 0.5) * TILE)
                graphics.strokePath()
                const end = path[path.length - 1]
                graphics.fillStyle(0xdaf9ff).fillCircle((end.x + 0.5) * TILE, (end.y + 0.5) * TILE, 6)
              }
              for (const original of units) {
                const unit = { ...original, currentHP: hp.get(original.id) ?? original.currentHP }
                const impact = visibleImpact?.impact
                const time = visibleImpact?.time ?? 0
                const attacking = impact?.attacker === unit.id
                const receiving = impact?.target === unit.id && time >= HIT_MS
                if (unit.currentHP <= 0 && !receiving) continue
                if (targets?.has(unit.id)) {
                  graphics.fillStyle(0xf18767, 0.35).fillRect(unit.x * TILE, unit.y * TILE, TILE, TILE)
                  graphics.lineStyle(2, 0xf79d80).strokeRect(unit.x * TILE + 2, unit.y * TILE + 2, TILE - 4, TILE - 4)
                }
                const pose = poses.get(unit.id)
                const position = pose?.point ?? unit
                const facing = pose?.facing ?? unit.facing ?? 'down'
                const step = pose?.step ?? 0
                const x = position.x * TILE
                const y = position.y * TILE
                const graphicsPack = sprites.current
                const kind = unit.troopClass ?? troopClassFor(unit.role, unit.jo?.classId)
                const sharedKey = `${unit.side}-${kind}`
                const spriteKey = graphicsPack?.units[sharedKey] ? sharedKey : `${unit.side}-${roles[unit.role].sprite}`
                const poseType = attacking ? (impact.kind === 'fire' ? 'special' : 'attack')
                  : receiving && !impact.blocked ? 'special' : 'units'
                const guardFrame = receiving && impact.blocked && impact.kind !== 'fire' ? 1 : step
                const combatFrame = graphicsPack?.[poseType][spriteKey]
                const textureKey = combatFrame && poseType !== 'units' ? `${spriteKey}-${poseType}` : spriteKey
                const frame = combatFrame ?? graphicsPack?.units[spriteKey]
                drawUnit(graphics, unit, x, y - 2, unit.id === selected, !!frame, facing, [0, 2, 0, -2][step])
                if (frame) {
                  const attackSheet = !!combatFrame && poseType === 'attack'
                  const specialSheet = !!combatFrame && poseType === 'special'
                  const frameSize = attackSheet ? 64 : FRAME_SIZE
                  const sheet = frame.naturalHeight > frameSize
                  if (!this.textures.exists(textureKey)) {
                    if (sheet) this.textures.addSpriteSheet(textureKey, frame, { frameWidth: frameSize, frameHeight: frameSize })
                    else this.textures.addImage(textureKey, frame)
                  }
                  const frameIndex = attackSheet ? ATTACK_START[facing] + Math.min(3, Math.floor(time / 125))
                    : specialSheet ? (receiving ? 3 : 4) : WALK_FRAMES[facing][guardFrame]
                  for (const offset of [-17, 17, 0]) {
                    const key = `${unit.id}:soldier:${offset}`
                    let soldier = unitImages.get(key)
                    if (!soldier) {
                      soldier = this.add.image(0, 0, textureKey).setOrigin(0.5, 1)
                      unitImages.set(key, soldier)
                    }
                    soldier.setTexture(textureKey, sheet ? frameIndex : undefined)
                      .setScale(0.62).setFlipX(facing === 'right')
                      .setPosition(x + TILE / 2 + offset, y + (offset ? 36 : 39))
                      .setAlpha(receiving && !unit.currentHP ? 1 - (time - HIT_MS) / (IMPACT_MS - HIT_MS) : unit.done && !attacking ? 0.58 : 1)
                      .setVisible(true)
                  }
                }
                const portrait = graphicsPack?.portraitImages[unit.name]
                if (portrait) {
                  const texture = `portrait:${unit.name}`
                  if (!this.textures.exists(texture)) this.textures.addImage(texture, portrait)
                  const key = `${unit.id}:portrait`
                  let face = unitImages.get(key)
                  if (!face) {
                    face = this.add.image(0, 0, texture).setDepth(1)
                    unitImages.set(key, face)
                  }
                  face.setPosition(x + TILE / 2, y + 19).setDisplaySize(28, 28)
                    .setAlpha(unit.done ? 0.75 : 1).setVisible(true)
                }
                if (receiving) {
                  const text = impact.blocked ? (impact.kind === 'fire' ? '실패' : '방어')
                    : `-${impact.damage}`
                  resultLabel.setText(impact.kind === 'counter' ? `반격 · ${text}` : text)
                    .setColor(impact.blocked ? '#d2ecfa' : '#ffd782')
                    .setPosition(x + TILE / 2, y + 8 - (time - HIT_MS) / 24).setVisible(true)
                }
                let label = labels.get(unit.id)
                if (!label) {
                  const style = {
                    fontFamily: '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
                    fontSize: '10px',
                    resolution: renderScale,
                    fontStyle: 'bold',
                    padding: { x: 3, y: 0 },
                    backgroundColor: '#181b16',
                  }
                  label = {
                    className: this.add.text(0, 0, '', style).setOrigin(0, 1).setDepth(1),
                    hp: this.add.text(0, 0, '', style).setOrigin(1, 1).setDepth(1),
                  }
                  labels.set(unit.id, label)
                }
                const color = unit.id === selected ? '#ffe1a0' : unit.side === 'ally' ? '#d2f4ff' : '#ffc7b8'
                const className = kind ? troopClasses[kind] : '분류 보류'
                label.hp.setText(String(unit.currentHP)).setPosition(x + TILE - 3, y + 55).setColor(color).setVisible(true)
                label.className.setText(className).setScale(1)
                  .setPosition(x + 3, y + 55).setColor(color).setVisible(true)
                const availableWidth = TILE - 8 - label.hp.width
                label.className.setScale(Math.min(1, availableWidth / label.className.width), 1)
              }
              const focus = cursor.current
              if (focus) graphics.lineStyle(2, 0xfff2b8).strokeRect(focus.x * TILE + 3, focus.y * TILE + 3, TILE - 6, TILE - 6)
            }
            redraw.current()
          },
        },
      })
    } catch {
      setBoardError(true)
    }
    return () => {
      redraw.current = () => {}
      game?.destroy(true)
    }
  }, [width, height, image, isBattle])

  const pointerGesture = useRef<{ id: number; x: number; y: number; left: number; top: number; dragging: boolean } | null>(null)
  const [dragging, setDragging] = useState(false)
  function pointAt(clientX: number, clientY: number) {
    const bounds = host.current?.getBoundingClientRect()
    if (!bounds?.width || !bounds.height) return null
    const point = {
      x: Math.floor((clientX - bounds.left) * width / bounds.width),
      y: Math.floor((clientY - bounds.top) * height / bounds.height),
    }
    return validCell(point, props.map) ? point : null
  }

  function endGesture() {
    pointerGesture.current = null
    setDragging(false)
  }

  return <div className={isBattle ? 'board-frame board-viewport' : 'board-frame'}
    data-dragging={dragging || undefined}
    onPointerDown={(event) => {
      if (!isBattle || event.button !== 0 || pointerGesture.current || !pointAt(event.clientX, event.clientY)) return
      const viewport = event.currentTarget
      viewport.setPointerCapture(event.pointerId)
      pointerGesture.current = {
        id: event.pointerId, x: event.clientX, y: event.clientY,
        left: viewport.scrollLeft, top: viewport.scrollTop, dragging: false,
      }
    }}
    onPointerMove={(event) => {
      const gesture = pointerGesture.current
      if (!gesture) {
        props.onHover?.(pointAt(event.clientX, event.clientY))
        return
      }
      if (gesture.id !== event.pointerId) return
      const dx = event.clientX - gesture.x
      const dy = event.clientY - gesture.y
      if (!gesture.dragging && Math.hypot(dx, dy) < 6) return
      if (!gesture.dragging) {
        gesture.dragging = true
        setDragging(true)
        props.onHover?.(null)
      }
      event.currentTarget.scrollLeft = gesture.left - dx
      event.currentTarget.scrollTop = gesture.top - dy
    }}
    onPointerUp={(event) => {
      const gesture = pointerGesture.current
      if (!gesture || gesture.id !== event.pointerId) return
      endGesture()
      if (gesture.dragging || Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) >= 6) return
      const point = pointAt(event.clientX, event.clientY)
      if (point) props.onCell?.(point)
    }}
    onLostPointerCapture={(event) => {
      if (pointerGesture.current?.id === event.pointerId) endGesture()
    }}
    onPointerLeave={() => props.onHover?.(null)}
  >
    <div
      ref={host}
      className="board"
      style={{ aspectRatio: `${width} / ${height}`, backgroundImage: image ? `url("${image}")` : undefined, backgroundSize: '100% 100%' }}
      role={props.onCell ? 'group' : 'img'}
      aria-label={props.onCell ? '전장 지도. 드래그로 시점을 이동하거나 방향키로 칸을 고르고 Enter로 선택합니다.' : '수풀과 바위가 놓인 전장 지도'}
      tabIndex={props.onCell ? 0 : undefined}
      onBlur={() => { cursor.current = null; props.onHover?.(null); redraw.current() }}
      onKeyDown={(event) => {
        if (!props.onCell) return
        const active = cursor.current ?? props.units?.find((unit) => unit.id === props.selected) ?? { x: 2, y: 3 }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          props.onCell(active)
          return
        }
        const steps: Record<string, Point> = {
          ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
        }
        const step = steps[event.key]
        if (!step) return
        event.preventDefault()
        const next = { x: active.x + step.x, y: active.y + step.y }
        cursor.current = validCell(next, props.map) ? next : { x: active.x, y: active.y }
        const viewport = event.currentTarget.parentElement
        if (viewport) {
          const cellWidth = event.currentTarget.offsetWidth * TILE / width
          const cellHeight = event.currentTarget.offsetHeight * TILE / height
          const left = cursor.current.x * cellWidth
          const top = cursor.current.y * cellHeight
          viewport.scrollLeft = Phaser.Math.Clamp(viewport.scrollLeft, left + cellWidth - viewport.clientWidth, left)
          viewport.scrollTop = Phaser.Math.Clamp(viewport.scrollTop, top + cellHeight - viewport.clientHeight, top)
        }
        props.onHover?.(cursor.current)
        redraw.current()
      }}
    />
    {boardError && <p role="alert">전장을 표시할 수 없습니다. 브라우저를 새로고침해 주세요.</p>}
    <span className="sr-only">{props.units?.filter(({ currentHP }) => currentHP > 0).map((unit) =>
      `${unit.name}  ${unit.x + 1}열 ${unit.y + 1}행`).join(', ')}</span>
  </div>
}
