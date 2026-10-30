import React from "react";
import Link from "next/link";
import WeatherBunny from "../components/WeatherBunny";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center p-4 text-center">
      <div className="w-full max-w-md rounded-3xl border border-white/80 bg-white/80 p-6 sm:p-8 shadow-xl backdrop-blur-xl transition-all">
        <div className="flex justify-center mb-2">
          <WeatherBunny kind="idle" size={140} />
        </div>

        <span className="inline-block rounded-full bg-purple-100/80 px-3 py-1 text-xs font-semibold text-purple-700 mb-3">
          404 Not Found 🎈
        </span>

        <h1 className="text-2xl font-bold text-[#3d3652] tracking-tight">
          페이지를 찾을 수 없어요
        </h1>

        <p className="mt-2 text-sm text-[#526585] leading-relaxed">
          요청하신 페이지가 구름 너머로 날아갔거나
          <br />
          주소가 변경되었을 수 있습니다.
        </p>

        <div className="mt-6 flex justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition hover:from-blue-600 hover:to-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 active:scale-[0.98]"
          >
            날씨 홈으로 돌아가기 🏠
          </Link>
        </div>
      </div>
    </div>
  );
}
