"use client";

// 비구름 지도 — 내 위치 중심 ±100km, 향후 6시간 강수 예측 애니메이션
// 기상청 초단기예보 격자(5km)를 캔버스에 파스텔 톤으로 렌더링한다.
import { useState, useEffect, useRef, useCallback } from "react";
import { X, Play, Pause, LoaderCircle, TriangleAlert, MapPin } from "lucide-react";

interface CloudFrame {
  tmef: string;
  rn1: number[];
}

interface CloudMapData {
  tmfc: string;
  center: { nx: number; ny: number };
  size: number;
  cellKm: number;
  frames: CloudFrame[];
}

type MapState =
  | { status: "loading" }
  | { status: "ready"; data: CloudMapData }
  | { status: "error"; code: string };

const CELL_PX = 10; // 캔버스 내부 해상도 (CSS로 확대)

// 강수량(mm/h) → 파스텔 색
function rainColor(mm: number): string | null {
  if (mm <= 0) return null;
  if (mm < 1) return "rgba(154, 196, 248, 0.55)";
  if (mm < 3) return "rgba(112, 165, 240, 0.7)";
  if (mm < 7) return "rgba(74, 126, 230, 0.8)";
  if (mm < 15) return "rgba(122, 95, 226, 0.85)";
  return "rgba(168, 74, 200, 0.9)";
}

function hourLabel(tmef: string): string {
  return `${Number(tmef.slice(8, 10))}시`;
}

export default function CloudMap({
  lat,
  lng,
  place,
  onClose,
}: {
  lat: number;
  lng: number;
  place: string | null;
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

        const color = rainColor(v);
        if (color) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.roundRect(x + 0.5, y + 0.5, px - 1, px - 1, 3);
          ctx.fill();
        }
      }
    }

    // 중앙 = 내 위치 표시 (십자 + 링)
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
  }, [state, frameIdx]);

  // 내 위치(중앙 3×3) 기준 첫 강수 프레임 → 안내 문구
  const arrival = useCallback((): string => {
    if (state.status !== "ready") return "";
    const { size, frames, tmfc } = state.data;
    const half = Math.floor(size / 2);
    const hasRain = (f: CloudFrame) => {
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const v = f.rn1[(half + dy) * size + (half + dx)];
          if (v > 0) return true;
        }
      return false;
    };
    const idx = frames.findIndex(hasRain);
    if (idx === -1) return "앞으로 6시간, 내 위치엔 비 소식 없어요 ☀️";
    // tmfc(분 포함) → 첫 강수 tmef까지 대략적인 시간 차
    const fcH = Number(tmfc.slice(8, 10)) + Number(tmfc.slice(10, 12)) / 60;
    const efH = Number(frames[idx].tmef.slice(8, 10));
    let diff = efH - fcH;
    if (diff < 0) diff += 24;
    const rounded = Math.max(1, Math.round(diff));
    return idx === 0
      ? "이미 근처에 비구름이 있어요! ☔"
      : `약 ${rounded}시간 뒤 비구름이 도착할 것 같아요 ☔`;
  }, [state]);

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

            {/* 도착 안내 */}
            <p className="mt-3 text-sm font-bold text-[#3d3652] bg-white/75 rounded-2xl px-4 py-3 shadow-sm">
              {arrival()}
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
