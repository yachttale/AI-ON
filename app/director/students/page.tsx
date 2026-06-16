'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { parseSchedule } from '@/lib/schedule'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { Student, Profile } from '@/types/database'

interface StudentWithInstructor extends Student {
  profiles?: { name: string } | null
}

interface EditForm {
  id: string
  name: string
  grade: string
  schedule: string
  instructor_id: string
  is_active: boolean
}

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentWithInstructor[]>([])
  const [instructors, setInstructors] = useState<Profile[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [readmitTarget, setReadmitTarget] = useState<StudentWithInstructor | null>(null)
  const [addForm, setAddForm] = useState({ name: '', grade: '', schedule: '', instructor_id: '' })
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [readmitInstructorId, setReadmitInstructorId] = useState('')
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const supabase = createClient()
    const { data } = await supabase
      .from('students')
      .select('*, profiles!instructor_id(name)')
      .order('created_at', { ascending: false })
    setStudents(data ?? [])

    const { data: profs } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['instructor', 'director'])
    setInstructors(profs ?? [])
  }

  useEffect(() => { load() }, [])

  function validateSchedule(schedule: string): boolean {
    if (!schedule.trim()) return true
    const parsed = parseSchedule(schedule)
    if (parsed.length === 0) {
      setScheduleError('형식 오류. 예: 월4시, 월수4시, 월4시금7시')
      return false
    }
    setScheduleError(null)
    return true
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!validateSchedule(addForm.schedule)) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('students').insert({
      name: addForm.name,
      grade: addForm.grade || null,
      schedule: addForm.schedule,
      instructor_id: addForm.instructor_id || null,
    })
    setAddOpen(false)
    setAddForm({ name: '', grade: '', schedule: '', instructor_id: '' })
    setScheduleError(null)
    setSaving(false)
    await load()
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editForm) return
    if (!validateSchedule(editForm.schedule)) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('students').update({
      name: editForm.name,
      grade: editForm.grade || null,
      schedule: editForm.schedule,
      instructor_id: editForm.instructor_id || null,
      is_active: editForm.is_active,
    }).eq('id', editForm.id)
    setEditOpen(false)
    setEditForm(null)
    setScheduleError(null)
    setSaving(false)
    await load()
  }

  async function approveWithdrawal(studentId: string) {
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase.rpc('approve_withdrawal', { p_student_id: studentId })
    if (err) setError(err.message)
    else await load()
    setSaving(false)
  }

  async function rejectWithdrawal(studentId: string) {
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase.rpc('reject_withdrawal', { p_student_id: studentId })
    if (err) setError(err.message)
    else await load()
    setSaving(false)
  }

  async function handleReadmit() {
    if (!readmitTarget) return
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase.rpc('readmit_student', {
      p_student_id: readmitTarget.id,
      p_instructor_id: readmitInstructorId || null,
    })
    if (err) setError(err.message)
    else {
      setReadmitTarget(null)
      setReadmitInstructorId('')
      await load()
    }
    setSaving(false)
  }

  const q = query.trim()
  const pending = students.filter(s => s.withdrawal_status === 'pending' && (!q || s.name.includes(q)))
  const active = students.filter(s => s.is_active && s.withdrawal_status !== 'pending' && (!q || s.name.includes(q)))
  const inactive = students.filter(s => !s.is_active && (!q || s.name.includes(q)))

  return (
    <div className="px-1">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-gray-800">학생 목록 ({active.length}명 재원)</h2>
        <Button onClick={() => setAddOpen(true)} className="bg-sky-500 hover:bg-sky-600 text-sm">
          + 학생 추가
        </Button>
      </div>
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="이름 검색..."
        className="w-full mb-4 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
      />

      {error && (
        <p className="text-sm text-red-500 mb-3 bg-red-50 rounded-xl py-2.5 px-4 text-center">{error}</p>
      )}

      {/* 퇴원 신청 대기 (원장 승인 필요) */}
      {pending.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold text-red-500 mb-2 flex items-center gap-1">
            퇴원 신청 대기
            <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{pending.length}</span>
          </h3>
          <div className="space-y-2">
            {pending.map(s => (
              <div key={s.id} className="bg-red-50 rounded-xl p-4 border border-red-200">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-gray-800">{s.name}</p>
                    <p className="text-xs text-gray-500">{s.grade && `${s.grade} · `}{s.schedule}</p>
                    <p className="text-xs text-gray-400 mt-0.5">담당: {s.profiles?.name ?? '미배정'}</p>
                    {s.withdrawal_note && (
                      <p className="text-xs text-gray-600 mt-1 bg-white rounded-lg px-2 py-1 border border-red-100">
                        사유: {s.withdrawal_note}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => rejectWithdrawal(s.id)}
                    disabled={saving}
                    variant="outline"
                    className="flex-1 text-xs border-gray-300 text-gray-600"
                  >
                    거절
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => approveWithdrawal(s.id)}
                    disabled={saving}
                    className="flex-1 text-xs bg-red-500 hover:bg-red-600"
                  >
                    퇴원 승인
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 재원 학생 */}
      <div className="space-y-2 mb-6">
        {active.map(s => (
          <div key={s.id} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm flex items-center justify-between">
            <Link href={`/director/student/${s.id}`} className="flex-1 min-w-0 mr-3">
              <p className="font-semibold text-gray-800 hover:text-sky-600 transition-colors">{s.name}</p>
              <p className="text-xs text-gray-400">{s.grade && `${s.grade} · `}{s.schedule}</p>
            </Link>
            <div className="flex items-center gap-3 shrink-0">
              <p className="text-sm text-gray-500">{s.profiles?.name ?? '미배정'}</p>
              <button
                onClick={() => {
                  setEditForm({ id: s.id, name: s.name, grade: s.grade ?? '', schedule: s.schedule, instructor_id: s.instructor_id ?? '', is_active: s.is_active })
                  setEditOpen(true)
                }}
                className="text-xs text-sky-500 underline"
              >
                수정
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 퇴원 학생 (복귀 가능) */}
      {inactive.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-gray-400 mb-2">퇴원 ({inactive.length}명) — 복귀 시 기존 데이터 연결</h3>
          <div className="space-y-2">
            {inactive.map(s => (
              <div key={s.id} className="bg-gray-50 rounded-xl p-4 border border-gray-200 flex items-center justify-between opacity-75">
                <div>
                  <p className="font-semibold text-gray-500">{s.name}</p>
                  <p className="text-xs text-gray-400">{s.grade && `${s.grade} · `}{s.schedule}</p>
                  <p className="text-xs text-gray-400">이전 담당: {s.profiles?.name ?? '미배정'}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditForm({ id: s.id, name: s.name, grade: s.grade ?? '', schedule: s.schedule, instructor_id: s.instructor_id ?? '', is_active: s.is_active })
                      setEditOpen(true)
                    }}
                    className="text-xs text-sky-500 underline"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => {
                      setReadmitTarget(s)
                      setReadmitInstructorId(s.instructor_id ?? '')
                    }}
                    className="text-xs text-green-600 font-semibold bg-green-50 border border-green-200 rounded-lg px-2.5 py-1 hover:bg-green-100"
                  >
                    복귀
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 학생 추가 */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
          <div className="max-w-lg mx-auto px-2">
            <SheetHeader><SheetTitle>학생 추가</SheetTitle></SheetHeader>
            <form onSubmit={handleAdd} className="space-y-4 mt-4 pb-6">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">이름 *</label>
                <input required value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                  placeholder="예: 김민준" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">학년</label>
                <select value={addForm.grade} onChange={e => setAddForm(f => ({ ...f, grade: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white">
                  <option value="">선택 안함</option>
                  {['1학년','2학년','3학년','4학년','5학년','6학년'].map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">수업 시간 *</label>
                <input required value={addForm.schedule}
                  onChange={e => { setAddForm(f => ({ ...f, schedule: e.target.value })); setScheduleError(null) }}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 ${scheduleError ? 'border-red-400' : 'border-gray-300'}`}
                  placeholder="예: 월4시, 월수4시, 월4시금7시" />
                {scheduleError && <p className="text-xs text-red-500 mt-1">{scheduleError}</p>}
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">담당 강사</label>
                <select value={addForm.instructor_id} onChange={e => setAddForm(f => ({ ...f, instructor_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white">
                  <option value="">선택 안함 (강사가 직접 배정)</option>
                  {instructors.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setAddOpen(false)}>취소</Button>
                <Button type="submit" className="flex-1 bg-sky-500 hover:bg-sky-600" disabled={saving}>
                  {saving ? '추가 중...' : '추가'}
                </Button>
              </div>
            </form>
          </div>
        </SheetContent>
      </Sheet>

      {/* 학생 수정 */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
          <div className="max-w-lg mx-auto px-2">
            <SheetHeader><SheetTitle>학생 정보 수정</SheetTitle></SheetHeader>
            {editForm && (
              <form onSubmit={handleEdit} className="space-y-4 mt-4 pb-6">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">이름 *</label>
                  <input required value={editForm.name} onChange={e => setEditForm(f => f ? { ...f, name: e.target.value } : f)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">학년</label>
                  <select value={editForm.grade} onChange={e => setEditForm(f => f ? { ...f, grade: e.target.value } : f)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white">
                    <option value="">선택 안함</option>
                    {['1학년','2학년','3학년','4학년','5학년','6학년'].map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">수업 시간 *</label>
                  <input required value={editForm.schedule}
                    onChange={e => { setEditForm(f => f ? { ...f, schedule: e.target.value } : f); setScheduleError(null) }}
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 ${scheduleError ? 'border-red-400' : 'border-gray-300'}`} />
                  {scheduleError && <p className="text-xs text-red-500 mt-1">{scheduleError}</p>}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">담당 강사</label>
                  <select value={editForm.instructor_id} onChange={e => setEditForm(f => f ? { ...f, instructor_id: e.target.value } : f)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white">
                    <option value="">선택 안함</option>
                    {instructors.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-gray-700">상태</label>
                  <button type="button"
                    onClick={() => setEditForm(f => f ? { ...f, is_active: !f.is_active } : f)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${editForm.is_active ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-500'}`}>
                    {editForm.is_active ? '재원' : '퇴원'}
                  </button>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setEditOpen(false)}>취소</Button>
                  <Button type="submit" className="flex-1 bg-sky-500 hover:bg-sky-600" disabled={saving}>
                    {saving ? '저장 중...' : '저장'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* 복귀 처리 시트 */}
      <Sheet open={!!readmitTarget} onOpenChange={open => !open && setReadmitTarget(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader><SheetTitle>학생 복귀</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-4 pb-4">
            {readmitTarget && (
              <p className="text-sm text-gray-600">
                <span className="font-semibold text-gray-800">{readmitTarget.name}</span>을(를) 복귀 처리합니다.
                기존 수업 데이터가 그대로 연결됩니다.
              </p>
            )}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">담당 강사 배정</label>
              <select
                value={readmitInstructorId}
                onChange={e => setReadmitInstructorId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
              >
                <option value="">이전 담당 강사 유지</option>
                {instructors.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setReadmitTarget(null)}>취소</Button>
              <Button
                className="flex-1 bg-green-500 hover:bg-green-600"
                onClick={handleReadmit}
                disabled={saving}
              >
                {saving ? '처리 중...' : '복귀 확정'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
