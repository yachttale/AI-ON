// app/v2/director/timetable/page.tsx — 일주일 강사 시간표
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getWeeklyTimetable, type TimetableInstructorGroup } from '@/lib/v2/data'

const WEEKDAY_COLS = [
  { label: '월', jsDay: 1 },
  { label: '화', jsDay: 2 },
  { label: '수', jsDay: 3 },
  { label: '목', jsDay: 4 },
  { label: '금', jsDay: 5 },
]

// 주중 시간 ↔ 토요일 시간 쌍
const ROWS = [
  { label: '4시', weekdayHour: 16, satLabel: '9시',  satHour: 21 },
  { label: '5시', weekdayHour: 17, satLabel: '10시', satHour: 22 },
  { label: '6시', weekdayHour: 18, satLabel: '11시', satHour: 23 },
  { label: '7시', weekdayHour: 19, satLabel: null,   satHour: null },
  { label: '8시', weekdayHour: 20, satLabel: null,   satHour: null },
]

const INST_COLORS = [
  'text-teal-300 border-teal-500/30',
  'text-blue-300 border-blue-500/30',
  'text-purple-300 border-purple-500/30',
  'text-orange-300 border-orange-500/30',
  'text-pink-300 border-pink-500/30',
  'text-yellow-300 border-yellow-500/30',
  'text-cyan-300 border-cyan-500/30',
  'text-green-300 border-green-500/30',
]

// 전체 강사 순서를 고정하기 위한 색상 인덱스 매핑
function colorIdx(instructorId: string | null, allIds: string[]): number {
  if (!instructorId) return 7
  const i = allIds.indexOf(instructorId)
  return i < 0 ? 7 : i % INST_COLORS.length
}

function InstructorGroups({
  groups, allIds,
}: {
  groups: TimetableInstructorGroup[] | undefined
  allIds: string[]
}) {
  if (!groups || groups.length === 0) {
    return <div className="min-h-[4rem]" />
  }
  return (
    <div className="flex gap-1.5 p-1.5 min-h-[4rem]">
      {groups.map(g => {
        const ci = colorIdx(g.instructorId, allIds)
        const [textCls, borderCls] = INST_COLORS[ci].split(' ')
        return (
          <div key={g.instructorId ?? 'none'}
            className={`flex-1 min-w-0 border-l-2 pl-1.5 ${borderCls}`}>
            <p className={`text-[10px] font-bold mb-1 truncate ${textCls}`}>
              {g.instructorName ?? '미배정'}
            </p>
            <div className="space-y-0.5">
              {g.students.map(s => (
                <Link key={s.id} href={`/v2/director/students/${s.id}`}
                  className="block text-[11px] text-white/65 hover:text-white leading-tight truncate">
                  {s.name}
                </Link>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default async function TimetablePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  if (profile?.role !== 'director') redirect('/v2/today')

  const timetable = await getWeeklyTimetable()

  // 전체 강사 ID 목록 (색상 고정용, 이름순 정렬)
  const instSet = new Map<string, string>() // id → name
  for (const groups of timetable.values()) {
    for (const g of groups) {
      if (g.instructorId) instSet.set(g.instructorId, g.instructorName ?? '')
    }
  }
  const allInstIds = [...instSet.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'ko'))
    .map(([id]) => id)

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-white">일주일 시간표</h1>

      <div className="overflow-x-auto rounded-xl border border-white/8">
        <table className="w-full border-collapse text-xs" style={{ minWidth: '700px' }}>
          <thead>
            <tr className="bg-[#0f0f23]">
              {/* 시간 헤더 */}
              <th className="w-16 px-2 py-2.5 text-[11px] font-semibold text-white/40 text-center border-b border-r border-white/8 whitespace-nowrap">
                주중 / 토
              </th>
              {/* 월~금 */}
              {WEEKDAY_COLS.map(d => (
                <th key={d.jsDay}
                  className="px-2 py-2.5 text-[11px] font-semibold text-white/60 text-center border-b border-r border-white/8">
                  {d.label}
                </th>
              ))}
              {/* 구분선 + 토 */}
              <th className="px-2 py-2.5 text-[11px] font-semibold text-teal-400/80 text-center border-b border-l-2 border-teal-500/30 bg-teal-500/5">
                토
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(row => (
              <tr key={row.weekdayHour} className="border-b border-white/5 last:border-b-0">
                {/* 시간 레이블 */}
                <td className="px-2 py-1 text-center border-r border-white/8 align-middle bg-[#0f0f23]">
                  <span className="text-[11px] font-bold text-white/50 block">{row.label}</span>
                  {row.satLabel && (
                    <span className="text-[10px] text-teal-400/60 block">/{row.satLabel}</span>
                  )}
                </td>
                {/* 월~금 셀 */}
                {WEEKDAY_COLS.map(d => (
                  <td key={d.jsDay}
                    className="align-top border-r border-white/5 bg-[#1a1a2e]">
                    <InstructorGroups
                      groups={timetable.get(`${d.jsDay}-${row.weekdayHour}`)}
                      allIds={allInstIds}
                    />
                  </td>
                ))}
                {/* 토요일 셀 */}
                <td className="align-top border-l-2 border-teal-500/20 bg-teal-500/5">
                  {row.satHour ? (
                    <InstructorGroups
                      groups={timetable.get(`6-${row.satHour}`)}
                      allIds={allInstIds}
                    />
                  ) : (
                    <div className="min-h-[4rem] bg-[#0d1a18]/40" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
