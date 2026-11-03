import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser, safeNextPath } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
  // The installed app may open here when she has to sign in again.
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "My bookings", statusBarStyle: "default" },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const { next } = await searchParams;
  const target = safeNextPath(typeof next === "string" ? next : undefined);
  if (await getCurrentUser()) redirect(target);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-3xl font-bold">Sign in</h1>
      <LoginForm next={target} />
    </main>
  );
}
