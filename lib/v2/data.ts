// lib/v2/data.ts — v2 서버 데이터 접근 레이어
import { createClient } from '@/lib/supabase/server'
import type { SkillStep, SkillProgress, Measurement, ProgressSource } from '@/types/v2'
import type { TodayStudent, TodaySession, TodayCard, TodayCardView } from './today'
import { buildTodayCardView } from './today'
import { buildStrokeLadders, type LadderInputStep, type StrokeLadderView } from './ladder'
import { getTodayEntries } from '@/lib/schedule'

const todayStr = () => new Date().toISOString().slice(0, 10)

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

// 오늘 수업: 전체 활성 학생(담당 강사명 포함) + 당일 출결/바퀴수.
// 내 반/가져오기 구분은 buildTodayCards가 currentUserId로 수행(요일별 다른 강사 지원).
export async function getTodayStudentsRaw(): Promise<{ students: TodayStudent[]; sessionById: Map<string, TodaySession> }> {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)
  const weekday = new Date().getDay()  // 0=일 ~ 6=토
  const { data: rows, error } = await supabase
    .from('students')
    .select('id,name,grade,schedule,instructor_id')
    .eq('is_active', true).order('name')
  if (error) throw error
  const base = rows ?? []
  const ids = base.map(s => s.id)
  // 강사 이름 맵(고정 담당·요일 배정 공용)
  const { data: profs } = await supabase.from('profiles').select('id,name')
  const nameById = new Map((profs ?? []).map(p => [p.id, p.name]))
  // 오늘 요일의 학생별 담당 강사(요일별 배정 = 오버라이드)
  const dayAssign = new Map<string, string>()  // student_id → instructor_id
  if (ids.length) {
    const { data: sdi } = await supabase
      .from('student_day_instructors')
      .select('student_id,instructor_id')
      .eq('weekday', weekday).in('student_id', ids)
    for (const a of sdi ?? []) dayAssign.set(a.student_id, a.instructor_id)
  }
  // 오늘 담당 = 요일 배정(오버라이드) ?? 고정 담당. → 원장·강사 모두 평소 담당이 '내 수업'에 노출.
  const students: TodayStudent[] = base.map(s => {
    const instructorId = dayAssign.get(s.id) ?? s.instructor_id ?? null
    return { id: s.id, name: s.name, grade: s.grade, schedule: s.schedule, instructor_id: instructorId, instructor_name: instructorId ? nameById.get(instructorId) ?? null : null }
  })
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
  return { students, sessionById }
}

// 학생 영법별 사다리 뷰(통과·source·연습횟수 반영)
export async function getStrokeLadders(studentId: string): Promise<StrokeLadderView[]> {
  const supabase = await createClient()
  const versionId = await getActiveVersionId(supabase)
  if (!versionId) return []
  const steps = await getLadderInputs(supabase, versionId)
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

// 오늘 카드(내 반) 보강 — 배치 로드로 N+1 회피. 빈 배열이면 즉시 반환.
export async function enrichMineCards(cards: TodayCard[]): Promise<TodayCardView[]> {
  if (cards.length === 0) return []
  const supabase = await createClient()
  const versionId = await getActiveVersionId(supabase)
  if (!versionId) return cards.map(c => buildTodayCardView(c, [], new Set(), new Set()))
  const ids = cards.map(c => c.id)
  const today = todayStr()
  const [inputs, { data: prog }, { data: meas }] = await Promise.all([
    getLadderInputs(supabase, versionId),
    supabase.from('skill_progress').select('student_id,skill_step_id,source,passed_at').in('student_id', ids),
    supabase.from('measurements').select('student_id,skill_step_id,metric_type,measured_on').in('student_id', ids).eq('measured_on', today),
  ])
  // 학생별 통과/오늘통과
  const passedBy = new Map<string, Set<string>>(); const sourceBy = new Map<string, Map<string, ProgressSource>>()
  const passedTodayBy = new Map<string, Set<string>>()
  for (const p of prog ?? []) {
    ;(passedBy.get(p.student_id) ?? passedBy.set(p.student_id, new Set()).get(p.student_id)!).add(p.skill_step_id)
    ;(sourceBy.get(p.student_id) ?? sourceBy.set(p.student_id, new Map()).get(p.student_id)!).set(p.skill_step_id, p.source)
    if (p.passed_at === today) (passedTodayBy.get(p.student_id) ?? passedTodayBy.set(p.student_id, new Set()).get(p.student_id)!).add(p.skill_step_id)
  }
  // 학생별 오늘 기록(측정/연습) + 오늘 연습횟수
  const recordedTodayBy = new Map<string, Set<string>>(); const attemptTodayBy = new Map<string, Map<string, number>>()
  for (const m of meas ?? []) {
    if (!m.skill_step_id) continue
    ;(recordedTodayBy.get(m.student_id) ?? recordedTodayBy.set(m.student_id, new Set()).get(m.student_id)!).add(m.skill_step_id)
    if (m.metric_type === 'attempt') {
      const map = attemptTodayBy.get(m.student_id) ?? attemptTodayBy.set(m.student_id, new Map()).get(m.student_id)!
      map.set(m.skill_step_id, (map.get(m.skill_step_id) ?? 0) + 1)
    }
  }
  return cards.map(c => {
    const strokes = buildStrokeLadders(
      inputs, passedBy.get(c.id) ?? new Set(), sourceBy.get(c.id) ?? new Map(), attemptTodayBy.get(c.id) ?? new Map(),
    )
    return buildTodayCardView(c, strokes, recordedTodayBy.get(c.id) ?? new Set(), passedTodayBy.get(c.id) ?? new Set())
  })
}

// 나의 학생(담당 전체) 목록
export interface MyStudentRow { id: string; name: string; grade: string | null; schedule: string | null }
export async function getMyStudents(): Promise<MyStudentRow[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('students').select('id,name,grade,schedule')
    .eq('instructor_id', user.id).eq('is_active', true).order('name')
  if (error) throw error
  return (data ?? []) as MyStudentRow[]
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
export interface DirectorStudentRow { id: string; name: string; passed: number; total: number; instructorName: string | null }
export interface DirectorStrokeGroup { stroke_key: string; stroke_label: string; students: DirectorStudentRow[] }
export interface DirectorDashboard {
  totalStudents: number; totalInstructors: number
  todayScheduled: number; todayDone: number; todayAbsent: number
  pendingWithdrawals: number; newStudents30d: number
  instructorStats: InstructorStat[]
  strokeGroups: DirectorStrokeGroup[]
}

export async function getDirectorDashboard(): Promise<DirectorDashboard> {
  const supabase = await createClient()
  const today = todayStr()
  const weekday = new Date().getDay()
  const versionId = await getActiveVersionId(supabase)
  const inputs = versionId ? await getLadderInputs(supabase, versionId) : []

  // ladder 단계 → 영법, 영법별 ladder 총수, 영법 메타
  const stepStroke = new Map<string, string>()       // skill_step_id → stroke_key (ladder만)
  const ladderTotal = new Map<string, number>()       // stroke_key → ladder 단계수
  const strokeMeta = new Map<string, string>()        // stroke_key → label
  const strokeOrder: string[] = []
  for (const s of inputs) {
    if (!strokeMeta.has(s.stroke_key)) { strokeMeta.set(s.stroke_key, s.stroke_label); strokeOrder.push(s.stroke_key) }
    if (s.step_kind === 'ladder') { stepStroke.set(s.id, s.stroke_key); ladderTotal.set(s.stroke_key, (ladderTotal.get(s.stroke_key) ?? 0) + 1) }
  }

  const since7 = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)
  const since30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
  const [{ data: allStudents }, { data: profiles }, { data: prog }, { data: sessions }, { data: sdi }] = await Promise.all([
    // 퇴원율 계산 위해 비활성 포함 전체 로드
    supabase.from('students').select('id,name,schedule,instructor_id,is_active,withdrawal_status,enrolled_on').order('name'),
    supabase.from('profiles').select('id,name,role'),
    supabase.from('skill_progress').select('student_id,skill_step_id,instructor_id,passed_at,source'),
    supabase.from('sessions').select('student_id,attendance').eq('session_date', today),
    supabase.from('student_day_instructors').select('student_id,instructor_id').eq('weekday', weekday),
  ])
  const everStudents = allStudents ?? []
  const studentList = everStudents.filter(s => s.is_active)
  const nameById = new Map((profiles ?? []).map(p => [p.id, p.name]))
  const instructors = (profiles ?? []).filter(p => p.role === 'instructor' || p.role === 'director')
  const dayInstr = new Map((sdi ?? []).map(a => [a.student_id, a.instructor_id]))
  const doneSet = new Set((sessions ?? []).map(s => s.student_id))
  const todayAbsent = (sessions ?? []).filter(s => s.attendance === '결석').length
  const pendingWithdrawals = everStudents.filter(s => s.withdrawal_status === 'pending').length
  const newStudents30d = studentList.filter(s => s.enrolled_on && s.enrolled_on >= since30).length

  // 학생별 영법별 통과(ladder) 수 (활성 학생 진행 그룹용)
  const passedByStroke = new Map<string, Map<string, number>>()
  for (const p of prog ?? []) {
    const sk = stepStroke.get(p.skill_step_id); if (!sk) continue
    const m = passedByStroke.get(p.student_id) ?? passedByStroke.set(p.student_id, new Map()).get(p.student_id)!
    m.set(sk, (m.get(sk) ?? 0) + 1)
  }

  // 강사별 스코어카드: 담당·퇴원·최근통과 + 오늘 입력 현황
  interface Agg { scheduled: number; done: number; assigned: number; withdrawn: number; recentPasses: number }
  const instAgg = new Map<string, Agg>()
  const agg = (id: string) => instAgg.get(id) ?? instAgg.set(id, { scheduled: 0, done: 0, assigned: 0, withdrawn: 0, recentPasses: 0 }).get(id)!
  // 담당·퇴원(고정 담당 기준)
  for (const s of everStudents) {
    if (!s.instructor_id) continue
    const a = agg(s.instructor_id)
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
        .map(({ s, passed }) => ({ id: s.id, name: s.name, passed, total, instructorName: s.instructor_id ? nameById.get(s.instructor_id) ?? null : null }))
      return { stroke_key: sk, stroke_label: strokeMeta.get(sk)!, students: rows }
    })
    .filter(g => g.students.length > 0)

  return {
    totalStudents: studentList.length,
    totalInstructors: instructors.length,
    todayScheduled, todayDone, todayAbsent,
    pendingWithdrawals, newStudents30d,
    instructorStats, strokeGroups,
  }
}

// 학생 대시보드: 기본정보 + 영법별 진도% + 최근 30일 기록
export interface StrokeProgress { stroke_key: string; stroke_label: string; color: string | null; passed: number; total: number; pct: number }
export interface RecentRecord { date: string; label: string; kind: 'passed' | 'measure' }
export interface StudentDashboard {
  name: string; grade: string | null; schedule: string | null; enrolled_on: string | null
  instructorName: string | null; currentStepLabel: string | null
  strokeProgress: StrokeProgress[]; recent: RecentRecord[]
}
export async function getStudentDashboard(studentId: string): Promise<StudentDashboard | null> {
  const supabase = await createClient()
  const { data: student } = await supabase
    .from('students').select('name,grade,schedule,enrolled_on,profiles:instructor_id(name)')
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

  // 최근 30일: 통과 이벤트 + 측정(라벨은 step) 병합
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
  const labelById = new Map<string, string>()
  for (const s of strokes) for (const t of s.tracks) for (const st of t.steps) labelById.set(st.id, st.label)
  const [{ data: prog }, { data: meas }] = await Promise.all([
    supabase.from('skill_progress').select('skill_step_id,passed_at,step_key_snapshot').eq('student_id', studentId).gte('passed_at', since),
    supabase.from('measurements').select('skill_step_id,metric_type,value,measured_on').eq('student_id', studentId).gte('measured_on', since).not('skill_step_id', 'is', null),
  ])
  const recent: RecentRecord[] = []
  for (const p of prog ?? []) recent.push({ date: p.passed_at, label: `${labelById.get(p.skill_step_id) ?? p.step_key_snapshot} 통과`, kind: 'passed' })
  for (const m of meas ?? []) {
    if (m.metric_type === 'attempt') continue // 연습 탭은 요약에서 생략
    const unit = m.metric_type === 'time_sec' ? '초' : m.metric_type === 'stroke_count' ? '스트로크' : m.metric_type === 'laps' ? '바퀴' : 'm'
    recent.push({ date: m.measured_on, label: `${labelById.get(m.skill_step_id) ?? ''} ${m.value}${unit}`.trim(), kind: 'measure' })
  }
  recent.sort((a, b) => (a.date < b.date ? 1 : -1))
  return {
    name: student.name, grade: student.grade, schedule: student.schedule, enrolled_on: student.enrolled_on,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    instructorName: (student as any).profiles?.name ?? null,
    currentStepLabel, strokeProgress, recent: recent.slice(0, 50),
  }
}
