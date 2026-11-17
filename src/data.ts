import { roleFor } from './unit-classes.ts'
import type { Role, TroopSpecialties } from './unit-classes.ts'
import type { Facing } from './combat.ts'
import type { JoProfile, JoStageDetails } from './jo-game.ts'
import type { BoardLayout, Grid } from './grid.ts'

export const WIDTH = 12
export const HEIGHT = 8
export const STAGE_COUNT = 50
export const FIELD_LIMIT = 12
export const DRAFT_LIMIT = 10

export const terrains = {
  '.': { name: '평지', moveCost: 1, appearance: 'plain' },
  g: { name: '초원', moveCost: 1, appearance: 'plain' },
  f: { name: '숲(일반)', moveCost: 2, appearance: 'forest' },
  p: { name: '숲(복숭아)', moveCost: 2, appearance: 'peach' },
  M: { name: '산지', moveCost: 1, appearance: 'rock' },
  a: { name: '황무지', moveCost: 1, appearance: 'earth' },
  d: { name: '사막', moveCost: 1, appearance: 'sand' },
  s: { name: '설원', moveCost: 1, appearance: 'snow' },
  i: { name: '빙판', moveCost: 1, appearance: 'ice' },
  r: { name: '완류', moveCost: 1, appearance: 'water' },
  e: { name: '습지', moveCost: 1, appearance: 'marsh' },
  b: { name: '다리', moveCost: 1, appearance: 'road' },
  h: { name: '가옥', moveCost: 1, appearance: 'building' },
  j: { name: '얕은 여울', moveCost: 1, appearance: 'water' },
  l: { name: '늪지', moveCost: 1, appearance: 'marsh' },
  x: { name: '독천(아천)', moveCost: 1, appearance: 'marsh' },
  u: { name: '지하', moveCost: 1, appearance: 'earth' },
  z: { name: '잔도', moveCost: 1, appearance: 'road' },
  n: { name: '내성', moveCost: 1, appearance: 'building' },
  c: { name: '성내', moveCost: 1, appearance: 'building' },
  k: { name: '팔괘석', moveCost: 1, appearance: 'rock' },
  v: { name: '마을', moveCost: 1, appearance: 'building' },
  B: { name: '병영', moveCost: 1, appearance: 'building' },
  C: { name: '성채', moveCost: 1, appearance: 'building' },
  G: { name: '관문', moveCost: 1, appearance: 'building' },
  F: { name: '요새', moveCost: 1, appearance: 'building' },
  // Original map symbols also occur in saved battles.
  '=': { name: '길', moveCost: 1, appearance: 'road' },
  m: { name: '바위', moveCost: null, appearance: 'rock' },
  w: { name: '물', moveCost: null, appearance: 'water' },
} as const

export type Terrain = keyof typeof terrains
export const isTerrain = (symbol: string | undefined): symbol is Terrain =>
  symbol !== undefined && Object.hasOwn(terrains, symbol)
export type Point = { x: number; y: number }
export type Stats = { hp: number; mp: number; attack: number; defense: number; move: number; range: number }
export const TROOP_SCALE = 10
export const SALVE_HEAL = 20 * TROOP_SCALE

export const items = {
  salve: { name: '상처약', detail: `병력 ${SALVE_HEAL} 회복`, price: 35 },
  tonic: { name: '정신약', detail: '사기 8 회복', price: 45 },
}
export type ItemId = keyof typeof items

export type Officer = { id: string; name: string; role: Role; cost: number; price: number; bonus: number; specialties?: TroopSpecialties }
export const officers: Officer[] = [
  { id: 'yeon', name: '조조', role: roleFor('조조'), cost: 3, price: 80, bonus: 0, specialties: { infantry: 2, siege: 1 } },
  { id: 'ha', name: '관우', role: roleFor('관우'), cost: 3, price: 80, bonus: 0, specialties: { cavalry: 3 } },
  { id: 'jin', name: '하후연', role: roleFor('하후연'), cost: 2, price: 70, bonus: 0, specialties: { ranged: 2 } },
  { id: 'seo', name: '곽가', role: roleFor('곽가'), cost: 2, price: 70, bonus: 0 },
  { id: 'baek', name: '조인', role: roleFor('조인'), cost: 2, price: 65, bonus: -1 },
  { id: 'dan', name: '장료', role: roleFor('장료'), cost: 2, price: 65, bonus: -1 },
  { id: 'yul', name: '우금', role: roleFor('우금'), cost: 2, price: 65, bonus: -1 },
  { id: 'ryeo', name: '순욱', role: roleFor('순욱'), cost: 3, price: 90, bonus: 1 },
]

// Keep these prefixes for existing roster and equipment IDs.
const reserveNames = {
  guard: ['전위', '허저', '서황', '장합', '등애', '문빙', '만총', '조홍'],
  blade: ['하후돈', '조운', '장비', '마초', '감녕', '주태', '능통', '손책'],
  bow: ['황충', '태사자', '한당', '정봉', '서성', '장임', '장익', '엄안'],
  sage: ['제갈량', '사마의', '주유', '육손', '가후', '방통', '노숙', '서서'],
}

for (const [prefix, names] of Object.entries(reserveNames)) {
  names.forEach((name, index) => {
    const bonus = index % 4 + 1
    officers.push({ id: `${prefix}-${index + 1}`, name, role: roleFor(name), cost: 0, price: 85 + bonus * 20, bonus })
  })
}

officers.push(
  { id: 'cao-zhang', name: '조창', role: roleFor('조창'), cost: 0, price: 145, bonus: 3 },
  { id: 'cao-pi', name: '조비', role: roleFor('조비'), cost: 0, price: 125, bonus: 2 },
  { id: 'yue-jin', name: '악진', role: roleFor('악진'), cost: 0, price: 125, bonus: 2 },
  { id: 'li-dian', name: '이전', role: roleFor('이전'), cost: 0, price: 105, bonus: 1 },
  { id: 'xun-you', name: '순유', role: roleFor('순유'), cost: 0, price: 145, bonus: 3 },
  { id: 'cheng-yu', name: '정욱', role: roleFor('정욱'), cost: 0, price: 145, bonus: 3 },
  { id: 'liu-ye', name: '유엽', role: roleFor('유엽'), cost: 0, price: 125, bonus: 2 },
  { id: 'liu-bei', name: '유비', role: roleFor('유비'), cost: 0, price: 165, bonus: 4 },
  { id: 'wei-yan', name: '위연', role: roleFor('위연'), cost: 0, price: 145, bonus: 3 },
  { id: 'fa-zheng', name: '법정', role: roleFor('법정'), cost: 0, price: 145, bonus: 3 },
  { id: 'diao-chan', name: '초선', role: roleFor('초선'), cost: 0, price: 125, bonus: 2 },
  { id: 'jiang-wei', name: '강유', role: roleFor('강유'), cost: 0, price: 165, bonus: 4 },
)

export const starterIds = officers.slice(0, 8).map(({ id }) => id)
export const recommendedIds = starterIds.slice(0, 4)
export const officerById = Object.fromEntries(officers.map((officer) => [officer.id, officer]))

export type Treasure = { id: string; name: string; stat: 'hp' | 'mp' | 'attack' | 'defense'; amount: number; price: number }
export const treasures: Treasure[] = []
const treasureGroups: { stat: Treasure['stat']; names: string[]; amounts: number[] }[] = [
  { stat: 'attack', names: ['청동검', '송곳창', '참나무 활', '추월도', '흑철검', '운뢰창'], amounts: [2, 2, 3, 3, 4, 5] },
  { stat: 'defense', names: ['철편 방패', '백동 호심경', '산문갑', '강철 완갑', '철산 방패', '현무갑'], amounts: [2, 2, 3, 3, 4, 5] },
  { stat: 'hp', names: ['청옥 패', '칠보 허리띠', '비취 수호패', '적석 목걸이', '옥룡 관', '태산 인장'], amounts: [6, 7, 8, 10, 12, 15] },
  { stat: 'mp', names: ['대나무 서책', '구름 부채', '풍향경', '화문 죽간', '일월 병법서', '태허 비책'], amounts: [4, 4, 6, 6, 8, 10] },
]
treasureGroups.forEach(({ stat, names, amounts }) => names.forEach((name, i) => {
  treasures.push({ id: `${stat}-${i + 1}`, name, stat, amount: amounts[i], price: 65 + i * 15 })
}))
export const treasureById = Object.fromEntries(treasures.map((treasure) => [treasure.id, treasure]))
export const statLabels = { hp: '최대 병력', mp: '최대 사기', attack: '공격', defense: '방어' }

const maps = [
  ['..ff...f..mm', '...f........', '....==..ff..', '...f..m..f..', '....f...=...', '..f...f.=...', '......f...m.', '...ff.......'],
  ['....ff...m..', '..f..f......', '.....w=..f..', '.....w...f..', '.....w=.....', '.....w=..m..', '...f.w......', '.....w......'],
  ['......m.....', '....m.m..f..', '...m...m.f..', '...m.f......', '......m..f..', '....m.m.....', '..f.m....f..', '....ff......'],
  ['....f..ff...', '..ff....f...', '...f.f......', '....f.....f.', '......ff....', '...f..f.....', '..ff.....f..', '.......ff...'],
  ['.....======.', '....==......', '...==...m...', '..==.f..f...', '..=....f....', '..==..f.....', '...==...m...', '....====....'],
  ['..m..w......', '.....w=..f..', '...f.w....f.', '.....w=.....', '...m.w......', '.....w=..m..', '....ww......', '....===.....'],
  ['.....m.m....', '...f.m.m....', '.....=.=....', '...f.m......', '.....m.m....', '...f...m....', '.....=.=....', '.....m.m....'],
  ['....www.....', '...w.==..f..', '...w....f...', '...=.....f..', '...=..m.....', '...w....m...', '...w.==.....', '....www.....'],
  ['.....==.....', '...ff==.....', '...ff==..f..', '.....==.....', '..f..==..f..', '..f..==.....', '.....==..f..', '.....==.....'],
  ['....m....m..', '....m.ff.m..', '....=....=..', '..f.m....m..', '....=....=..', '....m.ff.m..', '....=....=..', '....m....m..'],
] as const

const fronts = [
  ['09,02:blade', '10,04:guard', '09,06:bow'],
  ['08,01:bow', '10,03:guard', '09,05:blade', '10,07:sage'],
  ['08,00:blade', '09,02:bow', '10,04:guard', '09,06:sage', '11,07:bow'],
  ['09,01:sage', '08,02:blade', '09,03:guard', '10,04:guard', '09,05:blade', '08,06:bow'],
  ['09,00:bow', '10,01:sage', '08,02:blade', '09,03:guard', '10,04:guard', '11,05:sage', '09,06:blade', '10,07:bow'],
  ['08,00:blade', '09,01:bow', '10,02:sage', '09,03:guard', '10,04:guard', '09,05:blade', '10,06:bow', '11,07:sage'],
  ['08,00:bow', '09,01:sage', '08,02:blade', '10,02:guard', '09,03:guard', '10,04:guard', '09,05:blade', '08,06:blade', '10,06:sage', '09,07:bow'],
  ['08,00:blade', '11,00:bow', '09,01:sage', '08,02:blade', '10,02:guard', '09,03:guard', '10,04:guard', '08,05:blade', '10,05:guard', '09,06:sage', '08,07:bow', '11,07:bow'],
] as const

const stageNames = [
  '갈대 나루', '물목의 매복', '너럭바위 길', '소나무 숲', '백석 고갯길',
  '물굽이 방책', '갈라진 협곡', '버들 늪지', '황토 대로', '돌문 수비대',
  '잿빛 나루', '밤물 골짜기', '돌무더기 초소', '바람 숲', '벼랑길 기습',
  '안개 여울', '두 바위 사이', '검은 버들', '넓은 벌판', '청석 관문',
  '동쪽 둔치', '굽은 냇가', '사면 능선', '수풀의 척후', '사금 고개',
  '갈대 수로', '돌기둥 산길', '달빛 습지', '황야 행군', '백철 성채',
  '붉은 나루', '쇠사슬 여울', '대석 진지', '검솔 숲', '구름 산길',
  '백파 수로', '쌍봉 협로', '서리 늪', '비석 대로', '북문 공방전',
  '마지막 도하', '깊은 여울', '부서진 절벽', '큰바람 숲', '천봉 고개',
  '용틀임 하천', '바위의 장벽', '철령의 습지', '철령 대로', '철령 관문',
]

// Formation slots preserve each stage’s named enemies and positions.
const enemyNames = {
  guard: ['황보숭', '고순', '안량', '문추', '이각'],
  blade: ['화웅', '여포', '방덕', '기령', '곽사'],
  bow: ['장수', '장연', '공손찬', '진무', '황개'],
  sage: ['진궁', '이유', '전풍', '저수', '심배'],
}

export const enemyKindFor = (name: string): 'officer' | 'soldier' => /\d+$/.test(name) ? 'soldier' : 'officer'

export type StageBoard = BoardLayout & { image?: string }
export type StageUnit = Point & {
  role: Role; name: string; jo?: JoProfile; facing?: Facing
  levelOffset?: number; behavior?: number; enemyKind?: ReturnType<typeof enemyKindFor>
}
export type Stage = {
  number: number; name: string; map: readonly string[]; reward: number; tier: number
  turnLimit?: number
  grid?: Grid; deployment?: readonly Point[]
  board?: StageBoard
  enemyBehavior?: 0 | 1 | 2
  enemies: StageUnit[]
  guests?: StageUnit[]
  jo?: JoStageDetails
}
const defaultDeployment: readonly Point[] = [
  { x: 2, y: 3 }, { x: 2, y: 4 }, { x: 1, y: 2 }, { x: 1, y: 5 },
  { x: 2, y: 2 }, { x: 2, y: 5 }, { x: 1, y: 3 }, { x: 1, y: 4 },
  { x: 2, y: 1 }, { x: 2, y: 6 }, { x: 1, y: 1 }, { x: 1, y: 6 },
]
export const stageDeployment = (stage: Stage) => stage.deployment ?? stage.jo?.deployment ?? defaultDeployment
export const stageGuests = (stage: Stage): readonly StageUnit[] => stage.guests ?? stage.jo?.guests ?? []
export const stageImage = (stage: Stage) => stage.board ? stage.board.image : stage.jo?.image

export const stages: Stage[] = stageNames.map((name, index) => {
  const chapter = Math.floor(index / maps.length)
  const layout = index % maps.length
  const map: string[] = chapter % 2 ? [...maps[layout]].reverse() : [...maps[layout]]
  const formation = Math.min(7, Math.floor((index + 4) / 7))
  const roleCounts: Record<keyof typeof enemyNames, number> = { guard: 0, blade: 0, bow: 0, sage: 0 }
  const enemies = fronts[formation].map((entry) => {
    const [location, slot] = entry.split(':') as [string, keyof typeof enemyNames]
    const [x, y] = location.split(',').map(Number)
    const row = (y + chapter * 2) % HEIGHT
    const tile = map[row][x]
    if (isTerrain(tile) && terrains[tile].moveCost === null) {
      map[row] = map[row].slice(0, x) + '.' + map[row].slice(x + 1)
    }
    const names = enemyNames[slot]
    const name = names[(chapter + roleCounts[slot]++) % names.length]
    return { x, y: row, role: roleFor(name), name }
  })
  return { number: index + 1, name, map, enemies, reward: 230 + index * 5, tier: Math.floor(index / 10) }
})
