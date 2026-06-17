// lib/v2/actions.ts — 강사 입력 서버 액션(쓰기). append-only, 출결만 upsert.
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Attendance, MetricType, Difficulty } from '@/types/v2'

async function ctx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  return { supabase, userId: user.id }
}
async function assertOwns(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, studentId: string) {
  const { data } = await supabase.from('students').select('id').eq('id', studentId).eq('instructor_id', userId).single()
  if (!data) throw new Error('Forbidden')
}
const today = () => new Date().toISOString().slice(0, 10)

// 당일 session 보장(없으면 출석 기본). session id 반환.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureSession(supabase: any, userId: string, studentId: string): Promise<string> {
  const { data: existing } = await supabase.from('sessions').select('id').eq('student_id', studentId).eq('session_date', today()).maybeSingle()
  if (existing) return existing.id
  const { data, error } = await supabase.from('sessions')
    .insert({ student_id: studentId, instructor_id: userId, session_date: today(), attendance: '출석' })
    .select('id').single()
  if (error) throw error
  return data.id
}

// 반배정 이동: 오늘 수업할 학생을 호출 강사 본인 반으로 (RPC가 RLS 우회, 항상 auth.uid()로 배정)
export async function assignToMe(studentId: string) {
  const { supabase } = await ctx()
  const { error } = await supabase.rpc('assign_student_to_me', { p_student_id: studentId })
  if (error) throw error
  revalidatePath('/v2/today')
}

export async function markAttendance(studentId: string, attendance: Attendance) {
  const { supabase, userId } = await ctx(); await assertOwns(supabase, userId, studentId)
  const { error } = await supabase.from('sessions')
    .upsert({ student_id: studentId, instructor_id: userId, session_date: today(), attendance }, { onConflict: 'student_id,session_date' })
  if (error) throw error
  revalidatePath('/v2/today')
}

export async function setLaps(studentId: string, laps: number) {
  const { supabase, userId } = await ctx(); await assertOwns(supabase, userId, studentId)
  const sessionId = await ensureSession(supabase, userId, studentId)
  // 같은 날 총 바퀴수는 1행 유지(덮어쓰기 예외): 기존 삭제 후 삽입
  await supabase.from('measurements').delete()
    .eq('student_id', studentId).eq('metric_type', 'laps').is('skill_step_id', null).eq('measured_on', today())
  const { error } = await supabase.from('measurements').insert({
    student_id: studentId, metric_type: 'laps', value: laps, measured_on: today(), session_id: sessionId, instructor_id: userId, skill_step_id: null,
  })
  if (error) throw error
  revalidatePath('/v2/today')
}

export async function passStepAction(studentId: string, step: { id: string; key: string; ladder_order: number }, opts: { difficulty?: Difficulty; measures?: { metric: MetricType; value: number }[] } = {}) {
  const { supabase, userId } = await ctx(); await assertOwns(supabase, userId, studentId)
  const sessionId = await ensureSession(supabase, userId, studentId)
  const { error } = await supabase.from('skill_progress').insert({
    student_id: studentId, skill_step_id: step.id, source: 'observed', difficulty: opts.difficulty ?? null,
    source_session_id: sessionId, instructor_id: userId, step_key_snapshot: step.key, ladder_order_snapshot: step.ladder_order,
  })
  if (error && !String(error.message).includes('duplicate')) throw error
  for (const m of opts.measures ?? []) {
    await supabase.from('measurements').insert({ student_id: studentId, metric_type: m.metric, value: m.value, measured_on: today(), session_id: sessionId, skill_step_id: step.id, instructor_id: userId })
  }
  revalidatePath(`/v2/student/${studentId}`)
}

export async function addAttempt(studentId: string, stepId: string) {
  const { supabase, userId } = await ctx(); await assertOwns(supabase, userId, studentId)
  const sessionId = await ensureSession(supabase, userId, studentId)
  const { error } = await supabase.from('measurements').insert({ student_id: studentId, metric_type: 'attempt', value: 1, measured_on: today(), session_id: sessionId, skill_step_id: stepId, instructor_id: userId })
  if (error) throw error
  revalidatePath(`/v2/student/${studentId}`)
}

export async function completeCounter(studentId: string, step: { id: string; key: string; ladder_order: number }, difficulty?: Difficulty) {
  await passStepAction(studentId, step, { difficulty })
}

export async function logRepeatable(studentId: string, stepId: string, metric: MetricType, value: number) {
  const { supabase, userId } = await ctx(); await assertOwns(supabase, userId, studentId)
  const sessionId = await ensureSession(supabase, userId, studentId)
  const { error } = await supabase.from('measurements').insert({ student_id: studentId, metric_type: metric, value, measured_on: today(), session_id: sessionId, skill_step_id: stepId, instructor_id: userId })
  if (error) throw error
  revalidatePath(`/v2/student/${studentId}`)
}

export async function setBaseline(studentId: string, stepIds: string[], snapshots: Record<string, { key: string; ladder_order: number }>) {
  const { supabase, userId } = await ctx(); await assertOwns(supabase, userId, studentId)
  const rows = stepIds.map(id => ({
    student_id: studentId, skill_step_id: id, source: 'baseline', instructor_id: userId,
    step_key_snapshot: snapshots[id].key, ladder_order_snapshot: snapshots[id].ladder_order,
  }))
  if (rows.length) {
    const { error } = await supabase.from('skill_progress').upsert(rows, { onConflict: 'student_id,skill_step_id', ignoreDuplicates: true })
    if (error) throw error
  }
  revalidatePath(`/v2/student/${studentId}`)
}
