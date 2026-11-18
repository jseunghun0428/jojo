import { troopClassFor } from './unit-classes.ts'
import type { Role, TroopClass } from './unit-classes.ts'

export const siegeEquipment = {
  ram: { name: '충차', art: 'ramStrike' },
  tower: { name: '정란', art: 'towerShot' },
  catapult: { name: '투석', art: 'catapultShot' },
  ladder: { name: '운제', art: 'ladderStrike' },
  elephant: { name: '상병', art: 'elephantRush' },
} as const

export const ships = {
  skiff: { name: '주가', arts: ['navalFire'] },
  assault: { name: '몽충', arts: ['navalFire', 'navalMelee', 'navalPin'] },
  tower: { name: '누선', arts: ['navalFire', 'navalMelee', 'navalRam'] },
  heavy: { name: '투함', arts: ['navalMelee', 'navalPin', 'navalRam', 'navalBlast'] },
} as const

export type Loadout = { siege?: keyof typeof siegeEquipment; ship?: keyof typeof ships }

export const deploymentArts = {
  ramStrike: { name: '충차', platform: 'siege', target: 'structure', range: 1, damage: [200, 200, 200] },
  towerShot: { name: '정란', platform: 'siege', target: 'unit', range: 3, damage: [130, 130, 130] },
  catapultShot: { name: '투석', platform: 'siege', target: 'tile', range: 3, damage: [100, 100, 100], splash: true },
  ladderStrike: { name: '운제', platform: 'siege', target: 'structure', range: 1, damage: [130, 130, 130], troops: { perHundred: 2, max: 60 } },
  elephantRush: { name: '상병', platform: 'siege', target: 'unit', range: 1, damage: [100, 100, 100], splash: true },
  navalFire: { name: '화전', platform: 'ship', target: 'unit', range: 2, damage: [90, 105, 120], burn: true, element: 'fire' },
  navalMelee: { name: '난전', platform: 'ship', target: 'unit', range: 1, damage: [110, 125, 140] },
  navalPin: { name: '연환', platform: 'ship', target: 'unit', range: 1, damage: [85, 100, 115], pin: [50, 25, 75] },
  navalRam: { name: '돌관', platform: 'ship', target: 'unit', range: 1, damage: [105, 120, 135], shove: true },
  navalBlast: { name: '폭선', platform: 'ship', target: 'unit', range: 1, damage: [120, 140, 160], burn: true, element: 'fire' },
} as const

export const structureStats = { hp: 1000, defense: 57 }

export const navalTraining: Readonly<Partial<Record<string, 1 | 2 | 3>>> = { '주유': 2, '하후연': 1 }
export const navalLessons: Readonly<Partial<Record<string, readonly { id: keyof typeof deploymentArts; level: 1 | 2 | 3 }[]>>> = {
  '주유': [{ id: 'navalFire', level: 2 }, { id: 'navalPin', level: 2 }, { id: 'navalBlast', level: 2 }],
  '하후연': [{ id: 'navalFire', level: 1 }],
  '감녕': [{ id: 'navalMelee', level: 2 }, { id: 'navalRam', level: 2 }],
}


export function resolveDeployment(role: Role, classId: number | undefined, selected?: TroopClass, loadout?: Loadout) {
  const troopClass = selected ?? troopClassFor(role, classId)
  if (troopClass !== 'siege') return { troopClass: troopClass ?? troopClassFor(role) ?? 'infantry', loadout }
  const land = troopClassFor(role)
  const siege = classId === 141 || classId === 142 ? 'tower'
    : classId !== undefined && troopClassFor(role, classId) === 'siege' ? 'catapult' : 'ram'
  return { troopClass: land && land !== 'siege' ? land : 'infantry', loadout: { siege, ...loadout } satisfies Loadout }
}
