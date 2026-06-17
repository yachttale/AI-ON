// app/v2/layout.tsx — v2 인증 가드 + 모바일 셸
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import LogoutButton from '@/components/LogoutButton'

export default async function V2Layout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('name').eq('id', user.id).single()
  return (
    <div className="mx-auto max-w-md min-h-screen bg-gray-50">
      <header className="px-4 py-3 border-b bg-white flex items-center justify-between">
        <Link href="/v2/today" className="font-bold text-gray-800">AI-ON 오늘 수업</Link>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{profile?.name ?? ''}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="p-4">{children}</main>
    </div>
  )
}
