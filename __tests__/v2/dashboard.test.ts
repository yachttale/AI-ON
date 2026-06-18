import { describe, it, expect } from 'vitest'
import { buildDashboard } from '@/lib/v2/dashboard'

describe('buildDashboard', () => {
  it('현재 영법별 학생 수 집계', () => {
    const view = buildDashboard(
      { students: [
        { id:'1', name:'가', currentStrokeKey:'free' },
        { id:'2', name:'나', currentStrokeKey:'free' },
        { id:'3', name:'다', currentStrokeKey:'back' },
        { id:'4', name:'라', currentStrokeKey:null },
      ], pendingCount: 2, recentPasses: [] },
      [{ key:'free', label:'자유형' }, { key:'back', label:'배영' }],
    )
    expect(view.strokeBoard.find(s => s.strokeKey==='free')!.count).toBe(2)
    expect(view.strokeBoard.find(s => s.strokeKey==='back')!.count).toBe(1)
    expect(view.pendingCount).toBe(2)
  })

  it('영법 없는 학생(null)은 strokeBoard에 미포함', () => {
    const view = buildDashboard(
      { students: [{ id:'1', name:'가', currentStrokeKey:null }], pendingCount: 0, recentPasses: [] },
      [{ key:'free', label:'자유형' }],
    )
    expect(view.strokeBoard.find(s => s.strokeKey==='free')!.count).toBe(0)
  })

  it('recentPasses 그대로 통과', () => {
    const passes = [{ studentName:'가', stepLabel:'킥판 자유형', passedAt:'2026-06-18T10:00:00Z' }]
    const view = buildDashboard(
      { students: [], pendingCount: 0, recentPasses: passes },
      [],
    )
    expect(view.recentPasses).toEqual(passes)
  })

  it('stalled 미전달 시 빈 배열', () => {
    const view = buildDashboard(
      { students: [], pendingCount: 0, recentPasses: [] },
      [],
    )
    expect(view.stalled).toEqual([])
  })

  it('stalled 전달 시 그대로 반환', () => {
    const view = buildDashboard(
      { students: [], pendingCount: 0, recentPasses: [], stalled: [{ studentName:'나', days:5 }] },
      [],
    )
    expect(view.stalled).toEqual([{ studentName:'나', days:5 }])
  })

  it('strokeMeta 순서 유지', () => {
    const view = buildDashboard(
      { students: [{ id:'1', name:'가', currentStrokeKey:'back' }], pendingCount: 0, recentPasses: [] },
      [{ key:'free', label:'자유형' }, { key:'back', label:'배영' }, { key:'breast', label:'평영' }],
    )
    expect(view.strokeBoard.map(s => s.strokeKey)).toEqual(['free', 'back', 'breast'])
    expect(view.strokeBoard[1].count).toBe(1)
  })
})
