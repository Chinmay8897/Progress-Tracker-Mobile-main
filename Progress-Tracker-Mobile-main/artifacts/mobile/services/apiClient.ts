import { config } from "@/utils/config";
import { logger } from "@/utils/logger";

export const MAX_RETRIES = 4;

// Custom event emitter for Cold Start to show full-screen UI
export const apiEventEmitter = {
  listeners: new Set<(waking: boolean) => void>(),
  emit(waking: boolean) {
    this.listeners.forEach(cb => cb(waking));
  },
  subscribe(cb: (waking: boolean) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
};

/**
 * Lightweight ping to wake up Render backend without hitting DB.
 */
export async function pingHealthEndpoint(): Promise<boolean> {
  const baseUrl = config.apiBaseUrl;
  if (!baseUrl) return false;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${baseUrl}/api/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    return res.ok;
  } catch (err) {
    return false;
  }
}

/**
 * Fetch wrapper with automatic retry, exponential backoff, and cold-start detection.
 */
export async function fetchWithRetry(url: string, options: RequestInit, retries = MAX_RETRIES): Promise<Response> {
  let attempt = 0;
  
  while (attempt <= retries) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
      
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      
      // Do not retry on client errors (400-499)
      if (response.status >= 400 && response.status < 500) {
        if (attempt > 0) apiEventEmitter.emit(false);
        return response;
      }
      
      // Retry on Render cold start / gateway errors
      if (response.status === 502 || response.status === 503 || response.status === 504) {
        throw new Error(`Server returned ${response.status}`);
      }
      
      // Success or 500
      if (attempt > 0) apiEventEmitter.emit(false);
      return response;
      
    } catch (err: any) {
      const isAbort = err.name === "AbortError";
      const isNetwork = err.message.includes("Network request failed") || err.message.includes("Failed to fetch") || err.message.includes("ECONNREFUSED");
      
      if (!isAbort && !isNetwork && !err.message.includes("Server returned")) {
        if (attempt > 0) apiEventEmitter.emit(false);
        throw err;
      }
      
      if (attempt >= retries) {
        apiEventEmitter.emit(false);
        throw err;
      }
      
      logger.warn("API", `Cold start detected! Request failed (Attempt ${attempt + 1}/${retries}). Waking server...`);
      apiEventEmitter.emit(true);
      
      // Exponential backoff: 3s, 6s, 12s, 24s (total 45s, perfect for Render)
      const delay = 3000 * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Try a lightweight health ping to help wake it up
      await pingHealthEndpoint();
      
      attempt++;
    }
  }
  
  throw new Error("Max retries exceeded");
}
