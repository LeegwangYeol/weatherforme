"use client";

import { useState, useEffect } from "react";
import { CloudRain, MapPin, BellRing, Settings } from "lucide-react";

export default function Home() {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          if (sub) setIsSubscribed(true);
        });
      });
    }
  }, []);

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const subscribeToPush = async () => {
    if (!location) {
      alert("먼저 위치 권한을 허용해주세요!");
      return;
    }

    setIsSubscribing(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey as string),
      });

      // 서버로 전송
      await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription, location }),
      });

      setIsSubscribed(true);
      alert("알림 설정이 완료되었습니다!");
    } catch (error) {
      console.error("Failed to subscribe:", error);
      alert("알림 설정에 실패했습니다.");
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
        
        // 서버에서 삭제
        await fetch("/api/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
      }
      
      setIsSubscribed(false);
      alert("알림이 해제되었습니다.");
    } catch (error) {
      console.error("Failed to unsubscribe:", error);
      alert("알림 해제에 실패했습니다.");
    } finally {
      setIsSubscribing(false);
    }
  };

  const requestLocation = () => {
    setIsLoading(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          setPermission("granted");
          setIsLoading(false);
        },
        (error) => {
          console.error(error);
          setPermission("denied");
          setIsLoading(false);
        }
      );
    } else {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex-1 bg-black text-white p-6 pb-20 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-[-10%] left-[-20%] w-[150%] h-[50%] bg-blue-900/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-20%] w-[100%] h-[50%] bg-purple-900/20 blur-[100px] rounded-full pointer-events-none" />

      <header className="flex justify-between items-center py-4 relative z-10">
        <h1 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
          WeatherForMe
        </h1>
        <button className="p-2 bg-white/5 rounded-full backdrop-blur-md border border-white/10 text-white/70 hover:text-white transition">
          <Settings size={20} />
        </button>
      </header>

      <div className="mt-8 relative z-10 flex flex-col gap-6">
        {/* Main Status Card */}
        <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 flex flex-col items-center justify-center min-h-[240px] shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
          <CloudRain size={64} className="text-blue-400 mb-4" strokeWidth={1.5} />
          <h2 className="text-3xl font-semibold mb-2">알림 대기중</h2>
          <p className="text-white/60 text-center max-w-[250px]">
            비가 올 것 같으면 1~2시간 전에 미리 알려드릴게요.
          </p>
        </section>

        {/* Location Setup */}
        <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/20 rounded-2xl">
              <MapPin className="text-blue-400" size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-lg">위치 정보</h3>
              <p className="text-sm text-white/60">
                {location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : "위치 정보를 설정해주세요"}
              </p>
            </div>
          </div>
          {!location && (
            <button 
              onClick={requestLocation}
              disabled={isLoading}
              className="mt-2 w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white rounded-2xl font-medium transition active:scale-[0.98]"
            >
              {isLoading ? "위치 찾는 중..." : "현재 위치 권한 허용하기"}
            </button>
          )}
        </section>

        {/* Notification Setup */}
        <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-500/20 rounded-2xl">
              <BellRing className="text-purple-400" size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-lg">푸시 알림</h3>
              <p className="text-sm text-white/60">
                앱이 꺼져있어도 알림을 받습니다.
              </p>
            </div>
          </div>
          {isSubscribed ? (
            <button 
              onClick={unsubscribeFromPush}
              disabled={isSubscribing}
              className="mt-2 w-full py-3.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/20 rounded-2xl font-medium transition active:scale-[0.98]"
            >
              {isSubscribing ? "해제 중..." : "알림 끄기"}
            </button>
          ) : (
            <button 
              onClick={subscribeToPush}
              disabled={isSubscribing || !location}
              className="mt-2 w-full py-3.5 bg-white/10 hover:bg-white/15 disabled:opacity-50 text-white border border-white/10 rounded-2xl font-medium transition active:scale-[0.98]"
            >
              {isSubscribing ? "설정 중..." : "알림 권한 허용하기"}
            </button>
          )}
        </section>
      </div>
    </main>
  );
}
