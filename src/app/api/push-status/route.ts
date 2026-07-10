import { NextResponse } from "next/server";
import {
  getUsers,
  subscriptionId,
  isPersistent,
  wasNotifiedRecently,
  cacheGet,
} from "@/lib/db";
import { isKmaConfigured } from "@/lib/kma";
import { isApihubConfigured } from "@/lib/vsrt";

// 앱 내 상태 점검용 — 서버 구성 + (요청시) 이 기기의 등록 상태
export async function POST(req: Request) {
  try {
    const { endpoint } = await req.json().catch(() => ({ endpoint: null }));

    const server = {
      persistentStore: isPersistent,
      kmaConfigured: isKmaConfigured(),
      apihubConfigured: isApihubConfigured(),
      // 마지막 정기 체크(크론 실행) 시각 — 스케줄러 생존 확인용
      lastCronAt: (await cacheGet<number>("wfm:lastCron")) ?? null,
    };

    if (!endpoint) {
      return NextResponse.json({ server, device: null });
    }

    const id = subscriptionId(endpoint);
    const user = (await getUsers()).find((u) => u.id === id);
    if (!user) {
      return NextResponse.json({ server, device: { registered: false } });
    }

    return NextResponse.json({
      server,
      device: {
        registered: true,
        grid: user.grid,
        // 쿨다운 중이면 같은 비에 대한 재알림이 잠시 억제됨을 표시
        cooldownActive: await wasNotifiedRecently(id, "current"),
      },
    });
  } catch (error) {
    console.error("Push status error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
