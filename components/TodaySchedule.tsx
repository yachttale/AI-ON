'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getEntriesForDate } from '@/lib/schedule'
import { getKSTDateString } from '@/lib/utils'
import StudentCard from '@/components/StudentCard'
import SessionForm, { type SaveData } from '@/components/SessionForm'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { Student, SessionLog, Profile } from '@/types/database'

interface StudentEntry {
  student: Student
  latestLog: SessionLog | null
  dayLog: SessionLog | null
  hour: number
}

interface DaySection {
  date: Date
  dateStr: string
  label: string
  isToday: boolean
  entries: StudentEntry[]
}

interface Selected {
  entry: StudentEntry
  dateStr: string
}

const DAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']

function getOffsetDate(offset: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  return d
}

export default function TodaySchedule() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [sections, setSections] = useState<DaySection[]>([])
  const [allStudents, setAllStudents] = useState<Student[]>([])
  const [latestLogMap, setLatestLogMap] = useState<Map<string, SessionLog | null>>(new Map())
  const [selected, setSelected] = useState<Selected | null>(null)
  const [makeupSection, setMakeupSection] = useState<DaySection | null>(null)
  const [makeupQuery, setMakeupQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [quickSavingId, setQuickSavingId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: prof }, { data: activeStudents }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('students').select('*').eq('is_active', true),
    ])
    setProfile(prof)
    setAllStudents(activeStudents ?? [])

    const myStudents = (activeStudents ?? []).filter(s => s.instructor_id === user.id)
    const allIds = (activeStudents ?? []).map(s => s.id)

    const days = [0, 1, 2].map(offset => ({
      date: getOffsetDate(offset),
      dateStr: getKSTDateString(offset),
      offset,
    }))
    const dateStrs = days.map(d => d.dateStr)

    const [{ data: allLogs }, { data: periodLogs }] = await Promise.all([
      supabase
        .from('session_logs')
        .select('*')
        .in('student_id', allIds)
        .not('stroke', 'is', null)
        .order('session_date', { ascending: false }),
      supabase
        .from('session_logs')
        .select('*')
        .in('student_id', allIds)
        .in('session_date', dateStrs),
    ])

    const seen = new Set<string>()
    const logMap = new Map<string, SessionLog | null>()
    for (const log of allLogs ?? []) {
      if (!seen.has(log.student_id)) {
        seen.add(log.student_id)
        logMap.set(log.student_id, log)
      }
    }
    setLatestLogMap(logMap)

    const result: DaySection[] = days.map(({ date, dateStr, offset }) => {
      const dayStudents = myStudents
        .filter(s => getEntriesForDate(s.schedule, date).length > 0)
        .map(s => ({
          student: s,
          latestLog: logMap.get(s.id) ?? null,
          dayLog: (periodLogs ?? []).find(l => l.student_id === s.id && l.session_date === dateStr) ?? null,
          hour: getEntriesForDate(s.schedule, date)[0]?.hour ?? 99,
        }))
        .sort((a, b) => a.hour - b.hour)

      const dayName = DAY_NAMES[date.getDay()]
      const label = offset === 0
        ? `${dayName} (오늘)`
        : offset === 1
          ? `${dayName} 1일 전 (${date.getMonth() + 1}/${date.getDate()})`
          : `${dayName} 2일 전 (${date.getMonth() + 1}/${date.getDate()})`

      return { date, dateStr, label, isToday: offset === 0, entries: dayStudents }
    })

    setSections(result)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function handleSave(data: SaveData) {
    if (!selected) return
    const supabase = createClient()
    const { completionSeconds, seconds25, secondsIM, secondsMastery, ...logData } = data
    const isUpdate = !!selected.entry.dayLog

    if (isUpdate) {
      await supabase.from('session_logs').update(logData).eq('id', selected.entry.dayLog!.id)

      const prev = selected.entry.dayLog!
      const wasCompleted = prev.stage === '완주' && prev.status === '통과' && prev.stroke
      const isNowCompleted = logData.stage === '완주' && logData.status === '통과' && logData.stroke

      if (wasCompleted && !isNowCompleted) {
        await supabase.from('completion_records')
          .delete()
          .eq('student_id', logData.student_id)
          .eq('stroke', prev.stroke!)
          .eq('completed_date', selected.dateStr)
          .eq('passed', true)
          .is('notes', null)
      } else if (!wasCompleted && isNowCompleted) {
        await supabase.from('completion_records').insert({
          student_id: logData.student_id,
          stroke: logData.stroke!,
          completed_date: selected.dateStr,
          record_seconds: completionSeconds ?? null,
          instructor_id: logData.instructor_id,
          passed: true,
        })
      }
      if (logData.stroke === '마스터') {
        await supabase.from('swim_distances')
          .delete()
          .eq('student_id', logData.student_id)
          .eq('logged_date', selected.dateStr)
        if (logData.stage) {
          const distEntries = logData.stage.split(' / ').flatMap(entry => {
            const match = entry.match(/^(.+?)\s+(\d+)m$/)
            return match ? [{ stroke: match[1], distance_m: parseInt(match[2]) }] : []
          })
          if (distEntries.length > 0) {
            await supabase.from('swim_distances').insert(
              distEntries.map(e => ({
                student_id: logData.student_id,
                logged_date: selected.dateStr,
                stroke: e.stroke,
                distance_m: e.distance_m,
              }))
            )
          }
        }
      }
    } else {
      await supabase.from('session_logs').insert({ ...logData, session_date: selected.dateStr })

      if (logData.stage === '완주' && logData.status === '통과' && logData.stroke) {
        await supabase.from('completion_records').insert({
          student_id: logData.student_id,
          stroke: logData.stroke,
          completed_date: selected.dateStr,
          record_seconds: completionSeconds ?? null,
          instructor_id: logData.instructor_id,
          passed: true,
        })
      }
      if (seconds25 && logData.stroke && logData.stroke !== '마스터') {
        await supabase.from('completion_records').insert({
          student_id: logData.student_id,
          stroke: logData.stroke,
          completed_date: selected.dateStr,
          record_seconds: seconds25,
          instructor_id: logData.instructor_id,
          passed: false,
          notes: '25m',
        })
      }
      if (secondsIM) {
        await supabase.from('completion_records').insert({
          student_id: logData.student_id,
          stroke: 'IM',
          completed_date: selected.dateStr,
          record_seconds: secondsIM,
          instructor_id: logData.instructor_id,
          passed: false,
          notes: 'IM',
        })
      }
      if (secondsMastery && logData.stage === '숙달' && logData.stroke) {
        await supabase.from('completion_records').insert({
          student_id: logData.student_id,
          stroke: logData.stroke,
          completed_date: selected.dateStr,
          record_seconds: secondsMastery,
          instructor_id: logData.instructor_id,
          passed: true,
          notes: '숙달',
        })
      }
      if (logData.stroke === '마스터' && logData.stage) {
        const distEntries = logData.stage.split(' / ').flatMap(entry => {
          const match = entry.match(/^(.+?)\s+(\d+)m$/)
          return match ? [{ stroke: match[1], distance_m: parseInt(match[2]) }] : []
        })
        if (distEntries.length > 0) {
          await supabase.from('swim_distances').insert(
            distEntries.map(e => ({
              student_id: logData.student_id,
              logged_date: selected.dateStr,
              stroke: e.stroke,
              distance_m: e.distance_m,
            }))
          )
        }
      }
    }

    setSelected(null)
    await loadData()
  }

  async function handleQuickSave(entry: StudentEntry, dateStr: string) {
    if (!profile || entry.dayLog) return
    const supabase = createClient()
    const latest = entry.latestLog
    setQuickSavingId(entry.student.id)
    await supabase.from('session_logs').insert({
      student_id: entry.student.id,
      instructor_id: profile.id,
      session_date: dateStr,
      attendance: '출석',
      stroke: latest?.stroke ?? null,
      stage: latest?.stage ?? null,
      status: latest?.status ?? '진행중',
      memo: null,
    })
    setQuickSavingId(null)
    await loadData()
  }

  function getMakeupCandidates(section: DaySection): Student[] {
    const inSection = new Set(section.entries.map(e => e.student.id))
    return allStudents.filter(s => !inSection.has(s.id))
  }

  return (
    <div>
      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {sections.map(section => {
            const done = section.entries.filter(e => e.dayLog).length
            const total = section.entries.length
            return (
              <div key={section.dateStr}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className={`font-bold ${section.isToday ? 'text-sky-600 text-lg' : 'text-gray-500 text-base'}`}>
                    {section.label}
                  </h2>
                  <div className="flex items-center gap-3">
                    {total > 0 && (
                      <span className={`text-sm font-medium ${done === total ? 'text-green-600' : 'text-gray-400'}`}>
                        {done}/{total}명
                      </span>
                    )}
                    <button
                      onClick={() => setMakeupSection(section)}
                      className="text-xs text-sky-500 border border-sky-200 rounded-lg px-2 py-1 hover:bg-sky-50"
                    >
                      + 보강
                    </button>
                  </div>
                </div>
                {total === 0 ? (
                  <p className="text-sm text-gray-300 py-3 text-center">수업 학생 없음</p>
                ) : (
                  <div className="space-y-3">
                    {section.entries.map(entry => (
                      <StudentCard
                        key={entry.student.id + section.dateStr}
                        student={entry.student}
                        latestLog={entry.latestLog}
                        todayLog={entry.dayLog}
                        onQuickSave={() => handleQuickSave(entry, section.dateStr)}
                        onOpen={() => setSelected({ entry, dateStr: section.dateStr })}
                        quickSaving={quickSavingId === entry.student.id}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="sr-only"><SheetTitle>수업 기록 입력</SheetTitle></SheetHeader>
          {selected && profile && (
            <SessionForm
              student={selected.entry.student}
              latestLog={selected.entry.latestLog}
              existingLog={selected.entry.dayLog}
              instructorId={profile.id}
              onSave={handleSave}
              onCancel={() => setSelected(null)}
            />
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={!!makeupSection} onOpenChange={open => { if (!open) { setMakeupSection(null); setMakeupQuery('') } }}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
          <div className="max-w-lg mx-auto px-2">
            <SheetHeader>
              <SheetTitle className="text-base">
                보강 학생 추가
                {makeupSection && (
                  <span className="ml-2 text-sm font-normal text-gray-400">{makeupSection.label}</span>
                )}
              </SheetTitle>
            </SheetHeader>
            <div className="mt-3">
              <input
                type="text"
                value={makeupQuery}
                onChange={e => setMakeupQuery(e.target.value)}
                placeholder="이름 검색..."
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 mb-3"
              />
            </div>
            <div className="space-y-2 pb-6">
              {makeupSection && (() => {
                const candidates = getMakeupCandidates(makeupSection).filter(s =>
                  !makeupQuery.trim() || s.name.includes(makeupQuery.trim())
                )
                if (candidates.length === 0) return (
                  <p className="text-sm text-gray-400 text-center py-8">
                    {getMakeupCandidates(makeupSection).length === 0 ? '모든 학생이 이미 포함되어 있습니다' : '검색 결과 없음'}
                  </p>
                )
                return candidates.map(student => (
                  <button
                    key={student.id}
                    onClick={() => {
                      setSelected({
                        entry: {
                          student,
                          latestLog: latestLogMap.get(student.id) ?? null,
                          dayLog: null,
                          hour: 0,
                        },
                        dateStr: makeupSection.dateStr,
                      })
                      setMakeupSection(null)
                    }}
                    className="w-full text-left bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm hover:border-sky-300 transition-colors"
                  >
                    <p className="font-semibold text-gray-800">{student.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{student.grade && `${student.grade} · `}{student.schedule}</p>
                  </button>
                ))
              })()}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
