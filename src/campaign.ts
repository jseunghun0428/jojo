import { resolveDeployment, ships, siegeEquipment } from './deployments.ts'
import type { Loadout } from './deployments.ts'
import { DRAFT_LIMIT, FIELD_LIMIT, STAGE_COUNT, enemyKindFor, items, officerById, officers, recommendedIds, starterIds, stageDeployment, treasureById, treasures } from './data.ts'
import type { ItemId, Stage } from './data.ts'
import { MAX_ENERGY, isSoldier, isWater, newBattle, playBattle, resumeInitiativeBattle, startInitiativeBattle, syncDeploymentPositions, troopStrength, unitStats } from './combat.ts'
import type { Battle, BattleAction } from './combat.ts'
import { roles, troopClasses } from './unit-classes.ts'
import type { TroopClass } from './unit-classes.ts'
import { webCampaign } from './jo-game.ts'
import type { CampaignData } from './jo-game.ts'

export type CampaignGrowth = { level: number; xp: number }

export function awardExperience(growth: CampaignGrowth, earned: number): CampaignGrowth {
  let { level, xp } = growth
  xp += earned
  while (xp >= level * 100) {
    xp -= level * 100
    level++
  }
  return { level, xp }
}

export const initialProgression = { level: 1, xp: 0 }
const clearPoints = { base: 40, soldier: 5, officer: 15, perTurn: 2, maxTurn: 20 }

export function clearScore(battle: Battle, stage: Stage) {
  const defeated = new Map(battle.units.filter((unit) => unit.side === 'enemy' && unit.currentHP <= 0)
    .map((unit) => [unit.id, unit.enemyKind ?? enemyKindFor(unit.name)]))
  const officers = [...defeated.values()].filter((kind) => kind === 'officer').length
  const officerPoints = officers * clearPoints.officer
  const soldierPoints = (defeated.size - officers) * clearPoints.soldier
  const remainingTurns = stage.turnLimit === undefined ? 0 : Math.max(0, stage.turnLimit - battle.round)
  const turnPoints = Math.min(clearPoints.maxTurn, remainingTurns * clearPoints.perTurn)
  return { basePoints: clearPoints.base, soldierPoints, officerPoints, turnPoints,
    total: clearPoints.base + soldierPoints + officerPoints + turnPoints }
}

export function settleClear(state: Campaign, data: CampaignData): Campaign {
  if (data.source !== 'jo' || state.battle?.result !== 'win' || state.clearResult) return state
  const current = state.progression ?? initialProgression
  const scoredStages = state.scoredStages ?? []
  const score = clearScore(state.battle, data.stages[state.stage - 1])
  const xp = scoredStages.includes(state.stage) ? 0 : score.total
  const progression = awardExperience(current, xp)
  return { ...state, progression, scoredStages: xp ? [...scoredStages, state.stage] : scoredStages,
    clearResult: { ...score, xp, fromLevel: current.level, toLevel: progression.level } }
}

export type Campaign = {
  progression?: CampaignGrowth
  scoredStages?: number[]
  clearResult?: ReturnType<typeof clearScore> & { fromLevel: number; toLevel: number; xp: number }
  phase: 'draft' | 'battle' | 'camp' | 'complete'
  draftConfirmed?: boolean
  loadouts?: Partial<Record<string, Loadout>>
  troopClasses?: Partial<Record<string, TroopClass>>
  troopSizeVersion?: 1
  stage: number
  roster: string[]
  captain: string | null
  lineup: string[]
  gold: number
  inventory: Record<ItemId, number>
  treasures: string[]
  equipment: Record<string, string>
  offers: { officers: string[]; treasures: string[] }
  battle: Battle | null
}

export type Action =
  | { type: 'draft'; id: string }
  | { type: 'recommended' }
  | { type: 'confirmDraft' }
  | { type: 'changeTroopClass'; id: string; troopClass: TroopClass }
  | { type: 'loadout'; id: string; loadout: Loadout }
  | { type: 'captain'; id: string }
  | { type: 'lineup'; id: string }
  | { type: 'deploy' }
  | { type: 'battle'; action: BattleAction; seed?: number }
  | { type: 'collect'; rolls: number[] }
  | { type: 'retry' }
  | { type: 'buy'; kind: 'officers' | 'treasures' | 'items'; id: string }
  | { type: 'equip'; officer: string; treasure: string }
  | { type: 'reset' }

export function createCampaign(): Campaign {
  return {
    phase: 'draft', progression: { ...initialProgression }, troopSizeVersion: 1, stage: 1, roster: [], captain: null, lineup: [], gold: 0,
    inventory: { salve: 1, tonic: 1 }, treasures: [], equipment: {},
    offers: { officers: [], treasures: [] }, battle: null,
  }
}

export function draftCost(roster: string[]) {
  return roster.reduce((cost, id) => cost + officerById[id].cost, 0)
}

function sample(available: string[], rolls: number[]) {
  const result: string[] = []
  for (const roll of rolls.slice(0, 5)) {
    if (!available.length) break
    const index = Math.min(available.length - 1, Math.max(0, Math.floor(roll * available.length)))
    result.push(available.splice(index, 1)[0])
  }
  return result
}

export function requiredShipIds(state: Campaign, stage: Stage, data: CampaignData) {
  if (data.source !== 'jo' || !state.captain) return []
  const lineup = [state.captain, ...state.lineup.filter((id) => id !== state.captain)]
  return stageDeployment(stage).flatMap((point, index) => {
    const id = lineup[index]
    return id && !state.loadouts?.[id]?.ship
      && isWater({ map: stage.map, terrainNames: stage.jo?.terrainNames }, point) ? [id] : []
  })
}

function deploy(state: Campaign, stage: number, data: CampaignData): Campaign {
  if (!state.captain || !state.lineup.includes(state.captain)) return state
  if (requiredShipIds(state, data.stages[stage - 1], data).length) return state
  const progression = state.progression ?? initialProgression
  const battle = newBattle(data.stages[stage - 1], state.lineup, state.captain, state.equipment, data.officers,
    state.troopClasses, data.source === 'jo' ? progression.level : undefined,
    data.source === 'jo' ? state.loadouts ?? {} : undefined)
  if (data.source === 'web' && battle.grid === 'hex') startInitiativeBattle(battle)
  return { ...state, stage, phase: 'battle', battle, clearResult: undefined }
}

export function campaignReducer(state: Campaign, action: Action, data: CampaignData = webCampaign): Campaign {
  switch (action.type) {
    case 'reset':
      return createCampaign()
    case 'confirmDraft':
      return state.phase === 'draft' && state.captain ? { ...state, draftConfirmed: true } : state
    case 'changeTroopClass':
      if (state.phase !== 'camp' && !(state.phase === 'draft' && state.draftConfirmed)) return state
      if (!state.roster.includes(action.id) || action.troopClass === 'siege' || !Object.hasOwn(troopClasses, action.troopClass)) return state
      const current = resolveDeployment(officerById[action.id].role, data.officers[action.id]?.classId,
        state.troopClasses?.[action.id], state.loadouts?.[action.id])
      return { ...state, troopClasses: { ...state.troopClasses, [action.id]: action.troopClass },
        ...(data.source === 'jo' && current.loadout && { loadouts: { ...state.loadouts, [action.id]: current.loadout } }) }
    case 'loadout': {
      if (data.source !== 'jo' || (state.phase !== 'camp' && !(state.phase === 'draft' && state.draftConfirmed))
        || !state.roster.includes(action.id)) return state
      const { siege, ship } = action.loadout
      if ((siege && !Object.hasOwn(siegeEquipment, siege)) || (ship && !Object.hasOwn(ships, ship))) return state
      const { troopClass } = resolveDeployment(officerById[action.id].role, data.officers[action.id]?.classId, state.troopClasses?.[action.id])
      return { ...state, troopClasses: { ...state.troopClasses, [action.id]: troopClass },
        loadouts: { ...state.loadouts, [action.id]: { siege, ship } } }
    }
    case 'recommended':
      return state.phase === 'draft' && !state.draftConfirmed
        ? { ...state, roster: [...recommendedIds], lineup: [...recommendedIds], captain: recommendedIds[0] }
        : state
    case 'draft': {
      if (state.phase !== 'draft' || state.draftConfirmed || !starterIds.includes(action.id)) return state
      if (state.roster.includes(action.id)) {
        const roster = state.roster.filter((id) => id !== action.id)
        return { ...state, roster, lineup: roster, captain: state.captain === action.id ? null : state.captain }
      }
      const roster = [...state.roster, action.id]
      return draftCost(roster) <= DRAFT_LIMIT ? { ...state, roster, lineup: roster } : state
    }
    case 'captain': {
      if (state.phase === 'draft' && state.draftConfirmed) return state
      if ((state.phase !== 'draft' && state.phase !== 'camp') || !state.roster.includes(action.id)) return state
      if (!state.lineup.includes(action.id) && state.lineup.length === FIELD_LIMIT) return state
      const lineup = state.lineup.includes(action.id) ? state.lineup : [...state.lineup, action.id]
      return { ...state, captain: action.id, lineup }
    }
    case 'lineup': {
      if (state.phase !== 'camp' || !state.roster.includes(action.id) || action.id === state.captain) return state
      if (state.lineup.includes(action.id)) return { ...state, lineup: state.lineup.filter((id) => id !== action.id) }
      return state.lineup.length < FIELD_LIMIT ? { ...state, lineup: [...state.lineup, action.id] } : state
    }
    case 'deploy':
      if (state.phase === 'draft') return deploy(state, 1, data)
      if (state.phase !== 'camp') return state
      return state.stage === STAGE_COUNT ? { ...state, phase: 'complete' } : deploy(state, state.stage + 1, data)
    case 'battle': {
      if (state.phase !== 'battle' || !state.battle) return state
      const battleWithTerrain = state.battle.terrainNames || !data.stages[state.stage - 1].jo
        ? state.battle
        : { ...state.battle, terrainNames: data.stages[state.stage - 1].jo?.terrainNames }
      const { battle, inventory } = playBattle(battleWithTerrain, state.inventory, action.action, action.seed)
      return battle === battleWithTerrain ? state : settleClear({ ...state, battle, inventory }, data)
    }
    case 'collect': {
      if (state.phase !== 'battle' || state.battle?.result !== 'win' || action.rolls.length < 10) return state
      const { clearResult, ...settled } = settleClear(state, data)
      return {
        ...settled, phase: 'camp', battle: null, gold: state.gold + data.stages[state.stage - 1].reward,
        offers: {
          officers: sample(officers.filter(({ id }) => !state.roster.includes(id) && (data.source === 'web' || data.officers[id]))
            .map(({ id }) => id), action.rolls.slice(0, 5)),
          treasures: sample(treasures.filter(({ id }) => !state.treasures.includes(id)).map(({ id }) => id), action.rolls.slice(5, 10)),
        },
      }
    }
    case 'retry':
      return state.phase === 'battle' && state.battle?.result === 'loss' ? deploy(state, state.stage, data) : state
    case 'buy': {
      if (state.phase !== 'camp') return state
      if (action.kind === 'items') {
        if (!Object.hasOwn(items, action.id)) return state
        const id = action.id as ItemId
        const price = items[id].price
        return state.gold >= price
          ? { ...state, gold: state.gold - price, inventory: { ...state.inventory, [id]: state.inventory[id] + 1 } }
          : state
      }
      if (!state.offers[action.kind].includes(action.id)) return state
      const offers = { ...state.offers, [action.kind]: state.offers[action.kind].filter((id) => id !== action.id) }
      if (action.kind === 'officers') {
        const officer = officerById[action.id]
        return state.gold >= officer.price ? { ...state, gold: state.gold - officer.price, roster: [...state.roster, officer.id], offers } : state
      }
      const treasure = treasureById[action.id]
      return state.gold >= treasure.price ? { ...state, gold: state.gold - treasure.price, treasures: [...state.treasures, treasure.id], offers } : state
    }
    case 'equip': {
      if (state.phase !== 'camp' || !state.roster.includes(action.officer)) return state
      const equipment = { ...state.equipment }
      if (!action.treasure) {
        delete equipment[action.officer]
        return { ...state, equipment }
      }
      if (!state.treasures.includes(action.treasure) || Object.values(equipment).includes(action.treasure)) return state
      return { ...state, equipment: { ...equipment, [action.officer]: action.treasure } }
    }
  }
}

function restoreBattleUnits(save: Campaign): Campaign {
  const battle = save.battle
  if (!battle || battle.board || battle.grid === 'hex') return save
  const stage = webCampaign.stages[save.stage - 1]
  const renamed = new Map<string, string>()
  const units = battle.units.map((unit) => {
    const officer = unit.side === 'ally' ? officerById[unit.id] : undefined
    const profile = unit.side === 'ally' ? officer : stage.enemies[Number(unit.id.slice('enemy-'.length))]
    const name = profile?.name
    if (name && unit.name !== name) renamed.set(unit.name, name)
    const level = unit.level ?? (unit.side === 'ally' ? 1 : 1 + stage.tier)
    const role = profile?.role ?? (Object.hasOwn(roles, unit.role) ? unit.role : 'lightInfantry')
    if (role !== unit.role) {
      const stats = unitStats(role, stage.tier, officer && { bonus: officer.bonus, treasure: save.equipment[unit.id] })
      return { ...unit, ...stats, hp: unit.hp, mp: MAX_ENERGY, name: name ?? unit.name, role, level }
    }
    if ((!name || unit.name === name) && unit.level === level) return unit
    return { ...unit, name: name ?? unit.name, level }
  })
  if (units.every((unit, index) => unit === battle.units[index])) return save
  const log = battle.log.map((line) => {
    for (const [before, after] of renamed) line = line.replaceAll(before, after)
    return line
  })
  return { ...save, battle: { ...battle, units, log } }
}

function restoreTroopSizes(save: Campaign) {
  if (save.troopSizeVersion === 1) return save
  const battle = save.battle
  if (battle) {
    for (const unit of [...battle.units, ...(battle.reinforcements ?? [])]) {
      if (unit.side === 'ally' && !unit.guest && save.equipment[unit.id]) unit.treasure = save.equipment[unit.id]
      const max = troopStrength(isSoldier(unit), unit.treasure)
      unit.currentHP = unit.currentHP > 0 && unit.hp > 0
        ? Math.max(1, Math.round(max * Math.min(unit.currentHP, unit.hp) / unit.hp)) : 0
      unit.hp = max
    }
  }
  Reflect.deleteProperty(save, 'troopScale')
  save.troopSizeVersion = 1
  return save
}

const SAVE_KEY = 'iron-pass.v1'
export function loadCampaign(source: CampaignData['source'] = 'web'): Campaign {
  try {
    const raw = localStorage.getItem(source === 'jo' ? 'iron-pass.jo.v1' : SAVE_KEY)
    if (raw) {
      const save = JSON.parse(raw) as Campaign & { growth?: unknown; battle: (Battle & { experience?: unknown }) | null }
      if (['draft', 'battle', 'camp', 'complete'].includes(save.phase)
          && Number.isInteger(save.stage) && save.stage >= 1 && save.stage <= STAGE_COUNT
          && Array.isArray(save.roster) && Array.isArray(save.lineup)
          && save.inventory && save.equipment && save.offers
          && (save.phase !== 'battle' || save.battle?.units)) {
        if (save.battle) {
          for (const unit of [...save.battle.units, ...(save.battle.reinforcements ?? [])]) {
            Reflect.deleteProperty(unit, 'tacticPoints')
            Reflect.deleteProperty(unit, 'usedWarArts')
          }
          save.battle.units = save.battle.units.map((unit) => unit.mp === MAX_ENERGY ? unit : ({
            ...unit, mp: MAX_ENERGY, currentMP: Math.max(0, MAX_ENERGY - Math.max(0, unit.mp - unit.currentMP)),
          }))
        }
        if (source === 'jo') {
          delete save.growth
          if (save.battle) delete save.battle.experience
          for (const id of save.roster) {
            if (!officerById[id] || save.troopClasses?.[id] !== 'siege') continue
            const converted = resolveDeployment(officerById[id].role, undefined, 'siege', save.loadouts?.[id])
            save.troopClasses[id] = converted.troopClass
            save.loadouts = { ...save.loadouts, [id]: converted.loadout }
          }
          if (save.battle && !save.battle.deployments) {
            for (const unit of [...save.battle.units, ...(save.battle.reinforcements ?? [])]) {
              Object.assign(unit, resolveDeployment(unit.role, unit.jo?.classId, unit.troopClass,
                unit.loadout ?? save.loadouts?.[unit.id]))
            }
            save.battle.deployments = true
            syncDeploymentPositions(save.battle)
            for (const unit of save.battle.units) {
              if (unit.side === 'ally' && !unit.guest && unit.loadout && save.roster.includes(unit.id)) {
                save.loadouts = { ...save.loadouts, [unit.id]: unit.loadout }
              }
            }
          }
          save.progression ??= { ...initialProgression }
          return restoreTroopSizes(save)
        }
        const restored = restoreTroopSizes(restoreBattleUnits(save))
        if (restored.phase === 'battle' && restored.battle?.grid === 'hex') resumeInitiativeBattle(restored.battle)
        return restored
      }
    }
  } catch {
    // Storage can be disabled in private or restricted browsing.
  }
  return createCampaign()
}

export function saveCampaign(state: Campaign, source: CampaignData['source'] = 'web') {
  try {
    localStorage.setItem(source === 'jo' ? 'iron-pass.jo.v1' : SAVE_KEY, JSON.stringify(state))
  } catch {
    // The running campaign still works when browser storage is unavailable.
  }
}
