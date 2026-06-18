// app/v2/director/ClosureToggle.tsx — 원장: 오늘 휴원일 지정/해제
'use client'
import { useState, useTransition } from 'react'
import { setClosureToday } from '@/lib/v2/actions'

export function ClosureToggle({ closed }: { closed: boolean }) {
  const [pending, start] = useTransition()
  const [on, setOn] = useState(closed)
  const toggle = () => { const v = !on; setOn(v); start(() => setClosureToday(v)) }
  return (
    <div className={`rounded-xl border p-4 flex items-center justify-between ${on ? 'bg-amber-50 border-amber-300' : 'bg-white'}`}>
      <div>
        <p className="text-sm font-bold text-gray-800">{on ? '오늘은 휴원일 🏖️' : '오늘 휴원일 지정'}</p>
        <p className="text-xs text-gray-400">{on ? '강사 화면에 휴원일로 표시됩니다 (결석 아님)' : '수업 없는 날이면 휴원일로 지정하세요'}</p>
      </div>
      <button disabled={pending} onClick={toggle}
        className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold ${on ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
        {pending ? '…' : on ? '휴원 해제' : '휴원일 지정'}
      </button>
    </div>
  )
}
