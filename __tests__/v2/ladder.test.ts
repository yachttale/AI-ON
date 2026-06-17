import { describe, it, expect } from 'vitest'
import { buildStrokeLadders, type LadderInputStep } from '@/lib/v2/ladder'

const steps: LadderInputStep[] = [
  { id: 's1', stroke_key: 'freestyle', stroke_label: '자유형', color: '#34d399', track_key: 'kb_helper', track_label: '킥판+헬퍼', key: 'freestyle.kb_helper.1', label: '발차기', ladder_order: 1, step_kind: 'ladder', measure_spec: [], is_first_completion: false },
  { id: 's2', stroke_key: 'freestyle', stroke_label: '자유형', color: '#34d399', track_key: 'kb_helper', track_label: '킥판+헬퍼', key: 'freestyle.kb_helper.2', label: '발차기 25m', ladder_order: 2, step_kind: 'ladder', measure_spec: ['time_sec'], is_first_completion: true },
  { id: 's3', stroke_key: 'etc', stroke_label: '기타', color: null, track_key: 'turn', track_label: '턴', key: 'etc.turn.1', label: '사이드턴', ladder_order: 3, step_kind: 'counter', measure_spec: [], is_first_completion: false },
]

describe('buildStrokeLadders', () => {
  const view = buildStrokeLadders(steps, new Set(['s1']), new Map([['s1', 'baseline']]), new Map([['s3', 7]]))

  it('영법→트랙→단계로 그룹', () => {
    expect(view.map(s => s.stroke_key)).toEqual(['freestyle', 'etc'])
    expect(view[0].tracks[0].steps).toHaveLength(2)
  })
  it('통과 상태·source 반영', () => {
    const s1 = view[0].tracks[0].steps[0]
    expect(s1.passed).toBe(true); expect(s1.passSource).toBe('baseline')
    expect(view[0].tracks[0].steps[1].passed).toBe(false)
  })
  it('counter 누적 횟수 반영, 현재 단계(첫 미통과 ladder) 표시', () => {
    expect(view[1].tracks[0].steps[0].attemptCount).toBe(7)
    const current = view[0].tracks[0].steps.find(s => s.isCurrent)
    expect(current?.id).toBe('s2') // s1 통과 → s2가 현재
  })
})
