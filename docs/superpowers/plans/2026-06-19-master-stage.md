# 마스터 단계 도입 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 접영 완주 학생을 마스터반으로 자동 분류하고, 마스터 전용 바퀴 기록 UI와 원장 6그룹 대시보드를 구현한다.

**Architecture:** 기존 `measurements(laps)` 테이블 재사용, 스키마 변경 없음. `currentStrokeKey` 계산 로직에 'master' 폴백 추가 → 전체 화면(학생·원장)에 자동 반영. 마스터 학생은 사다리 대신 `MasterPanel` 클라이언트 섬으로 바퀴 기록.

**Tech Stack:** Next.js 16.2.9 / React 19.2.4, TypeScript 5, Supabase (`@supabase/ssr`), Tailwind 4, vitest 4.

## Global Constraints

- Next.js 16.2.9, React 19.2.4 고정. 서버 액션·동적 라우트 규약은 `node_modules/next/dist/docs/` 실독 (AGENTS.md 게이트).
- **append-only**: measurements는 insert만. removeLastLap만 예외적으로 최신 1행 delete (오류 수정 전용).
- 마이그레이션 없음 — 기존 스키마 그대로.
- 서버 액션은 `ctx()` + `assertOwns()` 소유 확인 후 쓰기.
- 테스트: `npm run test:run`. 린트: `npm run lint`. 빌드: `npm run build`.
- 커밋은 태스크 완료 후.

---

## File Structure

**수정:**
- `lib/v2/data.ts` — `computeCurrentStrokeKey` 헬퍼 추출, `currentStrokeKey` 계산 전체 교체, `getStudentMasterStats` 추가
- `lib/v2/actions.ts` — `removeLastLap` 추가
- `app/v2/student/[id]/page.tsx` — 마스터 분기 추가
- `app/v2/director/page.tsx` — 6그룹 카드 UI

**신규:**
- `__tests__/v2/master.test.ts` — 순수 로직 단위 테스트
- `app/v2/student/[id]/MasterPanel.tsx` — 마스터 바퀴 + IM UI
- `app/v2/director/stroke/[key]/page.tsx` — 그룹 드릴다운

---

## Task 1: currentStrokeKey 마스터 분류 + 테스트

**Files:**
- Modify: `lib/v2/data.ts`
- Create: `__tests__/v2/master.test.ts`

**Interfaces:**
- Produces:
  - `function computeCurrentStrokeKey(allSteps: {id:string; step_kind:string; stroke_key:string}[], passedIds: Set<string>): string | null`
    — 미통과 ladder step 있으면 그 stroke_key, 없고 passedIds.size > 0이면 `'master'`, 아니면 `null`

- [ ] **Step 1: 실패 테스트 작성**

`__tests__/v2/master.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { computeCurrentStrokeKey } from '@/lib/v2/data'

const ladderStep = (id: string, stroke_key: string) =>
  ({ id, step_kind: 'ladder' as const, stroke_key })
const repeatableStep = (id: string, stroke_key: string) =>
  ({ id, step_kind: 'repeatable' as const, stroke_key })

describe('computeCurrentStrokeKey', () => {
  it('미통과 ladder 있으면 그 stroke_key 반환', () => {
    const steps = [ladderStep('a', 'beginner'), ladderStep('b', 'free')]
    expect(computeCurrentStrokeKey(steps, new Set(['a']))).toBe('free')
  })

  it('ladder 전부 통과 + 통과 이력 있으면 master', () => {
    const steps = [ladderStep('a', 'butterfly'), repeatableStep('b', 'master')]
    expect(computeCurrentStrokeKey(steps, new Set(['a']))).toBe('master')
  })

  it('통과 이력 없으면 null (신입)', () => {
    const steps = [ladderStep('a', 'beginner')]
    expect(computeCurrentStrokeKey(steps, new Set())).toBeNull()
  })

  it('repeatable만 있어도 통과 없으면 null', () => {
    const steps = [repeatableStep('a', 'master')]
    expect(computeCurrentStrokeKey(steps, new Set())).toBeNull()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test:run -- master`
Expected: FAIL ("computeCurrentStrokeKey is not exported")

- [ ] **Step 3: computeCurrentStrokeKey 구현 + export**

`lib/v2/data.ts` 상단(import 아래)에 추가:
```typescript
export function computeCurrentStrokeKey(
  allSteps: { id: string; step_kind: string; stroke_key: string }[],
  passedIds: Set<string>,
): string | null {
  const first = allSteps.find(s => s.step_kind === 'ladder' && !passedIds.has(s.id))
  if (first) return first.stroke_key
  return passedIds.size > 0 ? 'master' : null
}
```

- [ ] **Step 4: data.ts 내 currentStrokeKey 계산 3곳 교체**

**getDashboardRaw** (약 line 327):
```typescript
// 기존:
const currentStep = allSteps.find(step => step.step_kind === 'ladder' && !passed.has(step.id))
return { id: s.id, name: s.name, currentStrokeKey: currentStep?.stroke_key ?? null }
// 교체:
return { id: s.id, name: s.name, currentStrokeKey: computeCurrentStrokeKey(allSteps, passed) }
```

**getDirectorRoster** (약 line 592):
```typescript
// 기존:
const currentStepLabel = strokes.flatMap(x => x.tracks.flatMap(t => t.steps)).find(x => x.isCurrent)?.label ?? null
// currentStrokeKey는 별도로 없었으므로 이 함수는 focusStrokeKey를 사용. data.ts의 inputs에서 계산 추가:
// DirectorRosterRow에 currentStrokeKey 필드 추가
```

`DirectorRosterRow` 인터페이스에 `currentStrokeKey: string | null` 추가:
```typescript
export interface DirectorRosterRow {
  id: string; name: string; schedule: string | null; grade: string | null
  instructorName: string | null
  focusStrokeKey: string | null; focusStrokeLabel: string | null
  currentStepLabel: string | null; passedLadder: number
  currentStrokeKey: string | null   // 추가
}
```

`getDirectorRoster` 반환 map에 추가:
```typescript
return (students ?? []).map(s => {
  const passed = passedBy.get(s.id) ?? new Set<string>()
  const strokes = buildStrokeLadders(inputs, passed, sourceBy.get(s.id) ?? new Map(), new Map())
  const { focus } = selectCardWindow(strokes)
  const currentStepLabel = strokes.flatMap(x => x.tracks.flatMap(t => t.steps)).find(x => x.isCurrent)?.label ?? null
  let passedLadder = 0; for (const id of passed) if (ladderIds.has(id)) passedLadder++
  return {
    id: s.id, name: s.name, schedule: s.schedule, grade: s.grade,
    instructorName: nameById.get(s.instructor_id ?? dayInstrAny.get(s.id) ?? '') ?? null,
    focusStrokeKey: focus?.stroke_key ?? null, focusStrokeLabel: focus?.stroke_label ?? null,
    currentStepLabel, passedLadder,
    currentStrokeKey: computeCurrentStrokeKey(inputs, passed),   // 추가
  }
})
```

**getDirectorDashboard** (strokeGroups 계산 부분):
현재 `passedByStroke` 기반으로 계산된 `students` 배열에 `currentStrokeKey` 추가:
```typescript
const students = baseStudents.map(s => {
  const passed = passedByStudent.get(s.id) ?? new Set()
  return {
    id: s.id,
    name: s.name,
    currentStrokeKey: computeCurrentStrokeKey(allSteps, passed),  // 기존 로직 교체
  }
})
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm run test:run -- master`
Expected: PASS (4 tests)

- [ ] **Step 6: 전체 테스트 + 타입 확인**

Run: `npx tsc --noEmit && npm run test:run`
Expected: 에러 없음, 전체 통과

- [ ] **Step 7: 커밋**

```bash
git add lib/v2/data.ts __tests__/v2/master.test.ts
git commit -m "feat: currentStrokeKey 마스터 폴백 + computeCurrentStrokeKey 헬퍼"
```

---

## Task 2: removeLastLap 서버 액션

**Files:**
- Modify: `lib/v2/actions.ts`

**Interfaces:**
- Consumes: `ctx()`, `assertOwns()`, `today()` (기존 actions.ts 내부 헬퍼)
- Produces: `export async function removeLastLap(studentId: string, stepId: string): Promise<void>`
  — 오늘 해당 step의 laps 측정 최신 1행 삭제. 없으면 no-op.

- [ ] **Step 1: 액션 작성**

`lib/v2/actions.ts` 끝에 추가:
```typescript
// 오늘 해당 step의 laps 측정 최신 1행 삭제 (잘못 누른 경우 취소용)
export async function removeLastLap(studentId: string, stepId: string) {
  const { supabase, userId } = await ctx(); await assertOwns(supabase, userId, studentId)
  // 오늘 해당 step의 laps 측정 중 최신 1개 id 조회
  const { data } = await supabase
    .from('measurements')
    .select('id')
    .eq('student_id', studentId)
    .eq('skill_step_id', stepId)
    .eq('metric_type', 'laps')
    .eq('measured_on', today())
    .order('created_at', { ascending: false })
    .limit(1)
  if (!data || data.length === 0) return
  await supabase.from('measurements').delete().eq('id', data[0].id)
  revalidatePath(`/v2/student/${studentId}`)
}
```

- [ ] **Step 2: 타입 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add lib/v2/actions.ts
git commit -m "feat: removeLastLap 서버 액션 추가"
```

---

## Task 3: getStudentMasterStats 데이터 함수

**Files:**
- Modify: `lib/v2/data.ts`

**Interfaces:**
- Produces:
```typescript
export interface MasterStrokeStats {
  stepId: string
  strokeKey: string   // 'free' | 'back' | 'breast' | 'fly' | 'im'
  strokeLabel: string
  todayLaps: number
  totalLaps: number
  totalDistanceM: number  // totalLaps * 50 (IM 제외)
}
export interface StudentMasterStats {
  strokes: MasterStrokeStats[]  // 자유형·배영·평영·접영·IM 순
}
export async function getStudentMasterStats(studentId: string): Promise<StudentMasterStats>
```

- [ ] **Step 1: 함수 구현**

`lib/v2/data.ts` 끝에 추가:
```typescript
export interface MasterStrokeStats {
  stepId: string
  strokeKey: string
  strokeLabel: string
  todayLaps: number
  totalLaps: number
  totalDistanceM: number
}
export interface StudentMasterStats {
  strokes: MasterStrokeStats[]
}

export async function getStudentMasterStats(studentId: string): Promise<StudentMasterStats> {
  const supabase = await createClient()
  const today = kstToday()
  // 마스터 stroke의 step 목록 (getCachedLadderSteps에서 stroke_key='master' 필터)
  const allSteps = await getCachedLadderSteps()
  const masterSteps = allSteps.filter(s => s.stroke_key === 'master')
  if (masterSteps.length === 0) return { strokes: [] }

  const stepIds = masterSteps.map(s => s.id)
  const [{ data: allMeas }, { data: todayMeas }] = await Promise.all([
    supabase.from('measurements').select('skill_step_id,value').eq('student_id', studentId).eq('metric_type', 'laps').in('skill_step_id', stepIds),
    supabase.from('measurements').select('skill_step_id,value').eq('student_id', studentId).eq('metric_type', 'laps').eq('measured_on', today).in('skill_step_id', stepIds),
  ])
  const totalByStep = new Map<string, number>()
  for (const m of allMeas ?? []) totalByStep.set(m.skill_step_id, (totalByStep.get(m.skill_step_id) ?? 0) + Number(m.value))
  const todayByStep = new Map<string, number>()
  for (const m of todayMeas ?? []) todayByStep.set(m.skill_step_id, (todayByStep.get(m.skill_step_id) ?? 0) + Number(m.value))

  // master track key: free/back/breast/fly → 50m 단위. im → 횟수만.
  const IM_TRACK_KEYS = ['im']
  const strokes: MasterStrokeStats[] = masterSteps.map(s => {
    const isIM = IM_TRACK_KEYS.includes(s.track_key)
    const totalLaps = totalByStep.get(s.id) ?? 0
    return {
      stepId: s.id,
      strokeKey: s.track_key,
      strokeLabel: s.track_label,
      todayLaps: todayByStep.get(s.id) ?? 0,
      totalLaps,
      totalDistanceM: isIM ? 0 : totalLaps * 50,
    }
  })
  return { strokes }
}
```

- [ ] **Step 2: 타입 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add lib/v2/data.ts
git commit -m "feat: getStudentMasterStats 마스터 바퀴 통계 함수 추가"
```

---

## Task 4: MasterPanel 컴포넌트

**Files:**
- Create: `app/v2/student/[id]/MasterPanel.tsx`

**Interfaces:**
- Consumes:
  - `StudentMasterStats` (from lib/v2/data)
  - `logRepeatable(studentId, stepId, 'laps', 1)` (기존 actions.ts)
  - `removeLastLap(studentId, stepId)` (Task 2)
- Produces: `export function MasterPanel({ studentId, stats }: { studentId: string; stats: StudentMasterStats })`

- [ ] **Step 1: 컴포넌트 작성**

`app/v2/student/[id]/MasterPanel.tsx`:
```tsx
'use client'
import { useOptimistic, useTransition } from 'react'
import { logRepeatable, removeLastLap } from '@/lib/v2/actions'
import type { StudentMasterStats, MasterStrokeStats } from '@/lib/v2/data'

export function MasterPanel({ studentId, stats }: { studentId: string; stats: StudentMasterStats }) {
  const [pending, start] = useTransition()

  // 낙관적 오늘 바퀴 수 (stepId → delta)
  const [optimistic, addOptimistic] = useOptimistic(
    Object.fromEntries(stats.strokes.map(s => [s.stepId, s.todayLaps])),
    (state: Record<string, number>, { stepId, delta }: { stepId: string; delta: number }) => ({
      ...state,
      [stepId]: Math.max(0, (state[stepId] ?? 0) + delta),
    }),
  )

  const plusLap = (s: MasterStrokeStats) => {
    addOptimistic({ stepId: s.stepId, delta: 1 })
    start(() => logRepeatable(studentId, s.stepId, 'laps', 1))
  }
  const minusLap = (s: MasterStrokeStats) => {
    addOptimistic({ stepId: s.stepId, delta: -1 })
    start(() => removeLastLap(studentId, s.stepId))
  }

  const swim = stats.strokes.filter(s => s.strokeKey !== 'im')
  const im = stats.strokes.find(s => s.strokeKey === 'im')

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold text-gray-700">마스터 오늘 기록</h2>

      {swim.map(s => (
        <div key={s.stepId} className="bg-white rounded-xl border px-4 py-3 flex items-center gap-3">
          <span className="w-14 text-sm font-semibold text-gray-800">{s.strokeLabel}</span>
          <div className="flex items-center gap-2">
            <button
              disabled={pending || optimistic[s.stepId] <= 0}
              onClick={() => minusLap(s)}
              className="w-9 h-9 rounded-full bg-gray-100 text-xl font-bold text-gray-600 disabled:opacity-30"
            >−</button>
            <span className="w-10 text-center text-xl font-bold tabular-nums">{optimistic[s.stepId]}</span>
            <button
              disabled={pending}
              onClick={() => plusLap(s)}
              className="w-9 h-9 rounded-full bg-sky-500 text-white text-xl font-bold"
            >+</button>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-gray-400">누적</p>
            <p className="text-sm font-semibold text-gray-700">{(s.totalDistanceM + (optimistic[s.stepId] - s.todayLaps) * 50).toLocaleString()}m</p>
          </div>
        </div>
      ))}

      {im && (
        <div className="bg-white rounded-xl border px-4 py-3 flex items-center gap-3">
          <span className="w-14 text-sm font-semibold text-gray-800">IM</span>
          <div className="flex items-center gap-2">
            <button
              disabled={pending || optimistic[im.stepId] <= 0}
              onClick={() => minusLap(im)}
              className="w-9 h-9 rounded-full bg-gray-100 text-xl font-bold text-gray-600 disabled:opacity-30"
            >−</button>
            <span className="w-10 text-center text-xl font-bold tabular-nums">{optimistic[im.stepId]}</span>
            <button
              disabled={pending}
              onClick={() => plusLap(im)}
              className="w-9 h-9 rounded-full bg-purple-500 text-white text-xl font-bold"
            >+</button>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-gray-400">총 기록</p>
            <p className="text-sm font-semibold text-gray-700">{im.totalLaps}회</p>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 타입 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add app/v2/student/[id]/MasterPanel.tsx
git commit -m "feat: MasterPanel 바퀴+IM 입력 컴포넌트"
```

---

## Task 5: 학생 페이지 마스터 분기

**Files:**
- Modify: `app/v2/student/[id]/page.tsx`

**Interfaces:**
- Consumes:
  - `getStrokeLadders(studentId)` → `StrokeLadderView[]` (기존)
  - `getStudentMasterStats(studentId)` → `StudentMasterStats` (Task 3)
  - `computeCurrentStrokeKey(inputs, passedIds)` (Task 1)
  - `MasterPanel` (Task 4)

- [ ] **Step 1: page.tsx 마스터 분기 추가**

`app/v2/student/[id]/page.tsx`에서 기존 데이터 로드 부분 수정:
```typescript
import { getStrokeLadders, getStudentMasterStats, computeCurrentStrokeKey, getCachedLadderSteps, getStudentPassedStepIds } from '@/lib/v2/data'
import { MasterPanel } from './MasterPanel'
```

서버 컴포넌트 내 데이터 로드:
```typescript
// 마스터 여부 판단
const [allSteps, passedIds] = await Promise.all([
  getCachedLadderSteps(),
  getStudentPassedStepIds(studentId),
])
const currentStrokeKey = computeCurrentStrokeKey(allSteps, passedIds)
const isMaster = currentStrokeKey === 'master'
```

렌더:
```typescript
{isMaster
  ? <MasterPanel studentId={studentId} stats={await getStudentMasterStats(studentId)} />
  : <>{/* 기존 사다리 섹션 */}</>
}
```

- [ ] **Step 2: 타입 + 빌드 확인**

Run: `npx tsc --noEmit && npm run build`
Expected: 에러 없음

- [ ] **Step 3: 수동 스모크**

접영 완주 학생 계정(또는 테스트 데이터)으로 `/v2/student/[id]` 접속.
- 마스터 학생: MasterPanel 표시, +/− 탭 → 숫자 즉시 변경, 새로고침 후 유지.
- 일반 학생: 기존 사다리 화면 그대로.

- [ ] **Step 4: 커밋**

```bash
git add app/v2/student/[id]/page.tsx
git commit -m "feat: 학생 페이지 마스터 분기 → MasterPanel 렌더"
```

---

## Task 6: 원장 대시보드 6그룹

**Files:**
- Modify: `lib/v2/data.ts` (`getDirectorDashboard`)
- Modify: `app/v2/director/page.tsx`

**Interfaces:**
- `getDirectorDashboard` 반환값에 `strokeGroupCounts` 추가:
```typescript
strokeGroupCounts: { key: string; label: string; count: number }[]
// 순서: beginner→free→back→breast→butterfly→master
```

- [ ] **Step 1: getDirectorDashboard에 6그룹 집계 추가**

`lib/v2/data.ts`의 `DirectorDashboard` 인터페이스에 추가:
```typescript
export interface DirectorDashboard {
  // ... 기존 필드 ...
  strokeGroupCounts: { key: string; label: string; count: number }[]
}
```

`getDirectorDashboard` 함수에서 `students` 계산 후 추가:
```typescript
const GROUP_ORDER = [
  { key: 'beginner', label: '초보' },
  { key: 'free', label: '자유형' },
  { key: 'back', label: '배영' },
  { key: 'breast', label: '평영' },
  { key: 'butterfly', label: '접영' },
  { key: 'master', label: '마스터' },
]
const groupCountMap = new Map<string, number>()
for (const s of students) {
  if (s.currentStrokeKey) groupCountMap.set(s.currentStrokeKey, (groupCountMap.get(s.currentStrokeKey) ?? 0) + 1)
}
const strokeGroupCounts = GROUP_ORDER.map(g => ({ ...g, count: groupCountMap.get(g.key) ?? 0 }))
```

반환값에 포함:
```typescript
return {
  // ... 기존 필드 ...
  strokeGroupCounts,
}
```

- [ ] **Step 2: director/page.tsx 6그룹 카드 UI**

기존 `{d.strokeGroups.map(...)}` 섹션을 6그룹 그리드로 교체:
```tsx
{/* 6그룹 카드 */}
<section>
  <h2 className="text-sm font-bold text-gray-700 mb-2">영법별 현황</h2>
  <div className="grid grid-cols-3 gap-3">
    {d.strokeGroupCounts.map(g => (
      <Link key={g.key} href={`/v2/director/stroke/${g.key}`}
        className="bg-white rounded-xl border p-3 text-center hover:bg-gray-50">
        <p className="text-xs text-gray-400 mb-1">{g.label}</p>
        <p className="text-2xl font-bold text-gray-800">{g.count}<span className="text-xs font-normal text-gray-400 ml-0.5">명</span></p>
      </Link>
    ))}
  </div>
</section>
```

- [ ] **Step 3: 타입 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add lib/v2/data.ts app/v2/director/page.tsx
git commit -m "feat: 원장 대시보드 6그룹 카드 (초보~마스터)"
```

---

## Task 7: 그룹 드릴다운 페이지

**Files:**
- Create: `app/v2/director/stroke/[key]/page.tsx`

**Interfaces:**
- Consumes: `getDirectorRoster()` → `DirectorRosterRow[]` (currentStrokeKey 포함, Task 1)
- Route: `/v2/director/stroke/[key]` — key = beginner|free|back|breast|butterfly|master

- [ ] **Step 1: Next 16 동적 라우트 규약 확인**

기존 `app/v2/student/[id]/page.tsx`의 `params: Promise<{id: string}>` 패턴을 동일하게 따른다.

- [ ] **Step 2: 페이지 작성**

`app/v2/director/stroke/[key]/page.tsx`:
```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDirectorRoster } from '@/lib/v2/data'

const GROUP_LABELS: Record<string, string> = {
  beginner: '초보', free: '자유형', back: '배영',
  breast: '평영', butterfly: '접영', master: '마스터',
}

export default async function StrokeGroupPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  if (!GROUP_LABELS[key]) redirect('/v2/director')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  if (profile?.role !== 'director') redirect('/v2/today')

  const roster = await getDirectorRoster()
  const students = roster.filter(s => s.currentStrokeKey === key)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/v2/director" className="text-sm text-gray-400">← 대시보드</Link>
      </div>
      <h1 className="text-lg font-bold text-gray-800">
        {GROUP_LABELS[key]} <span className="text-gray-400 font-normal text-base">{students.length}명</span>
      </h1>

      {students.length === 0 && (
        <p className="py-8 text-center text-gray-400 text-sm">해당 그룹 학생이 없습니다</p>
      )}

      <div className="space-y-2">
        {students.map(s => (
          <Link key={s.id} href={`/v2/student/${s.id}`}
            className="flex items-center justify-between bg-white rounded-xl border px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800">{s.name}</p>
              <p className="text-xs text-gray-400">{s.instructorName ?? '미배정'} · {s.grade ?? '-'}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">{s.currentStepLabel ?? (key === 'master' ? '마스터' : '-')}</p>
              <p className="text-xs text-gray-300">ladder {s.passedLadder}단계</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 4: 수동 스모크**

원장 계정으로 `/v2/director` → 그룹 카드 클릭 → 학생 목록 → 학생 클릭 → 상세 확인.

- [ ] **Step 5: 전체 테스트**

Run: `npm run test:run`
Expected: 전체 통과

- [ ] **Step 6: 커밋 + 푸시**

```bash
git add app/v2/director/stroke/
git commit -m "feat: 영법 그룹 드릴다운 페이지 (/v2/director/stroke/[key])"
git push
```

---

## Self-Review

**스펙 커버리지:**
- ✅ 접영 완성 → 마스터 자동 분류 (Task 1)
- ✅ removeLastLap 빼기 버튼 (Task 2)
- ✅ 마스터 바퀴 통계 함수 (Task 3)
- ✅ MasterPanel UI — 영법별 +/− + IM (Task 4)
- ✅ 학생 페이지 마스터 분기 (Task 5)
- ✅ 원장 6그룹 카드 (Task 6)
- ✅ 그룹 드릴다운 + 학생 상세 링크 (Task 7)
- ✅ 누적 거리(totalDistanceM) 표시 (Task 3·4)
- ✅ 영법별 연습 분포 — 오늘 바퀴 수 per stroke (Task 4)

**타입 일관성:**
- `computeCurrentStrokeKey`: Task 1 정의 → Task 5·6 사용 ✅
- `removeLastLap(studentId, stepId)`: Task 2 정의 → Task 4 사용 ✅
- `getStudentMasterStats`: Task 3 정의 → Task 5 사용 ✅
- `StudentMasterStats.strokes[].strokeKey`: Task 3 `track_key` 기반 → Task 4 `strokeKey !== 'im'` 필터 ✅
- `DirectorRosterRow.currentStrokeKey`: Task 1 추가 → Task 7 사용 ✅
- `DirectorDashboard.strokeGroupCounts`: Task 6 정의 → director/page.tsx 소비 ✅
