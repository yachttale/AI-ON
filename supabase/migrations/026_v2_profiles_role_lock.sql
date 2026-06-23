-- 026_v2_profiles_role_lock.sql — 권한 상승(Privilege Escalation) 차단
-- 적용: Supabase SQL Editor. 010~025 이후.
--
-- 배경(취약점):
--   profiles 의 UPDATE 정책은 본인 행(auth.uid() = id)을 허용하나 컬럼 제한이 없어,
--   강사(instructor) 계정이 자기 행의 role 을 'director' 로 바꾸면 원장 권한을 탈취할 수 있었다.
--   is_director() 가 profiles.role 을 보므로, 승격 즉시 모든 학생/측정/진도 정책을 통과한다.
--   앱에는 role 변경 기능이 없지만, anon 키 + 로그인 토큰만으로 API 직접 호출 시 가능했다.
--
-- 해결:
--   컬럼 단위 권한으로 authenticated 사용자는 본인의 name 만 수정 가능하게 제한.
--   role/id 변경은 권한 자체를 회수 → RLS 통과 여부와 무관하게 차단된다.
--   (원장 지정은 운영자가 service_role 로만 수행 — 앱 기능 영향 없음)

revoke update on public.profiles from authenticated;
grant update (name) on public.profiles to authenticated;
