-- 027_v2_progress_measure_assigned_rls.sql — 담당 강사(요일 무관)도 진도/측정 기록 가능
-- 적용: Supabase SQL Editor. 010~026 이후. (025를 포함·확장하므로 025만 적용했어도 이 파일로 덮어쓰면 됨)
--
-- 배경(에러):
--   강사가 담당하는 학생이라도 '오늘이 그 학생 수업 요일'이 아니면 진도 통과 시
--   앱 assertOwns 가 Forbidden 을 던지고, RLS 도 거부했다.
--   (025 는 '오늘 본인 세션'에만 의존 → 비수업일 진도 편집/보정이 막힘)
--
-- 해결:
--   student_day_instructors 에 이 강사-학생 배정이 하나라도 있으면(요일 무관) 허용.
--   assertOwns 도 동일 기준으로 수정됨 → 앱과 DB 권한이 완전히 일치한다.
--   판정 기준: ①원장 ②고정담당 ③요일배정(요일무관) ④오늘 보강 세션.

-- skill_progress --------------------------------------------------------------
drop policy if exists "진행 입력" on public.skill_progress;
create policy "진행 입력" on public.skill_progress for insert to authenticated with check (
  public.is_director()
  or exists (select 1 from public.students s where s.id = skill_progress.student_id and s.instructor_id = auth.uid())
  or exists (select 1 from public.student_day_instructors sdi where sdi.student_id = skill_progress.student_id and sdi.instructor_id = auth.uid())
  or exists (select 1 from public.sessions se where se.student_id = skill_progress.student_id
       and se.instructor_id = auth.uid() and se.session_date = (now() at time zone 'Asia/Seoul')::date));

drop policy if exists "진행 삭제" on public.skill_progress;
create policy "진행 삭제" on public.skill_progress for delete to authenticated using (
  public.is_director()
  or exists (select 1 from public.students s where s.id = skill_progress.student_id and s.instructor_id = auth.uid())
  or exists (select 1 from public.student_day_instructors sdi where sdi.student_id = skill_progress.student_id and sdi.instructor_id = auth.uid())
  or exists (select 1 from public.sessions se where se.student_id = skill_progress.student_id
       and se.instructor_id = auth.uid() and se.session_date = (now() at time zone 'Asia/Seoul')::date));

-- measurements ----------------------------------------------------------------
drop policy if exists "측정 입력" on public.measurements;
create policy "측정 입력" on public.measurements for insert to authenticated with check (
  public.is_director()
  or exists (select 1 from public.students s where s.id = measurements.student_id and s.instructor_id = auth.uid())
  or exists (select 1 from public.student_day_instructors sdi where sdi.student_id = measurements.student_id and sdi.instructor_id = auth.uid())
  or exists (select 1 from public.sessions se where se.student_id = measurements.student_id
       and se.instructor_id = auth.uid() and se.session_date = (now() at time zone 'Asia/Seoul')::date));

drop policy if exists "측정 삭제" on public.measurements;
create policy "측정 삭제" on public.measurements for delete to authenticated using (
  public.is_director()
  or exists (select 1 from public.students s where s.id = measurements.student_id and s.instructor_id = auth.uid())
  or exists (select 1 from public.student_day_instructors sdi where sdi.student_id = measurements.student_id and sdi.instructor_id = auth.uid())
  or exists (select 1 from public.sessions se where se.student_id = measurements.student_id
       and se.instructor_id = auth.uid() and se.session_date = (now() at time zone 'Asia/Seoul')::date));
