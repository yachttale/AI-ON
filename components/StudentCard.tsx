import type { Student, SessionLog } from '@/types/database'

interface Props {
  student: Student
  latestLog?: SessionLog | null
  todayLog?: SessionLog | null
  onQuickSave: () => void
  onOpen: () => void
  quickSaving?: boolean
}

export default function StudentCard({ student, latestLog, todayLog, onQuickSave, onOpen, quickSaving }: Props) {
  const isRecorded = !!todayLog
  const displayLog = todayLog ?? latestLog

  const nameLabel = (() => {
    if (!displayLog?.stroke) return student.name
    if (displayLog.stroke === '마스터') return `${student.name}-마스터`
    if (displayLog.stage) return `${student.name}-${displayLog.stroke}-${displayLog.stage}`
    return `${student.name}-${displayLog.stroke}`
  })()

  return (
    <div className={`w-full p-3.5 rounded-xl border transition-all ${
      isRecorded ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200 shadow-sm'
    }`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${
            isRecorded ? 'bg-green-400' : 'bg-sky-400'
          }`}>
            {student.name[0]}
          </div>
          <div className="min-w-0">
            <p className={`font-semibold text-sm truncate ${isRecorded ? 'text-green-800' : 'text-gray-800'}`}>
              {nameLabel}
            </p>
            <p className="text-xs text-gray-400 truncate">{student.schedule}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isRecorded ? (
            <>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                todayLog?.attendance === '결석' ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'
              }`}>
                {todayLog?.attendance === '결석' ? '결석' : '출석'}
              </span>
              <button
                onClick={onOpen}
                className="text-xs px-2.5 py-1.5 rounded-lg font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
              >
                수정
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onQuickSave}
                disabled={quickSaving}
                className="text-xs px-2.5 py-1.5 rounded-lg font-medium bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50 transition-colors"
              >
                {quickSaving ? '…' : '저장'}
              </button>
              <button
                onClick={onOpen}
                className="text-xs px-2.5 py-1.5 rounded-lg font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                기록
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
