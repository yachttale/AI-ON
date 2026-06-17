// lib/v2/ladder.ts — 영법별 사다리 뷰 모델(순수). 진도·베이스라인 화면 공용.
import type { MetricType, StepKind, ProgressSource } from '@/types/v2'

export interface LadderInputStep {
  id: string; stroke_key: string; stroke_label: string; color: string | null
  track_key: string; track_label: string
  key: string; label: string; ladder_order: number
  step_kind: StepKind; measure_spec: MetricType[]; is_first_completion: boolean
}
export interface LadderStepView extends LadderInputStep {
  passed: boolean; passSource: ProgressSource | null; attemptCount: number; isCurrent: boolean
}
export interface LadderTrackView { track_key: string; track_label: string; steps: LadderStepView[] }
export interface StrokeLadderView { stroke_key: string; stroke_label: string; color: string | null; tracks: LadderTrackView[] }

export function buildStrokeLadders(
  steps: LadderInputStep[],
  passedIds: Set<string>,
  sourceById: Map<string, ProgressSource>,
  attemptById: Map<string, number>,
): StrokeLadderView[] {
  const sorted = [...steps].sort((a, b) => a.ladder_order - b.ladder_order)
  const currentId = sorted.find(s => s.step_kind === 'ladder' && !passedIds.has(s.id))?.id ?? null

  const strokes: StrokeLadderView[] = []
  for (const s of sorted) {
    let stroke = strokes.find(x => x.stroke_key === s.stroke_key)
    if (!stroke) { stroke = { stroke_key: s.stroke_key, stroke_label: s.stroke_label, color: s.color, tracks: [] }; strokes.push(stroke) }
    let track = stroke.tracks.find(t => t.track_key === s.track_key)
    if (!track) { track = { track_key: s.track_key, track_label: s.track_label, steps: [] }; stroke.tracks.push(track) }
    track.steps.push({
      ...s,
      passed: passedIds.has(s.id),
      passSource: sourceById.get(s.id) ?? null,
      attemptCount: attemptById.get(s.id) ?? 0,
      isCurrent: s.id === currentId,
    })
  }
  return strokes
}
