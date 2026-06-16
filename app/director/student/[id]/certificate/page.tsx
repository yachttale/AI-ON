import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import CertificateView from '@/components/CertificateView'

export default async function CertificatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ stroke?: string; readonly?: string }>
}) {
  const { id } = await params
  const { stroke, readonly } = await searchParams
  const isReadonly = readonly === 'true'

  if (!stroke) redirect(`/director/student/${id}`)

  const supabase = await createClient()

  const [{ data: student }, { data: logs }] = await Promise.all([
    supabase.from('students').select('id, name, instructor_id').eq('id', id).single(),
    supabase
      .from('session_logs')
      .select('stroke, stage, status, session_date, attendance')
      .eq('student_id', id)
      .order('session_date', { ascending: false }),
  ])

  if (!student) notFound()

  // 해당 영법의 완성+통과 로그 확인 (가장 최근)
  const completionLog = logs?.find(
    l => l.stroke === stroke && l.stage === '완주' && l.status === '통과'
  )
  if (!completionLog) redirect(`/director/student/${id}`)

  // 기존 completion_record (최근 1건) - 강사 정보 포함
  const { data: records } = await supabase
    .from('completion_records')
    .select('record_seconds, instructor_id')
    .eq('student_id', id)
    .eq('stroke', stroke)
    .eq('passed', true)
    .is('notes', null)
    .order('created_at', { ascending: false })
    .limit(1)

  const initialSeconds = records?.[0]?.record_seconds ?? null
  const instructorId = records?.[0]?.instructor_id ?? student?.instructor_id ?? null

  let instructorName: string | null = null
  if (instructorId) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', instructorId)
      .single()
    instructorName = prof?.name ?? null
  }

  return (
    <div>
      <Link
        href={`/director/student/${id}`}
        className="text-sky-500 text-sm mb-4 block print:hidden"
      >
        ← 학생 페이지로
      </Link>

      <CertificateView
        student={student}
        stroke={stroke}
        completionDate={completionLog.session_date}
        initialSeconds={initialSeconds}
        instructorName={instructorName}
        readonly={isReadonly}
      />
    </div>
  )
}
