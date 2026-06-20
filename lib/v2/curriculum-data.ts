// lib/v2/curriculum-data.ts — 커리큘럼(영법·단계) 캐시 + 현재 영법 계산.
// data 레이어의 리프 모듈(다른 data 모듈에 의존하지 않음).
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createClient as createAnonSupabase } from '@supabase/supabase-js'
import type { SkillStep } from '@/types/v2'
import type { LadderInputStep } from './ladder'

export function computeCurrentStrokeKey(
  allSteps: { id: string; step_kind: string; stroke_key: string }[],
  passedIds: Set<string>,
): string | null {
  if (passedIds.size === 0) return null
  // 기타(etc) 단계는 선택 보너스 — 메인 진행 사다리에서 제외
  const first = allSteps.find(s => s.step_kind === 'ladder' && s.stroke_key !== 'etc' && !passedIds.has(s.id))
  if (first) return first.stroke_key
  return 'master'
}

// 쿠키 없는 Supabase 클라이언트 (커리큘럼 읽기 전용, RLS 미적용 — anon select 정책 019)
function createAnonClient() {
  return createAnonSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// 활성 커리큘럼 전체 단계 조회 — unstable_cache로 cross-request 캐싱 (쿠키 없는 클라이언트)
const _fetchCurriculumSteps = unstable_cache(
  async (): Promise<SkillStep[]> => {
    const supabase = createAnonClient()
    const { data: version } = await supabase
      .from('curriculum_versions').select('id').eq('status', 'active').single()
    if (!version) return []
    const { data, error } = await supabase
      .from('skill_steps').select('*')
      .eq('curriculum_version_id', version.id).eq('is_active', true)
      .order('ladder_order', { ascending: true })
    if (error) throw error
    return (data ?? []) as SkillStep[]
  },
  ['active-curriculum-steps'],
  { tags: ['curriculum'], revalidate: 3600 },
)

// React cache()로 요청 내 중복 호출 제거 (unstable_cache 위에 추가 레이어)
export const getCachedActiveSteps = cache(_fetchCurriculumSteps)

// 활성 커리큘럼의 단계 목록(영법·순서)
export async function getActiveCurriculumSteps(): Promise<SkillStep[]> {
  return getCachedActiveSteps()
}

// getStrokeLadders용: 활성 커리큘럼 단계(LadderInputStep 형태) 캐시 조회
const _fetchLadderSteps = unstable_cache(
  async (): Promise<LadderInputStep[]> => {
    const supabase = createAnonClient()
    const { data: version } = await supabase
      .from('curriculum_versions').select('id').eq('status', 'active').single()
    if (!version) return []
    const { data: rows, error } = await supabase
      .from('skill_steps')
      .select('id,key,label,ladder_order,step_kind,measure_spec,is_first_completion,strokes(key,label,color,display_order),skill_tracks(key,label,display_order)')
      .eq('curriculum_version_id', version.id).eq('is_active', true)
      .order('ladder_order', { ascending: true })
    if (error) throw error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (rows ?? []).map((r: any) => ({
      id: r.id, stroke_key: r.strokes.key, stroke_label: r.strokes.label, color: r.strokes.color,
      track_key: r.skill_tracks?.key ?? '', track_label: r.skill_tracks?.label ?? '',
      key: r.key, label: r.label, ladder_order: r.ladder_order,
      step_kind: r.step_kind, measure_spec: r.measure_spec ?? [], is_first_completion: r.is_first_completion,
    }))
  },
  ['active-ladder-steps'],
  { tags: ['curriculum'], revalidate: 3600 },
)

// React cache()로 요청 내 중복 제거
export const getCachedLadderSteps = cache(_fetchLadderSteps)
