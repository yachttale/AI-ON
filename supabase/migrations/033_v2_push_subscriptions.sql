-- 033_v2_push_subscriptions.sql — 웹푸시 구독 정보(어제 미입력 리마인더 알림)
-- 적용: Supabase SQL Editor. 010~032 이후.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now() not null
);
create index if not exists idx_push_sub_user on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- 본인 구독만 관리(추가/삭제/조회). 발송은 서버(service_role)가 RLS 우회로 전체 조회.
drop policy if exists "구독 조회" on public.push_subscriptions;
create policy "구독 조회" on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "구독 입력" on public.push_subscriptions;
create policy "구독 입력" on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "구독 삭제" on public.push_subscriptions;
create policy "구독 삭제" on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());
