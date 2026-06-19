// app/v2/students/[key]/page.tsx — 영법 그룹별 내 학생 목록
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getMyStudentsGrouped } from '@/lib/v2/data'

const GROUP_LABELS: Record<string, string> = {
  beginner: '초보', free: '자유형', back: '배영',
  breast: '평영', butterfly: '접영', master: '마스터',
}

export default async function StudentGroupPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  if (!GROUP_LABELS[key]) redirect('/v2/students')

  const groups = await getMyStudentsGrouped()
  const group = groups.find(g => g.key === key)
  const students = group?.students ?? []

  return (
    <div className="space-y-4">
      <Link href="/v2/students" className="inline-block text-sm text-gray-400 hover:text-gray-600">
        ← 나의 학생
      </Link>

      <h1 className="text-lg font-bold text-gray-800">
        {GROUP_LABELS[key]}{' '}
        <span className="text-gray-400 font-normal text-base">{students.length}명</span>
      </h1>

      {students.length === 0 ? (
        <p className="py-8 text-center text-gray-400 text-sm">해당 그룹 학생이 없습니다</p>
      ) : (
        <ul className="space-y-2">
          {students.map(s => (
            <li key={s.id}>
              <Link
                href={`/v2/student/${s.id}`}
                className="flex items-center justify-between bg-white rounded-xl border px-4 py-3 hover:bg-gray-50"
              >
                <div>
                  <p className="font-semibold text-gray-800">{s.name}</p>
                  <p className="text-xs text-gray-400">
                    {s.schedule ?? ''}
                    {s.grade ? ` · ${s.grade}` : ''}
                  </p>
                </div>
                <span className="text-gray-300 text-sm">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
