import { roles, troopClassFor } from './unit-classes.ts'
import type { Role, TroopClass } from './unit-classes.ts'
import { HEIGHT, SALVE_HEAL, TROOP_SCALE, WIDTH, enemyKindFor, isTerrain, officerById, terrains, treasureById } from './data.ts'
import type { ItemId, Point, Stage, Stats } from './data.ts'
import { officerAttributes } from './officer-attributes.ts'
import { joTerrainId } from './jo-game.ts'
import type { JoProfile } from './jo-game.ts'
import { warArtWill, warArts } from './war-arts.ts'
import type { WarArtId } from './war-arts.ts'

export const MAX_WILL = 100

export function controlStatus(unit: { pinnedUntil?: number; confusedUntil?: number }) {
  if (unit.pinnedUntil !== undefined) return unit.confusedUntil !== undefined ? '공황' : '저지'
  return unit.confusedUntil !== undefined ? '혼란' : null
}

export type Facing = 'down' | 'up' | 'left' | 'right'
export type UnitMovement = { unit: string; path: Point[] }
export type BattleImpact = {
  attacker: string; target: string; kind: 'attack' | 'counter' | 'fire'
  facing: Facing; damage: number; remainingHP: number; blocked: boolean
}
export type BattleEvent = { move: UnitMovement } | { impact: BattleImpact } | { turn: 'enemy' }

export type Unit = Point & Stats & {
  id: string; name: string; role: Role; side: 'ally' | 'enemy'; captain: boolean;
  troopClass?: TroopClass
  usedWarArts?: WarArtId[]
  pinnedUntil?: number
  confusedUntil?: number
  currentHP: number; currentMP: number; moved: boolean; done: boolean
  level?: number
  facing?: Facing
  jo?: JoProfile
  guest?: boolean
  enemyKind?: 'officer' | 'soldier'
  behavior?: number
}
export type Battle = {
  map: readonly string[]; units: Unit[]; round: number; result: 'win' | 'loss' | null; log: string[]
  events?: BattleEvent[]
  pendingMove?: { unit: string; origin: Point; facing?: Facing }
  reinforcements?: Unit[]
  objectives?: string[]
  burning?: (Point & { round: number; source?: string })[]
  experience?: { deployed: string[]; reserves: string[]; earned: Record<string, number> }
  terrainNames?: string[]
}
export type BattleAction =
  | { type: 'move'; unit: string; to: Point }
  | { type: 'cancel-move'; unit: string }
  | { type: 'attack' | 'fire'; unit: string; target: string }
  | { type: 'warArt'; unit: string; target: string; art: WarArtId }
  | { type: 'item'; unit: string; item: ItemId }
  | { type: 'wait'; unit: string }
  | { type: 'end' }

export const FIRE_COST = 4
export const FIRE_RANGE = 3
const deployment: Point[] = [
  { x: 2, y: 3 }, { x: 2, y: 4 }, { x: 1, y: 2 }, { x: 1, y: 5 },
  { x: 2, y: 2 }, { x: 2, y: 5 }, { x: 1, y: 3 }, { x: 1, y: 4 },
  { x: 2, y: 1 }, { x: 2, y: 6 }, { x: 1, y: 1 }, { x: 1, y: 6 },
]
const directions: Point[] = [{ x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }]

export const key = ({ x, y }: Point) => `${x},${y}`
export const distance = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
export function facingBetween(from: Point, to: Point): Facing {
  if (from.x !== to.x) return from.x < to.x ? 'right' : 'left'
  return from.y < to.y ? 'down' : 'up'
}
export function terrainAt(map: readonly string[], { x, y }: Point) {
  const tile = map[y]?.[x]
  return isTerrain(tile) ? tile : undefined
}
export const unitAt = (battle: Battle, point: Point) => battle.units.find((unit) => unit.currentHP > 0 && distance(unit, point) === 0)

function makeUnit(id: string, name: string, role: Role, side: Unit['side'], position: Point, stats: Stats, level: number, captain = false): Unit {
  return { ...position, ...stats, id, name, role, side, captain, level, currentHP: stats.hp, mp: MAX_WILL, currentMP: MAX_WILL, moved: false, done: false }
}

export function troopStrength(level: number, soldier: boolean, treasureId?: string) {
  const treasure = treasureId ? treasureById[treasureId] : undefined
  const bonus = treasure?.stat === 'hp' ? treasure.amount * TROOP_SCALE : 0
  return (soldier ? 1000 : 1200) + (Math.max(1, level) - 1) * (soldier ? 50 : 100) + bonus
}

export function unitStats(role: Role, tier: number, officer?: { bonus: number; treasure?: string }): Stats {
  const { hp, mp, attack, defense, move, range } = roles[role]
  if (!officer) return { hp: (Math.floor(hp * 0.65) + tier * 4) * TROOP_SCALE, mp, attack: attack - 5 + tier, defense: Math.max(0, defense - 2 + tier), move, range }
  const stats: Stats = { hp: hp + officer.bonus * 4, mp, attack: attack + officer.bonus, defense, move, range }
  const treasure = officer.treasure ? treasureById[officer.treasure] : undefined
  if (treasure) stats[treasure.stat] += treasure.amount
  stats.hp *= TROOP_SCALE
  return stats
}

function joUnitStats(profile: JoProfile, level: number, treasureId?: string): Stats {
  const { hp, mp, move, pattern, growth } = profile
  const range = pattern === 'all' ? 0 : Math.max(0, ...pattern.map(({ x, y }) => Math.abs(x) + Math.abs(y)))
  const stats: Stats = { hp: hp + growth[5] * (level - 1), mp: mp + growth[6] * (level - 1), attack: 0, defense: 0, move, range }
  const treasure = treasureId ? treasureById[treasureId] : undefined
  if (treasure) stats[treasure.stat] += treasure.amount
  stats.hp *= TROOP_SCALE
  return stats
}

export function newBattle(stage: Stage, lineup: string[], captain: string, equipment: Record<string, string>, profiles: Record<string, JoProfile> = {}, troopClasses: Partial<Record<string, TroopClass>> = {}, growth: Partial<Record<string, { level: number }>> = {}): Battle {
  const slots = stage.jo?.deployment ?? deployment
  const ordered = [captain, ...lineup.filter((id) => id !== captain)].slice(0, slots.length)
  const allies = ordered.map((id, i) => {
    const { name, role, bonus } = officerById[id]
    const jo = profiles[id]
    const level = growth[id]?.level ?? jo?.level ?? 1
    const stats = jo ? joUnitStats(jo, level, equipment[id]) : unitStats(role, stage.tier, { bonus, treasure: equipment[id] })
    stats.hp = troopStrength(level, false, equipment[id])
    return { ...makeUnit(id, name, role, 'ally', slots[i], stats, level, id === captain), jo, troopClass: troopClasses[id] }
  })
  const enemies = stage.enemies.map(({ x, y, role, name, jo, facing, levelOffset, behavior, enemyKind }, i) => {
    const modifier = levelOffset === undefined || levelOffset === 0xffff ? 0 : levelOffset < 50 ? levelOffset : 50 - levelOffset
    const level = Math.max(1, (jo?.level ?? 1) + stage.tier + modifier)
    const stats = jo ? joUnitStats(jo, level) : unitStats(role, stage.tier)
    stats.hp = troopStrength(level, (enemyKind ?? enemyKindFor(name)) === 'soldier')
    return { ...makeUnit(`enemy-${i}`, name, role, 'enemy', { x, y }, stats, level), jo, facing, behavior, enemyKind }
  })
  const makeGuest = ({ x, y, role, name, jo, facing, levelOffset, behavior }: NonNullable<Stage['jo']>['guests'][number]) => {
    const level = Math.max(1, jo.level + (levelOffset < 50 ? levelOffset : levelOffset === 0xffff ? 0 : 50 - levelOffset))
    const stats = joUnitStats(jo, level)
    stats.hp = troopStrength(level, enemyKindFor(name) === 'soldier')
    return { ...makeUnit(`guest-${jo.id}`, name, role, 'ally', { x, y }, stats, level), jo, facing, guest: true, behavior }
  }
  const guests = stage.jo?.guests.map(makeGuest) ?? []
  const reinforcements = stage.jo?.reinforcements.map(makeGuest)
  return {
    map: stage.map, units: [...allies, ...guests, ...enemies], round: 1, result: null,
    reinforcements, objectives: stage.jo?.objectives, terrainNames: stage.jo?.terrainNames, log: [`${stage.name} 전투 시작. 아군이 먼저 행동합니다.`],
  }
}

export function movementCost(map: readonly string[], point: Point, unit?: Unit) {
  const original = joTerrainId(map, point)
  if (original !== undefined) {
    const cost = unit?.jo?.terrain[30 + original] ?? 1
    return cost === 255 ? null : cost
  }
  const terrain = terrainAt(map, point)
  return terrain ? terrains[terrain].moveCost : null
}

function reachable(battle: Battle, unit: Unit, limit: number) {
  const start = { x: unit.x, y: unit.y, cost: 0, from: null as string | null, occupied: false }
  const cells = new Map([[key(start), start]])
  const others = battle.units.filter((other) => other !== unit && other.currentHP > 0)
  const occupied = new Set(others.map(key))
  const blocked = new Set(others.filter((other) => other.side !== unit.side).map(key))
  const pending = [start]
  while (pending.length) {
    pending.sort((a, b) => b.cost - a.cost)
    const cell = pending.pop()!
    if (cells.get(key(cell)) !== cell) continue
    for (const step of directions) {
      const point = { x: cell.x + step.x, y: cell.y + step.y }
      const moveCost = movementCost(battle.map, point, unit)
      if (moveCost == null || blocked.has(key(point))) continue
      const cost = cell.cost + moveCost
      if (cost > limit || cost >= (cells.get(key(point))?.cost ?? Infinity)) continue
      const next = { ...point, cost, from: key(cell), occupied: occupied.has(key(point)) }
      cells.set(key(point), next)
      pending.push(next)
    }
  }
  return [...cells.values()]
}

export function movementLimit(unit: Unit) {
  const kind = unit.troopClass ?? troopClassFor(unit.role, unit.jo?.classId)
  if (kind === 'cavalry') return 6
  if (kind === 'infantry' || kind === 'ranged') return 5
  return unit.move
}

export function movesFor(battle: Battle, unit: Unit, includePassThrough = false) {
  return battle.result || unit.side !== 'ally' || unit.guest || unit.moved || unit.done || unit.currentHP <= 0 || (unit.pinnedUntil ?? 0) >= battle.round
    ? [] : reachable(battle, unit, movementLimit(unit)).filter(({ cost, occupied }) => cost > 0 && (includePassThrough || !occupied))
}

function rangedReach(x: number, y: number) {
  return x + y > 0 && x <= 2 && y <= 2 && x + y <= 3
}

function withinRange(unit: Unit, point: Point, fire: boolean, origin: Point = unit) {
  const kind = fire ? undefined : unit.troopClass ?? troopClassFor(unit.role, unit.jo?.classId)
  if (kind === 'infantry' || kind === 'cavalry' || kind === 'ranged') {
    const x = Math.abs(point.x - origin.x)
    const y = Math.abs(point.y - origin.y)
    return kind === 'ranged' ? rangedReach(x, y) : x + y > 0 && x <= 1 && y <= 1
  }
  const steps = distance(origin, point)
  if (!fire && unit.jo) {
    const pattern = unit.jo.pattern
    return steps > 0 && (pattern === 'all' || pattern.some(({ x, y }) => x === point.x - origin.x && y === point.y - origin.y))
  }
  return steps > 0 && steps <= (fire ? FIRE_RANGE : unit.range)
}

export function attackCells(unit: Unit, fire = false, map?: readonly string[]) {
  const cells: Point[] = []
  for (let y = 0; y < (map?.length ?? HEIGHT); y++) {
    for (let x = 0; x < (map?.[y].length ?? WIDTH); x++) {
      const point = { x, y }
      if (withinRange(unit, point, fire)) cells.push(point)
    }
  }
  return cells
}

export const hasTactics = (unit: Unit) => unit.jo?.hasTactics ?? roles[unit.role].group === '문관계'

export function canAttack(attacker: Unit, target: Unit, fire = false) {
  if (attacker.confusedUntil !== undefined) return false
  if (attacker.currentHP <= 0 || target.currentHP <= 0 || attacker.side === target.side || attacker.done) return false
  if (fire && (!hasTactics(attacker) || attacker.currentMP < FIRE_COST)) return false
  return withinRange(attacker, target, fire)
}

export function movementPath(cells: ReturnType<typeof movesFor>, destination: Point) {
  const byKey = new Map(cells.map((cell) => [key(cell), cell]))
  const path: Point[] = []
  let cell = byKey.get(key(destination))
  if (cell?.occupied) return path
  while (cell) {
    path.unshift({ x: cell.x, y: cell.y })
    cell = cell.from === null ? undefined : byKey.get(cell.from)
  }
  return path
}

function note(battle: Battle, message: string) {
  battle.log = [...battle.log.slice(-9), message]
}

function updateResult(battle: Battle) {
  if (!battle.units.some((unit) => unit.captain && unit.currentHP > 0)) {
    battle.result = 'loss'
    note(battle, '총대장이 쓰러졌습니다.')
  } else if (!battle.units.some((unit) => unit.side === 'enemy' && unit.currentHP > 0
    && (!battle.objectives || battle.objectives.includes(unit.name)))) {
    battle.result = 'win'
    note(battle, battle.objectives ? `${battle.objectives.join('·')}을 격파했습니다.` : '적군을 모두 격파했습니다.')
  }
}

const defaultAttributes = [75, 70, 75] as const
export function isSoldier(unit: Unit) {
  return (unit.side === 'enemy' || unit.guest) && (unit.enemyKind ?? enemyKindFor(unit.name)) === 'soldier'
}

export function attributesOf({ name, jo, soldier }: { name: string; jo?: JoProfile; soldier?: boolean }) {
  const local = officerAttributes[name]
  const original = jo?.attributes
  const attributes = original
    ? [...[original[0], original[2], original[1]].map((value) => value * 2), ...(local ? [local[3]] : [])]
    : local ?? defaultAttributes
  return soldier ? attributes.map((value) => Math.min(value, 50)) : attributes
}

function battleAttributes(unit: Unit) {
  return attributesOf({ ...unit, soldier: isSoldier(unit) })
}

export function physicalStats(map: readonly string[], unit: Unit) {
  const [force, , leadership] = battleAttributes(unit)
  const original = joTerrainId(map, unit)
  const growth = unit.jo ? [unit.jo.growth[0], unit.jo.growth[1]] : roles[unit.role].growth
  const level = unit.level ?? 1
  const terrain = terrainAt(map, unit)
  const terrainFactor = original !== undefined && unit.jo ? unit.jo.terrain[original]
    : unit.role === 'shieldInfantry' && (terrain === 'f' || terrain === 'w') ? 11 : 10
  const effective = (attribute: number, classGrowth: number, bonus = 0) => {
    // The source stores attributes on a 0–50 scale and averages both growth ranks.
    const base = Math.floor(attribute / 2)
    const aptitude = base >= 50 ? 5 : base >= 45 ? 4 : base >= 35 ? 3 : base >= 25 ? 2 : 1
    const stat = base + level * Math.floor((classGrowth + aptitude) / 2) + bonus
    return Math.max(1, Math.floor(stat * terrainFactor / 10))
  }
  return {
    level,
    terrainPercent: terrainFactor * 10,
    attack: effective(force, growth[0], unit.attack) * TROOP_SCALE,
    defense: effective(leadership, growth[1], unit.defense) * TROOP_SCALE,

  }
}

export function basicPhysicalDamage(level: number, attack: number, defense: number) {
  return Math.max(1, level + 25 + Math.trunc((attack - defense) / 2))
}

// Provisional for tactics until the supplied 7.0 tactic formula is verified.
function hitRate(ratio: number) {
  if (ratio >= 1) return Math.min(100, Math.floor(80 + 10 * ratio))
  if (ratio >= 0.5) return Math.floor(30 + 60 * ratio)
  return Math.max(30, Math.floor(90 * ratio))
}

function canCounter(defender: Unit, attacker: Unit) {
  return defender.confusedUntil === undefined && defender.currentHP > 0 && attacker.currentHP > 0 && withinRange(defender, attacker, false)
}

export function forecastAttack(battle: Battle, attacker: Unit, target: Unit, kind: BattleImpact['kind'] = 'attack') {
  const [, intelligence] = battleAttributes(attacker)
  const [, resistance] = battleAttributes(target)
  if (kind === 'fire') {
    return {
      hit: hitRate(intelligence / Math.max(1, resistance)),
      damage: Math.max(3, attacker.attack + 6 + Math.trunc((intelligence - resistance) / 10)) * TROOP_SCALE,
      counter: false,
    }
  }
  const source = physicalStats(battle.map, attacker)
  const recipient = physicalStats(battle.map, target)
  const base = basicPhysicalDamage(source.level, source.attack / TROOP_SCALE, recipient.defense / TROOP_SCALE)
  return {
    hit: 100,
    // 7.0 applies this reduction before additional effects and damage variance.
    damage: (kind === 'counter' ? Math.max(1, Math.floor(base * 0.75)) : base) * TROOP_SCALE,
    counter: kind === 'attack' && canCounter(target, attacker),
  }
}

function damageUnit(battle: Battle, unit: Unit, damage: number, source?: string) {
  if (unit.currentHP <= 0) return
  unit.currentHP = Math.max(0, unit.currentHP - damage)
  const xp = battle.experience
  if (!xp || unit.side !== 'enemy' || unit.currentHP > 0) return
  const base = (unit.level ?? 1) * ((unit.enemyKind ?? enemyKindFor(unit.name)) === 'officer' ? 30 : 15)
  for (const id of xp.deployed) {
    xp.earned[id] = (xp.earned[id] ?? 0) + Math.floor(base * (id === source ? 100 : 80) / 100)
  }
  for (const id of xp.reserves) xp.earned[id] = (xp.earned[id] ?? 0) + Math.floor(base / 2)
}

function applyImpact(battle: Battle, source: Unit, recipient: Unit, kind: BattleImpact['kind'], roll: () => number, art?: { name: string; percent: number }) {
  const prediction = forecastAttack(battle, source, recipient, kind)
  const blocked = roll() >= prediction.hit
  const damage = blocked ? 0 : Math.floor(prediction.damage * (art?.percent ?? 100) / 100)
  const facing = facingBetween(source, recipient)
  source.facing = facing
  damageUnit(battle, recipient, damage, source.id)
  battle.events!.push({ impact: {
    attacker: source.id, target: recipient.id, kind, facing, damage,
    remainingHP: recipient.currentHP, blocked,
  } })
  const label = art?.name ?? (kind === 'counter' ? '반격' : kind === 'fire' ? '화계' : '공격')
  const outcome = blocked ? (kind === 'fire' ? '책략 실패' : '방어') : `${damage} 피해`
  note(battle, `${source.name} → ${recipient.name} · ${label} · ${outcome}${recipient.currentHP ? '' : ' · 격파'}`)
}

function strike(battle: Battle, attacker: Unit, target: Unit, fire: boolean, roll: () => number) {
  attacker.done = true
  if (fire) {
    attacker.currentMP -= FIRE_COST
    applyImpact(battle, attacker, target, 'fire', roll)
  } else {
    applyImpact(battle, attacker, target, 'attack', roll)
    if (canCounter(target, attacker)) applyImpact(battle, target, attacker, 'counter', roll)
  }
  updateResult(battle)
}

export function warArtsFor(unit: Unit) {
  const troop = unit.troopClass ?? troopClassFor(unit.role, unit.jo?.classId)
  return (officerById[unit.id]?.warArts ?? []).filter(({ id }) => {
    const art = warArts[id]
    return 'effect' in art || art.troop === troop
  })
}

export function warArtCells(battle: Battle, unit: Unit, art: WarArtId) {
  const definition = warArts[art]
  if ('effect' in definition && definition.effect === 'self') return [{ x: unit.x, y: unit.y }]
  const ranged = ('troop' in definition && definition.troop === 'ranged') || art === 'mountedShot'
  return battle.map.flatMap((row, y) => Array.from(row, (_, x) => ({ x, y })).filter((point) => {
    const dx = Math.abs(point.x - unit.x)
    const dy = Math.abs(point.y - unit.y)
    return ranged ? rangedReach(dx, dy) || (art === 'longShot' && dx + dy === 3 && (!dx || !dy))
      : dx + dy > 0 && dx <= 1 && dy <= 1 && (art !== 'charge' || !blocksCharge(battle, point))
  }))
}

function terrainName(battle: Battle, point: Point) {
  const id = joTerrainId(battle.map, point)
  return id === undefined ? '' : battle.terrainNames?.[id] ?? ''
}

function blocksCharge(battle: Battle, point: Point) {
  return /성벽|성문|닫힌 관문|벽/.test(terrainName(battle, point)) || terrainAt(battle.map, point) === 'm'
}

export function warArtArea(battle: Battle, unit: Unit, art: WarArtId, target: Point) {
  const dx = target.x - unit.x
  const dy = target.y - unit.y
  let points = [target]
  if (art === 'sweep') {
    const ring = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]
    const direction = ring.findIndex(([x, y]) => x === dx && y === dy)
    points = [-1, 0, 1].map((offset) => {
      const [x, y] = ring[(direction + offset + 8) % 8]
      return { x: unit.x + x, y: unit.y + y }
    })
  } else if (art === 'barrage') {
    points = [target, ...directions.map(({ x, y }) => ({ x: target.x + x, y: target.y + y }))]
  } else if (art === 'charge') {
    points = []
    for (let step = 1; step <= 3; step++) {
      const point = { x: unit.x + dx * step, y: unit.y + dy * step }
      if (!validCell(point, battle.map) || blocksCharge(battle, point)) break
      points.push(point)
    }
  }
  return points.filter((point) => validCell(point, battle.map))
}

export function warArtEffect(unit: Unit, target: Unit, id: WarArtId) {
  if (unit.confusedUntil !== undefined) return null
  const learned = warArtsFor(unit).find((art) => art.id === id)
  if (!learned || unit.currentMP < warArtWill(id) || unit.usedWarArts?.includes(id)
    || unit.done || unit.currentHP <= 0 || target.currentHP <= 0) return null
  const art = warArts[id]
  const sameSide = target.side === unit.side
  if (!('effect' in art)) return sameSide ? null : { level: learned.level }
  if (art.effect === 'self' ? target.id !== unit.id
    : art.effect === 'enemy' ? sameSide : !sameSide || target.id === unit.id) return null
  const amount = art.amount[learned.level - 1]
  if (art.effect === 'heal') {
    const hp = Math.min(target.hp - target.currentHP, Math.max(1, Math.floor(target.hp * amount / 100)))
    const pinned = target.pinnedUntil !== undefined
    const confused = target.confusedUntil !== undefined
    return hp > 0 || pinned || confused ? { hp, pinned, confused } : null
  }
  const will = art.effect === 'enemy' ? -Math.min(amount, target.currentMP) : Math.min(amount, target.mp - target.currentMP)
  return will ? { will } : null
}

function useWarArt(battle: Battle, unit: Unit, target: Unit, id: WarArtId, roll: () => number) {
  const effect = warArtEffect(unit, target, id)
  if (!effect || !warArtCells(battle, unit, id).some((point) => key(point) === key(target))) return false
  const art = warArts[id]
  unit.done = true
  unit.usedWarArts = [...(unit.usedWarArts ?? []), id]
  if ('will' in effect && effect.will !== undefined) {
    target.currentMP += effect.will
    note(battle, `${art.name} · ${target.name} 의지 ${effect.will > 0 ? '+' : ''}${effect.will}`)
    return true
  }
  if ('hp' in effect && effect.hp !== undefined) {
    const status = controlStatus(target)
    target.currentHP += effect.hp
    delete target.pinnedUntil
    delete target.confusedUntil
    note(battle, `${art.name} · ${target.name} 병력 +${effect.hp}${status ? ` · ${status} 해제` : ''}`)
    return true
  }
  if (!('damage' in art) || !effect.level) return false
  const area = warArtArea(battle, unit, id, target)
  const targets = area.map((point) => unitAt(battle, point)).filter((foe): foe is Unit => !!foe && foe.side !== unit.side)
  const damage = { name: art.name, percent: art.damage[effect.level - 1] }
  for (const foe of targets) {
    applyImpact(battle, unit, foe, 'attack', roll, damage)
    if (id === 'doubleStrike' && foe.currentHP > 0) applyImpact(battle, unit, foe, 'attack', roll, damage)
    if (foe.currentHP <= 0) continue
    if (id === 'disrupt' || id === 'ambush') {
      const base = id === 'disrupt' ? 65 : 50
      const difference = battleAttributes(unit)[0] - battleAttributes(foe)[0]
      const chance = Math.min(id === 'disrupt' ? 85 : 75, Math.max(id === 'disrupt' ? 35 : 25, base + difference))
      if (roll() < chance) {
        const until = battle.round + Number(foe.side === 'ally')
        if (id === 'disrupt') foe.pinnedUntil = until
        else foe.confusedUntil = until
        note(battle, `${foe.name} · ${controlStatus(foe)}`)
      }
    }
    if (id === 'shove') {
      const point = { x: 2 * foe.x - unit.x, y: 2 * foe.y - unit.y }
      if (validCell(point, battle.map) && !unitAt(battle, point) && movementCost(battle.map, point, foe) !== null) {
        followPath(battle, foe, [point])
      }
    }
  }
  if (id === 'fireArrow' && (/숲|삼림|초원/.test(terrainName(battle, target)) || ['f', 'p', 'g'].includes(terrainAt(battle.map, target) ?? ''))) {
    battle.burning = [...(battle.burning ?? []).filter((point) => key(point) !== key(target)), { x: target.x, y: target.y, round: battle.round, source: unit.id }]
  }
  if (id !== 'shove' && id !== 'mountedShot') {
    for (const foe of targets) {
      if (canCounter(foe, unit)) applyImpact(battle, foe, unit, 'counter', roll)
    }
  }
  updateResult(battle)
  return true
}

function followPath(battle: Battle, unit: Unit, path: Point[]) {
  const end = path.at(-1)
  if (!end) return
  const start = { x: unit.x, y: unit.y }
  unit.facing = facingBetween(path.at(-2) ?? start, end)
  unit.x = end.x
  unit.y = end.y
  battle.events!.push({ move: { unit: unit.id, path: [start, ...path] } })
}

function automatedTurn(battle: Battle, units: Unit[], roll: () => number) {
  for (const unit of units) {
    if (unit.currentHP <= 0) continue
    const opponents = battle.units.filter((target) => target.side !== unit.side && target.currentHP > 0)
    unit.done = false
    const move = movementLimit(unit)
    const limit = unit.behavior === 2 || (unit.pinnedUntil ?? 0) >= battle.round ? 0 : unit.behavior === 0 ? move : Infinity
    const positions = reachable(battle, unit, limit)
    let plan: { position: typeof positions[number]; target: Unit } | undefined
    for (const position of positions) {
      if (position.occupied) continue
      if (plan && plan.position.cost < position.cost) continue
      for (const target of opponents) {
        if (plan && plan.position.cost === position.cost && plan.target.currentHP <= target.currentHP) continue
        if (withinRange(unit, target, false, position)) plan = { position, target }
      }
    }
    if (!plan) continue
    const path = movementPath(positions.filter(({ cost }) => cost > 0), plan.position)
    const reachableCells = new Set(positions.filter(({ cost }) => cost <= move).map(key))
    const steps = path.filter((point) => reachableCells.has(key(point)))
    while (steps.length && unitAt(battle, steps[steps.length - 1])) steps.pop()
    followPath(battle, unit, steps)
    if (canAttack(unit, plan.target)) strike(battle, unit, plan.target, false, roll)
    if (battle.result) return
  }
}

function expireStatus(units: Unit[], round: number) {
  for (const unit of units) {
    if ((unit.pinnedUntil ?? Infinity) <= round) delete unit.pinnedUntil
    if ((unit.confusedUntil ?? Infinity) <= round) delete unit.confusedUntil
  }
}

function applyBurning(battle: Battle, side: Unit['side']) {
  for (const tile of battle.burning ?? []) {
    const unit = unitAt(battle, tile)
    if (unit?.side !== side) continue
    const damage = Math.max(1, Math.floor(unit.hp / 10))
    damageUnit(battle, unit, damage, tile.source)
    note(battle, `${unit.name} · 화시 화재로 ${damage} 피해`)
  }
  updateResult(battle)
}

function enemyTurn(battle: Battle, roll: () => number) {
  const guests = battle.units.filter((unit) => unit.guest && unit.currentHP > 0)
  automatedTurn(battle, guests, roll)
  if (battle.result) return
  note(battle, `${battle.round}턴 · 적군 행동`)
  if (guests.length) battle.events!.push({ turn: 'enemy' })
  const enemies = battle.units.filter((unit) => unit.side === 'enemy')
  expireStatus(battle.units.filter((unit) => unit.side === 'ally'), battle.round)
  applyBurning(battle, 'enemy')
  if (battle.result) return
  automatedTurn(battle, enemies, roll)
  if (battle.result) return
  expireStatus(enemies, battle.round)
  battle.round++
  if (battle.burning) battle.burning = battle.burning.filter((tile) => battle.round < tile.round + 2)
  if (battle.reinforcements?.length) {
    const available = battle.reinforcements.filter((unit) => !unitAt(battle, unit))
    battle.units.push(...available.map((unit) => ({ ...unit })))
    battle.reinforcements = battle.reinforcements.filter((unit) => !available.includes(unit))
    if (available.length) note(battle, `우군 증원 · ${available.map(({ name }) => name).join('·')}`)
  }
  for (const unit of battle.units) {
    unit.moved = false
    unit.done = false
  }
  note(battle, `${battle.round}턴 · 아군 행동`)
  applyBurning(battle, 'ally')
}

export function playBattle(previous: Battle, stock: Record<ItemId, number>, action: BattleAction, seed = 1) {
  let randomState = seed >>> 0
  const roll = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0
    return randomState / 4294967296 * 100
  }
  const unchanged = { battle: previous, inventory: stock }
  if (previous.result) return unchanged
  const pending = previous.pendingMove
  if (pending && (action.type === 'end' || action.unit !== pending.unit)) return unchanged
  const battle: Battle = { ...previous, units: previous.units.map((unit) => ({ ...unit })), events: [] }
  if (previous.experience) battle.experience = { ...previous.experience, earned: { ...previous.experience.earned } }
  let inventory = stock
  if (action.type === 'end') {
    enemyTurn(battle, roll)
    return { battle, inventory }
  }
  const unit = battle.units.find(({ id }) => id === action.unit)
  if (!unit || unit.side !== 'ally' || unit.guest || unit.done || unit.currentHP <= 0) return unchanged
  switch (action.type) {
    case 'move': {
      if (unit.moved) return unchanged
      const path = movementPath(movesFor(battle, unit, true), action.to)
      if (!path.length && distance(unit, action.to) !== 0) return unchanged
      battle.pendingMove = { unit: unit.id, origin: { x: unit.x, y: unit.y }, facing: unit.facing }
      followPath(battle, unit, path)
      unit.moved = true
      break
    }
    case 'cancel-move':
      if (!pending) return unchanged
      Object.assign(unit, pending.origin)
      if (pending.facing) unit.facing = pending.facing
      else delete unit.facing
      unit.moved = false
      delete battle.pendingMove
      break
    case 'attack':
    case 'fire': {
      const target = battle.units.find(({ id }) => id === action.target)
      if (!target || !canAttack(unit, target, action.type === 'fire')) return unchanged
      strike(battle, unit, target, action.type === 'fire', roll)
      break
    }
    case 'warArt': {
      const target = battle.units.find(({ id }) => id === action.target)
      if (!target || !useWarArt(battle, unit, target, action.art, roll)) return unchanged
      break
    }
    case 'item': {
      if (!stock[action.item]) return unchanged
      const healHP = action.item === 'salve'
      const current = healHP ? 'currentHP' : 'currentMP'
      const max = healHP ? unit.hp : unit.mp
      const amount = Math.min(max - unit[current], healHP ? SALVE_HEAL : 8)
      if (!amount) return unchanged
      unit[current] += amount
      unit.done = true
      inventory = { ...stock, [action.item]: stock[action.item] - 1 }
      note(battle, `${unit.name} · ${healHP ? '병력' : '의지'} ${amount} 회복`)
      break
    }
    case 'wait':
      unit.done = true
      break
  }
  if (unit.done) delete battle.pendingMove
  return { battle, inventory }
}

export function validCell({ x, y }: Point, map: readonly string[]) {
  return x >= 0 && y >= 0 && x < (map[y]?.length ?? 0)
}
