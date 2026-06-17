-- 014_v2_assign.sql — 강사 반배정 이동 RPC
-- 요일별로 다른 강사가 그날 학생을 자기 반으로 가져와 수업하는 흐름 지원.
-- RLS상 강사는 자기 반 학생만 update 가능 → SECURITY DEFINER로 우회하되, 항상 호출자(auth.uid())로만 배정.
create or replace function public.assign_student_to_me(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.students set instructor_id = auth.uid() where id = p_student_id;
end;
$$;

grant execute on function public.assign_student_to_me(uuid) to authenticated;
