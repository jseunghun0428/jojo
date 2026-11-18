import { navalLessons, navalTraining, resolveDeployment, ships, siegeEquipment } from './deployments.ts'
import type { Loadout } from './deployments.ts'
import { TACTIC_ENERGY_COST, warArtEnergyCost, warArts } from './war-arts.ts'
import type { WarArtId } from './war-arts.ts'
import { createContext, useContext, useEffect, useReducer, useRef, useState } from 'react'
import type { CSSProperties, Dispatch } from 'react'
import BattleMap from './BattleMap.tsx'
import { LocalGraphicsContext, useLocalGraphics } from './local-graphics.ts'
import { officerStatLabels } from './officer-attributes.ts'
import { fieldLimitFor, joTerrainId, webCampaign } from './jo-game.ts'
import type { CampaignData, JoProfile } from './jo-game.ts'
import { createWebHexCampaign } from './hex-stages.ts'
import { expeditionTroopClasses, roles, troopClasses, troopClassFor, troopSpecialtyNames } from './unit-classes.ts'
import type { Role, TroopClass } from './unit-classes.ts'
import { campaignReducer, draftCost, initialProgression, loadCampaign, requiredShipIds, saveCampaign, settleClear } from './campaign.ts'
import type { Action, Campaign } from './campaign.ts'
import { attackCells, attributesOf, battleAttributes, canAttack, controlStatus, deploymentPreviews, extinguishCells, extinguishChance, forecastAttack, initiativeQueue, isBurning, key, movementCost, movementLimit, movementPath, movesFor, physicalStats, playBattle, strategyPreviews, terrainAt, troopArtPreviews, unitAt, warArtArea, warArtCells, warArtEffect, warArtsFor } from './combat.ts'
import type { Battle, BattleAction, Unit } from './combat.ts'
import { startTrial, trialSetup } from './trial-battle.ts'
import type { TrialSetup } from './trial-battle.ts'
import type { Stage } from './data.ts'
import { DRAFT_LIMIT, FIELD_LIMIT, STAGE_COUNT, TROOP_SCALE, items, officerById, stageImage, starterIds, statLabels, terrains, treasureById } from './data.ts'
import { campaignWithStages, loadStageCatalog, loadStageSources } from './stage-library.ts'
import type { StageEntry } from './stage-library.ts'
import type { ItemId, Point } from './data.ts'
import { ExpeditionTitle } from './ExpeditionTitle.tsx'
import { TROOP_STEP, assignedTroops, assignmentLimit, expeditionCampaign, spoils, troopBudget } from './expedition.ts'
import type { Spoil } from './expedition.ts'
import { linkedAlly } from './combat.ts'

type ScreenProps = { state: Campaign; dispatch: Dispatch<Action>; data: CampaignData }
const TroopLabels = createContext<Readonly<Record<TroopClass, string>>>(troopClasses)
function ClassLabel({ role, jo, troopClass }: { role: Role; jo?: JoProfile; troopClass?: TroopClass }) {
  const kind = troopClass ?? troopClassFor(role, jo?.classId)
  const labels = useContext(TroopLabels)
  return <>{kind ? labels[kind] : '분류 보류'}</>
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

function OfficerAttributes({ attributes }: { attributes: readonly number[] }) {
  return <small className="officer-attributes">
    {attributes.map((value, index) => <span key={officerStatLabels[index]}>{officerStatLabels[index]} {value}</span>)}
  </small>
}

function TroopFilter({ value, onChange, landOnly }: { value: TroopClass | ''; onChange: (value: TroopClass | '') => void; landOnly?: boolean }) {
  const labels = useContext(TroopLabels)
  return <select aria-label="병종 필터" value={value} onChange={(event) => onChange(event.target.value as TroopClass | '')}>
    <option value="">전체 병종</option>
    {Object.entries(labels).filter(([id]) => !landOnly || id !== 'siege').map(([id, name]) => <option key={id} value={id}>{name}</option>)}
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
      <TroopFilter value={troopFilter} onChange={setTroopFilter} landOnly={data.source === 'jo'} />
      <div className="draft-grid">
        {starterIds.filter((id) => !troopFilter || (data.source === 'jo' ? resolveDeployment(officerById[id].role, data.officers[id]?.classId, state.troopClasses?.[id]).troopClass
          : troopClassFor(officerById[id].role, data.officers[id]?.classId)) === troopFilter).map((id) => {
          const officer = officerById[id]
          const active = state.roster.includes(id)
          const captain = state.captain === id
          return <article className={`officer-card ${active ? 'chosen' : ''}`} key={id}>
            <button className="officer-select" aria-pressed={active} disabled={!active && cost + officer.cost > DRAFT_LIMIT}
              onClick={() => dispatch({ type: 'draft', id })}>
              <RoleIcon role={officer.role} name={officer.name} />
              <span><strong>{officer.name}</strong><small><ClassLabel role={officer.role} jo={data.officers[id]} /></small><OfficerAttributes attributes={attributesOf({ name: officer.name, player: true })} /></span>
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
  const deployment = resolveDeployment(officer.role, data.officers[id]?.classId, state.troopClasses?.[id], state.loadouts?.[id])
  const selected = data.source === 'jo' ? deployment.troopClass : state.troopClasses?.[id] ?? troopClassFor(officer.role, data.officers[id]?.classId)
  const loadout = deployment.loadout ?? {}
  const setLoadout = (value: Loadout) => dispatch({ type: 'loadout', id, loadout: value })
  return <><select aria-label={`${officer.name} 병종 변경`} value={selected} onChange={(event) =>
    dispatch({ type: 'changeTroopClass', id, troopClass: event.target.value as TroopClass })}>
    {selected === 'siege' && <option value="siege" disabled>{troopClasses.siege}</option>}
    {Object.entries(data.expedition ? expeditionTroopClasses : troopClasses).filter(([value]) => value !== 'siege')
      .map(([value, name]) => <option key={value} value={value}>{name}</option>)}
  </select>
    {officer.specialties ? <div>
      {Object.entries(officer.specialties).map(([troop, level]) => (
        <div key={troop}>{troopSpecialtyNames[troop as TroopClass]} Lv.{level} · 적용 예정</div>
      ))}
    </div> : <div>병과 특기 없음</div>}
    {data.source === 'jo' && <div>
      <select aria-label={`${officer.name} 병기 편제`} value={loadout.siege ?? ''}
        onChange={(event) => setLoadout({ ...loadout, siege: (event.target.value || undefined) as Loadout['siege'] })}>
        <option value="">병기 없음</option>
        {Object.entries(siegeEquipment).map(([key, item]) => <option key={key} value={key}>{item.name}</option>)}
      </select>
      <select aria-label={`${officer.name} 함선 편제`} value={loadout.ship ?? ''}
        onChange={(event) => setLoadout({ ...loadout, ship: (event.target.value || undefined) as Loadout['ship'] })}>
        <option value="">함선 없음</option>
        {Object.entries(ships).map(([key, item]) => <option key={key} value={key}>{item.name}</option>)}
      </select>
      {loadout.siege && <div>병기 전법 · {siegeEquipment[loadout.siege].name}</div>}
      {loadout.ship && <div>함선 지원 · {ships[loadout.ship].arts.map((art) => warArts[art].name).join('·')}</div>}
      {navalTraining[officer.name] && <div>수련 Lv.{navalTraining[officer.name]} · 적용 예정</div>}
      {navalLessons[officer.name] && <div>습득 함선 전법 · {navalLessons[officer.name]?.map(({ id, level }) => warArts[id].name + ' Lv.' + level).join('·')}</div>}
    </div>}
  </>
}

function TroopAssignment({ id, state, dispatch }: Pick<ScreenProps, 'state' | 'dispatch'> & { id: string }) {
  const limit = assignmentLimit(state, id)
  return <label className="troop-assignment">배치 병력
    <select aria-label={officerById[id].name + ' 배치 병력'} value={assignedTroops(state, id)}
      onChange={event => dispatch({ type: 'assignTroops', id, count: Number(event.target.value) })}>
      {Array.from({ length: limit / TROOP_STEP }, (_, index) => (index + 1) * TROOP_STEP).map(count =>
        <option key={count} value={count}>{count.toLocaleString('ko-KR')}명</option>)}
    </select>
  </label>
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
          <div><strong>{officer.name}</strong><br /><TroopClassSelect {...{ id, state, dispatch, data }} />
            {data.expedition && <TroopAssignment {...{ id, state, dispatch }} />}</div>
          {id === state.captain && <span className="tag">총대장</span>}
        </div>
      })}
    </section>
    <section className="panel preview-panel">
      <div className="panel-heading"><div><span className="eyebrow">전장 {stageNumber(1)}</span><h2>{stage.name}</h2></div><span className="tag">전장 미리보기</span></div>
        <BattleMap expedition={data.expedition} map={stage.map} grid={stage.grid} image={stageImage(stage)} layout={stage.board} />
      {stage.jo && <p>이 전장의 출전 인원은 총대장을 포함해 최대 {fieldLimitFor(stage)}명입니다.</p>}
      <div className="preview-notes">
        <p><strong>승리</strong> {stage.jo?.objectives ? `${stage.jo.objectives.join('·')}을 격파하세요.` : '적군을 모두 격파하세요.'}</p>
        <p><strong>패배</strong> 총대장이 쓰러지면 같은 전장에 재도전합니다.</p>
      </div>
    </section>
  </div>
}

function attackRangeLabel(unit: Unit, grid?: Battle['grid']) {
  const kind = unit.troopClass ?? troopClassFor(unit.role, unit.jo?.classId)
  if (kind === 'ranged') return grid === 'hex' ? '주변 2칸' : '주변 2칸 (바깥 모서리 제외)'
  if (kind === 'infantry' || kind === 'cavalry') return grid === 'hex' ? '인접 6방향' : '인접 8방향'
  return unit.jo?.pattern === 'all' ? '전장 전체' : unit.range
}

function UnitDetails({ unit, map, terrainNames, grid }: { unit: Unit; map: readonly string[]; terrainNames?: string[]; grid?: Battle['grid'] }) {
  const status = controlStatus(unit)
  const { attack, defense } = physicalStats(unit)
  const terrain = terrainAt(map, unit)
  const terrainId = joTerrainId(map, unit)
  const terrainName = terrainId === undefined ? terrain && terrains[terrain].name : terrainNames?.[terrainId]
  return <div className="unit-details">
    <div className="unit-header"><RoleIcon role={unit.role} name={unit.name} /><div><strong>{unit.name}</strong><small>{unit.captain ? '총대장 · ' : unit.guest ? '우군 · ' : ''}<ClassLabel role={unit.role} jo={unit.jo} troopClass={unit.troopClass} />{unit.afloat && unit.loadout?.ship && ' · 수상 ' + ships[unit.loadout.ship].name}{terrainName && ` · ${terrainName}`}</small></div></div>
    <div className="meter"><span>병력</span><meter min={0} max={unit.hp} value={unit.currentHP} /><b>{unit.currentHP}/{unit.hp}</b></div>
    {unit.mp > 0 && <div className="meter mp"><span>기력</span><meter min={0} max={unit.mp} value={unit.currentMP} /><b>{unit.currentMP}/{unit.mp}</b></div>}
    <OfficerAttributes attributes={battleAttributes(unit)} />
    {unit.morale !== undefined && <div className="meter"><span>전의</span><meter min={0} max={100} value={unit.morale} /><b>{unit.morale}/100</b></div>}
    {status && <p className="unit-stats">상태 · {status}</p>}
    <p className="unit-stats">레벨 {unit.level ?? 1} · 공격 {attack} · 방어 {defense}</p>
    <p className="unit-stats">이동 {movementLimit(unit)} · 사거리 {attackRangeLabel(unit, grid)}</p>
  </div>
}

type CommandMode = 'attack' | 'tactics' | 'extinguish' | 'items' | 'warArts' | null

function BattleScreen({ state, dispatch, data, trialStage }: ScreenProps & { trialStage?: Stage }) {
  const resolved = state.battle!
  const clear = trialStage ? undefined : settleClear(state, data).clearResult
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
  const queue = battle.result ? [] : initiativeQueue(battle)
  const acting = queue[0]
  const automated = acting && (acting.side === 'enemy' || acting.guest) ? acting : undefined
  useEffect(() => {
    if (!automated || animating) return
    const timer = window.setTimeout(() => {
      setBeforeAction(resolved)
      dispatch({ type: 'battle', action: { type: 'initiative-ai', unit: automated.id, day: resolved.round }, seed: Math.floor(Math.random() * 2 ** 32) })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [automated, animating, dispatch, resolved])
  const stage = trialStage ?? data.stages[state.stage - 1]
  const stageName = battle.stageName ?? (data.source === 'web' && battle.grid !== 'hex' && stage.grid === 'hex'
    ? webCampaign.stages[state.stage - 1].name : stage.name)
  const original = data.originals?.[state.stage - 1] ?? stage
  const background = battle.board ? battle.board.image : stageImage(trialStage ?? original)
  const width = battle.map[0].length
  const height = battle.map.length
  const [selectedId, select] = useState('')
  const [selectedArt, setSelectedArt] = useState<WarArtId | null>(null)
  const [mode, setMode] = useState<CommandMode>(null)
  const [inspected, inspect] = useState<Point | null>(null)
  const [hovered, setHovered] = useState<Point | null>(null)
  const [showLog, setShowLog] = useState(false)
  const pendingMove = battle.pendingMove
  const focusedId = battle.initiative ? acting?.id ?? '' : pendingMove?.unit ?? selectedId
  const allies = battle.units.filter((unit) => unit.side === 'ally' && unit.currentHP > 0)
  const enemies = battle.units.filter((unit) => unit.side === 'enemy' && unit.currentHP > 0)
  const selected = battle.units.find((unit) => unit.id === focusedId && unit.currentHP > 0)
  const active = selected?.side === 'ally' && !selected.guest && !selected.done && !battle.result && !animating ? selected : null
  const moveCells = active && !active.moved ? movesFor(battle, active, true) : []
  const moves = new Set(moveCells.filter(({ occupied }) => !occupied).map(key))
  const path = hovered && moves.has(key(hovered)) ? movementPath(moveCells, hovered) : []
  const attacks = active?.moved ? enemies.filter((unit) => canAttack(active, unit, false, battle.grid)) : []
  const burningTargets = active?.moved ? extinguishCells(battle, active) : []
  const learnedArts = active?.moved ? warArtsFor(active).map((art) => {
    const available = warArtCells(battle, active, art.id).some((point) => {
      if ('platform' in warArts[art.id]) return deploymentPreviews(battle, active, art.id, point).length > 0
      const target = unitAt(battle, point)
      return target && warArtEffect(active, target, art.id)
    })
    return { ...art, available }
  }) : []
  const tactics = learnedArts.filter(({ id }) => 'tactic' in warArts[id])
  const combatArts = learnedArts.filter(({ id }) => !('tactic' in warArts[id]))
  const platformArt = selectedArt && 'platform' in warArts[selectedArt]
  const artRange = active && selectedArt ? new Set(warArtCells(battle, active, selectedArt)
    .filter((point) => !platformArt || deploymentPreviews(battle, active, selectedArt, point).length > 0).map(key)) : null
  const range = artRange ?? new Set((mode === 'extinguish' ? burningTargets : active?.moved ? attackCells(active, false, battle.map, battle.grid) : []).map(key))
  const targets = new Set((artRange && active && selectedArt ? battle.units.filter((unit) => !platformArt && artRange.has(key(unit)) && warArtEffect(active, unit, selectedArt)) : mode === 'extinguish' ? [] : attacks).map(({ id }) => id))
  const ownedItems = itemIds.filter((id) => state.inventory[id] > 0)
  const tile = hovered ?? inspected ?? selected
  const terrainCode = tile && terrainAt(battle.map, tile)
  const terrainId = tile && joTerrainId(battle.map, tile)
  const terrainName = typeof terrainId === 'number' ? stage.jo?.terrainNames[terrainId] : terrainCode && terrains[terrainCode].name
  const moveCost = tile && movementCost(battle.map, tile, selected)
  const tileBurning = tile && isBurning(battle, tile)
  const ready = allies.filter(({ done, guest }) => !done && !guest).length
  const turnPrompt = useRef<HTMLDialogElement>(null)
  const promptedRound = useRef<number | null>(null)
  const guestPhase = enemyPlayback === 0 && battle.units.some((unit) => unit.guest && unit.currentHP > 0)
  const canEndTurn = !battle.initiative && !battle.result && !animating && !pendingMove

  useEffect(() => {
    if (!canEndTurn || ready !== 0 || promptedRound.current === battle.round) return
    const dialog = turnPrompt.current
    if (!dialog) return
    promptedRound.current = battle.round
    dialog.showModal()
  }, [battle.round, canEndTurn, ready])
  const objective = battle.objectives ? `${battle.objectives.join('·')} 격파` : '적군 전멸'
  const targeting = !!selectedArt || mode === 'attack' || mode === 'extinguish'
  const target = targeting && tile ? unitAt(battle, tile) : undefined
  const deploymentForecast = active && selectedArt && platformArt && tile ? deploymentPreviews(battle, active, selectedArt, tile) : []
  const affected = active && selectedArt && tile && (deploymentForecast.length || (target && targets.has(target.id)))
    ? new Set(warArtArea(battle, active, selectedArt, tile).map(key)) : undefined
  const support = active && selectedArt && target && targets.has(target.id) ? warArtEffect(active, target, selectedArt) : null
  const strategy = active && selectedArt && target ? strategyPreviews(battle, active, selectedArt, target) : []
  const troopArt = active && selectedArt && target ? troopArtPreviews(battle, active, selectedArt, target) : []
  const forecast = !selectedArt && active && target && targets.has(target.id)
    ? forecastAttack(battle, active, target) : null

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
    else if (mode === 'extinguish') setMode('tactics')
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
    if (mode === 'extinguish') {
      if (active && range.has(key(point))) {
        playAction({ type: 'extinguish', unit: active.id, target: point })
        setMode(null)
      }
      return
    }
    const unit = unitAt(battle, point)
    if (active && selectedArt && platformArt && artRange?.has(key(point))) {
      playAction({ type: 'warArt', art: selectedArt, unit: active.id, target: point })
      setSelectedArt(null)
      return
    }
    if (pendingMove && unit?.side === 'ally' && unit.id !== pendingMove.unit
      && !(selectedArt && targets.has(unit.id))) {
      cancelMove(unit.id)
      return
    }
    if (targeting) {
      if (platformArt || !active || !unit || !targets.has(unit.id)) return
      playAction(selectedArt ? { type: 'warArt', art: selectedArt, unit: active.id, target: unit.id }
        : { type: 'attack', unit: active.id, target: unit.id })
      setSelectedArt(null)
      setMode(null)
      return
    }
    if (pendingMove) return
    if (active && !active.moved && (unit?.id === active.id || moves.has(key(point)))) {
      playAction({ type: 'move', unit: active.id, to: point })
      inspect(null)
    } else if (unit && !battle.initiative) {
      choose(unit.id)
    } else {
      inspect(point)
    }
  }

  const commandHint = animating || automated ? '전투 진행 중…'
    : selectedArt ? `${warArts[selectedArt].name} 대상을 선택하세요.`
    : mode === 'attack' ? '공격 범위 안의 적을 선택하세요.'
    : mode === 'extinguish' && active ? `불붙은 칸을 선택하세요. 소화 성공률 ${extinguishChance(active)}%.`
    : mode === 'tactics' ? '사용할 책략을 고르세요.'
    : mode === 'items' ? '사용할 도구를 고르세요.'
    : pendingMove ? '명령을 선택하세요. 다른 아군을 선택하면 이동이 취소됩니다.'
    : active?.moved ? '장수의 명령을 선택하세요.'
    : active ? '파란 칸으로 이동하세요. 제자리에서 행동하려면 장수가 있는 칸을 누르세요.'
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
      <span className="battle-window-icon" aria-hidden="true">{data.expedition ? '七' : '鐵'}</span>
      <h1>{stageName}</h1>
      <span className="battle-stage">{trialStage ? `시험 전투 · ${battle.grid === 'hex' ? '육각판' : '사각판'}` : `전장 ${stageNumber(state.stage)} / ${STAGE_COUNT}`}</span>
    </header>
    <div className="battle-toolbar">
      <div className="battle-tools">
        {!battle.initiative && <button className="classic-button" disabled={!canEndTurn} onClick={() => {
          choose('')
          playAction({ type: 'end' })
        }}>아군 턴 종료</button>}
        <button className="classic-button" aria-pressed={showLog} onClick={() => setShowLog(!showLog)}>전투 기록</button>
      </div>
      <div className="battle-counts">
        {data.expedition && <span>{objective}</span>}
        <span>{battle.initiative ? `${battle.round}일째` : `${battle.round}턴`} · {battle.result ? '전투 종료'
          : acting ? `${acting.name} 행동` : turnTransition?.startsWith('enemy') ? (guestPhase ? '우군 차례' : '상대 차례') : '아군 차례'}</span>
        <span>아군 {allies.length} / 적군 {enemies.length}</span>
      </div>
    </div>
    {acting && <ol className="initiative-queue" aria-label="부대 행동 순서">
      {queue.slice(0, 6).map((unit, index) => <li key={unit.id} data-side={unit.guest ? 'guest' : unit.side}
        aria-current={index === 0 ? 'step' : undefined}>{unit.name}
        <small>{unit.guest ? '우군' : unit.side === 'enemy' ? '적군' : '아군'}</small></li>)}
    </ol>}
    <div className="battle-board">
          <BattleMap expedition={data.expedition} map={battle.map} grid={battle.grid} image={background} layout={battle.board} units={battle.units} selected={focusedId} moves={moves} range={range} path={path} targets={targets} affected={affected} burning={battle.burning}
        extinguishedTerrain={battle.extinguishedTerrain}
        events={events}
        followAction={turnTransition === 'enemy' || !!automated}
        onTurnBoundary={turnTransition === 'enemy' ? (banner, enemy) => setEnemyPlayback(banner ? 1 : enemy ? 2 : 0) : undefined}
        onPlaybackEnd={() => {
          setBeforeAction(null)
          if (turnTransition === 'enemy') setTurnTransition(resolved.result ? null : 'ally-banner')
        }}
        onCell={battle.result || animating || automated ? undefined : onCell}
        onHover={(point) => setHovered((last) => last?.x === point?.x && last?.y === point?.y ? last : point)}
        focusOnTarget={targeting} />
      {(turnTransition === 'enemy-banner' || turnTransition === 'ally-banner' || (turnTransition === 'enemy' && enemyPlayback === 1)) &&
        <div className="turn-banner" role="status">{turnTransition === 'ally-banner' ? '아군 턴' : guestPhase ? '우군 턴' : '상대 턴'}</div>}
      {active?.moved && !targeting && <div
        className="field-menu"
        data-grid={battle.grid}
        data-left={active.x >= width / 2}
        data-up={active.y >= height / 2}
        style={{ '--column': active.x, '--row': active.y, '--columns': width, '--rows': height } as CSSProperties}
        role="group"
        aria-label={mode === 'items' ? '도구' : mode === 'tactics' ? '책략' : mode === 'warArts' ? '전법' : `${active.name} 명령`}
      >
        <strong>{mode === 'items' ? '도구' : mode === 'tactics' ? '책략' : mode === 'warArts' ? '전법' : active.name}</strong>
        {mode === 'warArts' || mode === 'tactics' ? <>
          <span className="field-menu-note">기력 {active.currentMP}</span>
          {(mode === 'tactics' ? tactics : combatArts).map(({ id, level, available }) => <button key={id} disabled={!available}
            title={id === 'intercept' ? '숲이나 산지에서 인접한 적에게 사용할 수 있습니다.' : undefined}
            onClick={() => setSelectedArt(id)}>{warArts[id].name}{id !== 'calm' && ` Lv.${level}`} · 기력 {warArtEnergyCost(id)}</button>)}
          {mode === 'tactics' && <button disabled={!burningTargets.length}
            onClick={() => setMode('extinguish')}>소화 · 기력 {TACTIC_ENERGY_COST} · 성공률 {extinguishChance(active)}%</button>}
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
        </> : <>
          <button disabled={!attacks.length} onClick={() => setMode('attack')}>공격</button>
          <button disabled={!combatArts.length || active.confusedUntil !== undefined} onClick={() => setMode('warArts')}>전법</button>
          <button disabled={active.confusedUntil !== undefined} onClick={() => setMode('tactics')}>책략</button>
          {!data.expedition && <button onClick={() => setMode('items')}>도구</button>}
          <button onClick={() => dispatch({ type: 'battle', action: { type: 'wait', unit: active.id } })}>대기</button>
        </>}
      </div>}
      {battle.result && <div className="result-overlay">
        <div className="result-card" role="status">
          <span>{stageName}</span>
          <h2>{battle.result === 'win' ? '승리' : '패배'}</h2>
          <p>{battle.result === 'win' ? (trialStage ? objective : `${objective} · 보상 ${stage.reward} G`) : '총대장이 쓰러졌습니다.'}</p>
          {battle.result === 'win' && clear && <ul className="experience-results" aria-label="클리어 점수">
            <li>클리어 기본 {clear.basePoints}점</li>
            <li>일반 병사 격파 {clear.soldierPoints}점</li>
            <li>장수 격파 {clear.officerPoints}점</li>
            <li>남은 턴 보너스 {clear.turnPoints}점</li>
            <li>총 획득 {clear.xp} XP</li>
            <li>통합 Lv.{clear.fromLevel} → Lv.{clear.toLevel}</li>
          </ul>}
          {trialStage
            ? <button className="classic-button" onClick={() => { choose(''); dispatch({ type: 'retry' }) }}>시험 전투 다시 시작</button>
            : battle.result === 'win'
            ? <button className="classic-button" onClick={() => dispatch({ type: 'collect', rolls: Array.from({ length: data.expedition ? 13 : 10 }, () => Math.random()) })}>{data.expedition ? state.stage === STAGE_COUNT ? '원정 완료' : '승전 보상 선택으로' : '보상 받고 상점으로'}</button>
            : <button className="classic-button" onClick={() => { choose(''); dispatch({ type: 'retry' }) }}>같은 전장 재도전</button>}
        </div>
      </div>}
    </div>
    <div className="battle-status">
      {selected ? <UnitDetails unit={selected} map={battle.map} terrainNames={stage.jo?.terrainNames} grid={battle.grid} /> : <div className="battle-objective"><strong>승리 조건</strong><span>{objective}</span><strong>패배 조건</strong><span>총대장 전사</span></div>}
      <div className="terrain-status">
        <strong>지형 {terrainName ?? '—'}{tileBurning && ' · 화계'}</strong>
        {support && target && 'energy' in support && <span>{target.name} · 기력 {support.energy! > 0 ? '+' : ''}{support.energy}</span>}
        {support && target && 'hp' in support && <span>{target.name} · 병력 +{support.hp}</span>}
        {support && target && 'cleanse' in support && <span>{target.name} · {support.cleanse} 해제</span>}
        {deploymentForecast.map(({ foe, damage, pin }) => <span key={foe.id}>{foe.name}{foe.id.startsWith('structure-') && ' ' + foe.currentHP + '/' + foe.hp} · 피해 {damage}{pin !== undefined && ' · 저지 ' + pin + '%'}</span>)}
        {troopArt.map(({ foe, damage, hits }) => <span key={foe.id}>{foe.name} · 피해 {damage}{hits > 1 && ` × ${hits}타`}</span>)}
        {strategy.map(({ foe, damage, confusion }) => <span key={foe.id}>{foe.name} · 피해 {damage}{confusion !== undefined && ` · 혼란 ${confusion}%`}</span>)}
        {forecast && target && <span>{target.name} · 예상 피해 {forecast.damage} · 명중 {forecast.hit}%{forecast.counter ? ' · 반격 가능' : ''}</span>}
        {forecast && active && target && linkedAlly(battle, active, target) && <span>연계 가능 · {linkedAlly(battle, active, target)?.name}</span>}
        {terrainName && <span>{moveCost === null ? '통과 불가' : `이동 비용 ${moveCost}`}</span>}
      </div>
    </div>
    <footer className="battle-footer">
      <span role="status">{battle.result ? battle.log.at(-1) : commandHint}</span>
      {mode && !battle.result && <button className="classic-button" onClick={cancel}>명령 취소</button>}
      <span className="battle-ready">{battle.initiative ? `오늘 남은 부대 ${queue.length}` : `행동 가능 ${ready}명`}</span>
    </footer>
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
      <ol>{[...battle.log].reverse().map((line, index) => <li key={index}>{line.replace(/ (의지|사기) /g, ' 기력 ')}</li>)}</ol>
    </section>}
  </section>
}

function Camp({ state, dispatch, data }: ScreenProps) {
  const [troopFilter, setTroopFilter] = useState<TroopClass | ''>('')
  const matchesTroop = (id: string) => !troopFilter || troopClassFor(officerById[id].role, data.officers[id]?.classId) === troopFilter
  const [tab, setTab] = useState<'shop' | 'lineup'>(data.expedition ? 'lineup' : 'shop')
  const firstBattle = state.phase === 'draft'
  const atEnd = !firstBattle && state.stage === STAGE_COUNT
  const nextStage = data.stages[firstBattle ? 0 : state.stage]
  const { level, xp } = state.progression ?? initialProgression
  const needsShips = nextStage ? requiredShipIds(state, nextStage, data) : []
  const troops = data.expedition ? troopBudget(state) : null
  return <div className="panel camp-panel">
    <div className="panel-heading camp-heading">
      <div>{!firstBattle && <span className="eyebrow">전장 {stageNumber(state.stage)} 승리</span>}<h2>야영지</h2>
        <p>{atEnd ? '원정을 마쳤습니다.' : `${firstBattle ? '첫 전장' : '다음 전장'} · ${stageNumber(nextStage.number)} ${nextStage.name}`}</p>
        {data.source === 'jo' && <p>통합 Lv.{level} · {xp} / {level * 100} XP</p>}
        {needsShips.length > 0 && <p role="status">수상 출전 위치에 함선 필요 · {needsShips.map((id) => officerById[id].name).join('·')}</p>}
        {nextStage?.jo && <p>다음 전장 출전 한도 {fieldLimitFor(nextStage)}명 · 총대장 우선, 편성 순서대로 출전</p>}
      </div>
      <button className="primary" disabled={needsShips.length > 0 || !!state.spoilChoices?.length} onClick={() => dispatch({ type: 'deploy' })}>{firstBattle ? '첫 전투 출전' : atEnd ? '원정 마치기' : '다음 전장 출전'} →</button>
    </div>
    {troops && <section className="troop-budget" aria-label="병력 배치 현황">
      <strong>총병력 {troops.total.toLocaleString('ko-KR')}명</strong>
      <span aria-live="polite">출전 {troops.assigned.toLocaleString('ko-KR')}명 · 예비 {troops.reserve.toLocaleString('ko-KR')}명</span>
      <small>출전 장수마다 1,000명 단위로 배치하세요. 다른 장수의 병력을 줄이면 예비 병력으로 돌아옵니다.</small>
    </section>}
    {state.spoilChoices?.length ? <section className="spoil-panel"><h3>승전 보상 · 하나 선택</h3>
      <div className="spoil-options">{state.spoilChoices.map(id => <button className="secondary" key={id} onClick={() => dispatch({ type: 'claimSpoil', id })}>
        <strong>{spoils[id].name}</strong><small>{spoils[id].description}</small></button>)}</div></section> : null}
    {state.spoils && Object.keys(state.spoils).length > 0 && <p className="spoil-history">받은 보상 · {Object.entries(state.spoils).map(([id, count]) => spoils[id as Spoil].name + ' ×' + count).join(' · ')}</p>}
    {firstBattle ? <FirstBattleLobby {...{ state, dispatch, data }} /> : <>
    <div className="camp-tabs" role="group" aria-label="야영지 메뉴">
      <button aria-pressed={tab === 'shop'} onClick={() => setTab('shop')}>{data.expedition ? '장수 영입' : '대기 상점'}</button>
      <button aria-pressed={tab === 'lineup'} onClick={() => setTab('lineup')}>출전 편성 · {state.lineup.length}/{FIELD_LIMIT}</button>
    </div>
    <TroopFilter value={troopFilter} onChange={setTroopFilter} landOnly={data.source === 'jo'} />
    {tab === 'shop' ? <div className={data.expedition ? 'recruit-shop' : 'shop-grid'}>
      <section className="shop-group">
        <h3>장수 영입 <span>{state.offers.officers.length}명</span></h3>
        {state.offers.officers.length === 0 && <p className="muted">이번 상점의 영입을 모두 마쳤습니다.</p>}
        {state.offers.officers.filter(matchesTroop).map((id) => {
          const officer = officerById[id]
          return <div className="shop-row" key={id}><RoleIcon role={officer.role} name={officer.name} />
            <div><strong>{officer.name}</strong><small><ClassLabel role={officer.role} jo={data.officers[id]} /></small><OfficerAttributes attributes={attributesOf({ name: officer.name, player: true })} /></div>
            <button className="secondary" aria-label={`${officer.name} 영입 ${officer.price} G`} disabled={state.gold < officer.price} onClick={() => dispatch({ type: 'buy', kind: 'officers', id })}>{officer.price} G</button>
          </div>
        })}
      </section>
      {!data.expedition && <><section className="shop-group">
        <h3>보물 <span>{state.offers.treasures.length}개</span></h3>
        {state.offers.treasures.length === 0 && <p className="muted">이번 상점의 보물을 모두 구매했습니다.</p>}
        {state.offers.treasures.map((id) => {
          const treasure = treasureById[id]
          return <div className="shop-row" key={id}><span className="role-icon relic" aria-hidden="true">✦</span>
            <div><strong>{treasure.name}</strong><small>{statLabels[treasure.stat]} +{treasure.amount * (treasure.stat === 'hp' ? TROOP_SCALE : 1)}</small></div>
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
      </section></>}
    </div> : <section className="lineup-panel">
      <p className="muted">보유 {state.roster.length}명 · 최대 {FIELD_LIMIT}명 출전 · 총대장 필수 출전</p>
      {state.roster.filter(matchesTroop).map((id) => {
        const officer = officerById[id]
        const captain = state.captain === id
        const deployed = state.lineup.includes(id)
        const cannotJoin = !deployed && (state.lineup.length >= FIELD_LIMIT || (troops !== null && troops.reserve < TROOP_STEP))
        const available = state.treasures.filter((treasure) => state.equipment[id] === treasure || !Object.values(state.equipment).includes(treasure))
        return <div className="lineup-row" key={id}>
          <div className="unit-header"><RoleIcon role={officer.role} name={officer.name} /><div><strong>{officer.name}</strong><small><ClassLabel role={officer.role} jo={data.officers[id]} troopClass={data.source === 'jo' ? resolveDeployment(officer.role, data.officers[id]?.classId, state.troopClasses?.[id]).troopClass : state.troopClasses?.[id]} /></small><OfficerAttributes attributes={attributesOf({ name: officer.name, player: true })} /></div></div>
          <label><input type="checkbox" checked={deployed} disabled={captain || cannotJoin} onChange={() => dispatch({ type: 'lineup', id })} /> 출전</label>
          <button className="secondary" disabled={captain || cannotJoin} onClick={() => dispatch({ type: 'captain', id })}>{captain ? '◆ 총대장' : '총대장 지정'}</button>
          <TroopClassSelect {...{ id, state, dispatch, data }} />
          {data.expedition ? deployed ? <TroopAssignment {...{ id, state, dispatch }} /> : <small>대기 · 0명</small>
          : <select aria-label={`${officer.name} 보물 장착`} value={state.equipment[id] ?? ''} onChange={(event) => dispatch({ type: 'equip', officer: id, treasure: event.target.value })}>
            <option value="">보물 장착 안 함</option>
            {available.map((treasure) => <option value={treasure} key={treasure}>{treasureById[treasure].name}</option>)}
          </select>}
        </div>
      })}
    </section>}
    </>}
  </div>
}

export function TrialBattle({ setup, onExit, exitLabel = '스테이지 선택으로' }: { setup: TrialSetup; onExit: () => void; exitLabel?: string }) {
  const [run, setRun] = useState(0)
  const [state, dispatch] = useReducer((state: Campaign, action: Action): Campaign => {
    if (action.type === 'retry') return startTrial(setup)
    if (action.type !== 'battle' || !state.battle) return state
    return { ...state, ...playBattle(state.battle, state.inventory, action.action, action.seed) }
  }, setup, startTrial)
  function restart() {
    dispatch({ type: 'retry' })
    setRun((current) => current + 1)
  }
  return <main className="battle-main trial-main">
    <div className="trial-toolbar">
      <button className="secondary" onClick={onExit}>{exitLabel}</button>
      <button className="secondary" onClick={restart}>다시 시작</button>
    </div>
    <BattleScreen key={run} state={state} dispatch={(action) => action.type === 'retry' ? restart() : dispatch(action)}
      data={setup.data} trialStage={setup.stage} />
  </main>
}

function TrialScreen({ initial, web, jo, entries, onExit }: { initial: CampaignData; web: CampaignData; jo?: CampaignData; entries: StageEntry[]; onExit: () => void }) {
  const [source, setSource] = useState(initial.source)
  const [stageId, setStageId] = useState<number | string>(initial.stages[0].number)
  const [playing, setPlaying] = useState<TrialSetup>()
  const data = source === 'jo' && jo ? jo : web
  if (playing) return <TrialBattle setup={playing} onExit={() => setPlaying(undefined)} />
  const saved = entries.find(({ id }) => id === stageId)
  const savedSetup = saved && { stage: saved.stage, data: saved.source === 'jo' && jo ? jo : web,
    sandbox: saved.id === 'sandbox' ? true as const : undefined }
  const alternate = typeof stageId === 'number' && data.source === 'jo' && stageId === 1
    ? entries.find(({ id }) => id === 'jo-hex:1') : undefined
  const square = savedSetup ? (savedSetup.stage.grid !== 'hex' ? savedSetup : undefined)
    : typeof stageId === 'number' ? trialSetup(data, stageId, 'square') : undefined
  const hex = savedSetup ? (savedSetup.stage.grid === 'hex' ? savedSetup : undefined)
    : alternate ? { stage: alternate.stage, data } : typeof stageId === 'number' || stageId === 'sandbox' ? trialSetup(data, stageId, 'hex') : undefined
  return <main className="title-screen">
    <section className="panel trial-panel" aria-labelledby="trial-title">
      <h1 id="trial-title">시험 전투</h1>
      <label>원정
        <select value={data.source} onChange={(event) => {
          const next = event.currentTarget.value === 'jo' && jo ? jo : web
          setSource(next.source)
          setStageId(next.stages[0].number)
        }}>
          {jo && <option value="jo">신조조전 원정</option>}
          <option value="web">기존 웹 원정</option>
        </select>
      </label>
      <label>스테이지
        <select value={stageId} size={8} onChange={(event) => {
          const value = event.currentTarget.value
          setStageId(/^\d+$/.test(value) ? Number(value) : value)
        }}>
          {data.stages.map(({ number, name }) => <option key={number} value={number}>{stageNumber(number)} · {name}</option>)}
          <option value="sandbox">{entries.find(({ id }) => id === 'sandbox')?.stage.name ?? '육각 전장 시험 (9×7)'}</option>
          {entries.filter((entry) => (entry.source === data.source || !jo) && entry.id.startsWith('custom:'))
            .map(({ id, stage }) => <option key={id} value={id}>{stage.name}</option>)}
        </select>
      </label>
      <div className="trial-actions" aria-label="전장 버전">
        <button className="primary" disabled={!square} onClick={() => setPlaying(square)}>사각판 시작</button>
        <button className="primary" disabled={!hex} onClick={() => setPlaying(hex)}>육각판 시작</button>
        <button className="secondary" onClick={onExit}>타이틀로</button>
      </div>
    </section>
  </main>
}

function CampaignScreen({ data, web, jo, entries, switchCampaign, toggleExpedition }: { data: CampaignData; web: CampaignData; jo?: CampaignData; entries: StageEntry[]; switchCampaign?: () => void; toggleExpedition: () => void }) {
  const saveSlot = data.expedition ? 'expedition' : data.source
  const [state, dispatch] = useReducer((state: Campaign, action: Action) => campaignReducer(state, action, data), saveSlot, loadCampaign)
  const [view, setView] = useState<'title' | 'settings' | 'campaign' | 'trial'>('title')
  const hasProgress = state.phase !== 'draft' || state.roster.length > 0
  useEffect(() => {
    if (view === 'campaign') saveCampaign(state, saveSlot)
  }, [state, saveSlot, view])

  if (import.meta.env.DEV && view === 'trial') return <TrialScreen initial={data.expedition ? web : data} web={web} jo={jo} entries={entries} onExit={() => setView('title')} />
  if (data.expedition && view === 'title') return <ExpeditionTitle state={state} onStart={() => {
    dispatch({ type: 'reset' }); setView('campaign')
  }} onResume={() => setView('campaign')} onLegacy={toggleExpedition} onTrial={import.meta.env.DEV ? () => setView('trial') : undefined} />
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
        <button className="secondary" onClick={toggleExpedition}>칠령전기 원정으로</button>
        {import.meta.env.DEV && <button className="secondary" onClick={() => setView('trial')}>시험 전투</button>}
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
        <div className="brand"><span className="seal" aria-hidden="true">{data.expedition ? '七' : '鐵'}</span><strong>{data.expedition ? '칠령전기' : '철령전기'}</strong></div>
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
        <h2>{data.expedition ? '오장원 돌파 · 칠령전기 원정 완료' : data.source === 'jo' ? '신조조전 원정 완료' : '철령 관문 돌파'}</h2>
        <p>{STAGE_COUNT}개 전장을 모두 클리어했습니다.</p>
        <p>보유 장수 {state.roster.length}명 · {!data.expedition && `보물 ${state.treasures.length}개 · `}{state.gold} G</p>
      </section>}
    </main>
  </>
}

export default function App() {
  const localGraphics = useLocalGraphics()
  const [web, setWeb] = useState(() => createWebHexCampaign())
  const [jo, setJo] = useState<CampaignData>()
  const [entries, setEntries] = useState<StageEntry[]>([])
  const [loaded, setLoaded] = useState(!import.meta.env.DEV)
  const [showWeb, setShowWeb] = useState(false)
  const [expedition, setExpedition] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!import.meta.env.DEV) return
    void Promise.allSettled([loadStageSources(), loadStageCatalog()]).then(([sources, catalog]) => {
      const saved = catalog.status === 'fulfilled' ? catalog.value.entries : []
      setEntries(saved)
      setWeb(campaignWithStages(sources.status === 'fulfilled' ? sources.value.web : createWebHexCampaign(), saved))
      if (sources.status === 'fulfilled' && sources.value.jo) setJo(campaignWithStages(sources.value.jo, saved))
      setError([sources.status === 'fulfilled' && sources.value.warning,
        catalog.status === 'rejected' && '편집한 스테이지를 불러오지 못했습니다. 기본 스테이지를 사용합니다.'].filter(Boolean).join(' '))
    }).finally(() => setLoaded(true))
  }, [])
  if (!loaded) return <main><p role="status">전장 불러오는 중…</p></main>
  const data = expedition ? expeditionCampaign : !showWeb && jo ? jo : web
  return <LocalGraphicsContext.Provider value={localGraphics}>
    {error && <p role="alert">{error}</p>}
    <TroopLabels.Provider value={expedition ? expeditionTroopClasses : troopClasses}>
      <CampaignScreen key={expedition ? 'expedition' : data.source} data={data} web={web} jo={jo} entries={entries} switchCampaign={jo && (() => setShowWeb(!showWeb))} toggleExpedition={() => setExpedition(!expedition)} />
    </TroopLabels.Provider>
  </LocalGraphicsContext.Provider>
}
