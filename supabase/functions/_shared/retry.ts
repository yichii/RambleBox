// Retry once with exponential backoff. Used by every external API call
// (Whisper, Claude, embeddings) so a single flaky request doesn't fail
// a whole session — but we still fail loudly after the retry rather than
// looping forever.
export async function withRetry<T>(
  fn: () => Promise<T>,
  { retries = 1, baseDelayMs = 1000 }: { retries?: number; baseDelayMs?: number } = {},
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const delay = baseDelayMs * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
