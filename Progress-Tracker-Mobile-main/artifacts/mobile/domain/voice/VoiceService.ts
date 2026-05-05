import { Platform } from "react-native";
import Constants from "expo-constants";
import { Audio } from "expo-av";

export type VoiceStatus = "idle" | "listening" | "processing" | "done" | "error" | "unsupported";

export interface VoiceServiceCallbacks {
  onStatus: (status: VoiceStatus) => void;
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
  onResult: (finalTranscript: string) => void;
  onEnd?: () => void;
}

export interface VoiceServiceOptions {
  /** Auto-finish after this window (ms). Default: 12000 */
  maxListenMs?: number;
  language?: string;
}

function isWebSpeechSupported(): boolean {
  return (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
  );
}

function getOpenAiApiKey(): string {
  const envKey = (process.env as any)?.EXPO_PUBLIC_OPENAI_API_KEY as string | undefined;
  const extraKey = (Constants.expoConfig as any)?.extra?.EXPO_PUBLIC_OPENAI_API_KEY as string | undefined;
  return (envKey ?? extraKey ?? "").trim();
}

function getMimeTypeFromUri(uri: string): { mimeType: string; filename: string } {
  const uriLower = uri.toLowerCase();
  const extMatch = uriLower.match(/\.([a-z0-9]+)(\?|#|$)/);
  const ext = extMatch?.[1] ?? "m4a";
  const mimeByExt: Record<string, string> = {
    m4a: "audio/m4a",
    mp4: "audio/mp4",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    caf: "audio/x-caf",
    aac: "audio/aac",
    ogg: "audio/ogg",
    opus: "audio/opus",
    webm: "audio/webm",
    "3gp": "audio/3gpp",
    "3gpp": "audio/3gpp",
    "3g2": "audio/3gpp2",
  };
  return {
    mimeType: mimeByExt[ext] ?? "audio/m4a",
    filename: `speech.${ext}`,
  };
}

export class VoiceService {
  private recognition: any | null = null;
  private recording: Audio.Recording | null = null;
  private timer: any = null;
  private status: VoiceStatus = "idle";

  private readonly maxListenMs: number;
  private readonly language: string;

  constructor(
    private readonly callbacks: VoiceServiceCallbacks,
    options: VoiceServiceOptions = {},
  ) {
    this.maxListenMs = options.maxListenMs ?? 12_000;
    this.language = options.language ?? "en-US";
  }

  get isSupported(): boolean {
    return Platform.OS !== "web" || isWebSpeechSupported();
  }

  private setStatus(next: VoiceStatus) {
    this.status = next;
    this.callbacks.onStatus(next);
  }

  async start(): Promise<void> {
    if (!this.isSupported) {
      this.setStatus("unsupported");
      return;
    }

    this.callbacks.onTranscript("");

    if (Platform.OS !== "web") {
      await this.cancelNativeRecording();

      try {
        const apiKey = getOpenAiApiKey();
        if (!apiKey) {
          this.setStatus("error");
          this.callbacks.onError("Missing OpenAI API key. Set EXPO_PUBLIC_OPENAI_API_KEY and try again.");
          this.callbacks.onEnd?.();
          return;
        }

        const perm = await Audio.requestPermissionsAsync();
        if (!perm.granted) {
          this.setStatus("error");
          this.callbacks.onError("Microphone access denied. Please allow microphone access and try again.");
          this.callbacks.onEnd?.();
          return;
        }

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });

        const rec = new Audio.Recording();
        await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        await rec.startAsync();
        this.recording = rec;

        this.setStatus("listening");

        // Auto-finish as a safety net. Prefer manual stop via finish().
        this.timer = setTimeout(() => {
          void this.finish();
        }, this.maxListenMs);
      } catch {
        this.setStatus("error");
        this.callbacks.onError("Could not start microphone. Try again.");
        this.callbacks.onEnd?.();
      }

      return;
    }

    if (!isWebSpeechSupported()) {
      this.setStatus("unsupported");
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    const recognition = new SpeechRecognition();
    recognition.lang = this.language;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
    this.recognition = recognition;

    recognition.onstart = () => {
      this.setStatus("listening");
    };

    recognition.onresult = (event: any) => {
      const results = Array.from(event.results as SpeechRecognitionResultList);
      const latest = results[results.length - 1];
      const text = String(latest[0]?.transcript ?? "").trim();
      this.callbacks.onTranscript(text);

      if (latest.isFinal) {
        this.setStatus("processing");
        this.callbacks.onResult(text);
        setTimeout(() => {
          this.setStatus("done");
          this.callbacks.onEnd?.();
        }, 800);
      }
    };

    recognition.onerror = (event: any) => {
      const msg =
        event.error === "not-allowed"
          ? "Microphone access denied. Please allow microphone access and try again."
          : event.error === "no-speech"
          ? "No speech detected. Please try again."
          : `Error: ${event.error}`;
      this.callbacks.onError(msg);
      this.setStatus("error");
      this.callbacks.onEnd?.();
    };

    recognition.onend = () => {
      // If user stopped while listening, consider it done.
      if (this.status === "listening") {
        this.setStatus("done");
        this.callbacks.onEnd?.();
      }
    };

    try {
      recognition.start();
    } catch {
      this.callbacks.onError("Could not start microphone. Try again.");
      this.setStatus("error");
    }
  }

  /**
   * Finish capture and produce a transcript (native: Whisper transcription).
   *
   * On web this just stops recognition; final transcript is produced by the API.
   */
  async finish(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (Platform.OS === "web") {
      try {
        this.recognition?.stop();
      } catch {
        // ignore
      }
      return;
    }

    const rec = this.recording;
    this.recording = null;

    if (!rec) {
      this.setStatus("error");
      this.callbacks.onError("Recording was not started. Try again.");
      this.callbacks.onEnd?.();
      return;
    }

    this.setStatus("processing");

    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      if (!uri) {
        this.setStatus("error");
        this.callbacks.onError("Could not access the recorded audio.");
        this.callbacks.onEnd?.();
        return;
      }

      const apiKey = getOpenAiApiKey();
      if (!apiKey) {
        this.setStatus("error");
        this.callbacks.onError("Missing OpenAI API key. Set EXPO_PUBLIC_OPENAI_API_KEY and try again.");
        this.callbacks.onEnd?.();
        return;
      }

      const { mimeType, filename } = getMimeTypeFromUri(uri);

      const form = new FormData();
      form.append("model", "whisper-1");
      form.append("language", "en");
      form.append("response_format", "json");
      form.append(
        "file",
        {
          uri,
          name: filename,
          type: mimeType,
        } as any,
      );

      const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: form,
      });

      if (!resp.ok) {
        let details = "";
        try {
          const errJson = await resp.json();
          details = errJson?.error?.message ? ` (${errJson.error.message})` : "";
        } catch {
          // ignore
        }
        this.setStatus("error");
        this.callbacks.onError(`Transcription failed${details}.`);
        this.callbacks.onEnd?.();
        return;
      }

      const json: any = await resp.json();
      const text = String(json?.text ?? "").trim();
      this.callbacks.onTranscript(text);

      if (!text) {
        this.setStatus("error");
        this.callbacks.onError("No speech detected. Please try again.");
        this.callbacks.onEnd?.();
        return;
      }

      this.callbacks.onResult(text);
      setTimeout(() => {
        this.setStatus("done");
        this.callbacks.onEnd?.();
      }, 800);
    } catch {
      this.setStatus("error");
      this.callbacks.onError("Could not process audio. Please try again.");
      this.callbacks.onEnd?.();
    }
  }

  /** Cancel capture and reset state (no transcription). */
  async cancel(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    try {
      this.recognition?.stop();
    } catch {
      // ignore
    }

    await this.cancelNativeRecording();

    this.callbacks.onTranscript("");
    this.callbacks.onError("");
    this.setStatus("idle");
  }

  dispose(): void {
    try {
      this.recognition?.abort();
    } catch {
      // ignore
    }
    this.recognition = null;
    void this.cancelNativeRecording();
  }

  private async cancelNativeRecording(): Promise<void> {
    const rec = this.recording;
    this.recording = null;

    if (!rec) return;

    try {
      const status = await rec.getStatusAsync();
      if (status.isRecording) {
        await rec.stopAndUnloadAsync();
      }
    } catch {
      // ignore
    }
  }
}
