'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getProgressBySection, getCurrentStep, CURRICULUM, ALL_STEPS } from '@/lib/curriculum'
import type { Student, SkillCheckpoint } from '@/types/database'

interface StudentWithProgress extends Student {
  checkpoints: SkillCheckpoint[]
}

export default function InstructorDashboard() {
  const [students, setStudents] = useState<StudentWithProgress[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: myStudents } = await supabase
        .from('students')
        .select('*')
        .eq('instructor_id', user.id)
        .eq('is_active', true)
        .order('name')

      if (!myStudents) { setLoading(false); return }

      const cpResults = await Promise.all(
        myStudents.map(s =>
          supabase.from('skill_checkpoints').select('*').eq('student_id', s.id)
        )
      )

      setStudents(myStudents.map((s, i) => ({
        ...s,
        checkpoints: (cpResults[i].data ?? []) as SkillCheckpoint[],
      })))
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div className="space-y-3">
      {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse" />)}
    </div>
  )

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-800 mb-4">내 학생 ({students.length}명)</h2>

      {students.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">담당 학생이 없습니다</p>
          <p className="text-xs mt-1">반 관리에서 학생을 배정하세요</p>
        </div>
      ) : (
        <div className="space-y-3">
          {students.map(s => {
            const passedKeys = s.checkpoints.map(c => c.skill_key)
            const progress = getProgressBySection(passedKeys)
            const currentStep = getCurrentStep(passedKeys)

            return (
              <Link
                key={s.id}
                href={`/instructor/student/${s.id}`}
                className="block bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-semibold text-gray-800">{s.name}</p>
                    <p className="text-xs text-gray-400">
                      {s.grade && `${s.grade} · `}
                      {currentStep ? currentStep.label : '전 과정 완료'}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 font-mono">
                    {passedKeys.length}/{ALL_STEPS.length}
                  </span>
                </div>
                <div className="flex gap-1">
                  {CURRICULUM.map(sec => {
                    const p = progress[sec.key]
                    return (
                      <div key={sec.key} className="flex-1">
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${p.percent}%`, backgroundColor: sec.color }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
