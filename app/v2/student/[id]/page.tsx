// app/v2/student/[id]/page.tsx — 학생 대시보드(기본정보·진도%·최근30일)
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getStudentDashboard } from '@/lib/v2/data'
import { strokeBadge } from '@/lib/v2/stroke-colors'
import { FeedbackDraft } from './FeedbackDraft'

const KIND_STYLE: Record<string, string> = {
  pass: 'bg-blue-100 text-blue-700',
  measure: 'bg-amber-100 text-amber-700',
  practice: 'bg-gray-100 text-gray-600',
}

export default async function StudentDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const d = await getStudentDashboard(id)
  if (!d) notFound()

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">{d.name}</h2>
        <Link href={`/v2/student/${id}/progress`} className="text-xs text-white bg-blue-500 rounded px-3 py-1.5 font-semibold">진도 편집</Link>
      </div>

      <section className="bg-white rounded-xl border p-4 grid grid-cols-2 gap-y-2 text-sm">
        <span className="text-gray-400">반</span><span>{d.schedule ?? '-'}</span>
        <span className="text-gray-400">현재 단계</span><span>{d.currentStepLabel ?? '-'}</span>
        <span className="text-gray-400">담당 강사</span><span>{d.instructorName ?? '-'}</span>
        <span className="text-gray-400">입문일</span><span>{d.enrolled_on ?? '-'}</span>
      </section>

      <section className="bg-white rounded-xl border p-4 space-y-2">
        <h3 className="font-semibold text-sm text-gray-700">진도 현황</h3>
        {d.strokeProgress.filter(s => s.total > 0).map(s => {
          const badge = strokeBadge(s.stroke_key)
          return (
            <div key={s.stroke_key} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>{s.stroke_label}</span>
                <span className="text-gray-400">{s.passed}/{s.total} · {s.pct}%</span>
              </div>
              <div className="h-2 rounded bg-gray-100 overflow-hidden">
                <div className={`h-full ${badge.bar}`} style={{ width: `${s.pct}%` }} />
              </div>
            </div>
          )
        })}
      </section>

      <section className="bg-white rounded-xl border p-4 space-y-2">
        <h3 className="font-semibold text-sm text-gray-700">부모 피드백 초안</h3>
        <FeedbackDraft initial={d.feedbackDraft} />
      </section>

      <section className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="font-semibold text-sm text-gray-700">일별 활동 (최근 30일)</h3>
        {d.dailyLog.length === 0
          ? <p className="text-xs text-gray-400">기록 없음</p>
          : <ul className="space-y-2.5">
              {d.dailyLog.map(day => (
                <li key={day.date} className="flex gap-3">
                  <span className="text-xs text-gray-400 tabular-nums shrink-0 w-12 pt-0.5">{day.date.slice(5)}</span>
                  <div className="flex flex-wrap gap-1">
                    {day.items.map((it, i) => (
                      <span key={i} className={`px-1.5 py-0.5 rounded text-xs ${KIND_STYLE[it.kind]}`}>{it.label}</span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>}
      </section>

      <p className="text-center text-[11px] text-gray-300">성장 그래프는 데이터 누적 후 제공됩니다</p>
    </div>
  )
}
