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
// 기록 권한: 원장 ∪ 고정 담당 ∪ 오늘 요일 배정. (오늘 '내 수업' 판정과 동일 기준)
async function assertOwns(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, studentId: string) {
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', userId).single()
  if (prof?.role === 'director') return  // 원장도 수업 — 모든 학생 기록 가능
  const { data: s } = await supabase.from('students').select('instructor_id').eq('id', studentId).single()
  if (s?.instructor_id === userId) return
  const weekday = new Date().getDay()
  const { data: a } = await supabase.from('student_day_instructors')
    .select('instructor_id').eq('student_id', studentId).eq('weekday', weekday).maybeSingle()
  if (a?.instructor_id === userId) return
  throw new Error('Forbidden')
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

// 반배정 이동: 오늘 요일에 한해 학생을 호출 강사 본인 반으로 (그 요일 고정·매주 반복).
// RPC가 RLS 우회, 항상 auth.uid()로 배정.
export async function assignToMe(studentId: string) {
  const { supabase } = await ctx()
  const weekday = new Date().getDay()  // 0=일 ~ 6=토
  const { error } = await supabase.rpc('assign_day_to_me', { p_student_id: studentId, p_weekday: weekday })
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
  revalidatePath('/v2/today'); revalidatePath(`/v2/student/${studentId}`)
}

// 오늘 카드 칩 탭 = "오늘 했음" 토글. 오늘자 attempt 행이 있으면 취소(삭제), 없으면 1건 기록.
// (통과/사다리 진행과 분리 — 탭해도 카드/칩 안 사라짐.)
export async function recordStepToday(studentId: string, stepId: string) {
  const { supabase, userId } = await ctx(); await assertOwns(supabase, userId, studentId)
  const sessionId = await ensureSession(supabase, userId, studentId)
  const { data: existing } = await supabase.from('measurements').select('id')
    .eq('student_id', studentId).eq('skill_step_id', stepId).eq('metric_type', 'attempt').eq('measured_on', today())
  if (existing && existing.length > 0) {
    const { error } = await supabase.from('measurements').delete()
      .eq('student_id', studentId).eq('skill_step_id', stepId).eq('metric_type', 'attempt').eq('measured_on', today())
    if (error) throw error
  } else {
    const { error } = await supabase.from('measurements').insert({
      student_id: studentId, metric_type: 'attempt', value: 1, measured_on: today(), session_id: sessionId, skill_step_id: stepId, instructor_id: userId,
    })
    if (error) throw error
  }
  revalidatePath('/v2/today')
}

// 측정 스텝 입력(초/스트로크/바퀴) — append. 오늘 카드/진도 양쪽 반영.
export async function recordMeasureToday(studentId: string, stepId: string, metric: MetricType, value: number) {
  const { supabase, userId } = await ctx(); await assertOwns(supabase, userId, studentId)
  const sessionId = await ensureSession(supabase, userId, studentId)
  const { error } = await supabase.from('measurements').insert({
    student_id: studentId, metric_type: metric, value, measured_on: today(), session_id: sessionId, skill_step_id: stepId, instructor_id: userId,
  })
  if (error) throw error
  revalidatePath('/v2/today'); revalidatePath(`/v2/student/${studentId}`)
}

// 휴원일 토글(원장 전용): 오늘을 휴원일로 지정/해제. 결석과 무관 — 그 날 수업 자체가 없음.
export async function setClosureToday(closed: boolean) {
  const { supabase, userId } = await ctx()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single()
  if (profile?.role !== 'director') throw new Error('Forbidden')
  if (closed) {
    const { error } = await supabase.from('studio_closures').upsert({ closed_on: today(), created_by: userId }, { onConflict: 'closed_on' })
    if (error) throw error
  } else {
    const { error } = await supabase.from('studio_closures').delete().eq('closed_on', today())
    if (error) throw error
  }
  revalidatePath('/v2/today'); revalidatePath('/v2/director')
}

// 결석 토글: 켜면 attendance='결석', 끄면 '출석'(출석은 암묵 기본).
export async function markAbsent(studentId: string, absent: boolean) {
  const { supabase, userId } = await ctx(); await assertOwns(supabase, userId, studentId)
  const { error } = await supabase.from('sessions')
    .upsert({ student_id: studentId, instructor_id: userId, session_date: today(), attendance: absent ? '결석' : '출석' }, { onConflict: 'student_id,session_date' })
  if (error) throw error
  revalidatePath('/v2/today')
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
