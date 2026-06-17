// app/v2/today/parts.tsx — 출결·바퀴수 클라이언트 섬
'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { markAttendance, setLaps, assignToMe } from '@/lib/v2/actions'
import type { Attendance } from '@/types/v2'
import type { TodayCard } from '@/lib/v2/today'

const ATT: Attendance[] = ['출석', '지각', '결석']
const COLOR: Record<Attendance, string> = { '출석': 'bg-green-500 text-white', '지각': 'bg-yellow-400 text-white', '결석': 'bg-red-400 text-white' }

export function TodayCardItem({ card }: { card: TodayCard }) {
  const [pending, start] = useTransition()
  const [laps, setLapsState] = useState(card.laps ?? 0)
  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <Link href={`/v2/student/${card.id}`} className="flex justify-between px-4 pt-3 pb-2">
        <div><p className="font-semibold text-gray-800">{card.name}</p><p className="text-xs text-gray-400">{card.grade ?? ''}</p></div>
        <span className="text-gray-300 text-sm">진도 →</span>
      </Link>
      <div className="flex gap-1.5 px-3">
        {ATT.map(a => (
          <button key={a} disabled={pending} onClick={() => start(() => markAttendance(card.id, a))}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold ${card.attendance === a ? COLOR[a] : 'bg-gray-100 text-gray-400'}`}>{a}</button>
        ))}
      </div>
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
