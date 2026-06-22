// lib/v2/data.ts — v2 서버 데이터 접근 레이어(오늘 수업·내 학생·학생 진도).
// 커리큘럼 캐시는 ./curriculum-data, 원장 대시보드·통계·리포트는 ./analytics-data 로 분리.
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { SkillStep, SkillProgress, Measurement, ProgressSource, Attendance } from '@/types/v2'
import type { TodayStudent, TodaySession, TodayCard, TodayCardView, MasterLapEntry } from './today'
import { buildTodayCardView } from './today'
import { buildStrokeLadders, type StrokeLadderView } from './ladder'
import { getTodayEntries } from '@/lib/schedule'
import { kstToday, kstWeekday, kstDaysAgo } from '@/lib/v2/now'
import { getCurrentUser } from '@/lib/v2/session'
import { computeCurrentStrokeKey, getActiveCurriculumSteps, getCachedLadderSteps } from './curriculum-data'
import type { DashboardInput } from './dashboard'

const todayStr = kstToday

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
    supabase.from('sessions').select('student_id,attendance,status,input_source,reported_step_id,instructor_id').eq('session_date', today),
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
      instructorId: s.instructor_id ?? null,
      instructorName: s.instructor_id ? nameById.get(s.instructor_id) ?? null : null,
    })
  }
  for (const [sid, v] of lapByStudent) {
    if (!sessionById.has(sid)) sessionById.set(sid, { attendance: null, laps: v, status: null, inputSource: null, reportedStepId: null, instructorId: null, instructorName: null })
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

// 내 고정 담당(instructor_id) 활성 학생 — 요청 스코프 캐시(어제/그제 화면에서 중복 조회 제거)
export const getMyStaticStudents = cache(async (): Promise<MyStudentRow[]> => {
  const user = await getCurrentUser()
  if (!user) return []
  const supabase = await createClient()
  const { data } = await supabase.from('students')
    .select('id,name,grade,schedule').eq('instructor_id', user.id).eq('is_active', true)
  return (data ?? []) as MyStudentRow[]
})

export async function getMyStudents(): Promise<MyStudentRow[]> {
  const user = await getCurrentUser()
  if (!user) return []
  const supabase = await createClient()
  // 담당 = 고정 담당(instructor_id) ∪ 요일배정(student_day_instructors). 둘 다 합쳐 표시.
  const [staticRows, { data: dayRows }] = await Promise.all([
    getMyStaticStudents(),
    supabase.from('student_day_instructors').select('student_id').eq('instructor_id', user.id),
  ])
  const map = new Map<string, MyStudentRow>()
  for (const s of staticRows) map.set(s.id, s)
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
  const user = await getCurrentUser()
  if (!user) return { date: '', dateLabel: '', students: [] }
  const date = kstDaysAgo(daysBack)
  const d = new Date(date + 'T12:00:00+09:00')
  const weekday = d.getDay()
  const dayNames = ['일', '월', '화', '수', '목', '금', '토']
  const dateLabel = `${daysBack === 1 ? '어제' : '그저께'} ${d.getMonth() + 1}/${d.getDate()}(${dayNames[weekday]})`
  // 해당 요일 내 담당 학생 = 고정담당 ∪ 요일배정. 고정담당은 캐시(어제/그제 공유).
  const [staticRows, { data: dayRows }] = await Promise.all([
    getMyStaticStudents(),
    supabase.from('student_day_instructors').select('student_id').eq('instructor_id', user.id).eq('weekday', weekday),
  ])
  const map = new Map<string, MyStudentRow>()
  for (const s of staticRows) map.set(s.id, s)
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

// ── 배럴 재export: 기존 import 경로 '@/lib/v2/data' 호환 유지 ──
export * from './curriculum-data'
export * from './analytics-data'
