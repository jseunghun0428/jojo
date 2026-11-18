import assert from 'node:assert/strict'
import { test } from 'node:test'
import { campaignReducer, loadCampaign, saveCampaign } from '../src/campaign.ts'
import { attackCells, initiativeQueue, movesFor, newBattle, playBattle } from '../src/combat.ts'
import { recommendedIds } from '../src/data.ts'
import { boardGeometry, validCell } from '../src/grid.ts'
import { webCampaign } from '../src/jo-game.ts'
import { campaignWithStages, readEntry, readPackage, validateStage } from '../src/stage-library.ts'
import { startTrial, trialSetup } from '../src/trial-battle.ts'

const at = (x, y) => ({ x, y })

function edited(grid) {
  return {
    ...webCampaign.stages[0],
    grid,
    board: { cellSize: 32, x: 12, y: -8, imageWidth: 160, imageHeight: 120 },
    map: ['.....', '._...', '.....'],
    deployment: [at(0, 0), at(0, 2)],
    enemyBehavior: 2,
    enemies: [
      { ...at(4, 0), name: '추격병', role: 'heavyCavalry', behavior: 1 },
      { ...at(4, 2), name: '방어병', role: 'heavyInfantry' },
    ],
  }
}

for (const grid of ['square', 'hex']) {
  test('editor coordinates, exclusions and AI are shared in ' + grid + ' battles', () => {
    const stage = edited(grid)
    assert.deepEqual(validateStage(stage), [])
    const geometry = boardGeometry(stage.map, grid, stage.board)
    assert.deepEqual(geometry.cellAt(geometry.center(at(0, 2))), at(0, 2))
    const excluded = at(1, 1)
    assert.equal(geometry.cellAt(geometry.center(excluded)), null)
    assert.deepEqual(geometry.cellAt(geometry.center(excluded), true), excluded)
    assert.equal(validCell(excluded, stage.map), false)
    assert.deepEqual(geometry.image, { x: 0, y: 16, width: 320, height: 240 })

    const { battle, inventory } = startTrial({ stage, data: webCampaign })
    const [captain, second, chaser, guard] = battle.units
    assert.deepEqual([captain, second].map(({ x, y }) => at(x, y)), stage.deployment)
    assert.deepEqual([chaser.behavior, guard.behavior], [1, 2])
    assert.ok(movesFor(battle, captain).every(({ x, y }) => x !== 1 || y !== 1))
    assert.ok(attackCells({ ...captain, range: 3 }, false, battle.map, grid).every(({ x, y }) => x !== 1 || y !== 1))
    let next = battle
    const events = []
    if (grid === 'hex') {
      for (const unit of initiativeQueue(battle)) {
        assert.equal(initiativeQueue(next)[0].id, unit.id)
        const action = unit.side === 'enemy' ? { type: 'initiative-ai', unit: unit.id, day: 1 } : { type: 'wait', unit: unit.id }
        next = playBattle(next, inventory, action).battle
        events.push(...next.events)
      }
    } else {
      next = playBattle(battle, inventory, { type: 'end' }).battle
      events.push(...next.events)
    }
    assert.equal(next.round, 2)
    assert.ok(events.some((event) => event.move?.unit === chaser.id))
    assert.ok(!events.some((event) => event.move?.unit === guard.id))
  })
}

test('reports missing captain, overlapping and blocked positions, and unsupported AI', () => {
  const stage = edited('hex')
  const broken = { ...stage, deployment: [], enemyBehavior: 91, enemies: [
    { ...stage.enemies[0], ...at(1, 1), behavior: 3 },
    { ...stage.enemies[1], ...at(1, 1) },
    { ...stage.enemies[1], ...at(7, 1) },
    { ...stage.enemies[1], ...at(0, 2) },
  ], map: ['.....', '._...', 'w....'] }
  const messages = validateStage(broken)
  assert.ok(messages.some(({ message }) => message.includes('총대장')))
  assert.ok(messages.some(({ message }) => message.includes('기본 AI')))
  assert.ok(messages.some(({ enemy, message }) => enemy === 0 && message.includes('개별 AI')))
  assert.ok(messages.some(({ enemy, message }) => enemy === 1 && message.includes('겹칩니다')))
  assert.ok(messages.some(({ enemy, point }) => enemy === 2 && point.x === 7))
  assert.ok(messages.some(({ enemy, message }) => enemy === 3 && message.includes('진입')))
  assert.throws(() => readEntry({ id: '../stage', source: 'web', stage }), /ID/)
})

test('edited guests appear in battle, and an empty guest list overrides original placements', () => {
  const stage = edited('square')
  const guest = { ...at(2, 0), name: '우군 장수', role: 'heavyCavalry' }
  const savedStage = readPackage(JSON.parse(JSON.stringify({ ...stage, guests: [guest] }))).stage
  assert.deepEqual(validateStage(savedStage), [])
  const { battle, inventory } = startTrial({ stage: savedStage, data: webCampaign })
  const ally = battle.units.find((unit) => unit.guest)
  assert.deepEqual({ ...at(ally.x, ally.y), name: ally.name, side: ally.side }, { ...at(guest.x, guest.y), name: guest.name, side: 'ally' })
  assert.deepEqual(movesFor(battle, ally), [])
  const after = playBattle(battle, inventory, { type: 'end' }).battle
  assert.ok(after.events.some(({ move, impact }) => move?.unit === ally.id || impact?.attacker === ally.id))

  const jo = { id: 7, level: 2, growth: [0, 0, 0, 0, 0, 0, 0], hp: 80, mp: 40, move: 3, pattern: [{ x: 1, y: 0 }] }
  const original = { ...stage, jo: { guests: [{ ...guest, jo }], reinforcements: [{ ...guest, ...at(2, 2), jo }] } }
  const play = (scenario) => startTrial({ stage: scenario, data: webCampaign }).battle
  assert.equal(play(original).units.find((unit) => unit.guest).id, 'guest-7')
  const withDuplicate = play({ ...original, guests: [...original.jo.guests, { ...guest, ...at(3, 0), jo }] })
  const ids = [...withDuplicate.units, ...withDuplicate.reinforcements].map(({ id }) => id)
  assert.equal(ids.length, new Set(ids).size)
  assert.ok(!play({ ...original, guests: [] }).units.some((unit) => unit.guest))
  assert.equal(play({ ...original, guests: [] }).reinforcements.length, 1)
})

test('campaign applies an override without rewriting active saves or trial saves', () => {
  const stage = edited('hex')
  const entry = readEntry({ id: 'web:1', source: 'web', stage })
  assert.deepEqual(readPackage({ format: 'iron-pass-stage', version: 1, source: 'web', stage }), { source: 'web', stage })
  assert.deepEqual(readPackage(stage), { source: 'web', stage })
  const portable = {
    format: 'iron-pass-stage', version: 1, source: 'web',
    stage: { ...stage, board: { ...stage.board, image: 'data:image/png;base64,AA==' } },
  }
  assert.deepEqual(readPackage(JSON.parse(JSON.stringify(portable))).stage, portable.stage)
  const data = campaignWithStages(webCampaign, [entry])
  assert.equal(data.stages[1], webCampaign.stages[1])
  assert.equal(trialSetup(data, 1, 'hex').stage, stage)
  const saved = new Map()
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    setItem: (key, value) => saved.set(key, value),
    getItem: (key) => saved.get(key),
  } })
  try {
    const initial = campaignReducer(loadCampaign(), { type: 'recommended' })
    const old = campaignReducer(initial, { type: 'deploy' })
    saveCampaign(old, 'web')
    const initialJo = JSON.stringify({ ...initial, gold: 77 })
    saved.set('iron-pass.jo.v1', initialJo)
    const oldWeb = saved.get('iron-pass.v1')
    const trial = startTrial(trialSetup(data, 1, 'hex'))
    playBattle(trial.battle, trial.inventory, { type: 'end' })
    assert.equal(saved.get('iron-pass.v1'), oldWeb)
    assert.equal(saved.get('iron-pass.jo.v1'), initialJo)
    assert.deepEqual(loadCampaign().battle.map, old.battle.map)
    assert.equal(loadCampaign('jo').gold, 77)
    const next = campaignReducer(initial, { type: 'deploy' }, data)
    assert.deepEqual(next.battle.map, stage.map)
    assert.equal(next.battle.units[2].name, stage.enemies[0].name)
    saveCampaign(next)
    assert.equal(loadCampaign().battle.units[2].name, stage.enemies[0].name)
    assert.deepEqual(loadCampaign().battle.board, stage.board)
    assert.equal(newBattle(stage, recommendedIds, recommendedIds[0], {}).grid, 'hex')
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage)
    else delete globalThis.localStorage
  }
})
