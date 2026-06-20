// app/v2/layout.tsx — v2 인증 가드 + 모바일 셸
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentProfile } from '@/lib/v2/session'
import LogoutButton from '@/components/LogoutButton'
import V2Nav from './Nav'

export default async function V2Layout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="px-4 py-3 border-b bg-white flex items-center justify-between">
        <Link href="/v2/today" className="font-bold text-gray-800">AI-ON</Link>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{profile?.name ?? ''}</span>
          <LogoutButton />
        </div>
      </header>
      <V2Nav isDirector={profile?.role === 'director'} />
      <main className="p-4">{children}</main>
    </div>
  )
}
