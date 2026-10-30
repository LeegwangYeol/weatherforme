/**
 * Structured Logger for WeatherForMe
 * Supports log levels, context tags, structured metadata, sensitive data sanitization,
 * and seamless Sentry telemetry integration.
 */

import * as Sentry from "@sentry/nextjs";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(tag: string, message: string, meta?: Record<string, unknown>): void;
  info(tag: string, message: string, meta?: Record<string, unknown>): void;
  warn(tag: string, message: string, meta?: Record<string, unknown>): void;
  error(tag: string, message: string, error?: unknown, meta?: Record<string, unknown>): void;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const SENSITIVE_KEYS = new Set([
  "vapid_private_key",
  "vapidprivatekey",
  "privatekey",
  "private_key",
  "token",
  "endpoint",
  "auth",
  "authorization",
  "password",
  "secret",
  "servicekey",
  "apihub_key",
  "p256dh",
  "cookie",
]);

/**
 * Recursively sanitize metadata to prevent leaking sensitive credentials in logs and telemetry
 */
export function sanitizeLogData(data: unknown, depth = 0): unknown {
  if (depth > 5 || data === null || data === undefined) {
    return data;
  }

  if (typeof data !== "object") {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogData(item, depth + 1));
  }

  if (data instanceof Error) {
    const errorObj: Record<string, unknown> = {
      name: data.name,
      message: data.message,
      stack: data.stack,
    };
    for (const [k, v] of Object.entries(data as unknown as Record<string, unknown>)) {
      if (k !== "name" && k !== "message" && k !== "stack") {
        errorObj[k] = v;
      }
    }
    return sanitizeLogData(errorObj, depth + 1);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase().replace(/[-_]/g, "");
    const isSensitive =
      SENSITIVE_KEYS.has(lowerKey) ||
      lowerKey.includes("password") ||
      lowerKey.includes("secret") ||
      lowerKey.includes("token") ||
      lowerKey.includes("privatekey");

    if (isSensitive) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeLogData(value, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function normalizeTag(tag: string): string {
  if (!tag) return "App";
  return tag.startsWith("[") && tag.endsWith("]") ? tag.slice(1, -1) : tag;
}

function getCurrentLogLevel(): LogLevel {
  const envLevel = process.env.NEXT_PUBLIC_LOG_LEVEL || process.env.LOG_LEVEL;
  if (envLevel && envLevel in LEVEL_PRIORITY) {
    return envLevel as LogLevel;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function shouldLog(level: LogLevel): boolean {
  const currentLevel = getCurrentLogLevel();
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
}

function formatConsoleMessage(
  level: LogLevel,
  tag: string,
  message: string,
  meta?: Record<string, unknown>
): [string, ...unknown[]] {
  const cleanTag = normalizeTag(tag);
  const prefix = `[WeatherForMe][${cleanTag}]`;
  const sanitizedMeta = meta ? sanitizeLogData(meta) : undefined;

  if (sanitizedMeta && Object.keys(sanitizedMeta as object).length > 0) {
    return [`${prefix} ${message}`, sanitizedMeta];
  }
  return [`${prefix} ${message}`];
}

export const logger: Logger = {
  debug(tag: string, message: string, meta?: Record<string, unknown>): void {
    if (!shouldLog("debug")) return;
    const cleanTag = normalizeTag(tag);
    const [formattedMsg, ...args] = formatConsoleMessage("debug", cleanTag, message, meta);
    console.debug(formattedMsg, ...args);

    try {
      Sentry.addBreadcrumb({
        category: cleanTag,
        message,
        level: "debug",
        data: meta ? (sanitizeLogData(meta) as Record<string, unknown>) : undefined,
      });
    } catch {
      // Sentry fallback no-op
    }
  },

  info(tag: string, message: string, meta?: Record<string, unknown>): void {
    if (!shouldLog("info")) return;
    const cleanTag = normalizeTag(tag);
    const [formattedMsg, ...args] = formatConsoleMessage("info", cleanTag, message, meta);
    console.info(formattedMsg, ...args);

    try {
      Sentry.addBreadcrumb({
        category: cleanTag,
        message,
        level: "info",
        data: meta ? (sanitizeLogData(meta) as Record<string, unknown>) : undefined,
      });
    } catch {
      // Sentry fallback no-op
    }
  },

  warn(tag: string, message: string, meta?: Record<string, unknown>): void {
    if (!shouldLog("warn")) return;
    const cleanTag = normalizeTag(tag);
    const [formattedMsg, ...args] = formatConsoleMessage("warn", cleanTag, message, meta);
    console.warn(formattedMsg, ...args);

    try {
      Sentry.addBreadcrumb({
        category: cleanTag,
        message,
        level: "warning",
        data: meta ? (sanitizeLogData(meta) as Record<string, unknown>) : undefined,
      });
    } catch {
      // Sentry fallback no-op
    }
  },

  error(tag: string, message: string, error?: unknown, meta?: Record<string, unknown>): void {
    if (!shouldLog("error")) return;
    const cleanTag = normalizeTag(tag);
    const sanitizedMeta = meta ? (sanitizeLogData(meta) as Record<string, unknown>) : undefined;
    const prefix = `[WeatherForMe][${cleanTag}]`;

    if (error !== undefined) {
      if (sanitizedMeta) {
        console.error(`${prefix} ${message}`, error, sanitizedMeta);
      } else {
        console.error(`${prefix} ${message}`, error);
      }
    } else if (sanitizedMeta) {
      console.error(`${prefix} ${message}`, sanitizedMeta);
    } else {
      console.error(`${prefix} ${message}`);
    }

    try {
      const extraData = {
        ...sanitizedMeta,
        logMessage: message,
      };

      if (error instanceof Error) {
        Sentry.captureException(error, {
          tags: { context: cleanTag },
          extra: extraData,
        });
      } else if (error !== undefined && error !== null) {
        Sentry.captureMessage(`${prefix} ${message}: ${String(error)}`, {
          level: "error",
          tags: { context: cleanTag },
          extra: extraData,
        });
      } else {
        Sentry.captureMessage(`${prefix} ${message}`, {
          level: "error",
          tags: { context: cleanTag },
          extra: extraData,
        });
      }
    } catch {
      // Sentry fallback no-op
    }
  },
};

export default logger;
