import type { CampaignData } from './jo-game.ts'
import type { Stage } from './data.ts'
import { roleFor } from './unit-classes.ts'
import type { Battle } from './combat.ts'
import { FIELD_LIMIT, OFFICER_TROOPS } from './data.ts'
import type { Campaign } from './campaign.ts'

export const chapters = [
  { name: '황건의 난', seal: '黃', stages: ['탁현 봉기', '유주 가도', '청주 황야', '광양 매복', '영천 화공', '완성 외곽', '남양 병영', '하곡 추격', '곡양 포위', '광종 결전'], chief: '장각' },
  { name: '반동탁 연합', seal: '虎', stages: ['진류 집결', '산조 회전', '하내 도하', '양인 대치', '사수관 돌파', '성고 협곡', '형양 추격', '낙양 진입', '맹진 나루', '호로관 결전'], chief: '여포' },
  { name: '관도의 패권', seal: '官', stages: ['연주 출병', '복양 시가전', '백마 포위', '연진 도하', '백마 구원', '양무 초소', '원무 측면전', '오소 기습', '창정 잔영', '관도 결전'], chief: '원소' },
  { name: '적벽의 불길', seal: '赤', stages: ['신야 선봉', '박망 숲길', '양양 가도', '당양 퇴로', '장판파 돌파', '강하 수비', '삼강 나루', '남병산 동풍', '오림 화공', '적벽 결전'], chief: '조조' },
  { name: '오장원 북벌', seal: '蜀', stages: ['한중 출사', '기산 선봉', '천수 포위', '가정 산길', '진창 공방', '무도 기습', '음평 잔도', '목문 협로', '위수 대치', '오장원 결전'], chief: '사마의' },
] as const

// Original expedition lineups. The first officer leads the stage's objective battles.
const enemyOfficers = {
  '탁현 봉기': ['정원지', '등무', '고승'],
  '유주 가도': ['등무', '정원지', '장만성'],
  '청주 황야': ['관해', '배원소', '주창'],
  '광양 매복': ['정원지', '등무', '관해'],
  '영천 화공': ['파재', '팽탈', '하의', '황소'],
  '완성 외곽': ['장만성', '하의', '한충', '손중'],
  '남양 병영': ['한충', '하의', '손중', '장만성'],
  '하곡 추격': ['장량', '고승', '엄정', '배원소'],
  '곡양 포위': ['장보', '고승', '엄정', '장량', '관해'],
  '광종 결전': ['장각', '장보', '장량', '고승', '엄정', '파재'],

  '진류 집결': ['이각', '곽사', '번조', '장제'],
  '산조 회전': ['호진', '화웅', '이숙', '서영'],
  '하내 도하': ['동민', '우보', '이각', '곽사'],
  '양인 대치': ['호진', '화웅', '여포', '이숙'],
  '사수관 돌파': ['화웅', '호진', '이숙', '번조', '왕방'],
  '성고 협곡': ['서영', '이각', '곽사', '장제', '우보'],
  '형양 추격': ['서영', '여포', '이각', '곽사', '번조'],
  '낙양 진입': ['동탁', '이유', '동민', '우보', '이숙'],
  '맹진 나루': ['우보', '이각', '곽사', '번조', '장제', '가후'],
  '호로관 결전': ['여포', '화웅', '서영', '이각', '곽사', '장제', '이유'],

  '연주 출병': ['진궁', '장막', '장초', '고순', '장료'],
  '복양 시가전': ['여포', '진궁', '고순', '장료', '장패'],
  '백마 포위': ['안량', '곽도', '순우경', '장합', '고람'],
  '연진 도하': ['문추', '유비', '유벽', '한맹', '고람'],
  '백마 구원': ['안량', '순우경', '곽도', '장합', '고람', '저수'],
  '양무 초소': ['저수', '한맹', '장합', '고람', '여광', '여상'],
  '원무 측면전': ['장합', '고람', '한맹', '심배', '봉기', '저수'],
  '오소 기습': ['순우경', '한거자', '여위황', '고람', '한맹', '장합'],
  '창정 잔영': ['원담', '원희', '원상', '심배', '봉기', '곽도', '신평'],
  '관도 결전': ['원소', '장합', '고람', '저수', '곽도', '순우경', '허유', '한맹'],

  '신야 선봉': ['조인', '이전', '여광', '여상', '조홍', '우금'],
  '박망 숲길': ['하후돈', '우금', '이전', '조홍', '악진', '한호'],
  '양양 가도': ['채모', '유종', '괴월', '장윤', '부손', '문빙'],
  '당양 퇴로': ['조순', '문빙', '조홍', '하후은', '장료', '서황'],
  '장판파 돌파': ['조순', '하후은', '장료', '장합', '허저', '서황', '문빙'],
  '강하 수비': ['문빙', '조인', '악진', '우금', '만총', '이전', '조홍'],
  '삼강 나루': ['채모', '장윤', '모개', '우금', '문빙', '장료', '서황'],
  '남병산 동풍': ['정욱', '순유', '가후', '조인', '문빙', '악진', '이전'],
  '오림 화공': ['조인', '장료', '서황', '허저', '조홍', '장합', '우금', '문빙'],
  '적벽 결전': ['조조', '조인', '장료', '서황', '허저', '장합', '문빙', '정욱', '순유'],

  '한중 출사': ['조진', '하후무', '곽회', '장합', '비요', '대릉', '학소'],
  '기산 선봉': ['조진', '곽회', '장합', '비요', '대릉', '왕쌍', '장호'],
  '천수 포위': ['마준', '양서', '윤상', '양건', '강유', '곽회', '장합'],
  '가정 산길': ['장합', '곽회', '조진', '신비', '비요', '대릉', '학소'],
  '진창 공방': ['학소', '왕쌍', '조진', '비요', '곽회', '장합', '대릉', '장호'],
  '무도 기습': ['곽회', '비요', '대릉', '장합', '조진', '진태', '손례', '장호'],
  '음평 잔도': ['곽회', '비요', '대릉', '조진', '장합', '손례', '악침', '장호'],
  '목문 협로': ['장합', '사마의', '곽회', '비요', '대릉', '장호', '악침', '손례'],
  '위수 대치': ['곽회', '사마의', '사마부', '손례', '신비', '진랑', '호준', '비요', '하후패'],
  '오장원 결전': ['사마의', '곽회', '신비', '진랑', '호준', '손례', '사마부', '하후패', '장호', '악침'],
} satisfies Record<(typeof chapters)[number]['stages'][number], string[]>

const positions = [[8, 3], [8, 2], [8, 5], [9, 1], [9, 6], [10, 4], [9, 7], [10, 2], [8, 0], [10, 6]]
const landscapes = ['들판', '숲길', '나루', '협곡', '관문'] as const
const landscapesPerChapter = [
  [0, 0, 0, 1, 1, 4, 0, 3, 4, 4], [0, 0, 2, 3, 4, 3, 0, 4, 2, 4],
  [0, 4, 2, 2, 0, 4, 3, 1, 0, 4], [0, 1, 0, 3, 2, 4, 2, 3, 1, 2],
  [4, 3, 4, 3, 4, 1, 3, 3, 2, 0],
]

function battlefield(number: number, landscape: number) {
  return Array.from({ length: 8 }, (_, y) => Array.from({ length: 12 }, (_, x) => {
    const lane = (y + number) % 8
    const road = y === 3 || y === 5
    const spine = 4 + (Math.floor((y + number) / 3) % 3)
    if (landscape === 2 && x === spine) return road ? 'b' : lane === 2 ? 'j' : 'w'
    if (landscape === 4 && x === 6) return road ? 'G' : 'W'
    if (landscape === 3 && x >= 3 && x <= 7 && !road && (lane + x) % 4 === 0) return 'm'
    if (landscape === 1 && !road && (x + lane * 3) % 5 < 3) return 'f'
    if (road) return '='
    if ((x * 7 + y * 11 + number) % 19 === 0) return landscape === 4 ? 'B' : 'f'
    return number > 40 && landscape === 3 ? 's' : (x + lane) % 3 ? 'g' : '.'
  }).join(''))
}

export const expeditionCampaign: CampaignData = {
  source: 'web', expedition: true, officers: {},
  stages: chapters.flatMap((chapter, chapterIndex) => chapter.stages.map((name, index): Stage => {
    const number = chapterIndex * 10 + index + 1
    const landscape = landscapesPerChapter[chapterIndex][index]
    const officers = enemyOfficers[name]
    const chief = index === 4 || index === 9 ? officers[0] : undefined
    const enemies = officers.map((officer, slot) => {
      const [x, row] = positions[slot]
      return { x, y: (row + index) % 8, role: roleFor(officer), name: officer, enemyKind: 'officer' as const }
    })
    return { number, name, grid: 'hex', map: battlefield(number, landscape), enemies, tier: chapterIndex,
      reward: 125 + number * 4 + (chief ? 70 : 0), expedition: { landscape: landscapes[landscape], chief } }
  })),
}

export const spoils = {
  blade: { name: '공격 훈련', description: '아군의 공격력이 4 증가합니다.' },
  armor: { name: '방어 훈련', description: '아군의 방어력이 4 증가합니다.' },
  levy: { name: '모병', description: '배치할 수 있는 예비 병력을 1,000명 늘립니다.' },
  drum: { name: '사기 진작', description: '첫 전의가 10 증가합니다. 최대 전의는 100입니다.' },
  pay: { name: '군자금', description: '즉시 150금을 받습니다.' },
} as const
export type Spoil = keyof typeof spoils
export type SpoilCounts = Partial<Record<Spoil, number>>

export function drawSpoils(rolls: number[]): Spoil[] {
  const pool = Object.keys(spoils) as Spoil[]
  return rolls.slice(0, 3).map(roll => pool.splice(Math.min(pool.length - 1, Math.floor(roll * pool.length)), 1)[0])
}

export const TROOP_STEP = 1000
export const DEFAULT_ASSIGNMENT = 4000
export const assignedTroops = (state: Campaign, id: string) => state.troopAssignments?.[id] ?? DEFAULT_ASSIGNMENT

export function troopBudget(state: Campaign) {
  const total = Math.min(FIELD_LIMIT, state.roster.length) * DEFAULT_ASSIGNMENT + (state.spoils?.levy ?? 0) * TROOP_STEP
  const assigned = state.lineup.reduce((sum, id) => sum + assignedTroops(state, id), 0)
  return { total, assigned, reserve: total - assigned }
}

export function assignmentLimit(state: Campaign, id: string) {
  return Math.min(OFFICER_TROOPS, assignedTroops(state, id) + troopBudget(state).reserve)
}

export function prepareExpedition(battle: Battle, stage: Stage, state: Campaign) {
  const counts = state.spoils ?? {}
  const chief = stage.expedition?.chief
  battle.objectives = chief ? [chief] : undefined
  for (const unit of battle.units) {
    const ally = unit.side === 'ally'
    unit.morale = ally ? Math.min(100, 40 + (counts.drum ?? 0) * 10) : 40
    unit.fieldAttack = ally ? (counts.blade ?? 0) * 4 : stage.tier * 4
    unit.fieldDefense = ally ? (counts.armor ?? 0) * 4 : stage.tier * 3
    const max = ally ? assignedTroops(state, unit.id)
      : 1400 + stage.number * 42 + (unit.name === chief ? 1600 + stage.tier * 400 : 0)
    unit.hp = unit.currentHP = max
  }
}
