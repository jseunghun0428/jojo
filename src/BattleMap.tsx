import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import Phaser from 'phaser'
import { LocalGraphicsContext } from './local-graphics.ts'
import { isTerrain, terrains } from './data.ts'
import type { Point, Terrain } from './data.ts'
import { facingBetween, key } from './combat.ts'
import type { BattleEvent, BattleHit, BattleImpact, Facing, Unit } from './combat.ts'
import { expeditionTroopClasses, roles, troopClasses, troopClassFor } from './unit-classes.ts'
import { JO_FIRE_TERRAIN, joTerrainId } from './jo-game.ts'
import { boardGeometry, CELL_SIZE as TILE, hexStep, validCell, OUTSIDE_CELL } from './grid.ts'
import type { BoardLayout } from './grid.ts'
import type { Grid } from './grid.ts'
import { unitFormation } from './unit-formation.ts'
import type { BattleElement } from './war-arts.ts'
import { paintElementBurst, paintMarch, paintStrike } from './expedition-fx.ts'
import { paintExpeditionLandscape } from './expedition-landscape.ts'
import terrainAtlasUrl from './assets/expedition-terrain.jpg'
import enemySheetUrl from './assets/expedition-enemies.png'

const STEP_MS = 200
const IMPACT_MS = 680
const HIT_MS = 320
const ELEMENTAL_IMPACT_MS = 850
const FIRE_SETTLE_MS = 600
const TERRAIN_FLAME = 'elemental-terrain-fire'
const FRAME_SIZE = 48
const MIN_BATTLE_TILE_WIDTH = 60
const FIRE_TERRAIN_TEXTURE = 'jo-fire-terrain'
const FIRE_ANIMATION = 'jo-fire-loop'
const FIRE_FRAME_SIZE = 48
const FIRE_FRAME_COUNT = 8

function createFireAnimation(scene: Phaser.Scene) {
  const source = scene.textures.exists(FIRE_TERRAIN_TEXTURE) ? scene.textures.get(FIRE_TERRAIN_TEXTURE).getSourceImage() : undefined
  const sheet = scene.textures.createCanvas(FIRE_ANIMATION, FIRE_FRAME_SIZE * FIRE_FRAME_COUNT, FIRE_FRAME_SIZE)
  if (!sheet) return false

  const { context } = sheet
  if (source instanceof HTMLImageElement) context.drawImage(source, 0, 0)
  else {
    for (const [color, center, base, width, height] of [
      ['#a83221', 24, 43, 17, 36], ['#ef6127', 23, 43, 12, 32], ['#ffb33c', 25, 43, 8, 23], ['#fff2a3', 25, 42, 4, 13],
    ] as const) {
      context.fillStyle = color
      context.beginPath()
      context.moveTo(center - width, base - 6)
      context.quadraticCurveTo(center - width, base - 16, center - width / 2, base - height + 8)
      context.lineTo(center - width / 4, base - height + 17)
      context.quadraticCurveTo(center + width / 3, base - height + 8, center + width / 4, base - height)
      context.quadraticCurveTo(center + width * 2, base - 9, center + width * 0.6, base)
      context.quadraticCurveTo(center, base + 5, center - width, base - 6)
      context.fill()
    }
  }
  const pixels = context.getImageData(0, 0, FIRE_FRAME_SIZE, FIRE_FRAME_SIZE)
  context.clearRect(0, 0, sheet.width, sheet.height)

  for (let frame = 0; frame < FIRE_FRAME_COUNT; frame++) {
    const phase = frame * Math.PI * 2 / FIRE_FRAME_COUNT
    const offset = frame * FIRE_FRAME_SIZE
    for (let y = 0; y < FIRE_FRAME_SIZE; y++) {
      const sway = Math.round(Math.sin(phase + y / 8) * (1 - y / FIRE_FRAME_SIZE) * 2)
      for (let x = 0; x < FIRE_FRAME_SIZE; x++) {
        const index = (y * FIRE_FRAME_SIZE + x) * 4
        const [red, green, blue, alpha] = pixels.data.subarray(index, index + 4)
        if (!alpha || red - green < 30 || red - blue < 55) continue

        const targetX = x + sway
        if (targetX < 0 || targetX >= FIRE_FRAME_SIZE) continue

        const glow = Math.round(12 * Math.sin(phase + y / 6))
        context.fillStyle = `rgb(${red + glow}, ${green + glow}, ${blue})`
        context.fillRect(offset + targetX, y, 1, 1)
      }
    }
    sheet.add(frame, 0, offset, 0, FIRE_FRAME_SIZE, FIRE_FRAME_SIZE)
  }
  sheet.refresh()
  scene.anims.create({
    key: FIRE_ANIMATION,
    frames: scene.anims.generateFrameNumbers(FIRE_ANIMATION, { start: 0, end: FIRE_FRAME_COUNT - 1 }),
    frameRate: 12,
    repeat: -1,
  })
  return true
}

const WALK_FRAMES: Record<Facing, readonly number[]> = {
  down: [0, 1, 6, 1],
  up: [2, 3, 7, 3],
  left: [4, 5, 8, 5],
  right: [4, 5, 8, 5],
}
const ATTACK_START: Record<Facing, number> = { down: 0, up: 4, left: 8, right: 8 }
const eventDuration = (event: BattleEvent) => 'move' in event ? (event.move.path.length - 1) * STEP_MS
  : 'turn' in event ? 900 : event.impact.element ? ELEMENTAL_IMPACT_MS : IMPACT_MS
const elementalSizes = { fire: 64, earth: 70, water: 68 }
const terrainColors: Record<(typeof terrains)[Terrain]['appearance'], [number, number]> = {
  plain: [0x596342, 0x5f6946], forest: [0x394f37, 0x40583c], rock: [0x575951, 0x60625a],
  water: [0x36545a, 0x3e6064], road: [0x8b7654, 0x917b58], peach: [0x624756, 0x6d4f60],
  earth: [0x6b5141, 0x765b48], sand: [0xa78d5e, 0xb19663], snow: [0xb0baba, 0xc0c9c7],
  ice: [0x789ba7, 0x87a9b3], marsh: [0x435a48, 0x4a6250], building: [0x645d53, 0x726859],
}

const joHexColors: Partial<Record<number, [number, number]>> = {
  0: [0x747752, 0x7b7d56], 1: [0x465c39, 0x4d653d],
  10: [0x405348, 0x495c50], 14: [0x503b2e, 0x594230],
  20: [0x51596a, 0x59637a], 22: [0x575b44, 0x62664d], 23: [0x6a5b45, 0x735f47],
}
const webHexDetails: Partial<Record<Terrain, number>> = { P: 14, W: 15, F: 20, B: 22, h: 23, e: 10 }

function drawJoHexDetails(g: Phaser.GameObjects.Graphics, id: number, { x, y }: Point) {
  if (id === 14) {
    g.fillStyle(0x34271d).fillRect(x - 21, y - 4, 42, 10)
    g.fillStyle(0xa27b4f)
    for (let offset = -20; offset <= 20; offset += 8) {
      g.fillRect(x + offset, y - 9, 4, 20).fillTriangle(x + offset - 1, y - 9, x + offset + 2, y - 14, x + offset + 5, y - 9)
    }
  } else if (id === 15) {
    g.fillStyle(0x393631).fillRect(x - 21, y - 8, 42, 16)
    g.fillStyle(0xaba192).fillRect(x - 21, y - 12, 42, 6)
  } else if (id === 20 || id === 22 || id === 23) {
    g.fillStyle(0xaa9470).fillRect(x - 13, y - 5, 26, 17)
    g.fillStyle(id === 20 ? 0x354761 : id === 22 ? 0xa8864b : 0x54352a)
      .fillTriangle(x - 20, y - 3, x, y - 18, x + 20, y - 3)
    g.fillStyle(0x3c3328).fillRect(x - 3, y + 4, 6, 8)
  } else if (id === 10) {
    g.lineStyle(2, 0x799080, 0.55).lineBetween(x - 17, y - 4, x + 4, y - 4)
      .lineBetween(x - 4, y + 5, x + 15, y + 5)
  }
}

type MapProps = {
  expedition?: boolean
  map: readonly string[]
  grid?: Grid
  image?: string
  layout?: BoardLayout
  units?: Unit[]
  selected?: string
  moves?: Set<string>
  range?: Set<string>
  affected?: Set<string>
  burning?: readonly Point[]
  extinguishedTerrain?: readonly string[]
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

function drawUnit(g: Phaser.GameObjects.Graphics, unit: Unit, x: number, y: number, selected: boolean,
  fallback: ReturnType<typeof unitFormation> | undefined, facing: Facing, stride: number) {
  const base = unit.side === 'ally' ? 0x98c4cc : 0xe0856d
  const dark = unit.side === 'ally' ? 0x33596b : 0x79382d
  const opacity = unit.done ? 0.58 : 1
  g.fillStyle(0x172018, 0.6).fillEllipse(x + 32, y + 48, 44, 14)
  if (selected) g.lineStyle(2, 0xffd484).strokeEllipse(x + 32, y + 46, 44, 16)
  if (fallback) for (const position of fallback.positions) {
    const { scale } = fallback
    g.save().translateCanvas(x + position.x - 32 * scale, y + position.y - 49 * scale).scaleCanvas(scale, scale)
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
  if (unit.captain) g.fillStyle(0xffd485).fillTriangle(x + 8, y + 8, x + 15, y + 8, x + 11.5, y + 12)
  g.fillStyle(0x1b201a).fillRect(x + 3, y + 57, TILE - 6, 5)
  g.fillStyle(base).fillRect(x + 4, y + 58, Math.ceil((TILE - 8) * unit.currentHP / unit.hp), 3)
}

export default function BattleMap(props: MapProps) {
  const grid = props.grid
  const hex = grid === 'hex'
  const geometry = useMemo(() => boardGeometry(props.map, grid, props.layout), [props.map, grid, props.layout])
  const { width, height, center } = geometry
  const image = props.image
  const expedition = !!props.expedition
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
        width: width * renderScale,
        height: height * renderScale,
        transparent: !!image || hex,
        antialias: true,
        disableContextMenu: true,
        banner: false,
        audio: { noAudio: true },
        scene: {
          update() { advance() },
          preload(this: Phaser.Scene) {
            if (expedition) {
              this.load.image('expedition-terrain', terrainAtlasUrl)
              if (isBattle) this.load.spritesheet('expedition-enemies', enemySheetUrl, { frameWidth: 192, frameHeight: 192 })
            }
            if (import.meta.env.DEV) this.load.image(FIRE_TERRAIN_TEXTURE, '/jo-game/fire-terrain.bmp')
          },
          create(this: Phaser.Scene) {
            this.cameras.main.setZoom(renderScale).setOrigin(0, 0)
            const viewport = parent.parentElement
            function showPoint(point: Point, follow = false) {
              if (!viewport) return
              const x = point.x * parent.offsetWidth / width
              const y = point.y * parent.offsetHeight / height
              if (follow || x < viewport.scrollLeft || x >= viewport.scrollLeft + viewport.clientWidth) {
                viewport.scrollLeft = x - viewport.clientWidth / 2
              }
              if (follow || y < viewport.scrollTop || y >= viewport.scrollTop + viewport.clientHeight) {
                viewport.scrollTop = y - viewport.clientHeight / 2
              }
            }
            const captain = current.current.units?.find((unit) => unit.captain && unit.currentHP > 0)
            if (captain) showPoint(center(captain))
            const terrainGraphics = this.add.graphics().setDepth(-2)
            const ground = expedition && hex && !image ? this.textures.createCanvas('expedition-map',
              Math.ceil(width * renderScale), Math.ceil(height * renderScale)) : null
            if (ground) {
              ground.context.scale(renderScale, renderScale)
              const atlas = this.textures.exists('expedition-terrain') ? this.textures.get('expedition-terrain').getSourceImage() : undefined
              paintExpeditionLandscape(ground.context, current.current.map, geometry, atlas instanceof HTMLImageElement ? atlas : undefined)
              ground.refresh()
              this.add.image(0, 0, 'expedition-map').setOrigin(0).setScale(1 / renderScale).setDepth(-3)
            }
            const graphics = this.add.graphics()
            const hitGraphics = this.add.graphics().setDepth(0.5)
            const hasFireTexture = createFireAnimation(this)
            const effectSprites = new Map<string, Phaser.GameObjects.Sprite>()
            const scene = this
            function effectTexture(element: BattleElement) {
              const art = sprites.current?.effects[element]
              if (!art) return
              const texture = `battle-element-${element}`
              const size = art.naturalWidth
              const frames = Math.floor(art.naturalHeight / size)
              if (!size || frames < 5) return
              if (!scene.textures.exists(texture)) {
                scene.textures.addSpriteSheet(texture, art, { frameWidth: size, frameHeight: size })
              }
              return { texture, frames }
            }
            function drawElement(id: string, element: BattleElement, x: number, y: number, time: number) {
              const progress = Phaser.Math.Clamp((time - HIT_MS) / (ELEMENTAL_IMPACT_MS - HIT_MS), 0, 1)
              if (expedition) paintElementBurst(hitGraphics, element, x, y, progress)
              const alpha = element === 'fire' && time >= FIRE_SETTLE_MS
                ? (ELEMENTAL_IMPACT_MS - time) / (ELEMENTAL_IMPACT_MS - FIRE_SETTLE_MS) : 1
              const art = effectTexture(element) ?? (element === 'fire' && hasFireTexture
                ? { texture: FIRE_ANIMATION, frames: FIRE_FRAME_COUNT } : undefined)
              if (art) {
                let sprite = effectSprites.get(id)
                if (!sprite) {
                  sprite = scene.add.sprite(x, y, art.texture).setOrigin(0.5, 0.85).setDepth(0.5)
                  effectSprites.set(id, sprite)
                }
                sprite.setTexture(art.texture, Math.min(art.frames - 1, Math.floor(progress * art.frames)))
                  .setDisplaySize(elementalSizes[element], elementalSizes[element]).setPosition(x, y).setAlpha(alpha).setVisible(true)
                return
              }
              const spread = 8 + progress * 25
              const opacity = Math.sin(Math.PI * progress)
              if (element === 'earth') {
                hitGraphics.fillStyle(0xa88351, opacity)
                for (const direction of [-1, 0, 1]) {
                  const offset = direction * spread
                  const lift = spread * (direction === 0 ? 0.8 : 0.5)
                  hitGraphics.fillTriangle(x + offset - 5, y, x + offset + 2, y - lift, x + offset + 7, y)
                }
              } else if (element === 'water') {
                hitGraphics.lineStyle(3, 0x7ad5ec, opacity).strokeEllipse(x, y - 3, spread * 2, spread * 0.7)
                hitGraphics.lineStyle(2, 0xc8f4ff, opacity).strokeEllipse(x, y - 9, spread * 1.65, spread * 0.55)
              }
            }
            function fillCell(layer: Phaser.GameObjects.Graphics, point: Point, color: number, alpha = 1, inset = 0) {
              layer.fillStyle(color, alpha)
              if (hex) layer.fillPoints(geometry.corners(point, inset), true)
              else {
                const { x, y } = geometry.corners(point, inset)[0]
                layer.fillRect(x, y, TILE - 2 * inset, TILE - 2 * inset)
              }
            }
            function outlineCell(layer: Phaser.GameObjects.Graphics, point: Point, color: number, thickness: number, alpha: number, inset: number) {
              layer.lineStyle(thickness, color, alpha)
              if (hex) layer.strokePoints(geometry.corners(point, inset), true)
              else {
                const { x, y } = geometry.corners(point, inset)[0]
                layer.strokeRect(x, y, TILE - 2 * inset, TILE - 2 * inset)
              }
            }
            const fireTiles = new Map<string, Phaser.GameObjects.Sprite>()
            const unitImages = new Map<string, Phaser.GameObjects.Image>()
            const labels = new Map<string, { className: Phaser.GameObjects.Text; hp: Phaser.GameObjects.Text }>()
            const resultLabels = new Map<string, Phaser.GameObjects.Text>()
            const techniqueLabel = this.add.text(0, 0, '', { fontFamily: '"Batang", serif', fontStyle: 'bold',
              fontSize: '17px', backgroundColor: '#492e22', color: '#ffdf9d', padding: { x: 8, y: 3 }, resolution: renderScale,
            }).setOrigin(.5, 1).setDepth(4).setVisible(false)
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
              const { map, units = [], selected, moves, range, path = [], targets, events, affected, burning, extinguishedTerrain } = current.current
              const poses = new Map<string, { point?: Point; facing: Facing; step?: number }>()
              let enemy = false
              let banner = false
              let actingId: string | undefined
              const hp = new Map<string, number>()
              const receivingImpacts = new Map<string, BattleHit>()
              let march: { unit: string; start: Point; end: Point; cell: Point; progress: number } | undefined
              const burningCells = new Set(burning?.map(key))
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
                  const impactDuration = eventDuration(event)
                  const impacts = [impact, ...(event.additionalImpacts ?? [])]
                  const pose = poses.get(impact.attacker)
                  poses.set(impact.attacker, { ...pose, facing: impact.facing, step: 0 })
                  if (remaining >= HIT_MS) {
                    for (const hit of impacts) {
                      hp.set(hit.target, hit.remainingHP)
                      if (remaining < impactDuration) receivingImpacts.set(hit.target, hit)
                      if (hit.burningTile && remaining >= FIRE_SETTLE_MS) burningCells.add(key(hit.burningTile))
                    }
                  }
                  if (remaining < impactDuration) {
                    visibleImpact = { impact, time: remaining }
                    actingId = impact.attacker
                  }
                  remaining -= impactDuration
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
                const start = center(from)
                const end = center(to)
                if (expedition && step < last) march = { unit: movement.unit, start, end, cell: progress < .5 ? from : to, progress }
                poses.set(movement.unit, {
                  point: { x: Phaser.Math.Linear(start.x, end.x, progress), y: Phaser.Math.Linear(start.y, end.y, progress) },
                  facing: facingBetween(from, to, grid),
                  step: step < last ? Math.floor(progress * 4) : 0,
                })
                remaining -= last * STEP_MS
              }
              if (events?.length) current.current.onTurnBoundary?.(banner, enemy)
              const actor = current.current.followAction && units.find(({ id }) => id === actingId)
              if (actor) showPoint(poses.get(actor.id)?.point ?? center(actor), true)
              terrainGraphics.clear()
              graphics.clear()
              hitGraphics.clear()
              techniqueLabel.setVisible(false)
              if (visibleImpact) {
                const { impact, time } = visibleImpact
                const source = units.find(unit => unit.id === impact.attacker)
                const target = units.find(unit => unit.id === impact.target)
                if (source?.morale !== undefined && target) {
                  const from = poses.get(source.id)?.point ?? center(source)
                  const to = poses.get(target.id)?.point ?? center(target)
                  paintStrike(hitGraphics, impact, source, from, to, time, HIT_MS)
                  if (impact.technique) {
                    techniqueLabel.setText(source.name + ' · ' + impact.technique)
                      .setPosition(Phaser.Math.Clamp(from.x, techniqueLabel.width / 2, width - techniqueLabel.width / 2),
                        Math.max(techniqueLabel.height + 3, from.y - 26)).setVisible(true)
                  }
                }
              }
              for (const sprite of effectSprites.values()) sprite.setVisible(false)
              for (const label of resultLabels.values()) label.setVisible(false)
              for (const sprite of unitImages.values()) sprite.setVisible(false)
              for (const label of labels.values()) {
                label.className.setVisible(false)
                label.hp.setVisible(false)
              }
              const fireTexture = effectTexture('fire')
              if (fireTexture && !this.anims.exists(TERRAIN_FLAME)) {
                this.anims.create({
                  key: TERRAIN_FLAME, frames: [2, 3, 4, 3].map((frame) => ({ key: fireTexture.texture, frame })),
                  frameRate: 8, repeat: -1,
                })
              }
              const terrainFire = fireTexture?.texture ?? FIRE_ANIMATION
              const fireAnimation = fireTexture ? TERRAIN_FLAME : FIRE_ANIMATION
              for (const tile of fireTiles.values()) tile.setVisible(false)
              map.forEach((row, y) => [...row].forEach((cell, x) => {
                const point = { x, y }
                if (cell === OUTSIDE_CELL) {
                  fillCell(terrainGraphics, point, 0x111810, 0.72)
                  return
                }
                const location = key(point)
                const sourceTerrain = joTerrainId(map, point)
                const fire = burningCells.has(location) || (sourceTerrain === JO_FIRE_TERRAIN && !extinguishedTerrain?.includes(location))
                if (image && geometry.image) {
                  outlineCell(terrainGraphics, point, 0x20271a, 1, 0.65, 0.5)
                } else if (hex && !ground) {
                  const palette = sourceTerrain === undefined
                    ? terrainColors[isTerrain(cell) ? terrains[cell].appearance : 'plain']
                    : joHexColors[sourceTerrain] ?? terrainColors.plain
                  fillCell(terrainGraphics, point, palette[(x + y) % 2])
                  outlineCell(terrainGraphics, point, 0x20271a, 1, 0.8, 0.5)
                  const detail = sourceTerrain ?? (isTerrain(cell) ? webHexDetails[cell] : undefined)
                  if (detail !== undefined) drawJoHexDetails(terrainGraphics, detail, center(point))
                } else if (!hex && isTerrain(cell)) {
                  const pixel = geometry.corners(point)[0]
                  drawTerrain(terrainGraphics, cell, pixel.x, pixel.y, x * 17 + y * 29)
                }
                if (fire && (fireTexture || hasFireTexture)) {
                  let tile = fireTiles.get(location)
                  if (!tile) {
                    const pixel = center(point)
                    tile = this.add.sprite(pixel.x, pixel.y + 12, terrainFire, fireTexture ? 2 : 0)
                      .setOrigin(0.5, 0.85).setDepth(-1)
                    tile.play(fireAnimation)
                    fireTiles.set(location, tile)
                  }
                  if (tile.texture.key !== terrainFire) tile.play(fireAnimation)
                  tile.setDisplaySize(53, 53).setVisible(true)
                } else if (fire) {
                  fillCell(terrainGraphics, point, 0xe85e24, 0.45)
                }
                if (range?.has(location)) {
                  fillCell(graphics, point, 0xf18767, 0.24, 1)
                  outlineCell(graphics, point, 0xf79d80, 1, 0.65, 3)
                }
                if (moves?.has(location)) {
                  fillCell(graphics, point, 0x9edce9, 0.27, 1)
                  outlineCell(graphics, point, 0x9edce9, 1, 0.8, 3)
                }
              }))
              for (const cell of affected ?? []) {
                const [x, y] = cell.split(',').map(Number)
                fillCell(graphics, { x, y }, 0xffd066, 0.55)
              }
              const origin = units.find((unit) => unit.id === selected)
              if (origin && path.length) {
                graphics.lineStyle(5, 0xdaf9ff, 0.92).beginPath()
                const start = center(origin)
                graphics.moveTo(start.x, start.y)
                for (const point of path) {
                  const pixel = center(point)
                  graphics.lineTo(pixel.x, pixel.y)
                }
                graphics.strokePath()
                const end = center(path[path.length - 1])
                graphics.fillStyle(0xdaf9ff).fillCircle(end.x, end.y, 6)
              }
              for (const original of units) {
                const unit = { ...original, currentHP: hp.get(original.id) ?? original.currentHP }
                const attack = visibleImpact?.impact
                const time = visibleImpact?.time ?? 0
                const attacking = attack?.attacker === unit.id && (!attack.element || time < 500)
                const receiving = receivingImpacts.get(unit.id)
                if (unit.currentHP <= 0 && !receiving) continue
                if (targets?.has(unit.id)) {
                  fillCell(graphics, unit, 0xf18767, 0.35)
                  outlineCell(graphics, unit, 0xf79d80, 2, 1, 2)
                }
                const pose = poses.get(unit.id)
                const position = pose?.point ?? center(unit)
                const facing = pose?.facing ?? unit.facing ?? 'down'
                const step = pose?.step ?? 0
                const x = position.x - TILE / 2
                const y = position.y - TILE / 2
                const graphicsPack = sprites.current
                const kind = unit.troopClass ?? troopClassFor(unit.role, unit.jo?.classId)
                if (march?.unit === unit.id) {
                  paintMarch(hitGraphics, march.start, march.end, march.progress, map[march.cell.y][march.cell.x], kind === 'cavalry')
                }
                const sharedKey = `${unit.side}-${kind}`
                const spriteKey = graphicsPack?.units[sharedKey] ? sharedKey : `${unit.side}-${roles[unit.role].sprite}`
                const poseType = attacking ? 'attack'
                  : receiving && !receiving.blocked ? 'special' : 'units'
                const guardFrame = receiving?.blocked && receiving.kind !== 'fire' ? 1 : step
                const combatFrame = graphicsPack?.[poseType][spriteKey]
                const textureKey = combatFrame && poseType !== 'units' ? `${spriteKey}-${poseType}` : spriteKey
                const frame = combatFrame ?? graphicsPack?.units[spriteKey]
                const enemyOfficer = expedition && unit.side === 'enemy' && unit.enemyKind === 'officer'
                const formation = unitFormation(enemyOfficer ? 0 : unit.currentHP)
                drawUnit(graphics, unit, x, y - 2, unit.id === selected, frame || enemyOfficer ? undefined : formation, facing, [0, 2, 0, -2][step])
                if (enemyOfficer) {
                  const frameIndex = kind === 'cavalry' ? 1 : kind === 'ranged' ? 2 : 0
                  let officer = unitImages.get(unit.id)
                  if (!officer) {
                    officer = this.add.image(0, 0, 'expedition-enemies', frameIndex).setOrigin(.5, .98).setDepth(.2)
                    unitImages.set(unit.id, officer)
                  }
                  const lunge = attacking && time <= HIT_MS ? Math.sin(Math.PI * time / HIT_MS) * (kind === 'cavalry' ? 8 : 4) : 0
                  const recoil = receiving && !receiving.blocked ? 3 * Math.sin(Math.max(0, time - HIT_MS) / 35) * Math.exp(-Math.max(0, time - HIT_MS) / 100) : 0
                  const walk = march?.unit === unit.id ? Math.abs(Math.sin(march.progress * Math.PI * 2)) : 0
                  const facingRight = facing === 'right' || (facing === 'down' && march?.unit === unit.id && march.end.x > march.start.x)
                  officer.setFrame(frameIndex).setFlipX(facingRight)
                    .setDisplaySize(51, 51).setPosition(position.x + (facingRight ? lunge : -lunge) + recoil, y + 44 - walk * 2)
                    .setAlpha(unit.done && !attacking ? .8 : 1).setVisible(true)
                  let name = resultLabels.get(unit.id + ':name')
                  if (!name) {
                    name = this.add.text(0, 0, unit.name, { fontFamily: '"Malgun Gothic", sans-serif', fontSize: '10px',
                      fontStyle: 'bold', color: '#ffecda', stroke: '#3d211b', strokeThickness: 3, resolution: renderScale }).setOrigin(.5, .5).setDepth(1)
                    resultLabels.set(unit.id + ':name', name)
                  }
                  name.setPosition(position.x, y + 3).setVisible(true)
                } else if (frame && formation.positions.length) {
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
                  for (const [index, position] of formation.positions.entries()) {
                    const key = `${unit.id}:soldier:${index}`
                    let soldier = unitImages.get(key)
                    if (!soldier) {
                      soldier = this.add.image(0, 0, textureKey).setOrigin(0.5, 1)
                      unitImages.set(key, soldier)
                    }
                    soldier.setTexture(textureKey, sheet ? frameIndex : undefined)
                      .setScale(formation.scale * FRAME_SIZE / frameSize).setFlipX(facing === 'right')
                      .setPosition(x + position.x, y + position.y)
                      .setAlpha(unit.done && !attacking ? 0.58 : 1)
                      .setVisible(true)
                  }
                }
                const portrait = !enemyOfficer && graphicsPack?.portraitImages[unit.name]
                if (portrait) {
                  const texture = `portrait:${unit.name}`
                  if (!this.textures.exists(texture)) this.textures.addImage(texture, portrait)
                  const key = `${unit.id}:portrait`
                  let face = unitImages.get(key)
                  if (!face) {
                    face = this.add.image(0, 0, texture).setDepth(1)
                    unitImages.set(key, face)
                  }
                  face.setPosition(x + TILE / 2, y + 17).setDisplaySize(32, 32)
                    .setAlpha(unit.done ? 0.75 : 1).setVisible(true)
                }
                if (receiving) {
                  if (receiving.element) drawElement(unit.id, receiving.element, position.x, position.y + 12, time)
                  let resultLabel = resultLabels.get(unit.id)
                  if (!resultLabel) {
                    resultLabel = this.add.text(0, 0, '', {
                      fontFamily: '"Malgun Gothic", sans-serif', fontSize: '16px', fontStyle: 'bold', resolution: renderScale,
                      stroke: '#15130e', strokeThickness: 4,
                    }).setOrigin(0.5).setDepth(2)
                    resultLabels.set(unit.id, resultLabel)
                  }
                  const text = receiving.blocked ? (receiving.kind === 'fire' ? '실패' : '방어') : `-${receiving.damage}`
                  resultLabel.setText(receiving.kind === 'counter' ? `반격 · ${text}` : text)
                    .setColor(receiving.blocked ? '#d2ecfa' : '#ffd782')
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
                const className = kind ? (expedition ? expeditionTroopClasses : troopClasses)[kind] : '분류 보류'
                label.hp.setText(String(unit.currentHP)).setPosition(x + TILE - 3, y + 55).setColor(color).setVisible(true)
                label.className.setText(className).setScale(1)
                  .setPosition(x + 3, y + 55).setColor(color).setVisible(true)
                const availableWidth = TILE - 8 - label.hp.width
                label.className.setScale(Math.min(1, availableWidth / label.className.width), 1)
              }
              const focus = cursor.current
              if (focus) outlineCell(graphics, focus, 0xfff2b8, 2, 1, 3)
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
  }, [geometry, width, height, center, grid, hex, image, isBattle, expedition])

  const pointerGesture = useRef<{ id: number; x: number; y: number; left: number; top: number; dragging: boolean } | null>(null)
  const [dragging, setDragging] = useState(false)
  function pointAt(clientX: number, clientY: number) {
    const bounds = host.current?.getBoundingClientRect()
    if (!bounds?.width || !bounds.height) return null
    return geometry.cellAt({
      x: (clientX - bounds.left) * width / bounds.width,
      y: (clientY - bounds.top) * height / bounds.height,
    })
  }

  function endGesture() {
    pointerGesture.current = null
    setDragging(false)
  }

  return <div className={isBattle ? 'board-frame board-viewport' : 'board-frame'}
    data-grid={grid}
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
      style={{
        aspectRatio: `${width} / ${height}`,
        minWidth: isBattle ? width * MIN_BATTLE_TILE_WIDTH / TILE : undefined,
        backgroundImage: image ? `url("${image}")` : undefined,
        backgroundSize: geometry.image ? `${geometry.image.width / width * 100}% ${geometry.image.height / height * 100}%` : '100% 100%',
        backgroundPosition: geometry.image ? `${geometry.image.x / (width - geometry.image.width || 1) * 100}% ${geometry.image.y / (height - geometry.image.height || 1) * 100}%` : undefined,
        backgroundRepeat: 'no-repeat',
      }}
      role={props.onCell ? 'group' : 'img'}
      aria-label={props.onCell ? (hex ? '육각 전장 지도. 좌우 방향키와 Q, E, Z, C로 칸을 고르고 Enter로 선택합니다.'
        : '전장 지도. 드래그로 시점을 이동하거나 방향키로 칸을 고르고 Enter로 선택합니다.') : '수풀과 바위가 놓인 전장 지도'}
      tabIndex={props.onCell ? 0 : undefined}
      onBlur={() => { cursor.current = null; props.onHover?.(null); redraw.current() }}
      onKeyDown={(event) => {
        if (!props.onCell) return
        const active = cursor.current ?? props.units?.find((unit) => unit.id === props.selected)
          ?? props.units?.find((unit) => unit.captain) ?? (hex ? { x: 0, y: 0 } : { x: 2, y: 3 })
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          props.onCell(active)
          return
        }
        const steps: Record<string, Point> = {
          ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
        }
        const hexKeys: Record<string, number> = { arrowright: 0, c: 1, z: 2, arrowleft: 3, q: 4, e: 5, arrowup: 5, arrowdown: 2 }
        const direction = hexKeys[event.key.toLowerCase()]
        const step = steps[event.key]
        const next = hex ? direction === undefined ? undefined : hexStep(active, direction)
          : step && { x: active.x + step.x, y: active.y + step.y }
        if (!next) return
        event.preventDefault()
        cursor.current = validCell(next, props.map) ? next : { x: active.x, y: active.y }
        const viewport = event.currentTarget.parentElement
        if (viewport) {
          const pixel = center(cursor.current)
          const scaleX = event.currentTarget.offsetWidth / width
          const scaleY = event.currentTarget.offsetHeight / height
          const cellWidth = TILE * scaleX
          const cellHeight = geometry.cellHeight * scaleY
          const left = pixel.x * scaleX - cellWidth / 2
          const top = pixel.y * scaleY - cellHeight / 2
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
