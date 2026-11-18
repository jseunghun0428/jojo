import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { campaignReducer, createCampaign, loadCampaign, saveCampaign } from '../src/campaign.ts'
import { canAttack, initiativeQueue, key, movementCost, movementPath, movesFor, playBattle, startInitiativeBattle, warArtCells } from '../src/combat.ts'
import { stageDeployment, stageGuests } from '../src/data.ts'
import { gridDistance, neighbors, validCell } from '../src/grid.ts'
import { newHexTrial } from '../src/hex-trial.ts'
import { createWebHexCampaign } from '../src/hex-stages.ts'
import { createJoCampaign, webCampaign } from '../src/jo-game.ts'
import { campaignWithStages } from '../src/stage-library.ts'
import { startTrial, trialSetup } from '../src/trial-battle.ts'
import { readJoGame } from '../tools/jo-assets/game.mjs'

const source = process.env.JO_GAME_SOURCE || fileURLToPath(new URL('../../jo/', import.meta.url))
const hasSource = existsSync(join(source, 'Data.e5'))
const point = (x, y) => ({ x, y })
const withoutPosition = ({ x, y, ...unit }) => unit

test('the stage selector can start every web square stage and keeps the 9×7 sandbox available', () => {
  for (const stage of webCampaign.stages) {
    const setup = trialSetup(webCampaign, stage.number, 'square')
    assert.equal(setup.stage, stage)
    const trial = startTrial(setup)
    assert.equal(trial.stage, stage.number)
    assert.equal(trial.battle.initiative, undefined)
    assert.equal(trialSetup(webCampaign, stage.number, 'hex'), undefined)
  }
  assert.equal(trialSetup(webCampaign, 0, 'square'), undefined)
  assert.equal(trialSetup(webCampaign, 'sandbox', 'square'), undefined)
  const { battle } = startTrial(trialSetup(webCampaign, 'sandbox', 'hex'))
  assert.equal(battle.grid, 'hex')
  assert.ok(battle.map.length === 7 && battle.map.every((row) => row.length === 9))
  assert.equal(battle.burning.length, 1)
})

test('the web campaign and its edited stage entries use hex grids without local original files', () => {
  const web = createWebHexCampaign()
  for (const stage of web.stages) {
    assert.equal(stage.grid, 'hex')
    const setup = trialSetup(web, stage.number, 'hex')
    assert.equal(setup.stage, stage)
    assert.ok(startTrial(setup).battle.initiative)
  }
  const override = { ...webCampaign.stages[0], name: '편집 전장', board: { cellSize: 64, x: 6, y: 8, image: '/jo-game/M000.JPG' } }
  const edited = campaignWithStages(web, [{ id: 'web:1', source: 'web', stage: override }]).stages[0]
  assert.equal(edited.name, override.name)
  assert.equal(edited.grid, 'hex')
  assert.equal(edited.board, undefined)
  assert.deepEqual(edited.map, override.map)
})

test('the imported web hex campaign has connected deployments and retains its campaign saves', { skip: !hasSource }, () => {
  const jo = createJoCampaign(readJoGame(source))
  const web = createWebHexCampaign(jo)
  assert.equal(web.source, 'web')
  assert.equal(web.stages.length, jo.stages.length)
  for (const [index, stage] of web.stages.entries()) {
    const original = jo.stages[index]
    assert.equal(stage.name, original.name)
    assert.equal(stage.reward, webCampaign.stages[index].reward)
    assert.deepEqual(stage.enemies.map(({ name }) => name), original.enemies.map(({ name }) => name))
    assert.equal(stage.grid, 'hex')
    assert.equal(stage.jo.image, undefined)
    assert.notEqual(original.grid, 'hex')
    assert.ok(original.jo.image)

    const slots = stageDeployment(stage)
    const placements = [...slots, ...stageGuests(stage), ...stage.jo.reinforcements, ...stage.enemies]
    assert.equal(new Set(placements.map(key)).size, placements.length, stage.name)
    const reachable = [slots[0]]
    const visited = new Set(reachable.map(key))
    for (const current of reachable) {
      for (const next of neighbors(current, 'hex')) {
        if (visited.has(key(next)) || movementCost(stage.map, next) === null) continue
        reachable.push(next)
        visited.add(key(next))
      }
    }
    for (const placement of placements) {
      assert.notEqual(movementCost(stage.map, placement), null, stage.name)
      assert.ok(visited.has(key(placement)), `${stage.name} ${key(placement)}`)
    }
  }

  const draft = campaignReducer(createCampaign(), { type: 'recommended' }, web)
  const deploy = (data) => campaignReducer(draft, { type: 'deploy' }, data)
  const hex = deploy(web)
  const square = deploy(webCampaign)
  assert.equal(hex.battle.stageName, '영천 전투')
  assert.deepEqual(hex.battle.objectives, ['장보', '장량'])
  assert.equal(initiativeQueue(hex.battle).length, hex.battle.units.length)
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const storage = new Map()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value),
  } })
  try {
    saveCampaign(hex)
    assert.deepEqual(loadCampaign().battle, JSON.parse(JSON.stringify(hex.battle)))

    const legacy = { ...hex.battle, initiative: undefined }
    const waited = playBattle(legacy, hex.inventory, { type: 'wait', unit: 'ha' }).battle
    const captain = waited.units.find((unit) => unit.captain)
    const to = movesFor(waited, captain)[0]
    const moved = playBattle(waited, hex.inventory, { type: 'move', unit: captain.id, to }).battle
    moved.burning = [{ x: to.x, y: to.y, round: moved.round }]
    saveCampaign({ ...hex, battle: moved })
    const converted = loadCampaign().battle
    assert.equal(converted.round, moved.round)
    assert.deepEqual(converted.units, JSON.parse(JSON.stringify(moved.units)))
    assert.deepEqual(converted.pendingMove, moved.pendingMove)
    assert.equal(initiativeQueue(converted)[0].id, captain.id)
    assert.ok(!initiativeQueue(converted).some(({ id }) => id === 'ha'))
    const finished = playBattle(converted, hex.inventory, { type: 'wait', unit: captain.id }).battle
    assert.equal(finished.pendingMove, undefined)
    assert.notEqual(initiativeQueue(finished)[0].id, captain.id)

    saveCampaign(square)
    const restored = loadCampaign()
    assert.equal(restored.battle.initiative, undefined)
    assert.equal(restored.battle.grid, square.battle.grid)
    assert.deepEqual(restored.battle.map, square.battle.map)
    restored.battle.result = 'loss'
    assert.ok(campaignReducer(restored, { type: 'retry' }, web).battle.initiative)
    restored.battle.result = 'win'
    const camp = campaignReducer(restored, { type: 'collect', rolls: Array(10).fill(0) }, web)
    const next = campaignReducer(camp, { type: 'deploy' }, web)
    assert.equal(next.battle.stageName, jo.stages[1].name)
    assert.equal(next.battle.grid, 'hex')
    assert.ok(next.battle.initiative)
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
    else delete globalThis.localStorage
  }
})

test('sandbox initiative alternates by unit, preserves cancelled moves, and advances one day after all finish', () => {
  const setup = trialSetup(webCampaign, 'sandbox', 'hex')
  const initial = startTrial(setup)
  const { battle, inventory } = initial
  const ids = (state) => initiativeQueue(state).map(({ id }) => id)
  const order = ['ha', 'yeon', 'enemy-0', 'jin', 'enemy-2', 'enemy-3', 'seo', 'enemy-1']
  assert.deepEqual(ids(battle), order)
  assert.strictEqual(playBattle(battle, inventory, { type: 'end' }).battle, battle)
  assert.strictEqual(playBattle(battle, inventory, { type: 'wait', unit: 'yeon' }).battle, battle)
  assert.deepEqual(movesFor(battle, battle.units.find(({ id }) => id === 'yeon')), [])

  const actor = initiativeQueue(battle)[0]
  const destination = movesFor(battle, actor)[0]
  const moved = playBattle(battle, inventory, { type: 'move', unit: actor.id, to: destination }).battle
  assert.ok(moved.events[0].move)
  assert.deepEqual(ids(moved), order)
  let state = playBattle(moved, inventory, { type: 'cancel-move', unit: actor.id }).battle
  assert.deepEqual(initiativeQueue(state)[0], actor)
  assert.equal(state.pendingMove, undefined)
  initiativeQueue(state)[0].currentMP = 40

  for (const [index, id] of order.entries()) {
    assert.deepEqual(ids(state), order.slice(index))
    assert.equal(state.round, 1)
    if (id.startsWith('enemy')) {
      assert.strictEqual(playBattle(state, inventory, { type: 'initiative-ai', unit: id, day: 2 }).battle, state)
      state = playBattle(state, inventory, { type: 'initiative-ai', unit: id, day: 1 }).battle
      if (id === 'enemy-0') {
        assert.ok(state.events.some((event) => event.move?.unit === id))
        assert.ok(state.events.some((event) => event.impact?.attacker === id && event.impact.kind === 'attack'))
      }
    } else state = playBattle(state, inventory, { type: 'wait', unit: id }).battle
  }
  assert.equal(state.round, 2)
  assert.deepEqual(ids(state), order)
  assert.ok(state.units.every((unit) => !unit.done && !unit.moved && unit.currentMP === (unit.id === actor.id ? 40 : 100)))
  assert.deepEqual(startTrial(setup), initial)
  assert.deepEqual(ids(battle), order)
})

test('initiative skips a defeated defender and schedules a reinforcement for the new day', () => {
  const draft = newHexTrial()
  const captain = draft.units.find(({ captain }) => captain)
  const first = draft.units.find(({ id }) => id === 'ha')
  const defender = draft.units.find(({ id }) => id === 'enemy-0')
  const guest = { ...draft.units.find(({ id }) => id === 'seo'), id: 'guest', x: 1, y: 6, guest: true }
  draft.reinforcements = [guest]
  draft.burning.push({ x: first.x, y: first.y, round: 1 })
  Object.assign(defender, { x: 2, y: 3, currentHP: 1 })
  const { inventory } = startTrial(trialSetup(webCampaign, 'sandbox', 'hex'))
  let state = startInitiativeBattle(draft)
  const scorchedHP = first.hp - Math.floor(first.hp / 20)
  assert.equal(initiativeQueue(state)[0].currentHP, scorchedHP)
  state = playBattle(state, inventory, { type: 'wait', unit: 'ha' }).battle
  assert.equal(state.units.find(({ id }) => id === first.id).currentHP, scorchedHP)
  state = playBattle(state, inventory, { type: 'attack', unit: captain.id, target: defender.id }).battle
  assert.equal(state.units.find(({ id }) => id === defender.id).currentHP, 0)
  assert.equal(initiativeQueue(state)[0].id, 'jin')
  while (state.round === 1 && !state.result) {
    const next = initiativeQueue(state)[0]
    const action = next.side === 'enemy' ? { type: 'initiative-ai', unit: next.id, day: 1 } : { type: 'wait', unit: next.id }
    state = playBattle(state, inventory, action).battle
  }
  const arrived = initiativeQueue(state).find(({ id }) => id === guest.id)
  assert.equal(arrived?.currentMP, 100)
  assert.equal(arrived?.guest, true)
})

test('Yeongcheon variants retain the same units and objectives with connected, legal deployments', { skip: !hasSource }, () => {
  const data = createJoCampaign(readJoGame(source))
  const square = trialSetup(data, 1, 'square')
  const hex = trialSetup(data, 1, 'hex')
  const squareBefore = JSON.stringify(data.stages[0])
  assert.equal(square.stage, data.stages[0])
  assert.ok(square.stage.jo.image)
  assert.equal(hex.stage.jo.image, undefined)
  for (const stage of data.stages) {
    assert.equal(trialSetup(data, stage.number, 'square').stage, stage)
    assert.equal(!!trialSetup(data, stage.number, 'hex'), stage.number === 1)
  }
  const a = startTrial(square).battle
  const b = startTrial(hex).battle
  assert.deepEqual(a.units.map(withoutPosition), b.units.map(withoutPosition))
  assert.deepEqual(a.reinforcements.map(withoutPosition), b.reinforcements.map(withoutPosition))
  assert.deepEqual(a.objectives, ['장보', '장량'])
  assert.deepEqual(b.objectives, a.objectives)
  assert.equal(b.grid, 'hex')
  assert.ok(b.map.length === 18 && b.map.every((row) => row.length === 19))
  const placements = [...stageDeployment(hex.stage), ...b.units.filter(({ side }) => side === 'enemy'), ...b.reinforcements]
  assert.equal(new Set(placements.map(key)).size, placements.length)
  for (const unit of placements) {
    assert.ok(validCell(unit, b.map))
    assert.notEqual(movementCost(b.map, unit, unit.jo ? unit : b.units[0]), null)
  }

  const captain = b.units[0]
  const connected = new Set([key(captain)])
  const frontier = [captain]
  for (let i = 0; i < frontier.length; i++) {
    for (const next of neighbors(frontier[i], b.grid)) {
      if (connected.has(key(next)) || movementCost(b.map, next, captain) === null) continue
      connected.add(key(next))
      frontier.push(next)
    }
  }
  for (const gate of [point(10, 6), point(4, 10), point(10, 14)]) assert.ok(connected.has(key(gate)))
  for (const wall of [point(8, 6), point(14, 10), point(8, 14)]) assert.equal(movementCost(b.map, wall, captain), null)
  for (const boss of b.units.filter(({ name }) => b.objectives.includes(name))) {
    assert.ok(neighbors(boss, b.grid).some((cell) => connected.has(key(cell)) && canAttack({ ...captain, ...cell }, boss, false, b.grid)))
  }
  assert.equal(JSON.stringify(data.stages[0]), squareBefore)
})

test('Yeongcheon approaches and first enemy attacks follow the selected version, and a trial can restart', { skip: !hasSource }, () => {
  const data = createJoCampaign(readJoGame(source))
  for (const [grid, distance, moveCosts, guardTarget] of [
    ['square', 7, [6, 4], 'seo'],
    ['hex', 5, [4, 3], 'jin'],
  ]) {
    const setup = trialSetup(data, 1, grid)
    const initial = startTrial(setup)
    const { battle } = initial
    const foe = battle.units.find(({ id }) => id === 'enemy-8')
    const allies = battle.units.filter(({ side }) => side === 'ally')
    const nearest = Math.min(...allies.map((unit) => gridDistance(unit, foe, battle.grid)))
    assert.equal(nearest, distance)
    for (const [index, id] of ['yeon', 'jin'].entries()) {
      const unit = allies.find((ally) => ally.id === id)
      const reachable = movesFor(battle, unit, true)
      const options = reachable.filter((cell) => !cell.occupied && canAttack({ ...unit, ...cell }, foe, false, battle.grid))
      const destination = options.sort((a, b) => a.cost - b.cost)[0]
      assert.equal(destination.cost, moveCosts[index])
      const moved = playBattle(battle, initial.inventory, { type: 'move', unit: id, to: destination }).battle
      assert.deepEqual(moved.events[0].move.path, [point(unit.x, unit.y), ...movementPath(reachable, destination)])
      if (id === 'jin') {
        const archer = moved.units.find((ally) => ally.id === id)
        archer.currentMP = 70
        const preview = warArtCells(moved, archer, 'barrage')
        assert.ok(preview.some((cell) => key(cell) === key(foe)))
        const result = playBattle(moved, initial.inventory, { type: 'warArt', unit: id, art: 'barrage', target: foe.id }).battle
        assert.equal(result.events[0].impact.target, foe.id)
      }
    }
    const afterEnemyTurn = playBattle(battle, initial.inventory, { type: 'end' }).battle
    assert.equal(afterEnemyTurn.round, 2)
    assert.equal(afterEnemyTurn.events.find((event) => event.impact?.attacker === foe.id).impact.target, guardTarget)
    assert.ok(afterEnemyTurn.units.some((unit) => unit.guest && unit.name === '유비'))
    assert.ok(afterEnemyTurn.units.filter((unit) => unit.guest).every((unit) => unit.currentMP === 100))
    assert.equal(afterEnemyTurn.units.find((unit) => unit.captain).currentMP, 100)

    // With the player holding position, guests can reach and damage a commander.
    let guestAdvance = afterEnemyTurn
    for (let turn = 2; turn <= 12 && !guestAdvance.result; turn++) {
      guestAdvance = playBattle(guestAdvance, initial.inventory, { type: 'end' }).battle
    }
    assert.ok(guestAdvance.units.some((unit) => battle.objectives.includes(unit.name) && unit.currentHP < unit.hp), grid)

    // Leave a regular enemy alive to confirm the boss objective wins independently of a rout.
    const lateBattle = startTrial(setup).battle
    const commander = lateBattle.units[0]
    const [lastBoss, defeatedBoss] = lateBattle.units.filter(({ name }) => lateBattle.objectives.includes(name))
    Object.assign(lastBoss, { x: commander.x + 2, y: commander.y, currentHP: 1 })
    Object.assign(defeatedBoss, { currentHP: 0 })
    commander.x += 1
    const victory = playBattle(lateBattle, initial.inventory, { type: 'attack', unit: commander.id, target: lastBoss.id }).battle
    assert.equal(victory.result, 'win')
    assert.ok(victory.units.some((unit) => unit.side === 'enemy' && unit.currentHP > 0))
    const lossBattle = startTrial(setup).battle
    const [burningCaptain] = lossBattle.units
    burningCaptain.currentHP = 1
    lossBattle.burning = [{ x: burningCaptain.x, y: burningCaptain.y, round: 1 }]
    assert.equal(playBattle(lossBattle, initial.inventory, { type: 'end' }).battle.result, 'loss')
    assert.deepEqual(startTrial(setup), initial)
  }
})
