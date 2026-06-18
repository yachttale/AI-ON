import { describe, it, expect } from 'vitest'
import { buildKioskRoster } from '@/lib/v2/kiosk'
import type { TodayStudent } from '@/lib/v2/today'

const mk = (id: string, name: string, schedule: string, instructor_id: string): TodayStudent =>
  ({ id, name, grade: '초2', schedule, instructor_id, instructor_name: null })

describe('buildKioskRoster', () => {
  it('현재 시간·해당 강사·오늘 요일 학생만, 최대 5명', () => {
    const inst = 'A'
    const students = [
      mk('1', '가', '월6시', inst), mk('2', '나', '월6시', inst),
      mk('3', '다', '월6시', inst), mk('4', '라', '월6시', inst),
      mk('5', '마', '월6시', inst), mk('6', '바', '월6시', inst), // 6번째 잘림
      mk('7', '사', '월7시', inst),   // 다른 시간
      mk('8', '아', '월6시', 'B'),    // 다른 강사
      mk('9', '자', '화6시', inst),   // 다른 요일
    ]
    // 월요일(JS day=1), 18시(6시 오후)
    const slot = buildKioskRoster(students, inst, new Set(), 1, 18)
    expect(slot.hour).toBe(18)
    expect(slot.students.map(s => s.id)).toEqual(['1','2','3','4','5'])
  })

  it('입력 완료 학생은 done=true', () => {
    const slot = buildKioskRoster([mk('1','가','월6시','A')], 'A', new Set(['1']), 1, 18)
    expect(slot.students[0].done).toBe(true)
  })

  it('현재 시간 슬롯이 없으면 오늘 남은 가장 가까운 다음 시간', () => {
    const slot = buildKioskRoster([mk('1','가','월7시','A')], 'A', new Set(), 1, 18)
    expect(slot.hour).toBe(19)
    expect(slot.students.map(s => s.id)).toEqual(['1'])
  })
})
