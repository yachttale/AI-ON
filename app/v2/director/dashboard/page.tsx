// app/v2/director/dashboard/page.tsx — 원장 대시보드 서버 페이지
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDashboardRaw } from '@/lib/v2/data'
import { buildDashboard } from '@/lib/v2/dashboard'

export default async function DirectorDashboardPage() {
  // 원장 권한 가드
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/v2/today')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'director') redirect('/v2/today')

  const { input, strokeMeta } = await getDashboardRaw()
  const view = buildDashboard(input, strokeMeta)

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800">원장 대시보드</h1>

      {/* 영법별 학생 수 */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">영법별 학생 수</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {view.strokeBoard.map(s => (
            <div key={s.strokeKey} className="rounded-xl bg-white border border-gray-200 shadow-sm p-4 flex flex-col items-center gap-1">
              <span className="text-sm font-medium text-gray-600">{s.strokeLabel}</span>
              <span className="text-3xl font-bold text-blue-600">{s.count}</span>
              <span className="text-xs text-gray-400">명</span>
            </div>
          ))}
          {view.strokeBoard.length === 0 && (
            <p className="col-span-full text-center py-6 text-gray-400 text-sm">영법 데이터 없음</p>
          )}
        </div>
      </section>

      {/* 미확인 수업 수 */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">미확인 수업</h2>
        <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-5 flex items-center gap-4">
          <span className="text-4xl font-bold text-orange-500">{view.pendingCount}</span>
          <span className="text-sm text-gray-600">건의 수업이 아직 확인되지 않았습니다.</span>
        </div>
      </section>

      {/* 최근 통과 이력 */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">최근 통과</h2>
        {view.recentPasses.length === 0 ? (
          <p className="text-center py-6 text-gray-400 text-sm">최근 통과 기록 없음</p>
        ) : (
          <div className="rounded-xl bg-white border border-gray-200 shadow-sm divide-y divide-gray-100">
            {view.recentPasses.map((p, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-800">{p.studentName}</span>
                  <span className="text-xs text-gray-500">{p.stepLabel}</span>
                </div>
                <span className="text-xs text-gray-400">{p.passedAt.slice(0, 10)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
