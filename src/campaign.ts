import { DRAFT_LIMIT, FIELD_LIMIT, STAGE_COUNT, items, officerById, officers, recommendedIds, stages, starterIds, treasureById, treasures } from './data.ts'
import type { ItemId } from './data.ts'
import { newBattle, playBattle, unitStats } from './combat.ts'
import type { Battle, BattleAction } from './combat.ts'
import { roles } from './unit-classes.ts'

export type Campaign = {
  phase: 'draft' | 'battle' | 'camp' | 'complete'
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
    phase: 'draft', stage: 1, roster: [], captain: null, lineup: [], gold: 0,
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

function deploy(state: Campaign, stage: number): Campaign {
  if (!state.captain || !state.lineup.includes(state.captain)) return state
  const battle = newBattle(stages[stage - 1], state.lineup, state.captain, state.equipment)
  return { ...state, stage, phase: 'battle', battle }
}

export function campaignReducer(state: Campaign, action: Action): Campaign {
  switch (action.type) {
    case 'reset':
      return createCampaign()
    case 'recommended':
      return state.phase === 'draft'
        ? { ...state, roster: [...recommendedIds], lineup: [...recommendedIds], captain: recommendedIds[0] }
        : state
    case 'draft': {
      if (state.phase !== 'draft' || !starterIds.includes(action.id)) return state
      if (state.roster.includes(action.id)) {
        const roster = state.roster.filter((id) => id !== action.id)
        return { ...state, roster, lineup: roster, captain: state.captain === action.id ? null : state.captain }
      }
      const roster = [...state.roster, action.id]
      return draftCost(roster) <= DRAFT_LIMIT ? { ...state, roster, lineup: roster } : state
    }
    case 'captain': {
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
      if (state.phase === 'draft') return deploy(state, 1)
      if (state.phase !== 'camp') return state
      return state.stage === STAGE_COUNT ? { ...state, phase: 'complete' } : deploy(state, state.stage + 1)
    case 'battle': {
      if (state.phase !== 'battle' || !state.battle) return state
      const { battle, inventory } = playBattle(state.battle, state.inventory, action.action, action.seed)
      return battle === state.battle ? state : { ...state, battle, inventory }
    }
    case 'collect': {
      if (state.phase !== 'battle' || state.battle?.result !== 'win' || action.rolls.length < 10) return state
      return {
        ...state, phase: 'camp', battle: null, gold: state.gold + stages[state.stage - 1].reward,
        offers: {
          officers: sample(officers.filter(({ id }) => !state.roster.includes(id)).map(({ id }) => id), action.rolls.slice(0, 5)),
          treasures: sample(treasures.filter(({ id }) => !state.treasures.includes(id)).map(({ id }) => id), action.rolls.slice(5, 10)),
        },
      }
    }
    case 'retry':
      return state.phase === 'battle' && state.battle?.result === 'loss' ? deploy(state, state.stage) : state
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
  if (!battle) return save
  const stage = stages[save.stage - 1]
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
      const currentHP = unit.currentHP > 0 ? Math.max(1, Math.min(unit.currentHP, stats.hp)) : 0
      const currentMP = Math.min(unit.currentMP, stats.mp)
      return { ...unit, ...stats, name: name ?? unit.name, role, level, currentHP, currentMP }
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

const SAVE_KEY = 'iron-pass.v1'
export function loadCampaign(): Campaign {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw) {
      const save = JSON.parse(raw) as Campaign
      if (['draft', 'battle', 'camp', 'complete'].includes(save.phase)
          && Number.isInteger(save.stage) && save.stage >= 1 && save.stage <= STAGE_COUNT
          && Array.isArray(save.roster) && Array.isArray(save.lineup)
          && save.inventory && save.equipment && save.offers
          && (save.phase !== 'battle' || save.battle?.units)) return restoreBattleUnits(save)
    }
  } catch {
    // Storage can be disabled in private or restricted browsing.
  }
  return createCampaign()
}

export function saveCampaign(state: Campaign) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state))
  } catch {
    // The running campaign still works when browser storage is unavailable.
  }
}
