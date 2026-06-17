// lib/v2/today.ts — 오늘 학생 카드 모델(순수). 스케줄 필터는 lib/schedule 재사용.
import { getTodayEntries } from '@/lib/schedule'
import type { Attendance } from '@/types/v2'

export interface TodayStudent { id: string; name: string; grade: string | null; schedule: string | null }
export interface TodaySession { attendance: Attendance | null; laps: number | null }
export interface TodayCard extends TodayStudent { attendance: Attendance | null; laps: number | null }

export function buildTodayCards(
  students: TodayStudent[],
  sessionById: Map<string, TodaySession>,
  todayJsDay: number = new Date().getDay(),
): TodayCard[] {
  return students
    .filter(s => s.schedule && getTodayEntries(s.schedule, todayJsDay).length > 0)
    .map(s => ({ ...s, attendance: sessionById.get(s.id)?.attendance ?? null, laps: sessionById.get(s.id)?.laps ?? null }))
}
