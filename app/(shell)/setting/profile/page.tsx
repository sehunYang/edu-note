import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { isStageUnlocked, isStageComplete, getTeacherSettings } from "@/lib/db/queries";
import { StageGate } from "../stage-gate";
import { LockedNotice } from "../locked-notice";
import { ProfileForm } from "./profile-form";
import { GoogleCalendarCard } from "./google-calendar-card";
import { InstallAppCard } from "./install-app-card";
import { NotifyCard } from "./notify-card";
import { getVapidPublicKey } from "@/lib/config/secrets";
import { features } from "@/lib/config/features";
import { FeatureOff } from "@/app/ui/feature-off";

export const metadata = { title: "교사 기본 설정" };

export const dynamic = "force-dynamic";

/** C2 교사 기본 설정 — 이름·학교명·담임여부·담임반 + NEIS/comcigan 학교 동시 해석. */
export default async function ProfileStagePage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  if (!(await isStageUnlocked(db, ownerId, "profile"))) return <LockedNotice />;
  const [completed, settings, vapidKey] = await Promise.all([
    isStageComplete(db, ownerId, "profile"),
    getTeacherSettings(db, ownerId),
    getVapidPublicKey(db),
  ]);

  return (
    <div>
      <h2 className="text-lg">2. 교사 기본 설정</h2>
      <ProfileForm initial={settings} />
      {features.google ? (
        <GoogleCalendarCard />
      ) : (
        <FeatureOff
          title="구글 캘린더 연동"
          description="오늘의 학교 일정과 구글 캘린더를 양방향으로 맞출 수 있습니다."
          howTo="쓰려면 구글 클라우드에서 OAuth 클라이언트를 만들어 GOOGLE_CLIENT_ID·GOOGLE_CLIENT_SECRET 을 Vercel 환경변수에 등록하세요. 없어도 나머지 기능은 모두 정상 동작합니다."
          href="https://github.com/sehunYang/edu-note/blob/main/docs/GOOGLE_CALENDAR_SETUP_GUIDE.md"
          linkLabel="설정 가이드"
        />
      )}
      <InstallAppCard />
      <NotifyCard vapidKey={vapidKey} />
      <StageGate stage="profile" completed={completed} />
    </div>
  );
}
