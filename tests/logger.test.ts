import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { logger, sanitizeLogData } from "../src/lib/logger.ts";

describe("Logger Sanitization & Data Protection", () => {
  test("Redacts sensitive auth and key fields in metadata", () => {
    const rawData = {
      userId: "user_12345",
      location: { lat: 37.5665, lng: 126.978 },
      vapid_private_key: "super_secret_private_key_abc",
      token: "bearer_xyz_jwt",
      auth: "auth_token_value",
      password: "mySecretPassword123",
      safeNote: "Sunny day forecast",
    };

    const sanitized = sanitizeLogData(rawData) as Record<string, unknown>;

    assert.equal(sanitized.userId, "user_12345");
    assert.deepEqual(sanitized.location, { lat: 37.5665, lng: 126.978 });
    assert.equal(sanitized.vapid_private_key, "[REDACTED]");
    assert.equal(sanitized.token, "[REDACTED]");
    assert.equal(sanitized.auth, "[REDACTED]");
    assert.equal(sanitized.password, "[REDACTED]");
    assert.equal(sanitized.safeNote, "Sunny day forecast");
  });

  test("Handles nested objects and arrays with deep sanitization", () => {
    const nested = {
      users: [
        { id: 1, secret: "classified" },
        { id: 2, apiKey: "safeKey", p256dh: "browser_push_key" },
      ],
      nestedConfig: {
        db: {
          serviceKey: "kma_secret_api_key",
          port: 5432,
        },
      },
    };

    interface SanitizedNested {
      users: Array<{ id: number; secret?: string; apiKey?: string; p256dh?: string }>;
      nestedConfig: { db: { serviceKey: string; port: number } };
    }
    const sanitized = sanitizeLogData(nested) as unknown as SanitizedNested;

    assert.equal(sanitized.users[0].secret, "[REDACTED]");
    assert.equal(sanitized.users[1].p256dh, "[REDACTED]");
    assert.equal(sanitized.nestedConfig.db.serviceKey, "[REDACTED]");
    assert.equal(sanitized.nestedConfig.db.port, 5432);
  });

  test("Handles Error objects and serializes properties safely", () => {
    const err = new Error("KMA connection timed out") as Error & { serviceKey?: string };
    err.serviceKey = "leaked_service_key";

    const sanitized = sanitizeLogData(err) as Record<string, unknown>;

    assert.equal(sanitized.name, "Error");
    assert.equal(sanitized.message, "KMA connection timed out");
    assert.equal(sanitized.serviceKey, "[REDACTED]");
    assert.ok(sanitized.stack);
  });

  test("Handles primitives and null/undefined values without throwing", () => {
    assert.equal(sanitizeLogData(null), null);
    assert.equal(sanitizeLogData(undefined), undefined);
    assert.equal(sanitizeLogData("simple string"), "simple string");
    assert.equal(sanitizeLogData(42), 42);
    assert.equal(sanitizeLogData(true), true);
  });
});

describe("Structured Logger API & Safe Execution", () => {
  test("logger.debug / info / warn / error execute without throwing", () => {
    // Should execute safely across all methods
    assert.doesNotThrow(() => {
      logger.debug("TestTag", "Debug message test", { count: 1 });
      logger.info("[TestTag]", "Info message test", { status: "ok" });
      logger.warn("TestTag", "Warning message test", { retries: 3 });
      logger.error("TestTag", "Error message test", new Error("Simulated failure"), { code: 500 });
      logger.error("TestTag", "Error without Error instance", "String error", { code: 400 });
      logger.error("TestTag", "Error with only meta", undefined, { detail: "something" });
    });
  });

  test("logger methods handle empty metadata and custom tags gracefully", () => {
    assert.doesNotThrow(() => {
      logger.info("", "Message without tag");
      logger.error("[KMA]", "KMA error message");
    });
  });
});
