import Link from 'next/link'
import { STROKES, MASTER_STROKES } from '@/lib/curriculum'

const STROKE_MEDAL: Record<string, { label: string; dot: string; darkDot: string }> = {
  '자유형': { label: '자유형', dot: 'bg-sky-400',    darkDot: 'bg-sky-400' },
  '배영':   { label: '배영',   dot: 'bg-green-400',  darkDot: 'bg-green-400' },
  '평영':   { label: '평영',   dot: 'bg-purple-400', darkDot: 'bg-purple-400' },
  '접영':   { label: '접영',   dot: 'bg-orange-400', darkDot: 'bg-orange-400' },
}

export interface StudentProgressItem {
  id: string
  name: string
  stroke: string | null
  stage: string | null
  status: string | null
  totalAttended: number
  stageCount: number
  completedStrokes: string[]
  monthlyDistance?: number
}

interface Props {
  students: StudentProgressItem[]
  basePath?: string
}

const STATUS_COLOR: Record<string, string> = {
  '진행중': 'bg-blue-100 text-blue-700',
  '통과':   'bg-green-100 text-green-700',
}

export default function StudentProgressList({ students, basePath = '/director/student' }: Props) {
  if (students.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">등록된 학생이 없습니다</p>
  }

  // 영법 순서대로 그룹핑
  const strokeOrder = STROKES
  const groups = strokeOrder
    .map(stroke => ({
      stroke,
      items: students.filter(s => s.stroke === stroke).sort((a, b) =>
        a.name.localeCompare(b.name, 'ko')
      ),
    }))
    .filter(g => g.items.length > 0)

  const noStroke = students.filter(s => !s.stroke)

  return (
    <div className="space-y-4">
      {[...groups, ...(noStroke.length > 0 ? [{ stroke: '미기록', items: noStroke }] : [])].map(group => (
        <div key={group.stroke}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 ml-1">
            {group.stroke} · {group.items.length}명
          </p>
          <div className="space-y-2">
            {group.items.map(s => {
              const isMaster = s.stroke === '마스터'
              return (
                <Link key={s.id} href={`${basePath}/${s.id}`} className={`block rounded-xl px-4 py-3 border shadow-sm transition-all ${
                  isMaster
                    ? 'bg-gray-900 border-gray-700 hover:border-gray-500 hover:shadow-lg'
                    : 'bg-white border-gray-100 hover:border-sky-200 hover:shadow-md'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`font-semibold ${isMaster ? 'text-white' : 'text-gray-800'}`}>{s.name}</span>
                      {MASTER_STROKES.filter(stroke => s.completedStrokes.includes(stroke)).map(stroke => {
                        const medal = STROKE_MEDAL[stroke]
                        return (
                          <span key={stroke} title={medal.label} className={`inline-block w-2.5 h-2.5 rounded-full ${isMaster ? medal.darkDot : medal.dot}`} />
                        )
                      })}
                    </div>
                    <div className="flex items-center gap-2">
                      {isMaster && s.monthlyDistance != null && s.monthlyDistance > 0 ? (
                        <span className="text-xs text-sky-400 font-semibold">
                          {s.monthlyDistance >= 1000
                            ? `${(s.monthlyDistance / 1000).toFixed(2)}km`
                            : `${s.monthlyDistance}m`}
                        </span>
                      ) : (
                        !isMaster && s.status && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[s.status] ?? 'bg-gray-100 text-gray-500'}`}>
                            {s.status}
                          </span>
                        )
                      )}
                      <span className="text-xs text-gray-400">총 {s.totalAttended}회</span>
                    </div>
                  </div>
                  {s.stage ? (
                    <p className={`text-sm mt-0.5 ${isMaster ? 'text-gray-400' : 'text-gray-500'}`}>
                      {s.stroke ? `${s.stroke}-${s.stage}` : s.stage}
                      <span className="ml-2 text-gray-400 text-xs">{s.stageCount}회째</span>
                    </p>
                  ) : (
                    <p className={`text-sm mt-0.5 ${isMaster ? 'text-gray-600' : 'text-gray-300'}`}>기록 없음</p>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
