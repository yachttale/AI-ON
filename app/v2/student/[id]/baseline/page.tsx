// app/v2/student/[id]/baseline/page.tsx — 베이스라인 배치 서버 페이지
import { getStrokeLadders } from '@/lib/v2/data'
import { BaselineLadder } from './BaselineLadder'

export default async function BaselinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const strokes = await getStrokeLadders(id)
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-800">기준 배치</h2>
      <BaselineLadder studentId={id} strokes={strokes} />
    </div>
  )
}
