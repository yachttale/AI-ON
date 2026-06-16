export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import StageBoard from '@/components/StageBoard'
import StagnantAlert from '@/components/StagnantAlert'
import InstructorCompletion from '@/components/InstructorCompletion'
import StudentProgressList from '@/components/StudentProgressList'
import MakeupScheduler from '@/components/MakeupScheduler'
import type { StudentProgressItem } from '@/components/StudentProgressList'
import { getTodayEntries } from '@/lib/schedule'
import { getPriorStrokeBonus, STROKES, MASTER_STROKES } from '@/lib/curriculum'
import { getKSTDateString, getKSTDay, getKSTMonthStart } from '@/lib/utils'
import type { Student, SessionLog } from '@/types/database'

interface StudentWithStroke extends Student {
  currentStroke: string | null
  currentStage: string | null
}

interface StagnantStudent {
  student: Student
  stroke: string
  stage: string
  sessionCount: number
}

const DAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']

export default async function DirectorDashboard() {
  const supabase = await createClient()

  const threeDays = [2, 1, 0].map(offset => ({
    offset,
    dateStr: getKSTDateString(offset),
    jsDay: getKSTDay(offset),
    isToday: offset === 0,
  }))

  const todayStr = getKSTDateString(0)
  const monthStart = getKSTMonthStart()

  const { data: students } = await supabase.from('students').select('*').eq('is_active', true)
  const studentIds = (students ?? []).map(s => s.id)

  const [
    { data: instructors },
    { data: periodLogs },
    { data: makeupRows },
    { data: swimDistances },
  ] = await Promise.all([
    supabase.from('profiles').select('id, name').eq('role', 'instructor').order('name'),
    supabase.from('session_logs')
      .select('student_id, instructor_id, session_date')
      .in('session_date', threeDays.map(d => d.dateStr)),
    supabase.from('planned_makeups')
      .select('id, student_id')
      .eq('session_date', todayStr),
    studentIds.length > 0
      ? supabase.from('swim_distances')
          .select('student_id, distance_m')
          .in('student_id', studentIds)
          .gte('logged_date', monthStart)
      : Promise.resolve({ data: [] as { student_id: string; distance_m: number }[], error: null }),
  ])

  const monthlyDistanceMap = new Map<string, number>()
  for (const row of swimDistances ?? []) {
    monthlyDistanceMap.set(row.student_id, (monthlyDistanceMap.get(row.student_id) ?? 0) + row.distance_m)
  }

  // stroke 필터 없이 전체 기록 (출석 횟수 정확히 계산하기 위해)
  const { data: allLogs } = await supabase
    .from('session_logs')
    .select('*')
    .in('student_id', studentIds)
    .order('session_date', { ascending: false })

  // 학생별 최신 영법/단계 (stroke 있는 로그만)
  const seen = new Set<string>()
  const latestPerStudent = (allLogs ?? []).filter(l => {
    if (!l.stroke) return false
    if (seen.has(l.student_id)) return false
    seen.add(l.student_id)
    return true
  })

  const studentsWithStroke: StudentWithStroke[] = (students ?? []).map(s => {
    const latest = latestPerStudent.find(l => l.student_id === s.id)
    return { ...s, currentStroke: latest?.stroke ?? null, currentStage: latest?.stage ?? null }
  })

  // 정체 학생: 초급 제외, 최근 출석 5회가 같은 단계
  const strokeLogs = (allLogs ?? []).filter(l => l.stroke)
  const stagnantStudents: StagnantStudent[] = studentsWithStroke
    .filter(s => s.currentStroke && s.currentStroke !== '초급')
    .flatMap(s => {
      const attended = strokeLogs
        .filter(l => l.student_id === s.id && l.attendance !== '결석')
        .slice(0, 5)
      if (attended.length < 5) return []
      const allSame = attended.every(
        l => l.stroke === attended[0].stroke && l.stage === attended[0].stage
      )
      if (!allSame) return []
      const sessionCount = strokeLogs.filter(
        l => l.student_id === s.id
          && l.stroke === s.currentStroke
          && l.stage === s.currentStage
          && l.attendance !== '결석'
      ).length
      return [{ student: s, stroke: s.currentStroke!, stage: s.currentStage!, sessionCount }]
    })

  // 연속 결석 3회 이상 학생
  interface AbsentAlert {
    student: Student
    count: number
    lastDate: string
  }
  const consecutiveAbsent: AbsentAlert[] = (students ?? []).flatMap(s => {
    const logs = (allLogs ?? []).filter(l => l.student_id === s.id)
    if (logs.length === 0) return []
    let count = 0
    for (const log of logs) {
      if (log.attendance === '결석') count++
      else break
    }
    if (count < 3) return []
    return [{ student: s, count, lastDate: logs[0].session_date }]
  })

  // 완성 달성 목록 (완성+통과 최초 기록 기준)
  type CompletedEntry = { studentId: string; studentName: string; stroke: string; date: string }
  const completedEntries: CompletedEntry[] = []
  const seenCompletions = new Set<string>()
  for (const log of (allLogs ?? [])) {
    if (log.stage === '완성' && log.status === '통과' && log.stroke) {
      const key = `${log.student_id}:${log.stroke}`
      if (!seenCompletions.has(key)) {
        seenCompletions.add(key)
        const s = (students ?? []).find(s => s.id === log.student_id)
        if (s) completedEntries.push({ studentId: s.id, studentName: s.name, stroke: log.stroke, date: log.session_date })
      }
    }
  }
  completedEntries.sort((a, b) => b.date.localeCompare(a.date))

  // 학생별 완성 영법 목록: 현재 영법보다 앞선 MASTER_STROKES는 완성으로 간주
  const completedStrokesMap = new Map<string, string[]>()
  for (const s of studentsWithStroke) {
    if (!s.currentStroke) continue
    const currentIdx = (STROKES as readonly string[]).indexOf(s.currentStroke)
    const completed = MASTER_STROKES.filter(ms => {
      const msIdx = (STROKES as readonly string[]).indexOf(ms)
      return msIdx < currentIdx
    })
    if (completed.length > 0) completedStrokesMap.set(s.id, completed)
  }

  // 학생별 진도 현황
  const studentProgress: StudentProgressItem[] = studentsWithStroke.map(s => {
    const logs = (allLogs ?? []).filter(l => l.student_id === s.id)
    const totalAttended = logs.filter(l => l.attendance !== '결석').length + getPriorStrokeBonus(s.currentStroke)
    const stageCount = strokeLogs.filter(
      l => l.student_id === s.id
        && l.stroke === s.currentStroke
        && l.stage === s.currentStage
        && l.attendance !== '결석'
    ).length
    const latestStatus = latestPerStudent.find(l => l.student_id === s.id)?.status ?? null
    return {
      id: s.id,
      name: s.name,
      stroke: s.currentStroke,
      stage: s.currentStage,
      status: latestStatus,
      totalAttended,
      stageCount,
      completedStrokes: completedStrokesMap.get(s.id) ?? [],
      monthlyDistance: monthlyDistanceMap.get(s.id),
    }
  })

  // 오늘 보강 예약 목록
  const initialMakeups = (makeupRows ?? []).flatMap(row => {
    const s = (students ?? []).find(s => s.id === row.student_id)
    if (!s) return []
    return [{ id: row.id, studentId: s.id, studentName: s.name, grade: s.grade, schedule: s.schedule }]
  })

  // 강사별 완료율 계산
  const completionRows = threeDays.map(({ dateStr, jsDay, isToday }) => {
    const dayLabel = DAY_NAMES[jsDay]
    const [, mm, dd] = dateStr.split('-')
    const label = isToday
      ? `${dayLabel} (오늘)`
      : `${dayLabel} ${parseInt(mm)}/${parseInt(dd)}`

    const stats = (instructors ?? []).map(inst => {
      const scheduled = (students ?? []).filter(
        s => s.instructor_id === inst.id && getTodayEntries(s.schedule, jsDay).length > 0
      )
      const logged = new Set(
        (periodLogs ?? [])
          .filter(l => l.session_date === dateStr && l.instructor_id === inst.id)
          .map(l => l.student_id)
      )
      return {
        name: inst.name,
        total: scheduled.length,
        done: scheduled.filter(s => logged.has(s.id)).length,
      }
    })

    return { label, isToday, stats }
  })

  return (
    <div className="space-y-6">
      <section>
        <MakeupScheduler
          students={students ?? []}
          todayStr={todayStr}
          initialMakeups={initialMakeups}
        />
      </section>

      {consecutiveAbsent.length > 0 && (
        <section>
          <h2 className="text-base font-bold text-gray-700 mb-3">
            ⚠️ 연속 결석
            <span className="ml-2 text-red-400 font-normal text-sm">({consecutiveAbsent.length}명)</span>
          </h2>
          <div className="space-y-2">
            {consecutiveAbsent.map(({ student, count, lastDate }) => (
              <a
                key={student.id}
                href={`/director/student/${student.id}`}
                className="flex items-center justify-between bg-red-50 rounded-xl px-4 py-3 border border-red-200"
              >
                <div>
                  <p className="font-semibold text-gray-800">{student.name}</p>
                  <p className="text-xs text-gray-500">마지막 수업: {lastDate}</p>
                </div>
                <span className="text-sm font-bold text-red-500">{count}회 연속 결석</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {completedEntries.length > 0 && (
        <section>
          <h2 className="text-base font-bold text-gray-700 mb-3">
            🎉 완성 달성
            <span className="ml-2 text-yellow-500 font-normal text-sm">({completedEntries.length}건)</span>
          </h2>
          <div className="space-y-2">
            {completedEntries.map(entry => (
              <div
                key={`${entry.studentId}:${entry.stroke}`}
                className="flex items-center justify-between bg-yellow-50 rounded-xl px-4 py-3 border border-yellow-200"
              >
                <div>
                  <p className="font-semibold text-gray-800">{entry.studentName}</p>
                  <p className="text-xs text-gray-500">{entry.stroke} 완성 · {entry.date}</p>
                </div>
                <a
                  href={`/director/student/${entry.studentId}/certificate?stroke=${encodeURIComponent(entry.stroke)}&readonly=true`}
                  className="text-xs px-3 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-white rounded-lg font-semibold transition-colors"
                >
                  증명서 보기
                </a>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-base font-bold text-gray-700 mb-3">강사별 입력 현황</h2>
        <InstructorCompletion rows={completionRows} />
      </section>

      <section>
        <h2 className="text-base font-bold text-gray-700 mb-3">단계별 현황</h2>
        <StageBoard students={studentsWithStroke} completedStrokesMap={Object.fromEntries(completedStrokesMap)} />
      </section>

      <section>
        <h2 className="text-base font-bold text-gray-700 mb-3">
          정체 학생
          {stagnantStudents.length > 0 && (
            <span className="ml-2 text-amber-500 text-sm">({stagnantStudents.length}명)</span>
          )}
        </h2>
        <StagnantAlert stagnantStudents={stagnantStudents} />
      </section>

      <section>
        <h2 className="text-base font-bold text-gray-700 mb-3">
          학생 진도 현황
          <span className="ml-2 text-gray-400 font-normal text-sm">({studentProgress.length}명 재원)</span>
        </h2>
        <StudentProgressList students={studentProgress} />
      </section>
    </div>
  )
}
