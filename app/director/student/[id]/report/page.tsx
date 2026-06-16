import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import PrintButton from '@/components/PrintButton'
import StrokeRadar from '@/components/StrokeRadar'

function kstNow() {
  const now = new Date()
  return new Date(now.getTime() + 9 * 60 * 60 * 1000)
}

export default async function StudentReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const { id } = await params
  const { year: yearStr, month: monthStr } = await searchParams

  const kst = kstNow()
  const year = yearStr ? parseInt(yearStr) : kst.getUTCFullYear()
  const month = monthStr ? parseInt(monthStr) : kst.getUTCMonth() + 1
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`

  const supabase = await createClient()

  const [{ data: student }, { data: monthLogs }, { data: allLogs }] = await Promise.all([
    supabase.from('students').select('*, profiles!instructor_id(name)').eq('id', id).single(),
    supabase
      .from('session_logs')
      .select('*')
      .eq('student_id', id)
      .like('session_date', `${monthPrefix}-%`)
      .order('session_date', { ascending: true }),
    supabase
      .from('session_logs')
      .select('*')
      .eq('student_id', id)
      .order('session_date', { ascending: false }),
  ])

  if (!student) notFound()

  const sessionLogs = monthLogs ?? []
  const allSessionLogs = allLogs ?? []

  // 이달 통계
  const attended = sessionLogs.filter(l => l.attendance === '출석').length
  const late = sessionLogs.filter(l => l.attendance === '지각').length
  const absent = sessionLogs.filter(l => l.attendance === '결석').length
  const total = attended + late + absent
  const attendanceRate = total > 0 ? Math.round(((attended + late) / total) * 100) : 0

  // 이달 달성 단계
  const achievements = sessionLogs.filter(l => l.status === '통과' && l.stage && l.stroke)

  // 누적 통계 (전체)
  const totalAttended = allSessionLogs.filter(l => l.attendance !== '결석').length
  const totalAbsent = allSessionLogs.filter(l => l.attendance === '결석').length
  const totalSessions = allSessionLogs.length
  const totalPassedStages = new Set(
    allSessionLogs.filter(l => l.status === '통과' && l.stage && l.stroke)
      .map(l => `${l.stroke}:${l.stage}`)
  ).size

  // 현재 진도
  const latestLog = allSessionLogs.find(l => l.stroke && l.attendance !== '결석')
  const currentStroke = latestLog?.stroke ?? null
  const currentStage = latestLog?.stage ?? null

  // 이전/다음 달
  const prevDate = new Date(year, month - 2, 1)
  const nextDate = new Date(year, month, 1)
  const isCurrentMonth =
    year === kst.getUTCFullYear() && month === kst.getUTCMonth() + 1

  const prevLink = `/director/student/${id}/report?year=${prevDate.getFullYear()}&month=${prevDate.getMonth() + 1}`
  const nextLink = `/director/student/${id}/report?year=${nextDate.getFullYear()}&month=${nextDate.getMonth() + 1}`

  return (
    <div>
      <style>{`
        @media print {
          .print-hide { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="print-hide flex items-center justify-between mb-4">
        <Link href={`/director/student/${id}`} className="text-sky-500 text-sm">
          ← 학생 페이지로
        </Link>
        <PrintButton />
      </div>

      {/* 월 이동 */}
      <div className="print-hide flex items-center justify-between mb-4">
        <Link
          href={prevLink}
          className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-sky-300"
        >
          ← 이전달
        </Link>
        <span className="text-sm font-semibold text-gray-700">{year}년 {month}월</span>
        {isCurrentMonth ? (
          <div className="w-20" />
        ) : (
          <Link
            href={nextLink}
            className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-sky-300"
          >
            다음달 →
          </Link>
        )}
      </div>

      <div className="space-y-4">

        {/* 헤더 */}
        <div className="bg-gradient-to-br from-sky-500 to-indigo-500 rounded-2xl p-5 text-white">
          <p className="text-xs text-sky-200 tracking-widest mb-1">STARKIDS SWIMMING</p>
          <h1 className="text-base font-bold mb-3">수업 활동 리포트</h1>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-2xl font-bold">{student.name}</p>
              {student.grade && <p className="text-sm text-sky-200">{student.grade}</p>}
            </div>
            <div className="text-right">
              <p className="text-base font-semibold">{year}년 {month}월</p>
              {(student as { profiles?: { name: string } | null }).profiles?.name && (
                <p className="text-xs text-sky-200">
                  담당: {(student as { profiles?: { name: string } | null }).profiles!.name}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 현재 진도 + 누적 통계 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-semibold text-gray-700 mb-3 text-sm">종합 현황</h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-sky-50 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-sky-600">{totalAttended}</p>
              <p className="text-xs text-gray-400 mt-0.5">누적 수업 횟수</p>
            </div>
            <div className="bg-indigo-50 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-indigo-600">{totalPassedStages}</p>
              <p className="text-xs text-gray-400 mt-0.5">총 통과 단계</p>
            </div>
          </div>
          {currentStroke && (
            <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-3">
              <span className="text-xs text-gray-400">현재 진도</span>
              <span className="font-semibold text-gray-800">{currentStroke}</span>
              {currentStage && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="text-gray-600 text-sm">{currentStage}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* 영법 레이더 차트 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-semibold text-gray-700 mb-1 text-sm">영법별 숙련도</h2>
          <p className="text-xs text-gray-400 mb-3">단계 통과 기준, 이전 영법 완료 시 100%</p>
          <StrokeRadar logs={allSessionLogs} />
        </div>

        {/* 이달 출석 현황 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-semibold text-gray-700 mb-3 text-sm">{month}월 출석 현황</h2>
          {total === 0 ? (
            <p className="text-sm text-gray-300 text-center py-4">이번 달 수업 기록 없음</p>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {[
                  { label: '총 수업', value: total, bg: 'bg-gray-50', color: 'text-gray-700' },
                  { label: '출석', value: attended, bg: 'bg-sky-50', color: 'text-sky-600' },
                  { label: '지각', value: late, bg: 'bg-amber-50', color: 'text-amber-500' },
                  { label: '결석', value: absent, bg: 'bg-red-50', color: 'text-red-400' },
                ].map(item => (
                  <div key={item.label} className={`text-center ${item.bg} rounded-xl py-2.5`}>
                    <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{item.label}</p>
                  </div>
                ))}
              </div>
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>출석률</span>
                  <span className={`font-semibold ${attendanceRate >= 80 ? 'text-sky-600' : attendanceRate >= 60 ? 'text-amber-500' : 'text-red-400'}`}>
                    {attendanceRate}%
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${attendanceRate >= 80 ? 'bg-sky-400' : attendanceRate >= 60 ? 'bg-amber-400' : 'bg-red-400'}`}
                    style={{ width: `${attendanceRate}%` }}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* 이달 달성 */}
        {achievements.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
            <h2 className="font-semibold text-green-700 mb-2 text-sm">🎉 {month}월 달성 단계</h2>
            <div className="flex flex-wrap gap-2">
              {achievements.map((a, i) => (
                <span
                  key={i}
                  className="bg-white border border-green-200 text-green-700 text-xs px-3 py-1.5 rounded-full font-semibold"
                >
                  ✓ {a.stroke}-{a.stage}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 수업 기록 상세 */}
        {total > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h2 className="font-semibold text-gray-700 mb-3 text-sm">{month}월 수업 기록</h2>
            <div className="divide-y divide-gray-50">
              {sessionLogs.map(log => (
                <div key={log.id} className="flex items-center gap-2 py-2.5 text-sm">
                  <span className="text-gray-400 text-xs w-10 shrink-0">
                    {log.session_date.slice(5).replace('-', '/')}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 font-medium ${
                    log.attendance === '출석'
                      ? 'bg-sky-100 text-sky-600'
                      : log.attendance === '지각'
                      ? 'bg-amber-100 text-amber-600'
                      : 'bg-red-100 text-red-400'
                  }`}>
                    {log.attendance}
                  </span>
                  <span className="text-gray-700 flex-1 min-w-0">
                    {log.stroke && (
                      <>
                        {log.stroke}
                        {log.stage && <span className="text-gray-400"> · {log.stage}</span>}
                        {log.status === '통과' && (
                          <span className="text-green-500 font-semibold ml-1">✓통과</span>
                        )}
                      </>
                    )}
                  </span>
                  {log.memo && (
                    <span className="text-gray-400 text-xs shrink-0 max-w-[100px] truncate">
                      {log.memo}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 강사 한마디 (인쇄용 여백) */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-dashed border-gray-200">
          <h2 className="font-semibold text-gray-500 mb-2 text-sm">강사 코멘트</h2>
          <div className="h-16 bg-gray-50 rounded-lg" />
        </div>

        <p className="text-center text-xs text-gray-300 pb-2">
          스타키즈 수영장 · {year}년 {month}월 수업 활동 리포트
        </p>
      </div>
    </div>
  )
}
