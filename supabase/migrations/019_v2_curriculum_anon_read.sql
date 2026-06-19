-- 017_v2_curriculum_anon_read.sql — 커리큘럼 참조 데이터 anon 읽기 허용
-- (lib/v2/data.ts의 unstable_cache가 쿠키 없는 anon 클라이언트로 커리큘럼을 캐싱하기 때문)
-- 대상 테이블: curriculum_versions, strokes, skill_tracks, skill_steps
-- (모두 비민감 참조 데이터, PII 없음)

drop policy if exists "커리큘럼버전 공개조회" on public.curriculum_versions;
create policy "커리큘럼버전 공개조회" on public.curriculum_versions for select to anon using (true);
drop policy if exists "영법 공개조회" on public.strokes;
create policy "영법 공개조회" on public.strokes for select to anon using (true);
drop policy if exists "트랙 공개조회" on public.skill_tracks;
create policy "트랙 공개조회" on public.skill_tracks for select to anon using (true);
drop policy if exists "단계 공개조회" on public.skill_steps;
create policy "단계 공개조회" on public.skill_steps for select to anon using (true);

grant select on public.curriculum_versions, public.strokes, public.skill_tracks, public.skill_steps to anon;
