import assert from 'node:assert/strict'
import test from 'node:test'
import { officerAttributes } from '../src/officer-attributes.ts'
import { officerWarArts } from '../src/officer-war-arts.ts'
import { roles } from '../src/unit-classes.ts'
import { campaignReducer as reduce, createCampaign, draftCost, loadCampaign, saveCampaign } from '../src/campaign.ts'
import { MAX_ENERGY, attackCells, basicPhysicalDamage, battleAttributes, canAttack, deploymentPreviews, distance, forecastAttack, key, movementLimit, movementPath, movesFor, newBattle, physicalStats, playBattle, terrainAt, troopArtDamage, troopArtPreviews, warArtEffect, warArtsFor } from '../src/combat.ts'
import { DRAFT_LIMIT, FIELD_LIMIT, HEIGHT, OFFICER_TROOPS, SOLDIER_TROOPS, TROOP_SCALE, WIDTH, items, officerById, officers, recommendedIds, stages, treasureById } from '../src/data.ts'

const dispatchBattle = (state, action) => reduce(state, { type: 'battle', action })
const deploy = () => reduce(reduce(createCampaign(), { type: 'recommended' }), { type: 'deploy' })
const collect = (state) => reduce(state, { type: 'collect', rolls: Array.from({ length: 10 }, (_, i) => i / 10) })

function winFirstBattle() {
  let state = deploy()
  for (let round = 0; round < 12 && !state.battle.result; round++) {
    const ids = state.battle.units.filter((unit) => unit.side === 'ally' && unit.currentHP > 0).map(({ id }) => id)
    for (const id of ids) {
      if (state.battle.result) break
      const unit = state.battle.units.find((unit) => unit.id === id)
      const enemies = state.battle.units.filter((unit) => unit.side === 'enemy' && unit.currentHP > 0)
      const aim = (point) => Math.min(...enemies.map((enemy) => distance(point, enemy)))
      const usesFire = roles[unit.role].group === '문관계' && unit.currentMP >= 10
      if (!enemies.some((enemy) => canAttack(unit, enemy, usesFire))) {
        const best = movesFor(state.battle, unit).sort((a, b) => aim(a) - aim(b))[0]
        if (best && aim(best) < aim(unit)) state = dispatchBattle(state, { type: 'move', unit: id, to: best })
      }
      const moved = state.battle.units.find((unit) => unit.id === id)
      const target = enemies.filter((enemy) => canAttack(moved, enemy, usesFire)).sort((a, b) => a.currentHP - b.currentHP)[0]
      if (target) state = dispatchBattle(state, { type: usesFire ? 'fire' : 'attack', unit: id, target: target.id })
      else if (moved.moved) state = dispatchBattle(state, { type: 'wait', unit: id })
    }
    if (!state.battle.result) state = dispatchBattle(state, { type: 'end' })
  }
  assert.equal(state.battle.result, 'win')
  return state
}

test('initial draft enforces cost and requires an explicit captain', () => {
  let state = createCampaign()
  for (const id of recommendedIds) state = reduce(state, { type: 'draft', id })
  assert.equal(draftCost(state.roster), DRAFT_LIMIT)
  assert.equal(reduce(state, { type: 'draft', id: 'baek' }), state)
  assert.equal(reduce(state, { type: 'deploy' }), state)
  state = reduce(state, { type: 'captain', id: 'yeon' })
  const deployed = reduce(state, { type: 'deploy' })
  assert.equal(deployed.battle.units.find((unit) => unit.captain).id, 'yeon')
  const removed = reduce(state, { type: 'draft', id: 'yeon' })
  assert.equal(removed.captain, null)
})

test('previews a traversable move and the resulting attack range; staying commits movement', () => {
  const state = deploy()
  const captain = state.battle.units[0]
  const moves = movesFor(state.battle, captain)
  const destination = { x: 4, y: 2 }
  const path = movementPath(moves, destination)
  assert.deepEqual(path.at(-1), destination)
  assert.ok(path.every((point, i) => distance(point, path[i - 1] ?? captain) === 1))
  assert.ok(path.reduce((cost, point) => cost + (terrainAt(state.battle.map, point) === 'f' ? 2 : 1), 0) <= movementLimit(captain))
  assert.deepEqual(movementPath(moves, { x: 10, y: 7 }), [])

  const moved = dispatchBattle(state, { type: 'move', unit: captain.id, to: destination })
  assert.deepEqual(moved.battle.events, [{ move: { unit: captain.id, path: [{ x: captain.x, y: captain.y }, ...path] } }])
  assert.equal(moved.battle.units[0].facing, 'right')
  assert.ok(attackCells(moved.battle.units[0]).some((point) => key(point) === '5,2'))
  assert.ok(!attackCells(moved.battle.units[0]).some((point) => key(point) === '6,2'))
  const stayed = dispatchBattle(state, { type: 'move', unit: captain.id, to: captain })
  assert.ok(stayed.battle.units[0].moved)
  assert.deepEqual(stayed.battle.events, [])
  assert.ok(!stayed.battle.units[0].done)
  assert.deepEqual(movesFor(stayed.battle, stayed.battle.units[0]), [])
  assert.equal(dispatchBattle(stayed, { type: 'move', unit: captain.id, to: captain }), stayed)
})

test('a move must be committed or cancelled before another ally acts or the turn ends', () => {
  const state = deploy()
  const [captain, ally] = state.battle.units
  const to = { x: 4, y: 2 }
  const moved = dispatchBattle(state, { type: 'move', unit: captain.id, to })
  assert.equal(dispatchBattle(moved, { type: 'end' }), moved)
  assert.equal(dispatchBattle(moved, { type: 'move', unit: ally.id, to: ally }), moved)
  assert.equal(dispatchBattle(moved, { type: 'wait', unit: ally.id }), moved)

  const cancelled = dispatchBattle(moved, { type: 'cancel-move', unit: captain.id })
  assert.deepEqual(cancelled.battle.units[0], captain)
  assert.equal(cancelled.battle.pendingMove, undefined)
  const switched = dispatchBattle(cancelled, { type: 'move', unit: ally.id, to: ally })
  assert.equal(switched.battle.pendingMove.unit, ally.id)
  assert.deepEqual(dispatchBattle(switched, { type: 'cancel-move', unit: ally.id }).battle.units[1], ally)

  const committed = dispatchBattle(moved, { type: 'wait', unit: captain.id })
  assert.equal(committed.battle.pendingMove, undefined)
  assert.equal(key(committed.battle.units[0]), key(to))
  assert.equal(committed.battle.units[0].done, true)
  assert.equal(dispatchBattle(committed, { type: 'cancel-move', unit: captain.id }), committed)
})

test('new terrains resolve by map symbol and use provisional movement costs', () => {
  const state = deploy()
  const unit = state.battle.units[0]
  const map = state.battle.map.map((row, y) => y === unit.y ? row.slice(0, unit.x + 1) + 'Mpm' + row.slice(unit.x + 4) : row)
  const moves = movesFor({ ...state.battle, map }, unit)
  const byPoint = new Map(moves.map((point) => [key(point), point]))
  const mountain = { x: unit.x + 1, y: unit.y }
  const peachForest = { x: unit.x + 2, y: unit.y }
  const rock = { x: unit.x + 3, y: unit.y }
  assert.equal(terrainAt(map, mountain), 'M')
  assert.equal(byPoint.get(key(mountain)).cost, 1)
  assert.equal(byPoint.get(key(peachForest)).cost, 3)
  assert.equal(byPoint.has(key(rock)), false)
})

test('all 50 stages deploy deterministically with valid tiles and distinct units', () => {
  assert.equal(stages.length, 50)
  const lineup = officers.slice(0, FIELD_LIMIT).map(({ id }) => id)
  for (const stage of stages) {
    assert.equal(stage.map.length, HEIGHT, stage.name)
    assert.ok(stage.map.every((row) => row.length === WIDTH && /^[.fmw=]+$/.test(row)), stage.name)
    const battle = newBattle(stage, lineup, lineup[0], {})
    assert.deepEqual(newBattle(stage, lineup, lineup[0], {}), battle)
    assert.equal(new Set(battle.units.map(key)).size, battle.units.length, stage.name)
    assert.equal(new Set(battle.units.map(({ name }) => name)).size, battle.units.length, stage.name)
    for (const unit of battle.units) assert.match(terrainAt(stage.map, unit), /^[.f=]$/, stage.name)
    const { battle: afterTurn } = playBattle(battle, { salve: 1, tonic: 1 }, { type: 'end' })
    for (const { unit, path } of afterTurn.events.flatMap(({ move }) => move ? [move] : [])) {
      const start = battle.units.find(({ id }) => id === unit)
      const end = afterTurn.units.find(({ id }) => id === unit)
      assert.equal(key(path[0]), key(start))
      assert.equal(key(path.at(-1)), key(end))
      assert.ok(path.slice(1).every((point, i) => distance(point, path[i]) === 1))
      assert.ok(path.slice(1).reduce((cost, point) => cost + (terrainAt(battle.map, point) === 'f' ? 2 : 1), 0) <= movementLimit(start))
    }
  }
})

test('physical damage truncates odd attack-defense differences toward zero', () => {
  assert.equal(basicPhysicalDamage(51, 48), 26)
  assert.equal(basicPhysicalDamage(48, 51), 24)
  assert.equal(basicPhysicalDamage(10, 100), 1)
})

test('physical stats use current troops and leadership, with equipment added when attacking', () => {
  const stage = stages[0]
  const lineup = recommendedIds
  const weapon = Object.values(treasureById).find(({ stat }) => stat === 'attack')
  const battle = newBattle(stage, lineup, lineup[0], { [lineup[0]]: weapon.id })
  const [captain, , , , target] = battle.units
  assert.equal(captain.hp, OFFICER_TROOPS)
  const stats = physicalStats(captain)
  assert.deepEqual(stats, { attack: 211, defense: 205 })
  assert.deepEqual(physicalStats({ ...captain, currentHP: SOLDIER_TROOPS }), { attack: 112, defense: 106 })
  assert.deepEqual(physicalStats({ ...captain, currentHP: 3333 }), { attack: 78, defense: 72 })
  const enemy = physicalStats(target)
  const forecast = forecastAttack(battle, captain, target)
  assert.equal(forecast.damage, basicPhysicalDamage(stats.attack + weapon.amount, enemy.defense) * TROOP_SCALE)
  assert.equal(forecast.hit, 100)
  assert.equal(forecastAttack(battle, { ...captain, level: 99 }, { ...target, level: 50 }).damage, forecast.damage)
})

test('changing troop class uses the new class attack and defense values', () => {
  const [cao] = deploy().battle.units
  assert.deepEqual(physicalStats({ ...cao, troopClass: 'cavalry' }), { attack: 214, defense: 202 })
  assert.deepEqual(physicalStats({ ...cao, troopClass: 'infantry' }), { attack: 211, defense: 205 })
  assert.deepEqual(physicalStats({ ...cao, troopClass: 'ranged' }), { attack: 213, defense: 200 })
})

test('physical hits and counters resolve in order without consuming the defender’s turn', () => {
  const battle = deploy().battle
  const [attacker, , , , defender] = battle.units
  Object.assign(defender, { x: attacker.x + 1, y: attacker.y, hp: OFFICER_TROOPS, currentHP: OFFICER_TROOPS, done: true })
  const stock = { salve: 1, tonic: 1 }
  const attack = { type: 'attack', unit: attacker.id, target: defender.id }
  const prediction = forecastAttack(battle, attacker, defender)
  const exchange = (seed) => playBattle(battle, stock, attack, seed).battle
  const first = exchange(1)
  assert.deepEqual(first, exchange(1))
  assert.deepEqual(first.events.map(({ impact }) => impact.kind), ['attack', 'counter'])
  assert.equal(first.events[0].impact.damage, prediction.damage)
  const counterAtFullStrength = forecastAttack(battle, defender, attacker, 'counter').damage
  const survivingTroops = first.events[0].impact.remainingHP
  assert.equal(first.events[1].impact.damage, forecastAttack(battle, { ...defender, currentHP: survivingTroops }, attacker, 'counter').damage)
  assert.ok(first.events[1].impact.damage < counterAtFullStrength)
  assert.equal(first.events[1].impact.remainingHP, attacker.currentHP - first.events[1].impact.damage)
  assert.equal(first.units.find(({ id }) => id === defender.id).done, true)
  defender.done = false
  assert.equal(exchange(1).units.find(({ id }) => id === defender.id).done, false)
  const highRollExchange = exchange(1850)
  assert.deepEqual(highRollExchange.events.map(({ impact }) => impact.kind), ['attack', 'counter'])
  const hit = highRollExchange.events[0].impact
  assert.equal(hit.blocked, false)
  assert.ok(hit.damage > 0)
  assert.equal(hit.remainingHP, defender.currentHP - hit.damage)
  defender.currentHP = 1
  assert.deepEqual(exchange(1).events.map(({ impact }) => impact.kind), ['attack'])
})

test('remaining troops affect both sides’ combat stats once for each physical hit', () => {
  const battle = deploy().battle
  const [captain] = battle.units
  const enemy = battle.units.find(({ side }) => side === 'enemy')
  Object.assign(captain, { x: 0, y: 0, troopClass: 'infantry' })
  Object.assign(enemy, { x: 1, y: 0, hp: 5000, currentHP: 5000 })
  Object.assign(battle, { map: ['..'], units: [captain, enemy] })
  const stock = { salve: 0, tonic: 0 }
  const attack = { type: 'attack', unit: captain.id, target: enemy.id }
  const art = { ...attack, type: 'warArt', art: 'heavyStrike' }
  const fullAttack = forecastAttack(battle, captain, enemy).damage
  const fullArt = troopArtPreviews(battle, captain, art.art, enemy)[0].damage

  captain.currentHP = captain.hp / 2
  const halfAttack = forecastAttack(battle, captain, enemy).damage
  const halfArt = troopArtPreviews(battle, captain, art.art, enemy)[0].damage
  assert.equal(halfAttack, basicPhysicalDamage(physicalStats(captain).attack, physicalStats(enemy).defense) * TROOP_SCALE)
  assert.equal(halfArt, troopArtDamage(halfAttack, captain, enemy, 170))
  assert.ok(halfAttack < fullAttack && halfArt < fullArt)
  assert.equal(playBattle(battle, stock, attack).battle.events[0].impact.damage, halfAttack)
  assert.equal(playBattle(battle, stock, art).battle.events[0].impact.damage, halfArt)

  assert.ok(forecastAttack(battle, captain, { ...enemy, currentHP: enemy.hp / 2 }).damage > halfAttack)
})

test('a defender outside its own range and a target hit by a spell cannot counter', () => {
  const battle = deploy().battle
  const [, , archer, sage, defender] = battle.units
  const stock = { salve: 1, tonic: 1 }
  Object.assign(defender, { x: archer.x + 2, y: archer.y, range: 1 })
  assert.equal(forecastAttack(battle, archer, defender).counter, false)
  const shot = playBattle(battle, stock, { type: 'attack', unit: archer.id, target: defender.id }).battle
  assert.ok(shot.events.length > 0 && shot.events.every(({ impact }) => impact.kind === 'attack'))
  Object.assign(defender, { x: sage.x + 1, y: sage.y })
  const spell = playBattle(battle, stock, { type: 'fire', unit: sage.id, target: defender.id }).battle
  assert.deepEqual(spell.events.map(({ impact }) => impact.kind), ['fire'])
  assert.equal(spell.units.find(({ id }) => id === sage.id).currentMP, sage.currentMP - 10)
})

test('play a real first victory, buy all three categories, equip and begin the next battle', () => {
  const won = winFirstBattle()
  let camp = collect(won)
  assert.equal(camp.phase, 'camp')
  assert.equal(camp.gold, stages[0].reward)
  assert.equal(collect(camp), camp)
  assert.equal(new Set(camp.offers.officers).size, 5)
  assert.equal(new Set(camp.offers.treasures).size, 5)
  assert.ok(camp.offers.officers.every((id) => !camp.roster.includes(id)))
  const id = camp.offers.officers.find((id) => officerById[id].price <= 105)
  const treasure = camp.offers.treasures.find((id) => treasureById[id].price <= 90)
  const untouched = camp
  camp = reduce(camp, { type: 'buy', kind: 'officers', id })
  assert.ok(camp.roster.includes(id))
  assert.equal(reduce(camp, { type: 'buy', kind: 'officers', id }), camp)
  camp = reduce(camp, { type: 'buy', kind: 'treasures', id: treasure })
  camp = reduce(camp, { type: 'buy', kind: 'items', id: 'salve' })
  assert.equal(camp.gold, untouched.gold - officerById[id].price - treasureById[treasure].price - items.salve.price)
  assert.equal(camp.inventory.salve, 2)
  assert.equal(dispatchBattle(camp, { type: 'item', unit: 'yeon', item: 'salve' }), camp)
  camp = reduce(camp, { type: 'lineup', id })
  camp = reduce(camp, { type: 'equip', officer: 'yeon', treasure })
  const next = reduce(camp, { type: 'deploy' })
  assert.equal(next.stage, 2)
  assert.ok(next.battle.units.some((unit) => unit.id === id))
  assert.ok(next.battle.units.every((unit) => unit.currentHP === unit.hp && unit.currentMP === MAX_ENERGY))
  const relic = treasureById[treasure]
  assert.equal(next.battle.units.find((unit) => unit.captain)[relic.stat], deploy().battle.units[0][relic.stat] + relic.amount * (relic.stat === 'hp' ? TROOP_SCALE : 1))
})

test('playable officers have PK attributes and learned arts while Zhang Jiao is data-only', () => {
  assert.equal(new Set(officers.map(({ id }) => id)).size, officers.length)
  assert.equal(new Set(officers.map(({ name }) => name)).size, officers.length)
  for (const { id, name } of officers) {
    const attributes = officerAttributes[name]
    assert.equal(attributes?.length, 4, name)
    assert.ok(attributes.every((value) => Number.isInteger(value) && value >= 1 && value <= 100), name)
    const [officer] = newBattle(stages[0], [id], id, {}).units
    assert.deepEqual(battleAttributes(officer), attributes, name)
    assert.ok(officerWarArts(name).length > 0, name)
  }
  const [yuJin] = newBattle(stages[0], ['yul'], 'yul', {}).units
  assert.deepEqual(warArtsFor(yuJin), [
    { id: 'blaze', level: 1 }, { id: 'intercept', level: 1 }, { id: 'calm', level: 1 },
  ])
  assert.ok(warArtsFor({ ...yuJin, troopClass: 'cavalry' }).some(({ id, level }) => id === 'charge' && level === 2))
  assert.deepEqual(officerAttributes.조조, [73, 93, 99, 97])
  assert.deepEqual(officerAttributes.우금, [78, 64, 81, 53])
  assert.deepEqual(officerAttributes.장각, [38, 87, 86, 80])
  assert.deepEqual(officerWarArts('장각'), [
    { id: 'disrupt', level: 2 }, { id: 'fireArrow', level: 2 }, { id: 'blaze', level: 2 },
    { id: 'rockfall', level: 3 }, { id: 'inspire', level: 3 }, { id: 'heal', level: 3 },
  ])
  assert.ok(!officers.some(({ name }) => name === '장각'))

  const id = 'cao-zhang'
  const won = winFirstBattle()
  const candidates = officers.filter((officer) => !won.roster.includes(officer.id))
  const index = candidates.findIndex((officer) => officer.id === id)
  assert.ok(index >= 0)
  const rolls = Array(10).fill(0)
  rolls[0] = (index + 0.5) / candidates.length
  const camp = reduce(won, { type: 'collect', rolls })
  assert.ok(camp.offers.officers.includes(id))
  const recruited = reduce(camp, { type: 'buy', kind: 'officers', id })
  const next = reduce(reduce(recruited, { type: 'lineup', id }), { type: 'deploy' })
  assert.equal(next.battle.units.find((unit) => unit.id === id)?.name, officerById[id].name)
})

test('unlimited recruitment, 12-unit field limit and mandatory captain', () => {
  const roster = officers.slice(0, 18).map(({ id }) => id)
  const current = { ...collect(winFirstBattle()), gold: 1000, roster, lineup: roster.slice(0, 12), captain: roster[0] }
  const id = officers[18].id
  const bought = reduce({ ...current, offers: { ...current.offers, officers: [id] } }, { type: 'buy', kind: 'officers', id })
  assert.equal(bought.roster.length, 19)
  assert.equal(reduce(bought, { type: 'lineup', id }), bought)
  assert.equal(reduce(bought, { type: 'lineup', id: current.captain }), bought)
  assert.equal(reduce(bought, { type: 'captain', id }), bought)
  const freed = reduce(bought, { type: 'lineup', id: roster[11] })
  const promoted = reduce(freed, { type: 'captain', id })
  assert.equal(promoted.captain, id)
  assert.ok(reduce(promoted, { type: 'deploy' }).battle.units.some((unit) => unit.id === id && unit.captain))
})

test('items consume an action, defeat retries the same stage, and the last win can complete the campaign', () => {
  const state = deploy()
  const damaged = { ...state, battle: { ...state.battle, units: state.battle.units.map((unit) => unit.captain ? { ...unit, currentHP: 10 } : unit) } }
  const healed = dispatchBattle(damaged, { type: 'item', unit: 'yeon', item: 'salve' })
  assert.equal(healed.battle.units[0].currentHP, 210)
  assert.equal(healed.battle.units[0].done, true)
  assert.equal(healed.inventory.salve, 0)
  assert.equal(dispatchBattle(healed, { type: 'item', unit: 'yeon', item: 'salve' }), healed)
  const tired = { ...state, battle: { ...state.battle, units: state.battle.units.map((unit) => unit.id === 'seo' ? { ...unit, currentMP: 2 } : unit) } }
  const restored = dispatchBattle(tired, { type: 'item', unit: 'seo', item: 'tonic' })
  assert.equal(restored.battle.units.find((unit) => unit.id === 'seo').currentMP, 10)
  assert.equal(restored.inventory.tonic, 0)

  let lost = damaged
  for (let i = 0; i < 30 && !lost.battle.result; i++) lost = dispatchBattle(lost, { type: 'end' })
  assert.equal(lost.battle.result, 'loss')
  assert.equal(collect(lost), lost)
  const retried = reduce(lost, { type: 'retry' })
  assert.equal(retried.stage, state.stage)
  assert.deepEqual(retried.battle, state.battle)
  const finished = reduce({ ...collect(winFirstBattle()), stage: 50 }, { type: 'deploy' })
  assert.equal(finished.phase, 'complete')
  assert.equal(finished.stage, 50)
})

test('both sides start with full energy and retain spent energy across rounds', () => {
  const { battle } = deploy()
  const captain = battle.units.find((unit) => unit.captain)
  const archer = battle.units.find(({ id }) => id === 'jin')
  const foe = battle.units.find(({ side }) => side === 'enemy')
  assert.ok(battle.units.every((unit) => unit.currentMP === 100 && unit.mp === 100))
  assert.ok(warArtEffect(archer, foe, 'barrage'))
  captain.currentMP = 98
  archer.currentMP = 19
  foe.currentMP = 40
  for (const unit of battle.units.filter(({ side }) => side === 'enemy')) unit.behavior = 2
  const advance = (previous) => playBattle(previous, { salve: 0, tonic: 0 }, { type: 'end' }).battle
  const second = advance(battle)
  assert.equal(second.round, 2)
  assert.equal(second.units.find(({ id }) => id === captain.id).currentMP, 98)
  assert.equal(second.units.find(({ id }) => id === foe.id).currentMP, 40)
  assert.equal(second.units.find(({ id }) => id === archer.id).currentMP, 19)
  assert.equal(captain.currentMP, 98)
  const third = advance(second)
  const nextArcher = third.units.find(({ id }) => id === archer.id)
  assert.equal(nextArcher.currentMP, 19)
  assert.equal(warArtEffect(nextArcher, third.units.find(({ id }) => id === foe.id), 'barrage'), null)
})

test('restores saved camp and backfills legacy battle names and levels without resetting progress', () => {
  const descriptors = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const store = new Map()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (id) => store.get(id), setItem: (id, value) => store.set(id, value),
  } })
  try {
    const camp = collect(winFirstBattle())
    saveCampaign(camp)
    assert.deepEqual(loadCampaign(), camp)

    const active = deploy()
    const legacy = { ...active, stage: 11, battle: {
      ...active.battle,
      units: active.battle.units.map(({ level, ...unit }) => {
        if (unit.id === 'yeon') return { ...unit, name: '연무', role: 'guard', currentHP: 31, currentMP: 83, tacticPoints: 4, usedWarArts: ['heavyStrike'] }
        if (unit.id === 'enemy-0') return { ...unit, name: '적 검병 1', role: 'blade' }
        return unit
      }),
      log: ['연무 → 적 검병 1 · 공격 12 피해'],
    } }
    saveCampaign(legacy)
    const restored = loadCampaign()
    assert.equal(restored.battle.units.find((unit) => unit.captain).name, '조조')
    assert.equal(restored.battle.units.find((unit) => unit.captain).currentHP, 31)
    assert.equal(restored.battle.units.find((unit) => unit.captain).currentMP, 83)
    assert.ok(restored.battle.units.every((unit) => !('tacticPoints' in unit) && !('usedWarArts' in unit)))
    assert.equal(restored.battle.units.find((unit) => unit.captain).level, 1)
    assert.equal(restored.battle.units.find((unit) => unit.captain).role, 'shieldInfantry')
    const enemy = restored.battle.units.find((unit) => unit.id === 'enemy-0')
    assert.equal(enemy.name, stages[10].enemies[0].name)
    assert.equal(enemy.level, 2)
    assert.equal(enemy.role, stages[10].enemies[0].role)
    assert.equal(enemy.move, roles[enemy.role].move)
    assert.deepEqual(restored.battle.log, [`조조 → ${enemy.name} · 공격 12 피해`])

    const oldSizes = { ...active, troopSizeVersion: undefined, troopScale: 10, battle: { ...active.battle } }
    const [captain, ally, , , enemyUnit] = oldSizes.battle.units
    Object.assign(captain, { hp: 1200, currentHP: 600 })
    Object.assign(ally, { hp: 1200, currentHP: 0 })
    Object.assign(enemyUnit, { hp: 1000, currentHP: 250, enemyKind: 'soldier' })
    saveCampaign(oldSizes)
    const updated = loadCampaign()
    assert.deepEqual([updated.battle.units[0].hp, updated.battle.units[0].currentHP], [10_000, 5_000])
    assert.deepEqual([updated.battle.units[1].hp, updated.battle.units[1].currentHP], [10_000, 0])
    assert.deepEqual([updated.battle.units[4].hp, updated.battle.units[4].currentHP], [5_000, 1_250])
    saveCampaign(updated)
    assert.deepEqual(loadCampaign(), updated)
  } finally {
    if (descriptors) Object.defineProperty(globalThis, 'localStorage', descriptors)
    else delete globalThis.localStorage
  }
})

test('learned war arts spend energy and can be used again on a later turn', () => {
  const battle = deploy().battle
  const archer = battle.units.find(({ id }) => id === 'jin')
  const target = battle.units.find(({ side }) => side === 'enemy')
  Object.assign(archer, { troopClass: 'ranged', x: 2, y: 2, currentMP: 19 })
  Object.assign(target, { x: 5, y: 2, hp: 50_000, currentHP: 50_000, behavior: 2 })
  const stock = { salve: 1, tonic: 1 }
  const action = { type: 'warArt', unit: archer.id, target: target.id, art: 'longShot' }
  assert.equal(warArtsFor(target).length, 0)
  assert.equal(warArtsFor({ ...archer, guest: true }).length, 0)
  assert.deepEqual(warArtsFor(archer), [
    { id: 'volley', level: 3 }, { id: 'barrage', level: 2 }, { id: 'longShot', level: 3 },
    { id: 'blaze', level: 1 }, { id: 'inspire', level: 2 },
    { id: 'intercept', level: 1 }, { id: 'calm', level: 1 },
  ])
  assert.equal(canAttack(archer, target), false)
  assert.equal(playBattle(battle, stock, action).battle, battle)
  archer.currentMP = 100
  archer.troopClass = 'infantry'
  assert.equal(playBattle(battle, stock, action).battle, battle)
  archer.troopClass = 'ranged'
  const result = playBattle(battle, stock, action).battle
  const used = result.units.find(({ id }) => id === archer.id)
  assert.equal(used.currentMP, 80)
  assert.equal(used.done, true)
  assert.ok(result.units.find(({ id }) => id === target.id).currentHP < target.currentHP)
  assert.equal(playBattle(result, stock, action).battle, result)
  let repeated = result
  for (const remaining of [60, 40, 20, 0]) {
    const next = playBattle(repeated, stock, { type: 'end' }).battle
    repeated = playBattle(next, stock, action).battle
    assert.notEqual(repeated, next)
    assert.equal(repeated.units.find(({ id }) => id === archer.id).currentMP, remaining)
  }
  const sixthTurn = playBattle(repeated, stock, { type: 'end' }).battle
  assert.equal(playBattle(sixthTurn, stock, action).battle, sixthTurn)
})

test('area physical arts hit together, while counters and two-hit arts resolve in separate beats', () => {
  const battle = deploy().battle
  const archer = { ...battle.units.find(({ id }) => id === 'jin'), x: 1, y: 1, currentMP: 70, troopClass: 'ranged', captain: true }
  const enemy = { ...battle.units.find(({ side }) => side === 'enemy'), x: 2, y: 1, hp: 5000, currentHP: 5000, range: 3 }
  const second = { ...enemy, id: 'second-enemy', x: 2, y: 2 }
  const stock = { salve: 0, tonic: 0 }
  Object.assign(battle, { map: ['....', '....', '....'], units: [archer, enemy, second], objectives: undefined })
  const barrage = playBattle(battle, stock, { type: 'warArt', art: 'barrage', unit: archer.id, target: enemy.id }).battle
  const [volley, ...counters] = barrage.events
  assert.equal(volley.impact.facing, 'right')
  assert.deepEqual([volley.impact, ...volley.additionalImpacts].map(({ target }) => target), [enemy.id, second.id])
  assert.deepEqual(counters.map(({ impact }) => [impact.attacker, impact.kind]), [[enemy.id, 'counter'], [second.id, 'counter']])
  assert.ok(barrage.units.slice(1).every(({ currentHP }) => currentHP < 5000))

  const rider = { ...archer, id: 'ha', troopClass: 'cavalry' }
  const doubleStrike = playBattle({ ...battle, units: [rider, enemy] }, stock,
    { type: 'warArt', art: 'doubleStrike', unit: rider.id, target: enemy.id }).battle
  assert.deepEqual(doubleStrike.events.map(({ impact }) => impact.kind), ['attack', 'attack', 'counter'])
  assert.ok(doubleStrike.events.every(({ additionalImpacts }) => additionalImpacts === undefined))
})

test('strategy arts share terrain, damage, and status rules with their previews', async () => {
  const { strategyPreviews, warArtCells } = await import('../src/combat.ts')
  const { officers } = await import('../src/data.ts')
  const battle = deploy().battle
  const caster = { ...battle.units.find(({ id }) => id === 'seo'), name: '시험 책사', x: 1, y: 1, currentMP: 69,
    captain: true, troopClass: 'cavalry', jo: { attributes: [40, 40, 45], growth: [3, 3] } }
  const enemy = (id, x, y) => ({ ...caster, id, x, y, captain: false, side: 'enemy', enemyKind: 'officer',
    hp: 1000, currentHP: 1000, jo: { ...caster.jo, attributes: [40, 40, 35] } })
  const north = enemy('north', 1, 0)
  const northwest = enemy('northwest', 0, 0)
  northwest.jo.attributes = [40, 40, 45]
  const friend = { ...enemy('friend', 2, 0), side: 'ally' }
  const east = enemy('east', 2, 1)
  const far = enemy('far', 3, 1)
  Object.assign(battle, { map: ['MMM.', '..fg', '....'], objectives: undefined,
    units: [caster, north, northwest, friend, east, far] })
  const cast = (art, target, state = battle, seed = 1) => playBattle(state, { salve: 0, tonic: 0 },
    { type: 'warArt', art, unit: caster.id, target: target.id }, seed).battle
  caster.currentMP = 9
  assert.equal(cast('blaze', east), battle)
  caster.currentMP = 10
  assert.notEqual(cast('blaze', east), battle)
  caster.currentMP = 70
  assert.equal(cast('blaze', north), battle)
  for (const grid of ['square', 'hex']) {
    const open = { ...battle, grid }
    assert.deepEqual(warArtCells(open, caster, 'intercept'), [])
    assert.equal(cast('intercept', east, open), open)
    for (const terrain of ['f', 'M']) {
      const cover = { ...open, map: ['MMM.', `.${terrain}.g`, '....'] }
      assert.equal(cast('intercept', far, cover), cover)
      assert.equal(strategyPreviews(cover, caster, 'intercept', east)[0].confusion, 70)
      assert.equal(cast('intercept', east, cover).units.find(({ id }) => id === east.id).confusedUntil, battle.round)
      const failed = cast('intercept', east, cover, 1500)
      assert.equal(failed.units.find(({ id }) => id === east.id).confusedUntil, undefined)
      assert.equal(failed.units[0].currentMP, 60)
      assert.ok(failed.log.some((line) => line.includes(' · 매복 · ')))
    }
  }
  assert.equal(cast('blaze', far), battle)
  const blaze = cast('blaze', east)
  assert.deepEqual(blaze.burning.map(({ x, y }) => [x, y]), [[2, 1]])
  assert.equal(blaze.units[0].currentMP, 60)
  assert.equal(blaze.events.length, 1)
  assert.equal(blaze.events[0].impact.kind, 'fire')
  const { target, element, burningTile } = blaze.events[0].impact
  assert.deepEqual([target, element, burningTile], [east.id, 'fire', { x: 2, y: 1 }])
  assert.equal(blaze.events[0].additionalImpacts, undefined)
  const burningState = { ...blaze, units: blaze.units.map((unit) =>
    unit.side === 'enemy' ? { ...unit, confusedUntil: blaze.round } : unit) }
  const burned = playBattle(burningState, { salve: 0, tonic: 0 }, { type: 'end' }).battle
  assert.equal(burned.units.find(({ id }) => id === east.id).currentHP, 670)
  blaze.units[0].done = false
  assert.equal(cast('blaze', east, blaze).units[0].currentMP, 50)
  const plain = cast('blaze', east, { ...battle, map: ['MMM.', '...g', '....'] })
  assert.equal(plain.units.find(({ id }) => id === east.id).currentHP, 720)
  assert.ok(plain.burning.some(({ x, y }) => x === east.x && y === east.y))
  caster.id = officers.find(({ name }) => name === '가후').id
  caster.troopClass = 'ranged'
  assert.ok(warArtCells(battle, caster, 'rockfall').some(({ x, y }) => x === 1 && y === 0))
  assert.equal(cast('rockfall', east), battle)
  assert.deepEqual(strategyPreviews(battle, caster, 'rockfall', north).map(({ foe, damage }) => [foe.id, damage]),
    [['northwest', 320], ['north', 390]])
  const rocks = cast('rockfall', north)
  assert.equal(rocks.events.length, 1)
  assert.equal(rocks.events[0].impact.element, 'earth')
  assert.equal(rocks.events[0].impact.facing, 'up')
  assert.deepEqual([rocks.events[0].impact, ...rocks.events[0].additionalImpacts].map(({ target }) => target), [northwest.id, north.id])
  assert.equal(rocks.units.find(({ id }) => id === north.id).currentHP, 610)
  assert.equal(rocks.units.find(({ id }) => id === northwest.id).currentHP, 680)
  assert.equal(rocks.units.find(({ id }) => id === friend.id).currentHP, 1000)

  caster.id = officers.find(({ name }) => name === '황충').id
  east.hp = east.currentHP = 3000
  const arrow = cast('fireArrow', east)
  assert.equal(arrow.events[0].impact.element, 'fire')
  const afterArrow = arrow.units.find(({ id }) => id === east.id)
  assert.ok(arrow.burning.some(({ x, y }) => x === east.x && y === east.y))
  assert.ok(afterArrow.currentHP < east.currentHP)
  const arrowBurning = { ...arrow, units: arrow.units.map((unit) =>
    unit.side === 'enemy' ? { ...unit, confusedUntil: arrow.round } : unit) }
  const afterBurn = playBattle(arrowBurning, { salve: 0, tonic: 0 }, { type: 'end' }).battle
  assert.equal(afterBurn.units.find(({ id }) => id === east.id).currentHP, afterArrow.currentHP - 150)
})

test('torrent previews and hits only water cells on both grids', () => {
  for (const grid of [undefined, 'hex']) {
    const battle = deploy().battle
    const [caster, target, nearby, dry] = [
      { ...battle.units.find(({ id }) => id === 'seo'), x: 1, y: 1, currentMP: 70, captain: true },
      ...battle.units.filter(({ side }) => side === 'enemy'),
    ]
    Object.assign(target, { x: 2, y: 1 })
    Object.assign(nearby, { x: 2, y: 0 })
    Object.assign(dry, { x: 2, y: 2 })
    Object.assign(battle, { grid, map: ['..j.', '..r.', '....'], units: [caster, target, nearby, dry] })
    const cast = (recipient) => playBattle(battle, { salve: 0, tonic: 0 },
      { type: 'warArt', art: 'torrent', unit: caster.id, target: recipient.id }).battle
    assert.equal(cast(dry), battle)
    const result = cast(target)
    assert.equal(result.events.length, 1)
    const { impact, additionalImpacts } = result.events[0]
    assert.deepEqual([impact, ...additionalImpacts].map(({ element }) => element), ['water', 'water'])
    assert.deepEqual(new Set([impact.target, additionalImpacts[0].target]), new Set([target.id, nearby.id]))
    assert.equal(result.units.find(({ id }) => id === dry.id).currentHP, dry.currentHP)
    assert.equal(result.burning, undefined)
  }
})

test('support war arts spend energy and modify the target’s energy', () => {
  const battle = deploy().battle
  const caster = battle.units.find(({ id }) => id === 'seo')
  const archer = battle.units.find(({ id }) => id === 'jin')
  const stock = { salve: 1, tonic: 1 }
  Object.assign(caster, { x: 2, y: 2, troopClass: 'cavalry', currentMP: 20 })
  Object.assign(archer, { x: 3, y: 3, troopClass: 'ranged', currentMP: 10 })
  assert.ok(warArtsFor(caster).some(({ id }) => id === 'inspire'))
  const cast = (state, art) => playBattle(state, stock, { type: 'warArt', unit: caster.id, target: archer.id, art }).battle
  const inspired = cast(battle, 'inspire')
  const boosted = inspired.units.find(({ id }) => id === archer.id)
  assert.equal(boosted.currentMP, 20)
  assert.equal(inspired.units.find(({ id }) => id === caster.id).currentMP, 0)
  const enemy = inspired.units.find(({ side }) => side === 'enemy')
  Object.assign(enemy, { x: 5, y: 3 })
  const shot = { type: 'warArt', unit: archer.id, target: enemy.id, art: 'longShot' }
  assert.notEqual(playBattle(inspired, stock, shot).battle, inspired)

  archer.side = 'enemy'
  archer.currentMP = 49
  caster.id = officers.find(({ name }) => name === '사마의').id
  const demoralized = cast(battle, 'demoralize')
  const weakened = demoralized.units.find(({ id }) => id === archer.id)
  assert.equal(weakened.currentMP, 19)
  const enemyView = { ...demoralized, units: demoralized.units.map((unit) => ({
    ...unit, side: unit.side === 'enemy' ? 'ally' : 'enemy',
  })) }
  assert.equal(playBattle(enemyView, stock, { ...shot, target: caster.id }).battle, enemyView)

  const self = battle.units.find(({ id }) => id === 'ha')
  const rally = { type: 'warArt', unit: self.id, target: self.id, art: 'rally' }
  self.currentMP = 19
  assert.equal(playBattle(battle, stock, rally).battle, battle)
  self.currentMP = 85
  assert.equal(playBattle(battle, stock, rally).battle.units.find(({ id }) => id === self.id).currentMP, 90)
  self.currentMP = 98
  assert.equal(playBattle(battle, stock, rally).battle.units.find(({ id }) => id === self.id).currentMP, 100)
})

test('heal restores troops while calm removes status independently', () => {
  const battle = deploy().battle
  const caster = battle.units.find(({ id }) => id === 'ha')
  const target = battle.units.find(({ id }) => id === 'jin')
  Object.assign(caster, { x: 2, y: 2, currentMP: 60 })
  Object.assign(target, { x: 3, y: 2, currentHP: target.hp - 50, confusedUntil: battle.round, pinnedUntil: battle.round })
  const cast = (art) => playBattle(battle, { salve: 0, tonic: 0 }, { type: 'warArt', unit: caster.id, target: target.id, art }).battle
  const healed = cast('heal')
  assert.equal(healed.units.find(({ id }) => id === caster.id).currentMP, 50)
  const healedTarget = healed.units.find(({ id }) => id === target.id)
  assert.equal(healedTarget.currentHP, target.hp)
  assert.equal(healedTarget.confusedUntil, battle.round)
  assert.equal(healedTarget.pinnedUntil, battle.round)
  const calmed = cast('calm')
  assert.equal(calmed.units.find(({ id }) => id === caster.id).currentMP, 50)
  const calmedTarget = calmed.units.find(({ id }) => id === target.id)
  assert.equal(calmedTarget.currentHP, target.currentHP)
  assert.equal(calmedTarget.confusedUntil, undefined)
  assert.equal(calmedTarget.pinnedUntil, undefined)
  target.currentHP = target.hp
  assert.equal(cast('heal'), battle)
  assert.notEqual(cast('calm'), battle)
  delete target.confusedUntil
  delete target.pinnedUntil
  assert.equal(cast('calm'), battle)
})

test('basic tactics are available without lessons and only trained officers can heal', () => {
  const battle = newBattle(stages[0], ['yul', 'ha', 'yeon'], 'yul', {})
  const [ordinary, healer, expert, target] = battle.units
  Object.assign(ordinary, { x: 1, y: 1 })
  Object.assign(healer, { x: 1, y: 2 })
  Object.assign(expert, { x: 2, y: 2, currentHP: expert.hp - 50, pinnedUntil: battle.round })
  Object.assign(target, { x: 2, y: 1 })
  Object.assign(battle, { map: ['....', '.f..', '....'], units: [ordinary, healer, expert, target] })
  const cast = (art, unit, foe) => playBattle(battle, { salve: 0, tonic: 0 },
    { type: 'warArt', unit: unit.id, target: foe.id, art }).battle

  for (const { id, name } of officers) {
    const [unit] = newBattle(stages[0], [id], id, {}).units
    const arts = warArtsFor(unit)
    for (const tactic of ['blaze', 'intercept', 'calm']) {
      assert.equal(arts.filter(({ id }) => id === tactic).length, 1, `${name}: ${tactic}`)
    }
    assert.equal(arts.some(({ id }) => id === 'heal'), officerWarArts(name).some(({ id }) => id === 'heal'), name)
  }
  assert.equal(warArtsFor(expert).find(({ id }) => id === 'blaze').level, 2)
  assert.equal(warArtsFor(expert).find(({ id }) => id === 'intercept').level, 3)
  assert.ok(cast('blaze', ordinary, target).burning?.length)
  assert.ok(cast('intercept', ordinary, target).units[3].currentHP < target.currentHP)
  assert.equal(cast('calm', ordinary, expert).units[2].pinnedUntil, undefined)
  assert.equal(cast('heal', ordinary, expert), battle)
  assert.equal(cast('heal', healer, expert).units[2].currentHP, expert.hp)
})

test('leadership drives normal damage and troop arts use each target’s force', () => {
  const battle = deploy().battle
  const profile = (force) => ({ attributes: [force / 2, 60 / 2, 70 / 2] })
  const caster = { ...battle.units[0], name: 'test-caster', x: 2, y: 2, currentMP: 70,
    troopClass: 'infantry', jo: profile(80) }
  const foe = (id, x, force) => ({ ...battle.units.find((unit) => unit.side === 'enemy'),
    id, x, y: 1, troopClass: 'infantry', enemyKind: 'officer', jo: profile(force), currentHP: 3000 })
  const same = foe('same', 2, 80)
  const weaker = foe('weaker', 3, 60)
  const stronger = foe('stronger', 1, 100)
  battle.units = [caster, same, weaker, stronger]
  assert.equal(troopArtDamage(300, caster, same, 150), 450)
  assert.equal(troopArtDamage(300, caster, stronger, 150), 450)
  assert.equal(troopArtDamage(300, caster, weaker, 150), 540)
  assert.equal(forecastAttack(battle, caster, same).damage,
    forecastAttack(battle, { ...caster, jo: profile(60) }, same).damage)
  const forecast = troopArtPreviews(battle, caster, 'sweep', same)
  assert.equal(forecast.length, 3)
  assert.ok(forecast.find(({ foe }) => foe.id === 'weaker').damage > forecast.find(({ foe }) => foe.id === 'same').damage)
  const result = playBattle(battle, { salve: 0, tonic: 0 },
    { type: 'warArt', art: 'sweep', unit: caster.id, target: same.id }).battle
  for (const { foe, damage } of forecast) {
    assert.equal(result.units.find(({ id }) => id === foe.id).currentHP, foe.currentHP - damage)
  }
})

test('troop advantage increases war art damage but not ordinary attacks or counters', () => {
  const battle = deploy().battle
  const stock = { salve: 0, tonic: 0 }
  const [attacker] = battle.units
  const defender = battle.units.find(({ side }) => side === 'enemy')
  Object.assign(attacker, { x: 0, y: 0, troopClass: 'infantry' })
  Object.assign(defender, { x: 1, y: 0, hp: 5000, currentHP: 5000, name: '상성 검증 부대', enemyKind: 'officer' })

  const attack = { type: 'attack', unit: attacker.id, target: defender.id }
  const heavyStrike = { ...attack, type: 'warArt', art: 'heavyStrike' }
  const scenario = (troopClass) => ({ ...battle, map: ['...'], units: [attacker, { ...defender, troopClass }] })
  for (const troopClass of ['cavalry', 'infantry', 'ranged']) {
    const state = scenario(troopClass)
    const [hit, counter] = playBattle(state, stock, attack).battle.events.map(({ impact }) => impact)
    assert.equal(hit.damage, basicPhysicalDamage(physicalStats(attacker).attack, physicalStats(state.units[1]).defense) * TROOP_SCALE)
    const counterUnit = { ...state.units[1], currentHP: hit.remainingHP }
    const counterBase = basicPhysicalDamage(physicalStats(counterUnit).attack, physicalStats(attacker).defense)
    assert.equal(counter.damage, Math.max(1, Math.floor(counterBase * 0.75)) * TROOP_SCALE)
  }

  const artDamage = (troopClass) => {
    const state = scenario(troopClass)
    const [{ damage }] = troopArtPreviews(state, attacker, heavyStrike.art, state.units[1])
    assert.equal(playBattle(state, stock, heavyStrike).battle.events[0].impact.damage, damage)
    return damage
  }
  const favorable = scenario('cavalry')
  const base = forecastAttack(favorable, attacker, favorable.units[1]).damage
  assert.equal(troopArtDamage(base, attacker, favorable.units[1], 100), Math.floor(base * 1.2))
  assert.equal(artDamage('cavalry'), Math.floor(base * 1.2 * 1.7))
  const neutral = scenario('ranged')
  const neutralBase = forecastAttack(neutral, attacker, neutral.units[1]).damage
  assert.equal(artDamage('ranged'), Math.floor(neutralBase * 1.7))
})

test('equipped ram attacks a gate using current troops and the structure defense', () => {
  const { battle, inventory } = deploy()
  const [captain] = battle.units
  const enemy = battle.units.find(({ side }) => side === 'enemy')
  Object.assign(captain, { x: 0, y: 0, troopClass: 'infantry', loadout: { siege: 'ram' }, currentMP: 20 })
  Object.assign(enemy, { x: 0, y: 1 })
  Object.assign(battle, { map: ['.G.', '...'], deployments: true, units: [captain, enemy] })
  const gate = { x: 1, y: 0 }
  const action = { type: 'warArt', art: 'ramStrike', unit: captain.id }
  assert.equal(playBattle(battle, inventory, { ...action, target: enemy.id }).battle, battle)
  const [{ foe, damage }] = deploymentPreviews(battle, captain, 'ramStrike', gate)
  const attack = physicalStats(captain).attack
  const defense = foe.defense
  assert.equal(damage, basicPhysicalDamage(attack, defense) * TROOP_SCALE * 2)
  const result = playBattle(battle, inventory, { ...action, target: gate }).battle
  assert.equal(result.structureHP[foe.id], Math.max(0, foe.hp - damage))
  assert.equal(result.units[0].currentMP, 0)
  assert.equal(result.units.find(({ id }) => id === enemy.id).currentHP, enemy.currentHP)

  const weakened = { ...captain, currentHP: captain.hp / 4 }
  const damagedRam = { ...battle, units: [weakened, enemy] }
  const reduced = basicPhysicalDamage(physicalStats(weakened).attack, defense) * TROOP_SCALE * 2
  assert.equal(deploymentPreviews(damagedRam, weakened, 'ramStrike', gate)[0].damage, reduced)
  assert.equal(playBattle(damagedRam, inventory, { ...action, target: gate }).battle.structureHP[foe.id], Math.max(0, foe.hp - reduced))

  const catapult = { ...captain, loadout: { siege: 'catapult' } }
  const shelling = { ...battle, units: [catapult, enemy] }
  const emptyTile = { x: 1, y: 1 }
  const [splash] = deploymentPreviews(shelling, catapult, 'catapultShot', emptyTile)
  assert.equal(splash.foe.id, enemy.id)
  const hit = playBattle(shelling, inventory,
    { type: 'warArt', unit: catapult.id, art: 'catapultShot', target: emptyTile }).battle
  assert.equal(hit.units[1].currentHP, Math.max(0, enemy.currentHP - splash.damage))
})

test('ships require a crossing and training and naval arts follow water state', () => {
  const { battle, inventory } = deploy()
  const archer = battle.units.find(({ id }) => id === 'jin')
  const enemy = battle.units.find(({ side }) => side === 'enemy')
  Object.assign(archer, { x: 0, y: 1, troopClass: 'infantry', currentMP: 70 })
  Object.assign(enemy, { x: 3, y: 0, afloat: true, loadout: { ship: 'skiff' },
    hp: 1800, currentHP: 1800, confusedUntil: battle.round })
  Object.assign(battle, { map: ['.jwwj.', '.jwwj.', '......'], deployments: true,
    units: [{ ...archer, captain: true }, enemy] })
  const start = battle.units[0]
  const entry = { type: 'move', unit: archer.id, to: { x: 2, y: 1 } }
  assert.equal(playBattle(battle, inventory, entry).battle, battle)
  start.loadout = { ship: 'skiff', siege: 'ram' }
  const entered = playBattle(battle, inventory, entry).battle
  const afloat = entered.units[0]
  assert.equal(afloat.afloat, true)
  assert.equal(canAttack(afloat, enemy), true)
  const shot = playBattle(entered, inventory, { type: 'attack', unit: archer.id, target: enemy.id }).battle
  assert.equal(shot.units[1].currentHP, enemy.currentHP - forecastAttack(entered, afloat, enemy).damage)
  const cancelled = playBattle(entered, inventory, { type: 'cancel-move', unit: archer.id }).battle
  assert.equal(cancelled.units[0].afloat, false)
  assert.equal(cancelled.units[0].x, start.x)
  const landStats = physicalStats(start)
  const waterStats = physicalStats(afloat)
  assert.equal(waterStats.attack - landStats.attack, roles.mountedArcher.attack - roles.lightInfantry.attack)
  assert.equal(waterStats.defense - landStats.defense, roles.mountedArcher.defense - roles.lightInfantry.defense)
  assert.ok(warArtsFor(start).some(({ id }) => id === 'ramStrike'))
  assert.ok(warArtsFor(afloat).some(({ id }) => id === 'navalFire'))
  assert.ok(!warArtsFor(afloat).some(({ id }) => id === 'ramStrike' || id === 'shove'))
  assert.ok(!warArtsFor({ ...afloat, loadout: { ship: 'heavy' } }).some(({ id }) => id === 'navalFire'))
  const attack = { type: 'warArt', art: 'navalFire', unit: archer.id, target: enemy.id }
  const [{ damage }] = deploymentPreviews(entered, afloat, 'navalFire', enemy)
  const fired = playBattle(entered, inventory, attack).battle
  assert.equal(fired.units[1].currentHP, enemy.currentHP - damage)
  assert.ok(fired.burning.some((point) => key(point) === key(enemy)))
  const burned = playBattle(fired, inventory, { type: 'end' }).battle
  assert.equal(burned.units[1].currentHP, enemy.currentHP - damage - 90)
  const returned = playBattle(burned, inventory, { ...entry, to: { x: 5, y: 1 } }).battle
  assert.equal(returned.units[0].afloat, false)
  assert.equal(physicalStats(returned.units[0]).attack, landStats.attack)
  assert.ok(warArtsFor(returned.units[0]).some(({ id }) => id === 'ramStrike'))
  assert.ok(!warArtsFor(returned.units[0]).some(({ id }) => id === 'navalFire'))
})
