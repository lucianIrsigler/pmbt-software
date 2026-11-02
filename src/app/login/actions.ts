"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { safeNextPath, setSessionCookie } from "@/lib/auth";
import { clientIp, ipKey } from "@/lib/client-ip";
import { getEnv } from "@/lib/env";
import { logError, logInfo } from "@/lib/log";
import { attemptLogin } from "@/lib/login";

export interface LoginState {
  email: string;
  message?: string;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = text(formData, "email");
  const next = safeNextPath(text(formData, "next"));

  let result;
  try {
    result = await attemptLogin(getDb(), {
      email,
      password: text(formData, "password"),
      ipKey: ipKey(clientIp(await headers()), getEnv().SESSION_SECRET),
    });
  } catch (error) {
    logError("auth.login", error);
    return { email, message: "Something went wrong. Please try again." };
  }

  if (!result.ok) {
    return {
      email,
      message:
        result.reason === "rate_limited"
          ? "Too many tries. Please wait 15 minutes and try again."
          : "That email or password isn't right. Please try again.",
    };
  }

  await setSessionCookie(result.token);
  logInfo("auth.login", { userId: result.userId });
  redirect(next);
}
