'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const GRADES = ['1학년', '2학년', '3학년', '4학년', '5학년', '6학년']

interface Props {
  studentId: string
  currentGrade: string | null
}

export default function EditGradeButton({ studentId, currentGrade }: Props) {
  const [editing, setEditing] = useState(false)
  const [grade, setGrade] = useState(currentGrade ?? '')
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('students').update({ grade: grade || null }).eq('id', studentId)
    setSaving(false)
    setEditing(false)
    router.refresh()
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <select
          value={grade}
          onChange={e => setGrade(e.target.value)}
          className="border border-sky-300 rounded-lg px-2 py-0.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
          autoFocus
        >
          <option value="">학년 없음</option>
          {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-2 py-0.5 bg-sky-500 text-white rounded-lg text-xs disabled:opacity-50"
        >
          저장
        </button>
        <button
          onClick={() => { setEditing(false); setGrade(currentGrade ?? '') }}
          className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-lg text-xs"
        >
          취소
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-sky-500 transition-colors"
    >
      {currentGrade ?? '학년 미입력'}
      <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
      </svg>
    </button>
  )
}
