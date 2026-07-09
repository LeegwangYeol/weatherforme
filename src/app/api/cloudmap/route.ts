import { NextResponse } from "next/server";
import { getCloudMap, isApihubConfigured } from "@/lib/vsrt";

// 비구름 지도용 데이터 — 사용자 위치 중심 창의 향후 6시간 강수 격자 프레임
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "INVALID_COORDS" }, { status: 400 });
  }
  if (lat < 32 || lat > 40 || lng < 123 || lng > 132) {
    return NextResponse.json({ error: "OUT_OF_COVERAGE" }, { status: 400 });
  }
  if (!isApihubConfigured()) {
    return NextResponse.json({ error: "APIHUB_KEY_MISSING" }, { status: 503 });
  }

  try {
    const data = await getCloudMap(lat, lng);
    if (!data) {
      return NextResponse.json({ error: "NO_DATA" }, { status: 502 });
    }
    return NextResponse.json(data, {
      headers: {
        // 발표 주기가 10분이므로 CDN에 5분 캐시
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("Cloudmap error:", error);
    return NextResponse.json(
      {
        error: "APIHUB_ERROR",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}
