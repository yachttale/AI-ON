-- assign_student_to_me: 강사가 미배정 학생 자신에게 배정
create or replace function public.assign_student_to_me(p_student_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.students
  set instructor_id = auth.uid()
  where id = p_student_id;
end;
$$;

-- request_withdrawal: 강사가 퇴원 신청
create or replace function public.request_withdrawal(p_student_id uuid, p_note text default null)
returns void language plpgsql security definer as $$
begin
  update public.students
  set withdrawal_status = 'pending',
      withdrawal_requested_by = auth.uid(),
      withdrawal_note = p_note
  where id = p_student_id;
end;
$$;

-- cancel_withdrawal_request: 강사가 퇴원 신청 취소
create or replace function public.cancel_withdrawal_request(p_student_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.students
  set withdrawal_status = null,
      withdrawal_requested_by = null,
      withdrawal_note = null
  where id = p_student_id;
end;
$$;

-- approve_withdrawal: 원장이 퇴원 승인
create or replace function public.approve_withdrawal(p_student_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.students
  set is_active = false,
      withdrawal_status = 'approved'
  where id = p_student_id;
end;
$$;

-- reject_withdrawal: 원장이 퇴원 거절
create or replace function public.reject_withdrawal(p_student_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.students
  set withdrawal_status = null,
      withdrawal_requested_by = null,
      withdrawal_note = null
  where id = p_student_id;
end;
$$;

-- readmit_student: 원장이 학생 복귀 처리
create or replace function public.readmit_student(p_student_id uuid, p_instructor_id uuid default null)
returns void language plpgsql security definer as $$
begin
  update public.students
  set is_active = true,
      withdrawal_status = null,
      withdrawal_requested_by = null,
      withdrawal_note = null,
      instructor_id = coalesce(p_instructor_id, instructor_id)
  where id = p_student_id;
end;
$$;
