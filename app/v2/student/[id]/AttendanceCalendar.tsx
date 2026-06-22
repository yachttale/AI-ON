// app/v2/student/[id]/AttendanceCalendar.tsx — 이번 달(캘린더 월) 출석 미니 달력. 월~토, 온 날만 색칠.
const DOW = ['월', '화', '수', '목', '금', '토']

function ymd(dt: Date) {
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function AttendanceCalendar({ attendedDates, today, dark }: {
  attendedDates: string[]; today: string; dark?: boolean
}) {
  const attended = new Set(attendedDates)
  const [ty, tm] = today.split('-').map(Number) // 연, 월(1~12)
  const firstOfMonth = new Date(ty, tm - 1, 1)
  const daysInMonth = new Date(ty, tm, 0).getDate()

  // 1일이 속한 주의 월요일에서 시작(앞 칸은 전월 패딩)
  const firstDow = firstOfMonth.getDay() // 0=일..6=토
  const gridStart = new Date(ty, tm - 1, 1 + (firstDow === 0 ? -6 : 1 - firstDow))
  // 말일이 속한 주까지 → 필요한 주 수(보통 5, 가끔 6)
  const lastDow = new Date(ty, tm - 1, daysInMonth).getDay()
  const lastMonday = new Date(ty, tm - 1, daysInMonth + (lastDow === 0 ? -6 : 1 - lastDow))
  const weekCount = Math.round((lastMonday.getTime() - gridStart.getTime()) / (7 * 86400000)) + 1

  const weeks: { date: string; day: number; inMonth: boolean; attended: boolean; isToday: boolean; future: boolean }[][] = []
  let attendedCount = 0
  for (let w = 0; w < weekCount; w++) {
    const row: { date: string; day: number; inMonth: boolean; attended: boolean; isToday: boolean; future: boolean }[] = []
    for (let dd = 0; dd < 6; dd++) { // 월~토(일요일 제외)
      const cell = new Date(gridStart)
      cell.setDate(gridStart.getDate() + w * 7 + dd)
      const date = ymd(cell)
      const inMonth = cell.getMonth() === tm - 1
      const isAtt = inMonth && attended.has(date)
      if (isAtt) attendedCount++
      row.push({ date, day: cell.getDate(), inMonth, attended: isAtt, isToday: date === today, future: date > today })
    }
    weeks.push(row)
  }

  const section = dark ? 'bg-[#1a1a2e] rounded-2xl border border-white/8 p-5 space-y-3' : 'bg-white rounded-2xl border p-4 space-y-3'
  const title = dark ? 'text-sm font-semibold text-white/60' : 'font-bold text-sm text-gray-700'
  const sub = dark ? 'text-white/40' : 'text-gray-400'
  const head = dark ? 'text-white/30' : 'text-gray-400'
  const attCls = dark ? 'bg-teal-400/80 text-gray-900 font-semibold' : 'bg-teal-500 text-white font-semibold'
  const emptyCls = dark ? 'bg-white/5 text-white/40' : 'bg-gray-100 text-gray-500'
  const futureCls = dark ? 'bg-white/[0.02] text-white/20' : 'bg-gray-50 text-gray-300'
  const todayRing = dark ? 'ring-2 ring-teal-300' : 'ring-2 ring-teal-500'

  return (
    <section className={section}>
      <div className="flex items-center justify-between">
        <h3 className={title}>{tm}월 출석</h3>
        <span className={`text-xs ${sub}`}>{attendedCount}일</span>
      </div>
      <div className="space-y-1">
        <div className="grid grid-cols-6 gap-1">
          {DOW.map(d => <div key={d} className={`text-center text-[10px] ${head}`}>{d}</div>)}
        </div>
        {weeks.map((row, wi) => (
          <div key={wi} className="grid grid-cols-6 gap-1">
            {row.map(c => (
              <div
                key={c.date}
                className={`aspect-square rounded-md flex items-center justify-center text-[10px] ${
                  !c.inMonth ? 'opacity-0'
                    : c.attended ? attCls
                    : c.future ? futureCls
                    : emptyCls
                } ${c.isToday ? todayRing : ''}`}
              >
                {c.inMonth ? c.day : ''}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
