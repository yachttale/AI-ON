// app/v2/students/page.tsx — 나의 학생(담당 전체) 목록
import Link from 'next/link'
import { getMyStudents } from '@/lib/v2/data'

export default async function MyStudentsPage() {
  const students = await getMyStudents()
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-gray-800">나의 학생 <span className="text-gray-400 font-normal text-sm">({students.length})</span></h2>
      {students.length === 0
        ? <p className="text-center py-8 text-gray-400 text-sm">담당 학생이 없습니다</p>
        : <ul className="space-y-2">
            {students.map(s => (
              <li key={s.id}>
                <Link href={`/v2/student/${s.id}`} className="flex items-center justify-between bg-white rounded-xl border px-4 py-3">
                  <div>
                    <p className="font-semibold text-gray-800">{s.name}</p>
                    <p className="text-xs text-gray-400">{s.schedule ?? ''}{s.grade ? ` · ${s.grade}` : ''}</p>
                  </div>
                  <span className="text-gray-300 text-sm">→</span>
                </Link>
              </li>
            ))}
          </ul>}
    </div>
  )
}
