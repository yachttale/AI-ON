import { describe, it, expect } from 'vitest'
import { computeCurrentStrokeKey } from '@/lib/v2/data'

const ladderStep = (id: string, stroke_key: string) =>
  ({ id, step_kind: 'ladder' as const, stroke_key })
const repeatableStep = (id: string, stroke_key: string) =>
  ({ id, step_kind: 'repeatable' as const, stroke_key })

describe('computeCurrentStrokeKey', () => {
  it('미통과 ladder 있으면 그 stroke_key 반환', () => {
    const steps = [ladderStep('a', 'beginner'), ladderStep('b', 'free')]
    expect(computeCurrentStrokeKey(steps, new Set(['a']))).toBe('free')
  })

  it('ladder 전부 통과 + 통과 이력 있으면 master', () => {
    const steps = [ladderStep('a', 'butterfly'), repeatableStep('b', 'master')]
    expect(computeCurrentStrokeKey(steps, new Set(['a']))).toBe('master')
  })

  it('통과 이력 없으면 null (신입)', () => {
    const steps = [ladderStep('a', 'beginner')]
    expect(computeCurrentStrokeKey(steps, new Set())).toBeNull()
  })

  it('repeatable만 있어도 통과 없으면 null', () => {
    const steps = [repeatableStep('a', 'master')]
    expect(computeCurrentStrokeKey(steps, new Set())).toBeNull()
  })
})
