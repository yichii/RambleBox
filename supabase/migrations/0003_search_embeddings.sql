-- Voice-first search: semantic search over structured_notes.content via pgvector.
-- Embeddings are populated by the structure-transcript Edge Function at note
-- creation time (OpenAI text-embedding-3-small, 1536 dims).

create extension if not exists vector;

alter table public.structured_notes
  add column embedding vector(1536);

-- ivfflat needs rows to train on; fine to leave "lists" modest for MVP scale.
create index structured_notes_embedding_idx
  on public.structured_notes
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- security invoker (default) — RLS on structured_notes still applies to the
-- calling user, match_user_id is belt-and-suspenders since the mobile client
-- always passes auth.uid().
create or replace function public.match_structured_notes(
  query_embedding vector(1536),
  match_user_id uuid,
  match_topic_category public.topic_category default null,
  match_urgency public.urgency_level default null,
  match_count int default 10
)
returns table (
  id uuid,
  session_id uuid,
  note_type public.note_type,
  topic_category public.topic_category,
  urgency public.urgency_level,
  content text,
  confidence public.confidence_level,
  created_at timestamptz,
  similarity float
)
language sql
stable
as $$
  select
    sn.id,
    sn.session_id,
    sn.note_type,
    sn.topic_category,
    sn.urgency,
    sn.content,
    sn.confidence,
    sn.created_at,
    1 - (sn.embedding <=> query_embedding) as similarity
  from public.structured_notes sn
  where sn.user_id = match_user_id
    and sn.embedding is not null
    and (match_topic_category is null or sn.topic_category = match_topic_category)
    and (match_urgency is null or sn.urgency = match_urgency)
  order by sn.embedding <=> query_embedding
  limit match_count;
$$;
