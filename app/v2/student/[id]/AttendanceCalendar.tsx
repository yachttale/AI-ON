// app/v2/student/[id]/AttendanceCalendar.tsx — 최근 4주(월~토) 출석 미니 달력. 온 날만 색칠.
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
  const [ty, tm, td] = today.split('-').map(Number)
  const base = new Date(ty, tm - 1, td)
  const dow = base.getDay() // 0=일..6=토
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  // 이번 주 월요일에서 3주 전 월요일 = 4주 격자 시작
  const start = new Date(ty, tm - 1, td + mondayOffset - 21)

  const weeks: { date: string; attended: boolean; isToday: boolean; future: boolean }[][] = []
  let attendedCount = 0
  for (let w = 0; w < 4; w++) {
    const row: { date: string; attended: boolean; isToday: boolean; future: boolean }[] = []
    for (let dd = 0; dd < 6; dd++) { // 월~토
      const cell = new Date(start)
      cell.setDate(start.getDate() + w * 7 + dd)
      const date = ymd(cell)
      const isAtt = attended.has(date)
      if (isAtt) attendedCount++
      row.push({ date, attended: isAtt, isToday: date === today, future: date > today })
    }
    weeks.push(row)
  }

  const section = dark ? 'bg-[#1a1a2e] rounded-2xl border border-white/8 p-5 space-y-3' : 'bg-white rounded-2xl border p-4 space-y-3'
  const title = dark ? 'text-sm font-semibold text-white/60' : 'font-bold text-sm text-gray-700'
  const sub = dark ? 'text-white/40' : 'text-gray-400'
  const head = dark ? 'text-white/30' : 'text-gray-400'
  const cellAtt = dark ? 'bg-teal-400/80' : 'bg-teal-500'
  const cellEmpty = dark ? 'bg-white/5' : 'bg-gray-100'
  const cellFuture = dark ? 'bg-white/[0.02]' : 'bg-gray-50'
  const todayRing = dark ? 'ring-2 ring-teal-300' : 'ring-2 ring-teal-500'

  return (
    <section className={section}>
      <div className="flex items-center justify-between">
        <h3 className={title}>최근 출석</h3>
        <span className={`text-xs ${sub}`}>4주 {attendedCount}일</span>
      </div>
      <div className="space-y-1.5">
        <div className="grid grid-cols-6 gap-1.5">
          {DOW.map(d => <div key={d} className={`text-center text-[10px] ${head}`}>{d}</div>)}
        </div>
        {weeks.map((row, wi) => (
          <div key={wi} className="grid grid-cols-6 gap-1.5">
            {row.map(c => (
              <div
                key={c.date}
                title={c.date}
                className={`aspect-square rounded-md ${c.attended ? cellAtt : c.future ? cellFuture : cellEmpty} ${c.isToday ? todayRing : ''}`}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
