const DAYS = '월화수목금토일'

function toHour24(h: number): number {
  // 수영장 수업 시간은 1~9시가 모두 오후 (10~12시만 오전)
  return h <= 9 ? h + 12 : h
}

export function parseSchedule(schedule: string): { day: string; hour: number }[] {
  const results: { day: string; hour: number }[] = []
  const pattern = new RegExp(`([${DAYS}]+)(\\d+)시`, 'g')
  let match: RegExpExecArray | null

  while ((match = pattern.exec(schedule)) !== null) {
    const hour = toHour24(parseInt(match[2]))
    for (const char of match[1]) {
      if (DAYS.includes(char)) results.push({ day: char, hour })
    }
  }

  return results
}

const DAY_TO_JS: Record<string, number> = {
  '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6,
}

export function getTodayEntries(
  schedule: string,
  todayJsDay: number = new Date().getDay()
): { day: string; hour: number }[] {
  return parseSchedule(schedule).filter(e => DAY_TO_JS[e.day] === todayJsDay)
}

export function getEntriesForDate(schedule: string, date: Date) {
  return getTodayEntries(schedule, date.getDay())
}

export function formatScheduleDisplay(schedule: string): string {
  const entries = parseSchedule(schedule)
  const grouped = new Map<number, string[]>()

  for (const e of entries) {
    if (!grouped.has(e.hour)) grouped.set(e.hour, [])
    grouped.get(e.hour)!.push(e.day)
  }

  return Array.from(grouped.entries())
    .map(([hour, days]) => `${days.join(',')} ${hour}:00`)
    .join(' / ')
}
