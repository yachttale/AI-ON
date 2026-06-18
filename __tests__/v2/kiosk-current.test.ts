import { describe, it, expect } from 'vitest'
import { deriveCurrentStep } from '@/lib/v2/kiosk-current'
import type { StrokeLadderView } from '@/lib/v2/ladder'

// 테스트용 StrokeLadderView 헬퍼
function makeStep(id: string, label: string, isCurrent: boolean, passed: boolean, step_kind: 'ladder' | 'counter' | 'single' | 'repeatable' = 'ladder') {
  return {
    id, label, isCurrent, passed, step_kind,
    stroke_key: 'freestyle', stroke_label: '자유형', color: null,
    track_key: 'kb', track_label: '킥판',
    key: id, ladder_order: 1,
    measure_spec: [], is_first_completion: false,
    passSource: null, attemptCount: 0,
  }
}

function makeStroke(trackSteps: ReturnType<typeof makeStep>[]): StrokeLadderView {
  return {
    stroke_key: 'freestyle', stroke_label: '자유형', color: null,
    tracks: [{ track_key: 'kb', track_label: '킥판', steps: trackSteps }],
  }
}

describe('deriveCurrentStep', () => {
  it('isCurrent인 ladder 단계를 반환하고 같은 트랙 다른 ladder 단계를 siblings로 반환', () => {
    const steps = [
      makeStep('s1', '발차기', false, true),
      makeStep('s2', '발차기 25m', true, false),
      makeStep('s3', '풀스트로크', false, false),
    ]
    const result = deriveCurrentStep([makeStroke(steps)])
    expect(result.currentStepId).toBe('s2')
    expect(result.currentStepLabel).toBe('발차기 25m')
    expect(result.siblings).toEqual([
      { id: 's1', label: '발차기' },
      { id: 's3', label: '풀스트로크' },
    ])
  })

  it('step_kind가 ladder가 아닌 단계는 siblings에 포함 안 됨', () => {
    const steps = [
      makeStep('s1', '발차기', true, false, 'ladder'),
      makeStep('s2', '물 적응', false, false, 'single'),
      makeStep('s3', '반복 연습', false, false, 'repeatable'),
    ]
    const result = deriveCurrentStep([makeStroke(steps)])
    expect(result.currentStepId).toBe('s1')
    expect(result.siblings).toEqual([]) // single/repeatable 제외
  })

  it('현재 단계가 없으면 null 반환, siblings 빈 배열', () => {
    const steps = [
      makeStep('s1', '발차기', false, true),
      makeStep('s2', '발차기 25m', false, true),
    ]
    const result = deriveCurrentStep([makeStroke(steps)])
    expect(result.currentStepId).toBeNull()
    expect(result.currentStepLabel).toBeNull()
    expect(result.siblings).toEqual([])
  })

  it('단계가 없으면 null 반환', () => {
    const result = deriveCurrentStep([])
    expect(result.currentStepId).toBeNull()
    expect(result.siblings).toEqual([])
  })

  it('여러 영법 중 첫 isCurrent 단계를 반환', () => {
    const stroke1: StrokeLadderView = {
      stroke_key: 'freestyle', stroke_label: '자유형', color: null,
      tracks: [{ track_key: 'kb', track_label: '킥판', steps: [makeStep('a1', '단계A', false, true)] }],
    }
    const stroke2: StrokeLadderView = {
      stroke_key: 'backstroke', stroke_label: '배영', color: null,
      tracks: [{ track_key: 'kb2', track_label: '킥판2', steps: [makeStep('b1', '단계B', true, false)] }],
    }
    const result = deriveCurrentStep([stroke1, stroke2])
    expect(result.currentStepId).toBe('b1')
    expect(result.currentStepLabel).toBe('단계B')
  })
})
