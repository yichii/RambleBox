-- Ramblbox core schema
-- users, sessions, structured_notes, corrections
-- corrections is the product's core learning signal — treated as first-class here,
-- not bolted on: every edit a founder makes to a structured note must land here
-- before the note itself is updated.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.note_type as enum ('decision', 'todo', 'question');

create type public.topic_category as enum (
  'build_priorities',
  'customer_feedback',
  'fundraising',
  'other'
);

create type public.urgency_level as enum ('low', 'medium', 'high');

create type public.correction_field as enum ('note_type', 'topic_category', 'urgency');

-- ---------------------------------------------------------------------------
-- users
-- Mirrors auth.users so app tables can carry a plain FK + we can store
-- product-specific columns later without touching the auth schema.
-- ---------------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- sessions — one per capture (record → upload → transcribe)
-- ---------------------------------------------------------------------------
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  raw_audio_url text,
  raw_transcript text
);

create index sessions_user_id_idx on public.sessions (user_id);

-- ---------------------------------------------------------------------------
-- structured_notes — the output of the structuring pipeline
-- ---------------------------------------------------------------------------
create table public.structured_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  note_type public.note_type not null,
  topic_category public.topic_category not null,
  urgency public.urgency_level not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index structured_notes_session_id_idx on public.structured_notes (session_id);
create index structured_notes_user_id_idx on public.structured_notes (user_id);
create index structured_notes_topic_category_idx on public.structured_notes (topic_category);
create index structured_notes_urgency_idx on public.structured_notes (urgency);

-- ---------------------------------------------------------------------------
-- corrections — every founder edit to a structured note, before the note
-- itself is updated. This is the training signal for the structuring model.
-- ---------------------------------------------------------------------------
create table public.corrections (
  id uuid primary key default gen_random_uuid(),
  structured_note_id uuid not null references public.structured_notes (id) on delete cascade,
  field_corrected public.correction_field not null,
  original_value text not null,
  corrected_value text not null,
  corrected_at timestamptz not null default now()
);

create index corrections_structured_note_id_idx on public.corrections (structured_note_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — single-user-per-account, no team/multi-seat sharing
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.sessions enable row level security;
alter table public.structured_notes enable row level security;
alter table public.corrections enable row level security;

create policy "users can view own row"
  on public.users for select
  using (auth.uid() = id);

create policy "users can view own sessions"
  on public.sessions for select
  using (auth.uid() = user_id);

create policy "users can insert own sessions"
  on public.sessions for insert
  with check (auth.uid() = user_id);

create policy "users can update own sessions"
  on public.sessions for update
  using (auth.uid() = user_id);

create policy "users can view own structured notes"
  on public.structured_notes for select
  using (auth.uid() = user_id);

create policy "users can insert own structured notes"
  on public.structured_notes for insert
  with check (auth.uid() = user_id);

create policy "users can update own structured notes"
  on public.structured_notes for update
  using (auth.uid() = user_id);

create policy "users can view own corrections"
  on public.corrections for select
  using (
    auth.uid() = (
      select user_id from public.structured_notes
      where id = corrections.structured_note_id
    )
  );

create policy "users can insert own corrections"
  on public.corrections for insert
  with check (
    auth.uid() = (
      select user_id from public.structured_notes
      where id = corrections.structured_note_id
    )
  );

-- ---------------------------------------------------------------------------
-- Storage — raw session audio, one folder per user
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('audio', 'audio', false)
on conflict (id) do nothing;

create policy "users can upload own audio"
  on storage.objects for insert
  with check (
    bucket_id = 'audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users can read own audio"
  on storage.objects for select
  using (
    bucket_id = 'audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
