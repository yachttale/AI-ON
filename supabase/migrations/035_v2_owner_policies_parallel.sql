-- 035_v2_owner_policies_parallel.sql — is_owner 기반 RLS 정책 병행 추가
-- 적용: Supabase SQL Editor. 034 이후. (반드시 034 함수가 먼저 존재해야 함)
--
-- 배경:
--   034 가 추가한 is_owner() 를 쓰는 새 정책을 'v2' 이름으로 신설한다.
--   기존 구 정책(011/025/027/029/030 의 한글 이름)은 아직 남겨둔다.
--
-- 안전성(핵심):
--   PostgreSQL 의 다중 permissive 정책은 OR 로 결합된다.
--   is_owner ≡ 기존 4중 OR 이므로 유효 권한 = (구 ∪ is_owner) = is_owner.
--   → 이 단계에서 권한이 넓어지지도 좁아지지도 않는다(동작 무변화).
--   구 정책 제거는 검증 후 036 에서 수행한다.

-- skill_progress --------------------------------------------------------------
create policy "진행 조회 v2" on public.skill_progress
  for select to authenticated using (public.is_owner(student_id));
create policy "진행 입력 v2" on public.skill_progress
  for insert to authenticated with check (public.is_owner(student_id));
create policy "진행 수정 v2" on public.skill_progress
  for update to authenticated using (public.is_owner(student_id))
                              with check (public.is_owner(student_id));
create policy "진행 삭제 v2" on public.skill_progress
  for delete to authenticated using (public.is_owner(student_id));

-- measurements ----------------------------------------------------------------
-- (앱은 measurements 를 UPDATE 하지 않고 delete+insert 만 함 → UPDATE 정책 신설 안 함)
create policy "측정 조회 v2" on public.measurements
  for select to authenticated using (public.is_owner(student_id));
create policy "측정 입력 v2" on public.measurements
  for insert to authenticated with check (public.is_owner(student_id));
create policy "측정 삭제 v2" on public.measurements
  for delete to authenticated using (public.is_owner(student_id));

-- 검증(선택): 정책 개수 확인 — skill_progress 8개(구4+신4), measurements 6개(구3+신3).
-- select tablename, policyname, cmd from pg_policies
-- where schemaname='public' and tablename in ('skill_progress','measurements')
-- order by tablename, cmd;
--
-- 추가로 실제 앱에서 (a)고정담당 통과 (b)요일배정 강사 통과 (c)오늘 보강 claim 후 통과
-- (d)비담당 강사 차단 을 스모크 테스트한 뒤 036 으로 진행한다.
