-- planned_makeups: 오늘의 보강 예약
create table public.planned_makeups (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) on delete cascade not null,
  session_date date not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now() not null
);

create index idx_planned_makeups_date on public.planned_makeups(session_date);

alter table public.planned_makeups enable row level security;

create policy "인증된 사용자 보강 예약 조회" on public.planned_makeups
  for select to authenticated using (true);

create policy "원장 보강 예약 추가" on public.planned_makeups
  for insert to authenticated
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'director')
  );

create policy "원장 보강 예약 삭제" on public.planned_makeups
  for delete to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'director')
  );
