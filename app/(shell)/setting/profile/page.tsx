import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { isStageUnlocked, isStageComplete, getTeacherSettings } from "@/lib/db/queries";
import { StageGate } from "../stage-gate";
import { LockedNotice } from "../locked-notice";
import { ProfileForm } from "./profile-form";
import { GoogleCalendarCard } from "./google-calendar-card";
import { InstallAppCard } from "./install-app-card";
import { NotifyCard } from "./notify-card";

export const metadata = { title: "교사 기본 설정" };

export const dynamic = "force-dynamic";

/** C2 교사 기본 설정 — 이름·학교명·담임여부·담임반 + NEIS/comcigan 학교 동시 해석. */
export default async function ProfileStagePage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  if (!(await isStageUnlocked(db, ownerId, "profile"))) return <LockedNotice />;
  const [completed, settings] = await Promise.all([
    isStageComplete(db, ownerId, "profile"),
    getTeacherSettings(db, ownerId),
  ]);

  return (
    <div>
      <h2 className="text-lg">2. 교사 기본 설정</h2>
      <ProfileForm initial={settings} />
      <GoogleCalendarCard />
      <InstallAppCard />
      <NotifyCard />
      <StageGate stage="profile" completed={completed} />
    </div>
  );
}
