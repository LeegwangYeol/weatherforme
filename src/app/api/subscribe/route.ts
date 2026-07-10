import { NextResponse } from "next/server";
import { getUsers, saveUser, removeUser, subscriptionId } from "@/lib/db";
import { latLngToGrid } from "@/lib/kma";
import { getWebPush } from "@/lib/push";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const endpoint = searchParams.get("endpoint");
    if (!endpoint) {
      return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
    }
    
    const id = subscriptionId(endpoint);
    const user = (await getUsers()).find((u) => u.id === id);
    if (!user) {
      return NextResponse.json({ error: "NOT_SUBSCRIBED" }, { status: 404 });
    }
    
    return NextResponse.json({ success: true, savedLocations: user.savedLocations || [] });
  } catch (error) {
    console.error("GET subscription error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { subscription, location } = await req.json();

    if (
      !subscription?.endpoint ||
      !subscription?.keys?.p256dh ||
      !Number.isFinite(location?.lat) ||
      !Number.isFinite(location?.lng)
    ) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    const id = subscriptionId(subscription.endpoint);

    await saveUser({
      id,
      subscription,
      location,
      grid: latLngToGrid(location.lat, location.lng),
      createdAt: Date.now(),
    });

    // 구독 파이프라인 확인용 환영 푸시 (실패해도 구독 자체는 유지)
    await getWebPush()
      .sendNotification(
        subscription,
        JSON.stringify({
          title: "알림 설정 완료! ☔",
          body: "이제 비가 오기 1~2시간 전에 미리 알려드릴게요.",
        })
      )
      .catch((e) => console.error("Welcome push error:", e));

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("Subscription error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// 이동시 위치만 조용히 갱신 (환영 푸시 없음) — 클라이언트가 2km 이상 이동을
// 감지하면 호출한다
export async function PATCH(req: Request) {
  try {
    const { endpoint, location, savedLocations } = await req.json();

    if (!endpoint) {
      return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
    }

    const id = subscriptionId(endpoint);
    const user = (await getUsers()).find((u) => u.id === id);
    if (!user) {
      return NextResponse.json({ error: "NOT_SUBSCRIBED" }, { status: 404 });
    }

    const updates: Partial<typeof user> = {};
    if (location && Number.isFinite(location.lat) && Number.isFinite(location.lng)) {
      updates.location = location;
      updates.grid = latLngToGrid(location.lat, location.lng);
    }
    if (savedLocations !== undefined) {
      updates.savedLocations = savedLocations.map((loc: { lat: number; lng: number; grid?: { x: number; y: number } }) => ({
        ...loc,
        grid: loc.grid || latLngToGrid(loc.lat, loc.lng)
      }));
    }

    await saveUser({
      ...user,
      ...updates,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Location update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { endpoint } = await req.json();
    if (!endpoint) {
      return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
    }
    await removeUser(subscriptionId(endpoint));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unsubscribe error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
