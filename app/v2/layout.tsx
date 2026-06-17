// app/v2/layout.tsx — v2 인증 가드 + 모바일 셸
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function V2Layout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return (
    <div className="mx-auto max-w-md min-h-screen bg-gray-50">
      <header className="px-4 py-3 border-b bg-white">
        <Link href="/v2/today" className="font-bold text-gray-800">AI-ON 오늘 수업</Link>
      </header>
      <main className="p-4">{children}</main>
    </div>
  )
}
