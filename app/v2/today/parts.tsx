// app/v2/today/parts.tsx — 오늘 수업 카드(실시간 기록) 클라이언트 섬
'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { recordStepToday, recordMeasureToday, markAbsent, passStepAction, assignToMe, confirmSession, acceptReportedStep, markAbsentForDate, recordStepForDate, recordMeasureForDate } from '@/lib/v2/actions'
import { strokeBadge } from '@/lib/v2/stroke-colors'
import type { MetricType } from '@/types/v2'
import type { TodayCard, TodayCardView, TodayChip } from '@/lib/v2/today'

export function TodayCardItem({ card }: { card: TodayCardView }) {
  const [pending, start] = useTransition()
  const [absent, setAbsent] = useState(card.absent)
  const badge = strokeBadge(card.focusStrokeKey)

  // 오늘 기록 요약(칩 중 오늘 기록/통과된 라벨)
  const recorded = card.chips.filter(c => c.recordedToday || c.passedToday).map(c => c.label)
  const isPending = card.status === 'pending'      // 아이 패드 입력 — 확인 필요
  const isConfirmed = card.status === 'confirmed'

  const bg = absent ? 'bg-red-50 border-red-300'
    : card.recordedToday ? 'bg-green-50 border-l-4 border-l-green-500'
    : isPending ? 'bg-orange-50 border-l-4 border-l-orange-400'
    : 'bg-white'

  return (
    <div className={`rounded-xl border shadow-sm overflow-hidden ${bg}`}>
      <div className={`h-1 w-full ${badge.bar}`} />
      <div className="px-4 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xl font-bold text-gray-900">{card.name}</span>
            <span className="text-xs text-gray-500">{card.schedule ?? ''}</span>
            {card.focusStrokeLabel && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${badge.badge}`}>{card.focusStrokeLabel}</span>
            )}
            {isPending && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-600">미확인</span>
            )}
            {isConfirmed && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-600">확정</span>
            )}
            {card.recentPassed.length > 0 && (
              <span className="text-xs text-gray-400">· {card.recentPassed.join(' ')}</span>
            )}
          </div>
          <Link href={`/v2/student/${card.id}/progress`} className="shrink-0 text-xs text-gray-400 border rounded px-2 py-1">진도→</Link>
        </div>
      </div>

      {/* 아이 패드 입력 — 확인/통과 인정 (pending) */}
      {isPending && (
        <div className="mx-3 mt-2 px-3 py-2 rounded-lg bg-orange-50 border border-orange-100 text-xs text-orange-700 space-y-1">
          <p className="font-semibold text-orange-500">아이 패드 입력 — 확인 필요</p>
          <p>출석 {card.attendance ?? '—'}{card.reportedStep ? ` · 단계 ${card.reportedStep.label}` : ''}{card.laps != null && card.laps > 0 ? ` · ${card.laps}바퀴` : ''}</p>
          <div className="flex gap-2 pt-1">
            {card.reportedStep && (
              <button disabled={pending} onClick={() => start(() => acceptReportedStep(card.id, card.reportedStep!))}
                className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 text-white disabled:opacity-50">{pending ? '…' : '이 단계 통과 인정'}</button>
            )}
            <button disabled={pending} onClick={() => start(() => confirmSession(card.id))}
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-white border text-gray-600 disabled:opacity-50">{pending ? '…' : '확인만'}</button>
          </div>
        </div>
      )}

      {absent ? (
        <p className="px-4 py-6 text-center text-red-500 font-bold">결석</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 px-3 py-3">
          {card.chips.map(chip => <Chip key={chip.id} studentId={card.id} chip={chip} />)}
          {card.chips.length === 0 && <p className="col-span-full text-xs text-gray-400 py-2">표시할 단계가 없습니다</p>}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 px-4 py-2 border-t bg-black/[0.02]">
        <p className="text-xs text-gray-500 truncate">
          {recorded.length > 0 ? <>오늘 기록 <span className="text-gray-700">{recorded.join(', ')}</span></> : <span className="text-gray-300">오늘 기록 없음</span>}
        </p>
        <button
          disabled={pending}
          onClick={() => { const v = !absent; setAbsent(v); start(() => markAbsent(card.id, v)) }}
          className={`shrink-0 px-3 py-1 rounded-lg text-xs font-semibold ${absent ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
          결석
        </button>
      </div>
    </div>
  )
}

function Chip({ studentId, chip }: { studentId: string; chip: TodayChip }) {
  const [pending, start] = useTransition()
  const [rec, setRec] = useState(chip.recordedToday)
  const [passed, setPassed] = useState(chip.passed)
  const [open, setOpen] = useState(false)
  const [time, setTime] = useState(''); const [strokes, setStrokes] = useState('')

  const hasMeasure = chip.measure_spec.length > 0
  const canPass = !passed && (chip.step_kind === 'ladder' || chip.step_kind === 'counter')
  const snap = { id: chip.id, key: chip.key, ladder_order: chip.ladder_order }

  const toggleRecord = () => {
    if (hasMeasure) { setOpen(o => !o); return }      // 측정 스텝: 입력 패널 토글
    const v = !rec; setRec(v); start(() => recordStepToday(studentId, chip.id))
  }
  const saveMeasure = () => {
    const jobs: { metric: MetricType; value: number }[] = []
    if (chip.step_kind === 'repeatable') jobs.push({ metric: 'laps', value: 1 })
    if (chip.measure_spec.includes('time_sec') && time) jobs.push({ metric: 'time_sec', value: Number(time) })
    if (chip.measure_spec.includes('stroke_count') && strokes) jobs.push({ metric: 'stroke_count', value: Number(strokes) })
    if (jobs.length === 0) return
    setRec(true); setOpen(false)
    start(async () => { for (const j of jobs) await recordMeasureToday(studentId, chip.id, j.metric, j.value) })
    setTime(''); setStrokes('')
  }
  const doPass = () => { setPassed(true); start(() => passStepAction(studentId, snap)) }

  const state = passed ? 'bg-gray-200 text-gray-400 line-through' : rec ? 'bg-green-500 text-white' : 'bg-white border'

  return (
    <div className="relative">
      <button disabled={pending} onClick={toggleRecord}
        className={`w-full min-h-[44px] px-2 py-2 rounded-lg text-xs font-medium text-left leading-tight ${state}`}>
        {rec && !passed && '✓ '}{chip.label}
      </button>
      {/* 완주 핀: 오늘 기록됐고 아직 미통과인 ladder/counter */}
      {canPass && rec && !open && (
        <button disabled={pending} onClick={doPass}
          className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-bold shadow">완주</button>
      )}
      {open && hasMeasure && (
        <div className="mt-1 flex items-center gap-1">
          {chip.measure_spec.includes('time_sec') && (
            <input value={time} onChange={e => setTime(e.target.value)} inputMode="numeric" placeholder="초"
              className="w-12 border rounded px-1 py-1 text-xs" />
          )}
          {chip.measure_spec.includes('stroke_count') && (
            <input value={strokes} onChange={e => setStrokes(e.target.value)} inputMode="numeric" placeholder="스트로크"
              className="w-16 border rounded px-1 py-1 text-xs" />
          )}
          <button disabled={pending} onClick={saveMeasure} className="px-2 py-1 rounded bg-blue-500 text-white text-xs">저장</button>
        </div>
      )}
    </div>
  )
}

// 과거 날짜 카드 (어제/그전날) — date-aware 액션 사용
export function PastDayCardItem({ card, date }: { card: TodayCardView; date: string }) {
  const [pending, start] = useTransition()
  const [absent, setAbsent] = useState(card.absent)
  const badge = strokeBadge(card.focusStrokeKey)
  const recorded = card.chips.filter(c => c.recordedToday || c.passedToday).map(c => c.label)

  const bg = absent ? 'bg-red-50 border-red-300'
    : card.recordedToday ? 'bg-green-50 border-l-4 border-l-green-500'
    : 'bg-white'

  return (
    <div className={`rounded-xl border shadow-sm overflow-hidden ${bg}`}>
      <div className={`h-1 w-full ${badge.bar}`} />
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xl font-bold text-gray-900">{card.name}</span>
            <span className="text-xs text-gray-500">{card.schedule ?? ''}</span>
            {card.focusStrokeLabel && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${badge.badge}`}>{card.focusStrokeLabel}</span>
            )}
          </div>
          <Link href={`/v2/student/${card.id}/progress`} className="shrink-0 text-xs text-gray-400 border rounded px-2 py-1">진도→</Link>
        </div>
      </div>
      {absent ? (
        <p className="px-4 py-6 text-center text-red-500 font-bold">결석</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 px-3 py-3">
          {card.chips.map(chip => <PastChip key={chip.id} studentId={card.id} chip={chip} date={date} />)}
          {card.chips.length === 0 && <p className="col-span-full text-xs text-gray-400 py-2">표시할 단계가 없습니다</p>}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-t bg-black/[0.02]">
        <p className="text-xs text-gray-500 truncate">
          {recorded.length > 0
            ? <>기록 <span className="text-gray-700">{recorded.join(', ')}</span></>
            : <span className="text-gray-300">기록 없음</span>}
        </p>
        <button
          disabled={pending}
          onClick={() => { const v = !absent; setAbsent(v); start(() => markAbsentForDate(card.id, v, date)) }}
          className={`shrink-0 px-3 py-1 rounded-lg text-xs font-semibold ${absent ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
          결석
        </button>
      </div>
    </div>
  )
}

function PastChip({ studentId, chip, date }: { studentId: string; chip: TodayChip; date: string }) {
  const [pending, start] = useTransition()
  const [rec, setRec] = useState(chip.recordedToday)
  const [passed, setPassed] = useState(chip.passed)
  const [open, setOpen] = useState(false)
  const [time, setTime] = useState('')
  const [strokes, setStrokes] = useState('')

  const hasMeasure = chip.measure_spec.length > 0
  const canPass = !passed && (chip.step_kind === 'ladder' || chip.step_kind === 'counter')
  const snap = { id: chip.id, key: chip.key, ladder_order: chip.ladder_order }

  const toggleRecord = () => {
    if (hasMeasure) { setOpen(o => !o); return }
    const v = !rec; setRec(v); start(() => recordStepForDate(studentId, chip.id, date))
  }
  const saveMeasure = () => {
    const jobs: { metric: MetricType; value: number }[] = []
    if (chip.step_kind === 'repeatable') jobs.push({ metric: 'laps', value: 1 })
    if (chip.measure_spec.includes('time_sec') && time) jobs.push({ metric: 'time_sec', value: Number(time) })
    if (chip.measure_spec.includes('stroke_count') && strokes) jobs.push({ metric: 'stroke_count', value: Number(strokes) })
    if (jobs.length === 0) return
    setRec(true); setOpen(false)
    start(async () => { for (const j of jobs) await recordMeasureForDate(studentId, chip.id, j.metric, j.value, date) })
    setTime(''); setStrokes('')
  }
  const doPass = () => { setPassed(true); start(() => passStepAction(studentId, snap)) }

  const state = passed ? 'bg-gray-200 text-gray-400 line-through' : rec ? 'bg-green-500 text-white' : 'bg-white border'
  return (
    <div className="relative">
      <button disabled={pending} onClick={toggleRecord}
        className={`w-full min-h-[44px] px-2 py-2 rounded-lg text-xs font-medium text-left leading-tight ${state}`}>
        {rec && !passed && '✓ '}{chip.label}
      </button>
      {canPass && rec && !open && (
        <button disabled={pending} onClick={doPass}
          className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-bold shadow">완주</button>
      )}
      {open && hasMeasure && (
        <div className="mt-1 flex items-center gap-1">
          {chip.measure_spec.includes('time_sec') && (
            <input value={time} onChange={e => setTime(e.target.value)} inputMode="numeric" placeholder="초"
              className="w-12 border rounded px-1 py-1 text-xs" />
          )}
          {chip.measure_spec.includes('stroke_count') && (
            <input value={strokes} onChange={e => setStrokes(e.target.value)} inputMode="numeric" placeholder="스트로크"
              className="w-16 border rounded px-1 py-1 text-xs" />
          )}
          <button disabled={pending} onClick={saveMeasure} className="px-2 py-1 rounded bg-blue-500 text-white text-xs">저장</button>
        </div>
      )}
    </div>
  )
}

// 오늘 수업이지만 미배정·타반 학생 → 내 반으로 가져오기
export function AssignableCardItem({ card }: { card: TodayCard }) {
  const [pending, start] = useTransition()
  return (
    <div className="bg-white rounded-xl border border-dashed flex items-center justify-between px-4 py-3">
      <div>
        <p className="font-medium text-gray-700">{card.name}<span className="ml-1 text-xs text-gray-400">{card.grade ?? ''}</span></p>
        <p className="text-xs text-gray-400">{card.instructor_name ? `현재 ${card.instructor_name} 반` : '미배정'}</p>
      </div>
      <button disabled={pending} onClick={() => start(() => assignToMe(card.id))}
        className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-semibold">{pending ? '…' : '내 반으로'}</button>
    </div>
  )
}
