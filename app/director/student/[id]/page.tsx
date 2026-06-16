export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import CheckpointBoard from '@/components/CheckpointBoard'
import { getProgressBySection, ALL_STEPS } from '@/lib/curriculum'
import type { SkillCheckpoint } from '@/types/database'

export default async function DirectorStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: student }, { data: checkpoints }, { data: recentLogs }] = await Promise.all([
    supabase.from('students').select('*, profiles!instructor_id(name)').eq('id', id).single(),
    supabase.from('skill_checkpoints').select('*').eq('student_id', id).order('passed_at'),
    supabase.from('session_logs').select('*').eq('student_id', id).order('session_date', { ascending: false }).limit(10),
  ])

  if (!student) notFound()

  const passedKeys = (checkpoints ?? []).map(c => c.skill_key)
  const progress = getProgressBySection(passedKeys)
  const instructorName = (student as { profiles?: { name: string } | null }).profiles?.name ?? '미배정'

  const attended = (recentLogs ?? []).filter(l => l.attendance !== '결석').length
  const total = (recentLogs ?? []).length

  return (
    <div>
      <Link href="/director/dashboard" className="text-sky-500 text-sm mb-4 block">
        ← 대시보드
      </Link>

      {/* 헤더 */}
      <div className="bg-gradient-to-br from-sky-500 to-blue-600 rounded-2xl p-4 mb-4 text-white shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center font-bold text-xl">
            {student.name[0]}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold">{student.name}</h2>
            <p className="text-sm text-white/70">
              {student.grade && `${student.grade} · `}{student.schedule}
            </p>
            <p className="text-xs text-white/50">담당: {instructorName}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">{passedKeys.length}</p>
            <p className="text-xs text-white/60">/{ALL_STEPS.length}단계</p>
          </div>
        </div>
      </div>

      {/* 출결 요약 */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm text-center">
          <p className="text-xs text-gray-400 mb-1">최근 출석</p>
          <p className="text-2xl font-bold text-sky-600">{attended}<span className="text-xs font-normal text-gray-400 ml-0.5">/{total}회</span></p>
        </div>
        <Link
          href={`/director/students`}
          className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm text-center flex items-center justify-center"
        >
          <span className="text-sm text-sky-500 font-medium">학생 정보 수정 →</span>
        </Link>
      </div>

      {/* 최근 수업 이력 */}
      {(recentLogs ?? []).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 mb-4">
          <p className="text-xs font-semibold text-gray-500 mb-2">최근 출결</p>
          <div className="space-y-1.5">
            {(recentLogs ?? []).slice(0, 5).map(log => (
              <div key={log.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-500">{log.session_date}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  log.attendance === '출석' ? 'bg-green-100 text-green-700' :
                  log.attendance === '지각' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {log.attendance}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 체크포인트 보드 (원장도 체크 가능) */}
      <CheckpointBoard
        studentId={student.id}
        initialCheckpoints={(checkpoints ?? []) as SkillCheckpoint[]}
      />
    </div>
  )
}
