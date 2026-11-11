export function checkCronAuth(authHeader: string | null, searchParams: URLSearchParams): boolean {
  return Boolean(process.env.CRON_SECRET) &&
    (authHeader === `Bearer ${process.env.CRON_SECRET}` ||
      searchParams.get("key") === process.env.CRON_SECRET);
}

export function getLookaheadHours(): number {
  return process.env.RAIN_LOOKAHEAD_HOURS && !isNaN(Number(process.env.RAIN_LOOKAHEAD_HOURS))
    ? Number(process.env.RAIN_LOOKAHEAD_HOURS)
    : 3;
}
