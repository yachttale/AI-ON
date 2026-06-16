import { describe, it, expect } from 'vitest'
import { parseSchedule, getTodayEntries, formatScheduleDisplay } from '@/lib/schedule'

describe('parseSchedule', () => {
  it('단일 요일+시간 파싱', () => {
    expect(parseSchedule('월4시')).toEqual([{ day: '월', hour: 16 }])
  })

  it('같은 시간 여러 요일 파싱', () => {
    expect(parseSchedule('월수4시')).toEqual([
      { day: '월', hour: 16 },
      { day: '수', hour: 16 },
    ])
  })

  it('다른 시간 여러 요일 파싱', () => {
    expect(parseSchedule('월4시금7시')).toEqual([
      { day: '월', hour: 16 },
      { day: '금', hour: 19 },
    ])
  })

  it('복합 패턴 파싱', () => {
    expect(parseSchedule('월수4시금7시')).toEqual([
      { day: '월', hour: 16 },
      { day: '수', hour: 16 },
      { day: '금', hour: 19 },
    ])
  })

  it('7시 = 19시로 변환', () => {
    const result = parseSchedule('금7시')
    expect(result[0].hour).toBe(19)
  })
})

describe('getTodayEntries', () => {
  it('오늘 요일에 해당하는 항목만 반환', () => {
    const entries = getTodayEntries('월수4시', 1)
    expect(entries).toEqual([{ day: '월', hour: 16 }])
  })

  it('오늘 수업 없으면 빈 배열', () => {
    const entries = getTodayEntries('월4시', 2)
    expect(entries).toEqual([])
  })
})

describe('formatScheduleDisplay', () => {
  it('월4시 → 월 16:00', () => {
    expect(formatScheduleDisplay('월4시')).toBe('월 16:00')
  })

  it('월수4시 → 월,수 16:00', () => {
    expect(formatScheduleDisplay('월수4시')).toBe('월,수 16:00')
  })
})
