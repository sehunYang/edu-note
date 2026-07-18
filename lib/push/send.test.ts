import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 발송 유틸 단위테스트(US-2). web-push 는 네트워크 호출이라 전면 목업한다
 * (google-calendar.test.ts 와 동일 방침 — 실발송 없음). DB 도 select/delete/insert
 * 체이닝만 흉내내는 최소 목업. VAPID env 캐시(vapidReady 모듈전역) 때문에
 * 매 테스트 vi.resetModules() 로 모듈을 새로 임포트한다.
 */
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

interface StubRow {
  id: string;
  ownerId?: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  prefs: unknown;
}

function makeDb(selectRows: StubRow[]) {
  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values }));
  const deleteWhere = vi.fn().mockResolvedValue(undefined);
  const del = vi.fn(() => ({ where: deleteWhere }));
  const selectWhere = vi.fn().mockResolvedValue(selectRows);
  const from = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from }));
  return {
    db: { select, insert, delete: del } as unknown as never,
    select,
    insert,
    values,
    delete: del,
    deleteWhere,
    selectWhere,
  };
}

const PAYLOAD = { title: "제목", body: "본문", url: "/today" };

async function loadSend() {
  return import("./send");
}
async function loadWebpush() {
  return (await import("web-push")).default as unknown as {
    setVapidDetails: ReturnType<typeof vi.fn>;
    sendNotification: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env.VAPID_PUBLIC_KEY = "pub";
  process.env.VAPID_PRIVATE_KEY = "priv";
  process.env.VAPID_SUBJECT = "mailto:a@b.c";
});

describe("sendToTeacher", () => {
  it("VAPID 미설정이면 no-op — DB 조회조차 안 함", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    const { sendToTeacher } = await loadSend();
    const m = makeDb([]);
    await expect(
      sendToTeacher(m.db, "owner-1", "instant", PAYLOAD),
    ).resolves.toBeUndefined();
    expect(m.select).not.toHaveBeenCalled();
  });

  it("sendNotification 이 throw 해도 정상 resolve(무해성 보장)", async () => {
    const webpush = await loadWebpush();
    webpush.sendNotification.mockRejectedValue(new Error("boom"));
    const { sendToTeacher } = await loadSend();
    const m = makeDb([
      { id: "s1", endpoint: "e1", p256dh: "p", auth: "a", prefs: {} },
    ]);
    await expect(
      sendToTeacher(m.db, "owner-1", "instant", PAYLOAD),
    ).resolves.toBeUndefined();
  });

  it("statusCode 410 이면 구독 삭제 쿼리 호출", async () => {
    const webpush = await loadWebpush();
    webpush.sendNotification.mockRejectedValue(
      Object.assign(new Error("gone"), { statusCode: 410 }),
    );
    const { sendToTeacher } = await loadSend();
    const m = makeDb([
      { id: "s1", endpoint: "e1", p256dh: "p", auth: "a", prefs: {} },
    ]);
    await sendToTeacher(m.db, "owner-1", "instant", PAYLOAD);
    expect(m.delete).toHaveBeenCalledTimes(1);
  });

  it("statusCode 404 이면 구독 삭제 쿼리 호출", async () => {
    const webpush = await loadWebpush();
    webpush.sendNotification.mockRejectedValue(
      Object.assign(new Error("not found"), { statusCode: 404 }),
    );
    const { sendToTeacher } = await loadSend();
    const m = makeDb([
      { id: "s1", endpoint: "e1", p256dh: "p", auth: "a", prefs: {} },
    ]);
    await sendToTeacher(m.db, "owner-1", "instant", PAYLOAD);
    expect(m.delete).toHaveBeenCalledTimes(1);
  });

  it("기타 statusCode(500)면 삭제하지 않음", async () => {
    const webpush = await loadWebpush();
    webpush.sendNotification.mockRejectedValue(
      Object.assign(new Error("server"), { statusCode: 500 }),
    );
    const { sendToTeacher } = await loadSend();
    const m = makeDb([
      { id: "s1", endpoint: "e1", p256dh: "p", auth: "a", prefs: {} },
    ]);
    await sendToTeacher(m.db, "owner-1", "instant", PAYLOAD);
    expect(m.delete).not.toHaveBeenCalled();
  });

  it("prefs.instant === false 구독은 발송 스킵", async () => {
    const webpush = await loadWebpush();
    const { sendToTeacher } = await loadSend();
    const m = makeDb([
      { id: "s1", endpoint: "e1", p256dh: "p", auth: "a", prefs: { instant: false } },
    ]);
    await sendToTeacher(m.db, "owner-1", "instant", PAYLOAD);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it("kind='test' 는 prefs 무시하고 발송", async () => {
    const webpush = await loadWebpush();
    const { sendToTeacher } = await loadSend();
    const m = makeDb([
      { id: "s1", endpoint: "e1", p256dh: "p", auth: "a", prefs: { instant: false } },
    ]);
    await sendToTeacher(m.db, "owner-1", "test", PAYLOAD);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
  });

  it("성공 발송은 push_send 감사로그 기록", async () => {
    const webpush = await loadWebpush();
    webpush.sendNotification.mockResolvedValue(undefined);
    const { sendToTeacher } = await loadSend();
    const m = makeDb([
      { id: "s1", endpoint: "e1", p256dh: "p", auth: "a", prefs: {} },
    ]);
    await sendToTeacher(m.db, "owner-1", "instant", PAYLOAD);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    expect(m.insert).toHaveBeenCalledTimes(1);
    expect(m.values).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "push_send", ownerId: "owner-1" }),
    );
  });
});

describe("sendToStudents", () => {
  it("VAPID 미설정이면 no-op — DB 조회 안 함", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    const { sendToStudents } = await loadSend();
    const m = makeDb([]);
    await expect(
      sendToStudents(m.db, [{ publicPageId: "pp1" }], "s1", PAYLOAD),
    ).resolves.toBeUndefined();
    expect(m.select).not.toHaveBeenCalled();
  });

  it("targets 가 비면 no-op — DB 조회 안 함", async () => {
    const { sendToStudents } = await loadSend();
    const m = makeDb([]);
    await sendToStudents(m.db, [], "s1", PAYLOAD);
    expect(m.select).not.toHaveBeenCalled();
  });

  it("prefs[kind] === false 구독은 스킵", async () => {
    const webpush = await loadWebpush();
    const { sendToStudents } = await loadSend();
    const m = makeDb([
      { id: "s1", ownerId: "o1", endpoint: "e1", p256dh: "p", auth: "a", prefs: { s1: false } },
    ]);
    await sendToStudents(m.db, [{ publicPageId: "pp1" }], "s1", PAYLOAD);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it("각 구독 행의 ownerId 로 감사로그 기록", async () => {
    const webpush = await loadWebpush();
    webpush.sendNotification.mockResolvedValue(undefined);
    const { sendToStudents } = await loadSend();
    const m = makeDb([
      { id: "s1", ownerId: "owner-A", endpoint: "e1", p256dh: "p", auth: "a", prefs: {} },
    ]);
    await sendToStudents(m.db, [{ publicPageId: "pp1" }], "s1", PAYLOAD);
    expect(m.values).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "push_send", ownerId: "owner-A" }),
    );
  });

  it("throw 해도 정상 resolve(무해성)", async () => {
    const webpush = await loadWebpush();
    webpush.sendNotification.mockRejectedValue(new Error("boom"));
    const { sendToStudents } = await loadSend();
    const m = makeDb([
      { id: "s1", ownerId: "o1", endpoint: "e1", p256dh: "p", auth: "a", prefs: {} },
    ]);
    await expect(
      sendToStudents(m.db, [{ publicPageId: "pp1" }], "s2", PAYLOAD),
    ).resolves.toBeUndefined();
  });
});
