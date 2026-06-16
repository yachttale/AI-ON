import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import LogoutButton from '@/components/LogoutButton'

export default async function DirectorLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, name')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'director') redirect('/instructor/today')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <h1 className="font-bold text-sky-600">스타키즈 수영 · 원장</h1>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-300 font-mono mr-1">#{process.env.NEXT_PUBLIC_BUILD_ID}</span>
          <span className="text-sm text-gray-500">{profile?.name}</span>
          <LogoutButton />
        </div>
      </header>
      <nav className="bg-white border-b px-4 flex gap-6 text-sm sticky top-12 z-10">
        <Link href="/director/dashboard" className="py-3 text-gray-600 hover:text-sky-600 font-medium">대시보드</Link>
        <Link href="/director/students" className="py-3 text-gray-600 hover:text-sky-600 font-medium">학생 관리</Link>
        <Link href="/director/my-today" className="py-3 text-gray-600 hover:text-sky-600 font-medium">내 수업</Link>
        <Link href="/director/my-students" className="py-3 text-gray-600 hover:text-sky-600 font-medium">내 학생</Link>
        <Link href="/director/analytics" className="py-3 text-gray-600 hover:text-sky-600 font-medium">분석</Link>
        <Link href="/director/certificates" className="py-3 text-gray-600 hover:text-sky-600 font-medium">인증서</Link>
        <Link href="/director/standards" className="py-3 text-gray-600 hover:text-sky-600 font-medium">기준표</Link>
      </nav>
      <main className="max-w-xl mx-auto px-6 py-6">{children}</main>
    </div>
  )
}
