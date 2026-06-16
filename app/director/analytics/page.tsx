import { createClient } from '@/lib/supabase/server'
import AnalyticsTabs from '@/components/AnalyticsTabs'
import type { StrokeStats, InstructorStats, GradeStats } from '@/components/AnalyticsTabs'
import { STAGES, STROKE_BASE_SESSIONS } from '@/lib/curriculum'

const ANALYZE_STROKES = ['자유형', '배영', '평영', '접영'] as const

function kstNow() {
  const now = new Date()
  return new Date(now.getTime() + 9 * 60 * 60 * 1000)
}

export default async function AnalyticsPage() {
  const supabase = await createClient()

  const kst = kstNow()
  const thisYear = kst.getUTCFullYear()
  const thisMonth = kst.getUTCMonth() + 1
  const monthPrefix = `${thisYear}-${String(thisMonth).padStart(2, '0')}`

  const oneYearAgo = `${thisYear - 1}-${String(thisMonth).padStart(2, '0')}-01`

  const { data: students } = await supabase.from('students').select('*').eq('is_active', true)
  const activeIds = (students ?? []).map(s => s.id)

  const [
    { data: instructors },
    { data: allLogs },
  ] = await Promise.all([
    supabase.from('profiles').select('id, name').eq('role', 'instructor').order('name'),
    activeIds.length > 0
      ? supabase
          .from('session_logs')
          .select('student_id, instructor_id, session_date, stroke, stage, status, attendance')
          .in('student_id', activeIds)
          .gte('session_date', oneYearAgo)
          .order('session_date', { ascending: false })
      : Promise.resolve({ data: [] as { student_id: string; instructor_id: string; session_date: string; stroke: string | null; stage: string | null; status: string | null; attendance: string }[], error: null }),
  ])

  const logs = allLogs ?? []
  const activeStudents = students ?? []

  // 학생별 최신 영법
  const latestStrokeMap = new Map<string, string>()
  const seen = new Set<string>()
  for (const log of logs) {
    if (!log.stroke) continue
    if (seen.has(log.student_id)) continue
    seen.add(log.student_id)
    latestStrokeMap.set(log.student_id, log.stroke)
  }

  // ── 영법별 통계 ──────────────────────────────────────────────
  const strokeStats: StrokeStats[] = ANALYZE_STROKES.map(stroke => {
    const baseline = (STROKE_BASE_SESSIONS as Record<string, number>)[stroke] ?? 25
    const strokeLogs = logs.filter(l => l.stroke === stroke)

    const currentCount = activeStudents.filter(s => latestStrokeMap.get(s.id) === stroke).length

    const completedIds = new Set(
      strokeLogs.filter(l => l.stage === '완성' && l.status === '통과').map(l => l.student_id)
    )
    const completedCount = completedIds.size

    let avgSessionsToComplete: number | null = null
    if (completedCount > 0) {
      const counts = [...completedIds].map(sid =>
        strokeLogs.filter(l => l.student_id === sid && l.attendance !== '결석').length
      )
      avgSessionsToComplete = Math.round(counts.reduce((a, b) => a + b, 0) / counts.length)
    }

    const stageList = STAGES[stroke as keyof typeof STAGES] ?? []
    const stageStats = stageList.map(stage => {
      const stageLogs = strokeLogs.filter(l => l.stage === stage)
      const studentCount = new Set(stageLogs.map(l => l.student_id)).size
      const passedIds = new Set(
        stageLogs.filter(l => l.status === '통과').map(l => l.student_id)
      )
      const passedCount = passedIds.size

      let avgSessions = 0
      if (passedCount > 0) {
        const counts = [...passedIds].map(sid =>
          stageLogs.filter(l => l.student_id === sid && l.attendance !== '결석').length
        )
        avgSessions = Math.round(counts.reduce((a, b) => a + b, 0) / counts.length)
      }

      return { stage, studentCount, avgSessions, passedCount }
    })

    return { stroke, baseline, currentCount, completedCount, avgSessionsToComplete, stageStats }
  })

  // ── 강사별 통계 ──────────────────────────────────────────────
  const instructorStats: InstructorStats[] = (instructors ?? []).map(inst => {
    const myStudents = activeStudents.filter(s => s.instructor_id === inst.id)
    const studentCount = myStudents.length

    const thisMonthSessions = logs.filter(
      l => l.instructor_id === inst.id && l.session_date.startsWith(monthPrefix)
    ).length

    const completions = logs.filter(
      l => l.instructor_id === inst.id && l.stage === '완성' && l.status === '통과'
    ).length

    const strokeDist: Record<string, number> = {}
    for (const s of myStudents) {
      const stroke = latestStrokeMap.get(s.id) ?? '미시작'
      strokeDist[stroke] = (strokeDist[stroke] ?? 0) + 1
    }

    return { id: inst.id, name: inst.name, studentCount, thisMonthSessions, completions, strokeDist }
  })

  // ── 학년별 통계 ──────────────────────────────────────────────
  const grades = [...new Set(activeStudents.map(s => s.grade ?? '미입력'))].sort()
  const gradeStats: GradeStats[] = grades.map(grade => {
    const gradeStudents = activeStudents.filter(s => (s.grade ?? '미입력') === grade)
    const strokeDist: Record<string, number> = {}
    for (const s of gradeStudents) {
      const stroke = latestStrokeMap.get(s.id) ?? '미시작'
      strokeDist[stroke] = (strokeDist[stroke] ?? 0) + 1
    }
    return { grade, studentCount: gradeStudents.length, strokeDist }
  })

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-800 mb-4">데이터 분석</h2>
      <AnalyticsTabs
        strokeStats={strokeStats}
        instructorStats={instructorStats}
        gradeStats={gradeStats}
        thisMonthLabel={`${thisMonth}월`}
      />
    </div>
  )
}
