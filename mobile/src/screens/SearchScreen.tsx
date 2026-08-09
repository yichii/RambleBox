import { useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useSession } from "@/hooks/useSession";
import { searchNotesByVoice } from "@/services/searchService";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import type { MatchedNoteRow } from "@/types/database";
import {
  TOPIC_CATEGORIES,
  URGENCY_LEVELS,
  TOPIC_CATEGORY_LABELS,
  URGENCY_LABELS,
  NOTE_TYPE_LABELS,
  type TopicCategory,
  type Urgency,
} from "@/constants/enums";

type Props = NativeStackScreenProps<RootStackParamList, "Search">;

export function SearchScreen({}: Props) {
  const { session } = useSession();
  const { isRecording, start, stop } = useAudioRecorder();
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [results, setResults] = useState<MatchedNoteRow[]>([]);
  const [topicFilter, setTopicFilter] = useState<TopicCategory | null>(null);
  const [urgencyFilter, setUrgencyFilter] = useState<Urgency | null>(null);

  const finishAndSearch = async () => {
    const result = await stop();
    if (!result || !session?.user.id) return;

    setSearching(true);
    try {
      const searchResult = await searchNotesByVoice({
        userId: session.user.id,
        localAudioUri: result.uri,
        topicCategory: topicFilter,
        urgency: urgencyFilter,
      });
      setQuery(searchResult.query);
      setResults(searchResult.notes);
    } catch (err) {
      Alert.alert("Search failed", (err as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const handleMicPress = async () => {
    if (isRecording) {
      await finishAndSearch();
      return;
    }

    try {
      await start(finishAndSearch);
    } catch (err) {
      Alert.alert("Couldn't start recording", (err as Error).message);
    }
  };

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

      <Pressable
        style={[styles.micButton, isRecording && styles.micButtonActive]}
        onPress={handleMicPress}
        disabled={searching}
      >
        <Text style={styles.micButtonText}>
          {searching ? "Searching…" : isRecording ? "Tap to stop" : "Ask a question"}
        </Text>
      </Pressable>

      {searching && <ActivityIndicator color="#6c5ce7" style={{ marginTop: 16 }} />}

      {query && <Text style={styles.queryLabel}>"{query}"</Text>}

      <FlatList
        data={results}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          query && !searching ? <Text style={styles.empty}>No matching notes.</Text> : null
        }
        renderItem={({ item }) => (
          <View style={styles.resultCard}>
            <Text style={styles.noteType}>{NOTE_TYPE_LABELS[item.note_type]}</Text>
            <Text style={styles.noteContent}>{item.content}</Text>
            <Text style={styles.noteMeta}>
              {TOPIC_CATEGORY_LABELS[item.topic_category]} · {URGENCY_LABELS[item.urgency]} ·{" "}
              {Math.round(item.similarity * 100)}% match
            </Text>
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
  micButton: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: "#6c5ce7",
    borderRadius: 12,
    paddingVertical: 16,
  },
  micButtonActive: { backgroundColor: "#e74c3c" },
  micButtonText: { color: "#fff", textAlign: "center", fontWeight: "600", fontSize: 16 },
  queryLabel: { color: "#9a9aa5", textAlign: "center", marginTop: 16, fontStyle: "italic" },
  empty: { color: "#9a9aa5", textAlign: "center", marginTop: 24 },
  resultCard: { backgroundColor: "#1a1a22", borderRadius: 12, padding: 14, marginBottom: 8 },
  noteType: { color: "#6c5ce7", fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  noteContent: { color: "#fff", fontSize: 15, marginTop: 6 },
  noteMeta: { color: "#9a9aa5", fontSize: 12, marginTop: 8 },
});
