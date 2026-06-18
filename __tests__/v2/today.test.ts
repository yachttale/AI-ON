import { describe, it, expect } from 'vitest'
import { buildTodayCards, type TodayStudent, type TodaySession } from '@/lib/v2/today'

const students: TodayStudent[] = [
  { id: 'a', name: '김', grade: '초4', schedule: '월6시/수6시', instructor_id: 'me', instructor_name: '나' },
  { id: 'b', name: '이', grade: null, schedule: '금6시', instructor_id: null, instructor_name: null },
  { id: 'c', name: '박', grade: null, schedule: '월5시', instructor_id: 'other', instructor_name: '김민선' },
  { id: 'd', name: '최', grade: null, schedule: '월7시', instructor_id: null, instructor_name: null },
]

const sessA: TodaySession = { attendance: '출석', laps: 12, status: null, inputSource: null, reportedStepId: null }
const sessPending: TodaySession = { attendance: '출석', laps: 3, status: 'pending', inputSource: 'child', reportedStepId: 'step-1' }
const sessConfirmed: TodaySession = { attendance: '출석', laps: 5, status: 'confirmed', inputSource: 'child', reportedStepId: 'step-1' }

describe('buildTodayCards', () => {
  it('월요일(=1): 내 반은 mine, 미배정·타반은 assignable, 다른 요일은 제외', () => {
    const { mine, assignable } = buildTodayCards(
      students, new Map([['a', sessA]]), 'me', 1,
    )
    expect(mine.map(c => c.id)).toEqual(['a'])
    expect(mine[0].attendance).toBe('출석'); expect(mine[0].laps).toBe(12); expect(mine[0].mine).toBe(true)
    expect(mine[0].status).toBeNull()
    expect(mine[0].inputSource).toBeNull()
    expect(mine[0].reportedStepId).toBeNull()
    expect(mine[0].reportedStep).toBeNull()
    // c(타반 월5시), d(미배정 월7시) → 가져오기. b(금6시)는 월요일 아님 → 제외
    expect(assignable.map(c => c.id)).toEqual(['c', 'd'])
    expect(assignable[0].mine).toBe(false)
  })

  it('일요일(=0): 양쪽 모두 빈 목록', () => {
    const { mine, assignable } = buildTodayCards(students, new Map(), 'me', 0)
    expect(mine).toEqual([]); expect(assignable).toEqual([])
  })

  it('pending 세션: status/inputSource/reportedStepId 카드에 반영', () => {
    const { mine } = buildTodayCards(
      students, new Map([['a', sessPending]]), 'me', 1,
    )
    expect(mine[0].status).toBe('pending')
    expect(mine[0].inputSource).toBe('child')
    expect(mine[0].reportedStepId).toBe('step-1')
    expect(mine[0].reportedStep).toBeNull()  // stepById 미전달 → null
  })

  it('pending + reportedStepById 전달: reportedStep 객체 채워짐', () => {
    const stepMap = new Map([['step-1', { id: 'step-1', key: 'freestyle-1', ladder_order: 1, stroke_key: 'freestyle', label: '자유형 1단계' }]])
    const { mine } = buildTodayCards(
      students, new Map([['a', sessPending]]), 'me', 1, stepMap,
    )
    expect(mine[0].reportedStep).toMatchObject({ id: 'step-1', label: '자유형 1단계', stroke_key: 'freestyle' })
  })

  it('confirmed 세션: status confirmed 반영', () => {
    const { mine } = buildTodayCards(
      students, new Map([['a', sessConfirmed]]), 'me', 1,
    )
    expect(mine[0].status).toBe('confirmed')
  })
})
