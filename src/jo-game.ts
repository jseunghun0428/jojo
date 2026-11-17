import { FIELD_LIMIT, STAGE_COUNT, enemyKindFor, officerById, stageDeployment, stages } from './data.ts'
import type { Point, Stage } from './data.ts'
import type { Facing } from './combat.ts'
import type { Role } from './unit-classes.ts'

type JoClass = { name: string; stats: number[]; terrain: number[]; tacticLevels: number[] }
type JoOfficer = { name: string; classId: number; attributes: number[]; hp: number; mp: number; level: number }
type Formation = Point & { officer: number; visibility: number; facing: Facing; levelOffset: number; behavior: number }
type Slot = Point & { slot: number; facing: Facing; hidden: boolean }
type JoStage = {
  name: string; image: string; mapId: number; map: number[][]
  enemies: Formation[]; guests: Formation[]; deployment: Slot[][]; openingReinforcements: number[]
}
export type JoPack = {
  version: 1; classes: JoClass[]; roster: JoOfficer[]; patterns: (Point[] | 'all')[]
  terrainNames: string[]; stages: JoStage[]
}

export type JoProfile = {
  id: number; classId: number; className: string; hasTactics: boolean
  hp: number; mp: number; level: number; move: number; growth: number[]
  attributes: number[]; terrain: number[]; pattern: Point[] | 'all'
}
type JoUnit = Point & { name: string; role: Role; jo: JoProfile; facing: Facing; levelOffset: number; behavior: number }
export type JoStageDetails = {
  image?: string; terrainNames: string[]; deployment: (Point & { facing: Facing })[]
  guests: JoUnit[]; reinforcements: JoUnit[]; objectives?: string[]
}
export type CampaignData = { stages: Stage[]; officers: Record<string, JoProfile>; source: 'web' | 'jo'; originals?: Stage[] }
export const webCampaign: CampaignData = { stages, officers: {}, source: 'web' }
export const fieldLimitFor = (stage: Stage) => Math.min(FIELD_LIMIT, stageDeployment(stage).length)
const assetRoot = '/jo-game/'
const terrainStart = 0x100
export const joTerrainRow = (row: readonly number[]) => String.fromCharCode(...row.map((id) => terrainStart + id))
export const JO_FIRE_TERRAIN = 26 // Mapatr.dll stores this as bitmap 100 + 26.
export function joTerrainId(map: readonly string[], point: Point) {
  const id = (map[point.y]?.charCodeAt(point.x) ?? 0) - terrainStart
  return id >= 0 && id < 30 ? id : undefined
}

export function createJoCampaign(pack: JoPack): CampaignData {
  function profile(id: number): JoProfile {
    const officer = pack.roster[id]
    const unitClass = pack.classes[officer.classId]
    return {
      id, classId: officer.classId, className: unitClass.name,
      hasTactics: unitClass.stats.slice(23, 27).some((allowed) => allowed === 1),
      hp: officer.hp, mp: officer.mp, level: officer.level, attributes: officer.attributes,
      move: unitClass.stats[0], growth: unitClass.stats.slice(2, 9), terrain: unitClass.terrain,
      pattern: pack.patterns[unitClass.stats[1]],
    }
  }
  const byName = new Map<string, number>()
  pack.roster.forEach(({ name }, id) => { if (!byName.has(name)) byName.set(name, id) })
  const officers: CampaignData['officers'] = {}
  for (const { name, id } of Object.values(officerById)) {
    const sourceId = byName.get(name)
    if (sourceId !== undefined) officers[id] = profile(sourceId)
  }
  const battleStages = pack.stages.map((source, index): Stage => {
    const occupied = new Set<string>()
    const inBounds = ({ x, y }: Point) => source.map[y]?.[x] !== undefined
    const position = ({ x, y }: Point) => `${x},${y}`
    function unique<T extends Point>(points: T[], taken: Set<string>) {
      return points.filter((point) => {
        const location = position(point)
        if (!inBounds(point) || taken.has(location)) return false
        taken.add(location)
        return true
      })
    }
    function units(formation: Formation[]): JoUnit[] {
      return formation.map(({ officer, x, y, facing, levelOffset, behavior }) => {
        const jo = profile(officer)
        const { stats } = pack.classes[jo.classId]
        const role: Role = stats[13] || stats[14] || stats[21] || stats[22] ? 'crossbowman'
          : jo.hasTactics ? 'tactician' : stats[3] >= 4 ? 'shieldInfantry' : 'lightInfantry'
        return { x, y, facing, levelOffset, behavior, jo, role, name: pack.roster[officer].name }
      })
    }
    const visible = source.enemies.filter(({ visibility }) => visibility === 0)
    const enemyFormation = visible.length ? visible : source.enemies.filter(({ visibility }) => visibility === 0xffff)
    const yeongcheonGuards = index === 0 ? enemyFormation
      .filter(({ y }) => y === 14)
      .map((guard) => ({ ...guard, y: 6 })) : []
    const enemies = unique(index === 0
      ? [...enemyFormation.filter(({ x, y }) => y <= 14 && !(x === 7 && y === 11) && !(x === 12 && y === 12)), ...yeongcheonGuards]
      : enemyFormation, occupied)
    const [primary, ...alternate] = source.deployment
    const slots = primary.filter(({ slot, x, y }) => slot === 0 || x !== 0 || y !== 0)
    const orderedSlots = [...slots, ...alternate.flat()].sort((a, b) => Number(a.hidden) - Number(b.hidden))
    const deployment: JoStageDetails['deployment'] = unique(orderedSlots, occupied)
      .slice(0, FIELD_LIMIT)
    // Some scenes vacate the whole player entry row through a scripted event.
    // Keep the enemy tiles and find the nearest open tile for the captain.
    if (!deployment.length && primary.length) {
      const first = primary[0]
      const open = source.map.flatMap((row, y) => row.flatMap((id, x) =>
        occupied.has(position({ x, y })) || pack.classes[0].terrain[30 + id] === 255 ? [] : [{ x, y, facing: first.facing }]))
      open.sort((a, b) => Math.abs(a.x - first.x) + Math.abs(a.y - first.y) - Math.abs(b.x - first.x) - Math.abs(b.y - first.y))
      const nearest = open[0]
      if (nearest) {
        deployment.push(nearest)
        occupied.add(position(nearest))
      }
    }
    const guests = index === 0 ? [] : unique(source.guests.filter(({ visibility }) => visibility === 0), occupied)
    const reinforcements = source.guests.filter(({ officer }) => source.openingReinforcements.includes(officer))
    if (deployment.length && deployment.length < FIELD_LIMIT) {
      const captain = deployment[0]
      const reserved = new Set(reinforcements.map(position))
      const open = source.map.flatMap((row, y) => row.flatMap((id, x) =>
        occupied.has(position({ x, y })) || reserved.has(position({ x, y })) || pack.classes[0].terrain[30 + id] === 255
          ? [] : [{ x, y, facing: captain.facing }]))
      open.sort((a, b) => Math.abs(a.x - captain.x) + Math.abs(a.y - captain.y)
        - Math.abs(b.x - captain.x) - Math.abs(b.y - captain.y))
      deployment.push(...open.slice(0, FIELD_LIMIT - deployment.length))
    }
    if (!deployment.length || !enemies.length) throw new Error(`전장 ${source.mapId}의 출전 좌표를 구성할 수 없습니다.`)
    return {
      ...stages[index], name: source.name,
      map: source.map.map(joTerrainRow),
      enemies: units(enemies).map((unit) => ({ ...unit, enemyKind: enemyKindFor(unit.name) })),
      jo: {
        image: assetRoot + source.image, terrainNames: pack.terrainNames, deployment, guests: units(guests),
        reinforcements: units(reinforcements), objectives: index === 0 ? ['장보', '장량'] : undefined,
      },
    }
  })
  return { source: 'jo', stages: battleStages, officers }
}

export async function loadJoCampaign(): Promise<CampaignData> {
  const response = await fetch(assetRoot + 'manifest.json')
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return webCampaign
  const pack = await response.json() as JoPack
  if (pack.version !== 1 || pack.classes.length !== 240 || pack.stages.length !== STAGE_COUNT) {
    throw new Error('신조조전 전장 데이터를 다시 가져와 주세요.')
  }
  return createJoCampaign(pack)
}
