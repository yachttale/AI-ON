// app/v2/today/page.tsx — 오늘 수업: 미배정 최상단 → 오늘 → 어제 → 그전날
import { Suspense } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getTodayStudentsRaw, enrichMineCards, isClosedOn, getPastDayStudentsForMe } from '@/lib/v2/data'
import { buildTodayCards, groupCardsByHour } from '@/lib/v2/today'
import { TodayCardItem, AssignableCardItem } from './parts'
import type { PastDayStudentRow } from '@/lib/v2/data'

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

function PastStudentCard({ s }: { s: PastDayStudentRow }) {
  const isAbsent = s.attendance === '결석'
  const hasRecord = s.attendance !== null
  return (
    <Link
      href={`/v2/student/${s.id}`}
      className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
        isAbsent ? 'bg-red-50 border-red-200' : hasRecord ? 'bg-green-50 border-green-200' : 'bg-white'
      }`}
    >
      <div>
        <p className="font-medium text-gray-800">{s.name}</p>
        <p className="text-xs text-gray-400">{s.schedule ?? ''}{s.grade ? ` · ${s.grade}` : ''}</p>
      </div>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
        isAbsent ? 'bg-red-100 text-red-600'
        : hasRecord ? 'bg-green-100 text-green-700'
        : 'bg-gray-100 text-gray-400'
      }`}>
        {isAbsent ? '결석' : hasRecord ? '기록됨' : '미기록'}
      </span>
    </Link>
  )
}

async function TodayContent() {
  const supabase = await createClient()
  const [{ data: { user } }, isClosed, todayRaw, yesterday, dayBefore] = await Promise.all([
    supabase.auth.getUser(),
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
  const cards = await enrichMineCards(mine)
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
      {yesterday.students.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-700">
            {yesterday.dateLabel}{' '}
            <span className="text-gray-400 font-normal text-sm">({yesterday.students.length}명)</span>
          </h2>
          {yesterday.students.map(s => <PastStudentCard key={s.id} s={s} />)}
        </section>
      )}

      {/* 4. 그전날 수업 */}
      {dayBefore.students.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-700">
            {dayBefore.dateLabel}{' '}
            <span className="text-gray-400 font-normal text-sm">({dayBefore.students.length}명)</span>
          </h2>
          {dayBefore.students.map(s => <PastStudentCard key={s.id} s={s} />)}
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
