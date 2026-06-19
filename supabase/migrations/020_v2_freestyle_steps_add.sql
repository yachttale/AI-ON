-- 자유형 kb_helper: 음파 발차기 시리즈 4단계 추가
-- 발차기 25m(order 20) 뒤, 팔돌리기(기존 order 21) 앞에 삽입
-- 기존 order >= 21 단계를 +4 시프트하여 자리 확보

update skill_steps
set ladder_order = ladder_order + 4
where track_id = (
  select id from skill_tracks
  where key = 'kb_helper'
    and stroke_id = (select id from strokes where key = 'freestyle')
)
and ladder_order >= 21;

-- 음파 발차기 (order 21)
insert into skill_steps (curriculum_version_id, stroke_id, track_id, key, label, ladder_order, is_first_completion, measure_spec, step_kind)
select
  (select id from curriculum_versions where label = 'v1 - 2026 기본'),
  (select id from strokes where key = 'freestyle'),
  (select id from skill_tracks where key = 'kb_helper' and stroke_id = (select id from strokes where key = 'freestyle')),
  'freestyle.kb_helper.6a', '음파 발차기', 21, false, array[]::text[], 'ladder';

-- 음파 발차기 5m (order 22)
insert into skill_steps (curriculum_version_id, stroke_id, track_id, key, label, ladder_order, is_first_completion, measure_spec, step_kind)
select
  (select id from curriculum_versions where label = 'v1 - 2026 기본'),
  (select id from strokes where key = 'freestyle'),
  (select id from skill_tracks where key = 'kb_helper' and stroke_id = (select id from strokes where key = 'freestyle')),
  'freestyle.kb_helper.6b', '음파 발차기 5m', 22, false, array[]::text[], 'ladder';

-- 음파 발차기 15m (order 23)
insert into skill_steps (curriculum_version_id, stroke_id, track_id, key, label, ladder_order, is_first_completion, measure_spec, step_kind)
select
  (select id from curriculum_versions where label = 'v1 - 2026 기본'),
  (select id from strokes where key = 'freestyle'),
  (select id from skill_tracks where key = 'kb_helper' and stroke_id = (select id from strokes where key = 'freestyle')),
  'freestyle.kb_helper.6c', '음파 발차기 15m', 23, false, array[]::text[], 'ladder';

-- 음파 발차기 25m (order 24, 시간 측정)
insert into skill_steps (curriculum_version_id, stroke_id, track_id, key, label, ladder_order, is_first_completion, measure_spec, step_kind)
select
  (select id from curriculum_versions where label = 'v1 - 2026 기본'),
  (select id from strokes where key = 'freestyle'),
  (select id from skill_tracks where key = 'kb_helper' and stroke_id = (select id from strokes where key = 'freestyle')),
  'freestyle.kb_helper.6d', '음파 발차기 25m', 24, false, array['time_sec']::text[], 'ladder';
