import assert from 'node:assert/strict'
import test from 'node:test'
import { officerAttributes } from '../src/officer-attributes.ts'
import { roles } from '../src/unit-classes.ts'
import { campaignReducer as reduce, createCampaign, draftCost, loadCampaign, saveCampaign } from '../src/campaign.ts'
import { attackCells, basicPhysicalDamage, canAttack, distance, forecastAttack, key, movementLimit, movementPath, movesFor, newBattle, physicalStats, playBattle, terrainAt, warArtsFor } from '../src/combat.ts'
import { DRAFT_LIMIT, FIELD_LIMIT, HEIGHT, TROOP_SCALE, WIDTH, items, officerById, officers, recommendedIds, stages, treasureById } from '../src/data.ts'

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
      const usesFire = roles[unit.role].group === '문관계' && unit.currentMP >= 4
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
  assert.equal(physicalStats(map, { ...unit, ...mountain }).terrainPercent, 100)
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

test('physical damage uses level and truncates odd attack-defense differences toward zero', () => {
  assert.equal(basicPhysicalDamage(3, 51, 48), 29)
  assert.equal(basicPhysicalDamage(3, 48, 51), 27)
  assert.equal(basicPhysicalDamage(3, 10, 100), 1)
})

test('physical forecasts use the class terrain factor and the equipped attack bonus', () => {
  const stage = stages[0]
  const lineup = recommendedIds
  const weapon = Object.values(treasureById).find(({ stat }) => stat === 'attack')
  const battle = newBattle(stage, lineup, lineup[0], { [lineup[0]]: weapon.id })
  const [captain, , , , target] = battle.units
  Object.assign(captain, { x: 4, y: 2 })
  Object.assign(target, { x: 5, y: 2 })
  const road = physicalStats(battle.map, captain)
  assert.equal(road.attack, (52 + weapon.amount) * TROOP_SCALE)
  const forest = { ...battle, map: battle.map.map((row, y) => y === 2 ? row.slice(0, 4) + 'f' + row.slice(5) : row) }
  const stats = physicalStats(forest.map, captain)
  assert.equal(stats.terrainPercent, 110)
  assert.equal(stats.attack, Math.floor(road.attack / TROOP_SCALE * 1.1) * TROOP_SCALE)
  assert.equal(stats.defense, Math.floor(road.defense / TROOP_SCALE * 1.1) * TROOP_SCALE)
  const enemy = physicalStats(forest.map, target)
  const forecast = forecastAttack(forest, captain, target)
  assert.equal(forecast.damage, basicPhysicalDamage(stats.level, stats.attack / TROOP_SCALE, enemy.defense / TROOP_SCALE) * TROOP_SCALE)
  assert.equal(forecast.hit, 100)
})

test('physical hits and counters resolve in order without consuming the defender’s turn', () => {
  const battle = deploy().battle
  const [attacker, , , , defender] = battle.units
  Object.assign(defender, { x: attacker.x + 1, y: attacker.y, hp: 1000, currentHP: 1000, done: true })
  const stock = { salve: 1, tonic: 1 }
  const attack = { type: 'attack', unit: attacker.id, target: defender.id }
  const prediction = forecastAttack(battle, attacker, defender)
  const exchange = (seed) => playBattle(battle, stock, attack, seed).battle
  const first = exchange(1)
  assert.deepEqual(first, exchange(1))
  assert.deepEqual(first.events.map(({ impact }) => impact.kind), ['attack', 'counter'])
  assert.equal(first.events[0].impact.damage, prediction.damage)
  const normalReturn = forecastAttack(battle, defender, attacker)
  assert.equal(first.events[1].impact.damage, Math.max(1, Math.floor(normalReturn.damage / TROOP_SCALE * 0.75)) * TROOP_SCALE)
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
  assert.equal(spell.units.find(({ id }) => id === sage.id).currentMP, sage.currentMP - 4)
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
  assert.ok(next.battle.units.every((unit) => unit.currentHP === unit.hp && unit.currentMP === unit.mp))
  const relic = treasureById[treasure]
  assert.equal(next.battle.units.find((unit) => unit.captain)[relic.stat], deploy().battle.units[0][relic.stat] + relic.amount * (relic.stat === 'hp' ? TROOP_SCALE : 1))
})

test('all recruitable officers have politics and additional officers can join through the regular shop', () => {
  assert.equal(new Set(officers.map(({ id }) => id)).size, officers.length)
  assert.equal(new Set(officers.map(({ name }) => name)).size, officers.length)
  for (const { name } of officers) {
    const attributes = officerAttributes[name]
    assert.equal(attributes?.length, 4, name)
    assert.ok(attributes.every((value) => Number.isInteger(value) && value >= 1 && value <= 100), name)
  }
  assert.equal(officerAttributes.조조[3], 94)
  assert.equal(officerAttributes.등애[3], 81)
  assert.equal(officerAttributes.문빙[3], 69)

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
        if (unit.id === 'yeon') return { ...unit, name: '연무', role: 'guard', currentHP: 31 }
        if (unit.id === 'enemy-0') return { ...unit, name: '적 검병 1', role: 'blade' }
        return unit
      }),
      log: ['연무 → 적 검병 1 · 공격 12 피해'],
    } }
    saveCampaign(legacy)
    const restored = loadCampaign()
    assert.equal(restored.battle.units.find((unit) => unit.captain).name, '조조')
    assert.equal(restored.battle.units.find((unit) => unit.captain).currentHP, 31)
    assert.equal(restored.battle.units.find((unit) => unit.captain).level, 1)
    assert.equal(restored.battle.units.find((unit) => unit.captain).role, 'shieldInfantry')
    const enemy = restored.battle.units.find((unit) => unit.id === 'enemy-0')
    assert.equal(enemy.name, stages[10].enemies[0].name)
    assert.equal(enemy.level, 2)
    assert.equal(enemy.role, stages[10].enemies[0].role)
    assert.equal(enemy.move, roles[enemy.role].move)
    assert.deepEqual(restored.battle.log, [`조조 → ${enemy.name} · 공격 12 피해`])
  } finally {
    if (descriptors) Object.defineProperty(globalThis, 'localStorage', descriptors)
    else delete globalThis.localStorage
  }
})

test('learned war arts enforce class, will, target range, and one use per battle', () => {
  const battle = deploy().battle
  const archer = battle.units.find(({ id }) => id === 'jin')
  const target = battle.units.find(({ side }) => side === 'enemy')
  Object.assign(archer, { troopClass: 'ranged', x: 2, y: 2, currentMP: 69 })
  Object.assign(target, { x: 5, y: 2, hp: 5000, currentHP: 5000 })
  const stock = { salve: 1, tonic: 1 }
  const action = { type: 'warArt', unit: archer.id, target: target.id, art: 'longShot' }
  assert.equal(warArtsFor(target).length, 0)
  assert.equal(warArtsFor({ ...archer, id: 'baek' }).length, 0)
  assert.equal(warArtsFor(archer).length, 4)
  assert.equal(canAttack(archer, target), false)
  assert.equal(playBattle(battle, stock, action).battle, battle)
  archer.currentMP = 70
  archer.troopClass = 'infantry'
  assert.equal(playBattle(battle, stock, action).battle, battle)
  archer.troopClass = 'ranged'
  const result = playBattle(battle, stock, action).battle
  const used = result.units.find(({ id }) => id === archer.id)
  assert.equal(used.currentMP, 70)
  assert.equal(used.done, true)
  assert.deepEqual(used.usedWarArts, ['longShot'])
  assert.ok(result.units.find(({ id }) => id === target.id).currentHP < target.currentHP)
  used.done = false
  assert.equal(playBattle(result, stock, action).battle, result)
})

test('support war arts change eligibility and cleanse full-health allies', () => {
  const battle = deploy().battle
  const caster = battle.units.find(({ id }) => id === 'seo')
  const archer = battle.units.find(({ id }) => id === 'jin')
  const stock = { salve: 1, tonic: 1 }
  Object.assign(caster, { x: 2, y: 2, troopClass: 'cavalry', currentMP: 10 })
  Object.assign(archer, { x: 3, y: 3, troopClass: 'ranged', currentMP: 60 })
  assert.equal(warArtsFor(caster).length, 4)
  const cast = (state, art) => playBattle(state, stock, { type: 'warArt', unit: caster.id, target: archer.id, art }).battle
  const inspired = cast(battle, 'inspire')
  const boosted = inspired.units.find(({ id }) => id === archer.id)
  assert.equal(boosted.currentMP, 70)
  assert.equal(inspired.units.find(({ id }) => id === caster.id).currentMP, 10)
  const enemy = inspired.units.find(({ side }) => side === 'enemy')
  Object.assign(enemy, { x: 5, y: 3 })
  const shot = { type: 'warArt', unit: archer.id, target: enemy.id, art: 'longShot' }
  assert.notEqual(playBattle(inspired, stock, shot).battle, inspired)

  archer.side = 'enemy'
  archer.currentMP = 90
  const demoralized = cast(battle, 'demoralize')
  const weakened = demoralized.units.find(({ id }) => id === archer.id)
  assert.equal(weakened.currentMP, 60)
  const enemyView = { ...demoralized, units: demoralized.units.map((unit) => ({
    ...unit, side: unit.side === 'enemy' ? 'ally' : 'enemy',
  })) }
  assert.equal(playBattle(enemyView, stock, { ...shot, target: caster.id }).battle, enemyView)

  archer.side = 'ally'
  archer.confusedUntil = battle.round
  archer.pinnedUntil = battle.round
  assert.equal(archer.currentHP, archer.hp)
  const healed = cast(battle, 'heal').units.find(({ id }) => id === archer.id)
  assert.equal(healed.currentHP, healed.hp)
  assert.equal(healed.confusedUntil, undefined)
  assert.equal(healed.pinnedUntil, undefined)
})
