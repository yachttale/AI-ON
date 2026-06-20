'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, UserPlus } from 'lucide-react'
import type { DirectorRosterRow } from '@/lib/v2/data'

const STROKE_BADGE: Record<string, string> = {
  beginner: 'bg-gray-500/20 text-gray-300',
  freestyle: 'bg-blue-500/20 text-blue-300',
  backstroke: 'bg-cyan-500/20 text-cyan-300',
  breaststroke: 'bg-green-500/20 text-green-300',
  butterfly: 'bg-purple-500/20 text-purple-300',
  master: 'bg-teal-500/20 text-teal-300',
}

export function RosterList({ rows, initialInst = '' }: { rows: DirectorRosterRow[]; initialInst?: string }) {
  const [q, setQ] = useState('')
  const [inst, setInst] = useState(initialInst)

  const instructors = useMemo(
    () => [...new Set(rows.map(r => r.instructorName).filter(Boolean) as string[])].sort(),
    [rows],
  )

  const filtered = rows.filter(r =>
    (q === '' || r.name.includes(q)) &&
    (inst === '' || r.instructorName === inst),
  )

  return (
    <div className="space-y-4">
      {/* 검색 + 필터 */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="이름 검색"
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-teal-500/50"
          />
        </div>
        <select
          value={inst}
          onChange={e => setInst(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-teal-500/50"
        >
          <option value="" className="bg-[#1a1a2e]">전체 강사</option>
          {instructors.map(n => (
            <option key={n} value={n} className="bg-[#1a1a2e]">{n}</option>
          ))}
        </select>
        <Link
          href="/v2/director/students/new"
          className="flex items-center gap-1.5 px-4 py-2 bg-teal-500/20 text-teal-300 rounded-xl text-sm font-medium hover:bg-teal-500/30 transition-colors whitespace-nowrap"
        >
          <UserPlus size={14} />
          학생 추가
        </Link>
      </div>

      <p className="text-xs text-white/30">{filtered.length}명</p>

      {/* 학생 목록 */}
      <ul className="space-y-2">
        {filtered.map(r => {
          const badgeCls = STROKE_BADGE[r.focusStrokeKey ?? ''] ?? 'bg-white/10 text-white/50'
          return (
            <li key={r.id}>
              <Link
                href={`/v2/director/students/${r.id}`}
                className="flex items-center justify-between bg-white/5 hover:bg-white/10 border border-white/8 rounded-xl px-4 py-3 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white/90">{r.name}</span>
                    {r.focusStrokeLabel && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${badgeCls}`}>
                        {r.focusStrokeLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/40 mt-0.5 truncate">
                    {r.schedule ?? '반 미정'} · {r.instructorName ?? '미배정'}
                    {r.currentStepLabel ? ` · ${r.currentStepLabel}` : ''}
                  </p>
                </div>
                <span className="text-xs text-white/30 tabular-nums shrink-0 ml-2">{r.passedLadder}단계 →</span>
              </Link>
            </li>
          )
        })}
        {filtered.length === 0 && (
          <li className="py-12 text-center text-white/30 text-sm">해당 학생이 없습니다</li>
        )}
      </ul>
    </div>
  )
}
