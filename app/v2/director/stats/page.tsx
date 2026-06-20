// app/v2/director/stats/page.tsx — 영법 완주 기간 통계 대시보드
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProgressDashboard } from '@/lib/v2/data'
import { strokeBadge } from '@/lib/v2/stroke-colors'

function BarChart({ items, maxVal }: {
  items: { label: string; value: number; color: string | null; sub: string }[]
  maxVal: number
}) {
  return (
    <div className="space-y-3">
      {items.map(item => {
        const pct = maxVal > 0 ? Math.round((item.value / maxVal) * 100) : 0
        const bar = strokeBadge(item.label === '초보' ? 'beginner'
          : item.label === '자유형' ? 'freestyle'
          : item.label === '배영' ? 'backstroke'
          : item.label === '평영' ? 'breaststroke'
          : item.label === '접영' ? 'butterfly'
          : item.label === '마스터' ? 'master' : null).bar
        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/70 font-medium">{item.label}</span>
              <span className="text-white/40">{item.sub}</span>
            </div>
            <div className="h-6 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full flex items-center px-2 transition-all ${bar}`}
                style={{ width: `${Math.max(pct, 4)}%` }}
              >
                <span className="text-[10px] font-bold text-gray-900 whitespace-nowrap">
                  {item.value}일
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default async function StatsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  if (profile?.role !== 'director') redirect('/v2/today')

  const { byStroke, byInstructor } = await getProgressDashboard()

  const maxAvg = Math.max(...byStroke.map(s => s.avgDays), 1)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white">진도 통계</h1>
        <p className="text-xs text-white/40 mt-0.5">처음부터 시작한 학생 기준 · 영법별 완주 소요 기간</p>
      </div>

      {/* 영법별 평균 기간 */}
      <section className="bg-[#1a1a2e] rounded-xl border border-white/8 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">영법별 평균 완주 기간</h2>
        {byStroke.length === 0 ? (
          <p className="text-center py-6 text-white/30 text-sm">아직 완주 데이터 없음</p>
        ) : (
          <>
            <BarChart
              maxVal={maxAvg}
              items={byStroke.map(s => ({
                label: s.strokeLabel,
                value: s.avgDays,
                color: s.color,
                sub: `${s.count}명 · 최단 ${s.minDays}일 / 최장 ${s.maxDays}일`,
              }))}
            />
            {/* 요약 카드 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
              {byStroke.map(s => {
                const { badge } = strokeBadge(s.strokeKey)
                return (
                  <div key={s.strokeKey} className="bg-white/5 rounded-xl p-3 space-y-1">
                    <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold ${badge}`}>
                      {s.strokeLabel}
                    </span>
                    <p className="text-xl font-bold text-white">
                      {s.avgDays}<span className="text-xs text-white/40 font-normal ml-0.5">일</span>
                    </p>
                    <p className="text-[10px] text-white/30">{s.count}명 완주</p>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </section>

      {/* 강사별 영법 평균 */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">강사별 완주 기간</h2>
        {byInstructor.length === 0 ? (
          <div className="bg-[#1a1a2e] rounded-xl border border-white/8 py-8 text-center text-white/30 text-sm">
            아직 데이터 없음
          </div>
        ) : (
          <div className="space-y-3">
            {byInstructor.map(inst => (
              <div key={inst.instructorId} className="bg-[#1a1a2e] rounded-xl border border-white/8 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-teal-500/20 flex items-center justify-center text-xs font-bold text-teal-300 shrink-0">
                    {inst.instructorName.slice(0, 1)}
                  </div>
                  <span className="text-sm font-semibold text-white">{inst.instructorName} 강사</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {inst.strokes.map(s => {
                    const { badge } = strokeBadge(s.strokeKey)
                    const overall = byStroke.find(b => b.strokeKey === s.strokeKey)
                    const diff = overall ? s.avgDays - overall.avgDays : 0
                    return (
                      <div key={s.strokeKey} className="bg-white/5 rounded-lg p-2.5 space-y-1">
                        <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${badge}`}>
                          {s.strokeLabel}
                        </span>
                        <p className="text-base font-bold text-white">
                          {s.avgDays}<span className="text-[10px] text-white/40 font-normal ml-0.5">일</span>
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-white/30">{s.count}명</span>
                          {overall && (
                            <span className={`text-[10px] font-medium ${diff < 0 ? 'text-teal-400' : diff > 0 ? 'text-red-400' : 'text-white/30'}`}>
                              {diff === 0 ? '평균' : diff < 0 ? `↓${Math.abs(diff)}일` : `↑${diff}일`}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
