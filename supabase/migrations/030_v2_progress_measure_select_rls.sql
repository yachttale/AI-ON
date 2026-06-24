-- 030_v2_progress_measure_select_rls.sql — 진도/측정 조회(SELECT)도 요일배정·보강 강사 포함
-- 적용: Supabase SQL Editor. 010~029 이후.
--
-- 배경(에러):
--   027/029 가 skill_progress·measurements 의 INSERT/UPDATE/DELETE 만 넓히고
--   SELECT(조회) 정책은 원장·고정담당만 유지했다.
--   → 요일배정 강사는 담당 학생의 진도/기록을 '읽지' 못해:
--     ① 진도 통과 시 '이미 통과한 단계' 조회가 빈 결과 → 중복 INSERT(duplicate key)
--     ② 화면에서 진도/기록이 비어 보임
--
-- 해결: 조회도 쓰기와 동일 기준(원장·고정담당·요일배정·오늘 보강)으로 넓힘.

drop policy if exists "진행 조회" on public.skill_progress;
create policy "진행 조회" on public.skill_progress for select to authenticated using (
  public.is_director()
  or exists (select 1 from public.students s where s.id = skill_progress.student_id and s.instructor_id = auth.uid())
  or exists (select 1 from public.student_day_instructors sdi where sdi.student_id = skill_progress.student_id and sdi.instructor_id = auth.uid())
  or exists (select 1 from public.sessions se where se.student_id = skill_progress.student_id
       and se.instructor_id = auth.uid() and se.session_date = (now() at time zone 'Asia/Seoul')::date));

drop policy if exists "측정 조회" on public.measurements;
create policy "측정 조회" on public.measurements for select to authenticated using (
  public.is_director()
  or exists (select 1 from public.students s where s.id = measurements.student_id and s.instructor_id = auth.uid())
  or exists (select 1 from public.student_day_instructors sdi where sdi.student_id = measurements.student_id and sdi.instructor_id = auth.uid())
  or exists (select 1 from public.sessions se where se.student_id = measurements.student_id
       and se.instructor_id = auth.uid() and se.session_date = (now() at time zone 'Asia/Seoul')::date));
