import { stageDeployment, stageImage } from './data.ts'
import type { Stage } from './data.ts'
import { boardGeometry, CELL_SIZE } from './grid.ts'
import { AI_OPTIONS, imageData, MAX_IMAGE_BYTES, readEntry, readPackage } from './stage-library.ts'
import type { StageEntry, StagePackage } from './stage-library.ts'

export type Viewport = { zoom: number; left: number; top: number }
export type Draft = { entry: StageEntry; viewport: Viewport; revision: string }

export function editableStage(original: Stage): Stage {
  const stage = structuredClone(original)
  const image = stageImage(stage)
  const { width, height } = boardGeometry(stage.map, stage.grid)
  stage.board ??= { cellSize: CELL_SIZE, x: 0, y: 0, ...(image && { image, imageWidth: width, imageHeight: height }) }
  stage.deployment = stageDeployment(stage)
  return stage
}

export function originalForEditing(stage: Stage): Stage {
  return {
    ...editableStage(stage),
    enemies: stage.enemies.map((unit) => ({
      ...unit,
      behavior: unit.behavior === undefined || AI_OPTIONS.some(({ value }) => value === unit.behavior) ? unit.behavior : 1,
    })),
  }
}

function openDrafts(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('iron-pass-stage-editor', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('drafts')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function draftFile(mode: 'read' | 'write', draft?: Draft): Promise<Draft | undefined> {
  const db = await openDrafts()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('drafts', mode === 'read' ? 'readonly' : 'readwrite')
      const drafts = transaction.objectStore('drafts')
      const request = mode === 'read' ? drafts.get('latest') : drafts.put(draft, 'latest')
      transaction.oncomplete = () => resolve(mode === 'read' ? request.result : draft)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    db.close()
  }
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function imageDimensions(url: string) {
  const image = new Image()
  image.src = url
  try { await image.decode() }
  catch { throw new Error('지도 이미지가 손상되었거나 지원하는 형식이 아닙니다.') }
  if (image.naturalWidth > 8192 || image.naturalHeight > 8192) throw new Error('지도 이미지는 가로·세로 8192px 이하로 준비하세요.')
  return { imageWidth: image.naturalWidth, imageHeight: image.naturalHeight }
}

export async function readImage(file: File) {
  if (file.size > MAX_IMAGE_BYTES || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('20MB 이하의 PNG, JPG, WebP 이미지를 선택하세요.')
  }
  const image = await toDataUrl(file)
  return { image, ...await imageDimensions(image) }
}

export async function importStage(file: File): Promise<StageEntry> {
  if (file.size > 30 * 1024 * 1024) throw new Error('스테이지 파일이 너무 큽니다.')
  let value: unknown
  try { value = JSON.parse(await file.text()) }
  catch { throw new Error('올바른 JSON 파일을 선택하세요.') }
  const { source, stage } = readPackage(value)
  const editable = editableStage(stage)
  if (imageData(editable.board?.image)) {
    const dimensions = await imageDimensions(editable.board.image)
    editable.board = { ...editable.board, ...(!editable.board.imageWidth && dimensions) }
  }
  return { id: 'custom:' + crypto.randomUUID(), source, stage: editable }
}

export async function exportStage({ source, stage }: StageEntry) {
  const copy = editableStage(stage)
  const board = copy.board!
  if (board.image && !imageData(board.image)) {
    const response = await fetch(board.image)
    if (!response.ok) throw new Error('지도 이미지를 가져오지 못했습니다. 이미지를 다시 등록하세요.')
    const blob = await response.blob()
    if (blob.size > MAX_IMAGE_BYTES) throw new Error('내보낼 지도 이미지가 20MB를 초과합니다.')
    const image = await toDataUrl(blob)
    if (!imageData(image)) throw new Error('지도 이미지의 내보내기 형식을 지원하지 않습니다.')
    board.image = image
  }
  if (copy.jo) delete copy.jo.image
  const bundle: StagePackage = { format: 'iron-pass-stage', version: 1, source, stage: copy }
  const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = copy.name.replace(/[\\/:*?"<>|]/g, '-') + '.stage.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function saveStage(entry: StageEntry, revision: string) {
  const response = await fetch('/stage-data/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry, revision }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? '프로젝트에 반영하지 못했습니다.')
  return { entry: readEntry(result.entry), revision: result.revision as string }
}
