// app/v2/student/[id]/GrowthChart.tsx — 측정 기록 추이(의존성 없는 SVG 라인).
// 성장(좋아짐)이 위로 올라가도록 그림: time_sec은 낮을수록 좋으므로 축을 뒤집어 표시.
import type { GrowthPoint } from '@/lib/v2/data'

export function GrowthChart({ points, lowerIsBetter, color = '#6366f1' }: {
  points: GrowthPoint[]; lowerIsBetter: boolean; color?: string
}) {
  const w = 300, h = 72, pad = 10
  const vals = points.map(p => p.value)
  const min = Math.min(...vals), max = Math.max(...vals)
  const range = max - min || 1
  const x = (i: number) => pad + (points.length === 1 ? (w - pad * 2) / 2 : (i / (points.length - 1)) * (w - pad * 2))
  const y = (v: number) => {
    const norm = (v - min) / range          // 0(min) ~ 1(max)
    const goodness = lowerIsBetter ? 1 - norm : norm  // 1 = 더 잘함
    return pad + (1 - goodness) * (h - pad * 2)        // 잘할수록 위
  }
  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      {/* 기준선(상단=좋음 / 하단=출발) */}
      <line x1={pad} y1={pad} x2={w - pad} y2={pad} stroke="#f1f5f9" strokeWidth={1} />
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#f1f5f9" strokeWidth={1} />
      {points.length >= 2 && (
        <polyline points={line} fill="none" stroke={color} strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round" />
      )}
      {points.map((p, i) => {
        const last = i === points.length - 1
        return (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.value)} r={last ? 4 : 3} fill={last ? color : '#fff'} stroke={color} strokeWidth={2} />
            {last && (
              <text x={x(i)} y={y(p.value) - 8} fontSize={11} fontWeight={700} fill={color} textAnchor="end">
                {p.value}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
