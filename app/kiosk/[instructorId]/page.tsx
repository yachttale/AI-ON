// app/kiosk/[instructorId]/page.tsx — 키오스크 명단 서버 페이지
import { getKioskRosterRaw, getStrokeLadders } from '@/lib/v2/data'
import { buildKioskRoster } from '@/lib/v2/kiosk'
import { deriveCurrentStep } from '@/lib/v2/kiosk-current'
import type { CurrentStepInfo } from '@/lib/v2/kiosk-current'
import { KioskRoster } from './KioskRoster'

export default async function KioskPage({ params }: { params: Promise<{ instructorId: string }> }) {
  const { instructorId } = await params
  const { students, doneIds } = await getKioskRosterRaw(instructorId)
  const now = new Date()
  const slot = buildKioskRoster(students, instructorId, doneIds, now.getDay(), now.getHours())

  // 슬롯 학생 전원의 현재 단계를 미리 조회 (왕복 최소화)
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
