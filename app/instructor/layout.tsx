import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LogoutButton from '@/components/LogoutButton'
import InstructorNav from '@/components/InstructorNav'

export default async function InstructorLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, name')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'director') redirect('/director/dashboard')
  if (!profile || profile.role !== 'instructor') redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <h1 className="font-bold text-sky-600">스타키즈 수영</h1>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-300 font-mono mr-1">#{process.env.NEXT_PUBLIC_BUILD_ID}</span>
          <span className="text-sm text-gray-500">{profile?.name}</span>
          <LogoutButton />
        </div>
      </header>
      <InstructorNav />
      <main className="max-w-xl mx-auto px-6 py-6">{children}</main>
    </div>
  )
}
