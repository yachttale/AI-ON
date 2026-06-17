// app/v2/student/[id]/baseline/BaselineLadder.tsx — 영법별 도달 칸 선택 섬
'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setBaseline } from '@/lib/v2/actions'
import { expandBaselineSteps, type BaselineStep } from '@/lib/v2/baseline'
import type { StrokeLadderView } from '@/lib/v2/ladder'

export function BaselineLadder({ studentId, strokes }: { studentId: string; strokes: StrokeLadderView[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  // 영법별 현재 선택(도달 ladder_order). 초기값 = 기존 baseline/observed 최고 통과 ladder.
  const init: Record<string, number> = {}
  const flat: BaselineStep[] = []
  const snapshots: Record<string, { key: string; ladder_order: number }> = {}
  for (const s of strokes) for (const t of s.tracks) for (const st of t.steps) {
    flat.push({ id: st.id, stroke_key: s.stroke_key, ladder_order: st.ladder_order, step_kind: st.step_kind })
    snapshots[st.id] = { key: st.key, ladder_order: st.ladder_order }
    if (st.step_kind === 'ladder' && st.passed) init[s.stroke_key] = Math.max(init[s.stroke_key] ?? 0, st.ladder_order)
  }
  const [sel, setSel] = useState<Record<string, number>>(init)

  const save = () => {
    const ids = expandBaselineSteps(flat, sel)
    start(async () => { await setBaseline(studentId, ids, snapshots); router.push(`/v2/student/${studentId}`) })
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">영법마다 현재 도달한 단계를 고르면, 그 아래 단계가 모두 통과(기준)로 기록됩니다.</p>
      {strokes.map(s => {
        const ladderSteps = s.tracks.flatMap(t => t.steps.filter(st => st.step_kind === 'ladder'))
        if (ladderSteps.length === 0) return null
        return (
          <section key={s.stroke_key} className="bg-white rounded-xl border p-3">
            <h3 className="font-semibold text-sm mb-2" style={{ color: s.color ?? undefined }}>{s.stroke_label}</h3>
            <div className="flex flex-wrap gap-1">
              <button onClick={() => setSel(p => ({ ...p, [s.stroke_key]: 0 }))}
                className={`px-2 py-1 rounded text-xs ${!sel[s.stroke_key] ? 'bg-gray-300' : 'bg-gray-100'}`}>시작전</button>
              {ladderSteps.map(st => (
                <button key={st.id} onClick={() => setSel(p => ({ ...p, [s.stroke_key]: st.ladder_order }))}
                  className={`px-2 py-1 rounded text-xs ${(sel[s.stroke_key] ?? 0) >= st.ladder_order ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}>{st.label}</button>
              ))}
            </div>
          </section>
        )
      })}
      <button disabled={pending} onClick={save} className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold">{pending ? '저장 중…' : '기준 저장'}</button>
    </div>
  )
}
