import { NextResponse } from "next/server";
import { getUsers, removeUser, subscriptionId } from "@/lib/db";
import { getWebPush } from "@/lib/push";

// 기기 수신 테스트용 — 요청한 구독으로 즉시 테스트 푸시를 보낸다
export async function POST(req: Request) {
  try {
    const { endpoint } = await req.json();
    if (!endpoint) {
      return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
    }

    const id = subscriptionId(endpoint);
    const user = (await getUsers()).find((u) => u.id === id);
    if (!user) {
      // 서버 저장소에 이 기기가 없음 → 재구독 필요
      return NextResponse.json({ error: "NOT_SUBSCRIBED" }, { status: 404 });
    }

    try {
      await getWebPush().sendNotification(
        user.subscription,
        JSON.stringify({
          title: "테스트 알림이에요! 🐰",
          body: "이게 보이면 푸시가 잘 오고 있는 거예요. 안심하세요!",
        })
      );
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 410 || statusCode === 404) {
        await removeUser(user.id);
        return NextResponse.json({ error: "EXPIRED" }, { status: 410 });
      }
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Test push error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
