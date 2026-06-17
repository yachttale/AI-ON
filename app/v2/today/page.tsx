// app/v2/today/page.tsx — 오늘 수업 서버 페이지
import { createClient } from '@/lib/supabase/server'
import { getTodayStudentsRaw } from '@/lib/v2/data'
import { buildTodayCards } from '@/lib/v2/today'
import { TodayCardItem } from './parts'

export default async function TodayPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { students, sessionById } = await getTodayStudentsRaw(user!.id)
  const cards = buildTodayCards(students, sessionById)
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-gray-800">오늘 수업</h2>
      {cards.length === 0
        ? <p className="text-center py-16 text-gray-400 text-sm">오늘 수업이 없습니다</p>
        : cards.map(c => <TodayCardItem key={c.id} card={c} />)}
    </div>
  )
}
