// app/v2/director/instructors/[id]/page.tsx — 강사 상세 대시보드 (다크 어드민)
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CheckCircle, Users, TrendingDown } from 'lucide-react'
import { getInstructorDetail } from '@/lib/v2/data'

const STROKE_COLOR: Record<string, string> = {
  beginner: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  free: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  back: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  breast: 'bg-green-500/20 text-green-300 border-green-500/30',
  butterfly: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  master: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  unassigned: 'bg-white/5 text-white/40 border-white/10',
}
const DOT_COLOR: Record<string, string> = {
  beginner: 'bg-gray-400', free: 'bg-blue-400', back: 'bg-cyan-400',
  breast: 'bg-green-400', butterfly: 'bg-purple-400', master: 'bg-teal-400',
}

export default async function InstructorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const d = await getInstructorDetail(id)
  if (!d) notFound()

  const todayPct = d.todayScheduled ? Math.round((d.todayDone / d.todayScheduled) * 100) : 0

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/v2/director/instructors" className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors">
        <ArrowLeft size={14} /> 강사 현황
      </Link>

      {/* 헤더 */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-teal-500/20 flex items-center justify-center text-2xl font-bold text-teal-300">
          {d.name.slice(0, 1)}
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">{d.name} 강사</h1>
          <p className="text-sm text-white/40 mt-0.5">담당 학생 {d.totalStudents}명</p>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#1a1a2e] rounded-xl border border-white/8 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40">오늘 수업</span>
            <CheckCircle size={16} className="text-teal-400" />
          </div>
          <p className="text-2xl font-bold text-white">
            {d.todayDone}<span className="text-sm font-normal text-white/40">/{d.todayScheduled}</span>
          </p>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-teal-400 rounded-full" style={{ width: `${todayPct}%` }} />
          </div>
          <p className="text-xs text-white/30">{todayPct}% 입력 완료</p>
        </div>

        <div className="bg-[#1a1a2e] rounded-xl border border-white/8 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40">담당 학생</span>
            <Users size={16} className="text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-white">{d.totalStudents}<span className="text-sm font-normal text-white/40"> 명</span></p>
          <p className="text-xs text-white/30">영법 {d.strokeGroups.length}개 그룹</p>
        </div>

        <div className="bg-[#1a1a2e] rounded-xl border border-white/8 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40">퇴원율</span>
            <TrendingDown size={16} className={d.withdrawalRate >= 20 ? 'text-red-400' : 'text-white/30'} />
          </div>
          <p className={`text-2xl font-bold ${d.withdrawalRate >= 20 ? 'text-red-400' : 'text-white'}`}>
            {d.withdrawalRate}<span className="text-sm font-normal text-white/40">%</span>
          </p>
          <p className="text-xs text-white/30">누적 기준</p>
        </div>
      </div>

      {/* 영법별 학생 분포 */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">영법별 학생 현황</h2>
        {d.strokeGroups.length === 0 ? (
          <div className="bg-[#1a1a2e] rounded-xl border border-white/8 py-8 text-center text-white/30 text-sm">
            학생 데이터 없음
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {d.strokeGroups.map(g => (
              <div key={g.key} className={`rounded-xl border p-4 space-y-3 ${STROKE_COLOR[g.key] ?? STROKE_COLOR.unassigned}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${DOT_COLOR[g.key] ?? 'bg-gray-400'}`} />
                    <span className="text-sm font-medium">{g.label}</span>
                  </div>
                  <span className="text-lg font-bold">{g.count}명</span>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {g.students.map(s => (
                    <Link
                      key={s.id}
                      href={`/v2/director/students/${s.id}`}
                      className="flex items-center justify-between py-0.5 opacity-70 hover:opacity-100 transition-opacity"
                    >
                      <span className="text-xs">{s.name}</span>
                      {s.grade && <span className="text-[10px] opacity-60">{s.grade}</span>}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 최근 통과 (30일) */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">최근 통과 (30일)</h2>
        <div className="bg-[#1a1a2e] rounded-xl border border-white/8">
          {d.recentPasses.length === 0 ? (
            <p className="py-8 text-center text-white/30 text-sm">최근 통과 기록 없음</p>
          ) : (
            <div className="divide-y divide-white/5">
              {d.recentPasses.map((p, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors">
                  <div>
                    <span className="text-sm font-medium text-white/80">{p.studentName}</span>
                    <span className="text-xs text-white/40 ml-2">{p.strokeLabel} · {p.stepLabel}</span>
                  </div>
                  <span className="text-xs text-white/30 tabular-nums">{p.passedAt.slice(0, 10)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
