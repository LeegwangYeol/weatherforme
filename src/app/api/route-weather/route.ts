import { NextResponse } from "next/server";
import {
  routeGrids,
  getUltraSrtFcst,
  isKmaConfigured,
  type HourlyForecast,
} from "@/lib/kma";

// 통근 경로(집↔직장) 격자별 향후 6시간 강수형태 매트릭스
// GET /api/route-weather?aLat=..&aLng=..&bLat=..&bLng=..
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const aLat = Number(searchParams.get("aLat"));
  const aLng = Number(searchParams.get("aLng"));
  const bLat = Number(searchParams.get("bLat"));
  const bLng = Number(searchParams.get("bLng"));

  const coords = [aLat, aLng, bLat, bLng];
  if (coords.some((v) => !Number.isFinite(v))) {
    return NextResponse.json({ error: "INVALID_COORDS" }, { status: 400 });
  }
  if (
    [aLat, bLat].some((v) => v < 32 || v > 40) ||
    [aLng, bLng].some((v) => v < 123 || v > 132)
  ) {
    return NextResponse.json({ error: "OUT_OF_COVERAGE" }, { status: 400 });
  }
  if (!isKmaConfigured()) {
    return NextResponse.json({ error: "KMA_KEY_MISSING" }, { status: 503 });
  }

  const grids = routeGrids({ lat: aLat, lng: aLng }, { lat: bLat, lng: bLng });

  try {
    const forecasts = await Promise.all(grids.map((g) => getUltraSrtFcst(g)));

    // 시간축은 첫 격자의 예보 시각 기준 (같은 발표분이라 전 격자 동일)
    const hours = forecasts[0].slice(0, 6).map((h) => ({ date: h.date, time: h.time }));

    const ptyMatrix = forecasts.map((hourly: HourlyForecast[]) => {
      const byKey = new Map(hourly.map((h) => [`${h.date}${h.time}`, h.pty]));
      return hours.map((hh) => byKey.get(`${hh.date}${hh.time}`) ?? 0);
    });

    return NextResponse.json(
      {
        grids,
        hours,
        ptyMatrix,
        updatedAt: Date.now(),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    console.error("Route weather error:", error);
    return NextResponse.json(
      {
        error: "KMA_ERROR",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}
