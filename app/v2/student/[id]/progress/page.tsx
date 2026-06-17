// app/v2/student/[id]/progress/page.tsx — 학생 진도 편집(전체 사다리)
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getStrokeLadders } from '@/lib/v2/data'
import { StepControl } from '../StepControl'

export default async function ProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: student } = await supabase.from('students').select('name,grade').eq('id', id).single()
  const strokes = await getStrokeLadders(id)
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">{student?.name} 진도</h2>
        <div className="flex gap-3 text-xs">
          <Link href={`/v2/student/${id}`} className="text-gray-400">대시보드</Link>
          <Link href={`/v2/student/${id}/baseline`} className="text-blue-500">기준 배치</Link>
        </div>
      </div>
      {strokes.map(s => (
        <section key={s.stroke_key} className="bg-white rounded-xl border p-3">
          <h3 className="font-semibold text-sm mb-2" style={{ color: s.color ?? undefined }}>{s.stroke_label}</h3>
          {s.tracks.map(t => (
            <div key={t.track_key} className="mb-2">
              <p className="text-[11px] text-gray-400 mb-1">{t.track_label}</p>
              {t.steps.map(step => <StepControl key={step.id} studentId={id} step={step} />)}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
