-- 016_v2_confirm_workflow.sql — 아이 입력(임시) → 강사 확인(확정) 워크플로우
alter table public.sessions
  add column input_source text not null default 'instructor'
    check (input_source in ('child','instructor')),
  add column status text not null default 'confirmed'
    check (status in ('pending','confirmed')),
  add column confirmed_by uuid references public.profiles(id),
  add column confirmed_at timestamptz,
  add column reported_step_id uuid references public.skill_steps(id);

-- 기존 강사 입력 세션은 확정으로 간주(default가 처리). 아이 입력만 pending으로 생성.
create index idx_sessions_status on public.sessions(status, session_date);
comment on column public.sessions.reported_step_id is '아이가 패드에서 "했어요" 한 단계(보고용, 통과 아님)';
