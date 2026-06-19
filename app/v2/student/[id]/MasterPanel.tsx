'use client'
import { useOptimistic, useTransition } from 'react'
import { logRepeatable, removeLastLap } from '@/lib/v2/actions'
import type { StudentMasterStats, MasterStrokeStats } from '@/lib/v2/data'

export function MasterPanel({ studentId, stats }: { studentId: string; stats: StudentMasterStats }) {
  const [pending, start] = useTransition()

  // 낙관적 오늘 바퀴 수 (stepId → delta)
  const [optimistic, addOptimistic] = useOptimistic(
    Object.fromEntries(stats.strokes.map(s => [s.stepId, s.todayLaps])),
    (state: Record<string, number>, { stepId, delta }: { stepId: string; delta: number }) => ({
      ...state,
      [stepId]: Math.max(0, (state[stepId] ?? 0) + delta),
    }),
  )

  const plusLap = (s: MasterStrokeStats) => {
    addOptimistic({ stepId: s.stepId, delta: 1 })
    start(() => logRepeatable(studentId, s.stepId, 'laps', 1))
  }
  const minusLap = (s: MasterStrokeStats) => {
    addOptimistic({ stepId: s.stepId, delta: -1 })
    start(() => removeLastLap(studentId, s.stepId))
  }

  const swim = stats.strokes.filter(s => s.strokeKey !== 'im')
  const im = stats.strokes.find(s => s.strokeKey === 'im')

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold text-gray-700">마스터 오늘 기록</h2>

      {swim.map(s => (
        <div key={s.stepId} className="bg-white rounded-xl border px-4 py-3 flex items-center gap-3">
          <span className="w-14 text-sm font-semibold text-gray-800">{s.strokeLabel}</span>
          <div className="flex items-center gap-2">
            <button
              disabled={pending || optimistic[s.stepId] <= 0}
              onClick={() => minusLap(s)}
              className="w-9 h-9 rounded-full bg-gray-100 text-xl font-bold text-gray-600 disabled:opacity-30"
            >−</button>
            <span className="w-10 text-center text-xl font-bold tabular-nums">{optimistic[s.stepId]}</span>
            <button
              disabled={pending}
              onClick={() => plusLap(s)}
              className="w-9 h-9 rounded-full bg-sky-500 text-white text-xl font-bold"
            >+</button>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-gray-400">누적</p>
            <p className="text-sm font-semibold text-gray-700">{(s.totalDistanceM + (optimistic[s.stepId] - s.todayLaps) * 50).toLocaleString()}m</p>
          </div>
        </div>
      ))}

      {im && (
        <div className="bg-white rounded-xl border px-4 py-3 flex items-center gap-3">
          <span className="w-14 text-sm font-semibold text-gray-800">IM</span>
          <div className="flex items-center gap-2">
            <button
              disabled={pending || optimistic[im.stepId] <= 0}
              onClick={() => minusLap(im)}
              className="w-9 h-9 rounded-full bg-gray-100 text-xl font-bold text-gray-600 disabled:opacity-30"
            >−</button>
            <span className="w-10 text-center text-xl font-bold tabular-nums">{optimistic[im.stepId]}</span>
            <button
              disabled={pending}
              onClick={() => plusLap(im)}
              className="w-9 h-9 rounded-full bg-purple-500 text-white text-xl font-bold"
            >+</button>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-gray-400">총 기록</p>
            <p className="text-sm font-semibold text-gray-700">{im.totalLaps}회</p>
          </div>
        </div>
      )}
    </div>
  )
}
