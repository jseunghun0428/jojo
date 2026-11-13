import { HEIGHT, WIDTH, officerById, roles, treasureById } from './data.ts'
import type { ItemId, Point, Role, Stage, Stats, Terrain } from './data.ts'
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
export const terrainNames: Record<Terrain, string> = { '.': '평지', f: '수풀', m: '바위', w: '물', '=': '길' }
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
export const terrainAt = (map: readonly string[], { x, y }: Point) => map[y]?.[x] as Terrain | undefined
export const unitAt = (battle: Battle, point: Point) => battle.units.find((unit) => unit.currentHP > 0 && distance(unit, point) === 0)

function makeUnit(id: string, name: string, role: Role, side: Unit['side'], position: Point, stats: Stats, captain = false): Unit {
  return { ...position, ...stats, id, name, role, side, captain, currentHP: stats.hp, currentMP: stats.mp, moved: false, done: false }
}

export function newBattle(stage: Stage, lineup: string[], captain: string, equipment: Record<string, string>): Battle {
  const ordered = [captain, ...lineup.filter((id) => id !== captain)]
  const allies = ordered.map((id, i) => {
    const officer = officerById[id]
    const { hp, mp, attack, defense, move, range } = roles[officer.role]
    const stats = { hp: hp + officer.bonus * 4, mp, attack: attack + officer.bonus, defense, move, range }
    const treasure = treasureById[equipment[id]]
    if (treasure) stats[treasure.stat] += treasure.amount
    return makeUnit(id, officer.name, officer.role, 'ally', deployment[i], stats, id === captain)
  })
  const enemies = stage.enemies.map(({ x, y, role, name }, i) => {
    const { hp, mp, attack, defense, move, range } = roles[role]
    const tier = stage.tier
    const stats = { hp: Math.floor(hp * 0.65) + tier * 4, mp, attack: attack - 5 + tier, defense: Math.max(0, defense - 2 + tier), move, range }
    return makeUnit(`enemy-${i}`, name, role, 'enemy', { x, y }, stats)
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
      if (!terrain || terrain === 'm' || terrain === 'w' || blocked.has(key(point))) continue
      const cost = cell.cost + (terrain === 'f' ? 2 : 1)
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
  if (fire && (attacker.role !== 'sage' || attacker.currentMP < FIRE_COST)) return false
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

// The 7.0 manual describes modifiers. The original game's published rates are
// a provisional baseline until the supplied 7.0 engine is verified directly.
function hitRate(ratio: number) {
  if (ratio >= 1) return Math.min(100, Math.floor(80 + 10 * ratio))
  if (ratio >= 0.5) return Math.floor(30 + 60 * ratio)
  return Math.max(30, Math.floor(90 * ratio))
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
  const [force, intelligence, , agility, morale] = attributesOf(attacker)
  const [, resistance, leadership, targetAgility, targetMorale] = attributesOf(target)
  if (kind === 'fire') {
    return {
      hit: hitRate((intelligence + morale) / (resistance + targetMorale)),
      damage: Math.max(3, attacker.attack + 6 + Math.trunc((intelligence - resistance) / 10)),
      critical: 0, followUp: 0, counter: false,
    }
  }
  const cover = terrainAt(battle.map, target) === 'f' ? 2 : 0
  const base = Math.max(3, attacker.attack - target.defense - cover + Math.trunc((force - leadership) / 10))
  return {
    hit: hitRate(agility / targetAgility),
    damage: kind === 'counter' ? Math.max(1, Math.floor(base * 0.75)) : base,
    critical: followUpRate(morale / targetMorale),
    followUp: kind === 'attack' ? followUpRate(agility / targetAgility) : 0,
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
