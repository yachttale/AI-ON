// lib/v2/kiosk.ts — 키오스크 명단(순수). 강사·오늘 요일·현재(또는 다음) 시간 슬롯, 최대 5명.
import { getTodayEntries } from '@/lib/schedule'
import type { TodayStudent } from './today'

export interface KioskStudent { id: string; name: string; grade: string | null; done: boolean }
export interface KioskSlot { hour: number; students: KioskStudent[] }

export function buildKioskRoster(
  students: TodayStudent[],
  instructorId: string,
  doneIds: Set<string>,
  nowJsDay: number,
  nowHour: number,
  maxPerSlot = 5,
): KioskSlot {
  // 이 강사·오늘 요일 학생의 (학생, 시간) 목록
  const pairs: { s: TodayStudent; hour: number }[] = []
  for (const s of students) {
    if (s.instructor_id !== instructorId || !s.schedule) continue
    for (const e of getTodayEntries(s.schedule, nowJsDay)) pairs.push({ s, hour: e.hour })
  }
  if (pairs.length === 0) return { hour: nowHour, students: [] }
  // 현재 시간 슬롯, 없으면 nowHour 이상 중 가장 가까운 시간, 그것도 없으면 마지막
  const hours = [...new Set(pairs.map(p => p.hour))].sort((a, b) => a - b)
  const target = hours.find(h => h === nowHour) ?? hours.find(h => h >= nowHour) ?? hours[hours.length - 1]
  const inSlot = pairs.filter(p => p.hour === target).map(p => p.s)
  const seen = new Set<string>()
  const students_ = inSlot.filter(s => !seen.has(s.id) && seen.add(s.id))
    .slice(0, maxPerSlot)
    .map(s => ({ id: s.id, name: s.name, grade: s.grade, done: doneIds.has(s.id) }))
  return { hour: target, students: students_ }
}
