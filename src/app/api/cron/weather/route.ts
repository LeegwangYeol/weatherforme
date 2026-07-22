import { NextResponse } from "next/server";
import {
  getUsers,
  removeUser,
  wasNotifiedRecently,
  markNotified,
  isPersistent,
  cacheSet,
  cacheGet,
  type UserRecord,
} from "@/lib/db";
import {
  getUltraSrtFcst,
  getVilageFcst,
  findPrecip,
  findPrecipInWindow,
  formatKoreanHour,
  isKmaConfigured,
  type PrecipEvent,
  type HourlyForecast,
  type Grid,
} from "@/lib/kma";
import { getWebPush } from "@/lib/push";

// 주기적으로(기본 10분 간격, GitHub Actions) 호출되는 강수 감시 엔드포인트.
// 구독자를 기상청 격자 단위로 묶어 격자당 한 번만 예보를 조회한다.

function buildMessage(event: PrecipEvent, locationName?: string): { title: string; body: string } {
  const when = formatKoreanHour(event.time);
  const prefix = locationName && locationName !== "현재 위치" ? `[${locationName}] ` : "";
  switch (event.kind) {
    case "snow":
      return {
        title: `❄️ ${prefix}곧 눈이 와요`,
        body: `${when}부터 눈 예보가 있어요. 따뜻하게 챙겨 입으세요!`,
      };
    case "sleet":
      return {
        title: `🌨️ ${prefix}진눈깨비 소식`,
        body: `${when}부터 비/눈 예보가 있어요. 우산 꼭 챙기세요!`,
      };
    default:
      return {
        title: `☔ ${prefix}곧 비가 와요`,
        body: `${when}부터 비 예보가 있어요. 나가기 전에 우산 챙기세요!`,
      };
  }
}

async function handleCron(req: Request) {
  // CRON_SECRET 인증 — Bearer 헤더 또는 ?key= 쿼리 (QStash/cron-job.org 등 스케줄러 공용)
  const { searchParams } = new URL(req.url);
  const authHeader = req.headers.get("authorization");
  const authorized =
    !process.env.CRON_SECRET ||
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    searchParams.get("key") === process.env.CRON_SECRET;
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 스케줄러 생존 확인용 — 상태 점검 카드에서 "마지막 서버 체크 시각"으로 표시
  await cacheSet("wfm:lastCron", Date.now(), 60 * 60 * 24 * 7).catch(() => {});

  if (!isKmaConfigured()) {
    return NextResponse.json({
      success: true,
      skipped: "KMA_KEY_MISSING",
      notificationsSent: 0,
    });
  }

  // 스케줄러 지연으로 이벤트를 놓치지 않도록 기본 리드타임 3시간
  const lookaheadHours = Number(process.env.RAIN_LOOKAHEAD_HOURS) || 3;

  try {
    const users = await getUsers();
    if (users.length === 0) {
      return NextResponse.json({ success: true, users: 0, notificationsSent: 0 });
    }

    // 같은 격자의 사용자는 예보를 공유 → API 호출 최소화
    interface GridTarget {
      user: UserRecord;
      locationName: string;
      grid: { nx: number; ny: number };
    }
    const byGrid = new Map<string, GridTarget[]>();
    for (const user of users) {
      // 1. 현재 위치 추가
      const currentKey = `${user.grid.nx},${user.grid.ny}`;
      if (!byGrid.has(currentKey)) byGrid.set(currentKey, []);
      byGrid.get(currentKey)!.push({ user, locationName: "현재 위치", grid: user.grid });

      // 2. 관심 지역 추가
      if (user.savedLocations) {
        for (const loc of user.savedLocations) {
          const key = `${loc.grid.nx},${loc.grid.ny}`;
          if (!byGrid.has(key)) byGrid.set(key, []);
          byGrid.get(key)!.push({ user, locationName: loc.name, grid: loc.grid });
        }
      }
    }

    const webpush = getWebPush();
    let notificationsSent = 0;
    let gridErrors = 0;

    for (const [gridKey, targets] of byGrid) {
      let event: PrecipEvent | null;
      try {
        const hourly = await getUltraSrtFcst(targets[0].grid);
        event = findPrecip(hourly, lookaheadHours);
      } catch (error) {
        gridErrors++;
        console.error(`Forecast error for grid ${gridKey}:`, error);
        continue;
      }
      if (!event) continue;

      // 같은 격자 내에서 여러 관심지역이 겹칠 수 있으므로 유저당 1번만 알림을 보내도록 중복 제거
      const uniqueTargets = [];
      const seenUsers = new Set<string>();
      for (const t of targets) {
        if (!seenUsers.has(t.user.id)) {
          seenUsers.add(t.user.id);
          uniqueTargets.push(t);
        }
      }

      for (const target of uniqueTargets) {
        const { user, locationName } = target;
        if (await wasNotifiedRecently(user.id, gridKey)) continue;

        const message = buildMessage(event, locationName);

        try {
          await webpush.sendNotification(
            user.subscription,
            JSON.stringify(message)
          );
          await markNotified(user.id, gridKey);
          notificationsSent++;
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 410 || statusCode === 404) {
            // 구독이 만료/해지된 경우 정리
            await removeUser(user.id);
          } else {
            console.error("Push send error for user", user.id, error);
          }
        }
      }
    }

    // ------------------------------------------------------------------
    // 출퇴근 브리핑 & 퇴근 리마인더 (Phase 1)
    // - 아침 브리핑: 단기예보로 출근길+퇴근길 강수를 하루 1회 요약
    // - 퇴근 리마인더: 퇴근 1시간 전, 초단기예보에 비가 있을 때만
    // - force=briefing|evening (인증 필수): 시각/요일/중복 무시하고 즉시 발송 (테스트용)
    // ------------------------------------------------------------------
    const force = searchParams.get("force");
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const kstHour = kst.getUTCHours();
    const kstDay = kst.getUTCDay();
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const ymd = `${kst.getUTCFullYear()}${pad2(kst.getUTCMonth() + 1)}${pad2(kst.getUTCDate())}`;

    let briefingsSent = 0;
    let remindersSent = 0;
    let briefErrors = 0;

    // 격자별 예보는 한 실행 내에서 재사용 (집/직장이 같은 격자면 1회 조회)
    const shortCache = new Map<string, Promise<HourlyForecast[]>>();
    const cachedShort = (g: Grid) => {
      const k = `${g.nx},${g.ny}`;
      if (!shortCache.has(k)) shortCache.set(k, getVilageFcst(g));
      return shortCache.get(k)!;
    };
    const ultraCache = new Map<string, Promise<HourlyForecast[]>>();
    const cachedUltra = (g: Grid) => {
      const k = `${g.nx},${g.ny}`;
      if (!ultraCache.has(k)) ultraCache.set(k, getUltraSrtFcst(g));
      return ultraCache.get(k)!;
    };

    const kindKo = (k: "rain" | "sleet" | "snow") =>
      k === "snow" ? "눈" : k === "sleet" ? "진눈깨비" : "비";

    const trySend = async (
      user: UserRecord,
      message: { title: string; body: string }
    ): Promise<boolean> => {
      try {
        await webpush.sendNotification(user.subscription, JSON.stringify(message));
        return true;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 410 || statusCode === 404) await removeUser(user.id);
        else console.error("Push send error for user", user.id, error);
        return false;
      }
    };

    for (const user of users) {
      const c = user.commute;
      if (!c?.enabled) continue;
      const work = user.savedLocations?.find((l) => l.role === "work");
      if (!work) continue;
      // 집 미지정시 현재 위치를 집으로 간주
      const home = user.savedLocations?.find((l) => l.role === "home") ?? {
        name: "현재 위치",
        grid: user.grid,
      };

      const days = c.days?.length ? c.days : [1, 2, 3, 4, 5];
      if (!force && !days.includes(kstDay)) continue;

      const [mStart, mEnd] = c.morning ?? [7, 9];
      const [eStart, eEnd] = c.evening ?? [18, 20];

      // (a) 아침 브리핑
      if (force === "briefing" || kstHour === (c.briefingHour ?? 7)) {
        const briefKey = `wfm:brief:${user.id}:${ymd}`;
        if (force === "briefing" || !(await cacheGet(briefKey))) {
          try {
            const [homeF, workF] = await Promise.all([
              cachedShort(home.grid),
              cachedShort(work.grid),
            ]);
            const morning = findPrecipInWindow(homeF, ymd, mStart, mEnd);
            const evening =
              findPrecipInWindow(workF, ymd, eStart, eEnd) ??
              findPrecipInWindow(homeF, ymd, eStart, eEnd);

            if (morning || evening || c.briefingAlways) {
              const part = (label: string, ev: PrecipEvent | null) =>
                ev
                  ? `${label} ${formatKoreanHour(ev.time)} ${kindKo(ev.kind)}${
                      ev.pop != null ? `(${ev.pop}%)` : ""
                    }`
                  : `${label} 비 소식 없음`;
              const ok = await trySend(user, {
                title:
                  morning || evening
                    ? "☔ 오늘 출퇴근, 우산 챙기세요!"
                    : "🌤️ 오늘 출퇴근 비 소식 없어요",
                body: `${part("출근길", morning)} · ${part("퇴근길", evening)}`,
              });
              if (ok) briefingsSent++;
            }
            // 테스트 강제 발송은 실제 아침 브리핑을 막지 않도록 기록하지 않음
            if (!force) await cacheSet(briefKey, 1, 26 * 3600);
          } catch (error) {
            briefErrors++;
            console.error("Briefing error for user", user.id, error);
          }
        }
      }

      // (b) 퇴근 1시간 전 리마인더 — 임박 구간이라 초단기예보(더 정확) 사용
      if (force === "evening" || kstHour === eStart - 1) {
        const remKey = `wfm:evrem:${user.id}:${ymd}`;
        if (force === "evening" || !(await cacheGet(remKey))) {
          try {
            const [workU, homeU] = await Promise.all([
              cachedUltra(work.grid),
              cachedUltra(home.grid),
            ]);
            const eve =
              findPrecipInWindow(workU, ymd, eStart, eEnd) ??
              findPrecipInWindow(homeU, ymd, eStart, eEnd);
            if (eve) {
              const ok = await trySend(user, {
                title: "☔ 퇴근길 비 예보",
                body: `${formatKoreanHour(eve.time)}부터 ${kindKo(eve.kind)} 소식이 있어요. 우산 챙겼어요?`,
              });
              if (ok) remindersSent++;
            }
            if (!force) await cacheSet(remKey, 1, 26 * 3600);
          } catch (error) {
            briefErrors++;
            console.error("Evening reminder error for user", user.id, error);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      users: users.length,
      grids: byGrid.size,
      gridErrors,
      notificationsSent,
      briefingsSent,
      remindersSent,
      briefErrors,
      persistentStore: isPersistent,
    });
  } catch (error) {
    console.error("Cron error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// GET/POST 모두 지원 — QStash 등 POST 기본 스케줄러 호환
export { handleCron as GET, handleCron as POST };
