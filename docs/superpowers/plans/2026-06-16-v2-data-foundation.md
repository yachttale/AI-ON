# v2 데이터 토대 (Data Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** v2 수영 교육 데이터 플랫폼의 데이터 토대(스키마·RLS·커리큘럼 DB+버전·타입·순수 도메인 로직·데이터 접근 레이어)를 구축한다. 이후 모든 UI/리포트/예측 계획이 이 위에 얹힌다.

**Architecture:** Postgres(Supabase) 신규 `public` 스키마. 커리큘럼을 코드 하드코딩에서 DB 테이블로 이전(버전 관리). 객관 지표는 `measurements` 단일 테이블로 통합. 모든 기록은 append-only 이벤트 + 불변 ID 참조 + 통과 시점 스냅샷으로 커리큘럼 편집에도 안전. 기존 repo(AI-ON)의 Supabase 접근 패턴(`@supabase/ssr`)과 vitest 순수함수 테스트 패턴을 그대로 따른다.

**Tech Stack:** Next.js 16.2.9, React 19, TypeScript 5, `@supabase/ssr` 0.12, `@supabase/supabase-js` 2.108, vitest 4 (jsdom).

**Testing approach (의도적):** 이 repo엔 DB 통합 테스트 하네스가 없고 마이그레이션은 Supabase SQL Editor에서 수동 적용한다. 따라서:
- **순수 도메인 로직**(매핑·환산·파생) → vitest TDD (red→green→commit). 기존 `__tests__/lib/schedule.test.ts` 패턴.
- **SQL(스키마·RLS·시드)** → 작성 → SQL Editor 적용 → 검증 쿼리로 확인.
- **데이터 접근 함수** → 타입체크/빌드 + 실사용 검증 (통합 테스트 하네스는 YAGNI, 만들지 않음).

**DB 타깃 (결정됨):** 기존 진도관리 Supabase 프로젝트를 v2로 **재활용**. 그 프로젝트엔 테스트 1주일치(폐기 가능) 데이터뿐이고 그전 history는 없음(기억+영상만) → 마이그레이션 불필요. 기존 v1 테이블(`001_schema.sql`/`002_rpc.sql` 산출물)을 **drop** 후 v2를 `public`에 새로 생성(무료 유지, 충돌·스키마분리 friction 없음). drop은 SQL Editor 적용 시점에 수행.

**기존생 온보딩:** 출시 시 재원생 100%가 중도합류(과거 데이터 없음). 마이그레이션 대신 **베이스라인 배치** — 강사가 현재 사다리 위치를 1회 입력하고 `skill_progress.source='baseline'`로 표시. `source='baseline'`이 제외하는 건 **"첫 학습 시점" 속도 계산 단 하나뿐**(날짜 미신뢰). 그 외 향후 데이터(일일 바퀴수, 완성 영법 **재측정**, 현재 영법 첫 완주, 상위 마일스톤)는 기존생에게도 1급 `observed` 데이터 — 베이스라인일 측정값(오늘 날짜)은 개선 곡선의 출발점. 베이스라인 입력 UI는 Plan 2; 본 계획은 스키마(`source` 컬럼)만 준비.

---

## File Structure

- `supabase/migrations/010_v2_schema.sql` — 신규: 전체 v2 테이블 + 인덱스 + auth 트리거
- `supabase/migrations/011_v2_rls.sql` — 신규: RLS 정책 + grants
- `supabase/migrations/012_v2_curriculum_seed.sql` — 생성물: 커리큘럼 버전1 시드(스크립트가 출력)
- `types/v2.ts` — 신규: v2 테이블 TS 타입
- `lib/v2/curriculum-seed.ts` — 신규: 기존 `CURRICULUM` → 시드 행 매핑(순수)
- `lib/v2/curriculum-seed.sql-emit.ts` — 신규: 매핑 결과 → INSERT SQL 출력 스크립트
- `lib/v2/metrics.ts` — 신규: 바퀴→거리·일일거리·완주판정 등 순수 도메인 로직
- `lib/v2/data.ts` — 신규: 타입 안전 데이터 접근 함수(서버)
- `__tests__/v2/curriculum-seed.test.ts`, `__tests__/v2/metrics.test.ts` — 신규: 순수 로직 테스트

---

## Task 1: v2 스키마 마이그레이션

**Files:**
- Create: `supabase/migrations/010_v2_schema.sql`

- [ ] **Step 1: 스키마 SQL 작성**

```sql
-- 010_v2_schema.sql — 수영 교육 데이터 플랫폼 v2 토대
-- 적용: Supabase SQL Editor. 신규 프로젝트의 public 가정.

-- profiles (auth 연동 — v1 패턴 재사용)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text not null,
  role text not null check (role in ('instructor','director')),
  created_at timestamptz default now() not null
);

-- 커리큘럼 버전
create table public.curriculum_versions (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  created_at timestamptz default now() not null,
  activated_at timestamptz,
  archived_at timestamptz
);
-- 활성 버전은 동시에 하나만
create unique index one_active_curriculum on public.curriculum_versions (status) where status = 'active';

-- 영법
create table public.strokes (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  display_order int not null default 0,
  color text
);

-- 트랙(영역: 킥/팔/호흡/콤비)
create table public.skill_tracks (
  id uuid primary key default gen_random_uuid(),
  stroke_id uuid not null references public.strokes(id) on delete cascade,
  key text not null,
  label text not null,
  display_order int not null default 0,
  unique (stroke_id, key)
);

-- 단계(사다리)
create table public.skill_steps (
  id uuid primary key default gen_random_uuid(),
  curriculum_version_id uuid not null references public.curriculum_versions(id) on delete cascade,
  stroke_id uuid not null references public.strokes(id),
  track_id uuid references public.skill_tracks(id),
  key text not null,
  label text not null,
  ladder_order int not null,
  is_first_completion boolean not null default false,
  measure_spec text[] not null default '{}',  -- {'time_sec','stroke_count','distance_m'}
  is_active boolean not null default true,
  created_at timestamptz default now() not null,
  unique (curriculum_version_id, key)
);
create index idx_skill_steps_version on public.skill_steps(curriculum_version_id, stroke_id, ladder_order);

-- 학생 (예측 변수 포함)
create table public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  birthdate date,
  sex text check (sex in ('남','여')),
  enrolled_on date,
  grade text,
  schedule text,
  instructor_id uuid references public.profiles(id),
  is_active boolean not null default true,
  withdrawal_status text check (withdrawal_status in ('pending','approved')),
  withdrawal_requested_by uuid references public.profiles(id),
  withdrawal_note text,
  created_at timestamptz default now() not null
);
create index idx_students_instructor on public.students(instructor_id);

-- 수업 템플릿
create table public.lesson_templates (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  is_studio_standard boolean not null default false,
  created_at timestamptz default now() not null
);
create table public.lesson_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.lesson_templates(id) on delete cascade,
  seq int not null,
  stroke_id uuid references public.strokes(id),
  label text not null,
  default_laps int not null default 0
);
create index idx_template_items on public.lesson_template_items(template_id, seq);

-- 수업(출결)
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  session_date date not null,
  student_id uuid not null references public.students(id) on delete cascade,
  instructor_id uuid not null references public.profiles(id),
  attendance text not null check (attendance in ('출석','지각','결석')),
  absence_reason text check (absence_reason in ('입원','아파서','다른일정','여행','기타')),
  template_id uuid references public.lesson_templates(id),
  focus_stroke_id uuid references public.strokes(id),
  memo text,
  created_at timestamptz default now() not null,
  unique (student_id, session_date)
);
create index idx_sessions_student_date on public.sessions(student_id, session_date desc);
create index idx_sessions_instructor_date on public.sessions(instructor_id, session_date desc);

-- 객관 지표 (통합)
create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  metric_type text not null check (metric_type in ('laps','distance_m','time_sec','stroke_count')),
  value numeric not null,
  unit text,
  measured_on date not null default current_date,
  session_id uuid references public.sessions(id) on delete set null,
  skill_step_id uuid references public.skill_steps(id),
  instructor_id uuid references public.profiles(id),
  note text,
  created_at timestamptz default now() not null
);
create index idx_measurements_student on public.measurements(student_id, measured_on desc);
create index idx_measurements_student_metric on public.measurements(student_id, metric_type, measured_on);

-- 단계 진행(통과 이벤트)
create table public.skill_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  skill_step_id uuid not null references public.skill_steps(id),
  status text not null default 'passed' check (status in ('passed')),
  source text not null default 'observed' check (source in ('observed','baseline')),  -- baseline=기존생 현재위치(날짜 미신뢰)
  difficulty text check (difficulty in ('어려워함','조금어려워함','중간','조금쉽게','쉽게해결')),
  passed_at date not null default current_date,
  source_session_id uuid references public.sessions(id) on delete set null,
  instructor_id uuid references public.profiles(id),
  step_key_snapshot text not null,
  ladder_order_snapshot int not null,
  note text,
  created_at timestamptz default now() not null,
  unique (student_id, skill_step_id)
);
create index idx_skill_progress_student on public.skill_progress(student_id, passed_at);

-- 영상 + 피드백
create table public.media (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  captured_on date not null default current_date,
  storage_path text not null,
  type text not null default 'video' check (type in ('video','image')),
  skill_step_id uuid references public.skill_steps(id),
  feedback_draft text,
  feedback_final text,
  sent_to_parent_at timestamptz,
  created_at timestamptz default now() not null
);
create index idx_media_student on public.media(student_id, captured_on desc);

-- auth trigger (v1 패턴 재사용)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'name','이름없음'), 'instructor');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

- [ ] **Step 2: Supabase SQL Editor에 적용**

v2 타깃 프로젝트의 SQL Editor에 전체 붙여넣고 실행. 에러 없이 완료되는지 확인.

- [ ] **Step 3: 테이블 생성 검증**

SQL Editor에서 실행:
```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;
```
Expected: `curriculum_versions, lesson_template_items, lesson_templates, measurements, media, profiles, sessions, skill_progress, skill_steps, skill_tracks, strokes, students` 12개 포함.

- [ ] **Step 4: 활성 버전 유니크 제약 검증**

```sql
insert into curriculum_versions (label, status) values ('t1','active'),('t2','active');
```
Expected: 두 번째 행에서 unique violation. 이후 `delete from curriculum_versions where label in ('t1','t2');`로 정리.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/010_v2_schema.sql
git commit -m "feat(v2): add data foundation schema (curriculum, sessions, measurements, progress, media, templates)"
```

---

## Task 2: RLS 정책 + 권한

**Files:**
- Create: `supabase/migrations/011_v2_rls.sql`

- [ ] **Step 1: RLS SQL 작성**

```sql
-- 011_v2_rls.sql — RLS + grants

-- helper: 현재 사용자가 원장인가
create or replace function public.is_director()
returns boolean language sql security definer stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'director');
$$;

-- RLS 활성화
alter table public.profiles enable row level security;
alter table public.curriculum_versions enable row level security;
alter table public.strokes enable row level security;
alter table public.skill_tracks enable row level security;
alter table public.skill_steps enable row level security;
alter table public.students enable row level security;
alter table public.lesson_templates enable row level security;
alter table public.lesson_template_items enable row level security;
alter table public.sessions enable row level security;
alter table public.measurements enable row level security;
alter table public.skill_progress enable row level security;
alter table public.media enable row level security;

-- profiles
create policy "프로필 조회" on public.profiles for select to authenticated using (true);
create policy "프로필 수정" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "프로필 생성" on public.profiles for insert to authenticated with check (auth.uid() = id);

-- 커리큘럼(읽기: 전원 / 쓰기: 원장)
create policy "커리큘럼버전 조회" on public.curriculum_versions for select to authenticated using (true);
create policy "커리큘럼버전 관리" on public.curriculum_versions for all to authenticated using (public.is_director()) with check (public.is_director());
create policy "영법 조회" on public.strokes for select to authenticated using (true);
create policy "영법 관리" on public.strokes for all to authenticated using (public.is_director()) with check (public.is_director());
create policy "트랙 조회" on public.skill_tracks for select to authenticated using (true);
create policy "트랙 관리" on public.skill_tracks for all to authenticated using (public.is_director()) with check (public.is_director());
create policy "단계 조회" on public.skill_steps for select to authenticated using (true);
create policy "단계 관리" on public.skill_steps for all to authenticated using (public.is_director()) with check (public.is_director());

-- 학생 (조회: 전원 / 추가·수정: 원장 또는 담당강사)
create policy "학생 조회" on public.students for select to authenticated using (true);
create policy "학생 추가" on public.students for insert to authenticated with check (public.is_director());
create policy "학생 수정" on public.students for update to authenticated using (public.is_director() or instructor_id = auth.uid());

-- 수업 템플릿 (강사 본인 소유, 원장 전체)
create policy "템플릿 조회" on public.lesson_templates for select to authenticated using (public.is_director() or instructor_id = auth.uid());
create policy "템플릿 관리" on public.lesson_templates for all to authenticated using (public.is_director() or instructor_id = auth.uid()) with check (public.is_director() or instructor_id = auth.uid());
create policy "템플릿항목 조회" on public.lesson_template_items for select to authenticated using (
  exists (select 1 from public.lesson_templates t where t.id = template_id and (public.is_director() or t.instructor_id = auth.uid())));
create policy "템플릿항목 관리" on public.lesson_template_items for all to authenticated using (
  exists (select 1 from public.lesson_templates t where t.id = template_id and (public.is_director() or t.instructor_id = auth.uid())))
  with check (exists (select 1 from public.lesson_templates t where t.id = template_id and (public.is_director() or t.instructor_id = auth.uid())));

-- 학생 데이터(수업·측정·진행·영상): 담당 강사 또는 원장
-- sessions
create policy "수업 조회" on public.sessions for select to authenticated using (
  public.is_director() or instructor_id = auth.uid()
  or exists (select 1 from public.students s where s.id = student_id and s.instructor_id = auth.uid()));
create policy "수업 입력" on public.sessions for insert to authenticated with check (
  public.is_director() or instructor_id = auth.uid());
create policy "수업 수정" on public.sessions for update to authenticated using (
  public.is_director() or instructor_id = auth.uid());

-- measurements / skill_progress / media 공통: 담당강사·원장
create policy "측정 조회" on public.measurements for select to authenticated using (
  public.is_director() or exists (select 1 from public.students s where s.id = student_id and s.instructor_id = auth.uid()));
create policy "측정 입력" on public.measurements for insert to authenticated with check (
  public.is_director() or exists (select 1 from public.students s where s.id = student_id and s.instructor_id = auth.uid()));
create policy "측정 삭제" on public.measurements for delete to authenticated using (
  public.is_director() or exists (select 1 from public.students s where s.id = student_id and s.instructor_id = auth.uid()));

create policy "진행 조회" on public.skill_progress for select to authenticated using (
  public.is_director() or exists (select 1 from public.students s where s.id = student_id and s.instructor_id = auth.uid()));
create policy "진행 입력" on public.skill_progress for insert to authenticated with check (
  public.is_director() or exists (select 1 from public.students s where s.id = student_id and s.instructor_id = auth.uid()));
create policy "진행 삭제" on public.skill_progress for delete to authenticated using (
  public.is_director() or exists (select 1 from public.students s where s.id = student_id and s.instructor_id = auth.uid()));

create policy "영상 조회" on public.media for select to authenticated using (
  public.is_director() or exists (select 1 from public.students s where s.id = student_id and s.instructor_id = auth.uid()));
create policy "영상 입력" on public.media for insert to authenticated with check (
  public.is_director() or exists (select 1 from public.students s where s.id = student_id and s.instructor_id = auth.uid()));
create policy "영상 수정" on public.media for update to authenticated using (
  public.is_director() or exists (select 1 from public.students s where s.id = student_id and s.instructor_id = auth.uid()));

-- grants
grant select, insert, update, delete on all tables in schema public to authenticated;
```

- [ ] **Step 2: 적용 + 검증**

SQL Editor 실행 후:
```sql
select tablename, rowsecurity from pg_tables where schemaname='public' and rowsecurity=true;
```
Expected: 위 12개 테이블 모두 `rowsecurity=true`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/011_v2_rls.sql
git commit -m "feat(v2): add RLS policies and grants for data foundation"
```

---

## Task 3: v2 TypeScript 타입

**Files:**
- Create: `types/v2.ts`

- [ ] **Step 1: 타입 작성**

```typescript
// types/v2.ts — v2 데이터 토대 타입
export type Role = 'instructor' | 'director'
export type Attendance = '출석' | '지각' | '결석'
export type AbsenceReason = '입원' | '아파서' | '다른일정' | '여행' | '기타'
export type Difficulty = '어려워함' | '조금어려워함' | '중간' | '조금쉽게' | '쉽게해결'
export type MetricType = 'laps' | 'distance_m' | 'time_sec' | 'stroke_count'
export type CurriculumStatus = 'draft' | 'active' | 'archived'

export interface CurriculumVersion {
  id: string; label: string; status: CurriculumStatus
  created_at: string; activated_at: string | null; archived_at: string | null
}
export interface Stroke {
  id: string; key: string; label: string; display_order: number; color: string | null
}
export interface SkillTrack {
  id: string; stroke_id: string; key: string; label: string; display_order: number
}
export interface SkillStep {
  id: string; curriculum_version_id: string; stroke_id: string; track_id: string | null
  key: string; label: string; ladder_order: number
  is_first_completion: boolean; measure_spec: MetricType[]; is_active: boolean; created_at: string
}
export interface Student {
  id: string; name: string; birthdate: string | null; sex: '남' | '여' | null
  enrolled_on: string | null; grade: string | null; schedule: string | null
  instructor_id: string | null; is_active: boolean
  withdrawal_status: 'pending' | 'approved' | null
  withdrawal_requested_by: string | null; withdrawal_note: string | null; created_at: string
}
export interface LessonTemplate {
  id: string; instructor_id: string; name: string
  is_active: boolean; is_studio_standard: boolean; created_at: string
}
export interface LessonTemplateItem {
  id: string; template_id: string; seq: number
  stroke_id: string | null; label: string; default_laps: number
}
export interface Session {
  id: string; session_date: string; student_id: string; instructor_id: string
  attendance: Attendance; absence_reason: AbsenceReason | null
  template_id: string | null; focus_stroke_id: string | null; memo: string | null; created_at: string
}
export interface Measurement {
  id: string; student_id: string; metric_type: MetricType; value: number; unit: string | null
  measured_on: string; session_id: string | null; skill_step_id: string | null
  instructor_id: string | null; note: string | null; created_at: string
}
export interface SkillProgress {
  id: string; student_id: string; skill_step_id: string; status: 'passed'
  difficulty: Difficulty | null; passed_at: string; source_session_id: string | null
  instructor_id: string | null; step_key_snapshot: string; ladder_order_snapshot: number
  note: string | null; created_at: string
}
export interface Media {
  id: string; student_id: string; captured_on: string; storage_path: string
  type: 'video' | 'image'; skill_step_id: string | null
  feedback_draft: string | null; feedback_final: string | null
  sent_to_parent_at: string | null; created_at: string
}
```

- [ ] **Step 2: 타입체크 통과 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (신규 타입 파일은 독립적).

- [ ] **Step 3: Commit**

```bash
git add types/v2.ts
git commit -m "feat(v2): add TypeScript types for data foundation tables"
```

---

## Task 4: 커리큘럼 시드 (기존 69단계 → 버전1)

**Files:**
- Create: `lib/v2/curriculum-seed.ts`
- Test: `__tests__/v2/curriculum-seed.test.ts`
- Create: `lib/v2/curriculum-seed.sql-emit.ts`
- Create (생성물): `supabase/migrations/012_v2_curriculum_seed.sql`

기존 `lib/curriculum.ts`의 `CURRICULUM`(section→group→step, 전역 order 1~69)을 v2 행으로 변환한다. 매핑: section→stroke, group→track, step→skill_step(ladder_order=step.order). `완주`/`25m완주`/`100m` 등 거리 완주 단계는 측정 대상.

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// __tests__/v2/curriculum-seed.test.ts
import { describe, it, expect } from 'vitest'
import { buildSeedRows } from '@/lib/v2/curriculum-seed'

describe('buildSeedRows', () => {
  const seed = buildSeedRows('ver-1')

  it('영법(stroke)을 CURRICULUM 섹션 수만큼 만든다', () => {
    expect(seed.strokes).toHaveLength(6) // 초보,자유형,배영,평영,접영,마스터
    expect(seed.strokes.map(s => s.key)).toContain('freestyle')
  })

  it('단계(step) 총 69개, ladder_order는 원본 order 사용', () => {
    expect(seed.steps).toHaveLength(69)
    const f25 = seed.steps.find(s => s.key === 'freestyle.없이.25m완주')
    expect(f25?.ladder_order).toBe(24)
  })

  it('"25m 완주"류는 첫 완주 + 측정 대상으로 표시', () => {
    const f25 = seed.steps.find(s => s.key === 'freestyle.없이.25m완주')!
    expect(f25.is_first_completion).toBe(true)
    expect(f25.measure_spec).toEqual(['time_sec', 'stroke_count'])
  })

  it('초보 물적응 단계는 측정 없음', () => {
    const dive = seed.steps.find(s => s.key === 'beginner.잠수_코')!
    expect(dive.is_first_completion).toBe(false)
    expect(dive.measure_spec).toEqual([])
  })

  it('모든 step은 stroke_key로 연결된다', () => {
    expect(seed.steps.every(s => seed.strokes.some(st => st.key === s.stroke_key))).toBe(true)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run __tests__/v2/curriculum-seed.test.ts`
Expected: FAIL — `buildSeedRows` not found.

- [ ] **Step 3: 매핑 구현**

```typescript
// lib/v2/curriculum-seed.ts
import { CURRICULUM } from '@/lib/curriculum'
import type { MetricType } from '@/types/v2'

export interface SeedStroke { key: string; label: string; display_order: number; color: string | null }
export interface SeedTrack { stroke_key: string; key: string; label: string; display_order: number }
export interface SeedStep {
  version_label: string; stroke_key: string; track_key: string | null
  key: string; label: string; ladder_order: number
  is_first_completion: boolean; measure_spec: MetricType[]
}
export interface SeedRows { strokes: SeedStroke[]; tracks: SeedTrack[]; steps: SeedStep[] }

// 거리 완주 단계 판정 (시간·스트로크 측정 대상)
function isCompletion(stepKey: string, label: string): boolean {
  return /완주|^.*\.\d+m$|100m|50m/.test(stepKey) || /완주/.test(label)
}

export function buildSeedRows(versionLabel: string): SeedRows {
  const strokes: SeedStroke[] = []
  const tracks: SeedTrack[] = []
  const steps: SeedStep[] = []

  CURRICULUM.forEach((section, si) => {
    strokes.push({ key: section.key, label: section.label, display_order: si, color: section.color })
    section.groups.forEach((group, gi) => {
      tracks.push({ stroke_key: section.key, key: group.key, label: group.label, display_order: gi })
      group.steps.forEach((step) => {
        const completion = isCompletion(step.key, step.label)
        steps.push({
          version_label: versionLabel,
          stroke_key: section.key,
          track_key: group.key,
          key: step.key,
          label: step.label,
          ladder_order: step.order,
          is_first_completion: completion,
          measure_spec: completion ? ['time_sec', 'stroke_count'] : [],
        })
      })
    })
  })
  return { strokes, tracks, steps }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run __tests__/v2/curriculum-seed.test.ts`
Expected: PASS (5 tests). 만약 `freestyle.없이.25m완주`의 measure_spec 판정이 어긋나면 `isCompletion` 정규식을 키 기준으로 조정.

- [ ] **Step 5: 시드 SQL 출력 스크립트 작성**

```typescript
// lib/v2/curriculum-seed.sql-emit.ts
import { buildSeedRows } from './curriculum-seed'

function q(s: string): string { return "'" + s.replace(/'/g, "''") + "'" }

export function emitSeedSql(versionLabel: string): string {
  const { strokes, tracks, steps } = buildSeedRows(versionLabel)
  const lines: string[] = []
  lines.push(`insert into curriculum_versions (label, status) values (${q(versionLabel)}, 'active');`)
  lines.push(`with v as (select id from curriculum_versions where label=${q(versionLabel)})`)
  // strokes
  strokes.forEach(s => lines.push(
    `insert into strokes (key,label,display_order,color) values (${q(s.key)},${q(s.label)},${s.display_order},${s.color ? q(s.color) : 'null'});`))
  // tracks
  tracks.forEach(t => lines.push(
    `insert into skill_tracks (stroke_id,key,label,display_order) select id,${q(t.key)},${q(t.label)},${t.display_order} from strokes where key=${q(t.stroke_key)};`))
  // steps
  steps.forEach(st => lines.push(
    `insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec) ` +
    `select (select id from curriculum_versions where label=${q(versionLabel)}), ` +
    `(select id from strokes where key=${q(st.stroke_key)}), ` +
    `(select id from skill_tracks where key=${q(st.track_key!)} and stroke_id=(select id from strokes where key=${q(st.stroke_key)})), ` +
    `${q(st.key)},${q(st.label)},${st.ladder_order},${st.is_first_completion}, ` +
    `array[${st.measure_spec.map(q).join(',')}]::text[]);`))
  return lines.join('\n')
}

// 실행: npx tsx lib/v2/curriculum-seed.sql-emit.ts > supabase/migrations/012_v2_curriculum_seed.sql
if (require.main === module) {
  process.stdout.write(emitSeedSql('v1 - 2026 기본') + '\n')
}
```

- [ ] **Step 6: 시드 SQL 생성 + 적용**

Run: `npx tsx lib/v2/curriculum-seed.sql-emit.ts > supabase/migrations/012_v2_curriculum_seed.sql`
(`tsx` 미설치 시 `npx -y tsx ...`.)
그 후 생성된 `012_v2_curriculum_seed.sql`을 SQL Editor에 붙여 실행.

- [ ] **Step 7: 시드 검증**

```sql
select s.label stroke, count(*) steps
from skill_steps st join strokes s on s.id=st.stroke_id
group by s.label order by min(st.ladder_order);
```
Expected: 6개 영법, 합계 69단계. `select count(*) from skill_steps where is_first_completion;` > 0.

- [ ] **Step 8: Commit**

```bash
git add lib/v2/curriculum-seed.ts lib/v2/curriculum-seed.sql-emit.ts __tests__/v2/curriculum-seed.test.ts supabase/migrations/012_v2_curriculum_seed.sql
git commit -m "feat(v2): seed curriculum version 1 from existing 69-step ladder"
```

---

## Task 5: 순수 도메인 로직 (거리·완주·속도)

**Files:**
- Create: `lib/v2/metrics.ts`
- Test: `__tests__/v2/metrics.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// __tests__/v2/metrics.test.ts
import { describe, it, expect } from 'vitest'
import { lapsToMeters, sumDailyDistance, monthsBetween } from '@/lib/v2/metrics'

describe('lapsToMeters', () => {
  it('1바퀴 = 50m', () => { expect(lapsToMeters(1)).toBe(50) })
  it('3바퀴 = 150m', () => { expect(lapsToMeters(3)).toBe(150) })
  it('0바퀴 = 0m', () => { expect(lapsToMeters(0)).toBe(0) })
})

describe('sumDailyDistance', () => {
  it('laps 측정을 미터로 합산', () => {
    expect(sumDailyDistance([
      { metric_type: 'laps', value: 2 },
      { metric_type: 'laps', value: 1 },
      { metric_type: 'time_sec', value: 30 },
    ])).toBe(150)
  })
  it('laps 없으면 0', () => {
    expect(sumDailyDistance([{ metric_type: 'time_sec', value: 30 }])).toBe(0)
  })
})

describe('monthsBetween', () => {
  it('입문일→완주일 개월수(소수 1자리)', () => {
    expect(monthsBetween('2026-01-01', '2026-04-01')).toBeCloseTo(3.0, 1)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run __tests__/v2/metrics.test.ts`
Expected: FAIL — module/functions not found.

- [ ] **Step 3: 구현**

```typescript
// lib/v2/metrics.ts
import type { MetricType } from '@/types/v2'

export const METERS_PER_LAP = 50

export function lapsToMeters(laps: number): number {
  return laps * METERS_PER_LAP
}

export function sumDailyDistance(rows: { metric_type: MetricType; value: number }[]): number {
  return rows
    .filter(r => r.metric_type === 'laps')
    .reduce((m, r) => m + lapsToMeters(r.value), 0)
}

// ISO date 문자열 두 개 사이 개월수 (30.44일/월 근사)
export function monthsBetween(from: string, to: string): number {
  const ms = new Date(to).getTime() - new Date(from).getTime()
  return ms / (1000 * 60 * 60 * 24 * 30.44)
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run __tests__/v2/metrics.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/v2/metrics.ts __tests__/v2/metrics.test.ts
git commit -m "feat(v2): add pure metrics logic (laps->meters, daily distance, months-between)"
```

---

## Task 6: 데이터 접근 레이어 (서버)

**Files:**
- Create: `lib/v2/data.ts`

기존 `lib/supabase/server.ts`의 `createClient()`를 사용. 통합 테스트 하네스가 없으므로 타입체크/빌드 + 실사용으로 검증.

- [ ] **Step 1: 데이터 접근 함수 작성**

```typescript
// lib/v2/data.ts
import { createClient } from '@/lib/supabase/server'
import type { SkillStep, SkillProgress, Measurement } from '@/types/v2'

// 활성 커리큘럼의 단계 목록(영법·순서)
export async function getActiveCurriculumSteps(): Promise<SkillStep[]> {
  const supabase = await createClient()
  const { data: version } = await supabase
    .from('curriculum_versions').select('id').eq('status', 'active').single()
  if (!version) return []
  const { data, error } = await supabase
    .from('skill_steps').select('*')
    .eq('curriculum_version_id', version.id).eq('is_active', true)
    .order('ladder_order', { ascending: true })
  if (error) throw error
  return data ?? []
}

// 학생이 통과한 step_id 집합
export async function getStudentPassedStepIds(studentId: string): Promise<Set<string>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('skill_progress').select('skill_step_id').eq('student_id', studentId)
  if (error) throw error
  return new Set((data ?? []).map(r => r.skill_step_id))
}

// 학생 현재 사다리 위치(아직 통과 안 한 첫 단계)
export async function getStudentLadderPosition(studentId: string): Promise<SkillStep | null> {
  const [steps, passed] = await Promise.all([
    getActiveCurriculumSteps(), getStudentPassedStepIds(studentId),
  ])
  return steps.find(s => !passed.has(s.id)) ?? null
}

// 단계 통과 기록(스냅샷 포함)
export async function passStep(args: {
  studentId: string; step: SkillStep; difficulty?: SkillProgress['difficulty']
  sourceSessionId?: string | null; instructorId?: string | null; note?: string | null
}): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('skill_progress').insert({
    student_id: args.studentId,
    skill_step_id: args.step.id,
    difficulty: args.difficulty ?? null,
    source_session_id: args.sourceSessionId ?? null,
    instructor_id: args.instructorId ?? null,
    step_key_snapshot: args.step.key,
    ladder_order_snapshot: args.step.ladder_order,
    note: args.note ?? null,
  })
  if (error) throw error
}

// 측정값 기록(데일리 바퀴수 / 완주 시간·스트로크 공용)
export async function recordMeasurement(m: Omit<Measurement, 'id' | 'created_at'>): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('measurements').insert(m)
  if (error) throw error
}
```

- [ ] **Step 2: 타입체크 + 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add lib/v2/data.ts
git commit -m "feat(v2): add server data-access layer (curriculum, ladder position, pass step, measurements)"
```

---

## Self-Review (작성자 체크)

- **스펙 커버리지:** §5 테이블 전부 Task1에 존재(curriculum_versions/strokes/skill_tracks/skill_steps/students/sessions/measurements/skill_progress/media/lesson_templates/items). §5.5 스냅샷·§6.4 편집안정성=`step_key_snapshot`/`ladder_order_snapshot` + `is_active`. §6.1 데일리 바퀴수=measurements(laps). 첫완주=`is_first_completion`+measure_spec(Task4). 커리큘럼 버전=Task1+Task4. ✅ (UI/템플릿 CRUD/관리자 편집/영상 업로드/리포트=후속 계획, 아래 명시.)
- **플레이스홀더:** 없음. 모든 SQL·타입·테스트·함수 본문 완비.
- **타입 일관성:** `MetricType`·`Difficulty`·`SkillStep` 등 Task3 정의를 Task4·5·6에서 동일 사용. `buildSeedRows`→`emitSeedSql` 시그니처 일치.

## 후속 계획 (이 토대 위, 각각 별도 plan 문서로 상세화)

- **Plan 2 — 강사 일일 입력 UX**: 3등분(템플릿/지금영법/바퀴수)+출결+단계통과. *Next 16 서버컴포넌트/액션 규약 확인 필요.*
- **Plan 3 — 수업 템플릿 CRUD + 원장 표준 승격**
- **Plan 4 — 첫 완주 측정 + 이전 영법 재측정 흐름**
- **Plan 5 — 관리자 커리큘럼 편집(추가/순서/보관) + 영상 업로드·피드백(Storage)**
- **Phase 2+** — 부모 리포트 자동화 → 예측 → 운영분석.

## 실행 전 확정 필요

- DB 타깃(신규 프로젝트 `public` vs 기존 프로젝트 별도 스키마) — 본 계획 (A) 가정.
- 100단계 확장은 버전1(69단계) 안정화 후 관리자 화면(Plan 5)에서.
