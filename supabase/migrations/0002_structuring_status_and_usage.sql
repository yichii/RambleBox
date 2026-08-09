-- Session status tracking, structuring confidence, and API cost logging.

create type public.session_status as enum (
  'recording',
  'uploaded',
  'transcribing',
  'transcribed',
  'transcription_failed',
  'structuring',
  'structured',
  'structuring_failed'
);

alter table public.sessions
  add column status public.session_status not null default 'recording';

create type public.confidence_level as enum ('high', 'low');

-- The structuring model's self-reported confidence in note_type/topic_category/
-- urgency. Low-confidence notes get flagged in the UI as likely correction
-- candidates before the founder even touches them.
alter table public.structured_notes
  add column confidence public.confidence_level not null default 'high';

alter table public.structured_notes
  alter column confidence drop default;

-- ---------------------------------------------------------------------------
-- usage_logs — per-call cost tracking for margin analysis against the
-- flat $29/mo price point. Shared shape for both per-duration services
-- (transcription) and per-token services (structuring); each service only
-- populates the columns that apply to it.
-- ---------------------------------------------------------------------------
create table public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  service text not null check (service in ('transcription', 'structuring')),
  duration_seconds numeric,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric not null,
  created_at timestamptz not null default now()
);

create index usage_logs_session_id_idx on public.usage_logs (session_id);
create index usage_logs_service_idx on public.usage_logs (service);

alter table public.usage_logs enable row level security;

create policy "users can view own usage logs"
  on public.usage_logs for select
  using (
    auth.uid() = (
      select user_id from public.sessions
      where id = usage_logs.session_id
    )
  );

-- Inserts happen from Edge Functions using the service-role key, which
-- bypasses RLS — no insert policy needed for the mobile client.
