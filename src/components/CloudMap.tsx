"use client";

// 비구름 지도 — 내 위치 중심 ±100km, 향후 6시간 강수 예측 애니메이션
// 기상청 초단기예보 격자(5km)를 캔버스에 파스텔 톤으로 렌더링한다.
import { useState, useEffect, useRef, useCallback } from "react";
import { X, Play, Pause, LoaderCircle, TriangleAlert, MapPin } from "lucide-react";
import { latLngToGrid, routeGrids } from "@/lib/kma";

interface CloudFrame {
  tmef: string;
  rn1: number[];
  pty: number[];
}

interface CloudMapData {
  tmfc: string;
  center: { nx: number; ny: number };
  size: number;
  cellKm: number;
  frames: CloudFrame[];
}

interface Precip {
  date: string;
  time: string;
  kind: "rain" | "sleet" | "snow";
  pty: number;
}

type MapState =
  | { status: "loading" }
  | { status: "ready"; data: CloudMapData }
  | { status: "error"; code: string };

const CELL_PX = 10; // 캔버스 내부 해상도 (CSS로 확대)

// 강수 세기(mm/h) + 형태(PTY) → 파스텔 색. 눈은 흰-하늘색, 비는 파랑-보라.
function cellColor(mm: number, pty: number): string | null {
  if (mm <= 0) return null;
  const isSnow = pty === 3 || pty === 7;
  if (isSnow) {
    if (mm < 1) return "rgba(214, 228, 255, 0.7)";
    if (mm < 3) return "rgba(180, 205, 250, 0.8)";
    return "rgba(150, 185, 245, 0.9)";
  }
  if (mm < 1) return "rgba(154, 196, 248, 0.55)";
  if (mm < 3) return "rgba(112, 165, 240, 0.7)";
  if (mm < 7) return "rgba(74, 126, 230, 0.8)";
  if (mm < 15) return "rgba(122, 95, 226, 0.85)";
  return "rgba(168, 74, 200, 0.9)";
}

function hourLabel(tmef: string): string {
  return `${Number(tmef.slice(8, 10))}시`;
}

function formatKoreanHour(time: string): string {
  const h = Number(time.slice(0, 2));
  if (h === 0) return "자정";
  if (h === 12) return "낮 12시";
  return h < 12 ? `오전 ${h}시` : `오후 ${h - 12}시`;
}

export default function CloudMap({
  lat,
  lng,
  place,
  precip,
  route,
  onClose,
}: {
  lat: number;
  lng: number;
  place: string | null;
  // 알림/날씨카드와 동일한 강수 판정 결과 — 지도 상단 문구를 이걸로 통일
  precip: Precip | null;
  // 통근 경로 오버레이 (집↔직장) — 지정시 핀/연결선/경로 격자 표시
  route?: { home: { lat: number; lng: number }; work: { lat: number; lng: number } };
  onClose: () => void;
}) {
  const [state, setState] = useState<MapState>({ status: "loading" });
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 데이터 로드
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/cloudmap?lat=${lat}&lng=${lng}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({ status: "error", code: json?.error ?? "OTHER" });
        } else {
          setState({ status: "ready", data: json });
        }
      } catch {
        if (!cancelled) setState({ status: "error", code: "OTHER" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  // 프레임 자동 재생
  useEffect(() => {
    if (!playing || state.status !== "ready") return;
    const total = state.data.frames.length;
    const timer = setInterval(() => {
      setFrameIdx((i) => (i + 1) % total);
    }, 750);
    return () => clearInterval(timer);
  }, [playing, state]);

  // 캔버스 렌더링
  useEffect(() => {
    if (state.status !== "ready") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { size, frames } = state.data;
    const frame = frames[Math.min(frameIdx, frames.length - 1)];
    const px = CELL_PX;
    canvas.width = size * px;
    canvas.height = size * px;

    // 배경 (하늘)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const v = frame.rn1[row * size + col];
        const x = col * px;
        const y = row * px;

        if (v === -99) {
          // 바다/영역밖 — 살짝 어둡게 (해안선 실루엣)
          ctx.fillStyle = "rgba(90, 110, 150, 0.10)";
          ctx.fillRect(x, y, px, px);
          continue;
        }
        // 육지 옅은 바탕
        ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
        ctx.fillRect(x, y, px, px);

        const color = cellColor(v, frame.pty[row * size + col]);
        if (color) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.roundRect(x + 0.5, y + 0.5, px - 1, px - 1, 3);
          ctx.fill();
        }
      }
    }

    // ---- 통근 경로 오버레이 (집↔직장) ----
    if (route) {
      const { center } = state.data;
      const half = Math.floor(size / 2);
      // 격자 → 창 내 픽셀 중심 (창은 북쪽이 위: row = center.ny - ny + half)
      const toPixel = (g: { nx: number; ny: number }) => ({
        x: (g.nx - center.nx + half + 0.5) * px,
        y: (center.ny - g.ny + half + 0.5) * px,
        inside:
          Math.abs(g.nx - center.nx) <= half && Math.abs(g.ny - center.ny) <= half,
      });

      const homeG = latLngToGrid(route.home.lat, route.home.lng);
      const workG = latLngToGrid(route.work.lat, route.work.lng);
      const path = routeGrids(route.home, route.work);

      // 경로 격자 테두리 (연한 핑크 점선 느낌)
      ctx.strokeStyle = "rgba(240, 103, 158, 0.45)";
      ctx.lineWidth = 1.5;
      for (const g of path) {
        const p = toPixel(g);
        if (!p.inside) continue;
        ctx.beginPath();
        ctx.roundRect(p.x - px / 2 + 1, p.y - px / 2 + 1, px - 2, px - 2, 3);
        ctx.stroke();
      }

      // 집-직장 연결선
      const hp = toPixel(homeG);
      const wp = toPixel(workG);
      ctx.strokeStyle = "rgba(240, 103, 158, 0.7)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(hp.x, hp.y);
      ctx.lineTo(wp.x, wp.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // 🏠/🏢 핀 (흰 원 배경 + 이모지)
      for (const [p, emoji] of [
        [hp, "🏠"],
        [wp, "🏢"],
      ] as const) {
        if (!p.inside) continue;
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, px * 0.85, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(240, 103, 158, 0.8)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = `${Math.round(px * 1.1)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(emoji, p.x, p.y + 0.5);
      }
    } else {
      // 경로가 없으면 기존처럼 중앙 = 내 위치 링
      const c = (Math.floor(size / 2) + 0.5) * px;
      ctx.strokeStyle = "#f0679e";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(c, c, px * 0.9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#f0679e";
      ctx.beginPath();
      ctx.arc(c, c, px * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [state, frameIdx, route]);

  // 지도 상단 안내 문구.
  // 1순위: 알림/날씨카드와 동일한 precip(초단기예보 PTY 판정) → 문구 완전 일치 보장
  // 2순위(precip 없을 때): 격자의 강수형태(PTY)로 내 위치 3×3에서 도착 추정
  const headline = useCallback((): string => {
    if (precip) {
      const when = formatKoreanHour(precip.time);
      if (precip.kind === "snow") return `${when}부터 눈이 와요 ❄️`;
      if (precip.kind === "sleet") return `${when}부터 진눈깨비가 와요 🌨️`;
      return `${when}부터 비가 와요 ☔`;
    }
    if (state.status !== "ready") return "";
    const { size, frames } = state.data;
    const half = Math.floor(size / 2);
    // 형태(PTY)>0 을 강수로 간주 — 알림과 동일 기준 (양이 0인 소나기도 포함)
    const hasPrecip = (f: CloudFrame) => {
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (f.pty[(half + dy) * size + (half + dx)] > 0) return true;
        }
      return false;
    };
    const idx = frames.findIndex(hasPrecip);
    if (idx === -1) return "앞으로 6시간, 내 위치엔 비 소식 없어요 ☀️";
    if (idx === 0) return "이미 근처에 비구름이 있어요! ☔";
    return `약 ${idx}시간 뒤 비구름이 도착할 것 같아요 ☔`;
  }, [state, precip]);

  const data = state.status === "ready" ? state.data : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-[#3d3652]/45 backdrop-blur-sm">
      <div className="w-full max-w-md bg-gradient-to-b from-[#dcebfb] to-[#f4f8ff] rounded-[32px] shadow-2xl p-5 relative">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-extrabold text-lg text-[#3d3652] flex items-center gap-1.5">
            🌧️ 비구름 지도
          </h3>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="p-2 bg-white/80 rounded-full shadow-sm text-[#6b7694] hover:text-[#3d3652] transition"
          >
            <X size={17} />
          </button>
        </div>

        {state.status === "loading" && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-[#8a97b3]">
            <LoaderCircle size={32} className="animate-spin" />
            <p className="text-sm font-medium">하늘을 살펴보는 중...</p>
          </div>
        )}

        {state.status === "error" && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <TriangleAlert size={30} className="text-amber-500" />
            <p className="text-sm font-medium text-[#6b7694] max-w-[260px]">
              {state.code === "APIHUB_KEY_MISSING"
                ? "기상청 API허브 키(KMA_APIHUB_KEY)가 서버에 설정돼 있지 않아요."
                : "비구름 정보를 불러오지 못했어요. 잠시 후 다시 열어주세요."}
            </p>
          </div>
        )}

        {data && (
          <>
            <p className="text-xs font-semibold text-[#6b7694] mb-2 flex items-center gap-1">
              <MapPin size={12} className="text-[#f0679e]" />
              {place ?? "내 위치"} 중심 ±100km · 기상청 초단기예보
            </p>

            <div className="relative rounded-3xl overflow-hidden border border-white/70 shadow-inner">
              <canvas
                ref={canvasRef}
                className="w-full h-auto block"
                style={{ imageRendering: "auto" }}
              />
              {/* 시간 라벨 */}
              <span className="absolute top-2.5 left-2.5 text-[13px] font-extrabold text-[#3d3652] bg-white/85 rounded-full px-3 py-1 shadow-sm">
                {hourLabel(data.frames[Math.min(frameIdx, data.frames.length - 1)].tmef)}{" "}
                예보
              </span>
            </div>

            {/* 재생 컨트롤 */}
            <div className="flex items-center gap-2.5 mt-3">
              <button
                onClick={() => setPlaying((p) => !p)}
                aria-label={playing ? "일시정지" : "재생"}
                className="p-2.5 bg-[#5b8def] text-white rounded-full shadow-md shadow-[#5b8def]/30 transition active:scale-95"
              >
                {playing ? <Pause size={15} /> : <Play size={15} />}
              </button>
              <div className="flex-1 flex gap-1.5">
                {data.frames.map((f, i) => (
                  <button
                    key={f.tmef}
                    onClick={() => {
                      setFrameIdx(i);
                      setPlaying(false);
                    }}
                    className={`flex-1 h-2 rounded-full transition ${
                      i === frameIdx ? "bg-[#5b8def]" : "bg-[#b9c9e2]"
                    }`}
                    aria-label={hourLabel(f.tmef)}
                  />
                ))}
              </div>
            </div>

            {/* 도착 안내 (알림/날씨카드와 동일 기준) */}
            <p className="mt-3 text-sm font-bold text-[#3d3652] bg-white/75 rounded-2xl px-4 py-3 shadow-sm">
              {headline()}
            </p>

            {/* 범례 */}
            <div className="flex items-center gap-2 mt-2.5 text-[10px] font-semibold text-[#8a97b3]">
              <span>약함</span>
              {["rgba(154,196,248,.8)", "rgba(112,165,240,.85)", "rgba(74,126,230,.9)", "rgba(122,95,226,.9)", "rgba(168,74,200,.95)"].map(
                (c) => (
                  <span key={c} className="w-5 h-2.5 rounded-full" style={{ background: c }} />
                )
              )}
              <span>강함</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
