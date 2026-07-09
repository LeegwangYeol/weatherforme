import { cacheGet, cacheSet } from "./db";

// 좌표 → 동네 이름 ("서울 중구" 형태). OSM Nominatim 사용 + 30일 캐시.
// 실패해도 앱 동작에 지장 없도록 항상 null 폴백.
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<string | null> {
  const cacheKey = `wfm:place:${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = await cacheGet<string>(cacheKey);
  if (cached) return cached;

  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
      `&lat=${lat}&lon=${lng}&accept-language=ko&zoom=14`;
    const res = await fetch(url, {
      headers: {
        // Nominatim 이용정책상 식별 가능한 User-Agent 필수
        "User-Agent": "WeatherForMe/1.0 (https://weatherforme.vercel.app)",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const json = await res.json();
    const a = json?.address ?? {};
    const big = a.city ?? a.province ?? a.state ?? ""; // 서울 / 경기도
    const mid = a.borough ?? a.city_district ?? a.county ?? a.town ?? ""; // 중구 / 성남시
    const small = a.suburb ?? a.neighbourhood ?? a.quarter ?? a.village ?? ""; // 명동

    let place: string | null = null;
    if (big && mid) place = `${big} ${mid}`;
    else {
      const parts = [big, mid, small].filter(Boolean);
      place = parts.slice(0, 2).join(" ") || null;
    }

    if (place) await cacheSet(cacheKey, place, 60 * 60 * 24 * 30);
    return place;
  } catch {
    return null;
  }
}
