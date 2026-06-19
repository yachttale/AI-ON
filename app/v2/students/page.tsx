// app/v2/students/page.tsx — 나의 학생 영법 그룹 현황
import Link from 'next/link'
import { getMyStudentsGrouped } from '@/lib/v2/data'

export default async function MyStudentsPage() {
  const groups = await getMyStudentsGrouped()
  const total = groups.reduce((sum, g) => sum + g.count, 0)

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-800">
        나의 학생 <span className="text-gray-400 font-normal text-sm">({total}명)</span>
      </h2>

      <div className="grid grid-cols-3 gap-3">
        {groups.map(g => (
          <Link
            key={g.key}
            href={`/v2/students/${g.key}`}
            className="bg-white rounded-xl border px-3 py-4 text-center hover:bg-gray-50 transition-all active:scale-95"
          >
            <p className="text-xs text-gray-400 mb-1">{g.label}</p>
            <p className="text-2xl font-bold text-gray-800">
              {g.count}
              <span className="text-xs font-normal text-gray-400 ml-0.5">명</span>
            </p>
          </Link>
        ))}
      </div>

      {total === 0 && (
        <p className="text-center py-8 text-gray-400 text-sm">담당 학생이 없습니다</p>
      )}
    </div>
  )
}
