// app/kiosk/[instructorId]/ChildInput.tsx — 아이 입력 클라이언트 섬 (현재 단계 "했어요" + 바퀴수 + 저장)
'use client'
import { useState, useTransition } from 'react'
import { childReportActivity } from '@/lib/v2/actions'

interface Props {
  studentId: string
  name: string
  currentStepId: string | null
  currentStepLabel: string | null
  siblings: { id: string; label: string }[]
  onActivity: () => void
  onDone: () => void
  onBack: () => void
}

export function ChildInput({ studentId, name, currentStepId, currentStepLabel, siblings, onActivity, onDone, onBack }: Props) {
  const [stepId, setStepId] = useState<string | null>(currentStepId)
  const [laps, setLaps] = useState(0)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  const tap = () => { onActivity() }

  const save = () => {
    if (pending) return
    start(async () => {
      await childReportActivity(studentId, stepId, laps || null)
      setSaved(true)
      setTimeout(onDone, 2500)
    })
  }

  if (saved) {
    return (
      <div className="text-center py-20">
        <p className="text-4xl">잘했어요! 🎉</p>
        <p className="mt-4 text-xl text-slate-600">
          오늘: {currentStepLabel ?? '연습'} · {laps}바퀴
        </p>
      </div>
    )
  }

  return (
    <div onClick={tap}>
      <button onClick={onBack} className="text-lg text-slate-500 mb-2">← 뒤로</button>
      <h1 className="text-3xl font-bold mb-4">{name}, 오늘 뭐 했어요?</h1>

      <div className="rounded-2xl bg-white p-6 shadow text-center">
        <p className="text-2xl font-bold mb-3">{currentStepLabel ?? '오늘 연습'}</p>
        <button
          onClick={() => { setStepId(currentStepId); tap() }}
          className={`rounded-xl px-8 py-4 text-2xl ${stepId === currentStepId ? 'bg-sky-500 text-white' : 'bg-sky-100'}`}
        >
          이거 했어요 ✓
        </button>

        {siblings.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 justify-center">
            {siblings.map(s => (
              <button
                key={s.id}
                onClick={() => { setStepId(s.id); tap() }}
                className={`rounded-lg px-3 py-2 ${stepId === s.id ? 'bg-sky-500 text-white' : 'bg-slate-100'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-2xl bg-white p-6 shadow flex items-center justify-center gap-4">
        <span className="text-2xl">바퀴수</span>
        <button
          onClick={() => { setLaps(l => Math.max(0, l - 1)); tap() }}
          className="rounded-full bg-slate-200 w-14 h-14 text-3xl"
        >
          −
        </button>
        <span className="text-4xl font-bold w-16 text-center">{laps}</span>
        <button
          onClick={() => { setLaps(l => l + 1); tap() }}
          className="rounded-full bg-slate-200 w-14 h-14 text-3xl"
        >
          +
        </button>
      </div>

      <button
        onClick={save}
        disabled={pending}
        className="mt-6 w-full rounded-2xl bg-green-500 text-white py-5 text-2xl font-bold disabled:opacity-50"
      >
        {pending ? '저장 중…' : '다 했어요!'}
      </button>
    </div>
  )
}
