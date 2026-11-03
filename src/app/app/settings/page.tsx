import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonSecondary } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { logoutAction } from "./actions";

export const metadata: Metadata = { title: "Settings" };

/** Small settings screen: deliberately the only place with "Log out". */
export default async function SettingsPage(): Promise<ReactNode> {
  const user = await requireUser();
  return (
    <div className="flex flex-col gap-6">
      <Link href="/app" className="text-lg font-semibold text-accent underline">
        ← Back
      </Link>
      <h1 className="text-3xl font-bold">Settings</h1>
      <p className="text-lg">
        Signed in as <strong>{user.name}</strong> ({user.email})
      </p>
      <Link href="/app/help" className={`${buttonSecondary} sm:w-full`}>
        How to install the app
      </Link>
      <form action={logoutAction}>
        <button type="submit" className={`${buttonSecondary} sm:w-full`}>
          Log out
        </button>
      </form>
    </div>
  );
}
