'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  student: { id: string; name: string }
  stroke: string
  completionDate: string
  initialSeconds: number | null
  instructorName?: string | null
  readonly?: boolean
}

function fmtRecord(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}분 ${String(sec).padStart(2, '0')}초` : `${sec}초`
}

function fmtKorDate(d: string): string {
  const [y, m, day] = d.split('-')
  return `${y}년 ${parseInt(m)}월 ${parseInt(day)}일`
}

export default function CertificateView({ student, stroke, completionDate, initialSeconds, instructorName, readonly = false }: Props) {
  const [min, setMin] = useState(initialSeconds !== null ? String(Math.floor(initialSeconds / 60)) : '')
  const [sec, setSec] = useState(initialSeconds !== null ? String(initialSeconds % 60) : '')
  const [savedSec, setSavedSec] = useState<number | null>(initialSeconds)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(initialSeconds !== null)

  const totalSec = (parseInt(min || '0') * 60) + parseInt(sec || '0')
  const hasTime = min !== '' || sec !== ''

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('completion_records').insert({
      student_id: student.id,
      stroke,
      completed_date: completionDate,
      record_seconds: hasTime ? totalSec : null,
      instructor_id: user?.id ?? null,
      passed: true,
    })
    setSavedSec(hasTime ? totalSec : null)
    setSaved(true)
    setSaving(false)
  }

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #starkids-certificate, #starkids-certificate * { visibility: visible; }
          #starkids-certificate {
            position: fixed;
            left: 0; top: 0;
            width: 100vw;
            padding: 15mm;
            box-sizing: border-box;
          }
          @page { margin: 0; size: A4 portrait; }
        }
      `}</style>

      {/* 컨트롤 - 인쇄 시 숨김 */}
      <div className="print:hidden mb-5 bg-white rounded-2xl p-4 shadow-sm space-y-4">
        {!readonly && (
          <>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-1">기록 입력
                <span className="ml-1 text-gray-400 font-normal text-xs">(선택사항)</span>
              </p>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="number" min="0" max="99" value={min}
                  onChange={e => setMin(e.target.value)}
                  placeholder="0"
                  className="w-16 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
                <span className="text-sm text-gray-500">분</span>
                <input
                  type="number" min="0" max="59" value={sec}
                  onChange={e => setSec(e.target.value)}
                  placeholder="00"
                  className="w-16 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
                <span className="text-sm text-gray-500">초</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {saving ? '저장 중...' : saved ? '✓ 저장됨' : '저장'}
              </button>
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                인쇄 / PDF 저장
              </button>
            </div>
          </>
        )}
        {readonly && (
          <button
            onClick={() => window.print()}
            className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            🖨️ 인쇄 / PDF 저장
          </button>
        )}
      </div>

      {/* 증명서 본체 */}
      <div id="starkids-certificate" className="bg-white rounded-2xl shadow-sm p-3">
        <div className="border-4 border-double border-sky-300 rounded-xl p-8 text-center">

          {/* 수영장 이름 */}
          <div className="mb-5">
            <p className="text-xs text-gray-400 tracking-[0.25em] mb-1">STARKIDS SWIMMING POOL</p>
            <h2 className="text-2xl font-bold text-sky-600 tracking-widest">스타키즈 수영장</h2>
            <div className="flex justify-center gap-1.5 mt-2">
              <span className="text-yellow-400 text-sm">★</span>
              <span className="text-yellow-400 text-sm">★</span>
              <span className="text-yellow-400 text-sm">★</span>
            </div>
          </div>

          <div className="border-t border-sky-100 mb-5" />

          {/* 제목 */}
          <h1 className="text-[1.7rem] font-bold text-gray-800 tracking-[0.25em] mb-6">
            수영 완주 인증서
          </h1>

          {/* 설명 */}
          <p className="text-sm text-gray-500 leading-7 mb-6">
            위 학생은 스타키즈 수영장에서<br />
            아래와 같이 수영을 혼자 힘으로 완주하였음을<br />
            이에 인증합니다.
          </p>

          {/* 정보 영역 */}
          <div className="bg-sky-50 rounded-xl px-6 py-5 text-left space-y-3 mb-6 mx-2">
            <div className="flex items-baseline gap-3">
              <span className="text-xs text-gray-500 w-14 shrink-0">성  명</span>
              <span className="h-3 border-l border-gray-300" />
              <span className="text-lg font-bold text-gray-800 tracking-widest">{student.name}</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-xs text-gray-500 w-14 shrink-0">영  법</span>
              <span className="h-3 border-l border-gray-300" />
              <span className="text-lg font-bold text-sky-700">{stroke} 완주</span>
            </div>
            {savedSec !== null && (
              <div className="flex items-baseline gap-3">
                <span className="text-xs text-gray-500 w-14 shrink-0">기  록</span>
                <span className="h-3 border-l border-gray-300" />
                <span className="text-lg font-bold text-gray-800">{fmtRecord(savedSec)}</span>
              </div>
            )}
            <div className="flex items-baseline gap-3">
              <span className="text-xs text-gray-500 w-14 shrink-0">완주일</span>
              <span className="h-3 border-l border-gray-300" />
              <span className="text-sm text-gray-700">{fmtKorDate(completionDate)}</span>
            </div>
            {instructorName && (
              <div className="flex items-baseline gap-3">
                <span className="text-xs text-gray-500 w-14 shrink-0">담당강사</span>
                <span className="h-3 border-l border-gray-300" />
                <span className="text-sm text-gray-700">{instructorName}</span>
              </div>
            )}
          </div>

          {/* 축하 메시지 */}
          <p className="text-sm text-gray-600 leading-7 mb-6">
            끝까지 포기하지 않고 도전한<br />
            <strong className="text-sky-600 text-base">{student.name}</strong> 학생을 진심으로 축하합니다!<br />
            앞으로도 건강하고 즐거운 수영을 함께하기를 바랍니다.
          </p>

          <div className="border-t border-sky-100 mb-5" />

          {/* 날짜 & 서명 */}
          <div className="space-y-1 mb-4">
            <p className="text-sm text-gray-500">{fmtKorDate(completionDate)}</p>
            <p className="text-xl font-bold text-gray-700 tracking-[0.2em]">스타키즈 수영장</p>
          </div>

          {/* 하단 장식 */}
          <div className="flex justify-center items-center gap-3 text-sky-300 text-sm">
            <span>~</span>
            <span className="text-yellow-400">★</span>
            <span>~</span>
            <span className="text-yellow-400">★</span>
            <span>~</span>
            <span className="text-yellow-400">★</span>
            <span>~</span>
          </div>
        </div>
      </div>
    </>
  )
}
