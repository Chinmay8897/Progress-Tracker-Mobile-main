/**
 * VoiceService — Speech-to-text capture.
 *
 * Two backends:
 * - Web:    Web Speech API (browser-side, no API key needed)
 * - Native: Records audio with expo-av, sends to backend proxy
 *           (backend forwards to Groq Whisper — API key is server-side only)
 *
 * Guards against double-start, cleans up listeners/recording properly,
 * and maps all known error codes to user-friendly messages.
 */

import { Platform } from "react-native";
import { Audio } from "expo-av";
import { transcribeAudio } from "@/services/api";
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

function getMimeType(uri: string): { mimeType: string; filename: string } {
  const ext = uri.toLowerCase().match(/\.([a-z0-9]+)(\?|#|$)/)?.[1] ?? "m4a";
  const map: Record<string, string> = {
    m4a: "audio/m4a", mp4: "audio/mp4", mp3: "audio/mpeg",
    wav: "audio/wav", caf: "audio/x-caf", aac: "audio/aac",
    ogg: "audio/ogg", opus: "audio/opus", webm: "audio/webm",
    "3gp": "audio/3gpp", "3gpp": "audio/3gpp",
  };
  return { mimeType: map[ext] ?? "audio/m4a", filename: `speech.${ext}` };
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

export class VoiceService {
  private recognition: any = null;
  private recording: Audio.Recording | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private status: VoiceStatus = "idle";
  private disposed = false;
  private finishing = false;

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
    return Platform.OS !== "web" || isWebSpeechSupported();
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
    await this.stopNativeRecording();

    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        this.setStatus("error");
        this.cb.onError("Microphone access denied. Please allow microphone access and try again.");
        this.cb.onEnd?.();
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      this.recording = rec;

      this.setStatus("listening");

      this.timer = setTimeout(() => void this.finish(), this.maxListenMs);
    } catch {
      this.setStatus("error");
      this.cb.onError("Could not start microphone. Please try again.");
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
        }, 600);
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

    const rec = this.recording;
    this.recording = null;

    if (!rec) {
      this.setStatus("error");
      this.cb.onError("Recording was not started. Try again.");
      this.cb.onEnd?.();
      this.finishing = false;
      return;
    }

    this.setStatus("processing");

    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      if (!uri) {
        this.setStatus("error");
        this.cb.onError("Could not access the recorded audio.");
        this.cb.onEnd?.();
        return;
      }

      const { mimeType, filename } = getMimeType(uri);
      
      // Abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
      
      let text = "";
      try {
        text = await transcribeAudio(uri, mimeType, filename, controller.signal);
      } finally {
        clearTimeout(timeoutId);
      }

      if (this.disposed || this.status !== "processing") return;

      this.cb.onTranscript(text);

      if (!text) {
        this.setStatus("error");
        this.cb.onError("No speech detected. Please try again.");
        this.cb.onEnd?.();
        return;
      }

      this.cb.onResult(text);
      setTimeout(() => {
        this.setStatus("done");
        this.cb.onEnd?.();
      }, 600);
    } catch (err: any) {
      this.setStatus("error");
      const detail = err?.message && err.message !== "undefined"
        ? err.message
        : "Could not process audio. Please try again or type your command below.";
      this.cb.onError(detail);
      this.cb.onEnd?.();
    } finally {
      this.finishing = false;
    }
  }

  // ── Cancel ──────────────────────────────────────────────────────────────

  async cancel(): Promise<void> {
    this.finishing = false;
    this.clearTimer();
    try { this.recognition?.stop(); } catch { /* ignore */ }
    await this.stopNativeRecording();
    if (Platform.OS !== "web") {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
      } catch {
        // ignore audio mode reset failures
      }
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
    void this.stopNativeRecording();
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async stopNativeRecording(): Promise<void> {
    const rec = this.recording;
    this.recording = null;
    if (!rec) return;
    try {
      const s = await rec.getStatusAsync();
      if (s.isRecording) await rec.stopAndUnloadAsync();
    } catch { /* ignore */ }
    if (Platform.OS !== "web") {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
      } catch {
        // ignore audio mode reset failures
      }
    }
  }
}
