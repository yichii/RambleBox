// Edge Function: transcribe-audio
//
// Downloads a session's audio from Supabase Storage, transcribes it via
// OpenAI Whisper, and writes the result back onto the session row. Runs
// server-side only — WHISPER_API_KEY never reaches the mobile client.
//
// Request body: { sessionId: string, audioStoragePath: string, durationSeconds: number }
// Response:     { transcript: string, status: "transcribed" }

import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { withRetry } from "../_shared/retry.ts";
import { transcribeAudioChunk, splitIntoChunks } from "../_shared/openai.ts";

const WHISPER_COST_PER_MINUTE_USD = 0.006;
const MAX_CHUNK_BYTES = 24 * 1024 * 1024; // stay under Whisper's 25MB limit

interface TranscribeRequest {
  sessionId: string;
  audioStoragePath: string;
  durationSeconds: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }

  const apiKey = Deno.env.get("WHISPER_API_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "WHISPER_API_KEY is not configured" }, 500);
  }

  const { sessionId, audioStoragePath, durationSeconds } =
    (await req.json()) as TranscribeRequest;

  if (!sessionId || !audioStoragePath) {
    return jsonResponse({ error: "sessionId and audioStoragePath are required" }, 400);
  }

  const admin = createSupabaseAdminClient();

  const { data: caller } = await admin.auth.getUser(
    authHeader.replace("Bearer ", ""),
  );
  const { data: session, error: sessionError } = await admin
    .from("sessions")
    .select("id, user_id")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session || session.user_id !== caller?.user?.id) {
    return jsonResponse({ error: "Session not found or not owned by caller" }, 404);
  }

  await admin.from("sessions").update({ status: "transcribing" }).eq("id", sessionId);

  try {
    const { data: audioBlob, error: downloadError } = await admin.storage
      .from("audio")
      .download(audioStoragePath);

    if (downloadError || !audioBlob) {
      throw new Error(`Failed to download audio: ${downloadError?.message}`);
    }

    const audioBuffer = new Uint8Array(await audioBlob.arrayBuffer());
    const chunks = splitIntoChunks(audioBuffer, MAX_CHUNK_BYTES);

    const transcriptParts: string[] = [];
    for (const chunk of chunks) {
      const text = await withRetry(() => transcribeAudioChunk(chunk, apiKey), {
        retries: 1,
        baseDelayMs: 1000,
      });
      transcriptParts.push(text);
    }

    const transcript = transcriptParts.join(" ").trim();

    await admin
      .from("sessions")
      .update({ raw_transcript: transcript, status: "transcribed" })
      .eq("id", sessionId);

    await admin.from("usage_logs").insert({
      session_id: sessionId,
      service: "transcription",
      duration_seconds: durationSeconds,
      cost_usd: (durationSeconds / 60) * WHISPER_COST_PER_MINUTE_USD,
    });

    return jsonResponse({ transcript, status: "transcribed" });
  } catch (err) {
    await admin
      .from("sessions")
      .update({ status: "transcription_failed" })
      .eq("id", sessionId);

    console.error("transcribe-audio failed", err);
    return jsonResponse(
      { error: "Transcription failed", status: "transcription_failed" },
      502,
    );
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
