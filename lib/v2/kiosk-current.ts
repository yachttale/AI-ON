// lib/v2/kiosk-current.ts — 사다리 뷰에서 현재 단계·형제 단계 추출(순수).
import type { StrokeLadderView } from './ladder'

export interface CurrentStepInfo {
  currentStepId: string | null
  currentStepLabel: string | null
  siblings: { id: string; label: string }[]
}

/**
 * StrokeLadderView[] 에서 현재 단계(isCurrent === true인 첫 번째 ladder 단계)와
 * 같은 트랙의 다른 ladder 단계(siblings)를 추출한다.
 *
 * - 현재 단계가 없으면(전부 통과 or 단계 없음) currentStepId/Label=null, siblings=[]
 * - siblings는 같은 트랙 내 step_kind==='ladder'인 단계에서 현재 단계를 제외한 것
 */
export function deriveCurrentStep(strokes: StrokeLadderView[]): CurrentStepInfo {
  for (const stroke of strokes) {
    for (const track of stroke.tracks) {
      const current = track.steps.find(s => s.isCurrent)
      if (!current) continue
      const siblings = track.steps
        .filter(s => s.step_kind === 'ladder' && s.id !== current.id)
        .map(s => ({ id: s.id, label: s.label }))
      return {
        currentStepId: current.id,
        currentStepLabel: current.label,
        siblings,
      }
    }
  }
  return { currentStepId: null, currentStepLabel: null, siblings: [] }
}
