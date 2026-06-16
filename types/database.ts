export type Role = 'instructor' | 'director'
export type Attendance = '출석' | '지각' | '결석'
export type SessionStatus = '진행중' | '통과'
export type AbsenceReason = '입원' | '아파서' | '다른일정' | '여행' | '기타'

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
  stroke: string | null
  stage: string | null
  status: SessionStatus | null
  memo: string | null
  absence_reason: AbsenceReason | null
  created_at: string
}

export interface CurriculumStandard {
  id: string
  stroke: string
  stage: string
  description: string | null
  target_sessions: number | null
}

export interface SwimDistance {
  id: string
  student_id: string
  logged_date: string
  stroke: string
  distance_m: number
  created_at: string
}

export interface PlannedMakeup {
  id: string
  student_id: string
  session_date: string
  created_by: string | null
  created_at: string
}

export interface CompletionRecord {
  id: string
  student_id: string
  stroke: string
  completed_date: string
  total_sessions: number | null
  record_seconds: number | null
  instructor_id: string | null
  examiner_id: string | null
  passed: boolean
  notes: string | null
  created_at: string
}
