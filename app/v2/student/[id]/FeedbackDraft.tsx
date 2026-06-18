// app/v2/student/[id]/FeedbackDraft.tsx — 부모 피드백 초안 보기/편집/복사
'use client'
import { useState } from 'react'

export function FeedbackDraft({ initial }: { initial: string }) {
  const [text, setText] = useState(initial)
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {}
  }
  return (
    <div className="space-y-2">
      <textarea value={text} onChange={e => setText(e.target.value)} rows={7}
        className="w-full border rounded-lg p-2 text-sm leading-relaxed" />
      <button onClick={copy} className="w-full py-2 rounded-lg bg-blue-500 text-white text-sm font-semibold">
        {copied ? '복사됨 ✓' : '복사하기'}
      </button>
      <p className="text-[11px] text-gray-400">데이터 기반 자동 초안입니다. 강사가 직접 다듬어 보내세요.</p>
    </div>
  )
}
