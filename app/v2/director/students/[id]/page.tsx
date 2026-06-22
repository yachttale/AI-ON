// app/v2/director/students/[id]/page.tsx — 원장 학생 상세 (다크 어드민)
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getStudentDashboard, getInstructors } from '@/lib/v2/data'
import { relDayLabel, kstToday } from '@/lib/v2/now'
import { StrokeRadar } from '@/app/v2/student/[id]/StrokeRadar'
import { StudentManage } from '@/app/v2/student/[id]/StudentManage'
import { AttendanceCalendar } from '@/app/v2/student/[id]/AttendanceCalendar'

const KIND_STYLE: Record<string, string> = {
  pass: 'bg-blue-500/20 text-blue-300',
  measure: 'bg-amber-500/20 text-amber-300',
  practice: 'bg-white/10 text-white/50',
}

export default async function DirectorStudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [d, instructors] = await Promise.all([
    getStudentDashboard(id),
    getInstructors(),
  ])
  if (!d) notFound()

  const km = d.stats.totalDistanceM / 1000

  return (
    <div className="space-y-4 max-w-2xl">
      <Link href="/v2/director/students" className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors">
        <ArrowLeft size={14} /> 전체 학생
      </Link>

      {/* 프로필 */}
      <div className="bg-[#1a1a2e] rounded-2xl border border-white/8 p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-teal-500/20 flex items-center justify-center text-2xl font-bold text-teal-300">
              {d.name.slice(0, 1)}
            </div>
            <div>
              <p className="text-xl font-bold text-white">{d.name}</p>
              <p className="text-xs text-white/40 mt-0.5">
                {[d.sex, d.ageText, d.grade].filter(Boolean).join(' · ') || '정보 없음'}
              </p>
            </div>
          </div>
          <Link
            href={`/v2/student/${id}/progress`}
            className="text-xs bg-teal-500/20 text-teal-300 rounded-lg px-3 py-1.5 font-semibold hover:bg-teal-500/30 transition-colors"
          >
            진도 편집
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-y-2 text-sm mt-4 pt-4 border-t border-white/8">
          <span className="text-white/40">반</span>
          <span className="text-white/80">{d.schedule ?? '-'}</span>
          <span className="text-white/40">현재 단계</span>
          <span className="text-white/80">{d.currentStepLabel ?? '-'}</span>
          <span className="text-white/40">담당 강사</span>
          <span className="text-white/80">{d.instructorName ?? '미배정'}</span>
          <span className="text-white/40">입문일</span>
          <span className="text-white/80">{d.enrolled_on ?? '-'}</span>
        </div>
      </div>

      {/* 관리 (강사 배정, 반 시간, 퇴원) */}
      <StudentManage
        studentId={id}
        isDirector={true}
        currentInstructorId={d.instructorId}
        currentSchedule={d.schedule}
        instructors={instructors}
        withdrawalStatus={d.withdrawalStatus}
        dark
      />

      {/* 최근 출석 미니 달력 */}
      <AttendanceCalendar attendedDates={d.attendedDates} today={kstToday()} dark />

      {/* 통계 + 레이더 */}
      <div className="bg-[#1a1a2e] rounded-2xl border border-white/8 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white/60">영법별 성취</h3>
        {d.radar.length >= 3
          ? <StrokeRadar data={d.radar} />
          : <p className="text-xs text-white/30 text-center py-6">데이터가 쌓이면 레이더가 표시됩니다</p>}
        <div className="grid grid-cols-3 gap-2 text-center">
          <Tile label="기록 일수" value={`${d.stats.recordDays}`} unit="일" />
          <Tile label="총 거리" value={d.stats.totalDistanceM.toLocaleString()} unit="m" />
          <Tile label="하루 평균" value={d.stats.avgDistanceM.toLocaleString()} unit="m" />
          <Tile label="통과 단계" value={`${d.stats.totalPassed}`} unit="개" accent />
          <Tile label="출석률" value={`${d.stats.attendanceRate}`} unit="%" />
          <Tile label="즐겨한 영법" value={d.stats.favoriteStroke ?? '-'} />
        </div>
        {km >= 1 && (
          <p className="text-[11px] text-white/20 text-center">
            누적 {km.toLocaleString(undefined, { maximumFractionDigits: 1 })}km
          </p>
        )}
      </div>

      {/* 일별 활동 */}
      <div className="bg-[#1a1a2e] rounded-2xl border border-white/8 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white/60">일별 활동 (최근 30일)</h3>
        {d.dailyLog.length === 0 ? (
          <p className="text-xs text-white/30">기록 없음</p>
        ) : (
          <ul className="space-y-2.5">
            {d.dailyLog.map(day => (
              <li key={day.date} className="flex gap-3">
                <span className="text-xs text-white/40 shrink-0 w-12 pt-0.5">{relDayLabel(day.date)}</span>
                <div className="flex flex-wrap gap-1">
                  {day.items.map((it, i) => (
                    <span key={i} className={`px-1.5 py-0.5 rounded text-xs ${KIND_STYLE[it.kind] ?? 'bg-white/10 text-white/50'}`}>
                      {it.label}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Tile({ label, value, unit, accent }: {
  label: string; value: string; unit?: string; accent?: boolean
}) {
  return (
    <div className="rounded-xl bg-white/5 py-2.5 px-1">
      <p className="text-[10px] text-white/30 mb-0.5">{label}</p>
      <p className={`font-bold leading-tight ${accent ? 'text-teal-300' : 'text-white/80'} ${value.length > 4 ? 'text-sm' : 'text-lg'}`}>
        {value}
        {unit && <span className="text-[10px] font-normal text-white/30 ml-0.5">{unit}</span>}
      </p>
    </div>
  )
}
