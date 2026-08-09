import { useCallback, useRef, useState } from "react";
import { Audio } from "expo-av";

const SILENCE_THRESHOLD_DB = -40;
const SILENCE_TIMEOUT_MS = 2500;

export interface RecordingResult {
  uri: string;
  durationSeconds: number;
}

// Stops on silence (metering below threshold for SILENCE_TIMEOUT_MS) or a
// manual stop() call — whichever comes first.
export function useAudioRecorder() {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const start = useCallback(
    async (onAutoStop: () => void) => {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        throw new Error("Microphone permission denied");
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });

      recording.setOnRecordingStatusUpdate((recStatus) => {
        if (!recStatus.isRecording || recStatus.metering === undefined) return;

        if (recStatus.metering < SILENCE_THRESHOLD_DB) {
          if (!silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(onAutoStop, SILENCE_TIMEOUT_MS);
          }
        } else {
          clearSilenceTimer();
        }
      });

      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
    },
    [clearSilenceTimer],
  );

  const stop = useCallback(async (): Promise<RecordingResult | null> => {
    clearSilenceTimer();
    const recording = recordingRef.current;
    if (!recording) return null;

    await recording.stopAndUnloadAsync();
    const status = await recording.getStatusAsync();
    const uri = recording.getURI();
    recordingRef.current = null;
    setIsRecording(false);

    if (!uri) return null;
    return { uri, durationSeconds: (status.durationMillis ?? 0) / 1000 };
  }, [clearSilenceTimer]);

  return { isRecording, start, stop };
}
