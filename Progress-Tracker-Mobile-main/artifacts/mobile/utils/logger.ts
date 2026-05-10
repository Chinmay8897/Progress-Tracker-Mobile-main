/**
 * Structured logging utility.
 *
 * In production (__DEV__ === false) only warnings and errors are emitted.
 * In development all levels are active.
 *
 * Replace the transport functions below if you need to send logs to a
 * remote service (e.g. Sentry, Datadog).
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: LogLevel = typeof __DEV__ !== "undefined" && __DEV__ ? "debug" : "warn";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

function formatMessage(level: LogLevel, tag: string, message: string): string {
  const ts = new Date().toISOString();
  return `[${ts}] [${level.toUpperCase()}] [${tag}] ${message}`;
}

export const logger = {
  debug(tag: string, message: string, ...args: unknown[]): void {
    if (!shouldLog("debug")) return;
    // eslint-disable-next-line no-console
    console.debug(formatMessage("debug", tag, message), ...args);
  },

  info(tag: string, message: string, ...args: unknown[]): void {
    if (!shouldLog("info")) return;
    // eslint-disable-next-line no-console
    console.info(formatMessage("info", tag, message), ...args);
  },

  warn(tag: string, message: string, ...args: unknown[]): void {
    if (!shouldLog("warn")) return;
    // eslint-disable-next-line no-console
    console.warn(formatMessage("warn", tag, message), ...args);
  },

  error(tag: string, message: string, ...args: unknown[]): void {
    if (!shouldLog("error")) return;
    // eslint-disable-next-line no-console
    console.error(formatMessage("error", tag, message), ...args);
  },
};
