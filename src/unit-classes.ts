export const roles = {
  strategist: { name: '모사', group: '문관계', symbol: '✦', sprite: 'sage', hp: 30, mp: 14, attack: 12, defense: 3, move: 3, range: 1, growth: [1, 2, 3] },
  tactician: { name: '책사', group: '문관계', symbol: '✷', sprite: 'sage', hp: 28, mp: 16, attack: 13, defense: 2, move: 3, range: 2, growth: [1, 2, 2] },
  geomancer: { name: '풍수사', group: '문관계', symbol: '✧', sprite: 'sage', hp: 32, mp: 12, attack: 10, defense: 4, move: 3, range: 1, growth: [1, 3, 2] },
  lightCavalry: { name: '경기병', group: '무관계', symbol: '♞', sprite: 'blade', hp: 38, mp: 0, attack: 16, defense: 4, move: 5, range: 1, growth: [3, 2, 4] },
  heavyCavalry: { name: '중장기병', group: '무관계', symbol: '♞', sprite: 'blade', hp: 45, mp: 0, attack: 16, defense: 7, move: 4, range: 1, growth: [3, 4, 2] },
  shockCavalry: { name: '돌격기병', group: '무관계', symbol: '♞', sprite: 'blade', hp: 38, mp: 0, attack: 18, defense: 3, move: 5, range: 1, growth: [4, 2, 3] },
  mountedArcher: { name: '궁기병', group: '무관계', symbol: '➶', sprite: 'bow', hp: 32, mp: 0, attack: 14, defense: 3, move: 4, range: 3, growth: [3, 2, 3] },
  lightInfantry: { name: '경보병', group: '무관계', symbol: '✦', sprite: 'blade', hp: 36, mp: 0, attack: 14, defense: 4, move: 4, range: 1, growth: [2, 3, 3] },
  shieldInfantry: { name: '방패병', group: '무관계', symbol: '◆', sprite: 'guard', hp: 45, mp: 0, attack: 13, defense: 7, move: 3, range: 1, growth: [3, 5, 3] },
  pikeman: { name: '장창병', group: '무관계', symbol: '↑', sprite: 'blade', hp: 38, mp: 0, attack: 15, defense: 4, move: 3, range: 2, growth: [3, 3, 2] },
  heavyInfantry: { name: '중장보병', group: '무관계', symbol: '◆', sprite: 'guard', hp: 46, mp: 0, attack: 15, defense: 6, move: 3, range: 1, growth: [3, 4, 2] },
  crossbowman: { name: '궁노병', group: '무관계', symbol: '➶', sprite: 'bow', hp: 30, mp: 0, attack: 15, defense: 2, move: 3, range: 3, growth: [3, 2, 2] },
} as const

export type Role = keyof typeof roles

const officersByRole: Record<Role, readonly string[]> = {
  strategist: ['곽가', '가후', '주유', '육손', '진궁', '전풍', '저수'],
  tactician: ['순욱', '정욱', '노숙', '서서', '법정', '제갈량', '사마의', '방통', '이유', '심배'],
  geomancer: ['순유', '만총', '초선'],
  lightCavalry: ['하후돈', '장료', '장비', '태사자', '안량'],
  heavyCavalry: ['관우', '조인', '능통', '문추', '기령', '고순', '화웅'],
  shockCavalry: ['등애', '조운', '마초', '조창', '강유', '여포', '공손찬'],
  mountedArcher: ['하후연', '장합', '황충'],
  lightInfantry: ['감녕', '주태', '한당', '장연', '위연', '황개', '손책'],
  shieldInfantry: ['조조', '황보숭', '악진', '조홍'],
  pikeman: ['서황', '엄안', '곽사', '장익', '문빙'],
  heavyInfantry: ['조비', '유비', '장수', '전위', '허저', '이각', '방덕'],
  crossbowman: ['우금', '이전', '장임', '정봉', '서성', '진무', '유엽'],
}

const roleByName = new Map<string, Role>()
for (const role of Object.keys(officersByRole) as Role[]) {
  for (const name of officersByRole[role]) {
    if (roleByName.has(name)) throw new Error(`Duplicate class assignment for ${name}`)
    roleByName.set(name, role)
  }
}

export function roleFor(name: string): Role {
  const role = roleByName.get(name)
  if (!role) throw new Error(`Missing class assignment for ${name}`)
  return role
}
