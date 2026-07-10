"use client";

// 상태 점검 카드 — 알림이 오기 위한 조건들을 기기/서버로 나눠 ✅⚠️❌로 보여준다
import { useState, useEffect } from "react";
import {
  Stethoscope,
  CircleCheck,
  CircleAlert,
  CircleX,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";

type Level = "ok" | "warn" | "fail";

interface CheckRow {
  label: string;
  level: Level;
  hint?: string;
}

interface Props {
  pushEnv: "checking" | "ok" | "unsupported" | "dev";
  inAppBrowser: boolean;
  isIOS: boolean;
  iosTooOld: boolean;
  isStandalone: boolean;
  hasLocation: boolean;
  weatherReady: boolean;
  isSubscribed: boolean;
}

const LEVEL_STYLE: Record<Level, { Icon: typeof CircleCheck; cls: string }> = {
  ok: { Icon: CircleCheck, cls: "text-[#2e9e63]" },
  warn: { Icon: CircleAlert, cls: "text-[#e8a13c]" },
  fail: { Icon: CircleX, cls: "text-[#e2647c]" },
};

export default function DiagnosticsCard({
  pushEnv,
  inAppBrowser,
  isIOS,
  iosTooOld,
  isStandalone,
  hasLocation,
  weatherReady,
  isSubscribed,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  // null = 점검 필요(진행 중) — '다시 점검'은 rows를 비워서 재실행을 유도
  const [rows, setRows] = useState<CheckRow[] | null>(null);
  const checking = expanded && rows === null;

  // 펼칠 때(또는 rows가 비워졌을 때) 점검 실행
  useEffect(() => {
    if (!expanded || rows !== null) return;
    let cancelled = false;

    const runChecks = async () => {
    const out: CheckRow[] = [];

    // ---- 기기 체크 ----
    if (inAppBrowser) {
      out.push({
        label: "브라우저 종류",
        level: "fail",
        hint: "인앱 브라우저예요. Safari/Chrome으로 열어주세요.",
      });
    } else {
      out.push({ label: "브라우저 종류", level: "ok" });
    }

    out.push(
      pushEnv === "unsupported"
        ? { label: "웹 푸시 지원", level: "fail", hint: "이 브라우저는 푸시를 지원하지 않아요." }
        : pushEnv === "dev"
          ? { label: "웹 푸시 지원", level: "warn", hint: "개발 모드에선 꺼져 있어요." }
          : { label: "웹 푸시 지원", level: "ok" }
    );

    if (isIOS) {
      if (iosTooOld) {
        out.push({ label: "iOS 버전", level: "fail", hint: "iOS 16.4 이상이 필요해요." });
      } else {
        out.push({ label: "iOS 버전", level: "ok" });
      }
      out.push(
        isStandalone
          ? { label: "홈 화면 설치", level: "ok" }
          : {
              label: "홈 화면 설치",
              level: "fail",
              hint: "아이폰은 설치된 앱에서만 알림이 와요.",
            }
      );
    }

    // 알림 권한
    const permission =
      typeof Notification !== "undefined" ? Notification.permission : "default";
    out.push(
      permission === "granted"
        ? { label: "알림 권한", level: "ok" }
        : permission === "denied"
          ? {
              label: "알림 권한",
              level: "fail",
              hint: "차단돼 있어요. 폰 설정 → 애플리케이션 → WeatherForMe(또는 Chrome) → 알림에서 허용해주세요.",
            }
          : { label: "알림 권한", level: "warn", hint: "아직 허용 전이에요. '비 알림 켜기'를 눌러주세요." }
    );

    // 서비스워커 + 구독
    let subscription: PushSubscription | null = null;
    if (pushEnv === "ok") {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        out.push(
          reg?.active
            ? { label: "서비스워커", level: "ok" }
            : { label: "서비스워커", level: "fail", hint: "페이지를 새로고침해보세요." }
        );
        subscription = (await reg?.pushManager.getSubscription()) ?? null;
      } catch {
        out.push({ label: "서비스워커", level: "fail", hint: "페이지를 새로고침해보세요." });
      }
      out.push(
        subscription
          ? { label: "푸시 구독", level: "ok" }
          : {
              label: "푸시 구독",
              level: isSubscribed ? "fail" : "warn",
              hint: "'비 알림 켜기'를 눌러 구독해주세요.",
            }
      );
    }

    // 위치/날씨
    out.push(
      hasLocation
        ? { label: "위치 설정", level: "ok" }
        : { label: "위치 설정", level: "warn", hint: "'현재 위치로 시작하기'를 눌러주세요." }
    );
    out.push(
      weatherReady
        ? { label: "기상청 데이터 수신", level: "ok" }
        : { label: "기상청 데이터 수신", level: "warn", hint: "날씨가 아직 안 떴어요." }
    );

    // ---- 서버 체크 ----
    try {
      const res = await fetch("/api/push-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription?.endpoint ?? null }),
      });
      const json = await res.json();
      if (res.ok) {
        out.push(
          json.server.persistentStore
            ? { label: "서버 저장소(Redis)", level: "ok" }
            : {
                label: "서버 저장소(Redis)",
                level: "fail",
                hint: "구독이 유지되지 않아요. Vercel Storage 연결 필요.",
              }
        );
        out.push(
          json.server.kmaConfigured
            ? { label: "기상청 API 키", level: "ok" }
            : { label: "기상청 API 키", level: "fail", hint: "KMA_SERVICE_KEY 미설정." }
        );
        out.push(
          json.server.apihubConfigured
            ? { label: "API허브 키(비구름 지도)", level: "ok" }
            : { label: "API허브 키(비구름 지도)", level: "warn", hint: "KMA_APIHUB_KEY 미설정." }
        );
        // 스케줄러 생존 확인 — 마지막 정기 체크가 언제였는지
        const lastCronAt: number | null = json.server.lastCronAt ?? null;
        const minutesAgo = lastCronAt
          ? Math.round((Date.now() - lastCronAt) / 60000)
          : null;
        out.push(
          minutesAgo === null
            ? {
                label: "서버 정기 체크(크론)",
                level: "warn",
                hint: "아직 기록이 없어요. 잠시 후 다시 점검해보세요.",
              }
            : minutesAgo <= 20
              ? { label: "서버 정기 체크(크론)", level: "ok", hint: `${minutesAgo}분 전에 하늘을 확인했어요.` }
              : minutesAgo <= 75
                ? {
                    label: "서버 정기 체크(크론)",
                    level: "warn",
                    hint: `마지막 체크가 ${minutesAgo}분 전 — 스케줄러가 지연되고 있어요.`,
                  }
                : {
                    label: "서버 정기 체크(크론)",
                    level: "fail",
                    hint: `마지막 체크가 ${Math.round(minutesAgo / 60)}시간 전 — 스케줄러가 멈춘 것 같아요.`,
                  }
        );
        if (subscription) {
          if (json.device?.registered) {
            out.push({
              label: "서버에 이 기기 등록",
              level: "ok",
              hint: json.device.cooldownActive
                ? "최근 알림이 발송돼 재알림 쿨다운(기본 3시간) 중이에요."
                : undefined,
            });
          } else {
            out.push({
              label: "서버에 이 기기 등록",
              level: "fail",
              hint: "알림을 껐다가 다시 켜주세요.",
            });
          }
        }
      } else {
        out.push({ label: "서버 상태", level: "fail", hint: "서버 점검에 실패했어요." });
      }
    } catch {
      out.push({ label: "서버 상태", level: "fail", hint: "서버에 연결하지 못했어요." });
    }

    if (!cancelled) setRows(out);
    };

    void runChecks();
    return () => {
      cancelled = true;
    };
  }, [
    expanded,
    rows,
    pushEnv,
    inAppBrowser,
    isIOS,
    iosTooOld,
    isStandalone,
    hasLocation,
    weatherReady,
    isSubscribed,
  ]);

  const failCount = rows?.filter((r) => r.level === "fail").length ?? 0;
  const warnCount = rows?.filter((r) => r.level === "warn").length ?? 0;
  const summary =
    rows === null
      ? ""
      : failCount > 0
        ? `문제 ${failCount}건`
        : warnCount > 0
          ? `확인 ${warnCount}건`
          : "모두 정상";
  const summaryCls =
    failCount > 0
      ? "bg-[#ffe9ec] text-[#e2647c]"
      : warnCount > 0
        ? "bg-[#fff6e6] text-[#c98a3c]"
        : "bg-[#e8f8ef] text-[#2e9e63]";

  return (
    <section className="bg-white/70 backdrop-blur-xl border border-white/80 rounded-[32px] shadow-xl shadow-[#8aa3c4]/20 overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full p-6 flex items-center gap-3 text-left"
      >
        <div className="p-3 bg-[#eae4ff] rounded-2xl">
          <Stethoscope className="text-[#8b6de8]" size={24} />
        </div>
        <div className="flex-1">
          <h3 className="font-extrabold text-lg flex items-center gap-2">
            상태 점검
            {rows !== null && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${summaryCls}`}>
                {summary}
              </span>
            )}
          </h3>
          <p className="text-sm text-[#6b7694]">알림이 안 오면 여기부터 확인해요.</p>
        </div>
        {expanded ? (
          <ChevronUp size={18} className="text-[#8a97b3]" />
        ) : (
          <ChevronDown size={18} className="text-[#8a97b3]" />
        )}
      </button>

      {expanded && (
        <div className="px-6 pb-6 flex flex-col gap-1.5">
          {checking && (
            <p className="text-sm text-[#8a97b3] py-2 flex items-center gap-2">
              <RefreshCw size={13} className="animate-spin" /> 점검 중...
            </p>
          )}
          {rows?.map((row) => {
            const { Icon, cls } = LEVEL_STYLE[row.level];
            return (
              <div key={row.label} className="bg-white/70 rounded-2xl px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Icon size={16} className={`shrink-0 ${cls}`} />
                  <span className="text-sm font-bold text-[#3d3652]">{row.label}</span>
                </div>
                {row.hint && (
                  <p className="text-xs font-medium text-[#8a97b3] mt-1 ml-[26px]">{row.hint}</p>
                )}
              </div>
            );
          })}
          {rows && (
            <button
              onClick={() => setRows(null)}
              className="mt-2 w-full py-2.5 bg-white/80 hover:bg-white text-[#8b6de8] rounded-full font-bold text-sm shadow-sm transition active:scale-[0.98] flex items-center justify-center gap-1.5"
            >
              <RefreshCw size={13} />
              다시 점검
            </button>
          )}
        </div>
      )}
    </section>
  );
}
