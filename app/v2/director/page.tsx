// app/v2/director/page.tsx — 아이들 현황 (다크 어드민)
import Link from 'next/link'
import { Users, TrendingUp, UserMinus, UserPlus, CheckCircle, AlertCircle } from 'lucide-react'
import { getDirectorDashboard, isClosedOn } from '@/lib/v2/data'
import { getDashboardRaw } from '@/lib/v2/data'
import { buildDashboard } from '@/lib/v2/dashboard'
import { strokeBadge } from '@/lib/v2/stroke-colors'


export default async function DirectorPage() {
  const [d, closed, { input, strokeMeta }] = await Promise.all([
    getDirectorDashboard(),
    isClosedOn(),
    getDashboardRaw(),
  ])
  const view = buildDashboard(input, strokeMeta)
  const todayPct = d.todayScheduled
    ? Math.round((d.todayDone / d.todayScheduled) * 100)
    : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">아이들 현황</h1>
          <p className="text-sm text-white/40 mt-0.5">
            {closed ? '🏖️ 오늘은 휴원일입니다' : '실시간 수업 현황'}
          </p>
        </div>
        <Link
          href="/v2/director/students"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-500/20 text-teal-300 text-sm font-medium hover:bg-teal-500/30 transition-colors"
        >
          <Users size={15} />
          전체 학생 검색
        </Link>
      </div>

      {/* 상단 통계 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          icon={<Users size={20} className="text-blue-400" />}
          label="재원생"
          value={d.totalStudents}
          unit="명"
          bg="bg-blue-500/10"
        />
        <StatCard
          icon={<CheckCircle size={20} className="text-teal-400" />}
          label="오늘 입력"
          value={`${d.todayDone}/${d.todayScheduled}`}
          unit={`${todayPct}%`}
          accent
          bg="bg-teal-500/10"
        />
        <StatCard
          icon={<UserMinus size={20} className="text-orange-400" />}
          label="오늘 결석"
          value={d.todayAbsent}
          unit="명"
          bg="bg-orange-500/10"
        />
        <StatCard
          icon={<AlertCircle size={20} className="text-red-400" />}
          label="퇴원 대기"
          value={d.pendingWithdrawals}
          unit="명"
          bg="bg-red-500/10"
        />
        <StatCard
          icon={<UserPlus size={20} className="text-purple-400" />}
          label="신규 30일"
          value={d.newStudents30d}
          unit="명"
          bg="bg-purple-500/10"
        />
      </div>

      {/* 2열 그리드 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 영법별 현황 — 6그룹 카드 */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">영법별 현황</h2>
          <div className="grid grid-cols-3 gap-3">
            {d.strokeGroupCounts.map(g => (
              <Link
                key={g.key}
                href={`/v2/director/stroke/${g.key}`}
                className="bg-[#1a1a2e] rounded-xl border border-white/8 p-3 text-center hover:bg-[#1e1e35] hover:border-teal-500/30 transition-all"
              >
                <p className="text-xs text-white/40 mb-1">{g.label}</p>
                <p className="text-2xl font-bold text-white">
                  {g.count}
                  <span className="text-xs font-normal text-white/40 ml-0.5">명</span>
                </p>
              </Link>
            ))}
          </div>
        </section>

        {/* 최근 통과 + 미확인 */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">최근 통과</h2>

          {view.pendingCount > 0 && (
            <DarkCard className="flex items-center gap-3 border-orange-500/20 bg-orange-500/5">
              <AlertCircle size={18} className="text-orange-400 shrink-0" />
              <span className="text-sm text-orange-300">
                미확인 수업 <span className="font-bold text-orange-400">{view.pendingCount}건</span>
              </span>
            </DarkCard>
          )}

          <DarkCard className="p-0 overflow-hidden">
            {view.recentPasses.length === 0 ? (
              <div className="py-8 text-center text-white/30 text-sm">최근 통과 기록 없음</div>
            ) : (
              <div className="divide-y divide-white/5">
                {view.recentPasses.map((p, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-white/80">{p.studentName}</p>
                      <p className="text-xs text-white/40 mt-0.5">{p.stepLabel}</p>
                    </div>
                    <span className="text-xs text-white/30 tabular-nums">{p.passedAt.slice(0, 10)}</span>
                  </div>
                ))}
              </div>
            )}
          </DarkCard>
        </section>
      </div>
    </div>
  )
}

function DarkCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[#1a1a2e] border border-white/8 rounded-xl p-4 ${className}`}>
      {children}
    </div>
  )
}

function StatCard({ icon, label, value, unit, accent, bg }: {
  icon: React.ReactNode
  label: string
  value: string | number
  unit?: string
  accent?: boolean
  bg?: string
}) {
  return (
    <div className={`rounded-xl p-4 border border-white/8 space-y-3 ${bg ?? 'bg-[#1a1a2e]'}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/40">{label}</span>
        {icon}
      </div>
      <p className={`text-2xl font-bold ${accent ? 'text-teal-300' : 'text-white'}`}>
        {value}
        {unit && <span className="text-xs font-normal text-white/40 ml-1">{unit}</span>}
      </p>
    </div>
  )
}
