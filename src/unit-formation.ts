import { CELL_SIZE } from './grid.ts'

export function unitFormation(hp: number) {
  if (hp <= 0) return { positions: [], scale: 0 }

  const count = Math.max(1, Math.floor(hp / 100))
  const width = 48
  const height = 22
  const columns = Math.min(count, Math.round(Math.sqrt(count * 1.6)))
  const rows = Math.ceil(count / columns)
  const columnWidth = width / columns
  const rowHeight = height / rows
  const scale = 0.62
  const positions = Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns)
    const rowCount = Math.min(columns, count - row * columns)
    return {
      x: CELL_SIZE / 2 + (index % columns - (rowCount - 1) / 2) * columnWidth,
      y: 45 - (rows - row - 1) * rowHeight,
    }
  })
  return { positions, scale }
}
