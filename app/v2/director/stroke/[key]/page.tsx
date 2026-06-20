// app/v2/director/stroke/[key]/page.tsx — 영법 그룹 드릴다운 (다크 어드민)
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentRole } from '@/lib/v2/session'
import { getDirectorRoster } from '@/lib/v2/data'

const GROUP_LABELS: Record<string, string> = {
  beginner: '초보', freestyle: '자유형', backstroke: '배영',
  breaststroke: '평영', butterfly: '접영', master: '마스터',
}

export default async function StrokeGroupPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  if (!GROUP_LABELS[key]) redirect('/v2/director')

  if (await getCurrentRole() !== 'director') redirect('/v2/today')

  const roster = await getDirectorRoster()
  const students = roster.filter(s => s.currentStrokeKey === key)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/v2/director" className="text-sm text-white/40 hover:text-white/70">← 대시보드</Link>
      </div>
      <h1 className="text-lg font-bold text-white">
        {GROUP_LABELS[key]} <span className="text-white/40 font-normal text-base">{students.length}명</span>
      </h1>

      {students.length === 0 && (
        <p className="py-8 text-center text-white/30 text-sm">해당 그룹 학생이 없습니다</p>
      )}

      <div className="space-y-2">
        {students.map(s => (
          <Link key={s.id} href={`/v2/director/students/${s.id}`}
            className="flex items-center justify-between bg-[#1a1a2e] rounded-xl border border-white/8 px-4 py-3 hover:bg-[#1e1e35] hover:border-teal-500/30 transition-all">
            <div>
              <p className="text-sm font-medium text-white">{s.name}</p>
              <p className="text-xs text-white/40">{s.instructorName ?? '미배정'} · {s.grade ?? '-'}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/40">{s.currentStepLabel ?? (key === 'master' ? '마스터' : '-')}</p>
              <p className="text-xs text-white/30">ladder {s.passedLadder}단계</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
