import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/app/settings/actions";
import { ownerButton } from "@/components/owner/styles";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Not available", robots: { index: false } };

/** Where a signed-in login lands when its role may not open a page (e.g. the owner at /admin). */
export default async function NoAccessPage(): Promise<ReactNode> {
  const user = await requireUser();
  const hasApp = await can(user.role, "app");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-3xl font-bold">This area is for the administrator</h1>
      <p className="text-xl">
        You are signed in as {user.email}, which can&apos;t open this page. Nothing is wrong.
      </p>
      {hasApp ? (
        <Link href="/app" className={ownerButton.primary}>
          Go to my bookings
        </Link>
      ) : (
        <form action={logoutAction}>
          <button type="submit" className={ownerButton.secondary}>
            Log out
          </button>
        </form>
      )}
    </main>
  );
}
