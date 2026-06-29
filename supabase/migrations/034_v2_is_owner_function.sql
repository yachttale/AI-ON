-- 034_v2_is_owner_function.sql — 소유권(유효 담당강사) 판정 단일화 함수
-- 적용: Supabase SQL Editor. 010~033 이후. (013/028 결손은 과거 이력이라 그대로 둠)
--
-- 배경:
--   동일한 '유효 담당강사' 4중 OR 규칙이 TS(assertOwns)와 RLS(011/025/027/029/030)에
--   각각 복붙되어 분산 관리되고 있었다. 규칙 변경 시 양쪽 동기화 실패 → 데이터 누수/기능 고장 위험.
--   → 4중 OR을 DB 함수 1개로 고정해 RLS와 앱이 같은 규칙을 공유하게 한다.
--
-- 판정 기준(canonical): ①원장 ②고정담당 ③요일배정(요일무관) ④오늘(KST) 보강 세션.
--
-- security definer 근거:
--   이 함수를 RLS 정책 안에서 호출하므로, invoker(기본)면 내부 select가 다시 그 테이블의
--   RLS를 타서 정책↔함수 무한 재귀 위험이 있다. definer면 내부 조회가 RLS를 우회해 차단.
--   기존 is_director() 가 이미 security definer 인 것과 동일한 선례. search_path 고정 필수.
-- stable 근거: 트랜잭션 스냅샷 내 결과 불변 → 플래너가 per-row 호출을 최적화할 여지.
--
-- 이 단계는 함수만 추가하며 정책을 바꾸지 않는다 → 동작 무변화(안전).

create or replace function public.is_owner(p_student_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.is_director()                                            -- ① 원장
    or exists (                                                     -- ② 고정 담당
      select 1 from public.students s
      where s.id = p_student_id and s.instructor_id = auth.uid()
    )
    or exists (                                                     -- ③ 요일 배정(요일 무관)
      select 1 from public.student_day_instructors sdi
      where sdi.student_id = p_student_id and sdi.instructor_id = auth.uid()
    )
    or exists (                                                     -- ④ 오늘(KST) 보강 세션
      select 1 from public.sessions se
      where se.student_id = p_student_id
        and se.instructor_id = auth.uid()
        and se.session_date = (now() at time zone 'Asia/Seoul')::date
    );
$$;

grant execute on function public.is_owner(uuid) to authenticated;

-- 검증(선택): 특정 강사 JWT를 시뮬레이션해 is_owner 결과가 legacy 4중 OR과 동치인지 확인.
-- mismatch_count = 0 이어야 안전하게 035로 진행 가능.
--
-- begin;
-- select set_config('request.jwt.claims',
--   json_build_object('sub','<INSTRUCTOR_UUID>','role','authenticated')::text, true);
-- with me as (select '<INSTRUCTOR_UUID>'::uuid as uid)
-- select count(*) filter (where
--   public.is_owner(s.id) is distinct from (
--     exists(select 1 from profiles p where p.id=(select uid from me) and p.role='director')
--     or s.instructor_id=(select uid from me)
--     or exists(select 1 from student_day_instructors sdi where sdi.student_id=s.id and sdi.instructor_id=(select uid from me))
--     or exists(select 1 from sessions se where se.student_id=s.id and se.instructor_id=(select uid from me)
--                and se.session_date=(now() at time zone 'Asia/Seoul')::date)
--   )) as mismatch_count
-- from students s;
-- rollback;
