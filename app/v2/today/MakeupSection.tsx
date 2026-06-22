// app/v2/today/MakeupSection.tsx — 오늘의 보강: 검색·추가 + 보강 카드(미배정→가져가기→기록)
'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addMakeup, claimMakeup, removeMakeup } from '@/lib/v2/actions'
import { TodayCardItem } from './parts'
import type { TodayCardView } from '@/lib/v2/today'

export function MakeupSection({ makeups, searchStudents }: {
  makeups: TodayCardView[]
  searchStudents: { id: string; name: string; grade: string | null }[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [q, setQ] = useState('')

  const query = q.trim()
  const matches = query ? searchStudents.filter(s => s.name.includes(query)).slice(0, 8) : []
  const run = (fn: () => Promise<void>) => start(async () => { await fn(); router.refresh() })

  return (
    <section className="space-y-3 bg-amber-50/70 border border-amber-200 rounded-2xl p-4">
      <h2 className="text-base font-bold text-amber-700">
        오늘의 보강{makeups.length > 0 && <span className="text-amber-400 font-normal text-sm"> ({makeups.length})</span>}
      </h2>

      {/* 검색 + 추가 */}
      <div>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="보강 학생 이름 검색"
          className="w-full bg-white border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-amber-400"
        />
        {matches.length > 0 && (
          <ul className="mt-1 bg-white border rounded-xl divide-y overflow-hidden">
            {matches.map(s => (
              <li key={s.id} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-gray-700">{s.name}<span className="ml-1 text-xs text-gray-400">{s.grade ?? ''}</span></span>
                <button disabled={pending} onClick={() => run(async () => { await addMakeup(s.id); setQ('') })}
                  className="text-xs font-semibold bg-amber-500 text-white rounded-lg px-3 py-1.5 disabled:opacity-50">보강 추가</button>
              </li>
            ))}
          </ul>
        )}
        {query && matches.length === 0 && (
          <p className="mt-1 text-xs text-gray-400 px-1">검색 결과 없음 (이미 오늘 수업/보강 중이면 표시되지 않습니다)</p>
        )}
      </div>

      {/* 보강 카드 */}
      {makeups.length === 0 ? (
        <p className="text-xs text-amber-600/70">오늘 보강이 없습니다. 위에서 학생을 검색해 추가하세요.</p>
      ) : (
        <div className="space-y-3">
          {makeups.map(c => c.instructor_id ? (
            <div key={c.id} className="space-y-1">
              <div className="flex items-center justify-between px-1">
                <p className="text-xs font-medium text-amber-700">수업: {c.instructor_name ?? '—'} 강사</p>
                <button disabled={pending} onClick={() => run(() => removeMakeup(c.id))}
                  className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-50">보강 취소</button>
              </div>
              <TodayCardItem card={c} />
            </div>
          ) : (
            <div key={c.id} className="bg-white rounded-xl border border-dashed border-amber-300 flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium text-gray-700">{c.name}<span className="ml-1 text-xs text-gray-400">{c.grade ?? ''}</span></p>
                <p className="text-xs text-amber-500">미배정 보강 — 수업할 강사가 가져가세요</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button disabled={pending} onClick={() => run(() => claimMakeup(c.id))}
                  className="text-xs font-semibold bg-amber-500 text-white rounded-lg px-3 py-1.5 disabled:opacity-50">내 반으로</button>
                <button disabled={pending} onClick={() => run(() => removeMakeup(c.id))}
                  className="text-xs text-gray-400 rounded-lg px-2 py-1.5">취소</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
