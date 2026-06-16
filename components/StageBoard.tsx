'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { STROKES, MASTER_STROKES } from '@/lib/curriculum'
import type { Student } from '@/types/database'

interface StudentWithStroke extends Student {
  currentStroke: string | null
  currentStage: string | null
}

interface Props {
  students: StudentWithStroke[]
  completedStrokesMap?: Record<string, string[]>
}

const STROKE_STYLE: Record<string, { card: string; badge: string; label: string; darkBadge?: string }> = {
  '자유형': { card: 'border-sky-200 bg-sky-50',     badge: 'bg-sky-100 text-sky-700',      label: '자유' },
  '배영':   { card: 'border-green-200 bg-green-50',  badge: 'bg-green-100 text-green-700',  label: '배영' },
  '평영':   { card: 'border-purple-200 bg-purple-50', badge: 'bg-purple-100 text-purple-700', label: '평영' },
  '접영':   { card: 'border-orange-200 bg-orange-50', badge: 'bg-orange-100 text-orange-700', label: '접영' },
  '마스터': { card: 'border-gray-700 bg-gray-900',   badge: 'bg-gray-700 text-white',       label: '마스터' },
}

const MASTER_MEDAL_DOT: Record<string, { label: string; dot: string }> = {
  '자유형': { label: '자유형', dot: 'bg-sky-400' },
  '배영':   { label: '배영',   dot: 'bg-green-400' },
  '평영':   { label: '평영',   dot: 'bg-purple-400' },
  '접영':   { label: '접영',   dot: 'bg-orange-400' },
}

export default function StageBoard({ students, completedStrokesMap = {} }: Props) {
  const [selectedStroke, setSelectedStroke] = useState<string | null>(null)

  const grouped = Object.fromEntries(
    STROKES.map(stroke => [stroke, students.filter(s => s.currentStroke === stroke)])
  )

  const selectedStudents = selectedStroke ? (grouped[selectedStroke] ?? []) : []

  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        {STROKES.map(stroke => {
          const style = STROKE_STYLE[stroke]
          const isMaster = stroke === '마스터'
          return (
            <button
              key={stroke}
              onClick={() => setSelectedStroke(selectedStroke === stroke ? null : stroke)}
              className={`text-left rounded-xl p-3 border shadow-sm transition-all ${
                selectedStroke === stroke
                  ? `${style?.card ?? 'bg-white'} ring-1 ring-sky-300`
                  : isMaster
                    ? 'bg-gray-900 border-gray-700 hover:border-gray-500'
                    : 'bg-white border-gray-100 hover:border-sky-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1">
                  {style ? (
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${style.badge}`}>
                      {style.label}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-gray-600">{stroke}</span>
                  )}
                </div>
                <Badge className={`hover:bg-gray-100 text-xs px-1.5 ${isMaster ? 'bg-gray-700 text-white hover:bg-gray-700' : 'bg-gray-100 text-gray-600'}`}>
                  {grouped[stroke]?.length ?? 0}
                </Badge>
              </div>
              <div className="space-y-1">
                {grouped[stroke]?.slice(0, 3).map(s => (
                  <p key={s.id} className={`text-xs truncate ${isMaster ? 'text-gray-300' : 'text-gray-500'}`}>{s.name}</p>
                ))}
                {(grouped[stroke]?.length ?? 0) > 3 && (
                  <p className={`text-xs ${isMaster ? 'text-gray-500' : 'text-gray-400'}`}>+{(grouped[stroke]?.length ?? 0) - 3}명</p>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {selectedStroke && (
        <div className="mt-3 bg-sky-50 rounded-xl p-4 border border-sky-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-sky-700">
              {selectedStroke} · {selectedStudents.length}명
            </h3>
            <button
              onClick={() => setSelectedStroke(null)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              닫기
            </button>
          </div>
          {selectedStudents.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-2">해당 단계 학생 없음</p>
          ) : (
            <div className="space-y-2">
              {selectedStudents.map(s => {
                const completed = completedStrokesMap[s.id] ?? []
                const isMaster = selectedStroke === '마스터'
                return (
                  <Link
                    key={s.id}
                    href={`/director/student/${s.id}`}
                    className={`flex items-center justify-between rounded-lg px-3 py-2.5 border transition-colors ${
                      isMaster
                        ? 'bg-gray-900 border-gray-700 hover:border-gray-500'
                        : 'bg-white border-gray-100 hover:border-sky-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1 flex-wrap">
                        <p className={`text-sm font-semibold ${isMaster ? 'text-white' : 'text-gray-800'}`}>{s.name}</p>
                        {MASTER_STROKES.filter(ms => completed.includes(ms)).map(ms => {
                          const medal = MASTER_MEDAL_DOT[ms]
                          return (
                            <span key={ms} title={medal.label} className={`inline-block w-2.5 h-2.5 rounded-full ${medal.dot}`} />
                          )
                        })}
                      </div>
                      {s.currentStage && (
                        <p className={`text-xs ${isMaster ? 'text-gray-400' : 'text-gray-400'}`}>{s.currentStage}</p>
                      )}
                    </div>
                    <span className={`text-lg leading-none ${isMaster ? 'text-gray-500' : 'text-sky-400'}`}>›</span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
