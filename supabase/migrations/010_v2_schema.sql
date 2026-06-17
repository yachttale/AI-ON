-- 010_v2_schema.sql — 수영 교육 데이터 플랫폼 v2 토대
-- 적용: Supabase SQL Editor. 기존 진도관리 프로젝트 재활용(1주 테스트 테이블 drop 후) public 가정.

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
  step_kind text not null default 'ladder' check (step_kind in ('ladder','counter','repeatable','single')),
  -- ladder=통과형(1회 통과), counter=누적연습+완성버튼(턴/스타트/잠영25M), repeatable=반복기록(50m 바퀴·마스터 거리)
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
  phone text,  -- 보호자 연락처(영상 전송용) — 재원생 명단에서 백필

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
  metric_type text not null check (metric_type in ('laps','distance_m','time_sec','stroke_count','attempt')),
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
