import { describe, it, expect } from 'vitest'
import { lapsToMeters, sumDailyDistance, monthsBetween } from '@/lib/v2/metrics'

describe('lapsToMeters', () => {
  it('1바퀴 = 50m', () => { expect(lapsToMeters(1)).toBe(50) })
  it('3바퀴 = 150m', () => { expect(lapsToMeters(3)).toBe(150) })
  it('0바퀴 = 0m', () => { expect(lapsToMeters(0)).toBe(0) })
})

describe('sumDailyDistance', () => {
  it('laps 측정을 미터로 합산', () => {
    expect(sumDailyDistance([
      { metric_type: 'laps', value: 2 },
      { metric_type: 'laps', value: 1 },
      { metric_type: 'time_sec', value: 30 },
    ])).toBe(150)
  })
  it('laps 없으면 0', () => {
    expect(sumDailyDistance([{ metric_type: 'time_sec', value: 30 }])).toBe(0)
  })
})

describe('monthsBetween', () => {
  it('입문일→완주일 개월수(소수 1자리)', () => {
    expect(monthsBetween('2026-01-01', '2026-04-01')).toBeCloseTo(3.0, 1)
  })
})
