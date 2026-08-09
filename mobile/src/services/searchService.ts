import { supabase } from "@/lib/supabase";
import type { TopicCategory, Urgency } from "@/constants/enums";
import type { MatchedNoteRow } from "@/types/database";

export interface SearchParams {
  userId: string;
  localAudioUri: string;
  topicCategory?: TopicCategory | null;
  urgency?: Urgency | null;
}

export interface SearchResult {
  query: string;
  notes: MatchedNoteRow[];
}

function randomId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Voice-first search: record a short query clip the same way capture does,
// transcribe + embed it server-side, and rank structured_notes by cosine
// similarity. Results come back as text — no speech synthesis in this pass.
export async function searchNotesByVoice({
  userId,
  localAudioUri,
  topicCategory,
  urgency,
}: SearchParams): Promise<SearchResult> {
  const audioStoragePath = `${userId}/search/${randomId()}.m4a`;

  const response = await fetch(localAudioUri);
  const audioBlob = await response.blob();

  const { error: uploadError } = await supabase.storage
    .from("audio")
    .upload(audioStoragePath, audioBlob, { contentType: "audio/m4a" });

  if (uploadError) {
    throw new Error(`Failed to upload search query audio: ${uploadError.message}`);
  }

  const { data, error } = await supabase.functions.invoke("search-notes", {
    body: { audioStoragePath, topicCategory, urgency },
  });

  if (error) {
    throw new Error(`Search failed: ${error.message}`);
  }

  return data as SearchResult;
}
