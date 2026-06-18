// app/kiosk/[instructorId]/page.tsx — 키오스크 명단 서버 페이지
import { Suspense } from 'react'
import { getKioskRosterRaw, getStrokeLadders } from '@/lib/v2/data'
import { buildKioskRoster } from '@/lib/v2/kiosk'
import { deriveCurrentStep } from '@/lib/v2/kiosk-current'
import type { CurrentStepInfo } from '@/lib/v2/kiosk-current'
import { KioskRoster } from './KioskRoster'

function KioskSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-8 bg-sky-100 rounded-lg w-48" />
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-white rounded-xl border p-4 flex justify-between items-center">
          <div className="space-y-2">
            <div className="h-5 bg-gray-200 rounded w-24" />
            <div className="h-3 bg-gray-100 rounded w-16" />
          </div>
          <div className="h-8 bg-gray-200 rounded w-20" />
        </div>
      ))}
    </div>
  )
}

async function KioskContent({ instructorId }: { instructorId: string }) {
  const { students, doneIds } = await getKioskRosterRaw(instructorId)
  const now = new Date()
  const slot = buildKioskRoster(students, instructorId, doneIds, now.getDay(), now.getHours())

  // 슬롯 학생 전원의 현재 단계를 미리 조회 (왕복 최소화 — getCachedLadderSteps 덕에 ×N 중복 제거됨)
  const currentStepMap = new Map<string, CurrentStepInfo>()
  await Promise.all(
    slot.students.map(async s => {
      const strokes = await getStrokeLadders(s.id)
      currentStepMap.set(s.id, deriveCurrentStep(strokes))
    })
  )

  return (
    <KioskRoster
      instructorId={instructorId}
      slot={slot}
      currentStepMap={Object.fromEntries(currentStepMap)}
    />
  )
}

export default async function KioskPage({ params }: { params: Promise<{ instructorId: string }> }) {
  const { instructorId } = await params
  return (
    <Suspense fallback={<KioskSkeleton />}>
      <KioskContent instructorId={instructorId} />
    </Suspense>
  )
}
