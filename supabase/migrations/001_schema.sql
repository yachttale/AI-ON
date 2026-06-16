-- profiles: auth.users 확장
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text not null,
  role text not null check (role in ('instructor', 'director')),
  created_at timestamptz default now() not null
);

-- students
create table public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  grade text,
  schedule text not null,
  instructor_id uuid references public.profiles(id),
  is_active boolean default true not null,
  created_at timestamptz default now() not null
);

-- session_logs (append-only: UPDATE/DELETE RLS로 차단)
create table public.session_logs (
  id uuid primary key default gen_random_uuid(),
  session_date date not null,
  student_id uuid references public.students(id) not null,
  instructor_id uuid references public.profiles(id) not null,
  attendance text not null check (attendance in ('출석', '지각', '결석')),
  stroke text,
  stage text,
  status text check (status in ('진행중', '통과')),
  memo text,
  created_at timestamptz default now() not null
);

-- curriculum_standards
create table public.curriculum_standards (
  id uuid primary key default gen_random_uuid(),
  stroke text not null,
  stage text not null,
  description text,
  target_sessions integer,
  unique(stroke, stage)
);

-- completion_records
create table public.completion_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) not null,
  stroke text not null,
  completed_date date not null,
  total_sessions integer,
  record_seconds numeric,
  instructor_id uuid references public.profiles(id),
  examiner_id uuid references public.profiles(id),
  passed boolean not null,
  notes text,
  created_at timestamptz default now() not null
);

-- 인덱스
create index idx_session_logs_student_date on public.session_logs(student_id, session_date desc);
create index idx_session_logs_instructor_date on public.session_logs(instructor_id, session_date desc);
create index idx_students_instructor on public.students(instructor_id);

-- RLS 활성화
alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.session_logs enable row level security;
alter table public.curriculum_standards enable row level security;
alter table public.completion_records enable row level security;

-- profiles RLS
create policy "인증된 사용자 프로필 조회" on public.profiles
  for select to authenticated using (true);

create policy "자신의 프로필 수정" on public.profiles
  for update to authenticated using (auth.uid() = id);

create policy "가입 시 프로필 생성" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

-- students RLS
create policy "인증된 사용자 학생 조회" on public.students
  for select to authenticated using (true);

create policy "원장만 학생 추가" on public.students
  for insert to authenticated
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'director')
  );

create policy "원장만 학생 수정" on public.students
  for update to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'director')
  );

-- session_logs RLS (APPEND-ONLY: SELECT + INSERT만 허용, UPDATE/DELETE 없음)
create policy "인증된 사용자 로그 조회" on public.session_logs
  for select to authenticated using (true);

create policy "강사 본인 로그 추가" on public.session_logs
  for insert to authenticated
  with check (auth.uid() = instructor_id);

-- curriculum_standards RLS
create policy "모든 인증된 사용자 조회" on public.curriculum_standards
  for select to authenticated using (true);

-- completion_records RLS
create policy "인증된 사용자 완성 기록 조회" on public.completion_records
  for select to authenticated using (true);

create policy "원장 완성 기록 추가" on public.completion_records
  for insert to authenticated
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'director')
  );

-- auth trigger: 가입 시 profile 자동 생성
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', '이름없음'), 'instructor');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
