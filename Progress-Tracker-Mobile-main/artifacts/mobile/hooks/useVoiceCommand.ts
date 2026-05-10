/**
 * useVoiceCommand — React hook for the voice command pipeline.
 *
 * Orchestrates:
 * 1. Voice capture (VoiceService)
 * 2. Lifecycle management (start/stop/cancel/dispose)
 * 3. State (status, transcript, error)
 *
 * The hook ONLY handles speech capture. Command parsing and execution
 * are handled by the parent component via the onResult callback.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { VoiceService, type VoiceStatus } from "@/domain/voice/VoiceService";

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
