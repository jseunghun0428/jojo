import { useContext, useEffect, useReducer, useState } from 'react'
import type { CSSProperties, Dispatch } from 'react'
import BattleMap from './BattleMap.tsx'
import { LocalGraphicsContext, useLocalGraphics } from './local-graphics.ts'
import { officerAttributes, officerStatLabels } from './officer-attributes.ts'
import { campaignReducer, draftCost, loadCampaign, saveCampaign } from './campaign.ts'
import type { Action, Campaign } from './campaign.ts'
import { FIRE_COST, attackCells, canAttack, forecastAttack, key, movementPath, movesFor, terrainAt, terrainNames, unitAt } from './combat.ts'
import type { Battle, BattleAction, Unit } from './combat.ts'
import { DRAFT_LIMIT, FIELD_LIMIT, HEIGHT, STAGE_COUNT, WIDTH, items, officerById, roles, stages, starterIds, statLabels, treasureById } from './data.ts'
import type { ItemId, Point, Role } from './data.ts'

type ScreenProps = { state: Campaign; dispatch: Dispatch<Action> }
const itemIds = Object.keys(items) as ItemId[]
const stageNumber = (stage: number) => String(stage).padStart(2, '0')

function RoleIcon({ role, name }: { role: Role; name: string }) {
  const portrait = useContext(LocalGraphicsContext)?.portraits[name]
  const [failed, setFailed] = useState<string>()
  if (portrait && portrait !== failed) {
    return <img className="role-icon officer-portrait" src={portrait} alt="" onError={() => setFailed(portrait)} />
  }
  return <span aria-hidden="true" className={`role-icon ${role}`}>{roles[role].symbol}</span>
}

function OfficerAttributes({ name }: { name: string }) {
  const attributes = officerAttributes[name]
  if (!attributes) return null

  return <small className="officer-attributes">
    {attributes.map((value, index) => <span key={officerStatLabels[index]}>{officerStatLabels[index]} {value}</span>)}
  </small>
}

function Draft({ state, dispatch }: ScreenProps) {
  const cost = draftCost(state.roster)
  return <div className="split draft-layout">
    <section className="panel draft-panel">
      <div className="panel-heading">
        <div><h2>최초 장수 편성</h2><p>장수를 고르고 총대장을 지정하세요.</p></div>
        <strong className="counter">코스트 <b>{cost}</b> / {DRAFT_LIMIT}</strong>
      </div>
      <div className="draft-grid">
        {starterIds.map((id) => {
          const officer = officerById[id]
          const active = state.roster.includes(id)
          const captain = state.captain === id
          return <article className={`officer-card ${active ? 'chosen' : ''}`} key={id}>
            <button className="officer-select" aria-pressed={active} disabled={!active && cost + officer.cost > DRAFT_LIMIT}
              onClick={() => dispatch({ type: 'draft', id })}>
              <RoleIcon role={officer.role} name={officer.name} />
              <span><strong>{officer.name}</strong><small>{roles[officer.role].name}</small><OfficerAttributes name={officer.name} /></span>
              <span className="officer-cost" aria-label={`코스트 ${officer.cost}`}>{officer.cost}</span>
            </button>
            {active && <button className="captain-choice" disabled={captain} onClick={() => dispatch({ type: 'captain', id })}>
              {captain ? '◆ 총대장' : '총대장 지정'}
            </button>}
          </article>
        })}
      </div>
      <div className="draft-footer">
        <button className="secondary" onClick={() => dispatch({ type: 'recommended' })}>추천 편성</button>
        <button className="primary" disabled={!state.captain} onClick={() => dispatch({ type: 'deploy' })}>첫 전투 출전 <span aria-hidden="true">→</span></button>
      </div>
    </section>
    <section className="panel preview-panel">
      <div className="panel-heading"><div><span className="eyebrow">전장 {stageNumber(1)}</span><h2>{stages[0].name}</h2></div><span className="tag">전장 미리보기</span></div>
      <BattleMap map={stages[0].map} />
      <div className="preview-notes">
        <p><strong>승리</strong> 적군을 모두 격파하세요.</p>
        <p><strong>패배</strong> 총대장이 쓰러지면 같은 전장에 재도전합니다.</p>
      </div>
    </section>
  </div>
}

function UnitDetails({ unit, map }: { unit: Unit; map: readonly string[] }) {
  return <div className="unit-details">
    <div className="unit-header"><RoleIcon role={unit.role} name={unit.name} /><div><strong>{unit.name}</strong><small>{unit.captain ? '총대장 · ' : ''}{roles[unit.role].name} · {terrainNames[terrainAt(map, unit)!]}</small></div></div>
    <div className="meter"><span>HP</span><meter min={0} max={unit.hp} value={unit.currentHP} /><b>{unit.currentHP}/{unit.hp}</b></div>
    {unit.mp > 0 && <div className="meter mp"><span>MP</span><meter min={0} max={unit.mp} value={unit.currentMP} /><b>{unit.currentMP}/{unit.mp}</b></div>}
    <OfficerAttributes name={unit.name} />
    <p className="unit-stats">공격 {unit.attack} · 방어 {unit.defense} · 이동 {unit.move} · 사거리 {unit.range}</p>
  </div>
}

type CommandMode = 'attack' | 'tactics' | 'fire' | 'items' | null

function BattleScreen({ state, dispatch }: ScreenProps) {
  const resolved = state.battle!
  const [beforeAction, setBeforeAction] = useState<Battle | null>(null)
  const events = beforeAction && resolved !== beforeAction ? resolved.events : undefined
  const animating = !!events?.length
  const battle = animating && beforeAction ? beforeAction : resolved
  const stage = stages[state.stage - 1]
  const [selectedId, select] = useState('')
  const [mode, setMode] = useState<CommandMode>(null)
  const [inspected, inspect] = useState<Point | null>(null)
  const [hovered, setHovered] = useState<Point | null>(null)
  const [showLog, setShowLog] = useState(false)
  const pendingMove = battle.pendingMove
  const focusedId = pendingMove?.unit ?? selectedId
  const allies = battle.units.filter((unit) => unit.side === 'ally' && unit.currentHP > 0)
  const enemies = battle.units.filter((unit) => unit.side === 'enemy' && unit.currentHP > 0)
  const selected = battle.units.find((unit) => unit.id === focusedId && unit.currentHP > 0)
  const active = selected?.side === 'ally' && !selected.done && !battle.result && !animating ? selected : null
  const moveCells = active && !active.moved ? movesFor(battle, active) : []
  const moves = new Set(moveCells.map(key))
  const path = hovered && moves.has(key(hovered)) ? movementPath(moveCells, hovered) : []
  const attacks = active?.moved ? enemies.filter((unit) => canAttack(active, unit)) : []
  const spells = active?.moved ? enemies.filter((unit) => canAttack(active, unit, true)) : []
  const range = new Set(active?.moved ? attackCells(active, mode === 'fire').map(key) : [])
  const targets = new Set((mode === 'fire' ? spells : attacks).map(({ id }) => id))
  const ownedItems = itemIds.filter((id) => state.inventory[id] > 0)
  const tile = hovered ?? inspected ?? selected
  const terrain = tile && terrainAt(battle.map, tile)
  const ready = allies.filter(({ done }) => !done).length
  const targeting = mode === 'attack' || mode === 'fire'
  const target = targeting && tile ? unitAt(battle, tile) : undefined
  const forecast = active && target && targets.has(target.id)
    ? forecastAttack(battle, active, target, mode === 'fire' ? 'fire' : 'attack') : null

  function choose(id: string) {
    select(id)
    inspect(null)
    setMode(null)
  }

  function cancelMove(nextId = focusedId) {
    if (!pendingMove || animating) return
    dispatch({ type: 'battle', action: { type: 'cancel-move', unit: pendingMove.unit } })
    choose(nextId)
  }

  function cancel() {
    if (mode === 'fire') setMode('tactics')
    else if (mode) setMode(null)
    else if (pendingMove) cancelMove()
    else choose('')
  }

  function playAction(action: BattleAction) {
    if (animating) return
    setBeforeAction(resolved)
    dispatch({ type: 'battle', action, seed: Math.floor(Math.random() * 2 ** 32) })
  }

  function onCell(point: Point) {
    const unit = unitAt(battle, point)
    if (pendingMove && unit?.side === 'ally' && unit.id !== pendingMove.unit) {
      cancelMove(unit.id)
      return
    }
    if (targeting) {
      if (!active || !unit || !targets.has(unit.id)) return
      playAction({ type: mode === 'fire' ? 'fire' : 'attack', unit: active.id, target: unit.id })
      setMode(null)
      return
    }
    if (pendingMove) return
    if (active && !active.moved && (unit?.id === active.id || moves.has(key(point)))) {
      playAction({ type: 'move', unit: active.id, to: point })
      inspect(null)
    } else if (unit) {
      choose(unit.id)
    } else {
      inspect(point)
    }
  }

  const commandHint = animating ? '전투 진행 중…'
    : mode === 'attack' ? '공격 범위 안의 적을 선택하세요.'
    : mode === 'fire' ? '화계 범위 안의 적을 선택하세요.'
    : mode === 'tactics' ? '사용할 책략을 고르세요.'
    : mode === 'items' ? '사용할 도구를 고르세요.'
    : pendingMove ? '명령을 선택하세요. 다른 아군을 선택하면 이동이 취소됩니다.'
    : active?.moved ? '장수의 명령을 선택하세요.'
    : active ? '파란 칸으로 이동하세요. 제자리에서 행동하려면 장수를 다시 선택하세요.'
    : selected?.done ? '이 장수는 이번 턴의 행동을 마쳤습니다.'
    : '지도에서 장수를 선택하세요.'

  return <section className="battle-window" aria-label="전투" onKeyDown={(event) => {
    if (event.key === 'Escape' && !battle.result && !animating) {
      event.preventDefault()
      cancel()
    }
  }}>
    <header className="battle-titlebar">
      <span className="battle-window-icon" aria-hidden="true">鐵</span>
      <h1>{stage.name}</h1>
      <span className="battle-stage">전장 {stageNumber(state.stage)} / {STAGE_COUNT}</span>
    </header>
    <div className="battle-toolbar">
      <div className="battle-tools">
        <button className="classic-button" disabled={!!battle.result || animating || !!pendingMove} onClick={() => {
          choose('')
          playAction({ type: 'end' })
        }}>아군 턴 종료</button>
        <button className="classic-button" aria-pressed={showLog} onClick={() => setShowLog(!showLog)}>전투 기록</button>
      </div>
      <div className="battle-counts">
        <span>{battle.round}턴 · {battle.result ? '전투 종료' : animating && !selectedId ? '적군 차례' : '아군 차례'}</span>
        <span>아군 {allies.length} / 적군 {enemies.length}</span>
      </div>
    </div>
    <div className="battle-board">
      <BattleMap map={battle.map} units={battle.units} selected={focusedId} moves={moves} range={range} path={path} targets={targets}
        events={events}
        onPlaybackEnd={() => setBeforeAction(null)}
        onCell={battle.result || animating ? undefined : onCell}
        onHover={(point) => setHovered((last) => last?.x === point?.x && last?.y === point?.y ? last : point)}
        focusOnTarget={targeting} />
      {active?.moved && !targeting && <div
        className="field-menu"
        data-left={active.x >= WIDTH / 2}
        data-up={active.y >= HEIGHT / 2}
        style={{ '--column': active.x, '--row': active.y, '--columns': WIDTH, '--rows': HEIGHT } as CSSProperties}
        role="group"
        aria-label={mode === 'items' ? '도구' : mode === 'tactics' ? '책략' : `${active.name} 명령`}
      >
        <strong>{mode === 'items' ? '도구' : mode === 'tactics' ? '책략' : active.name}</strong>
        {mode === 'items' ? <>
          {ownedItems.length === 0 && <span className="field-menu-note">보유 도구 없음</span>}
          {ownedItems.map((id) => <button key={id} title={items[id].detail}
            disabled={id === 'salve' ? active.currentHP === active.hp : active.currentMP === active.mp}
            onClick={() => {
              dispatch({ type: 'battle', action: { type: 'item', unit: active.id, item: id } })
              setMode(null)
            }}>{items[id].name} ×{state.inventory[id]}</button>)}
          <button onClick={cancel}>돌아가기</button>
        </> : mode === 'tactics' ? <>
          <button disabled={!spells.length} onClick={() => setMode('fire')}>화계 · MP {FIRE_COST}</button>
          <button onClick={cancel}>돌아가기</button>
        </> : <>
          <button disabled={!attacks.length} onClick={() => setMode('attack')}>공격</button>
          <button disabled={active.role !== 'sage'} onClick={() => setMode('tactics')}>책략</button>
          <button onClick={() => setMode('items')}>도구</button>
          <button onClick={() => dispatch({ type: 'battle', action: { type: 'wait', unit: active.id } })}>대기</button>
          {pendingMove && <button onClick={() => cancelMove()}>이동 취소</button>}
        </>}
      </div>}
      {battle.result && <div className="result-overlay">
        <div className="result-card" role="status">
          <span>{stage.name}</span>
          <h2>{battle.result === 'win' ? '승리' : '패배'}</h2>
          <p>{battle.result === 'win' ? `적군 전멸 · 보상 ${stage.reward} G` : '총대장이 쓰러졌습니다.'}</p>
          {battle.result === 'win'
            ? <button className="classic-button" onClick={() => dispatch({ type: 'collect', rolls: Array.from({ length: 10 }, () => Math.random()) })}>보상 받고 상점으로</button>
            : <button className="classic-button" onClick={() => { choose(''); dispatch({ type: 'retry' }) }}>같은 전장 재도전</button>}
        </div>
      </div>}
    </div>
    <div className="battle-status">
      {selected ? <UnitDetails unit={selected} map={battle.map} /> : <div className="battle-objective"><strong>승리 조건</strong><span>적군 전멸</span><strong>패배 조건</strong><span>총대장 전사</span></div>}
      <div className="terrain-status">
        <strong>지형 {terrain ? terrainNames[terrain] : '—'}</strong>
        {forecast && target && <span>{target.name} · 예상 피해 {forecast.damage} · 명중 {forecast.hit}%{forecast.counter ? ' · 반격 가능' : ''}</span>}
        {terrain === 'f' && <span>이동 비용 2 · 방어 +2</span>}
        {(terrain === 'w' || terrain === 'm') && <span>통과 불가</span>}
        {(terrain === '.' || terrain === '=') && <span>이동 비용 1</span>}
      </div>
    </div>
    <footer className="battle-footer">
      <span role="status">{battle.result ? battle.log.at(-1) : commandHint}</span>
      {mode && !battle.result && <button className="classic-button" onClick={cancel}>명령 취소</button>}
      {mode && pendingMove && <button className="classic-button" onClick={() => cancelMove()}>이동 취소</button>}
      <span className="battle-ready">행동 가능 {ready}명</span>
    </footer>
    {showLog && <section className="battle-history" aria-label="전투 기록">
      <ol>{[...battle.log].reverse().map((line, index) => <li key={index}>{line}</li>)}</ol>
    </section>}
  </section>
}

function Camp({ state, dispatch }: ScreenProps) {
  const [tab, setTab] = useState<'shop' | 'lineup'>('shop')
  const atEnd = state.stage === STAGE_COUNT
  return <div className="panel camp-panel">
    <div className="panel-heading camp-heading">
      <div><span className="eyebrow">전장 {stageNumber(state.stage)} 승리</span><h2>야영지</h2>
        <p>{atEnd ? '철령 관문을 돌파했습니다.' : `다음 전장 · ${stageNumber(state.stage + 1)} ${stages[state.stage].name}`}</p>
      </div>
      <button className="primary" onClick={() => dispatch({ type: 'deploy' })}>{atEnd ? '원정 마치기' : '다음 전장 출전'} →</button>
    </div>
    <div className="camp-tabs" role="group" aria-label="야영지 메뉴">
      <button aria-pressed={tab === 'shop'} onClick={() => setTab('shop')}>대기 상점</button>
      <button aria-pressed={tab === 'lineup'} onClick={() => setTab('lineup')}>출전 편성 · {state.lineup.length}/{FIELD_LIMIT}</button>
    </div>
    {tab === 'shop' ? <div className="shop-grid">
      <section className="shop-group">
        <h3>장수 영입 <span>{state.offers.officers.length}명</span></h3>
        {state.offers.officers.length === 0 && <p className="muted">이번 상점의 영입을 모두 마쳤습니다.</p>}
        {state.offers.officers.map((id) => {
          const officer = officerById[id]
          return <div className="shop-row" key={id}><RoleIcon role={officer.role} name={officer.name} />
            <div><strong>{officer.name}</strong><small>{roles[officer.role].name}{officer.bonus > 0 && ` · 공격 +${officer.bonus}`}</small><OfficerAttributes name={officer.name} /></div>
            <button className="secondary" aria-label={`${officer.name} 영입 ${officer.price} G`} disabled={state.gold < officer.price} onClick={() => dispatch({ type: 'buy', kind: 'officers', id })}>{officer.price} G</button>
          </div>
        })}
      </section>
      <section className="shop-group">
        <h3>보물 <span>{state.offers.treasures.length}개</span></h3>
        {state.offers.treasures.length === 0 && <p className="muted">이번 상점의 보물을 모두 구매했습니다.</p>}
        {state.offers.treasures.map((id) => {
          const treasure = treasureById[id]
          return <div className="shop-row" key={id}><span className="role-icon relic" aria-hidden="true">✦</span>
            <div><strong>{treasure.name}</strong><small>{statLabels[treasure.stat]} +{treasure.amount}</small></div>
            <button className="secondary" aria-label={`${treasure.name} 구매 ${treasure.price} G`} disabled={state.gold < treasure.price} onClick={() => dispatch({ type: 'buy', kind: 'treasures', id })}>{treasure.price} G</button>
          </div>
        })}
      </section>
      <section className="shop-group">
        <h3>회복 아이템</h3>
        {itemIds.map((id) => <div className="shop-row" key={id}>
          <span className="role-icon medicine" aria-hidden="true">✚</span>
          <div><strong>{items[id].name}</strong><small>{items[id].detail} · 보유 {state.inventory[id]}</small></div>
          <button className="secondary" aria-label={`${items[id].name} 구매 ${items[id].price} G`} disabled={state.gold < items[id].price}
            onClick={() => dispatch({ type: 'buy', kind: 'items', id })}>{items[id].price} G</button>
        </div>)}
        <p className="muted">회복 아이템은 전투 중 장수의 행동으로 사용합니다.</p>
      </section>
    </div> : <section className="lineup-panel">
      <p className="muted">보유 {state.roster.length}명 · 최대 {FIELD_LIMIT}명 출전 · 총대장 필수 출전</p>
      {state.roster.map((id) => {
        const officer = officerById[id]
        const captain = state.captain === id
        const deployed = state.lineup.includes(id)
        const available = state.treasures.filter((treasure) => state.equipment[id] === treasure || !Object.values(state.equipment).includes(treasure))
        return <div className="lineup-row" key={id}>
          <div className="unit-header"><RoleIcon role={officer.role} name={officer.name} /><div><strong>{officer.name}</strong><small>{roles[officer.role].name}</small><OfficerAttributes name={officer.name} /></div></div>
          <label><input type="checkbox" checked={deployed} disabled={captain || (!deployed && state.lineup.length >= FIELD_LIMIT)} onChange={() => dispatch({ type: 'lineup', id })} /> 출전</label>
          <button className="secondary" disabled={captain || (!deployed && state.lineup.length >= FIELD_LIMIT)} onClick={() => dispatch({ type: 'captain', id })}>{captain ? '◆ 총대장' : '총대장 지정'}</button>
          <select aria-label={`${officer.name} 보물 장착`} value={state.equipment[id] ?? ''} onChange={(event) => dispatch({ type: 'equip', officer: id, treasure: event.target.value })}>
            <option value="">보물 장착 안 함</option>
            {available.map((treasure) => <option value={treasure} key={treasure}>{treasureById[treasure].name}</option>)}
          </select>
        </div>
      })}
    </section>}
  </div>
}

export default function App() {
  const localGraphics = useLocalGraphics()
  const [state, dispatch] = useReducer(campaignReducer, undefined, loadCampaign)
  useEffect(() => saveCampaign(state), [state])
  const screen = { state, dispatch }
  const heading = state.phase === 'draft' ? '첫 원정을 준비하세요' : state.phase === 'camp' ? '다음 전투를 준비하세요' : '원정 완료'
  return <LocalGraphicsContext.Provider value={localGraphics}>
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand"><span className="seal" aria-hidden="true">鐵</span><strong>철령전기</strong></div>
        <div className="header-meta"><span className="gold"><span aria-hidden="true">◈</span> {state.gold} G</span>
          {(state.phase !== 'draft' || state.roster.length > 0) && <button className="text-button" onClick={() => {
            if (window.confirm('저장된 진행을 지우고 새 원정을 시작할까요?')) dispatch({ type: 'reset' })
          }}>새 게임</button>}</div>
      </div>
    </header>
    <main className={state.phase === 'battle' ? 'battle-main' : undefined}>
      {state.phase !== 'battle' && <div className="page-heading"><h1>{heading}</h1>{state.phase === 'draft' && <p>장수들과 함께 갈대 나루에서 철령 관문까지 진군하세요.</p>}</div>}
      {state.phase === 'draft' && <Draft {...screen} />}
      {state.phase === 'battle' && <BattleScreen key={state.stage} {...screen} />}
      {state.phase === 'camp' && <Camp {...screen} />}
      {state.phase === 'complete' && <section className="panel complete">
        <span className="seal" aria-hidden="true">勝</span>
        <h2>철령 관문 돌파</h2>
        <p>{STAGE_COUNT}개 전장을 모두 클리어했습니다.</p>
        <p>보유 장수 {state.roster.length}명 · 보물 {state.treasures.length}개 · {state.gold} G</p>
      </section>}
    </main>
  </LocalGraphicsContext.Provider>
}
