-- 025_v2_progress_measure_makeup_rls.sql — 요일배정·보강 강사도 진도/측정 기록 가능하도록 RLS 보강
-- 적용: Supabase SQL Editor. 010~024 이후.
--
-- 배경:
--   앱의 assertOwns 는 ①원장 ②고정담당 ③오늘 요일배정 ④오늘 보강 강사를 허용하나,
--   skill_progress·measurements 의 INSERT/DELETE 정책은 ①원장 ②고정담당만 허용했다.
--   → 고정담당이 아닌(요일배정/보강) 강사가 진도 "통과"를 누르면 앱은 통과시키지만
--     DB RLS 가 INSERT 를 거부 → 서버 액션이 throw → "This page couldn't load" 에러.
--   (어제 024 는 sessions 만 넓히고 skill_progress·measurements 는 빠뜨림)
--
-- 해결:
--   "오늘(KST) 본인이 강사인 세션이 있는 학생"이면 허용 — 요일배정·보강을 모두 포함.
--   통과/기록 액션은 ensureSession 이 세션을 먼저 만들므로 항상 이 조건으로 귀결된다.

-- skill_progress --------------------------------------------------------------
drop policy if exists "진행 입력" on public.skill_progress;
create policy "진행 입력" on public.skill_progress for insert to authenticated with check (
  public.is_director()
  or exists (select 1 from public.students s where s.id = skill_progress.student_id and s.instructor_id = auth.uid())
  or exists (select 1 from public.sessions se where se.student_id = skill_progress.student_id
       and se.instructor_id = auth.uid()
       and se.session_date = (now() at time zone 'Asia/Seoul')::date));

drop policy if exists "진행 삭제" on public.skill_progress;
create policy "진행 삭제" on public.skill_progress for delete to authenticated using (
  public.is_director()
  or exists (select 1 from public.students s where s.id = skill_progress.student_id and s.instructor_id = auth.uid())
  or exists (select 1 from public.sessions se where se.student_id = skill_progress.student_id
       and se.instructor_id = auth.uid()
       and se.session_date = (now() at time zone 'Asia/Seoul')::date));

-- measurements ----------------------------------------------------------------
drop policy if exists "측정 입력" on public.measurements;
create policy "측정 입력" on public.measurements for insert to authenticated with check (
  public.is_director()
  or exists (select 1 from public.students s where s.id = measurements.student_id and s.instructor_id = auth.uid())
  or exists (select 1 from public.sessions se where se.student_id = measurements.student_id
       and se.instructor_id = auth.uid()
       and se.session_date = (now() at time zone 'Asia/Seoul')::date));

drop policy if exists "측정 삭제" on public.measurements;
create policy "측정 삭제" on public.measurements for delete to authenticated using (
  public.is_director()
  or exists (select 1 from public.students s where s.id = measurements.student_id and s.instructor_id = auth.uid())
  or exists (select 1 from public.sessions se where se.student_id = measurements.student_id
       and se.instructor_id = auth.uid()
       and se.session_date = (now() at time zone 'Asia/Seoul')::date));
