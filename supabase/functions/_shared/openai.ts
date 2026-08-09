// Shared OpenAI calls (Whisper transcription, embeddings) used by both the
// capture pipeline and voice search.

const WHISPER_MODEL = "whisper-1";
const EMBEDDING_MODEL = "text-embedding-3-small";

export async function transcribeAudioChunk(chunk: Uint8Array, apiKey: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([chunk]), "audio.m4a");
  form.append("model", WHISPER_MODEL);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Whisper API error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.text as string;
}

export async function embedText(content: string, apiKey: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: content }),
  });

  if (!response.ok) {
    throw new Error(`Embeddings API error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.data[0].embedding as number[];
}

// NOTE: byte-boundary split, not audio-frame-aware — see transcribe-audio's
// module comment for why this is an acceptable MVP simplification.
export function splitIntoChunks(buffer: Uint8Array, maxBytes: number): Uint8Array[] {
  if (buffer.byteLength <= maxBytes) {
    return [buffer];
  }

  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < buffer.byteLength; offset += maxBytes) {
    chunks.push(buffer.slice(offset, offset + maxBytes));
  }
  return chunks;
}
