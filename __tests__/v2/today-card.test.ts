import { describe, it, expect } from 'vitest'
import { buildStrokeLadders, selectCardWindow, type LadderInputStep } from '@/lib/v2/ladder'
import { buildTodayCardView, groupCardsByHour, classHourFor, type TodayCard, type TodayCardView } from '@/lib/v2/today'

// 자유형 4단계(s1~s4) + 배영 1단계(s5). s1 통과.
const steps: LadderInputStep[] = [
  { id: 's1', stroke_key: 'freestyle', stroke_label: '자유형', color: null, track_key: 'helper', track_label: '헬퍼', key: 'f1', label: '킥판+헬퍼', ladder_order: 1, step_kind: 'ladder', measure_spec: [], is_first_completion: false },
  { id: 's2', stroke_key: 'freestyle', stroke_label: '자유형', color: null, track_key: 'helper', track_label: '헬퍼', key: 'f2', label: '팔돌리기', ladder_order: 2, step_kind: 'ladder', measure_spec: [], is_first_completion: false },
  { id: 's3', stroke_key: 'freestyle', stroke_label: '자유형', color: null, track_key: 'none', track_label: '맨몸', key: 'f3', label: '호흡1 팔1 15m', ladder_order: 3, step_kind: 'ladder', measure_spec: ['time_sec'], is_first_completion: true },
  { id: 's4', stroke_key: 'freestyle', stroke_label: '자유형', color: null, track_key: 'm50', track_label: '50m', key: 'f4', label: '50m', ladder_order: 4, step_kind: 'repeatable', measure_spec: ['time_sec'], is_first_completion: false },
  { id: 's5', stroke_key: 'backstroke', stroke_label: '배영', color: null, track_key: 'helper', track_label: '헬퍼', key: 'b1', label: '배영 킥판', ladder_order: 5, step_kind: 'ladder', measure_spec: [], is_first_completion: false },
]

describe('selectCardWindow', () => {
  it('현재 칸이 속한 영법(focus)만, 미통과 단계를 창으로', () => {
    const view = buildStrokeLadders(steps, new Set(['s1']), new Map(), new Map())
    const { focus, steps: win } = selectCardWindow(view, { size: 8 })
    expect(focus?.stroke_key).toBe('freestyle')             // s2가 현재 → 자유형
    expect(win.map(s => s.id)).toEqual(['s2', 's3', 's4'])   // s1 통과 제외, 배영 미포함
  })
  it('오늘 통과(keepPassedIds)는 통과해도 창에 남김', () => {
    const view = buildStrokeLadders(steps, new Set(['s1', 's2']), new Map(), new Map())
    const { steps: win } = selectCardWindow(view, { keepPassedIds: new Set(['s2']) })
    expect(win.map(s => s.id)).toEqual(['s2', 's3', 's4'])   // s2는 오늘통과라 잔류, s1은 사라짐
  })
})

const baseCard: TodayCard = {
  id: 'a', name: '김효성', grade: '초4', schedule: '수4시', instructor_id: 'me', instructor_name: '나',
  attendance: null, laps: null, mine: true,
  status: null, inputSource: null, reportedStepId: null, reportedStep: null,
}

describe('buildTodayCardView', () => {
  it('영법 배지·칩·오늘기록 상태를 채움 (수요일=3)', () => {
    const view = buildStrokeLadders(steps, new Set(['s1']), new Map(), new Map())
    const card = buildTodayCardView(baseCard, view, new Set(['s2']), new Set(), 3)
    expect(card.focusStrokeLabel).toBe('자유형')
    expect(card.recentPassed).toEqual(['킥판+헬퍼'])
    expect(card.chips.find(c => c.id === 's2')?.recordedToday).toBe(true)
    expect(card.recordedToday).toBe(true)
    expect(card.classHour).toBe(16)   // 4시 = 오후 16시
    expect(card.absent).toBe(false)
  })
  it('결석이면 absent=true, recordedToday=false', () => {
    const view = buildStrokeLadders(steps, new Set(['s1']), new Map(), new Map())
    const card = buildTodayCardView({ ...baseCard, attendance: '결석' }, view, new Set(['s2']), new Set(), 3)
    expect(card.absent).toBe(true)
    expect(card.recordedToday).toBe(false)
  })
})

describe('groupCardsByHour', () => {
  const mk = (id: string, hour: number | null, done: boolean): TodayCardView => ({
    ...baseCard, id, classHour: hour, focusStrokeKey: null, focusStrokeLabel: null,
    recentPassed: [], chips: [], recordedToday: done, absent: false, masterLaps: null,
  })
  it('시간 오름차순 정렬', () => {
    const groups = groupCardsByHour([mk('p', 14, false), mk('n', 17, true), mk('c', 16, false)])
    expect(groups.map(g => g.hour)).toEqual([14, 16, 17])
  })
  it('같은 시간 그룹 내 미입력이 위로', () => {
    const groups = groupCardsByHour([mk('done', 16, true), mk('todo', 16, false)])
    expect(groups[0].cards.map(c => c.id)).toEqual(['todo', 'done'])
  })
})

describe('classHourFor', () => {
  it('수4시는 수요일(3)에 16시', () => {
    expect(classHourFor('수4시', 3)).toBe(16)
    expect(classHourFor('수4시', 1)).toBe(null) // 월요일엔 수업 없음
  })
})
