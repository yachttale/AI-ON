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

// 오늘 카드용: 현재 칸이 속한 영법(focus)과, 그 영법에서 칩으로 노출할 창을 추출.
// 창 = focus 영법의 (미통과 ∪ keepPassedIds) 단계를 ladder_order 순으로 size개.
// keepPassedIds(=오늘 통과)는 통과해도 수업 끝까지 칩에 남기기 위함.
export function selectCardWindow(
  strokes: StrokeLadderView[],
  opts: { size?: number; keepPassedIds?: Set<string> } = {},
): { focus: StrokeLadderView | null; steps: LadderStepView[] } {
  const size = opts.size ?? 8
  const keep = opts.keepPassedIds ?? new Set<string>()
  if (strokes.length === 0) return { focus: null, steps: [] }

  // 현재 단계(isCurrent)가 있는 영법 → 없으면 미통과 단계가 남은 첫 영법 → 없으면 마지막 영법
  const flat = strokes.flatMap(s => s.tracks.flatMap(t => t.steps))
  const currentStep = flat.find(s => s.isCurrent)
  const focusKey = currentStep?.stroke_key
    ?? strokes.find(s => s.tracks.some(t => t.steps.some(st => !st.passed)))?.stroke_key
    ?? strokes[strokes.length - 1].stroke_key
  const focus = strokes.find(s => s.stroke_key === focusKey) ?? null
  if (!focus) return { focus: null, steps: [] }

  const steps = focus.tracks
    .flatMap(t => t.steps)
    .filter(s => !s.passed || keep.has(s.id))
    .sort((a, b) => a.ladder_order - b.ladder_order)
    .slice(0, size)
  return { focus, steps }
}
