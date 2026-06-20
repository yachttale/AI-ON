// lib/v2/session.ts — 요청 스코프 인증/역할 캐시.
// React cache()로 한 요청(렌더/액션) 안에서 getUser·프로필 조회를 1회로 합침.
// getUser()는 매 호출마다 Supabase Auth 검증 왕복이 일어나므로, 화면당 4회+ → 1회로 줄임.
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export type Role = 'director' | 'instructor'

export const getCurrentUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

export const getCurrentProfile = cache(async (): Promise<{ id: string; name: string; role: Role } | null> => {
  const user = await getCurrentUser()
  if (!user) return null
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('id,name,role').eq('id', user.id).maybeSingle()
  return (data as { id: string; name: string; role: Role } | null) ?? null
})

export const getCurrentRole = cache(async (): Promise<Role | null> => {
  return (await getCurrentProfile())?.role ?? null
})
