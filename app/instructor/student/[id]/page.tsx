import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import LogTimeline from '@/components/LogTimeline'
import MasterSwimTracker from '@/components/MasterSwimTracker'
import TransferStudentButton from '@/components/TransferStudentButton'
import EditGradeButton from '@/components/EditGradeButton'
import { Badge } from '@/components/ui/badge'
import { getPriorStrokeBonus, MASTER_STROKES } from '@/lib/curriculum'

function fmtDate(d: string): string {
  const [, mm, dd] = d.split('-')
  return `${parseInt(mm)}/${parseInt(dd)}`
}

function fmtRecord(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}분 ${String(sec).padStart(2, '0')}초` : `${sec}초`
}

const ENERGY_STROKES = [
  { stroke: '자유형', max: 25 },
  { stroke: '배영', max: 20 },
  { stroke: '평영', max: 25 },
  { stroke: '접영', max: 25 },
] as const

interface StageMilestone {
  stage: string
  startDate: string
  passedDate: string | null
}

export default async function InstructorStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: student }, { data: logs }, { data: otherInstructors }] = await Promise.all([
    supabase.from('students').select('*').eq('id', id).single(),
    supabase.from('session_logs').select('*').eq('student_id', id).order('session_date', { ascending: false }),
    supabase.from('profiles').select('id, name').eq('role', 'instructor').neq('id', user?.id ?? ''),
  ])

  if (!student) notFound()

  const latestLog = logs?.find(l => l.stroke)
  const rawAttended = logs?.filter(l => l.attendance !== '결석').length ?? 0
  const attendedCount = rawAttended + getPriorStrokeBonus(latestLog?.stroke ?? null, latestLog?.stage ?? null)
  const isMaster = latestLog?.stroke === '마스터'

  const [{ data: records25raw }, { data: imRecordsRaw }] = await Promise.all([
    supabase
      .from('completion_records')
      .select('completed_date, record_seconds, stroke')
      .eq('student_id', id)
      .eq('notes', '25m')
      .not('record_seconds', 'is', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('completion_records')
      .select('completed_date, record_seconds')
      .eq('student_id', id)
      .eq('stroke', 'IM')
      .not('record_seconds', 'is', null)
      .order('created_at', { ascending: false }),
  ])

  const records25 = records25raw ?? []
  const imRecords = imRecordsRaw ?? []

  const loggedStrokes = new Set((logs ?? []).filter(l => l.stroke).map(l => l.stroke as string))
  const ORDERED_S = ['자유형', '배영', '평영', '접영'] as const
  const firstLoggedIdx = ORDERED_S.findIndex(s => loggedStrokes.has(s))

  const energyData = isMaster ? [] : ENERGY_STROKES.map(({ stroke, max }) => {
    const strokeLogs = (logs ?? [])
      .filter(l => l.stroke === stroke)
      .sort((a, b) => a.session_date.localeCompare(b.session_date))
    const attendedLogs = strokeLogs.filter(l => l.attendance !== '결석')
    const count = attendedLogs.length
    const strokeIdx = ORDERED_S.indexOf(stroke as typeof ORDERED_S[number])
    const isPriorCompleted = firstLoggedIdx > 0 && strokeIdx >= 0 && strokeIdx < firstLoggedIdx && !loggedStrokes.has(stroke)
    const milestones: StageMilestone[] = []
    const seenStages = new Set<string>()
    const passedStages = new Set<string>()
    for (const log of strokeLogs) {
      if (!log.stage) continue
      if (!seenStages.has(log.stage)) {
        seenStages.add(log.stage)
        milestones.push({ stage: log.stage, startDate: log.session_date, passedDate: null })
      }
      if (log.status === '통과' && !passedStages.has(log.stage)) {
        passedStages.add(log.stage)
        const m = milestones.find(m => m.stage === log.stage)
        if (m) m.passedDate = log.session_date
      }
    }
    return { stroke, max, count, milestones, records: records25.filter(r => r.stroke === stroke), sessionDates: attendedLogs.map(l => l.session_date), isPriorCompleted }
  })

  return (
    <div>
      <Link href="/instructor/today" className="text-sky-500 text-sm mb-4 block">
        ← 오늘 수업으로
      </Link>

      {/* 학생 정보 */}
      <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-full bg-sky-400 flex items-center justify-center text-white font-bold text-lg">
            {student.name[0]}
          </div>
          <div>
            <h2 className="text-xl font-bold">{student.name}</h2>
            <p className="text-sm text-gray-400">{student.schedule}</p>
            <EditGradeButton studentId={id} currentGrade={student.grade} />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {latestLog ? (
            <>
              <Badge className={`hover:opacity-100 ${isMaster ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'}`}>
                {latestLog.stroke}
              </Badge>
              {latestLog.stage && (
                <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100">{latestLog.stage}</Badge>
              )}
              {!isMaster && latestLog.status && (
                <Badge className={`hover:opacity-100 ${latestLog.status === '통과' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                  {latestLog.status}
                </Badge>
              )}
            </>
          ) : (
            <Badge variant="outline">기록 없음</Badge>
          )}
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-sm text-gray-500">총 {attendedCount}회 수업</p>
          <TransferStudentButton
            studentId={id}
            studentName={student.name}
            instructors={otherInstructors ?? []}
          />
        </div>
      </div>

      {/* 마스터: 수영 거리 트래커 (조회 전용 — 입력은 오늘 수업 세션 폼에서) */}
      {isMaster && <MasterSwimTracker studentId={id} readOnly />}

      {/* 마스터: 영법별 기록 + IM */}
      {isMaster && (records25.length > 0 || imRecords.length > 0) && (
        <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
          <h3 className="font-semibold text-gray-700 mb-4 text-sm">기록</h3>
          <div className="space-y-4">
            {MASTER_STROKES.map(stroke => {
              const recs = records25.filter(r => r.stroke === stroke)
              if (recs.length === 0) return null
              return (
                <div key={stroke}>
                  <p className="text-sm font-semibold text-gray-700 mb-1.5">{stroke}</p>
                  <RecordTable records={recs.slice(0, 5)} />
                </div>
              )
            })}
            {imRecords.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-blue-700 mb-1.5">IM</p>
                <RecordTable records={imRecords.slice(0, 5)} blue />
              </div>
            )}
          </div>
        </div>
      )}

      {/* 일반: 영법별 진도 + 25m 기록 */}
      {!isMaster && energyData.some(d => d.count > 0 || d.milestones.length > 0) && (
        <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
          <h3 className="font-semibold text-gray-700 mb-4 text-sm">영법별 진도</h3>
          <div className="space-y-6">
            {energyData.map(({ stroke, max, count, milestones, records, sessionDates, isPriorCompleted }) => (
              <div key={stroke}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-700">{stroke}</span>
                  <span className="text-xs text-gray-400">{Math.min(count, max)}/{max}회</span>
                </div>
                <div className="grid grid-cols-10 gap-1 mb-2">
                  {Array.from({ length: max }).map((_, i) => {
                    const date = isPriorCompleted ? null : (sessionDates[i] ?? null)
                    const isFilled = isPriorCompleted || date !== null
                    const dayNum = date ? parseInt(date.split('-')[2]) : null
                    return (
                      <div
                        key={i}
                        title={date ? date.slice(5).replace('-', '/') : isPriorCompleted ? '이전 완료' : undefined}
                        className={`aspect-square rounded-sm border-2 flex items-center justify-center ${
                          isPriorCompleted
                            ? 'bg-sky-200 border-sky-100'
                            : isFilled ? 'bg-sky-400 border-sky-300' : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        {dayNum !== null && (
                          <span className="text-[8px] text-white font-bold leading-none">{dayNum}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
                {isPriorCompleted && (
                  <p className="text-xs text-gray-400 mb-2">첫 수업 전 완료</p>
                )}
                {milestones.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {milestones.map(m => (
                      <div key={m.stage} className="flex items-center gap-2 text-xs">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${m.passedDate ? 'bg-green-400' : 'bg-sky-400'}`} />
                        <span className="font-medium text-gray-700 w-14">{m.stage}</span>
                        <span className="text-gray-400">{fmtDate(m.startDate)} 시작</span>
                        {m.passedDate ? (
                          <span className="text-green-600">→ {fmtDate(m.passedDate)} 통과</span>
                        ) : (
                          <span className="text-sky-500 font-medium">진행중</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {records.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-gray-400 mb-1">25m 기록</p>
                    <RecordTable records={records.slice(0, 5)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <h3 className="font-semibold text-gray-700 mb-3 mt-4">수업 기록</h3>
      <LogTimeline logs={logs ?? []} />
    </div>
  )
}

function RecordTable({
  records,
  blue = false,
}: {
  records: { completed_date: string; record_seconds: number }[]
  blue?: boolean
}) {
  return (
    <div className={`rounded-lg p-2 space-y-1 ${blue ? 'bg-blue-50' : 'bg-gray-50'}`}>
      {records.map((r, i) => (
        <div key={i} className="flex justify-between text-xs">
          <span className="text-gray-400">{fmtDate(r.completed_date)}</span>
          <span className={`font-semibold ${blue ? 'text-blue-700' : 'text-gray-800'}`}>
            {fmtRecord(r.record_seconds)}
          </span>
        </div>
      ))}
    </div>
  )
}
