/**
 * VoiceService — On-device speech-to-text capture.
 *
 * HYBRID ARCHITECTURE (v2):
 * - Web:    Web Speech API (browser-side, no API key needed)
 * - Native: expo-speech-recognition (on-device STT, no backend upload)
 *
 * Key change from v1:
 *   Audio is NEVER uploaded to the backend. Speech recognition happens
 *   entirely on-device. Only the final text transcript is sent to the
 *   backend for intent parsing and task creation.
 *
 * Guards against double-start, cleans up listeners/recording properly,
 * and maps all known error codes to user-friendly messages.
 */

import { Platform } from "react-native";
import {
  ExpoSpeechRecognitionModule,
} from "expo-speech-recognition";
import type { VoiceStatus, VoiceCaptureCallbacks, VoiceCaptureOptions } from "./types";

// Re-export the status type for consumers.
export type { VoiceStatus };

function isWebSpeechSupported(): boolean {
  return (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
  );
}

/** Map all Web Speech API error codes to actionable messages. */
const WEB_SPEECH_ERRORS: Record<string, string> = {
  "not-allowed": "Microphone access denied. Please allow microphone access in your browser settings.",
  "no-speech": "No speech detected. Please try again or type your command below.",
  "network": "Voice recognition requires an internet connection. Please type your command in the text box below.",
  "audio-capture": "No microphone found. Please connect a microphone or type your command below.",
  "aborted": "Voice recognition was interrupted. Please try again.",
  "service-not-allowed": "Voice recognition is not permitted in this browser. Please type your command below.",
  "language-not-supported": "Your language is not supported. Please type your command in English below.",
  "bad-grammar": "Voice recognition encountered an issue. Please try again.",
};

/** Map native speech recognition error codes to user-friendly messages. */
const NATIVE_SPEECH_ERRORS: Record<string, string> = {
  "not-allowed": "Microphone or speech recognition permission denied. Please enable in Settings.",
  "no-speech": "No speech detected. Please try again or type your command below.",
  "audio-capture": "Could not access the microphone. Please check your device settings.",
  "network": "Speech recognition requires a network connection on this device.",
  "aborted": "Voice recognition was interrupted. Please try again.",
  "service-not-allowed": "Speech recognition is not available on this device.",
  "language-not-supported": "Your language is not supported for speech recognition.",
  "busy": "Speech recognition is currently in use. Please wait and try again.",
};

export class VoiceService {
  private recognition: any = null; // Web SpeechRecognition instance
  private timer: ReturnType<typeof setTimeout> | null = null;
  private status: VoiceStatus = "idle";
  private disposed = false;
  private finishing = false;
  private nativeListening = false;

  private readonly maxListenMs: number;
  private readonly language: string;

  constructor(
    private readonly cb: VoiceCaptureCallbacks,
    opts: VoiceCaptureOptions = {},
  ) {
    this.maxListenMs = opts.maxListenMs ?? 15_000;
    this.language = opts.language ?? "en-US";
  }

  get isSupported(): boolean {
    if (Platform.OS === "web") return isWebSpeechSupported();
    // Native: expo-speech-recognition is available on Android and iOS
    return true;
  }

  private setStatus(next: VoiceStatus) {
    if (this.disposed) return;
    this.status = next;
    this.cb.onStatus(next);
  }

  // ── Start ───────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.disposed) return;

    // Guard: prevent double-start
    if (this.status === "listening" || this.status === "processing") return;

    if (!this.isSupported) {
      this.setStatus("unsupported");
      return;
    }

    this.cb.onTranscript("");
    this.cb.onError("");

    if (Platform.OS !== "web") {
      await this.startNative();
    } else {
      this.startWeb();
    }
  }

  private async startNative(): Promise<void> {
    // Stop any existing session first
    if (this.nativeListening) {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch { /* ignore */ }
      this.nativeListening = false;
    }

    try {
      // Request permissions
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!result.granted) {
        this.setStatus("error");
        this.cb.onError("Microphone or speech recognition permission denied. Please enable in Settings and try again.");
        this.cb.onEnd?.();
        return;
      }

      // Start speech recognition
      ExpoSpeechRecognitionModule.start({
        lang: this.language,
        interimResults: true,
        maxAlternatives: 1,
        continuous: false,
      });

      this.nativeListening = true;
      this.setStatus("listening");

      // Auto-stop after timeout
      this.timer = setTimeout(() => void this.finish(), this.maxListenMs);
    } catch (err: any) {
      this.setStatus("error");
      const msg = err?.message || "Could not start speech recognition. Please try again.";
      this.cb.onError(msg);
      this.cb.onEnd?.();
    }
  }

  private startWeb(): void {
    const SpeechRecognition =
      (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

    const recognition = new SpeechRecognition();
    recognition.lang = this.language;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
    this.recognition = recognition;

    recognition.onstart = () => this.setStatus("listening");

    recognition.onresult = (event: any) => {
      if (this.disposed) return;
      const results = Array.from(event.results as SpeechRecognitionResultList);
      const latest = results[results.length - 1];
      const text = String(latest[0]?.transcript ?? "").trim();
      this.cb.onTranscript(text);

      if (latest.isFinal) {
        this.setStatus("processing");
        this.cb.onResult(text);
        setTimeout(() => {
          this.setStatus("done");
          this.cb.onEnd?.();
        }, 300);
      }
    };

    recognition.onerror = (event: any) => {
      if (this.disposed) return;
      const msg = WEB_SPEECH_ERRORS[event.error]
        ?? `Voice recognition failed (${event.error}). Please type your command below.`;
      this.cb.onError(msg);
      this.setStatus("error");
      this.cb.onEnd?.();
    };

    recognition.onend = () => {
      if (this.status === "listening") {
        this.setStatus("done");
        this.cb.onEnd?.();
      }
    };

    try {
      recognition.start();
    } catch {
      this.cb.onError("Could not start microphone. Try again.");
      this.setStatus("error");
    }
  }

  // ── Native Event Handlers (called from the hook) ───────────────────────

  /**
   * Handle native speech recognition result events.
   * Called by the hook via useSpeechRecognitionEvent.
   */
  handleNativeResult(transcript: string, isFinal: boolean): void {
    if (this.disposed || !this.nativeListening) return;

    this.cb.onTranscript(transcript);

    if (isFinal && transcript.trim()) {
      this.clearTimer();
      this.nativeListening = false;
      this.setStatus("processing");
      this.cb.onResult(transcript.trim());
      setTimeout(() => {
        this.setStatus("done");
        this.cb.onEnd?.();
      }, 300);
    }
  }

  /**
   * Handle native speech recognition error events.
   * Called by the hook via useSpeechRecognitionEvent.
   */
  handleNativeError(errorCode: string): void {
    if (this.disposed) return;
    this.clearTimer();
    this.nativeListening = false;

    const msg = NATIVE_SPEECH_ERRORS[errorCode]
      ?? `Speech recognition failed (${errorCode}). Please type your command below.`;
    this.cb.onError(msg);
    this.setStatus("error");
    this.cb.onEnd?.();
  }

  /**
   * Handle native speech recognition end event (called when engine stops).
   */
  handleNativeEnd(): void {
    if (this.disposed) return;
    this.clearTimer();

    // If we were still in listening state (no final result came),
    // treat as "no speech detected"
    if (this.status === "listening" && this.nativeListening) {
      this.nativeListening = false;
      this.cb.onError("No speech detected. Please try again or type your command below.");
      this.setStatus("error");
      this.cb.onEnd?.();
    }
  }

  // ── Finish ──────────────────────────────────────────────────────────────

  async finish(): Promise<void> {
    if (this.disposed || this.finishing) return;
    this.finishing = true;
    this.clearTimer();

    if (Platform.OS === "web") {
      try { this.recognition?.stop(); } catch { /* ignore */ }
      this.finishing = false;
      return;
    }

    // Native: stop the speech recognizer — it will deliver the final result
    // via the event handler
    if (this.nativeListening) {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch { /* ignore */ }
    }

    this.finishing = false;
  }

  // ── Cancel ──────────────────────────────────────────────────────────────

  async cancel(): Promise<void> {
    this.finishing = false;
    this.clearTimer();

    // Web
    try { this.recognition?.stop(); } catch { /* ignore */ }

    // Native
    if (this.nativeListening) {
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch { /* ignore */ }
      this.nativeListening = false;
    }

    this.cb.onTranscript("");
    this.cb.onError("");
    this.setStatus("idle");
  }

  // ── Dispose ─────────────────────────────────────────────────────────────

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    try { this.recognition?.abort(); } catch { /* ignore */ }
    this.recognition = null;

    if (this.nativeListening) {
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch { /* ignore */ }
      this.nativeListening = false;
    }
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
