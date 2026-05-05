import { useCallback, useEffect, useRef, useState } from "react";
import { VoiceService, type VoiceStatus as ServiceVoiceStatus } from "@/domain/voice/VoiceService";

export type VoiceStatus = ServiceVoiceStatus;

interface UseVoiceCommandOptions {
  onResult: (transcript: string) => void;
  onEnd?: () => void;
}

export function useVoiceCommand({ onResult, onEnd }: UseVoiceCommandOptions) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const onResultRef = useRef(onResult);
  const onEndRef = useRef(onEnd);
  const serviceRef = useRef<VoiceService | null>(null);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    onEndRef.current = onEnd;
  }, [onEnd]);

  if (!serviceRef.current) {
    serviceRef.current = new VoiceService(
      {
        onStatus: setStatus,
        onTranscript: setTranscript,
        onError: (msg) => setError(msg ? msg : null),
        onResult: (finalText) => onResultRef.current(finalText),
        onEnd: () => onEndRef.current?.(),
      },
      {
        // Longer window for multi-field task commands.
        maxListenMs: 12_000,
      },
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

  // Cancel/reset (no transcription).
  const stop = useCallback(() => {
    setTranscript("");
    setError(null);
    void serviceRef.current?.cancel();
  }, []);

  useEffect(() => {
    return () => {
      serviceRef.current?.dispose();
      serviceRef.current = null;
    };
  }, []);

  return { start, finish, stop, status, transcript, error, isSupported };
}
