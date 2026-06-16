'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

interface Instructor {
  id: string
  name: string
}

interface Props {
  studentId: string
  studentName: string
  instructors: Instructor[]
}

export default function TransferStudentButton({ studentId, studentName, instructors }: Props) {
  const [open, setOpen] = useState(false)
  const [transferring, setTransferring] = useState(false)
  const router = useRouter()

  async function handleTransfer(instructorId: string, instructorName: string) {
    if (!confirm(`${studentName} 학생을 ${instructorName} 강사에게 이동할까요?`)) return
    setTransferring(true)
    const supabase = createClient()
    await supabase.from('students').update({ instructor_id: instructorId }).eq('id', studentId)
    setOpen(false)
    router.push('/instructor/today')
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-xl text-sm font-medium transition-colors"
      >
        반 이동
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <div className="max-w-lg mx-auto px-2 pb-6">
            <SheetHeader>
              <SheetTitle>담당 강사 변경</SheetTitle>
            </SheetHeader>
            <p className="text-sm text-gray-500 mt-1 mb-4">{studentName} 학생을 이동할 강사를 선택하세요.</p>
            {instructors.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">다른 강사가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {instructors.map(inst => (
                  <button
                    key={inst.id}
                    onClick={() => handleTransfer(inst.id, inst.name)}
                    disabled={transferring}
                    className="w-full text-left px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-sky-400 hover:bg-sky-50 transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    {inst.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
