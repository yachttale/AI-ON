import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getPriorStrokeBonus, STROKES, MASTER_STROKES } from '@/lib/curriculum'
import StudentProgressList from '@/components/StudentProgressList'
import type { StudentProgressItem } from '@/components/StudentProgressList'

export default async function InstructorDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: students } = await supabase
    .from('students')
    .select('*')
    .eq('instructor_id', user.id)
    .eq('is_active', true)
    .order('name')

  const ids = (students ?? []).map(s => s.id)

  const { data: allLogsRaw } = ids.length > 0
    ? await supabase
        .from('session_logs')
        .select('*')
        .in('student_id', ids)
        .order('session_date', { ascending: false })
    : { data: [] }

  const allLogs = allLogsRaw ?? []

  const seen = new Set<string>()
  const latestPerStudent = allLogs.filter(l => {
    if (!l.stroke) return false
    if (seen.has(l.student_id)) return false
    seen.add(l.student_id)
    return true
  })

  const studentsWithStroke = (students ?? []).map(s => {
    const latest = latestPerStudent.find(l => l.student_id === s.id)
    return { ...s, currentStroke: latest?.stroke ?? null, currentStage: latest?.stage ?? null }
  })

  const strokeLogs = allLogs.filter(l => l.stroke)

  const studentProgress: StudentProgressItem[] = studentsWithStroke.map(s => {
    const logs = allLogs.filter(l => l.student_id === s.id)
    const totalAttended =
      logs.filter(l => l.attendance !== '결석').length +
      getPriorStrokeBonus(s.currentStroke, s.currentStage)
    const stageCount = strokeLogs.filter(
      l =>
        l.student_id === s.id &&
        l.stroke === s.currentStroke &&
        l.stage === s.currentStage &&
        l.attendance !== '결석'
    ).length
    const latestStatus = latestPerStudent.find(l => l.student_id === s.id)?.status ?? null
    const currentIdx = s.currentStroke ? (STROKES as readonly string[]).indexOf(s.currentStroke) : -1
    const completedStrokes = MASTER_STROKES.filter(ms => {
      const msIdx = (STROKES as readonly string[]).indexOf(ms)
      return currentIdx > 0 && msIdx < currentIdx
    })
    return {
      id: s.id,
      name: s.name,
      stroke: s.currentStroke,
      stage: s.currentStage,
      status: latestStatus,
      totalAttended,
      stageCount,
      completedStrokes,
    }
  })

  const strokeGroups = (STROKES as readonly string[])
    .map(stroke => ({
      stroke,
      count: studentsWithStroke.filter(s => s.currentStroke === stroke).length,
    }))
    .filter(g => g.count > 0)

  const noStrokeCount = studentsWithStroke.filter(s => !s.currentStroke).length

  return (
    <div className="space-y-6">
      {/* 총인원 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <p className="text-sm text-gray-500 mb-0.5">내 담당반 총인원</p>
        <p className="text-3xl font-bold text-sky-600">
          {students?.length ?? 0}
          <span className="text-base font-normal text-gray-400 ml-1">명</span>
        </p>
      </div>

      {/* 진도별 인원 */}
      <div>
        <h3 className="text-sm font-bold text-gray-600 mb-3">진도별 인원</h3>
        <div className="grid grid-cols-3 gap-2">
          {strokeGroups.map(({ stroke, count }) => (
            <div
              key={stroke}
              className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm text-center"
            >
              <p className="text-xs text-gray-500 mb-1">{stroke}</p>
              <p className="text-xl font-bold text-gray-800">
                {count}
                <span className="text-xs font-normal text-gray-400 ml-0.5">명</span>
              </p>
            </div>
          ))}
          {noStrokeCount > 0 && (
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 text-center">
              <p className="text-xs text-gray-400 mb-1">미기록</p>
              <p className="text-xl font-bold text-gray-400">
                {noStrokeCount}
                <span className="text-xs font-normal ml-0.5">명</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 학생 진도 현황 */}
      <div>
        <h3 className="text-sm font-bold text-gray-600 mb-3">
          학생 진도 현황
          <span className="ml-2 text-gray-400 font-normal">({studentProgress.length}명)</span>
        </h3>
        <StudentProgressList students={studentProgress} basePath="/instructor/student" />
      </div>
    </div>
  )
}
