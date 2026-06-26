// lib/v2/reminder.ts — '어제 미입력' 판정(순수 함수). cron 발송에서 사용.
import { getTodayEntries } from '@/lib/schedule'

export interface ReminderStudent { id: string; schedule: string | null; instructorId: string | null }
export interface ReminderInputs {
  students: ReminderStudent[]
  dayAssign: Map<string, string>     // studentId -> instructorId (어제 요일 배정, 있으면 우선)
  recordedStudentIds: Set<string>    // 어제 기록(세션/진도/측정 중 하나라도) 있는 학생
  yesterdayWeekday: number           // 0=일 ~ 6=토 (JS getDay 기준)
}

// 강사별 '어제 수업 예정인데 기록 안 한' 학생 수.
// 예정 판정: schedule 상 어제 요일에 수업이 있거나, 어제 요일 배정(student_day_instructors)이 있으면.
// 담당 강사: 요일 배정 우선, 없으면 고정 담당.
export function computePendingByInstructor(input: ReminderInputs): Map<string, number> {
  const result = new Map<string, number>()
  for (const s of input.students) {
    const scheduled =
      (s.schedule != null && getTodayEntries(s.schedule, input.yesterdayWeekday).length > 0) ||
      input.dayAssign.has(s.id)
    if (!scheduled) continue
    if (input.recordedStudentIds.has(s.id)) continue
    const instructor = input.dayAssign.get(s.id) ?? s.instructorId
    if (!instructor) continue
    result.set(instructor, (result.get(instructor) ?? 0) + 1)
  }
  return result
}
