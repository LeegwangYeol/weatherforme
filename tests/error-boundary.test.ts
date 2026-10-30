import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { logger } from "../src/lib/logger.ts";

describe("ErrorBoundary Architecture & Next.js App Router Verification", () => {
  const rootDir = path.resolve(import.meta.dirname, "..");

  test("src/app/global-error.tsx conforms to Next.js Root Error Boundary contract", () => {
    const filePath = path.join(rootDir, "src/app/global-error.tsx");
    assert.ok(fs.existsSync(filePath), `File exists: ${filePath}`);
    const content = fs.readFileSync(filePath, "utf-8");

    // Must be a client component
    assert.match(content, /^["']use client["']/);
    // Must render its own <html> and <body> tags
    assert.match(content, /<html\b/);
    assert.match(content, /<body\b/);
    // Must export default function component with error and reset props
    assert.match(content, /export\s+default\s+function\s+GlobalError/);
    assert.match(content, /reset:\s*\(\)\s*=>\s*void/);
    // Must log errors using structured logger
    assert.match(content, /logger\.error\(/);
  });

  test("src/app/error.tsx conforms to Next.js Route Error Boundary contract", () => {
    const filePath = path.join(rootDir, "src/app/error.tsx");
    assert.ok(fs.existsSync(filePath), `File exists: ${filePath}`);
    const content = fs.readFileSync(filePath, "utf-8");

    // Must be a client component
    assert.match(content, /^["']use client["']/);
    // Must export default function component with error and reset props
    assert.match(content, /export\s+default\s+function\s+RouteError/);
    assert.match(content, /reset:\s*\(\)\s*=>\s*void/);
    // Must render WeatherBunny with retry CTA
    assert.match(content, /WeatherBunny/);
    assert.match(content, /다시 시도하기/);
    // Must log errors using structured logger
    assert.match(content, /logger\.error\(/);
  });

  test("src/app/not-found.tsx conforms to Next.js Custom 404 contract", () => {
    const filePath = path.join(rootDir, "src/app/not-found.tsx");
    assert.ok(fs.existsSync(filePath), `File exists: ${filePath}`);
    const content = fs.readFileSync(filePath, "utf-8");

    // Must export default NotFound component
    assert.match(content, /export\s+default\s+function\s+NotFound/);
    assert.match(content, /WeatherBunny/);
    assert.match(content, /404/);
    assert.match(content, /날씨 홈으로 돌아가기/);
  });

  test("src/components/ErrorBoundary.tsx conforms to React Error Boundary contract", () => {
    const filePath = path.join(rootDir, "src/components/ErrorBoundary.tsx");
    assert.ok(fs.existsSync(filePath), `File exists: ${filePath}`);
    const content = fs.readFileSync(filePath, "utf-8");

    assert.match(content, /^["']use client["']/);
    assert.match(content, /class\s+ErrorBoundary\s+extends\s+Component/);
    assert.match(content, /static\s+getDerivedStateFromError/);
    assert.match(content, /componentDidCatch/);
    assert.match(content, /resetErrorBoundary/);
    assert.match(content, /logger\.error\(/);
  });

  test("src/app/page.tsx wraps critical modals and diagnostics with ErrorBoundary", () => {
    const pagePath = path.join(rootDir, "src/app/page.tsx");
    const content = fs.readFileSync(pagePath, "utf-8");

    assert.match(content, /<ErrorBoundary\s+name=["']DiagnosticsCard["']>/);
    assert.match(content, /<ErrorBoundary\s+name=["']CloudMap["']>/);
    assert.match(content, /<ErrorBoundary\s+name=["']RouteTimeline["']>/);
  });
});

describe("ErrorBoundary State & Lifecycle Simulation", () => {
  interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
  }

  interface ErrorBoundaryProps {
    children: React.ReactNode;
    fallback?: React.ReactNode;
    fallbackRender?: (props: { error: Error; resetErrorBoundary: () => void }) => React.ReactNode;
    name?: string;
    onError?: (error: Error, info: { componentStack: string }) => void;
  }

  class ErrorBoundarySimulator {
    public state: ErrorBoundaryState = { hasError: false, error: null };
    public props: ErrorBoundaryProps;

    constructor(props: ErrorBoundaryProps) {
      this.props = props;
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
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

    render(): React.ReactNode {
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

  test("getDerivedStateFromError transitions to error state", () => {
    const err = new Error("Canvas context lost");
    const state = ErrorBoundarySimulator.getDerivedStateFromError(err);
    assert.equal(state.hasError, true);
    assert.equal(state.error, err);
  });

  test("componentDidCatch invokes onError listener", () => {
    let notifiedError: Error | null = null;
    let notifiedStack: string | null = null;

    const sim = new ErrorBoundarySimulator({
      children: "Normal Content",
      name: "CloudMap",
      onError: (e, info) => {
        notifiedError = e;
        notifiedStack = info.componentStack;
      },
    });

    const error = new Error("WebGL buffer failure");
    sim.componentDidCatch(error, { componentStack: "at CloudMap.render" });

    assert.equal(notifiedError, error);
    assert.equal(notifiedStack, "at CloudMap.render");
  });

  test("resetErrorBoundary restores healthy render state", () => {
    const sim = new ErrorBoundarySimulator({ children: "Healthy Content", name: "Timeline" });
    sim.state = { hasError: true, error: new Error("Temporary network glitch") };

    assert.equal(sim.render(), "[DefaultFallback:Timeline]");

    sim.resetErrorBoundary();
    assert.equal(sim.state.hasError, false);
    assert.equal(sim.state.error, null);
    assert.equal(sim.render(), "Healthy Content");
  });

  test("custom fallbackRender receives error and reset handler", () => {
    const error = new Error("Custom crash");
    const sim = new ErrorBoundarySimulator({
      children: "Content",
      fallbackRender: ({ error, resetErrorBoundary }) => {
        return `Handled: ${error.message} (canReset=${typeof resetErrorBoundary === "function"})`;
      },
    });

    sim.state = { hasError: true, error };
    assert.equal(sim.render(), "Handled: Custom crash (canReset=true)");
  });
});
