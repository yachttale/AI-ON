// app/v2/me/page.tsx — 강사 '나의 정보': 지도 효율 포트폴리오 대시보드
import { notFound } from 'next/navigation'
import { getCurrentProfile } from '@/lib/v2/session'
import { getMyPortfolio } from '@/lib/v2/analytics-data'
import { CertManager } from './CertManager'
import { PushToggle } from './PushToggle'

const STROKE_COLOR: Record<string, string> = {
  freestyle: '#0ea5e9', backstroke: '#8b5cf6', breaststroke: '#10b981', butterfly: '#f59e0b',
  beginner: '#94a3b8', master: '#111827',
}

export default async function MePage() {
  const profile = await getCurrentProfile()
  if (!profile) notFound()
  const p = await getMyPortfolio(profile.id)

  const maxAvg = Math.max(1, ...p.strokes.map(s => s.avgSessions ?? 0))
  const maxDist = Math.max(1, ...p.distribution.map(d => d.count))

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <section className="bg-white rounded-2xl border p-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center text-lg font-bold">
            {profile.name.slice(0, 1)}
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">{profile.name}</p>
            <p className="text-xs text-gray-500">{profile.role === 'director' ? '원장' : '강사'} · 나의 지도 기록</p>
          </div>
        </div>
      </section>

      {/* 핵심 카드 */}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="담당 학생" value={`${p.taughtStudents}`} unit="명" accent="text-sky-600" />
        <Stat label="마스터 배출" value={`${p.masterCount}`} unit="명" accent="text-gray-900" />
      </div>

      {/* 입문~수료 평균 */}
      <section className="bg-gradient-to-br from-sky-50 to-white rounded-2xl border p-4 text-center">
        <p className="text-xs text-gray-500 mb-1">입문부터 수료까지 평균</p>
        {p.fullJourneyAvg != null ? (
          <>
            <p className="text-4xl font-extrabold text-sky-600 leading-none">
              {p.fullJourneyAvg}<span className="text-lg font-bold text-sky-400 ml-1">회</span>
            </p>
            <p className="text-[11px] text-gray-400 mt-1.5">출석 수업 수 · 표본 {p.fullJourneySample}명</p>
          </>
        ) : (
          <p className="text-sm text-gray-400 py-3">데이터가 쌓이면 표시됩니다</p>
        )}
      </section>

      {/* 영법별 완성 평균 */}
      <section className="bg-white rounded-2xl border p-4 space-y-3">
        <div>
          <h3 className="font-bold text-sm text-gray-700">영법별 완성까지 평균 수업</h3>
          <p className="text-[11px] text-gray-400">첫 단계부터 완성까지 출석한 수업 수 (낮을수록 효율적)</p>
        </div>
        {p.strokes.map(s => (
          <div key={s.strokeKey} className="space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-gray-700">{s.strokeLabel}</span>
              {s.avgSessions != null
                ? <span className="text-sm"><b className="text-gray-900">{s.avgSessions}회</b> <span className="text-[11px] text-gray-400">({s.sampleSize}명)</span></span>
                : <span className="text-[11px] text-gray-400">표본 없음</span>}
            </div>
            <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
              {s.avgSessions != null && (
                <div className="h-full rounded-full" style={{ width: `${Math.round((s.avgSessions / maxAvg) * 100)}%`, backgroundColor: STROKE_COLOR[s.strokeKey] ?? '#0ea5e9' }} />
              )}
            </div>
          </div>
        ))}
      </section>

      {/* 영법별 담당 분포 */}
      {p.distribution.length > 0 && (
        <section className="bg-white rounded-2xl border p-4 space-y-2">
          <h3 className="font-bold text-sm text-gray-700">담당 학생 영법 분포</h3>
          {p.distribution.map(d => (
            <div key={d.key} className="flex items-center gap-2">
              <span className="w-12 text-xs text-gray-600 shrink-0">{d.label}</span>
              <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.round((d.count / maxDist) * 100)}%`, backgroundColor: STROKE_COLOR[d.key] ?? '#94a3b8' }} />
              </div>
              <span className="w-8 text-right text-xs font-semibold text-gray-700">{d.count}</span>
            </div>
          ))}
        </section>
      )}

      {/* 자격증 */}
      <section className="bg-white rounded-2xl border p-4 space-y-2">
        <h3 className="font-bold text-sm text-gray-700">자격증</h3>
        <CertManager items={p.certifications} />
      </section>

      {/* 알림 */}
      <section className="bg-white rounded-2xl border p-4 space-y-2">
        <h3 className="font-bold text-sm text-gray-700">알림</h3>
        <PushToggle />
      </section>

      <p className="text-center text-[11px] text-gray-300">기록이 쌓일수록 통계가 정확해집니다</p>
    </div>
  )
}

function Stat({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: string }) {
  return (
    <div className="bg-white rounded-2xl border p-4 text-center">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-3xl font-extrabold leading-none ${accent ?? 'text-gray-900'}`}>
        {value}{unit && <span className="text-base font-bold text-gray-400 ml-0.5">{unit}</span>}
      </p>
    </div>
  )
}
