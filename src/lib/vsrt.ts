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
  // window 안 강수 세기(mm/h). 강수형태(PTY)만 있고 양이 0인 미량 강수는 0.4로 표기.
  // 바다/영역밖 = -99. (알림 판정과 어긋나지 않도록 PTY도 함께 반영)
  rn1: number[];
  // window 안 강수형태 코드(0없음 1비 2비/눈 3눈 4소나기 5빗방울 6빗방울눈 7눈날림).
  // 육지 강수없음=0, 바다/영역밖=-99. 알림(getUltraSrtFcst PTY)과 동일 기준.
  pty: number[];
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

  // 유효한 tmfc 찾기 (+1h RN1 프레임이 존재하는 가장 최근 발표)
  let tmfc: string | null = null;
  for (const candidate of tmfcCandidates()) {
    const grid = await fetchGrid(candidate, nextHourAfter(candidate, 1), "RN1");
    if (grid) {
      tmfc = candidate;
      break;
    }
  }
  if (!tmfc) return null;

  // 사용자 위치 중심 창으로 잘라내기 — RN1(세기) + PTY(형태) 결합
  // 화면 위(북쪽)부터 그리기 좋게 북→남 순서로 담는다
  const sliceWindow = (
    rn1grid: number[],
    ptygrid: number[] | null
  ): { rn1: number[]; pty: number[] } => {
    const rn1: number[] = new Array(size * size);
    const pty: number[] = new Array(size * size);
    let i = 0;
    for (let dy = half; dy >= -half; dy--) {
      for (let dx = -half; dx <= half; dx++) {
        const nx = center.nx + dx;
        const ny = center.ny + dy;
        if (nx < 1 || nx > DFS_NX || ny < 1 || ny > DFS_NY) {
          rn1[i] = -99;
          pty[i] = -99;
          i++;
          continue;
        }
        const idx = (ny - 1) * DFS_NX + (nx - 1);
        const rraw = rn1grid[idx];
        if (rraw < 0) {
          // 바다/영역밖
          rn1[i] = -99;
          pty[i] = -99;
          i++;
          continue;
        }
        const praw = ptygrid ? ptygrid[idx] : 0;
        const ptyv = praw > 0 && praw < 90 ? praw : 0;
        let mm = rraw > 0 ? rraw : 0;
        // 형태(PTY)는 있는데 양이 0인 미량 강수(소나기·빗방울 등)도 옅게 보이게
        if (mm === 0 && ptyv > 0) mm = 0.4;
        rn1[i] = Math.round(mm * 10) / 10;
        pty[i] = ptyv;
        i++;
      }
    }
    return { rn1, pty };
  };

  // +1h~+6h 프레임을 RN1·PTY 함께 조회
  const frames = (
    await Promise.all(
      [1, 2, 3, 4, 5, 6].map(async (h) => {
        const tmef = nextHourAfter(tmfc!, h);
        const [rn1grid, ptygrid] = await Promise.all([
          fetchGrid(tmfc!, tmef, "RN1"),
          fetchGrid(tmfc!, tmef, "PTY"),
        ]);
        if (!rn1grid) return null;
        const w = sliceWindow(rn1grid, ptygrid);
        return { tmef, rn1: w.rn1, pty: w.pty };
      })
    )
  ).filter((f): f is CloudFrame => f !== null);

  if (frames.length === 0) return null;

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
