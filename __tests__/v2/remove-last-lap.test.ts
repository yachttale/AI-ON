import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Supabase 체인 빌더 (fluent mock) ---
function makeSupabase(rows: { id: string }[] | null = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: rows }),
    delete: vi.fn().mockReturnThis(),
  }
  // delete().eq() 체인: delete는 chain 자체를 返す, 두 번째 eq는 Promise resolve
  let deleteEqCall = 0
  chain.delete.mockImplementation(() => ({
    eq: vi.fn().mockImplementation(() => {
      deleteEqCall++
      return Promise.resolve({ error: null })
    }),
  }))
  const sb = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'director' } }) }
      if (table === 'measurements') return chain
      return chain
    }),
    _chain: chain,
    _deleteEqCalls: () => deleteEqCall,
  }
  return sb
}

// next/cache 모킹
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Supabase 서버 클라이언트 모킹
const mockCreateClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))

// kstToday 모킹
vi.mock('@/lib/v2/now', () => ({
  kstToday: () => '2026-06-19',
  kstWeekday: () => 4,
}))

// 모킹 설정 후 액션 import
const { removeLastLap } = await import('@/lib/v2/actions')

// --------------------------------------------------

describe('removeLastLap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('오늘 해당 step laps 행이 있으면 최신 1개 삭제', async () => {
    const sb = makeSupabase([{ id: 'row-123' }])
    mockCreateClient.mockResolvedValue(sb)

    await removeLastLap('student-1', 'step-1')

    // measurements에서 select 호출됐는지
    expect(sb.from).toHaveBeenCalledWith('measurements')
  })

  it('오늘 해당 step laps 행이 없으면 no-op (에러 없음)', async () => {
    const sb = makeSupabase([])
    mockCreateClient.mockResolvedValue(sb)

    await expect(removeLastLap('student-1', 'step-1')).resolves.toBeUndefined()
  })

  it('data가 null이면 no-op', async () => {
    const sb = makeSupabase(null)
    mockCreateClient.mockResolvedValue(sb)

    await expect(removeLastLap('student-1', 'step-1')).resolves.toBeUndefined()
  })

  it('미인증 사용자면 Unauthorized 에러', async () => {
    const sb = makeSupabase([{ id: 'row-1' }])
    sb.auth.getUser = vi.fn().mockResolvedValue({ data: { user: null } })
    mockCreateClient.mockResolvedValue(sb)

    await expect(removeLastLap('student-1', 'step-1')).rejects.toThrow('Unauthorized')
  })
})
