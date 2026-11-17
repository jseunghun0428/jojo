import assert from 'node:assert/strict'
import test from 'node:test'
import { CELL_SIZE } from '../src/grid.ts'
import { unitFormation } from '../src/unit-formation.ts'

test('the map shows one soldier per 100 troops and keeps one for a surviving unit', () => {
  for (const [hp, count] of [[0, 0], [1, 1], [99, 1], [100, 1], [199, 1], [200, 2],
    [899, 8], [1000, 10], [1200, 12], [2500, 25]]) {
    const { positions, scale } = unitFormation(hp)
    assert.equal(positions.length, count, `HP ${hp}`)
    assert.equal(new Set(positions.map(({ x, y }) => `${x},${y}`)).size, count)
    assert.ok(positions.every(({ x, y }) => x > 0 && x < CELL_SIZE && y > 0 && y < CELL_SIZE))
    assert.equal(scale > 0, count > 0)
  }
})

test('larger formations keep the same sprite size and close the gaps', () => {
  const small = unitFormation(600)
  const large = unitFormation(1200)
  assert.equal(unitFormation(100).scale, small.scale)
  assert.equal(large.scale, small.scale)
  assert.ok(large.positions[1].x - large.positions[0].x < small.positions[1].x - small.positions[0].x)
  assert.ok(large.positions[4].y - large.positions[0].y < small.positions[3].y - small.positions[0].y)
})
