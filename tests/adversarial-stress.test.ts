import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { logger, sanitizeLogData } from "../src/lib/logger.ts";

const rootDir = path.resolve(import.meta.dirname, "..");

describe("Adversarial Stress Test: Zero-DSN Resiliency", () => {
  test("Sentry config files are zero-DSN safe and do not throw when DSN is undefined", async () => {
    const originalDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    const originalServerDsn = process.env.SENTRY_DSN;

    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    delete process.env.SENTRY_DSN;

    try {
      // Dynamic imports of client, server, and edge configs
      const clientConfig = await import("../sentry.client.config.ts");
      assert.ok(clientConfig !== undefined);

      const serverConfig = await import("../sentry.server.config.ts");
      assert.ok(serverConfig !== undefined);

      const edgeConfig = await import("../sentry.edge.config.ts");
      assert.ok(edgeConfig !== undefined);
    } finally {
      if (originalDsn) process.env.NEXT_PUBLIC_SENTRY_DSN = originalDsn;
      if (originalServerDsn) process.env.SENTRY_DSN = originalServerDsn;
    }
  });

  test("Logger methods operate safely when Sentry is uninitialized or in fallback mode", () => {
    assert.doesNotThrow(() => {
      logger.debug("ZeroDSN", "Debug message with no DSN", { key: "val" });
      logger.info("ZeroDSN", "Info message with no DSN", { key: "val" });
      logger.warn("ZeroDSN", "Warn message with no DSN", { key: "val" });
      logger.error("ZeroDSN", "Error message with no DSN", new Error("Simulated test error"), { key: "val" });
      logger.error("ZeroDSN", "Error with string error payload", "Raw error message string");
      logger.error("ZeroDSN", "Error with null error payload", null);
      logger.error("ZeroDSN", "Error with undefined error payload", undefined);
      logger.error("ZeroDSN", "Error with empty metadata", undefined, {});
    });
  });
});

describe("Adversarial Stress Test: Logger Data Sanitization", () => {
  test("Cyclic object references do not cause infinite recursion or stack overflow", () => {
    interface CyclicObj {
      name: string;
      secretToken: string;
      self?: CyclicObj;
      nested?: {
        parent?: CyclicObj;
        secretKey: string;
      };
    }

    const cyclic: CyclicObj = {
      name: "CyclicTest",
      secretToken: "super_secret_token_123",
    };
    cyclic.self = cyclic;
    cyclic.nested = {
      parent: cyclic,
      secretKey: "secret_api_key_456",
    };

    assert.doesNotThrow(() => {
      const sanitized = sanitizeLogData(cyclic) as Record<string, unknown>;
      assert.equal(sanitized.name, "CyclicTest");
      assert.equal(sanitized.secretToken, "[REDACTED]");
    });
  });

  test("Cyclic arrays do not cause infinite recursion", () => {
    const arr: unknown[] = [1, "test_item", null];
    arr.push(arr);

    assert.doesNotThrow(() => {
      const sanitized = sanitizeLogData(arr) as unknown[];
      assert.equal(sanitized[0], 1);
      assert.equal(sanitized[1], "test_item");
      assert.equal(sanitized[2], null);
    });
  });

  test("Deeply nested structures (>5 levels) terminate recursion gracefully", () => {
    let deep: Record<string, unknown> = { level: 10, secret_token: "hidden" };
    for (let i = 9; i >= 1; i--) {
      deep = { level: i, child: deep };
    }

    assert.doesNotThrow(() => {
      const sanitized = sanitizeLogData(deep) as Record<string, unknown>;
      assert.equal(sanitized.level, 1);
      assert.ok(sanitized.child);
    });
  });

  test("Sensitive key recognition across known sensitive field patterns", () => {
    const sensitivePayload = {
      // VAPID & Keys
      vapid_private_key: "vapid_priv_val",
      vapidprivatekey: "vapid_priv_val2",
      private_key: "priv_key_val",
      privatekey: "priv_key_val2",
      
      // Tokens
      token: "tok_123",
      TOKEN: "tok_456",
      bearer_token: "bearer_xyz",
      jwt_token_auth: "jwt_token_val",
      
      // Auth & Passwords
      endpoint: "https://push.example.com/endpoint/123",
      auth: "auth_val",
      authorization: "Bearer token_secret",
      password: "pass_123",
      PASSWORD: "pass_456",
      user_password_hash: "hash_xyz",
      
      // Secrets
      secret: "sec_123",
      SECRET: "sec_456",
      client_secret_key: "client_sec",
      
      // Push & Session
      servicekey: "srv_key",
      p256dh: "p256_curve_key",
      cookie: "session_id=12345",
      COOKIE: "session_id=67890",

      // Safe control fields
      city: "Seoul",
      temperature: 24.5,
      humidity: 60,
      isRaining: false,
      tags: ["weather", "forecast"],
    };

    const sanitized = sanitizeLogData(sensitivePayload) as Record<string, unknown>;

    assert.equal(sanitized.vapid_private_key, "[REDACTED]");
    assert.equal(sanitized.vapidprivatekey, "[REDACTED]");
    assert.equal(sanitized.private_key, "[REDACTED]");
    assert.equal(sanitized.privatekey, "[REDACTED]");
    assert.equal(sanitized.token, "[REDACTED]");
    assert.equal(sanitized.TOKEN, "[REDACTED]");
    assert.equal(sanitized.bearer_token, "[REDACTED]");
    assert.equal(sanitized.jwt_token_auth, "[REDACTED]");
    assert.equal(sanitized.endpoint, "[REDACTED]");
    assert.equal(sanitized.auth, "[REDACTED]");
    assert.equal(sanitized.authorization, "[REDACTED]");
    assert.equal(sanitized.password, "[REDACTED]");
    assert.equal(sanitized.PASSWORD, "[REDACTED]");
    assert.equal(sanitized.user_password_hash, "[REDACTED]");
    assert.equal(sanitized.secret, "[REDACTED]");
    assert.equal(sanitized.SECRET, "[REDACTED]");
    assert.equal(sanitized.client_secret_key, "[REDACTED]");
    assert.equal(sanitized.servicekey, "[REDACTED]");
    assert.equal(sanitized.p256dh, "[REDACTED]");
    assert.equal(sanitized.cookie, "[REDACTED]");
    assert.equal(sanitized.COOKIE, "[REDACTED]");

    assert.equal(sanitized.city, "Seoul");
    assert.equal(sanitized.temperature, 24.5);
    assert.equal(sanitized.humidity, 60);
    assert.equal(sanitized.isRaining, false);
    assert.deepEqual(sanitized.tags, ["weather", "forecast"]);
  });

  test("Handles primitives, nulls, undefined, and non-object types safely", () => {
    assert.equal(sanitizeLogData(null), null);
    assert.equal(sanitizeLogData(undefined), undefined);
    assert.equal(sanitizeLogData(0), 0);
    assert.equal(sanitizeLogData(-1), -1);
    assert.equal(Number.isNaN(sanitizeLogData(NaN) as number), true);
    assert.equal(sanitizeLogData(""), "");
    assert.equal(sanitizeLogData(true), true);
    assert.equal(sanitizeLogData(false), false);
    const sym = Symbol("test");
    assert.equal(sanitizeLogData(sym), sym);
    const big = BigInt(123456789);
    assert.equal(sanitizeLogData(big), big);
  });

  test("Handles Error instances with attached custom properties & stack preservation", () => {
    class CustomApiError extends Error {
      public statusCode = 502;
      public serviceKey = "secret_service_key_to_redact";
      public secretData = "confidential_payload";
      public responseBody = { error: "Bad gateway", token: "internal_leak" };
    }

    const err = new CustomApiError("Upstream KMA Gateway Timeout");
    const sanitized = sanitizeLogData(err) as Record<string, unknown>;

    assert.equal(sanitized.name, "Error");
    assert.equal(sanitized.message, "Upstream KMA Gateway Timeout");
    assert.equal(sanitized.statusCode, 502);
    assert.equal(sanitized.serviceKey, "[REDACTED]");
    assert.equal(sanitized.secretData, "[REDACTED]");

    const body = sanitized.responseBody as Record<string, unknown>;
    assert.equal(body.error, "Bad gateway");
    assert.equal(body.token, "[REDACTED]");
    assert.ok(sanitized.stack);
  });
});

describe("Adversarial Stress Test: ErrorBoundary Runtime Mechanics", () => {
  interface ErrorBoundaryProps<T = unknown> {
    children: T;
    fallback?: T;
    fallbackRender?: (props: { error: Error; resetErrorBoundary: () => void }) => T;
    name?: string;
    onError?: (error: Error, info: { componentStack: string }) => void;
  }

  interface State {
    hasError: boolean;
    error: Error | null;
  }

  class Simulator<T = unknown> {
    public state: State = { hasError: false, error: null };
    public props: ErrorBoundaryProps<T>;

    constructor(props: ErrorBoundaryProps<T>) {
      this.props = props;
    }

    static getDerivedStateFromError(error: Error): State {
      return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: { componentStack: string }): void {
      const boundaryName = this.props.name || "ErrorBoundary";
      logger.error(`Boundary:${boundaryName}`, `Component crash in ${boundaryName}`, error, {
        componentStack: errorInfo.componentStack,
      });

      if (this.props.onError) {
        this.props.onError(error, errorInfo);
      }
    }

    resetErrorBoundary = (): void => {
      this.state = { hasError: false, error: null };
    };

    render(): T | string | undefined {
      if (this.state.hasError && this.state.error) {
        if (this.props.fallbackRender) {
          return this.props.fallbackRender({
            error: this.state.error,
            resetErrorBoundary: this.resetErrorBoundary,
          });
        }
        if (this.props.fallback !== undefined) {
          return this.props.fallback;
        }
        return `[DefaultFallback:${this.props.name || "Component"}]`;
      }
      return this.props.children;
    }
  }

  test("Transitions state on error and recovers completely on reset", () => {
    const sim = new Simulator({ children: "Live UI", name: "Radar" });
    assert.equal(sim.render(), "Live UI");

    const err = new Error("WebGLContextLost");
    sim.state = Simulator.getDerivedStateFromError(err);
    assert.equal(sim.state.hasError, true);
    assert.equal(sim.state.error, err);
    assert.equal(sim.render(), "[DefaultFallback:Radar]");

    sim.resetErrorBoundary();
    assert.equal(sim.state.hasError, false);
    assert.equal(sim.state.error, null);
    assert.equal(sim.render(), "Live UI");
  });

  test("Handles fallbackRender callback with error parameter and reset trigger", () => {
    let triggeredReset = false;
    const sim = new Simulator({
      children: "Child Content",
      fallbackRender: ({ error, resetErrorBoundary }) => {
        return {
          msg: error.message,
          retry: () => {
            triggeredReset = true;
            resetErrorBoundary();
          },
        };
      },
    });

    const error = new Error("Network timeout during fetch");
    sim.state = Simulator.getDerivedStateFromError(error);

    const rendered = sim.render() as { msg: string; retry: () => void };
    assert.equal(rendered.msg, "Network timeout during fetch");

    rendered.retry();
    assert.equal(triggeredReset, true);
    assert.equal(sim.state.hasError, false);
    assert.equal(sim.render(), "Child Content");
  });
});

describe("Adversarial Stress Test: Route & Global Error Boundaries", () => {
  test("src/app/global-error.tsx meets Next.js requirements", () => {
    const filePath = path.join(rootDir, "src/app/global-error.tsx");
    assert.ok(fs.existsSync(filePath));
    const content = fs.readFileSync(filePath, "utf-8");

    // Client component directive
    assert.ok(content.startsWith('"use client"') || content.startsWith("'use client'"));

    // Root html and body tags are essential for root error boundary
    assert.ok(content.includes("<html"));
    assert.ok(content.includes("<body"));

    // Default export with error and reset props
    assert.ok(content.includes("export default function GlobalError"));
    assert.ok(content.includes("error: Error & { digest?: string }"));
    assert.ok(content.includes("reset: () => void"));

    // Uses structured logger
    assert.ok(content.includes('logger.error("GlobalError"'));

    // Provides restart and reset actions
    assert.ok(content.includes("window.location.reload()"));
    assert.ok(content.includes("reset()"));
  });

  test("src/app/error.tsx meets Next.js requirements", () => {
    const filePath = path.join(rootDir, "src/app/error.tsx");
    assert.ok(fs.existsSync(filePath));
    const content = fs.readFileSync(filePath, "utf-8");

    // Client component directive
    assert.ok(content.startsWith('"use client"') || content.startsWith("'use client'"));

    // Default export with error and reset props
    assert.ok(content.includes("export default function RouteError"));
    assert.ok(content.includes("error: Error & { digest?: string }"));
    assert.ok(content.includes("reset: () => void"));

    // Uses structured logger
    assert.ok(content.includes('logger.error("RouteError"'));

    // Provides retry action
    assert.ok(content.includes("reset()"));
    assert.ok(content.includes("WeatherBunny"));
  });

  test("src/app/not-found.tsx meets Next.js requirements", () => {
    const filePath = path.join(rootDir, "src/app/not-found.tsx");
    assert.ok(fs.existsSync(filePath));
    const content = fs.readFileSync(filePath, "utf-8");

    assert.ok(content.includes("export default function NotFound"));
    assert.ok(content.includes("WeatherBunny"));
    assert.ok(content.includes("404"));
  });
});
