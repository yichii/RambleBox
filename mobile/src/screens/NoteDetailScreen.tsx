import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { supabase } from "@/lib/supabase";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import type { StructuredNoteRow } from "@/types/database";
import {
  NOTE_TYPES,
  TOPIC_CATEGORIES,
  URGENCY_LEVELS,
  NOTE_TYPE_LABELS,
  TOPIC_CATEGORY_LABELS,
  URGENCY_LABELS,
  type NoteType,
  type TopicCategory,
  type Urgency,
} from "@/constants/enums";

type Props = NativeStackScreenProps<RootStackParamList, "NoteDetail">;

export function NoteDetailScreen({ route }: Props) {
  const { noteId } = route.params;
  const [note, setNote] = useState<StructuredNoteRow | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("structured_notes").select("*").eq("id", noteId).single();
    setNote(data);
  }, [noteId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const applyCorrection = async (
    field: "note_type" | "topic_category" | "urgency",
    newValue: string,
  ) => {
    if (!note || note[field] === newValue || saving) return;

    setSaving(true);
    const originalValue = note[field];

    // Every correction is written before the note itself is updated — this
    // table is the product's core learning signal, so it must never be lost
    // even if the subsequent update fails.
    const { error: correctionError } = await supabase.from("corrections").insert({
      structured_note_id: note.id,
      field_corrected: field,
      original_value: originalValue,
      corrected_value: newValue,
    });

    if (correctionError) {
      setSaving(false);
      Alert.alert("Couldn't save correction", correctionError.message);
      return;
    }

    const { data: updated, error: updateError } = await supabase
      .from("structured_notes")
      .update({ [field]: newValue })
      .eq("id", note.id)
      .select()
      .single();

    setSaving(false);

    if (updateError) {
      Alert.alert("Correction saved, but the note failed to update", updateError.message);
      return;
    }

    setNote(updated);
  };

  if (!note) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#6c5ce7" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {note.confidence === "low" && (
        <View style={styles.reviewBanner}>
          <Text style={styles.reviewBannerText}>
            Low confidence — double-check the categorization below.
          </Text>
        </View>
      )}

      <Text style={styles.content}>{note.content}</Text>

      <Section
        label="Type"
        options={NOTE_TYPES}
        labels={NOTE_TYPE_LABELS}
        value={note.note_type}
        onSelect={(v) => applyCorrection("note_type", v)}
      />
      <Section
        label="Topic"
        options={TOPIC_CATEGORIES}
        labels={TOPIC_CATEGORY_LABELS}
        value={note.topic_category}
        onSelect={(v) => applyCorrection("topic_category", v)}
      />
      <Section
        label="Urgency"
        options={URGENCY_LEVELS}
        labels={URGENCY_LABELS}
        value={note.urgency}
        onSelect={(v) => applyCorrection("urgency", v)}
      />

      {saving && <ActivityIndicator color="#6c5ce7" style={{ marginTop: 16 }} />}
    </View>
  );
}

function Section<T extends string>({
  label,
  options,
  labels,
  value,
  onSelect,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {options.map((opt) => (
          <Pressable
            key={opt}
            style={[styles.chip, value === opt && styles.chipActive]}
            onPress={() => onSelect(opt)}
          >
            <Text style={[styles.chipText, value === opt && styles.chipTextActive]}>
              {labels[opt]}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f", padding: 20 },
  reviewBanner: {
    backgroundColor: "#3a2e12",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  reviewBannerText: { color: "#f39c12", fontSize: 13 },
  content: { color: "#fff", fontSize: 18, marginBottom: 28, lineHeight: 26 },
  section: { marginBottom: 24 },
  sectionLabel: { color: "#6c6c78", fontSize: 12, textTransform: "uppercase", marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#1a1a22",
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: { backgroundColor: "#6c5ce7" },
  chipText: { color: "#9a9aa5", fontSize: 14 },
  chipTextActive: { color: "#fff" },
});
