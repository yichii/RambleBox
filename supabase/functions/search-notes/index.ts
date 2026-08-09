// Edge Function: search-notes
//
// Voice-first search over a founder's own structured_notes. Transcribes the
// spoken query the same way capture does, embeds it, and runs top-k cosine
// similarity via the match_structured_notes() RPC (pgvector). Results are
// read back as text in the UI — no speech synthesis in this pass.
//
// Request body: { audioStoragePath: string, topicCategory?: string, urgency?: string }
// Response:     { query: string, notes: MatchedNote[] }

import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { withRetry } from "../_shared/retry.ts";
import { transcribeAudioChunk, embedText } from "../_shared/openai.ts";

interface SearchRequest {
  audioStoragePath: string;
  topicCategory?: string | null;
  urgency?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }

  const openaiKey = Deno.env.get("WHISPER_API_KEY");
  if (!openaiKey) {
    return jsonResponse({ error: "WHISPER_API_KEY is not configured" }, 500);
  }

  const { audioStoragePath, topicCategory, urgency } = (await req.json()) as SearchRequest;
  if (!audioStoragePath) {
    return jsonResponse({ error: "audioStoragePath is required" }, 400);
  }

  const admin = createSupabaseAdminClient();
  const { data: caller } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  const userId = caller?.user?.id;

  if (!userId || !audioStoragePath.startsWith(`${userId}/`)) {
    return jsonResponse({ error: "Not authorized for this audio path" }, 403);
  }

  try {
    const { data: audioBlob, error: downloadError } = await admin.storage
      .from("audio")
      .download(audioStoragePath);

    if (downloadError || !audioBlob) {
      throw new Error(`Failed to download query audio: ${downloadError?.message}`);
    }

    const audioBuffer = new Uint8Array(await audioBlob.arrayBuffer());

    const query = await withRetry(() => transcribeAudioChunk(audioBuffer, openaiKey), {
      retries: 1,
      baseDelayMs: 1000,
    });

    const queryEmbedding = await withRetry(() => embedText(query, openaiKey), {
      retries: 1,
      baseDelayMs: 1000,
    });

    const { data: notes, error: rpcError } = await admin.rpc("match_structured_notes", {
      query_embedding: queryEmbedding,
      match_user_id: userId,
      match_topic_category: topicCategory ?? null,
      match_urgency: urgency ?? null,
      match_count: 10,
    });

    if (rpcError) throw rpcError;

    return jsonResponse({ query, notes });
  } catch (err) {
    console.error("search-notes failed", err);
    return jsonResponse({ error: "Search failed" }, 502);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
