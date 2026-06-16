import { Badge } from '@/components/ui/badge'
import type { Student } from '@/types/database'

interface StagnantStudent {
  student: Student
  stroke: string
  stage: string
  sessionCount: number
}

interface Props {
  stagnantStudents: StagnantStudent[]
}

export default function StagnantAlert({ stagnantStudents }: Props) {
  if (stagnantStudents.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">정체 학생이 없습니다 👍</p>
  }

  return (
    <div className="space-y-2">
      {stagnantStudents.map(({ student, stroke, stage, sessionCount }) => (
        <div key={student.id} className="flex items-center justify-between bg-amber-50 rounded-xl px-4 py-3 border border-amber-200">
          <div>
            <p className="font-semibold text-gray-800">{student.name}</p>
            <p className="text-xs text-gray-500">{stroke} · {stage}</p>
          </div>
          <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
            {sessionCount}회째
          </Badge>
        </div>
      ))}
    </div>
  )
}
