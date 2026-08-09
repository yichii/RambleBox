import { supabase } from "@/lib/supabase";
import type { SessionStatus, NoteType, TopicCategory, Urgency, Confidence } from "@/constants/enums";

export interface StructureParams {
  sessionId: string;
}

export interface StructuredNoteOutput {
  note_type: NoteType;
  topic_category: TopicCategory;
  urgency: Urgency;
  content: string;
  confidence: Confidence;
}

export interface StructureResult {
  notes: StructuredNoteOutput[];
  status: Extract<SessionStatus, "structured" | "structuring_failed">;
}

// Interface kept separate from the Anthropic-backed implementation below so
// the structuring model/provider can change without touching call sites.
// The actual structuring rows land in Postgres from inside the Edge
// Function — this call just triggers that and reports the outcome.
export interface RambleStructuringService {
  structure(params: StructureParams): Promise<StructureResult>;
}

export class ClaudeRambleStructuringService implements RambleStructuringService {
  async structure(params: StructureParams): Promise<StructureResult> {
    const { data, error } = await supabase.functions.invoke("structure-transcript", {
      body: params,
    });

    if (error) {
      return { notes: [], status: "structuring_failed" };
    }

    return data as StructureResult;
  }
}

export const rambleStructuringService: RambleStructuringService =
  new ClaudeRambleStructuringService();
