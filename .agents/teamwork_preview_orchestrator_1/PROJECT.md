# Project: WeatherForMe (Debugging, Error Tracking & UI/UX Enhancement)

## Architecture
- **Framework**: Next.js 16.2.7 (App Router) + React 19.2.4 + Tailwind CSS v4 + TypeScript 5
- **PWA Infrastructure**: `@ducanh2912/next-pwa` with custom service worker (`public/sw.js`, `public/swe-worker-*.js`)
- **Backend / Data Layer**: Next.js Route Handlers (`src/app/api/*`), KMA Ultra-Short Term Forecast & APIHub Radar, Upstash Redis store (`src/lib/db.ts`) with in-memory fallback, `web-push` VAPID.
- **Monitoring & Telemetry**: Next.js `instrumentation.ts`, Sentry configuration (`sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`), structured logger (`src/lib/logger.ts`).
- **Error Boundaries**: Root layout `src/app/global-error.tsx`, route segment `src/app/error.tsx`, custom `src/app/not-found.tsx`, React `src/components/ErrorBoundary.tsx`.
- **UI / UX Layer**: Client Component `src/app/page.tsx`, `WeatherBunny` mascot, glassmorphic cards, modals (`CloudMap`, `RouteTimeline`), shimmer skeleton loading, accessible contrast and Pretendard / system font stack.

## Feature Inventory
| # | Feature | Description | Milestone | Source | Status |
|---|---------|-------------|-----------|--------|--------|
| 1 | Global Error Boundary (`global-error.tsx`) | Prevents white screens on root layout fatal crashes; provides full-page fallback with restart CTA. | M1 | Survey (R1) | DONE |
| 2 | Route Segment Error Boundary (`error.tsx`) | Catches Home page render crashes, provides inline retry CTA and diagnostics. | M1 | Survey (R1) | DONE |
| 3 | Component-Level Error Boundaries | Wraps modals (`CloudMap`, `RouteTimeline`) and `DiagnosticsCard` in React Error Boundaries to prevent full-page crashes from isolated component errors. | M1 | Survey (R1) | DONE |
| 4 | Custom 404 Page (`not-found.tsx`) | Custom 404 page styled with WeatherBunny theme. | M1 | Survey (R1) | DONE |
| 5 | Structured Internal Logger (`src/lib/logger.ts`) | Replaces 19 ad-hoc `console.error` calls with structured logging, log levels, tags, sanitization, and Sentry bridge. | M1 | Survey (R1) | DONE |
| 6 | Sentry Foundation & Instrumentation | Sentry client/server/edge configs + `src/instrumentation.ts` with zero-DSN resiliency. | M1 | Survey (R1) | DONE |
| 7 | UI/UX Improvement Proposals Document | Comprehensive `IMPROVEMENT_PROPOSALS.md` detailing 5 improvement tracks. | M2 | Survey (R2) | DONE |
| 8 | Typography Stack Enhancement | Fix `globals.css` Arial override; implement Pretendard / system font stack. | M3 | Survey (R3) | DONE |
| 9 | Desktop / Tablet Centered Layout Container | Add `max-w-md mx-auto` container to prevent distorted stretching on large screens. | M3 | Survey (R3) | DONE |
| 10 | Accessible Focus Rings & Contrast Polish | Add `focus-visible` styling and sharpen low-contrast muted text to WCAG AA. | M3 | Survey (R3) | DONE |
| 11 | Speech Bubble Responsive Alignment | Ensure speech bubble arrow and text padding remain properly aligned on all screen widths. | M3 | Survey (R3) | DONE |
| 12 | Structured Weather Shimmer Skeleton UI | Replace single spinner with a sleek loading card matching loaded UI structure. | M3 | Survey (R3) | DONE |
| 13 | Verification & Testing | Unit tests for logger/error boundaries, full build and lint verification. | M4 | Survey (R1-R3) | DONE |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Error Handling, Boundaries & Sentry Foundation | `src/lib/logger.ts`, `src/components/ErrorBoundary.tsx`, `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`, `sentry.*.config.ts`, `src/instrumentation.ts`, refactor bare console.error calls | none | DONE |
| 2 | M2: Future Improvement Proposals Documentation | Create `IMPROVEMENT_PROPOSALS.md` at project root | M1 | DONE |
| 3 | M3: High-Priority UI/UX Enhancements | `src/app/globals.css`, `src/app/page.tsx` (Typography, Centered Container, Contrast, Focus rings, Shimmer Skeleton) | M1 | DONE |
| 4 | M4: Verification, Quality & Forensic Audit | Unit tests (`tests/error-boundary.test.ts`, `tests/logger.test.ts`), `npm run build`, `npm run lint`, Reviewer & Challenger & Forensic Auditor gates | M1, M2, M3 | DONE |

## Code Layout
- `src/lib/logger.ts`: Structured logger module
- `src/components/ErrorBoundary.tsx`: Reusable React Error Boundary
- `src/app/error.tsx`: Next.js Route Error Boundary
- `src/app/global-error.tsx`: Next.js Root Error Boundary
- `src/app/not-found.tsx`: Custom 404 page
- `src/instrumentation.ts`: Next.js server/edge runtime instrumentation
- `sentry.client.config.ts`: Client Sentry configuration
- `sentry.server.config.ts`: Server Sentry configuration
- `sentry.edge.config.ts`: Edge Sentry configuration
- `src/app/globals.css`: Global styles & typography
- `src/app/page.tsx`: Main weather dashboard with error boundaries, centered container, shimmer skeleton
- `IMPROVEMENT_PROPOSALS.md`: Comprehensive UI/UX proposals
- `tests/`: Automated unit and integration tests
