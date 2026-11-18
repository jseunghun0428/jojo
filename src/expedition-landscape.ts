import type { Point } from './data.ts'
import { hexStep } from './grid.ts'
import type { boardGeometry } from './grid.ts'

type Canvas = CanvasRenderingContext2D
type Geometry = ReturnType<typeof boardGeometry>
const isRiver = (code?: string) => code === 'w' || code === 'b' || code === 'j'

function polygon(ctx: Canvas, points: readonly Point[]) {
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (const p of points.slice(1)) ctx.lineTo(p.x, p.y)
  ctx.closePath()
}

function line(ctx: Canvas, ax: number, ay: number, bx: number, by: number, color: string, width: number) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(bx, by)
  ctx.stroke()
}

function bridge(ctx: Canvas) {
  ctx.save()
  ctx.rotate(-0.045)
  ctx.fillStyle = '#342d2599'
  ctx.fillRect(-32, -5, 64, 23)
  ctx.fillStyle = '#503b30'
  ctx.fillRect(-32, -13, 64, 24)
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = ['#b89565', '#c7a57a', '#aa895e'][i % 3]
    ctx.fillRect(-32 + i * 6.5, -11, 5.8, 20)
  }
  for (const y of [-13, 9]) {
    line(ctx, -32, y, 32, y, '#5e4532', 3)
    for (const x of [-27, 0, 27]) {
      ctx.fillStyle = '#634b37'
      ctx.fillRect(x, y - 5, 3.5, 8)
      ctx.fillStyle = '#e0bc8d'
      ctx.fillRect(x, y - 5, 3.5, 2)
    }
  }
  ctx.restore()
}

function fortification(ctx: Canvas, gate: boolean) {
  ctx.fillStyle = '#26312665'
  ctx.fillRect(-20, -11, 44, 35)
  ctx.fillStyle = '#545a4b'
  ctx.fillRect(-19, -17, 38, 36)
  for (let j = 0; j < 5; j++) {
    for (let i = -2; i <= 2; i++) {
      const x = i * 10 + (j % 2) * 5
      ctx.fillStyle = ['#808376', '#939181', '#707767'][(i + j + 2) % 3]
      ctx.fillRect(Math.max(-18, x - 4), j * 6 - 12, Math.max(0, Math.min(9, 18 - Math.max(-18, x - 4))), 5)
    }
  }
  for (const x of [-19, -8, 4, 15]) {
    ctx.fillStyle = '#a4a08a'
    ctx.fillRect(x, -20, 6, 6)
  }
  if (gate) {
    ctx.fillStyle = '#3e2c24'
    ctx.fillRect(-7, -1, 14, 20)
    ctx.fillStyle = '#56352a'
    ctx.fillRect(-13, -18, 26, 12)
    polygon(ctx, [{ x: -22, y: -15 }, { x: -10, y: -25 }, { x: 9, y: -25 }, { x: 22, y: -15 }])
    ctx.fillStyle = '#34474a'
    ctx.fill()
    line(ctx, -20, -15, 20, -15, '#d6b887', 2)
    line(ctx, -12, -19, -12, -6, '#d79a61', 2)
    line(ctx, 12, -19, 12, -6, '#d79a61', 2)
  }
}

function camp(ctx: Canvas) {
  for (const [x, y] of [[-9, 2], [10, 11]]) {
    ctx.fillStyle = '#473e2f77'
    ctx.fillRect(x - 8, y - 2, 19, 6)
    ctx.fillStyle = '#baa37a'
    polygon(ctx, [{ x: x - 11, y }, { x, y: y - 15 }, { x: x + 11, y }])
    ctx.fill()
    ctx.fillStyle = '#574435'
    polygon(ctx, [{ x: x - 3, y }, { x, y: y - 8 }, { x: x + 4, y }])
    ctx.fill()
  }
  line(ctx, 9, -18, 9, -1, '#4b3829', 2)
  ctx.fillStyle = '#994d37'
  ctx.fillRect(10, -17, 9, 5)
}

export function paintExpeditionLandscape(ctx: Canvas, map: readonly string[], geometry: Geometry, atlas?: HTMLImageElement) {
  const patterns: (CanvasPattern | null)[] = []
  if (atlas) {
    const w = atlas.naturalWidth / 2, h = atlas.naturalHeight / 2
    for (let i = 0; i < 4; i++) {
      const swatch = document.createElement('canvas')
      swatch.width = swatch.height = i === 0 ? 196 : 138
      swatch.getContext('2d')!.drawImage(atlas, (i % 2) * w + 2, Math.floor(i / 2) * h + 2, w - 4, h - 4, 0, 0, swatch.width, swatch.height)
      patterns.push(ctx.createPattern(swatch, 'repeat'))
    }
  }
  map.forEach((row, y) => [...row].forEach((code, x) => {
    const point = { x, y }, pixel = geometry.center(point), corners = geometry.corners(point)
    const material = isRiver(code) ? 3 : code === 'm' ? 2 : code === 'f' || code === 'p' ? 1 : 0
    ctx.save()
    polygon(ctx, corners)
    ctx.clip()
    ctx.fillStyle = patterns[material] ?? ['#80825b', '#3d6045', '#80796b', '#4b8286'][material]
    ctx.fillRect(pixel.x - 34, pixel.y - 39, 68, 78)
    for (let direction = 0; direction < 6; direction++) {
      const adjacent = hexStep(point, direction)
      const other = map[adjacent.y]?.[adjacent.x]
      if (!isRiver(code) && isRiver(other)) {
        const a = corners[(direction + 1) % 6], b = corners[(direction + 2) % 6]
        line(ctx, a.x, a.y, b.x, b.y, '#c3b18b', 6)
        line(ctx, a.x, a.y, b.x, b.y, '#4f5a48', 1.5)
      }
    }
    ctx.translate(pixel.x, pixel.y)
    if (code === '=' || code === 'G') {
      const bend = Math.sin(x * 2.7 + y) * 6
      for (const [width, color] of [[24, '#706246'], [20, '#b19b71'], [13, '#baa57e']] as const) {
        ctx.lineWidth = width
        ctx.strokeStyle = color
        ctx.beginPath()
        ctx.moveTo(-34, 1)
        ctx.quadraticCurveTo(0, bend, 34, 1)
        ctx.stroke()
      }
    }
    if (code === 'j') {
      ctx.fillStyle = '#dbd6a650'
      ctx.fillRect(-33, -38, 66, 76)
      for (let n = -2; n <= 2; n++) {
        ctx.fillStyle = '#9c9c87'
        ctx.beginPath()
        ctx.ellipse(n * 11, Math.sin(n * 4) * 4, 4, 2, -.2, 0, Math.PI * 2)
        ctx.fill()
      }
    } else if (code === 'b') bridge(ctx)
    else if (code === 'G' || code === 'W') fortification(ctx, code === 'G')
    else if (code === 'B') camp(ctx)
    else if (code === 's') { ctx.fillStyle = '#e5eeede0'; ctx.fillRect(-33, -38, 66, 76) }
    ctx.restore()
    polygon(ctx, corners)
    ctx.strokeStyle = '#383b304a'
    ctx.lineWidth = 1
    ctx.stroke()
  }))
}
