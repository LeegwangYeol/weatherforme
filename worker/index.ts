/// <reference lib="webworker" />
export {};
declare let self: ServiceWorkerGlobalScope;

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {
    title: "WeatherForMe",
    body: "비가 올 예정입니다!",
  };

  // vibrate는 표준 속성이지만 현재 TS lib 정의에 없어 타입만 확장
  const options: NotificationOptions & { vibrate?: number[] } = {
    body: data.body,
    icon: "/icon-192x192.png",
    badge: "/icon-192x192.png",
    vibrate: [200, 100, 200],
    tag: "weather-alert",
    data: { url: "/" },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // 이미 열린 창이 있으면 포커스, 없으면 새로 열기
        for (const client of clients) {
          if ("focus" in client) return client.focus();
        }
        return self.clients.openWindow(url);
      })
  );
});
