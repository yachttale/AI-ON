// types/v2.ts — v2 데이터 토대 타입
export type Role = 'instructor' | 'director'
export type Attendance = '출석' | '지각' | '결석'
export type AbsenceReason = '입원' | '아파서' | '다른일정' | '여행' | '기타'
export type Difficulty = '어려워함' | '조금어려워함' | '중간' | '조금쉽게' | '쉽게해결'
export type MetricType = 'laps' | 'distance_m' | 'time_sec' | 'stroke_count' | 'attempt'
// step_kind: ladder=계단식(상위 통과 시 하위 자동) / counter=누적 연습+완성(턴·스타트·잠영25M) / repeatable=반복 기록(50m바퀴·마스터거리) / single=개별 통과(구르기 등, cascade 없음)
export type StepKind = 'ladder' | 'counter' | 'repeatable' | 'single'
export type CurriculumStatus = 'draft' | 'active' | 'archived'
export type ProgressSource = 'observed' | 'baseline'

export interface CurriculumVersion {
  id: string; label: string; status: CurriculumStatus
  created_at: string; activated_at: string | null; archived_at: string | null
}
export interface Stroke {
  id: string; key: string; label: string; display_order: number; color: string | null
}
export interface SkillTrack {
  id: string; stroke_id: string; key: string; label: string; display_order: number
}
export interface SkillStep {
  id: string; curriculum_version_id: string; stroke_id: string; track_id: string | null
  key: string; label: string; ladder_order: number
  is_first_completion: boolean; measure_spec: MetricType[]; step_kind: StepKind; is_active: boolean; created_at: string
}
export interface Student {
  id: string; name: string; birthdate: string | null; sex: '남' | '여' | null
  enrolled_on: string | null; grade: string | null; schedule: string | null
  instructor_id: string | null; is_active: boolean
  withdrawal_status: 'pending' | 'approved' | null
  withdrawal_requested_by: string | null; withdrawal_note: string | null; created_at: string
}
export interface LessonTemplate {
  id: string; instructor_id: string; name: string
  is_active: boolean; is_studio_standard: boolean; created_at: string
}
export interface LessonTemplateItem {
  id: string; template_id: string; seq: number
  stroke_id: string | null; label: string; default_laps: number
}
export interface Session {
  id: string; session_date: string; student_id: string; instructor_id: string
  attendance: Attendance; absence_reason: AbsenceReason | null
  template_id: string | null; focus_stroke_id: string | null; memo: string | null; created_at: string
}
export interface Measurement {
  id: string; student_id: string; metric_type: MetricType; value: number; unit: string | null
  measured_on: string; session_id: string | null; skill_step_id: string | null
  instructor_id: string | null; note: string | null; created_at: string
}
export interface SkillProgress {
  id: string; student_id: string; skill_step_id: string; status: 'passed'
  source: ProgressSource
  difficulty: Difficulty | null; passed_at: string; source_session_id: string | null
  instructor_id: string | null; step_key_snapshot: string; ladder_order_snapshot: number
  note: string | null; created_at: string
}
export interface Media {
  id: string; student_id: string; captured_on: string; storage_path: string
  type: 'video' | 'image'; skill_step_id: string | null
  feedback_draft: string | null; feedback_final: string | null
  sent_to_parent_at: string | null; created_at: string
}
