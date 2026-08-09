import type {
  NoteType,
  TopicCategory,
  Urgency,
  Confidence,
  CorrectionField,
  SessionStatus,
} from "@/constants/enums";

export interface UserRow {
  id: string;
  email: string;
  created_at: string;
}

export interface SessionRow {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  raw_audio_url: string | null;
  raw_transcript: string | null;
  status: SessionStatus;
}

export interface StructuredNoteRow {
  id: string;
  session_id: string;
  user_id: string;
  note_type: NoteType;
  topic_category: TopicCategory;
  urgency: Urgency;
  content: string;
  confidence: Confidence;
  created_at: string;
  embedding: number[] | null;
}

export interface CorrectionRow {
  id: string;
  structured_note_id: string;
  field_corrected: CorrectionField;
  original_value: string;
  corrected_value: string;
  corrected_at: string;
}

export interface UsageLogRow {
  id: string;
  session_id: string;
  service: "transcription" | "structuring";
  duration_seconds: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number;
  created_at: string;
}

export interface MatchedNoteRow {
  id: string;
  session_id: string;
  note_type: NoteType;
  topic_category: TopicCategory;
  urgency: Urgency;
  content: string;
  confidence: Confidence;
  created_at: string;
  similarity: number;
}

// Minimal typing surface for the supabase-js client — only the tables/RPCs
// this app touches. Extend as the schema grows.
export interface Database {
  public: {
    Tables: {
      users: { Row: UserRow; Insert: never; Update: never };
      sessions: {
        Row: SessionRow;
        Insert: Partial<SessionRow> & Pick<SessionRow, "user_id">;
        Update: Partial<SessionRow>;
      };
      structured_notes: {
        Row: StructuredNoteRow;
        Insert: Partial<StructuredNoteRow>;
        Update: Partial<StructuredNoteRow>;
      };
      corrections: {
        Row: CorrectionRow;
        Insert: Omit<CorrectionRow, "id" | "corrected_at">;
        Update: never;
      };
      usage_logs: { Row: UsageLogRow; Insert: never; Update: never };
    };
    Functions: {
      match_structured_notes: {
        Args: {
          query_embedding: number[];
          match_user_id: string;
          match_topic_category: TopicCategory | null;
          match_urgency: Urgency | null;
          match_count: number;
        };
        Returns: MatchedNoteRow[];
      };
    };
  };
}
