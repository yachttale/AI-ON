-- 017_v2_assign_manage.sql — 미배정 처리(요일배정 삭제) + 퇴원 처리 권한
-- 적용: Supabase SQL Editor.

-- 요일배정 삭제(미배정으로 되돌리기): 원장 또는 본인 배정
drop policy if exists "요일배정 삭제" on public.student_day_instructors;
create policy "요일배정 삭제" on public.student_day_instructors for delete to authenticated
  using (public.is_director() or instructor_id = auth.uid());

-- 학생 수정 권한 확대: 요일배정만 된 담당 강사도 본인 학생 수정 가능(퇴원·미배정 처리).
-- (기존 정책: 원장 또는 고정 담당만 → 요일배정 강사 추가)
drop policy if exists "학생 수정" on public.students;
create policy "학생 수정" on public.students for update to authenticated using (
  public.is_director()
  or instructor_id = auth.uid()
  or exists (select 1 from public.student_day_instructors sdi
             where sdi.student_id = students.id and sdi.instructor_id = auth.uid())
);
