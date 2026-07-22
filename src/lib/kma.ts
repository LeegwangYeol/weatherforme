// 기상청 단기예보 조회서비스 2.0 클라이언트
// - 초단기예보(getUltraSrtFcst): 향후 6시간, 매시 30분 발표(45분 이후 제공)
// - 초단기실황(getUltraSrtNcst): 현재 관측값, 매시 정각 관측(40분 이후 제공)
// 모든 시각은 KST 기준.
//
// 같은 서비스를 두 포털에서 제공하므로 둘 다 지원:
// - 공공데이터포털(data.go.kr): serviceKey 파라미터 → KMA_SERVICE_KEY
// - 기상청 API허브(apihub.kma.go.kr): authKey 파라미터 → KMA_APIHUB_KEY

const DATA_GO_KR_BASE =
  "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";
const APIHUB_BASE =
  "https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0";

export interface Grid {
  nx: number;
  ny: number;
}

// ---------------------------------------------------------------------------
// 위경도 → 기상청 격자 좌표 변환 (기상청 공식 LCC DFS 알고리즘)
// 검증: 서울(60,127), 부산(97,74), 제주(53,38) 공식 예제 좌표 일치 확인
// ---------------------------------------------------------------------------
const RE = 6371.00877; // 지구 반경(km)
const GRID_KM = 5.0; // 격자 간격(km)
const SLAT1 = 30.0;
const SLAT2 = 60.0;
const OLON = 126.0;
const OLAT = 38.0;
const XO = 43;
const YO = 136;

export function latLngToGrid(lat: number, lng: number): Grid {
  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID_KM;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn =
    Math.tan(Math.PI * 0.25 + slat2 * 0.5) /
    Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lng * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}

// ---------------------------------------------------------------------------
// KST 시각 / base_date, base_time 계산
// ---------------------------------------------------------------------------
function nowKST(): Date {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

function toBase(d: Date, minute: string): { baseDate: string; baseTime: string } {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  return { baseDate: `${yyyy}${mm}${dd}`, baseTime: `${hh}${minute}` };
}

// 초단기예보: 매시 30분 발표, API 제공은 45분 이후 → 45분 전이면 한 시간 전 발표분 사용
export function ultraSrtFcstBase(offsetHours = 0): { baseDate: string; baseTime: string } {
  const d = nowKST();
  if (d.getUTCMinutes() < 45) d.setUTCHours(d.getUTCHours() - 1);
  d.setUTCHours(d.getUTCHours() - offsetHours);
  return toBase(d, "30");
}

// 초단기실황: 매시 정각 관측, 40분 이후 제공
export function ultraSrtNcstBase(offsetHours = 0): { baseDate: string; baseTime: string } {
  const d = nowKST();
  if (d.getUTCMinutes() < 40) d.setUTCHours(d.getUTCHours() - 1);
  d.setUTCHours(d.getUTCHours() - offsetHours);
  return toBase(d, "00");
}

// ---------------------------------------------------------------------------
// API 호출
// ---------------------------------------------------------------------------
function kmaAuth(): { base: string; authParam: string } | null {
  // 단기예보는 공공데이터포털 키 우선 (검증된 경로), API허브 키는 폴백
  // — API허브 키는 주로 레이더 등 다른 자료용 (lib/radar.ts)
  const dataKey = process.env.KMA_SERVICE_KEY;
  if (dataKey) {
    // 데이터포털 키는 인코딩/디코딩 두 형태로 제공됨 — '%'가 있으면 이미 인코딩된 키
    return {
      base: DATA_GO_KR_BASE,
      authParam: `serviceKey=${dataKey.includes("%") ? dataKey : encodeURIComponent(dataKey)}`,
    };
  }
  const hubKey = process.env.KMA_APIHUB_KEY;
  if (hubKey) {
    return {
      base: APIHUB_BASE,
      authParam: `authKey=${encodeURIComponent(hubKey)}`,
    };
  }
  return null;
}

export function isKmaConfigured(): boolean {
  return kmaAuth() !== null;
}

interface KmaItem {
  category: string;
  fcstDate?: string;
  fcstTime?: string;
  fcstValue?: string;
  obsrValue?: string;
}

const NO_DATA = "NO_DATA";

async function callKma(
  operation: "getUltraSrtFcst" | "getUltraSrtNcst" | "getVilageFcst",
  params: Record<string, string>
): Promise<KmaItem[]> {
  const auth = kmaAuth();
  if (!auth) {
    throw new Error("KMA API 키가 없습니다 (KMA_SERVICE_KEY 또는 KMA_APIHUB_KEY)");
  }

  const qs = new URLSearchParams({ pageNo: "1", dataType: "JSON", ...params });
  const url = `${auth.base}/${operation}?${auth.authParam}&${qs.toString()}`;

  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    // 데이터포털 키 오류 등은 XML/텍스트로 응답이 옴
    throw new Error(`KMA non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }

  // API허브 게이트웨이 오류 형태: {"result":{"status":401,"message":"..."}}
  if (json?.result?.status && json.result.status !== 200) {
    throw new Error(`KMA APIHub error ${json.result.status}: ${json.result.message}`);
  }

  const code = json?.response?.header?.resultCode;
  if (code === "03") throw new Error(NO_DATA);
  if (code !== "00") {
    throw new Error(
      `KMA API error ${code}: ${json?.response?.header?.resultMsg ?? "unknown"}`
    );
  }

  const items = json?.response?.body?.items?.item;
  return Array.isArray(items) ? items : [];
}

// ---------------------------------------------------------------------------
// 초단기예보: 향후 6시간, 시간별 예보
// ---------------------------------------------------------------------------
export interface HourlyForecast {
  date: string; // "20260709"
  time: string; // "1500"
  pty: number; // 강수형태
  sky: number; // 하늘상태 1맑음 3구름많음 4흐림
  temp: number | null; // 기온(℃)
  rn1: string; // 1시간 강수량 ("강수없음", "1mm 미만", "1.5mm"...)
  lgt: boolean; // 낙뢰 여부
  pop?: number | null; // 강수확률(%) — 단기예보에만 있음
}

export async function getUltraSrtFcst(grid: Grid): Promise<HourlyForecast[]> {
  let items: KmaItem[];
  try {
    const base = ultraSrtFcstBase();
    items = await callKma("getUltraSrtFcst", {
      numOfRows: "60",
      base_date: base.baseDate,
      base_time: base.baseTime,
      nx: String(grid.nx),
      ny: String(grid.ny),
    });
  } catch (e) {
    // 발표 직후 데이터 미제공 구간이면 한 시간 전 발표분으로 재시도
    if (!(e instanceof Error && e.message === NO_DATA)) throw e;
    const base = ultraSrtFcstBase(1);
    items = await callKma("getUltraSrtFcst", {
      numOfRows: "60",
      base_date: base.baseDate,
      base_time: base.baseTime,
      nx: String(grid.nx),
      ny: String(grid.ny),
    });
  }

  const byHour = new Map<string, HourlyForecast>();
  for (const item of items) {
    if (!item.fcstDate || !item.fcstTime) continue;
    const key = `${item.fcstDate}${item.fcstTime}`;
    let entry = byHour.get(key);
    if (!entry) {
      entry = {
        date: item.fcstDate,
        time: item.fcstTime,
        pty: 0,
        sky: 1,
        temp: null,
        rn1: "강수없음",
        lgt: false,
      };
      byHour.set(key, entry);
    }
    const v = item.fcstValue ?? "";
    switch (item.category) {
      case "PTY":
        entry.pty = Number(v) || 0;
        break;
      case "SKY":
        entry.sky = Number(v) || 1;
        break;
      case "T1H":
        entry.temp = Number.isNaN(Number(v)) ? null : Number(v);
        break;
      case "RN1":
        entry.rn1 = v;
        break;
      case "LGT":
        entry.lgt = Number(v) > 0;
        break;
    }
  }

  return [...byHour.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, entry]) => entry);
}

// ---------------------------------------------------------------------------
// 초단기실황: 현재 관측값
// ---------------------------------------------------------------------------
export interface CurrentConditions {
  pty: number;
  temp: number | null;
  rn1: string;
  humidity: number | null;
  windSpeed: number | null;
}

export async function getUltraSrtNcst(grid: Grid): Promise<CurrentConditions> {
  let items: KmaItem[];
  try {
    const base = ultraSrtNcstBase();
    items = await callKma("getUltraSrtNcst", {
      numOfRows: "10",
      base_date: base.baseDate,
      base_time: base.baseTime,
      nx: String(grid.nx),
      ny: String(grid.ny),
    });
  } catch (e) {
    if (!(e instanceof Error && e.message === NO_DATA)) throw e;
    const base = ultraSrtNcstBase(1);
    items = await callKma("getUltraSrtNcst", {
      numOfRows: "10",
      base_date: base.baseDate,
      base_time: base.baseTime,
      nx: String(grid.nx),
      ny: String(grid.ny),
    });
  }

  const current: CurrentConditions = {
    pty: 0,
    temp: null,
    rn1: "0",
    humidity: null,
    windSpeed: null,
  };
  for (const item of items) {
    const v = item.obsrValue ?? "";
    switch (item.category) {
      case "PTY":
        current.pty = Number(v) || 0;
        break;
      case "T1H":
        current.temp = Number.isNaN(Number(v)) ? null : Number(v);
        break;
      case "RN1":
        current.rn1 = v;
        break;
      case "REH":
        current.humidity = Number.isNaN(Number(v)) ? null : Number(v);
        break;
      case "WSD":
        current.windSpeed = Number.isNaN(Number(v)) ? null : Number(v);
        break;
    }
  }
  return current;
}

// ---------------------------------------------------------------------------
// 단기예보: 하루 8회(02/05/08/11/14/17/20/23시) 발표, 3일치 시간별 예보
// 초단기(6시간)를 넘는 시간대(예: 아침에 보는 퇴근길)는 이걸로 커버한다
// ---------------------------------------------------------------------------
// 발표 +10분 이후 제공 — 15분 버퍼를 두고 최근 발표분부터 선택
export function vilageFcstBase(offsetSlots = 0): { baseDate: string; baseTime: string } {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const nowMin = d.getUTCHours() * 60 + d.getUTCMinutes();
  const slots = [23, 20, 17, 14, 11, 8, 5, 2];

  const available: { dayOffset: number; hour: number }[] = [];
  for (const s of slots) {
    if (nowMin >= s * 60 + 15) available.push({ dayOffset: 0, hour: s });
  }
  for (const s of slots) available.push({ dayOffset: -1, hour: s });

  const pick = available[Math.min(offsetSlots, available.length - 1)];
  const base = new Date(d);
  base.setUTCDate(base.getUTCDate() + pick.dayOffset);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    baseDate: `${base.getUTCFullYear()}${p(base.getUTCMonth() + 1)}${p(base.getUTCDate())}`,
    baseTime: `${p(pick.hour)}00`,
  };
}

export async function getVilageFcst(grid: Grid): Promise<HourlyForecast[]> {
  let items: KmaItem[];
  try {
    const base = vilageFcstBase();
    items = await callKma("getVilageFcst", {
      numOfRows: "500", // 12카테고리 × ~40시간 — 오늘 저녁까지 넉넉히 커버
      base_date: base.baseDate,
      base_time: base.baseTime,
      nx: String(grid.nx),
      ny: String(grid.ny),
    });
  } catch (e) {
    // 발표 직후 미제공 구간이면 한 슬롯 전 발표분으로 재시도
    if (!(e instanceof Error && e.message === NO_DATA)) throw e;
    const base = vilageFcstBase(1);
    items = await callKma("getVilageFcst", {
      numOfRows: "500",
      base_date: base.baseDate,
      base_time: base.baseTime,
      nx: String(grid.nx),
      ny: String(grid.ny),
    });
  }

  const byHour = new Map<string, HourlyForecast>();
  for (const item of items) {
    if (!item.fcstDate || !item.fcstTime) continue;
    const key = `${item.fcstDate}${item.fcstTime}`;
    let entry = byHour.get(key);
    if (!entry) {
      entry = {
        date: item.fcstDate,
        time: item.fcstTime,
        pty: 0,
        sky: 1,
        temp: null,
        rn1: "강수없음",
        lgt: false,
        pop: null,
      };
      byHour.set(key, entry);
    }
    const v = item.fcstValue ?? "";
    switch (item.category) {
      case "PTY":
        entry.pty = Number(v) || 0;
        break;
      case "SKY":
        entry.sky = Number(v) || 1;
        break;
      case "TMP":
        entry.temp = Number.isNaN(Number(v)) ? null : Number(v);
        break;
      case "PCP":
        entry.rn1 = v;
        break;
      case "POP":
        entry.pop = Number.isNaN(Number(v)) ? null : Number(v);
        break;
    }
  }

  return [...byHour.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, entry]) => entry);
}

// ---------------------------------------------------------------------------
// 강수 판정
// ---------------------------------------------------------------------------
// PTY 코드: 0없음 1비 2비/눈 3눈 4소나기 5빗방울 6빗방울눈날림 7눈날림
export type PrecipKind = "rain" | "sleet" | "snow" | "none";

export function ptyToKind(pty: number): PrecipKind {
  if (pty === 1 || pty === 4 || pty === 5) return "rain";
  if (pty === 2 || pty === 6) return "sleet";
  if (pty === 3 || pty === 7) return "snow";
  return "none";
}

export interface PrecipEvent {
  date: string;
  time: string;
  kind: Exclude<PrecipKind, "none">;
  pty: number;
  pop?: number | null; // 강수확률(%) — 단기예보 기반일 때만
}

// 예보 목록에서 withinHours 시간 내 첫 강수 시점을 찾는다 (예보는 1시간 간격)
export function findPrecip(
  hourly: HourlyForecast[],
  withinHours?: number
): PrecipEvent | null {
  const scope = withinHours ? hourly.slice(0, withinHours) : hourly;
  for (const h of scope) {
    const kind = ptyToKind(h.pty);
    if (kind !== "none") {
      return { date: h.date, time: h.time, kind, pty: h.pty };
    }
  }
  return null;
}

// 특정 날짜의 시간대 창(startHour~endHour, 양끝 포함)에서 첫 강수를 찾는다
// — 출퇴근 브리핑용. 모든 판정은 PTY(강수형태) 기준.
export function findPrecipInWindow(
  hourly: HourlyForecast[],
  ymd: string,
  startHour: number,
  endHour: number
): PrecipEvent | null {
  for (const h of hourly) {
    if (h.date !== ymd) continue;
    const hh = Number(h.time.slice(0, 2));
    if (hh < startHour || hh > endHour) continue;
    const kind = ptyToKind(h.pty);
    if (kind !== "none") {
      return { date: h.date, time: h.time, kind, pty: h.pty, pop: h.pop ?? null };
    }
  }
  return null;
}

// "1500" → "오후 3시"
export function formatKoreanHour(time: string): string {
  const h = Number(time.slice(0, 2));
  if (h === 0) return "자정";
  if (h === 12) return "낮 12시";
  if (h < 12) return `오전 ${h}시`;
  return `오후 ${h - 12}시`;
}
