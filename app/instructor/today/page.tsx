'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getTodayEntries } from '@/lib/schedule'
import type { Student, SessionLog } from '@/types/database'

type Attendance = '출석' | '지각' | '결석'

const ATTENDANCE_COLORS: Record<Attendance, string> = {
  '출석': 'bg-green-500 text-white',
  '지각': 'bg-yellow-400 text-white',
  '결석': 'bg-red-400 text-white',
}

export default function TodayPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [logs, setLogs] = useState<SessionLog[]>([])
  const [loading, setLoading] = useState(true)
  const today = new Date().toISOString().slice(0, 10)

  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const [{ data: allStudents }, { data: todayLogs }] = await Promise.all([
      supabase.from('students').select('*').eq('instructor_id', user.id).eq('is_active', true).order('name'),
      supabase.from('session_logs').select('*').eq('instructor_id', user.id).eq('session_date', today),
    ])

    const todayStudents = (allStudents ?? []).filter(s => getTodayEntries(s.schedule).length > 0)
    setStudents(todayStudents)
    setLogs(todayLogs ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function setAttendance(studentId: string, attendance: Attendance) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const existing = logs.find(l => l.student_id === studentId)
    if (existing) {
      await supabase.from('session_logs').update({ attendance }).eq('id', existing.id)
    } else {
      await supabase.from('session_logs').insert({
        student_id: studentId,
        instructor_id: user.id,
        session_date: today,
        attendance,
      })
    }
    await load()
  }

  const displayDate = today.replace(/-/g, '.') + ' (' + ['일','월','화','수','목','금','토'][new Date().getDay()] + ')'

  if (loading) return (
    <div className="space-y-3">
      {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-xl animate-pulse" />)}
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">오늘 수업</h2>
        <p className="text-xs text-gray-400">{displayDate}</p>
      </div>

      {students.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">☀️</p>
          <p className="text-sm">오늘 수업이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {students.map(s => {
            const log = logs.find(l => l.student_id === s.id)
            return (
              <div key={s.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <Link
                  href={`/instructor/student/${s.id}`}
                  className="flex items-center justify-between px-4 pt-3 pb-2"
                >
                  <div>
                    <p className="font-semibold text-gray-800">{s.name}</p>
                    <p className="text-xs text-gray-400">{s.grade && `${s.grade} · `}{s.schedule}</p>
                  </div>
                  <span className="text-gray-300 text-sm">진도 →</span>
                </Link>
                <div className="flex gap-1.5 px-3 pb-3">
                  {(['출석', '지각', '결석'] as Attendance[]).map(att => (
                    <button
                      key={att}
                      onClick={() => setAttendance(s.id, att)}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                        log?.attendance === att
                          ? ATTENDANCE_COLORS[att]
                          : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {att}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
