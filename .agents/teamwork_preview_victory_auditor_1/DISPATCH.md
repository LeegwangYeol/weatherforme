## 2026-08-28T10:23:00Z

You are teamwork_preview_victory_auditor.
Your working directory is: /Users/user/src/weatherforme/.agents/teamwork_preview_victory_auditor_1
The workspace repository is: /Users/user/src/weatherforme

<original_task>
# Original User Request

## Initial Request — 2026-08-28T10:00:47Z

This is a single self-contained fix; keep it small and focused.
The user reported that opening the weather PWA page shows old, stale weather information until manually refreshed. Fix this issue so that the user always sees up-to-date weather data when opening or returning to the app.

Working directory: /Users/user/src/weatherforme
Integrity mode: development

## Requirements

### R1. Ensure fresh weather data on page load/visibility
When the user opens the page or brings the PWA to the foreground, the app should display the most current weather data without requiring a manual browser refresh. 
This can be achieved via client-side data refetching (e.g., SWR, React Query, or standard useEffect with visibility API) or Next.js caching adjustments (e.g., revalidate on demand).

## Acceptance Criteria

### Functionality
- [ ] Navigating away from the app and coming back after some time displays fresh data automatically.
- [ ] The user is no longer confused by stale information upon opening the app.
</original_task>

Please conduct your independent 3-phase audit (timeline, cheating detection, independent test execution) and report your verdict.
