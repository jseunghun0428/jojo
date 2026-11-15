import { warArtWill, warArts } from './war-arts.ts'
import type { WarArtId } from './war-arts.ts'
import { useContext, useEffect, useReducer, useRef, useState } from 'react'
import type { CSSProperties, Dispatch } from 'react'
import BattleMap from './BattleMap.tsx'
import { LocalGraphicsContext, useLocalGraphics } from './local-graphics.ts'
import { officerStatLabels } from './officer-attributes.ts'
import { fieldLimitFor, joTerrainId, loadJoCampaign, webCampaign } from './jo-game.ts'
import type { CampaignData, JoProfile } from './jo-game.ts'
import { roles, troopClasses, troopClassFor } from './unit-classes.ts'
import type { Role, TroopClass } from './unit-classes.ts'
import { awardExperience, campaignReducer, draftCost, loadCampaign, saveCampaign } from './campaign.ts'
import type { Action, Campaign } from './campaign.ts'
import { FIRE_COST, attackCells, attributesOf, canAttack, controlStatus, forecastAttack, hasTactics, isSoldier, key, movementCost, movementLimit, movementPath, movesFor, physicalStats, strategyPreviews, terrainAt, unitAt, warArtArea, warArtCells, warArtEffect, warArtsFor } from './combat.ts'
import type { Battle, BattleAction, Unit } from './combat.ts'
import { DRAFT_LIMIT, FIELD_LIMIT, STAGE_COUNT, TROOP_SCALE, items, officerById, starterIds, statLabels, terrains, treasureById } from './data.ts'
import type { ItemId, Point } from './data.ts'

type ScreenProps = { state: Campaign; dispatch: Dispatch<Action>; data: CampaignData }
function ClassLabel({ role, jo, troopClass }: { role: Role; jo?: JoProfile; troopClass?: TroopClass }) {
  const kind = troopClass ?? troopClassFor(role, jo?.classId)
  return <>{kind ? troopClasses[kind] : '분류 보류'}</>
}
const itemIds = Object.keys(items) as ItemId[]
const stageNumber = (stage: number) => String(stage).padStart(2, '0')

function RoleIcon({ role, name }: { role: Role; name: string }) {
  const portrait = useContext(LocalGraphicsContext)?.portraits[name]
  const [failed, setFailed] = useState<string>()
  if (portrait && portrait !== failed) {
    return <img className="role-icon officer-portrait" src={portrait} alt="" onError={() => setFailed(portrait)} />
  }
  return <span aria-hidden="true" className={`role-icon ${roles[role].sprite}`}>{roles[role].symbol}</span>
}

function OfficerAttributes({ name, jo, soldier }: { name: string; jo?: JoProfile; soldier?: boolean }) {
  const attributes = attributesOf({ name, jo, soldier })

  return <small className="officer-attributes">
    {attributes.map((value, index) => <span key={officerStatLabels[index]}>{officerStatLabels[index]} {value}</span>)}
  </small>
}

function TroopFilter({ value, onChange }: { value: TroopClass | ''; onChange: (value: TroopClass | '') => void }) {
  return <select aria-label="병종 필터" value={value} onChange={(event) => onChange(event.target.value as TroopClass | '')}>
    <option value="">전체 병종</option>
    {Object.entries(troopClasses).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
  </select>
}

function Draft({ state, dispatch, data }: ScreenProps) {
  const [troopFilter, setTroopFilter] = useState<TroopClass | ''>('')
  const cost = draftCost(state.roster)
  return <section className="panel draft-panel">
      <div className="panel-heading">
        <div><h1>최초 장수 편성</h1><p>장수를 고르고 총대장을 지정하세요.</p></div>
        <strong className="counter">코스트 <b>{cost}</b> / {DRAFT_LIMIT}</strong>
      </div>
      <TroopFilter value={troopFilter} onChange={setTroopFilter} />
      <div className="draft-grid">
        {starterIds.filter((id) => !troopFilter || troopClassFor(officerById[id].role, data.officers[id]?.classId) === troopFilter).map((id) => {
          const officer = officerById[id]
          const active = state.roster.includes(id)
          const captain = state.captain === id
          return <article className={`officer-card ${active ? 'chosen' : ''}`} key={id}>
            <button className="officer-select" aria-pressed={active} disabled={!active && cost + officer.cost > DRAFT_LIMIT}
              onClick={() => dispatch({ type: 'draft', id })}>
              <RoleIcon role={officer.role} name={officer.name} />
              <span><strong>{officer.name}</strong><small><ClassLabel role={officer.role} jo={data.officers[id]} /></small><OfficerAttributes name={officer.name} jo={data.officers[id]} /></span>
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
        <button className="primary" disabled={!state.captain} onClick={() => dispatch({ type: 'confirmDraft' })}>편성 완료</button>
      </div>
  </section>
}

function TroopClassSelect({ id, state, dispatch, data }: ScreenProps & { id: string }) {
  const officer = officerById[id]
  const selected = state.troopClasses?.[id] ?? troopClassFor(officer.role, data.officers[id]?.classId)
  return <select aria-label={`${officer.name} 병종 변경`} value={selected} onChange={(event) =>
    dispatch({ type: 'changeTroopClass', id, troopClass: event.target.value as TroopClass })}>
    {selected === 'siege' && <option value="siege" disabled>{troopClasses.siege}</option>}
    {Object.entries(troopClasses).filter(([value]) => value !== 'siege')
      .map(([value, name]) => <option key={value} value={value}>{name}</option>)}
  </select>
}

function FirstBattleLobby({ state, dispatch, data }: ScreenProps) {
  const stage = data.stages[0]
  return <div className="split draft-layout">
    <section className="shop-group">
      <h3>확정된 최초 편성</h3>
      {state.lineup.map((id) => {
        const officer = officerById[id]
        return <div className="shop-row" key={id}>
          <RoleIcon role={officer.role} name={officer.name} />
          <div><strong>{officer.name}</strong><br /><TroopClassSelect {...{ id, state, dispatch, data }} /></div>
          {id === state.captain && <span className="tag">총대장</span>}
        </div>
      })}
    </section>
    <section className="panel preview-panel">
      <div className="panel-heading"><div><span className="eyebrow">전장 {stageNumber(1)}</span><h2>{stage.name}</h2></div><span className="tag">전장 미리보기</span></div>
      <BattleMap map={stage.map} image={stage.jo?.image} />
      {stage.jo && <p>이 전장의 출전 인원은 총대장을 포함해 최대 {fieldLimitFor(stage)}명입니다.</p>}
      <div className="preview-notes">
        <p><strong>승리</strong> {stage.jo?.objectives ? `${stage.jo.objectives.join('·')}을 격파하세요.` : '적군을 모두 격파하세요.'}</p>
        <p><strong>패배</strong> 총대장이 쓰러지면 같은 전장에 재도전합니다.</p>
      </div>
    </section>
  </div>
}

function attackRangeLabel(unit: Unit) {
  const kind = unit.troopClass ?? troopClassFor(unit.role, unit.jo?.classId)
  if (kind === 'ranged') return '주변 2칸 (바깥 모서리 제외)'
  if (kind === 'infantry' || kind === 'cavalry') return '인접 8방향'
  return unit.jo?.pattern === 'all' ? '전장 전체' : unit.range
}

function UnitDetails({ unit, map, terrainNames }: { unit: Unit; map: readonly string[]; terrainNames?: string[] }) {
  const status = controlStatus(unit)
  const { level, attack, defense, terrainPercent } = physicalStats(map, unit)
  const terrain = terrainAt(map, unit)
  const terrainId = joTerrainId(map, unit)
  const terrainName = terrainId === undefined ? terrain && terrains[terrain].name : terrainNames?.[terrainId]
  return <div className="unit-details">
    <div className="unit-header"><RoleIcon role={unit.role} name={unit.name} /><div><strong>{unit.name}</strong><small>{unit.captain ? '총대장 · ' : unit.guest ? '우군 · ' : ''}<ClassLabel role={unit.role} jo={unit.jo} troopClass={unit.troopClass} />{terrainName && ` · ${terrainName}`}</small></div></div>
    <div className="meter"><span>병력</span><meter min={0} max={unit.hp} value={unit.currentHP} /><b>{unit.currentHP}/{unit.hp}</b></div>
    {unit.mp > 0 && <div className="meter mp"><span>의지</span><meter min={0} max={unit.mp} value={unit.currentMP} /><b>{unit.currentMP}/{unit.mp}</b></div>}
    <OfficerAttributes name={unit.name} jo={unit.jo} soldier={isSoldier(unit)} />
    {status && <p className="unit-stats">상태 · {status}</p>}
    <p className="unit-stats">레벨 {level} · 공격 {attack} · 방어 {defense} · 지형 {terrainPercent}%</p>
    <p className="unit-stats">이동 {movementLimit(unit)} · 사거리 {attackRangeLabel(unit)}</p>
  </div>
}

type CommandMode = 'attack' | 'tactics' | 'fire' | 'items' | 'warArts' | null

function BattleScreen({ state, dispatch, data }: ScreenProps) {
  const resolved = state.battle!
  const earnedExperience = Object.entries(resolved.experience?.earned ?? {})
  const [beforeAction, setBeforeAction] = useState<Battle | null>(null)
  const [enemyPlayback, setEnemyPlayback] = useState(0)
  const [turnTransition, setTurnTransition] = useState<'enemy-banner' | 'enemy' | 'ally-banner' | null>(null)
  const events = beforeAction && resolved !== beforeAction ? resolved.events : undefined
  const playing = !!events?.length
  const animating = playing || turnTransition !== null
  const battle = playing && beforeAction ? beforeAction : resolved
  useEffect(() => {
    if (turnTransition === 'enemy' && beforeAction && resolved !== beforeAction && !playing) {
      setBeforeAction(null)
      setTurnTransition(resolved.result ? null : 'ally-banner')
      return
    }
    if (turnTransition !== 'enemy-banner' && turnTransition !== 'ally-banner') return
    const timer = window.setTimeout(() => {
      if (turnTransition === 'ally-banner') {
        setTurnTransition(null)
      } else {
        setBeforeAction(resolved)
        setTurnTransition('enemy')
        dispatch({ type: 'battle', action: { type: 'end' }, seed: Math.floor(Math.random() * 2 ** 32) })
      }
    }, 900)
    return () => window.clearTimeout(timer)
  }, [turnTransition, beforeAction, resolved, playing, dispatch])
  const stage = data.stages[state.stage - 1]
  const width = battle.map[0].length
  const height = battle.map.length
  const [selectedId, select] = useState('')
  const [selectedArt, setSelectedArt] = useState<WarArtId | null>(null)
  const [mode, setMode] = useState<CommandMode>(null)
  const [inspected, inspect] = useState<Point | null>(null)
  const [hovered, setHovered] = useState<Point | null>(null)
  const [showLog, setShowLog] = useState(false)
  const pendingMove = battle.pendingMove
  const focusedId = pendingMove?.unit ?? selectedId
  const allies = battle.units.filter((unit) => unit.side === 'ally' && unit.currentHP > 0)
  const enemies = battle.units.filter((unit) => unit.side === 'enemy' && unit.currentHP > 0)
  const selected = battle.units.find((unit) => unit.id === focusedId && unit.currentHP > 0)
  const active = selected?.side === 'ally' && !selected.guest && !selected.done && !battle.result && !animating ? selected : null
  const moveCells = active && !active.moved ? movesFor(battle, active, true) : []
  const moves = new Set(moveCells.filter(({ occupied }) => !occupied).map(key))
  const path = hovered && moves.has(key(hovered)) ? movementPath(moveCells, hovered) : []
  const attacks = active?.moved ? enemies.filter((unit) => canAttack(active, unit)) : []
  const spells = active?.moved ? enemies.filter((unit) => canAttack(active, unit, true)) : []
  const learnedArts = active?.moved ? warArtsFor(active).map((art) => {
    const used = active.usedWarArts?.includes(art.id)
    const available = warArtCells(battle, active, art.id).some((point) => {
      const target = unitAt(battle, point)
      return target && warArtEffect(active, target, art.id)
    })
    return { ...art, used, available }
  }) : []
  const artRange = active && selectedArt ? new Set(warArtCells(battle, active, selectedArt).map(key)) : null
  const range = artRange ?? new Set(active?.moved ? attackCells(active, mode === 'fire', battle.map).map(key) : [])
  const targets = new Set((artRange && active && selectedArt ? battle.units.filter((unit) => artRange.has(key(unit)) && warArtEffect(active, unit, selectedArt)) : mode === 'fire' ? spells : attacks).map(({ id }) => id))
  const ownedItems = itemIds.filter((id) => state.inventory[id] > 0)
  const tile = hovered ?? inspected ?? selected
  const terrainCode = tile && terrainAt(battle.map, tile)
  const terrainId = tile && joTerrainId(battle.map, tile)
  const terrainName = typeof terrainId === 'number' ? stage.jo?.terrainNames[terrainId] : terrainCode && terrains[terrainCode].name
  const moveCost = tile && movementCost(battle.map, tile, selected)
  const ready = allies.filter(({ done, guest }) => !done && !guest).length
  const turnPrompt = useRef<HTMLDialogElement>(null)
  const promptedRound = useRef<number | null>(null)
  const guestPhase = enemyPlayback === 0 && battle.units.some((unit) => unit.guest && unit.currentHP > 0)
  const canEndTurn = !battle.result && !animating && !pendingMove

  useEffect(() => {
    if (!canEndTurn || ready !== 0 || promptedRound.current === battle.round) return
    const dialog = turnPrompt.current
    if (!dialog) return
    promptedRound.current = battle.round
    dialog.showModal()
  }, [battle.round, canEndTurn, ready])
  const objective = battle.objectives ? `${battle.objectives.join('·')} 격파` : '적군 전멸'
  const targeting = !!selectedArt || mode === 'attack' || mode === 'fire'
  const target = targeting && tile ? unitAt(battle, tile) : undefined
  const affected = active && selectedArt && target && targets.has(target.id)
    ? new Set(warArtArea(battle, active, selectedArt, target).map(key)) : undefined
  const support = active && selectedArt && target && targets.has(target.id) ? warArtEffect(active, target, selectedArt) : null
  const strategy = active && selectedArt && target ? strategyPreviews(battle, active, selectedArt, target) : []
  const forecast = !selectedArt && active && target && targets.has(target.id)
    ? forecastAttack(battle, active, target, mode === 'fire' ? 'fire' : 'attack') : null

  function choose(id: string) {
    setSelectedArt(null)
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
    if (selectedArt) setSelectedArt(null)
    else if (mode === 'fire') setMode('tactics')
    else if (mode) setMode(null)
    else if (pendingMove) cancelMove()
    else choose('')
  }

  function playAction(action: BattleAction) {
    if (animating) return
    if (action.type === 'end') {
      if (canEndTurn) {
        setEnemyPlayback(0)
        setTurnTransition('enemy-banner')
      }
      return
    }
    setBeforeAction(resolved)
    dispatch({ type: 'battle', action, seed: Math.floor(Math.random() * 2 ** 32) })
  }

  function onCell(point: Point) {
    const unit = unitAt(battle, point)
    if (pendingMove && unit?.side === 'ally' && unit.id !== pendingMove.unit
      && !(selectedArt && targets.has(unit.id))) {
      cancelMove(unit.id)
      return
    }
    if (targeting) {
      if (!active || !unit || !targets.has(unit.id)) return
      playAction(selectedArt ? { type: 'warArt', art: selectedArt, unit: active.id, target: unit.id }
        : { type: mode === 'fire' ? 'fire' : 'attack', unit: active.id, target: unit.id })
      setSelectedArt(null)
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
    : selectedArt ? `${warArts[selectedArt].name} 대상을 선택하세요.`
    : mode === 'attack' ? '공격 범위 안의 적을 선택하세요.'
    : mode === 'fire' ? '화계 범위 안의 적을 선택하세요.'
    : mode === 'tactics' ? '사용할 책략을 고르세요.'
    : mode === 'items' ? '사용할 도구를 고르세요.'
    : pendingMove ? '명령을 선택하세요. 다른 아군을 선택하면 이동이 취소됩니다.'
    : active?.moved ? '장수의 명령을 선택하세요.'
    : active ? '파란 칸으로 이동하세요. 제자리에서 행동하려면 장수를 다시 선택하세요.'
    : selected?.done ? '이 장수는 이번 턴의 행동을 마쳤습니다.'
    : '지도에서 장수를 선택하세요.'

  return <section className="battle-window" aria-label="전투" onContextMenuCapture={(event) => {
    event.preventDefault()
    if (battle.result || animating || turnPrompt.current?.open) return
    cancel()
  }} onKeyDown={(event) => {
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
        <span>{battle.round}턴 · {battle.result ? '전투 종료' : turnTransition?.startsWith('enemy') ? (guestPhase ? '우군 차례' : '상대 차례') : '아군 차례'}</span>
        <span>아군 {allies.length} / 적군 {enemies.length}</span>
      </div>
    </div>
    <div className="battle-board">
      <BattleMap map={battle.map} image={stage.jo?.image} units={battle.units} selected={focusedId} moves={moves} range={range} path={path} targets={targets} affected={affected} burning={battle.burning}
        events={events}
        followAction={turnTransition === 'enemy'}
        onTurnBoundary={turnTransition === 'enemy' ? (banner, enemy) => setEnemyPlayback(banner ? 1 : enemy ? 2 : 0) : undefined}
        onPlaybackEnd={() => {
          setBeforeAction(null)
          if (turnTransition === 'enemy') setTurnTransition(resolved.result ? null : 'ally-banner')
        }}
        onCell={battle.result || animating ? undefined : onCell}
        onHover={(point) => setHovered((last) => last?.x === point?.x && last?.y === point?.y ? last : point)}
        focusOnTarget={targeting} />
      {(turnTransition === 'enemy-banner' || turnTransition === 'ally-banner' || (turnTransition === 'enemy' && enemyPlayback === 1)) &&
        <div className="turn-banner" role="status">{turnTransition === 'ally-banner' ? '아군 턴' : guestPhase ? '우군 턴' : '상대 턴'}</div>}
      {active?.moved && !targeting && <div
        className="field-menu"
        data-left={active.x >= width / 2}
        data-up={active.y >= height / 2}
        style={{ '--column': active.x, '--row': active.y, '--columns': width, '--rows': height } as CSSProperties}
        role="group"
        aria-label={mode === 'items' ? '도구' : mode === 'tactics' ? '책략' : mode === 'warArts' ? '전법' : `${active.name} 명령`}
      >
        <strong>{mode === 'items' ? '도구' : mode === 'tactics' ? '책략' : mode === 'warArts' ? '전법' : active.name}</strong>
        {mode === 'warArts' ? <>
          <span className="field-menu-note">의지 {active.currentMP}</span>
          {learnedArts.map(({ id, level, used, available }) => <button key={id} disabled={!available}
            onClick={() => setSelectedArt(id)}>{warArts[id].name} Lv.{level} · 의지 {warArtWill(id)} 이상 · {used ? '사용 완료' : '미사용'}</button>)}
          <button onClick={cancel}>돌아가기</button>
        </> : mode === 'items' ? <>
          {ownedItems.length === 0 && <span className="field-menu-note">보유 도구 없음</span>}
          {ownedItems.map((id) => <button key={id} title={items[id].detail}
            disabled={id === 'salve' ? active.currentHP === active.hp : active.currentMP === active.mp}
            onClick={() => {
              dispatch({ type: 'battle', action: { type: 'item', unit: active.id, item: id } })
              setMode(null)
            }}>{items[id].name} ×{state.inventory[id]}</button>)}
          <button onClick={cancel}>돌아가기</button>
        </> : mode === 'tactics' ? <>
          <button disabled={!spells.length} onClick={() => setMode('fire')}>화계 · 의지 {FIRE_COST}</button>
          <button onClick={cancel}>돌아가기</button>
        </> : <>
          <button disabled={!attacks.length} onClick={() => setMode('attack')}>공격</button>
          <button disabled={!learnedArts.some(({ available }) => available)} onClick={() => setMode('warArts')}>전법</button>
          <button disabled={active.confusedUntil !== undefined || !hasTactics(active)} onClick={() => setMode('tactics')}>책략</button>
          <button onClick={() => setMode('items')}>도구</button>
          <button onClick={() => dispatch({ type: 'battle', action: { type: 'wait', unit: active.id } })}>대기</button>
        </>}
      </div>}
      {battle.result && <div className="result-overlay">
        <div className="result-card" role="status">
          <span>{stage.name}</span>
          <h2>{battle.result === 'win' ? '승리' : '패배'}</h2>
          <p>{battle.result === 'win' ? `${objective} · 보상 ${stage.reward} G` : '총대장이 쓰러졌습니다.'}</p>
          {battle.result === 'win' && earnedExperience.length > 0 && <ul className="experience-results" aria-label="장수별 성장">
            {earnedExperience.map(([id, xp]) => {
              const current = state.growth?.[id] ?? { level: Math.max(1, data.officers[id]?.level ?? 1), xp: 0 }
              const next = awardExperience(current, xp)
              return <li key={id}>{officerById[id].name} · +{xp} XP{next.level > current.level && ` · Lv.${current.level} → Lv.${next.level}`}</li>
            })}
          </ul>}
          {battle.result === 'win'
            ? <button className="classic-button" onClick={() => dispatch({ type: 'collect', rolls: Array.from({ length: 10 }, () => Math.random()) })}>보상 받고 상점으로</button>
            : <button className="classic-button" onClick={() => { choose(''); dispatch({ type: 'retry' }) }}>같은 전장 재도전</button>}
        </div>
      </div>}
    </div>
    <div className="battle-status">
      {selected ? <UnitDetails unit={selected} map={battle.map} terrainNames={stage.jo?.terrainNames} /> : <div className="battle-objective"><strong>승리 조건</strong><span>{objective}</span><strong>패배 조건</strong><span>총대장 전사</span></div>}
      <div className="terrain-status">
        <strong>지형 {terrainName ?? '—'}</strong>
        {support && target && 'will' in support && <span>{target.name} · 의지 {support.will! > 0 ? '+' : ''}{support.will}</span>}
        {support && target && 'hp' in support && <span>{target.name} · 병력 +{support.hp}{controlStatus(target) && ' · ' + controlStatus(target) + ' 해제'}</span>}
        {strategy.map(({ foe, damage, confusion }) => <span key={foe.id}>{foe.name} · 피해 {damage}{confusion !== undefined && ` · 혼란 ${confusion}%`}</span>)}
        {forecast && target && <span>{target.name} · 예상 피해 {forecast.damage} · 명중 {forecast.hit}%{forecast.counter ? ' · 반격 가능' : ''}</span>}
        {terrainName && <span>{moveCost === null ? '통과 불가' : `이동 비용 ${moveCost}`}</span>}
      </div>
    </div>
    <footer className="battle-footer">
      <span role="status">{battle.result ? battle.log.at(-1) : commandHint}</span>
      {mode && !battle.result && <button className="classic-button" onClick={cancel}>명령 취소</button>}
      <span className="battle-ready">행동 가능 {ready}명</span>
    </footer>
    {!battle.result && earnedExperience.length > 0 && <details className="battle-history">
      <summary>이번 전투 획득 경험치</summary>
      <ul>{earnedExperience.map(([id, xp]) => <li key={id}>{officerById[id].name} · +{xp} XP</li>)}</ul>
    </details>}
    <dialog ref={turnPrompt} className="result-card turn-prompt" aria-labelledby="turn-prompt-title"
      onKeyDown={(event) => event.stopPropagation()}>
      <h2 id="turn-prompt-title">아군 턴을 종료할까요?</h2>
      <form method="dialog" className="turn-prompt-actions">
        <button type="submit" className="classic-button" onClick={() => {
          choose('')
          playAction({ type: 'end' })
        }}>예</button>
        <button type="submit" className="classic-button" autoFocus>아니오</button>
      </form>
    </dialog>
    {showLog && <section className="battle-history" aria-label="전투 기록">
      <ol>{[...battle.log].reverse().map((line, index) => <li key={index}>{line}</li>)}</ol>
    </section>}
  </section>
}

function Camp({ state, dispatch, data }: ScreenProps) {
  const [troopFilter, setTroopFilter] = useState<TroopClass | ''>('')
  const matchesTroop = (id: string) => !troopFilter || troopClassFor(officerById[id].role, data.officers[id]?.classId) === troopFilter
  const [tab, setTab] = useState<'shop' | 'lineup'>('shop')
  const firstBattle = state.phase === 'draft'
  const atEnd = !firstBattle && state.stage === STAGE_COUNT
  const nextStage = data.stages[firstBattle ? 0 : state.stage]
  return <div className="panel camp-panel">
    <div className="panel-heading camp-heading">
      <div>{!firstBattle && <span className="eyebrow">전장 {stageNumber(state.stage)} 승리</span>}<h2>야영지</h2>
        <p>{atEnd ? '원정을 마쳤습니다.' : `${firstBattle ? '첫 전장' : '다음 전장'} · ${stageNumber(nextStage.number)} ${nextStage.name}`}</p>
        {nextStage?.jo && <p>다음 전장 출전 한도 {fieldLimitFor(nextStage)}명 · 총대장 우선, 편성 순서대로 출전</p>}
      </div>
      <button className="primary" onClick={() => dispatch({ type: 'deploy' })}>{firstBattle ? '첫 전투 출전' : atEnd ? '원정 마치기' : '다음 전장 출전'} →</button>
    </div>
    {firstBattle ? <FirstBattleLobby {...{ state, dispatch, data }} /> : <>
    <div className="camp-tabs" role="group" aria-label="야영지 메뉴">
      <button aria-pressed={tab === 'shop'} onClick={() => setTab('shop')}>대기 상점</button>
      <button aria-pressed={tab === 'lineup'} onClick={() => setTab('lineup')}>출전 편성 · {state.lineup.length}/{FIELD_LIMIT}</button>
    </div>
    <TroopFilter value={troopFilter} onChange={setTroopFilter} />
    {tab === 'shop' ? <div className="shop-grid">
      <section className="shop-group">
        <h3>장수 영입 <span>{state.offers.officers.length}명</span></h3>
        {state.offers.officers.length === 0 && <p className="muted">이번 상점의 영입을 모두 마쳤습니다.</p>}
        {state.offers.officers.filter(matchesTroop).map((id) => {
          const officer = officerById[id]
          return <div className="shop-row" key={id}><RoleIcon role={officer.role} name={officer.name} />
            <div><strong>{officer.name}</strong><small><ClassLabel role={officer.role} jo={data.officers[id]} />{!data.officers[id] && officer.bonus > 0 && ` · 공격 +${officer.bonus * TROOP_SCALE}`}</small><OfficerAttributes name={officer.name} jo={data.officers[id]} /></div>
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
            <div><strong>{treasure.name}</strong><small>{statLabels[treasure.stat]} +{treasure.amount * (treasure.stat === 'mp' ? 1 : TROOP_SCALE)}</small></div>
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
      {state.roster.filter(matchesTroop).map((id) => {
        const officer = officerById[id]
        const captain = state.captain === id
        const deployed = state.lineup.includes(id)
        const available = state.treasures.filter((treasure) => state.equipment[id] === treasure || !Object.values(state.equipment).includes(treasure))
        return <div className="lineup-row" key={id}>
          <div className="unit-header"><RoleIcon role={officer.role} name={officer.name} /><div><strong>{officer.name}</strong><small><ClassLabel role={officer.role} jo={data.officers[id]} troopClass={state.troopClasses?.[id]} /></small><OfficerAttributes name={officer.name} jo={data.officers[id]} /></div></div>
          <label><input type="checkbox" checked={deployed} disabled={captain || (!deployed && state.lineup.length >= FIELD_LIMIT)} onChange={() => dispatch({ type: 'lineup', id })} /> 출전</label>
          <button className="secondary" disabled={captain || (!deployed && state.lineup.length >= FIELD_LIMIT)} onClick={() => dispatch({ type: 'captain', id })}>{captain ? '◆ 총대장' : '총대장 지정'}</button>
          <TroopClassSelect {...{ id, state, dispatch, data }} />
          <select aria-label={`${officer.name} 보물 장착`} value={state.equipment[id] ?? ''} onChange={(event) => dispatch({ type: 'equip', officer: id, treasure: event.target.value })}>
            <option value="">보물 장착 안 함</option>
            {available.map((treasure) => <option value={treasure} key={treasure}>{treasureById[treasure].name}</option>)}
          </select>
        </div>
      })}
    </section>}
    </>}
  </div>
}

function CampaignScreen({ data, switchCampaign }: { data: CampaignData; switchCampaign?: () => void }) {
  const [state, dispatch] = useReducer((state: Campaign, action: Action) => campaignReducer(state, action, data), data.source, loadCampaign)
  const [view, setView] = useState<'title' | 'settings' | 'campaign'>('title')
  const hasProgress = state.phase !== 'draft' || state.roster.length > 0
  useEffect(() => {
    if (view === 'campaign') saveCampaign(state, data.source)
  }, [state, data.source, view])

  if (view !== 'campaign') return <main className="title-screen">
    <section className="panel title-panel" aria-labelledby="title-heading">
      <span className="seal" aria-hidden="true">鐵</span>
      <h1 id="title-heading">{view === 'title' ? '철령전기' : '설정'}</h1>
      {view === 'title' ? <div className="title-actions">
        <button className="primary" onClick={() => {
          if (hasProgress && !window.confirm('이 원정의 저장된 진행을 지우고 새 게임을 시작할까요?')) return
          dispatch({ type: 'reset' })
          setView('campaign')
        }}>새 게임</button>
        <button className="secondary" disabled={!hasProgress} onClick={() => setView('campaign')}>불러오기</button>
        <button className="secondary" onClick={() => setView('settings')}>설정</button>
      </div> : <div className="title-actions">
        <p>현재 원정 · {data.source === 'jo' ? '신조조전 원정' : '기존 웹 원정'}</p>
        {switchCampaign && <button className="secondary" onClick={switchCampaign}>
          {data.source === 'jo' ? '기존 웹 원정으로 전환' : '신조조전 원정으로 전환'}
        </button>}
        <button className="secondary" onClick={() => setView('title')}>돌아가기</button>
      </div>}
    </section>
  </main>

  const screen = { state, dispatch, data }
  const heading = state.phase === 'camp' ? '다음 전투를 준비하세요' : '원정 완료'
  return <>
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand"><span className="seal" aria-hidden="true">鐵</span><strong>철령전기</strong></div>
        <div className="header-meta"><span className="gold"><span aria-hidden="true">◈</span> {state.gold} G</span>
          <button className="text-button" onClick={() => setView('title')}>대기 화면</button></div>
      </div>
    </header>
    <main className={state.phase === 'battle' ? 'battle-main' : undefined}>
      {(state.phase === 'camp' || state.phase === 'complete') && <div className="page-heading"><h1>{heading}</h1></div>}
      {state.phase === 'draft' && (state.draftConfirmed && state.captain
        ? <Camp {...screen} />
        : <Draft {...screen} />)}
      {state.phase === 'battle' && <BattleScreen key={state.stage} {...screen} />}
      {state.phase === 'camp' && <Camp {...screen} />}
      {state.phase === 'complete' && <section className="panel complete">
        <span className="seal" aria-hidden="true">勝</span>
        <h2>{data.source === 'jo' ? '신조조전 원정 완료' : '철령 관문 돌파'}</h2>
        <p>{STAGE_COUNT}개 전장을 모두 클리어했습니다.</p>
        <p>보유 장수 {state.roster.length}명 · 보물 {state.treasures.length}개 · {state.gold} G</p>
      </section>}
    </main>
  </>
}

export default function App() {
  const localGraphics = useLocalGraphics()
  const [jo, setJo] = useState<CampaignData>()
  const [loaded, setLoaded] = useState(!import.meta.env.DEV)
  const [showWeb, setShowWeb] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!import.meta.env.DEV) return
    void loadJoCampaign().then((data) => {
      if (data.source === 'jo') setJo(data)
    }).catch(() => setError('신조조전 전장 데이터를 읽지 못했습니다. 가져오기를 다시 실행해 주세요.'))
      .finally(() => setLoaded(true))
  }, [])
  if (!loaded) return <main><p role="status">전장 불러오는 중…</p></main>
  const data = !showWeb && jo ? jo : webCampaign
  return <LocalGraphicsContext.Provider value={localGraphics}>
    {error && <p role="alert">{error}</p>}
    <CampaignScreen key={data.source} data={data} switchCampaign={jo && (() => setShowWeb(!showWeb))} />
  </LocalGraphicsContext.Provider>
}
