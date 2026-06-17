-- 014_v2_assign.sql — 요일별 강사 배정
-- 주2회+ 학생은 요일마다 담당 강사가 다를 수 있음. 한 번 배정하면 그 요일은 고정(매주 반복).
-- 반 변경 시엔 다른 강사가 그 요일을 가져가면 담당 이전.

-- (옛 단일 배정 RPC가 있으면 정리)
drop function if exists public.assign_student_to_me(uuid);

create table if not exists public.student_day_instructors (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),  -- 0=일 ~ 6=토 (JS getDay 기준)
  instructor_id uuid not null references public.profiles(id),
  created_at timestamptz default now() not null,
  unique (student_id, weekday)
);
create index if not exists idx_sdi_instructor_weekday on public.student_day_instructors(instructor_id, weekday);

alter table public.student_day_instructors enable row level security;
drop policy if exists "요일배정 조회" on public.student_day_instructors;
create policy "요일배정 조회" on public.student_day_instructors for select to authenticated using (true);

-- 가져오기: 오늘 요일 배정을 호출 강사 본인으로 upsert (RLS 우회, 항상 auth.uid())
create or replace function public.assign_day_to_me(p_student_id uuid, p_weekday smallint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.student_day_instructors (student_id, weekday, instructor_id)
  values (p_student_id, p_weekday, auth.uid())
  on conflict (student_id, weekday) do update set instructor_id = excluded.instructor_id;
end;
$$;

grant execute on function public.assign_day_to_me(uuid, smallint) to authenticated;
