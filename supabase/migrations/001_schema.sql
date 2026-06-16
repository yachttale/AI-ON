-- ============================================================
-- starkids AI-ON v2 schema
-- ============================================================

-- profiles
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
  withdrawal_status text check (withdrawal_status in ('pending', 'approved')),
  withdrawal_requested_by uuid references public.profiles(id),
  withdrawal_note text,
  created_at timestamptz default now() not null
);

-- session_logs (출결만 - 단순화)
create table public.session_logs (
  id uuid primary key default gen_random_uuid(),
  session_date date not null,
  student_id uuid references public.students(id) not null,
  instructor_id uuid references public.profiles(id) not null,
  attendance text not null check (attendance in ('출석', '지각', '결석')),
  absence_reason text check (absence_reason in ('입원', '아파서', '다른일정', '여행', '기타')),
  memo text,
  created_at timestamptz default now() not null,
  constraint session_logs_student_date_unique unique (student_id, session_date)
);

-- skill_checkpoints (핵심: 단계별 통과 기록 - 영구 누적)
create table public.skill_checkpoints (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) on delete cascade not null,
  instructor_id uuid references public.profiles(id),
  skill_key text not null,        -- e.g. 'beginner.잠수_코', 'freestyle.킥판+헬퍼.5m'
  difficulty text check (difficulty in ('어려워함', '조금어려워함', '중간', '조금쉽게', '쉽게해결')),
  passed_at date not null default current_date,
  memo text,
  created_at timestamptz default now() not null,
  constraint skill_checkpoints_student_skill_unique unique (student_id, skill_key)
);

-- swim_distances (마스터반 거리 기록)
create table public.swim_distances (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) not null,
  instructor_id uuid references public.profiles(id),
  logged_date date not null default current_date,
  distance_meters integer not null,
  memo text,
  created_at timestamptz default now() not null
);

-- 인덱스
create index idx_session_logs_student_date on public.session_logs(student_id, session_date desc);
create index idx_session_logs_instructor_date on public.session_logs(instructor_id, session_date desc);
create index idx_skill_checkpoints_student on public.skill_checkpoints(student_id);
create index idx_skill_checkpoints_student_skill on public.skill_checkpoints(student_id, skill_key);
create index idx_students_instructor on public.students(instructor_id);
create index idx_swim_distances_student_date on public.swim_distances(student_id, logged_date desc);

-- RLS 활성화
alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.session_logs enable row level security;
alter table public.skill_checkpoints enable row level security;
alter table public.swim_distances enable row level security;

-- profiles RLS
create policy "프로필 조회" on public.profiles
  for select to authenticated using (true);

create policy "프로필 수정" on public.profiles
  for update to authenticated using (auth.uid() = id);

create policy "프로필 생성" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

-- students RLS
create policy "학생 조회" on public.students
  for select to authenticated using (true);

create policy "학생 추가" on public.students
  for insert to authenticated
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'director')
  );

create policy "학생 수정" on public.students
  for update to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'director')
    or instructor_id = auth.uid()
  );

-- session_logs RLS
create policy "출결 조회" on public.session_logs
  for select to authenticated using (
    instructor_id = auth.uid()
    or exists (select 1 from public.students where students.id = session_logs.student_id and students.instructor_id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'director')
  );

create policy "출결 입력" on public.session_logs
  for insert to authenticated
  with check (
    instructor_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'director')
  );

create policy "출결 수정" on public.session_logs
  for update to authenticated
  using (
    instructor_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'director')
  );

-- skill_checkpoints RLS
create policy "체크포인트 조회" on public.skill_checkpoints
  for select to authenticated using (
    exists (select 1 from public.students where students.id = skill_checkpoints.student_id and students.instructor_id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'director')
  );

create policy "체크포인트 입력" on public.skill_checkpoints
  for insert to authenticated
  with check (
    exists (select 1 from public.students where students.id = skill_checkpoints.student_id and students.instructor_id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'director')
  );

create policy "체크포인트 수정" on public.skill_checkpoints
  for update to authenticated
  using (
    exists (select 1 from public.students where students.id = skill_checkpoints.student_id and students.instructor_id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'director')
  );

create policy "체크포인트 삭제" on public.skill_checkpoints
  for delete to authenticated
  using (
    exists (select 1 from public.students where students.id = skill_checkpoints.student_id and students.instructor_id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'director')
  );

-- swim_distances RLS
create policy "거리 조회" on public.swim_distances
  for select to authenticated using (
    exists (select 1 from public.students where students.id = swim_distances.student_id and students.instructor_id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'director')
  );

create policy "거리 입력" on public.swim_distances
  for insert to authenticated
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('instructor', 'director'))
  );

create policy "거리 삭제" on public.swim_distances
  for delete to authenticated
  using (
    exists (select 1 from public.students where students.id = swim_distances.student_id and students.instructor_id = auth.uid())
  );

-- auth trigger
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
