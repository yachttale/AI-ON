# v3 아이 직접입력 흐름 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 아이가 로비 패드에서 오늘 한 내용을 직접 입력(임시) → 강사가 확인·판정(확정) → 원장이 대시보드로 전체 현황을 보는 흐름을, 기존 v2 데이터 모델 위에 가볍게 구축하고 느림을 잡는다.

**Architecture:** 기존 `AI-ON` 리포(Next.js 16 App Router + Supabase + Vercel)에서 진화. 데이터 모델·인증·RLS·`lib/v2/*`·테스트는 재사용. 신규는 ① 키오스크 라우트(`/kiosk/[instructorId]`) ② `sessions` 확인 워크플로우 컬럼 ③ 강사 확인 액션 ④ 원장 대시보드 ⑤ 성능(커리큘럼 캐싱·스트리밍·낙관적 UI·PWA). 키오스크는 새 계정 없이 "패드에 강사 1회 로그인 + 라우트 잠금"으로 동작하며, 아이 입력은 강사 auth 하에 `input_source='child'`로 기록된다.

**Tech Stack:** Next.js 16.2.9 / React 19.2.4, TypeScript 5, Supabase (`@supabase/ssr`), Tailwind 4, vitest 4, base-ui/react, lucide-react.

## Global Constraints

- Next.js **16.2.9**, React **19.2.4** 고정. 서버 액션·`revalidatePath`·동적 라우트 규약은 코드 작성 전 `node_modules/next/dist/docs/`에서 실독(AGENTS.md 지시).
- **append-only**: 모든 입력은 이벤트 적재. 상태 전이는 `sessions`(출결·확정)에 한정. 진도/측정은 append.
- 마이그레이션은 번호순 SQL 파일(`supabase/migrations/NNN_*.sql`). 다음 번호 = **016**. Supabase SQL Editor 수동 적용.
- 모든 서버 액션은 `ctx()`(auth.getUser) + `assertOwns()`로 소유 확인 후 쓰기. 원장(role='director')은 전체 허용.
- 순수 로직은 `lib/v2/*.ts`로 분리하고 vitest 단위 테스트(`__tests__/v2/*.test.ts`). 서버 액션·UI는 얇게.
- 테스트 실행: `npm run test:run`. 린트: `npm run lint`. 빌드: `npm run build`.
- 커밋은 사용자가 요청할 때만. 작업 브랜치는 기존 `feat/v2-data-platform` 가정(필요 시 분기).

---

## File Structure

**생성:**
- `supabase/migrations/016_v2_confirm_workflow.sql` — sessions 확인 컬럼
- `lib/v2/kiosk.ts` — 키오스크 명단 순수 로직
- `lib/v2/dashboard.ts` — 원장 대시보드 집계 순수 로직
- `app/kiosk/layout.tsx` — 키오스크 전체화면 레이아웃(잠금)
- `app/kiosk/[instructorId]/page.tsx` — 명단 서버 페이지
- `app/kiosk/[instructorId]/KioskRoster.tsx` — 이름 그리드 + 10초 자동복귀(클라이언트)
- `app/kiosk/[instructorId]/ChildInput.tsx` — 아이 입력(현재단계·바퀴수, 클라이언트)
- `app/v2/director/dashboard/page.tsx` — 원장 대시보드
- `public/manifest.webmanifest` — PWA 매니페스트
- `__tests__/v2/kiosk.test.ts`, `__tests__/v2/dashboard.test.ts`

**수정:**
- `lib/v2/actions.ts` — `childReportActivity`, `confirmSession`, `acceptReportedStep` 추가
- `lib/v2/data.ts` — `getKioskRosterRaw`, `getTodayStudentsRaw`(확인상태 포함), `getDashboardRaw` 추가; 커리큘럼 조회 `cache()` 적용
- `lib/v2/today.ts` — `TodayCard`에 확인상태·보고단계 필드 추가
- `app/v2/today/page.tsx`, `app/v2/today/parts.tsx` — 미확인 배지 + 확인 버튼 + 보고단계 인정
- `lib/v2/curriculum-v1-sheet.ts` + `supabase/migrations/012_v2_curriculum_seed.sql` — 엑셀 기준 갱신(또는 신규 016 이후 시드)
- `app/layout.tsx` — manifest 링크
- `types/v2.ts` — `Session`에 확인 필드 타입 추가

---

## Task 1: sessions 확인 워크플로우 스키마 + 타입

**Files:**
- Create: `supabase/migrations/016_v2_confirm_workflow.sql`
- Modify: `types/v2.ts:42-46` (Session 인터페이스)

**Interfaces:**
- Produces: `sessions.input_source` (`'child'|'instructor'`), `sessions.status` (`'pending'|'confirmed'`), `sessions.confirmed_by` (uuid null), `sessions.confirmed_at` (timestamptz null), `sessions.reported_step_id` (uuid null FK skill_steps). 타입 `Session`에 동일 필드.

- [ ] **Step 1: 마이그레이션 작성**

`supabase/migrations/016_v2_confirm_workflow.sql`:
```sql
-- 016_v2_confirm_workflow.sql — 아이 입력(임시) → 강사 확인(확정) 워크플로우
alter table public.sessions
  add column input_source text not null default 'instructor'
    check (input_source in ('child','instructor')),
  add column status text not null default 'confirmed'
    check (status in ('pending','confirmed')),
  add column confirmed_by uuid references public.profiles(id),
  add column confirmed_at timestamptz,
  add column reported_step_id uuid references public.skill_steps(id);

-- 기존 강사 입력 세션은 확정으로 간주(default가 처리). 아이 입력만 pending으로 생성.
create index idx_sessions_status on public.sessions(status, session_date);
comment on column public.sessions.reported_step_id is '아이가 패드에서 "했어요" 한 단계(보고용, 통과 아님)';
```

- [ ] **Step 2: 타입 갱신**

`types/v2.ts` `Session` 인터페이스에 필드 추가(기존 줄 끝에 이어서):
```typescript
export interface Session {
  id: string; session_date: string; student_id: string; instructor_id: string
  attendance: Attendance; absence_reason: AbsenceReason | null
  template_id: string | null; focus_stroke_id: string | null; memo: string | null; created_at: string
  input_source: 'child' | 'instructor'; status: 'pending' | 'confirmed'
  confirmed_by: string | null; confirmed_at: string | null; reported_step_id: string | null
}
```

- [ ] **Step 3: 타입 컴파일 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음(없으면 통과. 기존 코드가 새 필드를 요구하지 않으므로 깨지지 않음).

- [ ] **Step 4: 마이그레이션 적용 (수동)**

Supabase SQL Editor에 `016_v2_confirm_workflow.sql` 붙여넣고 실행. Expected: `ALTER TABLE` 성공, sessions에 5개 컬럼 추가.

> 적용 검증: `select column_name from information_schema.columns where table_name='sessions';` 에 input_source/status/confirmed_by/confirmed_at/reported_step_id 포함.

---

## Task 2: 엑셀 → 커리큘럼 시드 갱신

**Files:**
- Modify: `lib/v2/curriculum-v1-sheet.ts` (단계 데이터)
- Modify: `supabase/migrations/012_v2_curriculum_seed.sql` (재생성)
- Test: `__tests__/v2/curriculum-seed.test.ts` (검증 보강)
- Reference: `C:/Users/hyo seong/Desktop/Claude/starkids/ai-on 최종/AI-ON 영법 단계표 v2.xlsx`

**Interfaces:**
- Consumes: 엑셀 소분류 표(대분류=stroke, 중분류=track, 소분류=step).
- Produces: 활성 커리큘럼 버전1의 `skill_steps` 행. step_kind 매핑은 §3 스펙 표.

- [ ] **Step 1: 엑셀 파싱**

엑셀을 읽어 (대분류, 중분류, 소분류, 측정, 첫완주, 비고) 행 목록을 추출. 파싱 헬퍼(일회성 스크립트 허용):
```bash
cd "C:/Users/hyo seong/Desktop/Claude/starkids/AI-ON"
node -e "const X=require('xlsx');const wb=X.readFile('../ai-on 최종/AI-ON 영법 단계표 v2.xlsx');const ws=wb.Sheets[wb.SheetNames[0]];console.log(JSON.stringify(X.utils.sheet_to_json(ws,{header:1}),null,1))"
```
(xlsx 미설치 시 `npm i -D xlsx` 후 실행. 또는 이미 추출된 소분류 목록을 스펙 §3·대화 기록에서 사용.)

- [ ] **Step 2: step_kind 매핑 규칙 적용**

각 소분류 행을 step_kind로 분류(스펙 §3):
- `5m/15m/25m` 진행 = `ladder`
- 첫완주 `O` + 측정(시간/시간+스트로크) = `ladder` + `is_first_completion=true` + `measure_spec`(`['time_sec']` 또는 `['time_sec','stroke_count']`)
- 마스터·50m·IM "위아래 1·2바퀴, 6회마다 측정" = `repeatable`(measure_spec `['laps','time_sec']`)
- 턴 "클릭 누적·완성" = `counter`
- 구르기·물건줍기 등 단발 물적응 = `single`

`lib/v2/curriculum-v1-sheet.ts`의 단계 배열을 위 매핑으로 갱신. 각 step에 안정적 `key`(예: `free_kick_25m`), `ladder_order`(영법 내 순서), `track`(킥/팔/콤비/호흡).

- [ ] **Step 3: 시드 SQL 재생성**

기존 파이프라인 `lib/v2/curriculum-seed.sql-emit.ts`로 SQL 재생성(있는 emit 스크립트 사용):
```bash
cd "C:/Users/hyo seong/Desktop/Claude/starkids/AI-ON"
npx tsx lib/v2/curriculum-seed.sql-emit.ts > supabase/migrations/012_v2_curriculum_seed.sql
```
(emit 스크립트의 실제 실행법은 파일 상단 주석 확인. tsx 없으면 `npx tsx` 자동 설치.)

- [ ] **Step 4: 시드 단위 테스트 갱신·실행**

`__tests__/v2/curriculum-seed.test.ts`에 검증 추가: ① 모든 step에 step_kind가 enum 4종 중 하나 ② 영법별 ladder_order가 0/1부터 연속 ③ 첫완주 step에 measure_spec 비어있지 않음 ④ key 중복 없음.
```bash
npm run test:run -- curriculum-seed
```
Expected: PASS.

- [ ] **Step 5: 시드 적용 (수동)**

Supabase SQL Editor에 재생성된 012 실행(기존 커리큘럼 버전 archive 후 새 버전 active, 또는 스크립트가 처리). Expected: `select count(*) from skill_steps where is_active`; 가 엑셀 소분류 수와 일치.

---

## Task 3: 키오스크 명단 순수 로직

**Files:**
- Create: `lib/v2/kiosk.ts`
- Test: `__tests__/v2/kiosk.test.ts`

**Interfaces:**
- Consumes: `TodayStudent[]`(lib/v2/today.ts), `lib/schedule`의 `getTodayEntries`.
- Produces:
  - `interface KioskSlot { hour: number; students: KioskStudent[] }`
  - `interface KioskStudent { id: string; name: string; grade: string | null; done: boolean }`
  - `function buildKioskRoster(students: TodayStudent[], instructorId: string, doneIds: Set<string>, nowJsDay: number, nowHour: number, maxPerSlot?: number): KioskSlot`
    — 해당 강사 담당·오늘 요일·**현재 시간(또는 가장 가까운 다음 시간)** 슬롯의 학생을 최대 `maxPerSlot`(기본 5)명 반환. `done`=오늘 이미 입력 여부.

- [ ] **Step 1: 실패 테스트 작성**

`__tests__/v2/kiosk.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { buildKioskRoster } from '@/lib/v2/kiosk'
import type { TodayStudent } from '@/lib/v2/today'

const mk = (id: string, name: string, schedule: string, instructor_id: string): TodayStudent =>
  ({ id, name, grade: '초2', schedule, instructor_id, instructor_name: null })

describe('buildKioskRoster', () => {
  it('현재 시간·해당 강사·오늘 요일 학생만, 최대 5명', () => {
    const inst = 'A'
    const students = [
      mk('1', '가', '월6시', inst), mk('2', '나', '월6시', inst),
      mk('3', '다', '월6시', inst), mk('4', '라', '월6시', inst),
      mk('5', '마', '월6시', inst), mk('6', '바', '월6시', inst), // 6번째 잘림
      mk('7', '사', '월7시', inst),   // 다른 시간
      mk('8', '아', '월6시', 'B'),    // 다른 강사
      mk('9', '자', '화6시', inst),   // 다른 요일
    ]
    // 월요일(JS day=1), 18시(6시 오후)
    const slot = buildKioskRoster(students, inst, new Set(), 1, 18)
    expect(slot.hour).toBe(18)
    expect(slot.students.map(s => s.id)).toEqual(['1','2','3','4','5'])
  })

  it('입력 완료 학생은 done=true', () => {
    const slot = buildKioskRoster([mk('1','가','월6시','A')], 'A', new Set(['1']), 1, 18)
    expect(slot.students[0].done).toBe(true)
  })

  it('현재 시간 슬롯이 없으면 오늘 남은 가장 가까운 다음 시간', () => {
    const slot = buildKioskRoster([mk('1','가','월7시','A')], 'A', new Set(), 1, 18)
    expect(slot.hour).toBe(19)
    expect(slot.students.map(s => s.id)).toEqual(['1'])
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test:run -- kiosk`
Expected: FAIL ("buildKioskRoster is not a function" 또는 모듈 없음).

- [ ] **Step 3: 구현**

`lib/v2/kiosk.ts`:
```typescript
// lib/v2/kiosk.ts — 키오스크 명단(순수). 강사·오늘 요일·현재(또는 다음) 시간 슬롯, 최대 5명.
import { getTodayEntries } from '@/lib/schedule'
import type { TodayStudent } from './today'

export interface KioskStudent { id: string; name: string; grade: string | null; done: boolean }
export interface KioskSlot { hour: number; students: KioskStudent[] }

export function buildKioskRoster(
  students: TodayStudent[],
  instructorId: string,
  doneIds: Set<string>,
  nowJsDay: number,
  nowHour: number,
  maxPerSlot = 5,
): KioskSlot {
  // 이 강사·오늘 요일 학생의 (학생, 시간) 목록
  const pairs: { s: TodayStudent; hour: number }[] = []
  for (const s of students) {
    if (s.instructor_id !== instructorId || !s.schedule) continue
    for (const e of getTodayEntries(s.schedule, nowJsDay)) pairs.push({ s, hour: e.hour })
  }
  if (pairs.length === 0) return { hour: nowHour, students: [] }
  // 현재 시간 슬롯, 없으면 nowHour 이상 중 가장 가까운 시간, 그것도 없으면 마지막
  const hours = [...new Set(pairs.map(p => p.hour))].sort((a, b) => a - b)
  const target = hours.find(h => h === nowHour) ?? hours.find(h => h >= nowHour) ?? hours[hours.length - 1]
  const inSlot = pairs.filter(p => p.hour === target).map(p => p.s)
  const seen = new Set<string>()
  const students_ = inSlot.filter(s => !seen.has(s.id) && seen.add(s.id))
    .slice(0, maxPerSlot)
    .map(s => ({ id: s.id, name: s.name, grade: s.grade, done: doneIds.has(s.id) }))
  return { hour: target, students: students_ }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test:run -- kiosk`
Expected: PASS (3 tests).

---

## Task 4: 아이 입력 서버 액션 (childReportActivity)

**Files:**
- Modify: `lib/v2/actions.ts` (끝에 추가)
- Modify: `lib/v2/data.ts` (getKioskRosterRaw 추가)

**Interfaces:**
- Consumes: `ctx()`, `assertOwns()`, `ensureSession()`(기존, actions.ts 내부).
- Produces:
  - `async function childReportActivity(studentId: string, reportedStepId: string | null, laps: number | null): Promise<void>` — 당일 session을 `input_source='child', status='pending', reported_step_id` 로 보장(생성/갱신), laps 있으면 measurements(laps) 기록. **통과·측정 안 함.**
  - `async function getKioskRosterRaw(instructorId: string): Promise<{ students: TodayStudent[]; doneIds: Set<string> }>` (data.ts).

- [ ] **Step 1: ensureSession 확장(아이용 분기)**

`lib/v2/actions.ts`의 `ensureSession` 아래에 아이 전용 세션 보장 추가:
```typescript
// 아이 입력용 세션 보장: 없으면 pending·child로 생성, 있으면 reported_step만 갱신(확정 전까지).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureChildSession(supabase: any, userId: string, studentId: string, reportedStepId: string | null): Promise<string> {
  const { data: existing } = await supabase.from('sessions')
    .select('id,status').eq('student_id', studentId).eq('session_date', today()).maybeSingle()
  if (existing) {
    // 이미 강사가 확정한 세션은 건드리지 않음
    if (existing.status !== 'confirmed' && reportedStepId) {
      await supabase.from('sessions').update({ reported_step_id: reportedStepId }).eq('id', existing.id)
    }
    return existing.id
  }
  const { data, error } = await supabase.from('sessions').insert({
    student_id: studentId, instructor_id: userId, session_date: today(),
    attendance: '출석', input_source: 'child', status: 'pending', reported_step_id: reportedStepId,
  }).select('id').single()
  if (error) throw error
  return data.id
}
```

- [ ] **Step 2: childReportActivity 액션 작성**

`lib/v2/actions.ts` 끝에:
```typescript
// 아이 패드 입력: 출석(자동) + 오늘 한 단계(보고) + 바퀴수. 통과 판정 없음(강사 확인 단계에서).
export async function childReportActivity(studentId: string, reportedStepId: string | null, laps: number | null) {
  const { supabase, userId } = await ctx(); await assertOwns(supabase, userId, studentId)
  const sessionId = await ensureChildSession(supabase, userId, studentId, reportedStepId)
  if (laps != null && laps > 0) {
    await supabase.from('measurements').delete()
      .eq('student_id', studentId).eq('metric_type', 'laps').is('skill_step_id', null).eq('measured_on', today())
    const { error } = await supabase.from('measurements').insert({
      student_id: studentId, metric_type: 'laps', value: laps, measured_on: today(),
      session_id: sessionId, instructor_id: userId, skill_step_id: null,
    })
    if (error) throw error
  }
  revalidatePath(`/kiosk`)
}
```

- [ ] **Step 3: getKioskRosterRaw 작성**

`lib/v2/data.ts` 끝에:
```typescript
import type { TodayStudent } from './today'  // 이미 import되어 있으면 생략
// 키오스크: 강사 담당 활성 학생 + 오늘 입력 완료(session 존재) 여부
export async function getKioskRosterRaw(instructorId: string): Promise<{ students: TodayStudent[]; doneIds: Set<string> }> {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)
  const { data: rows } = await supabase.from('students')
    .select('id,name,grade,schedule,instructor_id').eq('is_active', true).order('name')
  const students: TodayStudent[] = (rows ?? []).map(s => ({
    id: s.id, name: s.name, grade: s.grade, schedule: s.schedule, instructor_id: s.instructor_id, instructor_name: null,
  }))
  const ids = students.map(s => s.id)
  const doneIds = new Set<string>()
  if (ids.length) {
    const { data: sess } = await supabase.from('sessions').select('student_id').eq('session_date', today).in('student_id', ids)
    for (const s of sess ?? []) doneIds.add(s.student_id)
  }
  return { students, doneIds }
}
```
> 주: 키오스크는 요일별 배정(`student_day_instructors`)이 아니라 `students.instructor_id` 기준으로 충분(패드는 강사별 고정). 요일별 다른 강사가 필요하면 추후 보강(스펙 §10).

- [ ] **Step 4: 컴파일·린트 확인**

Run: `npx tsc --noEmit && npm run lint`
Expected: 에러 없음.

---

## Task 5: 키오스크 화면 (명단 + 아이 입력 + 10초 복귀 + 잠금)

**Files:**
- Create: `app/kiosk/layout.tsx`, `app/kiosk/[instructorId]/page.tsx`, `app/kiosk/[instructorId]/KioskRoster.tsx`, `app/kiosk/[instructorId]/ChildInput.tsx`
- Reference: `node_modules/next/dist/docs/` (동적 라우트·서버액션 규약), `app/v2/student/[id]/StepControl.tsx`(클라이언트 섬 패턴), `app/v2/today/parts.tsx`

**Interfaces:**
- Consumes: `getKioskRosterRaw`(data.ts), `buildKioskRoster`(kiosk.ts), `getStrokeLadders`(data.ts), `childReportActivity`(actions.ts).
- Produces: `/kiosk/[instructorId]` 라우트.

- [ ] **Step 1: Next 16 동적 라우트·서버액션 규약 실독**

`node_modules/next/dist/docs/`에서 `params` Promise 여부, `'use client'` + 서버액션 호출 패턴 확인(AGENTS.md 게이트). 기존 `app/v2/student/[id]/page.tsx`가 같은 규약을 쓰므로 그 패턴을 그대로 따른다.

- [ ] **Step 2: 키오스크 레이아웃(전체화면·잠금)**

`app/kiosk/layout.tsx`:
```tsx
// 키오스크 전체화면 레이아웃 — 헤더/네비 없음, 큰 글씨, 다른 곳으로 못 나감.
export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-sky-50 text-slate-900 select-none touch-manipulation">
      <div className="mx-auto max-w-2xl p-4">{children}</div>
    </div>
  )
}
```

- [ ] **Step 3: 명단 서버 페이지**

`app/kiosk/[instructorId]/page.tsx`:
```tsx
import { getKioskRosterRaw } from '@/lib/v2/data'
import { buildKioskRoster } from '@/lib/v2/kiosk'
import { KioskRoster } from './KioskRoster'

export default async function KioskPage({ params }: { params: Promise<{ instructorId: string }> }) {
  const { instructorId } = await params
  const { students, doneIds } = await getKioskRosterRaw(instructorId)
  const now = new Date()
  const slot = buildKioskRoster(students, instructorId, doneIds, now.getDay(), now.getHours())
  return <KioskRoster instructorId={instructorId} slot={slot} />
}
```

- [ ] **Step 4: 명단 클라이언트 섬 (이름 그리드 + 선택 시 ChildInput + 10초 자동복귀)**

`app/kiosk/[instructorId]/KioskRoster.tsx`:
```tsx
'use client'
import { useState, useEffect, useRef } from 'react'
import type { KioskSlot } from '@/lib/v2/kiosk'
import { ChildInput } from './ChildInput'

export function KioskRoster({ instructorId, slot }: { instructorId: string; slot: KioskSlot }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 무입력/완료 후 10초 → 명단 복귀
  const armReturn = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setSelectedId(null), 10000)
  }
  useEffect(() => { if (selectedId) armReturn(); return () => { if (timer.current) clearTimeout(timer.current) } }, [selectedId])

  if (selectedId) {
    const child = slot.students.find(s => s.id === selectedId)!
    return <ChildInput studentId={selectedId} name={child.name}
      onActivity={armReturn} onDone={() => setSelectedId(null)} onBack={() => setSelectedId(null)} />
  }
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{slot.hour}:00 수업 — 이름을 눌러요</h1>
      <div className="grid grid-cols-2 gap-4">
        {slot.students.map(s => (
          <button key={s.id} onClick={() => setSelectedId(s.id)}
            className={`rounded-2xl p-8 text-3xl font-bold shadow ${s.done ? 'bg-green-100 text-green-700' : 'bg-white'}`}>
            {s.name}{s.done && ' ✓'}
          </button>
        ))}
        {slot.students.length === 0 && <p className="text-xl text-slate-500">지금 시간 수업이 없어요</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 아이 입력 클라이언트 섬 (현재 단계 "했어요" + 바퀴수 + 저장)**

`app/kiosk/[instructorId]/ChildInput.tsx` — `getStrokeLadders`로 현재 단계를 서버에서 받아 props로 내리거나, 간단히 현재 단계만 별도 서버액션으로 조회. MVP는 page에서 현재단계도 함께 조회해 내려주는 방식 권장(왕복 1회). 아래는 입력 섬:
```tsx
'use client'
import { useState, useTransition } from 'react'
import { childReportActivity } from '@/lib/v2/actions'

export function ChildInput({ studentId, name, currentStepId, currentStepLabel, siblings, onActivity, onDone, onBack }: {
  studentId: string; name: string
  currentStepId: string | null; currentStepLabel: string | null
  siblings: { id: string; label: string }[]
  onActivity: () => void; onDone: () => void; onBack: () => void
}) {
  const [stepId, setStepId] = useState(currentStepId)
  const [laps, setLaps] = useState(0)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  const tap = () => { onActivity() }  // 상호작용마다 10초 타이머 리셋

  const save = () => start(async () => {
    await childReportActivity(studentId, stepId, laps || null)
    setSaved(true); setTimeout(onDone, 2500)
  })

  if (saved) return <div className="text-center py-20"><p className="text-4xl">잘했어요! 🎉</p>
    <p className="mt-4 text-xl text-slate-600">오늘: {currentStepLabel ?? '연습'} · {laps}바퀴</p></div>

  return (
    <div onClick={tap}>
      <button onClick={onBack} className="text-lg text-slate-500 mb-2">← 뒤로</button>
      <h1 className="text-3xl font-bold mb-4">{name}, 오늘 뭐 했어요?</h1>
      <div className="rounded-2xl bg-white p-6 shadow text-center">
        <p className="text-2xl font-bold mb-3">{currentStepLabel ?? '오늘 연습'}</p>
        <button onClick={() => { setStepId(currentStepId); tap() }}
          className={`rounded-xl px-8 py-4 text-2xl ${stepId === currentStepId ? 'bg-sky-500 text-white' : 'bg-sky-100'}`}>
          이거 했어요 ✓
        </button>
        {siblings.length > 0 && <div className="mt-3 flex flex-wrap gap-2 justify-center">
          {siblings.map(s => <button key={s.id} onClick={() => { setStepId(s.id); tap() }}
            className={`rounded-lg px-3 py-2 ${stepId === s.id ? 'bg-sky-500 text-white' : 'bg-slate-100'}`}>{s.label}</button>)}
        </div>}
      </div>
      <div className="mt-6 rounded-2xl bg-white p-6 shadow flex items-center justify-center gap-4">
        <span className="text-2xl">바퀴수</span>
        <button onClick={() => { setLaps(l => Math.max(0, l - 1)); tap() }} className="rounded-full bg-slate-200 w-14 h-14 text-3xl">−</button>
        <span className="text-4xl font-bold w-16 text-center">{laps}</span>
        <button onClick={() => { setLaps(l => l + 1); tap() }} className="rounded-full bg-slate-200 w-14 h-14 text-3xl">+</button>
      </div>
      <button onClick={save} disabled={pending}
        className="mt-6 w-full rounded-2xl bg-green-500 text-white py-5 text-2xl font-bold disabled:opacity-50">
        {pending ? '저장 중…' : '다 했어요!'}
      </button>
    </div>
  )
}
```
> `currentStepId/Label/siblings`는 page.tsx에서 `getStrokeLadders(studentId)` 결과의 현재 단계로 채운다. 명단에서 학생 선택 시점에 현재단계를 알아야 하므로, MVP는 page에서 slot 학생 전원의 현재단계를 미리 조회해 KioskRoster→ChildInput으로 내린다(왕복 최소화).

- [ ] **Step 6: 수동 스모크 (배포 또는 dev)**

`.env.local`·마이그레이션 적용 상태에서 `npm run dev` → `/kiosk/<강사uuid>` 접속. 이름 탭 → "이거 했어요" → 바퀴 +3 → "다 했어요!" → "잘했어요!" → 10초 내 명단 복귀, 이름에 ✓. Supabase `sessions`에 `input_source='child', status='pending'` 행 + `measurements` laps 행 확인.

---

## Task 6: 강사 확인 (확정 + 보고단계 통과 인정 + 미입력 추가)

**Files:**
- Modify: `lib/v2/actions.ts` (confirmSession, acceptReportedStep)
- Modify: `lib/v2/data.ts` (getTodayStudentsRaw 확장), `lib/v2/today.ts` (TodayCard 필드)
- Modify: `app/v2/today/page.tsx`, `app/v2/today/parts.tsx`

**Interfaces:**
- Produces:
  - `confirmSession(studentId: string): void` — 당일 session `status='confirmed', confirmed_by=userId, confirmed_at=now`.
  - `acceptReportedStep(studentId: string, step: {id;key;ladder_order;stroke_key}): void` — 아이 보고단계를 ladder cascade로 통과 인정(기존 `passLadderCascade` 재사용) 후 `confirmSession`.
  - `TodayCard`에 `status: 'pending'|'confirmed'|null`, `inputSource: 'child'|'instructor'|null`, `reportedStepId: string|null`, `reportedStepLabel: string|null` 추가.

- [ ] **Step 1: today.ts 카드 타입 확장**

`lib/v2/today.ts`:
- `TodaySession`에 `status: 'pending'|'confirmed'|null; inputSource: 'child'|'instructor'|null; reportedStepId: string|null` 추가.
- `TodayCard`에 동일 + `reportedStepLabel: string|null` 추가.
- `buildTodayCards`에서 카드 생성 시 해당 필드 매핑(`reportedStepLabel`은 인자로 받은 stepLabelById 맵에서 조회 — 시그니처에 `stepLabelById?: Map<string,string>` 추가, 없으면 null).

- [ ] **Step 2: 확인 액션 작성**

`lib/v2/actions.ts` 끝에:
```typescript
export async function confirmSession(studentId: string) {
  const { supabase, userId } = await ctx(); await assertOwns(supabase, userId, studentId)
  const { error } = await supabase.from('sessions')
    .update({ status: 'confirmed', confirmed_by: userId, confirmed_at: new Date().toISOString() })
    .eq('student_id', studentId).eq('session_date', today())
  if (error) throw error
  revalidatePath('/v2/today')
}

// 아이가 보고한 단계를 통과로 인정(계단식) + 확정. 강사 한 탭.
export async function acceptReportedStep(studentId: string, step: { id: string; key: string; ladder_order: number; stroke_key: string }) {
  await passLadderCascade(studentId, step)  // skill_progress(observed) 적재
  await confirmSession(studentId)
}
```

- [ ] **Step 3: data.ts getTodayStudentsRaw 확장**

`getTodayStudentsRaw`의 sessions 조회에 `status,input_source,reported_step_id` select 추가, `TodaySession`에 채움. 보고단계 라벨은 reported_step_id 목록으로 `skill_steps`에서 label 일괄 조회해 맵 구성, page에서 buildTodayCards에 전달.

- [ ] **Step 4: 오늘 화면 UI — 미확인 배지 + 확인 버튼**

`app/v2/today/parts.tsx`의 내 반 카드에:
- `status==='pending'`이면 주황 "미확인" 배지 + 아이 보고 내용(출석·`reportedStepLabel`·바퀴수) 표시.
- 버튼: **[이 단계 통과 인정]**(reportedStepId 있을 때, `acceptReportedStep` 호출) / **[확인만]**(`confirmSession`) / **[진도 직접]**(기존 student 화면 링크).
- `status==='confirmed'`이면 초록 "확정" 배지.
- 미입력(session 없음) 학생도 카드에 표시되어 강사가 직접 출결·진도 추가 가능(기존 흐름 유지).
- 모든 버튼은 `useTransition` 낙관적 처리.

- [ ] **Step 5: 컴파일·린트·기존 테스트**

Run: `npx tsc --noEmit && npm run lint && npm run test:run -- today`
Expected: 에러 없음, today 테스트 PASS(시그니처 변경 시 테스트도 갱신).

- [ ] **Step 6: 수동 스모크**

아이가 입력한 학생이 강사 `/v2/today`에 "미확인"으로 뜨고, [통과 인정] → skill_progress 생성 + "확정" 전환 확인.

---

## Task 7: 원장 대시보드

**Files:**
- Create: `lib/v2/dashboard.ts`, `__tests__/v2/dashboard.test.ts`, `app/v2/director/dashboard/page.tsx`
- Modify: `lib/v2/data.ts` (getDashboardRaw)
- Reference: v1 `진도 관리/starkids-swim/app/director/dashboard` 패턴

**Interfaces:**
- Produces:
  - `interface DashboardInput { students: {id;name;currentStrokeKey:string|null}[]; pendingCount: number; recentPasses: {studentName;stepLabel;passedAt}[] }`
  - `interface DashboardView { strokeBoard: { strokeKey: string; strokeLabel: string; count: number }[]; pendingCount: number; recentPasses: ... ; stalled: {studentName; days: number}[] }`
  - `function buildDashboard(input, strokeMeta): DashboardView`

- [ ] **Step 1: 실패 테스트 작성**

`__tests__/v2/dashboard.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { buildDashboard } from '@/lib/v2/dashboard'

describe('buildDashboard', () => {
  it('현재 영법별 학생 수 집계', () => {
    const view = buildDashboard(
      { students: [
        { id:'1', name:'가', currentStrokeKey:'free' },
        { id:'2', name:'나', currentStrokeKey:'free' },
        { id:'3', name:'다', currentStrokeKey:'back' },
        { id:'4', name:'라', currentStrokeKey:null },
      ], pendingCount: 2, recentPasses: [] },
      [{ key:'free', label:'자유형' }, { key:'back', label:'배영' }],
    )
    expect(view.strokeBoard.find(s => s.strokeKey==='free')!.count).toBe(2)
    expect(view.strokeBoard.find(s => s.strokeKey==='back')!.count).toBe(1)
    expect(view.pendingCount).toBe(2)
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `npm run test:run -- dashboard` → FAIL.

- [ ] **Step 3: 구현**

`lib/v2/dashboard.ts`:
```typescript
// lib/v2/dashboard.ts — 원장 대시보드 집계(순수). 확정 데이터 기준.
export interface DashboardInput {
  students: { id: string; name: string; currentStrokeKey: string | null }[]
  pendingCount: number
  recentPasses: { studentName: string; stepLabel: string; passedAt: string }[]
  stalled?: { studentName: string; days: number }[]
}
export interface DashboardView {
  strokeBoard: { strokeKey: string; strokeLabel: string; count: number }[]
  pendingCount: number
  recentPasses: { studentName: string; stepLabel: string; passedAt: string }[]
  stalled: { studentName: string; days: number }[]
}
export function buildDashboard(input: DashboardInput, strokeMeta: { key: string; label: string }[]): DashboardView {
  const counts = new Map<string, number>()
  for (const s of input.students) if (s.currentStrokeKey) counts.set(s.currentStrokeKey, (counts.get(s.currentStrokeKey) ?? 0) + 1)
  const strokeBoard = strokeMeta.map(m => ({ strokeKey: m.key, strokeLabel: m.label, count: counts.get(m.key) ?? 0 }))
  return { strokeBoard, pendingCount: input.pendingCount, recentPasses: input.recentPasses, stalled: input.stalled ?? [] }
}
```

- [ ] **Step 4: 통과 확인** — Run: `npm run test:run -- dashboard` → PASS.

- [ ] **Step 5: getDashboardRaw + 페이지**

`lib/v2/data.ts`에 `getDashboardRaw()`: 활성 학생, 각 학생 현재 영법(최신 통과 step의 stroke_key, 기존 `getStudentLadderPosition`/passed 집계 재사용), `sessions where status='pending'` 수, 최근 `skill_progress` 조인. `app/v2/director/dashboard/page.tsx`는 서버 컴포넌트로 `buildDashboard` 렌더(v1 director 보드 스타일 재사용). 원장 권한 가드(profiles.role==='director', 아니면 redirect).

- [ ] **Step 6: 수동 스모크** — 원장 계정으로 `/v2/director/dashboard` 접속, 영법별 수·미확인 수 표시 확인.

---

## Task 8: 성능 — 커리큘럼 캐싱 + 스트리밍

**Files:**
- Modify: `lib/v2/data.ts` (커리큘럼 조회 캐시)
- Modify: `app/kiosk/[instructorId]/page.tsx`, `app/v2/today/page.tsx`, `app/v2/student/[id]/page.tsx` (Suspense)

**Interfaces:**
- Produces: 캐시된 `getActiveCurriculumSteps`·`getStrokeLadders` 커리큘럼 부분. 학생별 진도는 캐시 안 함.

- [ ] **Step 1: 커리큘럼 조회 캐싱**

커리큘럼 단계(버전+steps)는 거의 불변 → React `cache` + `unstable_cache`로 요청 간 재사용. `lib/v2/data.ts`에서 단계 목록 조회를 분리해 캐시:
```typescript
import { unstable_cache } from 'next/cache'
// 활성 커리큘럼 단계(버전 불변 → 태그 기반 캐시). 커리큘럼 편집 시 revalidateTag('curriculum').
export const getCachedActiveSteps = unstable_cache(
  async () => { /* getActiveCurriculumSteps 본문 */ },
  ['active-curriculum-steps'],
  { tags: ['curriculum'], revalidate: 3600 },
)
```
`getActiveCurriculumSteps`·`getStrokeLadders`의 단계 조회 부분을 이 캐시 함수로 교체(학생별 progress 조회는 그대로 비캐시). Next 16 `unstable_cache` 시그니처는 `node_modules/next/dist/docs/`에서 확인.

- [ ] **Step 2: 스트리밍 경계**

키오스크/오늘/학생 페이지에서 데이터 의존 영역을 `<Suspense fallback={<...스켈레톤>}>`로 감싸 첫 페인트를 즉시 내보낸다(헤더·틀 먼저). 데이터 fetch를 자식 서버 컴포넌트로 분리.

- [ ] **Step 3: 검증 — 빌드 + 응답 체감**

Run: `npm run build`
Expected: 빌드 성공. 배포 후(또는 `npm run start`) 키오스크/오늘 페이지 첫 로드가 캐시·스트리밍으로 빨라졌는지 체감 측정.

---

## Task 9: 성능 — Supabase 리전 + PWA (운영/설정)

**Files:**
- Create: `public/manifest.webmanifest`
- Modify: `app/layout.tsx` (manifest 링크, viewport)

**Interfaces:** 코드 외 운영 작업 포함.

- [ ] **Step 1: Supabase 리전 확인 (수동)**

Supabase 대시보드 → Project Settings → General에서 Region 확인. **서울(ap-northeast-2)이 아니면** 가장 큰 느림 원인. 무료티어는 리전 변경이 안 되므로, 서울 리전으로 **새 프로젝트 생성 → 마이그레이션 010~016 + 시드 재적용 → `.env.local` URL/키 교체**. (현재 1주 테스트 데이터뿐이라 마이그레이션 부담 적음.)
Expected: `.env.local`의 `NEXT_PUBLIC_SUPABASE_URL`이 서울 리전 프로젝트를 가리킴.

- [ ] **Step 2: PWA 매니페스트**

`public/manifest.webmanifest`:
```json
{
  "name": "스타키즈 수영 진도",
  "short_name": "스타키즈",
  "start_url": "/v2/today",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#f0f9ff",
  "theme_color": "#0ea5e9",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```
(아이콘 192/512 png를 `public/`에 추가. 임시로 favicon 기반 생성 가능.)

- [ ] **Step 3: layout에 manifest 연결**

`app/layout.tsx`의 `metadata`에 `manifest: '/manifest.webmanifest'`, `appleWebApp: { capable: true, statusBarStyle: 'default' }` 추가. 키오스크 패드는 브라우저에서 "홈 화면에 추가" → 전체화면 standalone으로 실행.

- [ ] **Step 4: 검증**

Run: `npm run build`
Expected: 성공. 배포 후 폰에서 "홈 화면에 추가" 시 앱처럼 standalone 실행, 키오스크 라우트 전체화면 확인.

---

## Self-Review (작성자 점검 결과)

- **스펙 커버리지**: ①엑셀 시드=Task2, ②아이 키오스크=Task3·4·5, ③강사 확인=Task6, ④원장 대시보드=Task7, ⑤베이스라인=기존 구현(변경 없음, 그대로 사용), ⑥성능=Task8·9, 확인 워크플로우 스키마=Task1. 모든 §7 범위 항목에 대응 태스크 존재.
- **Placeholder**: 핵심 로직(kiosk/dashboard/actions/migration)은 완전한 코드. UI 컴포넌트는 실동작 코드 포함, 시각 디테일만 구현 시 조정.
- **타입 일관성**: `TodayStudent`(today.ts), `KioskSlot/KioskStudent`(kiosk.ts), `Session` 확장 필드, 액션 시그니처가 태스크 간 일치. `passLadderCascade`(기존)·`acceptReportedStep`(신규) 연결 확인.
- **알려진 의존**: Task5의 `ChildInput`은 현재단계 props를 page에서 `getStrokeLadders`로 채움(왕복 1회). Task6은 Task1 스키마 필요. Task8 캐싱은 Task2 시드 후 의미.

## 미해결(구현 중 확정)

- 키오스크 요일별 다른 강사 지원(현재 `students.instructor_id` 기준; 요일별이면 `student_day_instructors` 사용으로 보강).
- `repeatable` 6회마다 측정 프롬프트 UX(강사 확인 화면).
- PWA 아이콘 에셋 제작.
