export const NOTE_TYPES = ["decision", "todo", "question"] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export const TOPIC_CATEGORIES = [
  "build_priorities",
  "customer_feedback",
  "fundraising",
  "other",
] as const;
export type TopicCategory = (typeof TOPIC_CATEGORIES)[number];

export const URGENCY_LEVELS = ["low", "medium", "high"] as const;
export type Urgency = (typeof URGENCY_LEVELS)[number];

export const CONFIDENCE_LEVELS = ["high", "low"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const CORRECTION_FIELDS = ["note_type", "topic_category", "urgency"] as const;
export type CorrectionField = (typeof CORRECTION_FIELDS)[number];

export const SESSION_STATUSES = [
  "recording",
  "uploaded",
  "transcribing",
  "transcribed",
  "transcription_failed",
  "structuring",
  "structured",
  "structuring_failed",
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const TOPIC_CATEGORY_LABELS: Record<TopicCategory, string> = {
  build_priorities: "Build priorities",
  customer_feedback: "Customer feedback",
  fundraising: "Fundraising",
  other: "Other",
};

export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  decision: "Decision",
  todo: "To-do",
  question: "Question",
};

export const URGENCY_LABELS: Record<Urgency, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};
