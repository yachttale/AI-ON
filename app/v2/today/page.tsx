// app/v2/today/page.tsx — 오늘 수업: 시간대 그룹 + 큰 카드(실시간 기록) + 가져오기 + 아이 입력 확인
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getTodayStudentsRaw, enrichMineCards, isClosedOn } from '@/lib/v2/data'
import { buildTodayCards, groupCardsByHour } from '@/lib/v2/today'
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

function hourLabel(hour: number | null): string {
  if (hour === null) return '시간 미상'
  const h = hour > 12 ? hour - 12 : hour
  return `${h}시 수업`
}

async function TodayContent() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (await isClosedOn()) {
    return (
      <div className="py-16 text-center space-y-2">
        <p className="text-3xl">🏖️</p>
        <p className="text-lg font-bold text-gray-700">오늘은 휴원일입니다</p>
        <p className="text-sm text-gray-400">수업이 없는 날입니다. (결석 아님)</p>
      </div>
    )
  }

  const { students, sessionById, reportedStepById } = await getTodayStudentsRaw()
  const { mine, assignable } = buildTodayCards(students, sessionById, user!.id, undefined, reportedStepById)
  const cards = await enrichMineCards(mine)
  const groups = groupCardsByHour(cards)
  const todoCount = cards.filter(c => !c.recordedToday && !c.absent).length

  // 오늘 수업엔 '내 반 + 미배정'만. 다른 반(배정된) 아이들은 숨김.
  const unassigned = assignable.filter(c => !c.instructor_id)

  return (
    <div className="space-y-5">
      {cards.length > 0 && (
        <p className="text-sm">
          오늘 미입력 <span className="font-bold text-red-500">{todoCount}명</span>
          <span className="text-gray-400"> / 전체 {cards.length}명</span>
        </p>
      )}

      {cards.length === 0 && (
        <p className="text-center py-8 text-gray-400 text-sm">오늘 내 반 수업이 없습니다</p>
      )}

      {groups.map(g => (
        <section key={g.hour ?? 'none'} className="space-y-3">
          <h2 className="text-base font-bold text-gray-800">
            {hourLabel(g.hour)} <span className="text-gray-400 font-normal text-sm">({g.cards.length}명)</span>
          </h2>
          {g.cards.map(c => <TodayCardItem key={c.id} card={c} />)}
        </section>
      ))}

      {unassigned.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">오늘 수업 · 미배정 <span className="text-gray-400 font-normal">({unassigned.length})</span></h3>
          <p className="text-xs text-gray-400">담당 강사가 없는 오늘 수업 학생입니다. &ldquo;내 반으로&rdquo;를 누르면 이 요일은 내 반으로 고정됩니다.</p>
          {unassigned.map(c => <AssignableCardItem key={c.id} card={c} />)}
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
