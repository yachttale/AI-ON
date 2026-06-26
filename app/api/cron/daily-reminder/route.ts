// app/api/cron/daily-reminder/route.ts — 매일 오후 3시 5분(KST) '어제 미입력' 리마인더 발송.
// Vercel Cron(06:05 UTC)이 호출. service_role 로 전체 조회 후 web-push 발송.
// env 미설정 시 조용히 skip → 기존 기능에 영향 없음.
import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'
import { computePendingByInstructor } from '@/lib/v2/reminder'
import { kstDaysAgo, kstWeekday } from '@/lib/v2/now'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // Vercel Cron 인증
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@up2u.app'
  if (!url || !serviceKey || !vapidPublic || !vapidPrivate) {
    return NextResponse.json({ skipped: 'push env not configured' })
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } })

  const yesterday = kstDaysAgo(1)
  const yWeekday = (kstWeekday() + 6) % 7 // 어제 요일

  const [{ data: students }, { data: dayRows }, { data: sess }, { data: prog }, { data: meas }] = await Promise.all([
    sb.from('students').select('id,schedule,instructor_id').eq('is_active', true),
    sb.from('student_day_instructors').select('student_id,instructor_id').eq('weekday', yWeekday),
    sb.from('sessions').select('student_id').eq('session_date', yesterday),
    sb.from('skill_progress').select('student_id').eq('passed_at', yesterday),
    sb.from('measurements').select('student_id').eq('measured_on', yesterday),
  ])

  const dayAssign = new Map<string, string>()
  for (const r of dayRows ?? []) dayAssign.set(r.student_id, r.instructor_id)
  const recorded = new Set<string>()
  for (const r of sess ?? []) recorded.add(r.student_id)
  for (const r of prog ?? []) recorded.add(r.student_id)
  for (const r of meas ?? []) recorded.add(r.student_id)

  const pending = computePendingByInstructor({
    students: (students ?? []).map(s => ({ id: s.id, schedule: s.schedule, instructorId: s.instructor_id })),
    dayAssign,
    recordedStudentIds: recorded,
    yesterdayWeekday: yWeekday,
  })

  const instructorIds = [...pending.keys()]
  if (instructorIds.length === 0) return NextResponse.json({ sent: 0, instructors: 0 })

  const { data: subs } = await sb.from('push_subscriptions')
    .select('user_id,endpoint,p256dh,auth').in('user_id', instructorIds)

  let sent = 0
  for (const sub of subs ?? []) {
    const count = pending.get(sub.user_id) ?? 0
    if (count <= 0) continue
    const payload = JSON.stringify({
      title: '어제 기록 정리 알림',
      body: `어제 미입력 학생 ${count}명이 있어요. 기록을 정리해 주세요 📝`,
      url: '/v2/today',
      tag: 'up2u-yesterday-reminder',
    })
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
      sent++
    } catch (e: unknown) {
      const code = (e as { statusCode?: number })?.statusCode
      if (code === 404 || code === 410) {
        await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint) // 만료 구독 정리
      }
    }
  }

  return NextResponse.json({ sent, instructors: instructorIds.length })
}
