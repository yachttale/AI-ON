'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  CURRICULUM, DIFFICULTY_OPTIONS, DIFFICULTY_COLOR, ALL_STEPS,
  getCurrentStep, getProgressBySection,
  type Difficulty,
} from '@/lib/curriculum'
import type { SkillCheckpoint } from '@/types/database'

interface Props {
  studentId: string
  initialCheckpoints: SkillCheckpoint[]
  readOnly?: boolean
}

export default function CheckpointBoard({ studentId, initialCheckpoints, readOnly = false }: Props) {
  const [checkpoints, setCheckpoints] = useState<SkillCheckpoint[]>(initialCheckpoints)
  const [activeSection, setActiveSection] = useState(CURRICULUM[0].key)
  const [pendingStep, setPendingStep] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const passedMap = new Map(checkpoints.map(c => [c.skill_key, c]))
  const passedKeys = checkpoints.map(c => c.skill_key)
  const progress = getProgressBySection(passedKeys)
  const currentStep = getCurrentStep(passedKeys)
  const section = CURRICULUM.find(s => s.key === activeSection)!

  async function handleCheck(skillKey: string, difficulty: Difficulty) {
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const today = new Date().toISOString().slice(0, 10)
    const { data, error } = await supabase
      .from('skill_checkpoints')
      .insert({
        student_id: studentId,
        skill_key: skillKey,
        difficulty,
        passed_at: today,
        instructor_id: user?.id ?? null,
      })
      .select()
      .single()

    if (!error && data) {
      setCheckpoints(prev => [...prev, data as SkillCheckpoint])
    }
    setPendingStep(null)
    setSaving(false)
  }

  const pendingStepInfo = pendingStep
    ? ALL_STEPS.find(s => s.key === pendingStep)
    : null

  return (
    <div>
      {/* 현재 단계 */}
      {currentStep ? (
        <div className="mb-4 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3">
          <p className="text-xs text-sky-500 font-medium mb-0.5">현재 도전 단계</p>
          <p className="text-sm font-bold text-sky-700">{currentStep.label}</p>
          <p className="text-xs text-sky-400 mt-0.5">#{currentStep.order} / {ALL_STEPS.length}단계</p>
        </div>
      ) : (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
          <p className="text-sm font-bold text-yellow-700">전 과정 완료! 🏆</p>
        </div>
      )}

      {/* 섹션 탭 */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4 no-scrollbar">
        {CURRICULUM.map(s => {
          const p = progress[s.key]
          const isActive = activeSection === s.key
          return (
            <button
              key={s.key}
              onClick={() => setActiveSection(s.key)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={
                isActive
                  ? { backgroundColor: s.color, color: '#fff' }
                  : { backgroundColor: '#f3f4f6', color: '#6b7280' }
              }
            >
              {s.label}
              {p.passed > 0 && (
                <span className={`ml-1 ${isActive ? 'opacity-80' : 'text-gray-400'}`}>
                  {p.passed}/{p.total}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* 진도 바 */}
      <div className="mb-5">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>{section.label} 진도</span>
          <span>{progress[section.key].percent}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progress[section.key].percent}%`, backgroundColor: section.color }}
          />
        </div>
      </div>

      {/* 체크포인트 목록 */}
      <div className="space-y-5">
        {section.groups.map(group => (
          <div key={group.key}>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 px-1">
              {group.label}
            </p>
            <div className="space-y-2">
              {group.steps.map(step => {
                const cp = passedMap.get(step.key)
                const isPassed = !!cp
                const diff = cp?.difficulty as Difficulty | undefined

                return (
                  <button
                    key={step.key}
                    onClick={() => {
                      if (!readOnly && !isPassed) setPendingStep(step.key)
                    }}
                    className={`w-full text-left px-4 py-3 rounded-xl flex items-center justify-between transition-all ${
                      isPassed
                        ? 'bg-green-50 border border-green-200'
                        : readOnly
                        ? 'bg-white border border-gray-100 cursor-default'
                        : 'bg-white border border-gray-100 active:bg-gray-50 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                          isPassed ? 'bg-green-500 text-white' : 'border-2 border-gray-200 text-gray-300'
                        }`}
                      >
                        {isPassed ? '✓' : step.order}
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${isPassed ? 'text-green-800' : 'text-gray-600'}`}>
                          {step.label}
                        </p>
                        {isPassed && cp?.passed_at && (
                          <p className="text-xs text-green-400">{cp.passed_at}</p>
                        )}
                      </div>
                    </div>
                    {diff && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                        style={{
                          backgroundColor: DIFFICULTY_COLOR[diff] + '22',
                          color: DIFFICULTY_COLOR[diff],
                          border: `1px solid ${DIFFICULTY_COLOR[diff]}44`,
                        }}
                      >
                        {diff}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 난이도 선택 바텀시트 */}
      {pendingStep && (
        <div className="fixed inset-0 z-50" onClick={() => setPendingStep(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-6"
            style={{ maxWidth: '36rem', margin: '0 auto' }}
            onClick={e => e.stopPropagation()}
          >
            <p className="text-sm font-bold text-gray-800 mb-0.5">난이도를 선택하세요</p>
            <p className="text-xs text-gray-400 mb-4">{pendingStepInfo?.label}</p>
            <div className="space-y-2">
              {DIFFICULTY_OPTIONS.map(d => (
                <button
                  key={d}
                  onClick={() => handleCheck(pendingStep, d)}
                  disabled={saving}
                  className="w-full py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50"
                  style={{
                    backgroundColor: DIFFICULTY_COLOR[d] + '18',
                    color: DIFFICULTY_COLOR[d],
                    border: `1.5px solid ${DIFFICULTY_COLOR[d]}55`,
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
            <button
              onClick={() => setPendingStep(null)}
              className="w-full mt-3 py-2.5 rounded-xl text-sm text-gray-400 bg-gray-50"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
