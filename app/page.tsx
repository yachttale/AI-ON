import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // v2 메인 — 강사·원장 모두 오늘 수업 화면으로 (원장도 수업)
  redirect('/v2/today')
}
