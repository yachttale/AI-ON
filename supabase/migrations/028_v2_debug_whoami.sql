-- 028_v2_debug_whoami.sql — 진단용: 현재 요청의 auth.uid() 를 그대로 반환
-- 적용: Supabase SQL Editor. (진단이 끝나면 제거해도 무방)
-- 목적: 앱이 진도 통과 시 DB에 실제로 전달하는 auth.uid() 값을 확인하기 위함.
--   RLS 거부 원인이 '토큰 미전달(null)'인지 'id 불일치'인지 가른다.

create or replace function public.debug_whoami()
returns text language sql stable
as $$ select coalesce(auth.uid()::text, 'NULL') $$;

grant execute on function public.debug_whoami() to authenticated, anon;
