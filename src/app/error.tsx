"use client";

import React, { useEffect, useState } from "react";
import WeatherBunny from "../components/WeatherBunny";
import { logger } from "../lib/logger";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    logger.error("RouteError", "Unhandled error in page route segment", error, {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <div className="flex min-h-[80vh] w-full flex-col items-center justify-center p-4 text-center">
      <div className="w-full max-w-md rounded-3xl border border-white/80 bg-white/80 p-6 sm:p-8 shadow-xl backdrop-blur-xl transition-all">
        <div className="flex justify-center mb-2">
          <WeatherBunny kind="cloud" size={130} />
        </div>

        <span className="inline-block rounded-full bg-blue-100/80 px-3 py-1 text-xs font-semibold text-blue-700 mb-3">
          일시적인 날씨 오류 🌧️
        </span>

        <h2 className="text-xl font-bold text-[#3d3652] tracking-tight">
          날씨 정보를 불러오지 못했어요
        </h2>

        <p className="mt-2 text-sm text-[#526585] leading-relaxed">
          기상청 연결 또는 화면 렌더링 중 문제가 발생했습니다.
          <br />
          잠시 후 다시 시도해 주세요.
        </p>

        <div className="mt-6 flex flex-col sm:flex-row gap-2.5 justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition hover:from-blue-600 hover:to-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 active:scale-[0.98] cursor-pointer"
          >
            다시 시도하기
          </button>
          <button
            type="button"
            onClick={() => {
              window.location.href = "/";
            }}
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-2xl border border-[#dfe8f2] bg-white/90 px-5 py-3 text-sm font-semibold text-[#526585] shadow-sm transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 active:scale-[0.98] cursor-pointer"
          >
            홈으로 새로고침
          </button>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-100 text-left">
          <button
            type="button"
            onClick={() => setShowDetails((prev) => !prev)}
            className="text-[11px] font-medium text-gray-400 hover:text-gray-600 focus-visible:outline-none transition cursor-pointer"
          >
            {showDetails ? "▼ 오류 세부 정보 접기" : "▶ 오류 세부 정보 확인"}
          </button>

          {showDetails && (
            <div className="mt-2 p-3 rounded-xl bg-gray-50 text-[11px] font-mono text-gray-600 break-all leading-relaxed overflow-auto max-h-32 border border-gray-200/50">
              <p>
                <strong>Error:</strong> {error.message || "Unknown error"}
              </p>
              {error.digest && (
                <p className="mt-1">
                  <strong>Digest:</strong> {error.digest}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
