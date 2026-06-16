export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import LogTimeline from '@/components/LogTimeline'
import MasterSwimTracker from '@/components/MasterSwimTracker'
import StrokeRadar from '@/components/StrokeRadar'
import { Badge } from '@/components/ui/badge'
import { getPriorStrokeBonus } from '@/lib/curriculum'

function fmtDate(d: string): string {
  const [, mm, dd] = d.split('-')
  return `${parseInt(mm)}/${parseInt(dd)}`
}

function fmtDist(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)}km`
  return `${m.toLocaleString()}m`
}

const STROKE_EMOJI: Record<string, string> = {
  '자유형': '🏊', '배영': '🌊', '평영': '🐸', '접영': '🦋', '마스터': '🏆', '초급': '🌱',
}

const LEVEL_COLOR: Record<string, string> = {
  '초급': 'bg-gray-100 text-gray-600',
  '자유형': 'bg-sky-100 text-sky-700',
  '배영': 'bg-green-100 text-green-700',
  '평영': 'bg-purple-100 text-purple-700',
  '접영': 'bg-orange-100 text-orange-700',
  '마스터': 'bg-gray-900 text-white',
}

const ENERGY_STROKES = [
  { stroke: '자유형', max: 25 },
  { stroke: '배영', max: 20 },
  { stroke: '평영', max: 25 },
  { stroke: '접영', max: 25 },
] as const

interface StageMilestone {
  stage: string
  startDate: string
  passedDate: string | null
}

export default async function DirectorStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: student }, { data: logs }, { data: distances }] = await Promise.all([
    supabase.from('students').select('*, profiles!instructor_id(name)').eq('id', id).single(),
    supabase.from('session_logs').select('*').eq('student_id', id).order('session_date', { ascending: false }),
    supabase.from('swim_distances').select('distance_m').eq('student_id', id),
  ])

  if (!student) notFound()

  const allLogs = logs ?? []
  const attendedLogs = allLogs.filter(l => l.attendance !== '결석')
  const totalSessions = allLogs.length
  const attendedCount = attendedLogs.length
  const satisfactionRate = totalSessions > 0 ? Math.round((attendedCount / totalSessions) * 100) : 0

  const recordedDays = new Set(allLogs.map(l => l.session_date)).size

  const totalDistanceM = (distances ?? []).reduce((s, d) => s + d.distance_m, 0)
  const avgDistanceM = recordedDays > 0 ? Math.round(totalDistanceM / recordedDays) : 0

  // 가장 즐거워하는 영법: 출석한 수업 중 가장 많은 영법
  const strokeCounts: Record<string, number> = {}
  for (const log of attendedLogs.filter(l => l.stroke)) {
    const s = log.stroke!
    strokeCounts[s] = (strokeCounts[s] ?? 0) + 1
  }
  const favoriteStroke = Object.entries(strokeCounts)
    .filter(([s]) => ['자유형', '배영', '평영', '접영'].includes(s))
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const latestLog = allLogs.find(l => l.stroke)
  const isMaster = latestLog?.stroke === '마스터'
  const currentLevel = latestLog?.stroke ?? '초급'

  const rawAttended = attendedCount
  const totalAttendedBonus = rawAttended + getPriorStrokeBonus(latestLog?.stroke ?? null, latestLog?.stage ?? null)

  const completedStrokes = ['자유형', '배영', '평영', '접영'].filter(stroke =>
    allLogs.some(l => l.stroke === stroke && l.stage === '완주' && l.status === '통과')
  )

  // 영법별 에너지 진도 (기존 로직 유지)
  const loggedStrokes = new Set(allLogs.filter(l => l.stroke).map(l => l.stroke as string))
  const ORDERED_S = ['자유형', '배영', '평영', '접영'] as const
  const firstLoggedIdx = ORDERED_S.findIndex(s => loggedStrokes.has(s))

  const energyData = isMaster ? [] : ENERGY_STROKES.map(({ stroke, max }) => {
    const strokeLogs = allLogs
      .filter(l => l.stroke === stroke)
      .sort((a, b) => a.session_date.localeCompare(b.session_date))
    const attendedStrokeLogs = strokeLogs.filter(l => l.attendance !== '결석')
    const count = attendedStrokeLogs.length
    const strokeIdx = ORDERED_S.indexOf(stroke as typeof ORDERED_S[number])
    const isPriorCompleted = firstLoggedIdx > 0 && strokeIdx >= 0 && strokeIdx < firstLoggedIdx && !loggedStrokes.has(stroke)
    const milestones: StageMilestone[] = []
    const seenStages = new Set<string>()
    const passedStages = new Set<string>()
    for (const log of strokeLogs) {
      if (!log.stage) continue
      if (!seenStages.has(log.stage)) {
        seenStages.add(log.stage)
        milestones.push({ stage: log.stage, startDate: log.session_date, passedDate: null })
      }
      if (log.status === '통과' && !passedStages.has(log.stage)) {
        passedStages.add(log.stage)
        const m = milestones.find(m => m.stage === log.stage)
        if (m) m.passedDate = log.session_date
      }
    }
    return { stroke, max, count, milestones, sessionDates: attendedStrokeLogs.map(l => l.session_date), isPriorCompleted }
  })

  const satEmoji = satisfactionRate >= 80 ? '😊' : satisfactionRate >= 60 ? '🙂' : '😐'

  return (
    <div>
      <Link href="/director/dashboard" className="text-sky-500 text-sm mb-4 block">
        ← 대시보드로
      </Link>

      {/* 프로필 헤더 */}
      <div className="bg-gradient-to-br from-sky-500 to-blue-600 rounded-2xl p-4 mb-4 text-white shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center font-bold text-2xl shrink-0">
            {student.name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h2 className="text-xl font-bold">{student.name}</h2>
              <span className="bg-white/20 text-xs px-2 py-0.5 rounded-full font-medium">
                {currentLevel}
              </span>
            </div>
            <p className="text-sm text-white/70">
              {student.grade && `${student.grade} · `}{student.schedule}
            </p>
            {(student as { profiles?: { name: string } | null }).profiles?.name && (
              <p className="text-xs text-white/50">
                담당: {(student as { profiles?: { name: string } | null }).profiles!.name}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-3xl font-bold leading-none">{totalAttendedBonus}</p>
            <p className="text-xs text-white/60 mt-0.5">총 수업회</p>
          </div>
        </div>
      </div>

      {/* 레이더 + 통계 */}
      <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm">
        <p className="text-xs text-gray-400 mb-3">
          수영등급 <span className={`font-bold text-xs px-2 py-0.5 rounded-full ml-1 ${LEVEL_COLOR[currentLevel] ?? 'bg-gray-100 text-gray-600'}`}>{currentLevel}</span>
        </p>
        <div className="flex gap-2 items-center">
          <div className="flex-1 min-w-0 flex justify-center">
            <StrokeRadar logs={allLogs} />
          </div>
          <div className="w-28 shrink-0 space-y-3">
            <div>
              <div className="flex items-center gap-1 mb-0.5">
                <span className="text-xl">{satEmoji}</span>
                <span className="text-[10px] text-gray-400">훈련만족도</span>
              </div>
              <p className="text-2xl font-bold text-gray-800">{satisfactionRate}%</p>
            </div>
            <div className="border-t pt-2.5">
              <p className="text-[10px] text-gray-400 mb-0.5">기록 일수</p>
              <p className="text-2xl font-bold text-gray-800">
                {recordedDays}<span className="text-sm font-normal text-gray-400 ml-0.5">일</span>
              </p>
            </div>
            <div className="border-t pt-2.5">
              <p className="text-[10px] text-gray-400 mb-0.5">총 수영거리</p>
              <p className="text-xl font-bold text-gray-800">
                {totalDistanceM > 0 ? fmtDist(totalDistanceM) : '-'}
              </p>
            </div>
            <div className="border-t pt-2.5">
              <p className="text-[10px] text-gray-400 mb-0.5">하루 평균</p>
              <p className="text-xl font-bold text-gray-800">
                {totalDistanceM > 0 ? fmtDist(avgDistanceM) : '-'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 출석 + 즐거워하는 영법 */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-gray-400 mb-1">총 출석</p>
          <p className="text-3xl font-bold text-sky-600">
            {attendedCount}<span className="text-sm font-normal text-gray-400 ml-1">회</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">전체 {totalSessions}회 중</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-gray-400 mb-1">가장 즐거워하는 영법</p>
          {favoriteStroke ? (
            <div className="flex items-end justify-between">
              <p className="text-xl font-bold text-gray-800">{favoriteStroke}</p>
              <span className="text-3xl">{STROKE_EMOJI[favoriteStroke] ?? '🏊'}</span>
            </div>
          ) : (
            <p className="text-sm text-gray-400 mt-2">기록 없음</p>
          )}
        </div>
      </div>

      {/* 인증서 + 리포트 */}
      <div className="flex flex-wrap gap-2 mb-4">
        {completedStrokes.map(stroke => (
          <Link
            key={stroke}
            href={`/director/student/${id}/certificate?stroke=${encodeURIComponent(stroke)}`}
            className="px-3 py-2 bg-yellow-400 hover:bg-yellow-500 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            🏅 {stroke} 증명서
          </Link>
        ))}
        <Link
          href={`/director/student/${id}/report`}
          className="px-3 py-2 bg-indigo-400 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-colors"
        >
          📋 부모님 리포트
        </Link>
      </div>

      {/* 마스터: 수영 거리 트래커 */}
      {isMaster && <MasterSwimTracker studentId={id} readOnly />}

      {/* 영법별 진도 */}
      {!isMaster && (
        <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
          <h3 className="font-semibold text-gray-700 mb-4 text-sm">영법별 진도</h3>
          <div className="space-y-6">
            {energyData.map(({ stroke, max, count, milestones, sessionDates, isPriorCompleted }) => (
              <div key={stroke}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-700">{stroke}</span>
                  <span className="text-xs text-gray-400">{Math.min(count, max)}/{max}회</span>
                </div>
                <div className="grid grid-cols-10 gap-1 mb-2">
                  {Array.from({ length: max }).map((_, i) => {
                    const date = isPriorCompleted ? null : (sessionDates[i] ?? null)
                    const isFilled = isPriorCompleted || date !== null
                    const dayNum = date ? parseInt(date.split('-')[2]) : null
                    return (
                      <div
                        key={i}
                        title={date ? date.slice(5).replace('-', '/') : isPriorCompleted ? '이전 완료' : undefined}
                        className={`aspect-square rounded-sm border-2 flex items-center justify-center ${
                          isPriorCompleted
                            ? 'bg-sky-200 border-sky-100'
                            : isFilled ? 'bg-sky-400 border-sky-300' : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        {dayNum !== null && (
                          <span className="text-[8px] text-white font-bold leading-none">{dayNum}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
                {isPriorCompleted && <p className="text-xs text-gray-400 mb-2">첫 수업 전 완료</p>}
                {milestones.length > 0 ? (
                  <div className="space-y-1.5">
                    {milestones.map(m => (
                      <div key={m.stage} className="flex items-center gap-2 text-xs">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${m.passedDate ? 'bg-green-400' : 'bg-sky-400'}`} />
                        <span className="font-medium text-gray-700 w-14">{m.stage}</span>
                        <span className="text-gray-400">{fmtDate(m.startDate)} 시작</span>
                        {m.passedDate ? (
                          <span className="text-green-600">→ {fmtDate(m.passedDate)} 통과</span>
                        ) : (
                          <span className="text-sky-500 font-medium">진행중</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-300">아직 기록 없음</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <h3 className="font-semibold text-gray-700 mb-3 mt-4">수업 기록</h3>
      <LogTimeline logs={allLogs} />
    </div>
  )
}
