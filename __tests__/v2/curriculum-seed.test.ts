import { describe, it, expect } from 'vitest'
import { buildSeedRows } from '@/lib/v2/curriculum-seed'

describe('buildSeedRows (확정 시트 v1)', () => {
  const seed = buildSeedRows('ver-1')

  it('영법 7개(초보·자유형·배영·평영·접영·마스터·기타)', () => {
    expect(seed.strokes).toHaveLength(7)
    expect(seed.strokes.map(s => s.key)).toEqual([
      'beginner', 'freestyle', 'backstroke', 'breaststroke', 'butterfly', 'master', 'etc',
    ])
  })

  it('단계 총 144개', () => {
    expect(seed.steps).toHaveLength(144)
  })

  it('step.key는 전부 유일', () => {
    const keys = seed.steps.map(s => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('ladder_order는 1..N 연속(시트 순서 보존)', () => {
    const orders = seed.steps.map(s => s.ladder_order)
    expect(orders).toEqual(Array.from({ length: seed.steps.length }, (_, i) => i + 1))
  })

  it('측정은 시트 컬럼대로: 시간=time_sec, 시간+스트로크=time_sec+stroke_count', () => {
    const free = seed.steps.find(s => s.key === 'freestyle.kb_helper.6')!
    expect(free.label).toBe('발차기 25m')
    expect(free.measure_spec).toEqual(['time_sec'])

    const combo = seed.steps.find(s => s.key === 'freestyle.kb_helper.23')!
    expect(combo.label).toBe('자유형 콤비네에션 25m')
    expect(combo.measure_spec).toEqual(['time_sec', 'stroke_count'])
  })

  it('측정 없는 단계는 measure_spec 빈 배열', () => {
    const dive = seed.steps.find(s => s.key === 'beginner.water.1')!
    expect(dive.measure_spec).toEqual([])
  })

  it('첫완주(O) 컬럼대로 총 9개', () => {
    const fc = seed.steps.filter(s => s.is_first_completion)
    expect(fc).toHaveLength(9)
    expect(fc.every(s => /25m|200M/.test(s.label))).toBe(true)
  })

  it('step_kind: 마스터·영법별 50m=repeatable, 턴/스타트/잠영25M=counter, 구르기=single, 나머지=ladder', () => {
    const byKind = (k: string) => seed.steps.filter(s => s.step_kind === k).length
    expect(byKind('repeatable')).toBe(9)   // 50m 바퀴 4 + 마스터 5
    expect(byKind('counter')).toBe(5)      // 턴 2 + 스타트 2 + 잠영 25M 1
    expect(byKind('single')).toBe(5)       // 초보 구르기류(앞·옆·뒷구르기·물구나무·물대포)
    expect(byKind('ladder')).toBe(125)

    expect(seed.steps.find(s => s.key === 'master.im.1')!.step_kind).toBe('repeatable')
    const sub25 = seed.steps.find(s => s.stroke_key === 'etc' && s.label === '25M')!
    expect(sub25.step_kind).toBe('counter')
  })

  it('접영 돌핀킥 킥판 25m 중복 제거(1회만)', () => {
    const dup = seed.steps.filter(s => s.track_key === 'dolphin' && s.label === '킥판 25m')
    expect(dup).toHaveLength(1)
  })

  it('모든 step은 stroke_key·track_key로 연결', () => {
    expect(seed.steps.every(s =>
      seed.strokes.some(st => st.key === s.stroke_key) &&
      seed.tracks.some(t => t.stroke_key === s.stroke_key && t.key === s.track_key),
    )).toBe(true)
  })
})
