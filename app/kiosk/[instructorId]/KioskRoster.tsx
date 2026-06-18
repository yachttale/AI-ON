// app/kiosk/[instructorId]/KioskRoster.tsx — 명단 클라이언트 섬 (이름 그리드 + 선택 시 ChildInput + 10초 자동복귀)
'use client'
import { useState, useEffect, useRef } from 'react'
import type { KioskSlot } from '@/lib/v2/kiosk'
import type { CurrentStepInfo } from '@/lib/v2/kiosk-current'
import { ChildInput } from './ChildInput'

interface Props {
  instructorId: string
  slot: KioskSlot
  currentStepMap: Record<string, CurrentStepInfo>
}

export function KioskRoster({ slot, currentStepMap }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 무입력/완료 후 10초 → 명단 복귀
  const armReturn = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setSelectedId(null), 10000)
  }

  useEffect(() => {
    if (selectedId) armReturn()
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [selectedId])

  if (selectedId) {
    const child = slot.students.find(s => s.id === selectedId)!
    const info = currentStepMap[selectedId] ?? { currentStepId: null, currentStepLabel: null, siblings: [] }
    return (
      <ChildInput
        studentId={selectedId}
        name={child.name}
        currentStepId={info.currentStepId}
        currentStepLabel={info.currentStepLabel}
        siblings={info.siblings}
        onActivity={armReturn}
        onDone={() => setSelectedId(null)}
        onBack={() => setSelectedId(null)}
      />
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{slot.hour}:00 수업 — 이름을 눌러요</h1>
      <div className="grid grid-cols-2 gap-4">
        {slot.students.map(s => (
          <button
            key={s.id}
            onClick={() => setSelectedId(s.id)}
            className={`rounded-2xl p-8 text-3xl font-bold shadow ${s.done ? 'bg-green-100 text-green-700' : 'bg-white'}`}
          >
            {s.name}{s.done && ' ✓'}
          </button>
        ))}
        {slot.students.length === 0 && (
          <p className="text-xl text-slate-500">지금 시간 수업이 없어요</p>
        )}
      </div>
    </div>
  )
}
