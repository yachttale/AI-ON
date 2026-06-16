'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { Student } from '@/types/database'

export default function RosterPage() {
  const [myStudents, setMyStudents] = useState<Student[]>([])
  const [newStudents, setNewStudents] = useState<Student[]>([])
  const [tab, setTab] = useState<'new' | 'my'>('new')
  const [withdrawTarget, setWithdrawTarget] = useState<Student | null>(null)
  const [withdrawNote, setWithdrawNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: mine }, { data: unassigned }] = await Promise.all([
      supabase.from('students')
        .select('*')
        .eq('instructor_id', user.id)
        .eq('is_active', true)
        .order('name'),
      supabase.from('students')
        .select('*')
        .is('instructor_id', null)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
    ])

    setMyStudents(mine ?? [])
    setNewStudents(unassigned ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function assignToMe(studentId: string) {
    setBusy(true)
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase.rpc('assign_student_to_me', { p_student_id: studentId })
    if (err) setError(err.message)
    else await load()
    setBusy(false)
  }

  async function requestWithdrawal() {
    if (!withdrawTarget) return
    setBusy(true)
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase.rpc('request_withdrawal', {
      p_student_id: withdrawTarget.id,
      p_note: withdrawNote.trim() || null,
    })
    if (err) setError(err.message)
    else {
      setWithdrawTarget(null)
      setWithdrawNote('')
      await load()
    }
    setBusy(false)
  }

  async function cancelWithdrawal(studentId: string) {
    setBusy(true)
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase.rpc('cancel_withdrawal_request', { p_student_id: studentId })
    if (err) setError(err.message)
    else await load()
    setBusy(false)
  }

  const pendingCount = myStudents.filter(s => s.withdrawal_status === 'pending').length

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-800 mb-4">반 관리</h2>

      {/* 탭 */}
      <div className="flex mb-4 rounded-xl overflow-hidden border border-gray-200">
        {(['new', 'my'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === t ? 'bg-sky-500 text-white' : 'bg-white text-gray-500'
            }`}
          >
            {t === 'new'
              ? `신규 미배정 ${newStudents.length > 0 ? `(${newStudents.length})` : ''}`
              : `내 반 (${myStudents.length}명${pendingCount > 0 ? ` · 퇴원신청 ${pendingCount}` : ''})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : tab === 'new' ? (
        /* 신규 미배정 학생 */
        <div>
          {newStudents.length === 0 ? (
            <div className="text-center py-14 text-gray-400">
              <p className="text-3xl mb-2">✓</p>
              <p className="text-sm">신규 미배정 학생이 없습니다</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-400 mb-3">원장님이 등록한 신규 학생입니다. 내 반으로 배정하세요.</p>
              <div className="space-y-2">
                {newStudents.map(s => (
                  <div key={s.id} className="bg-white rounded-xl p-4 border border-sky-100 shadow-sm flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-800">{s.name}</p>
                      <p className="text-xs text-gray-400">{s.grade && `${s.grade} · `}{s.schedule}</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => assignToMe(s.id)}
                      disabled={busy}
                      className="bg-sky-500 hover:bg-sky-600 text-xs px-3"
                    >
                      내 반으로
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        /* 내 반 학생 관리 */
        <div>
          {myStudents.length === 0 ? (
            <div className="text-center py-14 text-gray-400">
              <p className="text-sm">담당 학생이 없습니다</p>
            </div>
          ) : (
            <div className="space-y-2">
              {myStudents.map(s => (
                <div
                  key={s.id}
                  className={`rounded-xl p-4 border shadow-sm flex items-center justify-between ${
                    s.withdrawal_status === 'pending'
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-white border-gray-100'
                  }`}
                >
                  <div>
                    <p className="font-semibold text-gray-800">{s.name}</p>
                    <p className="text-xs text-gray-400">{s.grade && `${s.grade} · `}{s.schedule}</p>
                    {s.withdrawal_status === 'pending' && (
                      <p className="text-xs text-amber-600 mt-0.5 font-medium">
                        퇴원 신청 중 · 원장 승인 대기
                      </p>
                    )}
                  </div>
                  {s.withdrawal_status === 'pending' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => cancelWithdrawal(s.id)}
                      disabled={busy}
                      className="text-xs text-gray-500 border-gray-200"
                    >
                      신청 취소
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setWithdrawTarget(s); setWithdrawNote('') }}
                      disabled={busy}
                      className="text-xs text-red-500 border-red-200 hover:bg-red-50"
                    >
                      퇴원 신청
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-500 mt-4 text-center bg-red-50 rounded-xl py-3 px-4">{error}</p>
      )}

      {/* 퇴원 신청 시트 */}
      <Sheet open={!!withdrawTarget} onOpenChange={open => !open && setWithdrawTarget(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>퇴원 신청</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4 pb-4">
            {withdrawTarget && (
              <p className="text-sm text-gray-600">
                <span className="font-semibold text-gray-800">{withdrawTarget.name}</span>
                의 퇴원을 원장님께 신청합니다.
                원장님 승인 후 최종 처리됩니다.
              </p>
            )}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">퇴원 사유 (선택)</label>
              <textarea
                value={withdrawNote}
                onChange={e => setWithdrawNote(e.target.value)}
                placeholder="예: 이사, 개인 사정 등"
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setWithdrawTarget(null)}>
                취소
              </Button>
              <Button
                className="flex-1 bg-red-500 hover:bg-red-600"
                onClick={requestWithdrawal}
                disabled={busy}
              >
                {busy ? '신청 중...' : '퇴원 신청'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
