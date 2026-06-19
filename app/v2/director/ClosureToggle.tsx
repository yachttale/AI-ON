// app/v2/director/ClosureToggle.tsx — 원장: 오늘 휴원일 지정/해제
'use client'
import { useState, useTransition } from 'react'
import { setClosureToday } from '@/lib/v2/actions'

export function ClosureToggle({ closed }: { closed: boolean }) {
  const [pending, start] = useTransition()
  const [on, setOn] = useState(closed)
  const toggle = () => { const v = !on; setOn(v); start(() => setClosureToday(v)) }
  return (
    <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${on ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/5 border-white/10'}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white/80">{on ? '오늘은 휴원일 🏖️' : '오늘 휴원일 지정'}</p>
        <p className="text-xs text-white/40">{on ? '강사 화면에 휴원일로 표시됩니다' : '수업 없는 날이면 지정하세요'}</p>
      </div>
      <button disabled={pending} onClick={toggle}
        className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${on ? 'bg-amber-500 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
        {pending ? '…' : on ? '해제' : '휴원 지정'}
      </button>
    </div>
  )
}
