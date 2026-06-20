// lib/v2/analytics-data.ts — 원장 대시보드·강사 통계·학생 리포트·시간표 조회 레이어.
import { createClient } from '@/lib/supabase/server'
import type { ProgressSource } from '@/types/v2'
import { buildStrokeLadders, selectCardWindow, type LadderInputStep } from './ladder'
import { getTodayEntries, parseSchedule } from '@/lib/schedule'
import { kstToday, kstWeekday, kstDaysAgo } from '@/lib/v2/now'
import { computeCurrentStrokeKey, getCachedLadderSteps } from './curriculum-data'
import { getStrokeLadders } from './data'

const todayStr = kstToday

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

const STROKE_ORDER_KEYS = ['beginner', 'freestyle', 'backstroke', 'breaststroke', 'butterfly', 'master']
const STROKE_LABELS_MAP: Record<string, string> = {
  beginner: '초보', freestyle: '자유형', backstroke: '배영', breaststroke: '평영', butterfly: '접영', master: '마스터',
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

// 영법 완주 기간 대시보드 — is_first_completion 단계부터 마지막 사다리 단계까지 소요일
const STROKE_ORDER_FOR_STATS = ['beginner', 'freestyle', 'backstroke', 'breaststroke', 'butterfly', 'master']

export interface ProgressStat {
  strokeKey: string; strokeLabel: string; color: string | null
  count: number; avgDays: number; minDays: number; maxDays: number
}
export interface InstructorProgressStat {
  instructorId: string; instructorName: string
  strokes: { strokeKey: string; strokeLabel: string; color: string | null; count: number; avgDays: number }[]
}
export interface ProgressDashboard { byStroke: ProgressStat[]; byInstructor: InstructorProgressStat[] }

export async function getProgressDashboard(): Promise<ProgressDashboard> {
  const supabase = await createClient()
  const [allSteps, { data: prog }, { data: profiles }] = await Promise.all([
    getCachedLadderSteps(),
    supabase.from('skill_progress').select('student_id,skill_step_id,passed_at,instructor_id').eq('source', 'observed'),
    supabase.from('profiles').select('id,name'),
  ])
  const nameById = new Map((profiles ?? []).map(p => [p.id, p.name]))

  // 영법별 첫 단계(is_first_completion) ID + 마지막 사다리 단계 ID + 메타
  const firstIdsByStroke = new Map<string, Set<string>>()
  const lastIdByStroke = new Map<string, string>()
  const strokeMeta = new Map<string, { label: string; color: string | null }>()
  const ladderByStroke = new Map<string, LadderInputStep[]>()

  for (const s of allSteps) {
    if (s.step_kind !== 'ladder') continue
    if (!ladderByStroke.has(s.stroke_key)) ladderByStroke.set(s.stroke_key, [])
    ladderByStroke.get(s.stroke_key)!.push(s)
    strokeMeta.set(s.stroke_key, { label: s.stroke_label, color: s.color })
    if (s.is_first_completion) {
      if (!firstIdsByStroke.has(s.stroke_key)) firstIdsByStroke.set(s.stroke_key, new Set())
      firstIdsByStroke.get(s.stroke_key)!.add(s.id)
    }
  }
  for (const [k, steps] of ladderByStroke) {
    const last = steps.sort((a, b) => b.ladder_order - a.ladder_order)[0]
    if (last) lastIdByStroke.set(k, last.id)
  }

  // 학생별 (단계→통과일), (단계→강사) 사전 인덱스 — O(N) 1회 구성
  const studentStepDate = new Map<string, Map<string, string>>()
  const studentStepInstructor = new Map<string, Map<string, string | null>>()
  for (const p of prog ?? []) {
    if (!studentStepDate.has(p.student_id)) {
      studentStepDate.set(p.student_id, new Map())
      studentStepInstructor.set(p.student_id, new Map())
    }
    studentStepDate.get(p.student_id)!.set(p.skill_step_id, p.passed_at)
    studentStepInstructor.get(p.student_id)!.set(p.skill_step_id, p.instructor_id ?? null)
  }

  // 영법별 유효 데이터 집계
  interface DataPoint { days: number; instructorId: string | null }
  const strokeData = new Map<string, DataPoint[]>()

  for (const strokeKey of STROKE_ORDER_FOR_STATS) {
    const firstIds = firstIdsByStroke.get(strokeKey)
    const lastId = lastIdByStroke.get(strokeKey)
    if (!firstIds || !lastId) continue
    const points: DataPoint[] = []
    for (const [studentId, stepDates] of studentStepDate) {
      let firstDate: string | null = null
      for (const fid of firstIds) {
        const d = stepDates.get(fid)
        if (d && (!firstDate || d < firstDate)) firstDate = d
      }
      const lastDate = stepDates.get(lastId) ?? null
      if (!firstDate || !lastDate) continue
      const days = Math.round((new Date(lastDate).getTime() - new Date(firstDate).getTime()) / 86400000)
      if (days < 0) continue
      // 마지막 단계 통과 강사 — 사전 인덱스에서 O(1) 조회
      const instructorId = studentStepInstructor.get(studentId)?.get(lastId) ?? null
      points.push({ days, instructorId })
    }
    if (points.length > 0) strokeData.set(strokeKey, points)
  }

  const byStroke: ProgressStat[] = []
  for (const strokeKey of STROKE_ORDER_FOR_STATS) {
    const pts = strokeData.get(strokeKey)
    if (!pts) continue
    const meta = strokeMeta.get(strokeKey)!
    const days = pts.map(p => p.days)
    byStroke.push({
      strokeKey, strokeLabel: meta.label, color: meta.color, count: days.length,
      avgDays: Math.round(days.reduce((a, b) => a + b, 0) / days.length),
      minDays: Math.min(...days), maxDays: Math.max(...days),
    })
  }

  const instMap = new Map<string, Map<string, number[]>>()
  for (const [strokeKey, pts] of strokeData) {
    for (const p of pts) {
      if (!p.instructorId) continue
      if (!instMap.has(p.instructorId)) instMap.set(p.instructorId, new Map())
      const sm = instMap.get(p.instructorId)!
      if (!sm.has(strokeKey)) sm.set(strokeKey, [])
      sm.get(strokeKey)!.push(p.days)
    }
  }
  const byInstructor: InstructorProgressStat[] = []
  for (const [instId, sm] of instMap) {
    const strokes = STROKE_ORDER_FOR_STATS.flatMap(sk => {
      const days = sm.get(sk)
      if (!days?.length) return []
      const meta = strokeMeta.get(sk)!
      return [{ strokeKey: sk, strokeLabel: meta.label, color: meta.color, count: days.length, avgDays: Math.round(days.reduce((a, b) => a + b, 0) / days.length) }]
    })
    if (!strokes.length) continue
    byInstructor.push({ instructorId: instId, instructorName: nameById.get(instId) ?? '?', strokes })
  }
  byInstructor.sort((a, b) => a.instructorName.localeCompare(b.instructorName, 'ko'))
  return { byStroke, byInstructor }
}

// 일주일 시간표 — 요일×시간 슬롯별 강사+학생 목록
const DAY_TO_JS: Record<string, number> = { '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 }

export interface TimetableStudent { id: string; name: string; strokeKey: string | null }
export interface TimetableInstructorGroup {
  instructorId: string | null; instructorName: string | null
  students: TimetableStudent[]
}
export type TimetableMap = Map<string, TimetableInstructorGroup[]> // key: `${jsDay}-${hour24}`

export async function getWeeklyTimetable(): Promise<TimetableMap> {
  const supabase = await createClient()
  const [allSteps, { data: students }, { data: sdi }, { data: profiles }] = await Promise.all([
    getCachedLadderSteps(),
    supabase.from('students').select('id,name,schedule,instructor_id').eq('is_active', true),
    supabase.from('student_day_instructors').select('student_id,weekday,instructor_id'),
    supabase.from('profiles').select('id,name'),
  ])

  const nameById = new Map((profiles ?? []).map(p => [p.id, p.name]))

  // P2: 현재 영법은 MV(mv_student_current_stroke)에서 우선 조회 — 원장 화면용, 약간의 지연 허용.
  //     MV 미적용/조회 실패 시 전체 관측 진행으로 즉시 계산(폴백) — SQL 적용 전에도 정상 동작.
  const strokeKeyById = new Map<string, string | null>()
  const { data: mvRows, error: mvErr } = await supabase
    .from('mv_student_current_stroke').select('student_id,current_stroke_key')
  if (!mvErr && mvRows && mvRows.length > 0) {
    for (const r of mvRows as { student_id: string; current_stroke_key: string | null }[]) {
      strokeKeyById.set(r.student_id, r.current_stroke_key)
    }
  } else {
    const { data: prog } = await supabase
      .from('skill_progress').select('student_id,skill_step_id').eq('source', 'observed')
    const passedBy = new Map<string, Set<string>>()
    for (const p of prog ?? []) {
      if (!passedBy.has(p.student_id)) passedBy.set(p.student_id, new Set())
      passedBy.get(p.student_id)!.add(p.skill_step_id)
    }
    for (const s of students ?? []) {
      strokeKeyById.set(s.id, computeCurrentStrokeKey(allSteps, passedBy.get(s.id) ?? new Set()))
    }
  }

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
      instMap.get(instKey)!.push({ id: s.id, name: s.name, strokeKey: strokeKeyById.get(s.id) ?? null })
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
