import { NextResponse } from "next/server";
import {
  getUsers,
  removeUser,
  wasNotifiedRecently,
  markNotified,
  isPersistent,
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

function buildMessage(event: PrecipEvent): { title: string; body: string } {
  const when = formatKoreanHour(event.time);
  switch (event.kind) {
    case "snow":
      return {
        title: "❄️ 곧 눈이 와요",
        body: `${when}부터 눈 예보가 있어요. 따뜻하게 챙겨 입으세요!`,
      };
    case "sleet":
      return {
        title: "🌨️ 진눈깨비 소식",
        body: `${when}부터 비/눈 예보가 있어요. 우산 꼭 챙기세요!`,
      };
    default:
      return {
        title: "☔ 곧 비가 와요",
        body: `${when}부터 비 예보가 있어요. 나가기 전에 우산 챙기세요!`,
      };
  }
}

export async function GET(req: Request) {
  // CRON_SECRET이 설정된 경우에만 인증 강제 (GitHub Actions / Vercel Cron 공용)
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isKmaConfigured()) {
    return NextResponse.json({
      success: true,
      skipped: "KMA_KEY_MISSING",
      notificationsSent: 0,
    });
  }

  const lookaheadHours = Number(process.env.RAIN_LOOKAHEAD_HOURS) || 2;

  try {
    const users = await getUsers();
    if (users.length === 0) {
      return NextResponse.json({ success: true, users: 0, notificationsSent: 0 });
    }

    // 같은 격자의 사용자는 예보를 공유 → API 호출 최소화
    const byGrid = new Map<string, UserRecord[]>();
    for (const user of users) {
      const key = `${user.grid.nx},${user.grid.ny}`;
      const group = byGrid.get(key);
      if (group) group.push(user);
      else byGrid.set(key, [user]);
    }

    const webpush = getWebPush();
    let notificationsSent = 0;
    let gridErrors = 0;

    for (const [, group] of byGrid) {
      let event: PrecipEvent | null;
      try {
        const hourly = await getUltraSrtFcst(group[0].grid);
        event = findPrecip(hourly, lookaheadHours);
      } catch (error) {
        gridErrors++;
        console.error(
          `Forecast error for grid (${group[0].grid.nx},${group[0].grid.ny}):`,
          error
        );
        continue;
      }
      if (!event) continue;

      const message = buildMessage(event);

      for (const user of group) {
        if (await wasNotifiedRecently(user.id)) continue;

        try {
          await webpush.sendNotification(
            user.subscription,
            JSON.stringify(message)
          );
          await markNotified(user.id);
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
