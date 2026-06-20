-- 022_v2_student_stroke_mv.sql — 학생 현재 영법 Materialized View (원장 대시보드 집계 가속)
-- 목적: 시간표 등 원장 화면이 매번 skill_progress 전체를 메모리로 끌어오지 않도록,
--       '학생별 현재 영법'을 미리 계산해 둠. 쓰기 경로(강사 입력)에는 전혀 손대지 않음.
--       대시보드는 약간의 지연(새로고침 주기)을 허용 — 피드백에 쓰는 원본 기록은 실시간 그대로.
-- 적용: Supabase SQL Editor. 010~021 이후.
-- 주의: lib/v2/analytics-data.ts 의 getWeeklyTimetable 은 이 MV가 없어도 자동 폴백하므로,
--       이 SQL을 나중에 적용해도 앱은 정상 동작함(적용 후 가속).

-- 현재 영법 = computeCurrentStrokeKey 와 동일 규칙:
--   관측(observed) 통과가 하나도 없으면 null,
--   '기타(etc) 제외' ladder 단계 중 첫 미통과 단계의 영법,
--   모두 통과했으면 'master'.
create materialized view if not exists public.mv_student_current_stroke as
with active_ver as (
  select id from public.curriculum_versions where status = 'active' limit 1
),
ladder as (
  select s.id as step_id, st.key as stroke_key, s.ladder_order
  from public.skill_steps s
  join public.strokes st on st.id = s.stroke_id
  cross join active_ver v
  where s.curriculum_version_id = v.id
    and s.is_active and s.step_kind = 'ladder' and st.key <> 'etc'
),
passed as (
  select distinct student_id, skill_step_id
  from public.skill_progress
  where source = 'observed'
),
agg as (
  select stu.id as student_id,
    exists (select 1 from passed p where p.student_id = stu.id) as has_any,
    (select l.stroke_key from ladder l
       where not exists (
         select 1 from passed p where p.student_id = stu.id and p.skill_step_id = l.step_id)
       order by l.ladder_order asc limit 1) as first_unpassed_stroke
  from public.students stu
  where stu.is_active
)
select student_id,
  case when not has_any then null
       when first_unpassed_stroke is null then 'master'
       else first_unpassed_stroke end as current_stroke_key
from agg;

-- concurrently refresh 가능하도록 unique 인덱스 필수
create unique index if not exists idx_mv_student_current_stroke
  on public.mv_student_current_stroke(student_id);

grant select on public.mv_student_current_stroke to authenticated;

-- 수동/주기 새로고침 함수 (쓰기 트리거 아님 — 강사 입력 지연 없음)
create or replace function public.refresh_student_stroke_mv()
returns void language plpgsql security definer set search_path = public as $$
begin
  refresh materialized view concurrently public.mv_student_current_stroke;
exception when others then
  -- 첫 생성 직후 등 concurrently 불가 시 일반 refresh
  refresh materialized view public.mv_student_current_stroke;
end;
$$;
grant execute on function public.refresh_student_stroke_mv() to authenticated;

-- 자동 새로고침: pg_cron 이 설치돼 있으면 10분마다(없으면 무시).
-- pg_cron 미사용 시: 수동으로 select public.refresh_student_stroke_mv(); 호출하거나
-- Supabase 대시보드 → Database → Cron 에서 동일 주기로 등록.
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'refresh-student-stroke',
      '*/10 * * * *',
      'select public.refresh_student_stroke_mv();'
    );
  end if;
exception when others then
  null;
end
$do$;
