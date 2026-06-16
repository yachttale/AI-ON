export type Difficulty = '어려워함' | '조금어려워함' | '중간' | '조금쉽게' | '쉽게해결'

export interface SkillStep {
  key: string
  label: string
  order: number
}

export interface SkillGroup {
  key: string
  label: string
  steps: SkillStep[]
}

export interface StrokeSection {
  key: string
  label: string
  color: string
  groups: SkillGroup[]
}

export const CURRICULUM: StrokeSection[] = [
  {
    key: 'beginner',
    label: '초보',
    color: '#60a5fa',
    groups: [
      {
        key: 'beginner.water',
        label: '물 적응',
        steps: [
          { key: 'beginner.잠수_코', label: '잠수 - 코까지', order: 1 },
          { key: 'beginner.잠수_얼굴', label: '잠수 - 얼굴까지', order: 2 },
          { key: 'beginner.잠수_귀', label: '잠수 - 귀까지', order: 3 },
          { key: 'beginner.잠수_전체', label: '잠수 - 머리 전체', order: 4 },
          { key: 'beginner.바닥앉기', label: '바닥에 앉기', order: 5 },
          { key: 'beginner.물건줍기', label: '물건 줍기', order: 6 },
        ],
      },
    ],
  },
  {
    key: 'freestyle',
    label: '자유형',
    color: '#34d399',
    groups: [
      {
        key: 'freestyle.킥판+헬퍼',
        label: '킥판 + 헬퍼',
        steps: [
          { key: 'freestyle.킥판+헬퍼.발차기', label: '발차기', order: 7 },
          { key: 'freestyle.킥판+헬퍼.5m', label: '발차기 5m', order: 8 },
          { key: 'freestyle.킥판+헬퍼.15m', label: '발차기 15m', order: 9 },
          { key: 'freestyle.킥판+헬퍼.25m', label: '발차기 25m', order: 10 },
        ],
      },
      {
        key: 'freestyle.헬퍼',
        label: '헬퍼만',
        steps: [
          { key: 'freestyle.헬퍼.5m', label: '발차기 5m', order: 11 },
          { key: 'freestyle.헬퍼.15m', label: '발차기 15m', order: 12 },
          { key: 'freestyle.헬퍼.25m', label: '발차기 25m', order: 13 },
        ],
      },
      {
        key: 'freestyle.킥판',
        label: '킥판만',
        steps: [
          { key: 'freestyle.킥판.5m', label: '발차기 5m', order: 14 },
          { key: 'freestyle.킥판.15m', label: '발차기 15m', order: 15 },
          { key: 'freestyle.킥판.25m', label: '발차기 25m', order: 16 },
        ],
      },
      {
        key: 'freestyle.없이',
        label: '보조 없이',
        steps: [
          { key: 'freestyle.없이.5m', label: '발차기 5m', order: 17 },
          { key: 'freestyle.없이.15m', label: '발차기 15m', order: 18 },
          { key: 'freestyle.없이.25m', label: '발차기 25m', order: 19 },
          { key: 'freestyle.없이.팔동작', label: '팔동작', order: 20 },
          { key: 'freestyle.없이.콤비5m', label: '콤비 5m', order: 21 },
          { key: 'freestyle.없이.콤비15m', label: '콤비 15m', order: 22 },
          { key: 'freestyle.없이.호흡', label: '호흡 타이밍', order: 23 },
          { key: 'freestyle.없이.25m완주', label: '25m 완주', order: 24 },
          { key: 'freestyle.없이.50m', label: '50m 완주', order: 25 },
          { key: 'freestyle.없이.100m', label: '100m 완주', order: 26 },
        ],
      },
    ],
  },
  {
    key: 'backstroke',
    label: '배영',
    color: '#f59e0b',
    groups: [
      {
        key: 'backstroke.킥판',
        label: '킥판',
        steps: [
          { key: 'backstroke.킥판.뜨기', label: '누워서 뜨기', order: 27 },
          { key: 'backstroke.킥판.발차기', label: '발차기', order: 28 },
          { key: 'backstroke.킥판.15m', label: '발차기 15m', order: 29 },
          { key: 'backstroke.킥판.25m', label: '발차기 25m', order: 30 },
        ],
      },
      {
        key: 'backstroke.없이',
        label: '보조 없이',
        steps: [
          { key: 'backstroke.없이.발차기15m', label: '발차기 15m', order: 31 },
          { key: 'backstroke.없이.발차기25m', label: '발차기 25m', order: 32 },
          { key: 'backstroke.없이.팔동작', label: '팔동작', order: 33 },
          { key: 'backstroke.없이.콤비15m', label: '콤비 15m', order: 34 },
          { key: 'backstroke.없이.콤비25m', label: '콤비 25m', order: 35 },
          { key: 'backstroke.없이.25m완주', label: '25m 완주', order: 36 },
          { key: 'backstroke.없이.50m', label: '50m 완주', order: 37 },
          { key: 'backstroke.없이.100m', label: '100m 완주', order: 38 },
        ],
      },
    ],
  },
  {
    key: 'breaststroke',
    label: '평영',
    color: '#a78bfa',
    groups: [
      {
        key: 'breaststroke.발차기',
        label: '발차기',
        steps: [
          { key: 'breaststroke.발차기.자세', label: '발차기 자세', order: 39 },
          { key: 'breaststroke.발차기.킥판15m', label: '킥판 15m', order: 40 },
          { key: 'breaststroke.발차기.킥판25m', label: '킥판 25m', order: 41 },
          { key: 'breaststroke.발차기.없이15m', label: '킥판 없이 15m', order: 42 },
          { key: 'breaststroke.발차기.없이25m', label: '킥판 없이 25m', order: 43 },
        ],
      },
      {
        key: 'breaststroke.팔동작',
        label: '팔동작',
        steps: [
          { key: 'breaststroke.팔동작.자세', label: '팔동작 자세', order: 44 },
          { key: 'breaststroke.팔동작.글라이드', label: '글라이드', order: 45 },
          { key: 'breaststroke.팔동작.호흡', label: '호흡 타이밍', order: 46 },
        ],
      },
      {
        key: 'breaststroke.콤비',
        label: '콤비네이션',
        steps: [
          { key: 'breaststroke.콤비.15m', label: '콤비 15m', order: 47 },
          { key: 'breaststroke.콤비.25m완주', label: '25m 완주', order: 48 },
          { key: 'breaststroke.콤비.50m', label: '50m 완주', order: 49 },
          { key: 'breaststroke.콤비.100m', label: '100m 완주', order: 50 },
        ],
      },
    ],
  },
  {
    key: 'butterfly',
    label: '접영',
    color: '#f87171',
    groups: [
      {
        key: 'butterfly.돌핀킥',
        label: '돌핀킥',
        steps: [
          { key: 'butterfly.돌핀킥.수중', label: '수중 돌핀킥', order: 51 },
          { key: 'butterfly.돌핀킥.킥판5m', label: '킥판 5m', order: 52 },
          { key: 'butterfly.돌핀킥.킥판15m', label: '킥판 15m', order: 53 },
          { key: 'butterfly.돌핀킥.킥판25m', label: '킥판 25m', order: 54 },
          { key: 'butterfly.돌핀킥.없이15m', label: '킥판 없이 15m', order: 55 },
          { key: 'butterfly.돌핀킥.없이25m', label: '킥판 없이 25m', order: 56 },
        ],
      },
      {
        key: 'butterfly.팔동작',
        label: '팔동작',
        steps: [
          { key: 'butterfly.팔동작.입수', label: '입수 자세', order: 57 },
          { key: 'butterfly.팔동작.당기기', label: '당기기', order: 58 },
          { key: 'butterfly.팔동작.리커버리', label: '리커버리', order: 59 },
          { key: 'butterfly.팔동작.호흡', label: '호흡 타이밍', order: 60 },
        ],
      },
      {
        key: 'butterfly.콤비',
        label: '콤비네이션',
        steps: [
          { key: 'butterfly.콤비.5m', label: '콤비 5m', order: 61 },
          { key: 'butterfly.콤비.15m', label: '콤비 15m', order: 62 },
          { key: 'butterfly.콤비.25m완주', label: '25m 완주', order: 63 },
          { key: 'butterfly.콤비.50m', label: '50m 완주', order: 64 },
          { key: 'butterfly.콤비.100m', label: '100m 완주', order: 65 },
        ],
      },
    ],
  },
  {
    key: 'master',
    label: '마스터',
    color: '#fbbf24',
    groups: [
      {
        key: 'master.거리',
        label: '거리 도전',
        steps: [
          { key: 'master.200m', label: '200m', order: 66 },
          { key: 'master.400m', label: '400m', order: 67 },
          { key: 'master.800m', label: '800m', order: 68 },
          { key: 'master.1600m', label: '1600m', order: 69 },
        ],
      },
    ],
  },
]

export const ALL_STEPS: SkillStep[] = CURRICULUM.flatMap(s =>
  s.groups.flatMap(g => g.steps)
)

export function getStep(key: string): SkillStep | undefined {
  return ALL_STEPS.find(s => s.key === key)
}

export function getSection(skillKey: string): StrokeSection | undefined {
  return CURRICULUM.find(s => s.groups.some(g => g.steps.some(step => step.key === skillKey)))
}

export function getCurrentStep(passedKeys: string[]): SkillStep | undefined {
  const passedSet = new Set(passedKeys)
  return ALL_STEPS.find(s => !passedSet.has(s.key))
}

export function getProgressBySection(passedKeys: string[]): Record<string, { passed: number; total: number; percent: number }> {
  const passedSet = new Set(passedKeys)
  const result: Record<string, { passed: number; total: number; percent: number }> = {}
  for (const section of CURRICULUM) {
    const allSteps = section.groups.flatMap(g => g.steps)
    const total = allSteps.length
    const passed = allSteps.filter(s => passedSet.has(s.key)).length
    result[section.key] = { passed, total, percent: total > 0 ? Math.round((passed / total) * 100) : 0 }
  }
  return result
}

export const DIFFICULTY_OPTIONS: Difficulty[] = [
  '어려워함',
  '조금어려워함',
  '중간',
  '조금쉽게',
  '쉽게해결',
]

export const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  '어려워함': '#f87171',
  '조금어려워함': '#fb923c',
  '중간': '#facc15',
  '조금쉽게': '#86efac',
  '쉽게해결': '#34d399',
}

export const ATTENDANCE_OPTIONS = ['출석', '지각', '결석'] as const
export type Attendance = typeof ATTENDANCE_OPTIONS[number]
