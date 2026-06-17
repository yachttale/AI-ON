// lib/v2/today.ts — 오늘 학생 카드 모델(순수). 스케줄 필터는 lib/schedule 재사용.
// 오늘 수업 학생을 '내 반(mine)' / '가져오기 가능(assignable: 미배정·타반)'으로 분리.
import { getTodayEntries } from '@/lib/schedule'
import type { Attendance } from '@/types/v2'

export interface TodayStudent {
  id: string; name: string; grade: string | null; schedule: string | null
  instructor_id: string | null; instructor_name: string | null
}
export interface TodaySession { attendance: Attendance | null; laps: number | null }
export interface TodayCard extends TodayStudent { attendance: Attendance | null; laps: number | null; mine: boolean }
export interface TodayBoards { mine: TodayCard[]; assignable: TodayCard[] }

export function buildTodayCards(
  students: TodayStudent[],
  sessionById: Map<string, TodaySession>,
  currentUserId: string,
  todayJsDay: number = new Date().getDay(),
): TodayBoards {
  const mine: TodayCard[] = []
  const assignable: TodayCard[] = []
  for (const s of students) {
    if (!s.schedule || getTodayEntries(s.schedule, todayJsDay).length === 0) continue
    const card: TodayCard = {
      ...s,
      attendance: sessionById.get(s.id)?.attendance ?? null,
      laps: sessionById.get(s.id)?.laps ?? null,
      mine: s.instructor_id === currentUserId,
    }
    if (card.mine) mine.push(card)
    else assignable.push(card)
  }
  return { mine, assignable }
}
