import Link from "next/link";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";

// Placeholder until Phase 5 (Today tab).
export default async function TodayPage(): Promise<ReactNode> {
  const user = await requireUser();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Hello, {user.name}</h1>
      <p className="text-lg">Your bookings will appear here.</p>
      <p>
        <Link href="/app/settings" className="text-lg text-accent underline">
          Settings
        </Link>
      </p>
    </div>
  );
}
