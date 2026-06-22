-- 024_v2_session_makeup_rls.sql — 보강(미배정 세션) 추가·가져가기·취소를 위한 RLS 보강
-- 적용: Supabase SQL Editor. 010~023 이후.
-- 배경: sessions 에 DELETE 정책이 없어 보강 취소(removeMakeup)가 조용히 차단되고,
--       insert/update 정책이 instructor_id 본인만 허용해 미배정(null) 보강 추가·가져가기가 막힘.

-- 1) 삭제 정책 신설 — 보강 취소
drop policy if exists "수업 삭제" on public.sessions;
create policy "수업 삭제" on public.sessions for delete to authenticated using (
  public.is_director()
  or instructor_id = auth.uid()
  or instructor_id is null
  or exists (select 1 from public.students s where s.id = student_id and s.instructor_id = auth.uid()));

-- 2) 입력 정책 재생성 — 미배정(null) 보강 추가 허용
drop policy if exists "수업 입력" on public.sessions;
create policy "수업 입력" on public.sessions for insert to authenticated with check (
  public.is_director() or instructor_id = auth.uid() or instructor_id is null);

-- 3) 수정 정책 재생성 — 미배정 보강 가져가기(null → 본인)
drop policy if exists "수업 수정" on public.sessions;
create policy "수업 수정" on public.sessions for update to authenticated using (
  public.is_director() or instructor_id = auth.uid() or instructor_id is null);
