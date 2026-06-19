'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { unassignFromDay } from '@/lib/v2/actions'

export function UnassignButton({ studentId }: { studentId: string }) {
  const [pending, start] = useTransition()
  const router = useRouter()
  return (
    <button
      disabled={pending}
      onClick={() => start(async () => { await unassignFromDay(studentId); router.push('/v2/today') })}
      className="text-xs text-red-400 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors disabled:opacity-40"
    >
      {pending ? '…' : '미배정으로 ↩'}
    </button>
  )
}
