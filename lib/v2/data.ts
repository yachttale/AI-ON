// lib/v2/data.ts — v2 서버 데이터 접근 레이어
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import type { SkillStep, SkillProgress, Measurement, ProgressSource } from '@/types/v2'
import type { TodayStudent, TodaySession } from './today'
import { buildStrokeLadders, type LadderInputStep, type StrokeLadderView } from './ladder'
import type { DashboardInput } from './dashboard'

// 쿠키 없는 Supabase 클라이언트 (커리큘럼 읽기 전용, RLS 미적용)
function createAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// 활성 커리큘럼 전체 단계 조회 — unstable_cache로 cross-request 캐싱 (쿠키 없는 클라이언트)
const _fetchCurriculumSteps = unstable_cache(
  async (): Promise<SkillStep[]> => {
    const supabase = createAnonClient()
    const { data: version } = await supabase
      .from('curriculum_versions').select('id').eq('status', 'active').single()
    if (!version) return []
    const { data, error } = await supabase
      .from('skill_steps').select('*')
      .eq('curriculum_version_id', version.id).eq('is_active', true)
      .order('ladder_order', { ascending: true })
    if (error) throw error
    return (data ?? []) as SkillStep[]
  },
  ['active-curriculum-steps'],
  { tags: ['curriculum'], revalidate: 3600 },
)

// React cache()로 요청 내 중복 호출 제거 (unstable_cache 위에 추가 레이어)
export const getCachedActiveSteps = cache(_fetchCurriculumSteps)

// 활성 커리큘럼의 단계 목록(영법·순서)
export async function getActiveCurriculumSteps(): Promise<SkillStep[]> {
  return getCachedActiveSteps()
}

// getStrokeLadders용: 활성 커리큘럼 단계(LadderInputStep 형태) 캐시 조회
const _fetchLadderSteps = unstable_cache(
  async (): Promise<LadderInputStep[]> => {
    const supabase = createAnonClient()
    const { data: version } = await supabase
      .from('curriculum_versions').select('id').eq('status', 'active').single()
    if (!version) return []
    const { data: rows, error } = await supabase
      .from('skill_steps')
      .select('id,key,label,ladder_order,step_kind,measure_spec,is_first_completion,strokes(key,label,color,display_order),skill_tracks(key,label,display_order)')
      .eq('curriculum_version_id', version.id).eq('is_active', true)
      .order('ladder_order', { ascending: true })
    if (error) throw error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (rows ?? []).map((r: any) => ({
      id: r.id, stroke_key: r.strokes.key, stroke_label: r.strokes.label, color: r.strokes.color,
      track_key: r.skill_tracks?.key ?? '', track_label: r.skill_tracks?.label ?? '',
      key: r.key, label: r.label, ladder_order: r.ladder_order,
      step_kind: r.step_kind, measure_spec: r.measure_spec ?? [], is_first_completion: r.is_first_completion,
    }))
  },
  ['active-ladder-steps'],
  { tags: ['curriculum'], revalidate: 3600 },
)

// React cache()로 요청 내 중복 제거
const getCachedLadderSteps = cache(_fetchLadderSteps)

// 학생이 통과한 step_id 집합
export async function getStudentPassedStepIds(studentId: string): Promise<Set<string>> {
  const supabase = await createServerClient()
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
  const supabase = await createServerClient()
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
  const supabase = await createServerClient()
  const { error } = await supabase.from('measurements').insert(m)
  if (error) throw error
}

// 오늘 수업: 전체 활성 학생(담당 강사명 포함) + 당일 출결/바퀴수 + 아이 입력 상태.
// 내 반/가져오기 구분은 buildTodayCards가 currentUserId로 수행(요일별 다른 강사 지원).
export async function getTodayStudentsRaw(): Promise<{
  students: TodayStudent[]
  sessionById: Map<string, TodaySession>
  reportedStepById: Map<string, { id: string; key: string; ladder_order: number; stroke_key: string; label: string }>
}> {
  const supabase = await createServerClient()
  const today = new Date().toISOString().slice(0, 10)
  const weekday = new Date().getDay()  // 0=일 ~ 6=토
  const { data: rows, error } = await supabase
    .from('students')
    .select('id,name,grade,schedule')
    .eq('is_active', true).order('name')
  if (error) throw error
  const base = rows ?? []
  const ids = base.map(s => s.id)
  // 오늘 요일의 학생별 담당 강사(요일별 배정)
  const dayAssign = new Map<string, { instructor_id: string; instructor_name: string | null }>()
  if (ids.length) {
    const { data: sdi } = await supabase
      .from('student_day_instructors')
      .select('student_id,instructor_id,profiles!instructor_id(name)')
      .eq('weekday', weekday).in('student_id', ids)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of (sdi ?? []) as any[]) dayAssign.set(a.student_id, { instructor_id: a.instructor_id, instructor_name: a.profiles?.name ?? null })
  }
  const students: TodayStudent[] = base.map(s => {
    const a = dayAssign.get(s.id)
    return { id: s.id, name: s.name, grade: s.grade, schedule: s.schedule, instructor_id: a?.instructor_id ?? null, instructor_name: a?.instructor_name ?? null }
  })
  const sessionById = new Map<string, TodaySession>()
  const reportedStepById = new Map<string, { id: string; key: string; ladder_order: number; stroke_key: string; label: string }>()
  if (ids.length) {
    const { data: sessions } = await supabase
      .from('sessions')
      .select('student_id,attendance,status,input_source,reported_step_id')
      .eq('session_date', today).in('student_id', ids)
    const { data: laps } = await supabase
      .from('measurements').select('student_id,value').eq('metric_type', 'laps').is('skill_step_id', null)
      .eq('measured_on', today).in('student_id', ids)
    const lapByStudent = new Map<string, number>()
    for (const l of laps ?? []) lapByStudent.set(l.student_id, Number(l.value))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of (sessions ?? []) as any[]) {
      sessionById.set(s.student_id, {
        attendance: s.attendance,
        laps: lapByStudent.get(s.student_id) ?? null,
        status: s.status ?? null,
        inputSource: s.input_source ?? null,
        reportedStepId: s.reported_step_id ?? null,
      })
    }
    for (const [sid, v] of lapByStudent) {
      if (!sessionById.has(sid)) sessionById.set(sid, { attendance: null, laps: v, status: null, inputSource: null, reportedStepId: null })
    }
    // 보고단계 전체 정보 일괄 조회 (reported_step_id → skill_steps + strokes)
    const reportedStepIds = [...sessionById.values()]
      .map(s => s.reportedStepId).filter((id): id is string => id != null)
    if (reportedStepIds.length) {
      const { data: stepRows } = await supabase
        .from('skill_steps')
        .select('id,key,label,ladder_order,strokes(key)')
        .in('id', reportedStepIds)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (stepRows ?? []) as any[]) {
        reportedStepById.set(r.id, {
          id: r.id,
          key: r.key,
          label: r.label,
          ladder_order: r.ladder_order,
          stroke_key: r.strokes?.key ?? '',
        })
      }
    }
  }
  return { students, sessionById, reportedStepById }
}

// 학생 영법별 사다리 뷰(통과·source·연습횟수 반영)
export async function getStrokeLadders(studentId: string): Promise<StrokeLadderView[]> {
  const supabase = await createServerClient()
  // 커리큘럼 단계는 캐시(cross-request + request-scoped)에서 가져옴
  const steps = await getCachedLadderSteps()
  if (steps.length === 0) return []
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

// 키오스크: 강사 담당 활성 학생 + 오늘 입력 완료(session 존재) 여부
export async function getKioskRosterRaw(instructorId: string): Promise<{ students: TodayStudent[]; doneIds: Set<string> }> {
  const supabase = await createServerClient()
  const today = new Date().toISOString().slice(0, 10)
  const { data: rows } = await supabase.from('students')
    .select('id,name,grade,schedule,instructor_id').eq('is_active', true).eq('instructor_id', instructorId).order('name')
  const students: TodayStudent[] = (rows ?? []).map(s => ({
    id: s.id, name: s.name, grade: s.grade, schedule: s.schedule, instructor_id: s.instructor_id, instructor_name: null,
  }))
  const ids = students.map(s => s.id)
  const doneIds = new Set<string>()
  if (ids.length) {
    const { data: sess } = await supabase.from('sessions').select('student_id').eq('session_date', today).in('student_id', ids)
    for (const s of sess ?? []) doneIds.add(s.student_id)
  }
  return { students, doneIds }
}

// 원장 대시보드 원시 데이터: 활성 학생 현재 영법 + 미확인 수 + 최근 통과 이력 + strokeMeta
// N+1 방지: 커리큘럼 단계 1회 조회 후 인메모리에서 각 학생 현재 단계 계산
export async function getDashboardRaw(): Promise<{
  input: DashboardInput
  strokeMeta: { key: string; label: string }[]
}> {
  const supabase = await createServerClient()
  const today = new Date().toISOString().slice(0, 10)

  // 1) 활성 커리큘럼 버전 + 단계 + 영법(표시 순서 포함) 일괄 조회
  const { data: version } = await supabase
    .from('curriculum_versions').select('id').eq('status', 'active').single()

  let allSteps: { id: string; stroke_key: string; ladder_order: number; step_kind: string }[] = []
  let strokeMeta: { key: string; label: string }[] = []

  if (version) {
    const { data: stepRows } = await supabase
      .from('skill_steps')
      .select('id,ladder_order,step_kind,strokes(key,label,display_order)')
      .eq('curriculum_version_id', version.id).eq('is_active', true)
      .order('ladder_order', { ascending: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    allSteps = (stepRows ?? []).map((r: any) => ({
      id: r.id,
      stroke_key: r.strokes?.key ?? '',
      ladder_order: r.ladder_order,
      step_kind: r.step_kind ?? '',
    }))
    // strokeMeta: 영법별 고유 목록, display_order 기준 정렬
    const strokeMap = new Map<string, { label: string; display_order: number }>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (stepRows ?? []) as any[]) {
      const key = r.strokes?.key
      if (key && !strokeMap.has(key)) {
        strokeMap.set(key, { label: r.strokes?.label ?? key, display_order: r.strokes?.display_order ?? 999 })
      }
    }
    strokeMeta = [...strokeMap.entries()]
      .sort((a, b) => a[1].display_order - b[1].display_order)
      .map(([key, v]) => ({ key, label: v.label }))
  }

  // 2) 활성 학생 전체
  const { data: studentRows, error: studentErr } = await supabase
    .from('students').select('id,name').eq('is_active', true).order('name')
  if (studentErr) throw studentErr
  const baseStudents = studentRows ?? []
  const studentIds = baseStudents.map(s => s.id)

  // 3) 전체 학생 통과 이력 일괄 조회 (N+1 방지)
  const passedByStudent = new Map<string, Set<string>>()
  for (const s of baseStudents) passedByStudent.set(s.id, new Set())
  if (studentIds.length) {
    const { data: progRows } = await supabase
      .from('skill_progress').select('student_id,skill_step_id').in('student_id', studentIds)
    for (const p of progRows ?? []) {
      passedByStudent.get(p.student_id)?.add(p.skill_step_id)
    }
  }

  // 4) 각 학생 현재 영법 인메모리 계산 (첫 미통과 단계의 stroke_key)
  const students = baseStudents.map(s => {
    const passed = passedByStudent.get(s.id) ?? new Set()
    const currentStep = allSteps.find(step => step.step_kind === 'ladder' && !passed.has(step.id))
    return { id: s.id, name: s.name, currentStrokeKey: currentStep?.stroke_key ?? null }
  })

  // 5) 오늘 pending 세션 수
  const { count: pendingCount } = await supabase
    .from('sessions').select('id', { count: 'exact', head: true })
    .eq('session_date', today).eq('status', 'pending')

  // 6) 최근 통과 이력 (최근 10건, 학생명 + 단계 label 포함)
  const { data: passRows } = await supabase
    .from('skill_progress')
    .select('passed_at,students(name),skill_steps(label)')
    .eq('source', 'observed')
    .order('passed_at', { ascending: false })
    .limit(10)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recentPasses = (passRows ?? []).map((r: any) => ({
    studentName: r.students?.name ?? '',
    stepLabel: r.skill_steps?.label ?? '',
    passedAt: r.passed_at,
  }))

  return {
    input: { students, pendingCount: pendingCount ?? 0, recentPasses },
    strokeMeta,
  }
}
