import { describe, it, expect } from 'vitest'
import { buildTodayCards, type TodayStudent } from '@/lib/v2/today'

const students: TodayStudent[] = [
  { id: 'a', name: '김', grade: '초4', schedule: '월6시/수6시', instructor_id: 'me', instructor_name: '나' },
  { id: 'b', name: '이', grade: null, schedule: '금6시', instructor_id: null, instructor_name: null },
  { id: 'c', name: '박', grade: null, schedule: '월5시', instructor_id: 'other', instructor_name: '김민선' },
  { id: 'd', name: '최', grade: null, schedule: '월7시', instructor_id: null, instructor_name: null },
]

describe('buildTodayCards', () => {
  it('월요일(=1): 내 반은 mine, 미배정·타반은 assignable, 다른 요일은 제외', () => {
    const { mine, assignable } = buildTodayCards(
      students, new Map([['a', { attendance: '출석', laps: 12 }]]), 'me', 1,
    )
    expect(mine.map(c => c.id)).toEqual(['a'])
    expect(mine[0].attendance).toBe('출석'); expect(mine[0].laps).toBe(12); expect(mine[0].mine).toBe(true)
    // c(타반 월5시), d(미배정 월7시) → 가져오기. b(금6시)는 월요일 아님 → 제외
    expect(assignable.map(c => c.id)).toEqual(['c', 'd'])
    expect(assignable[0].mine).toBe(false)
  })
  it('일요일(=0): 양쪽 모두 빈 목록', () => {
    const { mine, assignable } = buildTodayCards(students, new Map(), 'me', 0)
    expect(mine).toEqual([]); expect(assignable).toEqual([])
  })
})
