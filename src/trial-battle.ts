import { createCampaign } from './campaign.ts'
import type { Campaign } from './campaign.ts'
import { newBattle } from './combat.ts'
import { recommendedIds } from './data.ts'
import type { Stage } from './data.ts'
import type { Grid } from './grid.ts'
import { createHexStage } from './hex-stages.ts'
import { hexTrialStage, newHexTrial } from './hex-trial.ts'
import { webCampaign } from './jo-game.ts'
import type { CampaignData } from './jo-game.ts'

export type TrialStageId = number | 'sandbox'
export type TrialSetup = { data: CampaignData; stage: Stage; sandbox?: true }

export function trialSetup(data: CampaignData, id: TrialStageId, grid: Grid): TrialSetup | undefined {
  if (id === 'sandbox') return grid === 'hex' ? { data: webCampaign, stage: hexTrialStage, sandbox: true } : undefined
  const original = data.stages.find(({ number }) => number === id)
  if (!original) return undefined
  const stage = grid === 'hex' ? createHexStage(data, original) : original
  return stage && { data, stage }
}

export function startTrial(setup: TrialSetup): Campaign {
  const { stage, data, sandbox } = setup
  const [captain] = recommendedIds
  const battle = sandbox ? newHexTrial() : newBattle(stage, recommendedIds, captain, {}, data.officers)
  return {
    ...createCampaign(), stage: stage.number, phase: 'battle', battle, captain,
    roster: [...recommendedIds], lineup: [...recommendedIds],
  }
}
