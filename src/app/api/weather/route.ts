import { NextResponse } from "next/server";
import {
  latLngToGrid,
  getUltraSrtFcst,
  getUltraSrtNcst,
  findPrecip,
  isKmaConfigured,
} from "@/lib/kma";

// UI에서 현재 날씨 + 6시간 예보를 조회하는 엔드포인트
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "INVALID_COORDS" }, { status: 400 });
  }
  // 기상청 격자는 한반도 인근만 커버
  if (lat < 32 || lat > 40 || lng < 123 || lng > 132) {
    return NextResponse.json({ error: "OUT_OF_COVERAGE" }, { status: 400 });
  }
  if (!isKmaConfigured()) {
    return NextResponse.json({ error: "KMA_KEY_MISSING" }, { status: 503 });
  }

  const grid = latLngToGrid(lat, lng);

  try {
    const [current, hourly] = await Promise.all([
      getUltraSrtNcst(grid),
      getUltraSrtFcst(grid),
    ]);

    return NextResponse.json({
      grid,
      current,
      hourly,
      precip: findPrecip(hourly), // 6시간 내 첫 강수 시점 (없으면 null)
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.error("Weather fetch error:", error);
    return NextResponse.json(
      {
        error: "KMA_ERROR",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}
