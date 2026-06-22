-- 023_v2_session_instructor_nullable.sql — 보강 '미배정' 지원
-- 목적: 오늘 보강을 미배정(instructor_id=null)으로 추가하고, 실제 수업 강사가
--       '내 반으로 가져가기'로 담당을 지정하는 흐름을 위해 not null 제약 해제.
-- 적용: Supabase SQL Editor. 010~022 이후.
-- 영향: 기존 insert는 항상 강사 id를 넣으므로 무영향. 보강만 null 허용.

alter table public.sessions alter column instructor_id drop not null;
