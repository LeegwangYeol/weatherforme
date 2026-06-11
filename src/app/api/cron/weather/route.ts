import { NextResponse } from "next/server";
import { getUsers, removeUser } from "@/lib/db";
import webpush from "web-push";

// VAPID 키 설정
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:test@example.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
  process.env.VAPID_PRIVATE_KEY as string
);

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

export async function GET(req: Request) {
  // 인증 체크 (Vercel Cron은 Header에 Authorization 토큰을 담아서 보냅니다)
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const users = await getUsers();
    let notificationsSent = 0;

    for (const user of users) {
      let willRain = false;

      if (OPENWEATHER_API_KEY && OPENWEATHER_API_KEY !== "YOUR_OPENWEATHER_API_KEY") {
        // 실제 날씨 API 연동 (One Call API 3.0 또는 Forecast API)
        const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${user.location.lat}&lon=${user.location.lng}&appid=${OPENWEATHER_API_KEY}&cnt=2`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          // 향후 3~6시간 내에 비가 오는지 확인 (간단한 로직)
          willRain = data.list.some((item: any) => 
            item.weather.some((w: any) => w.main === "Rain" || w.main === "Drizzle" || w.main === "Thunderstorm")
          );
        }
      } else {
        // 키가 없으면 로컬 테스트용으로 무조건 비가 온다고 가정 (또는 랜덤)
        willRain = Math.random() > 0.5; // 50% 확률로 비가 옴
      }

      if (willRain) {
        try {
          await webpush.sendNotification(
            user.subscription,
            JSON.stringify({
              title: "🌧️ 비 소식 알림",
              body: "1~2시간 이내에 계신 곳에 비가 올 예정입니다. 우산을 챙기세요!",
            })
          );
          notificationsSent++;
        } catch (error: any) {
          if (error.statusCode === 410 || error.statusCode === 404) {
            // 구독이 취소되었거나 유효하지 않은 경우 삭제
            await removeUser(user.id);
          } else {
            console.error("Failed to send push to user", user.id, error);
          }
        }
      }
    }

    return NextResponse.json({ success: true, notificationsSent });
  } catch (error: any) {
    console.error("Cron Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
