export const WAR_ART_WILL = 70

export const warArts = {
  heavyStrike: { name: '강격', troop: 'infantry', damage: [150, 170, 190] },
  sweep: { name: '난격', troop: 'infantry', damage: [80, 90, 100] },
  disrupt: { name: '교란', troop: 'infantry', damage: [100, 110, 120] },
  shove: { name: '맹돌', troop: 'infantry', damage: [110, 125, 140] },
  doubleStrike: { name: '연격', troop: 'cavalry', damage: [80, 90, 100] },
  charge: { name: '돌격', troop: 'cavalry', damage: [85, 95, 105] },
  ambush: { name: '급습', troop: 'cavalry', damage: [95, 105, 115] },
  mountedShot: { name: '기사', troop: 'cavalry', damage: [95, 110, 125] },
  volley: { name: '제사', troop: 'ranged', damage: [150, 170, 190] },
  barrage: { name: '난사', troop: 'ranged', damage: [75, 85, 95] },
  fireArrow: { name: '화시', troop: 'ranged', damage: [90, 100, 110] },
  longShot: { name: '원사', troop: 'ranged', damage: [110, 125, 140] },
  rally: { name: '분기', effect: 'self', amount: [10, 15, 20] },
  inspire: { name: '고무', effect: 'ally', amount: [5, 10, 15] },
  demoralize: { name: '매성', effect: 'enemy', amount: [20, 30, 50] },
  heal: { name: '치료', effect: 'heal', amount: [15, 25, 35] },
} as const

export type WarArtId = keyof typeof warArts
export type LearnedWarArt = { id: WarArtId; level: 1 | 2 | 3 }

export function warArtWill(id: WarArtId) {
  return 'effect' in warArts[id] ? 10 : WAR_ART_WILL
}
