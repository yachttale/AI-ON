// app/v2/director/instructors/page.tsx — 강사 현황 (다크 어드민)
import Link from 'next/link'
import { GraduationCap, CheckCircle, UserMinus, TrendingUp } from 'lucide-react'
import { getDirectorDashboard, isClosedOn } from '@/lib/v2/data'
import { ClosureToggle } from '../ClosureToggle'

export default async function DirectorInstructorsPage() {
  const [d, closed] = await Promise.all([getDirectorDashboard(), isClosedOn()])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">강사 현황</h1>
          <p className="text-sm text-white/40 mt-0.5">강사별 오늘 수업 및 누적 통계</p>
        </div>
        <ClosureToggle closed={closed} />
      </div>

      {d.instructorStats.length === 0 ? (
        <div className="rounded-xl bg-[#1a1a2e] border border-white/8 py-16 text-center text-white/30 text-sm">
          강사 데이터가 없습니다
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {d.instructorStats.map(inst => {
            const pct = inst.scheduled ? Math.round((inst.done / inst.scheduled) * 100) : 0
            return (
              <Link
                key={inst.id}
                href={`/v2/director/students?inst=${encodeURIComponent(inst.name)}`}
                className="block rounded-xl bg-[#1a1a2e] border border-white/8 p-5 hover:border-teal-500/30 hover:bg-[#1e1e35] transition-all space-y-4"
              >
                {/* 이름 + 오늘 입력률 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-teal-500/20 flex items-center justify-center text-sm font-bold text-teal-300">
                      {inst.name.slice(0, 1)}
                    </div>
                    <span className="font-semibold text-white">{inst.name}</span>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    pct >= 80 ? 'bg-green-500/20 text-green-300' :
                    pct >= 50 ? 'bg-yellow-500/20 text-yellow-300' :
                    'bg-red-500/20 text-red-300'
                  }`}>
                    {pct}%
                  </span>
                </div>

                {/* 오늘 수업 도트 */}
                <div>
                  <p className="text-xs text-white/40 mb-2">오늘 {inst.done}/{inst.scheduled}</p>
                  <div className="flex gap-1 flex-wrap">
                    {Array.from({ length: Math.min(inst.scheduled, 20) }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-3 h-3 rounded-full ${i < inst.done ? 'bg-teal-400' : 'bg-white/10'}`}
                      />
                    ))}
                    {inst.scheduled > 20 && (
                      <span className="text-xs text-white/30">+{inst.scheduled - 20}</span>
                    )}
                  </div>
                </div>

                {/* 통계 3칸 */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <MiniStat label="담당" value={`${inst.assigned}명`} />
                  <MiniStat label="7일 통과" value={`${inst.recentPasses}`} accent />
                  <MiniStat
                    label="퇴원율"
                    value={`${inst.withdrawalRate}%`}
                    warn={inst.withdrawalRate >= 20}
                  />
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <p className="text-xs text-white/20">
        * 퇴원율·통과 수는 데이터가 쌓일수록 정확해집니다 (현재 초기 수집 단계)
      </p>
    </div>
  )
}

function MiniStat({ label, value, accent, warn }: {
  label: string; value: string; accent?: boolean; warn?: boolean
}) {
  return (
    <div className="rounded-lg bg-white/5 py-2">
      <p className="text-[10px] text-white/30">{label}</p>
      <p className={`text-sm font-bold ${warn ? 'text-red-400' : accent ? 'text-teal-300' : 'text-white/70'}`}>
        {value}
      </p>
    </div>
  )
}
