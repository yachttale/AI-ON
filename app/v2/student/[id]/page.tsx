// app/v2/student/[id]/page.tsx — 학생 리포트 대시보드(레이더 + 지표 한눈에)
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCurrentRole } from '@/lib/v2/session'
import { getStudentDashboard, getInstructors, getStudentMasterStats, computeCurrentStrokeKey, getCachedLadderSteps, getStudentPassedStepIds, getStudentGrowth } from '@/lib/v2/data'
import { relDayLabel, kstToday } from '@/lib/v2/now'
import { StrokeRadar } from './StrokeRadar'
import { FeedbackDraft } from './FeedbackDraft'
import { StudentManage } from './StudentManage'
import { MasterPanel } from './MasterPanel'
import { GrowthChart } from './GrowthChart'
import { AttendanceCalendar } from './AttendanceCalendar'

const KIND_STYLE: Record<string, string> = {
  pass: 'bg-blue-100 text-blue-700',
  measure: 'bg-amber-100 text-amber-700',
  practice: 'bg-gray-100 text-gray-600',
}

export default async function StudentDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const d = await getStudentDashboard(id)
  if (!d) notFound()
  const km = (d.stats.totalDistanceM / 1000)
  const isDirector = (await getCurrentRole()) === 'director'
  const instructors = isDirector ? await getInstructors() : []

  // 마스터 여부 판단 + 기록 성장
  const [allSteps, passedIds, growth] = await Promise.all([
    getCachedLadderSteps(),
    getStudentPassedStepIds(id),
    getStudentGrowth(id),
  ])
  const currentStrokeKey = computeCurrentStrokeKey(allSteps, passedIds)
  const isMaster = currentStrokeKey === 'master'

  return (
    <div className="space-y-4">
      {/* 프로필 헤더 */}
      <section className="bg-white rounded-2xl border p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xl font-bold">{d.name.slice(0, 1)}</div>
            <div>
              <p className="text-xl font-bold text-gray-900">{d.name}</p>
              <p className="text-xs text-gray-500">{[d.sex, d.ageText, d.grade].filter(Boolean).join(' · ') || '정보 없음'}</p>
            </div>
          </div>
          <Link href={`/v2/student/${id}/progress`} className="text-xs text-white bg-blue-500 rounded px-3 py-1.5 font-semibold shrink-0">진도 편집</Link>
        </div>
        <div className="grid grid-cols-2 gap-y-1.5 text-sm mt-4 pt-3 border-t">
          <span className="text-gray-400">반</span><span>{d.schedule ?? '-'}</span>
          <span className="text-gray-400">현재 단계</span><span>{d.currentStepLabel ?? '-'}</span>
          <span className="text-gray-400">담당 강사</span><span>{d.instructorName ?? '미배정'}</span>
          <span className="text-gray-400">입문일</span><span>{d.enrolled_on ?? '-'}</span>
        </div>
      </section>

      <StudentManage studentId={id} isDirector={isDirector} currentInstructorId={d.instructorId}
        currentSchedule={d.schedule} instructors={instructors} withdrawalStatus={d.withdrawalStatus} />

      {/* 최근 출석 미니 달력 */}
      <AttendanceCalendar attendedDates={d.attendedDates} absentDates={d.absentDates} today={kstToday()} />

      {/* 리포트: 마스터 패널 or 레이더 + 지표 타일 */}
      {isMaster
        ? <MasterPanel studentId={id} stats={await getStudentMasterStats(id)} />
        : (
          <section className="bg-white rounded-2xl border p-4 space-y-4">
            <h3 className="font-bold text-sm text-gray-700">영법별 성취</h3>
            {d.radar.length >= 3
              ? <StrokeRadar data={d.radar} />
              : <p className="text-xs text-gray-400 text-center py-6">진도 데이터가 쌓이면 레이더가 표시됩니다</p>}
            <div className="grid grid-cols-3 gap-2 text-center">
              <Tile label="총 기록 일수" value={`${d.stats.recordDays}`} unit="일" />
              <Tile label="총 수영 거리" value={d.stats.totalDistanceM.toLocaleString()} unit="m" />
              <Tile label="하루 평균" value={d.stats.avgDistanceM.toLocaleString()} unit="m" />
              <Tile label="통과 단계" value={`${d.stats.totalPassed}`} unit="개" accent />
              <Tile label="출석률" value={`${d.stats.attendanceRate}`} unit="%" />
              <Tile label="즐겨한 영법" value={d.stats.favoriteStroke ?? '-'} />
            </div>
            {km >= 1 && <p className="text-[11px] text-gray-300 text-center">누적 {km.toLocaleString(undefined, { maximumFractionDigits: 1 })}km</p>}
          </section>
        )}

      {/* 기록 성장 — 측정 단계 기록 추이 */}
      {growth.length > 0 && (
        <section className="bg-white rounded-2xl border p-4 space-y-4">
          <h3 className="font-bold text-sm text-gray-700">기록 성장</h3>
          {growth.map(g => (
            <div key={`${g.stepId}-${g.metric}`} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-gray-700">{g.strokeLabel} · {g.stepLabel}</span>
                <span className="text-[11px] text-gray-400">
                  최고 <span className="text-gray-700 font-semibold">{g.best}{g.unit}</span> · 최근 {g.latest}{g.unit}
                </span>
              </div>
              {g.points.length >= 2
                ? <GrowthChart points={g.points} lowerIsBetter={g.lowerIsBetter} color={g.color ?? '#6366f1'} />
                : <p className="text-[11px] text-gray-400">{g.latest}{g.unit} · 기록 1회 — 다음 측정부터 추이가 표시됩니다</p>}
            </div>
          ))}
          <p className="text-[11px] text-gray-300">선이 위로 갈수록 더 좋은 기록입니다</p>
        </section>
      )}

      {/* 부모 피드백 초안 */}
      <section className="bg-white rounded-2xl border p-4 space-y-2">
        <h3 className="font-bold text-sm text-gray-700">부모 피드백 초안</h3>
        <FeedbackDraft initial={d.feedbackDraft} />
      </section>

      {/* 일별 활동 */}
      <section className="bg-white rounded-2xl border p-4 space-y-3">
        <h3 className="font-bold text-sm text-gray-700">일별 활동 (최근 30일)</h3>
        {d.dailyLog.length === 0
          ? <p className="text-xs text-gray-400">기록 없음</p>
          : <ul className="space-y-2.5">
              {d.dailyLog.map(day => (
                <li key={day.date} className="flex gap-3">
                  <span className="text-xs text-gray-500 font-medium shrink-0 w-12 pt-0.5">{relDayLabel(day.date)}</span>
                  <div className="flex flex-wrap gap-1">
                    {day.items.map((it, i) => (
                      <span key={i} className={`px-1.5 py-0.5 rounded text-xs ${KIND_STYLE[it.kind]}`}>{it.label}</span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>}
      </section>

      <p className="text-center text-[11px] text-gray-300">성장 그래프는 데이터 누적 후 제공됩니다</p>
    </div>
  )
}

function Tile({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-gray-50 py-2.5 px-1">
      <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
      <p className={`font-bold leading-tight ${accent ? 'text-indigo-600' : 'text-gray-800'} ${value.length > 4 ? 'text-sm' : 'text-lg'}`}>
        {value}{unit && <span className="text-[10px] font-normal text-gray-400 ml-0.5">{unit}</span>}
      </p>
    </div>
  )
}
