interface InstructorStat {
  name: string
  total: number
  done: number
}

interface DayRow {
  label: string
  isToday: boolean
  stats: InstructorStat[]
}

interface Props {
  rows: DayRow[]
}

export default function InstructorCompletion({ rows }: Props) {
  if (rows.length === 0 || rows[0].stats.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">강사 계정이 없습니다</p>
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left text-gray-400 font-medium pb-2 pr-3 w-28">날짜</th>
            {rows[0].stats.map(s => (
              <th key={s.name} className="text-center text-gray-500 font-medium pb-2 px-2">{s.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label} className={row.isToday ? 'bg-sky-50 rounded-lg' : ''}>
              <td className={`pr-3 py-2 font-medium whitespace-nowrap ${row.isToday ? 'text-sky-600' : 'text-gray-500'}`}>
                {row.label}
              </td>
              {row.stats.map(inst => {
                const pct = inst.total > 0 ? Math.round((inst.done / inst.total) * 100) : null
                const chip =
                  pct === null ? 'text-gray-300' :
                  pct === 100 ? 'bg-green-100 text-green-700' :
                  pct >= 50  ? 'bg-amber-100 text-amber-700' :
                  pct > 0    ? 'bg-red-100 text-red-600' :
                               'bg-gray-100 text-gray-400'
                return (
                  <td key={inst.name} className="px-2 py-2 text-center">
                    {pct === null ? (
                      <span className="text-gray-300 text-xs">-</span>
                    ) : (
                      <span className={`inline-block px-2 py-1 rounded-lg font-semibold text-xs ${chip}`}>
                        {pct}%
                        <span className="font-normal ml-1 opacity-60">{inst.done}/{inst.total}</span>
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
