import { NextResponse } from "next/server";
import { saveUser, removeUser } from "@/lib/db";
import webpush from "web-push";

// VAPID 키 설정 (푸시 알림용)
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:test@example.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
  process.env.VAPID_PRIVATE_KEY as string
);

export async function POST(req: Request) {
  try {
    const { subscription, location } = await req.json();

    if (!subscription || !location) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    // 간단한 ID 생성 (실제로는 로그인된 유저 ID 등을 사용해야 함)
    // 여기서는 구독 정보의 endpoint를 해시하거나 간단히 사용합니다.
    const id = Buffer.from(subscription.endpoint).toString('base64').substring(0, 20);

    await saveUser({
      id,
      subscription,
      location,
    });

    // 환영 푸시 알림 전송 (테스트용)
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: "알림 설정 완료!",
        body: "이제 비가 오기 전에 미리 알려드릴게요 🌧️",
      })
    ).catch(e => console.error("Push Error:", e));

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error("Subscription error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { endpoint } = await req.json();
    if (!endpoint) {
      return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
    }
    const id = Buffer.from(endpoint).toString('base64').substring(0, 20);
    await removeUser(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Unsubscribe error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
