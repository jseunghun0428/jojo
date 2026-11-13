import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { readJoGame } from '../tools/jo-assets/game.mjs'
import { createJoCampaign, joTerrainId } from '../src/jo-game.ts'
import { campaignReducer, createCampaign } from '../src/campaign.ts'
import { attackCells, canAttack, distance, key, movementCost, movesFor, newBattle } from '../src/combat.ts'
import { FIELD_LIMIT, STAGE_COUNT, recommendedIds } from '../src/data.ts'

const source = fileURLToPath(new URL('../../jo/', import.meta.url))
const hasSource = existsSync(new URL('../../jo/Data.e5', import.meta.url))

test('imports the local campaign and deploys valid formations in all 50 battles', { skip: !hasSource }, () => {
  const pack = readJoGame(source)
  const data = createJoCampaign(pack)
  assert.equal(pack.classes.length, 240)
  assert.equal(data.stages.length, STAGE_COUNT)
  assert.equal(data.officers.yeon.className, '제후')
  assert.equal(data.officers.ha.className, '전위대')
  assert.equal(data.officers.baek.className, '경전차')
  assert.equal(data.officers.seo.className, '부관')
  for (const stage of data.stages) {
    const battle = newBattle(stage, recommendedIds, 'yeon', {}, data.officers)
    assert.ok(battle.units[0].captain, stage.name)
    assert.ok(battle.units.filter((unit) => unit.side === 'ally' && !unit.guest).length <= FIELD_LIMIT, stage.name)
    assert.ok(battle.units.every((unit) => joTerrainId(battle.map, unit) !== undefined && unit.jo?.className), stage.name)
    assert.equal(new Set(battle.units.map(key)).size, battle.units.length, stage.name)
  }
  const opening = newBattle(data.stages[0], recommendedIds, 'yeon', {}, data.officers)
  assert.equal(data.stages[0].name, '영천 전투')
  assert.equal(opening.map.length, 20)
  assert.equal(opening.map[0].length, 20)
  const [captain] = opening.units
  assert.deepEqual([captain.x, captain.y, captain.hp, captain.move], [7, 0, 110, 6])
  assert.equal(movementCost(opening.map, captain, captain), 1)
  assert.ok(movesFor(opening, captain).every(({ cost }) => cost <= captain.move))
  const bow = opening.units.find(({ name }) => name === '궁병1')
  const range = new Set(attackCells(bow, false, opening.map).map(key))
  assert.ok(range.has('12,19'))
  assert.ok(!range.has('12,18'))
})

test('wins Yeongcheon with the imported classes and carries the reward into Sishui Gate', { skip: !hasSource }, () => {
  const data = createJoCampaign(readJoGame(source))
  const reduce = (state, action) => campaignReducer(state, action, data)
  let state = reduce(reduce(createCampaign(), { type: 'recommended' }), { type: 'deploy' })
  const play = (action) => { state = reduce(state, { type: 'battle', seed: 8 * 17311 + state.battle.round, action }) }
  for (let turn = 0; turn < 30 && !state.battle.result; turn++) {
    const { battle } = state
    const captain = battle.units[0]
    const foes = battle.units.filter((unit) => unit.side === 'enemy' && unit.currentHP > 0)
    const options = [captain, ...movesFor(battle, captain)].map((point) => {
      const moved = { ...captain, x: point.x, y: point.y }
      const target = foes.filter((unit) => canAttack(moved, unit)).sort((a, b) => a.currentHP - b.currentHP)[0]
      const risk = foes.filter((unit) => distance(point, unit) <= 3).length
      const nearest = Math.min(...foes.map((unit) => distance(point, unit)))
      return { point, target, score: (target ? 30 - target.currentHP / 15 : 0) - nearest - risk * 3 }
    })
    const { point, target } = options.sort((a, b) => b.score - a.score)[0]
    play({ type: 'move', unit: captain.id, to: point })
    if (captain.currentHP <= 55 && state.inventory.salve) play({ type: 'item', unit: captain.id, item: 'salve' })
    else if (target) play({ type: 'attack', unit: captain.id, target: target.id })
    else play({ type: 'wait', unit: captain.id })
    play({ type: 'end' })
    if (turn === 0) assert.ok(state.battle.units.some((unit) => unit.guest && unit.name === '유비'))
  }
  assert.equal(state.battle.result, 'win')
  state = reduce(state, { type: 'collect', rolls: Array(10).fill(0) })
  assert.equal(state.phase, 'camp')
  assert.equal(state.gold, data.stages[0].reward)
  const id = state.offers.officers[0]
  assert.ok(data.officers[id])
  state = reduce(state, { type: 'buy', kind: 'officers', id })
  assert.ok(state.roster.includes(id))
  state = reduce(state, { type: 'deploy' })
  assert.equal(state.stage, 2)
  assert.equal(data.stages[1].name, '사수관 전투')
  assert.ok(state.battle.units[0].currentHP === state.battle.units[0].hp)
  assert.equal(state.battle.units.filter((unit) => unit.side === 'ally').length, 4)
})
