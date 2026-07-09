import webpush from "web-push";

// VAPID 설정을 요청 시점에 지연 초기화 — 키가 없을 때 모듈 로드 자체가 죽지 않도록
let configured = false;

export function getWebPush() {
  if (!configured) {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) {
      throw new Error(
        "VAPID 키가 설정되지 않았습니다. .env.local 의 NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY 를 확인하세요."
      );
    }
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:admin@example.com",
      publicKey,
      privateKey
    );
    configured = true;
  }
  return webpush;
}
