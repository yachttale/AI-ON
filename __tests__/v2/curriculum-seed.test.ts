import { describe, it, expect } from 'vitest'
import { buildSeedRows } from '@/lib/v2/curriculum-seed'

describe('buildSeedRows', () => {
  const seed = buildSeedRows('ver-1')

  it('영법 6개, freestyle 포함', () => {
    expect(seed.strokes).toHaveLength(6)
    expect(seed.strokes.map(s => s.key)).toContain('freestyle')
  })

  it('단계 총 69개, ladder_order=원본 order', () => {
    expect(seed.steps).toHaveLength(69)
    expect(seed.steps.find(s => s.key === 'freestyle.없이.25m완주')?.ladder_order).toBe(24)
  })

  it('각 영법 첫 완주(25m 완주)만 is_first_completion, 총 4개', () => {
    const fc = seed.steps.filter(s => s.is_first_completion)
    expect(fc).toHaveLength(4)
    expect(fc.every(s => s.label === '25m 완주')).toBe(true)
  })

  it('25m 완주는 시간+스트로크 측정', () => {
    const f25 = seed.steps.find(s => s.key === 'freestyle.없이.25m완주')!
    expect(f25.is_first_completion).toBe(true)
    expect(f25.measure_spec).toEqual(['time_sec', 'stroke_count'])
  })

  it('킥 드릴/물적응은 완주 아님·측정 없음 (정규식 오판 방지)', () => {
    const kick = seed.steps.find(s => s.key === 'freestyle.킥판+헬퍼.5m')!
    expect(kick.is_first_completion).toBe(false)
    expect(kick.measure_spec).toEqual([])
    const dive = seed.steps.find(s => s.key === 'beginner.잠수_코')!
    expect(dive.measure_spec).toEqual([])
  })

  it('마스터 거리는 시간 측정', () => {
    const m = seed.steps.find(s => s.key === 'master.200m')!
    expect(m.measure_spec).toEqual(['time_sec'])
  })

  it('모든 step은 stroke_key로 연결', () => {
    expect(seed.steps.every(s => seed.strokes.some(st => st.key === s.stroke_key))).toBe(true)
  })
})
