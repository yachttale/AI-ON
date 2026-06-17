-- 015_v2_single.sql — step_kind에 'single' 추가 + 초보 구르기류를 개별 통과로 전환
-- 기존 DB 패치용. (새 프로젝트는 010/012에 이미 반영됨)
-- single = 개별 통과(cascade 없음). 구르기류는 서로 독립 스킬.
alter table public.skill_steps drop constraint if exists skill_steps_step_kind_check;
alter table public.skill_steps add constraint skill_steps_step_kind_check
  check (step_kind in ('ladder','counter','repeatable','single'));

update public.skill_steps s set step_kind = 'single'
from public.strokes st
where s.stroke_id = st.id and st.key = 'beginner'
  and s.label in ('앞구르기','옆구르기','뒷구르기','물구나무 서기','물대포');
