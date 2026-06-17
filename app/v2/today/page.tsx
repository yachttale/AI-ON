// app/v2/today/page.tsx — 오늘 수업 서버 페이지 (내 반 + 가져오기)
import { createClient } from '@/lib/supabase/server'
import { getTodayStudentsRaw } from '@/lib/v2/data'
import { buildTodayCards } from '@/lib/v2/today'
import { TodayCardItem, AssignableCardItem } from './parts'

export default async function TodayPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { students, sessionById } = await getTodayStudentsRaw()
  const { mine, assignable } = buildTodayCards(students, sessionById, user!.id)
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-gray-800">오늘 내 수업</h2>
        {mine.length === 0
          ? <p className="text-center py-10 text-gray-400 text-sm">오늘 내 반 수업이 없습니다</p>
          : mine.map(c => <TodayCardItem key={c.id} card={c} />)}
      </section>

      {assignable.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-500">오늘 수업 · 가져오기</h3>
          {assignable.map(c => <AssignableCardItem key={c.id} card={c} />)}
        </section>
      )}
    </div>
  )
}
