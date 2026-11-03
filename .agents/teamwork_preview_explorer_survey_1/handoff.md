# Handoff Report — Explorer 1 (Codebase & Error Architecture Explorer)

## 1. Observation

### 1.1 Codebase & Next.js Version
- **Framework & Runtime**: Next.js `16.2.7` (App Router), React `19.2.4`, TypeScript `5` (`package.json:18-20, 32`).
- **Entry Points**:
  - `src/app/layout.tsx` (RootLayout): Defines fonts, metadata, viewport, HTML/body wrappers.
  - `src/app/page.tsx` (Home): Client Component (`"use client"`), 1,441 lines, coordinates weather fetching, geolocation tracking, web push subscriptions, and renders modals/cards.
  - `src/components/`: `CloudMap.tsx` (385 lines), `DiagnosticsCard.tsx` (328 lines), `RouteTimeline.tsx` (228 lines), `WeatherBunny.tsx` (311 lines).
  - `src/app/api/`: 7 App Router Route Handlers (`weather`, `cron/weather`, `subscribe`, `push-status`, `route-weather`, `cloudmap`, `test-push`).
  - `src/lib/`: `kma.ts` (494 lines), `db.ts` (152 lines), `vsrt.ts` (180 lines), `push.ts` (19 lines), `geocode.ts` (39 lines).

### 1.2 Missing Error Boundaries
- Searched `src/app/` using `find_by_name`:
  - `src/app/error.tsx`: **Missing**
  - `src/app/global-error.tsx`: **Missing**
  - `src/app/not-found.tsx`: **Missing**
  - Reusable React Error Boundary component: **Missing**
- When a React render error or unhandled JS exception occurs during rendering in `src/app/page.tsx` or any child component, React unmounts the tree and displays an empty white screen in production.

### 1.3 Missing Error Tracking / Sentry
- Checked `package.json` dependencies: `@sentry/nextjs` is **not present**.
- Checked project root and `src/`: No `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, or `src/instrumentation.ts` exist.
- No automated telemetry or production error reporting is connected.

### 1.4 Raw Console Logging Audit
- Ran `grep_search` for `console.` across `src/`: Found 19 occurrences of raw `console.error` without structured metadata or log level controls:
  1. `src/app/api/cloudmap/route.ts:36`: `console.error("Cloudmap error:", error);`
  2. `src/app/api/cron/weather/route.ts:120`: `console.error(\`Forecast error for grid ${gridKey}:\`, error);`
  3. `src/app/api/cron/weather/route.ts:154`: `console.error("Push send error for user", user.id, error);`
  4. `src/app/api/cron/weather/route.ts:204`: `console.error("Push send error for user", user.id, error);`
  5. `src/app/api/cron/weather/route.ts:299`: `console.error("Briefing error for user", user.id, error);`
  6. `src/app/api/cron/weather/route.ts:337`: `console.error("Evening reminder error for user", user.id, error);`
  7. `src/app/api/cron/weather/route.ts:355`: `console.error("Cron error:", error);`
  8. `src/app/api/push-status/route.ts:48`: `console.error("Push status error:", error);`
  9. `src/app/api/route-weather/route.ts:64`: `console.error("Route weather error:", error);`
  10. `src/app/api/subscribe/route.ts:60`: `console.error("GET subscription error:", error);`
  11. `src/app/api/subscribe/route.ts:100`: `.catch((e) => console.error("Welcome push error:", e));`
  12. `src/app/api/subscribe/route.ts:104`: `console.error("Subscription error:", error);`
  13. `src/app/api/subscribe/route.ts:150`: `console.error("Location update error:", error);`
  14. `src/app/api/subscribe/route.ts:167`: `console.error("Unsubscribe error:", error);`
  15. `src/app/api/test-push/route.ts:42`: `console.error("Test push error:", error);`
  16. `src/app/api/weather/route.ts:58`: `console.error("Weather fetch error:", error);`
  17. `src/app/page.tsx:590`: `console.error("Failed to subscribe:", error);`
  18. `src/app/page.tsx:628`: `console.error("Test push failed:", error);`
  19. `src/app/page.tsx:651`: `console.error("Failed to unsubscribe:", error);`

### 1.5 Existing Tests & Build State
- Ran `npm test`: 21 tests pass across `freshness.test.ts` and `routes.test.ts`.

---

## 2. Logic Chain

1. **Root & Segment Error Vulnerability**:
   - Because `global-error.tsx` and `error.tsx` are absent (Observation 1.2), any rendering failure in `RootLayout` or `Home` crashes the client tree.
   - Therefore, creating `src/app/global-error.tsx` (with `<html>` and `<body>`), `src/app/error.tsx` (with reset button and mascot), and `src/app/not-found.tsx` is required to fulfill Acceptance Criteria R1.
2. **Component-Level Isolation**:
   - Complex sub-views (`CloudMap` with 2D Canvas rendering, `RouteTimeline` with 2D matrix arrays, `DiagnosticsCard` with device probes) can throw unexpected runtime exceptions.
   - Wrapping them in a dedicated `<ErrorBoundary>` component isolates sub-view crashes without tearing down the main weather card.
3. **Telemetry & Sentry Foundation**:
   - Currently, runtime errors in production are completely silent (Observation 1.3).
   - In Next.js 16 App Router, `@sentry/nextjs` with `instrumentation.ts` and `sentry.*.config.ts` provides complete full-stack error tracking.
   - The setup must gracefully operate in no-op mode when `NEXT_PUBLIC_SENTRY_DSN` is empty so local dev and open testing are never blocked.
4. **Structured Logging Infrastructure**:
   - Replacing 19 raw `console.error` calls (Observation 1.4) with a unified `src/lib/logger.ts` enables tagged context (`[KMA]`, `[Push]`, `[Cron]`), metadata attachment, data sanitization, and automatic forwarding to error tracking.

---

## 3. Caveats

- Sentry configuration will provide full foundation and configuration files (`sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`), but active event transmission to Sentry servers requires a valid `NEXT_PUBLIC_SENTRY_DSN` at deployment time.
- Next.js PWA worker (`@ducanh2912/next-pwa`) runs as a service worker; errors inside `worker/index.ts` must be handled via ServiceWorker event listeners.

---

## 4. Conclusion

The error architecture survey for Requirement 1 (R1) is complete. The system requires:
1. **`src/lib/logger.ts`**: Unified structured logger with dev/prod formatting and Sentry bridge.
2. **`src/components/ErrorBoundary.tsx`**: Reusable component-level error boundary.
3. **`src/app/error.tsx` & `src/app/global-error.tsx` & `src/app/not-found.tsx`**: Complete Next.js 16 App Router error boundaries with WeatherBunny theme and retry capability.
4. **Sentry Configuration Files & `instrumentation.ts`**: Full-stack error tracking foundation with zero-DSN graceful fallback.
5. **Log Refactoring**: Upgrading all 19 raw `console.error` calls to structured `logger.error` / `logger.warn` calls.

Full details and technical specifications are documented in `report.md`.

---

## 5. Verification Method

To independently verify this survey and future implementation:
1. **Inspect Survey Reports**:
   - Check `/Users/user/src/weatherforme/.agents/teamwork_preview_explorer_survey_1/report.md`
   - Check `/Users/user/src/weatherforme/.agents/teamwork_preview_explorer_survey_1/handoff.md`
2. **Run Existing Test Suite**:
   ```bash
   npm test
   ```
3. **Verify App Build**:
   ```bash
   npm run build
   ```
4. **Error Boundary Trigger Test**:
   - Throw a deliberate test error in a test route or component and verify that `error.tsx` or `global-error.tsx` renders the friendly recovery UI instead of a blank white screen.
