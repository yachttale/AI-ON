// lib/v2/data.ts — v2 서버 데이터 접근 레이어
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createClient as createAnonSupabase } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { SkillStep, SkillProgress, Measurement, ProgressSource, Attendance } from '@/types/v2'
import type { TodayStudent, TodaySession, TodayCard, TodayCardView, MasterLapEntry } from './today'
import { buildTodayCardView } from './today'
import { buildStrokeLadders, selectCardWindow, type LadderInputStep, type StrokeLadderView } from './ladder'
import { getTodayEntries, parseSchedule } from '@/lib/schedule'
import { kstToday, kstWeekday, kstDaysAgo } from '@/lib/v2/now'
import type { DashboardInput } from './dashboard'

const todayStr = kstToday

export function computeCurrentStrokeKey(
  allSteps: { id: string; step_kind: string; stroke_key: string }[],
  passedIds: Set<string>,
): string | null {
  if (passedIds.size === 0) return null
  // 기타(etc) 단계는 선택 보너스 — 메인 진행 사다리에서 제외
  const first = allSteps.find(s => s.step_kind === 'ladder' && s.stroke_key !== 'etc' && !passedIds.has(s.id))
  if (first) return first.stroke_key
  return 'master'
}

// 쿠키 없는 Supabase 클라이언트 (커리큘럼 읽기 전용, RLS 미적용 — anon select 정책 019)
function createAnonClient() {
  return createAnonSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// 활성 커리큘럼 버전 id
async function getActiveVersionId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<string | null> {
  const { data } = await supabase.from('curriculum_versions').select('id').eq('status', 'active').single()
  return data?.id ?? null
}

// 활성 버전의 사다리 입력(영법·트랙·단계) — 학생 무관, 1회 로드
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getLadderInputs(supabase: any, versionId: string): Promise<LadderInputStep[]> {
  const { data: rows, error } = await supabase
    .from('skill_steps')
    .select('id,key,label,ladder_order,step_kind,measure_spec,is_first_completion,strokes(key,label,color,display_order),skill_tracks(key,label,display_order)')
    .eq('curriculum_version_id', versionId).eq('is_active', true)
    .order('ladder_order', { ascending: true })
  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rows ?? []).map((r: any) => ({
    id: r.id, stroke_key: r.strokes.key, stroke_label: r.strokes.label, color: r.strokes.color,
    track_key: r.skill_tracks?.key ?? '', track_label: r.skill_tracks?.label ?? '',
    key: r.key, label: r.label, ladder_order: r.ladder_order,
    step_kind: r.step_kind, measure_spec: r.measure_spec ?? [], is_first_completion: r.is_first_completion,
  }))
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
export const getCachedLadderSteps = cache(_fetchLadderSteps)

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

// 오늘 수업: 전체 활성 학생(담당 강사명 포함) + 당일 출결/바퀴수 + 아이 입력 상태.
// 내 반/가져오기 구분은 buildTodayCards가 currentUserId로 수행(요일별 다른 강사 지원).
export async function getTodayStudentsRaw(): Promise<{
  students: TodayStudent[]
  sessionById: Map<string, TodaySession>
  reportedStepById: Map<string, { id: string; key: string; ladder_order: number; stroke_key: string; label: string }>
}> {
  const supabase = await createClient()
  const today = kstToday()
  const weekday = kstWeekday()  // 0=일 ~ 6=토 (KST)
  // 5개 쿼리 병렬 실행 — student_id 필터 없이 날짜/요일 조건만, 메모리에서 필터
  const [
    { data: rows, error },
    { data: profs },
    { data: sdi },
    { data: sessions },
    { data: laps },
  ] = await Promise.all([
    supabase.from('students').select('id,name,grade,schedule,instructor_id').eq('is_active', true).order('name'),
    supabase.from('profiles').select('id,name'),
    supabase.from('student_day_instructors').select('student_id,instructor_id').eq('weekday', weekday),
    supabase.from('sessions').select('student_id,attendance,status,input_source,reported_step_id').eq('session_date', today),
    supabase.from('measurements').select('student_id,value').eq('metric_type', 'laps').is('skill_step_id', null).eq('measured_on', today),
  ])
  if (error) throw error
  const base = rows ?? []
  const activeIds = new Set(base.map(s => s.id))
  const nameById = new Map((profs ?? []).map(p => [p.id, p.name]))
  const dayAssign = new Map<string, string>()
  for (const a of sdi ?? []) if (activeIds.has(a.student_id)) dayAssign.set(a.student_id, a.instructor_id)
  const students: TodayStudent[] = base.map(s => {
    const instructorId = dayAssign.get(s.id) ?? s.instructor_id ?? null
    return { id: s.id, name: s.name, grade: s.grade, schedule: s.schedule, instructor_id: instructorId, instructor_name: instructorId ? nameById.get(instructorId) ?? null : null }
  })
  const lapByStudent = new Map<string, number>()
  for (const l of laps ?? []) if (activeIds.has(l.student_id)) lapByStudent.set(l.student_id, Number(l.value))
  const sessionById = new Map<string, TodaySession>()
  const reportedStepById = new Map<string, { id: string; key: string; ladder_order: number; stroke_key: string; label: string }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const s of (sessions ?? []) as any[]) {
    if (!activeIds.has(s.student_id)) continue
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
  const reportedStepIds = [...sessionById.values()].map(s => s.reportedStepId).filter((id): id is string => id != null)
  if (reportedStepIds.length) {
    const { data: stepRows } = await supabase.from('skill_steps').select('id,key,label,ladder_order,strokes(key)').in('id', reportedStepIds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (stepRows ?? []) as any[]) {
      reportedStepById.set(r.id, { id: r.id, key: r.key, label: r.label, ladder_order: r.ladder_order, stroke_key: r.strokes?.key ?? '' })
    }
  }
  return { students, sessionById, reportedStepById }
}

// 학생 영법별 사다리 뷰(통과·source·연습횟수 반영)
export async function getStrokeLadders(studentId: string): Promise<StrokeLadderView[]> {
  const supabase = await createClient()
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
  const supabase = await createClient()
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
  const supabase = await createClient()
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
    return { id: s.id, name: s.name, currentStrokeKey: computeCurrentStrokeKey(allSteps, passed) }
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

// 오늘 카드(내 반) 보강 — 배치 로드로 N+1 회피. 빈 배열이면 즉시 반환.
export async function enrichMineCards(cards: TodayCard[]): Promise<TodayCardView[]> {
  if (cards.length === 0) return []
  const supabase = await createClient()
  const ids = cards.map(c => c.id)
  const today = todayStr()
  // 커리큘럼은 캐시(getCachedLadderSteps)로 — getActiveVersionId+getLadderInputs 2번 왕복 → 0
  const [inputs, { data: prog }, { data: meas }] = await Promise.all([
    getCachedLadderSteps(),
    supabase.from('skill_progress').select('student_id,skill_step_id,source,passed_at').in('student_id', ids),
    supabase.from('measurements').select('student_id,skill_step_id,metric_type,measured_on').in('student_id', ids).eq('measured_on', today),
  ])
  if (inputs.length === 0) return cards.map(c => buildTodayCardView(c, [], new Set(), new Set()))
  // 마스터 단계 목록 (repeatable, stroke_key=master, 순서대로)
  const masterSteps = inputs.filter(s => s.stroke_key === 'master' && s.step_kind === 'repeatable')
    .sort((a, b) => a.ladder_order - b.ladder_order)
  const masterStepIdSet = new Set(masterSteps.map(s => s.id))
  // 학생별 통과/오늘통과
  const passedBy = new Map<string, Set<string>>(); const sourceBy = new Map<string, Map<string, ProgressSource>>()
  const passedTodayBy = new Map<string, Set<string>>()
  for (const p of prog ?? []) {
    ;(passedBy.get(p.student_id) ?? passedBy.set(p.student_id, new Set()).get(p.student_id)!).add(p.skill_step_id)
    ;(sourceBy.get(p.student_id) ?? sourceBy.set(p.student_id, new Map()).get(p.student_id)!).set(p.skill_step_id, p.source)
    if (p.passed_at === today) (passedTodayBy.get(p.student_id) ?? passedTodayBy.set(p.student_id, new Set()).get(p.student_id)!).add(p.skill_step_id)
  }
  // 학생별 오늘 기록(측정/연습) + 오늘 연습횟수 + 마스터 바퀴수
  const recordedTodayBy = new Map<string, Set<string>>(); const attemptTodayBy = new Map<string, Map<string, number>>()
  const masterLapsByStudent = new Map<string, Map<string, number>>()
  for (const m of meas ?? []) {
    if (!m.skill_step_id) continue
    ;(recordedTodayBy.get(m.student_id) ?? recordedTodayBy.set(m.student_id, new Set()).get(m.student_id)!).add(m.skill_step_id)
    if (m.metric_type === 'attempt') {
      const map = attemptTodayBy.get(m.student_id) ?? attemptTodayBy.set(m.student_id, new Map()).get(m.student_id)!
      map.set(m.skill_step_id, (map.get(m.skill_step_id) ?? 0) + 1)
    }
    if (m.metric_type === 'laps' && masterStepIdSet.has(m.skill_step_id)) {
      const map = masterLapsByStudent.get(m.student_id) ?? masterLapsByStudent.set(m.student_id, new Map()).get(m.student_id)!
      map.set(m.skill_step_id, (map.get(m.skill_step_id) ?? 0) + 1)
    }
  }
  return cards.map(c => {
    const strokes = buildStrokeLadders(
      inputs, passedBy.get(c.id) ?? new Set(), sourceBy.get(c.id) ?? new Map(), attemptTodayBy.get(c.id) ?? new Map(),
    )
    const lapsMap = masterLapsByStudent.get(c.id) ?? new Map()
    const masterLaps: MasterLapEntry[] = masterSteps.map(s => ({ stepId: s.id, stepKey: s.key, label: s.track_label, laps: lapsMap.get(s.id) ?? 0 }))
    return buildTodayCardView(c, strokes, recordedTodayBy.get(c.id) ?? new Set(), passedTodayBy.get(c.id) ?? new Set(), undefined, masterLaps)
  })
}

// 과거 날짜 학생 카드 보강 (enrichMineCards의 날짜 파라미터 버전)
function toPastCard(s: PastDayStudentRow): TodayCard {
  return {
    id: s.id, name: s.name, grade: s.grade, schedule: s.schedule,
    instructor_id: null, instructor_name: null,
    attendance: s.attendance as (Attendance | null),
    laps: null, mine: true, status: null, inputSource: null,
    reportedStepId: null, reportedStep: null,
  }
}
export async function enrichPastDayStudents(students: PastDayStudentRow[], date: string): Promise<TodayCardView[]> {
  if (students.length === 0) return []
  const supabase = await createClient()
  const ids = students.map(s => s.id)
  const [inputs, { data: prog }, { data: meas }] = await Promise.all([
    getCachedLadderSteps(),
    supabase.from('skill_progress').select('student_id,skill_step_id,source,passed_at').in('student_id', ids),
    supabase.from('measurements').select('student_id,skill_step_id,metric_type').in('student_id', ids).eq('measured_on', date),
  ])
  if (inputs.length === 0) return students.map(s => buildTodayCardView(toPastCard(s), [], new Set(), new Set()))
  const passedBy = new Map<string, Set<string>>()
  const sourceBy = new Map<string, Map<string, ProgressSource>>()
  const passedOnDateBy = new Map<string, Set<string>>()
  for (const p of prog ?? []) {
    ;(passedBy.get(p.student_id) ?? passedBy.set(p.student_id, new Set()).get(p.student_id)!).add(p.skill_step_id)
    ;(sourceBy.get(p.student_id) ?? sourceBy.set(p.student_id, new Map()).get(p.student_id)!).set(p.skill_step_id, p.source)
    if ((p.passed_at as string | null)?.slice(0, 10) === date)
      (passedOnDateBy.get(p.student_id) ?? passedOnDateBy.set(p.student_id, new Set()).get(p.student_id)!).add(p.skill_step_id)
  }
  const recordedOnDateBy = new Map<string, Set<string>>()
  const attemptOnDateBy = new Map<string, Map<string, number>>()
  for (const m of meas ?? []) {
    if (!m.skill_step_id) continue
    ;(recordedOnDateBy.get(m.student_id) ?? recordedOnDateBy.set(m.student_id, new Set()).get(m.student_id)!).add(m.skill_step_id)
    if (m.metric_type === 'attempt') {
      const map = attemptOnDateBy.get(m.student_id) ?? attemptOnDateBy.set(m.student_id, new Map()).get(m.student_id)!
      map.set(m.skill_step_id, (map.get(m.skill_step_id) ?? 0) + 1)
    }
  }
  return students.map(s => {
    const strokes = buildStrokeLadders(inputs, passedBy.get(s.id) ?? new Set(), sourceBy.get(s.id) ?? new Map(), attemptOnDateBy.get(s.id) ?? new Map())
    return buildTodayCardView(toPastCard(s), strokes, recordedOnDateBy.get(s.id) ?? new Set(), passedOnDateBy.get(s.id) ?? new Set())
  })
}

// 나의 학생(담당 전체) 목록
export interface MyStudentRow { id: string; name: string; grade: string | null; schedule: string | null }
export async function getMyStudents(): Promise<MyStudentRow[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  // 담당 = 고정 담당(instructor_id) ∪ 요일배정(student_day_instructors). 둘 다 합쳐 표시.
  const [{ data: staticRows }, { data: dayRows }] = await Promise.all([
    supabase.from('students').select('id,name,grade,schedule').eq('instructor_id', user.id).eq('is_active', true),
    supabase.from('student_day_instructors').select('student_id').eq('instructor_id', user.id),
  ])
  const map = new Map<string, MyStudentRow>()
  for (const s of staticRows ?? []) map.set(s.id, s as MyStudentRow)
  const dayIds = [...new Set((dayRows ?? []).map(r => r.student_id))].filter(id => !map.has(id))
  if (dayIds.length) {
    const { data: dayStudents } = await supabase
      .from('students').select('id,name,grade,schedule').in('id', dayIds).eq('is_active', true)
    for (const s of dayStudents ?? []) map.set(s.id, s as MyStudentRow)
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

// 나의 학생 + 현재 영법 그룹
export interface MyStudentGroupedRow extends MyStudentRow { currentStrokeKey: string | null }
export interface MyStudentGroup { key: string; label: string; count: number; students: MyStudentGroupedRow[] }

const MY_GROUP_ORDER = [
  { key: 'beginner', label: '초보' },
  { key: 'freestyle', label: '자유형' },
  { key: 'backstroke', label: '배영' },
  { key: 'breaststroke', label: '평영' },
  { key: 'butterfly', label: '접영' },
  { key: 'master', label: '마스터' },
]

export async function getMyStudentsGrouped(): Promise<MyStudentGroup[]> {
  const students = await getMyStudents()
  if (students.length === 0) return MY_GROUP_ORDER.map(g => ({ ...g, count: 0, students: [] }))
  const supabase = await createClient()
  const ids = students.map(s => s.id)
  const [allSteps, { data: prog }] = await Promise.all([
    getCachedLadderSteps(),
    supabase.from('skill_progress').select('student_id,skill_step_id').in('student_id', ids),
  ])
  const passedBy = new Map<string, Set<string>>()
  for (const p of prog ?? []) {
    if (!passedBy.has(p.student_id)) passedBy.set(p.student_id, new Set())
    passedBy.get(p.student_id)!.add(p.skill_step_id)
  }
  const byKey = new Map<string, MyStudentGroupedRow[]>()
  for (const s of students) {
    const strokeKey = computeCurrentStrokeKey(allSteps, passedBy.get(s.id) ?? new Set()) ?? 'beginner'
    if (!byKey.has(strokeKey)) byKey.set(strokeKey, [])
    byKey.get(strokeKey)!.push({ ...s, currentStrokeKey: strokeKey })
  }
  return MY_GROUP_ORDER.map(g => ({ ...g, count: byKey.get(g.key)?.length ?? 0, students: byKey.get(g.key) ?? [] }))
}

// 과거 수업일 학생 현황 (어제/그전날)
export interface PastDayStudentRow { id: string; name: string; grade: string | null; schedule: string | null; attendance: string | null }
export async function getPastDayStudentsForMe(daysBack: 1 | 2): Promise<{
  date: string; dateLabel: string; students: PastDayStudentRow[]
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { date: '', dateLabel: '', students: [] }
  const date = kstDaysAgo(daysBack)
  const d = new Date(date + 'T12:00:00+09:00')
  const weekday = d.getDay()
  const dayNames = ['일', '월', '화', '수', '목', '금', '토']
  const dateLabel = `${daysBack === 1 ? '어제' : '그저께'} ${d.getMonth() + 1}/${d.getDate()}(${dayNames[weekday]})`
  // 해당 요일 내 담당 학생 = 고정담당 ∪ 요일배정
  const [{ data: staticRows }, { data: dayRows }] = await Promise.all([
    supabase.from('students').select('id,name,grade,schedule').eq('instructor_id', user.id).eq('is_active', true),
    supabase.from('student_day_instructors').select('student_id').eq('instructor_id', user.id).eq('weekday', weekday),
  ])
  const map = new Map<string, MyStudentRow>()
  for (const s of staticRows ?? []) map.set(s.id, s as MyStudentRow)
  const dayIds = (dayRows ?? []).map(r => r.student_id).filter(id => !map.has(id))
  if (dayIds.length) {
    const { data: extra } = await supabase.from('students').select('id,name,grade,schedule').in('id', dayIds).eq('is_active', true)
    for (const s of extra ?? []) map.set(s.id, s as MyStudentRow)
  }
  if (map.size === 0) return { date, dateLabel, students: [] }
  const ids = [...map.keys()]
  const { data: sessions } = await supabase.from('sessions').select('student_id,attendance').eq('session_date', date).in('student_id', ids)
  const sessionMap = new Map<string, string | null>()
  for (const s of sessions ?? []) sessionMap.set(s.student_id, s.attendance)
  const students: PastDayStudentRow[] = [...map.values()]
    .filter(s => s.schedule && getTodayEntries(s.schedule, weekday).length > 0)
    .map(s => ({ ...s, attendance: sessionMap.get(s.id) ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  return { date, dateLabel, students }
}

// 오늘(또는 지정일)이 휴원일인가. 마이그레이션 미적용 시에도 앱이 죽지 않도록 에러는 false로.
export async function isClosedOn(date: string = todayStr()): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.from('studio_closures').select('closed_on').eq('closed_on', date).maybeSingle()
    if (error) return false
    return !!data
  } catch {
    return false
  }
}

// ── 원장 대시보드(전체 현황) ──────────────────────────────────────────────
export interface InstructorStat {
  id: string; name: string
  scheduled: number; done: number      // 오늘 입력 현황
  assigned: number                     // 담당 재원생 수
  withdrawn: number; withdrawalRate: number  // 퇴원 수 / 비율(%)
  recentPasses: number                 // 최근 7일 통과 수(baseline 제외)
}
export interface DirectorStudentRow { id: string; name: string; passed: number; total: number; instructorName: string | null; currentStrokeKey: string | null }
export interface DirectorStrokeGroup { stroke_key: string; stroke_label: string; students: DirectorStudentRow[] }
export interface DirectorDashboard {
  totalStudents: number; totalInstructors: number
  todayScheduled: number; todayDone: number; todayAbsent: number
  pendingWithdrawals: number; newStudents30d: number
  instructorStats: InstructorStat[]
  strokeGroups: DirectorStrokeGroup[]
  strokeGroupCounts: { key: string; label: string; count: number }[]
}

export async function getDirectorDashboard(): Promise<DirectorDashboard> {
  const supabase = await createClient()
  const today = todayStr()
  const weekday = kstWeekday()
  const since7 = kstDaysAgo(7)
  const since30 = kstDaysAgo(30)
  const [{ data: allStudents }, { data: profiles }, { data: prog }, { data: sessions }, { data: sdi }, inputs] = await Promise.all([
    // 퇴원율 계산 위해 비활성 포함 전체 로드
    supabase.from('students').select('id,name,schedule,instructor_id,is_active,withdrawal_status,enrolled_on').order('name'),
    supabase.from('profiles').select('id,name,role'),
    supabase.from('skill_progress').select('student_id,skill_step_id,instructor_id,passed_at,source'),
    supabase.from('sessions').select('student_id,attendance').eq('session_date', today),
    supabase.from('student_day_instructors').select('student_id,instructor_id,weekday'),
    getCachedLadderSteps(),
  ])
  // ladder 단계 → 영법, 영법별 ladder 총수, 영법 메타
  const stepStroke = new Map<string, string>()
  const ladderTotal = new Map<string, number>()
  const strokeMeta = new Map<string, string>()
  const strokeOrder: string[] = []
  for (const s of inputs) {
    if (!strokeMeta.has(s.stroke_key)) { strokeMeta.set(s.stroke_key, s.stroke_label); strokeOrder.push(s.stroke_key) }
    if (s.step_kind === 'ladder') { stepStroke.set(s.id, s.stroke_key); ladderTotal.set(s.stroke_key, (ladderTotal.get(s.stroke_key) ?? 0) + 1) }
  }
  const everStudents = allStudents ?? []
  const studentList = everStudents.filter(s => s.is_active)
  const nameById = new Map((profiles ?? []).map(p => [p.id, p.name]))
  const instructors = (profiles ?? []).filter(p => p.role === 'instructor' || p.role === 'director')
  // 오늘 요일 배정(입력 현황용) + 전체 요일 배정(담당 표시 fallback용)
  const dayInstr = new Map((sdi ?? []).filter(a => a.weekday === weekday).map(a => [a.student_id, a.instructor_id]))
  const dayInstrAny = new Map<string, string>()
  for (const a of sdi ?? []) if (!dayInstrAny.has(a.student_id)) dayInstrAny.set(a.student_id, a.instructor_id)
  // 담당 = 정적 담당 ?? 요일 배정(아무 요일). 둘 다 없으면 미배정.
  const ownerName = (s: { id: string; instructor_id: string | null }) =>
    nameById.get(s.instructor_id ?? dayInstrAny.get(s.id) ?? '') ?? null
  const doneSet = new Set((sessions ?? []).map(s => s.student_id))
  const todayAbsent = (sessions ?? []).filter(s => s.attendance === '결석').length
  const pendingWithdrawals = everStudents.filter(s => s.withdrawal_status === 'pending').length
  const newStudents30d = studentList.filter(s => s.enrolled_on && s.enrolled_on >= since30).length

  // 학생별 영법별 통과(ladder) 수 (활성 학생 진행 그룹용)
  const passedByStroke = new Map<string, Map<string, number>>()
  // 학생별 전체 통과 step id Set (currentStrokeKey 계산용)
  const passedByStudent = new Map<string, Set<string>>()
  for (const p of prog ?? []) {
    const sk = stepStroke.get(p.skill_step_id); if (!sk) continue
    const m = passedByStroke.get(p.student_id) ?? passedByStroke.set(p.student_id, new Map()).get(p.student_id)!
    m.set(sk, (m.get(sk) ?? 0) + 1)
    ;(passedByStudent.get(p.student_id) ?? passedByStudent.set(p.student_id, new Set()).get(p.student_id)!).add(p.skill_step_id)
  }

  // 강사별 스코어카드: 담당·퇴원·최근통과 + 오늘 입력 현황
  interface Agg { scheduled: number; done: number; assigned: number; withdrawn: number; recentPasses: number }
  const instAgg = new Map<string, Agg>()
  const agg = (id: string) => instAgg.get(id) ?? instAgg.set(id, { scheduled: 0, done: 0, assigned: 0, withdrawn: 0, recentPasses: 0 }).get(id)!
  // 담당·퇴원(담당 = 정적 ?? 요일배정 — 모든 화면과 동일 기준)
  for (const s of everStudents) {
    const eff = s.instructor_id ?? dayInstrAny.get(s.id) ?? null
    if (!eff) continue
    const a = agg(eff)
    if (s.is_active) a.assigned++; else a.withdrawn++
  }
  // 최근 7일 통과(baseline 제외)
  for (const p of prog ?? []) {
    if (p.source === 'baseline' || !p.instructor_id || p.passed_at < since7) continue
    agg(p.instructor_id).recentPasses++
  }
  // 오늘 입력 현황(오늘 요일 담당 우선, 없으면 고정 담당)
  let todayScheduled = 0, todayDone = 0
  for (const s of studentList) {
    if (!s.schedule || getTodayEntries(s.schedule, weekday).length === 0) continue
    const instId = dayInstr.get(s.id) ?? s.instructor_id
    if (!instId) continue
    const a = agg(instId)
    a.scheduled++; if (doneSet.has(s.id)) a.done++
    todayScheduled++; if (doneSet.has(s.id)) todayDone++
  }
  const instructorStats: InstructorStat[] = [...instAgg.entries()]
    .map(([id, a]): InstructorStat => {
      const ever = a.assigned + a.withdrawn
      return {
        id, name: nameById.get(id) ?? '?',
        scheduled: a.scheduled, done: a.done, assigned: a.assigned, withdrawn: a.withdrawn,
        withdrawalRate: ever ? Math.round((a.withdrawn / ever) * 100) : 0,
        recentPasses: a.recentPasses,
      }
    })
    .sort((x, y) => y.assigned - x.assigned)

  // 영법별 진행 중(0<통과<총) 학생
  const strokeGroups: DirectorStrokeGroup[] = strokeOrder
    .filter(sk => (ladderTotal.get(sk) ?? 0) > 0)
    .map(sk => {
      const total = ladderTotal.get(sk)!
      const rows: DirectorStudentRow[] = studentList
        .map(s => ({ s, passed: passedByStroke.get(s.id)?.get(sk) ?? 0 }))
        .filter(({ passed }) => passed > 0 && passed < total)
        .map(({ s, passed }) => ({ id: s.id, name: s.name, passed, total, instructorName: ownerName(s), currentStrokeKey: computeCurrentStrokeKey(inputs, passedByStudent.get(s.id) ?? new Set()) }))
      return { stroke_key: sk, stroke_label: strokeMeta.get(sk)!, students: rows }
    })
    .filter(g => g.students.length > 0)

  const GROUP_ORDER = [
    { key: 'beginner', label: '초보' },
    { key: 'freestyle', label: '자유형' },
    { key: 'backstroke', label: '배영' },
    { key: 'breaststroke', label: '평영' },
    { key: 'butterfly', label: '접영' },
    { key: 'master', label: '마스터' },
  ]
  const groupCountMap = new Map<string, number>()
  for (const s of studentList) {
    const key = computeCurrentStrokeKey(inputs, passedByStudent.get(s.id) ?? new Set())
    if (key) groupCountMap.set(key, (groupCountMap.get(key) ?? 0) + 1)
  }
  const strokeGroupCounts = GROUP_ORDER.map(g => ({ ...g, count: groupCountMap.get(g.key) ?? 0 }))

  return {
    totalStudents: studentList.length,
    totalInstructors: instructors.length,
    todayScheduled, todayDone, todayAbsent,
    pendingWithdrawals, newStudents30d,
    instructorStats, strokeGroups,
    strokeGroupCounts,
  }
}

// 원장 전체 학생 명단(검색·필터·개별 상세 진입용). 배치 로드.
export interface DirectorRosterRow {
  id: string; name: string; schedule: string | null; grade: string | null
  instructorName: string | null
  focusStrokeKey: string | null; focusStrokeLabel: string | null
  currentStepLabel: string | null; passedLadder: number
  currentStrokeKey: string | null
}
export async function getDirectorRoster(): Promise<DirectorRosterRow[]> {
  const supabase = await createClient()
  const inputs = await getCachedLadderSteps()
  const ladderIds = new Set(inputs.filter(s => s.step_kind === 'ladder').map(s => s.id))
  const [{ data: students }, { data: profiles }, { data: prog }, { data: sdi }] = await Promise.all([
    supabase.from('students').select('id,name,schedule,grade,instructor_id').eq('is_active', true).order('name'),
    supabase.from('profiles').select('id,name'),
    supabase.from('skill_progress').select('student_id,skill_step_id,source'),
    supabase.from('student_day_instructors').select('student_id,instructor_id'),
  ])
  const nameById = new Map((profiles ?? []).map(p => [p.id, p.name]))
  const dayInstrAny = new Map<string, string>()
  for (const a of sdi ?? []) if (!dayInstrAny.has(a.student_id)) dayInstrAny.set(a.student_id, a.instructor_id)
  const passedBy = new Map<string, Set<string>>(); const sourceBy = new Map<string, Map<string, ProgressSource>>()
  for (const p of prog ?? []) {
    ;(passedBy.get(p.student_id) ?? passedBy.set(p.student_id, new Set()).get(p.student_id)!).add(p.skill_step_id)
    ;(sourceBy.get(p.student_id) ?? sourceBy.set(p.student_id, new Map()).get(p.student_id)!).set(p.skill_step_id, p.source)
  }
  return (students ?? []).map(s => {
    const passed = passedBy.get(s.id) ?? new Set<string>()
    const strokes = buildStrokeLadders(inputs, passed, sourceBy.get(s.id) ?? new Map(), new Map())
    const { focus } = selectCardWindow(strokes)
    const currentStepLabel = strokes.flatMap(x => x.tracks.flatMap(t => t.steps)).find(x => x.isCurrent)?.label ?? null
    let passedLadder = 0; for (const id of passed) if (ladderIds.has(id)) passedLadder++
    return {
      id: s.id, name: s.name, schedule: s.schedule, grade: s.grade,
      instructorName: nameById.get(s.instructor_id ?? dayInstrAny.get(s.id) ?? '') ?? null,
      focusStrokeKey: focus?.stroke_key ?? null, focusStrokeLabel: focus?.stroke_label ?? null,
      currentStepLabel, passedLadder,
      currentStrokeKey: computeCurrentStrokeKey(inputs, passed),
    }
  })
}

// 학생 대시보드: 기본정보 + 영법별 진도% + 일별 활동 타임라인 + 부모 피드백 초안
export interface StrokeProgress { stroke_key: string; stroke_label: string; color: string | null; passed: number; total: number; pct: number }
export type ActivityKind = 'practice' | 'pass' | 'measure'
export interface DayActivity { date: string; items: { label: string; kind: ActivityKind }[] }
export interface RadarAxis { label: string; pct: number }
export interface DashboardStats {
  recordDays: number; totalDistanceM: number; avgDistanceM: number
  totalPassed: number; favoriteStroke: string | null
  attendanceRate: number; presentN: number; absentN: number
}
export interface InstructorOption { id: string; name: string }
export async function getInstructors(): Promise<InstructorOption[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('id,name').in('role', ['instructor', 'director']).order('name')
  return (data ?? []) as InstructorOption[]
}

export interface StudentDashboard {
  name: string; grade: string | null; schedule: string | null; enrolled_on: string | null
  sex: string | null; ageText: string | null
  instructorName: string | null; instructorId: string | null
  withdrawalStatus: 'pending' | 'approved' | null
  currentStepLabel: string | null
  strokeProgress: StrokeProgress[]
  radar: RadarAxis[]            // 영법별 진도% 레이더(전체 한눈에)
  stats: DashboardStats
  dailyLog: DayActivity[]       // 일별로 그날 한 것(연습·통과·측정) — 매일 기록이 보이도록
  feedbackDraft: string         // 부모 전송용 자동 초안(최근 한 달)
}
const unitOf = (metric: string) => metric === 'time_sec' ? '초' : metric === 'stroke_count' ? '스트로크' : metric === 'laps' ? '바퀴' : 'm'
function ageTextOf(birthdate: string | null): string | null {
  if (!birthdate) return null
  const b = new Date(birthdate), now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return age >= 0 && age < 100 ? `${age}세` : null
}

export async function getStudentDashboard(studentId: string): Promise<StudentDashboard | null> {
  const supabase = await createClient()
  const { data: student } = await supabase
    .from('students').select('name,grade,schedule,enrolled_on,birthdate,sex,instructor_id,withdrawal_status,profiles:instructor_id(name)')
    .eq('id', studentId).single()
  if (!student) return null
  const strokes = await getStrokeLadders(studentId)
  const strokeProgress: StrokeProgress[] = strokes.map(s => {
    const ladder = s.tracks.flatMap(t => t.steps).filter(st => st.step_kind === 'ladder')
    const passed = ladder.filter(st => st.passed).length
    const total = ladder.length
    return { stroke_key: s.stroke_key, stroke_label: s.stroke_label, color: s.color, passed, total, pct: total ? Math.round((passed / total) * 100) : 0 }
  })
  const currentStepLabel = strokes.flatMap(s => s.tracks.flatMap(t => t.steps)).find(st => st.isCurrent)?.label ?? null

  const labelById = new Map<string, string>()
  for (const s of strokes) for (const t of s.tracks) for (const st of t.steps) labelById.set(st.id, st.label)
  // 전체 기간 로드(총 지표용). 일별/피드백은 최근 30일만 사용.
  const [{ data: prog }, { data: meas }, { data: sessions }, { data: dayAssign }] = await Promise.all([
    supabase.from('skill_progress').select('skill_step_id,passed_at,step_key_snapshot,source').eq('student_id', studentId),
    supabase.from('measurements').select('skill_step_id,metric_type,value,measured_on').eq('student_id', studentId),
    supabase.from('sessions').select('attendance,session_date').eq('student_id', studentId),
    supabase.from('student_day_instructors').select('instructor_id,profiles:instructor_id(name)').eq('student_id', studentId).limit(1).maybeSingle(),
  ])
  // 담당 = 정적 담당 ?? 요일 배정 강사
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instructorId = (student as any).instructor_id ?? (dayAssign as any)?.instructor_id ?? null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instructorName = (student as any).profiles?.name ?? (dayAssign as any)?.profiles?.name ?? null
  const since = kstDaysAgo(30)

  // ── 총 지표(전체 기간) ──
  const recordDates = new Set<string>()
  let totalDistanceM = 0
  for (const m of meas ?? []) {
    recordDates.add(m.measured_on)
    if (m.metric_type === 'laps') totalDistanceM += Number(m.value) * 50
    else if (m.metric_type === 'distance_m') totalDistanceM += Number(m.value)
  }
  for (const s of sessions ?? []) recordDates.add(s.session_date)
  const recordDays = recordDates.size
  const presentN = (sessions ?? []).filter(s => s.attendance === '출석' || s.attendance === '지각').length
  const absentN = (sessions ?? []).filter(s => s.attendance === '결석').length
  const totalPassed = strokeProgress.reduce((a, s) => a + s.passed, 0)
  const fav = [...strokeProgress].filter(s => s.passed > 0).sort((a, b) => b.passed - a.passed)[0]
  const stats: DashboardStats = {
    recordDays, totalDistanceM,
    avgDistanceM: recordDays ? Math.round(totalDistanceM / recordDays) : 0,
    totalPassed, favoriteStroke: fav?.stroke_label ?? null,
    attendanceRate: presentN + absentN ? Math.round((presentN / (presentN + absentN)) * 100) : 0,
    presentN, absentN,
  }
  const radar: RadarAxis[] = strokeProgress.filter(s => s.total > 0).map(s => ({ label: s.stroke_label, pct: s.pct }))

  // ── 일별 활동(최근 30일, 연습 포함) ──
  const byDate = new Map<string, { label: string; kind: ActivityKind }[]>()
  const seen = new Set<string>()
  const push = (date: string, label: string, kind: ActivityKind) => {
    const arr = byDate.get(date) ?? byDate.set(date, []).get(date)!
    arr.push({ label, kind })
  }
  for (const p of prog ?? []) {
    if (p.source === 'baseline' || p.passed_at < since) continue
    push(p.passed_at, `${labelById.get(p.skill_step_id) ?? p.step_key_snapshot} 통과`, 'pass')
  }
  for (const m of meas ?? []) {
    if (!m.skill_step_id || m.measured_on < since) continue
    const label = labelById.get(m.skill_step_id) ?? ''
    if (m.metric_type === 'attempt') {
      const key = `${m.measured_on}|${m.skill_step_id}`
      if (seen.has(key)) continue; seen.add(key)
      push(m.measured_on, label, 'practice')
    } else {
      push(m.measured_on, `${label} ${m.value}${unitOf(m.metric_type)}`.trim(), 'measure')
    }
  }
  const dailyLog: DayActivity[] = [...byDate.entries()]
    .map(([date, items]) => ({ date, items }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 30)

  // ── 부모 피드백 초안(최근 한 달) ──
  const recentPasses = (prog ?? []).filter(p => p.source !== 'baseline' && p.passed_at >= since)
  const presentRecent = (sessions ?? []).filter(s => s.session_date >= since && (s.attendance === '출석' || s.attendance === '지각')).length
  const absentRecent = (sessions ?? []).filter(s => s.session_date >= since && s.attendance === '결석').length
  const passLabels = recentPasses.sort((a, b) => (a.passed_at < b.passed_at ? 1 : -1)).map(p => labelById.get(p.skill_step_id) ?? p.step_key_snapshot)
  const practiceFreq = new Map<string, number>()
  for (const m of meas ?? []) if (m.metric_type === 'attempt' && m.measured_on >= since) {
    const l = labelById.get(m.skill_step_id ?? ''); if (l) practiceFreq.set(l, (practiceFreq.get(l) ?? 0) + 1)
  }
  const practiceTop = [...practiceFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0])
  const progressLine = strokeProgress.filter(s => s.pct > 0).map(s => `${s.stroke_label} ${s.pct}%`).join(', ')
  const draft = [
    `[${student.name}] 최근 한 달 수영 리포트`,
    `· 출석 ${presentRecent}회${absentRecent ? ` (결석 ${absentRecent}회)` : ''}`,
    `· 이번 달 통과: ${passLabels.length ? passLabels.slice(0, 6).join(', ') : '없음'}`,
    practiceTop.length ? `· 주로 연습한 것: ${practiceTop.join(', ')}` : '',
    progressLine ? `· 현재 진도: ${progressLine}` : '',
    `· 다음 목표: ${currentStepLabel ?? '-'}`,
  ].filter(Boolean).join('\n')

  return {
    name: student.name, grade: student.grade, schedule: student.schedule, enrolled_on: student.enrolled_on,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sex: (student as any).sex ?? null, ageText: ageTextOf((student as any).birthdate ?? null),
    instructorName, instructorId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withdrawalStatus: (student as any).withdrawal_status ?? null,
    currentStepLabel, strokeProgress, radar, stats, dailyLog, feedbackDraft: draft,
  }
}

export interface MasterStrokeStats {
  stepId: string
  strokeKey: string
  strokeLabel: string
  todayLaps: number
  totalLaps: number
  totalDistanceM: number
}
export interface StudentMasterStats {
  strokes: MasterStrokeStats[]
}

export async function getStudentMasterStats(studentId: string): Promise<StudentMasterStats> {
  const supabase = await createClient()
  const today = kstToday()
  const allSteps = await getCachedLadderSteps()
  const masterSteps = allSteps.filter(s => s.stroke_key === 'master')
  if (masterSteps.length === 0) return { strokes: [] }

  const stepIds = masterSteps.map(s => s.id)
  const [{ data: allMeas }, { data: todayMeas }] = await Promise.all([
    supabase.from('measurements').select('skill_step_id,value').eq('student_id', studentId).eq('metric_type', 'laps').in('skill_step_id', stepIds),
    supabase.from('measurements').select('skill_step_id,value').eq('student_id', studentId).eq('metric_type', 'laps').eq('measured_on', today).in('skill_step_id', stepIds),
  ])
  const totalByStep = new Map<string, number>()
  for (const m of allMeas ?? []) totalByStep.set(m.skill_step_id, (totalByStep.get(m.skill_step_id) ?? 0) + Number(m.value))
  const todayByStep = new Map<string, number>()
  for (const m of todayMeas ?? []) todayByStep.set(m.skill_step_id, (todayByStep.get(m.skill_step_id) ?? 0) + Number(m.value))

  const IM_TRACK_KEYS = ['im']
  const strokes: MasterStrokeStats[] = masterSteps.map(s => {
    const isIM = IM_TRACK_KEYS.includes(s.track_key)
    const totalLaps = totalByStep.get(s.id) ?? 0
    return {
      stepId: s.id,
      strokeKey: s.track_key,
      strokeLabel: s.track_label,
      todayLaps: todayByStep.get(s.id) ?? 0,
      totalLaps,
      totalDistanceM: isIM ? 0 : totalLaps * 50,
    }
  })
  return { strokes }
}

// 원장 → 강사 상세 대시보드
export interface InstructorDetailStudent { id: string; name: string; grade: string | null; currentStrokeKey: string | null }
export interface InstructorStrokeGroup { key: string; label: string; count: number; students: InstructorDetailStudent[] }
export interface InstructorDetailData {
  name: string; totalStudents: number
  todayDone: number; todayScheduled: number
  withdrawalRate: number
  strokeGroups: InstructorStrokeGroup[]
  recentPasses: Array<{ studentName: string; stepLabel: string; strokeLabel: string; passedAt: string }>
}

const STROKE_ORDER_KEYS = ['beginner', 'free', 'back', 'breast', 'butterfly', 'master']
const STROKE_LABELS_MAP: Record<string, string> = {
  beginner: '초보', free: '자유형', back: '배영', breast: '평영', butterfly: '접영', master: '마스터',
}

export async function getInstructorDetail(instructorId: string): Promise<InstructorDetailData | null> {
  const supabase = await createClient()
  const inputs = await getCachedLadderSteps()

  const [{ data: profile }, { data: students }] = await Promise.all([
    supabase.from('profiles').select('name').eq('id', instructorId).single(),
    supabase.from('students').select('id,name,grade').eq('instructor_id', instructorId).eq('is_active', true).order('name'),
  ])
  if (!profile) return null

  const studentIds = (students ?? []).map(s => s.id)
  if (studentIds.length === 0) {
    return { name: profile.name, totalStudents: 0, todayDone: 0, todayScheduled: 0, withdrawalRate: 0, strokeGroups: [], recentPasses: [] }
  }

  const today = kstToday()
  const [{ data: prog }, { data: todaySess }, { data: recentProgRows }, { data: withdrawn }] = await Promise.all([
    supabase.from('skill_progress').select('student_id,skill_step_id').in('student_id', studentIds).eq('source', 'observed'),
    supabase.from('sessions').select('student_id,attendance').in('student_id', studentIds).eq('session_date', today),
    supabase.from('skill_progress').select('student_id,skill_step_id,passed_at')
      .in('student_id', studentIds).eq('source', 'observed')
      .gte('passed_at', kstDaysAgo(30)).order('passed_at', { ascending: false }).limit(15),
    supabase.from('students').select('id').eq('instructor_id', instructorId).eq('is_active', false).not('withdrawal_status', 'is', null),
  ])

  const passedBy = new Map<string, Set<string>>()
  for (const p of prog ?? []) {
    ;(passedBy.get(p.student_id) ?? passedBy.set(p.student_id, new Set()).get(p.student_id)!).add(p.skill_step_id)
  }

  const stepById = new Map(inputs.map(s => [s.id, s]))
  const studentNameById = new Map((students ?? []).map(s => [s.id, s.name]))

  const enriched: InstructorDetailStudent[] = (students ?? []).map(s => ({
    id: s.id, name: s.name, grade: s.grade,
    currentStrokeKey: computeCurrentStrokeKey(inputs, passedBy.get(s.id) ?? new Set()),
  }))

  // 영법별 그룹
  const groupMap = new Map<string, InstructorDetailStudent[]>()
  for (const s of enriched) {
    const k = s.currentStrokeKey ?? 'unassigned'
    ;(groupMap.get(k) ?? groupMap.set(k, []).get(k)!).push(s)
  }
  const strokeGroups: InstructorStrokeGroup[] = STROKE_ORDER_KEYS
    .filter(k => groupMap.has(k))
    .map(k => ({ key: k, label: STROKE_LABELS_MAP[k] ?? k, count: groupMap.get(k)!.length, students: groupMap.get(k)! }))
  if (groupMap.has('unassigned')) strokeGroups.push({ key: 'unassigned', label: '미분류', count: groupMap.get('unassigned')!.length, students: groupMap.get('unassigned')! })

  const todayDone = (todaySess ?? []).filter(s => s.attendance !== '결석').length
  const todayScheduled = (todaySess ?? []).length

  const recentPasses = (recentProgRows ?? []).map(p => ({
    studentName: studentNameById.get(p.student_id) ?? '알 수 없음',
    stepLabel: stepById.get(p.skill_step_id)?.label ?? '단계',
    strokeLabel: stepById.get(p.skill_step_id)?.stroke_label ?? '',
    passedAt: p.passed_at,
  }))

  const totalEver = (students?.length ?? 0) + (withdrawn?.length ?? 0)
  const withdrawalRate = totalEver > 0 ? Math.round(((withdrawn?.length ?? 0) / totalEver) * 100) : 0

  return {
    name: profile.name, totalStudents: enriched.length,
    todayDone, todayScheduled, withdrawalRate,
    strokeGroups, recentPasses,
  }
}

// 일주일 시간표 — 요일×시간 슬롯별 강사+학생 목록
const DAY_TO_JS: Record<string, number> = { '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 }

export interface TimetableStudent { id: string; name: string }
export interface TimetableInstructorGroup {
  instructorId: string | null; instructorName: string | null
  students: TimetableStudent[]
}
export type TimetableMap = Map<string, TimetableInstructorGroup[]> // key: `${jsDay}-${hour24}`

export async function getWeeklyTimetable(): Promise<TimetableMap> {
  const supabase = await createClient()
  const [{ data: students }, { data: sdi }, { data: profiles }] = await Promise.all([
    supabase.from('students').select('id,name,schedule,instructor_id').eq('is_active', true),
    supabase.from('student_day_instructors').select('student_id,weekday,instructor_id'),
    supabase.from('profiles').select('id,name'),
  ])

  const nameById = new Map((profiles ?? []).map(p => [p.id, p.name]))
  const dayAssign = new Map<string, Map<number, string>>()
  for (const r of sdi ?? []) {
    if (!dayAssign.has(r.student_id)) dayAssign.set(r.student_id, new Map())
    dayAssign.get(r.student_id)!.set(r.weekday, r.instructor_id)
  }

  const slotMap = new Map<string, Map<string, TimetableStudent[]>>()
  for (const s of students ?? []) {
    if (!s.schedule) continue
    for (const e of parseSchedule(s.schedule)) {
      const jsDay = DAY_TO_JS[e.day]
      if (!jsDay) continue
      const instructorId = dayAssign.get(s.id)?.get(jsDay) ?? s.instructor_id ?? null
      const slotKey = `${jsDay}-${e.hour}`
      const instKey = instructorId ?? '__none__'
      if (!slotMap.has(slotKey)) slotMap.set(slotKey, new Map())
      const instMap = slotMap.get(slotKey)!
      if (!instMap.has(instKey)) instMap.set(instKey, [])
      instMap.get(instKey)!.push({ id: s.id, name: s.name })
    }
  }

  const result: TimetableMap = new Map()
  for (const [slotKey, instMap] of slotMap) {
    const groups: TimetableInstructorGroup[] = []
    for (const [instKey, stus] of instMap) {
      const instructorId = instKey === '__none__' ? null : instKey
      groups.push({
        instructorId,
        instructorName: instructorId ? (nameById.get(instructorId) ?? null) : null,
        students: stus.sort((a, b) => a.name.localeCompare(b.name, 'ko')),
      })
    }
    groups.sort((a, b) => (a.instructorName ?? '').localeCompare(b.instructorName ?? '', 'ko'))
    result.set(slotKey, groups)
  }
  return result
}
