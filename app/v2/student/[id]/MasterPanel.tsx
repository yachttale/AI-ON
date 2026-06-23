'use client'
import { useState, useRef, useEffect } from 'react'
import { setTodayLaps } from '@/lib/v2/actions'
import type { StudentMasterStats, MasterStrokeStats } from '@/lib/v2/data'

export function MasterPanel({ studentId, stats }: { studentId: string; stats: StudentMasterStats }) {
  const swim = stats.strokes.filter(s => s.strokeKey !== 'im')
  const im = stats.strokes.find(s => s.strokeKey === 'im')

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold text-gray-700">마스터 오늘 기록</h2>
      {swim.map(s => <StrokeRow key={s.stepId} studentId={studentId} s={s} />)}
      {im && <StrokeRow studentId={studentId} s={im} isIM />}
    </div>
  )
}

// 멈춘 뒤 0.8초 후 최종값만 1회 저장 (연타 시 로딩 없음). 언마운트 시 즉시 flush.
function StrokeRow({ studentId, s, isIM }: { studentId: string; s: MasterStrokeStats; isIM?: boolean }) {
  const [laps, setLaps] = useState(s.todayLaps)
  const latest = useRef(s.todayLaps)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const schedule = (n: number) => {
    latest.current = n; setLaps(n)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { timer.current = null; setTodayLaps(studentId, s.stepId, n) }, 800)
  }
  const inc = () => schedule(latest.current + 1)
  const dec = () => { if (latest.current > 0) schedule(latest.current - 1) }
  useEffect(() => () => {
    if (timer.current) { clearTimeout(timer.current); setTodayLaps(studentId, s.stepId, latest.current) }
  }, [studentId, s.stepId])

  const delta = laps - s.todayLaps // 미저장분도 화면 누적에 즉시 반영
  return (
    <div className="bg-white rounded-xl border px-4 py-3 flex items-center gap-3">
      <span className="w-14 text-sm font-semibold text-gray-800">{isIM ? 'IM' : s.strokeLabel}</span>
      <div className="flex items-center gap-2">
        <button disabled={laps <= 0} onClick={dec}
          className="w-9 h-9 rounded-full bg-gray-100 text-xl font-bold text-gray-600 disabled:opacity-30">−</button>
        <span className="w-10 text-center text-xl font-bold tabular-nums">{laps}</span>
        <button onClick={inc}
          className={`w-9 h-9 rounded-full text-white text-xl font-bold active:scale-95 transition-transform ${isIM ? 'bg-purple-500' : 'bg-sky-500'}`}>+</button>
      </div>
      <div className="ml-auto text-right">
        <p className="text-xs text-gray-400">{isIM ? '총 기록' : '누적'}</p>
        <p className="text-sm font-semibold text-gray-700">
          {isIM
            ? `${s.totalLaps + delta}회`
            : `${(s.totalDistanceM + delta * 50).toLocaleString()}m`}
        </p>
      </div>
    </div>
  )
}
