-- 029_v2_skill_progress_update_policy.sql — skill_progress UPDATE 정책 추가
-- 적용: Supabase SQL Editor. 010~028 이후.
--
-- 배경(에러):
--   진도 통과는 upsert(INSERT ... ON CONFLICT)로 저장하는데, skill_progress 에는
--   INSERT/DELETE/SELECT 정책만 있고 UPDATE 정책이 없었다.
--   upsert 가 충돌 처리에서 UPDATE 권한을 요구하면서, 권한이 있는 강사조차
--   'new row violates row-level security policy' 로 거부됐다.
--   (일반 INSERT·마스터 바퀴 기록은 되는데 진도 통과만 막히던 이유)
--
-- 해결:
--   INSERT 정책과 동일한 조건으로 UPDATE 정책 신설(원장·고정담당·요일배정·오늘 보강).

drop policy if exists "진행 수정" on public.skill_progress;
create policy "진행 수정" on public.skill_progress for update to authenticated
using (
  public.is_director()
  or exists (select 1 from public.students s where s.id = skill_progress.student_id and s.instructor_id = auth.uid())
  or exists (select 1 from public.student_day_instructors sdi where sdi.student_id = skill_progress.student_id and sdi.instructor_id = auth.uid())
  or exists (select 1 from public.sessions se where se.student_id = skill_progress.student_id
       and se.instructor_id = auth.uid() and se.session_date = (now() at time zone 'Asia/Seoul')::date))
with check (
  public.is_director()
  or exists (select 1 from public.students s where s.id = skill_progress.student_id and s.instructor_id = auth.uid())
  or exists (select 1 from public.student_day_instructors sdi where sdi.student_id = skill_progress.student_id and sdi.instructor_id = auth.uid())
  or exists (select 1 from public.sessions se where se.student_id = skill_progress.student_id
       and se.instructor_id = auth.uid() and se.session_date = (now() at time zone 'Asia/Seoul')::date));
