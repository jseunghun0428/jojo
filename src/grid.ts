import type { Point } from './data.ts'

export type Grid = 'square' | 'hex'
export const OUTSIDE_CELL = '_'
export type BoardLayout = { cellSize: number; x: number; y: number; imageWidth?: number; imageHeight?: number }
type Axial = { q: number; r: number }

// Clockwise, starting east. Odd-r is used for storage; calculations use axial coordinates.
const hexSides: readonly Axial[] = [
  { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 },
  { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 },
]
const squareSides = [{ x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }]
const toAxial = ({ x, y }: Point): Axial => ({ q: x - Math.floor(y / 2), r: y })
const toOffset = ({ q, r }: Axial): Point => ({ x: q + Math.floor(r / 2), y: r })

export function hexStep(origin: Point, direction: number, steps = 1): Point {
  const { q, r } = toAxial(origin)
  const side = hexSides[(direction % 6 + 6) % 6]
  return toOffset({ q: q + side.q * steps, r: r + side.r * steps })
}

export function neighbors(point: Point, grid?: Grid): Point[] {
  return grid === 'hex' ? hexSides.map((_, direction) => hexStep(point, direction))
    : squareSides.map(({ x, y }) => ({ x: point.x + x, y: point.y + y }))
}

export function gridDistance(a: Point, b: Point, grid?: Grid) {
  if (grid !== 'hex') return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
  const from = toAxial(a)
  const to = toAxial(b)
  const dq = to.q - from.q
  const dr = to.r - from.r
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr))
}

export function hexDirection(from: Point, to: Point) {
  const steps = gridDistance(from, to, 'hex')
  if (!steps) return -1
  return hexSides.findIndex((_, direction) => {
    const end = hexStep(from, direction, steps)
    return end.x === to.x && end.y === to.y
  })
}

export function validCell({ x, y }: Point, map: readonly string[]) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < (map[y]?.length ?? 0)
    && map[y][x] !== OUTSIDE_CELL
}

export const CELL_SIZE = 64
const radius = CELL_SIZE / Math.sqrt(3)
const rowSpacing = radius * 1.5

function roundAxial(q: number, r: number): Axial {
  const s = -q - r
  let roundedQ = Math.round(q)
  let roundedR = Math.round(r)
  const dQ = Math.abs(roundedQ - q)
  const dR = Math.abs(roundedR - r)
  const dS = Math.abs(Math.round(s) - s)
  if (dQ > dR && dQ > dS) roundedQ = -roundedR - Math.round(s)
  else if (dR > dS) roundedR = -roundedQ - Math.round(s)
  // Avoid returning negative zero beside the top or left edge.
  return { q: roundedQ + 0, r: roundedR + 0 }
}

function cellCenter(point: Point, grid?: Grid): Point {
  if (grid !== 'hex') return { x: (point.x + 0.5) * CELL_SIZE, y: (point.y + 0.5) * CELL_SIZE }
  const { q, r } = toAxial(point)
  return { x: (q + r / 2 + 0.5) * CELL_SIZE, y: r * rowSpacing + radius }
}

const hexCorners: readonly Point[] = [
  { x: 0, y: -radius }, { x: CELL_SIZE / 2, y: -radius / 2 },
  { x: CELL_SIZE / 2, y: radius / 2 }, { x: 0, y: radius },
  { x: -CELL_SIZE / 2, y: radius / 2 }, { x: -CELL_SIZE / 2, y: -radius / 2 },
]
const halfCell = CELL_SIZE / 2
const squareCorners: readonly Point[] = [
  { x: -halfCell, y: -halfCell }, { x: halfCell, y: -halfCell },
  { x: halfCell, y: halfCell }, { x: -halfCell, y: halfCell },
]

export function boardGeometry(map: readonly string[], grid?: Grid, layout?: BoardLayout) {
  const hex = grid === 'hex'
  const columns = Math.max(0, ...map.map(({ length }) => length))
  const gridWidth = hex ? Math.max(0, ...map.map((row, y) => (row.length + (y % 2) * 0.5) * CELL_SIZE))
    : columns * CELL_SIZE
  const gridHeight = hex ? Math.ceil((map.length - 1) * rowSpacing + radius * 2) : map.length * CELL_SIZE
  const scale = layout ? CELL_SIZE / layout.cellSize : 1
  const left = (layout?.x ?? 0) * scale
  const top = (layout?.y ?? 0) * scale
  const imageWidth = (layout?.imageWidth ?? 0) * scale
  const imageHeight = (layout?.imageHeight ?? 0) * scale
  const imageX = Math.max(0, -left)
  const imageY = Math.max(0, -top)
  const offsetX = left + imageX
  const offsetY = top + imageY
  const width = Math.max(1, Math.ceil(Math.max(offsetX + gridWidth, imageX + imageWidth)))
  const height = Math.max(1, Math.ceil(Math.max(offsetY + gridHeight, imageY + imageHeight)))
  const center = (point: Point) => {
    const pixel = cellCenter(point, grid)
    return { x: pixel.x + offsetX, y: pixel.y + offsetY }
  }
  return {
    width, height, cellHeight: hex ? radius * 2 : CELL_SIZE,
    image: imageWidth && imageHeight ? { x: imageX, y: imageY, width: imageWidth, height: imageHeight } : undefined,
    center,
    corners: (point: Point, inset = 0) => {
      const pixel = center(point)
      const scale = 1 - inset * 2 / CELL_SIZE
      const corners = hex ? hexCorners : squareCorners
      return corners.map(({ x, y }) => ({ x: pixel.x + x * scale, y: pixel.y + y * scale }))
    },
    cellAt(pixel: Point, includeExcluded = false) {
      const x = pixel.x - offsetX
      const y = pixel.y - offsetY
      if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) return null
      const r = (y - radius) / rowSpacing
      const point = hex ? toOffset(roundAxial((x - CELL_SIZE / 2) / CELL_SIZE - r / 2, r))
        : { x: Math.floor(x / CELL_SIZE), y: Math.floor(y / CELL_SIZE) }
      return (includeExcluded ? map[point.y]?.[point.x] !== undefined : validCell(point, map)) ? point : null
    },
  }
}
