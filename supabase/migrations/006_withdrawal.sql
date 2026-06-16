-- 퇴원 워크플로우: students 테이블에 컬럼 추가
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS withdrawal_status text
    CHECK (withdrawal_status IN ('pending', 'approved')),
  ADD COLUMN IF NOT EXISTS withdrawal_requested_by uuid
    REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS withdrawal_note text;

-- 강사: 자기 담당 학생 퇴원 신청
CREATE OR REPLACE FUNCTION request_withdrawal(p_student_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.students
  SET withdrawal_status = 'pending',
      withdrawal_requested_by = auth.uid(),
      withdrawal_note = p_note
  WHERE id = p_student_id
    AND instructor_id = auth.uid()
    AND is_active = true
    AND withdrawal_status IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION '권한이 없거나 이미 퇴원 신청된 학생입니다.';
  END IF;
END;
$$;

-- 강사: 자신이 신청한 퇴원 취소
CREATE OR REPLACE FUNCTION cancel_withdrawal_request(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.students
  SET withdrawal_status = NULL,
      withdrawal_requested_by = NULL,
      withdrawal_note = NULL
  WHERE id = p_student_id
    AND withdrawal_requested_by = auth.uid()
    AND withdrawal_status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION '취소할 수 없는 신청입니다.';
  END IF;
END;
$$;

-- 원장: 퇴원 신청 승인 (is_active=false, 데이터 보존)
CREATE OR REPLACE FUNCTION approve_withdrawal(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role != 'director' THEN
    RAISE EXCEPTION '원장만 승인할 수 있습니다.';
  END IF;

  UPDATE public.students
  SET withdrawal_status = 'approved',
      is_active = false
  WHERE id = p_student_id
    AND withdrawal_status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION '퇴원 신청 상태가 아닙니다.';
  END IF;
END;
$$;

-- 원장: 퇴원 신청 거절
CREATE OR REPLACE FUNCTION reject_withdrawal(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role != 'director' THEN
    RAISE EXCEPTION '원장만 처리할 수 있습니다.';
  END IF;

  UPDATE public.students
  SET withdrawal_status = NULL,
      withdrawal_requested_by = NULL,
      withdrawal_note = NULL
  WHERE id = p_student_id
    AND withdrawal_status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION '퇴원 신청 상태가 아닙니다.';
  END IF;
END;
$$;

-- 원장: 퇴원 학생 복귀 (기존 데이터 연결, 강사 재배정 가능)
CREATE OR REPLACE FUNCTION readmit_student(p_student_id uuid, p_instructor_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role != 'director' THEN
    RAISE EXCEPTION '원장만 복귀 처리할 수 있습니다.';
  END IF;

  UPDATE public.students
  SET is_active = true,
      withdrawal_status = NULL,
      withdrawal_requested_by = NULL,
      withdrawal_note = NULL,
      instructor_id = COALESCE(p_instructor_id, instructor_id)
  WHERE id = p_student_id
    AND is_active = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION '이미 재원 중이거나 존재하지 않는 학생입니다.';
  END IF;
END;
$$;

-- 강사: 미배정 신규 학생을 자기 반으로 배정
CREATE OR REPLACE FUNCTION assign_student_to_me(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role != 'instructor' THEN
    RAISE EXCEPTION '강사만 배정할 수 있습니다.';
  END IF;

  UPDATE public.students
  SET instructor_id = auth.uid()
  WHERE id = p_student_id
    AND instructor_id IS NULL
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION '이미 배정된 학생이거나 존재하지 않는 학생입니다.';
  END IF;
END;
$$;
