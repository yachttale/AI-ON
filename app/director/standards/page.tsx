import {
  STROKE_BASE_SESSIONS,
  STROKE_MASTERY_TARGETS,
  STROKE_PASS_CRITERIA,
  GRADE_COMPLETION_STANDARDS,
  STAGNANT_THRESHOLD,
} from '@/lib/curriculum'

const GRADE_STROKES = ['자유형', '배영', '평영', '접영'] as const
const GRADES = ['1학년', '2학년', '3학년', '4학년', '5학년', '6학년'] as const

export default function StandardsPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold text-gray-800">기준표</h1>

      {/* 영법별 숙달 통과 기준 */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-1">영법별 숙달 통과 기준</h2>
        <p className="text-xs text-gray-400 mb-4">25m 기준 · 모든 조건 충족 시 다음 영법으로 진급</p>
        <div className="grid grid-cols-2 gap-3">
          {GRADE_STROKES.map(stroke => {
            const criteria = STROKE_PASS_CRITERIA[stroke]
            const target = STROKE_MASTERY_TARGETS[stroke]
            return (
              <div key={stroke} className="bg-gray-50 rounded-xl p-3">
                <p className="text-sm font-bold text-sky-700 mb-2">{stroke}</p>
                <ul className="space-y-1">
                  {criteria?.conditions.map(c => (
                    <li key={c} className="flex items-center gap-1.5 text-xs text-gray-600">
                      <span className="text-green-400 font-bold">✓</span>{c}
                    </li>
                  ))}
                  <li className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 mt-1.5 pt-1.5 border-t border-gray-200">
                    <span className="text-indigo-400 font-bold">⏱</span>{criteria?.timeLimit}
                  </li>
                </ul>
              </div>
            )
          })}
        </div>
      </section>

      {/* 학년별 숙달 통과 기록 기준 */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-1">학년별 숙달 기록 기준</h2>
        <p className="text-xs text-gray-400 mb-4">25m 기준 (초)</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left text-xs text-gray-400 font-medium pb-3 pr-3">학년</th>
                {GRADE_STROKES.map(s => (
                  <th key={s} className="text-center text-xs text-gray-400 font-medium pb-3 px-2">{s}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {GRADES.map(grade => (
                <tr key={grade}>
                  <td className="py-2.5 pr-3 text-xs font-semibold text-gray-600">{grade}</td>
                  {GRADE_STROKES.map(stroke => {
                    const time = GRADE_COMPLETION_STANDARDS[grade]?.[stroke]
                    return (
                      <td key={stroke} className="py-2.5 px-2 text-center text-xs text-gray-700 font-medium">
                        {time ?? '-'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-3">* 학생 학년에 맞는 범위 내 기록 달성 시 통과 권장</p>
      </section>

      {/* 영법별 기본 수업 횟수 */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-4">영법별 기본 수업 횟수</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {Object.entries(STROKE_BASE_SESSIONS).map(([stroke, count]) => (
            <div key={stroke} className="bg-sky-50 rounded-xl p-3 text-center">
              <p className="text-xs text-sky-600 font-medium mb-1">{stroke}</p>
              <p className="text-2xl font-bold text-sky-700">{count}</p>
              <p className="text-xs text-gray-400">회</p>
            </div>
          ))}
        </div>
      </section>

      {/* 정체 학생 기준 */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-3">정체 학생 기준</h2>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold text-amber-600">{STAGNANT_THRESHOLD}회</span>
            <div>
              <p className="text-sm font-medium text-amber-800">연속 동일 단계</p>
              <p className="text-xs text-amber-600 mt-0.5">같은 단계를 {STAGNANT_THRESHOLD}회 이상 연속 진행 시 정체 학생으로 분류</p>
            </div>
          </div>
        </div>
        <ul className="mt-3 space-y-1.5">
          <li className="flex items-start gap-2 text-xs text-gray-500">
            <span className="text-gray-300 mt-0.5">•</span>
            <span>초급 단계는 정체 기준에서 제외됩니다</span>
          </li>
          <li className="flex items-start gap-2 text-xs text-gray-500">
            <span className="text-gray-300 mt-0.5">•</span>
            <span>결석 수업은 연속 횟수에 포함되지 않습니다</span>
          </li>
        </ul>
      </section>
    </div>
  )
}
