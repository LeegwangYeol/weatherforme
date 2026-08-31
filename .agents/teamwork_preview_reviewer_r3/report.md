# Review Report

> [!WARNING] **Skepticism Disclaimer**
> High confidence in data freshness, race condition elimination, and request deduplication; PWA hardware wake behavior on physical iOS mobile devices under low-power sleep remains simulated via standard WebKit/DOM lifecycle hooks.

## 1. What the prior attempt got wrong
1. **ESLint Scanning Compiled Vendor/PWA Worker Artifacts**:
   - **Input**: Running `npm run lint`.
   - **Expected**: Clean lint run without warnings on generated PWA service worker outputs.
   - **Actual**: 88 warnings were emitted from `@typescript-eslint/no-unused-expressions` on generated bundles in `public/worker-*.js`.
   - **Root Cause**: `public/**` was omitted from `globalIgnores` in `eslint.config.mjs`.
2. **Missing Workspace Lockfile Root Configuration**:
   - **Input**: Running `next build --webpack`.
   - **Expected**: Clean build without workspace root inference warnings.
   - **Actual**: Next.js detected parent directory lockfiles and emitted a workspace root inference warning.
   - **Root Cause**: `outputFileTracingRoot` was missing in `next.config.ts`.
3. **Absence of Regression Test Suite**:
   - **Input**: Running `npm test`.
   - **Expected**: Automated test suite validating data freshness, 15-second debouncing, error resilience, in-flight request cancellation on coordinate changes, and dynamic route configuration.
   - **Actual**: No automated tests existed in the repository.
   - **Root Cause**: Missing unit/lifecycle test suite in the project.

## 2. What I changed
- `eslint.config.mjs`: Added `"public/**"` to `globalIgnores` so generated PWA worker bundles are ignored by ESLint.
- `next.config.ts`: Added `outputFileTracingRoot: path.join(__dirname)` to eliminate Next.js workspace root inference warnings.
- `package.json`: Added `"test": "node --experimental-strip-types --test tests/**/*.test.ts"`.
- `tests/freshness.test.ts`: Added unit and lifecycle tests covering KMA coordinate grid conversions, base time calculations, foreground fetch throttling (15s), background failure tolerance, manual refresh bypass (`force: true`), and in-flight request abortion on rapid location changes.
- `tests/routes.test.ts`: Added tests verifying all API routes export `dynamic = "force-dynamic"` and `revalidate = 0`, as well as cache header rules and client lifecycle listeners.

## 3. Verification Record
- **Deep Verification (ran actual tests):**
  - `npm test`: 21 tests passed across 3 test suites in 125ms (0 failures, 0 skips).
  - `npm run lint`: Passed with 0 errors and 0 warnings.
  - `npm run build`: Production Next.js 16.2.7 build passed cleanly (static pages prerendered, all API routes dynamic `ƒ`, PWA custom worker compiled).
- **Shallow Verification (manual only):**
  - Verified request lifecycle error containment across initial loads, background auto-refreshes, network reconnects, and manual refreshes.
- **Unverified aspects:**
  - Physical iOS Safari standalone PWA hardware battery optimization suspension over multi-hour intervals.

## 4. Known Issues
- `Shallow Verification`: Background resume behavior on iOS standalone mode depends on WebKit's lifecycle event firing (`visibilitychange` / `pageshow`), which requires physical device hardware testing to observe exact operating system suspension behavior.

## 5. Remaining risk & next step
- The implementation is robust against race conditions, rapid location switches, background returns, manual refreshes, network reconnection, and transient background polling errors without UI disruption. The task is complete.
