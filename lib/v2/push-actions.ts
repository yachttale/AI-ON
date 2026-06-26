'use server'
// lib/v2/push-actions.ts — 웹푸시 구독 저장/삭제(본인). 알람 기능 전용, 기존 액션과 분리.
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/v2/session'

export async function savePushSubscription(sub: { endpoint: string; p256dh: string; auth: string }) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')
  const supabase = await createClient()
  // 같은 기기(endpoint) 재구독 시 갱신: 본인 것 삭제 후 재삽입
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint).eq('user_id', user.id)
  const { error } = await supabase.from('push_subscriptions')
    .insert({ user_id: user.id, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth })
  if (error) throw error
}

export async function deletePushSubscription(endpoint: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')
  const supabase = await createClient()
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', user.id)
}
