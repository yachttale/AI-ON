import { Badge } from '@/components/ui/badge'
import type { SessionLog } from '@/types/database'

interface Props {
  logs: SessionLog[]
}

export default function LogTimeline({ logs }: Props) {
  if (logs.length === 0) {
    return <p className="text-center text-gray-400 py-8">수업 기록이 없습니다</p>
  }

  return (
    <div className="relative">
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
      <div className="space-y-4">
        {logs.map(log => (
          <div key={log.id} className="flex gap-4 pl-10 relative">
            <div className={`absolute left-2.5 top-2 w-3 h-3 rounded-full border-2 border-white ${
              log.attendance === '결석' ? 'bg-gray-300'
              : log.status === '통과' ? 'bg-green-500'
              : 'bg-sky-400'
            }`} />
            <div className="flex-1 bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">{log.session_date}</span>
                <Badge variant="outline" className={`text-xs ${
                  log.attendance === '결석' ? 'text-gray-400'
                  : log.status === '통과' ? 'text-green-600 border-green-200'
                  : 'text-sky-600 border-sky-200'
                }`}>
                  {log.attendance === '결석' ? '결석'
                    : log.attendance === '지각' ? `지각 · ${log.stroke}`
                    : log.stroke}
                </Badge>
              </div>
              {log.attendance !== '결석' && (
                <p className="text-sm font-medium text-gray-700">
                  {log.stage}
                  {log.status && (
                    <span className={`ml-2 text-xs ${log.status === '통과' ? 'text-green-600' : 'text-blue-500'}`}>
                      {log.status}
                    </span>
                  )}
                </p>
              )}
              {log.attendance === '결석' && log.absence_reason && (
                <p className="text-xs text-gray-400 mt-0.5">사유: {log.absence_reason}</p>
              )}
              {log.memo && <p className="text-xs text-gray-500 mt-1">{log.memo}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
