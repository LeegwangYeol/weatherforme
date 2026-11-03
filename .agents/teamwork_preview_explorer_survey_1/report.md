# Comprehensive Error Architecture & Monitoring Survey Report

> **Target**: WeatherForMe PWA (Next.js 16.2.7 App Router / React 19.2.4)  
> **Investigation Domain**: Requirement 1 (R1) — Error Handling, React Error Boundaries, Sentry Tracking Foundation, and Internal Logging Strategy  
> **Author**: Explorer 1 (Codebase & Error Architecture Explorer)  
> **Date**: 2026-09-01  

---

## 1. Executive Summary

WeatherForMe is a real-time weather alarm PWA built with **Next.js 16.2.7 (App Router)**, **React 19.2.4**, and `@ducanh2912/next-pwa`. It queries Korea Meteorological Administration (KMA) APIs and pushes notifications to users prior to precipitation.

### Core Architectural Findings:
1. **Critical Error Boundary Gap**: The project currently has **zero Next.js error boundary files** (`error.tsx`, `global-error.tsx`, `not-found.tsx`) and **no React Error Boundaries** surrounding interactive modals (`CloudMap`, `RouteTimeline`) or widgets (`DiagnosticsCard`). Any unhandled client-side render crash or runtime exception will result in a blank white screen.
2. **Missing External Telemetry**: No error monitoring SDK (such as `@sentry/nextjs`) or instrumentation hooks (`instrumentation.ts`) exist. Production runtime crashes or background cron failures on Vercel/GitHub Actions currently remain invisible unless manually checked.
3. **Ad-hoc Logging**: Logging is performed via 19 uncoordinated `console.error` statements across client components and API routes. Logs lack uniform metadata, timestamps, context tags, environment gating (dev vs. prod), and sanitization.

---

## 2. Current Codebase & Architecture Audit

### 2.1 Technology Stack & Structure

```
weatherforme/
├── next.config.ts           # NextConfig wrapped with withPWA
├── package.json             # Next.js 16.2.7, React 19.2.4, @ducanh2912/next-pwa, @upstash/redis
├── public/                  # Manifest, icons, service worker (sw.js, swe-worker-*.js)
├── src/
│   ├── app/
│   │   ├── layout.tsx       # RootLayout (Server Component with Geist fonts & viewport config)
│   │   ├── page.tsx         # Home (Client Component "use client", 1441 lines)
│   │   ├── globals.css      # Tailwind CSS 4 setup & custom keyframe animations
│   │   └── api/             # App Router Route Handlers
│   │       ├── weather/route.ts       # Ultra-short forecast & current observation
│   │       ├── route-weather/route.ts # Multi-grid commute corridor forecast matrix
│   │       ├── cloudmap/route.ts      # APIHub VSRT 41x41 radar grid frames
│   │       ├── subscribe/route.ts     # Web push subscription CRUD & commute config
│   │       ├── push-status/route.ts   # System diagnostics & health check endpoint
│   │       ├── test-push/route.ts     # Immediate test push delivery
│   │       └── cron/weather/route.ts  # 10-minute scheduled rain detection & push dispatch
│   ├── components/
│   │   ├── WeatherBunny.tsx    # SVG weather mascot with animated emotional states
│   │   ├── CloudMap.tsx        # 41x41 Canvas animated precipitation map modal
│   │   ├── RouteTimeline.tsx   # Matrix timeline modal for home-to-work commute corridor
│   │   └── DiagnosticsCard.tsx # Device and server health verification card
│   └── lib/
│       ├── kma.ts     # KMA DFS grid coordinate conversion & short-term API client
│       ├── db.ts      # Upstash Redis & in-memory fallback user storage
│       ├── vsrt.ts    # KMA APIHub binary/ASCII grid radar fetcher
│       ├── push.ts    # web-push VAPID initialization
│       └── geocode.ts # Reverse geocoding for Korean administrative districts
└── tests/
    ├── freshness.test.ts # Lifecycle, throttling & state simulation unit tests
    └── routes.test.ts    # Dynamic export & cache header verification tests
```

### 2.2 Error Handling & Blast Radius Analysis

| Layer / Component | Current Error Handling | Behavior on Failure | Failure Blast Radius |
|---|---|---|---|
| **Root Layout (`src/app/layout.tsx`)** | None | Blank white screen (fatal crash) | **Entire App** |
| **Main Page (`src/app/page.tsx`)** | Try/catch in `fetchWeatherData`, `subscribeToPush`, `sendTestPush` | Sets `weather.status = "error"`. If already `ready`, preserves view and shows banner | **Entire Page** if render crash occurs |
| **CloudMap Modal (`src/components/CloudMap.tsx`)** | Try/catch around `fetch('/api/cloudmap')` | Sets `state = { status: "error" }` | **Entire App** if Canvas 2D context fails |
| **RouteTimeline Modal (`src/components/RouteTimeline.tsx`)** | Try/catch around `fetch('/api/route-weather')` | Sets `state = { status: "error" }` | **Entire App** if matrix indexing throws |
| **DiagnosticsCard (`src/components/DiagnosticsCard.tsx`)** | Try/catch around `fetch('/api/push-status')` | Sets check row to `level: "fail"` | **Entire App** if notification API throws |
| **API Routes (`src/app/api/*`)** | Try/catch in route handlers | Returns JSON `{ error: "...", detail: "..." }` with 400/500/502/503 | Isolated to request |
| **Scheduled Cron (`src/app/api/cron/weather/route.ts`)** | Try/catch per grid & user | Logs to `console.error`, returns JSON summary with error count | Isolated to cron run |

---

## 3. Error Boundary Architecture Design (Next.js 16 + React 19)

To ensure high availability and prevent white screens under all runtime conditions, the following error boundary hierarchy must be implemented:

```
┌─────────────────────────────────────────────────────────────┐
│  src/app/global-error.tsx (Root Layout Error Boundary)      │
│  - Captures fatal crashes in RootLayout or root providers   │
│  - Replaces entire <html> and <body>                        │
│  - Provides full-page fallback with brand bunny & Restart   │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  src/app/layout.tsx (RootLayout)                       │ │
│  │                                                        │ │
│  │  ┌───────────────────────────────────────────────────┐ │ │
│  │  │  src/app/error.tsx (Page Segment Error Boundary)  │ │ │
│  │  │  - Captures Home page render crashes              │ │ │
│  │  │  - Retains Header/Geist styles                    │ │ │
│  │  │  - Interactive "다시 시도 (Retry)" CTA            │ │ │
│  │  │                                                   │ │ │
│  │  │  ┌──────────────────────────────────────────────┐ │ │ │
│  │  │  │  src/app/page.tsx (Home)                     │ │ │ │
│  │  │  │                                              │ │ │ │
│  │  │  │  ┌─────────────────────────────────────────┐ │ │ │ │
│  │  │  │  │  <ErrorBoundary name="CloudMap">        │ │ │ │ │
│  │  │  │  │    <CloudMap />                         │ │ │ │ │
│  │  │  │  └─────────────────────────────────────────┘ │ │ │ │
│  │  │  │  ┌─────────────────────────────────────────┐ │ │ │ │
│  │  │  │  │  <ErrorBoundary name="RouteTimeline">   │ │ │ │ │
│  │  │  │  │    <RouteTimeline />                    │ │ │ │ │
│  │  │  │  └─────────────────────────────────────────┘ │ │ │ │
│  │  │  │  ┌─────────────────────────────────────────┐ │ │ │ │
│  │  │  │  │  <ErrorBoundary name="Diagnostics">     │ │ │ │ │
│  │  │  │  │    <DiagnosticsCard />                  │ │ │ │ │
│  │  │  │  └─────────────────────────────────────────┘ │ │ │ │
│  │  │  └──────────────────────────────────────────────┘ │ │ │
│  │  └───────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 `src/app/global-error.tsx` Specification
- **Requirement**: Must define `<html>` and `<body>` tags. Client Component (`"use client"`).
- **Props**: `{ error: Error & { digest?: string }, reset: () => void }`.
- **UI Design**: Pastel gradient background (`#c9e4fd`), WeatherBunny in `'thunder'` or `'cloud'` state, friendly Korean error explanation, and a "앱 다시 시작" button (`window.location.reload()`).
- **Telemetry**: Automatically calls `logger.error('[GlobalError]', error)`.

### 3.2 `src/app/error.tsx` Specification
- **Requirement**: Route segment level error boundary. Client Component (`"use client"`).
- **Props**: `{ error: Error & { digest?: string }, reset: () => void }`.
- **UI Design**: Renders inside RootLayout. Clean card with WeatherBunny `'cloud'` mascot, message: "날씨 정보를 불러오는 중 일시적인 문제가 발생했어요", "다시 시도" button calling `reset()`, and collapsible technical diagnostics (error digest / message) in development.

### 3.3 `src/components/ErrorBoundary.tsx` Specification
- **Requirement**: Reusable React class component implementing `componentDidCatch(error, errorInfo)` and `static getDerivedStateFromError(error)`.
- **Features**: Accepts optional `fallback`, `fallbackRender`, or default localized card fallback; tags errors with the component name for granular diagnostics.

### 3.4 `src/app/not-found.tsx` Specification
- **Requirement**: Custom 404 page matching the app's visual identity.
- **UI Design**: WeatherBunny mascot, friendly text ("찾으시는 페이지가 하늘 위로 날아갔어요 🎈"), and a "홈으로 돌아가기" button.

---

## 4. Sentry / External Error Tracking Foundation

### 4.1 Architecture & Next.js 16 Compatibility
Next.js 16 + React 19 utilizes the Next.js `instrumentation.ts` hook for server/edge runtime monitoring and client-side SDK initialization.

### 4.2 Integration Components

#### A. Configuration Files
1. **`sentry.client.config.ts`**:
   ```ts
   import * as Sentry from "@sentry/nextjs";

   const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

   if (SENTRY_DSN) {
     Sentry.init({
       dsn: SENTRY_DSN,
       tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
       replaysSessionSampleRate: 0.1,
       replaysOnErrorSampleRate: 1.0,
       environment: process.env.NODE_ENV,
     });
   }
   ```
2. **`sentry.server.config.ts`**:
   ```ts
   import * as Sentry from "@sentry/nextjs";

   const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

   if (SENTRY_DSN) {
     Sentry.init({
       dsn: SENTRY_DSN,
       tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
       environment: process.env.NODE_ENV,
     });
   }
   ```
3. **`sentry.edge.config.ts`**:
   ```ts
   import * as Sentry from "@sentry/nextjs";

   const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

   if (SENTRY_DSN) {
     Sentry.init({
       dsn: SENTRY_DSN,
       tracesSampleRate: 0.1,
       environment: process.env.NODE_ENV,
     });
   }
   ```
4. **`src/instrumentation.ts`**:
   ```ts
   export async function register() {
     if (process.env.NEXT_RUNTIME === "nodejs") {
       await import("../sentry.server.config");
     }
     if (process.env.NEXT_RUNTIME === "edge") {
       await import("../sentry.edge.config");
     }
   }
   ```

#### B. `next.config.ts` Wrapping
```ts
import { withSentryConfig } from "@sentry/nextjs";

// ... existing withPWA(nextConfig) ...

export default withSentryConfig(withPWA(nextConfig), {
  silent: !process.env.CI,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
});
```

#### C. Graceful Fallback (Zero-DSN Resiliency)
When `NEXT_PUBLIC_SENTRY_DSN` is not configured (e.g. local development, open-source testing), the monitoring wrapper must operate in no-op mode without throwing or polluting terminal output.

---

## 5. Enhanced Internal Logging Strategy

### 5.1 Current Log Inventory (19 Raw Calls)

```
File                                   Line  Code
--------------------------------------------------------------------------------------------------------
src/app/api/cloudmap/route.ts          36    console.error("Cloudmap error:", error);
src/app/api/cron/weather/route.ts      120   console.error(`Forecast error for grid ${gridKey}:`, error);
src/app/api/cron/weather/route.ts      154   console.error("Push send error for user", user.id, error);
src/app/api/cron/weather/route.ts      204   console.error("Push send error for user", user.id, error);
src/app/api/cron/weather/route.ts      299   console.error("Briefing error for user", user.id, error);
src/app/api/cron/weather/route.ts      337   console.error("Evening reminder error for user", user.id, error);
src/app/api/cron/weather/route.ts      355   console.error("Cron error:", error);
src/app/api/push-status/route.ts       48    console.error("Push status error:", error);
src/app/api/route-weather/route.ts     64    console.error("Route weather error:", error);
src/app/api/subscribe/route.ts         60    console.error("GET subscription error:", error);
src/app/api/subscribe/route.ts         100   console.error("Welcome push error:", e);
src/app/api/subscribe/route.ts         104   console.error("Subscription error:", error);
src/app/api/subscribe/route.ts         150   console.error("Location update error:", error);
src/app/api/subscribe/route.ts         167   console.error("Unsubscribe error:", error);
src/app/api/test-push/route.ts         42    console.error("Test push error:", error);
src/app/api/weather/route.ts           58    console.error("Weather fetch error:", error);
src/app/page.tsx                       590   console.error("Failed to subscribe:", error);
src/app/page.tsx                       628   console.error("Test push failed:", error);
src/app/page.tsx                       651   console.error("Failed to unsubscribe:", error);
```

### 5.2 Unified Logger Design (`src/lib/logger.ts`)

Create a lightweight, zero-dependency structured logger that supports:
1. **Log Levels**: `DEBUG` (0), `INFO` (1), `WARN` (2), `ERROR` (3).
2. **Context Tags**: `[KMA]`, `[Push]`, `[Cron]`, `[DB]`, `[Client]`, `[Boundary]`, `[VSRT]`.
3. **Structured Metadata**: Attaching `{ grid, userId, durationMs, status }` safely.
4. **Data Sanitization**: Automatic scrubbing of sensitive fields (`VAPID_PRIVATE_KEY`, `token`, `endpoint`, `keys`).
5. **Sentry Dispatch**: If Sentry is initialized or available, `logger.error` automatically forwards exception/breadcrumbs.

#### Proposed Logger Signature:
```ts
export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  tag: string;
  [key: string]: unknown;
}

export const logger = {
  debug(tag: string, message: string, meta?: Record<string, unknown>): void,
  info(tag: string, message: string, meta?: Record<string, unknown>): void,
  warn(tag: string, message: string, meta?: Record<string, unknown>): void,
  error(tag: string, message: string, error?: unknown, meta?: Record<string, unknown>): void,
};
```

---

## 6. Implementation Action Plan for Implementer Agent

| Step | Target File | Action |
|---|---|---|
| **Step 1** | `src/lib/logger.ts` | Implement structured logger with dev/prod formatting, tagging, and Sentry bridge |
| **Step 2** | `src/components/ErrorBoundary.tsx` | Create reusable React Error Boundary component with custom fallback UI |
| **Step 3** | `src/app/error.tsx` | Create Route Segment Error Boundary for the main application |
| **Step 4** | `src/app/global-error.tsx` | Create Root Layout Error Boundary with `<html>` and `<body>` tags |
| **Step 5** | `src/app/not-found.tsx` | Create custom 404 page styled with WeatherBunny theme |
| **Step 6** | `src/components/*` & `src/app/page.tsx` | Wrap modal/card sections with `<ErrorBoundary name="...">` |
| **Step 7** | Sentry configs & `instrumentation.ts` | Add `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts` |
| **Step 8** | `src/app/api/*` & `src/app/page.tsx` | Refactor all 19 bare `console.error` calls to use `logger.error` / `logger.warn` with structured tags |
| **Step 9** | `tests/error-boundary.test.ts` & `npm test` | Add unit tests for logger and error handling, run build & test verification |

---

## 7. Verification & Invalidation Criteria

- **Build Verification**: `npm run build` succeeds without webpack, type, or lint errors.
- **Test Verification**: `npm test` passes all tests cleanly.
- **Error Recovery Verification**: Forcing an error in `page.tsx` renders `error.tsx` without white screen and allows recovery via the retry button.
- **Zero-Config Resiliency**: Application functions normally even if `NEXT_PUBLIC_SENTRY_DSN` is empty.
