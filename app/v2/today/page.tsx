// app/v2/today/page.tsx — 오늘 수업: 미배정 최상단 → 오늘 → 어제 → 그전날 (최대 2일 수정 가능)
import { Suspense } from 'react'
import { getCurrentUser } from '@/lib/v2/session'
import { getTodayStudentsRaw, enrichMineCards, isClosedOn, getPastDayStudentsForMe, enrichPastDayStudents } from '@/lib/v2/data'
import { buildTodayCards, groupCardsByHour } from '@/lib/v2/today'
import { TodayCardItem, AssignableCardItem, PastDayCardItem } from './parts'

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
  const [user, isClosed, todayRaw, yesterday, dayBefore] = await Promise.all([
    getCurrentUser(),
    isClosedOn(),
    getTodayStudentsRaw(),
    getPastDayStudentsForMe(1),
    getPastDayStudentsForMe(2),
  ])

  if (isClosed) {
    return (
      <div className="py-16 text-center space-y-2">
        <p className="text-3xl">🏖️</p>
        <p className="text-lg font-bold text-gray-700">오늘은 휴원일입니다</p>
        <p className="text-sm text-gray-400">수업이 없는 날입니다. (결석 아님)</p>
      </div>
    )
  }

  const { students, sessionById, reportedStepById } = todayRaw
  const { mine, assignable } = buildTodayCards(students, sessionById, user!.id, undefined, reportedStepById)
  const [cards, yesterdayCards, dayBeforeCards] = await Promise.all([
    enrichMineCards(mine),
    enrichPastDayStudents(yesterday.students, yesterday.date),
    enrichPastDayStudents(dayBefore.students, dayBefore.date),
  ])
  const groups = groupCardsByHour(cards)
  const todoCount = cards.filter(c => !c.recordedToday && !c.absent).length
  const unassigned = assignable.filter(c => !c.instructor_id)

  return (
    <div className="space-y-5">

      {/* 1. 미배정 학생 — 최상단 */}
      {unassigned.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">
            미배정 <span className="text-gray-400 font-normal">({unassigned.length})</span>
          </h3>
          <p className="text-xs text-gray-400">담당 강사가 없는 오늘 수업 학생입니다. &ldquo;내 반으로&rdquo;를 누르면 이 요일은 내 반으로 고정됩니다.</p>
          {unassigned.map(c => <AssignableCardItem key={c.id} card={c} />)}
        </section>
      )}

      {/* 2. 오늘 수업 */}
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

      {/* 3. 어제 수업 */}
      {yesterdayCards.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-bold text-gray-700">
            {yesterday.dateLabel}{' '}
            <span className="text-gray-400 font-normal text-sm">({yesterdayCards.length}명)</span>
          </h2>
          {yesterdayCards.map(c => <PastDayCardItem key={c.id} card={c} date={yesterday.date} />)}
        </section>
      )}

      {/* 4. 그전날 수업 */}
      {dayBeforeCards.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-bold text-gray-700">
            {dayBefore.dateLabel}{' '}
            <span className="text-gray-400 font-normal text-sm">({dayBeforeCards.length}명)</span>
          </h2>
          {dayBeforeCards.map(c => <PastDayCardItem key={c.id} card={c} date={dayBefore.date} />)}
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
