import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { readJoGame } from '../tools/jo-assets/game.mjs'
import { createJoCampaign, joTerrainId } from '../src/jo-game.ts'
import { awardExperience, campaignReducer, clearScore, createCampaign, loadCampaign, requiredShipIds, saveCampaign } from '../src/campaign.ts'
import { battleAttributes, canAttack, deploymentPreviews, distance, key, movementCost, movesFor, newBattle, warArtsFor } from '../src/combat.ts'
import { FIELD_LIMIT, STAGE_COUNT, officers, recommendedIds } from '../src/data.ts'

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
  for (const { id, name } of officers.filter(({ id }) => data.officers[id])) {
    const [officer] = newBattle(data.stages[0], [id], id, {}, data.officers).units
    const arts = warArtsFor(officer).map(({ id }) => id)
    for (const basic of ['blaze', 'intercept', 'calm']) assert.ok(arts.includes(basic), `${name}: ${basic}`)
    if (name === '우금' || name === '한당') assert.deepEqual(arts, ['blaze', 'intercept', 'calm'], name)
  }
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
  assert.deepEqual(battleAttributes(captain), [73, 93, 99, 97])
  assert.equal(opening.units.filter((unit) => unit.side === 'ally' && !unit.guest).length, recommendedIds.length)
  assert.deepEqual([captain.x, captain.y, captain.hp, captain.move], [7, 0, 10_000, 6])
  assert.deepEqual([...new Set(opening.units.filter(({ enemyKind }) => enemyKind === 'soldier').map(({ hp }) => hp))], [5_000])
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
    for (const id of ['yeon', 'ha', 'jin', 'seo']) {
      const { battle } = state
      const captain = battle.units.find((unit) => unit.id === id)
      if (state.battle.result || !captain?.currentHP) continue
      const foes = battle.units.filter((unit) => unit.side === 'enemy' && unit.currentHP > 0)
      const options = [captain, ...movesFor(battle, captain)].map((point) => {
        const moved = { ...captain, x: point.x, y: point.y }
        const target = foes.filter((unit) => canAttack(moved, unit)).sort((a, b) => a.currentHP - b.currentHP)[0]
        const risk = foes.filter((unit) => distance(point, unit) <= 3).length
        const nearest = Math.min(...foes.map((unit) => distance(point, unit)))
        return { point, target, score: (target ? 100 - target.currentHP / 30 : 0) - nearest - risk * 4 }
      })
      const { point, target } = options.sort((a, b) => b.score - a.score)[0]
      play({ type: 'move', unit: captain.id, to: point })
      if (captain.currentHP <= 400 && state.inventory.salve) play({ type: 'item', unit: captain.id, item: 'salve' })
      else if (target) play({ type: 'attack', unit: captain.id, target: target.id })
      else play({ type: 'wait', unit: captain.id })
    }
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

test('awards unified clear XP once and applies it to the next battle', { skip: !hasSource }, (context) => {
  const data = createJoCampaign(readJoGame(source))
  const initial = createCampaign()
  const state = campaignReducer({
    ...initial, captain: 'jin', lineup: ['jin', 'yeon'], roster: ['jin', 'yeon', 'ha'],
  }, { type: 'deploy' }, data)
  data.stages[0].turnLimit = 6
  const { battle } = state
  const archer = battle.units.find(({ id }) => id === 'jin')
  const [officer, soldier] = battle.units.filter(({ side }) => side === 'enemy')
  Object.assign(archer, { x: 9, y: 9, troopClass: 'ranged', currentMP: 70 })
  Object.assign(officer, { x: 9, y: 10, level: 2, currentHP: 1 })
  Object.assign(soldier, { x: 10, y: 10, level: 2, currentHP: 1, enemyKind: 'soldier' })
  battle.units = [archer, battle.units.find(({ id }) => id === 'yeon'), officer, soldier]
  for (let index = 0; index < 6; index++) {
    battle.units.push({ ...soldier, id: `defeated-${index}`, currentHP: 0,
      enemyKind: index === 0 ? 'officer' : 'soldier' })
  }
  officer.enemyKind = 'officer'
  battle.objectives = undefined
  const victory = campaignReducer(state, { type: 'battle', action: {
    type: 'warArt', art: 'barrage', unit: archer.id, target: officer.id,
  } }, data)
  assert.equal(victory.battle.result, 'win')
  assert.deepEqual(victory.clearResult, { basePoints: 40, soldierPoints: 30, officerPoints: 30,
    turnPoints: 10, total: 110, xp: 110, fromLevel: 1, toLevel: 2 })
  assert.deepEqual(victory.progression, { level: 2, xp: 10 })
  assert.equal(clearScore(victory.battle, { ...data.stages[0], turnLimit: 50 }).turnPoints, 20)
  assert.equal(clearScore(victory.battle, { ...data.stages[0], turnLimit: undefined }).turnPoints, 0)
  const lost = { ...state, battle: { ...battle, result: 'loss' } }
  const retry = campaignReducer(lost, { type: 'retry' }, data)
  assert.deepEqual(retry.progression, { level: 1, xp: 0 })
  assert.equal(victory.battle.units.find(({ id }) => id === 'jin').level, 1)
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
  assert.deepEqual(restored.clearResult, victory.clearResult)
  const collect = { type: 'collect', rolls: Array(10).fill(0) }
  const camp = campaignReducer(restored, collect, data)
  assert.deepEqual(camp.progression, { level: 2, xp: 10 })
  assert.equal(campaignReducer(camp, collect, data), camp)
  saveCampaign(camp, 'jo')
  const next = campaignReducer(loadCampaign('jo'), { type: 'deploy' }, data)
  const nextArcher = next.battle.units.find(({ id }) => id === 'jin')
  assert.equal(nextArcher.level, 2)
  assert.equal(nextArcher.hp, archer.hp)
  const replay = campaignReducer({ ...restored, clearResult: undefined }, collect, data)
  assert.deepEqual(replay.progression, camp.progression)
  saveCampaign({ ...camp, progression: undefined, growth: { jin: { level: 9, xp: 10 } } }, 'jo')
  const legacy = loadCampaign('jo')
  assert.deepEqual(legacy.progression, { level: 1, xp: 0 })
  assert.deepEqual(legacy.roster, camp.roster)
  assert.equal(legacy.stage, camp.stage)
  assert.equal(legacy.growth, undefined)
})

test('Jo loadouts round-trip and legacy siege units become land units with equipment', { skip: !hasSource }, (context) => {
  const data = createJoCampaign(readJoGame(source))
  const storage = new Map()
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value),
  } })
  context.after(() => {
    if (prev) Object.defineProperty(globalThis, 'localStorage', prev)
    else delete globalThis.localStorage
  })
  const reduce = (state, action) => campaignReducer(state, action, data)
  const draft = reduce(createCampaign(), { type: 'recommended' })
  const camp = { ...draft, phase: 'camp', stage: 2 }
  saveCampaign({ ...camp, troopClasses: { yeon: 'siege' } }, 'jo')
  const converted = loadCampaign('jo')
  assert.equal(converted.stage, 2)
  assert.deepEqual(converted.roster, camp.roster)
  assert.equal(converted.troopClasses.yeon, 'infantry')
  assert.equal(converted.loadouts.yeon.siege, 'ram')
  const outfitted = reduce(converted, { type: 'loadout', id: 'yeon', loadout: { siege: 'ram', ship: 'skiff' } })
  saveCampaign(outfitted, 'jo')
  const deployed = reduce(loadCampaign('jo'), { type: 'deploy' })
  const { battle } = deployed
  const captain = battle.units[0]
  assert.deepEqual(captain.loadout, { siege: 'ram', ship: 'skiff' })
  const gateID = battle.terrainNames.indexOf('성문')
  let gate
  for (let y = 0; y < battle.map.length && !gate; y++) {
    for (let x = 0; x < battle.map[y].length && !gate; x++) {
      if (joTerrainId(battle.map, { x, y }) === gateID) gate = { x, y }
    }
  }
  assert.ok(gate, '호로관 성문')
  Object.assign(captain, { x: gate.x - 1, y: gate.y, currentMP: 70 })
  const [{ foe, damage }] = deploymentPreviews(battle, captain, 'ramStrike', gate)
  const hit = reduce(deployed, { type: 'battle', action: { type: 'warArt', unit: captain.id, art: 'ramStrike', target: gate } })
  assert.equal(hit.battle.structureHP[foe.id], Math.max(0, foe.hp - damage))
  const removed = reduce(outfitted, { type: 'loadout', id: 'yeon', loadout: {} })
  const cleared = reduce(removed, { type: 'deploy' })
  assert.deepEqual(cleared.battle.units[0].loadout, { siege: undefined, ship: undefined })

  const oldBattle = newBattle(data.stages[2], draft.lineup, draft.captain, {}, data.officers, { yeon: 'siege' })
  saveCampaign({ ...deployed, battle: oldBattle }, 'jo')
  const restored = loadCampaign('jo')
  assert.equal(restored.battle.units[0].troopClass, 'infantry')
  assert.equal(restored.battle.units[0].loadout.siege, 'ram')

  const atSea = { ...outfitted, stage: 43 }
  const needsShips = requiredShipIds(atSea, data.stages[43], data)
  assert.ok(needsShips.length > 0)
  assert.equal(reduce(atSea, { type: 'deploy' }), atSea)
  const ready = needsShips.reduce((state, id) =>
    reduce(state, { type: 'loadout', id, loadout: { ship: 'skiff' } }), atSea)
  const atSeaBattle = reduce(ready, { type: 'deploy' }).battle
  assert.ok(needsShips.every((id) => atSeaBattle.units.find((unit) => unit.id === id)?.afloat))
})
