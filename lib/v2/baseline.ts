// lib/v2/baseline.ts — 베이스라인 전개(순수): 영법별 도달 칸 → 통과시킬 ladder step_id 목록
import type { StepKind } from '@/types/v2'

export interface BaselineStep { id: string; stroke_key: string; ladder_order: number; step_kind: StepKind }
export type BaselineInput = Record<string, number> // stroke_key → 도달 ladder_order (포함)

export function expandBaselineSteps(steps: BaselineStep[], input: BaselineInput): string[] {
  return steps
    .filter(s => s.step_kind === 'ladder' && input[s.stroke_key] !== undefined && s.ladder_order <= input[s.stroke_key])
    .map(s => s.id)
}
