// app/v2/director/layout.tsx — 원장 전용 풀스크린 다크 어드민 레이아웃
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/v2/session'
import DirectorSidebar from './DirectorSidebar'

export default async function DirectorLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'director') redirect('/v2/today')

  return (
    // 부모 v2 레이아웃 전체를 덮는 fixed 풀스크린 레이어
    <div className="fixed inset-0 z-50 flex bg-[#0f0f1e] text-white overflow-hidden">
      <DirectorSidebar name={profile?.name ?? '원장'} />
      <main className="flex-1 overflow-y-auto p-6">
        {children}
      </main>
    </div>
  )
}
