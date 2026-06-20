// app/v2/director/timetable/page.tsx — 일주일 강사 시간표
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getWeeklyTimetable, type TimetableInstructorGroup } from '@/lib/v2/data'

const DAYS: { label: string; jsDay: number }[] = [
  { label: '월', jsDay: 1 }, { label: '화', jsDay: 2 }, { label: '수', jsDay: 3 },
  { label: '목', jsDay: 4 }, { label: '금', jsDay: 5 }, { label: '토', jsDay: 6 },
]

// 월~금 4~8시(16~20), 토 9~11시(21~23)
const WEEKDAY_HOURS = [16, 17, 18, 19, 20]
const SAT_HOURS = [21, 22, 23]
const ALL_HOURS = [...WEEKDAY_HOURS, ...SAT_HOURS]

function hourLabel(h: number) { return `${h > 12 ? h - 12 : h}시` }

const INSTRUCTOR_COLORS = [
  'text-teal-300', 'text-blue-300', 'text-purple-300', 'text-orange-300',
  'text-pink-300', 'text-yellow-300', 'text-cyan-300', 'text-green-300',
]

function Cell({ groups }: { groups: TimetableInstructorGroup[] | undefined }) {
  if (!groups || groups.length === 0) {
    return <div className="min-h-[3rem]" />
  }
  return (
    <div className="space-y-2 p-1">
      {groups.map((g, gi) => (
        <div key={g.instructorId ?? 'none'}>
          <p className={`text-[10px] font-semibold mb-0.5 ${INSTRUCTOR_COLORS[gi % INSTRUCTOR_COLORS.length]}`}>
            {g.instructorName ?? '미배정'}
          </p>
          <div className="space-y-0.5">
            {g.students.map(s => (
              <Link key={s.id} href={`/v2/director/students/${s.id}`}
                className="block text-[11px] text-white/70 hover:text-white leading-tight">
                {s.name}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default async function TimetablePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  if (profile?.role !== 'director') redirect('/v2/today')

  const timetable = await getWeeklyTimetable()

  // 실제 데이터가 있는 시간만 표시
  const activeHours = ALL_HOURS.filter(h =>
    DAYS.some(d => (timetable.get(`${d.jsDay}-${h}`)?.length ?? 0) > 0)
  )

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-white">일주일 시간표</h1>

      <div className="overflow-x-auto rounded-xl border border-white/8">
        <table className="w-full border-collapse text-sm" style={{ minWidth: '600px' }}>
          <thead>
            <tr className="bg-[#0f0f23]">
              <th className="w-12 px-2 py-2.5 text-xs font-semibold text-white/40 text-center border-b border-r border-white/8">시간</th>
              {DAYS.map(d => (
                <th key={d.jsDay} className="px-2 py-2.5 text-xs font-semibold text-white/60 text-center border-b border-r border-white/8 last:border-r-0">
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeHours.map(h => (
              <tr key={h} className="border-b border-white/5 last:border-b-0">
                <td className="px-2 py-2 text-xs font-bold text-white/50 text-center border-r border-white/8 align-top bg-[#0f0f23] whitespace-nowrap">
                  {hourLabel(h)}
                </td>
                {DAYS.map(d => {
                  // 월~금은 16~20시만, 토는 21~23시만 유효
                  const isWeekend = d.jsDay === 6
                  const valid = isWeekend ? SAT_HOURS.includes(h) : WEEKDAY_HOURS.includes(h)
                  const groups = timetable.get(`${d.jsDay}-${h}`)
                  return (
                    <td key={d.jsDay}
                      className={`align-top border-r border-white/5 last:border-r-0 ${valid ? 'bg-[#1a1a2e]' : 'bg-[#0f0f1a]'}`}>
                      {valid ? <Cell groups={groups} /> : null}
                    </td>
                  )
                })}
              </tr>
            ))}
            {activeHours.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-white/30 text-sm">
                  시간표 데이터 없음
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
