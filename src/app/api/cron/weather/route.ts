import { NextResponse } from "next/server";
import {
  getUsers,
  removeUser,
  wasNotifiedRecently,
  markNotified,
  isPersistent,
  cacheSet,
  type UserRecord,
} from "@/lib/db";
import {
  getUltraSrtFcst,
  findPrecip,
  formatKoreanHour,
  isKmaConfigured,
  type PrecipEvent,
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

    return NextResponse.json({
      success: true,
      users: users.length,
      grids: byGrid.size,
      gridErrors,
      notificationsSent,
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
