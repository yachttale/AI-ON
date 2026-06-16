'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { STROKES, STAGES, ATTENDANCE_OPTIONS, STATUS_OPTIONS, STROKE_MASTERY_TARGETS, MASTER_STROKES, MASTER_DISTANCES } from '@/lib/curriculum'
import type { Stroke } from '@/lib/curriculum'
import type { Attendance, SessionStatus, AbsenceReason } from '@/types/database'
import type { Student, SessionLog } from '@/types/database'

export interface SaveData {
  student_id: string
  instructor_id: string
  attendance: Attendance
  stroke: string | null
  stage: string | null
  status: SessionStatus | null
  memo: string | null
  absence_reason: AbsenceReason | null
  completionSeconds?: number | null
  seconds25?: number | null
  secondsIM?: number | null
  secondsMastery?: number | null
}

const ABSENCE_REASONS: { value: AbsenceReason; label: string }[] = [
  { value: '입원', label: '🏥 입원' },
  { value: '아파서', label: '🤒 아파서' },
  { value: '다른일정', label: '📅 다른일정' },
  { value: '여행', label: '✈️ 여행' },
  { value: '기타', label: '📝 기타' },
]

interface Props {
  student: Student
  latestLog: SessionLog | null | undefined
  existingLog?: SessionLog | null
  instructorId: string
  onSave: (data: SaveData) => Promise<void>
  onCancel: () => void
}

const NEXT_STROKE: Record<string, string> = {
  '자유형': '배영', '배영': '평영', '평영': '접영', '접영': '마스터',
}

function TimeInput({ label, min, setMin, sec, setSec }: {
  label: string
  min: string; setMin: (v: string) => void
  sec: string; setSec: (v: string) => void
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-2 font-medium">
        {label} <span className="text-gray-400 font-normal">(선택)</span>
      </p>
      <div className="flex items-center gap-2">
        <input
          type="number" min="0" max="99" value={min}
          onChange={e => setMin(e.target.value)}
          placeholder="0"
          className="w-16 border border-gray-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-sky-400"
        />
        <span className="text-sm text-gray-500">분</span>
        <input
          type="number" min="0" max="59" value={sec}
          onChange={e => setSec(e.target.value)}
          placeholder="00"
          className="w-16 border border-gray-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-sky-400"
        />
        <span className="text-sm text-gray-500">초</span>
      </div>
    </div>
  )
}

export default function SessionForm({ student, latestLog, existingLog, instructorId, onSave, onCancel }: Props) {
  const base = existingLog ?? null

  // 숙달 통과 시 자동으로 다음 영법으로 진급
  const autoAdvance = !base && latestLog?.stage === '숙달' && latestLog?.status === '통과' && !!latestLog?.stroke
  const nextStroke = (autoAdvance && latestLog?.stroke) ? NEXT_STROKE[latestLog.stroke] : null
  const initStroke = nextStroke ?? base?.stroke ?? latestLog?.stroke ?? '자유형'
  const initStage = (() => {
    if (nextStroke) return STAGES[nextStroke as keyof typeof STAGES]?.[0] ?? ''
    if (initStroke === '마스터') return ''
    return base?.stage ?? latestLog?.stage ?? ''
  })()

  const [attendance, setAttendance] = useState<Attendance>(base?.attendance ?? '출석')
  const [absenceReason, setAbsenceReason] = useState<AbsenceReason | null>(base?.absence_reason ?? null)
  const [stroke, setStroke] = useState(initStroke)
  const [stage, setStage] = useState(initStage)
  const [masterSelections, setMasterSelections] = useState<Set<string>>(() => {
    if (initStroke !== '마스터') return new Set()
    // auto-advance로 마스터가 된 경우 빈 set으로 시작
    if ((base?.stroke ?? latestLog?.stroke) !== '마스터') return new Set()
    const stg = base?.stage ?? latestLog?.stage ?? ''
    if (!stg) return new Set()
    return new Set(stg.split(' / ').filter(Boolean))
  })
  const [status, setStatus] = useState<SessionStatus>(base?.status ?? latestLog?.status ?? '진행중')
  const [memo, setMemo] = useState(base?.memo ?? '')
  const [recMin, setRecMin] = useState('')
  const [recSec, setRecSec] = useState('')
  const [rec25Min, setRec25Min] = useState('')
  const [rec25Sec, setRec25Sec] = useState('')
  const [recIMin, setRecIMin] = useState('')
  const [recISec, setRecISec] = useState('')
  const [recMastMin, setRecMastMin] = useState('')
  const [recMastSec, setRecMastSec] = useState('')
  const [saving, setSaving] = useState(false)

  const showProgress = attendance !== '결석'
  const isMaster = stroke === '마스터'
  const stages = STAGES[stroke as keyof typeof STAGES] ?? []
  const masteryTarget = STROKE_MASTERY_TARGETS[stroke as Stroke]
  const showRecordInput = showProgress && stage === '완주' && !isMaster
  const showMasteryRecord = showProgress && stage === '숙달' && !isMaster

  async function handleSave() {
    setSaving(true)
    const hasCompletion = showRecordInput && (recMin !== '' || recSec !== '')
    const completionSec = hasCompletion
      ? (parseInt(recMin || '0') * 60) + parseInt(recSec || '0')
      : null
    const recordNote = hasCompletion
      ? `기록: ${parseInt(recMin || '0')}분 ${String(parseInt(recSec || '0')).padStart(2, '0')}초`
      : ''

    const has25m = showProgress && !isMaster && stage !== '완주' && stage !== '숙달' && (rec25Min !== '' || rec25Sec !== '')
    const seconds25 = has25m
      ? (parseInt(rec25Min || '0') * 60) + parseInt(rec25Sec || '0')
      : null

    const hasIM = showProgress && isMaster && (recIMin !== '' || recISec !== '')
    const secondsIM = hasIM
      ? (parseInt(recIMin || '0') * 60) + parseInt(recISec || '0')
      : null

    const hasMastery = showMasteryRecord && (recMastMin !== '' || recMastSec !== '')
    const secondsMastery = hasMastery
      ? (parseInt(recMastMin || '0') * 60) + parseInt(recMastSec || '0')
      : null

    const finalMemo = [recordNote, memo.trim()].filter(Boolean).join(' · ')
    await onSave({
      student_id: student.id,
      instructor_id: instructorId,
      attendance,
      stroke: showProgress ? stroke : null,
      stage: showProgress ? (isMaster ? (masterSelections.size > 0 ? Array.from(masterSelections).join(' / ') : null) : stage || null) : null,
      status: showProgress ? status : null,
      memo: finalMemo || null,
      absence_reason: attendance === '결석' ? absenceReason : null,
      completionSeconds: completionSec,
      seconds25,
      secondsIM,
      secondsMastery,
    })
    setSaving(false)
  }

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-2">
        <span className="text-xl font-bold">{student.name}</span>
        <span className="text-sm text-gray-400">{student.schedule}</span>
        {existingLog && <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full">기록 수정 중</span>}
      </div>

      {/* 숙달 통과 후 자동 진급 알림 */}
      {autoAdvance && nextStroke && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 text-sm text-green-700 font-medium">
          🎉 {latestLog?.stroke} 숙달 통과 → <strong>{nextStroke}</strong> 시작
        </div>
      )}

      <div>
        <p className="text-xs text-gray-500 mb-2 font-medium">출석</p>
        <div className="flex gap-2">
          {ATTENDANCE_OPTIONS.map(opt => (
            <button
              key={opt}
              onClick={() => { setAttendance(opt); if (opt !== '결석') setAbsenceReason(null) }}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-colors ${
                attendance === opt
                  ? opt === '출석' ? 'bg-sky-500 text-white'
                    : opt === '지각' ? 'bg-amber-400 text-white'
                    : 'bg-gray-400 text-white'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
        {attendance === '결석' && (
          <div className="mt-3">
            <p className="text-xs text-gray-500 mb-2 font-medium">결석 사유 <span className="text-gray-400 font-normal">(선택)</span></p>
            <div className="flex flex-wrap gap-2">
              {ABSENCE_REASONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setAbsenceReason(absenceReason === value ? null : value)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    absenceReason === value
                      ? 'bg-gray-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {absenceReason === '기타' && (
              <textarea
                value={memo}
                onChange={e => setMemo(e.target.value)}
                placeholder="사유를 입력해주세요"
                rows={2}
                className="w-full mt-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 resize-none"
              />
            )}
          </div>
        )}
      </div>

      {showProgress && (
        <>
          <div>
            <p className="text-xs text-gray-500 mb-2 font-medium">영법</p>
            <div className="flex flex-wrap gap-2">
              {STROKES.map(s => (
                <button
                  key={s}
                  onClick={() => { setStroke(s); setStage(STAGES[s]?.[0] ?? '') }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    stroke === s
                      ? s === '마스터' ? 'bg-purple-600 text-white' : 'bg-sky-500 text-white'
                      : s === '마스터' ? 'bg-gray-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {isMaster ? (
            <div>
              <p className="text-xs text-gray-500 mb-2 font-medium">완성 거리 <span className="text-gray-400 font-normal">(중복 선택 가능)</span></p>
              <div className="space-y-2">
                <div className="grid grid-cols-5 gap-1 text-center">
                  <div />
                  {MASTER_DISTANCES.map(d => (
                    <div key={d} className="text-xs text-gray-400 font-medium pb-1">{d}m</div>
                  ))}
                </div>
                {MASTER_STROKES.map(ms => (
                  <div key={ms} className="grid grid-cols-5 gap-1 items-center">
                    <span className="text-xs font-semibold text-purple-700">{ms}</span>
                    {MASTER_DISTANCES.map(d => {
                      const key = `${ms} ${d}m`
                      const selected = masterSelections.has(key)
                      return (
                        <button
                          key={d}
                          onClick={() => {
                            setMasterSelections(prev => {
                              const next = new Set(prev)
                              if (next.has(key)) next.delete(key)
                              else next.add(key)
                              return next
                            })
                          }}
                          className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                            selected ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {selected ? '✓' : '○'}
                        </button>
                      )
                    })}
                  </div>
                ))}
                {masterSelections.size > 0 && (
                  <p className="text-xs text-purple-600 font-medium pt-1">
                    선택: {Array.from(masterSelections).join(', ')}
                  </p>
                )}
              </div>
            </div>
          ) : stages.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2 font-medium">세부단계</p>
              <div className="flex flex-wrap gap-2">
                {stages.map((s, idx) => {
                  const currentIdx = stages.indexOf(stage)
                  const isCurrent = s === stage
                  const isPast = currentIdx >= 0 && idx < currentIdx
                  return (
                    <button
                      key={s}
                      onClick={() => setStage(s)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isCurrent
                          ? 'bg-indigo-500 text-white'
                          : isPast
                            ? 'bg-indigo-200 text-indigo-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {s}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 완주: 기록 입력 + 인증서 발급 버튼 */}
          {showRecordInput && (
            <div className="space-y-3">
              <TimeInput
                label="완주 기록"
                min={recMin} setMin={setRecMin}
                sec={recSec} setSec={setRecSec}
              />
              <button
                type="button"
                onClick={() => setStatus('통과')}
                className={`w-full py-3 rounded-xl text-sm font-semibold border-2 transition-colors ${
                  status === '통과'
                    ? 'bg-yellow-400 border-yellow-400 text-white'
                    : 'bg-yellow-50 border-yellow-300 text-yellow-700 hover:bg-yellow-100'
                }`}
              >
                {status === '통과' ? '✓ 완주 통과 · 인증서 발급 예정' : '🏅 완주 통과 · 인증서 발급'}
              </button>
            </div>
          )}

          {/* 숙달: 목표 기록 + 숙달 기록 + 다음 영법 진급 버튼 */}
          {showMasteryRecord && (
            <div className="space-y-3">
              {masteryTarget && (
                <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <p className="text-xs text-green-600 font-medium mb-0.5">숙달 목표 기록</p>
                  <p className="text-xl font-bold text-green-700">{masteryTarget}</p>
                  <p className="text-xs text-green-400 mt-0.5">이 기록 달성 시 다음 영법으로 진급합니다</p>
                </div>
              )}
              <TimeInput
                label="숙달 기록"
                min={recMastMin} setMin={setRecMastMin}
                sec={recMastSec} setSec={setRecMastSec}
              />
              <button
                type="button"
                onClick={() => setStatus('통과')}
                className={`w-full py-3 rounded-xl text-sm font-semibold border-2 transition-colors ${
                  status === '통과'
                    ? 'bg-green-500 border-green-500 text-white'
                    : 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
                }`}
              >
                {status === '통과' ? '✓ 숙달 통과 · 다음 영법으로' : '🎯 숙달 통과 · 다음 영법으로'}
              </button>
            </div>
          )}

          {/* 25m 기록 (비마스터, 완주/숙달 단계 제외) */}
          {!isMaster && stage !== '완주' && stage !== '숙달' && (
            <TimeInput
              label="25m 기록"
              min={rec25Min} setMin={setRec25Min}
              sec={rec25Sec} setSec={setRec25Sec}
            />
          )}

          {/* IM 기록 (마스터) */}
          {isMaster && (
            <TimeInput
              label="IM 기록"
              min={recIMin} setMin={setRecIMin}
              sec={recISec} setSec={setRecISec}
            />
          )}

          <div>
            <p className="text-xs text-gray-500 mb-2 font-medium">상태</p>
            <div className="flex gap-2">
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt}
                  onClick={() => setStatus(opt)}
                  className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-colors ${
                    status === opt
                      ? opt === '진행중' ? 'bg-blue-500 text-white' : 'bg-green-500 text-white'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div>
        <p className="text-xs text-gray-500 mb-2 font-medium">메모 (선택)</p>
        <textarea
          value={memo}
          onChange={e => setMemo(e.target.value)}
          placeholder="짧게 입력하세요"
          rows={2}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="outline" className="flex-1" onClick={onCancel}>취소</Button>
        <Button
          className="flex-1 bg-sky-500 hover:bg-sky-600"
          onClick={handleSave}
          disabled={saving || (showProgress && !isMaster && !stage)}
        >
          {saving ? '저장 중...' : existingLog ? '수정' : '저장'}
        </Button>
      </div>
    </div>
  )
}
