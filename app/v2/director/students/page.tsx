// app/v2/director/students/page.tsx — 원장 전체 학생 명단(원장 전용)
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDirectorRoster } from '@/lib/v2/data'
import { RosterList } from './RosterList'

export default async function DirectorRosterPage({ searchParams }: { searchParams: Promise<{ inst?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  if (profile?.role !== 'director') redirect('/v2/today')

  const { inst } = await searchParams
  const rows = await getDirectorRoster()
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">전체 학생</h2>
        <Link href="/v2/director" className="text-xs text-gray-400">← 원장 현황</Link>
      </div>
      <RosterList rows={rows} initialInst={inst ?? ''} />
    </div>
  )
}
