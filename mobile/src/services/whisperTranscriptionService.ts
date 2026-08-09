import { supabase } from "@/lib/supabase";
import type { SessionStatus } from "@/constants/enums";

export interface TranscribeParams {
  sessionId: string;
  audioStoragePath: string;
  durationSeconds: number;
}

export interface TranscribeResult {
  transcript: string;
  status: Extract<SessionStatus, "transcribed" | "transcription_failed">;
}

// Kept as an interface (rather than calling the Edge Function inline from
// screens/pipeline code) so transcription stays swappable — this is the
// implementation backed by OpenAI Whisper via the transcribe-audio Edge
// Function; a future provider swap only touches this file.
export interface WhisperTranscriptionService {
  transcribe(params: TranscribeParams): Promise<TranscribeResult>;
}

export class OpenAIWhisperTranscriptionService implements WhisperTranscriptionService {
  async transcribe(params: TranscribeParams): Promise<TranscribeResult> {
    const { data, error } = await supabase.functions.invoke("transcribe-audio", {
      body: params,
    });

    if (error) {
      return { transcript: "", status: "transcription_failed" };
    }

    return data as TranscribeResult;
  }
}

export const whisperTranscriptionService: WhisperTranscriptionService =
  new OpenAIWhisperTranscriptionService();
