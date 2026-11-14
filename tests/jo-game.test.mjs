import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { readJoGame } from '../tools/jo-assets/game.mjs'
import { createJoCampaign, joTerrainId } from '../src/jo-game.ts'
import { awardExperience, campaignReducer, createCampaign, loadCampaign, saveCampaign } from '../src/campaign.ts'
import { canAttack, distance, key, movementCost, movesFor, newBattle } from '../src/combat.ts'
import { FIELD_LIMIT, STAGE_COUNT, recommendedIds } from '../src/data.ts'

const source = process.env.JO_GAME_SOURCE || fileURLToPath(new URL('../../jo/', import.meta.url))
const hasSource = existsSync(join(source, 'Data.e5'))

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
    assert.equal(stage.jo.deployment.length, FIELD_LIMIT, stage.name)
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
  assert.equal(opening.units.filter((unit) => unit.side === 'ally' && !unit.guest).length, recommendedIds.length)
  assert.deepEqual([captain.x, captain.y, captain.hp, captain.move], [7, 0, 1200, 6])
  assert.equal(movementCost(opening.map, captain, captain), 1)
  assert.ok(movesFor(opening, captain).every(({ cost }) => cost <= captain.move))
  const enemies = opening.units.filter(({ side }) => side === 'enemy')
  assert.equal(enemies.length, 10)
  assert.ok(enemies.every((unit) => !['7,11', '12,12'].includes(key(unit))))
  for (const y of [6, 14]) {
    assert.deepEqual(enemies.filter((unit) => unit.y === y).map(({ x }) => x).sort((a, b) => a - b), [9, 10])
  }
  assert.equal(opening.units.filter(({ guest }) => guest).length, 0)
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

test('settles each kill from a multi-target war art once and restores officer growth', { skip: !hasSource }, (context) => {
  const data = createJoCampaign(readJoGame(source))
  const initial = createCampaign()
  const state = campaignReducer({
    ...initial, captain: 'jin', lineup: ['jin', 'yeon'], roster: ['jin', 'yeon', 'ha'],
    growth: { jin: { level: 2, xp: 190 } },
  }, { type: 'deploy' }, data)
  const { battle } = state
  const archer = battle.units.find(({ id }) => id === 'jin')
  const [officer, soldier] = battle.units.filter(({ side }) => side === 'enemy')
  Object.assign(archer, { x: 9, y: 9, troopClass: 'ranged' })
  Object.assign(officer, { x: 9, y: 10, level: 2, currentHP: 1 })
  Object.assign(soldier, { x: 10, y: 10, level: 2, currentHP: 1, enemyKind: 'soldier' })
  battle.units = [archer, battle.units.find(({ id }) => id === 'yeon'), officer, soldier]
  battle.objectives = undefined
  const victory = campaignReducer(state, { type: 'battle', action: {
    type: 'warArt', art: 'barrage', unit: archer.id, target: officer.id,
  } }, data)
  assert.equal(victory.battle.result, 'win')
  assert.deepEqual(victory.battle.experience.earned, { jin: 60 + 30, yeon: 48 + 24, ha: 30 + 15 })
  assert.deepEqual(battle.experience.earned, {})
  assert.deepEqual(awardExperience({ level: 2, xp: 190 }, 20), { level: 3, xp: 10 })
  assert.deepEqual(awardExperience({ level: 1, xp: 0 }, 310), { level: 3, xp: 10 })

  const storage = new Map()
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value),
  } })
  context.after(() => {
    if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage)
    else delete globalThis.localStorage
  })
  saveCampaign(victory, 'jo')
  const restored = loadCampaign('jo')
  assert.deepEqual(restored.battle.experience, victory.battle.experience)
  const collect = { type: 'collect', rolls: Array(10).fill(0) }
  const camp = campaignReducer(restored, collect, data)
  assert.deepEqual(camp.growth.jin, { level: 3, xp: 80 })
  assert.equal(campaignReducer(camp, collect, data), camp)
  saveCampaign(camp, 'jo')
  const next = campaignReducer(loadCampaign('jo'), { type: 'deploy' }, data)
  assert.equal(next.battle.units.find(({ id }) => id === 'jin').level, 3)
})
