// Edge Function: structure-transcript
//
// Takes a session's raw transcript, sends it to Claude with the structuring
// prompt (structuring_prompt.ts), and writes the resulting structured_notes
// rows — each with an embedding for semantic search and a confidence score
// the UI uses to flag likely correction candidates.
//
// Request body: { sessionId: string }
// Response:     { notes: StructuredNoteOutput[], status: "structured" }

import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { withRetry } from "../_shared/retry.ts";
import { embedText } from "../_shared/openai.ts";
import { buildStructuringPrompt } from "./structuring_prompt.ts";

const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5";

// Verify against current pricing pages before trusting these for real margin
// reporting — rates change. Anthropic Sonnet: $3/MTok in, $15/MTok out.
const CLAUDE_INPUT_COST_PER_MTOK_USD = 3;
const CLAUDE_OUTPUT_COST_PER_MTOK_USD = 15;

type NoteType = "decision" | "todo" | "question";
type TopicCategory = "build_priorities" | "customer_feedback" | "fundraising" | "other";
type Urgency = "low" | "medium" | "high";
type Confidence = "high" | "low";

interface StructuredNoteOutput {
  note_type: NoteType;
  topic_category: TopicCategory;
  urgency: Urgency;
  content: string;
  confidence: Confidence;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const openaiKey = Deno.env.get("WHISPER_API_KEY"); // same OpenAI account, used here for embeddings
  if (!anthropicKey) {
    return jsonResponse({ error: "ANTHROPIC_API_KEY is not configured" }, 500);
  }

  const { sessionId } = (await req.json()) as { sessionId: string };
  if (!sessionId) {
    return jsonResponse({ error: "sessionId is required" }, 400);
  }

  const admin = createSupabaseAdminClient();

  const { data: caller } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  const { data: session, error: sessionError } = await admin
    .from("sessions")
    .select("id, user_id, raw_transcript, started_at")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session || session.user_id !== caller?.user?.id) {
    return jsonResponse({ error: "Session not found or not owned by caller" }, 404);
  }

  if (!session.raw_transcript) {
    return jsonResponse({ error: "Session has no transcript yet" }, 400);
  }

  await admin.from("sessions").update({ status: "structuring" }).eq("id", sessionId);

  try {
    const prompt = buildStructuringPrompt(session.raw_transcript, session.started_at);

    const { notes, inputTokens, outputTokens } = await withRetry(
      () => callClaudeForNotes(prompt, anthropicKey),
      { retries: 1, baseDelayMs: 1500 },
    );

    const notesWithEmbeddings = await Promise.all(
      notes.map(async (note) => ({
        note,
        embedding: openaiKey ? await tryEmbed(note.content, openaiKey) : null,
      })),
    );

    if (notesWithEmbeddings.length > 0) {
      const { error: insertError } = await admin.from("structured_notes").insert(
        notesWithEmbeddings.map(({ note, embedding }) => ({
          session_id: sessionId,
          user_id: session.user_id,
          note_type: note.note_type,
          topic_category: note.topic_category,
          urgency: note.urgency,
          content: note.content,
          confidence: note.confidence,
          embedding,
        })),
      );
      if (insertError) throw insertError;
    }

    await admin.from("sessions").update({ status: "structured" }).eq("id", sessionId);

    await admin.from("usage_logs").insert({
      session_id: sessionId,
      service: "structuring",
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd:
        (inputTokens / 1_000_000) * CLAUDE_INPUT_COST_PER_MTOK_USD +
        (outputTokens / 1_000_000) * CLAUDE_OUTPUT_COST_PER_MTOK_USD,
    });

    return jsonResponse({ notes, status: "structured" });
  } catch (err) {
    await admin.from("sessions").update({ status: "structuring_failed" }).eq("id", sessionId);
    console.error("structure-transcript failed", err);
    return jsonResponse({ error: "Structuring failed", status: "structuring_failed" }, 502);
  }
});

async function callClaudeForNotes(
  prompt: string,
  apiKey: string,
): Promise<{ notes: StructuredNoteOutput[]; inputTokens: number; outputTokens: number }> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text ?? "";
  const notes = parseNotes(text);

  return {
    notes,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

function parseNotes(text: string): StructuredNoteOutput[] {
  const parsed = JSON.parse(text.trim());
  if (!Array.isArray(parsed)) {
    throw new Error("Structuring response was not a JSON array");
  }

  const validNoteTypes = new Set(["decision", "todo", "question"]);
  const validTopics = new Set(["build_priorities", "customer_feedback", "fundraising", "other"]);
  const validUrgencies = new Set(["low", "medium", "high"]);
  const validConfidence = new Set(["high", "low"]);

  for (const note of parsed) {
    if (
      !validNoteTypes.has(note.note_type) ||
      !validTopics.has(note.topic_category) ||
      !validUrgencies.has(note.urgency) ||
      !validConfidence.has(note.confidence) ||
      typeof note.content !== "string" ||
      note.content.trim() === ""
    ) {
      throw new Error(`Structuring response contained an invalid note: ${JSON.stringify(note)}`);
    }
  }

  return parsed as StructuredNoteOutput[];
}

async function tryEmbed(content: string, apiKey: string): Promise<number[] | null> {
  try {
    return await withRetry(() => embedText(content, apiKey), { retries: 1, baseDelayMs: 1000 });
  } catch (err) {
    // Embedding failure shouldn't lose the founder's note — it just won't
    // be reachable via semantic search until backfilled.
    console.error("embedding failed, storing note without embedding", err);
    return null;
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
