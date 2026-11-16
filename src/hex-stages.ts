import { stageDeployment } from './data.ts'
import type { Point, Stage } from './data.ts'
import { joTerrainRow } from './jo-game.ts'
import type { CampaignData } from './jo-game.ts'

type PlacementMap = Readonly<Record<string, readonly [x: number, y: number]>>
type HexStageLayout = {
  map: readonly string[]
  deployment: PlacementMap
  enemies: PlacementMap
  guests?: PlacementMap
  reinforcements?: PlacementMap
}

// Position keys are the corresponding cells in the existing square stage.
// They distinguish units that have the same name or source officer ID.
export const hexStageLayouts: Partial<Record<CampaignData['source'], Record<number, HexStageLayout>>> = {
  jo: {
    1: {
      map: [
        'ggggg....gggggggggg',
        '~gggg.....ggggggggg',
        '~~ggg......gggggggg',
        '~~~ggg.....ggggggg~',
        '~~~~gg......ggggg~~',
        '~~~~~gg.....gggg~~~',
        '~~~~~####...###g~~~',
        '~~~~~#h......h#~~~~',
        '~~~~~#h.....h.#~~~~',
        '~~~~.#........#~~~~',
        '~~~.....##....#~~~~',
        '~~......FB....#~~~~',
        '~....#......B.#~~~~',
        '.....#hh....B.#.~~~',
        '.....####...###gg~~',
        'ggg............gggg',
        'gggggg......ggggggg',
        'ggggggg.....ggggggg',
      ],
      deployment: {
        '7,0': [6, 1], '6,0': [5, 1], '8,0': [7, 1], '7,1': [6, 2],
        '5,0': [4, 1], '9,0': [8, 1], '6,1': [5, 2], '8,1': [7, 2],
        '7,2': [6, 3], '4,0': [3, 1], '10,0': [9, 1], '5,1': [4, 2],
      },
      enemies: {
        '9,6': [9, 6], '10,6': [10, 7],
        '5,10': [4, 10], '5,11': [5, 11], '8,10': [7, 9], '12,10': [11, 10],
        '9,11': [8, 11], '10,11': [9, 11],
        '9,14': [9, 14], '10,14': [11, 14],
      },
      reinforcements: { '14,1': [13, 1], '13,2': [12, 2], '13,1': [12, 1] },
    },
  },
}

const terrain = { '.': 0, g: 1, '~': 10, '#': 14, F: 20, B: 22, h: 23 } as const

function relocate<T extends Point>(formation: readonly T[], positions?: PlacementMap): T[] {
  return formation.map((unit) => {
    const position = positions?.[`${unit.x},${unit.y}`]
    if (!position) throw new Error(`육각 전장 배치 좌표가 없습니다. (${unit.x}, ${unit.y})`)
    const [x, y] = position
    return { ...unit, x, y }
  })
}

export function createHexStage(data: CampaignData, stage: Stage): Stage | undefined {
  const layout = hexStageLayouts[data.source]?.[stage.number]
  if (!layout) return undefined
  return {
    ...stage,
    grid: 'hex',
    map: stage.jo ? layout.map.map((row) => joTerrainRow(Array.from(row, (tile) => {
      if (!Object.hasOwn(terrain, tile)) throw new Error(`육각 전장 지형 기호가 잘못되었습니다. (${tile})`)
      return terrain[tile as keyof typeof terrain]
    }))) : layout.map,
    enemies: relocate(stage.enemies, layout.enemies),
    deployment: stage.jo ? undefined : relocate(stageDeployment(stage), layout.deployment),
    jo: stage.jo && {
      ...stage.jo,
      image: undefined,
      deployment: relocate(stage.jo.deployment, layout.deployment),
      guests: relocate(stage.jo.guests, layout.guests),
      reinforcements: relocate(stage.jo.reinforcements, layout.reinforcements),
    },
  }
}
