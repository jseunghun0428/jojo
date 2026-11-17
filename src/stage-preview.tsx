import { useEffect, useState } from 'react'
import { TrialBattle } from './App.tsx'
import { LocalGraphicsContext, useLocalGraphics } from './local-graphics.ts'
import type { TrialSetup } from './trial-battle.ts'

export default function StagePreview() {
  const graphics = useLocalGraphics()
  const [setup, setSetup] = useState<TrialSetup>()
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.origin === location.origin && event.source === window.opener && event.data?.type === 'iron-pass-stage-preview') {
        setSetup(event.data.setup)
      }
    }
    window.addEventListener('message', receive)
    window.opener?.postMessage({ type: 'iron-pass-stage-preview-ready' }, location.origin)
    return () => window.removeEventListener('message', receive)
  }, [])
  if (!setup) return <main><p role="status">{window.opener ? '편집기에서 전장 설정을 불러오는 중…' : '스테이지 편집기에서 시험 전투를 시작하세요.'}</p></main>
  return <LocalGraphicsContext.Provider value={graphics}>
    <TrialBattle setup={setup} exitLabel="편집기로 돌아가기" onExit={() => { window.opener?.focus(); window.close() }} />
  </LocalGraphicsContext.Provider>
}
