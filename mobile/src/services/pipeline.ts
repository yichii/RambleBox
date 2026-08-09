import { supabase } from "@/lib/supabase";
import { whisperTranscriptionService } from "@/services/whisperTranscriptionService";
import { rambleStructuringService } from "@/services/rambleStructuringService";
import type { StructuredNoteRow } from "@/types/database";
import type { SessionStatus } from "@/constants/enums";

export interface CapturePipelineParams {
  userId: string;
  localAudioUri: string;
  durationSeconds: number;
}

export interface CapturePipelineResult {
  sessionId: string;
  status: SessionStatus;
  notes: StructuredNoteRow[];
}

// Audio captured → uploaded to storage → transcribed → structured →
// structured_notes rows exist. Each stage updates sessions.status so the UI
// can reflect where a ramble is, and a failure at any stage stops the
// pipeline with that stage's *_failed status rather than silently dropping
// the session.
export async function runCapturePipeline({
  userId,
  localAudioUri,
  durationSeconds,
}: CapturePipelineParams): Promise<CapturePipelineResult> {
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .insert({ user_id: userId, status: "recording" })
    .select()
    .single();

  if (sessionError || !session) {
    throw new Error(`Failed to create session: ${sessionError?.message}`);
  }

  const sessionId = session.id;
  const audioStoragePath = `${userId}/${sessionId}.m4a`;

  const response = await fetch(localAudioUri);
  const audioBlob = await response.blob();

  const { error: uploadError } = await supabase.storage
    .from("audio")
    .upload(audioStoragePath, audioBlob, { contentType: "audio/m4a" });

  if (uploadError) {
    throw new Error(`Failed to upload audio: ${uploadError.message}`);
  }

  await supabase
    .from("sessions")
    .update({
      raw_audio_url: audioStoragePath,
      ended_at: new Date().toISOString(),
      status: "uploaded",
    })
    .eq("id", sessionId);

  const transcribeResult = await whisperTranscriptionService.transcribe({
    sessionId,
    audioStoragePath,
    durationSeconds,
  });

  if (transcribeResult.status === "transcription_failed") {
    return { sessionId, status: "transcription_failed", notes: [] };
  }

  const structureResult = await rambleStructuringService.structure({ sessionId });

  if (structureResult.status === "structuring_failed") {
    return { sessionId, status: "structuring_failed", notes: [] };
  }

  const { data: notes } = await supabase
    .from("structured_notes")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  return { sessionId, status: "structured", notes: notes ?? [] };
}
