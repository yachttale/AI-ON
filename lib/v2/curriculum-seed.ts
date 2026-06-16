// lib/v2/curriculum-seed.ts — 기존 CURRICULUM(69단계) → v2 시드 행 매핑(순수)
import { CURRICULUM } from '@/lib/curriculum'
import type { MetricType } from '@/types/v2'

export interface SeedStroke { key: string; label: string; display_order: number; color: string | null }
export interface SeedTrack { stroke_key: string; key: string; label: string; display_order: number }
export interface SeedStep {
  version_label: string; stroke_key: string; track_key: string | null
  key: string; label: string; ladder_order: number
  is_first_completion: boolean; measure_spec: MetricType[]
}
export interface SeedRows { strokes: SeedStroke[]; tracks: SeedTrack[]; steps: SeedStep[] }

// 각 영법의 "첫 완주"(25m 완주) = 예측 타깃. 경쟁 영법당 1개.
function isFirstCompletion(label: string): boolean {
  return label.trim() === '25m 완주'
}

// 측정 항목: 완주(25/50/100m)는 시간+스트로크, 마스터 거리는 시간, 그 외 없음.
// (킥 드릴 '발차기 5m' 등은 완주가 아니므로 측정 없음.)
function measureSpecFor(strokeKey: string, label: string): MetricType[] {
  if (/완주/.test(label)) return ['time_sec', 'stroke_count']
  if (strokeKey === 'master') return ['time_sec']
  return []
}

export function buildSeedRows(versionLabel: string): SeedRows {
  const strokes: SeedStroke[] = []
  const tracks: SeedTrack[] = []
  const steps: SeedStep[] = []

  CURRICULUM.forEach((section, si) => {
    strokes.push({ key: section.key, label: section.label, display_order: si, color: section.color })
    section.groups.forEach((group, gi) => {
      tracks.push({ stroke_key: section.key, key: group.key, label: group.label, display_order: gi })
      group.steps.forEach((step) => {
        steps.push({
          version_label: versionLabel,
          stroke_key: section.key,
          track_key: group.key,
          key: step.key,
          label: step.label,
          ladder_order: step.order,
          is_first_completion: isFirstCompletion(step.label),
          measure_spec: measureSpecFor(section.key, step.label),
        })
      })
    })
  })
  return { strokes, tracks, steps }
}
