// app/v2/me/CertManager.tsx — 자격증 목록 + 추가/삭제(본인)
'use client'
import { useState, useTransition } from 'react'
import { addCertification, removeCertification } from '@/lib/v2/actions'

export function CertManager({ items }: { items: { id: string; name: string; acquiredOn: string | null }[] }) {
  const [pending, start] = useTransition()
  const [name, setName] = useState('')
  const [date, setDate] = useState('')

  const add = () => {
    if (!name.trim()) return
    start(async () => { await addCertification(name, date || null); setName(''); setDate('') })
  }

  return (
    <div className="space-y-2">
      {items.length === 0 && <p className="text-xs text-gray-400">아직 등록된 자격증이 없습니다.</p>}
      {items.map(c => (
        <div key={c.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
          <div>
            <p className="text-sm font-medium text-gray-800">{c.name}</p>
            {c.acquiredOn && <p className="text-[11px] text-gray-400">{c.acquiredOn} 취득</p>}
          </div>
          <button disabled={pending} onClick={() => start(() => removeCertification(c.id))}
            className="text-xs text-gray-400 hover:text-red-500 shrink-0">삭제</button>
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="자격증명 (예: 생활체육지도사)"
          className="flex-1 border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
        <input value={date} onChange={e => setDate(e.target.value)} type="date"
          className="border rounded-lg px-2 py-1.5 text-sm text-gray-500" />
        <button disabled={pending || !name.trim()} onClick={add}
          className="px-3 py-1.5 rounded-lg bg-sky-500 text-white text-sm font-semibold disabled:opacity-50 shrink-0">추가</button>
      </div>
    </div>
  )
}
