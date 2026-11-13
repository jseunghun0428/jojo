import { roles } from './unit-classes.ts'
import type { Role } from './unit-classes.ts'
import { HEIGHT, WIDTH, isTerrain, officerById, terrains, treasureById } from './data.ts'
import type { ItemId, Point, Stage, Stats } from './data.ts'
import { officerAttributes } from './officer-attributes.ts'

export type Facing = 'down' | 'up' | 'left' | 'right'
export type UnitMovement = { unit: string; path: Point[] }
export type BattleImpact = {
  attacker: string; target: string; kind: 'attack' | 'counter' | 'fire'
  facing: Facing; damage: number; remainingHP: number; blocked: boolean; critical: boolean
}
export type BattleEvent = { move: UnitMovement } | { impact: BattleImpact }

export type Unit = Point & Stats & {
  id: string; name: string; role: Role; side: 'ally' | 'enemy'; captain: boolean;
  currentHP: number; currentMP: number; moved: boolean; done: boolean
  level?: number
  facing?: Facing
}
export type Battle = {
  map: readonly string[]; units: Unit[]; round: number; result: 'win' | 'loss' | null; log: string[]
  events?: BattleEvent[]
  pendingMove?: { unit: string; origin: Point; facing?: Facing }
}
export type BattleAction =
  | { type: 'move'; unit: string; to: Point }
  | { type: 'cancel-move'; unit: string }
  | { type: 'attack' | 'fire'; unit: string; target: string }
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
  return { ...position, ...stats, id, name, role, side, captain, level, currentHP: stats.hp, currentMP: stats.mp, moved: false, done: false }
}

export function unitStats(role: Role, tier: number, officer?: { bonus: number; treasure?: string }): Stats {
  const { hp, mp, attack, defense, move, range } = roles[role]
  if (!officer) return { hp: Math.floor(hp * 0.65) + tier * 4, mp, attack: attack - 5 + tier, defense: Math.max(0, defense - 2 + tier), move, range }
  const stats: Stats = { hp: hp + officer.bonus * 4, mp, attack: attack + officer.bonus, defense, move, range }
  const treasure = officer.treasure ? treasureById[officer.treasure] : undefined
  if (treasure) stats[treasure.stat] += treasure.amount
  return stats
}

export function newBattle(stage: Stage, lineup: string[], captain: string, equipment: Record<string, string>): Battle {
  const ordered = [captain, ...lineup.filter((id) => id !== captain)]
  const allies = ordered.map((id, i) => {
    const { name, role, bonus } = officerById[id]
    const stats = unitStats(role, stage.tier, { bonus, treasure: equipment[id] })
    return makeUnit(id, name, role, 'ally', deployment[i], stats, 1, id === captain)
  })
  const enemies = stage.enemies.map(({ x, y, role, name }, i) => {
    const stats = unitStats(role, stage.tier)
    return makeUnit(`enemy-${i}`, name, role, 'enemy', { x, y }, stats, 1 + stage.tier)
  })
  return { map: stage.map, units: [...allies, ...enemies], round: 1, result: null, log: [`${stage.name} 전투 시작. 아군이 먼저 행동합니다.`] }
}

function reachable(battle: Battle, unit: Unit, limit: number) {
  const start = { x: unit.x, y: unit.y, cost: 0, from: null as string | null }
  const cells = new Map([[key(start), start]])
  const blocked = new Set(battle.units.filter((other) => other !== unit && other.currentHP > 0).map(key))
  const pending = [start]
  while (pending.length) {
    pending.sort((a, b) => b.cost - a.cost)
    const cell = pending.pop()!
    if (cells.get(key(cell)) !== cell) continue
    for (const step of directions) {
      const point = { x: cell.x + step.x, y: cell.y + step.y }
      const terrain = terrainAt(battle.map, point)
      const moveCost = terrain && terrains[terrain].moveCost
      if (moveCost == null || blocked.has(key(point))) continue
      const cost = cell.cost + moveCost
      if (cost > limit || cost >= (cells.get(key(point))?.cost ?? Infinity)) continue
      const next = { ...point, cost, from: key(cell) }
      cells.set(key(point), next)
      pending.push(next)
    }
  }
  return [...cells.values()]
}

export function movesFor(battle: Battle, unit: Unit) {
  return battle.result || unit.side !== 'ally' || unit.moved || unit.done || unit.currentHP <= 0
    ? [] : reachable(battle, unit, unit.move).filter(({ cost }) => cost > 0)
}

function withinRange(unit: Unit, point: Point, fire: boolean) {
  const steps = distance(unit, point)
  return steps > 0 && steps <= (fire ? FIRE_RANGE : unit.range)
}

export function attackCells(unit: Unit, fire = false) {
  const cells: Point[] = []
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const point = { x, y }
      if (withinRange(unit, point, fire)) cells.push(point)
    }
  }
  return cells
}

export function canAttack(attacker: Unit, target: Unit, fire = false) {
  if (attacker.currentHP <= 0 || target.currentHP <= 0 || attacker.side === target.side || attacker.done) return false
  if (fire && (roles[attacker.role].group !== '문관계' || attacker.currentMP < FIRE_COST)) return false
  return withinRange(attacker, target, fire)
}

export function movementPath(cells: ReturnType<typeof movesFor>, destination: Point) {
  const byKey = new Map(cells.map((cell) => [key(cell), cell]))
  const path: Point[] = []
  let cell = byKey.get(key(destination))
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
  } else if (!battle.units.some((unit) => unit.side === 'enemy' && unit.currentHP > 0)) {
    battle.result = 'win'
    note(battle, '적군을 모두 격파했습니다.')
  }
}

const defaultAttributes = [75, 70, 75, 75, 75] as const
const attributesOf = (unit: Unit) => officerAttributes[unit.name] ?? defaultAttributes

export function physicalStats(map: readonly string[], unit: Unit) {
  const [force, , leadership, agility] = attributesOf(unit)
  const { growth } = roles[unit.role]
  const level = unit.level ?? 1
  const terrain = terrainAt(map, unit)
  const terrainFactor = unit.role === 'shieldInfantry' && (terrain === 'f' || terrain === 'w') ? 11 : 10
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
    attack: effective(force, growth[0], unit.attack),
    defense: effective(leadership, growth[1], unit.defense),
    agility: effective(agility, growth[2]),
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

// Base physical accuracy in the supplied 7.0 executable (0x43b5e0–0x43b675).
// The engine truncates half and one-third thresholds before using them.
export function physicalHitRate(attackAgility: number, defenseAgility: number) {
  if (attackAgility >= defenseAgility * 2) return 100
  if (attackAgility >= defenseAgility) {
    return 90 + Math.floor(10 * (attackAgility - defenseAgility) / defenseAgility)
  }
  const half = Math.floor(defenseAgility / 2)
  if (attackAgility >= half) return 60 + Math.floor(30 * (attackAgility - half) / half)
  const third = Math.floor(defenseAgility / 3)
  if (attackAgility <= third) return 30
  return 30 + Math.floor(30 * (attackAgility - third) / third)
}

function followUpRate(ratio: number) {
  if (ratio >= 2) return Math.min(100, Math.floor(80 * ratio - 140))
  if (ratio >= 1) return Math.floor(18 * ratio - 16)
  return 1
}

function canCounter(defender: Unit, attacker: Unit) {
  return defender.currentHP > 0 && attacker.currentHP > 0 && withinRange(defender, attacker, false)
}

export function forecastAttack(battle: Battle, attacker: Unit, target: Unit, kind: BattleImpact['kind'] = 'attack') {
  const [, intelligence, , , morale] = attributesOf(attacker)
  const [, resistance, , , targetMorale] = attributesOf(target)
  if (kind === 'fire') {
    return {
      hit: hitRate((intelligence + morale) / (resistance + targetMorale)),
      damage: Math.max(3, attacker.attack + 6 + Math.trunc((intelligence - resistance) / 10)),
      critical: 0, followUp: 0, counter: false,
    }
  }
  const source = physicalStats(battle.map, attacker)
  const recipient = physicalStats(battle.map, target)
  const base = basicPhysicalDamage(source.level, source.attack, recipient.defense)
  return {
    hit: physicalHitRate(source.agility, recipient.agility),
    // 7.0 applies this reduction before additional effects and damage variance.
    damage: kind === 'counter' ? Math.max(1, Math.floor(base * 0.75)) : base,
    critical: followUpRate(morale / targetMorale),
    followUp: kind === 'attack' ? followUpRate(source.agility / recipient.agility) : 0,
    counter: kind === 'attack' && canCounter(target, attacker),
  }
}

function strike(battle: Battle, attacker: Unit, target: Unit, fire: boolean, roll: () => number) {
  function impact(source: Unit, recipient: Unit, kind: BattleImpact['kind'], multiplier = 1) {
    const prediction = forecastAttack(battle, source, recipient, kind)
    const blocked = roll() >= prediction.hit
    const critical = !blocked && prediction.critical > 0 && roll() < prediction.critical
    const damage = blocked ? 0 : Math.max(1, Math.floor(prediction.damage * multiplier * (critical ? 1.5 : 1)))
    const facing = facingBetween(source, recipient)
    source.facing = facing
    recipient.currentHP = Math.max(0, recipient.currentHP - damage)
    battle.events!.push({ impact: {
      attacker: source.id, target: recipient.id, kind, facing, damage,
      remainingHP: recipient.currentHP, blocked, critical,
    } })
    const label = kind === 'counter' ? '반격' : kind === 'fire' ? '화계' : multiplier < 1 ? '2회 공격' : '공격'
    const outcome = blocked ? (kind === 'fire' ? '책략 실패' : '방어') : `${critical ? '회심의 일격 · ' : ''}${damage} 피해`
    note(battle, `${source.name} → ${recipient.name} · ${label} · ${outcome}${recipient.currentHP ? '' : ' · 격파'}`)
  }

  attacker.done = true
  if (fire) {
    attacker.currentMP -= FIRE_COST
    impact(attacker, target, 'fire')
  } else {
    const { followUp } = forecastAttack(battle, attacker, target)
    impact(attacker, target, 'attack')
    if (target.currentHP > 0 && roll() < followUp) impact(attacker, target, 'attack', 0.75)
    if (canCounter(target, attacker)) impact(target, attacker, 'counter')
  }
  updateResult(battle)
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

function enemyTurn(battle: Battle, roll: () => number) {
  note(battle, `${battle.round}턴 · 적군 행동`)
  for (const enemy of battle.units.filter((unit) => unit.side === 'enemy' && unit.currentHP > 0)) {
    const allies = battle.units.filter((unit) => unit.side === 'ally' && unit.currentHP > 0)
    enemy.done = false
    const positions = reachable(battle, enemy, Infinity)
    const targets = allies.flatMap((target) => positions
      .filter((position) => distance(position, target) <= enemy.range)
      .map((position) => ({ position, target })))
      .sort((a, b) => a.position.cost - b.position.cost || a.target.currentHP - b.target.currentHP)
    const plan = targets[0]
    if (!plan) continue
    const path = movementPath(positions.filter(({ cost }) => cost > 0), plan.position)
    const reachableCells = new Set(positions.filter(({ cost }) => cost <= enemy.move).map(key))
    followPath(battle, enemy, path.filter((point) => reachableCells.has(key(point))))
    if (canAttack(enemy, plan.target)) strike(battle, enemy, plan.target, false, roll)
    if (battle.result) return
  }
  battle.round++
  for (const unit of battle.units) {
    unit.moved = false
    unit.done = false
  }
  note(battle, `${battle.round}턴 · 아군 행동`)
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
  let inventory = stock
  if (action.type === 'end') {
    enemyTurn(battle, roll)
    return { battle, inventory }
  }
  const unit = battle.units.find(({ id }) => id === action.unit)
  if (!unit || unit.side !== 'ally' || unit.done || unit.currentHP <= 0) return unchanged
  switch (action.type) {
    case 'move': {
      if (unit.moved) return unchanged
      const path = movementPath(movesFor(battle, unit), action.to)
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
    case 'item': {
      if (!stock[action.item]) return unchanged
      const healHP = action.item === 'salve'
      const current = healHP ? 'currentHP' : 'currentMP'
      const max = healHP ? unit.hp : unit.mp
      const amount = Math.min(max - unit[current], healHP ? 20 : 8)
      if (!amount) return unchanged
      unit[current] += amount
      unit.done = true
      inventory = { ...stock, [action.item]: stock[action.item] - 1 }
      note(battle, `${unit.name} · ${healHP ? 'HP' : 'MP'} ${amount} 회복`)
      break
    }
    case 'wait':
      unit.done = true
      break
  }
  if (unit.done) delete battle.pendingMove
  return { battle, inventory }
}

export function validCell({ x, y }: Point) {
  return x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT
}
