/**
 * useVoiceCommand — React hook for the voice command pipeline.
 *
 * HYBRID ARCHITECTURE (v2):
 * Orchestrates on-device speech recognition via expo-speech-recognition
 * on native platforms and Web Speech API on web.
 *
 * Key responsibilities:
 * 1. Voice capture (VoiceService) with on-device STT
 * 2. Wiring native speech recognition events to VoiceService
 * 3. Lifecycle management (start/stop/cancel/dispose)
 * 4. State (status, transcript, error)
 *
 * The hook ONLY handles speech capture. Command parsing and execution
 * are handled by the parent component via the onResult callback.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { VoiceService, type VoiceStatus } from "@/domain/voice/VoiceService";

// Conditionally import native event hooks
let useSpeechRecognitionEvent: any = null;
if (Platform.OS !== "web") {
  try {
    const mod = require("expo-speech-recognition");
    useSpeechRecognitionEvent = mod.useSpeechRecognitionEvent;
  } catch {
    // expo-speech-recognition not available — will fallback gracefully
  }
}

export type { VoiceStatus };

interface UseVoiceCommandOptions {
  /** Called with the final transcript when speech is recognised. */
  onResult: (transcript: string) => void;
  /** Called when the voice capture session ends (after result or error). */
  onEnd?: () => void;
}

export function useVoiceCommand({ onResult, onEnd }: UseVoiceCommandOptions) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Keep stable refs so the VoiceService callbacks always see latest.
  const onResultRef = useRef(onResult);
  const onEndRef = useRef(onEnd);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onEndRef.current = onEnd; }, [onEnd]);

  const serviceRef = useRef<VoiceService | null>(null);

  // Lazy-init the VoiceService (singleton per hook instance).
  if (!serviceRef.current) {
    serviceRef.current = new VoiceService(
      {
        onStatus: setStatus,
        onTranscript: setTranscript,
        onError: (msg) => setError(msg || null),
        onResult: (text) => onResultRef.current(text),
        onEnd: () => onEndRef.current?.(),
      },
      { maxListenMs: 15_000 },
    );
  }

  // ── Wire native speech recognition events ───────────────────────────────
  // expo-speech-recognition uses React hooks for event subscriptions.
  // These must be called unconditionally (React rules of hooks).

  if (Platform.OS !== "web" && useSpeechRecognitionEvent) {
    // Result events (interim and final)
    useSpeechRecognitionEvent("result", (event: any) => {
      const service = serviceRef.current;
      if (!service) return;

      const results = event.results;
      if (!results || results.length === 0) return;

      const latest = results[results.length - 1];
      const text = latest?.transcript ?? "";
      const isFinal = latest?.isFinal ?? false;

      service.handleNativeResult(text, isFinal);
    });

    // Error events
    useSpeechRecognitionEvent("error", (event: any) => {
      const service = serviceRef.current;
      if (!service) return;

      const errorCode = event.error || "unknown";
      service.handleNativeError(errorCode);
    });

    // End event (recognition engine stopped)
    useSpeechRecognitionEvent("end", () => {
      const service = serviceRef.current;
      if (!service) return;

      service.handleNativeEnd();
    });
  }

  const isSupported = serviceRef.current.isSupported;

  const start = useCallback(() => {
    setTranscript("");
    setError(null);
    void serviceRef.current?.start();
  }, []);

  const finish = useCallback(() => {
    setError(null);
    void serviceRef.current?.finish();
  }, []);

  const stop = useCallback(() => {
    setTranscript("");
    setError(null);
    void serviceRef.current?.cancel();
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      serviceRef.current?.dispose();
      serviceRef.current = null;
    };
  }, []);

  return { start, finish, stop, status, transcript, error, isSupported };
}
