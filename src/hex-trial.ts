import { newBattle } from './combat.ts'
import { recommendedIds } from './data.ts'
import type { Stage } from './data.ts'

export const hexTrialStage: Stage = {
  number: 1,
  name: '육각 전장 시험',
  grid: 'hex',
  tier: 0,
  reward: 0,
  map: [
    '.g...w...',
    '..f..w...',
    '.g.fm....',
    '.....m...',
    '..f..w...',
    '...gg....',
    '.........',
  ],
  deployment: [{ x: 1, y: 3 }, { x: 1, y: 2 }, { x: 1, y: 4 }, { x: 1, y: 5 }],
  enemies: [
    { x: 3, y: 3, name: '화웅', role: 'heavyCavalry' },
    { x: 3, y: 4, name: '궁병1', role: 'crossbowman' },
    { x: 3, y: 5, name: '장량', role: 'strategist' },
    { x: 7, y: 2, name: '고순', role: 'heavyInfantry' },
  ],
}

export function newHexTrial() {
  const battle = newBattle(hexTrialStage, recommendedIds, 'yeon', {}, {}, {
    yeon: 'infantry', ha: 'cavalry', jin: 'ranged', seo: 'infantry',
  })
  battle.burning = [{ x: 4, y: 5, round: 1 }]
  return battle
}
