'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Student } from '@/types/database'

interface MakeupEntry {
  id: string
  studentId: string
  studentName: string
  grade: string | null
  schedule: string
}

interface Props {
  students: Student[]
  todayStr: string
  initialMakeups: MakeupEntry[]
}

export default function MakeupScheduler({ students, todayStr, initialMakeups }: Props) {
  const [makeups, setMakeups] = useState<MakeupEntry[]>(initialMakeups)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const q = query.trim()
  const candidates = q
    ? students.filter(s => s.name.includes(q) && !makeups.some(m => m.studentId === s.id))
    : []

  async function handleAdd(student: Student) {
    setAdding(true)
    setError(null)

    // 낙관적 업데이트: DB 응답 전에 먼저 화면에 추가
    const tempId = `temp-${Date.now()}`
    const optimisticEntry: MakeupEntry = {
      id: tempId,
      studentId: student.id,
      studentName: student.name,
      grade: student.grade,
      schedule: student.schedule,
    }
    setMakeups(prev => [...prev, optimisticEntry])
    setQuery('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error: dbError } = await supabase
      .from('planned_makeups')
      .insert({ student_id: student.id, session_date: todayStr, created_by: user?.id ?? null })
      .select('id')
      .single()

    if (dbError) {
      // 실패 시 낙관적 항목 롤백
      setMakeups(prev => prev.filter(m => m.id !== tempId))
      setError(`추가 실패: ${dbError.message}`)
    } else if (data) {
      // 실제 DB id로 교체
      setMakeups(prev => prev.map(m => m.id === tempId ? { ...m, id: data.id } : m))
    }

    setAdding(false)
  }

  async function handleRemove(id: string) {
    const target = makeups.find(m => m.id === id)
    setMakeups(prev => prev.filter(m => m.id !== id))
    const supabase = createClient()
    const { error: dbError } = await supabase.from('planned_makeups').delete().eq('id', id)
    if (dbError && target) {
      setMakeups(prev => [...prev, target])
      setError(`취소 실패: ${dbError.message}`)
    }
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-sky-100">
      <h3 className="text-sm font-semibold text-sky-700 mb-3">오늘의 보강 예약</h3>

      {/* 검색 + 추가 */}
      <div className="relative mb-3">
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setError(null) }}
          placeholder="학생 이름 검색..."
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          disabled={adding}
        />
        {adding && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-sky-400">추가 중...</span>
        )}
        {candidates.length > 0 && !adding && (
          <div className="absolute top-full left-0 right-0 z-10 bg-white border border-gray-200 rounded-xl mt-1 shadow-lg overflow-hidden">
            {candidates.slice(0, 5).map(s => (
              <button
                key={s.id}
                onClick={() => handleAdd(s)}
                className="w-full text-left px-4 py-2.5 hover:bg-sky-50 active:bg-sky-100 text-sm border-b border-gray-50 last:border-0"
              >
                <span className="font-semibold text-gray-800">{s.name}</span>
                {s.grade && <span className="ml-2 text-xs text-gray-400">{s.grade}</span>}
                <span className="ml-2 text-xs text-gray-400">{s.schedule}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-500 mb-2 px-1">{error}</p>
      )}

      {/* 보강 목록 */}
      {makeups.length === 0 ? (
        <p className="text-sm text-gray-300 text-center py-3">오늘 예약된 보강 없음</p>
      ) : (
        <div className="space-y-2">
          {makeups.map(m => (
            <div key={m.id} className="flex items-center justify-between bg-sky-50 rounded-xl px-4 py-2.5">
              <div>
                <span className="font-semibold text-gray-800 text-sm">{m.studentName}</span>
                {m.grade && <span className="ml-2 text-xs text-gray-400">{m.grade}</span>}
                <span className="ml-2 text-xs text-gray-400">{m.schedule}</span>
              </div>
              <button
                onClick={() => handleRemove(m.id)}
                disabled={m.id.startsWith('temp-')}
                className="text-xs text-red-400 hover:text-red-600 ml-3 shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                취소
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
