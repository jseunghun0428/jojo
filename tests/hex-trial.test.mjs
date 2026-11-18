import assert from 'node:assert/strict'
import { test } from 'node:test'
import { boardGeometry, gridDistance, hexStep, neighbors, validCell } from '../src/grid.ts'
import { attackCells, canAttack, extinguishCells, extinguishChance, facingBetween, forecastAttack, isBurning, key, movementCost, movementPath, movesFor, playBattle, warArtArea, warArtCells } from '../src/combat.ts'
import { newHexTrial } from '../src/hex-trial.ts'
import { JO_FIRE_TERRAIN, joTerrainRow } from '../src/jo-game.ts'

const p = (x, y) => ({ x, y })
const stock = { salve: 0, tonic: 0 }
const targets = (event) => [event.impact, ...(event.additionalImpacts ?? [])].map(({ target }) => target)

test('odd-r neighbors, pointy-top cell centers and gaps agree', () => {
  const map = ['....', '....', '...']
  const even = p(2, 0)
  const odd = p(2, 1)
  assert.deepEqual(neighbors(even, 'hex'), [p(3, 0), p(2, 1), p(1, 1), p(1, 0), p(1, -1), p(2, -1)])
  assert.deepEqual(neighbors(odd, 'hex'), [p(3, 1), p(3, 2), p(2, 2), p(1, 1), p(2, 0), p(3, 0)])
  for (const origin of [even, odd]) {
    for (const cell of neighbors(origin, 'hex')) assert.equal(gridDistance(origin, cell, 'hex'), 1)
  }
  assert.deepEqual(neighbors(p(0, 0), 'hex').filter((cell) => validCell(cell, map)), [p(1, 0), p(0, 1)])
  const display = boardGeometry(map, 'hex')
  for (const [y, row] of map.entries()) {
    for (let x = 0; x < row.length; x++) {
      const cell = p(x, y)
      const center = display.center(cell)
      assert.deepEqual(display.cellAt(center), cell)
      for (const point of display.corners(cell, 2)) assert.deepEqual(display.cellAt(point), cell)
    }
  }
  assert.equal(display.center(odd).x - display.center(even).x, 32)
  assert.equal(display.cellAt(p(2, 2)), null)
  assert.equal(display.cellAt(p(1, display.center(p(0, 1)).y)), null)
  assert.equal(display.cellAt(display.center(p(3, 2))), null)
  assert.deepEqual(neighbors(odd, 'hex').map((cell) => facingBetween(odd, cell, 'hex')), ['right', 'down', 'down', 'left', 'up', 'up'])
})

test('movement uses the preview route and avoids costly or impassable hexes', () => {
  const before = newHexTrial()
  const [captain] = before.units
  Object.assign(captain, p(1, 1))
  const battle = { ...before, units: [captain], map: ['.....', '..f..', '.....'] }
  const destination = p(3, 1)
  const preview = movesFor(battle, captain, true)
  assert.equal(preview.find((cell) => key(cell) === key(destination)).cost, 3)
  assert.equal(movementCost(battle.map, p(2, 1), captain), 2)
  const path = movementPath(preview, destination)
  assert.deepEqual(path.at(-1), destination)
  const moved = playBattle(battle, stock, { type: 'move', unit: captain.id, to: destination }).battle
  assert.deepEqual(moved.events[0].move.path, [p(1, 1), ...path])
  const blocked = { ...battle, map: ['.....', '..w..', '.....'] }
  const detour = movementPath(movesFor(blocked, captain), destination)
  assert.equal(detour.length, 3)
  assert.ok(detour.every((cell) => movementCost(blocked.map, cell, captain) === 1))
  assert.equal(playBattle(blocked, stock, { type: 'move', unit: captain.id, to: p(2, 1) }).battle, blocked)
})

test('hex attack, counter and area arts use the preview geometry', () => {
  const battle = newHexTrial()
  const [captain, rider, archer, caster, first, second, third] = battle.units
  archer.currentMP = caster.currentMP = 70
  const at = (unit) => battle.units.find(({ id }) => id === unit.id)
  for (const enemy of battle.units.filter(({ side }) => side === 'enemy')) enemy.troopClass = 'infantry'
  Object.assign(captain, p(2, 4))
  Object.assign(first, p(1, 3))
  const attack = (source, target, fire = false) => playBattle(battle, stock, {
    type: fire ? 'fire' : 'attack', unit: source.id, target: target.id,
  }).battle
  assert.ok(attackCells(captain, false, battle.map, battle.grid).some((cell) => key(cell) === key(first)))
  assert.ok(canAttack(captain, first, false, battle.grid))
  assert.equal(forecastAttack(battle, captain, first).counter, true)
  assert.deepEqual(attack(captain, first).events.map(({ impact }) => impact.kind), ['attack', 'counter'])
  Object.assign(first, p(3, 3))
  assert.equal(attack(captain, first), battle)

  const art = (unit, id, target) => playBattle(battle, stock, { type: 'warArt', art: id, unit: unit.id, target: target.id }).battle
  const area = warArtArea(battle, archer, 'barrage', second)
  assert.deepEqual(area.map(key), [p(3, 4), ...neighbors(second, 'hex')].map(key))
  assert.ok(warArtCells(battle, archer, 'barrage').some((cell) => key(cell) === key(second)))
  assert.deepEqual(targets(art(archer, 'barrage', second).events[0]), [second, third, first].map(({ id }) => id))
  assert.deepEqual(warArtArea(battle, caster, 'blaze', third), [])
  assert.equal(art(caster, 'blaze', third), battle)
  Object.assign(third, p(2, 5))
  assert.deepEqual(warArtArea(battle, caster, 'blaze', third).map(key), [key(p(2, 5))])
  const fire = art(caster, 'blaze', third)
  assert.deepEqual(targets(fire.events[0]), [third.id])
  assert.ok(fire.burning.some((tile) => key(tile) === key(at(third))))

  const near = hexStep(rider, 5)
  const far = hexStep(rider, 5, 2)
  assert.notEqual(key(near), key(far))
  const chargeMap = { ...battle, map: battle.map.map((row, y) => y === far.y ? row.slice(0, far.x) + 'w' + row.slice(far.x + 1) : row) }
  assert.deepEqual(warArtArea(chargeMap, rider, 'charge', near), [near])
  assert.equal(warArtArea(battle, captain, 'sweep', hexStep(captain, 3)).length, 3)
})

test('extinguish uses intelligence and energy on a single nearby burning tile', () => {
  for (const grid of ['square', 'hex']) {
    const battle = newHexTrial()
    battle.grid = grid
    const caster = battle.units[0]
    const fire = (x, y) => ({ x, y, round: battle.round })
    const ownTile = fire(caster.x, caster.y)
    const close = fire(caster.x + 1, caster.y)
    const far = fire(caster.x + 2, caster.y)
    battle.burning = [ownTile, close, far]
    const cast = (target, seed = 1) => playBattle(battle, stock, { type: 'extinguish', unit: caster.id, target }, seed).battle
    assert.deepEqual(extinguishCells(battle, caster).map(key), [ownTile, close].map(key))
    assert.equal(cast(far), battle)
    assert.equal(cast(p(caster.x - 1, caster.y)), battle)
    assert.ok(extinguishChance(caster) > extinguishChance(battle.units.find(({ id }) => id === 'ha')))
    const success = cast(close)
    assert.deepEqual(success.burning, [ownTile, far])
    assert.equal(success.units[0].currentMP, caster.currentMP - 10)
    assert.equal(success.units[0].done, true)
    assert.match(success.log.at(-1), /소화 성공/)
    assert.equal(playBattle(success, stock, { type: 'end' }).battle.units[0].currentMP, 90)
    const failure = cast(close, 1900)
    assert.deepEqual(failure.burning, battle.burning)
    assert.equal(failure.units[0].currentMP, 90)
    assert.match(failure.log.at(-1), /소화 실패/)
    assert.deepEqual(cast(ownTile).burning, [close, far])
    caster.currentMP = 9
    assert.equal(cast(close), battle)
    caster.currentMP = 10
    battle.burning = []
    battle.map = battle.map.map((row, y) => y === close.y
      ? row.slice(0, close.x) + joTerrainRow([JO_FIRE_TERRAIN]) + row.slice(close.x + 1) : row)
    assert.equal(isBurning(battle, close), true)
    assert.equal(isBurning(cast(close), close), false)
  }
})

test('hex archers display, attack and counter at distances one and two', () => {
  const battle = newHexTrial()
  const archer = battle.units.find(({ id }) => id === 'jin')
  const foe = battle.units.find(({ side }) => side === 'enemy')
  Object.assign(archer, p(3, 3))
  const near = hexStep(archer, 0, 2)
  const far = hexStep(near, 1)
  const cells = attackCells(archer, false, battle.map, battle.grid)
  assert.equal(cells.length, 18)
  assert.ok(cells.every((cell) => [1, 2].includes(gridDistance(archer, cell, 'hex'))))
  const shoot = () => playBattle(battle, stock, { type: 'attack', unit: archer.id, target: foe.id }).battle
  Object.assign(foe, far)
  assert.ok(!canAttack(archer, foe, false, 'hex'))
  assert.equal(shoot(), battle)
  assert.equal(forecastAttack(battle, foe, archer).counter, false)
  assert.ok(warArtCells(battle, archer, 'barrage').some((cell) => key(cell) === key(far)))
  Object.assign(foe, near)
  assert.ok(canAttack(archer, foe, false, 'hex'))
  assert.equal(shoot().events[0].impact.target, foe.id)
  assert.equal(forecastAttack(battle, foe, archer).counter, true)
})

test('enemy turns move along adjacent hexes, attack in range and expire fire', () => {
  const battle = newHexTrial()
  const next = playBattle(battle, stock, { type: 'end' }).battle
  assert.equal(next.round, 2)
  const routes = next.events.filter((event) => 'move' in event)
  assert.ok(routes.length)
  for (const { move: { unit, path } } of routes) {
    const attacker = battle.units.find(({ id }) => id === unit)
    for (let i = 1; i < path.length; i++) {
      assert.equal(gridDistance(path[i - 1], path[i], 'hex'), 1)
      assert.notEqual(movementCost(battle.map, path[i], attacker), null)
    }
    const hit = next.events.find(({ impact }) => impact?.attacker === unit && impact.kind === 'attack')?.impact
    if (hit) {
      const defender = battle.units.find(({ id }) => id === hit.target)
      assert.ok(canAttack({ ...attacker, ...path.at(-1) }, defender, false, 'hex'))
    }
  }
  assert.ok(next.events.some(({ impact }) => impact?.kind === 'attack' && impact.attacker.startsWith('enemy-')))
  assert.equal(next.burning.length, 1)
  const later = playBattle(next, stock, { type: 'end' }).battle
  assert.equal(later.round, 3)
  assert.deepEqual(later.burning, [])
})
