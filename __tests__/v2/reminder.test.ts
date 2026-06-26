import { describe, it, expect } from 'vitest'
import { computePendingByInstructor } from '@/lib/v2/reminder'

describe('computePendingByInstructor', () => {
  it('요일 배정 + 미기록 학생을 강사별로 집계', () => {
    const r = computePendingByInstructor({
      students: [
        { id: 's1', schedule: null, instructorId: null },
        { id: 's2', schedule: null, instructorId: 'i1' }, // 예정 아님(schedule 없음·배정 없음)
      ],
      dayAssign: new Map([['s1', 'i1']]),
      recordedStudentIds: new Set(),
      yesterdayWeekday: 1,
    })
    expect(r.get('i1')).toBe(1)
  })

  it('이미 기록한 학생은 제외', () => {
    const r = computePendingByInstructor({
      students: [{ id: 's1', schedule: null, instructorId: null }],
      dayAssign: new Map([['s1', 'i1']]),
      recordedStudentIds: new Set(['s1']),
      yesterdayWeekday: 1,
    })
    expect(r.get('i1')).toBeUndefined()
  })

  it('요일 배정이 고정 담당보다 우선', () => {
    const r = computePendingByInstructor({
      students: [{ id: 's1', schedule: null, instructorId: 'fixed' }],
      dayAssign: new Map([['s1', 'dayInst']]),
      recordedStudentIds: new Set(),
      yesterdayWeekday: 1,
    })
    expect(r.get('dayInst')).toBe(1)
    expect(r.get('fixed')).toBeUndefined()
  })

  it('담당 강사 없으면 집계 안 함', () => {
    const r = computePendingByInstructor({
      students: [{ id: 's1', schedule: null, instructorId: null }],
      dayAssign: new Map([['s1', '']]),
      recordedStudentIds: new Set(),
      yesterdayWeekday: 1,
    })
    // dayAssign 값이 빈 문자열이면 instructor falsy → 제외
    expect([...r.values()].reduce((a, b) => a + b, 0)).toBe(0)
  })
})
