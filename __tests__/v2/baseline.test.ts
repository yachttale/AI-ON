import { describe, it, expect } from 'vitest'
import { expandBaselineSteps, type BaselineInput } from '@/lib/v2/baseline'

const steps = [
  { id: 'a', stroke_key: 'freestyle', ladder_order: 1, step_kind: 'ladder' as const },
  { id: 'b', stroke_key: 'freestyle', ladder_order: 2, step_kind: 'ladder' as const },
  { id: 'c', stroke_key: 'freestyle', ladder_order: 3, step_kind: 'ladder' as const },
  { id: 'd', stroke_key: 'freestyle', ladder_order: 4, step_kind: 'repeatable' as const },
  { id: 'e', stroke_key: 'backstroke', ladder_order: 5, step_kind: 'ladder' as const },
]

describe('expandBaselineSteps', () => {
  it('영법별 선택칸 이하 ladder만, repeatable·타영법 제외', () => {
    const input: BaselineInput = { freestyle: 2 } // 자유형 ladder_order 2까지
    expect(expandBaselineSteps(steps, input).sort()).toEqual(['a', 'b'])
  })
  it('선택 안 한 영법은 미포함', () => {
    expect(expandBaselineSteps(steps, {})).toEqual([])
  })
  it('repeatable은 경계 안이어도 제외', () => {
    expect(expandBaselineSteps(steps, { freestyle: 4 }).sort()).toEqual(['a', 'b', 'c'])
  })
})
