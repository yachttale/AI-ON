-- 036_v2_drop_legacy_owner_policies.sql — 구 분산 소유권 정책 제거
-- 적용: Supabase SQL Editor. 035 이후. (035 의 v2 정책 검증 통과가 전제)
--
-- 배경:
--   035 의 v2 정책(is_owner 기반)이 검증되었으므로, 011/025/027/029/030 이 만든
--   구 정책(4중 OR 복붙)을 제거한다. 이후 유효 권한 = is_owner 단독.
--
-- 주의:
--   이 단계에서 처음으로 is_owner 가 단독 기준이 된다. 함수에 버그가 있으면
--   권한 축소/확대가 실제로 발생하므로, 034 검증(mismatch=0)과 035 스모크 테스트가
--   반드시 선행되어야 한다.
--
-- 롤백 안전장치(실행 전 권장): 현재 정책 정의를 백업으로 떠둔다.
--   select policyname, cmd, qual, with_check from pg_policies
--   where schemaname='public' and tablename in ('skill_progress','measurements');
--   → 출력을 저장해두면 어느 단계에서도 정확히 복원 가능.
--   복원이 필요하면 025/027/029/030 의 CREATE POLICY 원문을 그대로 다시 적용하면 된다.

-- skill_progress 구 정책 (011/025/027/029/030)
drop policy if exists "진행 조회" on public.skill_progress;
drop policy if exists "진행 입력" on public.skill_progress;
drop policy if exists "진행 수정" on public.skill_progress;
drop policy if exists "진행 삭제" on public.skill_progress;

-- measurements 구 정책 (011/025/027/030)
drop policy if exists "측정 조회" on public.measurements;
drop policy if exists "측정 입력" on public.measurements;
drop policy if exists "측정 삭제" on public.measurements;

-- 검증(선택): 정책 개수 = skill_progress 4, measurements 3 만 남아야 한다.
-- select tablename, policyname, cmd from pg_policies
-- where schemaname='public' and tablename in ('skill_progress','measurements')
-- order by tablename, cmd;
--
-- 앱 핵심 플로우(오늘 입력, 진도 편집, 원장 대시보드 로드)를 수동 재확인한다.
