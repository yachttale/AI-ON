'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getKSTDateString, getKSTMonthStart } from '@/lib/utils'
import { MASTER_STROKES, MASTER_DISTANCES } from '@/lib/curriculum'

const COMPARISONS = [
  { name: '한강 한 바퀴(5.6km)', meters: 5_600 },
  { name: '한강 10km 수영', meters: 10_000 },
  { name: '부산 → 대마도(50km)', meters: 50_000 },
  { name: '대한해협 횡단(200km)', meters: 200_000 },
  { name: '부산 → 제주도(300km)', meters: 300_000 },
  { name: '한강 종주(514km)', meters: 514_000 },
]

function getComparison(totalMeters: number): string {
  const km = (totalMeters / 1000).toFixed(2)
  const reached = [...COMPARISONS].reverse().find(c => totalMeters >= c.meters)
  const next = COMPARISONS.find(c => totalMeters < c.meters)

  if (reached) {
    return `${reached.name}까지 수영했어요! 🎉 총 ${km}km`
  }
  if (next && totalMeters > 0) {
    const remaining = ((next.meters - totalMeters) / 1000).toFixed(1)
    return `${next.name}까지 ${remaining}km 남았어요 💪`
  }
  if (totalMeters > 0) return `이번 달 총 ${km}km 수영했어요`
  return '이번 달 기록이 없어요'
}


interface SwimEntry {
  id: string
  stroke: string
  distance_m: number
  logged_date: string
}

interface Props {
  studentId: string
  readOnly?: boolean
}

export default function MasterSwimTracker({ studentId, readOnly = false }: Props) {
  const [todayEntries, setTodayEntries] = useState<SwimEntry[]>([])
  const [monthTotal, setMonthTotal] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const today = getKSTDateString()

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('swim_distances')
      .select('id, stroke, distance_m, logged_date')
      .eq('student_id', studentId)
      .gte('logged_date', getKSTMonthStart())
      .order('created_at', { ascending: false })
    const all = data ?? []
    setTodayEntries(all.filter(e => e.logged_date === today))
    setMonthTotal(all.reduce((sum, e) => sum + e.distance_m, 0))
  }, [studentId, today])

  useEffect(() => { load() }, [load])

  async function handleAdd(stroke: string, distance_m: number) {
    setSaving(true)
    setSaveError(null)
    const supabase = createClient()
    const { error } = await supabase.from('swim_distances').insert({ student_id: studentId, logged_date: today, stroke, distance_m })
    if (error) {
      setSaveError('저장 실패. 다시 시도해주세요.')
      setSaving(false)
      return
    }

    // 원장 대시보드 강사별 입력 현황에 반영되도록 session_log 자동 생성 (없을 때만)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: existing } = await supabase
        .from('session_logs')
        .select('id')
        .eq('student_id', studentId)
        .eq('session_date', today)
        .limit(1)
      if (!existing || existing.length === 0) {
        await supabase.from('session_logs').insert({
          student_id: studentId,
          instructor_id: user.id,
          session_date: today,
          attendance: '출석',
          stroke: '마스터',
          stage: null,
          status: null,
          memo: null,
          absence_reason: null,
        })
      }
    }

    await load()
    setSaving(false)
  }

  async function handleRemoveLast(stroke: string, distance_m: number) {
    const target = todayEntries.find(e => e.stroke === stroke && e.distance_m === distance_m)
    if (!target) return
    const supabase = createClient()
    const { error } = await supabase.from('swim_distances').delete().eq('id', target.id)
    if (!error) await load()
    else setSaveError('취소 실패. 다시 시도해주세요.')
  }

  const todayTotal = todayEntries.reduce((sum, e) => sum + e.distance_m, 0)

  function countToday(stroke: string, distance_m: number) {
    return todayEntries.filter(e => e.stroke === stroke && e.distance_m === distance_m).length
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h3 className="font-semibold text-gray-700 mb-3 text-sm">오늘의 수영 기록</h3>
        {saveError && <p className="text-xs text-red-500 mb-2">{saveError}</p>}
        <div className="space-y-3">
          {MASTER_STROKES.map(stroke => (
            <div key={stroke}>
              <p className="text-xs font-medium text-gray-500 mb-1.5">{stroke}</p>
              <div className="flex gap-2">
                {MASTER_DISTANCES.map(dist => {
                  const count = countToday(stroke, dist)
                  return (
                    <button
                      key={dist}
                      onClick={() => !readOnly && handleAdd(stroke, dist)}
                      disabled={saving || readOnly}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all relative ${
                        count > 0
                          ? 'bg-sky-500 text-white'
                          : readOnly
                            ? 'bg-gray-100 text-gray-400 cursor-default'
                            : 'bg-gray-100 text-gray-600 hover:bg-sky-100 hover:text-sky-700'
                      }`}
                    >
                      {dist}m
                      {count > 0 && (
                        <span className="absolute -top-1.5 -right-1 bg-sky-700 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                          {count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {todayTotal > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">오늘 총 거리</span>
              <span className="text-lg font-bold text-sky-600">
                {todayTotal >= 1000 ? `${(todayTotal / 1000).toFixed(2)}km` : `${todayTotal}m`}
              </span>
            </div>
            {!readOnly && (
              <div className="flex flex-wrap gap-1.5">
                {MASTER_STROKES.flatMap(stroke =>
                  MASTER_DISTANCES.map(dist => {
                    const count = countToday(stroke, dist)
                    if (!count) return null
                    return (
                      <button
                        key={`${stroke}-${dist}`}
                        onClick={() => handleRemoveLast(stroke, dist)}
                        className="text-xs bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-2 py-0.5 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
                        title="마지막 기록 취소"
                      >
                        {stroke} {dist}m ×{count}
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-gradient-to-br from-sky-500 to-blue-600 rounded-2xl p-4 text-white shadow-sm">
        <p className="text-sky-100 text-xs font-medium mb-1">이번 달 누적 거리</p>
        <p className="text-2xl font-bold mb-2">
          {monthTotal >= 1000 ? `${(monthTotal / 1000).toFixed(2)} km` : `${monthTotal} m`}
        </p>
        <p className="text-sky-100 text-sm leading-relaxed">{getComparison(monthTotal)}</p>
      </div>
    </div>
  )
}
