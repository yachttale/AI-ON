-- 015_v2_studio_closures.sql — 휴원일(휴관일). 결석과 무관, 그 날짜 전체 수업 없음.
-- 적용: Supabase SQL Editor. 010·011 이후.

create table if not exists public.studio_closures (
  closed_on date primary key,                         -- 휴원 날짜(하루 단위)
  reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now() not null
);

alter table public.studio_closures enable row level security;

-- 조회: 전원(강사가 휴원 배너 표시) / 관리: 원장
drop policy if exists "휴원일 조회" on public.studio_closures;
create policy "휴원일 조회" on public.studio_closures for select to authenticated using (true);
drop policy if exists "휴원일 관리" on public.studio_closures;
create policy "휴원일 관리" on public.studio_closures for all to authenticated using (public.is_director()) with check (public.is_director());

grant select, insert, update, delete on public.studio_closures to authenticated;
