import type Phaser from 'phaser'
import type { BattleImpact, Unit } from './combat.ts'
import type { Point } from './data.ts'
import { troopClassFor } from './unit-classes.ts'
import type { BattleElement } from './war-arts.ts'

export function paintElementBurst(g: Phaser.GameObjects.Graphics, element: BattleElement, x: number, y: number, progress: number) {
  const colors = { fire: 0xffbd54, earth: 0xa88462, water: 0xb2eeff }
  const fade = Math.sin(progress * Math.PI)
  for (let i = 0; i < 9; i++) {
    const angle = i * 2.4
    const reach = (14 + i % 4 * 6) * progress
    const px = x + Math.cos(angle) * reach
    const py = y + Math.sin(angle) * reach * .5 - (element === 'fire' ? 36 * progress : fade * (12 + i % 3 * 7))
    g.fillStyle(colors[element], fade)
    if (element === 'earth') g.fillTriangle(px - 2, py, px + 1, py - 4, px + 4, py + 1)
    else g.fillEllipse(px, py, element === 'water' ? 3 : 2, 5)
  }
}

export function paintMarch(g: Phaser.GameObjects.Graphics, from: Point, to: Point, progress: number, terrain: string, mounted: boolean) {
  const wet = terrain === 'j' || terrain === 'r' || terrain === 'w'
  const snow = terrain === 's'
  const dx = to.x - from.x, dy = to.y - from.y
  const length = Math.hypot(dx, dy) || 1
  for (let n = 0; n < (mounted ? 4 : 2); n++) {
    const t = progress * 1.5 - n * .22
    if (t < 0 || t > 1) continue
    const side = n % 2 ? 5 : -5
    const x = from.x + dx * n * .14 - dy / length * side
    const y = from.y + dy * n * .14 + dx / length * side + 13
    const fade = Math.sin(Math.PI * t)
    if (wet) {
      g.lineStyle(1.5, 0xc9f2e9, fade * .9).strokeEllipse(x, y, 5 + 20 * t, 3 + 6 * t)
    } else {
      g.fillStyle(snow ? 0xe1f1f4 : 0xc9b48f, fade * .65)
        .fillEllipse(x - dx / length * t * 6, y - t * 7, 4 + t * (mounted ? 11 : 5), 3 + t * 4)
    }
  }
}

export function paintStrike(g: Phaser.GameObjects.Graphics, hit: BattleImpact, unit: Unit,
  from: Point, to: Point, time: number, contact: number) {
  const troop = unit.troopClass ?? troopClassFor(unit.role, unit.jo?.classId)
  const dx = to.x - from.x, dy = to.y - from.y
  const angle = Math.atan2(dy, dx)
  const t = Math.min(1, time / contact)
  const color = hit.element === 'water' ? 0x9ce6ff : hit.element === 'fire' ? 0xff913f
    : hit.element === 'earth' ? 0xcbae7c : hit.technique === '연계 공격' ? 0xffda77 : 0xf6eed6
  if (t < 1 && troop === 'ranged' && hit.kind !== 'fire') {
    const volley = hit.technique ? 5 : 2
    for (let i = 0; i < volley; i++) {
      const flight = Math.max(0, Math.min(1, t * 1.4 - i * .07))
      const x = from.x + dx * flight, y = from.y + dy * flight - Math.sin(flight * Math.PI) * 6 + (i - (volley - 1) / 2) * 3
      const direction = Math.atan2(dy - Math.cos(flight * Math.PI) * 6 * Math.PI, dx)
      g.lineStyle(2, color, .95).lineBetween(x, y, x - Math.cos(direction) * 21, y - Math.sin(direction) * 21)
      g.fillStyle(0xe5e6dc).fillTriangle(x + Math.cos(direction) * 3, y + Math.sin(direction) * 3,
        x - Math.sin(direction) * 2, y + Math.cos(direction) * 2, x + Math.sin(direction) * 2, y - Math.cos(direction) * 2)
    }
  } else if (t < 1 && hit.kind !== 'fire') {
    const tip = Math.sin(t * Math.PI / 2)
    if (troop === 'cavalry') paintMarch(g, from, to, t, '.', true)
    for (let i = -1; i <= 1; i++) {
      const offset = i * 5
      g.lineStyle(i === 0 ? 4 : 2, color, t * .8)
        .lineBetween(from.x + dx * Math.max(0, tip - .36), from.y + dy * Math.max(0, tip - .36) + offset,
          from.x + dx * tip, from.y + dy * tip + offset)
    }
  }
  if (time < contact || hit.blocked) return
  const burst = Math.min(1, (time - contact) / 350)
  const fade = 1 - burst
  const radius = 7 + burst * (hit.technique ? 40 : 27)
  g.lineStyle(3 * fade + 1, color, fade).strokeEllipse(to.x, to.y, radius * 2, radius * .95)
  for (let i = 0; i < 11; i++) {
    const a = angle + i * Math.PI * 2 / 11
    const reach = radius * (i % 2 === 0 ? 1.2 : .78)
    g.lineStyle(2, color, fade).lineBetween(to.x + Math.cos(a) * reach * .58, to.y + Math.sin(a) * reach * .58,
      to.x + Math.cos(a) * reach, to.y + Math.sin(a) * reach)
  }
  if (troop === 'infantry' && !hit.element) {
    g.lineStyle(4 * fade + 1, 0xffefb6, fade).beginPath().arc(to.x, to.y, radius, angle - 1.8, angle + .75).strokePath()
  }
}
