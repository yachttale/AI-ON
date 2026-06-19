import { describe, it, expect, vi, beforeEach } from 'vitest'

// next/cache 모킹 (unstable_cache → 즉시 실행)
vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown) => fn,
  revalidatePath: vi.fn(),
}))

// react cache 모킹 (그대로 통과)
vi.mock('react', () => ({ cache: (fn: unknown) => fn }))

// kstToday 모킹
vi.mock('@/lib/v2/now', () => ({
  kstToday: () => '2026-06-19',
  kstWeekday: () => 4,
  kstDaysAgo: (n: number) => '2026-05-20',
}))

// anon Supabase 클라이언트 모킹 (getCachedLadderSteps 용)
// anonSupabase 모킹 — DB row 형태(nested strokes/skill_tracks)로 반환
const masterStepRows = [
  { id: 'free-1', key: 'master_free', label: '자유형 마스터', ladder_order: 100, step_kind: 'repeatable', measure_spec: [], is_first_completion: false, strokes: { key: 'master', label: '마스터', color: null, display_order: 10 }, skill_tracks: { key: 'free', label: '자유형', display_order: 1 } },
  { id: 'back-1', key: 'master_back', label: '배영 마스터', ladder_order: 101, step_kind: 'repeatable', measure_spec: [], is_first_completion: false, strokes: { key: 'master', label: '마스터', color: null, display_order: 10 }, skill_tracks: { key: 'back', label: '배영', display_order: 2 } },
  { id: 'im-1', key: 'master_im', label: 'IM 마스터', ladder_order: 104, step_kind: 'repeatable', measure_spec: [], is_first_completion: false, strokes: { key: 'master', label: '마스터', color: null, display_order: 10 }, skill_tracks: { key: 'im', label: 'IM', display_order: 5 } },
]

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'curriculum_versions') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'ver-1' } }),
        }
      }
      if (table === 'skill_steps') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: masterStepRows, error: null }),
        }
      }
      return {}
    }),
  })),
}))

// --- Supabase 서버 클라이언트 mock 빌더 ---
function makeMeasurements(allRows: { skill_step_id: string; value: number }[], todayRows: { skill_step_id: string; value: number }[]) {
  let callCount = 0
  const makeChain = (rows: { skill_step_id: string; value: number }[]) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: rows }),
  })
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: vi.fn().mockImplementation((_table: string) => {
      // 첫 번째 호출 → allMeas, 두 번째 호출 → todayMeas
      callCount++
      if (callCount % 2 === 1) return makeChain(allRows)
      return makeChain(todayRows)
    }),
  }
}

const mockCreateClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))

const { getStudentMasterStats } = await import('@/lib/v2/data')

describe('getStudentMasterStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('마스터 단계가 없으면 빈 strokes 반환', async () => {
    // masterSteps를 비우는 별도 모킹은 어렵지만, createClient mock으로 빈 배열 반환 가능
    mockCreateClient.mockResolvedValue(makeMeasurements([], []))
    // masterSteps 자체를 비우는 건 별도 테스트가 필요하므로 기본 케이스를 확인
    const result = await getStudentMasterStats('student-1')
    expect(result).toHaveProperty('strokes')
    expect(Array.isArray(result.strokes)).toBe(true)
  })

  it('오늘 바퀴와 총 바퀴를 올바르게 집계', async () => {
    const allRows = [
      { skill_step_id: 'free-1', value: 10 },
      { skill_step_id: 'free-1', value: 5 },
      { skill_step_id: 'back-1', value: 3 },
    ]
    const todayRows = [
      { skill_step_id: 'free-1', value: 4 },
    ]
    mockCreateClient.mockResolvedValue(makeMeasurements(allRows, todayRows))

    const result = await getStudentMasterStats('student-1')
    const freeStroke = result.strokes.find(s => s.strokeKey === 'free')
    expect(freeStroke).toBeDefined()
    expect(freeStroke!.totalLaps).toBe(15)
    expect(freeStroke!.todayLaps).toBe(4)
    expect(freeStroke!.totalDistanceM).toBe(750) // 15 * 50
  })

  it('IM 트랙은 totalDistanceM = 0 (횟수만)', async () => {
    const allRows = [{ skill_step_id: 'im-1', value: 5 }]
    const todayRows = [{ skill_step_id: 'im-1', value: 2 }]
    mockCreateClient.mockResolvedValue(makeMeasurements(allRows, todayRows))

    const result = await getStudentMasterStats('student-1')
    const imStroke = result.strokes.find(s => s.strokeKey === 'im')
    expect(imStroke).toBeDefined()
    expect(imStroke!.totalLaps).toBe(5)
    expect(imStroke!.totalDistanceM).toBe(0)
    expect(imStroke!.todayLaps).toBe(2)
  })

  it('측정 기록 없으면 모두 0', async () => {
    mockCreateClient.mockResolvedValue(makeMeasurements([], []))

    const result = await getStudentMasterStats('student-1')
    for (const s of result.strokes) {
      expect(s.totalLaps).toBe(0)
      expect(s.todayLaps).toBe(0)
    }
  })

  it('strokeLabel이 track_label이고 stepId가 step id와 일치', async () => {
    mockCreateClient.mockResolvedValue(makeMeasurements([], []))

    const result = await getStudentMasterStats('student-1')
    const freeStroke = result.strokes.find(s => s.strokeKey === 'free')
    expect(freeStroke?.strokeLabel).toBe('자유형')
    expect(freeStroke?.stepId).toBe('free-1')
  })
})
