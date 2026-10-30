# Collaboration Guide with Claude

## Project Context
- **Task**: Analyze WeatherForMe PWA for UI/UX improvements, document proposals in `IMPROVEMENT_PROPOSALS.md`, and audit/implement comprehensive debugging and error tracking (React Error Boundaries, Sentry foundation, internal logging).
- **Target**: Next.js App Router error handling (`error.tsx`/`global-error.tsx`), Sentry setup/configuration, internal logging, UI/UX analysis & proposals, high-priority fixes.
- **Workflow**: Orchestrated team execution via `teamwork_preview_orchestrator` followed by independent Reviewers, Challengers, and Forensic Audit.
- **Status**: **COMPLETE & VERIFIED (Iteration 2 Clean Pass)**
  - R1: Structured logger (`src/lib/logger.ts`), Error Boundaries (`error.tsx`, `global-error.tsx`, `not-found.tsx`, `ErrorBoundary.tsx`), Sentry config & Next.js instrumentation, and API route cleanup.
  - R2: Authored `IMPROVEMENT_PROPOSALS.md` with 5 comprehensive tracks and prioritized roadmap matrix.
  - R3: Implemented Korean Pretendard/CJK typography stack, desktop centered shell (`max-w-md`), WCAG 2.1 AA contrast sharpening, shimmer skeleton UI, and visible focus rings.
  - Test & Linter Fixes: Refactored `tests/adversarial-stress.test.ts` to strictly eliminate `@typescript-eslint/no-explicit-any` errors.
  - Verification: 49/49 tests passing across 11 suites, ESLint 0 errors / 0 warnings, clean Next.js production build, CLEAN Forensic Audit.
- **Latest Audit (2026-10-30)**:
  - **Vercel Live Status**: `https://weatherforme.vercel.app` (`dpl_5oWL1msCBTqfMv6PSLUT5byXzGYH`) is **Ready & Healthy** (API endpoints, Redis, KMA API, KMA APIHub, Service Worker, and 5-minute GitHub Actions cron all verified).
  - **Deployment Sync Gap**: The R1–R3 changes from Sep 1 (Sentry, `ErrorBoundary.tsx`, `logger.ts`, `max-w-md` desktop shell, shimmer skeleton, accessibility improvements) are currently **uncommitted in the local working tree** and not yet pushed/deployed to Vercel (`origin/main` is at `2de099b`, which has the `cf4cd24` app code plus `.github/workflows/jules-daily.yml` updates).
  - **Root-Cause Fixes Applied (2026-10-30)**:
    1. `src/lib/kma.ts`: Implemented dual-provider fallback (`KMA_SERVICE_KEY` data.go.kr → `KMA_APIHUB_KEY` apihub.kma.go.kr) with automatic retry and `cmmMsgHeader` gateway error detection to eliminate intermittent `KMA API error undefined: unknown` failures.
    2. `src/lib/vsrt.ts`: Added 5-minute Redis cache (`wfm:cloudmap:*`), `+1h` RN1 grid reuse, and 2-attempt retry with timeout in `fetchGrid` to eliminate `/api/cloudmap` timeouts.
    3. `src/app/api/push-status/route.ts`, `worker/index.ts`, `src/app/api/cron/weather/route.ts`: Fixed cooldown key lookup (`${user.grid.nx},${user.grid.ny}`), added safe JSON parsing & distinct push tags (`weather-alert`, `weather-briefing`, `weather-evening`), and tolerated up to 3-hour cron delays + midnight wrap (`eStart === 0`).
- **Trigger**: 내용확인
