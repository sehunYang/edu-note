/**
 * 웹 푸시 구독 헬퍼. 교사/학생 알림 카드가 공용으로 import한다(순수 함수, client
 * 컴포넌트에서 호출). 브라우저 API만 사용하며 절대 throw하지 않고 항상
 * PushSubscribeResult를 반환해 호출부가 UI로 안전하게 소화하도록 한다.
 */

export type PushSubscribeResult =
  | {
      ok: true;
      subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
    }
  | {
      ok: false;
      reason: "unsupported" | "permission-denied" | "no-vapid-key" | "subscribe-failed";
    };

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

/**
 * 이 브라우저(기기)의 현재 푸시 구독 endpoint. 구독은 기기별이므로 "구독됨" 판정은
 * 서버에 행이 있는지가 아니라 **이 기기**의 구독 존재 여부로 해야 한다(기기별 설정).
 * 미지원/미구독/실패 전부 null.
 */
export async function getLocalPushEndpoint(): Promise<string | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription?.endpoint ?? null;
  } catch {
    return null;
  }
}

export async function subscribeToPush(
  vapidPublicKey: string,
): Promise<PushSubscribeResult> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, reason: "unsupported" };
  }
  if (!vapidPublicKey) {
    return { ok: false, reason: "no-vapid-key" };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "permission-denied" };
  }

  const registration = await navigator.serviceWorker.ready;

  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    });
    const json = subscription.toJSON();
    return {
      ok: true,
      subscription: {
        endpoint: json.endpoint ?? "",
        keys: {
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
        },
      },
    };
  } catch {
    return { ok: false, reason: "subscribe-failed" };
  }
}
