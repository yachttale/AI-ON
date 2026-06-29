// lib/v2/curriculum-v1-sheet.ts
// 원장 확정 시트 "AI-ON 영법 단계표 v1" (Google Sheet 1JPRbVu5Psi0ApiQGorznCrBlc2fqx5Ny8nZL9mmZe-Q) 구조화본.
// v2 시드(strokes/skill_steps) 전용 소스다. (구 lib/curriculum.ts는 미사용으로 제거됨)
// 라벨은 시트 원문을 그대로 보존(오타 '콤비네에션' 포함). 측정/첫완주는 시트의 명시 컬럼을 그대로 옮긴다.
import type { MetricType, StepKind } from '@/types/v2'
export type { StepKind }
//  ladder    = 통과형(한 번 통과, 단조 진행) — 핵심 사다리
//  counter   = 누적 연습 횟수 + 완성 버튼(기타: 턴/스타트/잠영 25M)
//  repeatable = 반복 기록형(영법별 50m 바퀴, 마스터 거리 — 중복 허용/주기 측정)

export type Measure = '' | 'time' | 'time+stroke'

export interface SheetStep {
  label: string
  measure?: Measure   // 시트 '측정' 컬럼 (빈 값 = 측정 없음)
  first?: boolean     // 시트 '첫완주' 컬럼(O)
  kind?: StepKind     // 트랙 기본 종류 override
}
export interface SheetTrack {
  key: string
  label: string
  kind?: StepKind     // 트랙 내 step 기본 종류 (미지정 시 'ladder')
  steps: (string | SheetStep)[]
}
export interface SheetStroke {
  key: string
  label: string
  color: string
  tracks: SheetTrack[]
}

// 측정 컬럼 → measure_spec(text[]) 매핑
export const MEASURE_MAP: Record<Measure, MetricType[]> = {
  '': [],
  time: ['time_sec'],
  'time+stroke': ['time_sec', 'stroke_count'],
}

// 콤비 4단계(없음/5m/15m/25m)를 반복 생성하는 헬퍼 — 자유형 보조 단계용
const combo = (base: string): string[] => [base, `${base} 5m`, `${base} 15m`, `${base} 25m`]

export const SHEET_CURRICULUM: SheetStroke[] = [
  {
    key: 'beginner',
    label: '초보',
    color: '#60a5fa',
    tracks: [
      {
        key: 'water',
        label: '물 적응',
        steps: [
          '잠수 - 코까지', '잠수 - 얼굴까지', '잠수 - 귀까지', '잠수 - 머리 전체',
          '잠수 - 5초', '잠수 - 10초', '잠수 - 20초',
          '바닥에 앉기', '물건 줍기',
          // 구르기류 — 서로 독립 스킬(계단식 cascade 제외)
          { label: '앞구르기', kind: 'single' }, { label: '옆구르기', kind: 'single' },
          { label: '뒷구르기', kind: 'single' }, { label: '물구나무 서기', kind: 'single' },
          { label: '물대포', kind: 'single' },
        ],
      },
    ],
  },
  {
    key: 'freestyle',
    label: '자유형',
    color: '#34d399',
    tracks: [
      {
        key: 'kb_helper',
        label: '킥판 + 헬퍼',
        steps: [
          '머리들고 슈퍼맨 3m', '음파 슈퍼맨 3m', '발차기', '발차기 5m', '발차기 15m',
          { label: '발차기 25m', measure: 'time', first: true },
          '팔돌리기',
          '호흡1회 팔1회', '호흡1회 팔1회 5m', '호흡1회 팔1회 15m', '호흡1회 팔1회 25m',
          '호흡1회 팔 2회', '호흡1회 팔 2회 5m', '호흡1회 팔 2회 15m', '호흡1회 팔 2회 25m',
          '오른팔 1회 호흡1회', '오른팔 1회 호흡1회 5m', '오른팔 1회 호흡1회 15m', '오른팔 1회 호흡1회 25m',
          '자유형 콤비네에션', '자유형 콤비네에션 5m', '자유형 콤비네에션 15m',
          { label: '자유형 콤비네에션 25m', measure: 'time+stroke', first: true },
        ],
      },
      { key: 'peanut_helper', label: '땅콩 + 헬퍼', steps: combo('자유형 콤비네에션') },
      { key: 'hand_helper', label: '손 + 헬퍼', steps: combo('자유형 콤비네에션') },
      { key: 'helper', label: '헬퍼', steps: combo('자유형 콤비네에션') },
      {
        key: 'none',
        label: '보조 없이',
        steps: [
          '자유형 콤비네에션', '자유형 콤비네에션 5m', '자유형 콤비네에션 15m',
          { label: '자유형 콤비네에션 25m', measure: 'time+stroke', first: true },
        ],
      },
      { key: 'm50', label: '50m', kind: 'repeatable', steps: ['1바퀴'] },
    ],
  },
  {
    key: 'backstroke',
    label: '배영',
    color: '#f59e0b',
    tracks: [
      {
        key: 'kb_helper',
        label: '킥판 + 헬퍼',
        steps: ['누워서 뜨기', '발차기', '발차기 5m', '발차기 15m', '발차기 25m'],
      },
      {
        key: 'helper',
        label: '헬퍼',
        steps: ['팔동작', '콤비 5m', '콤비 15m', '콤비 25m'],
      },
      {
        key: 'none',
        label: '보조 없이',
        steps: [
          '발차기 5m', '발차기 15m', '발차기 25m', '콤비 5m', '콤비 15m',
          { label: '콤비 25m', measure: 'time+stroke', first: true },
        ],
      },
      { key: 'm50', label: '50m', kind: 'repeatable', steps: ['1바퀴'] },
    ],
  },
  {
    key: 'breaststroke',
    label: '평영',
    color: '#a78bfa',
    tracks: [
      {
        key: 'kb_helper',
        label: '킥판 + 헬퍼',
        steps: [
          '발목 잡기', '발 모양 잡기', '발차기 5m', '발차기 15m', '발차기 25m',
          '음파 + 발차기 5m', '음파 + 발차기 15m',
          { label: '음파 + 발차기 25m', measure: 'time+stroke', first: true },
        ],
      },
      {
        key: 'back_helper',
        label: '헬퍼 + 누워서',
        steps: ['발차기 5m', '발차기 15m', '발차기 25m'],
      },
      {
        key: 'helper',
        label: '헬퍼',
        steps: [
          '발차기 5m 호흡 타이밍', '발차기 15m 호흡 타이밍', '발차기 25m 호흡 타이밍',
          '팔 + 자유형 킥', '팔 + 자유형 킥 5m', '팔 + 자유형 킥 15m', '팔 + 자유형 킥 25m',
          '콤비 타이밍', '콤비 타이밍 5m', '콤비 타이밍 15m',
          { label: '콤비 타이밍 25m', measure: 'time+stroke', first: true },
        ],
      },
      {
        key: 'none',
        label: '보조 없이',
        steps: [
          '콤비 타이밍', '콤비 타이밍 5m', '콤비 타이밍 15m',
          { label: '콤비 타이밍 25m', measure: 'time+stroke', first: true },
        ],
      },
      { key: 'm50', label: '50m', kind: 'repeatable', steps: ['1바퀴'] },
    ],
  },
  {
    key: 'butterfly',
    label: '접영',
    color: '#f87171',
    tracks: [
      {
        key: 'dolphin',
        label: '돌핀킥',
        // 시트에 '킥판 25m'가 2회 중복(오타) → 1회만 유지
        steps: [
          '웨이브', '웨이브 5m', '웨이브 15m', '웨이브 25m',
          '킥판', '킥판 5m', '킥판 15m', '킥판 25m',
        ],
      },
      {
        key: 'arm',
        label: '팔동작',
        steps: [
          '한팔 접영', '한팔 접영(오) 5m', '한팔 접영(오) 15m', '한팔 접영(오) 25m',
          '한팔 접영(왼)', '한팔 접영(왼) 5m', '한팔 접영(왼) 15m', '한팔 접영(왼) 25m',
          '한팔 접영 좌우', '한팔 접영 좌우 5m', '한팔 접영 좌우 15m', '한팔 접영 좌우 25m',
        ],
      },
      {
        key: 'combo',
        label: '콤비네이션',
        steps: [
          '호흡 타이밍', '호흡 타이밍 5m', '호흡 타이밍 15m', '호흡 타이밍 25m',
          '땅콩끼고 양팔', '땅콩끼고 양팔 5m', '땅콩끼고 양팔 15m', '땅콩끼고 양팔 25m',
          '양팔', '양팔 5m', '양팔 15m',
          { label: '양팔 25m', measure: 'time+stroke', first: true },
        ],
      },
      { key: 'm50', label: '50m', kind: 'repeatable', steps: ['1바퀴'] },
    ],
  },
  {
    key: 'master',
    label: '마스터',
    color: '#fbbf24',
    tracks: [
      { key: 'free', label: '자유형', kind: 'repeatable', steps: ['50m'] },
      { key: 'back', label: '배영', kind: 'repeatable', steps: ['50m'] },
      { key: 'breast', label: '평영', kind: 'repeatable', steps: ['50m'] },
      { key: 'fly', label: '접영', kind: 'repeatable', steps: ['50m'] },
      {
        key: 'im',
        label: 'IM',
        kind: 'repeatable',
        steps: [{ label: '접배평자(200M)', measure: 'time', first: true }],
      },
    ],
  },
  {
    key: 'etc',
    label: '기타',
    color: '#94a3b8',
    tracks: [
      { key: 'turn', label: '턴', kind: 'counter', steps: ['사이드턴', '플립턴'] },
      { key: 'start', label: '스타트', kind: 'counter', steps: ['물속 스타트', '다이빙'] },
      {
        key: 'submarine',
        label: '잠영',
        steps: ['5M', '10M', '15M', '20M', { label: '25M', kind: 'counter' }],
      },
    ],
  },
]
