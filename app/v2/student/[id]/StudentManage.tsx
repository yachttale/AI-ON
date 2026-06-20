// app/v2/student/[id]/StudentManage.tsx — 학생 관리(반 배정·반 시간·미배정·퇴원). 역할/테마별 노출.
'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setStudentInstructor, requestWithdrawal, cancelWithdrawal, approveWithdrawal, updateStudentSchedule } from '@/lib/v2/actions'
import type { InstructorOption } from '@/lib/v2/data'

export function StudentManage({ studentId, isDirector, currentInstructorId, currentSchedule, instructors, withdrawalStatus, dark }: {
  studentId: string; isDirector: boolean; currentInstructorId: string | null
  currentSchedule?: string | null
  instructors: InstructorOption[]; withdrawalStatus: 'pending' | 'approved' | null
  dark?: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [inst, setInst] = useState(currentInstructorId ?? '')
  const [schedule, setSchedule] = useState(currentSchedule ?? '')

  const changeInstructor = (v: string) => {
    setInst(v)
    start(async () => { await setStudentInstructor(studentId, v || null); router.refresh() })
  }
  const saveSchedule = () => start(async () => { await updateStudentSchedule(studentId, schedule); router.refresh() })
  const run = (fn: () => Promise<void>) => start(async () => { await fn(); router.refresh() })

  // ── 테마 클래스 (dark=원장 어드민 / light=강사 화면) ──
  const section = dark ? 'bg-[#1a1a2e] rounded-2xl border border-white/8 p-5 space-y-3' : 'bg-white rounded-2xl border p-4 space-y-3'
  const title = dark ? 'font-semibold text-sm text-white/60' : 'font-bold text-sm text-gray-700'
  const label = dark ? 'text-white/40 shrink-0' : 'text-gray-500 shrink-0'
  const field = dark
    ? 'flex-1 min-w-0 border border-white/10 rounded-lg px-2 py-2 text-sm bg-white/5 text-white outline-none focus:border-teal-500/50'
    : 'flex-1 min-w-0 border rounded-lg px-2 py-2 text-sm bg-white'
  const optBg = dark ? 'bg-[#1a1a2e]' : ''
  const primaryBtn = dark ? 'bg-teal-500/20 text-teal-300 hover:bg-teal-500/30' : 'bg-blue-500 text-white'
  const mutedBtn = dark ? 'bg-white/5 text-white/60 hover:bg-white/10' : 'bg-gray-100 text-gray-600'
  const mutedLink = dark ? 'text-white/40' : 'text-gray-400'

  return (
    <section className={section}>
      <h3 className={title}>관리</h3>

      {/* 담당 강사(반) */}
      {isDirector ? (
        <label className="flex items-center justify-between gap-2 text-sm">
          <span className={label}>담당 강사</span>
          <select value={inst} disabled={pending} onChange={e => changeInstructor(e.target.value)} className={field}>
            <option value="" className={optBg}>미배정</option>
            {instructors.map(i => <option key={i.id} value={i.id} className={optBg}>{i.name}</option>)}
          </select>
        </label>
      ) : (
        <button disabled={pending} onClick={() => run(() => setStudentInstructor(studentId, null))}
          className={`w-full py-2 rounded-lg text-sm font-medium ${mutedBtn}`}>우리 반 아님 — 미배정으로</button>
      )}

      {/* 반(수업 시간) — 원장 수정 */}
      {isDirector && (
        <label className="flex items-center justify-between gap-2 text-sm">
          <span className={label}>반(수업 시간)</span>
          <input value={schedule} disabled={pending} onChange={e => setSchedule(e.target.value)}
            placeholder="예: 월4시,수4시" className={field} />
          <button disabled={pending || schedule === (currentSchedule ?? '')} onClick={saveSchedule}
            className={`shrink-0 px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 ${primaryBtn}`}>저장</button>
        </label>
      )}

      {/* 퇴원 */}
      {withdrawalStatus === 'approved' ? (
        <div className="flex items-center justify-between">
          <span className="text-sm text-red-500 font-semibold">퇴원 처리됨</span>
          {isDirector && <button disabled={pending} onClick={() => run(() => cancelWithdrawal(studentId))} className={`text-xs underline ${mutedLink}`}>복원</button>}
        </div>
      ) : withdrawalStatus === 'pending' ? (
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm text-amber-500 font-semibold">퇴원 신청됨 (승인 대기)</span>
          {isDirector && <button disabled={pending} onClick={() => run(() => approveWithdrawal(studentId))} className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold">승인</button>}
          <button disabled={pending} onClick={() => run(() => cancelWithdrawal(studentId))} className={`px-3 py-1.5 rounded-lg text-xs ${mutedBtn}`}>취소</button>
        </div>
      ) : (
        <button disabled={pending}
          onClick={() => run(() => isDirector ? approveWithdrawal(studentId) : requestWithdrawal(studentId))}
          className="w-full py-2 rounded-lg border border-red-400/60 text-red-500 text-sm font-medium hover:bg-red-500/10">
          {isDirector ? '퇴원 처리' : '퇴원 신청'}
        </button>
      )}
    </section>
  )
}
