import test from 'node:test'
import assert from 'node:assert/strict'
import { campaignReducer, createCampaign, loadCampaign, saveCampaign } from '../src/campaign.ts'
import { assignedTroops, expeditionCampaign, troopBudget } from '../src/expedition.ts'

const reduce = (state, action) => campaignReducer(state, action, expeditionCampaign)
const assign = (state, id, count) => reduce(state, { type: 'assignTroops', id, count })
const lobby = () => reduce(reduce(createCampaign(true), { type: 'recommended' }), { type: 'confirmDraft' })

test('first deployment, retry and next stage deploy the assigned full strengths', () => {
  let state = lobby()
  const [captain, second] = state.lineup
  for (const count of [0, 1500, 5000, NaN]) assert.equal(assign(state, captain, count), state)
  state = assign(state, second, 1000)
  assert.equal(troopBudget(state).reserve, 3000)
  state = assign(state, captain, 7000)
  state = reduce(state, { type: 'deploy' })
  const units = state.battle.units
  assert.equal(units.find(u => u.id === captain).hp, 7000)
  assert.equal(units.find(u => u.id === second).currentHP, 1000)
  assert.equal(assign(state, captain, 1000), state)
  const retried = reduce({ ...state, battle: { ...state.battle, result: 'loss' } }, { type: 'retry' })
  assert.deepEqual(retried.battle.units, units)
  state = reduce({ ...state, battle: { ...state.battle, result: 'win' } }, { type: 'collect', rolls: Array(13).fill(0) })
  assert.deepEqual(state.offers.treasures, [])
  assert.equal(state.spoilChoices.includes('provisions'), false)
  state = reduce(state, { type: 'claimSpoil', id: 'levy' })
  state = assign(state, second, 2000)
  state = reduce(state, { type: 'deploy' })
  assert.equal(state.stage, 2)
  assert.equal(state.battle.units.find(u => u.id === second).currentHP, 2000)
})

test('benching releases troops and reactivating a unit respects reserves and captain selection', () => {
  let state = { ...lobby(), phase: 'camp' }
  const [captain, second, third] = state.lineup
  state = reduce(state, { type: 'lineup', id: second })
  state = assign(state, captain, 8000)
  assert.equal(troopBudget(state).reserve, 0)
  assert.equal(reduce(state, { type: 'captain', id: second }), state)
  state = assign(state, third, 2000)
  state = reduce(state, { type: 'captain', id: second })
  assert.equal(state.captain, second)
  assert.equal(assignedTroops(state, second), 2000)
  assert.equal(troopBudget(state).reserve, 0)
  state = reduce(state, { type: 'lineup', id: third })
  state = reduce(state, { type: 'lineup', id: captain })
  assert.equal(assign(state, second, 11000), state)
})

test('old expedition saves migrate inventory, shop, pending rewards and injured units', t => {
  const storage = new Map()
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else delete globalThis.localStorage
  })
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value),
  } })
  const old = reduce(lobby(), { type: 'deploy' })
  delete old.troopAssignments
  const unit = old.battle.units[0]
  unit.hp = 4300
  unit.currentHP = 2150
  unit.treasure = 'attack-1'
  old.inventory = { salve: 5, tonic: 2 }
  old.treasures = ['attack-1']
  old.equipment[unit.id] = 'attack-1'
  old.spoils = { provisions: 2, levy: 1 }
  saveCampaign(old, 'expedition')
  const restored = loadCampaign('expedition')
  assert.deepEqual(restored.inventory, { salve: 0, tonic: 0 })
  assert.deepEqual(restored.treasures, [])
  assert.deepEqual(restored.equipment, {})
  assert.deepEqual(restored.spoils, { levy: 1 })
  assert.equal(restored.battle.units[0].currentHP, 2000)
  assert.equal(restored.battle.units[0].treasure, undefined)
  assert.equal(reduce(restored, { type: 'battle', action: { type: 'item', unit: unit.id, item: 'salve' } }), restored)
  saveCampaign({ ...old, phase: 'camp', battle: null, spoilChoices: ['drum', 'provisions', 'pay'] }, 'expedition')
  const camp = loadCampaign('expedition')
  assert.equal(new Set(camp.spoilChoices).size, 3)
  assert.equal(camp.spoilChoices.includes('provisions'), false)
  for (const kind of ['items', 'treasures']) assert.equal(reduce(camp, { type: 'buy', kind, id: 'salve' }), camp)
  assert.equal(reduce(camp, { type: 'equip', officer: unit.id, treasure: 'attack-1' }), camp)
  const assigned = assign(camp, unit.id, 5000)
  saveCampaign(assigned, 'expedition')
  assert.deepEqual(loadCampaign('expedition'), JSON.parse(JSON.stringify(assigned)))
})
