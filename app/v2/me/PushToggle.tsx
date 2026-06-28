// app/v2/me/PushToggle.tsx — 알림(웹푸시) 켜기/끄기. 본인 기기 구독 관리.
'use client'
import { useEffect, useState } from 'react'
import { savePushSubscription, deletePushSubscription } from '@/lib/v2/push-actions'

type State = 'loading' | 'unsupported' | 'denied' | 'on' | 'off' | 'nokey'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export function PushToggle() {
  const [state, setState] = useState<State>('loading')
  const [busy, setBusy] = useState(false)
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { setState('unsupported'); return }
    if (!vapid) { setState('nokey'); return }
    if (Notification.permission === 'denied') { setState('denied'); return }
    navigator.serviceWorker.register('/sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => setState(sub ? 'on' : 'off'))
      .catch(() => setState('off'))
  }, [vapid])

  const enable = async () => {
    if (!vapid) return
    setBusy(true)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setState('denied'); return }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource })
      const json = sub.toJSON() as { keys?: { p256dh?: string; auth?: string } }
      await savePushSubscription({ endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' })
      setState('on')
    } catch {
      setState('off')
    } finally { setBusy(false) }
  }

  const disable = async () => {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) { await deletePushSubscription(sub.endpoint); await sub.unsubscribe() }
      setState('off')
    } catch { /* noop */ } finally { setBusy(false) }
  }

  const sendTest = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/push/test', { method: 'POST' })
      const json = await res.json() as { error?: string; sent?: number; total?: number }
      if (json.error === 'no_subscription') {
        alert('구독 정보가 서버에 없어요. 알림을 끄고 다시 켜주세요.')
      } else if (json.error === 'vapid_missing') {
        alert('서버 환경변수(VAPID)가 설정되지 않았습니다.')
      } else if (json.error) {
        alert(`오류: ${json.error}`)
      } else if ((json.sent ?? 0) > 0) {
        alert('테스트 알림을 보냈어요! 잠시 후 알림이 오는지 확인해 주세요.')
      } else {
        alert('구독은 있지만 발송에 실패했어요(VAPID 키 불일치 가능성).')
      }
    } catch { alert('요청 중 오류가 발생했습니다.') }
    finally { setBusy(false) }
  }

  if (state === 'loading') return <p className="text-xs text-gray-400">알림 상태 확인 중…</p>
  if (state === 'unsupported') return <p className="text-xs text-gray-400">이 브라우저는 알림을 지원하지 않습니다.</p>
  if (state === 'nokey') return <p className="text-xs text-gray-400">알림이 아직 설정되지 않았습니다(관리자 설정 필요).</p>
  if (state === 'denied') return <p className="text-xs text-red-400">브라우저에서 알림이 차단돼 있어요. 사이트 설정에서 알림을 허용해 주세요.</p>

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-800">어제 미입력 리마인더</p>
          <p className="text-[11px] text-gray-400">매일 오후 3시 5분, 어제 정리 안 한 기록이 있으면 알려드려요</p>
        </div>
        {state === 'on' ? (
          <button disabled={busy} onClick={disable}
            className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-sm font-semibold disabled:opacity-50 shrink-0">끄기</button>
        ) : (
          <button disabled={busy} onClick={enable}
            className="px-3 py-1.5 rounded-lg bg-sky-500 text-white text-sm font-semibold disabled:opacity-50 shrink-0">{busy ? '…' : '알림 켜기'}</button>
        )}
      </div>
      {state === 'on' && (
        <button disabled={busy} onClick={sendTest}
          className="w-full py-1.5 rounded-lg border border-gray-200 text-gray-500 text-xs disabled:opacity-50">
          테스트 알림 보내기
        </button>
      )}
    </div>
  )
}
