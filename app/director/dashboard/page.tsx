export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { getProgressBySection, getCurrentStep, CURRICULUM, ALL_STEPS } from '@/lib/curriculum'
import { getTodayEntries } from '@/lib/schedule'
import type { SkillCheckpoint } from '@/types/database'

export default async function DirectorDashboard() {
  const supabase = await createClient()

  const today = new Date().toISOString().slice(0, 10)
  const todayJsDay = new Date().getDay()

  const [{ data: students }, { data: instructors }, { data: allCheckpoints }, { data: todayLogs }] = await Promise.all([
    supabase.from('students').select('*').eq('is_active', true).order('name'),
    supabase.from('profiles').select('id, name').eq('role', 'instructor').order('name'),
    supabase.from('skill_checkpoints').select('student_id, skill_key'),
    supabase.from('session_logs').select('student_id, instructor_id, attendance').eq('session_date', today),
  ])

  const studentList = students ?? []
  const checkpointMap = new Map<string, string[]>()
  for (const cp of allCheckpoints ?? []) {
    if (!checkpointMap.has(cp.student_id)) checkpointMap.set(cp.student_id, [])
    checkpointMap.get(cp.student_id)!.push(cp.skill_key)
  }

  const todayLogMap = new Map((todayLogs ?? []).map(l => [l.student_id, l.attendance]))

  // 강사별 오늘 수업 완료율
  const instructorStats = (instructors ?? []).map(inst => {
    const scheduled = studentList.filter(
      s => s.instructor_id === inst.id && getTodayEntries(s.schedule, todayJsDay).length > 0
    )
    const done = scheduled.filter(s => todayLogMap.has(s.id)).length
    return { ...inst, scheduled: scheduled.length, done }
  }).filter(i => i.scheduled > 0)

  // 전체 통계
  const totalSteps = ALL_STEPS.length
  const avgProgress = studentList.length > 0
    ? Math.round(studentList.reduce((sum, s) => sum + (checkpointMap.get(s.id)?.length ?? 0), 0) / studentList.length)
    : 0

  // 그룹별 학생 목록 (영법 섹션별)
  const sectionGroups = CURRICULUM.map(sec => {
    const secStudents = studentList.filter(s => {
      const passed = checkpointMap.get(s.id) ?? []
      const secSteps = sec.groups.flatMap(g => g.steps)
      const secPassed = secSteps.filter(step => passed.includes(step.key)).length
      const secTotal = secSteps.length
      // 이 섹션이 "현재 진행 중"인 경우: 섹션 진도 0%초과 100%미만
      return secPassed > 0 && secPassed < secTotal
    })
    return { ...sec, students: secStudents }
  }).filter(g => g.students.length > 0)

  return (
    <div className="space-y-6">
      {/* 전체 통계 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm text-center">
          <p className="text-xs text-gray-400 mb-1">재원</p>
          <p className="text-2xl font-bold text-gray-800">{studentList.length}<span className="text-xs font-normal text-gray-400 ml-0.5">명</span></p>
        </div>
        <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm text-center">
          <p className="text-xs text-gray-400 mb-1">평균 단계</p>
          <p className="text-2xl font-bold text-sky-600">{avgProgress}<span className="text-xs font-normal text-gray-400 ml-0.5">/{totalSteps}</span></p>
        </div>
        <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm text-center">
          <p className="text-xs text-gray-400 mb-1">강사</p>
          <p className="text-2xl font-bold text-gray-800">{(instructors ?? []).length}<span className="text-xs font-normal text-gray-400 ml-0.5">명</span></p>
        </div>
      </div>

      {/* 오늘 강사별 입력 현황 */}
      {instructorStats.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-gray-700 mb-2">오늘 수업 입력 현황</h2>
          <div className="space-y-2">
            {instructorStats.map(inst => (
              <div key={inst.id} className="bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">{inst.name}</span>
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {Array.from({ length: inst.scheduled }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-2.5 h-2.5 rounded-full ${i < inst.done ? 'bg-green-400' : 'bg-gray-200'}`}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-gray-400">{inst.done}/{inst.scheduled}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 영법별 학생 현황 */}
      {sectionGroups.map(sec => (
        <div key={sec.key}>
          <h2 className="text-sm font-bold mb-2 flex items-center gap-2" style={{ color: sec.color }}>
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: sec.color }} />
            {sec.label} 진행 중 ({sec.students.length}명)
          </h2>
          <div className="space-y-2">
            {sec.students.map(s => {
              const passed = checkpointMap.get(s.id) ?? []
              const progress = getProgressBySection(passed)
              const currentStep = getCurrentStep(passed)
              const inst = (instructors ?? []).find(i => i.id === s.instructor_id)

              return (
                <Link
                  key={s.id}
                  href={`/director/student/${s.id}`}
                  className="block bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <span className="font-semibold text-gray-800 text-sm">{s.name}</span>
                      {s.grade && <span className="text-xs text-gray-400 ml-2">{s.grade}</span>}
                    </div>
                    <span className="text-xs text-gray-400">{inst?.name ?? '미배정'}</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">{currentStep?.label ?? '완료'}</p>
                  <div className="flex gap-1">
                    {CURRICULUM.map(csec => {
                      const p = progress[csec.key]
                      return (
                        <div key={csec.key} className="flex-1">
                          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${p.percent}%`, backgroundColor: csec.color }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      ))}

      {/* 아직 초보 단계 학생 */}
      {(() => {
        const notStarted = studentList.filter(s => (checkpointMap.get(s.id)?.length ?? 0) === 0)
        if (notStarted.length === 0) return null
        return (
          <div>
            <h2 className="text-sm font-bold text-gray-400 mb-2">미시작 ({notStarted.length}명)</h2>
            <div className="space-y-2">
              {notStarted.map(s => {
                const inst = (instructors ?? []).find(i => i.id === s.instructor_id)
                return (
                  <Link
                    key={s.id}
                    href={`/director/student/${s.id}`}
                    className="block bg-gray-50 rounded-xl px-4 py-3 border border-gray-100 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-semibold text-gray-600 text-sm">{s.name}</span>
                      {s.grade && <span className="text-xs text-gray-400 ml-2">{s.grade}</span>}
                    </div>
                    <span className="text-xs text-gray-400">{inst?.name ?? '미배정'}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
