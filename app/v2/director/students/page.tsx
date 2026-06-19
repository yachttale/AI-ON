// app/v2/director/students/page.tsx — 원장 전체 학생 명단 (다크)
import { getDirectorRoster } from '@/lib/v2/data'
import { RosterList } from './RosterList'

export default async function DirectorRosterPage({
  searchParams,
}: {
  searchParams: Promise<{ inst?: string }>
}) {
  const { inst } = await searchParams
  const rows = await getDirectorRoster()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">전체 학생</h1>
        <p className="text-sm text-white/40 mt-0.5">총 {rows.length}명 재원 중</p>
      </div>
      <RosterList rows={rows} initialInst={inst ?? ''} />
    </div>
  )
}
