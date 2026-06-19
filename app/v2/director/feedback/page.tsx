// app/v2/director/feedback/page.tsx — 학부모 피드백 (준비 중)
import { MessageSquare } from 'lucide-react'

export default function DirectorFeedbackPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">학부모 피드백</h1>
        <p className="text-sm text-white/40 mt-0.5">학부모 소통 및 피드백 관리</p>
      </div>

      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-teal-500/10 flex items-center justify-center">
          <MessageSquare size={28} className="text-teal-400" />
        </div>
        <p className="text-white/60 font-medium">곧 제공될 기능입니다</p>
        <p className="text-sm text-white/30">학부모 알림, 진도 공유, 피드백 수집 기능이 추가될 예정입니다</p>
      </div>
    </div>
  )
}
