import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { MASTER_STROKES } from '@/lib/curriculum'

const STROKE_COLOR: Record<string, string> = {
  '자유형': 'bg-sky-50 border-sky-200 text-sky-700',
  '배영':   'bg-green-50 border-green-200 text-green-700',
  '평영':   'bg-purple-50 border-purple-200 text-purple-700',
  '접영':   'bg-orange-50 border-orange-200 text-orange-700',
}

const STROKE_BADGE: Record<string, string> = {
  '자유형': 'bg-sky-100 text-sky-700',
  '배영':   'bg-green-100 text-green-700',
  '평영':   'bg-purple-100 text-purple-700',
  '접영':   'bg-orange-100 text-orange-700',
}

function fmtKorDate(d: string): string {
  const [y, m, day] = d.split('-')
  return `${y}년 ${parseInt(m)}월 ${parseInt(day)}일`
}

export default async function CertificatesPage() {
  const supabase = await createClient()

  const [{ data: students }, { data: logs }, { data: records }] = await Promise.all([
    supabase.from('students').select('id, name, grade').eq('is_active', true),
    supabase
      .from('session_logs')
      .select('student_id, stroke, stage, status, session_date')
      .eq('stage', '완성')
      .eq('status', '통과')
      .in('stroke', [...MASTER_STROKES])
      .order('session_date', { ascending: false }),
    supabase
      .from('completion_records')
      .select('student_id, stroke, record_seconds'),
  ])

  // 학생별·영법별 최초 완성 기록만 (중복 제거)
  type Entry = {
    studentId: string
    studentName: string
    grade: string | null
    stroke: string
    date: string
    recordSeconds: number | null
  }

  const seen = new Set<string>()
  const entries: Entry[] = []

  for (const log of (logs ?? [])) {
    const key = `${log.student_id}:${log.stroke}`
    if (seen.has(key)) continue
    seen.add(key)
    const student = (students ?? []).find(s => s.id === log.student_id)
    if (!student) continue
    const record = (records ?? []).find(
      r => r.student_id === log.student_id && r.stroke === log.stroke
    )
    entries.push({
      studentId: student.id,
      studentName: student.name,
      grade: student.grade ?? null,
      stroke: log.stroke,
      date: log.session_date,
      recordSeconds: record?.record_seconds ?? null,
    })
  }

  // 영법 순서대로 그룹핑
  const groups = MASTER_STROKES.map(stroke => ({
    stroke,
    items: entries.filter(e => e.stroke === stroke).sort((a, b) =>
      b.date.localeCompare(a.date)
    ),
  })).filter(g => g.items.length > 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-800">수영 완성 인증서</h1>
        <span className="text-sm text-gray-400">{entries.length}건</span>
      </div>

      {entries.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-12">아직 완성한 학생이 없습니다</p>
      )}

      {groups.map(({ stroke, items }) => (
        <section key={stroke}>
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STROKE_BADGE[stroke] ?? 'bg-gray-100 text-gray-600'}`}>
              {stroke}
            </span>
            <span className="text-xs text-gray-400">{items.length}명</span>
          </div>

          <div className="space-y-2">
            {items.map(entry => (
              <div
                key={`${entry.studentId}:${entry.stroke}`}
                className={`flex items-center justify-between rounded-xl px-4 py-3 border ${STROKE_COLOR[entry.stroke] ?? 'bg-gray-50 border-gray-200'}`}
              >
                <div>
                  <p className="font-semibold text-gray-800">
                    {entry.studentName}
                    {entry.grade && (
                      <span className="ml-1.5 text-xs font-normal text-gray-400">{entry.grade}</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    완성일 {fmtKorDate(entry.date)}
                    {entry.recordSeconds !== null && (
                      <span className="ml-2">
                        · 기록 {Math.floor(entry.recordSeconds / 60)}분 {String(entry.recordSeconds % 60).padStart(2, '0')}초
                      </span>
                    )}
                  </p>
                </div>
                <Link
                  href={`/director/student/${entry.studentId}/certificate?stroke=${encodeURIComponent(entry.stroke)}&readonly=true`}
                  className="text-xs px-3 py-1.5 bg-white hover:bg-gray-50 border border-current rounded-lg font-semibold transition-colors shrink-0 ml-3"
                >
                  인증서 보기
                </Link>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
