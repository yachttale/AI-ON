// app/v2/today/page.tsx — 오늘 수업: 미배정 최상단 → 오늘 → 어제 → 그전날 (최대 2일 수정 가능)
import { Suspense } from 'react'
import { getCurrentUser } from '@/lib/v2/session'
import { getTodayStudentsRaw, enrichMineCards, isClosedOn, getPastDayStudentsForMe, enrichPastDayStudents } from '@/lib/v2/data'
import { buildTodayCards, groupCardsByHour } from '@/lib/v2/today'
import type { TodayCard } from '@/lib/v2/today'
import { kstWeekday } from '@/lib/v2/now'
import { getTodayEntries } from '@/lib/schedule'
import { TodayCardItem, AssignableCardItem, PastDayCardItem } from './parts'
import { MakeupSection } from './MakeupSection'

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

  // 오늘 보강 = 오늘 세션이 있으나 오늘이 정규 수업일이 아닌 학생(세션 담당 강사로 카드 구성)
  const weekday = kstWeekday()
  const makeupBase: TodayCard[] = students
    .filter(s => {
      const sess = sessionById.get(s.id)
      return !!sess && (!s.schedule || getTodayEntries(s.schedule, weekday).length === 0)
    })
    .map(s => {
      const sess = sessionById.get(s.id)!
      return {
        id: s.id, name: s.name, grade: s.grade, schedule: s.schedule,
        instructor_id: sess.instructorId, instructor_name: sess.instructorName,
        attendance: sess.attendance, laps: sess.laps,
        mine: sess.instructorId === user!.id,
        status: sess.status, inputSource: sess.inputSource,
        reportedStepId: sess.reportedStepId,
        reportedStep: sess.reportedStepId ? reportedStepById.get(sess.reportedStepId) ?? null : null,
      }
    })

  const [cards, makeupCards, yesterdayCards, dayBeforeCards] = await Promise.all([
    enrichMineCards(mine),
    enrichMineCards(makeupBase),
    enrichPastDayStudents(yesterday.students, yesterday.date),
    enrichPastDayStudents(dayBefore.students, dayBefore.date),
  ])
  const groups = groupCardsByHour(cards)
  const todoCount = cards.filter(c => !c.recordedToday && !c.absent).length
  const unassigned = assignable.filter(c => !c.instructor_id)

  // 검색용: 오늘 정규수업·보강에 안 들어간 활성 학생
  const usedIds = new Set([...mine, ...assignable, ...makeupBase].map(c => c.id))
  const searchStudents = students.filter(s => !usedIds.has(s.id)).map(s => ({ id: s.id, name: s.name, grade: s.grade }))

  return (
    <div className="space-y-5">

      {/* 0. 오늘의 보강 — 제일 상단 */}
      <MakeupSection makeups={makeupCards} searchStudents={searchStudents} />

      {/* 1. 미배정 학생 */}
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
