-- 031_v2_object_pickup_single.sql — '물건 줍기'를 진도 무관 체크 항목으로 전환
-- 적용: Supabase SQL Editor. 010~030 이후.
--
-- 배경: '물건 줍기'(beginner.water.9)는 초보 사다리의 ladder 단계라 통과해야 다음 진도로
--   넘어갔다. 이를 구르기·물대포와 같은 single(체크/해제) 항목으로 바꿔 진도 사다리에는
--   영향을 주지 않게 하되, 체크 시 통과 기록(skill_progress)은 그대로 남도록 한다.
-- 기존에 통과 처리된 학생 기록은 유지된다(체크된 상태로 표시).

update public.skill_steps
set step_kind = 'single'
where key = 'beginner.water.9'
  and curriculum_version_id = (select id from public.curriculum_versions where status = 'active');
