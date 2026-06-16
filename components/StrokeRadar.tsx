'use client'

interface Log {
  stroke: string | null
  stage: string | null
  status: string | null
  attendance: string
}

const STROKE_STAGES: Record<string, string[]> = {
  '자유형': ['발차기', '팔돌리기', '콤비네이션', '완주', '숙달'],
  '배영': ['발차기', '팔돌리기', '콤비네이션', '완주', '숙달'],
  '평영': ['발차기', '팔동작', '콤비네이션', '완주', '숙달'],
  '접영': ['돌핀킥', '팔동작', '콤비네이션', '완주', '숙달'],
}

const STROKE_ORDER = ['자유형', '배영', '평영', '접영'] as const

function getStrokeScore(logs: Log[], targetStroke: string): number {
  const stages = STROKE_STAGES[targetStroke]
  if (!stages) return 0
  const attendedLogs = logs.filter(l => l.attendance !== '결석')
  const strokeLogs = attendedLogs.filter(l => l.stroke === targetStroke)
  const strokeIdx = STROKE_ORDER.indexOf(targetStroke as typeof STROKE_ORDER[number])
  const hasLaterStroke = STROKE_ORDER.slice(strokeIdx + 1).some(s => attendedLogs.some(l => l.stroke === s))
  if (hasLaterStroke && strokeLogs.length === 0) return 100
  if (strokeLogs.length === 0) return 0
  const passedSet = new Set(strokeLogs.filter(l => l.status === '통과' && l.stage).map(l => l.stage as string))
  let highestIdx = -1
  for (let i = stages.length - 1; i >= 0; i--) {
    if (passedSet.has(stages[i])) { highestIdx = i; break }
  }
  if (highestIdx >= stages.length - 1) return 100
  const latestStroke = strokeLogs.find(l => l.stage)
  const currentStageIdx = latestStroke?.stage ? stages.indexOf(latestStroke.stage) : -1
  const bonus = currentStageIdx > highestIdx ? 0.5 / stages.length * 100 : 0
  return Math.min(99, Math.round(((highestIdx + 1) / stages.length) * 100 + bonus))
}

const CX = 120
const CY = 120
const MAX_R = 82
const TWO_PI = Math.PI * 2

// 7 axes (heptagon), clockwise from top
const AXES = [
  { label: '자유형', angle: -Math.PI / 2,                   technique: false },
  { label: '배영',   angle: -Math.PI / 2 + TWO_PI / 7,      technique: false },
  { label: '평영',   angle: -Math.PI / 2 + 2 * TWO_PI / 7,  technique: false },
  { label: '접영',   angle: -Math.PI / 2 + 3 * TWO_PI / 7,  technique: false },
  { label: '사이드턴', angle: -Math.PI / 2 + 4 * TWO_PI / 7, technique: true },
  { label: '플립턴', angle: -Math.PI / 2 + 5 * TWO_PI / 7,  technique: true },
  { label: '스타트', angle: -Math.PI / 2 + 6 * TWO_PI / 7,  technique: true },
]

function pt(r: number, angle: number) {
  return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) }
}

interface Props { logs: Log[] }

export default function StrokeRadar({ logs }: Props) {
  const free  = getStrokeScore(logs, '자유형')
  const back  = getStrokeScore(logs, '배영')
  const breast = getStrokeScore(logs, '평영')
  const fly   = getStrokeScore(logs, '접영')

  // 기술 점수: 영법 진도에서 파생
  const sideTurn  = Math.min(100, Math.round(free * 0.9 + back * 0.1))
  const flipTurn  = Math.min(100, Math.round((free + back) / 2 * 0.85))
  const startDive = Math.min(100, Math.round(fly * 0.8 + free * 0.2))

  const scores = [free, back, breast, fly, sideTurn, flipTurn, startDive]
  const gridLevels = [0.25, 0.5, 0.75, 1.0]

  const dataPoints = AXES.map((a, i) => pt((scores[i] / 100) * MAX_R, a.angle))
  const dataPolygon = dataPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  return (
    <svg viewBox="0 0 240 240" className="w-full max-w-[220px]">
      {gridLevels.map(level => {
        const pts = AXES.map(a => {
          const p = pt(MAX_R * level, a.angle)
          return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
        }).join(' ')
        return <polygon key={level} points={pts} fill="none" stroke="#e2e8f0" strokeWidth="1" />
      })}

      {AXES.map(a => {
        const end = pt(MAX_R, a.angle)
        return <line key={a.label} x1={CX} y1={CY} x2={end.x.toFixed(1)} y2={end.y.toFixed(1)} stroke="#e2e8f0" strokeWidth="1" />
      })}

      <polygon points={dataPolygon} fill="rgba(14,165,233,0.18)" stroke="#0ea5e9" strokeWidth="2" strokeLinejoin="round" />

      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="3.5" fill="#0ea5e9" stroke="white" strokeWidth="1.5" />
      ))}

      {AXES.map((a, i) => {
        const labelR = MAX_R + 24
        const p = pt(labelR, a.angle)
        return (
          <g key={a.label}>
            <text x={p.x.toFixed(1)} y={(p.y - 5).toFixed(1)}
              textAnchor="middle" dominantBaseline="middle"
              fontSize="9" fontWeight={a.technique ? '400' : '600'}
              fill={a.technique ? '#94a3b8' : '#334155'}>
              {a.label}
            </text>
            <text x={p.x.toFixed(1)} y={(p.y + 7).toFixed(1)}
              textAnchor="middle" dominantBaseline="middle"
              fontSize="8" fill="#94a3b8">
              {scores[i]}%
            </text>
          </g>
        )
      })}

      <circle cx={CX} cy={CY} r="3" fill="#cbd5e1" />
    </svg>
  )
}
