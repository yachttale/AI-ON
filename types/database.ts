export type Role = 'instructor' | 'director'
export type Attendance = '출석' | '지각' | '결석'
export type AbsenceReason = '입원' | '아파서' | '다른일정' | '여행' | '기타'
export type Difficulty = '어려워함' | '조금어려워함' | '중간' | '조금쉽게' | '쉽게해결'

export interface Profile {
  id: string
  name: string
  role: Role
  created_at: string
}

export interface Student {
  id: string
  name: string
  grade: string | null
  schedule: string
  instructor_id: string | null
  is_active: boolean
  withdrawal_status: 'pending' | 'approved' | null
  withdrawal_requested_by: string | null
  withdrawal_note: string | null
  created_at: string
}

export interface SessionLog {
  id: string
  session_date: string
  student_id: string
  instructor_id: string
  attendance: Attendance
  absence_reason: AbsenceReason | null
  memo: string | null
  created_at: string
}

export interface SkillCheckpoint {
  id: string
  student_id: string
  instructor_id: string | null
  skill_key: string
  difficulty: Difficulty | null
  passed_at: string
  memo: string | null
  created_at: string
}

export interface SwimDistance {
  id: string
  student_id: string
  instructor_id: string | null
  logged_date: string
  distance_meters: number
  memo: string | null
  created_at: string
}
