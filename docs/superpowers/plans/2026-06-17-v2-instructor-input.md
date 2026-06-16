# v2 강사 입력(베이스라인 + 일일) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 강사가 매 수업 최소 탭으로 출결·진도·바퀴수를 남기고, 기존생 163명의 현재 위치(베이스라인)를 1회 배치하는 v2 화면 3개를 만든다.

**Architecture:** 서버 컴포넌트가 `lib/v2/data.ts`로 조회 → 클라이언트 섬이 인터랙션 → `lib/v2/actions.ts`(`'use server'`)가 쓰기. append-only(출결만 upsert). step_kind(ladder/counter/repeatable)별 입력 분기. v2 전용 라우트(`app/v2/...`), v1 미수정.

**Tech Stack:** Next.js 16.2.9(App Router, async `params`, server actions, `revalidatePath`), React 19, `@supabase/ssr`, Tailwind 4, vitest 4 + @testing-library/react.

**스펙:** `docs/superpowers/specs/2026-06-17-v2-instructor-input-design.md`

## Next 16 규약 (이 플랜이 의존)
- 동적 라우트: `params`는 **Promise** → `const { id } = await params`. 타입 `{ params: Promise<{ id: string }> }`.
- 서버액션: 전용 파일 상단 `'use server'`, 클라이언트 컴포넌트에서 import해 `onClick`/`startTransition`으로 호출. **인증은 쿠키에서**(`auth.getUser()`), 클라이언트가 준 instructorId 신뢰 금지.
- `revalidatePath(path)` from `next/cache`로 변경 화면 갱신.
- supabase 서버 클라이언트: `const supabase = await createClient()` (`lib/supabase/server.ts`, `cookies()`는 async).

## 파일 구조 (생성/수정)
- 수정: `supabase/migrations/010_v2_schema.sql` (measurements metric_type에 'attempt')
- 수정: `types/v2.ts` (`StepKind` 추가, `SkillStep.step_kind`, `MetricType`에 'attempt')
- 수정: `lib/v2/curriculum-v1-sheet.ts` (`StepKind`를 types/v2에서 import)
- 생성: `lib/v2/ladder.ts` (영법별 사다리 뷰 모델 — 순수)
- 생성: `lib/v2/baseline.ts` (베이스라인 전개 — 순수)
- 생성: `lib/v2/today.ts` (오늘 학생 카드 모델 — 순수)
- 수정: `lib/v2/data.ts` (조회 함수 추가)
- 생성: `lib/v2/actions.ts` (`'use server'` 쓰기 액션)
- 생성: `app/v2/layout.tsx` (인증 가드 + 셸)
- 생성: `app/v2/today/page.tsx` + `app/v2/today/parts.tsx`(클라이언트 섬)
- 생성: `app/v2/student/[id]/page.tsx` + `app/v2/student/[id]/StepControl.tsx`
- 생성: `app/v2/student/[id]/baseline/page.tsx` + `BaselineLadder.tsx`
- 생성: 테스트 `__tests__/v2/{ladder,baseline,today}.test.ts`

---

### Task 1: 스키마/타입 동기화 (step_kind, attempt)

**Files:**
- Modify: `supabase/migrations/010_v2_schema.sql` (measurements CHECK)
- Modify: `types/v2.ts`
- Modify: `lib/v2/curriculum-v1-sheet.ts:8` (StepKind import)

- [ ] **Step 1: measurements.metric_type에 'attempt' 추가**

`010_v2_schema.sql`의 measurements 테이블 CHECK 수정:
```sql
  metric_type text not null check (metric_type in ('laps','distance_m','time_sec','stroke_count','attempt')),
```

- [ ] **Step 2: types/v2.ts — StepKind 추가, SkillStep·MetricType 동기화**

```ts
export type MetricType = 'laps' | 'distance_m' | 'time_sec' | 'stroke_count' | 'attempt'
export type StepKind = 'ladder' | 'counter' | 'repeatable'
```
그리고 `SkillStep` 인터페이스에 추가:
```ts
  is_first_completion: boolean; measure_spec: MetricType[]; step_kind: StepKind; is_active: boolean; created_at: string
```

- [ ] **Step 3: curriculum-v1-sheet.ts에서 StepKind를 types/v2로 단일화**

`lib/v2/curriculum-v1-sheet.ts` 상단의 import를 바꾸고, 파일 내 `export type StepKind = 'ladder' | ...` 정의 줄을 **re-export로 교체**(중복 제거하되 기존 `curriculum-seed.ts`의 `import { type StepKind } from './curriculum-v1-sheet'`가 계속 동작하도록):
```ts
import type { MetricType, StepKind } from '@/types/v2'
export type { StepKind }
```
(주석 블록 `// ladder = ...`은 types/v2.ts로 옮기거나 유지. `Measure`/`SheetStep` 등 나머지는 그대로.)

- [ ] **Step 4: tsc + 기존 테스트 통과 확인**

Run: `npx tsc --noEmit && npx vitest run __tests__/v2/`
Expected: tsc 에러 없음, 기존 16개 통과.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/010_v2_schema.sql types/v2.ts lib/v2/curriculum-v1-sheet.ts
git commit -m "feat(v2): step_kind 타입 동기화 + measurements 'attempt' metric"
```

---

### Task 2: 베이스라인 전개 로직 (순수, TDD)

선택한 "영법별 도달 칸" → 통과시킬 ladder step_id 목록. counter/repeatable·타 영법 제외.

**Files:**
- Create: `lib/v2/baseline.ts`
- Test: `__tests__/v2/baseline.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// __tests__/v2/baseline.test.ts
import { describe, it, expect } from 'vitest'
import { expandBaselineSteps, type BaselineInput } from '@/lib/v2/baseline'

const steps = [
  { id: 'a', stroke_key: 'freestyle', ladder_order: 1, step_kind: 'ladder' as const },
  { id: 'b', stroke_key: 'freestyle', ladder_order: 2, step_kind: 'ladder' as const },
  { id: 'c', stroke_key: 'freestyle', ladder_order: 3, step_kind: 'ladder' as const },
  { id: 'd', stroke_key: 'freestyle', ladder_order: 4, step_kind: 'repeatable' as const },
  { id: 'e', stroke_key: 'backstroke', ladder_order: 5, step_kind: 'ladder' as const },
]

describe('expandBaselineSteps', () => {
  it('영법별 선택칸 이하 ladder만, repeatable·타영법 제외', () => {
    const input: BaselineInput = { freestyle: 2 } // 자유형 ladder_order 2까지
    expect(expandBaselineSteps(steps, input).sort()).toEqual(['a', 'b'])
  })
  it('선택 안 한 영법은 미포함', () => {
    expect(expandBaselineSteps(steps, {})).toEqual([])
  })
  it('repeatable은 경계 안이어도 제외', () => {
    expect(expandBaselineSteps(steps, { freestyle: 4 }).sort()).toEqual(['a', 'b', 'c'])
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run __tests__/v2/baseline.test.ts`
Expected: FAIL ("expandBaselineSteps is not a function" 류)

- [ ] **Step 3: 구현**

```ts
// lib/v2/baseline.ts
import type { StepKind } from '@/types/v2'

export interface BaselineStep { id: string; stroke_key: string; ladder_order: number; step_kind: StepKind }
export type BaselineInput = Record<string, number> // stroke_key → 도달 ladder_order (포함)

export function expandBaselineSteps(steps: BaselineStep[], input: BaselineInput): string[] {
  return steps
    .filter(s => s.step_kind === 'ladder' && input[s.stroke_key] !== undefined && s.ladder_order <= input[s.stroke_key])
    .map(s => s.id)
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run __tests__/v2/baseline.test.ts`
Expected: PASS (3개)

- [ ] **Step 5: Commit**

```bash
git add lib/v2/baseline.ts __tests__/v2/baseline.test.ts
git commit -m "feat(v2): 베이스라인 전개 순수 로직 + 테스트"
```

---

### Task 3: 영법별 사다리 뷰 모델 (순수, TDD)

DB에서 가져온 단계/통과/누적을 화면용 영법→트랙→단계 구조로 조립. 진도·베이스라인 화면 공용.

**Files:**
- Create: `lib/v2/ladder.ts`
- Test: `__tests__/v2/ladder.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// __tests__/v2/ladder.test.ts
import { describe, it, expect } from 'vitest'
import { buildStrokeLadders, type LadderInputStep } from '@/lib/v2/ladder'

const steps: LadderInputStep[] = [
  { id: 's1', stroke_key: 'freestyle', stroke_label: '자유형', color: '#34d399', track_key: 'kb_helper', track_label: '킥판+헬퍼', key: 'freestyle.kb_helper.1', label: '발차기', ladder_order: 1, step_kind: 'ladder', measure_spec: [], is_first_completion: false },
  { id: 's2', stroke_key: 'freestyle', stroke_label: '자유형', color: '#34d399', track_key: 'kb_helper', track_label: '킥판+헬퍼', key: 'freestyle.kb_helper.2', label: '발차기 25m', ladder_order: 2, step_kind: 'ladder', measure_spec: ['time_sec'], is_first_completion: true },
  { id: 's3', stroke_key: 'etc', stroke_label: '기타', color: null, track_key: 'turn', track_label: '턴', key: 'etc.turn.1', label: '사이드턴', ladder_order: 3, step_kind: 'counter', measure_spec: [], is_first_completion: false },
]

describe('buildStrokeLadders', () => {
  const view = buildStrokeLadders(steps, new Set(['s1']), new Map([['s1', 'baseline']]), new Map([['s3', 7]]))

  it('영법→트랙→단계로 그룹', () => {
    expect(view.map(s => s.stroke_key)).toEqual(['freestyle', 'etc'])
    expect(view[0].tracks[0].steps).toHaveLength(2)
  })
  it('통과 상태·source 반영', () => {
    const s1 = view[0].tracks[0].steps[0]
    expect(s1.passed).toBe(true); expect(s1.passSource).toBe('baseline')
    expect(view[0].tracks[0].steps[1].passed).toBe(false)
  })
  it('counter 누적 횟수 반영, 현재 단계(첫 미통과 ladder) 표시', () => {
    expect(view[1].tracks[0].steps[0].attemptCount).toBe(7)
    const current = view[0].tracks[0].steps.find(s => s.isCurrent)
    expect(current?.id).toBe('s2') // s1 통과 → s2가 현재
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run __tests__/v2/ladder.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

```ts
// lib/v2/ladder.ts
import type { MetricType, StepKind, ProgressSource } from '@/types/v2'

export interface LadderInputStep {
  id: string; stroke_key: string; stroke_label: string; color: string | null
  track_key: string; track_label: string
  key: string; label: string; ladder_order: number
  step_kind: StepKind; measure_spec: MetricType[]; is_first_completion: boolean
}
export interface LadderStepView extends LadderInputStep {
  passed: boolean; passSource: ProgressSource | null; attemptCount: number; isCurrent: boolean
}
export interface LadderTrackView { track_key: string; track_label: string; steps: LadderStepView[] }
export interface StrokeLadderView { stroke_key: string; stroke_label: string; color: string | null; tracks: LadderTrackView[] }

export function buildStrokeLadders(
  steps: LadderInputStep[],
  passedIds: Set<string>,
  sourceById: Map<string, ProgressSource>,
  attemptById: Map<string, number>,
): StrokeLadderView[] {
  const sorted = [...steps].sort((a, b) => a.ladder_order - b.ladder_order)
  const currentId = sorted.find(s => s.step_kind === 'ladder' && !passedIds.has(s.id))?.id ?? null

  const strokes: StrokeLadderView[] = []
  for (const s of sorted) {
    let stroke = strokes.find(x => x.stroke_key === s.stroke_key)
    if (!stroke) { stroke = { stroke_key: s.stroke_key, stroke_label: s.stroke_label, color: s.color, tracks: [] }; strokes.push(stroke) }
    let track = stroke.tracks.find(t => t.track_key === s.track_key)
    if (!track) { track = { track_key: s.track_key, track_label: s.track_label, steps: [] }; stroke.tracks.push(track) }
    track.steps.push({
      ...s,
      passed: passedIds.has(s.id),
      passSource: sourceById.get(s.id) ?? null,
      attemptCount: attemptById.get(s.id) ?? 0,
      isCurrent: s.id === currentId,
    })
  }
  return strokes
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run __tests__/v2/ladder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/v2/ladder.ts __tests__/v2/ladder.test.ts
git commit -m "feat(v2): 영법별 사다리 뷰 모델 + 테스트"
```

---

### Task 4: 오늘 학생 카드 모델 (순수, TDD)

학생 목록 + 당일 출결/바퀴수 → 오늘 수업 카드 모델. 스케줄 필터는 기존 `lib/schedule` 재사용.

**Files:**
- Create: `lib/v2/today.ts`
- Test: `__tests__/v2/today.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// __tests__/v2/today.test.ts
import { describe, it, expect } from 'vitest'
import { buildTodayCards, type TodayStudent } from '@/lib/v2/today'

const students: TodayStudent[] = [
  { id: 'a', name: '김', grade: '초4', schedule: '월6시/수6시' },
  { id: 'b', name: '이', grade: null, schedule: '금6시' },
]

describe('buildTodayCards', () => {
  it('오늘 요일 스케줄 학생만, 출결·바퀴수 머지 (월요일=1)', () => {
    const cards = buildTodayCards(students, new Map([['a', { attendance: '출석', laps: 12 }]]), 1)
    expect(cards.map(c => c.id)).toEqual(['a'])
    expect(cards[0].attendance).toBe('출석'); expect(cards[0].laps).toBe(12)
  })
  it('해당 요일 없으면 빈 목록 (일요일=0)', () => {
    expect(buildTodayCards(students, new Map(), 0)).toEqual([])
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run __tests__/v2/today.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

```ts
// lib/v2/today.ts
import { getTodayEntries } from '@/lib/schedule'
import type { Attendance } from '@/types/v2'

export interface TodayStudent { id: string; name: string; grade: string | null; schedule: string | null }
export interface TodaySession { attendance: Attendance | null; laps: number | null }
export interface TodayCard extends TodayStudent { attendance: Attendance | null; laps: number | null }

export function buildTodayCards(
  students: TodayStudent[],
  sessionById: Map<string, TodaySession>,
  todayJsDay: number = new Date().getDay(),
): TodayCard[] {
  return students
    .filter(s => s.schedule && getTodayEntries(s.schedule, todayJsDay).length > 0)
    .map(s => ({ ...s, attendance: sessionById.get(s.id)?.attendance ?? null, laps: sessionById.get(s.id)?.laps ?? null }))
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run __tests__/v2/today.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/v2/today.ts __tests__/v2/today.test.ts
git commit -m "feat(v2): 오늘 학생 카드 모델 + 테스트"
```

---

### Task 5: 데이터 조회 레이어 확장

서버 컴포넌트가 쓸 조회 함수. 인증된 강사 본인 학생만(RLS가 강제하지만 명시 필터도).

**Files:**
- Modify: `lib/v2/data.ts`

- [ ] **Step 1: getTodayStudents 추가**

`lib/v2/data.ts` 하단에 추가:
```ts
import type { TodayStudent, TodaySession } from './today'

export async function getTodayStudentsRaw(instructorId: string): Promise<{ students: TodayStudent[]; sessionById: Map<string, TodaySession> }> {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)
  const { data: students, error } = await supabase
    .from('students').select('id,name,grade,schedule')
    .eq('instructor_id', instructorId).eq('is_active', true).order('name')
  if (error) throw error
  const ids = (students ?? []).map(s => s.id)
  const sessionById = new Map<string, TodaySession>()
  if (ids.length) {
    const { data: sessions } = await supabase
      .from('sessions').select('student_id,attendance').eq('session_date', today).in('student_id', ids)
    const { data: laps } = await supabase
      .from('measurements').select('student_id,value').eq('metric_type', 'laps').is('skill_step_id', null)
      .eq('measured_on', today).in('student_id', ids)
    const lapByStudent = new Map<string, number>()
    for (const l of laps ?? []) lapByStudent.set(l.student_id, Number(l.value))
    for (const s of sessions ?? []) sessionById.set(s.student_id, { attendance: s.attendance, laps: lapByStudent.get(s.student_id) ?? null })
    for (const [sid, v] of lapByStudent) if (!sessionById.has(sid)) sessionById.set(sid, { attendance: null, laps: v })
  }
  return { students: (students ?? []) as TodayStudent[], sessionById }
}
```

- [ ] **Step 2: getStrokeLadders 추가 (사다리 뷰 입력 조립)**

```ts
import { buildStrokeLadders, type LadderInputStep, type StrokeLadderView } from './ladder'
import type { ProgressSource } from '@/types/v2'

export async function getStrokeLadders(studentId: string): Promise<StrokeLadderView[]> {
  const supabase = await createClient()
  const { data: version } = await supabase.from('curriculum_versions').select('id').eq('status', 'active').single()
  if (!version) return []
  const { data: rows, error } = await supabase
    .from('skill_steps')
    .select('id,key,label,ladder_order,step_kind,measure_spec,is_first_completion,strokes(key,label,color,display_order),skill_tracks(key,label,display_order)')
    .eq('curriculum_version_id', version.id).eq('is_active', true)
    .order('ladder_order', { ascending: true })
  if (error) throw error
  const steps: LadderInputStep[] = (rows ?? []).map((r: any) => ({
    id: r.id, stroke_key: r.strokes.key, stroke_label: r.strokes.label, color: r.strokes.color,
    track_key: r.skill_tracks?.key ?? '', track_label: r.skill_tracks?.label ?? '',
    key: r.key, label: r.label, ladder_order: r.ladder_order,
    step_kind: r.step_kind, measure_spec: r.measure_spec ?? [], is_first_completion: r.is_first_completion,
  }))
  const [{ data: prog }, { data: att }] = await Promise.all([
    supabase.from('skill_progress').select('skill_step_id,source').eq('student_id', studentId),
    supabase.from('measurements').select('skill_step_id').eq('student_id', studentId).eq('metric_type', 'attempt'),
  ])
  const passedIds = new Set<string>(); const sourceById = new Map<string, ProgressSource>()
  for (const p of prog ?? []) { passedIds.add(p.skill_step_id); sourceById.set(p.skill_step_id, p.source) }
  const attemptById = new Map<string, number>()
  for (const a of att ?? []) if (a.skill_step_id) attemptById.set(a.skill_step_id, (attemptById.get(a.skill_step_id) ?? 0) + 1)
  return buildStrokeLadders(steps, passedIds, sourceById, attemptById)
}
```

- [ ] **Step 3: tsc 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음. (`strokes(...)` 조인 타입은 `any` 매핑으로 우회 — eslint no-explicit-any 경고 시 해당 라인에 `// eslint-disable-next-line @typescript-eslint/no-explicit-any`.)

- [ ] **Step 4: Commit**

```bash
git add lib/v2/data.ts
git commit -m "feat(v2): 오늘학생·영법사다리 조회 함수"
```

---

### Task 6: 서버 액션 (쓰기)

**Files:**
- Create: `lib/v2/actions.ts`

- [ ] **Step 1: 액션 파일 작성 (인증·소유 검증 포함)**

```ts
// lib/v2/actions.ts
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Attendance, MetricType, Difficulty } from '@/types/v2'

async function ctx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  return { supabase, userId: user.id }
}
async function assertOwns(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, studentId: string) {
  const { data } = await supabase.from('students').select('id').eq('id', studentId).eq('instructor_id', userId).single()
  if (!data) throw new Error('Forbidden')
}
const today = () => new Date().toISOString().slice(0, 10)

// 당일 session 보장(없으면 출석 기본). session id 반환.
async function ensureSession(supabase: any, userId: string, studentId: string): Promise<string> {
  const { data: existing } = await supabase.from('sessions').select('id').eq('student_id', studentId).eq('session_date', today()).maybeSingle()
  if (existing) return existing.id
  const { data, error } = await supabase.from('sessions')
    .insert({ student_id: studentId, instructor_id: userId, session_date: today(), attendance: '출석' })
    .select('id').single()
  if (error) throw error
  return data.id
}

export async function markAttendance(studentId: string, attendance: Attendance) {
  const { supabase, userId } = await ctx(); await assertOwns(supabase, userId, studentId)
  const { error } = await supabase.from('sessions')
    .upsert({ student_id: studentId, instructor_id: userId, session_date: today(), attendance }, { onConflict: 'student_id,session_date' })
  if (error) throw error
  revalidatePath('/v2/today')
}

export async function setLaps(studentId: string, laps: number) {
  const { supabase, userId } = await ctx(); await assertOwns(supabase, userId, studentId)
  const sessionId = await ensureSession(supabase, userId, studentId)
  // 같은 날 총 바퀴수는 1행 유지(덮어쓰기 예외): 기존 삭제 후 삽입
  await supabase.from('measurements').delete()
    .eq('student_id', studentId).eq('metric_type', 'laps').is('skill_step_id', null).eq('measured_on', today())
  const { error } = await supabase.from('measurements').insert({
    student_id: studentId, metric_type: 'laps', value: laps, measured_on: today(), session_id: sessionId, instructor_id: userId, skill_step_id: null,
  })
  if (error) throw error
  revalidatePath('/v2/today')
}

export async function passStepAction(studentId: string, step: { id: string; key: string; ladder_order: number }, opts: { difficulty?: Difficulty; measures?: { metric: MetricType; value: number }[] } = {}) {
  const { supabase, userId } = await ctx(); await assertOwns(supabase, userId, studentId)
  const sessionId = await ensureSession(supabase, userId, studentId)
  const { error } = await supabase.from('skill_progress').insert({
    student_id: studentId, skill_step_id: step.id, source: 'observed', difficulty: opts.difficulty ?? null,
    source_session_id: sessionId, instructor_id: userId, step_key_snapshot: step.key, ladder_order_snapshot: step.ladder_order,
  })
  if (error && !String(error.message).includes('duplicate')) throw error
  for (const m of opts.measures ?? []) {
    await supabase.from('measurements').insert({ student_id: studentId, metric_type: m.metric, value: m.value, measured_on: today(), session_id: sessionId, skill_step_id: step.id, instructor_id: userId })
  }
  revalidatePath(`/v2/student/${studentId}`)
}

export async function addAttempt(studentId: string, stepId: string) {
  const { supabase, userId } = await ctx(); await assertOwns(supabase, userId, studentId)
  const sessionId = await ensureSession(supabase, userId, studentId)
  const { error } = await supabase.from('measurements').insert({ student_id: studentId, metric_type: 'attempt', value: 1, measured_on: today(), session_id: sessionId, skill_step_id: stepId, instructor_id: userId })
  if (error) throw error
  revalidatePath(`/v2/student/${studentId}`)
}

export async function completeCounter(studentId: string, step: { id: string; key: string; ladder_order: number }, difficulty?: Difficulty) {
  await passStepAction(studentId, step, { difficulty })
}

export async function logRepeatable(studentId: string, stepId: string, metric: MetricType, value: number) {
  const { supabase, userId } = await ctx(); await assertOwns(supabase, userId, studentId)
  const sessionId = await ensureSession(supabase, userId, studentId)
  const { error } = await supabase.from('measurements').insert({ student_id: studentId, metric_type: metric, value, measured_on: today(), session_id: sessionId, skill_step_id: stepId, instructor_id: userId })
  if (error) throw error
  revalidatePath(`/v2/student/${studentId}`)
}

export async function setBaseline(studentId: string, stepIds: string[], snapshots: Record<string, { key: string; ladder_order: number }>) {
  const { supabase, userId } = await ctx(); await assertOwns(supabase, userId, studentId)
  const rows = stepIds.map(id => ({
    student_id: studentId, skill_step_id: id, source: 'baseline', instructor_id: userId,
    step_key_snapshot: snapshots[id].key, ladder_order_snapshot: snapshots[id].ladder_order,
  }))
  if (rows.length) {
    const { error } = await supabase.from('skill_progress').upsert(rows, { onConflict: 'student_id,skill_step_id', ignoreDuplicates: true })
    if (error) throw error
  }
  revalidatePath(`/v2/student/${studentId}`)
}
```

- [ ] **Step 2: tsc + lint(lib/v2) 확인**

Run: `npx tsc --noEmit && npx eslint lib/v2/`
Expected: 에러 없음. (any 사용 라인은 `// eslint-disable-next-line @typescript-eslint/no-explicit-any` 부여.)

- [ ] **Step 3: Commit**

```bash
git add lib/v2/actions.ts
git commit -m "feat(v2): 강사 입력 서버액션(출결/바퀴/통과/카운터/반복/베이스라인)"
```

---

### Task 7: v2 레이아웃(인증 가드) + 셸

**Files:**
- Create: `app/v2/layout.tsx`

- [ ] **Step 1: 레이아웃 작성 (미로그인 → /login)**

```tsx
// app/v2/layout.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function V2Layout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return (
    <div className="mx-auto max-w-md min-h-screen bg-gray-50">
      <header className="px-4 py-3 border-b bg-white">
        <Link href="/v2/today" className="font-bold text-gray-800">AI-ON 오늘 수업</Link>
      </header>
      <main className="p-4">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음. (`next build`는 .env.local 필요 → 적용 후 스모크.)

- [ ] **Step 3: Commit**

```bash
git add app/v2/layout.tsx
git commit -m "feat(v2): v2 레이아웃 + 인증 가드"
```

---

### Task 8: 오늘 수업 페이지 + 출결/바퀴 섬

**Files:**
- Create: `app/v2/today/page.tsx`
- Create: `app/v2/today/parts.tsx`

- [ ] **Step 1: 클라이언트 섬 작성**

```tsx
// app/v2/today/parts.tsx
'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { markAttendance, setLaps } from '@/lib/v2/actions'
import type { Attendance } from '@/types/v2'
import type { TodayCard } from '@/lib/v2/today'

const ATT: Attendance[] = ['출석', '지각', '결석']
const COLOR: Record<Attendance, string> = { '출석': 'bg-green-500 text-white', '지각': 'bg-yellow-400 text-white', '결석': 'bg-red-400 text-white' }

export function TodayCardItem({ card }: { card: TodayCard }) {
  const [pending, start] = useTransition()
  const [laps, setLapsState] = useState(card.laps ?? 0)
  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <Link href={`/v2/student/${card.id}`} className="flex justify-between px-4 pt-3 pb-2">
        <div><p className="font-semibold text-gray-800">{card.name}</p><p className="text-xs text-gray-400">{card.grade ?? ''}</p></div>
        <span className="text-gray-300 text-sm">진도 →</span>
      </Link>
      <div className="flex gap-1.5 px-3">
        {ATT.map(a => (
          <button key={a} disabled={pending} onClick={() => start(() => markAttendance(card.id, a))}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold ${card.attendance === a ? COLOR[a] : 'bg-gray-100 text-gray-400'}`}>{a}</button>
        ))}
      </div>
      <div className="flex items-center gap-2 px-3 py-3">
        <span className="text-xs text-gray-500">바퀴수</span>
        <button onClick={() => { const v = Math.max(0, laps - 1); setLapsState(v); start(() => setLaps(card.id, v)) }} className="w-8 h-8 rounded bg-gray-100">−</button>
        <span className="w-8 text-center font-semibold">{laps}</span>
        <button onClick={() => { const v = laps + 1; setLapsState(v); start(() => setLaps(card.id, v)) }} className="w-8 h-8 rounded bg-gray-100">＋</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 서버 페이지 작성**

```tsx
// app/v2/today/page.tsx
import { createClient } from '@/lib/supabase/server'
import { getTodayStudentsRaw } from '@/lib/v2/data'
import { buildTodayCards } from '@/lib/v2/today'
import { TodayCardItem } from './parts'

export default async function TodayPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { students, sessionById } = await getTodayStudentsRaw(user!.id)
  const cards = buildTodayCards(students, sessionById)
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-gray-800">오늘 수업</h2>
      {cards.length === 0
        ? <p className="text-center py-16 text-gray-400 text-sm">오늘 수업이 없습니다</p>
        : cards.map(c => <TodayCardItem key={c.id} card={c} />)}
    </div>
  )
}
```

- [ ] **Step 3: tsc 확인 + Commit**

Run: `npx tsc --noEmit`
```bash
git add app/v2/today/
git commit -m "feat(v2): 오늘 수업 화면(출결·바퀴수)"
```

---

### Task 9: 학생 진도 페이지 + StepControl 섬

**Files:**
- Create: `app/v2/student/[id]/page.tsx`
- Create: `app/v2/student/[id]/StepControl.tsx`

- [ ] **Step 1: StepControl 섬 (step_kind 분기)**

```tsx
// app/v2/student/[id]/StepControl.tsx
'use client'
import { useState, useTransition } from 'react'
import { passStepAction, addAttempt, completeCounter, logRepeatable } from '@/lib/v2/actions'
import type { LadderStepView } from '@/lib/v2/ladder'

export function StepControl({ studentId, step }: { studentId: string; step: LadderStepView }) {
  const [pending, start] = useTransition()
  const [time, setTime] = useState(''); const [strokes, setStrokes] = useState('')
  const snap = { id: step.id, key: step.key, ladder_order: step.ladder_order }

  const measures = () => {
    const m: { metric: 'time_sec' | 'stroke_count'; value: number }[] = []
    if (step.measure_spec.includes('time_sec') && time) m.push({ metric: 'time_sec', value: Number(time) })
    if (step.measure_spec.includes('stroke_count') && strokes) m.push({ metric: 'stroke_count', value: Number(strokes) })
    return m
  }

  if (step.step_kind === 'counter') {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className={`flex-1 text-sm ${step.passed ? 'text-gray-400 line-through' : ''}`}>{step.label}</span>
        <span className="text-xs text-gray-500">연습 {step.attemptCount}</span>
        <button disabled={pending} onClick={() => start(() => addAttempt(studentId, step.id))} className="px-2 py-1 rounded bg-gray-100 text-xs">+1</button>
        {!step.passed && <button disabled={pending} onClick={() => start(() => completeCounter(studentId, snap))} className="px-2 py-1 rounded bg-green-500 text-white text-xs">완성</button>}
      </div>
    )
  }
  if (step.step_kind === 'repeatable') {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="flex-1 text-sm">{step.label}</span>
        <button disabled={pending} onClick={() => start(() => logRepeatable(studentId, step.id, 'laps', 1))} className="px-2 py-1 rounded bg-gray-100 text-xs">+1바퀴</button>
        {step.measure_spec.includes('time_sec') && (
          <input value={time} onChange={e => setTime(e.target.value)} onBlur={() => time && start(() => logRepeatable(studentId, step.id, 'time_sec', Number(time)))}
            inputMode="numeric" placeholder="초" className="w-14 border rounded px-1 text-xs" />
        )}
      </div>
    )
  }
  // ladder
  return (
    <div className="flex items-center gap-2 py-1">
      <span className={`flex-1 text-sm ${step.passed ? 'text-gray-400 line-through' : step.isCurrent ? 'font-semibold text-blue-600' : ''}`}>{step.label}{step.passSource === 'baseline' && <em className="ml-1 text-[10px] text-gray-400">기준</em>}</span>
      {step.measure_spec.includes('time_sec') && !step.passed && <input value={time} onChange={e => setTime(e.target.value)} inputMode="numeric" placeholder="초" className="w-12 border rounded px-1 text-xs" />}
      {step.measure_spec.includes('stroke_count') && !step.passed && <input value={strokes} onChange={e => setStrokes(e.target.value)} inputMode="numeric" placeholder="스트로크" className="w-16 border rounded px-1 text-xs" />}
      {!step.passed && <button disabled={pending} onClick={() => start(() => passStepAction(studentId, snap, { measures: measures() }))} className="px-3 py-1 rounded bg-blue-500 text-white text-xs">통과</button>}
    </div>
  )
}
```

- [ ] **Step 2: 서버 페이지 (async params)**

```tsx
// app/v2/student/[id]/page.tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getStrokeLadders } from '@/lib/v2/data'
import { StepControl } from './StepControl'

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: student } = await supabase.from('students').select('name,grade').eq('id', id).single()
  const strokes = await getStrokeLadders(id)
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">{student?.name} 진도</h2>
        <Link href={`/v2/student/${id}/baseline`} className="text-xs text-blue-500">기준 배치</Link>
      </div>
      {strokes.map(s => (
        <section key={s.stroke_key} className="bg-white rounded-xl border p-3">
          <h3 className="font-semibold text-sm mb-2" style={{ color: s.color ?? undefined }}>{s.stroke_label}</h3>
          {s.tracks.map(t => (
            <div key={t.track_key} className="mb-2">
              <p className="text-[11px] text-gray-400 mb-1">{t.track_label}</p>
              {t.steps.map(step => <StepControl key={step.id} studentId={id} step={step} />)}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: tsc 확인 + Commit**

Run: `npx tsc --noEmit`
```bash
git add app/v2/student/[id]/page.tsx app/v2/student/[id]/StepControl.tsx
git commit -m "feat(v2): 학생 진도 화면(통과·카운터·반복 입력)"
```

---

### Task 10: 베이스라인 배치 페이지 + BaselineLadder 섬

**Files:**
- Create: `app/v2/student/[id]/baseline/page.tsx`
- Create: `app/v2/student/[id]/baseline/BaselineLadder.tsx`

- [ ] **Step 1: BaselineLadder 섬 (영법별 도달 칸 선택)**

```tsx
// app/v2/student/[id]/baseline/BaselineLadder.tsx
'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setBaseline } from '@/lib/v2/actions'
import { expandBaselineSteps, type BaselineStep } from '@/lib/v2/baseline'
import type { StrokeLadderView } from '@/lib/v2/ladder'

export function BaselineLadder({ studentId, strokes }: { studentId: string; strokes: StrokeLadderView[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  // 영법별 현재 선택(도달 ladder_order). 초기값 = 기존 baseline/observed 최고 통과 ladder.
  const init: Record<string, number> = {}
  const flat: BaselineStep[] = []
  const snapshots: Record<string, { key: string; ladder_order: number }> = {}
  for (const s of strokes) for (const t of s.tracks) for (const st of t.steps) {
    flat.push({ id: st.id, stroke_key: s.stroke_key, ladder_order: st.ladder_order, step_kind: st.step_kind })
    snapshots[st.id] = { key: st.key, ladder_order: st.ladder_order }
    if (st.step_kind === 'ladder' && st.passed) init[s.stroke_key] = Math.max(init[s.stroke_key] ?? 0, st.ladder_order)
  }
  const [sel, setSel] = useState<Record<string, number>>(init)

  const save = () => {
    const ids = expandBaselineSteps(flat, sel)
    start(async () => { await setBaseline(studentId, ids, snapshots); router.push(`/v2/student/${studentId}`) })
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">영법마다 현재 도달한 단계를 고르면, 그 아래 단계가 모두 통과(기준)로 기록됩니다.</p>
      {strokes.map(s => {
        const ladderSteps = s.tracks.flatMap(t => t.steps.filter(st => st.step_kind === 'ladder'))
        if (ladderSteps.length === 0) return null
        return (
          <section key={s.stroke_key} className="bg-white rounded-xl border p-3">
            <h3 className="font-semibold text-sm mb-2" style={{ color: s.color ?? undefined }}>{s.stroke_label}</h3>
            <div className="flex flex-wrap gap-1">
              <button onClick={() => setSel(p => ({ ...p, [s.stroke_key]: 0 }))}
                className={`px-2 py-1 rounded text-xs ${!sel[s.stroke_key] ? 'bg-gray-300' : 'bg-gray-100'}`}>시작전</button>
              {ladderSteps.map(st => (
                <button key={st.id} onClick={() => setSel(p => ({ ...p, [s.stroke_key]: st.ladder_order }))}
                  className={`px-2 py-1 rounded text-xs ${(sel[s.stroke_key] ?? 0) >= st.ladder_order ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}>{st.label}</button>
              ))}
            </div>
          </section>
        )
      })}
      <button disabled={pending} onClick={save} className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold">{pending ? '저장 중…' : '기준 저장'}</button>
    </div>
  )
}
```

- [ ] **Step 2: 서버 페이지**

```tsx
// app/v2/student/[id]/baseline/page.tsx
import { getStrokeLadders } from '@/lib/v2/data'
import { BaselineLadder } from './BaselineLadder'

export default async function BaselinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const strokes = await getStrokeLadders(id)
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-800">기준 배치</h2>
      <BaselineLadder studentId={id} strokes={strokes} />
    </div>
  )
}
```

- [ ] **Step 3: tsc 확인 + Commit**

Run: `npx tsc --noEmit`
```bash
git add app/v2/student/[id]/baseline/
git commit -m "feat(v2): 기존생 베이스라인 배치 화면"
```

---

### Task 11: 전체 검증 + 실 DB 스모크

**Files:** (없음 — 검증)

- [ ] **Step 1: 정적 검증 일괄**

Run: `npx tsc --noEmit && npx eslint app/v2 lib/v2 && npx vitest run __tests__/v2/`
Expected: tsc/lint 에러 없음, 테스트 전부 통과(기존 16 + baseline 3 + ladder 3 + today 2).

- [ ] **Step 2: 마이그레이션 적용 (원장, SQL Editor)**

기존 진도관리 Supabase에서 1주 테스트 테이블 drop 후 `010`(attempt 포함)·`011`·`012`·`seed-local/013` 적용. 검증: `select count(*) from skill_steps` = 144, `from students` = 163.

- [ ] **Step 3: dev 스모크 (.env.local 필요)**

Run: `npm run dev` → 로그인 → `/v2/today` 출결·바퀴 → 학생 진도 통과/카운터/반복 → `/v2/student/[id]/baseline` 배치 저장 → DB(`skill_progress`,`measurements`,`sessions`)에 행 생성 확인.

- [ ] **Step 4: 최종 커밋(있으면) + V2-RESUME 갱신**

`docs/superpowers/V2-RESUME.md`의 "완료/다음" 갱신 후 커밋·푸시.

---

## 명시적 비범위 (다음 플랜)
템플릿 CRUD, 본격 재측정/월영상 흐름, 관리자 커리큘럼 편집, 부모 리포트/예측, 원장(director) 화면, 베이스라인 칸 되돌리기.
