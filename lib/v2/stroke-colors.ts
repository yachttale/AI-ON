// lib/v2/stroke-colors.ts — 영법 색상 체계(원장 지정표). 영법 key 기준 배지 스타일.
// 초보=흰 / 자유형=노랑 / 배영=초록 / 평영=파랑 / 접영=보라 / 마스터=검정.
// 흰·검정은 DB hex로 다루기 까다로워 프론트 상수를 원천으로 사용.
export interface StrokeBadge { badge: string; bar: string } // badge=알약 클래스, bar=카드 상단 스트라이프 색

const TABLE: Record<string, StrokeBadge> = {
  beginner:     { badge: 'bg-white text-gray-700 border border-gray-300', bar: 'bg-gray-200' },
  freestyle:    { badge: 'bg-yellow-300 text-gray-900',                   bar: 'bg-yellow-300' },
  backstroke:   { badge: 'bg-green-500 text-white',                       bar: 'bg-green-500' },
  breaststroke: { badge: 'bg-blue-500 text-white',                        bar: 'bg-blue-500' },
  butterfly:    { badge: 'bg-purple-500 text-white',                      bar: 'bg-purple-500' },
  master:       { badge: 'bg-gray-900 text-white',                        bar: 'bg-gray-900' },
}
const FALLBACK: StrokeBadge = { badge: 'bg-gray-200 text-gray-700', bar: 'bg-gray-200' }

export function strokeBadge(strokeKey: string | null | undefined): StrokeBadge {
  if (!strokeKey) return FALLBACK
  return TABLE[strokeKey] ?? FALLBACK
}
