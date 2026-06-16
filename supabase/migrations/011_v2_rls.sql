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
