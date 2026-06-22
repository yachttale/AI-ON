'use client'
// app/v2/director/students/new/NewStudentForm.tsx — 신규 학생 등록 폼(클라이언트)
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, UserPlus } from 'lucide-react'
import { createStudent } from '@/lib/v2/actions'
import type { InstructorOption } from '@/lib/v2/data'

const GRADES = ['초1', '초2', '초3', '초4', '초5', '초6']

export default function NewStudentForm({ instructors }: { instructors: InstructorOption[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    sex: '',
    grade: '',
    schedule: '',
    phone: '',
    enrolled_on: new Date().toISOString().slice(0, 10),
    instructor_id: '',
  })

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('이름을 입력하세요'); return }
    setError(null)
    start(async () => {
      const result = await createStudent(form)
      if ('error' in result) { setError(result.error); return }
      router.push(`/v2/director/students/${result.id}`)
    })
  }

  return (
    <div className="space-y-6 max-w-lg">
      <Link href="/v2/director/students" className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors">
        <ArrowLeft size={14} /> 전체 학생
      </Link>

      <div>
        <h1 className="text-xl font-bold text-white">학생 추가</h1>
        <p className="text-sm text-white/40 mt-0.5">신규 재원생 등록</p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Field label="이름 *">
          <input
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="홍길동"
            className={inputCls}
            required
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="성별">
            <select value={form.sex} onChange={e => set('sex', e.target.value)} className={inputCls}>
              <option value="" className="bg-[#1a1a2e]">선택 안 함</option>
              <option value="남" className="bg-[#1a1a2e]">남</option>
              <option value="여" className="bg-[#1a1a2e]">여</option>
            </select>
          </Field>

          <Field label="학년">
            <select value={form.grade} onChange={e => set('grade', e.target.value)} className={inputCls}>
              <option value="" className="bg-[#1a1a2e]">선택 안 함</option>
              {GRADES.map(g => (
                <option key={g} value={g} className="bg-[#1a1a2e]">{g}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="담당 강사">
          <select value={form.instructor_id} onChange={e => set('instructor_id', e.target.value)} className={inputCls}>
            <option value="" className="bg-[#1a1a2e]">배정 안 함</option>
            {instructors.map(i => (
              <option key={i.id} value={i.id} className="bg-[#1a1a2e]">{i.name}</option>
            ))}
          </select>
        </Field>

        <Field label="반 / 시간대">
          <input
            value={form.schedule}
            onChange={e => set('schedule', e.target.value)}
            placeholder="오전반, 15시반 등"
            className={inputCls}
          />
        </Field>

        <Field label="보호자 연락처">
          <input
            value={form.phone}
            onChange={e => set('phone', e.target.value)}
            placeholder="010-0000-0000"
            className={inputCls}
          />
        </Field>

        <Field label="입원일">
          <input
            type="date"
            value={form.enrolled_on}
            onChange={e => set('enrolled_on', e.target.value)}
            className={inputCls}
          />
        </Field>

        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-4 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-white font-semibold rounded-xl py-3 transition-colors"
        >
          <UserPlus size={16} />
          {pending ? '등록 중…' : '학생 등록'}
        </button>
      </form>
    </div>
  )
}

const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-teal-500/50 transition-colors'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-white/50">{label}</label>
      {children}
    </div>
  )
}
