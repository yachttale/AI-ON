// lib/v2/today.ts — 오늘 학생 카드 모델(순수). 스케줄 필터는 lib/schedule 재사용.
// 오늘 수업 학생을 '내 반(mine)' / '가져오기 가능(assignable: 미배정·타반)'으로 분리.
import { getTodayEntries } from '@/lib/schedule'
import { kstWeekday, kstHour } from './now'
import { selectCardWindow, type StrokeLadderView, type LadderStepView } from './ladder'
import type { Attendance, MetricType, StepKind } from '@/types/v2'

export interface TodayStudent {
  id: string; name: string; grade: string | null; schedule: string | null
  instructor_id: string | null; instructor_name: string | null
}
export interface TodaySession {
  attendance: Attendance | null; laps: number | null
  status: 'pending' | 'confirmed' | null
  inputSource: 'child' | 'instructor' | null
  reportedStepId: string | null
}
export interface TodayCard extends TodayStudent {
  attendance: Attendance | null; laps: number | null; mine: boolean
  status: 'pending' | 'confirmed' | null
  inputSource: 'child' | 'instructor' | null
  reportedStepId: string | null
  reportedStep: { id: string; key: string; ladder_order: number; stroke_key: string; label: string } | null
}
export interface TodayBoards { mine: TodayCard[]; assignable: TodayCard[] }

export function buildTodayCards(
  students: TodayStudent[],
  sessionById: Map<string, TodaySession>,
  currentUserId: string,
  todayJsDay: number = kstWeekday(),
  reportedStepById?: Map<string, { id: string; key: string; ladder_order: number; stroke_key: string; label: string }>,
): TodayBoards {
  const mine: TodayCard[] = []
  const assignable: TodayCard[] = []
  for (const s of students) {
    if (!s.schedule || getTodayEntries(s.schedule, todayJsDay).length === 0) continue
    const sess = sessionById.get(s.id)
    const reportedStepId = sess?.reportedStepId ?? null
    const reportedStep = (reportedStepId && reportedStepById?.get(reportedStepId)) || null
    const card: TodayCard = {
      ...s,
      attendance: sess?.attendance ?? null,
      laps: sess?.laps ?? null,
      mine: s.instructor_id === currentUserId,
      status: sess?.status ?? null,
      inputSource: sess?.inputSource ?? null,
      reportedStepId,
      reportedStep: reportedStep || null,
    }
    if (card.mine) mine.push(card)
    else assignable.push(card)
  }
  return { mine, assignable }
}

// ── 오늘 카드(내 반) 보강: 영법 배지 + 현재 칸 칩 + 오늘 기록 상태 ──────────────

export interface TodayChip {
  id: string; key: string; ladder_order: number
  label: string; step_kind: StepKind; measure_spec: MetricType[]
  is_first_completion: boolean
  passed: boolean          // 통과(전체기간)
  recordedToday: boolean   // 오늘 측정/연습 기록 있음
  passedToday: boolean     // 오늘 통과
}
export interface TodayCardView extends TodayCard {
  classHour: number | null
  focusStrokeKey: string | null
  focusStrokeLabel: string | null
  recentPassed: string[]   // 최근 통과 trail(라벨)
  chips: TodayChip[]
  recordedToday: boolean   // 오늘 기록 ≥1 → 초록
  absent: boolean
}

// 학생의 오늘 첫(또는 유일) 수업 시간(24h). 그룹핑·정렬용.
export function classHourFor(schedule: string | null, todayJsDay: number = kstWeekday()): number | null {
  if (!schedule) return null
  const entries = getTodayEntries(schedule, todayJsDay)
  if (entries.length === 0) return null
  return Math.min(...entries.map(e => e.hour))
}

// 한 장의 오늘 카드 보강(순수). strokes=해당 학생 사다리 뷰, 오늘 기록/통과 id 집합.
export function buildTodayCardView(
  card: TodayCard,
  strokes: StrokeLadderView[],
  todayRecordedIds: Set<string>,
  todayPassedIds: Set<string>,
  todayJsDay: number = kstWeekday(),
): TodayCardView {
  const { focus, steps } = selectCardWindow(strokes, { keepPassedIds: todayPassedIds })
  const chips: TodayChip[] = steps.map((s: LadderStepView) => ({
    id: s.id, key: s.key, ladder_order: s.ladder_order,
    label: s.label, step_kind: s.step_kind, measure_spec: s.measure_spec,
    is_first_completion: s.is_first_completion,
    passed: s.passed, recordedToday: todayRecordedIds.has(s.id), passedToday: todayPassedIds.has(s.id),
  }))
  // 최근 통과 trail: focus 영법 통과 단계 중 ladder_order 큰 순 2개 라벨
  const recentPassed = focus
    ? focus.tracks.flatMap(t => t.steps).filter(s => s.passed)
        .sort((a, b) => b.ladder_order - a.ladder_order).slice(0, 2).map(s => s.label)
    : []
  const absent = card.attendance === '결석'
  const recordedToday = !absent && (todayRecordedIds.size > 0 || todayPassedIds.size > 0)
  return {
    ...card,
    classHour: classHourFor(card.schedule, todayJsDay),
    focusStrokeKey: focus?.stroke_key ?? null,
    focusStrokeLabel: focus?.stroke_label ?? null,
    recentPassed, chips, recordedToday, absent,
  }
}

// 수업 시간별 그룹. 현재 시간 이후(진행/예정)를 먼저, 지난 수업을 뒤로. 각 그룹 내 미입력 먼저.
export interface HourGroup { hour: number | null; cards: TodayCardView[] }
export function groupCardsByHour(cards: TodayCardView[], currentHour: number = kstHour()): HourGroup[] {
  const byHour = new Map<number | null, TodayCardView[]>()
  for (const c of cards) {
    const arr = byHour.get(c.classHour) ?? []
    arr.push(c); byHour.set(c.classHour, arr)
  }
  const groups: HourGroup[] = [...byHour.entries()].map(([hour, cs]) => ({
    hour,
    // 미입력·미결석 먼저, 기록완료/결석 뒤로
    cards: [...cs].sort((a, b) => Number(a.recordedToday || a.absent) - Number(b.recordedToday || b.absent)),
  }))
  // 정렬: 시간 미상(null) 맨 뒤. 그 외 현재 이후 그룹을 앞으로(오름차순), 지난 그룹 뒤로(오름차순).
  return groups.sort((a, b) => {
    if (a.hour === null) return 1
    if (b.hour === null) return -1
    const au = a.hour >= currentHour ? 0 : 1
    const bu = b.hour >= currentHour ? 0 : 1
    return au !== bu ? au - bu : a.hour - b.hour
  })
}
