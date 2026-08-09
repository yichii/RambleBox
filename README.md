# Ramblbox

A voice-first thinking workspace for solo founders. Ramble → get back
categorized, searchable build notes. The product is the structuring
pipeline, not the transcription — transcription is a commodity input.

## Stack

- **Mobile**: Expo (React Native + TypeScript) — [`mobile/`](mobile/)
- **Backend**: Supabase (Postgres + pgvector, auth, storage, Edge Functions) — [`supabase/`](supabase/)
- **Transcription**: OpenAI Whisper, called from the `transcribe-audio` Edge Function
- **Structuring**: Anthropic Claude, called from the `structure-transcript` Edge Function — prompt lives in [`supabase/functions/structure-transcript/structuring_prompt.ts`](supabase/functions/structure-transcript/structuring_prompt.ts)
- **Search**: pgvector cosine similarity over `structured_notes.content` embeddings (OpenAI `text-embedding-3-small`)

API keys for Whisper and Claude live server-side as Supabase Edge Function
secrets — never in the mobile app bundle.

## Architecture

```
Capture (mobile)                Edge Functions (Supabase)              Postgres
─────────────────                ──────────────────────────             ────────
record → upload audio  ────────▶  transcribe-audio
                                     - Whisper API (chunked >25MB)
                                     - retry once w/ backoff
                                     - on failure: session.status =
                                       'transcription_failed'
                                     - logs usage_logs (transcription)
                                                │
                                                ▼
                                   structure-transcript
                                     - Claude + structuring_prompt.ts
                                     - 0..N notes per ramble
                                     - embeds each note (pgvector)
                                     - logs usage_logs (structuring)
                                                │
                                                ▼
notes feed ◀────────────────────  structured_notes rows

Voice search: record query → search-notes Edge Function
  (transcribe query → embed → match_structured_notes RPC) → ranked results
```

## Setup

### 1. Supabase project

1. Create a project at supabase.com (or run locally with the Supabase CLI).
2. Apply the migrations in [`supabase/migrations/`](supabase/migrations/) in order — via `supabase db push`, or the SQL editor.
3. Copy [`supabase/.env.example`](supabase/.env.example) to `supabase/.env` and fill in `WHISPER_API_KEY` (OpenAI) and `ANTHROPIC_API_KEY`.
4. Deploy the Edge Functions and set their secrets:
   ```
   supabase functions deploy transcribe-audio structure-transcript search-notes
   supabase secrets set --env-file supabase/.env
   ```
5. Local dev instead: `supabase functions serve --env-file supabase/.env`

### 2. Mobile app

```
cd mobile
cp .env.example .env   # fill in EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
npm install
npm start
```

### 3. Corrections analytics (internal only)

Not exposed in the app — run locally against the corrections table to see
recurring misclassification patterns and feed prompt iteration:

```
cd scripts
npm install
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  npm run corrections-report -- --since=2026-08-01 --until=2026-08-08
```

## Data model

- `users` — mirrors `auth.users`
- `sessions` — one per capture; `status` tracks the pipeline stage (`recording` → `uploaded` → `transcribing` → `transcribed` → `structuring` → `structured`, or a `*_failed` state)
- `structured_notes` — pipeline output: `note_type`, `topic_category`, `urgency`, `content`, `confidence`, `embedding`
- `corrections` — every founder edit to a structured note, written *before* the note itself updates. This is the core learning signal — see `scripts/corrections-report.ts`.
- `usage_logs` — per-call cost tracking (Whisper $/min, Claude $/token) against the $29/mo price point

Single-user-per-account, RLS-scoped throughout. No team/multi-seat logic,
no pricing tiers or feature gating, no Notion/Linear integration (Phase 2).

## Known simplifications (MVP, not hidden)

- Audio chunking for files >25MB splits on byte boundaries, not audio-frame
  boundaries — fine for the ramble lengths this app targets, would need an
  audio toolchain (ffmpeg) to be fully correct at scale.
- `usage_logs.duration_seconds` for transcription is client-reported
  (measured by `expo-av` at recording time), not re-derived server-side.
