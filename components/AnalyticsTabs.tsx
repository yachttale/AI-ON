'use client'

import { useState } from 'react'

export interface StrokeStats {
  stroke: string
  baseline: number
  currentCount: number
  completedCount: number
  avgSessionsToComplete: number | null
  stageStats: { stage: string; studentCount: number; avgSessions: number; passedCount: number }[]
}

export interface InstructorStats {
  id: string
  name: string
  studentCount: number
  thisMonthSessions: number
  completions: number
  strokeDist: Record<string, number>
}

export interface GradeStats {
  grade: string
  studentCount: number
  strokeDist: Record<string, number>
}

interface Props {
  strokeStats: StrokeStats[]
  instructorStats: InstructorStats[]
  gradeStats: GradeStats[]
  thisMonthLabel: string
}

const STROKE_COLORS: Record<string, string> = {
  '자유형': 'bg-sky-400',
  '배영': 'bg-indigo-400',
  '평영': 'bg-emerald-400',
  '접영': 'bg-amber-400',
  '초급': 'bg-gray-300',
  '마스터': 'bg-purple-400',
  '미시작': 'bg-gray-200',
}

function Bar({ value, max, color = 'bg-sky-400' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function AnalyticsTabs({ strokeStats, instructorStats, gradeStats, thisMonthLabel }: Props) {
  const [tab, setTab] = useState<'stroke' | 'instructor' | 'grade'>('stroke')

  const tabs = [
    { key: 'stroke' as const, label: '영법별' },
    { key: 'instructor' as const, label: '강사별' },
    { key: 'grade' as const, label: '학년별' },
  ]

  return (
    <div>
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-sky-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 영법별 */}
      {tab === 'stroke' && (
        <div className="space-y-4">
          {strokeStats.map(s => {
            const maxStageCount = Math.max(...s.stageStats.map(st => st.studentCount), 1)
            const color = STROKE_COLORS[s.stroke] ?? 'bg-sky-400'
            const hasData = s.currentCount > 0 || s.completedCount > 0
            return (
              <div key={s.stroke} className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-gray-800 text-base">{s.stroke}</h3>
                  <span className="text-xs text-gray-400">기준 {s.baseline}회</span>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="text-center bg-sky-50 rounded-xl py-2.5">
                    <p className="text-2xl font-bold text-sky-600">{s.currentCount}</p>
                    <p className="text-xs text-gray-400 mt-0.5">수업 중</p>
                  </div>
                  <div className="text-center bg-green-50 rounded-xl py-2.5">
                    <p className="text-2xl font-bold text-green-600">{s.completedCount}</p>
                    <p className="text-xs text-gray-400 mt-0.5">완성</p>
                  </div>
                  <div className="text-center bg-indigo-50 rounded-xl py-2.5">
                    <p className="text-2xl font-bold text-indigo-600">
                      {s.avgSessionsToComplete !== null ? s.avgSessionsToComplete : '-'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">평균 횟수</p>
                  </div>
                </div>

                {/* 기준 vs 실제 평균 바 */}
                {s.avgSessionsToComplete !== null && (
                  <div className="mb-4 bg-gray-50 rounded-xl p-3">
                    <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                      <span>평균 완성 소요</span>
                      <span>
                        <span className={s.avgSessionsToComplete <= s.baseline ? 'text-green-500 font-semibold' : 'text-amber-500 font-semibold'}>
                          {s.avgSessionsToComplete}회
                        </span>
                        <span className="text-gray-300"> / 기준 {s.baseline}회</span>
                      </span>
                    </div>
                    <div className="relative h-3 bg-gray-200 rounded-full overflow-visible">
                      <div
                        className={`h-full ${color} rounded-full`}
                        style={{ width: `${Math.min(95, Math.round((s.avgSessionsToComplete / (s.baseline * 1.6)) * 100))}%` }}
                      />
                      {/* 기준선 마커 */}
                      <div
                        className="absolute top-[-3px] h-[18px] w-0.5 bg-gray-500 rounded"
                        style={{ left: `${Math.round((s.baseline / (s.baseline * 1.6)) * 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 text-right">▲ 기준선 ({s.baseline}회)</p>
                  </div>
                )}

                {/* 세부단계별 현황 */}
                {hasData && s.stageStats.some(st => st.studentCount > 0) && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2">단계별 경험 학생 수</p>
                    <div className="space-y-2">
                      {s.stageStats.filter(st => st.studentCount > 0).map(st => (
                        <div key={st.stage} className="flex items-center gap-2 text-xs">
                          <span className="w-16 text-gray-600 shrink-0">{st.stage}</span>
                          <div className="flex-1">
                            <Bar value={st.studentCount} max={maxStageCount} color={color} />
                          </div>
                          <div className="text-right shrink-0 w-24">
                            <span className="text-gray-500">{st.studentCount}명</span>
                            {st.passedCount > 0 && (
                              <span className="text-green-500 ml-1">({st.passedCount} 통과)</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!hasData && (
                  <p className="text-sm text-gray-300 text-center py-3">아직 데이터 없음</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 강사별 */}
      {tab === 'instructor' && (
        <div className="space-y-4">
          {instructorStats.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">강사 데이터 없음</p>
          )}
          {instructorStats.map(inst => {
            const maxDist = Math.max(...Object.values(inst.strokeDist), 1)
            return (
              <div key={inst.id} className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-gray-800 text-base">{inst.name}</h3>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="text-center bg-sky-50 rounded-xl py-2.5">
                    <p className="text-2xl font-bold text-sky-600">{inst.studentCount}</p>
                    <p className="text-xs text-gray-400 mt-0.5">담당 학생</p>
                  </div>
                  <div className="text-center bg-amber-50 rounded-xl py-2.5">
                    <p className="text-2xl font-bold text-amber-500">{inst.thisMonthSessions}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{thisMonthLabel} 수업</p>
                  </div>
                  <div className="text-center bg-green-50 rounded-xl py-2.5">
                    <p className="text-2xl font-bold text-green-600">{inst.completions}</p>
                    <p className="text-xs text-gray-400 mt-0.5">완성 달성</p>
                  </div>
                </div>

                {Object.keys(inst.strokeDist).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2">담당 학생 영법 분포</p>
                    <div className="space-y-2">
                      {Object.entries(inst.strokeDist)
                        .sort((a, b) => b[1] - a[1])
                        .map(([stroke, count]) => (
                          <div key={stroke} className="flex items-center gap-2 text-xs">
                            <span className="w-14 text-gray-600 shrink-0">{stroke}</span>
                            <div className="flex-1">
                              <Bar value={count} max={maxDist} color={STROKE_COLORS[stroke] ?? 'bg-gray-300'} />
                            </div>
                            <span className="text-gray-400 w-8 text-right shrink-0">{count}명</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 학년별 */}
      {tab === 'grade' && (
        <div className="space-y-4">
          {gradeStats.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">학년 데이터 없음</p>
          )}
          {gradeStats.map(g => {
            const maxDist = Math.max(...Object.values(g.strokeDist), 1)
            return (
              <div key={g.grade} className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-gray-800 text-base">{g.grade}</h3>
                  <span className="text-xs bg-sky-100 text-sky-600 px-2 py-0.5 rounded-full font-semibold">
                    {g.studentCount}명
                  </span>
                </div>

                {Object.keys(g.strokeDist).length > 0 ? (
                  <div className="space-y-2">
                    {Object.entries(g.strokeDist)
                      .sort((a, b) => b[1] - a[1])
                      .map(([stroke, count]) => (
                        <div key={stroke} className="flex items-center gap-2 text-xs">
                          <span className="w-14 text-gray-600 shrink-0">{stroke}</span>
                          <div className="flex-1">
                            <Bar value={count} max={maxDist} color={STROKE_COLORS[stroke] ?? 'bg-gray-300'} />
                          </div>
                          <span className="text-gray-400 w-8 text-right shrink-0">{count}명</span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-300 text-center py-2">진도 기록 없음</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
