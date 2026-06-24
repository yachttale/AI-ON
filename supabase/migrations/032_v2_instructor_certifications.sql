-- 032_v2_instructor_certifications.sql — 강사 자격증(포트폴리오용)
-- 적용: Supabase SQL Editor. 010~031 이후.

create table if not exists public.instructor_certifications (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  acquired_on date,
  created_at timestamptz default now() not null
);
create index if not exists idx_inst_cert on public.instructor_certifications(instructor_id);

alter table public.instructor_certifications enable row level security;

-- 본인 것만 추가/삭제/조회 (+ 원장은 조회 가능)
drop policy if exists "자격증 조회" on public.instructor_certifications;
create policy "자격증 조회" on public.instructor_certifications for select to authenticated
  using (instructor_id = auth.uid() or public.is_director());
drop policy if exists "자격증 입력" on public.instructor_certifications;
create policy "자격증 입력" on public.instructor_certifications for insert to authenticated
  with check (instructor_id = auth.uid());
drop policy if exists "자격증 삭제" on public.instructor_certifications;
create policy "자격증 삭제" on public.instructor_certifications for delete to authenticated
  using (instructor_id = auth.uid());
