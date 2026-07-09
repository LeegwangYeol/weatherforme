// 기상청 API허브 초단기예보 격자(nph-dfs_vsrt_grd) 클라이언트
// - DFS 5km 격자 (149×253), 남쪽(ny=1)부터 행 순서 — 검증 완료
// - 10분 간격 갱신 발표(tmfc), 예보시각(tmef)은 정시 단위로 +1h~+6h
import { latLngToGrid } from "./kma";

const VSRT_GRD_URL =
  "https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-dfs_vsrt_grd";

export const DFS_NX = 149;
export const DFS_NY = 253;

export function isApihubConfigured(): boolean {
  return Boolean(process.env.KMA_APIHUB_KEY);
}

function fmtKst(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(
    d.getUTCHours()
  )}${p(d.getUTCMinutes())}`;
}

// ASCII 격자 응답 → 숫자 배열 (37,697개). '#' 주석과 '=' 줄끝 마커 제거.
function parseGrid(text: string): number[] {
  const values = text
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .join(",")
    .split(/[,\s=]+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => !Number.isNaN(n));
  return values;
}

async function fetchGrid(
  tmfc: string,
  tmef: string,
  vars: string
): Promise<number[] | null> {
  const key = process.env.KMA_APIHUB_KEY;
  if (!key) throw new Error("KMA_APIHUB_KEY is not set");

  const url = `${VSRT_GRD_URL}?tmfc=${tmfc}&tmef=${tmef}&vars=${vars}&authKey=${encodeURIComponent(key)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const values = parseGrid(await res.text());
  if (values.length !== DFS_NX * DFS_NY) return null;
  // 발표 직후엔 껍데기(전부 -99)만 있을 수 있음 — 유효값 없으면 실패 처리
  if (!values.some((v) => v > -90)) return null;
  return values;
}

export interface CloudFrame {
  tmef: string; // "202607092200" (KST)
  rn1: number[]; // window 안 강수량(mm/h), 바다/영역밖 = -99
}

export interface CloudMapData {
  tmfc: string;
  center: { nx: number; ny: number };
  size: number; // 창 한 변 셀 수 (홀수)
  cellKm: number;
  frames: CloudFrame[];
}

// 최근 발표(tmfc) 후보: 지연 감안해 -15분부터 10분 단위로 과거 탐색
function tmfcCandidates(): string[] {
  const out: string[] = [];
  for (const back of [15, 25, 35, 45]) {
    const d = new Date(Date.now() + 9 * 3600 * 1000 - back * 60 * 1000);
    d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 10) * 10, 0, 0);
    out.push(fmtKst(d));
  }
  return [...new Set(out)];
}

// 사용자 위치 중심 size×size 창으로 향후 6시간 강수 프레임 생성
export async function getCloudMap(
  lat: number,
  lng: number,
  size = 41
): Promise<CloudMapData | null> {
  const center = latLngToGrid(lat, lng);
  const half = Math.floor(size / 2);

  // 유효한 tmfc 찾기 (+1h 프레임이 존재하는 가장 최근 발표)
  let tmfc: string | null = null;
  let firstFrame: { tmef: string; grid: number[] } | null = null;
  for (const candidate of tmfcCandidates()) {
    const tmef = nextHourAfter(candidate, 1);
    const grid = await fetchGrid(candidate, tmef, "RN1");
    if (grid) {
      tmfc = candidate;
      firstFrame = { tmef, grid };
      break;
    }
  }
  if (!tmfc || !firstFrame) return null;

  // 나머지 +2h~+6h 병렬 요청
  const rest = await Promise.all(
    [2, 3, 4, 5, 6].map(async (h) => {
      const tmef = nextHourAfter(tmfc!, h);
      const grid = await fetchGrid(tmfc!, tmef, "RN1");
      return grid ? { tmef, grid } : null;
    })
  );

  const slice = (grid: number[]): number[] => {
    const out: number[] = new Array(size * size);
    let i = 0;
    // 화면 위(북쪽)부터 그리기 좋게 북→남 순서로 담는다
    for (let dy = half; dy >= -half; dy--) {
      for (let dx = -half; dx <= half; dx++) {
        const nx = center.nx + dx;
        const ny = center.ny + dy;
        if (nx < 1 || nx > DFS_NX || ny < 1 || ny > DFS_NY) {
          out[i++] = -99;
        } else {
          const v = grid[(ny - 1) * DFS_NX + (nx - 1)];
          out[i++] = v < 0 ? -99 : Math.round(v * 10) / 10;
        }
      }
    }
    return out;
  };

  const frames: CloudFrame[] = [
    { tmef: firstFrame.tmef, rn1: slice(firstFrame.grid) },
    ...rest
      .filter((f): f is { tmef: string; grid: number[] } => f !== null)
      .map((f) => ({ tmef: f.tmef, rn1: slice(f.grid) })),
  ];

  return { tmfc, center, size, cellKm: 5, frames };
}

// tmfc 기준 h시간 뒤의 정시 tmef ("YYYYMMDDHH00")
function nextHourAfter(tmfc: string, h: number): string {
  const d = new Date(
    Date.UTC(
      Number(tmfc.slice(0, 4)),
      Number(tmfc.slice(4, 6)) - 1,
      Number(tmfc.slice(6, 8)),
      Number(tmfc.slice(8, 10)),
      Number(tmfc.slice(10, 12))
    )
  );
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(d.getUTCHours() + h);
  return fmtKst(d);
}
