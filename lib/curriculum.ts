export const STROKES = ['초급', '자유형', '배영', '평영', '접영', '마스터'] as const
export type Stroke = typeof STROKES[number]

export const STAGES: Record<Stroke, string[]> = {
  '초급': ['물적응', '잠수'],
  '자유형': ['발차기', '팔돌리기', '콤비네이션', '완주', '숙달'],
  '배영': ['발차기', '팔돌리기', '콤비네이션', '완주', '숙달'],
  '평영': ['발차기', '팔동작', '콤비네이션', '완주', '숙달'],
  '접영': ['돌핀킥', '팔동작', '콤비네이션', '완주', '숙달'],
  '마스터': ['200m', '400m', '800m', '1600m'],
}

export const MASTER_STROKES = ['자유형', '배영', '평영', '접영'] as const
export const MASTER_DISTANCES = [200, 400, 800, 1600] as const

export const ATTENDANCE_OPTIONS = ['출석', '지각', '결석'] as const
export type Attendance = typeof ATTENDANCE_OPTIONS[number]

export const STATUS_OPTIONS = ['진행중', '통과'] as const
export type Status = typeof STATUS_OPTIONS[number]

export function getStages(stroke: Stroke): string[] {
  return STAGES[stroke] ?? []
}

export function isValidStroke(value: string): value is Stroke {
  return (STROKES as readonly string[]).includes(value)
}

export function isValidStage(stroke: Stroke, stage: string): boolean {
  return STAGES[stroke]?.includes(stage) ?? false
}

// 정체 학생 판정 기준 (연속 같은 단계 횟수)
export const STAGNANT_THRESHOLD = 5

// 숙달 통과 기준 시간 (25m, 달성 시 다음 영법 진급)
export const STROKE_MASTERY_TARGETS: Partial<Record<Stroke, string>> = {
  '자유형': '45초',
  '배영': '50초',
  '평영': '55초',
  '접영': '60초',
}

// 영법별 숙달 통과 기준 (조건 + 시간)
export const STROKE_PASS_CRITERIA: Partial<Record<string, { conditions: string[]; timeLimit: string }>> = {
  '자유형': { conditions: ['25m 완주', '측면호흡 가능'], timeLimit: '45초 이내' },
  '배영':   { conditions: ['25m 완주', '몸이 가라앉지 않음'], timeLimit: '50초 이내' },
  '평영':   { conditions: ['25m 완주', '킥 동작 정확'], timeLimit: '55초 이내' },
  '접영':   { conditions: ['25m 완주', '양팔 동시 회복 가능'], timeLimit: '60초 이내' },
}

// 학년별 숙달 통과 기준 기록 (25m 범위)
export const GRADE_COMPLETION_STANDARDS: Record<string, Partial<Record<string, string>>> = {
  '1학년': { '자유형': '45~55초', '배영': '50~60초', '평영': '55~70초', '접영': '60~80초' },
  '2학년': { '자유형': '40~50초', '배영': '45~55초', '평영': '50~65초', '접영': '55~75초' },
  '3학년': { '자유형': '35~45초', '배영': '40~50초', '평영': '45~60초', '접영': '50~70초' },
  '4학년': { '자유형': '30~40초', '배영': '35~45초', '평영': '40~55초', '접영': '45~65초' },
  '5학년': { '자유형': '28~35초', '배영': '30~40초', '평영': '35~50초', '접영': '40~60초' },
  '6학년': { '자유형': '25~35초', '배영': '30~40초', '평영': '35~50초', '접영': '40~55초' },
}

export const STROKE_BASE_SESSIONS: Partial<Record<Stroke, number>> = {
  '초급': 4,
  '자유형': 25,
  '배영': 20,
  '평영': 25,
  '접영': 25,
}

// 현재 영법 이전에 완료한 영법들의 표준 횟수 + 현재 영법 내 세부단계 비율 합산 (최초 등록 학생 기준 누락 회차 보정)
export function getPriorStrokeBonus(currentStroke: string | null, currentStage: string | null = null): number {
  if (!currentStroke) return 0
  const idx = (STROKES as readonly string[]).indexOf(currentStroke)
  if (idx <= 0) return 0
  const prevBonus = (STROKES as readonly string[])
    .slice(0, idx)
    .reduce((sum, s) => sum + ((STROKE_BASE_SESSIONS as Record<string, number>)[s] ?? 0), 0)

  // 현재 영법 내에서 이미 통과한 단계만큼 비율로 추가
  if (currentStage) {
    const stages = STAGES[currentStroke as keyof typeof STAGES] ?? []
    const stageIdx = stages.indexOf(currentStage)
    if (stageIdx > 0) {
      const base = (STROKE_BASE_SESSIONS as Record<string, number>)[currentStroke] ?? 0
      return prevBonus + Math.floor(base * stageIdx / stages.length)
    }
  }

  return prevBonus
}
