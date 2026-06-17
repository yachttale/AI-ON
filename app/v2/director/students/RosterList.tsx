// app/v2/director/students/RosterList.tsx — 전체 학생 검색·강사 필터·개별 진입
'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { strokeBadge } from '@/lib/v2/stroke-colors'
import type { DirectorRosterRow } from '@/lib/v2/data'

export function RosterList({ rows }: { rows: DirectorRosterRow[] }) {
  const [q, setQ] = useState('')
  const [inst, setInst] = useState('')
  const instructors = useMemo(
    () => [...new Set(rows.map(r => r.instructorName).filter(Boolean) as string[])].sort(),
    [rows],
  )
  const filtered = rows.filter(r =>
    (q === '' || r.name.includes(q)) &&
    (inst === '' || r.instructorName === inst),
  )
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="이름 검색"
          className="flex-1 border rounded-lg px-3 py-2 text-sm" />
        <select value={inst} onChange={e => setInst(e.target.value)} className="border rounded-lg px-2 text-sm bg-white">
          <option value="">전체 강사</option>
          {instructors.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <p className="text-xs text-gray-400">{filtered.length}명</p>
      <ul className="space-y-2">
        {filtered.map(r => {
          const badge = strokeBadge(r.focusStrokeKey)
          return (
            <li key={r.id}>
              <Link href={`/v2/student/${r.id}`} className="flex items-center justify-between bg-white rounded-xl border px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800">{r.name}</span>
                    {r.focusStrokeLabel && <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${badge.badge}`}>{r.focusStrokeLabel}</span>}
                  </div>
                  <p className="text-xs text-gray-400 truncate">
                    {r.schedule ?? '반 미정'} · {r.instructorName ?? '미배정'}{r.currentStepLabel ? ` · ${r.currentStepLabel}` : ''}
                  </p>
                </div>
                <span className="text-xs text-gray-400 tabular-nums shrink-0 ml-2">{r.passedLadder}단계</span>
              </Link>
            </li>
          )
        })}
        {filtered.length === 0 && <li className="text-center py-8 text-gray-400 text-sm">해당 학생이 없습니다</li>}
      </ul>
    </div>
  )
}
