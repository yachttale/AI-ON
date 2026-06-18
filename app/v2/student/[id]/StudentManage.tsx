// app/v2/student/[id]/StudentManage.tsx — 학생 관리(반 배정·미배정·퇴원). 역할별 노출.
'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setStudentInstructor, requestWithdrawal, cancelWithdrawal, approveWithdrawal } from '@/lib/v2/actions'
import type { InstructorOption } from '@/lib/v2/data'

export function StudentManage({ studentId, isDirector, currentInstructorId, instructors, withdrawalStatus }: {
  studentId: string; isDirector: boolean; currentInstructorId: string | null
  instructors: InstructorOption[]; withdrawalStatus: 'pending' | 'approved' | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [inst, setInst] = useState(currentInstructorId ?? '')

  const changeInstructor = (v: string) => {
    setInst(v)
    start(async () => { await setStudentInstructor(studentId, v || null); router.refresh() })
  }
  const run = (fn: () => Promise<void>) => start(async () => { await fn(); router.refresh() })

  return (
    <section className="bg-white rounded-2xl border p-4 space-y-3">
      <h3 className="font-bold text-sm text-gray-700">관리</h3>

      {isDirector ? (
        <label className="flex items-center justify-between gap-2 text-sm">
          <span className="text-gray-500 shrink-0">담당 강사(반)</span>
          <select value={inst} disabled={pending} onChange={e => changeInstructor(e.target.value)}
            className="flex-1 border rounded-lg px-2 py-2 text-sm bg-white">
            <option value="">미배정</option>
            {instructors.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </label>
      ) : (
        <button disabled={pending} onClick={() => run(() => setStudentInstructor(studentId, null))}
          className="w-full py-2 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium">우리 반 아님 — 미배정으로</button>
      )}

      {/* 퇴원 */}
      {withdrawalStatus === 'approved' ? (
        <div className="flex items-center justify-between">
          <span className="text-sm text-red-500 font-semibold">퇴원 처리됨</span>
          {isDirector && <button disabled={pending} onClick={() => run(() => cancelWithdrawal(studentId))} className="text-xs text-gray-400 underline">복원</button>}
        </div>
      ) : withdrawalStatus === 'pending' ? (
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm text-amber-600 font-semibold">퇴원 신청됨 (승인 대기)</span>
          {isDirector && <button disabled={pending} onClick={() => run(() => approveWithdrawal(studentId))} className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold">승인</button>}
          <button disabled={pending} onClick={() => run(() => cancelWithdrawal(studentId))} className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs">취소</button>
        </div>
      ) : (
        <button disabled={pending}
          onClick={() => run(() => isDirector ? approveWithdrawal(studentId) : requestWithdrawal(studentId))}
          className="w-full py-2 rounded-lg border border-red-300 text-red-500 text-sm font-medium">
          {isDirector ? '퇴원 처리' : '퇴원 신청'}
        </button>
      )}
    </section>
  )
}
