import { useCallback, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/hooks/useSession";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import type { StructuredNoteRow } from "@/types/database";
import {
  TOPIC_CATEGORIES,
  URGENCY_LEVELS,
  TOPIC_CATEGORY_LABELS,
  URGENCY_LABELS,
  NOTE_TYPE_LABELS,
  type TopicCategory,
  type Urgency,
} from "@/constants/enums";

type Props = NativeStackScreenProps<RootStackParamList, "NotesFeed">;

interface SessionGroup {
  sessionId: string;
  notes: StructuredNoteRow[];
}

export function NotesFeedScreen({ navigation }: Props) {
  const { session } = useSession();
  const [notes, setNotes] = useState<StructuredNoteRow[]>([]);
  const [topicFilter, setTopicFilter] = useState<TopicCategory | null>(null);
  const [urgencyFilter, setUrgencyFilter] = useState<Urgency | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session?.user.id) return;

    let query = supabase
      .from("structured_notes")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });

    if (topicFilter) query = query.eq("topic_category", topicFilter);
    if (urgencyFilter) query = query.eq("urgency", urgencyFilter);

    const { data } = await query;
    setNotes(data ?? []);
  }, [session?.user.id, topicFilter, urgencyFilter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const groups: SessionGroup[] = [];
  for (const note of notes) {
    const existing = groups.find((g) => g.sessionId === note.session_id);
    if (existing) existing.notes.push(note);
    else groups.push({ sessionId: note.session_id, notes: [note] });
  }

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        <FilterChip label="All topics" active={!topicFilter} onPress={() => setTopicFilter(null)} />
        {TOPIC_CATEGORIES.map((t) => (
          <FilterChip
            key={t}
            label={TOPIC_CATEGORY_LABELS[t]}
            active={topicFilter === t}
            onPress={() => setTopicFilter(topicFilter === t ? null : t)}
          />
        ))}
      </View>
      <View style={styles.filterRow}>
        <FilterChip label="All urgency" active={!urgencyFilter} onPress={() => setUrgencyFilter(null)} />
        {URGENCY_LEVELS.map((u) => (
          <FilterChip
            key={u}
            label={URGENCY_LABELS[u]}
            active={urgencyFilter === u}
            onPress={() => setUrgencyFilter(urgencyFilter === u ? null : u)}
          />
        ))}
      </View>

      <FlatList
        data={groups}
        keyExtractor={(g) => g.sessionId}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={<Text style={styles.empty}>No notes yet. Go ramble.</Text>}
        renderItem={({ item }) => (
          <View style={styles.sessionGroup}>
            <Text style={styles.sessionLabel}>Session {item.sessionId.slice(0, 8)}</Text>
            {item.notes.map((note) => (
              <Pressable
                key={note.id}
                style={styles.noteCard}
                onPress={() => navigation.navigate("NoteDetail", { noteId: note.id })}
              >
                <View style={styles.noteHeader}>
                  <Text style={styles.noteType}>{NOTE_TYPE_LABELS[note.note_type]}</Text>
                  {note.confidence === "low" && <Text style={styles.lowConfidence}>Review?</Text>}
                </View>
                <Text style={styles.noteContent} numberOfLines={2}>
                  {note.content}
                </Text>
                <Text style={styles.noteMeta}>
                  {TOPIC_CATEGORY_LABELS[note.topic_category]} · {URGENCY_LABELS[note.urgency]}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      />
    </View>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f" },
  filterRow: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#1a1a22",
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: { backgroundColor: "#6c5ce7" },
  chipText: { color: "#9a9aa5", fontSize: 13 },
  chipTextActive: { color: "#fff" },
  empty: { color: "#9a9aa5", textAlign: "center", marginTop: 48 },
  sessionGroup: { marginBottom: 20 },
  sessionLabel: { color: "#6c6c78", fontSize: 12, marginBottom: 8, textTransform: "uppercase" },
  noteCard: { backgroundColor: "#1a1a22", borderRadius: 12, padding: 14, marginBottom: 8 },
  noteHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  noteType: { color: "#6c5ce7", fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  lowConfidence: {
    color: "#f39c12",
    fontSize: 11,
    fontWeight: "700",
    backgroundColor: "#3a2e12",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  noteContent: { color: "#fff", fontSize: 15, marginTop: 6 },
  noteMeta: { color: "#9a9aa5", fontSize: 12, marginTop: 8 },
});
