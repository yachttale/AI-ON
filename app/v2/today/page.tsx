// app/v2/today/page.tsx — 오늘 수업 서버 페이지 (내 반 + 가져오기)
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getTodayStudentsRaw } from '@/lib/v2/data'
import { buildTodayCards } from '@/lib/v2/today'
import { TodayCardItem, AssignableCardItem } from './parts'

function TodaySkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <section className="space-y-3">
        <div className="h-6 bg-gray-200 rounded w-32" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border p-4 flex justify-between items-center">
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-20" />
              <div className="h-3 bg-gray-100 rounded w-14" />
            </div>
            <div className="h-7 bg-gray-200 rounded w-16" />
          </div>
        ))}
      </section>
    </div>
  )
}

async function TodayContent() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { students, sessionById, reportedStepById } = await getTodayStudentsRaw()
  const { mine, assignable } = buildTodayCards(students, sessionById, user!.id, undefined, reportedStepById)
  const unassigned = assignable.filter(c => !c.instructor_id)   // 오늘 수업인데 담당 없음
  const otherClass = assignable.filter(c => c.instructor_id)    // 오늘 수업인데 다른 강사 반
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-gray-800">오늘 내 수업</h2>
        {mine.length === 0
          ? <p className="text-center py-8 text-gray-400 text-sm">오늘 내 반 수업이 없습니다</p>
          : mine.map(c => <TodayCardItem key={c.id} card={c} />)}
      </section>

      {unassigned.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">오늘 수업 · 미배정 <span className="text-gray-400 font-normal">({unassigned.length})</span></h3>
          <p className="text-xs text-gray-400">아직 담당 강사가 없는 오늘 수업 학생입니다. &ldquo;내 반으로&rdquo;를 누르면 이 요일은 내 반으로 고정됩니다.</p>
          {unassigned.map(c => <AssignableCardItem key={c.id} card={c} />)}
        </section>
      )}

      {otherClass.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-500">다른 반 · 가져오기 <span className="text-gray-400 font-normal">({otherClass.length})</span></h3>
          {otherClass.map(c => <AssignableCardItem key={c.id} card={c} />)}
        </section>
      )}
    </div>
  )
}

export default function TodayPage() {
  return (
    <Suspense fallback={<TodaySkeleton />}>
      <TodayContent />
    </Suspense>
  )
}
