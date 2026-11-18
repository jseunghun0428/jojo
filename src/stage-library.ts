import { movementCost } from './combat.ts'
import { FIELD_LIMIT, STAGE_COUNT, isTerrain, stageDeployment, stageGuests } from './data.ts'
import type { Point, Stage } from './data.ts'
import { boardGeometry, OUTSIDE_CELL, validCell } from './grid.ts'
import { joTerrainId, loadJoCampaign } from './jo-game.ts'
import type { CampaignData, JoProfile } from './jo-game.ts'
import { createHexStage, createWebHexCampaign, withHexGrid } from './hex-stages.ts'
import { hexTrialStage } from './hex-trial.ts'
import { roles } from './unit-classes.ts'

export const AI_OPTIONS = [
  { value: 1, label: '추격 · 여러 턴에 걸쳐 접근' },
  { value: 0, label: '공격 범위 진입 시 접근 · 한 턴 내 공격 가능할 때 이동' },
  { value: 2, label: '제자리 방어 · 이동 없이 공격' },
] as const
export const MAX_GRID = 50
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024
export type StageEntry = { id: string; source: CampaignData['source']; stage: Stage }
export type StageCatalog = { version: 1; entries: StageEntry[] }
export type StagePackage = { format: 'iron-pass-stage'; version: 1; source: StageEntry['source']; stage: Stage }
export type StageIssue = { message: string; point?: Point; enemy?: number }
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max
const every = (value: unknown, test: (item: unknown) => boolean): value is unknown[] =>
  Array.isArray(value) && value.every(test)
const point = (value: unknown) =>
  record(value) && integer(value.x, -999, 999) && integer(value.y, -999, 999)
const optional = (value: unknown, test: (value: unknown) => boolean) => value === undefined || test(value)
const facing = (value: unknown) => value === 'left' || value === 'right' || value === 'up' || value === 'down'
const ai = (value: unknown) => AI_OPTIONS.some(({ value: id }) => id === value)
const source = (value: unknown): value is StageEntry['source'] => value === 'jo' || value === 'web'

function profile(value: unknown): value is JoProfile {
  if (!record(value)) return false
  const vector = (items: unknown, length: number) => every(items, (item) => integer(item, 0, 65535)) && items.length >= length
  return integer(value.id, 0, 65535) && integer(value.classId, 0, 65535) && text(value.className, 80)
    && typeof value.hasTactics === 'boolean' && integer(value.level, 1, 65535)
    && integer(value.hp, 0, 65535) && integer(value.mp, 0, 65535) && integer(value.move, 0, 255)
    && vector(value.attributes, 5) && vector(value.terrain, 60) && vector(value.growth, 7)
    && (value.pattern === 'all' || every(value.pattern, point))
}

const imagePath = (value: unknown) => typeof value === 'string'
  && (/^\/jo-game\/[a-z0-9_.-]+\.(?:jpe?g|png|webp)$/i.test(value)
    || /^\/stage-data\/images\/[a-f0-9]{64}\.(?:png|jpg|webp)$/.test(value))
export const imageData = (value: unknown): value is string => typeof value === 'string'
  && value.length <= Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 40
  && /^data:image\/(?:png|jpeg|webp);base64,/.test(value)

function unitShape(value: unknown): boolean {
  if (!record(value) || !point(value)) return false
  return text(value.name, 80) && typeof value.role === 'string' && Object.hasOwn(roles, value.role)
    && optional(value.jo, profile) && optional(value.facing, facing)
    && optional(value.levelOffset, (number) => integer(number, 0, 65535))
    && optional(value.behavior, (number) => integer(number, 0, 65535))
    && optional(value.enemyKind, (kind) => kind === 'officer' || kind === 'soldier')
}

export function readStage(value: unknown): Stage {
  if (!record(value) || !integer(value.number, 1, STAGE_COUNT) || !text(value.name, 80)
    || !integer(value.reward, 0, 1_000_000) || !integer(value.tier, 0, 100)
    || !optional(value.grid, (grid) => grid === 'square' || grid === 'hex')
    || !every(value.map, (row) => text(row, MAX_GRID)) || !value.map.length || value.map.length > MAX_GRID
    || !optional(value.deployment, (slots) => every(slots, point) && slots.length <= FIELD_LIMIT)
    || !optional(value.guests, (units) => every(units, unitShape) && units.length <= 300)
    || !every(value.enemies, unitShape) || value.enemies.length > 300) {
    throw new Error('스테이지 JSON의 지도, 배치 또는 기본 형식이 잘못되었습니다.')
  }
  if (value.board !== undefined) {
    const board = value.board
    if (!record(board) || !integer(board.cellSize, 8, 512)
      || !integer(board.x, -8192, 8192) || !integer(board.y, -8192, 8192)
      || !optional(board.image, (image) => imagePath(image) || imageData(image))
      || !optional(board.imageWidth, (width) => integer(width, 1, 8192))
      || !optional(board.imageHeight, (height) => integer(height, 1, 8192))
      || !!board.imageWidth !== !!board.imageHeight) {
      throw new Error('지도 이미지 또는 격자 맞춤 값이 잘못되었습니다.')
    }
  }
  if (value.jo !== undefined) {
    const jo = value.jo
    const originalUnit = (unit: unknown) => unitShape(unit) && record(unit) && profile(unit.jo)
      && facing(unit.facing) && integer(unit.behavior, 0, 65535) && integer(unit.levelOffset, 0, 65535)
    if (!record(jo) || !optional(jo.image, imagePath)
      || !every(jo.terrainNames, (name) => typeof name === 'string' && name.length <= 80) || jo.terrainNames.length !== 30
      || !every(jo.deployment, (slot) => record(slot) && point(slot) && facing(slot.facing)) || jo.deployment.length > FIELD_LIMIT
      || !every(jo.guests, originalUnit) || !every(jo.reinforcements, originalUnit)
      || !optional(jo.objectives, (objectives) => every(objectives, (name) => text(name, 80)))) {
      throw new Error('신조조전 지형 또는 원본 유닛 데이터가 잘못되었습니다.')
    }
  }
  return value as Stage
}

export function readPackage(value: unknown): { source: StageEntry['source']; stage: Stage } {
  if (record(value) && value.format === 'iron-pass-stage') {
    if (value.version !== 1 || !source(value.source)) throw new Error('지원하지 않는 스테이지 패키지입니다.')
    return { source: value.source, stage: readStage(value.stage) }
  }
  const stage = readStage(value)
  return { source: stage.jo ? 'jo' : 'web', stage }
}

export function readEntry(value: unknown): StageEntry {
  if (!record(value) || typeof value.id !== 'string' || !source(value.source)) throw new Error('스테이지 ID를 확인하세요.')
  const stage = readStage(value.stage)
  const builtIn = value.id === 'sandbox' && value.source === 'web' && stage.grid === 'hex'
    || value.id === 'jo-hex:1' && value.source === 'jo' && stage.grid === 'hex'
    || value.id === value.source + ':' + stage.number
  if (!builtIn && !/^custom:[a-f0-9-]{36}$/.test(value.id)) throw new Error('스테이지 ID와 대상 원정이 일치하지 않습니다.')
  if (!stage.board || !stage.deployment) throw new Error('지도 설정과 출전 슬롯을 스테이지 데이터에 포함해 주세요.')
  return { id: value.id, source: value.source, stage }
}

export function validateStage(stage: Stage, officers: CampaignData['officers'] = {}): StageIssue[] {
  const issues: StageIssue[] = []
  const slots = stageDeployment(stage)
  if (!slots.length || (stage.board && !stage.deployment?.length)) issues.push({ message: '총대장 시작 위치가 필요합니다.' })
  if (!stage.enemies.length) issues.push({ message: '적군을 한 명 이상 배치하세요.' })
  if (stage.enemyBehavior !== undefined && !ai(stage.enemyBehavior)) issues.push({ message: '지원하지 않는 기본 AI입니다.' })
  const { width, height } = boardGeometry(stage.map, stage.grid, stage.board)
  if (width > 6500 || height > 6500 || width * height > 9_000_000) {
    issues.push({ message: '전장 표시 영역이 너무 큽니다. 이미지 해상도를 낮추거나 칸 크기를 늘리세요.' })
  }
  stage.map.forEach((row, y) => Array.from(row).forEach((tile, x) => {
    if (tile !== OUTSIDE_CELL && !isTerrain(tile) && joTerrainId(stage.map, { x, y }) === undefined) {
      issues.push({ point: { x, y }, message: '지원하지 않는 지형 기호입니다.' })
    }
  }))
  const occupied = new Map<string, string>()
  const placements: { point: Point; name: string; enemy?: number; jo?: JoProfile; slot?: true }[] = [
    ...slots.map((point, index) => ({ point, name: index === 0 ? '총대장' : '아군 ' + index, slot: true as const })),
    ...stage.enemies.map((point, enemy) => ({ point, name: point.name, enemy, jo: point.jo })),
    ...[...stageGuests(stage), ...stage.jo?.reinforcements ?? []].map((point) => ({ point, name: '우군 ' + point.name, jo: point.jo })),
  ]
  for (const placement of placements) {
    const { point, name, enemy, jo, slot } = placement
    const add = (message: string) => issues.push({ point: { x: point.x, y: point.y }, enemy, message: name + ' · ' + message })
    if (!validCell(point, stage.map)) add('격자 밖 또는 제외된 칸입니다.')
    else {
      if (movementCost(stage.map, point, jo && { jo }) === null) add('진입할 수 없는 지형입니다.')
      if (slot) {
        const original = joTerrainId(stage.map, point)
        const profiles = Object.values(officers)
        if (original !== undefined && profiles.some((profile) => profile.terrain[30 + original] === 255)) {
          add('일부 원정 장수가 진입할 수 없는 지형입니다.')
        }
      }
    }
    const location = point.x + ',' + point.y
    const other = occupied.get(location)
    if (other) add(other + ' 배치와 겹칩니다.')
    occupied.set(location, name)
    if (enemy !== undefined) {
      const behavior = stage.enemies[enemy].behavior
      if (behavior !== undefined && !ai(behavior)) add('지원하지 않는 개별 AI입니다.')
    }
  }
  for (const objective of stage.jo?.objectives ?? []) {
    if (!stage.enemies.some(({ name }) => name === objective)) issues.push({ message: '승리 조건 대상 장수가 필요합니다 · ' + objective })
  }
  return issues
}

export function campaignWithStages(data: CampaignData, entries: StageEntry[]): CampaignData {
  const overrides = new Map(entries.filter(({ source, id, stage }) => source === data.source && id === source + ':' + stage.number)
    .map(({ stage }) => [stage.number, stage]))
  if (!overrides.size) return data
  return { ...data, originals: data.stages, stages: data.stages.map((stage) => {
    const override = overrides.get(stage.number)
    if (!override) return stage
    return data.source === 'web' && stage.grid === 'hex' ? withHexGrid(override) : override
  }) }
}

export function stageEntries(web: CampaignData, jo: CampaignData | undefined, entries: StageEntry[]): StageEntry[] {
  const originals: StageEntry[] = [web, jo].flatMap((data) => data ? data.stages.map((stage) => ({
    id: data.source + ':' + stage.number, source: data.source, stage,
  })) : [])
  originals.push({ id: 'sandbox', source: 'web', stage: hexTrialStage })
  const hex = jo && createHexStage(jo, jo.stages[0])
  if (hex) originals.push({ id: 'jo-hex:1', source: 'jo', stage: hex })
  const merged = new Map(originals.map((entry) => [entry.id, entry]))
  for (const entry of entries) merged.set(entry.id, entry)
  return [...merged.values()]
}

export async function loadStageCatalog(): Promise<{ entries: StageEntry[]; revision: string }> {
  const response = await fetch('/stage-data/catalog.json', { cache: 'no-store' })
  if (response.status === 404) return { entries: [], revision: '' }
  if (!response.ok) throw new Error('저장된 스테이지 목록을 읽지 못했습니다.')
  if (!response.headers.get('content-type')?.includes('application/json')) return { entries: [], revision: '' }
  const catalog = await response.json() as StageCatalog
  if (catalog.version !== 1 || !Array.isArray(catalog.entries)) throw new Error('스테이지 목록 형식이 잘못되었습니다.')
  return { entries: catalog.entries.map(readEntry), revision: response.headers.get('etag') ?? '' }
}

export async function loadStageSources(): Promise<{ web: CampaignData; jo?: CampaignData; warning?: string }> {
  try {
    const jo = await loadJoCampaign()
    return jo.source === 'jo' ? { web: createWebHexCampaign(jo), jo } : { web: createWebHexCampaign() }
  } catch {
    return { web: createWebHexCampaign(), warning: '신조조전 원정 데이터를 불러오지 못했습니다. 웹 원정 기본 육각 지도를 사용합니다.' }
  }
}
