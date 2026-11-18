import assert from 'node:assert/strict'
import test from 'node:test'
import { campaignReducer, createCampaign, loadCampaign } from '../src/campaign.ts'
import { isSoldier } from '../src/combat.ts'
import { stageDeployment, terrains } from '../src/data.ts'
import { expeditionCampaign } from '../src/expedition.ts'
import { roleFor } from '../src/unit-classes.ts'

const reduce = (state, action) => campaignReducer(state, action, expeditionCampaign)
const draft = reduce(createCampaign(true), { type: 'recommended' })
function enter(number) {
  return reduce(number === 1 ? draft : { ...draft, phase: 'camp', stage: number - 1 }, { type: 'deploy' })
}

test('all 50 deployments contain only unique named officers on open cells and include the objective', () => {
  assert.equal(expeditionCampaign.stages.length, 50)
  for (const stage of expeditionCampaign.stages) {
    const battle = enter(stage.number).battle
    const enemies = battle.units.filter(unit => unit.side === 'enemy')
    assert.deepEqual(enemies.map(unit => unit.name), stage.enemies.map(unit => unit.name))
    assert.equal(new Set(enemies.map(unit => unit.name)).size, enemies.length)
    const occupied = new Set(stageDeployment(stage).map(p => p.x + ',' + p.y))
    for (const unit of enemies) {
      assert.match(unit.name, /^[가-힣]+$/u)
      assert.equal(unit.enemyKind, 'officer')
      assert.equal(isSoldier(unit), false)
      assert.equal(unit.role, roleFor(unit.name))
      assert.notEqual(terrains[stage.map[unit.y][unit.x]].moveCost, null)
      const cell = unit.x + ',' + unit.y
      assert.ok(!occupied.has(cell), stage.name + ' ' + cell)
      occupied.add(cell)
    }
    assert.deepEqual(battle.objectives, stage.number % 5 === 0 ? [enemies[0].name] : undefined)
  }
})

test('loading an old battle converts living and defeated enemies without restarting the turn', t => {
  const state = enter(45)
  const enemies = state.battle.units.filter(unit => unit.side === 'enemy')
  enemies.forEach((unit, i) => {
    unit.name = i ? '위군병' + (i + 1) : '장합'
    unit.enemyKind = i ? 'soldier' : 'officer'
  })
  enemies[0].currentHP = 77
  enemies[1].currentHP = 0
  enemies[2].x = 4
  state.battle.objectives = ['장합']
  state.battle.round = 3
  state.battle.log = ['위군병2 격파']
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage })
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => JSON.stringify(state) } })
  const restored = loadCampaign('expedition').battle
  const after = restored.units.filter(unit => unit.side === 'enemy')
  assert.deepEqual(after.map(unit => unit.name), expeditionCampaign.stages[44].enemies.map(u => u.name))
  assert.deepEqual(after.map(u => [u.id, u.x, u.y, u.currentHP]), enemies.map(u => [u.id, u.x, u.y, u.currentHP]))
  assert.deepEqual(restored.initiative, state.battle.initiative)
  assert.equal(restored.round, 3)
  assert.deepEqual(restored.objectives, ['학소'])
  assert.deepEqual(restored.log, ['왕쌍 격파'])
})
