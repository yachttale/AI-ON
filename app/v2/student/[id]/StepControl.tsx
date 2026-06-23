// app/v2/student/[id]/StepControl.tsx — step_kind 분기 입력 섬
'use client'
import { useState, useTransition } from 'react'
import { passLadderCascade, toggleSingleCheck, addAttempt, completeCounter, logRepeatable, recordMeasureToday } from '@/lib/v2/actions'
import type { LadderStepView } from '@/lib/v2/ladder'

export function StepControl({ studentId, step }: { studentId: string; step: LadderStepView }) {
  const [pending, start] = useTransition()
  const [time, setTime] = useState(''); const [strokes, setStrokes] = useState('')
  const [err, setErr] = useState('')
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
    // 개별 체크(구르기·물대포) — 진도 사다리와 무관한 물 적응 지표. 체크/해제 토글.
    return (
      <button disabled={pending} onClick={() => start(() => toggleSingleCheck(studentId, snap, step.passed))}
        className="flex items-center gap-2 py-1 w-full text-left disabled:opacity-60">
        <span className={`w-5 h-5 rounded border flex items-center justify-center text-xs shrink-0 ${step.passed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 text-transparent'}`}>✓</span>
        <span className={`text-sm ${step.passed ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>{step.label}</span>
      </button>
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
  const hasMeasure = step.measure_spec.includes('time_sec') || step.measure_spec.includes('stroke_count')
  const addGrowth = () => {  // 통과 후 성장 재측정
    const m = measures()
    if (m.length === 0) return
    start(async () => { for (const x of m) await recordMeasureToday(studentId, step.id, x.metric, x.value) })
    setTime(''); setStrokes('')
  }
  const doPass = () => start(async () => {
    setErr('')
    const r = await passLadderCascade(studentId, { ...snap, stroke_key: step.stroke_key }, { measures: measures() })
    if (r?.error) setErr(r.error)
  })
  return (
    <div className="py-1">
      <div className="flex items-center gap-2">
        <span className={`flex-1 text-sm ${step.passed ? 'text-gray-400 line-through' : step.isCurrent ? 'font-semibold text-blue-600' : ''}`}>{step.label}{step.passSource === 'baseline' && <em className="ml-1 text-[10px] text-gray-400">기준</em>}</span>
        {step.measure_spec.includes('time_sec') && <input value={time} onChange={e => setTime(e.target.value)} inputMode="numeric" placeholder="초" className="w-12 border rounded px-1 text-xs" />}
        {step.measure_spec.includes('stroke_count') && <input value={strokes} onChange={e => setStrokes(e.target.value)} inputMode="numeric" placeholder="스트로크" className="w-16 border rounded px-1 text-xs" />}
        {!step.passed
          ? <button disabled={pending} onClick={doPass} className="px-3 py-1 rounded bg-blue-500 text-white text-xs">통과</button>
          : hasMeasure && <button disabled={pending} onClick={addGrowth} className="px-2 py-1 rounded bg-gray-100 text-gray-600 text-xs">기록 추가</button>}
      </div>
      {err && <p className="text-red-500 text-xs mt-1 break-all">⚠ {err}</p>}
    </div>
  )
}
