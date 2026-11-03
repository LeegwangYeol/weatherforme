# Build, Test & Quality Survey Report: WeatherForMe

**Date**: 2026-09-01  
**Agent**: Explorer 3 (Build, Test & Quality Explorer)  
**Target Repository**: `/Users/user/src/weatherforme`

---

## 1. Executive Summary

WeatherForMe is a Next.js 16 PWA designed for location-based precipitation forecasting and umbrella alerts. This investigation audited the application's build system, dependency ecosystem, testing setup, code quality configurations, and runtime error resilience.

### Key Highlights
- **Framework & Runtime**: Next.js `16.2.7` (App Router), React `19.2.4`, React DOM `19.2.4`, running on Node.js `v25.8.1`.
- **Bundler & Build Tooling**: Webpack bundler explicitly enforced via `--webpack` flags in `npm run dev` and `npm run build` to support `@ducanh2912/next-pwa` (10.2.9).
- **CSS Architecture**: Tailwind CSS `4.3.3` with `@tailwindcss/postcss`, configured via CSS-first `@theme` directives in `src/app/globals.css`.
- **Test Suite Status**: 21/21 passing tests across 3 suites executed via Node.js native test runner (`node:test` + `node:assert/strict`) in ~200ms.
- **Critical Diagnostics & Gaps**:
  1. **Missing Error Boundaries**: No `error.tsx`, `global-error.tsx`, or `not-found.tsx` in `src/app/`, exposing users to unhandled white-screen crashes if rendering fails.
  2. **No Centralized Error Tracking**: No Sentry integration or external observability platform configured; production exceptions currently only emit unformatted `console.error` logs.
  3. **TypeScript CLI Inconsistency**: `npm run build` succeeds, but `npx tsc --noEmit` fails with TS5097 in `tests/freshness.test.ts:3` due to `.ts` import extensions without `"allowImportingTsExtensions": true` in `tsconfig.json`.
  4. **Fragmented Logging**: 19 isolated `console.error` calls across client components and API route handlers without structured levels, context tags, or severity filtering.

---

## 2. Technology Stack & Dependency Audit

### 2.1 Core Dependencies (`package.json`)
| Package | Version Range | Installed Version | Role & Notes |
|---|---|---|---|
| `next` | `16.2.7` | `16.2.7` | Core framework (App Router) |
| `react` | `19.2.4` | `19.2.4` | React 19 core library |
| `react-dom` | `19.2.4` | `19.2.4` | React DOM renderer |
| `@ducanh2912/next-pwa` | `^10.2.9` | `10.2.9` | PWA generation & Workbox service worker |
| `@supabase/supabase-js` | `^2.108.0` | `2.112.3` | Supabase client for push subscriptions & locations |
| `@upstash/redis` | `^1.38.0` | `1.38.2` | Upstash Redis client for caching/storage |
| `@vercel/kv` | `^3.0.0` | `3.0.0` | Vercel KV fallback store |
| `lucide-react` | `^1.17.0` | `1.31.0` | Modern SVG UI icon set |
| `web-push` | `^3.6.7` | `3.6.7` | VAPID Web Push protocol delivery |

### 2.2 Developer Dependencies & Tooling
| Package | Version Range | Installed Version | Role & Notes |
|---|---|---|---|
| `typescript` | `^5` | `5.9.3` | Static type analysis |
| `eslint` | `^9` | `9.39.5` | ESLint v9 Flat Config runner |
| `eslint-config-next` | `16.2.7` | `16.2.7` | Next.js Core Web Vitals & TS rules |
| `tailwindcss` | `^4` | `4.3.3` | Tailwind v4 utility engine |
| `@tailwindcss/postcss`| `^4` | `4.3.3` | PostCSS plugin for Tailwind v4 |
| `@types/node` | `^20` | `20.19.43` | Node.js type definitions |
| `@types/react` | `^19` | `19.2.18` | React 19 type definitions |
| `@types/react-dom` | `^19` | `19.2.4` | React 19 DOM type definitions |
| `@types/web-push` | `^3.6.4` | `3.6.4` | Web-Push type definitions |

---

## 3. Configuration & Infrastructure Analysis

### 3.1 Next.js Configuration (`next.config.ts`)
- **PWA Integration**: Initialized via `withPWAInit` with `cacheOnFrontEndNav: true`, `aggressiveFrontEndNavCaching: true`, `reloadOnOnline: true`.
- **Custom Worker**: Compiles custom service worker at `worker/index.ts` into `public/sw.js` and `public/worker-*.js`.
- **Headers Policy**:
  - `/sw.js`: `Cache-Control: no-cache, no-store, must-revalidate` (ensures service worker updates immediately).
  - `/api/:path*`: `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0` (ensures realtime weather and push updates are never cached by proxy/browser).
- **Bundler Constraint**: PWA plugin hooks into Webpack compilation, requiring the `--webpack` CLI flag.

### 3.2 TypeScript Configuration (`tsconfig.json`)
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules"]
}
```
*Note on TS5097*: In `tests/freshness.test.ts`, `import ... from "../src/lib/kma.ts"` contains explicit `.ts` extension. In TS5 with `moduleResolution: "bundler"`, importing `.ts` directly without `"allowImportingTsExtensions": true` generates an error during standalone `tsc --noEmit`. Adding `"allowImportingTsExtensions": true` (allowed since `noEmit: true` is set) or removing the `.ts` extension in test imports resolves this cleanly.

### 3.3 ESLint Flat Config (`eslint.config.mjs`)
- Uses modern ESLint 9 Flat Config syntax via `defineConfig` and `globalIgnores`.
- Imports `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`.
- Explicitly ignores `.next/**`, `out/**`, `build/**`, `public/**`, `next-env.d.ts`.
- Running `npm run lint` executes smoothly with zero errors and zero warnings.

### 3.4 Styling Pipeline (`postcss.config.mjs` & `src/app/globals.css`)
- Pure Tailwind v4 CSS-first architecture.
- Custom keyframe animations configured:
  - `metric-bob` (subtle vertical bounce for humidity)
  - `metric-sway` (horizontal drift for wind speed)
  - `metric-wiggle` (rotational oscillation for precipitation)
  - `metric-shimmer` (gradient shimmer for high-priority alerts)
- Full `@media (prefers-reduced-motion: reduce)` accessibility fallback support.

---

## 4. Run & Test Commands Analysis

| Command | Script in `package.json` | Execution Result | Exit Code | Notes |
|---|---|---|---|---|
| **Build** | `next build --webpack` | **Passed** | 0 | Compiles static pages (`/`, `/_not-found`), dynamic routes (`/api/*`), PWA service worker |
| **Lint** | `eslint` | **Passed** | 0 | Full project linting with zero issues |
| **Test** | `node --experimental-strip-types --test tests/**/*.test.ts` | **Passed** | 0 | 21 passing assertions in 202ms |
| **Typecheck** | `npx tsc --noEmit` | **Failed** | 2 | TS5097 in `tests/freshness.test.ts:3` (fixable via tsconfig or import path) |

### Test Suite Inventory
1. **`tests/freshness.test.ts` (11 tests)**:
   - `latLngToGrid` coordinate conversion for Seoul & Busan.
   - `routeGrids` contiguous commute waypoint grid calculation.
   - `ultraSrtFcstBase` / `ultraSrtNcstBase` base time format validation.
   - Client fetch lifecycle simulation: initial loading, 15-second rapid foreground event throttling, 15s+ auto-refresh, manual force refresh bypass, offline preservation of ready state, and in-flight request aborting on location change.
2. **`tests/routes.test.ts` (10 tests)**:
   - Verifies `dynamic = 'force-dynamic'` and `revalidate = 0` declarations across all 7 API routes (`weather`, `cloudmap`, `route-weather`, `subscribe`, `push-status`, `test-push`, `cron/weather`).
   - Verifies `next.config.ts` cache-control header rules.
   - Verifies lifecycle event listeners (`visibilitychange`, `focus`, `pageshow`, `online`) in `page.tsx`, `CloudMap.tsx`, and `RouteTimeline.tsx`.

---

## 5. Error Handling, Monitoring & Observability Assessment

### 5.1 Current Deficiencies
- **No Global Error Boundary**: `src/app/` lacks `error.tsx` and `global-error.tsx`. If a client-side component crashes during rendering or hydration, the user sees an unhandled white screen.
- **No Not-Found Boundary**: `src/app/not-found.tsx` is missing, falling back to Next.js generic 404 page.
- **Unstructured Logging**: 19 `console.error` statements across 7 server files and `page.tsx` with no centralized severity management or payload metadata.

### 5.2 Next.js 16 App Router Error Boundary Specifications
According to Next.js 16 (`node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md` & `03-api-reference/03-file-conventions/error.md`):
1. **`src/app/error.tsx`**:
   - Must be `"use client"`.
   - Props: `{ error: Error & { digest?: string }, reset: () => void, unstable_retry: () => void }`.
   - Wraps page content within the root layout.
   - Action: Displays friendly recovery UI with retry button and logs error to Sentry.
2. **`src/app/global-error.tsx`**:
   - Must be `"use client"`.
   - Props: `{ error: Error & { digest?: string }, reset: () => void, unstable_retry: () => void }`.
   - Replaces root layout if the root layout itself crashes; **must include `<html>` and `<body>` tags**.
3. **`src/components/ErrorBoundary.tsx`**:
   - Granular React class error boundary wrapping risky client components (`CloudMap`, `RouteTimeline`) so a map failure doesn't crash the main weather bunny card.

### 5.3 Sentry Integration Architecture & Compatibility
- **SDK**: `@sentry/nextjs` (v8/v9).
- **Compatibility**:
  - Fully compatible with Next.js 16 and React 19.
  - Server instrumentation supported via `src/instrumentation.ts` using `register()` and `onRequestError()`.
  - Client capture via `sentry.client.config.ts` and Server capture via `sentry.server.config.ts`.
- **Config Chaining**:
  ```ts
  // next.config.ts
  import { withSentryConfig } from "@sentry/nextjs";
  import withPWAInit from "@ducanh2912/next-pwa";

  const nextConfig: NextConfig = { ... };
  export default withSentryConfig(withPWA(nextConfig), {
    silent: true,
    disableLogger: true,
    telemetry: false,
  });
  ```
- **Environment Graceful Fallback**:
  If `NEXT_PUBLIC_SENTRY_DSN` or `SENTRY_DSN` is empty (e.g. local dev without Sentry account), Sentry client initializes as a no-op, preventing runtime breakage.

---

## 6. Integration Risks & Quality Recommendations

### 6.1 Identified Risks & Mitigation
| Risk | Severity | Root Cause | Recommended Mitigation |
|---|---|---|---|
| **Turbopack Incompatibility** | Medium | `@ducanh2912/next-pwa` requires Webpack plugins | Retain `--webpack` flag in dev & build scripts |
| **React 19 Dependency Conflicts** | Low | Third-party UI animation packages | Use `motion` (v12+) instead of legacy `framer-motion` v10 |
| **TypeScript TS5097 in Tests** | Low | `.ts` extension in test imports | Add `"allowImportingTsExtensions": true` to `tsconfig.json` |
| **Silent API Failures** | Medium | Raw `console.error` lacks alerts | Implement `src/lib/logger.ts` with Sentry error capture |

### 6.2 Implementation Plan for Quality Enhancements
1. **Error Boundaries**: Create `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`, and `src/components/ErrorBoundary.tsx`.
2. **Sentry & Instrumentation**: Install `@sentry/nextjs`, create `sentry.client.config.ts`, `sentry.server.config.ts`, `src/instrumentation.ts`, and update `next.config.ts`.
3. **Structured Logger**: Create `src/lib/logger.ts` to replace scattered `console.error` calls with structured contextual logs.
4. **TypeScript & Test Cleanups**: Update `tsconfig.json` and `package.json` to ensure clean `tsc --noEmit` and zero-warning `npm test`.

---
*Report prepared by Explorer 3 — Build, Test & Quality Explorer.*
