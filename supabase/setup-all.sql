-- ============================================================
-- AI-ON v2 통합 셋업 SQL (010 + 011 + 012)
-- Supabase SQL Editor에 통째로 붙여넣고 한 번에 Run.
-- 재원생 시드(013)는 PII라 별도 — 이 파일에 미포함.
-- ============================================================

-- ===== [1/3] 010_v2_schema.sql =====
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
  step_kind text not null default 'ladder' check (step_kind in ('ladder','counter','repeatable')),
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

-- ===== [2/3] 011_v2_rls.sql =====
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

-- 학생 (조회: 전원 / 추가: 원장 / 수정: 원장 또는 담당강사)
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

-- sessions
create policy "수업 조회" on public.sessions for select to authenticated using (
  public.is_director() or instructor_id = auth.uid()
  or exists (select 1 from public.students s where s.id = student_id and s.instructor_id = auth.uid()));
create policy "수업 입력" on public.sessions for insert to authenticated with check (
  public.is_director() or instructor_id = auth.uid());
create policy "수업 수정" on public.sessions for update to authenticated using (
  public.is_director() or instructor_id = auth.uid());

-- measurements
create policy "측정 조회" on public.measurements for select to authenticated using (
  public.is_director() or exists (select 1 from public.students s where s.id = student_id and s.instructor_id = auth.uid()));
create policy "측정 입력" on public.measurements for insert to authenticated with check (
  public.is_director() or exists (select 1 from public.students s where s.id = student_id and s.instructor_id = auth.uid()));
create policy "측정 삭제" on public.measurements for delete to authenticated using (
  public.is_director() or exists (select 1 from public.students s where s.id = student_id and s.instructor_id = auth.uid()));

-- skill_progress
create policy "진행 조회" on public.skill_progress for select to authenticated using (
  public.is_director() or exists (select 1 from public.students s where s.id = student_id and s.instructor_id = auth.uid()));
create policy "진행 입력" on public.skill_progress for insert to authenticated with check (
  public.is_director() or exists (select 1 from public.students s where s.id = student_id and s.instructor_id = auth.uid()));
create policy "진행 삭제" on public.skill_progress for delete to authenticated using (
  public.is_director() or exists (select 1 from public.students s where s.id = student_id and s.instructor_id = auth.uid()));

-- media
create policy "영상 조회" on public.media for select to authenticated using (
  public.is_director() or exists (select 1 from public.students s where s.id = student_id and s.instructor_id = auth.uid()));
create policy "영상 입력" on public.media for insert to authenticated with check (
  public.is_director() or exists (select 1 from public.students s where s.id = student_id and s.instructor_id = auth.uid()));
create policy "영상 수정" on public.media for update to authenticated using (
  public.is_director() or exists (select 1 from public.students s where s.id = student_id and s.instructor_id = auth.uid()));

-- grants
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ===== [3/3] 012_v2_curriculum_seed.sql =====
-- 생성물: 커리큘럼 버전1 시드 (7 영법, 144 단계)
insert into curriculum_versions (label, status) values ('v1 - 2026 기본', 'active');
insert into strokes (key,label,display_order,color) values ('beginner','초보',0,'#60a5fa');
insert into strokes (key,label,display_order,color) values ('freestyle','자유형',1,'#34d399');
insert into strokes (key,label,display_order,color) values ('backstroke','배영',2,'#f59e0b');
insert into strokes (key,label,display_order,color) values ('breaststroke','평영',3,'#a78bfa');
insert into strokes (key,label,display_order,color) values ('butterfly','접영',4,'#f87171');
insert into strokes (key,label,display_order,color) values ('master','마스터',5,'#fbbf24');
insert into strokes (key,label,display_order,color) values ('etc','기타',6,'#94a3b8');
insert into skill_tracks (stroke_id,key,label,display_order) select id,'water','물 적응',0 from strokes where key='beginner';
insert into skill_tracks (stroke_id,key,label,display_order) select id,'kb_helper','킥판 + 헬퍼',0 from strokes where key='freestyle';
insert into skill_tracks (stroke_id,key,label,display_order) select id,'peanut_helper','땅콩 + 헬퍼',1 from strokes where key='freestyle';
insert into skill_tracks (stroke_id,key,label,display_order) select id,'hand_helper','손 + 헬퍼',2 from strokes where key='freestyle';
insert into skill_tracks (stroke_id,key,label,display_order) select id,'helper','헬퍼',3 from strokes where key='freestyle';
insert into skill_tracks (stroke_id,key,label,display_order) select id,'none','보조 없이',4 from strokes where key='freestyle';
insert into skill_tracks (stroke_id,key,label,display_order) select id,'m50','50m',5 from strokes where key='freestyle';
insert into skill_tracks (stroke_id,key,label,display_order) select id,'kb_helper','킥판 + 헬퍼',0 from strokes where key='backstroke';
insert into skill_tracks (stroke_id,key,label,display_order) select id,'helper','헬퍼',1 from strokes where key='backstroke';
insert into skill_tracks (stroke_id,key,label,display_order) select id,'none','보조 없이',2 from strokes where key='backstroke';
insert into skill_tracks (stroke_id,key,label,display_order) select id,'m50','50m',3 from strokes where key='backstroke';
insert into skill_tracks (stroke_id,key,label,display_order) select id,'kb_helper','킥판 + 헬퍼',0 from strokes where key='breaststroke';
insert into skill_tracks (stroke_id,key,label,display_order) select id,'back_helper','헬퍼 + 누워서',1 from strokes where key='breaststroke';
insert into skill_tracks (stroke_id,key,label,display_order) select id,'helper','헬퍼',2 from strokes where key='breaststroke';
insert into skill_tracks (stroke_id,key,label,display_order) select id,'none','보조 없이',3 from strokes where key='breaststroke';
insert into skill_tracks (stroke_id,key,label,display_order) select id,'m50','50m',4 from strokes where key='breaststroke';
insert into skill_tracks (stroke_id,key,label,display_order) select id,'dolphin','돌핀킥',0 from strokes where key='butterfly';
insert into skill_tracks (stroke_id,key,label,display_order) select id,'arm','팔동작',1 from strokes where key='butterfly';
insert into skill_tracks (stroke_id,key,label,display_order) select id,'combo','콤비네이션',2 from strokes where key='butterfly';
insert into skill_tracks (stroke_id,key,label,display_order) select id,'m50','50m',3 from strokes where key='butterfly';
insert into skill_tracks (stroke_id,key,label,display_order) select id,'free','자유형',0 from strokes where key='master';
insert into skill_tracks (stroke_id,key,label,display_order) select id,'back','배영',1 from strokes where key='master';
insert into skill_tracks (stroke_id,key,label,display_order) select id,'breast','평영',2 from strokes where key='master';
insert into skill_tracks (stroke_id,key,label,display_order) select id,'fly','접영',3 from strokes where key='master';
insert into skill_tracks (stroke_id,key,label,display_order) select id,'im','IM',4 from strokes where key='master';
insert into skill_tracks (stroke_id,key,label,display_order) select id,'turn','턴',0 from strokes where key='etc';
insert into skill_tracks (stroke_id,key,label,display_order) select id,'start','스타트',1 from strokes where key='etc';
insert into skill_tracks (stroke_id,key,label,display_order) select id,'submarine','잠영',2 from strokes where key='etc';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='beginner'), (select id from skill_tracks where key='water' and stroke_id=(select id from strokes where key='beginner')), 'beginner.water.1','잠수 - 코까지',1,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='beginner'), (select id from skill_tracks where key='water' and stroke_id=(select id from strokes where key='beginner')), 'beginner.water.2','잠수 - 얼굴까지',2,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='beginner'), (select id from skill_tracks where key='water' and stroke_id=(select id from strokes where key='beginner')), 'beginner.water.3','잠수 - 귀까지',3,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='beginner'), (select id from skill_tracks where key='water' and stroke_id=(select id from strokes where key='beginner')), 'beginner.water.4','잠수 - 머리 전체',4,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='beginner'), (select id from skill_tracks where key='water' and stroke_id=(select id from strokes where key='beginner')), 'beginner.water.5','잠수 - 5초',5,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='beginner'), (select id from skill_tracks where key='water' and stroke_id=(select id from strokes where key='beginner')), 'beginner.water.6','잠수 - 10초',6,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='beginner'), (select id from skill_tracks where key='water' and stroke_id=(select id from strokes where key='beginner')), 'beginner.water.7','잠수 - 20초',7,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='beginner'), (select id from skill_tracks where key='water' and stroke_id=(select id from strokes where key='beginner')), 'beginner.water.8','바닥에 앉기',8,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='beginner'), (select id from skill_tracks where key='water' and stroke_id=(select id from strokes where key='beginner')), 'beginner.water.9','물건 줍기',9,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='beginner'), (select id from skill_tracks where key='water' and stroke_id=(select id from strokes where key='beginner')), 'beginner.water.10','앞구르기',10,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='beginner'), (select id from skill_tracks where key='water' and stroke_id=(select id from strokes where key='beginner')), 'beginner.water.11','옆구르기',11,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='beginner'), (select id from skill_tracks where key='water' and stroke_id=(select id from strokes where key='beginner')), 'beginner.water.12','뒷구르기',12,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='beginner'), (select id from skill_tracks where key='water' and stroke_id=(select id from strokes where key='beginner')), 'beginner.water.13','물구나무 서기',13,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='beginner'), (select id from skill_tracks where key='water' and stroke_id=(select id from strokes where key='beginner')), 'beginner.water.14','물대포',14,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.kb_helper.1','머리들고 슈퍼맨 3m',15,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.kb_helper.2','음파 슈퍼맨 3m',16,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.kb_helper.3','발차기',17,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.kb_helper.4','발차기 5m',18,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.kb_helper.5','발차기 15m',19,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.kb_helper.6','발차기 25m',20,true, array['time_sec']::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.kb_helper.7','팔돌리기',21,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.kb_helper.8','호흡1회 팔1회',22,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.kb_helper.9','호흡1회 팔1회 5m',23,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.kb_helper.10','호흡1회 팔1회 15m',24,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.kb_helper.11','호흡1회 팔1회 25m',25,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.kb_helper.12','호흡1회 팔 2회',26,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.kb_helper.13','호흡1회 팔 2회 5m',27,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.kb_helper.14','호흡1회 팔 2회 15m',28,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.kb_helper.15','호흡1회 팔 2회 25m',29,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.kb_helper.16','오른팔 1회 호흡1회',30,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.kb_helper.17','오른팔 1회 호흡1회 5m',31,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.kb_helper.18','오른팔 1회 호흡1회 15m',32,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.kb_helper.19','오른팔 1회 호흡1회 25m',33,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.kb_helper.20','자유형 콤비네에션',34,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.kb_helper.21','자유형 콤비네에션 5m',35,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.kb_helper.22','자유형 콤비네에션 15m',36,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.kb_helper.23','자유형 콤비네에션 25m',37,true, array['time_sec','stroke_count']::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='peanut_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.peanut_helper.1','자유형 콤비네에션',38,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='peanut_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.peanut_helper.2','자유형 콤비네에션 5m',39,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='peanut_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.peanut_helper.3','자유형 콤비네에션 15m',40,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='peanut_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.peanut_helper.4','자유형 콤비네에션 25m',41,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='hand_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.hand_helper.1','자유형 콤비네에션',42,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='hand_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.hand_helper.2','자유형 콤비네에션 5m',43,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='hand_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.hand_helper.3','자유형 콤비네에션 15m',44,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='hand_helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.hand_helper.4','자유형 콤비네에션 25m',45,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.helper.1','자유형 콤비네에션',46,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.helper.2','자유형 콤비네에션 5m',47,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.helper.3','자유형 콤비네에션 15m',48,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='helper' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.helper.4','자유형 콤비네에션 25m',49,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='none' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.none.1','자유형 콤비네에션',50,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='none' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.none.2','자유형 콤비네에션 5m',51,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='none' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.none.3','자유형 콤비네에션 15m',52,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='none' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.none.4','자유형 콤비네에션 25m',53,true, array['time_sec','stroke_count']::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='freestyle'), (select id from skill_tracks where key='m50' and stroke_id=(select id from strokes where key='freestyle')), 'freestyle.m50.1','1바퀴',54,false, array[]::text[],'repeatable';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='backstroke'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='backstroke')), 'backstroke.kb_helper.1','누워서 뜨기',55,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='backstroke'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='backstroke')), 'backstroke.kb_helper.2','발차기',56,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='backstroke'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='backstroke')), 'backstroke.kb_helper.3','발차기 5m',57,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='backstroke'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='backstroke')), 'backstroke.kb_helper.4','발차기 15m',58,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='backstroke'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='backstroke')), 'backstroke.kb_helper.5','발차기 25m',59,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='backstroke'), (select id from skill_tracks where key='helper' and stroke_id=(select id from strokes where key='backstroke')), 'backstroke.helper.1','팔동작',60,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='backstroke'), (select id from skill_tracks where key='helper' and stroke_id=(select id from strokes where key='backstroke')), 'backstroke.helper.2','콤비 5m',61,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='backstroke'), (select id from skill_tracks where key='helper' and stroke_id=(select id from strokes where key='backstroke')), 'backstroke.helper.3','콤비 15m',62,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='backstroke'), (select id from skill_tracks where key='helper' and stroke_id=(select id from strokes where key='backstroke')), 'backstroke.helper.4','콤비 25m',63,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='backstroke'), (select id from skill_tracks where key='none' and stroke_id=(select id from strokes where key='backstroke')), 'backstroke.none.1','발차기 5m',64,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='backstroke'), (select id from skill_tracks where key='none' and stroke_id=(select id from strokes where key='backstroke')), 'backstroke.none.2','발차기 15m',65,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='backstroke'), (select id from skill_tracks where key='none' and stroke_id=(select id from strokes where key='backstroke')), 'backstroke.none.3','발차기 25m',66,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='backstroke'), (select id from skill_tracks where key='none' and stroke_id=(select id from strokes where key='backstroke')), 'backstroke.none.4','콤비 5m',67,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='backstroke'), (select id from skill_tracks where key='none' and stroke_id=(select id from strokes where key='backstroke')), 'backstroke.none.5','콤비 15m',68,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='backstroke'), (select id from skill_tracks where key='none' and stroke_id=(select id from strokes where key='backstroke')), 'backstroke.none.6','콤비 25m',69,true, array['time_sec','stroke_count']::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='backstroke'), (select id from skill_tracks where key='m50' and stroke_id=(select id from strokes where key='backstroke')), 'backstroke.m50.1','1바퀴',70,false, array[]::text[],'repeatable';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='breaststroke'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='breaststroke')), 'breaststroke.kb_helper.1','발목 잡기',71,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='breaststroke'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='breaststroke')), 'breaststroke.kb_helper.2','발 모양 잡기',72,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='breaststroke'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='breaststroke')), 'breaststroke.kb_helper.3','발차기 5m',73,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='breaststroke'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='breaststroke')), 'breaststroke.kb_helper.4','발차기 15m',74,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='breaststroke'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='breaststroke')), 'breaststroke.kb_helper.5','발차기 25m',75,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='breaststroke'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='breaststroke')), 'breaststroke.kb_helper.6','음파 + 발차기 5m',76,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='breaststroke'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='breaststroke')), 'breaststroke.kb_helper.7','음파 + 발차기 15m',77,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='breaststroke'), (select id from skill_tracks where key='kb_helper' and stroke_id=(select id from strokes where key='breaststroke')), 'breaststroke.kb_helper.8','음파 + 발차기 25m',78,true, array['time_sec','stroke_count']::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='breaststroke'), (select id from skill_tracks where key='back_helper' and stroke_id=(select id from strokes where key='breaststroke')), 'breaststroke.back_helper.1','발차기 5m',79,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='breaststroke'), (select id from skill_tracks where key='back_helper' and stroke_id=(select id from strokes where key='breaststroke')), 'breaststroke.back_helper.2','발차기 15m',80,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='breaststroke'), (select id from skill_tracks where key='back_helper' and stroke_id=(select id from strokes where key='breaststroke')), 'breaststroke.back_helper.3','발차기 25m',81,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='breaststroke'), (select id from skill_tracks where key='helper' and stroke_id=(select id from strokes where key='breaststroke')), 'breaststroke.helper.1','발차기 5m 호흡 타이밍',82,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='breaststroke'), (select id from skill_tracks where key='helper' and stroke_id=(select id from strokes where key='breaststroke')), 'breaststroke.helper.2','발차기 15m 호흡 타이밍',83,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='breaststroke'), (select id from skill_tracks where key='helper' and stroke_id=(select id from strokes where key='breaststroke')), 'breaststroke.helper.3','발차기 25m 호흡 타이밍',84,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='breaststroke'), (select id from skill_tracks where key='helper' and stroke_id=(select id from strokes where key='breaststroke')), 'breaststroke.helper.4','팔 + 자유형 킥',85,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='breaststroke'), (select id from skill_tracks where key='helper' and stroke_id=(select id from strokes where key='breaststroke')), 'breaststroke.helper.5','팔 + 자유형 킥 5m',86,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='breaststroke'), (select id from skill_tracks where key='helper' and stroke_id=(select id from strokes where key='breaststroke')), 'breaststroke.helper.6','팔 + 자유형 킥 15m',87,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='breaststroke'), (select id from skill_tracks where key='helper' and stroke_id=(select id from strokes where key='breaststroke')), 'breaststroke.helper.7','팔 + 자유형 킥 25m',88,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='breaststroke'), (select id from skill_tracks where key='helper' and stroke_id=(select id from strokes where key='breaststroke')), 'breaststroke.helper.8','콤비 타이밍',89,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='breaststroke'), (select id from skill_tracks where key='helper' and stroke_id=(select id from strokes where key='breaststroke')), 'breaststroke.helper.9','콤비 타이밍 5m',90,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='breaststroke'), (select id from skill_tracks where key='helper' and stroke_id=(select id from strokes where key='breaststroke')), 'breaststroke.helper.10','콤비 타이밍 15m',91,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='breaststroke'), (select id from skill_tracks where key='helper' and stroke_id=(select id from strokes where key='breaststroke')), 'breaststroke.helper.11','콤비 타이밍 25m',92,true, array['time_sec','stroke_count']::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='breaststroke'), (select id from skill_tracks where key='none' and stroke_id=(select id from strokes where key='breaststroke')), 'breaststroke.none.1','콤비 타이밍',93,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='breaststroke'), (select id from skill_tracks where key='none' and stroke_id=(select id from strokes where key='breaststroke')), 'breaststroke.none.2','콤비 타이밍 5m',94,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='breaststroke'), (select id from skill_tracks where key='none' and stroke_id=(select id from strokes where key='breaststroke')), 'breaststroke.none.3','콤비 타이밍 15m',95,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='breaststroke'), (select id from skill_tracks where key='none' and stroke_id=(select id from strokes where key='breaststroke')), 'breaststroke.none.4','콤비 타이밍 25m',96,true, array['time_sec','stroke_count']::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='breaststroke'), (select id from skill_tracks where key='m50' and stroke_id=(select id from strokes where key='breaststroke')), 'breaststroke.m50.1','1바퀴',97,false, array[]::text[],'repeatable';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='dolphin' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.dolphin.1','웨이브',98,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='dolphin' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.dolphin.2','웨이브 5m',99,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='dolphin' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.dolphin.3','웨이브 15m',100,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='dolphin' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.dolphin.4','웨이브 25m',101,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='dolphin' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.dolphin.5','킥판',102,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='dolphin' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.dolphin.6','킥판 5m',103,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='dolphin' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.dolphin.7','킥판 15m',104,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='dolphin' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.dolphin.8','킥판 25m',105,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='arm' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.arm.1','한팔 접영',106,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='arm' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.arm.2','한팔 접영(오) 5m',107,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='arm' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.arm.3','한팔 접영(오) 15m',108,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='arm' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.arm.4','한팔 접영(오) 25m',109,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='arm' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.arm.5','한팔 접영(왼)',110,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='arm' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.arm.6','한팔 접영(왼) 5m',111,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='arm' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.arm.7','한팔 접영(왼) 15m',112,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='arm' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.arm.8','한팔 접영(왼) 25m',113,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='arm' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.arm.9','한팔 접영 좌우',114,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='arm' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.arm.10','한팔 접영 좌우 5m',115,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='arm' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.arm.11','한팔 접영 좌우 15m',116,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='arm' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.arm.12','한팔 접영 좌우 25m',117,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='combo' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.combo.1','호흡 타이밍',118,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='combo' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.combo.2','호흡 타이밍 5m',119,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='combo' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.combo.3','호흡 타이밍 15m',120,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='combo' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.combo.4','호흡 타이밍 25m',121,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='combo' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.combo.5','땅콩끼고 양팔',122,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='combo' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.combo.6','땅콩끼고 양팔 5m',123,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='combo' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.combo.7','땅콩끼고 양팔 15m',124,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='combo' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.combo.8','땅콩끼고 양팔 25m',125,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='combo' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.combo.9','양팔',126,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='combo' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.combo.10','양팔 5m',127,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='combo' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.combo.11','양팔 15m',128,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='combo' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.combo.12','양팔 25m',129,true, array['time_sec','stroke_count']::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='butterfly'), (select id from skill_tracks where key='m50' and stroke_id=(select id from strokes where key='butterfly')), 'butterfly.m50.1','1바퀴',130,false, array[]::text[],'repeatable';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='master'), (select id from skill_tracks where key='free' and stroke_id=(select id from strokes where key='master')), 'master.free.1','50m',131,false, array[]::text[],'repeatable';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='master'), (select id from skill_tracks where key='back' and stroke_id=(select id from strokes where key='master')), 'master.back.1','50m',132,false, array[]::text[],'repeatable';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='master'), (select id from skill_tracks where key='breast' and stroke_id=(select id from strokes where key='master')), 'master.breast.1','50m',133,false, array[]::text[],'repeatable';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='master'), (select id from skill_tracks where key='fly' and stroke_id=(select id from strokes where key='master')), 'master.fly.1','50m',134,false, array[]::text[],'repeatable';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='master'), (select id from skill_tracks where key='im' and stroke_id=(select id from strokes where key='master')), 'master.im.1','접배평자(200M)',135,true, array['time_sec']::text[],'repeatable';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='etc'), (select id from skill_tracks where key='turn' and stroke_id=(select id from strokes where key='etc')), 'etc.turn.1','사이드턴',136,false, array[]::text[],'counter';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='etc'), (select id from skill_tracks where key='turn' and stroke_id=(select id from strokes where key='etc')), 'etc.turn.2','플립턴',137,false, array[]::text[],'counter';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='etc'), (select id from skill_tracks where key='start' and stroke_id=(select id from strokes where key='etc')), 'etc.start.1','물속 스타트',138,false, array[]::text[],'counter';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='etc'), (select id from skill_tracks where key='start' and stroke_id=(select id from strokes where key='etc')), 'etc.start.2','다이빙',139,false, array[]::text[],'counter';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='etc'), (select id from skill_tracks where key='submarine' and stroke_id=(select id from strokes where key='etc')), 'etc.submarine.1','5M',140,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='etc'), (select id from skill_tracks where key='submarine' and stroke_id=(select id from strokes where key='etc')), 'etc.submarine.2','10M',141,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='etc'), (select id from skill_tracks where key='submarine' and stroke_id=(select id from strokes where key='etc')), 'etc.submarine.3','15M',142,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='etc'), (select id from skill_tracks where key='submarine' and stroke_id=(select id from strokes where key='etc')), 'etc.submarine.4','20M',143,false, array[]::text[],'ladder';
insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) select (select id from curriculum_versions where label='v1 - 2026 기본'), (select id from strokes where key='etc'), (select id from skill_tracks where key='submarine' and stroke_id=(select id from strokes where key='etc')), 'etc.submarine.5','25M',144,false, array[]::text[],'counter';
