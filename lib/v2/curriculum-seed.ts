// lib/v2/curriculum-seed.ts — 확정 시트(SHEET_CURRICULUM) → v2 시드 행 매핑(순수)
// 측정/첫완주/종류는 시트의 명시 컬럼을 그대로 옮긴다(라벨 추론 없음).
import { SHEET_CURRICULUM, MEASURE_MAP, type SheetStep, type StepKind } from './curriculum-v1-sheet'
import type { MetricType } from '@/types/v2'

export interface SeedStroke { key: string; label: string; display_order: number; color: string | null }
export interface SeedTrack { stroke_key: string; key: string; label: string; display_order: number }
export interface SeedStep {
  version_label: string; stroke_key: string; track_key: string
  key: string; label: string; ladder_order: number
  is_first_completion: boolean; measure_spec: MetricType[]; step_kind: StepKind
}
export interface SeedRows { strokes: SeedStroke[]; tracks: SeedTrack[]; steps: SeedStep[] }

export function buildSeedRows(versionLabel: string): SeedRows {
  const strokes: SeedStroke[] = []
  const tracks: SeedTrack[] = []
  const steps: SeedStep[] = []
  let ladder = 0

  SHEET_CURRICULUM.forEach((stroke, si) => {
    strokes.push({ key: stroke.key, label: stroke.label, display_order: si, color: stroke.color })
    stroke.tracks.forEach((track, ti) => {
      tracks.push({ stroke_key: stroke.key, key: track.key, label: track.label, display_order: ti })
      track.steps.forEach((raw, idx) => {
        const st: SheetStep = typeof raw === 'string' ? { label: raw } : raw
        ladder += 1
        steps.push({
          version_label: versionLabel,
          stroke_key: stroke.key,
          track_key: track.key,
          key: `${stroke.key}.${track.key}.${idx + 1}`,
          label: st.label.trim(),
          ladder_order: ladder,
          is_first_completion: st.first ?? false,
          measure_spec: MEASURE_MAP[st.measure ?? ''],
          step_kind: st.kind ?? track.kind ?? 'ladder',
        })
      })
    })
  })
  return { strokes, tracks, steps }
}
