import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import CheckpointBoard from '@/components/CheckpointBoard'
import type { SkillCheckpoint } from '@/types/database'

export default async function InstructorStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: student }, { data: checkpoints }] = await Promise.all([
    supabase.from('students').select('*').eq('id', id).single(),
    supabase.from('skill_checkpoints').select('*').eq('student_id', id).order('passed_at'),
  ])

  if (!student) notFound()

  return (
    <div>
      <Link href="/instructor/today" className="text-sky-500 text-sm mb-4 block">
        ← 오늘 수업
      </Link>
      <div className="mb-5">
        <h2 className="text-xl font-bold text-gray-800">{student.name}</h2>
        <p className="text-sm text-gray-400">
          {student.grade && `${student.grade} · `}{student.schedule}
        </p>
      </div>
      <CheckpointBoard
        studentId={student.id}
        initialCheckpoints={(checkpoints ?? []) as SkillCheckpoint[]}
      />
    </div>
  )
}
