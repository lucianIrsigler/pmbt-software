"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { clearSessionCookie, getSessionToken } from "@/lib/auth";
import { deleteSession } from "@/lib/session";

export async function logoutAction(): Promise<void> {
  await deleteSession(getDb(), await getSessionToken());
  await clearSessionCookie();
  redirect("/login");
}
