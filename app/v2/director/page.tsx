// app/v2/director/page.tsx — 원장 전체 현황 대시보드(원장 전용)
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDirectorDashboard, isClosedOn } from '@/lib/v2/data'
import { strokeBadge } from '@/lib/v2/stroke-colors'
import { ClosureToggle } from './ClosureToggle'

export default async function DirectorPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  if (profile?.role !== 'director') redirect('/v2/today')

  const [d, closed] = await Promise.all([getDirectorDashboard(), isClosedOn()])
  const todayPct = d.todayScheduled ? Math.round((d.todayDone / d.todayScheduled) * 100) : 0

  return (
    <div className="space-y-6">
      <ClosureToggle closed={closed} />

      {/* 전체 통계 */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="재원" value={d.totalStudents} unit="명" />
        <Stat label="오늘 입력" value={`${d.todayDone}/${d.todayScheduled}`} unit={`${todayPct}%`} accent />
        <Stat label="강사" value={d.totalInstructors} unit="명" />
      </div>

      {/* 전체 학생 명단 진입 */}
      <Link href="/v2/director/students"
        className="flex items-center justify-between bg-blue-500 text-white rounded-xl px-4 py-3 font-semibold">
        <span>전체 학생 명단 · 검색</span>
        <span className="text-sm opacity-90">{d.totalStudents}명 →</span>
      </Link>

      {/* 운영 요약 */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="오늘 결석" value={d.todayAbsent} unit="명" />
        <Stat label="퇴원 대기" value={d.pendingWithdrawals} unit="명" />
        <Stat label="최근 30일 신규" value={d.newStudents30d} unit="명" />
      </div>

      {/* 강사별 스코어카드 */}
      {d.instructorStats.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-gray-700 mb-2">강사별 현황</h2>
          <div className="space-y-2">
            {d.instructorStats.map(inst => (
              <Link key={inst.id} href={`/v2/director/students?inst=${encodeURIComponent(inst.name)}`} className="block bg-white rounded-xl px-4 py-3 border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-800">{inst.name} <span className="text-gray-300 font-normal">›</span></span>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-0.5">
                      {Array.from({ length: inst.scheduled }).map((_, i) => (
                        <div key={i} className={`w-2.5 h-2.5 rounded-full ${i < inst.done ? 'bg-green-400' : 'bg-gray-200'}`} />
                      ))}
                    </div>
                    <span className="text-xs text-gray-400">오늘 {inst.done}/{inst.scheduled}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Mini label="담당" value={`${inst.assigned}명`} />
                  <Mini label="최근7일 통과" value={`${inst.recentPasses}`} accent />
                  <Mini label="퇴원율" value={`${inst.withdrawalRate}%`} warn={inst.withdrawalRate >= 20} sub={`${inst.withdrawn}명`} />
                </div>
              </Link>
            ))}
          </div>
          <p className="text-[11px] text-gray-300 mt-1.5">* 퇴원율·통과 수는 데이터가 쌓일수록 정확해집니다(현재 초기 수집 단계).</p>
        </section>
      )}

      {/* 영법별 진행 중 학생 */}
      {d.strokeGroups.map(g => {
        const badge = strokeBadge(g.stroke_key)
        return (
          <section key={g.stroke_key}>
            <h2 className="text-sm font-bold mb-2 flex items-center gap-2 text-gray-700">
              <span className={`w-2 h-2 rounded-full ${badge.bar}`} />
              {g.stroke_label} 진행 중 <span className="text-gray-400 font-normal">({g.students.length}명)</span>
            </h2>
            <div className="space-y-2">
              {g.students.map(s => (
                <Link key={s.id} href={`/v2/student/${s.id}`} className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{s.name}</p>
                    <p className="text-xs text-gray-400">{s.instructorName ?? '미배정'}</p>
                  </div>
                  <span className="text-xs text-gray-400 tabular-nums">{s.passed}/{s.total}</span>
                </Link>
              ))}
            </div>
          </section>
        )
      })}

      {d.strokeGroups.length === 0 && (
        <p className="text-center py-8 text-gray-400 text-sm">진행 중인 학생 데이터가 없습니다</p>
      )}
    </div>
  )
}

function Mini({ label, value, sub, accent, warn }: { label: string; value: string; sub?: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-gray-50 py-1.5">
      <p className="text-[10px] text-gray-400">{label}</p>
      <p className={`text-sm font-bold ${warn ? 'text-red-500' : accent ? 'text-sky-600' : 'text-gray-700'}`}>
        {value}{sub && <span className="text-[10px] font-normal text-gray-400 ml-0.5">{sub}</span>}
      </p>
    </div>
  )
}

function Stat({ label, value, unit, accent }: { label: string; value: string | number; unit?: string; accent?: boolean }) {
  return (
    <div className="bg-white rounded-xl p-3 border text-center">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ? 'text-sky-600' : 'text-gray-800'}`}>
        {value}{unit && <span className="text-xs font-normal text-gray-400 ml-0.5">{unit}</span>}
      </p>
    </div>
  )
}
