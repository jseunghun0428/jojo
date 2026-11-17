import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, PointerEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { FIELD_LIMIT, officers, stageGuests, terrains } from './data.ts'
import type { Point, Stage, StageUnit, Terrain } from './data.ts'
import { boardGeometry, OUTSIDE_CELL, validCell } from './grid.ts'
import type { Grid } from './grid.ts'
import { joTerrainId, joTerrainRow } from './jo-game.ts'
import type { CampaignData } from './jo-game.ts'
import { roles } from './unit-classes.ts'
import { AI_OPTIONS, MAX_GRID, loadStageCatalog, loadStageSources, readStage, stageEntries, validateStage } from './stage-library.ts'
import type { StageEntry, StageIssue } from './stage-library.ts'
import { draftFile, editableStage, exportStage, importStage, originalForEditing, readImage, saveStage } from './stage-editor-files.ts'
import type { Draft, Viewport } from './stage-editor-files.ts'
import './stage-editor.css'

const sheets = [['slot', '아군'], ['guest', '우군'], ['enemy', '적군']] as const
type Sheet = (typeof sheets)[number][0]
type Tool = 'select' | 'paint' | 'pan' | Sheet
type Selection = { kind: Sheet | 'reinforcement'; index: number }
const sheetFor = (kind: Selection['kind']): Sheet => kind === 'reinforcement' ? 'guest' : kind
type Gesture = { mode: 'paint'; stage: Stage; last: Point } | { mode: 'pan'; start: Point; scroll: Point }

const emptyView: Viewport = { zoom: 0.64, left: 0, top: 0 }
const same = (a: Point, b?: Point) => a.x === b?.x && a.y === b.y
const location = ({ x, y }: Point) => (x + 1) + '열 ' + (y + 1) + '행'
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)
const terrainColors: Record<string, string> = {
  plain: '#9abb66', forest: '#245d3a', peach: '#9b527a', rock: '#636b7d', earth: '#a27753',
  sand: '#c6aa59', snow: '#c5dbe5', ice: '#7bb7d4', water: '#2e74aa', marsh: '#557785',
  road: '#bda987', building: '#956747',
}
const availableOfficers = (entries: StageEntry[], data?: CampaignData) => {
  const choices = new Map<string, StageUnit>()
  const add = (unit: StageUnit) => choices.set(unit.name, unit)
  for (const { id, name, role } of officers) {
    add({ name, role, x: 0, y: 0, jo: data?.officers[id], enemyKind: 'officer' })
  }
  for (const unit of entries.flatMap(({ stage }) => [...stage.enemies, ...stageGuests(stage), ...stage.jo?.reinforcements ?? []])) {
    if (!choices.has(unit.name) || (unit.jo && !choices.get(unit.name)?.jo)) add({ ...unit, behavior: undefined })
  }
  return [...choices.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

function newStage(source: StageEntry['source']): StageEntry {
  return {
    id: 'custom:' + crypto.randomUUID(), source,
    stage: { name: '새 스테이지', number: 1, tier: 0, reward: 0, grid: 'square',
      board: { cellSize: 64, x: 0, y: 0 }, map: Array.from({ length: 8 }, () => '.'.repeat(12)), deployment: [], enemies: [] },
  }
}

function placements(stage: Stage) {
  return [
    ...(stage.deployment ?? []).map((point, index) => ({ point, kind: 'slot' as const, index, label: index ? String(index) : '총', name: index ? '아군 슬롯 ' + index : '총대장' })),
    ...stage.enemies.map((point, index) => ({ point, kind: 'enemy' as const, index, label: point.name, name: point.name })),
    ...stageGuests(stage).map((point, index) => ({ point, kind: 'guest' as const, index, label: point.name, name: point.name })),
    ...(stage.jo?.reinforcements ?? []).map((point, index) => ({ point, kind: 'reinforcement' as const, index, label: point.name, name: point.name })),
  ]
}

function Editor({ initial, catalog, revision: firstRevision, web, jo, draft, warning }: {
  initial: StageEntry; catalog: StageEntry[]; revision: string; web: CampaignData; jo?: CampaignData; draft?: Draft; warning?: string
}) {
  const [entry, setEntry] = useState(initial)
  const [entries, setEntries] = useState(catalog)
  const [revision, setRevision] = useState(firstRevision)
  const [latestDraft, setLatestDraft] = useState(draft)
  const [changed, setChanged] = useState(false)
  const [group, setGroup] = useState('web')
  const [tool, setTool] = useState<Tool>('paint')
  const [sheet, setSheet] = useState<Sheet>('slot')
  const [brush, setBrush] = useState<Terrain | string>('.')
  const [selection, setSelection] = useState<Selection>()
  const [destination, setDestination] = useState(false)
  const [officer, setOfficer] = useState({ guest: '', enemy: '' })
  const [zoom, setZoom] = useState(emptyView.zoom)
  const [status, setStatus] = useState(warning ?? '')
  const [busy, setBusy] = useState(false)
  const [issuesOpen, setIssuesOpen] = useState(false)
  const [activeCell, setActiveCell] = useState<Point>()
  const [painted, setPainted] = useState<Stage>()
  const [undo, setUndo] = useState<Stage[]>([])
  const [redo, setRedo] = useState<Stage[]>([])
  const scroll = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const gesture = useRef<Gesture>(null)
  const incomingView = useRef<Viewport | null>(null)
  const previewCleanup = useRef<(() => void) | null>(null)

  const stage = entry.stage
  const visibleStage = painted ?? stage
  const board = stage.board!
  const data = entry.source === 'jo' && jo ? jo : web
  const geometry = useMemo(() => boardGeometry(visibleStage.map, visibleStage.grid, visibleStage.board), [visibleStage])
  const choices = useMemo(() => availableOfficers(entries.filter(({ source }) => source === entry.source), data), [entries, entry.source, data])
  const formation = useMemo(() => placements(visibleStage), [visibleStage])
  const issues = useMemo(() => validateStage(stage, data.officers), [stage, data])
  const rows = stage.map.length
  const columns = Math.max(...stage.map.map(({ length }) => length))
  const selected = selection && formation.find(({ kind, index }) => selection.kind === kind && selection.index === index)
  const activeEnemy = selected?.kind === 'enemy' ? stage.enemies[selected.index] : undefined
  const unitsInSheet = formation.filter(({ kind }) => sheetFor(kind) === sheet)
  const list = entries.filter(({ id }) => group === 'web' ? id.startsWith('web:') : group === 'jo' ? id.startsWith('jo:') : !/^(web|jo):/.test(id))

  useEffect(() => {
    const handle = (event: BeforeUnloadEvent) => { if (changed) event.preventDefault() }
    window.addEventListener('beforeunload', handle)
    return () => window.removeEventListener('beforeunload', handle)
  }, [changed])
  useEffect(() => () => previewCleanup.current?.(), [])
  useEffect(() => {
    const view = incomingView.current
    if (view && scroll.current) {
      scroll.current.scrollTo(view.left, view.top)
      incomingView.current = null
    }
  }, [stage, zoom])

  function commit(next: Stage) {
    if (next === stage) return
    setUndo((stack) => [...stack.slice(-39), stage])
    setRedo([])
    setEntry({ ...entry, stage: next })
    setChanged(true)
  }

  function history(direction: 'undo' | 'redo') {
    const from = direction === 'undo' ? undo : redo
    const next = from.at(-1)
    if (!next) return
    const pop = direction === 'undo' ? setUndo : setRedo
    const push = direction === 'undo' ? setRedo : setUndo
    pop(from.slice(0, -1))
    push((stack) => [...stack, stage])
    setEntry({ ...entry, stage: next })
    setSelection(undefined)
    setDestination(false)
    setChanged(true)
  }

  function open(next: StageEntry, view = emptyView, modified = false) {
    setEntry({ ...next, stage: next.stage.board ? editableStage(next.stage) : originalForEditing(next.stage) })
    setGroup(next.id.startsWith('web:') ? 'web' : next.id.startsWith('jo:') ? 'jo' : 'trial')
    setUndo([])
    setRedo([])
    setSelection(undefined)
    setDestination(false)
    setBrush('.')
    setActiveCell(undefined)
    setIssuesOpen(false)
    setChanged(modified)
    setZoom(view.zoom)
    incomingView.current = view
  }

  function leave() {
    return !changed || window.confirm('저장하지 않은 작업이 있습니다. 현재 편집 내용을 닫을까요?')
  }

  function copy(current: Stage, keepName = false) {
    const name = keepName ? current.name : current.name.slice(0, 75) + ' 복제'
    open({ ...entry, id: 'custom:' + crypto.randomUUID(), stage: { ...current, name } }, viewport(), true)
    setStatus('복제본을 열었습니다. 프로젝트 반영 후 시험 전투 목록에 추가됩니다.')
  }

  function viewport(): Viewport {
    return { zoom, left: scroll.current?.scrollLeft ?? 0, top: scroll.current?.scrollTop ?? 0 }
  }

  async function run(task: () => Promise<void>) {
    setBusy(true)
    try { await task() }
    catch (error) { setStatus(errorMessage(error)) }
    finally { setBusy(false) }
  }

  function checkedStage() {
    setIssuesOpen(true)
    if (issues.length) {
      setStatus('배치와 지형 오류를 수정한 뒤 다시 시도하세요.')
      focusIssue(issues[0])
      return false
    }
    try { readStage(stage); return true }
    catch (error) { setStatus(errorMessage(error)); return false }
  }

  function focusIssue(issue: StageIssue) {
    selectPlacement(issue.enemy !== undefined ? { kind: 'enemy', index: issue.enemy }
      : issue.point && formation.find(({ point }) => same(point, issue.point)))
    setActiveCell(issue.point)
    if (issue.point && scroll.current) {
      const pixel = geometry.center(issue.point)
      const { clientWidth, clientHeight } = scroll.current
      scroll.current.scrollTo(pixel.x * zoom - clientWidth / 2, pixel.y * zoom - clientHeight / 2)
    }
  }

  function trial() {
    if (!checkedStage()) return
    const preview = window.open('/?stage-preview', '_blank', 'popup,width=1200,height=850')
    if (!preview) { setStatus('브라우저에서 팝업을 허용한 뒤 다시 시도하세요.'); return }
    previewCleanup.current?.()
    const onReady = (event: MessageEvent) => {
      if (event.source !== preview || event.origin !== locationOrigin || event.data?.type !== 'iron-pass-stage-preview-ready') return
      preview.postMessage({ type: 'iron-pass-stage-preview', setup: {
        stage, data: { source: data.source, stages: [stage], officers: data.officers }, sandbox: entry.id === 'sandbox' || undefined,
      } }, locationOrigin)
      cleanup()
    }
    const locationOrigin = window.location.origin
    const timeout = window.setTimeout(() => { cleanup(); if (!preview.closed) setStatus('시험 전투 창이 전장 데이터를 받지 못했습니다.') }, 20_000)
    const cleanup = () => {
      window.clearTimeout(timeout)
      window.removeEventListener('message', onReady)
      previewCleanup.current = null
    }
    previewCleanup.current = cleanup
    window.addEventListener('message', onReady)
  }

  function resize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const grid = fields.get('grid') as Grid
    const cols = Number(fields.get('columns'))
    const count = Number(fields.get('rows'))
    const shapeChanged = grid !== (stage.grid ?? 'square')
    const sizeChanged = cols !== columns || count !== rows
    const map = sizeChanged ? Array.from({ length: count }, (_, y) => (stage.map[y] ?? '').slice(0, cols).padEnd(cols, '.')) : stage.map
    const outside = (point: Point) => point.y < 0 || point.x < 0 || point.x >= (map[point.y]?.length ?? 0)
    const removedTerrain = stage.map.reduce((sum, row, y) => sum + [...row].filter((_, x) => outside({ x, y })).length, 0)
    const removedUnits = formation.filter(({ point }) => outside(point)).length
    const next = { ...stage, grid, map, board: { ...board, cellSize: Number(fields.get('cellSize')), x: Number(fields.get('left')), y: Number(fields.get('top')) } }
    try { readStage(next) }
    catch (error) { setStatus(errorMessage(error)); return }
    if (shapeChanged || removedTerrain || removedUnits) {
      const impact = (shapeChanged ? '격자 모양이 바뀌어 기존 행·열의 화면 위치와 이동·공격 범위가 바뀝니다. ' : '')
        + removedTerrain + '칸이 잘리고 배치 ' + removedUnits + '개가 격자 밖으로 나갑니다. 격자 밖 유닛은 검증 목록에서 옮길 수 있습니다.'
      if (window.confirm(impact + '\n복제본에 적용할까요?\n취소를 누르면 현재 스테이지에 적용할지 선택합니다.')) { copy(next); return }
      if (shapeChanged && (entry.id === 'sandbox' || entry.id === 'jo-hex:1')) { setStatus('기존 육각 시험 전투의 모양을 바꾸려면 복제본에 적용하세요.'); return }
      if (!window.confirm(impact + '\n현재 스테이지에 적용할까요?')) return
    }
    commit(next)
    setStatus('격자 설정을 적용했습니다.')
  }

  function selectPlacement(next?: Selection) {
    setSelection(next)
    setDestination(false)
    if (next) setSheet(sheetFor(next.kind))
  }

  function switchSheet(next: Sheet) {
    setSheet(next)
    setTool('select')
    selectPlacement(undefined)
  }

  function chooseTool(next: Tool) {
    setTool(next)
    setDestination(false)
    if (next === 'slot' || next === 'guest' || next === 'enemy') {
      if (sheet !== next) setSelection(undefined)
      setSheet(next)
    }
  }

  function setEnemy(index: number, update: Partial<StageUnit>) {
    commit({ ...stage, enemies: stage.enemies.map((unit, i) => i === index ? { ...unit, ...update } : unit) })
  }

  function removeUnit(unit: Selection) {
    const { kind, index } = unit
    setStatus(formation.find((item) => item.kind === kind && item.index === index)?.name + '을 배치에서 삭제했습니다.')
    if (kind === 'guest') commit({ ...stage, guests: stageGuests(stage).filter((_, i) => i !== index) })
    if (kind === 'reinforcement' && stage.jo) {
      commit({ ...stage, jo: { ...stage.jo, reinforcements: stage.jo.reinforcements.filter((_, i) => i !== index) } })
    }
    if (kind === 'enemy') {
      const enemies = stage.enemies.filter((_, i) => i !== index)
      const name = stage.enemies[index].name
      const targets = stage.jo?.objectives
      if (stage.jo && targets?.includes(name) && !enemies.some((enemy) => enemy.name === name)) {
        const remaining = targets.filter((target) => target !== name)
        commit({ ...stage, enemies, jo: { ...stage.jo, objectives: remaining.length ? remaining : undefined } })
        setStatus(remaining.length ? name + '을 승리 조건에서 제외했습니다.' : '승리 조건을 적군 전멸로 변경했습니다.')
      } else commit({ ...stage, enemies })
    }
    selectPlacement(undefined)
    setTool('select')
  }

  function place(point: Point) {
    if (tool === 'select' && !destination) {
      selectPlacement(formation.find((unit) => same(unit.point, point)))
      return
    }
    if (!validCell(point, stage.map)) { setStatus('전장 안의 칸을 선택하세요.'); return }
    if (formation.some((unit) => same(unit.point, point)
      && !(destination && unit.kind === selected?.kind && unit.index === selected.index))) {
      setStatus('이미 배치된 유닛이 있습니다. 빈 칸을 선택하세요.')
      return
    }
    if (destination && selected) {
      const { kind, index } = selected
      if (kind === 'enemy') setEnemy(index, point)
      else if (kind === 'slot') commit({ ...stage, deployment: stage.deployment!.map((slot, i) => i === index ? { ...slot, ...point } : slot) })
      else if (kind === 'guest') commit({ ...stage, guests: stageGuests(stage).map((unit, i) => i === index ? { ...unit, ...point } : unit) })
      else if (stage.jo) {
        commit({ ...stage, jo: { ...stage.jo, reinforcements: stage.jo.reinforcements.map((unit, i) => i === index ? { ...unit, ...point } : unit) } })
      }
      setDestination(false)
      return
    }
    if (tool === 'slot') {
      if (stage.deployment!.length >= FIELD_LIMIT) { setStatus('아군 슬롯은 총대장 포함 12개까지입니다.'); return }
      selectPlacement({ kind: 'slot', index: stage.deployment!.length })
      commit({ ...stage, deployment: [...stage.deployment!, point] })
    }
    if (tool === 'enemy' || tool === 'guest') {
      const template = choices.find(({ name }) => name === officer[tool])
      if (!template) { setStatus('배치할 장수를 먼저 고르세요.'); return }
      const units = tool === 'enemy' ? stage.enemies : stageGuests(stage)
      if (units.length >= 300) { setStatus('한 진영에 300명까지 배치할 수 있습니다.'); return }
      const unit = { ...template, ...point, behavior: undefined }
      selectPlacement({ kind: tool, index: units.length })
      commit(tool === 'enemy' ? { ...stage, enemies: [...units, unit] } : { ...stage, guests: [...units, unit] })
      setTool('select')
      setStatus(unit.name + (tool === 'enemy' ? ' · 적군' : ' · 우군') + '에 추가했습니다.')
    }
  }

  function editSlot(change: -1 | 1 | 'delete') {
    if (selected?.kind !== 'slot') return
    const slots = [...stage.deployment!]
    const index = selected.index
    if (change === 'delete') {
      slots.splice(index, 1)
      setSelection(undefined)
    } else {
      const rank = index + change
      if (!slots[rank]) return
      const other = slots[rank]
      slots[rank] = slots[index]
      slots[index] = other
      setSelection({ kind: 'slot', index: rank })
    }
    commit({ ...stage, deployment: slots })
  }

  function mapPixel(event: PointerEvent) {
    const box = svg.current!.getBoundingClientRect()
    return { x: (event.clientX - box.left) * geometry.width / box.width, y: (event.clientY - box.top) * geometry.height / box.height }
  }

  function paint(at: Point) {
    const stroke = gesture.current
    if (stroke?.mode !== 'paint') return
    const distance = Math.hypot(at.x - stroke.last.x, at.y - stroke.last.y)
    const steps = Math.min(1500, Math.max(1, Math.ceil(distance / 14)))
    const map = [...stroke.stage.map]
    for (let step = 1; step <= steps; step++) {
      const mix = step / steps
      const point = geometry.cellAt({ x: stroke.last.x + (at.x - stroke.last.x) * mix, y: stroke.last.y + (at.y - stroke.last.y) * mix }, true)
      if (!point) continue
      const { x, y } = point
      const row = map[y]
      if (row[x] !== brush) map[y] = row.slice(0, x) + brush + row.slice(x + 1)
    }
    if (map.some((row, index) => row !== stroke.stage.map[index])) {
      stroke.stage = { ...stroke.stage, map }
      setPainted(stroke.stage)
    }
    stroke.last = at
  }

  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    if (busy || (event.button !== 0 && event.button !== 1)) return
    if (tool === 'pan' || event.button === 1) {
      gesture.current = { mode: 'pan', start: { x: event.clientX, y: event.clientY }, scroll: { x: scroll.current!.scrollLeft, y: scroll.current!.scrollTop } }
    } else {
      const pixel = mapPixel(event)
      const cell = geometry.cellAt(pixel, true)
      if (!cell) return
      setActiveCell(cell)
      if (tool !== 'paint' || destination) { place(cell); return }
      gesture.current = { mode: 'paint', stage, last: pixel }
      paint(pixel)
    }
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    const drag = gesture.current
    if (drag?.mode === 'paint') paint(mapPixel(event))
    if (drag?.mode === 'pan') scroll.current?.scrollTo(drag.scroll.x + drag.start.x - event.clientX, drag.scroll.y + drag.start.y - event.clientY)
  }

  function pointerEnd() {
    const drag = gesture.current
    gesture.current = null
    setPainted(undefined)
    if (drag?.mode === 'paint') commit(drag.stage)
  }

  function previewCell(point: Point, tile: string) {
    const terrain = terrains[tile as Terrain]
    const original = joTerrainId(visibleStage.map, point)
    const excluded = tile === OUTSIDE_CELL
    const colors = ['#97b06b', '#7f9c58', '#526f50', '#b1a272', '#648570', '#82a7b4']
    const color = excluded ? '#111820' : terrain ? terrainColors[terrain.appearance] : colors[(original ?? 0) % colors.length]
    const bad = issuesOpen && issues.some((issue) => same(point, issue.point))
    return <polygon key={point.x + ',' + point.y}
      points={geometry.corners(point).map(({ x, y }) => x + ',' + y).join(' ')} fill={color}
      fillOpacity={board.image && !excluded ? 0.34 : 0.94} stroke={bad ? '#ff8673' : activeCell && same(activeCell, point) ? '#f4d689' : '#172331'}
      strokeWidth={bad || same(point, activeCell) ? 3 : 1}>
      <title>{location(point)} · {excluded ? '전장 밖' : original === undefined ? terrain?.name ?? '?' : stage.jo?.terrainNames[original] ?? '원본 지형 ' + original}</title>
    </polygon>
  }

  const imageBox = geometry.image ?? { x: 0, y: 0, width: geometry.width, height: geometry.height }
  return <div className="editor">
    <header className="editor-bar">
      <div><h1>스테이지 편집기</h1><small>{entry.id.startsWith('custom:') ? '시험 전투' : entry.id === 'sandbox' || entry.id === 'jo-hex:1' ? '기존 육각 시험 전투' : (data.source === 'jo' ? '신조조전 원정' : '웹 원정') + ' ' + stage.number + '번'}{changed && ' · 편집 중'}</small></div>
      <fieldset className="editor-actions" disabled={busy}>
        <button onClick={() => void run(async () => {
          const saved = { entry, revision, viewport: viewport() }
          await draftFile('write', saved)
          setLatestDraft(saved)
          setChanged(false)
          setStatus('초안을 저장했습니다.')
        })}>초안 저장</button>
        <button disabled={!latestDraft} onClick={() => {
          if (!latestDraft || !leave()) return
          if (latestDraft.revision !== revision && !window.confirm('초안 저장 이후 프로젝트 파일이 변경되었습니다. 현재 프로젝트 버전을 기준으로 초안을 열까요?')) return
          open(latestDraft.entry, latestDraft.viewport, true)
          setStatus('초안을 불러왔습니다.')
        }}>초안 복구</button>
        <button onClick={trial}>시험 전투</button>
        <button className="primary" onClick={() => {
          if (!checkedStage()) return
          const existing = entries.some(({ id }) => id === entry.id)
          if (existing && !window.confirm('현재 스테이지의 데이터와 이미지를 프로젝트에 반영할까요?')) return
          void run(async () => {
            const result = await saveStage(entry, revision)
            setEntry(result.entry)
            setRevision(result.revision)
            setEntries((current) => existing ? current.map((item) => item.id === entry.id ? result.entry : item) : [...current, result.entry])
            setChanged(false)
            setStatus('프로젝트에 반영했습니다. 게임을 새로 열거나 새로고침하면 적용됩니다.')
          })
        }}>프로젝트에 반영</button>
      </fieldset>
    </header>
    <p className="editor-status" role="status">{status || '지도에서 작업할 도구를 선택하세요.'}</p>
    <div className="editor-body">
      <aside className="editor-sidebar" aria-label="스테이지 및 지도 설정">
        <fieldset disabled={busy}>
          <label>스테이지 목록<select value={group} onChange={(event) => setGroup(event.target.value)}>
            <option value="web">기존 웹 원정</option>{jo && <option value="jo">신조조전 원정</option>}
            <option value="trial">시험 전투</option>
          </select></label>
          <label className="sr-only" htmlFor="stage-list">열 스테이지</label>
          <select id="stage-list" size={7} value={entry.id} onChange={(event) => {
            const next = entries.find(({ id }) => id === event.target.value)
            if (next && leave()) { open(next); setStatus(next.stage.name + '을 열었습니다.') }
          }}>
            {list.map(({ id, stage }) => <option key={id} value={id}>{/^(web|jo):/.test(id) && stage.number + ' · '}{stage.name}</option>)}
          </select>
          <div className="editor-row">
            <button onClick={() => { if (leave()) open(newStage(entry.source), emptyView, true) }}>새로 만들기</button>
            <button onClick={() => copy(stage)}>복제</button>
          </div>
          <label className="file-label">JSON 가져오기<input type="file" accept=".json,application/json" aria-label="JSON 가져오기" onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file && leave()) void run(async () => { open(await importStage(file), emptyView, true); setStatus('스테이지 파일을 열었습니다.') })
          }} /></label>
          <button onClick={() => void run(async () => { await exportStage(entry); setStatus('스테이지와 배경을 JSON 파일로 내보냈습니다.') })}>JSON 내보내기</button>
        </fieldset>
        <fieldset disabled={busy}>
          <label>스테이지 이름<input value={stage.name} maxLength={80} onChange={(event) => commit({ ...stage, name: event.target.value })} /></label>
          <label className="file-label">지도 이미지 선택<input type="file" accept="image/png,image/jpeg,image/webp" aria-label="지도 이미지 선택" onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void run(async () => { commit({ ...stage, board: { ...board, ...await readImage(file) } }); setStatus(file.name + '을 열었습니다.') })
          }} /></label>
          {board.image && <button onClick={() => commit({ ...stage, board: { cellSize: board.cellSize, x: board.x, y: board.y } })}>지도 이미지 제거</button>}
          <form onSubmit={resize} key={[entry.id, stage.grid, columns, rows, board.cellSize, board.x, board.y].join(':')}>
            <label>격자 모양<select name="grid" defaultValue={stage.grid ?? 'square'}><option value="square">사각형</option><option value="hex">육각형</option></select></label>
            <div className="editor-row">
              <label>열<input name="columns" type="number" required min={1} max={MAX_GRID} defaultValue={columns} /></label>
              <label>행<input name="rows" type="number" required min={1} max={MAX_GRID} defaultValue={rows} /></label>
            </div>
            <label>칸 너비 (px)<input name="cellSize" type="number" required min={8} max={512} defaultValue={board.cellSize} /></label>
            <div className="editor-row">
              <label>격자 시작 X<input name="left" type="number" required min={-8192} max={8192} defaultValue={board.x} /></label>
              <label>격자 시작 Y<input name="top" type="number" required min={-8192} max={8192} defaultValue={board.y} /></label>
            </div>
            <button type="submit">격자 설정 적용</button>
          </form>
        </fieldset>
      </aside>
      <main className="editor-workspace">
        <fieldset className="editor-toolbar" disabled={busy} aria-label="지도 도구">
          {([['select', '선택'], ['paint', '지형 칠하기'], ['pan', '화면 이동']] as const)
            .map(([id, label]) => <button key={id} aria-pressed={tool === id} onClick={() => chooseTool(id)}>{label}</button>)}
          <button disabled={!undo.length} onClick={() => history('undo')}>실행 취소</button>
          <button disabled={!redo.length} onClick={() => history('redo')}>다시 실행</button>
          <label>확대 <input aria-label="확대" type="range" min="0.18" max="2" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
          <button onClick={() => {
            if (scroll.current) setZoom(Math.max(0.05, Math.min(2, (scroll.current.clientWidth - 32) / geometry.width, (scroll.current.clientHeight - 32) / geometry.height)))
            scroll.current?.scrollTo(0, 0)
          }}>화면 맞춤</button>
        </fieldset>
        <div className="editor-map" ref={scroll}>
          <svg ref={svg} width={geometry.width * zoom} height={geometry.height * zoom} viewBox={'0 0 ' + geometry.width + ' ' + geometry.height}
            role="img" aria-label={stage.name + ' 지도'} className={tool === 'pan' ? 'pan-map' : 'draw-map'}
            onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd}>
            {board.image && <image href={board.image} {...imageBox} preserveAspectRatio="none" />}
            {visibleStage.map.map((row, y) => [...row].map((tile, x) => previewCell({ x, y }, tile)))}
            {formation.map(({ point, label, name, kind, index }) => {
              if (point.x < 0 || point.y < 0 || point.x >= (visibleStage.map[point.y]?.length ?? 0)) return null
              const { x, y } = geometry.center(point)
              const stroke = selected?.kind === kind && selected.index === index ? '#ffe397' : '#14212a'
              return <g key={kind + index} className={'map-marker ' + kind} transform={'translate(' + x + ' ' + y + ')'}>
                {kind === 'slot' ? <circle r="18" stroke={stroke} strokeWidth="3" />
                  : <rect x="-29" y="-11" width="58" height="22" rx="6" stroke={stroke} strokeWidth="2" />}
                <text textAnchor="middle" dominantBaseline="central" textLength={label.length > 4 ? 50 : undefined}
                  lengthAdjust="spacingAndGlyphs">{label}</text>
                <title>{name}</title>
              </g>
            })}
          </svg>
        </div>
        <footer>{columns} × {rows} · {stage.grid === 'hex' ? '육각형' : '사각형'}{activeCell && ' · ' + location(activeCell)}
          {destination ? ' · 이동할 칸을 선택하세요' : tool === sheet && ' · 배치할 빈 칸을 선택하세요'}</footer>
      </main>
      <aside className="editor-sidebar" aria-label="지형과 유닛">
        <fieldset disabled={busy}>
          <label>지형 붓<select value={brush} onChange={(event) => { setBrush(event.target.value); setTool('paint'); setDestination(false) }}>
            {Object.entries(terrains).map(([symbol, { name, moveCost }]) => <option key={symbol} value={symbol}>{name}{moveCost === null && ' · 이동 제한'}</option>)}
            {stage.jo?.terrainNames.map((name, id) => <option key={id} value={joTerrainRow([id])}>{name || '지형 ' + id} · 원본</option>)}
            <option value={OUTSIDE_CELL}>전장 밖 · 제외</option>
          </select></label>
          <button onClick={() => {
            if (window.confirm('모든 칸을 선택한 지형으로 채울까요?')) commit({ ...stage, map: stage.map.map((row) => brush.repeat(row.length)) })
          }}>전체 채우기</button>
        </fieldset>
        <fieldset disabled={busy}>
          <div className="formation-tabs" role="tablist" aria-label="배치 진영">
            {sheets.map(([id, label], index) => <button key={id} type="button" role="tab" id={'formation-tab-' + id}
              aria-selected={sheet === id} aria-controls="formation-sheet" tabIndex={sheet === id ? 0 : -1}
              onClick={() => switchSheet(id)}
              onKeyDown={(event) => {
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? sheets.length - 1
                  : event.key === 'ArrowLeft' ? (index + sheets.length - 1) % sheets.length
                    : event.key === 'ArrowRight' ? (index + 1) % sheets.length : undefined
                if (next === undefined) return
                event.preventDefault()
                const [nextId] = sheets[next]
                switchSheet(nextId)
                document.getElementById('formation-tab-' + nextId)?.focus()
              }}>{label}</button>)}
          </div>
          <div className="formation-sheet" role="tabpanel" id="formation-sheet" aria-labelledby={'formation-tab-' + sheet}>
          {sheet === 'enemy' && <label>적군 전체 기본 AI<select value={stage.enemyBehavior ?? 1} onChange={(event) => commit({ ...stage, enemyBehavior: Number(event.target.value) as Stage['enemyBehavior'] })}>
            {AI_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select></label>}
          {sheet !== 'slot' && <label>배치할 장수<select value={officer[sheet]} onChange={(event) => {
            setOfficer({ ...officer, [sheet]: event.target.value })
            chooseTool('select')
          }}>
            <option value="">장수 선택</option>{choices.map(({ name }) => <option key={name}>{name}</option>)}
          </select></label>}
          <button disabled={sheet === 'slot' ? stage.deployment!.length >= FIELD_LIMIT : !officer[sheet]}
            aria-pressed={tool === sheet && !destination} onClick={() => chooseTool(tool === sheet ? 'select' : sheet)}>
            {sheet === 'slot' ? '아군 슬롯 추가' : sheet === 'guest' ? '우군 추가' : '적군 추가'}
          </button>
          <label>배치 목록<select size={6} value={selected ? selected.kind + ':' + selected.index : ''} onChange={(event) => {
            const unit = unitsInSheet.find(({ kind, index }) => kind + ':' + index === event.target.value)
            chooseTool('select')
            selectPlacement(unit)
            if (unit) { setActiveCell(unit.point); const p = geometry.center(unit.point); scroll.current?.scrollTo(p.x * zoom - scroll.current.clientWidth / 2, p.y * zoom - scroll.current.clientHeight / 2) }
          }}>
            <option value="" disabled hidden={!!unitsInSheet.length}>{unitsInSheet.length ? '배치 선택' : '배치 없음'}</option>
            {unitsInSheet.map(({ point, name, kind, index }) =>
              <option key={kind + index} value={kind + ':' + index}>{kind === 'reinforcement' ? '증원 · ' : ''}{name} · {location(point)}</option>)}
          </select></label>
          {selected && <>
            <button aria-pressed={destination} onClick={() => {
              setTool('select')
              setDestination(!destination)
            }}>선택 배치 이동</button>
            {selected.kind === 'slot' && <div className="editor-row">
              <button disabled={selected.index === 0} onClick={() => editSlot(-1)}>순서 올림</button>
              <button disabled={selected.index >= stage.deployment!.length - 1} onClick={() => editSlot(1)}>순서 내림</button>
              <button onClick={() => editSlot('delete')}>삭제</button>
            </div>}
            {activeEnemy && <>
              <p className="unit-description">{activeEnemy.name} · {roles[activeEnemy.role].name}{activeEnemy.jo && ' · ' + activeEnemy.jo.className}</p>
              <label>개별 AI<select value={activeEnemy.behavior ?? ''} onChange={(event) => setEnemy(selected.index, { behavior: event.target.value === '' ? undefined : Number(event.target.value) })}>
                <option value="">기본 AI 사용</option>{!AI_OPTIONS.some(({ value }) => value === activeEnemy.behavior) && activeEnemy.behavior !== undefined && <option value={activeEnemy.behavior}>지원하지 않는 값 · {activeEnemy.behavior}</option>}
                {AI_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select></label>
              <label>레벨 보정<input type="number" min="-50" max="49" defaultValue={activeEnemy.levelOffset === undefined || activeEnemy.levelOffset === 65535 ? 0 : activeEnemy.levelOffset < 50 ? activeEnemy.levelOffset : 50 - activeEnemy.levelOffset}
                key={selected.index + ':' + activeEnemy.levelOffset}
                onBlur={(event) => {
                  const value = event.target.valueAsNumber
                  if (Number.isInteger(value) && value >= -50 && value <= 49) {
                    const levelOffset = value < 0 ? 50 - value : value
                    if (levelOffset !== (activeEnemy.levelOffset === 65535 ? 0 : activeEnemy.levelOffset ?? 0)) setEnemy(selected.index, { levelOffset })
                  }
                }} /></label>
              {activeEnemy.jo && <div className="editor-row">
                {([{ index: 0, name: '무력' }, { index: 2, name: '지력' }, { index: 1, name: '통솔' }]).map(({ index, name }) =>
                  <label key={index}>{name} (0–50)<input type="number" min={0} max={50}
                    key={selected.index + ':' + activeEnemy.jo!.attributes[index]}
                    defaultValue={activeEnemy.jo!.attributes[index]}
                    onBlur={(event) => {
                      const value = event.target.valueAsNumber
                      const profile = activeEnemy.jo!
                      if (Number.isInteger(value) && value >= 0 && value <= 50 && value !== profile.attributes[index]) {
                        const attributes = [...profile.attributes]
                        attributes[index] = value
                        setEnemy(selected.index, { jo: { ...profile, attributes } })
                      }
                    }} /></label>)}
              </div>}
            </>}
            {selected.kind !== 'slot' && <button onClick={() => removeUnit(selected)}>
              {selected.kind === 'enemy' ? '적군 삭제' : selected.kind === 'guest' ? '우군 삭제' : '증원 삭제'}
            </button>}
          </>}
          </div>
        </fieldset>
        <fieldset disabled={busy}>
          <button onClick={() => { setIssuesOpen(true); if (issues[0]) focusIssue(issues[0]); else setStatus('배치와 지형에 오류가 없습니다.') }}>검증 실행</button>
          {issuesOpen && (issues.length ? <ul className="editor-errors">{issues.map((issue, index) =>
            <li key={index}><button onClick={() => focusIssue(issue)}>{issue.message}{issue.point && ' · ' + location(issue.point)}</button></li>)}</ul> : <p>오류 없음</p>)}
        </fieldset>
      </aside>
    </div>
  </div>
}

function StageEditor() {
  const [loaded, setLoaded] = useState<Parameters<typeof Editor>[0]>()
  const [error, setError] = useState('')
  useEffect(() => {
    void Promise.all([loadStageSources(), loadStageCatalog(), draftFile('read').catch(() => undefined)]).then(([sources, catalog, draft]) => {
      const entries = stageEntries(sources.web, sources.jo, catalog.entries)
      const initial = entries.find(({ id }) => id === 'web:1')!
      setLoaded({ ...sources, initial: { ...initial, stage: originalForEditing(initial.stage) }, catalog: entries, revision: catalog.revision, draft })
    }).catch((error) => setError(errorMessage(error)))
  }, [])
  return loaded ? <Editor {...loaded} /> : <main className="editor-loading" role={error ? 'alert' : 'status'}>{error || '스테이지 목록을 읽는 중…'}</main>
}

createRoot(document.getElementById('root')!).render(<StageEditor />)
