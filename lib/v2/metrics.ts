// lib/v2/metrics.ts — 순수 도메인 로직 (거리·완주·속도)
import type { MetricType } from '@/types/v2'

export const METERS_PER_LAP = 50

export function lapsToMeters(laps: number): number {
  return laps * METERS_PER_LAP
}

export function sumDailyDistance(rows: { metric_type: MetricType; value: number }[]): number {
  return rows
    .filter(r => r.metric_type === 'laps')
    .reduce((m, r) => m + lapsToMeters(r.value), 0)
}

// ISO date 문자열 두 개 사이 개월수 (30.44일/월 근사)
export function monthsBetween(from: string, to: string): number {
  const ms = new Date(to).getTime() - new Date(from).getTime()
  return ms / (1000 * 60 * 60 * 24 * 30.44)
}
