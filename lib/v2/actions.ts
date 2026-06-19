// lib/v2/actions.ts — 강사 입력 서버 액션(쓰기). append-only, 출결만 upsert.
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { kstToday, kstWeekday, kstDaysAgo } from '@/lib/v2/now'
import type { Attendance, MetricType, Difficulty } from '@/types/v2'

async function ctx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  return { supabase, userId: user.id }
}
// 기록 권한: 원장 ∪ 고정 담당 ∪ 오늘 요일 배정. (오늘 '내 수업' 판정과 동일 기준)
async function assertOwns(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, studentId: string) {
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
  if (prof?.role === 'director') return  // 원장도 수업 — 모든 학생 기록 가능
  const { data: s } = await supabase.from('students').select('instructor_id').eq('id', studentId).maybeSingle()
  if (s?.instructor_id === userId) return  // 고정 담당
  const weekday = kstWeekday()
  const { data: a } = await supabase.from('student_day_instructors')
    .select('instructor_id').eq('student_id', studentId).eq('weekday', weekday).maybeSingle()
  if (a?.instructor_id === userId) return  // 오늘 요일 배정(오버라이드)
  throw new Error('Forbidden')
}
const today = kstToday

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

// 아이 입력용 세션 보장: 없으면 pending·child로 생성, 있으면 reported_step만 갱신(확정 전까지).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureChildSession(supabase: any, userId: string, studentId: string, reportedStepId: string | null): Promise<string> {
  const { data: existing } = await supabase.from('sessions')
    .select('id,status').eq('student_id', studentId).eq('session_date', today()).maybeSingle()
  if (existing) {
    // 이미 강사가 확정한 세션은 건드리지 않음
    if (existing.status !== 'confirmed' && reportedStepId) {
      await supabase.from('sessions').update({ reported_step_id: reportedStepId }).eq('id', existing.id)
    }
    return existing.id
  }
  const { data, error } = await supabase.from('sessions').insert({
    student_id: studentId, instructor_id: userId, session_date: today(),
    attendance: '출석', input_source: 'child', status: 'pending', reported_step_id: reportedStepId,
  }).select('id').single()
  if (error) throw error
  return data.id
}

// 반배정 이동: 오늘 요일에 한해 학생을 호출 강사 본인 반으로 (그 요일 고정·매주 반복).
// RPC가 RLS 우회, 항상 auth.uid()로 배정.
export async function assignToMe(studentId: string) {
  const { supabase } = await ctx()
  const weekday = kstWeekday()  // 0=일 ~ 6=토 (KST)
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

async function isDirector(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
  return data?.role === 'director'
}

// 담당 강사(반) 변경 / 미배정. instructorId=null → 미배정. 원장은 임의 배정, 강사는 본인 학생 해제만.
// 요일배정을 정리해 정적 담당을 단일 기준으로 둠.
export async function setStudentInstructor(studentId: string, instructorId: string | null) {
  const { supabase, userId } = await ctx()
  const director = await isDirector(supabase, userId)
  if (!director) {
    await assertOwns(supabase, userId, studentId)
    if (instructorId !== null && instructorId !== userId) throw new Error('Forbidden')
  }
  await supabase.from('student_day_instructors').delete().eq('student_id', studentId)
  const { error } = await supabase.from('students').update({ instructor_id: instructorId }).eq('id', studentId)
  if (error) throw error
  for (const p of ['/v2/today', '/v2/students', '/v2/director', '/v2/director/students', `/v2/student/${studentId}`]) revalidatePath(p)
}

// 퇴원 신청(강사) → pending. 원장이 승인하면 비활성.
export async function requestWithdrawal(studentId: string, note?: string) {
  const { supabase, userId } = await ctx(); await assertOwns(supabase, userId, studentId)
  const { error } = await supabase.from('students')
    .update({ withdrawal_status: 'pending', withdrawal_requested_by: userId, withdrawal_note: note ?? null }).eq('id', studentId)
  if (error) throw error
  revalidatePath('/v2/director'); revalidatePath(`/v2/student/${studentId}`)
}
export async function cancelWithdrawal(studentId: string) {
  const { supabase, userId } = await ctx(); await assertOwns(supabase, userId, studentId)
  const { error } = await supabase.from('students')
    .update({ withdrawal_status: null, withdrawal_requested_by: null, withdrawal_note: null, is_active: true }).eq('id', studentId)
  if (error) throw error
  for (const p of ['/v2/today', '/v2/students', '/v2/director', `/v2/student/${studentId}`]) revalidatePath(p)
}
export async function approveWithdrawal(studentId: string) {
  const { supabase, userId } = await ctx()
  if (!await isDirector(supabase, userId)) throw new Error('Forbidden')
  const { error } = await supabase.from('students')
    .update({ withdrawal_status: 'approved', is_active: false }).eq('id', studentId)
  if (error) throw error
  for (const p of ['/v2/today', '/v2/students', '/v2/director', '/v2/director/students', `/v2/student/${studentId}`]) revalidatePath(p)
}

// 결석 토글: 켜면 attendance='결석', 끄면 '출석'(출석은 암묵 기본).
export async function markAbsent(studentId: string, absent: boolean) {
  const { supabase, userId } = await ctx(); await assertOwns(supabase, userId, studentId)
  const { error } = await supabase.from('sessions')
    .upsert({ student_id: studentId, instructor_id: userId, session_date: today(), attendance: absent ? '결석' : '출석' }, { onConflict: 'student_id,session_date' })
  if (error) throw error
  revalidatePath('/v2/today')
}

// 과거 날짜 기록 (어제/그전날) — 최대 2일 전까지만 허용 (3일 이상 → 잠금)
function validateRecordDate(date: string) {
  const cutoff = kstDaysAgo(2)
  if (date < cutoff) throw new Error('기록 기간이 지났습니다 (최대 2일 전까지)')
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureSessionForDate(supabase: any, userId: string, studentId: string, date: string): Promise<string> {
  const { data: existing } = await supabase.from('sessions').select('id').eq('student_id', studentId).eq('session_date', date).maybeSingle()
  if (existing) return existing.id
  const { data, error } = await supabase.from('sessions')
    .insert({ student_id: studentId, instructor_id: userId, session_date: date, attendance: '출석' })
    .select('id').single()
  if (error) throw error
  return data.id
}
async function assertOwnsForDate(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, studentId: string, date: string) {
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
  if (prof?.role === 'director') return
  const { data: s } = await supabase.from('students').select('instructor_id').eq('id', studentId).maybeSingle()
  if (s?.instructor_id === userId) return
  const weekday = new Date(date + 'T12:00:00+09:00').getDay()
  const { data: a } = await supabase.from('student_day_instructors')
    .select('instructor_id').eq('student_id', studentId).eq('weekday', weekday).maybeSingle()
  if (a?.instructor_id === userId) return
  throw new Error('Forbidden')
}
export async function markAbsentForDate(studentId: string, absent: boolean, date: string) {
  validateRecordDate(date)
  const { supabase, userId } = await ctx(); await assertOwnsForDate(supabase, userId, studentId, date)
  const { error } = await supabase.from('sessions')
    .upsert({ student_id: studentId, instructor_id: userId, session_date: date, attendance: absent ? '결석' : '출석' }, { onConflict: 'student_id,session_date' })
  if (error) throw error
  revalidatePath('/v2/today')
}
export async function recordStepForDate(studentId: string, stepId: string, date: string) {
  validateRecordDate(date)
  const { supabase, userId } = await ctx(); await assertOwnsForDate(supabase, userId, studentId, date)
  const sessionId = await ensureSessionForDate(supabase, userId, studentId, date)
  const { data: existing } = await supabase.from('measurements').select('id')
    .eq('student_id', studentId).eq('skill_step_id', stepId).eq('metric_type', 'attempt').eq('measured_on', date)
  if (existing && existing.length > 0) {
    const { error } = await supabase.from('measurements').delete()
      .eq('student_id', studentId).eq('skill_step_id', stepId).eq('metric_type', 'attempt').eq('measured_on', date)
    if (error) throw error
  } else {
    const { error } = await supabase.from('measurements').insert({
      student_id: studentId, metric_type: 'attempt', value: 1, measured_on: date, session_id: sessionId, skill_step_id: stepId, instructor_id: userId,
    })
    if (error) throw error
  }
  revalidatePath('/v2/today')
}
export async function recordMeasureForDate(studentId: string, stepId: string, metric: MetricType, value: number, date: string) {
  validateRecordDate(date)
  const { supabase, userId } = await ctx(); await assertOwnsForDate(supabase, userId, studentId, date)
  const sessionId = await ensureSessionForDate(supabase, userId, studentId, date)
  const { error } = await supabase.from('measurements').insert({
    student_id: studentId, metric_type: metric, value, measured_on: date, session_id: sessionId, skill_step_id: stepId, instructor_id: userId,
  })
  if (error) throw error
  revalidatePath('/v2/today')
}

// 계단식 통과: 같은 영법의 ladder_order 이하 ladder 단계를 모두 통과(상위 클릭 → 하위 자동). single/counter/repeatable 제외.
export async function passLadderCascade(studentId: string, step: { id: string; key: string; ladder_order: number; stroke_key: string }, opts: { measures?: { metric: MetricType; value: number }[] } = {}) {
  const { supabase, userId } = await ctx(); await assertOwns(supabase, userId, studentId)
  const sessionId = await ensureSession(supabase, userId, studentId)
  const { data: version } = await supabase.from('curriculum_versions').select('id').eq('status', 'active').maybeSingle()
  if (!version) return
  const { data: stroke } = await supabase.from('strokes').select('id').eq('key', step.stroke_key).maybeSingle()
  if (!stroke) return
  const { data: steps } = await supabase.from('skill_steps').select('id,key,ladder_order')
    .eq('curriculum_version_id', version.id).eq('stroke_id', stroke.id).eq('step_kind', 'ladder')
    .lte('ladder_order', step.ladder_order)
  const rows = (steps ?? []).map(s => ({
    student_id: studentId, skill_step_id: s.id, source: 'observed', instructor_id: userId,
    source_session_id: sessionId, step_key_snapshot: s.key, ladder_order_snapshot: s.ladder_order,
  }))
  if (rows.length) {
    const { error } = await supabase.from('skill_progress').upsert(rows, { onConflict: 'student_id,skill_step_id', ignoreDuplicates: true })
    if (error) throw error
  }
  // 클릭한 단계의 측정값(완주 시간·스트로크)만 기록
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

// 개별 체크(구르기·물대포 등) 토글 — 진도 사다리와 무관한 물 적응 지표. 체크/해제 자유.
export async function toggleSingleCheck(studentId: string, step: { id: string; key: string; ladder_order: number }, checked: boolean) {
  const { supabase, userId } = await ctx(); await assertOwns(supabase, userId, studentId)
  if (checked) {
    const { error } = await supabase.from('skill_progress').delete().eq('student_id', studentId).eq('skill_step_id', step.id)
    if (error) throw error
  } else {
    const sessionId = await ensureSession(supabase, userId, studentId)
    const { error } = await supabase.from('skill_progress').insert({
      student_id: studentId, skill_step_id: step.id, source: 'observed', instructor_id: userId,
      source_session_id: sessionId, step_key_snapshot: step.key, ladder_order_snapshot: step.ladder_order,
    })
    if (error && !String(error.message).includes('duplicate')) throw error
  }
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

// 당일 session 확정: status='confirmed', confirmed_by=userId, confirmed_at=now.
export async function confirmSession(studentId: string) {
  const { supabase, userId } = await ctx(); await assertOwns(supabase, userId, studentId)
  const { error } = await supabase.from('sessions')
    .update({ status: 'confirmed', confirmed_by: userId, confirmed_at: new Date().toISOString() })
    .eq('student_id', studentId).eq('session_date', today())
  if (error) throw error
  revalidatePath('/v2/today')
}

// 아이가 보고한 단계를 통과로 인정(계단식) + 확정. 강사 한 탭.
export async function acceptReportedStep(studentId: string, step: { id: string; key: string; ladder_order: number; stroke_key: string }) {
  await passLadderCascade(studentId, step)  // skill_progress(observed) 적재
  await confirmSession(studentId)
}

// 아이 패드 입력: 출석(자동) + 오늘 한 단계(보고) + 바퀴수. 통과 판정 없음(강사 확인 단계에서).
export async function childReportActivity(studentId: string, reportedStepId: string | null, laps: number | null) {
  const { supabase, userId } = await ctx(); await assertOwns(supabase, userId, studentId)
  const sessionId = await ensureChildSession(supabase, userId, studentId, reportedStepId)
  if (laps != null && laps > 0) {
    await supabase.from('measurements').delete()
      .eq('student_id', studentId).eq('metric_type', 'laps').is('skill_step_id', null).eq('measured_on', today())
    const { error } = await supabase.from('measurements').insert({
      student_id: studentId, metric_type: 'laps', value: laps, measured_on: today(),
      session_id: sessionId, instructor_id: userId, skill_step_id: null,
    })
    if (error) throw error
  }
  revalidatePath(`/kiosk`)
}

// 오늘 해당 step의 laps 측정 최신 1행 삭제 (잘못 누른 경우 취소용)
export async function removeLastLap(studentId: string, stepId: string) {
  const { supabase, userId } = await ctx(); await assertOwns(supabase, userId, studentId)
  // 오늘 해당 step의 laps 측정 중 최신 1개 id 조회
  const { data } = await supabase
    .from('measurements')
    .select('id')
    .eq('student_id', studentId)
    .eq('skill_step_id', stepId)
    .eq('metric_type', 'laps')
    .eq('measured_on', today())
    .order('created_at', { ascending: false })
    .limit(1)
  if (!data || data.length === 0) return
  await supabase.from('measurements').delete().eq('id', data[0].id)
  revalidatePath(`/v2/student/${studentId}`)
}

// 원장 전용: 신규 학생 등록
export async function createStudent(data: {
  name: string
  sex?: string
  grade?: string
  schedule?: string
  phone?: string
  enrolled_on?: string
}): Promise<{ id: string } | { error: string }> {
  const { supabase, userId } = await ctx()
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
  if (prof?.role !== 'director') return { error: '원장만 학생을 등록할 수 있습니다' }

  const { data: student, error } = await supabase.from('students').insert({
    name: data.name.trim(),
    sex: data.sex || null,
    grade: data.grade || null,
    schedule: data.schedule || null,
    phone: data.phone || null,
    enrolled_on: data.enrolled_on || null,
    is_active: true,
  }).select('id').single()

  if (error) return { error: error.message }
  revalidatePath('/v2/director/students')
  return { id: student.id }
}
