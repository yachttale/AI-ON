// app/v2/today/parts.tsx — 출결·바퀴수 클라이언트 섬
'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { markAttendance, setLaps, assignToMe, confirmSession, acceptReportedStep } from '@/lib/v2/actions'
import type { Attendance } from '@/types/v2'
import type { TodayCard } from '@/lib/v2/today'

const ATT: Attendance[] = ['출석', '지각', '결석']
const COLOR: Record<Attendance, string> = { '출석': 'bg-green-500 text-white', '지각': 'bg-yellow-400 text-white', '결석': 'bg-red-400 text-white' }

export function TodayCardItem({ card }: { card: TodayCard }) {
  const [pending, start] = useTransition()
  const [laps, setLapsState] = useState(card.laps ?? 0)

  const isPending = card.status === 'pending'
  const isConfirmed = card.status === 'confirmed'

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      {/* 헤더: 이름 + 상태 배지 + 진도 링크 */}
      <div className="flex justify-between items-start px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <div>
            <p className="font-semibold text-gray-800">{card.name}</p>
            <p className="text-xs text-gray-400">{card.grade ?? ''}</p>
          </div>
          {isPending && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-600">미확인</span>
          )}
          {isConfirmed && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-600">확정</span>
          )}
        </div>
        <Link href={`/v2/student/${card.id}`} className="text-gray-300 text-sm">진도 →</Link>
      </div>

      {/* 아이 보고 내용 (pending일 때만) */}
      {isPending && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-lg bg-orange-50 border border-orange-100 text-xs text-orange-700 space-y-0.5">
          <p className="font-semibold text-orange-500">아이 보고</p>
          <p>출석: {card.attendance ?? '—'}</p>
          {card.reportedStep && <p>단계: {card.reportedStep.label}</p>}
          {card.laps != null && card.laps > 0 && <p>바퀴수: {card.laps}</p>}
        </div>
      )}

      {/* 확인 액션 버튼 (pending일 때) */}
      {isPending && (
        <div className="flex gap-2 px-3 pb-2">
          {card.reportedStep && (
            <button
              disabled={pending}
              onClick={() => start(() => acceptReportedStep(card.id, card.reportedStep!))}
              className="flex-1 py-2 rounded-lg text-xs font-semibold bg-blue-500 text-white disabled:opacity-50"
            >
              {pending ? '…' : '이 단계 통과 인정'}
            </button>
          )}
          <button
            disabled={pending}
            onClick={() => start(() => confirmSession(card.id))}
            className="flex-1 py-2 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 disabled:opacity-50"
          >
            {pending ? '…' : '확인만'}
          </button>
        </div>
      )}

      {/* 출결 버튼 */}
      <div className="flex gap-1.5 px-3">
        {ATT.map(a => (
          <button key={a} disabled={pending} onClick={() => start(() => markAttendance(card.id, a))}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold ${card.attendance === a ? COLOR[a] : 'bg-gray-100 text-gray-400'}`}>{a}</button>
        ))}
      </div>

      {/* 바퀴수 */}
      <div className="flex items-center gap-2 px-3 py-3">
        <span className="text-xs text-gray-500">바퀴수</span>
        <button onClick={() => { const v = Math.max(0, laps - 1); setLapsState(v); start(() => setLaps(card.id, v)) }} className="w-8 h-8 rounded bg-gray-100">−</button>
        <span className="w-8 text-center font-semibold">{laps}</span>
        <button onClick={() => { const v = laps + 1; setLapsState(v); start(() => setLaps(card.id, v)) }} className="w-8 h-8 rounded bg-gray-100">＋</button>
      </div>
    </div>
  )
}

// 오늘 수업이지만 미배정·타반 학생 → 내 반으로 가져오기
export function AssignableCardItem({ card }: { card: TodayCard }) {
  const [pending, start] = useTransition()
  return (
    <div className="bg-white rounded-xl border border-dashed flex items-center justify-between px-4 py-3">
      <div>
        <p className="font-medium text-gray-700">{card.name}<span className="ml-1 text-xs text-gray-400">{card.grade ?? ''}</span></p>
        <p className="text-xs text-gray-400">{card.instructor_name ? `현재 ${card.instructor_name} 반` : '미배정'}</p>
      </div>
      <button disabled={pending} onClick={() => start(() => assignToMe(card.id))}
        className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-semibold">{pending ? '…' : '내 반으로'}</button>
    </div>
  )
}
