// app/v2/student/[id]/StepControl.tsx — step_kind 분기 입력 섬
'use client'
import { useState, useTransition } from 'react'
import { passStepAction, passLadderCascade, addAttempt, completeCounter, logRepeatable } from '@/lib/v2/actions'
import type { LadderStepView } from '@/lib/v2/ladder'

export function StepControl({ studentId, step }: { studentId: string; step: LadderStepView }) {
  const [pending, start] = useTransition()
  const [time, setTime] = useState(''); const [strokes, setStrokes] = useState('')
  const snap = { id: step.id, key: step.key, ladder_order: step.ladder_order }

  const measures = () => {
    const m: { metric: 'time_sec' | 'stroke_count'; value: number }[] = []
    if (step.measure_spec.includes('time_sec') && time) m.push({ metric: 'time_sec', value: Number(time) })
    if (step.measure_spec.includes('stroke_count') && strokes) m.push({ metric: 'stroke_count', value: Number(strokes) })
    return m
  }

  if (step.step_kind === 'counter') {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className={`flex-1 text-sm ${step.passed ? 'text-gray-400 line-through' : ''}`}>{step.label}</span>
        <span className="text-xs text-gray-500">연습 {step.attemptCount}</span>
        <button disabled={pending} onClick={() => start(() => addAttempt(studentId, step.id))} className="px-2 py-1 rounded bg-gray-100 text-xs">+1</button>
        {!step.passed && <button disabled={pending} onClick={() => start(() => completeCounter(studentId, snap))} className="px-2 py-1 rounded bg-green-500 text-white text-xs">완성</button>}
      </div>
    )
  }
  if (step.step_kind === 'single') {
    // 개별 통과(구르기 등) — cascade 없음, 측정 없음
    return (
      <div className="flex items-center gap-2 py-1">
        <span className={`flex-1 text-sm ${step.passed ? 'text-gray-400 line-through' : ''}`}>{step.label}{step.passSource === 'baseline' && <em className="ml-1 text-[10px] text-gray-400">기준</em>}</span>
        {!step.passed && <button disabled={pending} onClick={() => start(() => passStepAction(studentId, snap))} className="px-3 py-1 rounded bg-blue-500 text-white text-xs">통과</button>}
      </div>
    )
  }
  if (step.step_kind === 'repeatable') {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="flex-1 text-sm">{step.label}</span>
        <button disabled={pending} onClick={() => start(() => logRepeatable(studentId, step.id, 'laps', 1))} className="px-2 py-1 rounded bg-gray-100 text-xs">+1바퀴</button>
        {step.measure_spec.includes('time_sec') && (
          <input value={time} onChange={e => setTime(e.target.value)} onBlur={() => time && start(() => logRepeatable(studentId, step.id, 'time_sec', Number(time)))}
            inputMode="numeric" placeholder="초" className="w-14 border rounded px-1 text-xs" />
        )}
      </div>
    )
  }
  // ladder
  return (
    <div className="flex items-center gap-2 py-1">
      <span className={`flex-1 text-sm ${step.passed ? 'text-gray-400 line-through' : step.isCurrent ? 'font-semibold text-blue-600' : ''}`}>{step.label}{step.passSource === 'baseline' && <em className="ml-1 text-[10px] text-gray-400">기준</em>}</span>
      {step.measure_spec.includes('time_sec') && !step.passed && <input value={time} onChange={e => setTime(e.target.value)} inputMode="numeric" placeholder="초" className="w-12 border rounded px-1 text-xs" />}
      {step.measure_spec.includes('stroke_count') && !step.passed && <input value={strokes} onChange={e => setStrokes(e.target.value)} inputMode="numeric" placeholder="스트로크" className="w-16 border rounded px-1 text-xs" />}
      {!step.passed && <button disabled={pending} onClick={() => start(() => passLadderCascade(studentId, { ...snap, stroke_key: step.stroke_key }, { measures: measures() }))} className="px-3 py-1 rounded bg-blue-500 text-white text-xs">통과</button>}
    </div>
  )
}
