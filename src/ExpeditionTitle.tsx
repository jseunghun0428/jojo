import { useState } from 'react'
import type { Campaign } from './campaign.ts'
import { chapters, expeditionCampaign } from './expedition.ts'
import './expedition.css'

const numerals = ['一', '二', '三', '四', '五']
type Props = { state: Campaign; onStart: () => void; onResume: () => void; onLegacy: () => void; onTrial?: () => void }

export function ExpeditionTitle({ state, onStart, onResume, onLegacy, onTrial }: Props) {
  const saved = state.phase !== 'draft' || state.roster.length > 0
  const cleared = state.phase === 'complete' ? 50 : Math.max(0, state.stage - (state.phase === 'camp' ? 0 : 1))
  const current = Math.min(49, cleared)
  const [section, setSection] = useState<'home' | 'route' | 'guide'>('home')
  const [chapter, setChapter] = useState(Math.floor(current / 10))
  const openChapter = (index: number) => { setChapter(index); setSection('route') }
  const start = () => {
    if (!saved || window.confirm('현재 칠령전기 원정 기록을 지우고 처음부터 시작할까요?')) onStart()
  }
  return <div className="expedition-shell">
    <header className="expedition-nav">
      <button className="expedition-brand" onClick={() => setSection('home')}><i aria-hidden="true">七</i> 칠령전기</button>
      <nav aria-label="원정 메뉴">{([['home', '원정 본영'], ['route', '전장 일람'], ['guide', '게임 안내']] as const).map(([id, label]) =>
        <button key={id} aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)}>{label}</button>)}</nav>
      <button className="legacy-link" onClick={onLegacy}>기존 원정 ↗</button>
    </header>
    <main className="expedition-content">
      {section === 'home' ? <>
        <section className="expedition-hero">
          <div className="hero-copy"><span className="hero-kicker">삼국지 전술 로그라이크</span>
            <h1>칠령전기<span>七嶺戰記</span></h1>
            <p>황건의 난에서 오장원까지.<br />장수를 모아 쉰 개의 전장을 돌파하세요.</p>
            <div className="expedition-actions">
              <button className="march" onClick={saved ? onResume : start}>{saved ? '원정 이어하기' : '원정 시작'} <span aria-hidden="true">⟶</span></button>
              <button onClick={saved ? start : () => setSection('route')}>{saved ? '새 원정' : '전장 살펴보기'}</button>
            </div>
          </div>
        </section>
        <section className="chapter-section"><div className="chapter-heading"><h2>원정 노정</h2><span>전장 돌파 <b>{String(cleared).padStart(2, '0')}</b> / 50</span></div>
          <div className="chapter-track">{chapters.map((item, i) => <button className="chapter-card" key={item.name}
            data-active={i === Math.floor(current / 10)} onClick={() => openChapter(i)}>
            <span className="chapter-seal" aria-hidden="true">{item.seal}</span>
            <small>제 {numerals[i]} 장</small><strong>{item.name}</strong>
            <span className="chapter-range">{String(i * 10 + 1).padStart(2, '0')} — {(i + 1) * 10} <span aria-hidden="true">↗</span></span>
          </button>)}</div>
        </section>
      </> : section === 'route' ? <section className="expedition-ledger">
        <h1>전장 일람</h1>
        <div className="ledger-tabs" role="group" aria-label="장 선택">{chapters.map((item, i) =>
          <button key={item.name} aria-pressed={i === chapter} onClick={() => setChapter(i)}>{item.name}</button>)}</div>
        <ol className="stage-index" start={chapter * 10 + 1}>{expeditionCampaign.stages.slice(chapter * 10, chapter * 10 + 10).map(stage =>
          <li key={stage.number}><b>{String(stage.number).padStart(2, '0')}</b><strong>{stage.name}</strong>
            <span>{stage.expedition?.landscape} · {stage.expedition?.chief ? stage.expedition.chief + ' 격파' : '적군 전멸'}</span>
            <small>{stage.number <= cleared ? '돌파' : stage.number === current + 1 ? '현재 전장' : '미도달'}</small>
            <span className="stage-officers">적장 {stage.enemies.length}명 · {stage.enemies.map(unit => unit.name).join(' · ')}</span></li>)}</ol>
      </section> : <section className="expedition-ledger expedition-guide"><h1>게임 안내</h1>
        <h2>출전과 조작</h2><p>코스트 10 안에서 장수를 고르고 총대장을 지정하세요. 전장에서는 부대 순서에 맞춰 이동할 육각 칸을 고릅니다. 현재 칸을 누르면 제자리에서 공격·전법·책략을 사용할 수 있습니다.</p>
        <h2>전의와 연계</h2><p>전의는 하루마다 8, 일반 공격 후 12 오릅니다. 전의가 60 이상이고 인접한 아군도 같은 적을 공격할 수 있다면 연계 타격이 발생합니다. 연계에 성공하면 전의 20을 소모합니다.</p>
        <h2>병력 배치</h2><p>최초 편성과 이후 야영지에서 출전 장수에게 1,000명부터 10,000명까지 배치할 수 있습니다. 총병력은 보유 장수 1명당 4,000명으로 계산하며 최대 12명까지 반영합니다. 모병 보상을 고르면 예비 병력이 1,000명 추가됩니다.</p>
        <h2>승리와 재도전</h2><p>각 장의 5전과 10전은 지정된 장수 격파가 목표입니다. 승리하면 세 보상 중 하나를 고르고 야영지에서 장수를 영입하거나 병력을 재배치하세요. 다음 전투는 배치한 병력과 최대 기력으로 시작합니다. 총대장이 쓰러지면 같은 전장에 다시 도전할 수 있습니다.</p>
        {onTrial && <button onClick={onTrial}>개발용 시험 전투 열기</button>}
      </section>}
    </main>
  </div>
}
