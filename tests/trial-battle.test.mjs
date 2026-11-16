import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { canAttack, key, movementCost, movementPath, movesFor, playBattle, warArtCells } from '../src/combat.ts'
import { stageDeployment } from '../src/data.ts'
import { gridDistance, neighbors, validCell } from '../src/grid.ts'
import { createJoCampaign, webCampaign } from '../src/jo-game.ts'
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
    assert.equal(startTrial(setup).stage, stage.number)
    assert.equal(trialSetup(webCampaign, stage.number, 'hex'), undefined)
  }
  assert.equal(trialSetup(webCampaign, 0, 'square'), undefined)
  assert.equal(trialSetup(webCampaign, 'sandbox', 'square'), undefined)
  const { battle } = startTrial(trialSetup(webCampaign, 'sandbox', 'hex'))
  assert.equal(battle.grid, 'hex')
  assert.ok(battle.map.length === 7 && battle.map.every((row) => row.length === 9))
  assert.equal(battle.burning.length, 1)
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
    assert.ok(afterEnemyTurn.units.filter((unit) => unit.guest).every((unit) => unit.currentMP === 60))
    assert.equal(afterEnemyTurn.units.find((unit) => unit.captain).currentMP, 65)

    // With the player holding position, the advancing guests can reach both commanders.
    let guestAdvance = afterEnemyTurn
    for (let turn = 2; turn <= 12 && !guestAdvance.result; turn++) {
      guestAdvance = playBattle(guestAdvance, initial.inventory, { type: 'end' }).battle
    }
    assert.equal(guestAdvance.result, 'win', grid)

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
