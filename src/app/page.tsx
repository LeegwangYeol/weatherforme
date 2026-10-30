"use client";

import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  useSyncExternalStore,
} from "react";
import {
  CloudRain,
  CloudDrizzle,
  CloudSnow,
  CloudHail,
  CloudSun,
  CloudLightning,
  Cloudy,
  Sun,
  Zap,
  MapPin,
  BellRing,
  BellOff,
  RefreshCw,
  Droplets,
  Wind,
  Umbrella,
  Share,
  PlusSquare,
  Download,
  TriangleAlert,
  X,
} from "lucide-react";
import WeatherBunny, { type BunnyKind } from "@/components/WeatherBunny";
import CloudMap from "@/components/CloudMap";
import RouteTimeline from "@/components/RouteTimeline";
import DiagnosticsCard from "@/components/DiagnosticsCard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// 타입 (API 응답과 동일한 형태)
// ---------------------------------------------------------------------------
interface HourlyForecast {
  date: string;
  time: string;
  pty: number;
  sky: number;
  temp: number | null;
  rn1: string;
  lgt: boolean;
}

interface WeatherData {
  grid: { nx: number; ny: number };
  place: string | null;
  current: {
    pty: number;
    temp: number | null;
    rn1: string;
    humidity: number | null;
    windSpeed: number | null;
  };
  hourly: HourlyForecast[];
  precip: { date: string; time: string; kind: "rain" | "sleet" | "snow"; pty: number } | null;
  updatedAt: number;
}

type Coords = { lat: number; lng: number };
type SavedLocation = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  grid?: { nx: number; ny: number };
  role?: "home" | "work";
};

// 출퇴근 브리핑 설정 (서버 CommuteConfig와 동일)
type CommuteConfig = {
  enabled: boolean;
  morning: [number, number];
  evening: [number, number];
  days: number[];
  briefingHour: number;
  briefingAlways: boolean;
};

const DEFAULT_COMMUTE: CommuteConfig = {
  enabled: false,
  morning: [7, 9],
  evening: [18, 20],
  days: [1, 2, 3, 4, 5],
  briefingHour: 7,
  briefingAlways: false,
};
type WeatherState =
  | { status: "idle" }
  | { status: "ready"; data: WeatherData }
  | { status: "error"; code: "KMA_KEY_MISSING" | "OUT_OF_COVERAGE" | "OTHER"; detail?: string };

const LOCATION_STORAGE_KEY = "wfm:location";

// 이 거리(m) 이상 이동해야 위치를 갱신 — 기상청 격자가 5km 단위라 2km면 충분
const MIN_MOVE_METERS = 2000;

function distanceMeters(a: Coords, b: Coords): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// ---------------------------------------------------------------------------
// 브라우저 환경 스냅샷 — SSR 하이드레이션 안전하게 클라이언트 값 읽기
// ---------------------------------------------------------------------------
const emptySubscribe = () => () => {};

function useClientValue<T>(getSnapshot: () => T, serverValue: T): T {
  return useSyncExternalStore(emptySubscribe, getSnapshot, () => serverValue);
}

// ---------------------------------------------------------------------------
// 날씨 상태 → 아이콘/라벨/토끼 매핑 (기상청 PTY/SKY 코드)
// ---------------------------------------------------------------------------
function conditionOf(pty: number, sky: number, lgt = false) {
  // 강수 + 낙뢰 = 뇌우, 강수 없는 낙뢰만 ⚡ 단독 표시
  if (lgt && pty > 0) {
    return {
      Icon: CloudLightning,
      label: "뇌우",
      cls: "text-[#e8a13c]",
      bunny: "thunder" as BunnyKind,
    };
  }
  switch (pty) {
    case 1:
      return { Icon: CloudRain, label: "비", cls: "text-[#5b8def]", bunny: "rain" as BunnyKind };
    case 4:
      return { Icon: CloudRain, label: "소나기", cls: "text-[#5b8def]", bunny: "rain" as BunnyKind };
    case 5:
      return { Icon: CloudDrizzle, label: "빗방울", cls: "text-[#6fa3e8]", bunny: "rain" as BunnyKind };
    case 2:
    case 6:
      return { Icon: CloudHail, label: "비/눈", cls: "text-[#7ba7d9]", bunny: "snow" as BunnyKind };
    case 3:
    case 7:
      return { Icon: CloudSnow, label: "눈", cls: "text-[#7ba0e8]", bunny: "snow" as BunnyKind };
  }
  if (lgt) return { Icon: Zap, label: "낙뢰", cls: "text-[#e8a13c]", bunny: "thunder" as BunnyKind };
  if (sky === 1) return { Icon: Sun, label: "맑음", cls: "text-[#f2a33c]", bunny: "sun" as BunnyKind };
  if (sky === 3)
    return { Icon: CloudSun, label: "구름많음", cls: "text-[#8a97b3]", bunny: "cloud" as BunnyKind };
  return { Icon: Cloudy, label: "흐림", cls: "text-[#7d8cab]", bunny: "cloud" as BunnyKind };
}

// 날씨(토끼 상태)별 하늘 배경 — Tailwind JIT를 위해 전체 리터럴 유지
const SKY_BG: Record<BunnyKind, string> = {
  sun: "from-[#8fd0ff] via-[#c4e6ff] to-[#fff3d6]",
  cloud: "from-[#a9bdd6] via-[#cfdcea] to-[#f0f4f8]",
  rain: "from-[#8aa3c4] via-[#b7c9de] to-[#dbe6f2]",
  snow: "from-[#b3c3e8] via-[#dbe4f8] to-[#f8faff]",
  thunder: "from-[#7d8cab] via-[#a9b6cf] to-[#d6deed]",
  idle: "from-[#9ecdf9] via-[#c9e4fd] to-[#eef7ff]",
};

// 토끼 말풍선 멘트
function speechOf(data: WeatherData): string {
  const nowKind =
    data.current.pty > 0 ? conditionOf(data.current.pty, 1).bunny : null;
  if (nowKind === "rain") return "지금 비가 오고 있어요! 우산 꼭 챙겨요 ☔";
  if (nowKind === "snow") return "지금 눈이 와요! 뽀드득 조심하세요 ❄️";
  if (nowKind === "thunder") return "지금 비가 와요! 천둥 조심 ⚡";

  if (data.precip) {
    const when = formatKoreanHour(data.precip.time);
    if (data.precip.kind === "snow") return `${when}부터 눈이 와요! 따뜻하게 입어요 ❄️`;
    if (data.precip.kind === "sleet") return `${when}부터 진눈깨비! 우산 챙겨요 🌨️`;
    return `${when}부터 비가 와요! 우산 꼭 챙겨요 ☔`;
  }
  return "앞으로 6시간은 비 소식 없어요~ 🌤️";
}

function formatKoreanHour(time: string): string {
  const h = Number(time.slice(0, 2));
  if (h === 0) return "자정";
  if (h === 12) return "낮 12시";
  return h < 12 ? `오전 ${h}시` : `오후 ${h - 12}시`;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ---------------------------------------------------------------------------
// 메인 페이지
// ---------------------------------------------------------------------------
export default function Home() {
  // --- 브라우저 환경 (하이드레이션 안전 스냅샷) ---
  const isIOS = useClientValue(
    () => /iPad|iPhone|iPod/.test(navigator.userAgent),
    false
  );
  const isStandalone = useClientValue(
    () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari 홈화면 실행 감지
      (navigator as unknown as { standalone?: boolean }).standalone === true,
    false
  );
  const pushEnv = useClientValue<"checking" | "ok" | "unsupported" | "dev">(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
    // next-pwa가 개발 모드에선 서비스워커를 생성하지 않음
    if (process.env.NODE_ENV !== "production") return "dev";
    return "ok";
  }, "checking");
  const permissionDenied = useClientValue(
    () => typeof Notification !== "undefined" && Notification.permission === "denied",
    false
  );
  const savedLocationJson = useClientValue(
    () => localStorage.getItem(LOCATION_STORAGE_KEY),
    null
  );
  // 카톡/인스타/페북/네이버 등 인앱 브라우저 — 설치·푸시 불가라 기본 브라우저로 유도
  const inAppBrowser = useClientValue(
    () =>
      /KAKAOTALK|Instagram|FBAN|FBAV|FB_IAB|NAVER\(inapp|DaumApps|\bLine\//i.test(
        navigator.userAgent
      ),
    false
  );
  // iOS 버전 (웹 푸시는 16.4+) — UA의 "OS 16_3" 패턴에서 추출
  const iosVersion = useClientValue(() => {
    const m = navigator.userAgent.match(/OS (\d+)[._](\d+)/);
    return m ? Number(m[1]) + Number(m[2]) / 10 : 0;
  }, 0);

  // --- 위치: 저장된 값 + 세션 내 갱신 ---
  const savedLocation = useMemo<Coords | null>(() => {
    if (!savedLocationJson) return null;
    try {
      const coords = JSON.parse(savedLocationJson);
      return Number.isFinite(coords?.lat) && Number.isFinite(coords?.lng) ? coords : null;
    } catch {
      return null;
    }
  }, [savedLocationJson]);
  // undefined = 아직 사용자 조작 없음 → 저장된 위치 사용
  const [locationOverride, setLocationOverride] = useState<Coords | null | undefined>(undefined);
  const location = locationOverride !== undefined ? locationOverride : savedLocation;
  const [locating, setLocating] = useState(false);

  // 위치 추적 콜백에서 최신 상태를 읽기 위한 ref
  const locationRef = useRef<Coords | null>(null);
  const isSubscribedRef = useRef(false);

  // --- 날씨 / 푸시 / 설치 상태 ---
  const [weather, setWeather] = useState<WeatherState>({ status: "idle" });
  const [refreshing, setRefreshing] = useState(false);
  const lastFetchedAtRef = useRef<number>(0);
  const lastFetchedCoordsRef = useRef<Coords | null>(null);
  const isFetchingRef = useRef<boolean>(false);
  const weatherRef = useRef<WeatherState>(weather);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef<number>(0);

  useEffect(() => {
    weatherRef.current = weather;
  }, [weather]);

  const [swFailed, setSwFailed] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [installEvent, setInstallEvent] = useState<{ prompt: () => Promise<unknown> } | null>(
    null
  );

  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);
  const [isSavingLoc, setIsSavingLoc] = useState(false);
  const [commute, setCommute] = useState<CommuteConfig | null>(null);

  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [showCloudMap, setShowCloudMap] = useState(false);
  const [showRouteTimeline, setShowRouteTimeline] = useState(false);

  const showBanner = useCallback((kind: "ok" | "err", text: string) => {
    setBanner({ kind, text });
  }, []);

  // 배너 자동 닫힘
  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), 5000);
    return () => clearTimeout(timer);
  }, [banner]);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  useEffect(() => {
    isSubscribedRef.current = isSubscribed;
  }, [isSubscribed]);

  // --- 서비스워커 등록 + 기존 구독 복원 ---
  useEffect(() => {
    if (pushEnv !== "ok") return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setIsSubscribed(Boolean(sub)))
      .catch(() => setSwFailed(true));
  }, [pushEnv]);

  // --- Android 설치 프롬프트 캡처 ---
  useEffect(() => {
    const onInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as unknown as { prompt: () => Promise<unknown> });
    };
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onInstallPrompt);
  }, []);

  // 날씨 데이터 비동기 조회 (캐시 우회, AbortController 및 경쟁 상태 방지)
  const fetchWeatherData = useCallback(
    async (coords: Coords | null, options?: { showLoading?: boolean; force?: boolean }) => {
      const loc = coords ?? locationRef.current;
      if (!loc) return;

      const now = Date.now();
      const sameCoords =
        lastFetchedCoordsRef.current !== null &&
        lastFetchedCoordsRef.current.lat === loc.lat &&
        lastFetchedCoordsRef.current.lng === loc.lng;

      // 1. 디바운스 / 스로틀링:
      // 강제 요청(force)이 아니고, 좌표가 같으며, 기존 데이터가 정상(ready)이고 15초 이내면 재호출 생략
      if (
        !options?.force &&
        sameCoords &&
        weatherRef.current.status === "ready" &&
        now - lastFetchedAtRef.current < 15000
      ) {
        return;
      }

      // 동일 좌표에 대해 비강제 백그라운드 호출이 이미 진행 중인 경우 중복 호출 방지
      if (isFetchingRef.current && sameCoords && !options?.force) {
        return;
      }

      // 기존 진행 중인 이전 요청이 있으면 중단(취소)하여 최신 요청 우선 처리
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const currentRequestId = ++requestIdRef.current;

      isFetchingRef.current = true;
      lastFetchedCoordsRef.current = loc;
      if (options?.showLoading) {
        setRefreshing(true);
      }

      try {
        const res = await fetch(`/api/weather?lat=${loc.lat}&lng=${loc.lng}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
          signal: abortController.signal,
        });

        if (requestIdRef.current !== currentRequestId) return;

        const json = await res.json();
        if (requestIdRef.current !== currentRequestId) return;

        if (!res.ok) {
          const code =
            json?.error === "KMA_KEY_MISSING" || json?.error === "OUT_OF_COVERAGE"
              ? json.error
              : "OTHER";
          // 기존에 이미 준비된 데이터가 있고 동일 위치면 화면을 깨지 않고 유지
          if (weatherRef.current.status !== "ready" || !sameCoords) {
            setWeather({ status: "error", code, detail: json?.detail });
          } else if (options?.showLoading) {
            showBanner("err", "날씨를 새로고침하지 못했어요.");
          }
        } else {
          setWeather({ status: "ready", data: json });
          lastFetchedAtRef.current = Date.now();
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        if (requestIdRef.current !== currentRequestId) return;
        if (weatherRef.current.status !== "ready" || !sameCoords) {
          setWeather({ status: "error", code: "OTHER" });
        } else if (options?.showLoading) {
          showBanner("err", "날씨를 새로고침하지 못했어요. 네트워크 연결을 확인해주세요.");
        }
      } finally {
        if (requestIdRef.current === currentRequestId) {
          isFetchingRef.current = false;
          setRefreshing(false);
          abortControllerRef.current = null;
        }
      }
    },
    [showBanner]
  );

  // 위치 변경 시 날씨 즉시 조회
  useEffect(() => {
    if (!location) return;
    void fetchWeatherData(location, {
      showLoading: weatherRef.current.status === "idle",
      force: true,
    });
  }, [location, fetchWeatherData]);

  // 컴포넌트 언마운트 시 진행 중인 네트워크 요청 정리
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const refreshWeather = () => {
    setRefreshing(true);
    void fetchWeatherData(locationRef.current, { showLoading: true, force: true });
  };

  // 구독 중이면 서버에 저장된 알림 위치를 조용히 갱신
  const syncLocationToServer = useCallback(async (coords: Coords) => {
    if (!isSubscribedRef.current) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return;
      await fetch("/api/subscribe", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint, location: coords }),
      });
    } catch {
      // 실패해도 다음 이동/복귀 때 다시 시도됨
    }
  }, []);

  const applyPosition = useCallback(
    (position: GeolocationPosition) => {
      const coords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      const prev = locationRef.current;
      if (prev && distanceMeters(prev, coords) < MIN_MOVE_METERS) return;
      localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(coords));
      setLocationOverride(coords);
      void syncLocationToServer(coords);
    },
    [syncLocationToServer]
  );

  // 위치 자동 추적 — 앱이 떠 있는 동안 이동(2km+) 감지
  const trackingEnabled = Boolean(location);
  useEffect(() => {
    if (!trackingEnabled || !("geolocation" in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(applyPosition, () => {}, {
      enableHighAccuracy: false,
      maximumAge: 5 * 60 * 1000,
      timeout: 30000,
    });

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [trackingEnabled, applyPosition]);

  // 화면 복귀 / 탭 포커스 / bfcache 복원 / 온라인 복귀 시 항상 최신 날씨로 즉시 갱신
  useEffect(() => {
    if (!location) return;

    const handleForeground = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      // 1. 앱 복귀 또는 화면 표시 시 최신 날씨 데이터 갱신
      void fetchWeatherData(locationRef.current, { force: false });

      // 2. 이동 여부 확인 (2km 이상 이동 시 위치 갱신)
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(applyPosition, () => {}, {
          enableHighAccuracy: false,
          maximumAge: 60 * 1000,
          timeout: 15000,
        });
      }
    };

    document.addEventListener("visibilitychange", handleForeground);
    window.addEventListener("focus", handleForeground);
    window.addEventListener("pageshow", handleForeground);
    window.addEventListener("online", handleForeground);

    // 앱 활성 상태일 때 5분 주기 자동 갱신
    const interval = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState !== "hidden") {
        void fetchWeatherData(locationRef.current, { force: false });
      }
    }, 5 * 60 * 1000);

    return () => {
      document.removeEventListener("visibilitychange", handleForeground);
      window.removeEventListener("focus", handleForeground);
      window.removeEventListener("pageshow", handleForeground);
      window.removeEventListener("online", handleForeground);
      clearInterval(interval);
    };
  }, [location, fetchWeatherData, applyPosition]);

  const requestLocation = () => {
    if (!("geolocation" in navigator)) {
      showBanner("err", "이 브라우저는 위치 기능을 지원하지 않아요.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(coords));
        setLocationOverride(coords);
        setLocating(false);
      },
      (error) => {
        setLocating(false);
        showBanner(
          "err",
          error.code === error.PERMISSION_DENIED
            ? "위치 권한이 거부됐어요. 브라우저 설정에서 허용해주세요."
            : "위치를 가져오지 못했어요. 잠시 후 다시 시도해주세요."
        );
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 }
    );
  };

  // --- 푸시 구독 / 해제 ---
  const subscribeToPush = async () => {
    if (!location) {
      showBanner("err", "먼저 위치를 설정해주세요!");
      return;
    }
    setIsSubscribing(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) throw new Error("VAPID key missing");

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription, location }),
      });
      if (!res.ok) throw new Error("subscribe API failed");

      setIsSubscribed(true);
      showBanner("ok", "알림 설정 완료! 확인 푸시를 보냈어요.");
    } catch (error) {
      logger.error("Client:Subscribe", "Failed to subscribe to push notifications", error);
      showBanner(
        "err",
        Notification.permission === "denied"
          ? "알림 권한이 차단돼 있어요. 브라우저/앱 설정에서 허용해주세요."
          : "알림 설정에 실패했어요. 다시 시도해주세요."
      );
    } finally {
      setIsSubscribing(false);
    }
  };

  // 수신 경로 즉석 점검 — 서버가 이 기기로 테스트 푸시를 쏨
  const sendTestPush = async () => {
    setIsSubscribing(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) throw new Error("no subscription");

      const res = await fetch("/api/test-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      if (res.ok) {
        showBanner("ok", "테스트 알림을 보냈어요! 2~3초 안에 떠야 정상이에요.");
      } else if (res.status === 404 || res.status === 410) {
        showBanner(
          "err",
          "서버에 이 기기 등록이 없어요. 알림을 껐다가 다시 켜주세요!"
        );
        setIsSubscribed(false);
        await subscription.unsubscribe().catch(() => {});
      } else {
        showBanner("err", "테스트 발송에 실패했어요. 잠시 후 다시 시도해주세요.");
      }
    } catch (error) {
      logger.error("Client:TestPush", "Test push delivery failed", error);
      showBanner("err", "테스트 발송에 실패했어요. 알림을 껐다 다시 켜보세요.");
    } finally {
      setIsSubscribing(false);
    }
  };

  const unsubscribeFromPush = async () => {
    setIsSubscribing(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        await fetch("/api/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
      }
      setIsSubscribed(false);
      showBanner("ok", "알림을 해제했어요.");
    } catch (error) {
      logger.error("Client:Unsubscribe", "Failed to unsubscribe from push notifications", error);
      showBanner("err", "알림 해제에 실패했어요.");
    } finally {
      setIsSubscribing(false);
    }
  };

  const loadSavedLocations = useCallback(async () => {
    if (!isSubscribedRef.current) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return;
      const res = await fetch(`/api/subscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.savedLocations) {
          setSavedLocations(data.savedLocations);
        }
        if (data.commute !== undefined) {
          setCommute(data.commute);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (isSubscribed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadSavedLocations();
    }
  }, [isSubscribed, loadSavedLocations]);

  const addSavedLocation = async () => {
    if (!location || !data?.place) return;
    setIsSavingLoc(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) throw new Error("no sub");
      
      const newLoc: SavedLocation = {
        id: crypto.randomUUID(),
        name: data.place,
        lat: location.lat,
        lng: location.lng
      };
      const newList = [...savedLocations, newLoc];
      
      const res = await fetch("/api/subscribe", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint, savedLocations: newList }),
      });
      if (!res.ok) throw new Error("save failed");
      
      setSavedLocations(newList);
      showBanner("ok", `${data.place} 지역을 추가했어요!`);
    } catch {
      showBanner("err", "관심 지역 저장에 실패했어요.");
    } finally {
      setIsSavingLoc(false);
    }
  };

  const removeSavedLocation = async (id: string) => {
    setIsSavingLoc(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) throw new Error("no sub");
      
      const newList = savedLocations.filter(loc => loc.id !== id);
      
      const res = await fetch("/api/subscribe", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint, savedLocations: newList }),
      });
      if (!res.ok) throw new Error("save failed");
      
      setSavedLocations(newList);
      showBanner("ok", `관심 지역을 삭제했어요.`);
    } catch {
      showBanner("err", "관심 지역 삭제에 실패했어요.");
    } finally {
      setIsSavingLoc(false);
    }
  };

  // 관심 지역에 집/직장 역할 지정 (역할당 1곳, 같은 걸 다시 누르면 해제)
  const setLocationRole = async (locId: string, role: "home" | "work") => {
    const prev = savedLocations;
    const newList = savedLocations.map((l) => {
      if (l.id === locId) return { ...l, role: l.role === role ? undefined : role };
      if (l.role === role) return { ...l, role: undefined };
      return l;
    });
    setSavedLocations(newList);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) throw new Error("no sub");
      const res = await fetch("/api/subscribe", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint, savedLocations: newList }),
      });
      if (!res.ok) throw new Error("save failed");
    } catch {
      setSavedLocations(prev);
      showBanner("err", "역할 저장에 실패했어요.");
    }
  };

  // 출퇴근 브리핑 설정 저장 (변경 즉시 서버 반영, 실패시 롤백)
  const updateCommute = async (patch: Partial<CommuteConfig>) => {
    const prev = commute;
    const next = { ...(commute ?? DEFAULT_COMMUTE), ...patch };
    setCommute(next);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) throw new Error("no sub");
      const res = await fetch("/api/subscribe", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint, commute: next }),
      });
      if (!res.ok) throw new Error("save failed");
      if (patch.enabled === true) {
        showBanner("ok", `출퇴근 브리핑 켜짐! 매일 아침 ${next.briefingHour}시에 알려드려요.`);
      }
    } catch {
      setCommute(prev);
      showBanner("err", "브리핑 설정 저장에 실패했어요.");
    }
  };

  const iosTooOld = isIOS && iosVersion > 0 && iosVersion < 16.4;
  const data = weather.status === "ready" ? weather.data : null;
  const condition = data ? conditionOf(data.current.pty, data.hourly[0]?.sky ?? 1) : null;
  const weatherLoading = Boolean(location) && weather.status === "idle";
  const bunnyKind: BunnyKind = condition?.bunny ?? "idle";
  const homeLoc = savedLocations.find((l) => l.role === "home");
  const workLoc = savedLocations.find((l) => l.role === "work");
  const commuteCfg = commute ?? DEFAULT_COMMUTE;
  // 경로 기능용 집 좌표 — 미지정시 현재 위치가 집 역할 (서버 브리핑 로직과 동일)
  const homeSpot =
    workLoc && (homeLoc || location)
      ? {
          name: homeLoc?.name ?? "현재 위치",
          lat: homeLoc?.lat ?? location!.lat,
          lng: homeLoc?.lng ?? location!.lng,
        }
      : null;

  return (
    <div className="min-h-dvh w-full flex justify-center bg-slate-900/5 md:bg-gradient-to-br md:from-[#a9c9eb] md:via-[#c9e4fd] md:to-[#dcebf9] transition-all">
      <main
        className={`w-full max-w-md min-h-dvh md:my-6 md:min-h-0 md:rounded-[40px] md:shadow-2xl md:border md:border-white/60 bg-gradient-to-b ${SKY_BG[bunnyKind]} text-[#3d3652] p-5 sm:p-6 relative overflow-x-hidden transition-colors duration-700 flex flex-col`}
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 1rem)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 3rem)",
        }}
      >
        {/* 배경 구름 장식 */}
        <div className="absolute top-[6%] left-[-12%] w-56 h-20 bg-white/50 blur-2xl rounded-full pointer-events-none" />
        <div className="absolute top-[16%] right-[-14%] w-64 h-24 bg-white/40 blur-2xl rounded-full pointer-events-none" />
        <div className="absolute bottom-[8%] left-[-10%] w-72 h-28 bg-white/30 blur-3xl rounded-full pointer-events-none" />

        <header className="flex justify-between items-center py-4 relative z-10">
          <h1 className="text-2xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-[#5b8def] to-[#f487a8]">
            WeatherForMe
          </h1>
          {location && (
            <button
              onClick={refreshWeather}
              aria-label="새로고침"
              className="p-2.5 bg-white/70 rounded-full shadow-sm border border-white/80 text-[#526585] hover:text-[#3d3652] transition focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none cursor-pointer"
            >
              <RefreshCw size={18} className={refreshing || weatherLoading ? "animate-spin" : ""} />
            </button>
          )}
        </header>

        {/* 상태 배너 */}
        {banner && (
          <div
            className={`relative z-20 mb-3 px-4 py-3 rounded-2xl text-sm font-semibold shadow-sm ${
              banner.kind === "ok"
                ? "bg-[#e8f8ef] text-[#2e9e63]"
                : "bg-[#ffe9ec] text-[#e2647c]"
            }`}
          >
            {banner.text}
          </div>
        )}

        <div className="mt-2 relative z-10 flex flex-col gap-5">
          {/* ------------------------------------------------ 날씨 카드 */}
          <section className="bg-white/70 backdrop-blur-xl border border-white/80 rounded-[32px] p-6 min-h-[260px] shadow-xl shadow-[#8aa3c4]/20 relative overflow-hidden">
            {!location && (
              <div className="flex flex-col items-center justify-center gap-3 py-2">
                <div className="relative bg-white/95 rounded-2xl px-4 py-3 shadow-md text-sm font-semibold text-[#3d3652]">
                  위치를 알려주면 내가 하늘을 지켜볼게요!
                  <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rotate-45" />
                </div>
                <WeatherBunny kind="idle" size={150} />
                <button
                  onClick={requestLocation}
                  disabled={locating}
                  className="w-full py-3.5 bg-[#5b8def] hover:bg-[#4a7de6] disabled:opacity-60 text-white rounded-full font-bold shadow-lg shadow-[#5b8def]/30 transition active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none cursor-pointer"
                >
                  {locating ? "위치 찾는 중..." : "현재 위치로 시작하기 📍"}
                </button>
              </div>
            )}

            {weatherLoading && (
              <div className="flex flex-col gap-4 animate-fade-in" role="status" aria-label="날씨 정보를 불러오는 중입니다">
                <div className="flex justify-between items-center">
                  <div className="h-4 w-28 rounded-full animate-shimmer" />
                  <div className="h-4 w-16 rounded-full animate-shimmer" />
                </div>
                <div className="h-10 w-48 rounded-2xl animate-shimmer mx-auto" />
                <div className="flex items-center justify-between mt-1">
                  <div className="flex flex-col gap-2">
                    <div className="h-16 w-28 rounded-2xl animate-shimmer" />
                    <div className="h-6 w-20 rounded-lg animate-shimmer" />
                  </div>
                  <div className="h-28 w-28 rounded-full animate-shimmer" />
                </div>
                <div className="flex gap-2">
                  <div className="h-7 w-20 rounded-full animate-shimmer" />
                  <div className="h-7 w-20 rounded-full animate-shimmer" />
                  <div className="h-7 w-20 rounded-full animate-shimmer" />
                </div>
                <div className="grid grid-cols-6 gap-1.5 mt-2">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-20 rounded-2xl animate-shimmer" />
                  ))}
                </div>
                <div className="h-11 w-full rounded-full animate-shimmer mt-2" />
              </div>
            )}

            {location && weather.status === "error" && (
              <div className="flex flex-col items-center justify-center gap-3 py-2 text-center">
                <div className="relative bg-white/95 rounded-2xl px-4 py-3 shadow-md text-sm font-semibold text-[#c98a3c]">
                  <TriangleAlert size={15} className="inline mr-1 -mt-0.5" />
                  {weather.code === "KMA_KEY_MISSING"
                    ? "기상청 API 키가 아직 없어요"
                    : weather.code === "OUT_OF_COVERAGE"
                      ? "여긴 한반도 밖이에요! 🇰🇷"
                      : "날씨를 불러오지 못했어요"}
                  <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rotate-45" />
                </div>
                <WeatherBunny kind="cloud" size={140} />
                {weather.code === "KMA_KEY_MISSING" ? (
                  <p className="text-sm text-[#526585] max-w-[280px]">
                    공공데이터포털 단기예보 키를
                    <code className="mx-1 px-1.5 py-0.5 bg-[#eef2f8] rounded text-xs">
                      KMA_SERVICE_KEY
                    </code>
                    에 설정해주세요.
                  </p>
                ) : weather.code === "OTHER" ? (
                  <button
                    onClick={refreshWeather}
                    className="px-6 py-2.5 bg-white rounded-full text-sm font-bold text-[#5b8def] shadow-md transition active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none cursor-pointer"
                  >
                    다시 시도
                  </button>
                ) : null}
              </div>
            )}

            {data && condition && (
              <div className="relative">
                <p className="text-xs text-[#526585] font-medium flex items-center gap-1">
                  <MapPin size={12} className="text-[#f487a8]" />
                  <span className="font-bold text-[#3d3652]">
                    {data.place ?? "현재 위치"}
                  </span>
                  · 기상청 실황
                </p>

                {/* 말풍선 */}
                <div className="relative mt-3 bg-white/95 rounded-2xl px-4 py-3 shadow-md text-sm font-bold w-fit max-w-full text-[#3d3652] border border-white/80">
                  {speechOf(data)}
                  <div className="absolute -bottom-1.5 left-8 sm:left-12 w-3 h-3 bg-white border-r border-b border-white/80 rotate-45" />
                </div>

                {/* 온도 + 토끼 */}
                <div className="flex items-center justify-between mt-1">
                  <div className="shrink-0">
                    <p className="text-[64px] leading-none font-extrabold mt-4 tracking-tighter">
                      {data.current.temp !== null ? `${Math.round(data.current.temp)}°` : "--°"}
                    </p>
                    <p className={`mt-2 text-lg font-bold ${condition.cls}`}>{condition.label}</p>
                  </div>
                  <WeatherBunny kind={bunnyKind} size={160} />
                </div>

                {/* 지표 칩 */}
                <div className="flex gap-2 mt-3 flex-wrap text-xs font-semibold text-[#526585]">
                  <span className="flex items-center gap-1.5 bg-white/80 rounded-full px-3 py-1.5 shadow-sm">
                    <Droplets size={13} className="text-[#5b8def] metric-bob" />
                    습도{" "}
                    <b className="metric-shimmer">
                      {data.current.humidity !== null ? `${data.current.humidity}%` : "--"}
                    </b>
                  </span>
                  <span className="flex items-center gap-1.5 bg-white/80 rounded-full px-3 py-1.5 shadow-sm">
                    <Wind size={13} className="text-[#5eb8b0] metric-sway" />
                    바람{" "}
                    <b className="metric-shimmer">
                      {data.current.windSpeed !== null ? `${data.current.windSpeed}m/s` : "--"}
                    </b>
                  </span>
                  {data.current.pty > 0 && (
                    <span className="flex items-center gap-1.5 bg-white/80 rounded-full px-3 py-1.5 shadow-sm">
                      <Umbrella size={13} className="text-[#5b8def] metric-wiggle" />
                      시간당{" "}
                      <b className="metric-shimmer">
                        {/* 실황 강수량은 숫자만 옴 → 단위 보정 */}
                        {/^[\d.]+$/.test(data.current.rn1)
                          ? `${data.current.rn1}mm`
                          : data.current.rn1}
                      </b>
                    </span>
                  )}
                </div>

                {/* 시간별 예보 */}
                <div className="grid grid-cols-6 gap-1.5 mt-4">
                  {data.hourly.slice(0, 6).map((h) => {
                    const c = conditionOf(h.pty, h.sky, h.lgt);
                    return (
                      <div
                        key={`${h.date}${h.time}`}
                        className="flex flex-col items-center gap-1.5 py-2.5 rounded-2xl bg-white/60 shadow-sm"
                      >
                        <span className="text-[11px] font-semibold text-[#526585]">
                          {Number(h.time.slice(0, 2))}시
                        </span>
                        <c.Icon size={18} className={c.cls} strokeWidth={2} />
                        <span className="text-xs font-bold text-[#3d3652]">
                          {h.temp !== null ? `${Math.round(h.temp)}°` : "--"}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* 비구름 지도 열기 */}
                <button
                  onClick={() => setShowCloudMap(true)}
                  className="w-full mt-4 py-3 bg-white/80 hover:bg-white text-[#5b8def] rounded-full font-bold text-sm shadow-sm transition active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none cursor-pointer"
                >
                  비구름 지도 보기 🌧️
                </button>

                {/* 관심 지역 추가 버튼 */}
                {isSubscribed && data.place && !savedLocations.some(l => l.name === data.place) && (
                  <button
                    onClick={addSavedLocation}
                    disabled={isSavingLoc}
                    className="w-full mt-2 py-3 bg-white/50 hover:bg-white text-[#526585] hover:text-[#5b8def] rounded-full font-bold text-sm transition active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none cursor-pointer"
                  >
                    {isSavingLoc ? "저장 중..." : "관심 지역으로 추가하기 ⭐"}
                  </button>
                )}

                <p className="text-[11px] text-[#526585] mt-3 text-right font-medium">
                  {new Date(data.updatedAt).toLocaleTimeString("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  업데이트 · 자료: 기상청
                </p>
              </div>
            )}
          </section>

          {/* ------------------------------------------------ 푸시 알림 카드 */}
          <section className="bg-white/70 backdrop-blur-xl border border-white/80 rounded-[32px] p-6 flex flex-col gap-4 shadow-xl shadow-[#8aa3c4]/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2.5 rounded-2xl ${
                    isSubscribed ? "bg-[#e8f8ef] text-[#2e9e63]" : "bg-[#f2f6fc] text-[#526585]"
                  }`}
                >
                  {isSubscribed ? <BellRing size={20} /> : <BellOff size={20} />}
                </div>
                <div>
                  <h3 className="font-extrabold text-base">비 오기 전 알림</h3>
                  <p className="text-xs text-[#526585]">
                    {isSubscribed ? "1~2시간 전에 알려드려요" : "비 소식을 미리 받아보세요"}
                  </p>
                </div>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold ${
                  isSubscribed ? "bg-[#2e9e63] text-white" : "bg-[#526585]/20 text-[#526585]"
                }`}
              >
                {isSubscribed ? "켜짐" : "꺼짐"}
              </span>
            </div>

            {/* 관심 지역 관리 (구독 중일 때만) */}
            {isSubscribed && (
              <div className="pt-2 border-t border-[#dfe8f2] flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#526585]">
                    함께 지켜보는 지역 ({savedLocations.length}/5)
                  </span>
                  <span className="text-[11px] text-[#526585]">
                    이곳들에 비가 와도 알려드려요
                  </span>
                </div>

                {savedLocations.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {savedLocations.map((loc) => {
                      const isHome = loc.role === "home";
                      const isWork = loc.role === "work";
                      return (
                        <div
                          key={loc.id}
                          className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs transition ${
                            isHome
                              ? "bg-[#eef5ff] border border-[#5b8def]/30"
                              : isWork
                                ? "bg-[#fcf3ea] border border-[#eab54a]/40"
                                : "bg-white/80"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <MapPin
                              size={12}
                              className={
                                isHome
                                  ? "text-[#5b8def] shrink-0"
                                  : isWork
                                    ? "text-[#eab54a] shrink-0"
                                    : "text-[#526585] shrink-0"
                              }
                            />
                            <span className="font-semibold truncate text-[#3d3652]">
                              {loc.name}
                            </span>
                            {loc.role && (
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                  isHome
                                    ? "bg-[#5b8def] text-white"
                                    : "bg-[#eab54a] text-white"
                                }`}
                              >
                                {isHome ? "🏠 집" : "🏢 직장"}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => setLocationRole(loc.id, "home")}
                              title="집으로 지정 (통근 브리핑 출발지)"
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition focus-visible:ring-1 focus-visible:ring-blue-400 cursor-pointer ${
                                isHome
                                  ? "bg-[#5b8def] text-white"
                                  : "bg-white/80 text-[#526585] hover:bg-white"
                              }`}
                            >
                              집
                            </button>
                            <button
                              type="button"
                              onClick={() => setLocationRole(loc.id, "work")}
                              title="직장으로 지정 (통근 브리핑 도착지)"
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition focus-visible:ring-1 focus-visible:ring-blue-400 cursor-pointer ${
                                isWork
                                  ? "bg-[#eab54a] text-white"
                                  : "bg-white/80 text-[#526585] hover:bg-white"
                              }`}
                            >
                              직장
                            </button>
                            <button
                              onClick={() => removeSavedLocation(loc.id)}
                              className="p-1 text-[#526585] hover:text-[#e2647c] transition ml-0.5 focus-visible:ring-1 focus-visible:ring-red-400 cursor-pointer"
                              title="삭제"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-[#526585] text-center py-2 bg-white/40 rounded-xl">
                    아직 추가된 지역이 없어요.
                    <br />
                    다른 곳에서 날씨를 조회한 뒤 &apos;관심 지역으로 추가&apos;를 눌러보세요!
                  </p>
                )}
              </div>
            )}

            {/* 출퇴근 브리핑 설정 (Phase 1) */}
            {isSubscribed && (
              <div className="pt-2 border-t border-[#dfe8f2] flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#526585]">
                    출퇴근 날씨 브리핑
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updateCommute({
                        enabled: !commuteCfg.enabled,
                      })
                    }
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold transition focus-visible:ring-2 focus-visible:ring-blue-400 cursor-pointer ${
                      commuteCfg.enabled
                        ? "bg-[#5b8def] text-white"
                        : "bg-[#526585]/20 text-[#526585]"
                    }`}
                  >
                    {commuteCfg.enabled ? "켜짐" : "꺼짐"}
                  </button>
                </div>

                {!workLoc && (
                  <p className="text-[11px] text-[#eab54a] bg-[#fdf8ee] p-2.5 rounded-xl">
                    💡 위 관심 지역에서 한 곳을 <b>&apos;직장&apos;</b>으로 지정해야 출퇴근
                    브리핑이 동작해요. (집 미지정시 현재 위치가 집이 돼요)
                  </p>
                )}

                {commuteCfg.enabled && (
                  <div className="flex flex-col gap-2 bg-white/50 p-3 rounded-2xl text-xs">
                    {/* 브리핑 발송 시각 */}
                    <div className="flex items-center justify-between">
                      <span className="text-[#526585] font-medium">아침 브리핑 시각</span>
                      <select
                        value={commuteCfg.briefingHour ?? 7}
                        onChange={(e) =>
                          updateCommute({
                            briefingHour: Number(e.target.value),
                          })
                        }
                        className="bg-white border border-[#dfe8f2] rounded-lg px-2 py-1 font-semibold text-[#3d3652] focus-visible:ring-2 focus-visible:ring-blue-400"
                      >
                        {[6, 7, 8, 9].map((h) => (
                          <option key={h} value={h}>
                            오전 {h}시
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 발송 요일 */}
                    <div className="flex items-center justify-between">
                      <span className="text-[#526585] font-medium">발송 요일</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            updateCommute({
                              days: [1, 2, 3, 4, 5],
                            })
                          }
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold transition focus-visible:ring-1 focus-visible:ring-blue-400 cursor-pointer ${
                            commuteCfg.days?.length === 5
                              ? "bg-[#5b8def] text-white"
                              : "bg-white text-[#526585]"
                          }`}
                        >
                          평일
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateCommute({
                              days: [0, 1, 2, 3, 4, 5, 6],
                            })
                          }
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold transition focus-visible:ring-1 focus-visible:ring-blue-400 cursor-pointer ${
                            commuteCfg.days?.length === 7
                              ? "bg-[#5b8def] text-white"
                              : "bg-white text-[#526585]"
                          }`}
                        >
                          매일
                        </button>
                      </div>
                    </div>

                    {/* 출근 / 퇴근 시간대 */}
                    <div className="flex items-center justify-between pt-1 border-t border-white/80">
                      <span className="text-[#526585] font-medium">출근 이동 시간</span>
                      <span className="font-semibold text-[#3d3652]">
                        {commuteCfg.morning?.[0] ?? 7}시 ~ {commuteCfg.morning?.[1] ?? 9}시
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#526585] font-medium">퇴근 이동 시간</span>
                      <span className="font-semibold text-[#3d3652]">
                        {commuteCfg.evening?.[0] ?? 18}시 ~ {commuteCfg.evening?.[1] ?? 20}시
                      </span>
                    </div>

                    {/* 맑은 날도 브리핑 여부 */}
                    <label className="flex items-center gap-2 pt-1 border-t border-white/80 text-[11px] text-[#526585] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(commuteCfg.briefingAlways)}
                        onChange={(e) =>
                          updateCommute({
                            briefingAlways: e.target.checked,
                          })
                        }
                        className="rounded accent-[#5b8def]"
                      />
                      비 소식이 없어도 &apos;비 안 와요&apos; 브리핑 받기
                    </label>

                    {/* 통근 경로 타임라인 모달 열기 */}
                    {homeSpot && workLoc && (
                      <button
                        type="button"
                        onClick={() => setShowRouteTimeline(true)}
                        className="w-full mt-1 py-2 bg-white/90 hover:bg-white text-[#5b8def] rounded-xl font-bold text-xs shadow-sm transition active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-blue-400 cursor-pointer"
                      >
                        통근 경로 날씨 보기 🛣️
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 수신 기기 상태 점검 & 테스트 (구독 중일 때만) */}
            {isSubscribed && (
              <div className="pt-2 border-t border-[#dfe8f2] flex flex-col gap-2 text-xs">
                <div className="flex items-center justify-between text-[#526585]">
                  <span>수신 기기 등록 상태</span>
                  <span className="font-semibold text-[#2e9e63] flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#2e9e63] inline-block" />
                    등록됨
                  </span>
                </div>
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={sendTestPush}
                    disabled={isSubscribing}
                    className="flex-1 py-2.5 bg-white/80 hover:bg-white text-[#5b8def] rounded-2xl font-bold shadow-sm transition active:scale-[0.98] disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-blue-400 cursor-pointer"
                  >
                    테스트 알림 받기 🔔
                  </button>
                  <button
                    onClick={unsubscribeFromPush}
                    disabled={isSubscribing}
                    className="px-4 py-2.5 bg-white/50 hover:bg-[#ffe9ec] text-[#526585] hover:text-[#e2647c] rounded-2xl font-semibold transition active:scale-[0.98] disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-red-400 cursor-pointer"
                  >
                    알림 해제
                  </button>
                </div>
              </div>
            )}

            {!isSubscribed &&
              (permissionDenied ? (
                <div className="p-4 bg-[#ffe9ec] rounded-2xl text-xs font-semibold text-[#e2647c] leading-relaxed">
                  브라우저의 알림 권한이 차단되어 있어요. 주소창 왼쪽 자물쇠/설정 아이콘에서 알림을
                  허용으로 바꾼 뒤 다시 시도해주세요.
                </div>
              ) : (
                <button
                  onClick={subscribeToPush}
                  disabled={isSubscribing || !location}
                  className="w-full py-3.5 bg-[#5b8def] hover:bg-[#4a7de6] disabled:opacity-40 text-white rounded-full font-bold shadow-lg shadow-[#5b8def]/30 transition active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-blue-400 cursor-pointer"
                >
                  {isSubscribing
                    ? "설정 중..."
                    : location
                      ? "비 알림 켜기 🔔"
                      : "먼저 위치를 설정해주세요"}
                </button>
              ))}
          </section>

          {/* ------------------------------------------------ 상태 점검 카드 */}
          <ErrorBoundary name="DiagnosticsCard">
            <DiagnosticsCard
              pushEnv={swFailed ? "unsupported" : pushEnv}
              inAppBrowser={inAppBrowser}
              isIOS={isIOS}
              iosTooOld={iosTooOld}
              isStandalone={isStandalone}
              hasLocation={Boolean(location)}
              weatherReady={weather.status === "ready"}
              isSubscribed={isSubscribed}
            />
          </ErrorBoundary>

          {/* ------------------------------------------------ 설치 안내 카드 */}
          {!isStandalone && (
            <section className="bg-white/70 backdrop-blur-xl border border-white/80 rounded-[32px] p-6 flex flex-col gap-4 shadow-xl shadow-[#8aa3c4]/20">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-[#e3edff] rounded-2xl">
                  <Download className="text-[#5b8def]" size={24} />
                </div>
                <div>
                  <h3 className="font-extrabold text-lg">홈 화면에 추가</h3>
                  <p className="text-sm text-[#526585]">진짜 앱처럼 아이콘으로 바로 열어요.</p>
                </div>
              </div>

              {inAppBrowser ? (
                <p className="text-sm font-medium text-[#3d3652] bg-[#f2f6fc] rounded-2xl p-4">
                  지금은 <b>인앱 브라우저</b>라 설치가 안 돼요. 오른쪽 위 메뉴(⋮ 또는 공유)에서{" "}
                  <b>&ldquo;Safari로 열기&rdquo;</b>(아이폰) /{" "}
                  <b>&ldquo;다른 브라우저로 열기&rdquo;</b>(안드로이드)를 누른 뒤 설치해주세요.
                </p>
              ) : isIOS ? (
                <ol className="text-sm font-medium text-[#3d3652] space-y-2 bg-[#f2f6fc] rounded-2xl p-4">
                  <li className="flex items-center gap-2">
                    <span className="text-[#526585]">1.</span> Safari 하단의{" "}
                    <Share size={15} className="inline text-[#5b8def]" /> <b>공유</b> 버튼 탭
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-[#526585]">2.</span>
                    <PlusSquare size={15} className="inline text-[#5b8def]" />
                    <b>홈 화면에 추가</b> 선택
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-[#526585]">3.</span> 홈 화면 아이콘으로 열고 알림 켜기 ✅
                  </li>
                </ol>
              ) : installEvent ? (
                <button
                  onClick={() => installEvent.prompt()}
                  className="w-full py-3.5 bg-[#5eb8b0] hover:bg-[#4daaa2] text-white rounded-full font-bold shadow-lg shadow-[#5eb8b0]/30 transition active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-teal-400 cursor-pointer"
                >
                  앱 설치하기 📲
                </button>
              ) : (
                <p className="text-sm font-medium text-[#3d3652] bg-[#f2f6fc] rounded-2xl p-4">
                  Chrome 메뉴(⋮)에서 <b>&ldquo;홈 화면에 추가&rdquo;</b> 또는{" "}
                  <b>&ldquo;앱 설치&rdquo;</b>를 선택하세요.
                </p>
              )}
            </section>
          )}

          <p className="text-center text-[11px] font-medium text-[#526585]">
            기상청 초단기예보 기반 · 앱 사용 중 이동하면 위치 자동 반영
            <br />
            위치 정보는 알림 용도로만 사용됩니다
          </p>
        </div>

        {/* 비구름 지도 모달 */}
        {showCloudMap && location && (
          <ErrorBoundary name="CloudMap">
            <CloudMap
              lat={location.lat}
              lng={location.lng}
              place={data?.place ?? null}
              precip={data?.precip ?? null}
              route={
                homeSpot && workLoc
                  ? {
                      home: { lat: homeSpot.lat, lng: homeSpot.lng },
                      work: { lat: workLoc.lat, lng: workLoc.lng },
                    }
                  : undefined
              }
              onClose={() => setShowCloudMap(false)}
            />
          </ErrorBoundary>
        )}

        {/* 통근 경로 타임라인 모달 */}
        {showRouteTimeline && homeSpot && workLoc && (
          <ErrorBoundary name="RouteTimeline">
            <RouteTimeline
              home={homeSpot}
              work={{ name: workLoc.name, lat: workLoc.lat, lng: workLoc.lng }}
              morning={commuteCfg.morning}
              evening={commuteCfg.evening}
              onClose={() => setShowRouteTimeline(false)}
            />
          </ErrorBoundary>
        )}
      </main>
    </div>
  );
}
