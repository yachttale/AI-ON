-- 037_v2_clean_analysis_views.sql — 분석 전용 정제 뷰 (baseline 편향·laps 다형성 정리)
-- 적용: Supabase SQL Editor. 010~036 이후. (034~036 is_owner 적용 후가 이상적 — 강사 격리 전제)
--
-- 배경:
--   AI/분석이 바로 신뢰하고 쓸 수 있도록 두 왜곡원을 뷰 레이어에서 정리한다.
--   ① baseline 편향: source='baseline' 통과는 등록 시 일괄 입력돼 passed_at 이 몰림 →
--      시계열 지표(직전 통과 후 경과일 등)가 체계적으로 왜곡. 분석 함수마다 수동 배제 중.
--   ② measurements laps 다형성: (a) skill_step_id=null 당일 총 바퀴수(1행, value=총량)
--      vs (b) 마스터 단계 바퀴수(value=1 × N행). 모르면 거리 2배 오류.
--
-- 보안(핵심): 두 뷰 모두 일반 VIEW + security_invoker=on.
--   MV 는 RLS 를 우회(소유자 권한 스냅샷)해 모든 강사가 전체 학생 진도를 열람하게 됨 → 금지.
--   security_invoker=on 이면 호출자 권한으로 실행 → 하부 테이블의 is_owner RLS 그대로 적용
--   → 강사=본인 담당만, 원장=전체 자동 보존.
--
-- 순수 추가(기존 테이블/정책/앱 무변경). 롤백은 drop view/function 으로 데이터 손실 0.

-- 레인 길이 단일 출처 — 거리 환산의 유일한 상수. 풀 변경 시 여기만 수정.
create or replace function public.pool_lane_m()
returns numeric language sql immutable parallel safe as $$ select 50::numeric $$;
comment on function public.pool_lane_m() is '수영장 레인 길이(m). 거리 환산의 단일 출처. 풀 변경 시 여기만 수정.';

-- v_clean_progress — 신뢰 가능한 통과 시계열 ----------------------------------
-- 완성도/현재위치 분석은 전체 행, 속도/경과일 분석은 is_baseline=false 필터.
-- baseline 행의 날짜 파생값(days_since_prev_observed)은 NULL(일괄 입력이라 비신뢰).
create or replace view public.v_clean_progress
with (security_invoker = on) as
with observed_seq as (
  -- baseline 제외한 '신뢰 가능한 통과'만으로 학생별 시계열 순서 구성
  select
    sp.id,
    lag(sp.passed_at) over w as prev_observed_passed_at,
    row_number()      over w as observed_pass_seq
  from public.skill_progress sp
  where sp.source = 'observed'
  window w as (partition by sp.student_id
               order by sp.passed_at, sp.ladder_order_snapshot, sp.created_at)
)
select
  sp.id,
  sp.student_id,
  sp.skill_step_id,
  -- 영법/트랙 메타 (현재 커리큘럼 기준, 없으면 스냅샷 폴백)
  st.key   as stroke_key,
  st.label as stroke_label,
  tr.key   as track_key,
  ks.step_kind,
  coalesce(ks.key,   sp.step_key_snapshot)            as step_key,
  coalesce(ks.label, sp.step_key_snapshot)            as step_label,
  coalesce(ks.ladder_order, sp.ladder_order_snapshot) as ladder_order,
  ks.is_first_completion,
  -- 통과 사실
  sp.passed_at,
  sp.instructor_id,
  sp.source_session_id,
  sp.difficulty,
  -- 신뢰 플래그
  (sp.source = 'baseline') as is_baseline,
  (sp.source = 'observed') as date_is_trustworthy,
  -- 시계열 파생: observed 행에만 값, baseline 은 NULL
  os.observed_pass_seq,
  os.prev_observed_passed_at,
  case when sp.source = 'observed'
       then (sp.passed_at - os.prev_observed_passed_at)
       else null end as days_since_prev_observed
from public.skill_progress sp
left join observed_seq os on os.id = sp.id
left join public.skill_steps  ks on ks.id = sp.skill_step_id
left join public.strokes      st on st.id = ks.stroke_id
left join public.skill_tracks tr on tr.id = ks.track_id;

comment on view public.v_clean_progress is
  '분석 전용. 완성도 분석은 전체 행, 속도/경과일 분석은 is_baseline=false 필터. baseline 행의 날짜 파생값은 NULL(등록 시 일괄 입력이라 비신뢰).';

-- v_clean_laps — laps 다형성 정리 + 거리 환산 고정 -----------------------------
-- lap_scope 로 당일총량(daily_total, skill_step_id=null)과 단계귀속(step) 분리.
-- 둘을 합산하면 이중계산 — 총거리는 daily_total 만 합산할 것.
create or replace view public.v_clean_laps
with (security_invoker = on) as
select
  m.student_id,
  m.measured_on,
  case when m.skill_step_id is null then 'daily_total' else 'step' end as lap_scope,
  m.skill_step_id,
  st.key   as stroke_key,
  tr.key   as track_key,
  ks.label as step_label,
  sum(m.value) as laps,                 -- 두 경로 공통: 당일총량=value, 단계=COUNT(=SUM value=1)
  (tr.key = 'im') as is_im,             -- IM 은 거리 환산 제외(도메인 규칙)
  case when tr.key = 'im' then null
       else sum(m.value) * public.pool_lane_m() end as distance_m
from public.measurements m
left join public.skill_steps  ks on ks.id = m.skill_step_id
left join public.strokes      st on st.id = ks.stroke_id
left join public.skill_tracks tr on tr.id = ks.track_id
where m.metric_type = 'laps'
group by m.student_id, m.measured_on, m.skill_step_id, st.key, tr.key, ks.label;

comment on view public.v_clean_laps is
  '분석 전용. lap_scope 로 당일총량(daily_total, skill_step_id=null)과 단계귀속(step) 분리 — 둘을 합산하면 이중계산. 거리=laps*pool_lane_m(), IM 제외.';

grant select on public.v_clean_progress, public.v_clean_laps to authenticated;

-- 검증(강사 시뮬레이션 — 본인 담당 학생만 보이는지):
-- begin;
-- select set_config('request.jwt.claims',
--   json_build_object('sub','<INSTRUCTOR_UUID>','role','authenticated')::text, true);
-- set local role authenticated;
-- select count(distinct student_id) from public.v_clean_progress;  -- 담당 학생 수와 일치해야
-- rollback;
--
-- 롤백:
--   drop view if exists public.v_clean_laps;
--   drop view if exists public.v_clean_progress;
--   drop function if exists public.pool_lane_m();
