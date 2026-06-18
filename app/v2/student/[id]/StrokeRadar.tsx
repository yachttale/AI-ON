// app/v2/student/[id]/StrokeRadar.tsx — 영법별 진도% 레이더(의존성 없는 SVG)
import type { RadarAxis } from '@/lib/v2/data'

export function StrokeRadar({ data, size = 260 }: { data: RadarAxis[]; size?: number }) {
  const n = data.length
  if (n < 3) return null
  const cx = size / 2, cy = size / 2, R = size / 2 - 34
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n
  const pt = (i: number, r: number): [number, number] => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))]
  const rings = [0.25, 0.5, 0.75, 1]
  const ringPoly = (f: number) => data.map((_, i) => pt(i, R * f).join(',')).join(' ')
  const dataPoly = data.map((d, i) => pt(i, R * Math.max(0, Math.min(100, d.pct)) / 100).join(',')).join(' ')

  const pad = 46  // 좌우 라벨이 잘리지 않도록 가로 여백
  return (
    <svg viewBox={`${-pad} 0 ${size + pad * 2} ${size}`} className="w-full max-w-[320px] mx-auto">
      {rings.map((f, i) => (
        <polygon key={i} points={ringPoly(f)} fill="none" stroke="#e5e7eb" strokeWidth={1} />
      ))}
      {data.map((_, i) => {
        const [x, y] = pt(i, R)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e5e7eb" strokeWidth={1} />
      })}
      <polygon points={dataPoly} fill="rgba(99,102,241,0.25)" stroke="#6366f1" strokeWidth={2} />
      {data.map((d, i) => {
        const [x, y] = pt(i, R * Math.max(0, Math.min(100, d.pct)) / 100)
        return <circle key={i} cx={x} cy={y} r={3} fill="#6366f1" />
      })}
      {data.map((d, i) => {
        const [x, y] = pt(i, R + 16)
        return (
          <text key={i} x={x} y={y} fontSize={11} fill="#6b7280"
            textAnchor={Math.abs(x - cx) < 6 ? 'middle' : x > cx ? 'start' : 'end'}
            dominantBaseline={Math.abs(y - cy) < 6 ? 'middle' : y > cy ? 'hanging' : 'auto'}>
            {d.label} {d.pct}%
          </text>
        )
      })}
    </svg>
  )
}
