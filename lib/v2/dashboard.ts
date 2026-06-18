// lib/v2/dashboard.ts — 원장 대시보드 집계(순수). 확정 데이터 기준.
export interface DashboardInput {
  students: { id: string; name: string; currentStrokeKey: string | null }[]
  pendingCount: number
  recentPasses: { studentName: string; stepLabel: string; passedAt: string }[]
  stalled?: { studentName: string; days: number }[]
}

export interface DashboardView {
  strokeBoard: { strokeKey: string; strokeLabel: string; count: number }[]
  pendingCount: number
  recentPasses: { studentName: string; stepLabel: string; passedAt: string }[]
  stalled: { studentName: string; days: number }[]
}

export function buildDashboard(
  input: DashboardInput,
  strokeMeta: { key: string; label: string }[],
): DashboardView {
  const counts = new Map<string, number>()
  for (const s of input.students) {
    if (s.currentStrokeKey) {
      counts.set(s.currentStrokeKey, (counts.get(s.currentStrokeKey) ?? 0) + 1)
    }
  }
  const strokeBoard = strokeMeta.map(m => ({
    strokeKey: m.key,
    strokeLabel: m.label,
    count: counts.get(m.key) ?? 0,
  }))
  return {
    strokeBoard,
    pendingCount: input.pendingCount,
    recentPasses: input.recentPasses,
    stalled: input.stalled ?? [],
  }
}
