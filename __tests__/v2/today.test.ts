import { describe, it, expect } from 'vitest'
import { buildTodayCards, type TodayStudent } from '@/lib/v2/today'

const students: TodayStudent[] = [
  { id: 'a', name: '김', grade: '초4', schedule: '월6시/수6시' },
  { id: 'b', name: '이', grade: null, schedule: '금6시' },
]

describe('buildTodayCards', () => {
  it('오늘 요일 스케줄 학생만, 출결·바퀴수 머지 (월요일=1)', () => {
    const cards = buildTodayCards(students, new Map([['a', { attendance: '출석', laps: 12 }]]), 1)
    expect(cards.map(c => c.id)).toEqual(['a'])
    expect(cards[0].attendance).toBe('출석'); expect(cards[0].laps).toBe(12)
  })
  it('해당 요일 없으면 빈 목록 (일요일=0)', () => {
    expect(buildTodayCards(students, new Map(), 0)).toEqual([])
  })
})
