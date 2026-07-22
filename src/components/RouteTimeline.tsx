"use client";

// 통근 경로 타임라인 — 집↔직장 경로 격자별 향후 6시간 강수를 한 눈에.
// 행 = 경로 지점(출발/경유/도착), 열 = 시각. 출근/퇴근 시간대는 배경 하이라이트.
import { useState, useEffect } from "react";
import { X, LoaderCircle, TriangleAlert } from "lucide-react";

interface RouteWeatherData {
  grids: { nx: number; ny: number }[];
  hours: { date: string; time: string }[];
  ptyMatrix: number[][];
  updatedAt: number;
}

type RouteState =
  | { status: "loading" }
  | { status: "ready"; data: RouteWeatherData }
  | { status: "error"; code: string };

interface Spot {
  name: string;
  lat: number;
  lng: number;
}

// PTY → 셀 표현 (판정 기준은 알림과 동일하게 강수형태)
function cellStyle(pty: number): { bg: string; label: string } {
  if (pty === 3 || pty === 7) return { bg: "#b4cdfa", label: "❄" };
  if (pty === 2 || pty === 6) return { bg: "#9db7f5", label: "🌨" };
  if (pty > 0) return { bg: "#5b8def", label: "💧" };
  return { bg: "transparent", label: "" };
}

export default function RouteTimeline({
  home,
  work,
  morning,
  evening,
  onClose,
}: {
  home: Spot;
  work: Spot;
  morning: [number, number];
  evening: [number, number];
  onClose: () => void;
}) {
  const [state, setState] = useState<RouteState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qs = `aLat=${home.lat}&aLng=${home.lng}&bLat=${work.lat}&bLng=${work.lng}`;
        const res = await fetch(`/api/route-weather?${qs}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) setState({ status: "error", code: json?.error ?? "OTHER" });
        else setState({ status: "ready", data: json });
      } catch {
        if (!cancelled) setState({ status: "error", code: "OTHER" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [home.lat, home.lng, work.lat, work.lng]);

  const data = state.status === "ready" ? state.data : null;

  // 경로 지점 라벨: 양끝은 이름, 중간은 경유
  const rowLabel = (idx: number, total: number): string => {
    if (idx === 0) return `🏠 ${home.name}`;
    if (idx === total - 1) return `🏢 ${work.name}`;
    return `경유 ${idx}`;
  };

  const inWindow = (time: string, w: [number, number]) => {
    const h = Number(time.slice(0, 2));
    return h >= w[0] && h <= w[1];
  };

  // 경로 전체에서 첫 강수 요약
  const summary = (): string => {
    if (!data) return "";
    for (let hi = 0; hi < data.hours.length; hi++) {
      for (let gi = 0; gi < data.ptyMatrix.length; gi++) {
        if (data.ptyMatrix[gi][hi] > 0) {
          const where =
            gi === 0
              ? home.name
              : gi === data.ptyMatrix.length - 1
                ? work.name
                : "경로 중간";
          const h = Number(data.hours[hi].time.slice(0, 2));
          return `${h}시 ${where} 부근에 비구름 ☔`;
        }
      }
    }
    return "앞으로 6시간, 통근 경로에 비 소식 없어요 ☀️";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-[#3d3652]/45 backdrop-blur-sm">
      <div className="w-full max-w-md bg-gradient-to-b from-[#dcebfb] to-[#f4f8ff] rounded-[32px] shadow-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-extrabold text-lg text-[#3d3652]">🛣️ 통근 경로 날씨</h3>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="p-2 bg-white/80 rounded-full shadow-sm text-[#6b7694] hover:text-[#3d3652] transition"
          >
            <X size={17} />
          </button>
        </div>

        {state.status === "loading" && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-[#8a97b3]">
            <LoaderCircle size={30} className="animate-spin" />
            <p className="text-sm font-medium">경로 하늘을 살펴보는 중...</p>
          </div>
        )}

        {state.status === "error" && (
          <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <TriangleAlert size={28} className="text-amber-500" />
            <p className="text-sm font-medium text-[#6b7694] max-w-[260px]">
              경로 날씨를 불러오지 못했어요. 잠시 후 다시 열어주세요.
            </p>
          </div>
        )}

        {data && (
          <>
            <div className="overflow-x-auto rounded-2xl bg-white/70 shadow-inner border border-white/70 p-3">
              <table className="w-full border-separate border-spacing-1">
                <thead>
                  <tr>
                    <th className="text-left text-[10px] font-bold text-[#8a97b3] px-1" />
                    {data.hours.map((h) => {
                      const highlight =
                        inWindow(h.time, morning) || inWindow(h.time, evening);
                      return (
                        <th
                          key={h.time}
                          className={`text-[10px] font-bold px-1 py-1 rounded-lg ${
                            highlight
                              ? "bg-[#fff1dd] text-[#c98a3c]"
                              : "text-[#8a97b3]"
                          }`}
                        >
                          {Number(h.time.slice(0, 2))}시
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {data.ptyMatrix.map((row, gi) => (
                    <tr key={gi}>
                      <td className="text-[10px] font-bold text-[#5a6b8c] pr-1 whitespace-nowrap max-w-[88px] truncate">
                        {rowLabel(gi, data.ptyMatrix.length)}
                      </td>
                      {row.map((pty, hi) => {
                        const { bg, label } = cellStyle(pty);
                        const highlight =
                          inWindow(data.hours[hi].time, morning) ||
                          inWindow(data.hours[hi].time, evening);
                        return (
                          <td
                            key={hi}
                            className={`text-center rounded-lg h-7 w-8 text-[11px] ${
                              highlight && pty === 0 ? "bg-[#fff7ea]" : ""
                            }`}
                            style={pty > 0 ? { background: bg } : undefined}
                          >
                            {label || <span className="text-[#d3ddeb]">·</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-sm font-bold text-[#3d3652] bg-white/75 rounded-2xl px-4 py-3 shadow-sm">
              {summary()}
            </p>

            <p className="mt-2 text-[10px] font-semibold text-[#8a97b3] flex items-center gap-2 flex-wrap">
              <span className="px-1.5 py-0.5 rounded bg-[#fff1dd] text-[#c98a3c]">출퇴근 시간대</span>
              <span>💧 비</span>
              <span>🌨 비/눈</span>
              <span>❄ 눈</span>
              <span>· 맑음</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
