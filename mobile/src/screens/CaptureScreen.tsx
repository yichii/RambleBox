import { useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useSession } from "@/hooks/useSession";
import { runCapturePipeline } from "@/services/pipeline";
import type { RootStackParamList } from "@/navigation/RootNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Capture">;

type PipelineStage = "idle" | "recording" | "uploading" | "structuring" | "failed";

export function CaptureScreen({ navigation }: Props) {
  const { session } = useSession();
  const { isRecording, start, stop } = useAudioRecorder();
  const [stage, setStage] = useState<PipelineStage>("idle");
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const handleStart = async () => {
    setResultMessage(null);
    setStage("recording");
    try {
      await start(handleAutoStop);
    } catch (err) {
      setStage("idle");
      Alert.alert("Couldn't start recording", (err as Error).message);
    }
  };

  const handleAutoStop = () => finishRecording();

  const handleManualStop = () => finishRecording();

  const finishRecording = async () => {
    const result = await stop();
    if (!result || !session?.user.id) {
      setStage("idle");
      return;
    }

    setStage("uploading");
    try {
      const pipelineResult = await runCapturePipeline({
        userId: session.user.id,
        localAudioUri: result.uri,
        durationSeconds: result.durationSeconds,
      });

      if (pipelineResult.status === "transcription_failed") {
        setStage("failed");
        setResultMessage("Transcription failed. This ramble was saved but couldn't be processed.");
        return;
      }

      if (pipelineResult.status === "structuring_failed") {
        setStage("failed");
        setResultMessage("Structuring failed. The transcript was saved but no notes were created.");
        return;
      }

      setStage("idle");
      setResultMessage(
        pipelineResult.notes.length === 0
          ? "No notes worth structuring came out of that one."
          : `${pipelineResult.notes.length} note${pipelineResult.notes.length === 1 ? "" : "s"} captured.`,
      );
    } catch (err) {
      setStage("failed");
      setResultMessage((err as Error).message);
    }
  };

  const statusLabel = {
    idle: "Tap to ramble",
    recording: "Listening…",
    uploading: "Uploading & transcribing…",
    structuring: "Structuring your notes…",
    failed: "Something went wrong",
  }[stage];

  return (
    <View style={styles.container}>
      <Text style={styles.status}>{statusLabel}</Text>

      {(stage === "uploading" || stage === "structuring") && (
        <ActivityIndicator size="large" color="#6c5ce7" style={{ marginBottom: 24 }} />
      )}

      <Pressable
        style={[styles.recordButton, isRecording && styles.recordButtonActive]}
        disabled={stage === "uploading" || stage === "structuring"}
        onPress={isRecording ? handleManualStop : handleStart}
      >
        <View style={isRecording ? styles.stopIcon : styles.micIcon} />
      </Pressable>

      {isRecording && <Text style={styles.hint}>Tap to stop, or pause and it'll stop itself</Text>}

      {resultMessage && <Text style={styles.result}>{resultMessage}</Text>}

      <Pressable style={styles.linkButton} onPress={() => navigation.navigate("NotesFeed")}>
        <Text style={styles.linkText}>View notes</Text>
      </Pressable>
      <Pressable style={styles.linkButton} onPress={() => navigation.navigate("Search")}>
        <Text style={styles.linkText}>Search by voice</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0b0b0f", padding: 24 },
  status: { color: "#fff", fontSize: 18, marginBottom: 32 },
  recordButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#6c5ce7",
    alignItems: "center",
    justifyContent: "center",
  },
  recordButtonActive: { backgroundColor: "#e74c3c" },
  micIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#fff" },
  stopIcon: { width: 24, height: 24, borderRadius: 4, backgroundColor: "#fff" },
  hint: { color: "#9a9aa5", marginTop: 16, textAlign: "center" },
  result: { color: "#fff", marginTop: 24, textAlign: "center", fontSize: 16 },
  linkButton: { marginTop: 20 },
  linkText: { color: "#6c5ce7", fontSize: 15 },
});
