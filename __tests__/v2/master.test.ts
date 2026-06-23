import { describe, it, expect } from 'vitest'
import { computeCurrentStrokeKey } from '@/lib/v2/data'

const ladderStep = (id: string, stroke_key: string, ladder_order: number) =>
  ({ id, step_kind: 'ladder' as const, stroke_key, ladder_order })
const repeatableStep = (id: string, stroke_key: string, ladder_order = 999) =>
  ({ id, step_kind: 'repeatable' as const, stroke_key, ladder_order })

describe('computeCurrentStrokeKey', () => {
  it('미통과 ladder 있으면 그 stroke_key 반환', () => {
    const steps = [ladderStep('a', 'beginner', 0), ladderStep('b', 'free', 1)]
    expect(computeCurrentStrokeKey(steps, new Set(['a']))).toBe('free')
  })

  it('ladder 전부 통과 + 통과 이력 있으면 master', () => {
    const steps = [ladderStep('a', 'butterfly', 0), repeatableStep('b', 'master')]
    expect(computeCurrentStrokeKey(steps, new Set(['a']))).toBe('master')
  })

  it('종착(마지막 ladder) 통과했으면 중간 미통과 단계가 있어도 master', () => {
    // 정우양 케이스: 완주 후 자유형 중간에 신규 단계가 삽입돼 미통과로 남은 상황
    const steps = [
      ladderStep('a', 'free', 0),
      ladderStep('inserted', 'free', 1), // 나중에 삽입된 미통과 단계
      ladderStep('terminal', 'butterfly', 2), // 종착(최대 ladder_order)
    ]
    expect(computeCurrentStrokeKey(steps, new Set(['a', 'terminal']))).toBe('master')
  })

  it('종착 미통과면 첫 미통과 영법 반환', () => {
    const steps = [
      ladderStep('a', 'free', 0),
      ladderStep('b', 'backstroke', 1),
      ladderStep('terminal', 'butterfly', 2),
    ]
    expect(computeCurrentStrokeKey(steps, new Set(['a']))).toBe('backstroke')
  })

  it('통과 이력 없으면 null (신입)', () => {
    const steps = [ladderStep('a', 'beginner', 0)]
    expect(computeCurrentStrokeKey(steps, new Set())).toBeNull()
  })

  it('repeatable만 있어도 통과 없으면 null', () => {
    const steps = [repeatableStep('a', 'master')]
    expect(computeCurrentStrokeKey(steps, new Set())).toBeNull()
  })
})
