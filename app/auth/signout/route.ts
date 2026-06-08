import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** 로그아웃 (계획 §3.2). 세션 제거 후 /login 으로. */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
