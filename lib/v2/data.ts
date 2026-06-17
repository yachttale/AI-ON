// lib/v2/data.ts — v2 서버 데이터 접근 레이어
import { createClient } from '@/lib/supabase/server'
import type { SkillStep, SkillProgress, Measurement, ProgressSource } from '@/types/v2'
import type { TodayStudent, TodaySession } from './today'
import { buildStrokeLadders, type LadderInputStep, type StrokeLadderView } from './ladder'

// 활성 커리큘럼의 단계 목록(영법·순서)
export async function getActiveCurriculumSteps(): Promise<SkillStep[]> {
  const supabase = await createClient()
  const { data: version } = await supabase
    .from('curriculum_versions').select('id').eq('status', 'active').single()
  if (!version) return []
  const { data, error } = await supabase
    .from('skill_steps').select('*')
    .eq('curriculum_version_id', version.id).eq('is_active', true)
    .order('ladder_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as SkillStep[]
}

// 학생이 통과한 step_id 집합
export async function getStudentPassedStepIds(studentId: string): Promise<Set<string>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('skill_progress').select('skill_step_id').eq('student_id', studentId)
  if (error) throw error
  return new Set((data ?? []).map((r: { skill_step_id: string }) => r.skill_step_id))
}

// 학생 현재 사다리 위치(아직 통과 안 한 첫 단계)
export async function getStudentLadderPosition(studentId: string): Promise<SkillStep | null> {
  const [steps, passed] = await Promise.all([
    getActiveCurriculumSteps(), getStudentPassedStepIds(studentId),
  ])
  return steps.find(s => !passed.has(s.id)) ?? null
}

// 단계 통과 기록(스냅샷 포함). source 미지정 시 DB 기본값 'observed'.
export async function passStep(args: {
  studentId: string; step: SkillStep; difficulty?: SkillProgress['difficulty']
  sourceSessionId?: string | null; instructorId?: string | null; note?: string | null
}): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('skill_progress').insert({
    student_id: args.studentId,
    skill_step_id: args.step.id,
    difficulty: args.difficulty ?? null,
    source_session_id: args.sourceSessionId ?? null,
    instructor_id: args.instructorId ?? null,
    step_key_snapshot: args.step.key,
    ladder_order_snapshot: args.step.ladder_order,
    note: args.note ?? null,
  })
  if (error) throw error
}

// 측정값 기록(데일리 바퀴수 / 완주 시간·스트로크 공용)
export async function recordMeasurement(m: Omit<Measurement, 'id' | 'created_at'>): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('measurements').insert(m)
  if (error) throw error
}

// 오늘 수업: 강사 본인 활성 학생 + 당일 출결/바퀴수
export async function getTodayStudentsRaw(instructorId: string): Promise<{ students: TodayStudent[]; sessionById: Map<string, TodaySession> }> {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)
  const { data: students, error } = await supabase
    .from('students').select('id,name,grade,schedule')
    .eq('instructor_id', instructorId).eq('is_active', true).order('name')
  if (error) throw error
  const ids = (students ?? []).map(s => s.id)
  const sessionById = new Map<string, TodaySession>()
  if (ids.length) {
    const { data: sessions } = await supabase
      .from('sessions').select('student_id,attendance').eq('session_date', today).in('student_id', ids)
    const { data: laps } = await supabase
      .from('measurements').select('student_id,value').eq('metric_type', 'laps').is('skill_step_id', null)
      .eq('measured_on', today).in('student_id', ids)
    const lapByStudent = new Map<string, number>()
    for (const l of laps ?? []) lapByStudent.set(l.student_id, Number(l.value))
    for (const s of sessions ?? []) sessionById.set(s.student_id, { attendance: s.attendance, laps: lapByStudent.get(s.student_id) ?? null })
    for (const [sid, v] of lapByStudent) if (!sessionById.has(sid)) sessionById.set(sid, { attendance: null, laps: v })
  }
  return { students: (students ?? []) as TodayStudent[], sessionById }
}

// 학생 영법별 사다리 뷰(통과·source·연습횟수 반영)
export async function getStrokeLadders(studentId: string): Promise<StrokeLadderView[]> {
  const supabase = await createClient()
  const { data: version } = await supabase.from('curriculum_versions').select('id').eq('status', 'active').single()
  if (!version) return []
  const { data: rows, error } = await supabase
    .from('skill_steps')
    .select('id,key,label,ladder_order,step_kind,measure_spec,is_first_completion,strokes(key,label,color,display_order),skill_tracks(key,label,display_order)')
    .eq('curriculum_version_id', version.id).eq('is_active', true)
    .order('ladder_order', { ascending: true })
  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const steps: LadderInputStep[] = (rows ?? []).map((r: any) => ({
    id: r.id, stroke_key: r.strokes.key, stroke_label: r.strokes.label, color: r.strokes.color,
    track_key: r.skill_tracks?.key ?? '', track_label: r.skill_tracks?.label ?? '',
    key: r.key, label: r.label, ladder_order: r.ladder_order,
    step_kind: r.step_kind, measure_spec: r.measure_spec ?? [], is_first_completion: r.is_first_completion,
  }))
  const [{ data: prog }, { data: att }] = await Promise.all([
    supabase.from('skill_progress').select('skill_step_id,source').eq('student_id', studentId),
    supabase.from('measurements').select('skill_step_id').eq('student_id', studentId).eq('metric_type', 'attempt'),
  ])
  const passedIds = new Set<string>(); const sourceById = new Map<string, ProgressSource>()
  for (const p of prog ?? []) { passedIds.add(p.skill_step_id); sourceById.set(p.skill_step_id, p.source) }
  const attemptById = new Map<string, number>()
  for (const a of att ?? []) if (a.skill_step_id) attemptById.set(a.skill_step_id, (attemptById.get(a.skill_step_id) ?? 0) + 1)
  return buildStrokeLadders(steps, passedIds, sourceById, attemptById)
}
